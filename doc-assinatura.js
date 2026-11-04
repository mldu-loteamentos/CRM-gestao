/* Log dos documentos do Relacionamento que precisam de assinatura. */
const DocAssinaturaApp = {
  COL: "relacionamento_docs_assinatura",
  LS: "crm_docs_assinatura_v1",
  TIPOS: [
    { id: "distrato", label: "Distrato" },
    { id: "cessao", label: "Cessão de direitos" },
    { id: "aditamento", label: "Aditamento" },
    { id: "vencimento", label: "Alteração de vencimento" },
    { id: "terceiros", label: "Autorização de terceiros" }
  ],
  itens: [],
  vista: "todos",
  tipo: "",
  sortKey: "quando",
  sortDir: "desc",
  carregando: false,
  aviso: "",
  mostrarFinalizados: false,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  tipoLabel(id) {
    const t = this.TIPOS.find((x) => x.id === id);
    return t ? t.label : String(id || "Documento");
  },

  eu() {
    const u = (typeof window.crmUsuarioAcesso === "function" && window.crmUsuarioAcesso()) || {};
    const nome = String(u.name || u.nome || u.email || "Usuário").replace(/ no usuário .+$/i, "").trim();
    return {
      userId: String(u.id || u.uid || u.email || nome || ""),
      userName: nome || "Usuário",
      userEmail: String(u.email || "").trim().toLowerCase()
    };
  },

  mesmoUsuario(row) {
    const eu = this.eu();
    if (eu.userEmail && row.userEmail && eu.userEmail === String(row.userEmail).toLowerCase()) return true;
    if (eu.userId && row.userId && String(eu.userId) === String(row.userId)) return true;
    return false;
  },

  lerLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.LS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  },

  gravarLocal(lista) {
    try { localStorage.setItem(this.LS, JSON.stringify(lista.slice(0, 400))); } catch (e) {}
  },

  unir(nuvem, local) {
    const naNuvem = new Set((nuvem || []).map((row) => String(row && row.id || "")).filter(Boolean));
    const map = new Map();
    (local || []).forEach((row) => {
      if (!row) return;
      const id = String(row.id || "");
      if (!id) return;
      if (id.indexOf("local-") !== 0 && !naNuvem.has(id)) return;
      map.set(id, row);
    });
    (nuvem || []).forEach((row) => {
      if (!row) return;
      const id = String(row.id || "");
      if (!id) return;
      map.set(id, row);
    });
    return [...map.values()];
  },

  async registrar(dados) {
    const tipo = String((dados && dados.tipo) || "");
    if (!this.TIPOS.some((t) => t.id === tipo)) return;
    const eu = this.eu();
    const row = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      tipo,
      tipoLabel: this.tipoLabel(tipo),
      cliente: String((dados && dados.cliente) || "").trim() || "—",
      titulo: String((dados && dados.titulo) || "").trim() || "—",
      unidade: String((dados && dados.unidade) || "").trim() || "—",
      arquivo: String((dados && dados.arquivo) || "").trim(),
      centroId: String((dados && dados.centroId) || "").replace(/\D/g, ""),
      centroNome: String((dados && dados.centroNome) || "").trim(),
      titularId: String((dados && dados.titularId) || "").replace(/\D/g, ""),
      titularNome: String((dados && dados.titularNome) || "").trim(),
      cedenteNome: String((dados && (dados.cedenteNome || dados.titularNome)) || "").trim(),
      cessionario: String((dados && dados.cessionario) || "").trim(),
      plano: String((dados && dados.plano) || ""),
      pdfUrl: "",
      userId: eu.userId,
      userName: eu.userName,
      userEmail: eu.userEmail,
      createdAt: new Date().toISOString(),
      status: "aguardando"
    };
    const local = this.lerLocal();
    local.unshift(row);
    this.gravarLocal(local);
    if (this.itens.length) {
      this.itens.unshift(row);
      if (document.getElementById("tab-relacionamento_assinaturas") && document.getElementById("tab-relacionamento_assinaturas").style.display !== "none") {
        this.pintar();
      }
    }
    try {
      if (!window.firebaseDb || !window.firebaseCollections || !window.firebaseCollections.addDoc) return;
      const { collection, addDoc } = window.firebaseCollections;
      const ref = await addDoc(collection(window.firebaseDb, this.COL), {
        tipo: row.tipo,
        tipoLabel: row.tipoLabel,
        cliente: row.cliente,
        titulo: row.titulo,
        unidade: row.unidade,
        arquivo: row.arquivo,
        centroId: row.centroId,
        centroNome: row.centroNome,
        titularId: row.titularId,
        titularNome: row.titularNome,
        cedenteNome: row.cedenteNome,
        cessionario: row.cessionario,
        plano: row.plano,
        pdfUrl: "",
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        createdAt: row.createdAt,
        status: row.status
      });
      row.id = ref.id;
      const atual = this.lerLocal().map((x) => (x.createdAt === row.createdAt && x.userId === row.userId && x.tipo === row.tipo ? row : x));
      this.gravarLocal(atual);
      await this.guardarPdf(row, dados && dados.bytes);
    } catch (e) {
      console.error("[Assinatura] registro", e);
    }
  },

  async guardarPdf(row, bytes) {
    if (!row || !bytes) return;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!window.firebaseStorage || !fx || !fx.ref || !fx.uploadBytes || !fx.getDownloadURL) return;
    try {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const blob = new Blob([u8], { type: "application/pdf" });
      const path = "assinaturas/" + String(row.id).replace(/[^\w\-]+/g, "_") + ".pdf";
      const storageRef = fx.ref(window.firebaseStorage, path);
      await fx.uploadBytes(storageRef, blob, { contentType: "application/pdf" });
      row.pdfUrl = await fx.getDownloadURL(storageRef);
      const atual = this.lerLocal().map((x) => (String(x.id) === String(row.id) ? row : x));
      this.gravarLocal(atual);
      const item = this.itens.find((x) => String(x.id) === String(row.id));
      if (item) item.pdfUrl = row.pdfUrl;
      if (db && fx.doc && fx.updateDoc && !String(row.id).startsWith("local-")) {
        await fx.updateDoc(fx.doc(db, this.COL, row.id), { pdfUrl: row.pdfUrl });
      }
      if (document.getElementById("docs-ass-body")) this.pintar();
    } catch (e) {
      console.error("[Assinatura] anexo", e);
    }
  },

  centroDe(row) {
    const salvo = String((row && row.centroId) || "").replace(/\D/g, "");
    if (salvo) return salvo;
    const u = String((row && row.unidade) || "");
    const direto = u.match(/^(\d{4,6})\b/);
    if (direto) return direto[1];
    const unidade = u.match(/U-(\d{4,6})/i);
    if (unidade) return unidade[1];
    return "";
  },

  nomeCentro(id) {
    const salvo = (this.itens || []).find((r) => this.centroDe(r) === String(id) && r.centroNome);
    if (salvo && salvo.centroNome) return String(salvo.centroNome);
    const lista = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    const cc = lista.find((c) => String(c.id) === String(id));
    return cc && cc.name ? String(cc.name).toUpperCase() : "";
  },

  consultar(id) {
    const chave = decodeURIComponent(String(id || ""));
    const row = (this.itens || []).find((r) => String(r.id) === chave);
    if (row && row.pdfUrl) {
      window.open(row.pdfUrl, "_blank", "noopener");
      return;
    }
    alert("Este PDF não ficou salvo para consulta. Ele foi gerado só no computador de quem criou. Os próximos documentos ficam disponíveis neste botão.");
  },

  async remover(id) {
    const chave = decodeURIComponent(String(id || ""));
    const row = (this.itens || []).find((r) => String(r.id) === chave);
    if (!row) return;
    const msg = "Remover " + this.tipoLabel(row.tipo) + " de " + (row.cliente || "este cliente") + " da lista?";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    this.itens = this.itens.filter((r) => String(r.id) !== chave);
    this.gravarLocal(this.lerLocal().filter((r) => String(r.id) !== chave));
    this.pintar();
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || chave.indexOf("local-") === 0) return;
    try {
      if (fx.deleteDoc && fx.doc) await fx.deleteDoc(fx.doc(db, this.COL, chave));
    } catch (e) {
      console.error("[Assinatura] excluir", e);
    }
    try {
      if (fx.deleteObject && fx.ref && window.firebaseStorage) {
        const path = "assinaturas/" + chave.replace(/[^\w\-]+/g, "_") + ".pdf";
        await fx.deleteObject(fx.ref(window.firebaseStorage, path));
      }
    } catch (e) {}
  },

  async carregar() {
    this.carregando = true;
    this.aviso = "";
    this.pintar();
    let nuvem = [];
    try {
      if (window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDocs) {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, this.COL));
        snap.forEach((d) => nuvem.push(Object.assign({ id: d.id }, d.data() || {})));
      } else {
        this.aviso = "A lista compartilhada ainda não respondeu. Os documentos desta máquina continuam visíveis.";
      }
    } catch (e) {
      console.error("[Assinatura] leitura", e);
      this.aviso = "Não consegui ler a lista compartilhada. Os documentos desta máquina continuam visíveis.";
    }
    this.itens = this.unir(nuvem, this.lerLocal());
    if (nuvem.length || !this.aviso) this.gravarLocal(this.itens);
    this.carregando = false;
    this.pintar();
    this.reconciliarDistratos();
  },

  abrir() {
    const root = document.getElementById("relacionamento-assinaturas-root");
    if (!root) return;
    if (!root.dataset.pronto) {
      root.dataset.pronto = "1";
      root.innerHTML = `<div id="docs-ass-body"></div>`;
    }
    this.carregar();
  },

  setVista(id) {
    this.vista = id === "meus" ? "meus" : "todos";
    this.pintar();
  },

  setTipo(id) {
    this.tipo = String(id || "");
    this.pintar();
  },

  setFinalizados(on) {
    this.mostrarFinalizados = !!on;
    this.pintar();
  },

  toggleSort(key) {
    if (this.sortKey === key) this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    else {
      this.sortKey = key;
      this.sortDir = key === "quando" ? "desc" : "asc";
    }
    this.pintar();
  },

  visiveis() {
    return this.itens.filter((row) => {
      if (row && row.status === "lancado" && !this.mostrarFinalizados) return false;
      if (this.tipo && row.tipo !== this.tipo) return false;
      if (this.vista === "meus" && !this.mesmoUsuario(row)) return false;
      return true;
    });
  },

  rotuloUnidade(row) {
    const u = String((row && row.unidade) || "").trim();
    if (!u || u === "—") return "—";
    return u.replace(/^U-/i, "");
  },

  nomeUnidade(row) {
    const u = String((row && row.unidade) || "").trim();
    const cc = this.centroDe(row);
    if (/^U-\d+/i.test(u)) {
      const rest = u.replace(/^U-/i, "");
      if (cc && rest.indexOf(cc + "-") === 0) return rest.slice(cc.length + 1).replace(/-/g, " ");
      const partes = rest.split("-");
      return partes.slice(1).join("-").replace(/-/g, " ") || rest;
    }
    if (u.indexOf(" - ") >= 0) return u.split(" - ").slice(1).join(" - ").trim();
    return u;
  },

  normUn(v) {
    return String(v || "").replace(/[\s-]+/g, "").toUpperCase();
  },

  async temDistratoGravado(row) {
    if (!row || row.tipo !== "distrato") return false;
    const centro = this.centroDe(row);
    const un = this.normUn(this.nomeUnidade(row));
    const titulo = String(row.titulo || "").replace(/\D/g, "");
    if (centro && typeof window.anexosLoadMapaEnvios === "function") {
      this._mapas = this._mapas || {};
      if (!this._mapas[centro]) this._mapas[centro] = await window.anexosLoadMapaEnvios(centro);
      const mapa = this._mapas[centro] || {};
      const noIntegra = Object.keys(mapa).some((k) => {
        const rec = mapa[k];
        if (!rec || String(rec.tag || k.split("_").pop() || "").toUpperCase() !== "DISTRATO") return false;
        const nome = this.normUn(rec.unitName || rec.unidade || "");
        const ids = [rec.contractId, rec.contractNumber, rec.receivableBillId, rec.titulo].map((v) => String(v || "").replace(/\D/g, ""));
        if (titulo && ids.indexOf(titulo) >= 0) return true;
        return !!(un && nome && (nome === un || nome.indexOf(un) >= 0 || un.indexOf(nome) >= 0));
      });
      if (noIntegra) return true;
    }
    if (!centro || !un || typeof window.anexosFindSiengeUnitId !== "function" || typeof window.siengeFetchWithRetry !== "function") return false;
    const cacheKey = centro + "|" + un;
    this._siengeDistrato = this._siengeDistrato || {};
    if (Object.prototype.hasOwnProperty.call(this._siengeDistrato, cacheKey)) return this._siengeDistrato[cacheKey];
    let achou = false;
    try {
      const unitId = await window.anexosFindSiengeUnitId(null, centro, this.nomeUnidade(row));
      if (!unitId) return false;
      const res = await window.siengeFetchWithRetry("/units/" + encodeURIComponent(unitId) + "/attachments?limit=200&offset=0");
      const rows = (res && (res.results || res.data)) || (Array.isArray(res) ? res : []);
      achou = (Array.isArray(rows) ? rows : []).some((a) => /DISTRATO/i.test(String((a && (a.description || a.name || a.fileName)) || "")));
      this._siengeDistrato[cacheKey] = achou;
    } catch (e) {}
    return achou;
  },

  async tituloBaixadoNoSienge(row) {
    if (!row || row.tipo !== "distrato") return false;
    const billId = String(row.titulo || "").replace(/\D/g, "");
    if (!billId || typeof window.siengeFetchWithRetry !== "function") return false;
    this._baixaDistrato = this._baixaDistrato || {};
    if (Object.prototype.hasOwnProperty.call(this._baixaDistrato, billId)) return this._baixaDistrato[billId];
    let achou = false;
    try {
      let bill = null;
      try {
        bill = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId), 1);
      } catch (e) {
        const status = Number(e && e.status) || 0;
        const msg = String((e && e.message) || e || "");
        if (status === 404 || /\b404\b/.test(msg)) {
          this._baixaDistrato[billId] = false;
          return false;
        }
        throw e;
      }
      if (bill && typeof bill === "object") {
        const sit = String(bill.status || bill.situation || "").toUpperCase();
        const cancel = bill.cancellationDate || bill.revokedDate || bill.revokedBillReceivableDate || bill.cancelDate;
        if ((bill.active === false && !bill.payOffDate && !bill.payoffDate) || sit === "CANCELED" || sit === "DISTRATO" || cancel) achou = true;
        if (!achou) {
          const res = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200", 1);
          const inst = (res && res.results) || (Array.isArray(res) ? res : []);
          let aberto = 0;
          let baixa = false;
          inst.forEach((p) => {
            aberto += Number(p && (p.currentBalance != null ? p.currentBalance : p.balanceDue)) || 0;
            ((p && p.receipts) || []).forEach((rc) => {
              const off = typeof window.isWriteOffReceipt === "function"
                ? window.isWriteOffReceipt(rc)
                : /distrat|cancel/.test(String((rc && (rc.type || rc.receiptType || "")) || "").toLowerCase());
              if (off) baixa = true;
            });
          });
          if (baixa && aberto <= 0.009) achou = true;
        }
        if (!achou && bill.customerId) {
          const res = await window.siengeFetchWithRetry("/sales-contracts?customerId=" + encodeURIComponent(bill.customerId) + "&situation=3&limit=200", 1);
          const lista = (res && res.results) || [];
          achou = lista.some((c) => String(c.receivableBillId || "").replace(/\D/g, "") === billId);
        }
      }
    } catch (e) {}
    this._baixaDistrato[billId] = achou;
    return achou;
  },

  normNome(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  mesmoNome(a, b) {
    const x = this.normNome(a);
    const y = this.normNome(b);
    if (!x || !y || x === "—" || y === "—") return false;
    if (x === y) return true;
    const curto = x.length <= y.length ? x : y;
    const longo = x.length <= y.length ? y : x;
    return curto.length >= 8 && longo.indexOf(curto) === 0;
  },

  /** Nome do cedente gravado na geração: o titular do título naquele instante. */
  nomeCedente(row) {
    return String((row && (row.cedenteNome || row.titularNome)) || "").trim();
  },

  /** A cessão foi feita quando o titular do título deixou de ser o cedente gravado. */
  cessaoMudou(row, atual) {
    if (!row || !atual) return false;
    const salvo = String(row.titularId || "").replace(/\D/g, "");
    const agora = String(atual.id || "").replace(/\D/g, "");
    if (salvo && agora) return salvo !== agora;
    const base = this.nomeCedente(row) || String(row.cliente || "").trim();
    if (!base || !atual.nome) return false;
    return !this.mesmoNome(base, atual.nome);
  },

  planoDeParcelas(lista) {
    return (lista || []).map((p) => {
      if (!p) return "";
      const id = String(p.installmentId != null ? p.installmentId : (p.installmentNumber != null ? p.installmentNumber : ""));
      const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
      const valor = Number(p.originalValue != null ? p.originalValue : (p.originalAmount != null ? p.originalAmount : (p.amount || 0))) || 0;
      return [id, due, valor.toFixed(2)].join(":");
    }).filter(Boolean).sort().join("|");
  },

  datasRemade(lista) {
    const keys = ["remadeDate", "calculationDate", "date", "generatedDate", "negotiationDate", "generationDate", "createdAt", "registerDate"];
    const out = [];
    (lista || []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      for (let i = 0; i < keys.length; i++) {
        const d = String(item[keys[i]] || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          out.push(d);
          break;
        }
      }
    });
    return out;
  },

  datasGeracaoParcelas(lista) {
    const keys = ["generationDate", "generatedDate", "remadeDate", "remadeInstallmentsDate", "createdDate"];
    const out = [];
    (lista || []).forEach((p) => {
      if (!p) return;
      keys.forEach((k) => {
        const d = String(p[k] || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push(d);
      });
    });
    return out;
  },

  /** Reparcelamento no dia do documento ou depois, ou plano de parcelas diferente do gravado. */
  aditamentoMudou(row, datas, planoAtual) {
    const dia = String((row && row.createdAt) || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && (datas || []).some((d) => String(d).slice(0, 10) >= dia)) return true;
    const salvo = String((row && row.plano) || "");
    const atual = String(planoAtual || "");
    return !!(salvo && atual && salvo !== atual);
  },

  async siengeGet(path) {
    if (typeof window.siengeFetchWithRetry !== "function") return null;
    try {
      return await window.siengeFetchWithRetry(path, 1);
    } catch (e) {
      return null;
    }
  },

  listaSienge(res) {
    if (Array.isArray(res)) return res;
    return (res && (res.results || res.data)) || [];
  },

  async titularAtual(billId) {
    this._titularBill = this._titularBill || {};
    if (Object.prototype.hasOwnProperty.call(this._titularBill, billId)) return this._titularBill[billId];
    const bill = await this.siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId));
    if (!bill || typeof bill !== "object") {
      this._titularBill[billId] = null;
      return null;
    }
    const pessoa = bill.customer || bill.client || {};
    const id = String(bill.customerId || bill.clientId || pessoa.id || pessoa.customerId || pessoa.clientId || "").replace(/\D/g, "");
    let nome = String(bill.clientName || bill.customerName || pessoa.name || pessoa.clientName || "").trim();
    if (!nome && id) {
      const cli = await this.siengeGet("/customers/" + encodeURIComponent(id));
      nome = String((cli && (cli.name || cli.clientName)) || "").trim();
    }
    const atual = id ? { id: id, nome: nome } : null;
    this._titularBill[billId] = atual;
    return atual;
  },

  async cessaoLancadaNoSienge(row) {
    if (!row || row.tipo !== "cessao") return false;
    const billId = String(row.titulo || "").replace(/\D/g, "");
    if (!billId) return false;
    const atual = await this.titularAtual(billId);
    return this.cessaoMudou(row, atual);
  },

  async aditamentoLancadoNoSienge(row) {
    if (!row || row.tipo !== "aditamento") return false;
    const billId = String(row.titulo || "").replace(/\D/g, "");
    if (!billId) return false;
    const remade = await this.siengeGet("/remade-installments?billReceivableId=" + encodeURIComponent(billId));
    const datas = this.datasRemade(this.listaSienge(remade));
    let planoAtual = "";
    let datasParcela = [];
    if (row.plano || !datas.length) {
      const res = await this.siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200");
      const inst = this.listaSienge(res);
      if (inst.length) {
        planoAtual = this.planoDeParcelas(inst);
        datasParcela = this.datasGeracaoParcelas(inst);
      }
    }
    return this.aditamentoMudou(row, datas.concat(datasParcela), planoAtual);
  },

  async marcarLancado(row) {
    if (!row || row.status === "lancado") return;
    row.status = "lancado";
    row.lancadoEm = new Date().toISOString();
    const id = String(row.id || "");
    const patch = { status: "lancado", lancadoEm: row.lancadoEm };
    this.gravarLocal(this.lerLocal().map((x) => (String(x.id) === id ? Object.assign({}, x, patch) : x)));
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || !fx.updateDoc || !fx.doc || id.indexOf("local-") === 0) return;
    try { await fx.updateDoc(fx.doc(db, this.COL, id), patch); } catch (e) {}
  },

  async reconciliarDistratos() {
    if (this._reconciliando) return this._reconciliando;
    const pendentes = (this.itens || []).filter((r) => r && r.status !== "lancado" && (r.tipo === "distrato" || r.tipo === "cessao" || r.tipo === "aditamento"));
    this._reconciliando = (async () => {
      for (let i = 0; i < pendentes.length; i++) {
        const row = pendentes[i];
        let gravado = false;
        try {
          if (row.tipo === "distrato") {
            gravado = await this.tituloBaixadoNoSienge(row);
            if (!gravado) gravado = await this.temDistratoGravado(row);
          } else if (row.tipo === "cessao") {
            gravado = await this.cessaoLancadaNoSienge(row);
          } else if (row.tipo === "aditamento") {
            gravado = await this.aditamentoLancadoNoSienge(row);
          }
        } catch (e) {
          gravado = false;
        }
        if (gravado) await this.marcarLancado(row);
      }
      if (document.getElementById("docs-ass-body")) this.pintar();
    })();
    try { await this._reconciliando; } finally { this._reconciliando = null; }
  },

  nomeExibido(row) {
    if (row && row.tipo === "cessao") return this.nomeCedente(row) || String(row.cliente || "").trim() || "—";
    return String((row && row.cliente) || "").trim() || "—";
  },

  hojeIso() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  },

  somarDias(iso, n) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    d.setDate(d.getDate() + n);
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mes + "-" + dia;
  },

  ehFeriado(iso) {
    if (window.EscalaHomeOffice && typeof window.EscalaHomeOffice.ehFeriado === "function") {
      return window.EscalaHomeOffice.ehFeriado(iso);
    }
    const ano = Number(String(iso).slice(0, 4));
    const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
    return fixos.some((md) => iso === ano + "-" + md);
  },

  ehDiaUtil(iso) {
    const dia = new Date(String(iso).slice(0, 10) + "T12:00:00").getDay();
    if (dia === 0 || dia === 6) return false;
    return !this.ehFeriado(iso);
  },

  /* Dias úteis decorridos depois da emissão, sem contar o próprio dia. */
  diasUteisDesde(iso) {
    const inicio = String(iso || "").slice(0, 10);
    const hoje = this.hojeIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || inicio >= hoje) return 0;
    let n = 0;
    let d = this.somarDias(inicio, 1);
    let guarda = 0;
    while (d <= hoje && guarda < 400) {
      if (this.ehDiaUtil(d)) n += 1;
      d = this.somarDias(d, 1);
      guarda += 1;
    }
    return n;
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3 || p[0].length !== 4) return "—";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  /* 5 e 6: só quem gerou. 7, 9, 11…: o perfil inteiro de quem gerou. */
  marcoAlerta(dias) {
    if (dias === 5 || dias === 6) return "responsavel";
    if (dias >= 7 && (dias - 7) % 2 === 0) return "time";
    return "";
  },

  usuarioEfetivo() {
    const u = (typeof window.crmUsuarioAcesso === "function" && window.crmUsuarioAcesso()) || (window.AppState && window.AppState.currentUser) || null;
    if (!u || !(u.email || u.name || u.nome)) return null;
    return u;
  },

  perfilDe(user) {
    if (!user) return "";
    const direto = String(user.profile_name || user.profile || "").trim();
    if (direto) return direto;
    if (typeof window.findCrmRegisteredUser === "function") {
      const rec = window.findCrmRegisteredUser(user.email || user);
      if (rec && rec.profile_name) return String(rec.profile_name).trim();
    }
    return "";
  },

  mesmoPerfil(a, b) {
    const norm = typeof window.normalizeCrmProfileName === "function"
      ? window.normalizeCrmProfileName
      : (s) => String(s || "").trim().toUpperCase();
    const x = norm(a);
    const y = norm(b);
    return !!(x && y && x === y);
  },

  responsavelDe(row) {
    const lista = typeof window.getCrmUsersList === "function" ? window.getCrmUsersList() : [];
    const email = String((row && row.userEmail) || "").toLowerCase();
    const nome = this.normNome(row && row.userName);
    return lista.find((u) => {
      const em = String((u && u.email) || "").toLowerCase();
      if (email && em && email === em) return true;
      return !!(nome && nome.length > 3 && this.normNome(u && (u.name || u.nome)) === nome);
    }) || null;
  },

  souOResponsavel(row) {
    const eu = this.usuarioEfetivo();
    if (!eu || !row) return false;
    const email = String(eu.email || "").toLowerCase();
    if (email && row.userEmail && email === String(row.userEmail).toLowerCase()) return true;
    const nome = this.normNome(eu.name || eu.nome);
    return !!(nome && nome.length > 3 && nome === this.normNome(row.userName));
  },

  veAlerta(row, marco) {
    if (!marco) return false;
    if (this.souOResponsavel(row)) return true;
    if (marco !== "time") return false;
    const eu = this.usuarioEfetivo();
    const dono = this.responsavelDe(row);
    return this.mesmoPerfil(this.perfilDe(eu), this.perfilDe(dono) || this.perfilDe({ email: row.userEmail, profile_name: "" }));
  },

  chaveAlerta(row, dias) {
    const eu = this.usuarioEfetivo() || {};
    const quem = String(eu.email || eu.name || eu.nome || "op").toLowerCase();
    return "crm_docs_pend_" + quem + "_" + String((row && row.id) || "") + "_" + dias;
  },

  alertaVisto(row, dias) {
    try { return localStorage.getItem(this.chaveAlerta(row, dias)) === "ciente"; } catch (e) { return false; }
  },

  async garantirItens() {
    if (this.itens && this.itens.length) return;
    let nuvem = [];
    try {
      if (window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDocs) {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, this.COL));
        snap.forEach((d) => nuvem.push(Object.assign({ id: d.id }, d.data() || {})));
      }
    } catch (e) {}
    this.itens = this.unir(nuvem, this.lerLocal());
  },

  pendentesParaAlertar() {
    return (this.itens || []).filter((row) => {
      if (!row || row.status === "lancado") return false;
      const dias = this.diasUteisDesde(row.createdAt);
      const marco = this.marcoAlerta(dias);
      if (!marco || this.alertaVisto(row, dias)) return false;
      return this.veAlerta(row, marco);
    }).map((row) => ({ row: row, dias: this.diasUteisDesde(row.createdAt) }));
  },

  async avisarPendentes() {
    if (this._avisando) return this._avisando;
    if (!this.usuarioEfetivo() || document.getElementById("docs-pend-alerta")) return;
    this._avisando = (async () => {
      await this.garantirItens();
      try { await this.reconciliarDistratos(); } catch (e) {}
      const lista = this.pendentesParaAlertar();
      if (!lista.length || document.getElementById("docs-pend-alerta")) return;
      this.abrirAlertaPendentes(lista);
    })();
    try { await this._avisando; } finally { this._avisando = null; }
  },

  fraseAlerta(item) {
    const row = item.row;
    const quem = this.nomeExibido(row);
    const titulo = String(row.titulo || "").trim();
    const doc = this.tipoLabel(row.tipo);
    const quando = this.dataBr(row.createdAt);
    const doCliente = quem && quem !== "—" ? " de " + quem : "";
    const doTitulo = titulo && titulo !== "—" ? ", título " + titulo : "";
    return "O documento " + doc + doCliente + doTitulo + " foi emitido em " + quando + " e não foi concluído no Sienge ainda.";
  },

  abrirAlertaPendentes(lista) {
    if (!lista.length || document.getElementById("docs-pend-alerta")) return;
    const linhas = lista.map((item) => `<p class="docs-pend-item">${this.esc(this.fraseAlerta(item))}</p>`).join("");
    const overlay = document.createElement("div");
    overlay.id = "docs-pend-alerta";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-labelledby", "docs-pend-titulo");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483004;display:flex;align-items:center;justify-content:center;background:rgba(12,41,29,0.55);padding:16px;";
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 40px rgba(0,0,0,0.22);border:1px solid rgba(16,84,54,0.12);font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 0;">
        <h2 id="docs-pend-titulo" style="margin:0;font-size:1.05rem;color:#105436;">Documentos sem conclusão no Sienge</h2>
        <button type="button" class="btn btn-fechar" id="docs-pend-fechar">Fechar</button>
      </div>
      <div style="padding:12px 18px 18px;overflow:auto;">
        <div style="display:flex;flex-direction:column;gap:8px;">${linhas}</div>
      </div>
    </div>`;
    const estilo = document.createElement("style");
    estilo.textContent = "#docs-pend-alerta .docs-pend-item{margin:0;padding:10px 12px;border:1px solid #fde68a;border-left:4px solid #d97706;background:#fffbeb;border-radius:10px;color:#1e293b;font-size:0.9rem;line-height:1.45;}";
    overlay.appendChild(estilo);
    document.body.appendChild(overlay);
    overlay.querySelector("#docs-pend-fechar").addEventListener("click", () => this.fecharAlertaPendentes(lista));
  },

  fecharAlertaPendentes(lista) {
    (lista || []).forEach((item) => {
      try { localStorage.setItem(this.chaveAlerta(item.row, item.dias), "ciente"); } catch (e) {}
    });
    const pop = document.getElementById("docs-pend-alerta");
    if (pop) pop.remove();
  },

  ordenar(lista) {
    const dir = this.sortDir === "asc" ? 1 : -1;
    const key = this.sortKey;
    const val = (row) => {
      if (key === "quando") return String(row.createdAt || "");
      if (key === "tipo") return this.tipoLabel(row.tipo);
      if (key === "cliente") return this.nomeExibido(row);
      if (key === "titulo") return String(row.titulo || "");
      if (key === "unidade") return String(row.unidade || "");
      if (key === "quem") return String(row.userName || "");
      return "";
    };
    return lista.slice().sort((a, b) => String(val(a)).localeCompare(String(val(b)), "pt-BR", { numeric: true }) * dir);
  },

  quando(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },

  th(key, label) {
    return `<th onclick="DocAssinaturaApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;color:currentColor;"></i></th>`;
  },

  pintar() {
    const body = document.getElementById("docs-ass-body");
    if (!body) return;
    if (this.carregando) {
      body.innerHTML = `
        <div class="ml-load">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div class="loading-status-text">Carregando os documentos…</div>
          <div class="ml-load-track"><div class="loading-progress-bar" style="width:40%"></div></div>
        </div>`;
      return;
    }
    const abas = [
      { id: "todos", label: "Todos", icon: "files" },
      { id: "meus", label: "Gerados por mim", icon: "user" }
    ];
    const tabs = `<div class="ml-tabs" role="tablist">${abas.map((t) => {
      const on = this.vista === t.id;
      return `<button type="button" role="tab" class="ml-tab${on ? " is-active" : ""}" aria-selected="${on ? "true" : "false"}" onclick="DocAssinaturaApp.setVista('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
    }).join("")}</div>`;
    const opts = `<option value="">Todos os documentos</option>` + this.TIPOS.map((t) => `<option value="${t.id}"${this.tipo === t.id ? " selected" : ""}>${this.esc(t.label)}</option>`).join("");
    const rows = this.ordenar(this.visiveis());
    const aviso = this.aviso ? `<p class="docs-aviso">${this.esc(this.aviso)}</p>` : "";
    const grupos = new Map();
    rows.forEach((r) => {
      const id = this.centroDe(r) || "";
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push(r);
    });
    const ordem = [...grupos.keys()].sort((a, b) => String(a || "￿").localeCompare(String(b || "￿"), "pt-BR", { numeric: true }));
    const linha = (r) => {
      const tem = !!r.pdfUrl;
      const chave = encodeURIComponent(String(r.id));
      return `<tr>
            <td>${this.esc(this.quando(r.createdAt))}</td>
            <td>${this.esc(this.tipoLabel(r.tipo))}</td>
            <td>${this.esc(this.nomeExibido(r))}</td>
            <td>${this.esc(r.titulo || "—")}</td>
            <td>${this.esc(this.rotuloUnidade(r))}</td>
            <td>${this.esc(r.userName || "—")}${this.mesmoUsuario(r) ? ` <span class="docs-voce">você</span>` : ""}</td>
            <td><span class="docs-sit${r.status === "lancado" ? " is-feito" : ""}">${r.status === "lancado" ? "Lançado no Sienge" : "Aguardando"}</span></td>
            <td class="docs-acoes"><button type="button" class="tvig-ico" title="${tem ? "Consultar documento" : "PDF não salvo para consulta"}" style="${tem ? "" : "opacity:.35"}" onclick="DocAssinaturaApp.consultar('${chave}')"><i data-lucide="paperclip" style="width:15px;height:15px;"></i></button><button type="button" class="tvig-ico is-danger" title="Remover" onclick="DocAssinaturaApp.remover('${chave}')"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button></td>
          </tr>`;
    };
    const corpo = ordem.map((id) => {
      const lista = grupos.get(id) || [];
      const nome = id ? this.nomeCentro(id) : "";
      const rotulo = id ? (nome ? id + " - " + nome : id) : "Sem centro de custo";
      return `<tr class="docs-obra"><td colspan="8">${this.esc(rotulo)} <span>${lista.length}</span></td></tr>${lista.map(linha).join("")}`;
    }).join("");
    const tabela = rows.length
      ? `<div class="cc-scroll"><table class="cc-table docs-cc-table">
          <thead><tr>
            ${this.th("quando", "Quando")}
            ${this.th("tipo", "Documento")}
            ${this.th("cliente", "Cliente")}
            ${this.th("titulo", "Título")}
            ${this.th("unidade", "Unidade")}
            ${this.th("quem", "Gerado por")}
            <th>Situação</th>
            <th class="is-center">Ações</th>
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table></div>`
      : `<p class="docs-vazio">Nenhum documento nesta visão.</p>`;
    body.innerHTML = `
      ${aviso}
      <div class="cc-toolbar">
        ${tabs}
        <div class="cc-toolbar-actions">
          <label class="moura-switch docs-finalizados">
            <input type="checkbox" ${this.mostrarFinalizados ? "checked" : ""} onchange="DocAssinaturaApp.setFinalizados(this.checked)" aria-label="Mostrar finalizados">
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">Mostrar finalizados</span>
          </label>
          <label class="docs-filtro">Documento
            <select class="form-control" onchange="DocAssinaturaApp.setTipo(this.value)">${opts}</select>
          </label>
        </div>
      </div>
      ${tabela}`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
};

window.DocAssinaturaApp = DocAssinaturaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "relacionamento_assinaturas") DocAssinaturaApp.abrir();
});

document.addEventListener("DOMContentLoaded", function () {
  let tentativas = 0;
  const tentar = function () {
    tentativas += 1;
    const app = window.DocAssinaturaApp;
    if (!app || typeof app.avisarPendentes !== "function" || !app.usuarioEfetivo()) {
      if (tentativas < 20) setTimeout(tentar, 1000);
      return;
    }
    app.avisarPendentes();
  };
  setTimeout(tentar, 2500);
});
