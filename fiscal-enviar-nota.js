/* Fiscal › Enviar nota: o operador informa o pedido de compra, sobe a nota (e boleto ou outros anexos) e confirma
   a data e a forma de pagamento. O envio entra na fila do operador fiscal (Fiscal › Inserir nota), que lança no Sienge.
   Firestore: fiscal_notas_envio/{id} · Storage: fiscal-notas/{id}/… */
window.FilaNotasFiscais = {
  COL: "fiscal_notas_envio",
  FORMAS: ["Boleto", "PIX", "Transferência (TED)", "Débito em conta", "Cartão de crédito", "Outra"],
  TIPOS_ANEXO: { nota: "Nota fiscal", boleto: "Boleto", cancelada: "Nota cancelada", carta: "Carta de correção", outro: "Outro" },
  MAX_MB: 20,
  STATUS: {
    pendente: { rot: "Aguardando fiscal", cls: "is-wait" },
    em_lancamento: { rot: "Em lançamento", cls: "is-info" },
    lancada: { rot: "Lançada no Sienge", cls: "is-ok" },
    devolvida: { rot: "Devolvida", cls: "is-erro" },
    cancelada: { rot: "Cancelada", cls: "is-off" },
    excluida: { rot: "Excluído", cls: "is-off" }
  },

  fb() {
    const db = window.firebaseDb;
    const f = window.firebaseCollections;
    return db && f && f.doc ? { db, f } : null;
  },

  usuario() {
    const u = (window.AppState && AppState.currentUser) || {};
    return {
      nome: u.name || u.nome || u.email || "",
      email: String(u.email || "").toLowerCase(),
      sienge: String(u.sienge_user || "").trim()
    };
  },

  /** Login do Sienge, nunca o nome completo. Envios antigos são achados pelo e-mail ou pelo nome cadastrado. */
  usuarioSienge(nome, email, gravado) {
    const pronto = String(gravado || "").trim();
    if (pronto) return pronto;
    const eu = (window.AppState && AppState.currentUser) || {};
    const mail = String(email || "").toLowerCase();
    const alvo = String(nome || "").trim().toUpperCase();
    if (eu.sienge_user && ((mail && String(eu.email || "").toLowerCase() === mail) || (alvo && String(eu.name || eu.nome || "").trim().toUpperCase() === alvo))) {
      return String(eu.sienge_user).trim();
    }
    let users = [];
    try { users = JSON.parse(localStorage.getItem("crm_users") || "[]") || []; } catch (e) { users = []; }
    const u = users.find((x) => mail && String(x.email || "").toLowerCase() === mail)
      || users.find((x) => alvo && String(x.name || "").trim().toUpperCase() === alvo)
      || users.find((x) => alvo && String(x.sienge_user || "").replace(/\./g, " ").trim().toUpperCase() === alvo);
    return u && u.sienge_user ? String(u.sienge_user).trim() : "";
  },

  async excluir(id) {
    const fb = this.fb();
    if (!fb || typeof fb.f.deleteDoc !== "function") throw new Error("Firebase indisponível");
    await fb.f.deleteDoc(fb.f.doc(fb.db, this.COL, id));
  },

  aberta(item) {
    return item && (item.status === "pendente" || item.status === "em_lancamento");
  },

  /** Envio deste pedido na base do fiscal (prioriza o que ainda está em análise). */
  doPedido(lista, doc) {
    const alvo = String(doc || "").replace(/\s/g, "");
    const dig = alvo.replace(/\D/g, "");
    if (!alvo) return null;
    const rank = { em_lancamento: 0, pendente: 1, devolvida: 2, lancada: 3 };
    const hits = (lista || []).filter((x) => {
      if (!x || x.status === "cancelada" || x.status === "excluida") return false;
      return [x.pedido, x.pedidoApi].some((v) => {
        const n = String(v || "").replace(/\s/g, "");
        return n && (n === alvo || n.replace(/\D/g, "") === dig);
      });
    });
    hits.sort((a, b) => (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]) || (b.criadoEm || 0) - (a.criadoEm || 0));
    return hits[0] || null;
  },

  /** Tag e botão da previsão: em análise fiscal, ou enviar/corrigir quando o pedido já pode ir ao fiscal. */
  acaoPedidoHtml(doc, lista) {
    const ped = String(doc || "").trim();
    if (!/^\d{3,}$/.test(ped)) return "";
    const item = this.doPedido(lista, ped);
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    let tag = "";
    if (item && (item.status === "pendente" || item.status === "em_lancamento")) {
      tag = `<span class="cprev-tag cprev-tag-fiscal" title="Nota enviada e aguardando o lançamento do fiscal">Em análise fiscal</span>`;
      return `<span class="cprev-fiscal-acoes">${tag}</span>`;
    }
    if (item && item.status === "devolvida") {
      const tit = item.devolucaoTipo === "cancelamento"
        ? "Devolvida para cancelamento. Reenvie neste pedido a nota nova e a nota cancelada com a tarja."
        : (item.devolucaoTipo === "carta" ? "Devolvida para carta de correção. O documento mostra o que foi informado e o que deveria ser." : (item.motivoDevolucao || "Devolvida pelo fiscal"));
      tag = `<span class="cprev-tag cprev-tag-previsao" title="${esc(tit)}">Nota devolvida</span>`;
    }
    const rot = item && item.status === "devolvida" ? "Corrigir envio" : "Enviar ao fiscal";
    const id = item && item.status === "devolvida" ? item.id : "";
    return `<span class="cprev-fiscal-acoes">${tag}<button type="button" class="cprev-fiscal-btn" onclick="event.stopPropagation(); FilaNotasFiscais.abrirEnvio('${esc(ped)}','${esc(id)}')">${rot}</button></span>`;
  },

  /** Abre Enviar nota com o pedido. Se a nota foi devolvida, abre a correção desse envio. */
  abrirEnvio(pedido, idEnvio) {
    const ped = String(pedido || "").trim();
    if (!ped) return;
    if (window.ComprasControleApp && typeof ComprasControleApp.fecharTitulo === "function") ComprasControleApp.fecharTitulo();
    if (typeof window.switchTab === "function") window.switchTab("fiscal-enviar-nota", "Enviar nota ao fiscal");
    const abrir = () => {
      const app = window.EnviarNotaApp;
      if (!app) return;
      const item = idEnvio && (app.state && app.state.lista || []).concat(this._ultimo || []).find((x) => x && x.id === idEnvio);
      if (item && item.status === "devolvida") {
        if (!app.state || !app.state.lista || !app.state.lista.some((x) => x.id === idEnvio)) {
          app.state = app.novoEstado();
          app.state.lista = (this._ultimo || []).slice();
          app.state.listaCarregada = true;
        }
        app.corrigir(idEnvio);
        return;
      }
      app.state = app.novoEstado();
      app.state.pedidoId = ped;
      app.init();
      app.buscarPedido();
    };
    setTimeout(abrir, 40);
  },

  async listar() {
    const fb = this.fb();
    if (!fb) throw new Error("Firebase indisponível");
    const { collection, getDocs, query, orderBy, limit } = fb.f;
    const snap = await getDocs(query(collection(fb.db, this.COL), orderBy("criadoEm", "desc"), limit(400)));
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  },

  /** Acompanha a fila em tempo real (um listener só, compartilhado entre Enviar nota e Inserir nota). */
  ouvir(fn) {
    this._ouvintes = this._ouvintes || [];
    if (!this._ouvintes.includes(fn)) this._ouvintes.push(fn);
    const copia = () => this._ultimo.map((x) => JSON.parse(JSON.stringify(x)));
    if (this._unsub) { if (this._ultimo) fn(copia()); return; }
    const fb = this.fb();
    if (!fb || !fb.f.onSnapshot) return;
    const { collection, query, orderBy, limit, onSnapshot } = fb.f;
    this._unsub = onSnapshot(query(collection(fb.db, this.COL), orderBy("criadoEm", "desc"), limit(400)), (snap) => {
      this._ultimo = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      this._ouvintes.forEach((cb) => { try { cb(copia()); } catch (e) { console.warn("[Fila notas]", e); } });
    }, (e) => {
      console.warn("[Fila notas] tempo real indisponível", e);
      this._unsub = null;
    });
  },

  novoId() {
    return `NF${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  },

  async salvar(id, dados) {
    const fb = this.fb();
    if (!fb) throw new Error("Firebase indisponível");
    await fb.f.setDoc(fb.f.doc(fb.db, this.COL, id), JSON.parse(JSON.stringify(dados)), { merge: true });
  },

  /** Cada devolução do fiscal vira um caso para as conferências seguintes do mesmo fornecedor. */
  async aprender(item, patch) {
    const fb = this.fb();
    if (!fb) return;
    const forn = item && item.fornecedor || {};
    const id = `AP${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    await fb.f.setDoc(fb.f.doc(fb.db, "fiscal_notas_aprendizado", id), {
      em: Date.now(),
      pedido: item.pedido || "",
      fornecedorId: String(forn.id || ""),
      fornecedorDoc: String(forn.doc || "").replace(/\D/g, ""),
      fornecedorNome: forn.nome || "",
      numeroNota: item.numeroNota || "",
      tipo: patch.devolucaoTipo || "",
      motivos: patch.motivosCancelamento || [],
      cartaLinhas: patch.cartaLinhas || [],
      motivo: String(patch.motivoDevolucao || "").slice(0, 2000)
    });
    this._casos = null;
  },

  async listarAprendizado() {
    if (this._casos) return this._casos;
    const fb = this.fb();
    if (!fb || !fb.f.getDocs) return [];
    const snap = await fb.f.getDocs(fb.f.query(fb.f.collection(fb.db, "fiscal_notas_aprendizado"), fb.f.limit(120)));
    this._casos = snap.docs.map((d) => d.data());
    return this._casos;
  },

  avisosAprendidos(doc) {
    const d = String(doc || "").replace(/\D/g, "");
    if (!d) return [];
    if (!this._casos && !this._casosPedido) {
      this._casosPedido = this.listarAprendizado().then(() => {
        this._casosPedido = null;
        if (window.EnviarNotaApp && EnviarNotaApp.pintarConferencia) EnviarNotaApp.pintarConferencia();
        if (window.InserirNotaApp && InserirNotaApp.pintarConferencia) InserirNotaApp.pintarConferencia();
      }).catch(() => { this._casosPedido = null; });
    }
    return (this._casos || []).filter((c) => c.fornecedorDoc === d).slice(0, 3).map((c) => {
      const oque = c.tipo === "carta"
        ? (c.cartaLinhas || []).map((l) => l.campo).filter(Boolean).slice(0, 3).join(", ")
        : (c.motivos || []).slice(0, 2).join("; ");
      return `Devolução anterior deste fornecedor${c.numeroNota ? " (NF " + c.numeroNota + ")" : ""}: ${oque || "confira os mesmos pontos"}.`;
    });
  },

  telefoneCorporativo(email) {
    const limpo = (v) => String(v || "").trim();
    const eu = (window.AppState && AppState.currentUser) || {};
    const mail = String(email || eu.email || "").toLowerCase();
    if (!email || String(eu.email || "").toLowerCase() === mail) {
      const direto = limpo(eu.telefone_corporativo || eu.telefoneCorporativo);
      if (direto) return direto;
    }
    let users = [];
    try { users = JSON.parse(localStorage.getItem("crm_users") || "[]") || []; } catch (e) { users = []; }
    const u = users.find((x) => mail && String(x.email || "").toLowerCase() === mail);
    return u ? limpo(u.telefone_corporativo || u.telefoneCorporativo) : "";
  },

  /** Muda o envio e registra no histórico quem fez o quê. */
  async atualizar(item, patch, acao, msg) {
    const u = this.usuario();
    const historico = (item.historico || []).concat([{ em: Date.now(), por: u.nome, porEmail: u.email, acao, msg: msg || "" }]).slice(-40);
    const dados = Object.assign({}, patch, { historico, atualizadoEm: Date.now() });
    await this.salvar(item.id, dados);
    Object.assign(item, dados);
    return item;
  },

  async subirAnexos(id, anexos) {
    const fb = this.fb();
    const { ref, uploadBytes, getDownloadURL } = (fb && fb.f) || {};
    if (!window.firebaseStorage || !ref || !uploadBytes || !getDownloadURL) throw new Error("Firebase Storage indisponível");
    const out = [];
    for (let i = 0; i < anexos.length; i++) {
      const a = anexos[i];
      if (!a.file) { out.push({ nome: a.nome, tipo: a.tipo, url: a.url, path: a.path, contentType: a.contentType || "", size: a.size || 0 }); continue; }
      const safe = String(a.file.name || "anexo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "anexo";
      const path = `fiscal-notas/${id}/${Date.now()}_${i}_${safe}`;
      const r = ref(window.firebaseStorage, path);
      await uploadBytes(r, a.file, { contentType: a.file.type || "application/octet-stream" });
      out.push({ nome: a.file.name || safe, tipo: a.tipo, url: await getDownloadURL(r), path, contentType: a.file.type || "", size: Number(a.file.size) || 0 });
    }
    return out;
  },

  /** Baixa o anexo como File (para ler a nota e anexar no pedido do Sienge). */
  async baixar(a) {
    const urls = [a.url];
    const m = String(a.url || "").match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (m) urls.push(`/proxy-storage/${m[1]}`);
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const b = await r.blob();
        return new File([b], a.nome || "anexo", { type: a.contentType || b.type || "" });
      } catch (e) {}
    }
    throw new Error(`não consegui baixar o anexo ${a.nome || ""}`);
  },

  statusHtml(item, esc) {
    const st = this.STATUS[item.status] || { rot: item.status || "—", cls: "is-off" };
    let extra = "";
    if (item.status === "em_lancamento" && item.assumidoPor) extra = ` · ${esc(item.assumidoPor)}`;
    if (item.status === "lancada" && item.seqSienge) extra = ` · seq. ${esc(item.seqSienge)}`;
    return `<span class="fnf-pill ${st.cls}">${esc(st.rot)}${extra}</span>`;
  },

  iconeAnexo(tipo) {
    if (tipo === "boleto") return "barcode";
    if (tipo === "nota") return "file-text";
    if (tipo === "cancelada") return "file-x";
    if (tipo === "carta") return "file-diff";
    return "paperclip";
  },

  motivoHtml(item, esc) {
    if (!item || item.status !== "devolvida" || !item.motivoDevolucao) return "";
    const rot = item.devolucaoTipo === "cancelamento" ? "Cancelar a nota" : (item.devolucaoTipo === "carta" ? "Carta de correção" : "Devolvida");
    return `<small class="fnf-motivo"><b>${rot}.</b> ${esc(item.motivoDevolucao).replace(/\n/g, "<br>")}</small>`;
  },

  anexosHtml(item, esc) {
    const lista = item.anexos || [];
    if (!lista.length) return "—";
    const id = esc(item.id);
    const titulo = lista.length === 1
      ? (lista[0].nome || this.TIPOS_ANEXO[lista[0].tipo] || "Abrir anexo")
      : `${lista.length} anexos`;
    if (lista.length === 1 && lista[0].url) {
      return `<a class="fnf-anexo-ico" href="${esc(lista[0].url)}" target="_blank" rel="noopener" title="${esc(titulo)}"><i data-lucide="paperclip"></i></a>`;
    }
    return `<button type="button" class="fnf-anexo-ico" title="${esc(titulo)}" onclick="FilaNotasFiscais.abrirAnexos('${id}')"><i data-lucide="paperclip"></i></button>`;
  },

  acharEnvio(id) {
    const listas = [];
    if (window.EnviarNotaApp && EnviarNotaApp.state) listas.push(EnviarNotaApp.state.lista || []);
    if (window.InserirNotaApp && InserirNotaApp.fila) listas.push(InserirNotaApp.fila.itens || []);
    listas.push(this._ultimo || []);
    return listas.reduce((achou, lista) => achou || (lista || []).find((x) => x && x.id === id), null);
  },

  abrirAnexos(id) {
    const item = this.acharEnvio(id);
    const lista = (item && item.anexos) || [];
    if (lista.length === 1 && lista[0].url) {
      window.open(lista[0].url, "_blank", "noopener");
      return;
    }
    const velho = document.getElementById("fnf-anexos-pop");
    if (velho) velho.remove();
    if (!lista.length) return;
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const pop = document.createElement("div");
    pop.id = "fnf-anexos-pop";
    pop.className = "fnf-pop";
    pop.innerHTML = `<div class="fnf-pop-box" role="dialog" aria-label="Anexos">
      <div class="fnf-pop-h"><b>Anexos</b><button type="button" class="fnf-pop-x" onclick="document.getElementById('fnf-anexos-pop').remove()" title="Fechar"><i data-lucide="x"></i></button></div>
      <ul>${lista.map((a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener"><i data-lucide="${this.iconeAnexo(a.tipo)}"></i><span>${esc(a.nome || this.TIPOS_ANEXO[a.tipo] || "Anexo")}</span><small>${esc(this.TIPOS_ANEXO[a.tipo] || "")}</small></a></li>`).join("")}</ul>
    </div>`;
    pop.addEventListener("click", (ev) => { if (ev.target === pop) pop.remove(); });
    document.body.appendChild(pop);
    if (window.lucide) lucide.createIcons();
  },

  pagamentoTxt(item, dataBr) {
    const p = item.pagamento || {};
    return [p.data ? dataBr(p.data) : "", p.forma || ""].filter(Boolean).join(" · ") || "—";
  },

  /** Estilo compartilhado entre Enviar nota e a fila do Inserir nota. */
  css() {
    return `
      .fnf-tab { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .fnf-tab th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; padding: 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
      .fnf-tab td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
      .fnf-tab td small { display: block; color: #64748b; font-size: 0.74rem; margin-top: 2px; }
      .fnf-tab .num { text-align: right; white-space: nowrap; }
      .fnf-tab .fnf-acoes { white-space: nowrap; text-align: right; }
      .fnf-tab .fnf-acoes .tvig-ico { margin-left: 2px; width: 32px; height: 32px; min-width: 32px; padding: 0; border-radius: 8px; }
      .fnf-tab .fnf-acoes .tvig-ico i, .fnf-tab .fnf-acoes .tvig-ico svg { width: 15px; height: 15px; }
      .fnf-anexo-ico { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; background: transparent; color: #64748b; border-radius: 6px; cursor: pointer; text-decoration: none; }
      .fnf-anexo-ico:hover { background: #f1f5f9; color: #105436; }
      .fnf-anexo-ico i { width: 15px; height: 15px; }
      .fnf-pop { position: fixed; inset: 0; z-index: 1600; background: rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; padding: 24px; }
      .fnf-pop-box { width: min(440px, 100%); background: #fff; border-radius: 12px; padding: 14px 16px 8px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.2); }
      .fnf-pop-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .fnf-pop-h b { color: #105436; }
      .fnf-pop-x { border: 0; background: transparent; color: #64748b; cursor: pointer; display: inline-flex; border-radius: 6px; padding: 4px; }
      .fnf-pop-x:hover { background: #f1f5f9; }
      .fnf-pop-x i { width: 16px; height: 16px; }
      .fnf-pop ul { list-style: none; margin: 0; padding: 0; }
      .fnf-pop li a { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-top: 1px solid #f1f5f9; color: #0f172a; text-decoration: none; font-size: 0.86rem; }
      .fnf-pop li a:hover { color: #105436; }
      .fnf-pop li a i { width: 16px; height: 16px; color: #105436; flex: 0 0 16px; }
      .fnf-pop li small { margin-left: auto; color: #64748b; font-size: 0.72rem; }
      .fnf-fila { display: flex; flex-direction: column; gap: 10px; }
      .fnf-fila-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 18px; align-items: center; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; padding: 12px 14px; }
      .fnf-fila-top { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
      .fnf-fila-top b { font-size: 0.95rem; color: #0f172a; }
      .fnf-fila-top .fnf-forn { color: #334155; font-size: 0.84rem; }
      .fnf-fila-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; color: #64748b; font-size: 0.75rem; align-items: center; }
      .fnf-fila-lado { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .fnf-fila-acoes { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      .fnf-fila-acoes .btn[disabled] { opacity: 0.45; cursor: not-allowed; }
      .fnf-dev { position: fixed; inset: 0; z-index: 1700; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; padding: 24px; }
      .fnf-dev-box { width: min(740px, 100%); max-height: min(86vh, 860px); overflow: auto; background: #fff; border-radius: 14px; padding: 18px 18px 14px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2); }
      .fnf-dev-box h3 { margin: 0 0 4px; font-size: 1rem; color: #0f172a; }
      .fnf-dev-ops { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
      .fnf-dev-op { text-align: left; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 10px 12px; cursor: pointer; }
      .fnf-dev-op.is-on { border-color: #105436; background: #f0fdf4; }
      .fnf-dev-op b { display: block; color: #0f172a; font-size: 0.88rem; }
      .fnf-dev-op small { color: #64748b; font-size: 0.75rem; }
      .fnf-motivos { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 10px; }
      .fnf-motivos label { display: flex; gap: 8px; align-items: flex-start; font-size: 0.84rem; color: #334155; }
      .fnf-carta-linhas { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
      .fnf-carta-linhas .fnf-carta-linha { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 6px; }
      .fnf-carta-linhas input, .fnf-carta-linhas select, .fnf-dev-box textarea, .fnf-dev-box .fnf-campo { width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 8px; font: inherit; font-size: 0.84rem; background: #fff; }
      .fnf-dev-box textarea { min-height: 72px; resize: vertical; }
      .fnf-dev-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .fnf-carta-h { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 6px; color: #64748b; font-size: 0.7rem; text-transform: uppercase; margin-top: 8px; }
      @media (max-width: 820px) {
        .fnf-fila-item { grid-template-columns: 1fr; }
        .fnf-fila-lado, .fnf-fila-acoes { align-items: flex-start; justify-content: flex-start; }
        .fnf-dev-ops, .fnf-carta-linhas .fnf-carta-linha, .fnf-carta-h { grid-template-columns: 1fr; }
      }
      .fnf-pill { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
      .fnf-pill.is-wait { background: #fff7ed; color: #c2410c; }
      .fnf-pill.is-info { background: #eff6ff; color: #1d4ed8; }
      .fnf-pill.is-ok { background: #ecfdf5; color: #105436; }
      .fnf-pill.is-erro { background: #fef2f2; color: #b91c1c; }
      .fnf-pill.is-off { background: #f1f5f9; color: #64748b; }
      .fnf-anexo { display: inline-flex; align-items: center; gap: 4px; margin: 0 6px 2px 0; color: #64748b; font-weight: 500; text-decoration: none; font-size: 0.78rem; }
      .fnf-anexo:hover { text-decoration: underline; }
      .fnf-anexo i { width: 13px; height: 13px; }
      .fnf-tab td small.fnf-motivo { color: #b91c1c; font-weight: 700; font-size: 0.78rem; }
      .fnf-tab tr.fnf-devolvida td { background: #fef2f2; }
      .fnf-barra { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .fnf-barra select { height: 34px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 0.84rem; background: #fff; }
      .fnf-vazio { color: #64748b; font-size: 0.85rem; padding: 18px 4px; text-align: center; }`;
  }
};

window.EnviarNotaApp = {
  state: null,

  novoEstado() {
    const ant = this.state || {};
    return {
      aba: ant.aba || "enviar",
      pedidoId: "", pedidoApi: "", pedidoNome: "", pedido: null, credor: null, cc: null, empresaCc: "", previsao: null,
      carregando: "", erro: "", abertas: [],
      banco: { contas: [], pix: [], formas: [], erro: "" },
      anexos: [], previewIdx: -1, preview: "", previewLendo: "",
      pag: { data: "", forma: "", detalhe: "" },
      formaManual: "",
      numeroNota: "", serieNota: "", valorNota: "", linhaBoleto: "", linhaTocada: false,
      lendoNota: "", leituraErro: "", leituraToken: 0, fiscal: null,
      obs: "",
      enviando: "", feito: "", editandoId: "",
      lista: ant.lista || [], listaCarregada: !!ant.listaCarregada, listaErro: "", listaCarregando: false, todos: !!ant.todos, verLancadas: !!ant.verLancadas
    };
  },

  voltarBudget() {
    if (typeof switchTab === "function") switchTab("marketing-budget", "Budget");
  },

  init() {
    if (!this.state) this.state = this.novoEstado();
    this.render();
    if (!this.empresas) this.carregarEmpresas();
    if (this.state.aba === "minhas") this.carregarLista(true);
    FilaNotasFiscais.ouvir(this._aoMudar || (this._aoMudar = (lista) => this.aoMudarFila(lista)));
  },

  /** Fila mudou no Firebase (ex.: o fiscal devolveu ou lançou): atualiza a lista sem tirar o foco de quem está digitando. */
  aoMudarFila(lista) {
    const s = this.state;
    if (!s) return;
    s.lista = lista;
    s.listaCarregada = true;
    s.abertas = (lista || []).filter((x) => FilaNotasFiscais.aberta(x) && String(x.pedidoApi) === String(s.pedidoApi) && x.id !== s.editandoId);
    if (s.aba === "minhas") this.render();
    else {
      this.pintarAbas();
      this.pintarConferencia();
    }
  },

  async carregarEmpresas() {
    const lista = window.SiengeApiService && SiengeApiService.getCompanies ? await SiengeApiService.getCompanies().catch(() => []) : [];
    this.empresas = (lista || []).map((c) => ({ id: String(c.id), nome: c.name || c.tradeName || `Empresa ${c.id}` }));
    if (this.state && this.state.pedido) this.render();
  },

  /* ---------- utilitários ---------- */
  esc(v) { return InserirNotaApp.esc(v); },
  money(v) { return InserirNotaApp.money(v); },
  dataBr(iso) { return InserirNotaApp.dataBr(iso); },
  num(v) { return InserirNotaApp.num(v); },
  hojeIso() { return InserirNotaApp.hojeIso(); },
  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_fiscal_geral_enviar_nota_editar");
  },
  nomeEmpresa(id) {
    const e = (this.empresas || []).find((c) => c.id === String(id));
    return e ? e.nome : "";
  },

  setAba(aba) {
    this.state.aba = aba;
    this.render();
    if (aba === "minhas") this.carregarLista(true);
  },

  /* ---------- pedido ---------- */
  async buscarPedido() {
    const s = this.state;
    const digitado = String((document.getElementById("env-pedido") || {}).value || s.pedidoId || "").trim();
    const id = InserirNotaApp.idApi(digitado);
    if (!id) { this._buscaAlvo = "enviar"; this.abrirBuscaPedidos(); return; }
    this._buscaAlvo = "enviar";
    Object.assign(s, { pedidoId: digitado, pedidoApi: id, pedidoNome: digitado, pedido: null, credor: null, cc: null, empresaCc: "", previsao: null, erro: "", abertas: [], feito: "", banco: { contas: [], pix: [], formas: [], erro: "" } });
    s.carregando = "Buscando o pedido no Sienge…";
    this.render();
    try {
      const pedido = await InserirNotaApp.get(`/purchase-orders/${id}`);
      if (!pedido || typeof pedido !== "object" || pedido.id == null) throw new Error("pedido não encontrado");
      if (!this.pedidoPermitido(pedido)) {
        s.erro = "Esse pedido é de um departamento fora do seu acesso. Busque pelos pedidos em aberto do seu departamento.";
        s.carregando = "";
        this.render();
        this.abrirBuscaPedidos();
        return;
      }
      s.pedido = pedido;
      s.pedidoApi = String(pedido.id);
      s.pedidoNome = String(pedido.formattedPurchaseOrderId || digitado);
      const [credor, cc, previsao, fila, banco] = await Promise.all([
        InserirNotaApp.get(`/creditors/${encodeURIComponent(pedido.supplierId)}`).catch(() => null),
        InserirNotaApp.centroDeCusto(pedido),
        InserirNotaApp.previsaoFinanceira(pedido).catch(() => null),
        FilaNotasFiscais.listar().catch(() => []),
        this.dadosBancarios(pedido.supplierId)
      ]);
      s.banco = banco;
      s.lista = Array.isArray(fila) ? fila : (s.lista || []);
      s.listaCarregada = true;
      s.credor = credor && typeof credor === "object"
        ? { id: String(pedido.supplierId), nome: credor.name || credor.tradeName || `Fornecedor ${pedido.supplierId}`, doc: InserirNotaApp.digits(credor.cnpj || credor.cpf) }
        : { id: String(pedido.supplierId), nome: `Fornecedor ${pedido.supplierId}`, doc: "" };
      s.cc = cc;
      s.empresaCc = cc.companyId;
      s.previsao = previsao;
      s.abertas = s.lista.filter((x) => FilaNotasFiscais.aberta(x) && String(x.pedidoApi) === s.pedidoApi && x.id !== s.editandoId);
      if (!s.pag.data && previsao && previsao.parcelas.length) {
        const hoje = this.hojeIso();
        const p = previsao.parcelas.find((x) => x.vencimento >= hoje) || previsao.parcelas[0];
        s.pag.data = p.vencimento;
      }
      this.sugerirForma();
      if (s._fonteNota) this.analisarFiscal(s.leituraToken);
    } catch (e) {
      const msg = String((e && e.message) || e || "");
      const sumiu = /404|não encontrado/i.test(msg);
      s.erro = sumiu ? `Pedido ${id} não encontrado no seu acesso.`
        : (/403/.test(msg) ? "O usuário da API não tem permissão para consultar pedidos de compra." : `Não consegui buscar o pedido: ${msg}`);
      s.carregando = "";
      this.render();
      if (sumiu) this.abrirBuscaPedidos();
      return;
    }
    s.carregando = "";
    this.render();
  },

  departamentosAcesso() {
    const app = window.ComprasPrevisoesApp;
    if (!app || typeof app.accessibleDepartments !== "function") return null;
    try { return app.accessibleDepartments(); } catch (e) { return null; }
  },

  pedidoPermitido(pedido) {
    const access = this.departamentosAcesso();
    if (!access) return true;
    const nome = String(pedido.departmentName || pedido.departamentName || pedido.department || "").trim().toUpperCase();
    const id = String(pedido.departmentId != null ? pedido.departmentId : (pedido.departamentId != null ? pedido.departamentId : ""));
    if (!nome && !id) return true;
    return access.some((a) => {
      const aid = String(a.id || "");
      const alabel = String(a.label || a.name || "").trim().toUpperCase();
      return (id && aid === id) || (nome && alabel === nome);
    });
  },

  abrirBuscaPedidos() {
    const velho = document.getElementById("env-busca-ped");
    if (velho) velho.remove();
    const pop = document.createElement("div");
    pop.id = "env-busca-ped";
    pop.className = "fnf-pop";
    pop.innerHTML = `<div class="fnf-pop-box" role="dialog" aria-modal="true" style="width:min(640px,100%)">
      <div class="fnf-pop-h"><b>Pedidos em aberto</b><button type="button" class="fnf-pop-x" onclick="EnviarNotaApp.fecharBuscaPedidos()" title="Fechar"><i data-lucide="x"></i></button></div>
      <p class="inf-muted">Pesquise pelo credor. A lista traz só pedidos em aberto dos departamentos do seu acesso.</p>
      <div class="inf-busca">
        <input id="env-busca-credor" placeholder="Nome ou CNPJ do credor" onkeydown="if(event.key==='Enter'){event.preventDefault();EnviarNotaApp.buscarPedidosCredor()}">
        <button type="button" class="btn btn-primary inf-btn-sm" style="height:38px;" onclick="EnviarNotaApp.buscarPedidosCredor()"><i data-lucide="search"></i> Buscar</button>
      </div>
      <div id="env-busca-lista" style="margin-top:12px;max-height:320px;overflow:auto;"></div>
    </div>`;
    pop.addEventListener("click", (ev) => { if (ev.target === pop) this.fecharBuscaPedidos(); });
    document.body.appendChild(pop);
    if (window.lucide) lucide.createIcons();
    const inp = document.getElementById("env-busca-credor");
    if (inp) inp.focus();
  },

  fecharBuscaPedidos() {
    const pop = document.getElementById("env-busca-ped");
    if (pop) pop.remove();
  },

  async buscarPedidosCredor() {
    const box = document.getElementById("env-busca-lista");
    const q = String((document.getElementById("env-busca-credor") || {}).value || "").trim();
    if (!box) return;
    if (q.length < 2) { box.innerHTML = `<p class="inf-erro">Informe ao menos 2 caracteres do credor.</p>`; return; }
    box.innerHTML = `<p class="inf-muted"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Buscando credor e pedidos em aberto…</p>`;
    try {
      const dig = q.replace(/\D/g, "");
      const path = dig.length >= 11 ? `/creditors?limit=15&cnpj=${encodeURIComponent(dig)}` : `/creditors?limit=15&name=${encodeURIComponent(q)}`;
      const credores = InserirNotaApp.lista(await InserirNotaApp.get(path));
      if (!credores.length) { box.innerHTML = `<p class="inf-muted">Nenhum credor encontrado.</p>`; return; }
      const blocos = [];
      for (const c of credores.slice(0, 5)) {
        const id = c.id != null ? c.id : c.creditorId;
        if (id == null) continue;
        const nome = c.name || c.tradeName || `Credor ${id}`;
        let pedidos = [];
        try { pedidos = InserirNotaApp.lista(await InserirNotaApp.get(`/purchase-orders?supplierId=${encodeURIComponent(id)}&limit=40`)); } catch (e) { pedidos = []; }
        const abertos = pedidos.filter((p) => {
          const st = String(p.status || "").toUpperCase();
          return st !== "CANCELED" && st !== "FULLY_DELIVERED" && this.pedidoPermitido(p);
        });
        if (!abertos.length) continue;
        const linhas = abertos.slice(0, 12).map((p) => {
          const num = this.esc(p.formattedPurchaseOrderId || p.id);
          const api = this.esc(p.id);
          return `<li><button type="button" class="env-anexo-nome" onclick="EnviarNotaApp.escolherPedidoBusca('${api}')"><b>${num}</b></button><small>${p.date ? this.dataBr(String(p.date).slice(0, 10)) : ""} ${p.totalAmount != null ? " · " + this.money(p.totalAmount) : ""}</small></li>`;
        }).join("");
        blocos.push(`<div style="margin-bottom:12px;"><b>${this.esc(nome)}</b><ul class="env-anexos">${linhas}</ul></div>`);
      }
      box.innerHTML = blocos.length ? blocos.join("") : `<p class="inf-muted">Nenhum pedido em aberto desse credor no seu departamento.</p>`;
    } catch (e) {
      box.innerHTML = `<p class="inf-erro">${this.esc((e && e.message) || e)}</p>`;
    }
  },

  escolherPedidoBusca(id) {
    this.fecharBuscaPedidos();
    const alvo = this._buscaAlvo === "inserir" ? "inf-pedido" : "env-pedido";
    const el = document.getElementById(alvo);
    if (el) el.value = id;
    if (this._buscaAlvo === "inserir" && window.InserirNotaApp) {
      InserirNotaApp.state.pedidoId = id;
      InserirNotaApp.buscarPedido();
      return;
    }
    this.state.pedidoId = id;
    this.buscarPedido();
  },

  /* ---------- dados bancários do credor (cadastro no Sienge) ---------- */
  async dadosBancarios(credorId) {
    const out = { contas: [], pix: [], formas: [], erro: "" };
    if (credorId == null || credorId === "") return out;
    const id = encodeURIComponent(credorId);
    let erroContas = "";
    let erroPix = "";
    const [contas, pix] = await Promise.all([
      InserirNotaApp.get(`/creditors/${id}/bank-informations?limit=100`).catch((e) => { erroContas = String((e && e.message) || e); return null; }),
      InserirNotaApp.get(`/creditors/${id}/pix-informations?limit=100`).catch((e) => { erroPix = String((e && e.message) || e); return null; })
    ]);
    const padrao = (x) => ["S", "Y", "TRUE", "1"].includes(String(x && x.defaultFlag).toUpperCase());
    const tipoConta = (b) => ({ C: "Conta corrente", CHECKING: "Conta corrente", P: "Poupança", SAVING: "Poupança", SAVINGS: "Poupança" }[String(b.accountType || "").toUpperCase()] || "");
    const bancos = InserirNotaApp.lista(contas);
    out.contas = bancos.filter((b) => b && (b.accountNumber || b.agency)).map((b) => ({
      txt: this.contaTxt(b),
      padrao: padrao(b),
      favorecido: b.nameOfRecipient || "",
      doc: InserirNotaApp.digits(b.cpf || b.cnpj),
      banco: b.bank || "",
      nomeBanco: b.nameOfBank || "",
      agencia: b.agency || "",
      agenciaNome: b.agencyName || b.nameOfAgency || "",
      conta: `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`,
      tipo: tipoConta(b),
      forma: this.formaDoTexto(b.paymentForm || b.paymentTypeName)
    }));
    out.formas = bancos.filter((b) => b && (b.paymentForm || b.paymentTypeName)).map((b) => ({
      forma: String(b.paymentForm || b.paymentTypeName).trim(), padrao: padrao(b)
    }));
    out.pix = InserirNotaApp.lista(pix).filter((p) => p && (p.key || p.keyPix)).map((p) => ({
      txt: `${String(p.type || p.keyPixType || "").trim().toUpperCase() || "Chave"}: ${String(p.key || p.keyPix).trim()}`,
      padrao: padrao(p),
      tipoChave: String(p.type || p.keyPixType || "").trim(),
      chave: String(p.key || p.keyPix).trim(),
      favorecido: p.nameOfRecipient || p.beneficiaryName || p.name || "",
      doc: InserirNotaApp.digits(p.cpf || p.cnpj || p.cpfCnpj || "")
    }));
    if (erroContas) out.erro = erroContas;
    else if (erroPix && !/403/.test(erroPix)) out.erro = erroPix;
    if (/403/.test(erroPix)) out.pixSemPermissao = true;
    return out;
  },

  /** 403 no PIX não apaga a conta que já veio. Só avisa quando a conta também não carregou. */
  erroBancoVisivel() {
    const b = this.state.banco || {};
    if ((b.contas || []).length || (b.pix || []).length) return "";
    const msg = String(b.erro || "");
    if (!msg) return "";
    if (/403/.test(msg)) return "O usuário da API não tem permissão para ler os dados bancários deste credor no Sienge.";
    return msg;
  },

  contaTxt(b) {
    const tipo = { C: "Conta corrente", CHECKING: "Conta corrente", P: "Poupança", SAVING: "Poupança", SAVINGS: "Poupança" }[String(b.accountType || "").toUpperCase()] || "";
    const banco = b.nameOfBank ? `${b.nameOfBank}${b.bank ? ` (${b.bank})` : ""}` : (b.bank ? `Banco ${b.bank}` : "");
    const conta = `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`;
    return [banco, b.agency ? `Ag. ${b.agency}` : "", conta ? `Conta ${conta}` : "", tipo].filter(Boolean).join(" · ");
  },

  /** Opções de destino do pagamento para a forma escolhida: chaves PIX ou contas do cadastro do credor. */
  destinos(forma) {
    const b = this.state.banco;
    if (forma === "PIX") return b.pix;
    if (forma === "Transferência (TED)" || forma === "Débito em conta") return b.contas;
    return null;
  },

  /** Mantém o destino só se ele existir no cadastro do credor; senão usa o padrão do Sienge (ou o único cadastrado). */
  ajustarDestino() {
    const pag = this.state.pag;
    const ops = this.destinos(pag.forma);
    if (!ops) return;
    if (ops.some((o) => o.txt === pag.detalhe)) return;
    const pad = ops.find((o) => o.padrao) || (ops.length === 1 ? ops[0] : null);
    pag.detalhe = pad ? pad.txt : "";
  },

  setForma(forma) {
    const s = this.state;
    const pag = s.pag;
    s.formaManual = forma;
    if (pag.forma !== forma) pag.detalhe = "";
    pag.forma = forma;
    if (forma === "Boleto" && s.linhaBoleto) pag.detalhe = s.linhaBoleto;
    this.ajustarDestino();
    this.render();
    if (forma === "Boleto") this.lerBoletoAnexo();
  },

  /** Lista da forma de pagamento: o que está no cadastro do credor, e boleto. */
  opcoesPagamento() {
    const b = this.state.banco || { contas: [], pix: [] };
    const opts = [];
    (b.pix || []).forEach((p) => opts.push({
      forma: "PIX", detalhe: p.txt, tipo: "pix", item: p,
      rotulo: `PIX · ${p.padrao ? "principal" : "cadastrada"} · ${p.txt}`
    }));
    (b.contas || []).forEach((c) => {
      const forma = c.forma && c.forma !== "PIX" && c.forma !== "Boleto" ? c.forma : "Transferência (TED)";
      if (forma === "Cartão de crédito" || forma === "Outra") return;
      opts.push({
        forma, detalhe: c.txt, tipo: "conta", item: c,
        rotulo: `${forma} · ${c.padrao ? "principal" : "cadastrada"} · ${c.txt}`
      });
    });
    opts.push({ forma: "Boleto", detalhe: "", tipo: "boleto", item: null, rotulo: "Boleto" });
    return opts;
  },

  escolherPagamento(idx) {
    const s = this.state;
    if (idx === "" || idx == null) {
      s.formaManual = "";
      s.pag.forma = "";
      s.pag.detalhe = "";
      this.render();
      return;
    }
    const o = this.opcoesPagamento()[Number(idx)];
    if (!o) {
      s.formaManual = "";
      s.pag.forma = "";
      s.pag.detalhe = "";
      this.render();
      return;
    }
    s.formaManual = o.forma;
    s.pag.forma = o.forma;
    if (o.forma === "Boleto") s.linhaTocada = false;
    s.pag.detalhe = o.forma === "Boleto" ? (s.linhaBoleto || "") : (o.detalhe || "");
    this.render();
    if (o.forma === "Boleto") this.lerBoletoAnexo();
  },

  fichaDestino() {
    const pag = this.state.pag;
    const b = this.state.banco || {};
    const grade = (titulo, linhas) => `<div class="env-banco"><p>${titulo}</p><div class="env-banco-grade">${linhas.map(([k, v]) => `<div><span>${this.esc(k)}</span><b>${this.esc(v || "—")}</b></div>`).join("")}</div></div>`;
    if (pag.forma === "PIX") {
      const p = (b.pix || []).find((x) => x.txt === pag.detalhe);
      if (!p) return "";
      return grade("PIX cadastrado no credor", [
        ["Tipo de chave", p.tipoChave || "—"],
        ["Chave PIX", p.chave || "—"],
        ["Favorecido", p.favorecido || "—"],
        ["CNPJ/CPF", p.doc ? InserirNotaApp.docFmt(p.doc) : "—"],
        ["Principal", p.padrao ? "Sim" : "Não"]
      ]);
    }
    if (pag.forma === "Transferência (TED)" || pag.forma === "Débito em conta") {
      const c = (b.contas || []).find((x) => x.txt === pag.detalhe);
      if (!c) return "";
      const banco = [c.banco, c.nomeBanco].filter(Boolean).join(" · ");
      return grade("Conta cadastrada no credor", [
        ["Banco", banco || "—"],
        ["Agência", [c.agencia, c.agenciaNome].filter(Boolean).join(" · ") || "—"],
        ["Conta", c.conta || "—"],
        ["Tipo", c.tipo || "—"],
        ["Favorecido", c.favorecido || "—"],
        ["CNPJ/CPF", c.doc ? InserirNotaApp.docFmt(c.doc) : "—"],
        ["Principal", c.padrao ? "Sim" : "Não"]
      ]);
    }
    return "";
  },

  /** Forma padrão do cadastro bancário do credor no Sienge (paymentForm). */
  formaDoTexto(txt) {
    const pf = String(txt || "").toUpperCase();
    if (!pf) return "";
    if (pf.includes("PIX")) return "PIX";
    if (pf.includes("DÉBITO") || pf.includes("DEBITO")) return "Débito em conta";
    if (pf.includes("TRANSFER") || pf.includes("TED") || pf.includes("DOC") || pf.includes("BANK-TRANSFER")) return "Transferência (TED)";
    if (pf.includes("BOLETO")) return "Boleto";
    return "";
  },

  formaDoCredor() {
    const formas = (this.state.banco && this.state.banco.formas) || [];
    const escolhida = formas.find((c) => c.padrao) || formas[0];
    return escolhida ? this.formaDoTexto(escolhida.forma) : "";
  },

  /** Dígito da linha digitável (módulo 10). Junta números de campos diferentes da nota não passam. */
  dvMod10(num) {
    let soma = 0;
    let mult = 2;
    for (let i = String(num).length - 1; i >= 0; i--) {
      let n = Number(String(num)[i]) * mult;
      if (n > 9) n = (n % 10) + 1;
      soma += n;
      mult = mult === 2 ? 1 : 2;
    }
    return (10 - (soma % 10)) % 10;
  },

  linhaDigitavelValida(d) {
    if (!/^\d{47}$/.test(d)) return false;
    return this.dvMod10(d.slice(0, 9)) === Number(d[9])
      && this.dvMod10(d.slice(10, 20)) === Number(d[20])
      && this.dvMod10(d.slice(21, 31)) === Number(d[31]);
  },

  linhaBoleto(texto) {
    const t = String(texto || "");
    const formatada = t.match(/\d{5}\.?\d{5}\s+\d{5}\.?\d{6}\s+\d{5}\.?\d{6}\s+\d\s+\d{14}/);
    if (formatada) {
      const d = formatada[0].replace(/\D/g, "");
      if (this.linhaDigitavelValida(d)) return formatada[0].replace(/\s+/g, " ").trim();
    }
    const pedacos = t.match(/\d{47}/g) || [];
    for (let i = 0; i < pedacos.length; i++) {
      if (this.linhaDigitavelValida(pedacos[i])) return pedacos[i];
    }
    return "";
  },

  async textoDeArquivo(file) {
    if (!file) return "";
    const buf = await file.arrayBuffer();
    const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
    if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name || "")) return new TextDecoder("utf-8").decode(buf);
    if (/^%PDF/.test(inicio)) {
      const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
      let texto = itens.map((i) => i.s).join("\n");
      if (!this.linhaBoleto(texto) && window.InserirNotaApp && typeof InserirNotaApp.pdfParaCanvas === "function") {
        const canvas = await InserirNotaApp.pdfParaCanvas(buf);
        const celulas = await this.ocr(canvas, this.state.leituraToken || 0);
        texto = texto + "\n" + celulas.map((c) => c.s).join("\n");
      }
      return texto;
    }
    if (/^image\//.test(file.type || "") && window.InserirNotaApp && typeof InserirNotaApp.imagemParaCanvas === "function") {
      const canvas = await InserirNotaApp.imagemParaCanvas(file);
      const celulas = await this.ocr(canvas, this.state.leituraToken || 0);
      return celulas.map((c) => c.s).join("\n");
    }
    return "";
  },

  /** Lê a linha digitável do anexo marcado como boleto e preenche o pagamento. */
  lerBoletoAnexo() {
    const s = this.state;
    const token = (s.boletoToken || 0) + 1;
    s.boletoToken = token;
    const a = (s.anexos || []).find((x) => x.tipo === "boleto");
    if (!a) return;
    const pronto = a.file ? Promise.resolve(a.file) : FilaNotasFiscais.baixar(a);
    pronto.then((file) => this.textoDeArquivo(file)).then((texto) => {
      if (s.boletoToken !== token) return;
      const linha = this.linhaBoleto(texto);
      if (!linha) {
        if (s._compararLinha) { s._compararLinha = false; alert("Não encontrei a linha digitável no boleto anexado."); }
        return;
      }
      s.linhaBoleto = linha;
      s.formaManual = "";
      s.pag.forma = "Boleto";
      if (s._compararLinha) {
        s._compararLinha = false;
        const dig = (v) => String(v || "").replace(/\D/g, "");
        if (dig(s.pag.detalhe) && dig(s.pag.detalhe) !== dig(linha)) {
          alert("A linha digitável não confere com o boleto anexado.");
        }
        this.pintarConferencia();
        return;
      }
      s.pag.detalhe = linha;
      s.linhaTocada = false;
      this.render();
    }).catch((e) => console.warn("[Enviar nota] linha do boleto", e));
  },

  conferirLinhaDigitada() {
    if (!this.temBoleto()) { alert("Anexe o boleto para conferir a linha digitável."); return; }
    this.state._compararLinha = true;
    this.lerBoletoAnexo();
  },

  temBoleto() {
    return (this.state.anexos || []).some((a) => a.tipo === "boleto");
  },

  /** Boleto no envio manda a forma. Sem boleto, usa a forma cadastrada no credor. */
  sugerirForma() {
    const s = this.state;
    const pag = s.pag;
    if (this.temBoleto()) {
      s.formaManual = "";
      if (pag.forma !== "Boleto") {
        pag.detalhe = "";
        s.linhaTocada = false;
      }
      pag.forma = "Boleto";
      if (!s.linhaTocada && s.linhaBoleto) pag.detalhe = s.linhaBoleto;
      return;
    }
    if (s.formaManual) {
      pag.forma = s.formaManual;
      this.ajustarDestino();
      return;
    }
    const forma = this.formaDoCredor();
    if (pag.forma !== forma) pag.detalhe = "";
    pag.forma = forma;
    this.ajustarDestino();
  },

  /* ---------- anexos ---------- */
  adicionarArquivos(input) {
    const s = this.state;
    const files = Array.from((input && input.files) || []);
    const grandes = files.filter((f) => f.size > FilaNotasFiscais.MAX_MB * 1024 * 1024);
    if (grandes.length) alert(`Arquivo acima de ${FilaNotasFiscais.MAX_MB} MB não entra: ${grandes.map((f) => f.name).join(", ")}`);
    const novos = [];
    files.filter((f) => f.size <= FilaNotasFiscais.MAX_MB * 1024 * 1024).forEach((file) => {
      if (s.anexos.some((a) => a.file && a.file.name === file.name && a.file.size === file.size)) return;
      const temNota = s.anexos.some((a) => a.tipo === "nota");
      const ehNota = /\.(pdf|xml)$/i.test(file.name) || /^image\//.test(file.type);
      const tipo = /boleto/i.test(file.name) ? "boleto" : (!temNota && ehNota ? "nota" : "outro");
      const item = { file, nome: file.name, tipo, size: file.size, contentType: file.type };
      s.anexos.push(item);
      novos.push(item);
    });
    if (input) input.value = "";
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.classificarBoletos(novos);
    if (s.previewIdx < 0) {
      const i = s.anexos.findIndex((a) => a.tipo === "nota");
      if (i >= 0) { this.verAnexo(i); return; }
    }
    this.render();
  },

  /** Um PDF ou imagem extra, sem "boleto" no nome, vira boleto quando a linha digitável está no arquivo. */
  classificarBoletos(itens) {
    const s = this.state;
    const lista = (itens || []).filter((a) => a && a.tipo === "outro");
    if (!lista.length) return;
    const token = (s.classificarToken || 0) + 1;
    s.classificarToken = token;
    lista.forEach((a) => { a._classificar = token; });
    const app = this;
    (async () => {
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i];
        if (s.classificarToken !== token || a._classificar !== token || a.tipo !== "outro") continue;
        try {
          const file = a.file ? a.file : await FilaNotasFiscais.baixar(a);
          const texto = await app.textoDeArquivo(file);
          if (s.classificarToken !== token || a._classificar !== token || a.tipo !== "outro") continue;
          const linha = app.linhaBoleto(texto);
          if (!linha) continue;
          a.tipo = "boleto";
          s.linhaBoleto = linha;
          s.linhaTocada = false;
          s.formaManual = "";
          s.pag.forma = "Boleto";
          s.pag.detalhe = linha;
          app.render();
        } catch (e) {
          console.warn("[Enviar nota] classificar boleto", e);
        }
      }
    })();
  },

  setTipoAnexo(i, tipo) {
    const a = this.state.anexos[i];
    if (a) a.tipo = tipo;
    if (tipo === "boleto") {
      this.state.linhaTocada = false;
      this.state.formaManual = "";
    }
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
  },

  removerAnexo(i) {
    const s = this.state;
    s.anexos.splice(i, 1);
    if (s.previewIdx === i) { s.previewIdx = -1; s.preview = ""; }
    else if (s.previewIdx > i) s.previewIdx--;
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
  },

  /** Lê número, valor e boleto do arquivo da nota. Os campos não aparecem na tela. */
  agendarLeitura() {
    const s = this.state;
    const token = (s.leituraToken || 0) + 1;
    s.leituraToken = token;
    const a = s.anexos.find((x) => x.tipo === "nota");
    if (!a) {
      s.lendoNota = "";
      s.leituraErro = "";
      if (!s.anexos.some((x) => x.tipo === "boleto")) s.linhaBoleto = "";
      s.fiscal = null;
      if (!s.editandoId) {
        s.numeroNota = "";
        s.serieNota = "";
        s.valorNota = "";
      }
      return;
    }
    s.lendoNota = "Lendo o número e o valor da nota…";
    s.leituraErro = "";
    const pronto = a.file ? Promise.resolve(a.file) : FilaNotasFiscais.baixar(a);
    pronto.then((file) => this.lerNota(file, token)).catch((e) => {
      if (s.leituraToken !== token) return;
      s.lendoNota = "";
      if (!s.numeroNota) s.leituraErro = `Não consegui ler a nota: ${(e && e.message) || e}`;
      this.render();
    });
  },

  async lerNota(file, token) {
    const s = this.state;
    try {
      const buf = await file.arrayBuffer();
      if (s.leituraToken !== token) return;
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
      let nota = null;
      let texto = "";
      if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name)) {
        const xml = new TextDecoder("utf-8").decode(buf);
        nota = InserirNotaApp.lerXml(xml);
        texto = xml;
      } else if (/^%PDF/.test(inicio)) {
        const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
        if (s.leituraToken !== token) return;
        texto = itens.map((i) => i.s).join("\n");
        if (itens.length >= 20) nota = InserirNotaApp.extrair(InserirNotaApp.celulasPdf(itens));
        else {
          const canvas = await InserirNotaApp.pdfParaCanvas(buf);
          if (s.leituraToken !== token) return;
          const celulas = await this.ocr(canvas, token);
          if (s.leituraToken !== token) return;
          texto = texto || celulas.map((c) => c.s).join("\n");
          nota = InserirNotaApp.extrair(celulas);
        }
      } else if (/^image\//.test(file.type)) {
        const canvas = await InserirNotaApp.imagemParaCanvas(file);
        if (s.leituraToken !== token) return;
        const celulas = await this.ocr(canvas, token);
        if (s.leituraToken !== token) return;
        texto = celulas.map((c) => c.s).join("\n");
        nota = InserirNotaApp.extrair(celulas);
      } else {
        throw new Error("formato não reconhecido; use PDF, XML ou imagem");
      }
      if (s.leituraToken !== token) return;
      s.numeroNota = (nota && nota.numero) || "";
      s.serieNota = (nota && nota.serie) || "";
      s.valorNota = nota && nota.valor != null ? nota.valor : "";
      if (!s.anexos.some((x) => x.tipo === "boleto")) {
        s.linhaBoleto = "";
        if (!s.formaManual && s.pag.forma === "Boleto") s.pag.detalhe = "";
      }
      s.leituraErro = s.numeroNota ? "" : "Não consegui ler o número da nota no arquivo.";
      s._fonteNota = { xml: /^\s*</.test(texto) ? texto : "", texto, buf, nome: file.name || "", nota };
      s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
    } catch (e) {
      if (s.leituraToken !== token) return;
      s.linhaBoleto = "";
      if (!s.numeroNota) s.leituraErro = `Não consegui ler a nota: ${(e && e.message) || e}`;
    }
    s.lendoNota = "";
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
    if (s._fonteNota) this.analisarFiscal(token);
  },

  async cnpjEmpresa() {
    const id = this.state.empresaCc;
    if (!id) return { cnpj: "", nome: "" };
    const c = await InserirNotaApp.get(`/companies/${encodeURIComponent(id)}`).catch(() => null);
    return {
      cnpj: InserirNotaApp.digits(c && (c.cnpj || c.cpfCnpj || c.documentNumber || "")),
      nome: (c && (c.tradeName || c.name)) || this.nomeEmpresa(id)
    };
  },

  async itensDoPedido() {
    const id = this.state.pedidoApi;
    if (!id) return [];
    const res = await InserirNotaApp.get(`/purchase-orders/${id}/items?limit=200`).catch(() => null);
    return InserirNotaApp.lista(res).map((it) => {
      const qtd = Number(it.quantity) || 0;
      const unit = Number(it.netPrice) || Number(it.unitPrice) || 0;
      const valor = Number(it.totalAmount != null ? it.totalAmount : it.totalPrice) || Math.round(unit * qtd * 100) / 100;
      return {
        descricao: [it.resourceDescription, it.detailDescription].filter(Boolean).join(" ") || `Item ${it.itemNumber}`,
        qtd, valor
      };
    });
  },

  async analisarFiscal(token) {
    const s = this.state;
    const fonte = s._fonteNota;
    if (!fonte || !window.NotaFiscalCheck) return;
    s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
    this.pintarFiscal();
    try {
      const [itensPedido, empresa] = await Promise.all([this.itensDoPedido(), this.cnpjEmpresa()]);
      if (s.leituraToken !== token) return;
      s.fiscal = await NotaFiscalCheck.conferirEnvio({
        xml: fonte.xml, texto: fonte.texto, buf: fonte.buf, nome: fonte.nome, nota: fonte.nota,
        credorDoc: s.credor && s.credor.doc, empresaCnpj: empresa.cnpj, empresaNome: empresa.nome, itensPedido
      });
    } catch (e) {
      if (s.leituraToken !== token) return;
      s.fiscal = { carregando: false, nivel: "aviso", erros: [], oks: [], infos: [], itens: [], avisos: [`Não consegui concluir a análise fiscal: ${(e && e.message) || e}`] };
    }
    if (s.leituraToken === token) this.render();
  },

  pintarFiscal() {
    this.pintarConferencia();
  },

  async ocr(canvas, token) {
    const s = this.state;
    s.lendoNota = "Carregando o leitor de imagem…";
    this.pintarConferencia();
    await InserirNotaApp.carregarTesseract();
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (s.leituraToken !== token) return;
        if (m.status === "recognizing text" && m.progress != null) {
          s.lendoNota = `Lendo a nota… ${Math.round(m.progress * 100)}%`;
          this.pintarConferencia();
        }
      }
    });
    try {
      const { data } = await worker.recognize(canvas);
      const E = canvas._escala || 1;
      const celulas = [];
      (data.lines || []).forEach((l) => {
        const ws = (l.words || []).filter((w) => String(w.text || "").trim());
        if (!ws.length) return;
        const h = Math.max(...ws.map((w) => w.bbox.y1 - w.bbox.y0));
        let cur = null;
        ws.forEach((w) => {
          if (cur && w.bbox.x0 - cur.x1 * E < h * 1.1) {
            cur.s += " " + w.text;
            cur.x1 = w.bbox.x1 / E;
          } else {
            cur = { s: w.text, x0: w.bbox.x0 / E, x1: w.bbox.x1 / E, y: l.bbox.y0 / E };
            celulas.push(cur);
          }
        });
      });
      return celulas;
    } finally {
      await worker.terminate();
    }
  },

  /** Devolução por cancelamento ainda prende este pedido até o operador reenviar a nota nova e a nota com tarja. */
  devolucaoCancelamentoDoPedido() {
    const s = this.state;
    const alvos = [s.pedidoApi, s.pedidoNome, s.pedidoId].map((v) => String(v || "").replace(/\s/g, "")).filter(Boolean);
    const digs = alvos.map((v) => v.replace(/\D/g, "")).filter((v) => v.length >= 3);
    if (!alvos.length) return null;
    return (s.lista || []).find((x) => {
      if (!x || x.status !== "devolvida" || x.devolucaoTipo !== "cancelamento") return false;
      return [x.pedido, x.pedidoApi].some((v) => {
        const n = String(v || "").replace(/\s/g, "");
        if (!n) return false;
        if (alvos.includes(n)) return true;
        const d = n.replace(/\D/g, "");
        return d.length >= 3 && digs.includes(d);
      });
    }) || null;
  },

  mesmoNumero(a, b) {
    const n = (v) => String(v || "").replace(/\D/g, "").replace(/^0+/, "");
    const na = n(a);
    const nb = n(b);
    return !!na && na === nb;
  },

  docCredor(c) {
    return InserirNotaApp.digits((c && (c.doc || c.cnpj || c.cpf)) || "");
  },

  /** Mesma nota (número + fornecedor) já enviada pelo CRM, mesmo que em outro pedido. */
  duplicadaNaFila() {
    const s = this.state;
    if (!s.numeroNota) return null;
    const doc = this.docCredor(s.credor);
    const idCred = s.credor && String(s.credor.id || "");
    const serie = String(s.serieNota || "").trim().toUpperCase();
    return (s.lista || []).find((x) => {
      if (!x || x.id === s.editandoId || x.status === "cancelada" || x.status === "excluida") return false;
      if (!this.mesmoNumero(x.numeroNota, s.numeroNota)) return false;
      const serieX = String(x.serieNota || "").trim().toUpperCase();
      if (serie && serieX && serie !== serieX) return false;
      const docX = this.docCredor(x.fornecedor);
      if (doc && docX) return doc === docX;
      const idX = x.fornecedor && String(x.fornecedor.id || "");
      return !!(idCred && idX && idCred === idX);
    }) || null;
  },

  async verAnexo(i) {
    const s = this.state;
    const a = s.anexos[i];
    if (!a) return;
    s.previewIdx = i;
    s.preview = "";
    s.previewLendo = "Abrindo o anexo…";
    this.render();
    try {
      const file = a.file || await FilaNotasFiscais.baixar(a);
      const buf = await file.arrayBuffer();
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 8)));
      let canvas = null;
      if (/^%PDF/.test(inicio)) canvas = await InserirNotaApp.pdfParaCanvas(buf);
      else if (/^image\//.test(file.type)) canvas = await InserirNotaApp.imagemParaCanvas(file);
      if (s.previewIdx !== i) return;
      s.preview = canvas ? canvas.toDataURL("image/jpeg", 0.85) : "";
      s.previewLendo = canvas ? "" : "Este anexo não tem visualização (XML ou outro formato).";
    } catch (e) {
      if (s.previewIdx === i) s.previewLendo = `Não consegui abrir o anexo: ${(e && e.message) || e}`;
    }
    this.render();
  },

  setPag(campo, valor) {
    this.state.pag[campo] = String(valor == null ? "" : valor);
    if (campo === "detalhe") this.state.linhaTocada = true;
    this.pintarConferencia();
  },

  setCampo(campo, valor) {
    this.state[campo] = String(valor == null ? "" : valor);
    this.pintarConferencia();
  },

  /* ---------- conferência ---------- */
  conferir() {
    const s = this.state;
    const erros = [];
    const avisos = [];
    const oks = [];
    const p = s.pedido;
    if (!p) return { erros: [], avisos, oks };
    const status = String(p.status || "").toUpperCase();
    if (status === "CANCELED") erros.push("O pedido está cancelado.");
    if (status === "FULLY_DELIVERED") erros.push("O pedido já foi totalmente atendido: não há saldo para lançar outra nota.");
    if (p.authorized === false) avisos.push("O pedido ainda não foi autorizado no Sienge: o fiscal só consegue lançar depois da autorização.");

    const notas = s.anexos.filter((a) => a.tipo === "nota");
    if (!notas.length) erros.push("Anexe a nota fiscal (PDF, XML ou imagem) e marque o tipo \"Nota fiscal\".");
    else oks.push(`${notas.length === 1 ? "Nota fiscal anexada" : `${notas.length} arquivos de nota anexados`}${s.anexos.length > notas.length ? ` + ${s.anexos.length - notas.length} outro(s) anexo(s)` : ""}.`);
    const amarrada = this.devolucaoCancelamentoDoPedido();
    if (amarrada && amarrada.id !== s.editandoId) {
      erros.push(`Este pedido está amarrado à nota devolvida para cancelamento${amarrada.numeroNota ? " (NF " + amarrada.numeroNota + ")" : ""}. Abra Corrigir envio neste mesmo pedido e anexe a nota nova junto com a nota cancelada, com a tarja de cancelada. Sem essa nota o sistema não libera outro envio.`);
    } else if (amarrada) {
      const nova = s.anexos.some((a) => a.tipo === "nota" && a.file);
      const cancelada = s.anexos.some((a) => a.tipo === "cancelada" && (a.file || a.origemTipo === "cancelada"));
      if (!nova) erros.push("Anexe a nota nova neste mesmo pedido, no tipo Nota fiscal. A nota que já estava no envio não substitui a nota cancelada.");
      if (!cancelada) erros.push("Anexe a nota cancelada, com a tarja de cancelada, no tipo Nota cancelada. Sem ela o pedido continua amarrado e o reenvio não segue.");
      else if (nova) oks.push("Nota nova e nota cancelada com a tarja anexadas: o pedido pode ser reenviado.");
    }
    if (s.lendoNota) erros.push(s.lendoNota);
    else if (notas.length && s.leituraErro) erros.push(s.leituraErro);
    else if (notas.length && s.numeroNota) {
      const valorLido = this.num(s.valorNota);
      oks.push(`Nota ${s.numeroNota}${s.serieNota ? "/" + s.serieNota : ""} lida do arquivo${valorLido != null ? `, no valor de ${this.money(valorLido)}` : ""}.`);
    }

    const dup = this.duplicadaNaFila();
    if (dup) {
      const st = (FilaNotasFiscais.STATUS[dup.status] || {}).rot || dup.status || "enviada";
      const quando = dup.criadoEm ? new Date(dup.criadoEm).toLocaleDateString("pt-BR") : "";
      erros.push(`A NF ${s.numeroNota} deste fornecedor já está na base de notas enviadas (pedido ${dup.pedido || "—"}, ${st}${quando ? " em " + quando : ""}${dup.criadoPor ? " por " + dup.criadoPor : ""}). A mesma nota não pode ir ao fiscal de novo, mesmo em outro pedido.${dup.status === "lancada" ? " Esse registro continua no CRM. Em Minhas notas enviadas, ele aparece em “Notas já lançadas no Sienge”, mesmo com os filtros desligados. Exclua esse envio para liberar outro teste." : ""}`);
    }

    const pag = s.pag;
    const soDig = (v) => String(v || "").replace(/\D/g, "");
    const linhaBate = !!(s.linhaBoleto && soDig(pag.detalhe) === soDig(s.linhaBoleto));
    if (!pag.data) erros.push("Confirme a data de pagamento.");
    else if (pag.data < this.hojeIso()) avisos.push(`A data de pagamento (${this.dataBr(pag.data)}) já passou.`);
    if (!pag.forma) erros.push(s.pedido && !this.temBoleto() ? "Escolha a forma de pagamento. O cadastro do credor não informa uma forma padrão." : "Escolha a forma de pagamento.");
    else if (this.temBoleto()) oks.push(linhaBate ? "Boleto anexado: linha digitável conferida." : "Boleto anexado: pagamento em boleto.");
    else if (!s.formaManual && pag.forma === this.formaDoCredor()) oks.push(`Forma de pagamento do cadastro do credor: ${pag.forma}.`);
    if (pag.forma === "Boleto" && !this.temBoleto()) erros.push("A forma de pagamento é boleto e não há boleto anexado. Anexe o boleto para seguir.");
    if (this.temBoleto() && s.linhaBoleto && !s.linhaTocada && !linhaBate) {
      erros.push("A linha digitável está diferente da linha do boleto anexado. O campo não foi alterado: confira o código antes de enviar.");
    }
    const ops = this.destinos(pag.forma);
    if (ops) {
      const oque = pag.forma === "PIX" ? "chave PIX" : "conta bancária";
      if (!ops.length) {
        if (pag.forma === "PIX" && s.banco && s.banco.pixSemPermissao) erros.push("O usuário da API não tem permissão para ler as chaves PIX deste credor no Sienge.");
        else erros.push(`O credor não tem ${oque} cadastrada no Sienge. Cadastre no credor ou escolha boleto.`);
      }
      else if (!pag.detalhe) erros.push(`Escolha a ${oque} do cadastro do credor.`);
      else oks.push(`${pag.forma === "PIX" ? "Chave PIX" : "Conta"} do cadastro do credor: ${pag.detalhe}.`);
    }

    const prev = s.previsao;
    if (prev && prev.parcelas.length && pag.data && !prev.parcelas.some((x) => x.vencimento === pag.data)) {
      avisos.push(`A previsão financeira do pedido vence em ${prev.parcelas.map((x) => this.dataBr(x.vencimento)).join(", ")}; o pagamento informado é ${this.dataBr(pag.data)}.`);
    }
    const valor = this.num(s.valorNota);
    if (valor != null && prev && prev.valor != null && Math.abs(prev.valor - valor) > 0.05) {
      avisos.push(`O valor da nota (${this.money(valor)}) é diferente da previsão financeira do pedido (${this.money(prev.valor)}).`);
    }
    const fiscal = s.fiscal;
    if (fiscal && fiscal.carregando) erros.push("Ainda estou cruzando a nota com o pedido, o CNAE e o endereço da empresa.");
    else if (fiscal) {
      (fiscal.erros || []).forEach((t) => erros.push(t));
      (fiscal.avisos || []).forEach((t) => avisos.push(t));
      (fiscal.oks || []).forEach((t) => oks.push(t));
    }
    const docApr = s.credor && s.credor.doc;
    FilaNotasFiscais.avisosAprendidos(docApr).forEach((t) => avisos.push(t));
    const outras = s.abertas.filter((x) => !dup || x.id !== dup.id);
    if (outras.length) {
      const n = outras.length;
      avisos.push(`Este pedido já tem ${n} ${n === 1 ? "nota" : "notas"} na fila do fiscal (${outras.map((x) => `${x.numeroNota ? "NF " + x.numeroNota + " · " : ""}enviada por ${x.criadoPor || "?"} em ${new Date(x.criadoEm).toLocaleDateString("pt-BR")}`).join("; ")}).`);
    }
    return { erros, avisos, oks };
  },

  /* ---------- envio ---------- */
  async enviar() {
    const s = this.state;
    if (!this.podeEditar()) { alert("Sem permissão para enviar notas ao fiscal."); return; }
    if (!s.pedido) { alert("Informe o número do pedido e busque antes de enviar."); this.render(); return; }
    try {
      s.lista = await FilaNotasFiscais.listar();
      s.listaCarregada = true;
    } catch (e) {
      alert("Não consegui consultar a base de notas enviadas. O envio não foi feito.");
      return;
    }
    const c = this.conferir();
    if (c.erros.length) { this.render(); alert(c.erros.join("\n")); return; }
    const nf = s.numeroNota ? ` NF ${s.numeroNota}${s.serieNota ? "/" + s.serieNota : ""}` : "";
    const msg = `Enviar ao fiscal a nota${nf} do pedido ${s.pedidoNome} (${s.credor ? s.credor.nome : ""}), com pagamento em ${this.dataBr(s.pag.data)} por ${s.pag.forma}?`
      + (c.avisos.length ? `\n\nAtenção:\n• ${c.avisos.join("\n• ")}` : "");
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    const u = FilaNotasFiscais.usuario();
    const id = s.editandoId || FilaNotasFiscais.novoId();
    s.enviando = "Subindo os anexos…";
    this.render();
    try {
      const anexos = await FilaNotasFiscais.subirAnexos(id, s.anexos);
      s.enviando = "Enviando para a fila do fiscal…";
      this.render();
      const antigo = s.editandoId ? (s.lista.find((x) => x.id === id) || { id }) : { id };
      const dados = {
        status: "pendente",
        pedido: s.pedidoNome, pedidoApi: s.pedidoApi,
        fornecedor: s.credor,
        empresa: s.empresaCc || "", cc: s.cc ? { id: s.cc.id, nome: s.cc.nome || "" } : null,
        valorPedido: s.pedido.totalAmount != null ? Number(s.pedido.totalAmount) : null,
        previsao: s.previsao,
        numeroNota: String(s.numeroNota || "").trim(),
        serieNota: String(s.serieNota || "").trim(),
        valorNota: this.num(s.valorNota),
        pagamento: { data: s.pag.data, forma: s.pag.forma, detalhe: String(s.pag.detalhe || "").trim() },
        observacao: String(s.obs || "").trim(),
        anexos,
        motivoDevolucao: "", assumidoPor: "", assumidoPorEmail: ""
      };
      if (!s.editandoId) Object.assign(dados, { criadoEm: Date.now(), criadoPor: u.nome, criadoPorEmail: u.email, criadoPorSienge: u.sienge });
      await FilaNotasFiscais.atualizar(Object.assign(antigo, s.editandoId ? {} : { historico: [] }), dados, s.editandoId ? "reenviada" : "enviada");
      this.auditar(`Nota do pedido ${s.pedidoNome} ${s.editandoId ? "reenviada" : "enviada"} ao fiscal · pagamento ${this.dataBr(s.pag.data)} ${s.pag.forma}`, { id, pedido: s.pedidoNome, anexos: anexos.length });
      const feito = `Nota do pedido ${s.pedidoNome} ${s.editandoId ? "reenviada" : "enviada"} ao fiscal. Acompanhe em "Minhas notas enviadas".`;
      this.state = this.novoEstado();
      this.state.feito = feito;
      this.state.listaCarregada = false;
    } catch (e) {
      s.enviando = "";
      alert(`Não consegui enviar a nota ao fiscal: ${(e && e.message) || e}`);
    }
    this.render();
  },

  auditar(summary, details) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const u = FilaNotasFiscais.usuario();
    try {
      AuditService.logEvent({ module: "Fiscal", action: "Enviar nota", status: "ok", summary, user: u.nome, userEmail: u.email, details: details || {} });
    } catch (e) {}
  },

  /* ---------- minhas notas enviadas ---------- */
  async carregarLista(forcar) {
    const s = this.state;
    if (s.listaCarregando || (s.listaCarregada && !forcar)) return;
    s.listaCarregando = true;
    s.listaErro = "";
    this.render();
    try {
      s.lista = await FilaNotasFiscais.listar();
      s.listaCarregada = true;
    } catch (e) {
      s.listaErro = `Não consegui carregar os envios: ${(e && e.message) || e}`;
    }
    s.listaCarregando = false;
    this.render();
  },

  setTodos(v) {
    this.state.todos = !!v;
    this.render();
  },

  setVerLancadas(v) {
    this.state.verLancadas = !!v;
    this.render();
  },

  async cancelar(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item || item.status !== "pendente") return;
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(`Cancelar o envio da nota do pedido ${item.pedido}? Ela sai da fila do fiscal.`) : confirm("Cancelar o envio?");
    if (!ok) return;
    try {
      await FilaNotasFiscais.atualizar(item, { status: "cancelada" }, "cancelada");
      this.auditar(`Envio da nota do pedido ${item.pedido} cancelado`, { id });
    } catch (e) {
      alert(`Não consegui cancelar: ${(e && e.message) || e}`);
    }
    this.render();
  },

  async excluir(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item) return;
    const nf = item.numeroNota ? `a NF ${item.numeroNota}` : `o envio do pedido ${item.pedido}`;
    const aviso = item.status === "lancada"
      ? `Excluir ${nf} da base do CRM (pedido ${item.pedido})? Ela está lançada no Sienge. A exclusão não desfaz o lançamento lá; só tira o registro daqui, para a mesma nota poder ser enviada de novo neste teste.`
      : `Excluir o envio da nota do pedido ${item.pedido}? Ele sai da fila e não dá para desfazer.`;
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(aviso) : confirm(aviso);
    if (!ok) return;
    try {
      await FilaNotasFiscais.atualizar(item, { status: "excluida" }, "excluída", "O operador retirou o envio. O fiscal acompanha como Excluído.");
      this.state.lista = this.state.lista.filter((x) => x.id !== id);
      this.state.abertas = (this.state.abertas || []).filter((x) => x.id !== id);
      this.auditar(`Envio da nota do pedido ${item.pedido} excluído`, { id });
    } catch (e) {
      alert(`Não consegui excluir: ${(e && e.message) || e}`);
    }
    this.render();
  },

  /** Devolvida pelo fiscal: carrega no formulário para corrigir e reenviar o mesmo envio. */
  corrigir(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item) return;
    const s = this.novoEstado();
    Object.assign(s, {
      aba: "enviar", editandoId: id, pedidoId: item.pedido,
      anexos: (item.anexos || []).map((a) => Object.assign({ origemTipo: a.tipo }, a)),
      pag: Object.assign({ data: "", forma: "", detalhe: "" }, item.pagamento || {}),
      numeroNota: item.numeroNota || "",
      serieNota: item.serieNota || "",
      formaManual: (item.pagamento && item.pagamento.forma) || "",
      valorNota: item.valorNota != null ? item.valorNota : "",
      obs: item.observacao || ""
    });
    this.state = s;
    this.render();
    this.agendarLeitura();
    this.buscarPedido();
    const i = s.anexos.findIndex((a) => a.tipo === "nota");
    if (i >= 0) this.verAnexo(i);
  },

  /* ---------- tela ---------- */
  pintarConferencia() {
    const el = document.getElementById("env-conf");
    if (!el) return;
    el.innerHTML = this.conferenciaHtml();
    const btn = document.getElementById("env-enviar");
    if (btn) btn.disabled = !!this.state.enviando || !this.state.pedido || this.conferir().erros.length > 0 || !this.podeEditar();
  },

  conferenciaHtml() {
    const c = this.conferir();
    const s = this.state;
    const f = s.fiscal;
    if (!window.NotaFiscalCheck || typeof NotaFiscalCheck.blocosHtml !== "function") {
      const linha = (t, cls, ic) => `<li class="${cls}"><span>${ic}</span>${this.esc(t)}</li>`;
      return `<ul class="inf-check">${c.erros.map((t) => linha(t, "is-erro", "✗")).join("")}${c.avisos.map((t) => linha(t, "is-aviso", "!")).join("")}${c.oks.map((t) => linha(t, "is-ok", "✓")).join("")}</ul>`;
    }
    const ja = new Set();
    if (f && f.grupos) Object.keys(f.grupos).forEach((k) => (f.grupos[k] || []).forEach((it) => ja.add(it.texto)));
    const soltos = []
      .concat(c.erros.map((t) => ({ nivel: "erro", texto: t })))
      .concat(c.avisos.map((t) => ({ nivel: "aviso", texto: t })))
      .concat(c.oks.map((t) => ({ nivel: "ok", texto: t })))
      .filter((it) => !ja.has(it.texto));
    const servico = [];
    const pedido = [];
    soltos.forEach((it) => (/nota fiscal anexada|arquivos de nota|lendo o número|não consegui ler a nota|lida do arquivo/i.test(it.texto) ? servico : pedido).push(it));
    const avisoBanco = this.erroBancoVisivel();
    const emitente = avisoBanco ? `<p class="inf-erro">${this.esc(avisoBanco)}</p>` : "";
    const servicoHtml = servico.length ? `<ul class="inf-check">${servico.map((it) => `<li class="${it.nivel === "erro" ? "is-erro" : (it.nivel === "aviso" ? "is-aviso" : "is-ok")}"><span>${it.nivel === "erro" ? "✗" : (it.nivel === "aviso" ? "!" : "✓")}</span>${this.esc(it.texto)}</li>`).join("")}</ul>` : "";
    const base = f && !f.carregando ? f : { grupos: { emitente: [], tomador: [], servico: [], impostos: [], cnae: [], pedido: [] }, itens: [], prestador: "", enderecoNota: "", enderecoCartao: "" };
    const espera = f && f.carregando ? `<p class="inf-muted">Analisando itens, CNAE, retenções, alíquotas e endereço do tomador…</p>` : "";
    return espera + NotaFiscalCheck.blocosHtml(base, { emitente: emitente, servico: servicoHtml, pedido: pedido });
  },

  pedidoHtml() {
    const s = this.state;
    const p = s.pedido;
    if (!p) return s.erro ? `<p class="inf-erro">${this.esc(s.erro)}</p>` : `<p class="inf-muted">Informe o número do pedido de compra da nota.</p>`;
    const sit = { PENDING: "Pendente", PARTIALLY_DELIVERED: "Parcialmente entregue", FULLY_DELIVERED: "Totalmente atendido", CANCELED: "Cancelado" }[String(p.status || "").toUpperCase()] || p.status || "—";
    const emp = s.empresaCc ? `empresa ${this.esc(s.empresaCc)}${this.nomeEmpresa(s.empresaCc) ? " - " + this.esc(this.nomeEmpresa(s.empresaCc)) : ""}` : "empresa não identificada";
    return `<div class="inf-pedido">
      <div><span>Fornecedor</span><div><b>${this.esc(s.credor ? s.credor.nome : p.supplierId)}</b><small>${this.esc(s.credor && s.credor.doc ? InserirNotaApp.docFmt(s.credor.doc) : `código ${p.supplierId}`)}</small></div></div>
      <div><span>Centro de custo</span><div><b>${this.esc((s.cc && s.cc.id) || "—")}${s.cc && s.cc.nome ? ` - ${this.esc(s.cc.nome)}` : ""}</b><small>${emp}</small></div></div>
      <div><span>Pedido ${this.esc(s.pedidoNome)}</span><div><b>${this.dataBr(p.date)}</b>${p.paymentCondition ? `<small>${this.esc(p.paymentCondition)}</small>` : ""}</div></div>
      <div><span>Situação</span><div><b>${this.esc(sit)}</b>${p.authorized || p.authorized === false ? `<small>${p.authorized ? "autorizado" : "não autorizado"}</small>` : ""}</div></div>
      <div><span>Total do pedido</span><div><b>${p.totalAmount != null ? this.money(p.totalAmount) : "—"}</b></div></div>
    </div>
    ${InserirNotaApp.previsaoHtml(s.previsao)}`;
  },

  anexosHtml() {
    const s = this.state;
    const tipos = FilaNotasFiscais.TIPOS_ANEXO;
    const linhas = s.anexos.map((a, i) => `<li class="${s.previewIdx === i ? "is-sel" : ""}">
        <i data-lucide="${FilaNotasFiscais.iconeAnexo(a.tipo)}"></i>
        <button type="button" class="env-anexo-nome" onclick="EnviarNotaApp.verAnexo(${i})" title="Ver ao lado">${this.esc(a.nome)}</button>
        <small>${a.size ? `${(a.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : ""}${a.file ? "" : " · já enviado"}</small>
        <select onchange="EnviarNotaApp.setTipoAnexo(${i}, this.value)">${Object.keys(tipos).map((k) => `<option value="${k}" ${a.tipo === k ? "selected" : ""}>${tipos[k]}</option>`).join("")}</select>
        <button type="button" class="env-x" onclick="EnviarNotaApp.removerAnexo(${i})" title="Remover"><i data-lucide="x"></i></button>
      </li>`).join("");
    return `<label class="inf-file"><i data-lucide="paperclip"></i><span>Adicionar anexos (nota fiscal, boleto e outros) · PDF, XML ou imagem</span>
        <input type="file" multiple accept=".pdf,.xml,image/*" onchange="EnviarNotaApp.adicionarArquivos(this)"></label>
      ${linhas ? `<ul class="env-anexos">${linhas}</ul>` : ""}`;
  },

  pagamentoHtml() {
    const s = this.state;
    const pag = s.pag;
    const prev = s.previsao;
    const sug = prev && prev.parcelas.length ? `Previsão financeira do pedido: ${prev.parcelas.map((x) => `${this.dataBr(x.vencimento)} · ${this.money(x.valor)}`).join(" | ")}` : "";
    const opts = this.opcoesPagamento();
    const idx = opts.findIndex((o) => o.forma === pag.forma && (o.forma === "Boleto" || (o.detalhe || "") === (pag.detalhe || "")));
    let destino = "";
    if (pag.forma === "Boleto") {
      destino = `<div class="inf-span4"><label>Linha digitável</label><input value="${this.esc(pag.detalhe)}" placeholder="Preenchida automaticamente ao anexar o boleto" oninput="EnviarNotaApp.setPag('detalhe', this.value)" onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();EnviarNotaApp.conferirLinhaDigitada()}"></div>`;
    }
    const avisoBanco = this.erroBancoVisivel();
    return `<div class="inf-form">
        <div class="inf-span2 env-pag-campo"><label>Data de pagamento</label><input type="date" value="${this.esc(pag.data)}" onchange="EnviarNotaApp.setPag('data', this.value)"></div>
        <div class="inf-span2 env-pag-campo"><label>Forma de pagamento</label><select onchange="EnviarNotaApp.escolherPagamento(this.value)"><option value="">Escolha…</option>${opts.map((o, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>${this.esc(o.rotulo)}</option>`).join("")}</select></div>
        ${destino}
        <div class="inf-span4"><label>Observação para o fiscal</label><input value="${this.esc(s.obs)}" oninput="EnviarNotaApp.setCampo('obs', this.value)"></div>
      </div>
      ${this.fichaDestino()}
      ${avisoBanco ? `<p class="inf-erro">${this.esc(avisoBanco)}</p>` : ""}
      ${sug ? `<p class="inf-muted">${this.esc(sug)}</p>` : ""}`;
  },

  enviarHtml() {
    const s = this.state;
    const pode = this.podeEditar();
    const bloqueado = !!s.enviando || !s.pedido || this.conferir().erros.length > 0 || !pode;
    const prevAnexo = s.anexos[s.previewIdx];
    return `<div class="inf-wrap">
        <div>
          ${s.feito ? `<div class="inf-resultado is-ok"><b>${this.esc(s.feito)}</b></div>` : ""}
          ${this.devolvidasHtml()}
          ${this.orientacaoDevolucaoHtml()}
          <div class="inf-card">
            <h3><i data-lucide="clipboard-list"></i> Pedido de compra</h3>
            <div class="inf-busca">
              <input id="env-pedido" placeholder="Nº do pedido" value="${this.esc(s.pedidoId)}" onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();EnviarNotaApp.buscarPedido()}">
              <button type="button" class="btn btn-primary inf-btn-sm" style="height:38px;" onclick="EnviarNotaApp.buscarPedido()" ${s.carregando ? "disabled" : ""}><i data-lucide="search"></i> Buscar pedido</button>
              ${s.carregando ? `<span class="inf-muted"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> ${this.esc(s.carregando)}</span>` : ""}
            </div>
            ${this.pedidoHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="paperclip"></i> Anexos</h3>
            ${this.anexosHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="calendar-check"></i> Pagamento</h3>
            ${this.pagamentoHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="list-checks"></i> Conferência</h3>
            <div id="env-conf">${this.conferenciaHtml()}</div>
            <div class="inf-acoes">
              <button type="button" class="btn btn-outline" onclick="EnviarNotaApp.limpar()" ${s.enviando ? "disabled" : ""}><i data-lucide="rotate-ccw"></i> ${s.editandoId ? "Desistir da correção" : "Limpar"}</button>
              <button type="button" id="env-enviar" class="btn btn-primary" onclick="EnviarNotaApp.enviar()" ${bloqueado ? "disabled" : ""}
                title="${pode ? "" : "Sem permissão de edição em Fiscal › Enviar nota"}">
                ${s.enviando ? `<span class="btn-spin"></span> ${this.esc(s.enviando)}` : `<i data-lucide="send"></i> ${s.editandoId ? "Reenviar ao fiscal" : "Enviar ao fiscal"}`}</button>
            </div>
          </div>
        </div>
        <div class="inf-preview">
          <div class="inf-card">
            <h3><i data-lucide="image"></i> ${prevAnexo ? this.esc(prevAnexo.nome) : "Anexo"}</h3>
            ${s.previewLendo ? `<p class="inf-muted">${s.previewLendo.startsWith("Abrindo") ? `<span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> ` : ""}${this.esc(s.previewLendo)}</p>` : ""}
            ${s.preview ? `<div class="env-nota-scroll"><img src="${s.preview}" alt="Anexo" draggable="false"></div>`
              : (s.previewLendo ? "" : `<p class="inf-muted">Clique no nome de um anexo para ver aqui.</p>`)}
          </div>
        </div>
      </div>`;
  },

  orientacaoDevolucaoHtml() {
    const s = this.state;
    if (!s.editandoId) return "";
    const item = (s.lista || []).find((x) => x.id === s.editandoId);
    const esc = (v) => this.esc(v);
    if (!item) return `<div class="inf-resultado is-erro"><b>Corrigindo envio devolvido pelo fiscal</b><p>Ajuste o que foi pedido e clique em <b>Reenviar ao fiscal</b>.</p></div>`;
    if (item.devolucaoTipo === "cancelamento") {
      const motivos = (item.motivosCancelamento || []).map((m) => `<li>${esc(m)}</li>`).join("");
      const doc = (item.anexos || []).find((a) => a.tipo === "carta" && a.url);
      return `<div class="inf-resultado is-erro"><b>O fiscal pediu o cancelamento desta nota</b>
        ${motivos ? `<ul>${motivos}</ul>` : `<p>${esc(item.motivoDevolucao || "")}</p>`}
        ${doc ? `<p><a href="${esc(doc.url)}" target="_blank" rel="noopener">Abrir o documento da devolução</a></p>` : ""}
        <p>Use este mesmo pedido. Anexe a <b>nota nova</b> (tipo Nota fiscal) e a <b>nota cancelada com a tarja de cancelada</b> (tipo Nota cancelada). Sem a nota cancelada o reenvio não segue: o pedido continua amarrado a esta devolução.</p></div>`;
    }
    if (item.devolucaoTipo === "carta") {
      const linhas = (item.cartaLinhas || []).filter((l) => l && (l.informado || l.deveria)).map((l) => `<li><b>${esc(l.campo || "Campo")}:</b> informado “${esc(l.informado || "—")}” · deveria ser “${esc(l.deveria || "—")}”</li>`).join("");
      const doc = (item.anexos || []).find((a) => a.tipo === "carta" && a.url);
      return `<div class="inf-resultado is-erro"><b>O fiscal pediu carta de correção</b>
        ${linhas ? `<ul>${linhas}</ul>` : ""}
        ${doc ? `<p><a href="${esc(doc.url)}" target="_blank" rel="noopener">Abrir o documento: o que foi informado e o que deveria ser</a></p>` : ""}
        <p>Emita a carta com esses dados, anexe e reenvie neste mesmo pedido.</p></div>`;
    }
    return `<div class="inf-resultado is-erro"><b>Corrigindo envio devolvido pelo fiscal</b><p>${esc(item.motivoDevolucao || "Ajuste o que foi pedido e clique em Reenviar ao fiscal.")}</p></div>`;
  },

  devolvidasHtml() {
    const s = this.state;
    if (s.editandoId) return "";
    const u = FilaNotasFiscais.usuario();
    const dev = s.lista.filter((x) => x.status === "devolvida" && x.criadoPorEmail === u.email);
    if (!dev.length) return "";
    return `<div class="inf-resultado is-erro"><b>${dev.length === 1 ? "1 nota devolvida" : `${dev.length} notas devolvidas`} pelo fiscal para corrigir</b>
      <ul>${dev.slice(0, 5).map((x) => `<li>Pedido ${this.esc(x.pedido)}: ${this.esc(x.devolucaoTipo === "cancelamento" ? "cancelar a nota e reenviar a nota nova com a nota cancelada (tarja)" : (x.devolucaoTipo === "carta" ? "carta de correção — o documento mostra o que foi informado e o que deveria ser" : (x.motivoDevolucao || "sem motivo")))}</li>`).join("")}</ul>
      <p><a href="javascript:void(0)" onclick="EnviarNotaApp.setAba('minhas')">Ver em Minhas notas enviadas</a></p></div>`;
  },

  limpar() {
    const aba = this.state.aba;
    this.state = this.novoEstado();
    this.state.aba = aba;
    this.render();
  },

  minhasHtml() {
    const s = this.state;
    const u = FilaNotasFiscais.usuario();
    const minhas = s.todos ? s.lista : s.lista.filter((x) => (u.email && x.criadoPorEmail === u.email) || (!u.email && x.criadoPor === u.nome));
    const visiveis = minhas.filter((x) => x.status !== "excluida");
    const lista = s.verLancadas ? visiveis : visiveis.filter((x) => x.status !== "lancada");
    const quem = (nome, email, gravado) => FilaNotasFiscais.usuarioSienge(nome, email, gravado);
    const esc = (v) => this.esc(v);
    const linha = (x) => `<tr class="${x.status === "devolvida" ? "fnf-devolvida" : ""}">
              <td>${new Date(x.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}<small>${esc(quem(x.criadoPor, x.criadoPorEmail, x.criadoPorSienge))}</small></td>
              <td><b>${esc(x.pedido)}</b>${x.numeroNota ? `<small>NF ${esc(x.numeroNota)}</small>` : ""}</td>
              <td>${esc(x.fornecedor ? x.fornecedor.nome : "")}${x.valorNota != null ? `<small>${this.money(x.valorNota)}</small>` : ""}</td>
              <td>${esc(FilaNotasFiscais.pagamentoTxt(x, (d) => this.dataBr(d)))}${x.pagamento && x.pagamento.detalhe ? `<small>${esc(x.pagamento.detalhe)}</small>` : ""}</td>
              <td>${FilaNotasFiscais.statusHtml(Object.assign({}, x, { assumidoPor: quem(x.assumidoPor, x.assumidoPorEmail, x.assumidoPorSienge) }), esc)}${FilaNotasFiscais.motivoHtml(x, esc)}</td>
              <td class="fnf-acoes">
                ${FilaNotasFiscais.anexosHtml(x, esc)}
                ${(x.status === "pendente" || x.status === "devolvida") && this.podeEditar() ? `<button type="button" class="tvig-ico" title="Editar" onclick="EnviarNotaApp.corrigir('${esc(x.id)}')"><i data-lucide="pencil"></i></button>` : ""}
                ${this.podeEditar() ? `<button type="button" class="tvig-ico is-danger" title="Excluir" onclick="EnviarNotaApp.excluir('${esc(x.id)}')"><i data-lucide="trash-2"></i></button>` : ""}
              </td>
            </tr>`;
    const tabela = (itens) => `<table class="fnf-tab"><thead><tr><th>Enviada em</th><th>Pedido</th><th>Fornecedor</th><th>Pagamento</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${itens.map(linha).join("")}</tbody></table>`;
    const ocultas = s.lista.filter((x) => x.status === "lancada" && !lista.some((y) => y.id === x.id)).slice(0, 30);
    const blocoOcultas = ocultas.length ? `<div class="env-lancadas">
          <h4>Notas já lançadas no Sienge</h4>
          <p>Estas notas ficam de fora da lista com os filtros desligados, inclusive quando o envio foi de outro operador. Exclua o registro para enviar a mesma nota de novo neste teste. A exclusão não desfaz o lançamento no Sienge.</p>
          ${tabela(ocultas)}
        </div>` : "";
    const corpo = s.listaCarregando ? `<p class="fnf-vazio"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Carregando…</p>`
      : (s.listaErro ? `<p class="inf-erro">${esc(s.listaErro)}</p>`
        : `${!lista.length ? `<p class="fnf-vazio">Nenhuma nota enviada${s.todos ? "" : " por você"}.</p>` : tabela(lista)}${blocoOcultas}`);
    return `<div class="inf-card" style="margin:16px 20px;">
        <div class="fnf-barra">
          <label class="inf-chk"><input type="checkbox" ${s.todos ? "checked" : ""} onchange="EnviarNotaApp.setTodos(this.checked)"> Mostrar envios de todos os operadores</label>
          <label class="moura-switch" title="Desligado, as notas que o fiscal já lançou no Sienge ficam de fora. Ligue para vê-las de novo.">
            <input type="checkbox" ${s.verLancadas ? "checked" : ""} onchange="EnviarNotaApp.setVerLancadas(this.checked)">
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">Mostrar notas já lançadas no Sienge</span>
          </label>
          <button type="button" class="btn btn-outline inf-btn-sm" onclick="EnviarNotaApp.carregarLista(true)" ${s.listaCarregando ? "disabled" : ""}><i data-lucide="refresh-cw"></i> Atualizar</button>
        </div>
        ${corpo}
      </div>`;
  },

  abasHtml() {
    const s = this.state;
    const u = FilaNotasFiscais.usuario();
    const devolvidas = s.lista.filter((x) => x.status === "devolvida" && x.criadoPorEmail === u.email).length;
    const tabs = [
      { id: "enviar", label: s.editandoId ? "Corrigir envio" : "Enviar nota", icon: "send" },
      { id: "minhas", label: "Minhas notas enviadas", icon: "list-checks", n: devolvidas, titulo: devolvidas ? `${devolvidas} nota(s) devolvida(s) pelo fiscal para corrigir` : "" }
    ];
    return tabs.map((t) => `<button type="button" role="tab" aria-selected="${s.aba === t.id}" class="ml-tab ${s.aba === t.id ? "is-active" : ""}" ${t.titulo ? `title="${this.esc(t.titulo)}"` : ""} onclick="EnviarNotaApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}${t.n ? ` <span class="ml-tab-count env-tab-alerta">${t.n}</span>` : ""}</button>`).join("");
  },

  pintarAbas() {
    const el = document.getElementById("env-tabs");
    if (!el) return;
    el.innerHTML = this.abasHtml();
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("enviar-nota-root");
    if (!root) return;
    const s = this.state || (this.state = this.novoEstado());
    root.innerHTML = `
      <style>
        ${InserirNotaApp.css()}
        ${FilaNotasFiscais.css()}
        .env-tabs { margin: 16px 20px 0; }
        .env-anexos { list-style: none; margin: 10px 0 0; padding: 0; }
        .env-anexos li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 6px; font-size: 0.84rem; }
        .env-anexos li.is-sel { border-color: #105436; background: #f0fdf4; }
        .env-anexos li > i { width: 16px; height: 16px; color: #105436; flex: 0 0 16px; }
        .env-anexos small { color: #64748b; white-space: nowrap; }
        .env-anexos select { height: 30px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 6px; font-size: 0.8rem; margin-left: auto; background: #fff; }
        .env-anexo-nome { background: none; border: 0; padding: 0; color: #0f172a; font: inherit; font-weight: 600; cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .env-anexo-nome:hover { color: #105436; text-decoration: underline; }
        .env-x { background: none; border: 0; cursor: pointer; color: #94a3b8; display: inline-flex; padding: 2px; }
        .env-x:hover { color: #b91c1c; }
        .env-x i { width: 16px; height: 16px; }
        .ml-tab .env-tab-alerta, .ml-tab.is-active .env-tab-alerta { background: #fee2e2; color: #b91c1c; }
        .env-sem-cad { color: #b91c1c !important; background: #fef2f2 !important; }
        .env-blocos { display: flex; flex-direction: column; gap: 10px; }
        .env-bloco { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; background: #f8fafc; }
        .env-bloco h4 { margin: 0 0 6px; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: #105436; }
        .env-banco { margin-top: 12px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
        .env-banco > p { margin: 0 0 8px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #105436; }
        .env-banco-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 16px; }
        .env-banco-grade span { display: block; font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .env-banco-grade b { display: block; margin-top: 2px; font-size: 0.88rem; color: #0f172a; font-weight: 700; }
        .env-voltar .btn { height: 34px; display: inline-flex; align-items: center; gap: 6px; }
        .env-pag-campo input, .env-pag-campo select { height: 42px; font-size: 0.95rem; }
        .env-nota-scroll { max-height: min(78vh, 920px); overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
        .env-nota-scroll img { width: 100%; height: auto; display: block; border: 0; border-radius: 0; }
        .env-lancadas { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
        .env-lancadas h4 { margin: 0 0 4px; font-size: 0.84rem; color: #105436; }
        .env-lancadas > p { margin: 0 0 8px; font-size: 0.8rem; color: #64748b; }
      </style>
      ${window._voltarBudget ? `<div class="env-voltar"><button type="button" class="btn btn-outline" onclick="EnviarNotaApp.voltarBudget()"><i data-lucide="arrow-left"></i> Voltar para o Budget</button></div>` : ""}
      <div class="ml-tabs env-tabs" id="env-tabs" role="tablist">${this.abasHtml()}</div>
      ${s.aba === "minhas" ? this.minhasHtml() : this.enviarHtml()}`;
    if (window.lucide) lucide.createIcons();
  }
};
