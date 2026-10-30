/* Reintegração de posse: clientes que estão nessas fases e o que falta fazer em cada um. */
window.ReintegracaoPosseApp = {
  KEY: "crm_reintegracao_posse",
  DOC: "reintegracao_posse",
  busca: "",
  aberto: "",
  grupos: {},
  fichas: {},
  updatedAt: 0,
  lido: false,

  ETAPAS: [
    { id: "posse", nome: "Reintegração de posse", fazer: "Acompanhar a reintegração de posse deste cliente." },
    { id: "mandado", nome: "Aguardando expedição do mandado de reintegração", fazer: "Aguardar o juiz expedir o mandado de reintegração." },
    { id: "oficial", nome: "Aguardando cumprimento pelo Oficial de Justiça", fazer: "Aguardar o oficial de justiça entregar o mandado." },
    { id: "realizar", nome: "Realizar reintegração", fazer: "Organizar a retomada física do imóvel." },
    { id: "avaliacao", nome: "Avaliação prévia Engenharia", fazer: "Agendar a avaliação prévia da engenharia." },
    { id: "vistoria", nome: "Vistoria técnica externa", fazer: "Aguardar a vistoria externa e o projeto." },
    { id: "prefeitura", nome: "Aprovação projeto - Prefeitura", fazer: "Acompanhar a visita e a aprovação do projeto na prefeitura." }
  ],

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  },

  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_jur_geral_reintegracao_posse_editar") === true;
  },

  etapaDe(fase) {
    const bruto = typeof window.canonicalJudicialPhaseName === "function" ? window.canonicalJudicialPhaseName(fase) : fase;
    const nome = this.fold(bruto).replace(/^\d+(?:\.\d+)*\.?\s+/, "");
    return this.ETAPAS.find((e) => this.fold(e.nome) === nome) || null;
  },

  depoisDaAvaliacao(etapa) {
    return etapa && (etapa.id === "avaliacao" || etapa.id === "vistoria" || etapa.id === "prefeitura");
  },

  fichaDe(id) {
    return this.fichas[String(id)] || {};
  },

  pendencias(cliente) {
    const f = this.fichaDe(cliente.id);
    const itens = [cliente.etapa.fazer];
    const morador = f.temMorador;
    if (!morador) itens.push("Informar se a casa tem morador");
    else if (morador === "sim") {
      if (!f.caminhao) itens.push("Informar se precisa de caminhão");
      else if (f.caminhao === "sim") itens.push("Providenciar caminhão");
      if (!f.chaveiro) itens.push("Informar se precisa de chaveiro");
      else if (f.chaveiro === "sim") itens.push("Chamar o chaveiro");
      if (!String(f.deposito || "").trim()) itens.push("Definir o local para depositar os móveis do reintegrado");
    } else if (morador === "nao") {
      if (!f.chaveiro) itens.push("Informar se precisa de chaveiro");
      else if (f.chaveiro === "sim") itens.push("Chamar o chaveiro");
    }
    if (this.depoisDaAvaliacao(cliente.etapa)) {
      if (!f.valorComercial) itens.push("Após a avaliação interna, informar se possui valor comercial");
      if (!f.demolir) itens.push("Informar se precisa demolir e limpar o terreno");
      else if (f.demolir === "sim") itens.push("Demolir e limpar o terreno");
    }
    return itens;
  },

  contratoCancelado(sale) {
    if (!sale) return false;
    const st = this.fold(sale.status || sale.situation || "");
    if (st === "DISTRATADO" || st === "CANCELADO" || st === "3" || st === "CANCELED") return true;
    return sale.active === false && !sale.payOffDate && st !== "QUITADO" && st !== "4";
  },

  idsDoContrato(sale) {
    return [sale && sale.id, sale && sale.receivableBillId, sale && sale.salesContractId].map((v) => {
      return String(v || "").replace(/^B-/i, "").split("-")[0];
    }).filter(Boolean);
  },

  contratoDistratado(id, saleId) {
    const cid = String(id || "");
    const sid = String(saleId || "").replace(/^B-/i, "").split("-")[0];
    if (sid && typeof window.tituloMarcadoDistratado === "function" && window.tituloMarcadoDistratado({ customerId: cid, saleId: sid })) return true;
    const sales = ((window.AppState && AppState.sales) || []).filter((s) => String(s.customerId) === cid || String(s.queriedCustomerId) === cid);
    if (sid) {
      const alvo = sales.filter((s) => this.idsDoContrato(s).indexOf(sid) >= 0);
      if (alvo.length) return alvo.some((s) => this.contratoCancelado(s));
    } else if (sales.length && sales.every((s) => this.contratoCancelado(s))) {
      return true;
    }
    const fila = (window.rawClientList || []).filter((c) => String(c.customerId) === cid);
    if (sid) {
      const hit = fila.find((c) => String(c.saleId || "").replace(/^B-/i, "").split("-")[0] === sid);
      if (hit && hit.distratado) return true;
    } else if (fila.length && fila.every((c) => c.distratado)) {
      return true;
    }
    const bag = (window.subjudiceIntegraData && window.subjudiceIntegraData.clients) || {};
    const doCliente = Object.keys(bag).map((key) => {
      const rec = bag[key];
      if (!rec || rec.on === false) return null;
      const rc = String(rec.customerId || String(key).split("-")[0] || "");
      if (rc !== cid) return null;
      const rs = String(rec.saleId || String(key).split("-").slice(1).join("-")).replace(/^B-/i, "").split("-")[0];
      return { sid: rs, distratado: !!rec.distratado };
    }).filter(Boolean);
    if (!doCliente.length) return false;
    if (sid) return doCliente.some((rec) => rec.sid === sid && rec.distratado);
    return doCliente.every((rec) => rec.distratado);
  },

  universo() {
    const notas = (window.AppState && AppState.judNotes) || {};
    const lista = [];
    Object.keys(notas).forEach((id) => {
      const arr = Array.isArray(notas[id]) ? notas[id] : [];
      const validas = arr.filter((n) => n && n.type === "Judicial" && n.fase !== "Nota Interna" && n.status !== "Cancelada");
      if (!validas.length) return;
      validas.sort((a, b) => new Date(b.date) - new Date(a.date));
      const ultima = validas[0];
      const etapa = this.etapaDe(ultima.fase);
      const passou = !!etapa || validas.some((n) => this.etapaDe(n.fase));
      if (!passou) return;
      const saleId = ultima.saleId || ultima.contractId || "";
      const distratado = this.contratoDistratado(id, saleId);
      if (!etapa && !distratado) return;
      lista.push({
        id: String(id),
        nome: this.nomeCliente(id),
        doc: this.docCliente(id),
        saleId: saleId,
        etapa: etapa,
        desde: ultima.date || "",
        prazo: ultima.prazo || "",
        distratado: distratado
      });
    });
    lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
    return lista;
  },

  clientes() {
    const q = this.fold(this.busca);
    return this.universo().filter((c) => {
      if (!c.etapa) return false;
      if (!q) return true;
      return this.fold(c.nome + " " + c.doc + " " + c.id + " " + c.etapa.nome).indexOf(q) >= 0;
    });
  },

  nomeCliente(id) {
    const sid = String(id);
    const cache = (window.GlobalCustomerCache && GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === sid);
    if (hit && hit.name) return hit.name;
    const fila = (window.rawClientList || []).find((c) => String(c.customerId) === sid);
    if (fila) return fila.customerName || fila.name || ("Cliente " + sid);
    return "Cliente " + sid;
  },

  docCliente(id) {
    const sid = String(id);
    const cache = (window.GlobalCustomerCache && GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === sid);
    return (hit && (hit.cpfCnpj || hit.cpf || hit.cnpj)) || "";
  },

  dataBr(iso) {
    const s = String(iso || "").slice(0, 10);
    const p = s.split("-");
    if (p.length !== 3 || p[0].length !== 4) return "—";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  async abrir() {
    if (window.startCustomerBackgroundSync && (!window.GlobalCustomerCache || !GlobalCustomerCache.data || !GlobalCustomerCache.data.length)) {
      try { await window.startCustomerBackgroundSync(false, true); } catch (e) {}
    }
    await this.carregar();
    this.render();
  },

  async carregar() {
    if (this.lido) return;
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || "null");
      if (raw && raw.fichas) {
        this.fichas = raw.fichas;
        this.updatedAt = Number(raw.updatedAt) || 0;
      }
    } catch (e) {}
    try {
      const fc = window.firebaseCollections;
      if (window.firebaseDb && fc && fc.getDoc && fc.doc) {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", this.DOC));
        if (snap && typeof snap.exists === "function" && snap.exists()) {
          const data = snap.data() || {};
          const nuvem = data.fichas && typeof data.fichas === "object" ? data.fichas : null;
          if (nuvem && (Number(data.updatedAt) || 0) >= this.updatedAt) {
            this.fichas = nuvem;
            this.updatedAt = Number(data.updatedAt) || this.updatedAt;
          }
        }
      }
    } catch (e) {}
    this.lido = true;
  },

  async gravar() {
    this.updatedAt = Date.now();
    const payload = { fichas: this.fichas, updatedAt: this.updatedAt };
    try { localStorage.setItem(this.KEY, JSON.stringify(payload)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc || !fc.doc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", this.DOC), payload, { merge: true });
    } catch (e) {}
  },

  setBusca(v) {
    this.busca = v || "";
    const el = document.querySelector("#reintegracao-posse-root .reint-busca");
    const pos = el ? el.selectionStart : null;
    this.render();
    const novo = document.querySelector("#reintegracao-posse-root .reint-busca");
    if (novo) {
      novo.focus();
      if (pos != null) novo.setSelectionRange(pos, pos);
    }
  },

  grupoAberto(id, qtd) {
    if (Object.prototype.hasOwnProperty.call(this.grupos, id)) return this.grupos[id] === true;
    return qtd > 0;
  },

  aoGrupo(ev, id) {
    const el = ev && ev.target;
    if (!el || el.tagName !== "DETAILS") return;
    this.grupos[id] = !!el.open;
  },

  abrirCliente(id) {
    this.aberto = this.aberto === String(id) ? "" : String(id);
    this.render();
  },

  verFicha(id, saleId) {
    const sid = String(id || "");
    let titulo = saleId || "";
    if (!titulo) {
      const fila = (window.rawClientList || window.clientList || []).find((c) => String(c.customerId) === sid);
      if (fila && fila.saleId) titulo = fila.saleId;
    }
    if (typeof window.viewCustomerCard === "function") {
      window.viewCustomerCard(sid, titulo || null);
      return;
    }
    if (typeof window.openCustomerFromRelacionamento === "function") window.openCustomerFromRelacionamento(sid);
  },

  responder(id, campo, valor) {
    if (!this.podeEditar()) return;
    const key = String(id);
    const atual = Object.assign({}, this.fichas[key] || {});
    atual[campo] = valor;
    if (campo === "temMorador" && valor !== "sim") atual.deposito = "";
    this.fichas[key] = atual;
    this.gravar();
    this.render();
  },

  opcoes(atual) {
    return [
      ["", "A definir"],
      ["sim", "Sim"],
      ["nao", "Não"]
    ].map((p) => `<option value="${p[0]}"${atual === p[0] ? " selected" : ""}>${p[1]}</option>`).join("");
  },

  campo(id, nome, rotulo, valor, disabled) {
    return `<label class="reint-campo"><span>${this.esc(rotulo)}</span>
      <select class="form-control" ${disabled} onchange="ReintegracaoPosseApp.responder('${this.esc(id)}','${nome}', this.value)">${this.opcoes(valor || "")}</select>
    </label>`;
  },

  proximo(cliente) {
    const itens = this.pendencias(cliente);
    return itens.length > 1 ? itens[1] : (itens[0] || "");
  },

  painel(cliente) {
    if (this.aberto !== cliente.id) return "";
    const f = this.fichaDe(cliente.id);
    const disabled = this.podeEditar() ? "" : "disabled";
    const morador = f.temMorador || "";
    const extrasMorador = morador === "sim" ? `
      ${this.campo(cliente.id, "caminhao", "Precisa de caminhão?", f.caminhao, disabled)}
      ${this.campo(cliente.id, "chaveiro", "Precisa de chaveiro?", f.chaveiro, disabled)}
      <label class="reint-campo reint-campo-largo"><span>Local para depositar os móveis do reintegrado</span>
        <input class="form-control" ${disabled} value="${this.esc(f.deposito || "")}" placeholder="Onde os móveis ficam" onchange="ReintegracaoPosseApp.responder('${this.esc(cliente.id)}','deposito', this.value)">
      </label>` : (morador === "nao" ? this.campo(cliente.id, "chaveiro", "Precisa de chaveiro?", f.chaveiro, disabled) : "");
    const avaliacao = this.depoisDaAvaliacao(cliente.etapa) ? `
      <p class="reint-bloco">Depois da avaliação interna</p>
      ${this.campo(cliente.id, "valorComercial", "Possui valor comercial?", f.valorComercial, disabled)}
      ${this.campo(cliente.id, "demolir", "Precisa demolir e limpar o terreno?", f.demolir, disabled)}` : "";
    const falta = this.pendencias(cliente);
    return `<div class="reint-painel">
      <ul class="reint-fazer">${falta.map((t) => `<li>${this.esc(t)}</li>`).join("")}</ul>
      <div class="reint-perguntas">
        <p class="reint-bloco">A casa</p>
        ${this.campo(cliente.id, "temMorador", "Tem morador?", morador, disabled)}
        ${extrasMorador}
        ${avaliacao}
      </div>
    </div>`;
  },

  linhaHtml(c) {
    const aberto = this.aberto === c.id;
    const n = this.pendencias(c).length;
    const id = this.esc(c.id);
    const detalhe = aberto
      ? `<tr class="reint-detalhe"><td class="reint-detalhe-cell" colspan="5">${this.painel(c)}</td></tr>`
      : "";
    return `<tr class="reint-linha${aberto ? " is-open" : ""}" onclick="ReintegracaoPosseApp.abrirCliente('${id}')">
      <td class="cc-nome"><i data-lucide="chevron-right" class="reint-chev"></i><strong>${this.esc(c.nome)}</strong></td>
      <td>${this.esc(c.doc || c.id)}</td>
      <td>${this.dataBr(c.desde)}</td>
      <td>${this.esc(this.proximo(c))}${c.distratado ? `<span class="reint-feito">Distratado</span>` : ""}${n > 1 ? `<span class="reint-count" title="Pendências">${n}</span>` : ""}</td>
      <td class="is-center reint-acao" onclick="event.stopPropagation()">
        <button type="button" class="btn btn-primary btn-sm" title="Detalhes" onclick="ReintegracaoPosseApp.verFicha('${id}','${this.esc(c.saleId || "")}')" style="padding:2px 6px;font-size:0.7rem;line-height:1.2;">
          <i data-lucide="eye" style="width:14px;height:14px;margin-right:2px;vertical-align:middle;"></i> Detalhes
        </button>
      </td>
    </tr>${detalhe}`;
  },

  tabela(gente) {
    return `<div class="cc-scroll">
      <table class="cc-table reint-table">
        <colgroup>
          <col><col class="reint-c-doc"><col class="reint-c-desde"><col><col class="reint-c-acao">
        </colgroup>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>CPF/CNPJ</th>
            <th>Desde</th>
            <th>Próximo passo</th>
            <th class="is-center"></th>
          </tr>
        </thead>
        <tbody>${gente.map((c) => this.linhaHtml(c)).join("")}</tbody>
      </table>
    </div>`;
  },

  render() {
    const root = document.getElementById("reintegracao-posse-root");
    if (!root) return;
    const base = this.universo();
    const realizadas = base.filter((c) => c.distratado).length;
    const abertas = base.filter((c) => c.etapa && !c.distratado).length;
    const lista = this.clientes();
    const grupos = this.ETAPAS.map((etapa) => {
      const gente = lista.filter((c) => c.etapa.id === etapa.id);
      return { etapa: etapa, gente: gente };
    }).filter((g) => !this.fold(this.busca) || g.gente.length);
    const html = grupos.length ? grupos.map((g) => {
      const aberto = this.grupoAberto(g.etapa.id, g.gente.length);
      const corpo = g.gente.length
        ? this.tabela(g.gente)
        : `<p class="reint-vazio">Nenhum cliente nesta etapa.</p>`;
      return `<details class="reint-grupo"${aberto ? " open" : ""} ontoggle="ReintegracaoPosseApp.aoGrupo(event,'${g.etapa.id}')">
        <summary>
          <i data-lucide="chevron-down" class="reint-chev"></i>
          <span class="reint-grupo-nome">${this.esc(g.etapa.nome)}</span>
          <span class="reint-count">${g.gente.length}</span>
        </summary>
        <div class="reint-lista">${corpo}</div>
      </details>`;
    }).join("") : `<p class="reint-vazio">Nenhum cliente encontrado.</p>`;
    root.innerHTML = `
      <p class="reint-ajuda">Cada etapa abre e mostra quem está nela. Clique no cliente para ver o que falta: morador, caminhão, chaveiro, móveis e, depois da avaliação interna, valor comercial e demolição.</p>
      <div class="reint-kpis">
        <article class="reint-kpi">
          <span>Reintegrações realizadas</span>
          <strong>${realizadas}</strong>
          <small>Contrato já distratado</small>
        </article>
        <article class="reint-kpi is-aberta">
          <span>Ainda não efetivadas</span>
          <strong>${abertas}</strong>
          <small>Seguem na esteira</small>
        </article>
      </div>
      <input class="form-control reint-busca" placeholder="Buscar cliente" value="${this.esc(this.busca)}" oninput="ReintegracaoPosseApp.setBusca(this.value)">
      <div class="reint-grupos">${html}</div>`;
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }
};

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "reintegracao-posse" && window.ReintegracaoPosseApp) {
    ReintegracaoPosseApp.abrir();
  }
});
