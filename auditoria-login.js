/**
 * Segurança · Auditoria do Login Sienge
 * Lê o relatório "Auditoria do Login" do Sienge (Excel), grava no Firebase e mostra quem segura
 * licença parado: sessão expirada = 10 minutos sem uso até o Sienge derrubar.
 */
const AuditoriaLoginApp = {
  COL_REL: "auditoria_login_relatorios",
  COL_PARTES: "auditoria_login_partes",
  TIMEOUT_MIN: 10,
  OCIOSO_NORMAL: 0.1,
  OCIOSO_ALTO: 0.2,
  ESCRITORIO: { ini: 8 * 60, fim: 18 * 60 },
  LINHAS_POR_PARTE: 2500,
  relatorios: [],
  linhas: [],
  carregado: false,
  carregando: false,
  enviando: "",
  erro: "",
  filtro: { de: "", ate: "", escritorio: true },
  sort: { campo: "ocioso", dir: -1 },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fb() {
    const db = window.firebaseDb;
    const f = window.firebaseCollections;
    return db && f && f.getDocs && f.collection ? { db, f } : null;
  },

  usuarioAtual() {
    const u = (window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser()) || (window.AppState && AppState.currentUser) || {};
    return { nome: u.name || u.displayName || u.email || "", email: String(u.email || "").toLowerCase() };
  },

  // Minutos "de parede" (sem fuso): o relatório já vem no horário local do Sienge.
  minDe(y, mo, d, h, mi) {
    return Date.UTC(y, mo - 1, d, h || 0, mi || 0) / 60000;
  },

  dataDoMin(m) {
    return new Date(m * 60000);
  },

  isoDoMin(m) {
    return this.dataDoMin(m).toISOString().slice(0, 16).replace("T", " ");
  },

  minDoIso(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? this.minDe(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
  },

  diaDoMin(m) {
    return this.isoDoMin(m).slice(0, 10);
  },

  fmtDataHora(m) {
    if (m == null) return "—";
    const s = this.isoDoMin(m);
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
  },

  fmtHora(m) {
    return m == null ? "—" : this.isoDoMin(m).slice(11, 16);
  },

  fmtDia(iso) {
    const s = String(iso || "");
    return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
  },

  fmtDuracao(min) {
    const t = Math.round(Math.max(0, min || 0));
    if (!t) return "0 min";
    const h = Math.floor(t / 60);
    const m = t % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  },

  /** Data/hora de uma célula do Excel: texto "01/09/2026 - 16:21", data do Excel ou número serial. */
  lerDataHora(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v)) {
      return this.minDe(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes() + (v.getSeconds() >= 30 ? 1 : 0));
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      return Math.round((v - 25569) * 1440);
    }
    const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]?\s*(\d{1,2}):(\d{2})/);
    return m ? this.minDe(+m[3], +m[2], +m[1], +m[4], +m[5]) : null;
  },

  lerDia(v) {
    const m = String(v || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  },

  /** Converte a planilha (linhas × colunas) nas tentativas de login, usuário por usuário. */
  lerPlanilha(matriz) {
    const ehIp = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) || (/^[0-9a-f:]+$/i.test(s) && (s.match(/:/g) || []).length >= 2);
    const texto = (v) => (v instanceof Date ? "" : String(v == null ? "" : v).replace(/\s+/g, " ").trim());
    let usuario = "";
    let periodoDe = "";
    let periodoAte = "";
    const linhas = [];
    matriz.forEach((row) => {
      const cel = (row || []).map(texto);
      const iUsu = cel.findIndex((c) => /^usu[aá]rio\s*:?/i.test(c));
      if (iUsu >= 0) {
        const junto = cel[iUsu].replace(/^usu[aá]rio\s*:?\s*/i, "");
        usuario = (junto || cel.slice(iUsu + 1).find((c) => c) || "").toUpperCase();
        return;
      }
      const iPer = cel.findIndex((c) => /^per[ií]odo/i.test(c));
      if (iPer >= 0) {
        const txt = cel.slice(iPer).join(" ");
        const datas = txt.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
        if (datas[0] && (!periodoDe || this.lerDia(datas[0]) < periodoDe)) periodoDe = this.lerDia(datas[0]);
        if (datas[1] && this.lerDia(datas[1]) > periodoAte) periodoAte = this.lerDia(datas[1]);
        return;
      }
      const iIp = cel.findIndex((c) => ehIp(c));
      if (iIp < 0) return;
      const iOk = cel.findIndex((c, i) => i > iIp && /^(sim|n[aã]o)\b/i.test(c));
      if (iOk < 0) return;
      const datas = [];
      for (let i = iOk + 1; i < row.length && datas.length < 2; i++) {
        const m = this.lerDataHora(row[i]);
        if (m != null) datas.push(m);
      }
      if (!datas.length) return;
      const okTxt = cel[iOk];
      const ok = /^sim/i.test(okTxt);
      const modo = cel.find((c, i) => i > iOk && /sess[aã]o|encerrad|expirad|derrubad|desconect/i.test(c)) || "";
      const doBloco = usuario || (cel.slice().reverse().find((c) => c && c !== modo && c !== okTxt && !/\d{2}\/\d{2}\/\d{4}/.test(c)) || "").toUpperCase();
      if (!doBloco) return;
      linhas.push({
        u: doBloco,
        ip: cel[iIp],
        ok,
        motivo: ok ? "" : okTxt.replace(/^n[aã]o\s*[-–]?\s*/i, ""),
        ent: datas[0],
        sai: ok && datas[1] != null ? datas[1] : null,
        modo
      });
    });
    if (linhas.length) {
      const dias = linhas.map((l) => this.diaDoMin(l.ent)).sort();
      periodoDe = periodoDe || dias[0];
      periodoAte = periodoAte || dias[dias.length - 1];
    }
    return { linhas, periodoDe, periodoAte };
  },

  compactar(l) {
    return [l.u, l.ip, l.ok ? 1 : 0, this.isoDoMin(l.ent), l.sai != null ? this.isoDoMin(l.sai) : "", l.modo, l.motivo];
  },

  expandir(a) {
    return { u: a[0], ip: a[1], ok: a[2] === 1, ent: this.minDoIso(a[3]), sai: a[4] ? this.minDoIso(a[4]) : null, modo: a[5] || "", motivo: a[6] || "" };
  },

  async carregar(forcar) {
    if (this.carregando || (this.carregado && !forcar)) return;
    const fb = this.fb();
    if (!fb) {
      this.erro = "Firebase indisponível. Atualize a página.";
      this.render();
      return;
    }
    this.carregando = true;
    this.render();
    try {
      const [rels, partes] = await Promise.all([
        fb.f.getDocs(fb.f.collection(fb.db, this.COL_REL)),
        fb.f.getDocs(fb.f.collection(fb.db, this.COL_PARTES))
      ]);
      const relatorios = [];
      rels.forEach((d) => relatorios.push(Object.assign({ id: d.id }, d.data())));
      const validos = new Set(relatorios.map((r) => r.id));
      const vistos = new Set();
      const linhas = [];
      const lista = [];
      partes.forEach((d) => lista.push(d.data()));
      lista.sort((a, b) => String(a.relatorioId).localeCompare(String(b.relatorioId)) || (a.n || 0) - (b.n || 0));
      lista.forEach((p) => {
        if (!validos.has(p.relatorioId)) return;
        let arr = [];
        try { arr = JSON.parse(p.linhas || "[]"); } catch (e) { arr = []; }
        arr.forEach((a) => {
          const chave = a.slice(0, 5).join("|");
          if (vistos.has(chave)) return;
          vistos.add(chave);
          const l = this.expandir(a);
          if (l.ent != null) linhas.push(l);
        });
      });
      this.relatorios = relatorios.sort((a, b) => String(b.periodoAte || "").localeCompare(String(a.periodoAte || "")));
      this.linhas = linhas;
      this.carregado = true;
      this.erro = "";
      if (!this.filtro.de && this.relatorios.length) {
        this.filtro.de = this.relatorios[0].periodoDe || "";
        this.filtro.ate = this.relatorios[0].periodoAte || "";
      }
    } catch (e) {
      console.warn("[auditoria-login] leitura:", e);
      this.erro = "Não foi possível ler os relatórios no Firebase.";
    }
    this.carregando = false;
    this.render();
  },

  escolherArquivo() {
    const inp = document.getElementById("alog-arquivo");
    if (inp) inp.click();
  },

  async enviar(file) {
    if (!file) return;
    const fb = this.fb();
    if (!fb) {
      this.erro = "Firebase indisponível. Atualize a página.";
      this.render();
      return;
    }
    this.enviando = "Lendo a planilha…";
    this.erro = "";
    this.render();
    try {
      if (typeof XLSX === "undefined") throw new Error("Biblioteca do Excel indisponível. Atualize a página.");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const lido = this.lerPlanilha(matriz);
      if (!lido.linhas.length) throw new Error("Não encontrei acessos nesta planilha. Use o relatório \"Auditoria do Login\" do Sienge.");
      const mesmo = this.relatorios.find((r) => r.periodoDe === lido.periodoDe && r.periodoAte === lido.periodoAte);
      if (mesmo) {
        const msg = `Já existe um relatório de ${this.fmtDia(lido.periodoDe)} a ${this.fmtDia(lido.periodoAte)} (${mesmo.arquivo || "sem nome"}). Substituir pelo novo?`;
        const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
        if (!ok) {
          this.enviando = "";
          this.render();
          return;
        }
        this.enviando = "Removendo o relatório anterior…";
        this.render();
        await this.apagarNoFirebase(mesmo.id);
      }
      this.enviando = "Salvando no Firebase…";
      this.render();
      const id = "rel_" + Date.now();
      const quem = this.usuarioAtual();
      const comp = lido.linhas.map((l) => this.compactar(l));
      const partes = [];
      for (let i = 0; i < comp.length; i += this.LINHAS_POR_PARTE) partes.push(comp.slice(i, i + this.LINHAS_POR_PARTE));
      for (let n = 0; n < partes.length; n++) {
        await fb.f.setDoc(fb.f.doc(fb.db, this.COL_PARTES, `${id}_p${n}`), { relatorioId: id, n, linhas: JSON.stringify(partes[n]) });
      }
      await fb.f.setDoc(fb.f.doc(fb.db, this.COL_REL, id), {
        arquivo: file.name,
        periodoDe: lido.periodoDe,
        periodoAte: lido.periodoAte,
        total: comp.length,
        usuarios: new Set(lido.linhas.map((l) => l.u)).size,
        bloqueios: lido.linhas.filter((l) => !l.ok && /licen/i.test(l.motivo)).length,
        partes: partes.length,
        enviadoPor: quem.nome,
        enviadoPorEmail: quem.email,
        enviadoEm: new Date().toISOString()
      });
      this.filtro.de = lido.periodoDe;
      this.filtro.ate = lido.periodoAte;
      this.enviando = "";
      if (typeof window.showToast === "function") window.showToast(`Relatório salvo: ${comp.length} acessos de ${this.fmtDia(lido.periodoDe)} a ${this.fmtDia(lido.periodoAte)}.`, "success");
      await this.carregar(true);
    } catch (e) {
      console.warn("[auditoria-login] envio:", e);
      this.enviando = "";
      this.erro = e && e.message ? e.message : "Não foi possível salvar o relatório.";
      this.render();
    }
  },

  async apagarNoFirebase(id) {
    const fb = this.fb();
    const partes = await fb.f.getDocs(fb.f.query(fb.f.collection(fb.db, this.COL_PARTES), fb.f.where("relatorioId", "==", id)));
    const dels = [];
    partes.forEach((d) => dels.push(fb.f.deleteDoc(fb.f.doc(fb.db, this.COL_PARTES, d.id))));
    await Promise.all(dels);
    await fb.f.deleteDoc(fb.f.doc(fb.db, this.COL_REL, id));
  },

  async excluir(id) {
    const r = this.relatorios.find((x) => x.id === id);
    if (!r) return;
    const msg = `Excluir o relatório de ${this.fmtDia(r.periodoDe)} a ${this.fmtDia(r.periodoAte)} (${r.arquivo || "sem nome"})?`;
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    try {
      await this.apagarNoFirebase(id);
      await this.carregar(true);
    } catch (e) {
      console.warn("[auditoria-login] exclusão:", e);
      this.erro = "Não foi possível excluir o relatório.";
      this.render();
    }
  },

  setFiltro(campo, valor) {
    this.filtro[campo] = valor;
    this.render();
  },

  ordenar(campo) {
    this.sort = this.sort.campo === campo ? { campo, dir: -this.sort.dir } : { campo, dir: campo === "u" ? 1 : -1 };
    this.render();
  },

  /** Minutos de [a, b] dentro do expediente (seg–sex, 8h–18h). */
  noEscritorio(a, b) {
    if (b <= a) return 0;
    let total = 0;
    for (let dia = Math.floor(a / 1440); dia <= Math.floor(b / 1440) && total < 1e7; dia++) {
      const sem = this.dataDoMin(dia * 1440).getUTCDay();
      if (sem === 0 || sem === 6) continue;
      const ini = dia * 1440 + this.ESCRITORIO.ini;
      const fim = dia * 1440 + this.ESCRITORIO.fim;
      total += Math.max(0, Math.min(b, fim) - Math.max(a, ini));
    }
    return total;
  },

  emExpediente(m) {
    return this.noEscritorio(m, m + 1) > 0;
  },

  analisar() {
    const f = this.filtro;
    const noPeriodo = (m) => {
      const d = this.diaDoMin(m);
      return (!f.de || d >= f.de) && (!f.ate || d <= f.ate);
    };
    const dur = (a, b) => (f.escritorio ? this.noEscritorio(a, b) : Math.max(0, b - a));
    const T = this.TIMEOUT_MIN;
    const sessoes = this.linhas.filter((l) => l.ok && l.sai != null && l.sai >= l.ent);
    const expiradas = sessoes.filter((s) => /expir/i.test(s.modo));
    const bloqueios = this.linhas
      .filter((l) => !l.ok && /licen/i.test(l.motivo) && noPeriodo(l.ent) && (!f.escritorio || this.emExpediente(l.ent)))
      .sort((a, b) => b.ent - a.ent);
    const outrasFalhas = this.linhas.filter((l) => !l.ok && !/licen/i.test(l.motivo) && noPeriodo(l.ent)).length;
    const por = new Map();
    const de = (u) => {
      if (!por.has(u)) por.set(u, { u, sessoes: 0, logado: 0, expiradas: 0, ocioso: 0, saiu: 0, barrado: 0, causados: 0, vitimas: new Set(), presente: 0 });
      return por.get(u);
    };
    sessoes.filter((s) => noPeriodo(s.ent)).forEach((s) => {
      const tempo = dur(s.ent, s.sai);
      if (f.escritorio && !tempo) return;
      const p = de(s.u);
      p.sessoes += 1;
      p.logado += tempo;
      if (/expir/i.test(s.modo)) {
        p.expiradas += 1;
        p.ocioso += dur(s.sai - T, s.sai);
      } else if (/usu[aá]rio/i.test(s.modo)) p.saiu += 1;
    });
    let evitaveis = 0;
    let picoLicencas = 0;
    const porHora = {};
    const detalhe = bloqueios.map((b) => {
      de(b.u).barrado += 1;
      const logados = new Set();
      const ociosos = new Map();
      sessoes.forEach((s) => {
        if (s.u === b.u || s.ent > b.ent || s.sai < b.ent) return;
        logados.add(s.u);
        if (/expir/i.test(s.modo) && s.sai - T <= b.ent) ociosos.set(s.u, s.sai);
      });
      picoLicencas = Math.max(picoLicencas, logados.size);
      if (ociosos.size) evitaveis += 1;
      ociosos.forEach((_, u) => {
        const p = de(u);
        p.causados += 1;
        p.vitimas.add(b.u);
      });
      logados.forEach((u) => { de(u).presente += 1; });
      const h = this.fmtHora(b.ent).slice(0, 2);
      porHora[h] = (porHora[h] || 0) + 1;
      return { b, logados: logados.size, ociosos: [...ociosos.entries()].sort((x, y) => x[1] - y[1]) };
    });
    const usuarios = [...por.values()].map((p) => Object.assign(p, {
      vitimasN: p.vitimas.size,
      pctOcioso: p.logado ? Math.min(1, p.ocioso / p.logado) : 0
    }));
    const { campo, dir } = this.sort;
    usuarios.sort((a, b) => {
      const va = a[campo];
      const vb = b[campo];
      const c = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : (va || 0) - (vb || 0);
      return c * dir || b.ocioso - a.ocioso || b.causados - a.causados || a.u.localeCompare(b.u);
    });
    return {
      usuarios,
      detalhe,
      porHora,
      bloqueios: bloqueios.length,
      barradosPessoas: new Set(bloqueios.map((b) => b.u)).size,
      evitaveis,
      picoLicencas,
      outrasFalhas,
      expiradas: usuarios.reduce((t, u) => t + u.expiradas, 0),
      ocioso: usuarios.reduce((t, u) => t + u.ocioso, 0),
      sessoes: usuarios.reduce((t, u) => t + u.sessoes, 0),
      expiradasTotal: expiradas.length
    };
  },

  render() {
    const root = document.getElementById("auditoria-login-root");
    if (!root) return;
    const esc = (s) => this.esc(s);
    const f = this.filtro;
    const temDados = this.linhas.length > 0;
    const a = temDados ? this.analisar() : null;
    const card = (rotulo, valor, sub, cor) => `<div class="crm-card alog-card"><span>${rotulo}</span><b style="color:${cor || "#0f172a"}">${valor}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const th = (rot, campo, dir) => `<th class="${dir ? "num" : ""}" onclick="AuditoriaLoginApp.ordenar('${campo}')" style="cursor:pointer;user-select:none;">${rot} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const top = a && a.usuarios.reduce((m, u) => (u.causados > (m ? m.causados : 0) ? u : m), null);
    const nivelOcioso = (x) => (x <= this.OCIOSO_NORMAL ? ["ok", "Normal"] : x <= this.OCIOSO_ALTO ? ["atencao", "Atenção"] : ["alto", "Alto"]);
    const marca = Math.round(this.OCIOSO_NORMAL * 100);
    const celOcioso = (u) => {
      if (!u.logado) return `<td class="alog-ocio alog-cinza">—</td>`;
      const [cls, rot] = nivelOcioso(u.pctOcioso);
      return `<td class="alog-ocio is-${cls}" title="${pct(u.pctOcioso)} do tempo logado ficou parado (${u.expiradas} queda(s) por inatividade em ${u.sessoes} sessão(ões))">
          <div class="alog-ocio-top"><b>${this.fmtDuracao(u.ocioso)}</b><span class="alog-ocio-tag">${rot}</span></div>
          <div class="alog-ocio-bar"><i style="width:${Math.max(u.ocioso ? 2 : 0, Math.round(u.pctOcioso * 100))}%"></i><em style="left:${marca}%"></em></div>
          <small>${pct(u.pctOcioso)} do tempo logado</small>
        </td>`;
    };

    const linhasUsu = a ? a.usuarios.map((u) => `<tr class="${u.causados ? "is-causa" : ""}">
        <td><b>${esc(u.u)}</b></td>
        <td class="num">${u.sessoes}</td>
        <td class="num">${this.fmtDuracao(u.logado)}</td>
        ${celOcioso(u)}
        <td class="num alog-forte">${u.causados || "—"}</td>
        <td class="num">${u.vitimasN || "—"}</td>
        <td class="num">${u.presente || "—"}</td>
        <td class="num">${u.barrado || "—"}</td>
      </tr>`).join("") : "";

    const horas = [];
    for (let h = f.escritorio ? 8 : 0; h < (f.escritorio ? 18 : 24); h++) horas.push(String(h).padStart(2, "0"));
    const maxHora = a ? Math.max(1, ...horas.map((h) => a.porHora[h] || 0)) : 1;
    const barras = a ? horas.map((h) => {
      const n = a.porHora[h] || 0;
      return `<div class="alog-barra" title="${n} tentativa(s) barrada(s) entre ${h}h e ${h}h59"><i style="height:${Math.round((n / maxHora) * 100)}%"></i><b>${n || ""}</b><span>${h}h</span></div>`;
    }).join("") : "";

    const linhasDet = a ? a.detalhe.slice(0, 400).map((d) => `<tr>
        <td>${this.fmtDataHora(d.b.ent)}</td>
        <td><b>${esc(d.b.u)}</b></td>
        <td class="num">${d.logados}</td>
        <td>${d.ociosos.length ? d.ociosos.map(([u, sai]) => `<span class="alog-chip">${esc(u)} <small>caiu às ${this.fmtHora(sai)}</small></span>`).join(" ") : `<small class="alog-cinza">ninguém parado: todos estavam usando</small>`}</td>
      </tr>`).join("") : "";

    const rels = this.relatorios.map((r) => `<tr>
        <td>${this.fmtDia(r.periodoDe)} a ${this.fmtDia(r.periodoAte)}</td>
        <td>${esc(r.arquivo || "—")}</td>
        <td class="num">${r.total || 0}</td>
        <td class="num">${r.usuarios || 0}</td>
        <td class="num">${r.bloqueios || 0}</td>
        <td>${esc(r.enviadoPor || r.enviadoPorEmail || "—")}${r.enviadoEm ? ` <small class="alog-cinza">em ${esc(new Date(r.enviadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</small>` : ""}</td>
        <td><button type="button" class="alog-del" title="Excluir relatório" onclick="AuditoriaLoginApp.excluir('${esc(r.id)}')"><i data-lucide="trash-2"></i></button></td>
      </tr>`).join("");

    root.innerHTML = `
      <div class="alog-page">
        <div class="alog-head">
          <div>
            <h2><i data-lucide="log-in"></i> Auditoria do Login Sienge</h2>
            <p>Suba o relatório <b>Auditoria do Login</b> do Sienge (Excel). O Sienge derruba quem fica ${this.TIMEOUT_MIN} minutos sem usar:
              cada <b>sessão expirada</b> são ${this.TIMEOUT_MIN} minutos com a licença presa sem ninguém usando. Aqui aparece quem mais segura licença parado
              enquanto outras pessoas são barradas por falta de licença.</p>
          </div>
          <div class="alog-acoes">
            <input type="file" id="alog-arquivo" accept=".xlsx,.xls" style="display:none" onchange="AuditoriaLoginApp.enviar(this.files[0]); this.value='';">
            <button type="button" class="btn btn-primary" onclick="AuditoriaLoginApp.escolherArquivo()" ${this.enviando ? "disabled" : ""}><i data-lucide="upload"></i> ${this.enviando ? esc(this.enviando) : "Enviar relatório"}</button>
          </div>
        </div>

        ${this.erro ? `<div class="crm-card alog-erro">${esc(this.erro)}</div>` : ""}

        <div class="crm-card alog-filtros">
          <label>De <input type="date" class="form-control" value="${esc(f.de)}" onchange="AuditoriaLoginApp.setFiltro('de', this.value)"></label>
          <label>Até <input type="date" class="form-control" value="${esc(f.ate)}" onchange="AuditoriaLoginApp.setFiltro('ate', this.value)"></label>
          <label class="moura-switch">
            <input type="checkbox" ${f.escritorio ? "checked" : ""} onchange="AuditoriaLoginApp.setFiltro('escritorio', this.checked)">
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">Só horário do escritório (seg a sex, 8h às 18h)</span>
          </label>
        </div>

        ${this.carregando && !temDados ? `<div class="crm-card alog-vazio">Carregando relatórios…</div>` : ""}
        ${!this.carregando && !temDados ? `<div class="crm-card alog-vazio">Nenhum relatório enviado ainda. Clique em <b>Enviar relatório</b> e escolha o Excel da Auditoria do Login do Sienge.</div>` : ""}

        ${a ? `
        <div class="alog-cards">
          ${card("Tentativas barradas", a.bloqueios, `${a.barradosPessoas} pessoa(s) não conseguiram entrar por falta de licença`, "#c2410c")}
          ${card("Barradas com licença parada", a.bloqueios ? `${a.evitaveis} <small>(${pct(a.evitaveis / a.bloqueios)})</small>` : "0", "Na hora da tentativa havia alguém logado sem usar, esperando cair", "#c2410c")}
          ${card("Tempo de licença parada", this.fmtDuracao(a.ocioso), `${a.expiradas} sessão(ões) expirada(s) × ${this.TIMEOUT_MIN} min`, "#0f172a")}
          ${card("Quem mais congestiona", top ? esc(top.u) : "—", top ? `${top.causados} tentativa(s) de outros barrada(s) enquanto estava parado` : "Ninguém parado nas horas de bloqueio", "#105436")}
          ${card("Licenças em uso nos bloqueios", a.picoLicencas || "—", "Máximo de pessoas logadas quando alguém foi barrado", "#0f172a")}
        </div>

        <div class="crm-card alog-bloco">
          <div class="alog-tit">Quem segura licença parado <small>clique no título da coluna para ordenar</small></div>
          <div class="alog-tab alog-usu"><table>
            <thead><tr>
              ${th("Usuário", "u")}${th("Sessões", "sessoes", 1)}${th("Tempo logado", "logado", 1)}
              ${th("Tempo parado", "ocioso")}${th("Barrou outros", "causados", 1)}${th("Pessoas barradas", "vitimasN", 1)}
              ${th("Logado em bloqueios", "presente", 1)}${th("Foi barrado", "barrado", 1)}
            </tr></thead>
            <tbody>${linhasUsu || `<tr><td colspan="8" class="alog-cinza">Sem acessos no período.</td></tr>`}</tbody>
          </table></div>
          <small class="alog-nota"><b>Tempo parado</b>: ${this.TIMEOUT_MIN} minutos por sessão expirada (o Sienge só derruba depois de ${this.TIMEOUT_MIN} minutos sem uso).
            A barra mostra quanto do tempo logado ficou parado: até ${marca}% é <b>normal</b> (risco na barra), até ${Math.round(this.OCIOSO_ALTO * 100)}% pede <b>atenção</b> e acima disso é <b>alto</b>.
            <b>Barrou outros</b>: tentativas de outras pessoas recusadas por falta de licença enquanto este usuário estava nesses ${this.TIMEOUT_MIN} minutos parado.
            <b>Logado em bloqueios</b>: vezes em que estava logado (usando ou não) quando alguém foi barrado.${a.outrasFalhas ? ` ${a.outrasFalhas} falha(s) de login por outros motivos não entram na conta.` : ""}</small>
        </div>

        <div class="crm-card alog-bloco">
          <div class="alog-tit">Tentativas barradas por hora do dia</div>
          <div class="alog-barras">${barras}</div>
        </div>

        <div class="crm-card alog-bloco">
          <div class="alog-tit">Cada tentativa barrada <small>${a.detalhe.length > 400 ? "400 mais recentes" : `${a.detalhe.length} no período`}</small></div>
          <div class="alog-tab alog-tab-alta"><table>
            <thead><tr><th>Quando</th><th>Quem tentou entrar</th><th class="num">Logados</th><th>Quem estava parado esperando cair</th></tr></thead>
            <tbody>${linhasDet || `<tr><td colspan="4" class="alog-cinza">Nenhuma tentativa barrada no período.</td></tr>`}</tbody>
          </table></div>
        </div>` : ""}

        ${this.relatorios.length ? `<div class="crm-card alog-bloco">
          <div class="alog-tit">Relatórios enviados <small>acessos repetidos entre relatórios contam uma vez só</small></div>
          <div class="alog-tab"><table>
            <thead><tr><th>Período</th><th>Arquivo</th><th class="num">Acessos</th><th class="num">Usuários</th><th class="num">Barrados</th><th>Enviado por</th><th></th></tr></thead>
            <tbody>${rels}</tbody>
          </table></div>
        </div>` : ""}
      </div>`;
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  init() {
    this.render();
    this.carregar(false);
  }
};

window.AuditoriaLoginApp = AuditoriaLoginApp;
