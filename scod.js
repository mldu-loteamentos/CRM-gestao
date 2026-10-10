/**
 * Contas a Receber · Scod
 * Controle de IPTU pela API da SCOD: lista os imóveis com a situação e os débitos de IPTU,
 * abre as parcelas de cada imóvel e gera a CND. Cruza com os clientes do CRM pelo código
 * Sienge que vem no nome, ex.: "FULANO(3058)".
 */
const ScodApp = {
  BASE: "/api/scod-proxy/v3",
  PAGE_API: 500,
  PAGE_UI: 100,
  SITUACOES: {
    PARAMETRO_INVALIDO: { label: "Parâmetro inválido", cls: "erro" },
    DEBITO_ANO_CORRENTE: { label: "Débito no ano", cls: "debito" },
    DEBITO_ANOS_ANTERIORES: { label: "Débito anos anteriores", cls: "debito" },
    A_VENCER: { label: "A vencer", cls: "vencer" },
    QUITADOS: { label: "Quitado", cls: "ok" },
    EM_ANDAMENTO: { label: "Em andamento", cls: "andamento" }
  },
  state: {
    loading: false,
    status: "",
    error: "",
    consulted: false,
    view: "imoveis",
    imoveis: [],
    clientes: [],
    q: "",
    sit: "",
    emp: "",
    sort: { key: "total", dir: -1 },
    page: 0,
    open: {},
    dados: {},
    cnd: {}
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  digits(s) {
    return String(s || "").replace(/\D/g, "");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  dateBr(s) {
    const iso = String(s || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—";
  },

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  sitInfo(code) {
    const k = String(code || "").toUpperCase();
    return this.SITUACOES[k] || {
      label: k ? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, " ") : "—",
      cls: "andamento"
    };
  },

  // A SCOD devolve 429 (Too Many Attempts) quando recebe consultas demais por minuto.
  async getJson(path) {
    for (let tentativa = 1; ; tentativa++) {
      const res = await fetch(this.BASE + path, { headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (res.status === 429 && tentativa <= 6) {
        const ra = Number(res.headers.get("Retry-After"));
        const espera = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 10000 * tentativa;
        this.state.status = `A SCOD pediu uma pausa. Tentando de novo em ${Math.round(espera / 1000)}s…`;
        if (this.state.loading) this.render();
        await this.sleep(espera);
        continue;
      }
      throw new Error((data && (data.error || data.message)) || ("SCOD " + res.status));
    }
  },

  async fetchAll(path, listKey, totalPagesKeys, rotulo) {
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    const pageList = (data) => (Array.isArray(data[listKey]) ? data[listKey] : []);
    const load = (page) => this.getJson(`${path}${sep}pagina=${page}&qntporpagina=${this.PAGE_API}`);
    this.state.status = `Buscando ${rotulo} na SCOD…`;
    this.render();
    const first = await load(1);
    const all = pageList(first).slice();
    // A SCOD pode limitar o tamanho da página (proprietários vêm de 50 em 50); vale o total que ela devolve.
    const pages = totalPagesKeys.map((k) => Number(first[k])).find((n) => Number.isFinite(n) && n > 0) || 1;
    for (let p = 2; p <= pages; p++) {
      this.state.status = `Buscando ${rotulo} na SCOD (página ${p} de ${pages})…`;
      this.render();
      await this.sleep(400);
      all.push(...pageList(await load(p)));
    }
    return all;
  },

  splitNome(raw) {
    const s = String(raw || "").trim();
    if (!s || s === "-") return { nome: "", codigo: "" };
    const m = s.match(/^(.*?)\s*\((\d+)\)\s*$/);
    return m ? { nome: m[1].trim(), codigo: m[2] } : { nome: s, codigo: "" };
  },

  crmCustomer(codigo) {
    if (!codigo) return null;
    const store = (window.AppState && AppState.customers) || {};
    if (Array.isArray(store)) return store.find((c) => String(c && c.id) === String(codigo)) || null;
    return store[codigo] || store[Number(codigo)] || null;
  },

  crmStatus(codigo, documento) {
    const c = this.crmCustomer(codigo);
    if (!c) return { key: "nao", label: codigo ? "Não encontrado" : "Sem código Sienge" };
    const docCrm = this.digits(c.cpf || c.cnpj || c.cpfCnpj || c.document);
    if (docCrm && documento && docCrm !== this.digits(documento)) {
      return { key: "diverge", label: "Documento diverge", crmNome: c.name || "" };
    }
    return { key: "ok", label: "No CRM", crmNome: c.name || "" };
  },

  async consultar() {
    if (this.state.loading) return;
    Object.assign(this.state, { loading: true, error: "", status: "Conectando à SCOD…", open: {}, dados: {}, page: 0 });
    this.render();
    try {
      const donos = await this.fetchAll("/imovel/listar/proprietarios", "proprietarios", ["qtdTotalPaginas", "qnt_total_paginas"], "proprietários");
      const lista = await this.fetchAll("/imovel/listar/imoveis", "imoveis", ["qnt_total_paginas", "qtdTotalPaginas"], "imóveis");
      const docDono = new Map(donos.map((p) => [String(p.id), p.documento || ""]));
      this.state.imoveis = lista.map((im) => {
        const dono = this.splitNome(im.proprietario);
        const comp = this.splitNome(im.compromissario);
        const codigo = comp.codigo || dono.codigo;
        return {
          raw: im,
          id: im.id,
          emp: im.grupo || im.centro_de_custo || "",
          quadraLote: [im.quadra, im.lote].filter(Boolean).join(" / "),
          inscricao: im.inscricao || "",
          identificador: im.identificador || "",
          dono,
          comp,
          documento: docDono.get(String(im.id_proprietario)) || "",
          cidade: [im.cidade, im.estado].filter(Boolean).join("/"),
          sit: String(im.situacao || "").toUpperCase(),
          anoCorrente: Number(im.valor_atraso_ano_corrente) || 0,
          anosAnteriores: Number(im.valor_atraso_anos_anteriores) || 0,
          emDia: Number(im.valor_em_dia) || 0,
          total: Number(im.valor_total) || 0,
          venal: Number(im.valor_venal) || 0,
          atualizado: im.ultima_atualizacao || "",
          crm: this.crmStatus(codigo, comp.codigo ? "" : docDono.get(String(im.id_proprietario)))
        };
      });
      const byDono = new Map();
      this.state.imoveis.forEach((i) => {
        const k = String(i.raw.id_proprietario || "");
        if (!byDono.has(k)) byDono.set(k, []);
        byDono.get(k).push(i);
      });
      this.state.clientes = donos.map((p) => {
        const parts = this.splitNome(p.nome);
        const ims = byDono.get(String(p.id)) || [];
        return {
          id: p.id,
          nome: parts.nome,
          codigo: parts.codigo,
          documento: p.documento || "",
          imoveis: ims,
          grupos: [...new Set(ims.map((i) => i.emp).filter(Boolean))],
          debito: ims.reduce((s, i) => s + i.total, 0),
          crm: this.crmStatus(parts.codigo, p.documento)
        };
      }).sort((a, b) => b.debito - a.debito || this.fold(a.nome).localeCompare(this.fold(b.nome), "pt"));
      this.state.consulted = true;
    } catch (e) {
      console.error("[Scod]", e);
      this.state.error = "Não foi possível consultar a SCOD: " + (e.message || e);
    } finally {
      this.state.loading = false;
      this.state.status = "";
      this.render();
    }
  },

  baseImoveis() {
    const s = this.state;
    const q = this.fold(s.q).trim();
    const qd = this.digits(q);
    return s.imoveis.filter((i) => {
      if (s.emp && i.emp !== s.emp) return false;
      if (!q) return true;
      const blob = this.fold(`${i.emp} ${i.quadraLote} ${i.inscricao} ${i.identificador} ${i.dono.nome} ${i.dono.codigo} ${i.comp.nome} ${i.comp.codigo} ${i.cidade}`);
      if (blob.includes(q)) return true;
      return !!(qd && qd.length >= 4 && this.digits(i.documento).includes(qd));
    });
  },

  filteredImoveis() {
    const sit = this.state.sit;
    const rows = this.baseImoveis().filter((i) => !sit || i.sit === sit);
    const { key, dir } = this.state.sort;
    const val = (i) => {
      if (key === "dono") return this.fold(i.dono.nome);
      if (key === "comp") return this.fold(i.comp.nome);
      if (key === "emp") return this.fold(i.emp);
      if (key === "quadraLote") return this.fold(i.quadraLote);
      if (key === "sit") return this.sitInfo(i.sit).label;
      if (key === "atualizado") return i.atualizado;
      return i[key];
    };
    return rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt", { numeric: true }) * dir;
    });
  },

  filteredClientes() {
    const q = this.fold(this.state.q).trim();
    const qd = this.digits(q);
    const emp = this.state.emp;
    return this.state.clientes.filter((c) => {
      if (emp && !c.grupos.includes(emp)) return false;
      if (!q) return true;
      if (this.fold(c.nome).includes(q) || String(c.codigo).includes(q)) return true;
      return !!(qd && qd.length >= 4 && this.digits(c.documento).includes(qd));
    });
  },

  setView(v) {
    this.state.view = v;
    this.state.page = 0;
    this.render();
  },

  setQuery(v) {
    this.state.q = v;
    this.state.page = 0;
    this.renderBody();
  },

  setSit(v) {
    this.state.sit = v;
    this.state.page = 0;
    this.renderBody();
  },

  setEmp(v) {
    this.state.emp = v;
    this.state.page = 0;
    this.renderBody();
  },

  toggleSort(key) {
    const s = this.state.sort;
    if (s.key === key) s.dir = -s.dir;
    else Object.assign(s, { key, dir: ["dono", "comp", "emp", "quadraLote", "sit"].includes(key) ? 1 : -1 });
    this.renderBody();
  },

  setPage(p) {
    this.state.page = p;
    this.renderBody();
  },

  async toggleImovel(id) {
    this.state.open[id] = !this.state.open[id];
    this.renderBody();
    if (!this.state.open[id] || this.state.dados[id]) return;
    this.state.dados[id] = { loading: true };
    this.renderBody();
    try {
      const data = await this.getJson(`/imovel/iptu/dados/${id}`);
      this.state.dados[id] = { data };
    } catch (e) {
      this.state.dados[id] = { error: e.message || String(e) };
    }
    this.renderBody();
  },

  toggleDono(id) {
    const k = "d" + id;
    this.state.open[k] = !this.state.open[k];
    this.renderBody();
  },

  copiar(texto) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => alert("Linha digitável copiada.")).catch(() => {});
  },

  // A SCOD gera a certidão na hora (leva uns 20s) e devolve o PDF em base64.
  async baixarCnd(id, ident) {
    if (!id || this.state.cnd[id]) return;
    const win = window.open("", "_blank");
    if (win) win.document.write('<p style="font-family:sans-serif;padding:24px;">Gerando a CND na SCOD, aguarde…</p>');
    this.state.cnd[id] = true;
    this.renderBody();
    try {
      const data = await this.getJson(`/imovel/certidao/${id}`);
      const b64 = String((data && (data.documento_b64 || data.documento)) || (typeof data === "string" ? data : "")).replace(/^data:[^,]+,/, "");
      if (!b64 || (data && data.erro)) throw new Error((data && data.mensagem) || "a SCOD não devolveu a certidão deste imóvel");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `CND-${ident || id}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      console.error("[Scod] CND", e);
      if (win) win.close();
      alert("Não foi possível gerar a CND: " + (e.message || e));
    } finally {
      delete this.state.cnd[id];
      this.renderBody();
    }
  },

  exportExcel() {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel indisponível. Recarregue a página e tente de novo.");
      return;
    }
    const rows = this.filteredImoveis().map((i) => ({
      "Empreendimento": i.emp,
      "Quadra/Lote": i.quadraLote,
      "Inscrição": i.inscricao,
      "Identificador": i.identificador,
      "Proprietário": i.dono.nome,
      "Cód. Sienge proprietário": i.dono.codigo,
      "Compromissário": i.comp.nome,
      "Cód. Sienge compromissário": i.comp.codigo,
      "Cidade": i.cidade,
      "Situação": this.sitInfo(i.sit).label,
      "Atraso ano corrente": i.anoCorrente,
      "Atraso anos anteriores": i.anosAnteriores,
      "Em dia": i.emDia,
      "Total": i.total,
      "Valor venal": i.venal,
      "Atualizado em": this.dateBr(i.atualizado),
      "CRM": i.crm.label
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPTU SCOD");
    XLSX.writeFile(wb, `IPTU-SCOD-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  sitTag(code) {
    const s = this.sitInfo(code);
    return `<span class="scod-tag scod-sit-${s.cls}">${this.esc(s.label)}</span>`;
  },

  th(label, key, num) {
    return `<th class="${num ? "ccom-num" : ""}" onclick="ScodApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  pessoa(p) {
    if (!p.nome) return '<span class="scod-muted">—</span>';
    return `${this.esc(p.nome)}${p.codigo ? ` <span class="scod-muted">(${this.esc(p.codigo)})</span>` : ""}`;
  },

  debitosHtml(id) {
    const d = this.state.dados[id];
    if (!d || d.loading) return '<div class="scod-sub-empty">Buscando débitos na SCOD…</div>';
    if (d.error) return `<div class="scod-sub-empty" style="color:#b91c1c;">Não foi possível buscar os débitos: ${this.esc(d.error)}</div>`;
    const data = d.data || {};
    const deb = Array.isArray(data.debitos) ? data.debitos : [];
    const aviso = data.mensagem_erro
      ? `<div class="scod-alert">Retorno da prefeitura: ${this.esc(data.mensagem_erro)}</div>`
      : "";
    if (!deb.length) return aviso + '<div class="scod-sub-empty">Nenhum débito de IPTU retornado para este imóvel.</div>';
    const pago = (x) => /pago/i.test(String(x.parcela || ""));
    return aviso + `<table class="custom-table scod-sub"><thead><tr>
        <th>Ano</th><th>Parcela</th><th>Descrição</th><th>Vencimento</th>
        <th class="ccom-num">Valor inicial</th><th class="ccom-num">Acréscimos</th><th class="ccom-num">Descontos</th><th class="ccom-num">Valor final</th>
        <th>Boleto</th>
      </tr></thead><tbody>${deb.map((x) => `<tr${pago(x) ? ' class="scod-pago"' : ""}>
        <td>${this.esc(x.ano || "—")}</td>
        <td>${this.esc(x.parcela || "—")}</td>
        <td>${this.esc(x.descricao || "—")}</td>
        <td>${this.esc(this.dateBr(x.vencimento))}</td>
        <td class="ccom-num">${this.esc(this.money(x.valor_inicial))}</td>
        <td class="ccom-num">${this.esc(this.money(x.acrescimos))}</td>
        <td class="ccom-num">${this.esc(this.money(x.descontos))}</td>
        <td class="ccom-num"><strong>${this.esc(this.money(x.valor_final))}</strong></td>
        <td>${x.linha_digitavel
          ? `<button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();ScodApp.copiar('${this.esc(String(x.linha_digitavel).replace(/[^\d. ]/g, ""))}')"><i data-lucide="copy" style="width:12px;"></i> Linha digitável</button>`
          : (Number(x.possui_boleto) ? "Sim" : '<span class="scod-muted">—</span>')}</td>
      </tr>`).join("")}</tbody></table>`;
  },

  cndBtn(i) {
    if (this.state.cnd[i.id]) return '<span class="scod-muted">Gerando…</span>';
    const ident = this.esc(String(i.identificador || i.id).replace(/[^\w-]/g, ""));
    return `<button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();ScodApp.baixarCnd(${Number(i.id)}, '${ident}')"><i data-lucide="file-down" style="width:13px;"></i> CND</button>`;
  },

  pager(total, page, pages, rotulo) {
    if (pages <= 1) return "";
    return `<div class="scod-pager">
        <button type="button" class="btn btn-outline btn-sm" ${page === 0 ? "disabled" : ""} onclick="ScodApp.setPage(${page - 1})">Anterior</button>
        <span>Página ${page + 1} de ${pages} · ${total} ${rotulo}</span>
        <button type="button" class="btn btn-outline btn-sm" ${page >= pages - 1 ? "disabled" : ""} onclick="ScodApp.setPage(${page + 1})">Próxima</button>
      </div>`;
  },

  imoveisTable() {
    const rows = this.filteredImoveis();
    if (!rows.length) return '<div class="tvig-empty">Nenhum imóvel com esse filtro.</div>';
    const pages = Math.max(1, Math.ceil(rows.length / this.PAGE_UI));
    const page = Math.min(this.state.page, pages - 1);
    const slice = rows.slice(page * this.PAGE_UI, (page + 1) * this.PAGE_UI);
    return `<div class="crm-card ccom-card"><div class="crm-scroll-table ccom-table-wrap">
      <table class="custom-table ccom-table">
        <thead><tr>
          <th></th>${this.th("Empreendimento", "emp")}${this.th("Quadra/Lote", "quadraLote")}<th>Inscrição</th>
          ${this.th("Proprietário", "dono")}${this.th("Compromissário", "comp")}${this.th("Situação", "sit")}
          ${this.th("Ano corrente", "anoCorrente", true)}${this.th("Anos anteriores", "anosAnteriores", true)}${this.th("Em dia", "emDia", true)}${this.th("Total", "total", true)}
          ${this.th("Atualizado", "atualizado")}<th>CRM</th><th>CND</th>
        </tr></thead>
        <tbody>${slice.map((i) => {
          const open = !!this.state.open[i.id];
          return `<tr class="scod-row" onclick="ScodApp.toggleImovel(${Number(i.id)})">
            <td><i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></td>
            <td>${this.esc(i.emp || "—")}<div class="scod-muted">${this.esc(i.cidade)}</div></td>
            <td><strong>${this.esc(i.quadraLote || "—")}</strong></td>
            <td class="ccom-td-id">${this.esc(i.inscricao || "—")}</td>
            <td>${this.pessoa(i.dono)}</td>
            <td>${this.pessoa(i.comp)}</td>
            <td>${this.sitTag(i.sit)}</td>
            <td class="ccom-num${i.anoCorrente > 0 ? " scod-neg" : ""}">${this.esc(this.money(i.anoCorrente))}</td>
            <td class="ccom-num${i.anosAnteriores > 0 ? " scod-neg" : ""}">${this.esc(this.money(i.anosAnteriores))}</td>
            <td class="ccom-num">${this.esc(this.money(i.emDia))}</td>
            <td class="ccom-num"><strong>${this.esc(this.money(i.total))}</strong></td>
            <td>${this.esc(this.dateBr(i.atualizado))}</td>
            <td><span class="scod-tag scod-tag-${i.crm.key}">${this.esc(i.crm.label)}</span></td>
            <td>${this.cndBtn(i)}</td>
          </tr>${open ? `<tr class="scod-detail"><td></td><td colspan="13">${this.debitosHtml(i.id)}</td></tr>` : ""}`;
        }).join("")}</tbody>
      </table></div></div>
      ${this.pager(rows.length, page, pages, "imóvel(is)")}`;
  },

  clientesTable() {
    const rows = this.filteredClientes();
    if (!rows.length) return '<div class="tvig-empty">Nenhum proprietário com esse filtro.</div>';
    const pages = Math.max(1, Math.ceil(rows.length / this.PAGE_UI));
    const page = Math.min(this.state.page, pages - 1);
    const slice = rows.slice(page * this.PAGE_UI, (page + 1) * this.PAGE_UI);
    return `<div class="crm-card ccom-card"><div class="crm-scroll-table ccom-table-wrap">
      <table class="custom-table ccom-table">
        <thead><tr>
          <th></th><th>Proprietário</th><th>Cód. Sienge</th><th>Documento</th><th class="ccom-num">Imóveis</th>
          <th>Empreendimento</th><th class="ccom-num">Débito IPTU</th><th>CRM</th>
        </tr></thead>
        <tbody>${slice.map((c) => {
          const open = !!this.state.open["d" + c.id];
          return `<tr class="scod-row" onclick="ScodApp.toggleDono(${Number(c.id)})">
            <td><i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></td>
            <td><strong>${this.esc(c.nome)}</strong>${c.crm.crmNome && this.fold(c.crm.crmNome) !== this.fold(c.nome) ? `<div class="scod-muted">CRM: ${this.esc(c.crm.crmNome)}</div>` : ""}</td>
            <td class="ccom-td-id">${this.esc(c.codigo || "—")}</td>
            <td class="ccom-td-id">${this.esc(c.documento || "—")}</td>
            <td class="ccom-num">${c.imoveis.length}</td>
            <td>${this.esc(c.grupos.join(", ") || "—")}</td>
            <td class="ccom-num">${this.esc(this.money(c.debito))}</td>
            <td><span class="scod-tag scod-tag-${c.crm.key}">${this.esc(c.crm.label)}</span></td>
          </tr>${open ? `<tr class="scod-detail"><td></td><td colspan="7">${c.imoveis.length ? `<table class="custom-table scod-sub"><thead><tr>
              <th>Empreendimento</th><th>Quadra/Lote</th><th>Inscrição</th><th>Compromissário</th><th>Situação</th><th class="ccom-num">Total</th><th>CND</th>
            </tr></thead><tbody>${c.imoveis.map((i) => `<tr>
              <td>${this.esc(i.emp || "—")}</td><td>${this.esc(i.quadraLote || "—")}</td><td class="ccom-td-id">${this.esc(i.inscricao || "—")}</td>
              <td>${this.pessoa(i.comp)}</td><td>${this.sitTag(i.sit)}</td>
              <td class="ccom-num">${this.esc(this.money(i.total))}</td><td>${this.cndBtn(i)}</td>
            </tr>`).join("")}</tbody></table>` : '<div class="scod-sub-empty">Nenhum imóvel vinculado a este proprietário.</div>'}</td></tr>` : ""}`;
        }).join("")}</tbody>
      </table></div></div>
      ${this.pager(rows.length, page, pages, "proprietário(s)")}`;
  },

  kpisHtml() {
    const base = this.baseImoveis();
    const sum = (k) => base.reduce((t, i) => t + i[k], 0);
    const count = (k) => base.filter((i) => i.sit === k).length;
    return `<div class="ccom-kpis">
        <div class="ccom-kpi"><span>Imóveis</span><strong>${base.length}</strong></div>
        <div class="ccom-kpi"><span>Atraso no ano corrente</span><strong class="scod-neg">${this.esc(this.money(sum("anoCorrente")))}</strong></div>
        <div class="ccom-kpi"><span>Atraso de anos anteriores</span><strong class="scod-neg">${this.esc(this.money(sum("anosAnteriores")))}</strong></div>
        <div class="ccom-kpi"><span>Em dia (a vencer)</span><strong>${this.esc(this.money(sum("emDia")))}</strong></div>
        <div class="ccom-kpi"><span>Total IPTU</span><strong>${this.esc(this.money(sum("total")))}</strong></div>
        <div class="ccom-kpi"><span>Parâmetro inválido</span><strong>${count("PARAMETRO_INVALIDO")}</strong></div>
      </div>`;
  },

  chipsHtml() {
    const base = this.baseImoveis();
    const counts = {};
    base.forEach((i) => { counts[i.sit] = (counts[i.sit] || 0) + 1; });
    const codes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const chip = (code, label, n) => `<button type="button" class="scod-chip${this.state.sit === code ? " active" : ""}" onclick="ScodApp.setSit('${code}')">${this.esc(label)} <b>${n}</b></button>`;
    return `<div class="scod-chips">${chip("", "Todas", base.length)}${codes.map((c) => chip(c, this.sitInfo(c).label, counts[c])).join("")}</div>`;
  },

  renderBody() {
    const box = document.getElementById("scod-body");
    if (!box) return;
    const imv = this.state.view === "imoveis";
    box.innerHTML = `${this.kpisHtml()}
      ${imv ? this.chipsHtml() : ""}
      ${imv ? this.imoveisTable() : this.clientesTable()}`;
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("scod-root");
    if (!root) return;
    const s = this.state;
    const emps = [...new Set(s.imoveis.map((i) => i.emp).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
    const tab = (v, label) => `<button type="button" class="scod-view${s.view === v ? " active" : ""}" onclick="ScodApp.setView('${v}')">${label}</button>`;
    root.innerHTML = `
      <style>
        #scod-root .scod-row { cursor: pointer; }
        #scod-root .scod-row:hover td { background: #f1f5f9; }
        #scod-root .scod-detail > td { background: #f8fafc; padding: 8px 12px; }
        #scod-root .scod-sub { font-size: 0.78rem; background: #fff; }
        #scod-root .scod-sub tr.scod-pago td { color: #64748b; }
        #scod-root .scod-sub-empty { color: #64748b; font-size: 0.8rem; padding: 6px 0; }
        #scod-root .scod-alert { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 6px; padding: 6px 10px; font-size: 0.8rem; margin-bottom: 8px; }
        #scod-root .scod-muted { color: #64748b; font-size: 0.72rem; }
        #scod-root .scod-neg { color: #b91c1c; }
        #scod-root .scod-tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
        #scod-root .scod-tag-ok, #scod-root .scod-sit-ok { background: #dcfce7; color: #166534; }
        #scod-root .scod-tag-diverge { background: #ffedd5; color: #c2410c; }
        #scod-root .scod-tag-nao, #scod-root .scod-sit-debito { background: #fee2e2; color: #b91c1c; }
        #scod-root .scod-sit-erro { background: #fef3c7; color: #92400e; }
        #scod-root .scod-sit-vencer { background: #dbeafe; color: #1d4ed8; }
        #scod-root .scod-sit-andamento { background: #e2e8f0; color: #334155; }
        #scod-root .scod-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
        #scod-root .scod-chip { border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 999px; padding: 4px 12px; font-size: 0.78rem; cursor: pointer; }
        #scod-root .scod-chip.active { background: #105436; border-color: #105436; color: #fff; }
        #scod-root .scod-views { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        #scod-root .scod-view { border: 0; background: #fff; color: #334155; padding: 0 14px; height: 36px; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        #scod-root .scod-view.active { background: #105436; color: #fff; }
        #scod-root .scod-pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 10px; font-size: 0.82rem; color: #475569; }
        #scod-root .scod-search { height: 38px; min-width: 280px; flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; font-size: 0.88rem; }
        #scod-root .scod-emp { height: 38px; min-width: 220px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 0.85rem; background: #fff; }
      </style>
      <div class="ccom-page">
        <div class="search-filter-panel tvig-params ccom-params">
          <h3 class="tvig-section-title">Scod · Controle de IPTU</h3>
          <p class="rweb-note">Imóveis cadastrados na SCOD com a situação e os débitos de IPTU. Clique em um imóvel para ver as parcelas; o botão CND gera a certidão. O cruzamento com o CRM usa o código Sienge do compromissário (ou do proprietário, quando não houver compromissário).</p>
          <div class="ccom-filters" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <div class="scod-views">${tab("imoveis", "Imóveis")}${tab("proprietarios", "Proprietários")}</div>
            <select class="scod-emp" onchange="ScodApp.setEmp(this.value)" ${s.consulted ? "" : "disabled"}>
              <option value="">Todos os empreendimentos</option>
              ${emps.map((e) => `<option value="${this.esc(e)}"${s.emp === e ? " selected" : ""}>${this.esc(e)}</option>`).join("")}
            </select>
            <input type="search" class="scod-search" placeholder="Buscar empreendimento, quadra/lote, inscrição, proprietário, compromissário ou CPF/CNPJ" value="${this.esc(s.q)}" oninput="ScodApp.setQuery(this.value)" ${s.consulted ? "" : "disabled"}>
            <div class="tvig-filter-actions" style="display:flex;gap:8px;">
              <button type="button" class="btn btn-excel" onclick="ScodApp.exportExcel()" title="Exportar tabela atual para Excel" ${s.consulted ? "" : "disabled"}>
                <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
              </button>
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading ? "disabled" : ""} onclick="ScodApp.consultar()">
                <i data-lucide="refresh-cw" style="width:14px;"></i> ${s.loading ? "Consultando…" : (s.consulted ? "Atualizar" : "Consultar SCOD")}
              </button>
            </div>
          </div>
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">${this.esc(s.status || "Consultando a SCOD…")}</div>` : ""}
        ${!s.loading && !s.error && !s.consulted ? `<div class="tvig-empty">Clique em Consultar SCOD para trazer os imóveis e débitos de IPTU.</div>` : ""}
        ${!s.loading && s.consulted ? '<div id="scod-body"></div>' : ""}
      </div>`;
    if (!s.loading && s.consulted) this.renderBody();
    if (window.lucide) lucide.createIcons();
  },

  init() {
    if (!document.getElementById("scod-root")) return;
    this.render();
  }
};

window.ScodApp = ScodApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "scod") ScodApp.init();
});
