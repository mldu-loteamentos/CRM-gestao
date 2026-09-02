(function () {
  const COLLECTION = "suporte_chamados";
  const MAX_IMAGES = 8;
  const MAX_BYTES = 6 * 1024 * 1024;

  const ABAS_DETALHES = [
    { id: "ficha-cadastro", label: "Cadastro" },
    { id: "ficha-conjuge", label: "Cônjuge" },
    { id: "ficha-complemento", label: "Complemento" },
    { id: "ficha-representante", label: "Representante legal" },
    { id: "ficha-procuradores", label: "Procuradores" },
    { id: "ficha-anexos", label: "Anexos (ficha)" },
    { id: "ficha-score", label: "Score Interno" },
    { id: "tab-contrato", label: "Contrato de Venda" },
    { id: "tab-outros", label: "Outros Contratos" },
    { id: "tab-quitacao", label: "Valor Quitação" },
    { id: "tab-simulacao", label: "Simulação de Vencidas" },
    { id: "tab-ocorrencias", label: "Ocorrências e Promessas" },
    { id: "tab-boletos", label: "Boletos do Contrato" },
    { id: "tab-historico-renegociacoes", label: "Histórico de Renegociações" },
    { id: "tab-vizinhos", label: "Vizinhos" },
    { id: "tab-comportamento", label: "Comportamento de Pgto" },
    { id: "tab-repactuacoes", label: "Repactuações" },
    { id: "tab-construcao", label: "Construção" },
    { id: "tab-notificacoes", label: "Notificações (cliente)" },
    { id: "tab-informe-rendimentos", label: "Informe de Rendimentos" },
    { id: "extrato-cliente", label: "Visualizar Extrato" },
    { id: "tab-anexos-juridico", label: "Anexos Jurídico" },
    { id: "tab-cobranca-judicial", label: "Cobrança Judicial" }
  ];

  const MENU = [
    { id: "home", label: "Home" },
    { id: "engenharia", label: "Engenharia" },
    { id: "vistoria", label: "Vistoria", subs: [
      { id: "vistoria_tela", label: "Vistoria" },
      { id: "verificar_construcao", label: "Verificar Construção" }
    ]},
    { id: "compras", label: "Compras" },
    { id: "financeiro", label: "Financeiro", subs: [
      { id: "contas_receber", label: "Contas a Receber" },
      { id: "dashboard", label: "Dashboard" },
      { id: "fila", label: "Fila de Cobrança" },
      { id: "agenda", label: "Agenda do Operador" },
      { id: "zeropaid", label: "Clientes 0% Pago" },
      { id: "subjudice", label: "Sub Judice" },
      { id: "notificacoes", label: "Notificações", abas: [
        { id: "followup", label: "Follow-up de NEX" },
        { id: "elegiveis-zero", label: "Elegíveis 0% pago" },
        { id: "elegiveis-61", label: "Demais clientes elegíveis" }
      ]},
      { id: "config_cr", label: "Configurações (CR)", abas: [
        { id: "regra-regua", label: "Régua de Cobrança" },
        { id: "regra-judiciais", label: "Etapas Judiciais" },
        { id: "regra-atribuicao", label: "Atribuição de Operadores" },
        { id: "regra-negociacao", label: "Regras de Negociação" },
        { id: "regra-fila", label: "Fila de Cobrança" }
      ]},
      { id: "extrato", label: "Extrato" },
      { id: "mapa", label: "Mapa jurídico" },
      { id: "detalhes_cliente", label: "Detalhes do cliente", abas: ABAS_DETALHES, abaObrigatoria: true },
      { id: "renegociacao", label: "Renegociação" },
      { id: "distrato", label: "Distrato" },
      { id: "cp_assistente", label: "Assistente de Contas a Pagar" },
      { id: "prestacao_contas", label: "Prestação de Contas" },
      { id: "param_parceiro", label: "Parametrização de Parceiro" },
      { id: "caixa_mov", label: "Movimentações (Caixa e Banco)" },
      { id: "investimento", label: "Aplicações e Investimentos" },
      { id: "fluxo_caixa", label: "Fluxo de caixa (DFC)" },
      { id: "fluxo_diario", label: "Fluxo de caixa diário" },
      { id: "resultado_caixa", label: "Resultado de caixa" },
      { id: "repactuacao", label: "Repactuação" }
    ]},
    { id: "fiscal", label: "Fiscal / Contábil", subs: [
      { id: "pis_cofins", label: "PIS/COFINS" },
      { id: "csll_irpj", label: "CSLL/IRPJ" }
    ]},
    { id: "participacoes", label: "Participações" },
    { id: "societario", label: "Societário", subs: [
      { id: "estrutura", label: "Estrutura Societária" }
    ]},
    { id: "comercial", label: "Comercial", subs: [
      { id: "dash_com", label: "Dashboard" },
      { id: "estoque", label: "Posição de estoque" },
      { id: "anexos", label: "Assistente de Anexos" }
    ]},
    { id: "marketing", label: "Marketing", subs: [
      { id: "budget", label: "Budget" },
      { id: "eventos", label: "Eventos" }
    ]},
    { id: "relacionamento", label: "Relacionamento", subs: [
      { id: "buscar", label: "Buscar Cliente" },
      { id: "autorizacao", label: "Autorização de escritura" }
    ]},
    { id: "compromissario", label: "Compromissário", subs: [
      { id: "prefeitura", label: "Prefeitura" },
      { id: "associacoes", label: "Associações" }
    ]},
    { id: "seguranca", label: "Segurança", subs: [
      { id: "auditoria", label: "Auditoria do Sistema" },
      { id: "acessos", label: "Acessos" }
    ]},
    { id: "suporte", label: "Suporte" },
    { id: "configuracoes", label: "Configurações", subs: [
      { id: "preambulos", label: "Preâmbulos" },
      { id: "tags", label: "Tags de Anexos" },
      { id: "usuarios", label: "Usuários e Perfis" },
      { id: "empresas", label: "Empresas" },
      { id: "centro_custo", label: "Centro de Custo" },
      { id: "plano_financeiro", label: "Plano Financeiro e Visões" },
      { id: "doc_padrao", label: "Documentos Padrões" },
      { id: "upload_kmz", label: "Upload de KMZ" },
      { id: "upload_mapa", label: "Projeto Urbanístico" },
      { id: "indexadores", label: "Indexadores" }
    ]},
    { id: "outro", label: "Outro / Geral" }
  ];

  const TAB_TO_LOC = {
    "construcao-home": { modulo: "home" },
    "construcao-engenharia": { modulo: "engenharia" },
    vistoria: { modulo: "vistoria", subitem: "vistoria_tela" },
    "construcao-compras": { modulo: "compras" },
    dashboard: { modulo: "financeiro", subitem: "fila" },
    inadimplencia_dashboard: { modulo: "financeiro", subitem: "dashboard" },
    agenda: { modulo: "financeiro", subitem: "agenda" },
    zeropaid: { modulo: "financeiro", subitem: "zeropaid" },
    subjudice: { modulo: "financeiro", subitem: "subjudice" },
    wesend: { modulo: "financeiro", subitem: "notificacoes" },
    configuracoes: { modulo: "financeiro", subitem: "config_cr" },
    "contas-pagar": { modulo: "financeiro", subitem: "cp_assistente" },
    "prestacao-contas": { modulo: "financeiro", subitem: "prestacao_contas" },
    "parametrizacao-parceiro": { modulo: "financeiro", subitem: "param_parceiro" },
    "construcao-caixa": { modulo: "financeiro", subitem: "caixa_mov" },
    "fluxo-caixa": { modulo: "financeiro", subitem: "fluxo_caixa" },
    "fluxo-caixa-diario": { modulo: "financeiro", subitem: "fluxo_diario" },
    "resultado-caixa": { modulo: "financeiro", subitem: "resultado_caixa" },
    investimento: { modulo: "financeiro", subitem: "investimento" },
    "repactuacao-lote": { modulo: "financeiro", subitem: "repactuacao" },
    "construcao-fiscal": { modulo: "fiscal", subitem: "pis_cofins" },
    "construcao-fiscal-csll": { modulo: "fiscal", subitem: "csll_irpj" },
    participacoes: { modulo: "participacoes" },
    "estrutura-societaria": { modulo: "societario", subitem: "estrutura" },
    "dashboard-comercial": { modulo: "comercial", subitem: "dash_com" },
    "estoque-comercial": { modulo: "comercial", subitem: "estoque" },
    anexos: { modulo: "comercial", subitem: "anexos" },
    "marketing-eventos": { modulo: "marketing", subitem: "eventos" },
    "marketing-budget": { modulo: "marketing", subitem: "budget" },
    relacionamento_gestao: { modulo: "relacionamento", subitem: "buscar" },
    relacionamento_autorizacao: { modulo: "relacionamento", subitem: "autorizacao" },
    compromissario_prefeitura: { modulo: "compromissario", subitem: "prefeitura" },
    compromissario_associacoes: { modulo: "compromissario", subitem: "associacoes" },
    auditoria: { modulo: "seguranca", subitem: "auditoria" },
    acessos: { modulo: "seguranca", subitem: "acessos" },
    suporte: { modulo: "suporte" },
    preambles: { modulo: "configuracoes", subitem: "preambulos" },
    "config-tags": { modulo: "configuracoes", subitem: "tags" },
    "config-users": { modulo: "configuracoes", subitem: "usuarios" },
    parametrizacoes: { modulo: "configuracoes", subitem: "empresas" },
    "centros-custo": { modulo: "configuracoes", subitem: "centro_custo" },
    "plano-financeiro": { modulo: "configuracoes", subitem: "plano_financeiro" },
    "doc-padrao": { modulo: "configuracoes", subitem: "doc_padrao" },
    "upload-kmz": { modulo: "configuracoes", subitem: "upload_kmz" },
    "upload-mapa": { modulo: "configuracoes", subitem: "upload_mapa" },
    indexadores: { modulo: "configuracoes", subitem: "indexadores" }
  };

  const OLD_MODULO_LABEL = {
    financeiro_cr: "Financeiro — Contas a Receber",
    financeiro_cp: "Financeiro — Contas a Pagar",
    caixa_banco: "Financeiro — Caixa e Banco"
  };

  const STATUS_LABEL = {
    pendente: "Pendente",
    aguardando_usuario: "Aguardando você",
    em_atendimento: "Em atendimento",
    atendido: "Atendido"
  };

  const TIPO_LABEL = {
    problema: "Problema",
    melhoria: "Melhoria",
    interno: "Interno"
  };

  let draftFiles = [];
  let adminFilter = "pendentes";
  let adminListCache = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentUser() {
    return (window.AppState && AppState.currentUser) || {};
  }

  function userKey(u) {
    u = u || currentUser();
    return String(u.email || u.id || u.name || "").trim().toLowerCase();
  }

  function isAdmin() {
    if (typeof window.isCrmSuperAdmin === "function" && window.isCrmSuperAdmin()) return true;
    if (typeof window.hasCrmPerm === "function") {
      return window.hasCrmPerm("mod_suporte") || window.hasCrmPerm("sub_suporte_geral_chamados_acessar");
    }
    return false;
  }

  function findModulo(id) {
    return MENU.find(m => m.id === id);
  }

  function findSub(modId, subId) {
    const mods = findModulo(modId);
    if (!mods || !mods.subs) return null;
    return mods.subs.find(s => s.id === subId) || null;
  }

  function findAba(modId, subId, abaId) {
    const sub = findSub(modId, subId);
    if (!sub || !sub.abas) return null;
    return sub.abas.find(a => a.id === abaId) || null;
  }

  function moduloLabel(id) {
    const found = findModulo(id);
    if (found) return found.label;
    return OLD_MODULO_LABEL[id] || id || "—";
  }

  function localPathOf(t) {
    if (t && t.localPath) return t.localPath;
    const parts = [moduloLabel(t && t.modulo)];
    const sub = findSub(t && t.modulo, t && t.subitem);
    if (sub) parts.push(sub.label);
    else if (t && t.subitemLabel) parts.push(t.subitemLabel);
    const aba = findAba(t && t.modulo, t && t.subitem, t && t.aba);
    if (aba) parts.push(aba.label);
    else if (t && t.abaLabel) parts.push(t.abaLabel);
    return parts.filter(Boolean).join(" › ");
  }

  function isVisible(el) {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden";
  }

  function suggestLocation() {
    const loc = { modulo: "outro", subitem: "", aba: "" };
    const mapa = document.getElementById("mapa-juridico-overlay");
    if (isVisible(mapa)) return { modulo: "financeiro", subitem: "mapa", aba: "" };
    if (isVisible(document.getElementById("view-renegotiation"))) {
      return { modulo: "financeiro", subitem: "renegociacao", aba: "" };
    }
    if (isVisible(document.getElementById("view-distrato"))) {
      return { modulo: "financeiro", subitem: "distrato", aba: "" };
    }
    if (isVisible(document.getElementById("view-customer-details"))) {
      const ficha = document.querySelector(".ficha-tab-btn.active");
      const cust = document.querySelector(".customer-tabs-menu .customer-tab-btn.active");
      let aba = "";
      if (cust && cust.id === "btn-visualizar-extrato-ativo") aba = "extrato-cliente";
      else if (cust && cust.getAttribute("data-target")) aba = cust.getAttribute("data-target");
      else if (ficha && ficha.getAttribute("data-target")) aba = ficha.getAttribute("data-target");
      return { modulo: "financeiro", subitem: "detalhes_cliente", aba: aba || "tab-contrato" };
    }
    const tab = window.activeAppTab || "";
    if (TAB_TO_LOC[tab]) return Object.assign(loc, TAB_TO_LOC[tab]);
    if (String(tab).startsWith("construcao-") && tab !== "construcao-compras" && tab !== "construcao-fiscal" && tab !== "construcao-caixa") {
      return { modulo: "engenharia", subitem: "", aba: "" };
    }
    return loc;
  }

  function fb() {
    const db = window.firebaseDb;
    const c = window.firebaseCollections;
    if (!db || !c) throw new Error("Firebase não inicializado. Recarregue a página.");
    return { db, c };
  }

  async function compressImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) return file;
    if (file.size <= 1.4 * 1024 * 1024) return file;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const max = 1600;
    let w = img.width;
    let h = img.height;
    if (w > max || h > max) {
      const r = Math.min(max / w, max / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  async function uploadImages(files, ticketId) {
    const { c } = fb();
    let uploadBytesFunc = c.uploadBytes;
    let getDownloadURLFunc = c.getDownloadURL;
    let refFunc = c.ref;
    if (!uploadBytesFunc || !window.firebaseStorage) {
      throw new Error("Storage do Firebase não disponível.");
    }
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const raw = files[i];
      const file = await compressImage(raw);
      const safe = String(file.name || "print").replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `suporte/${ticketId}/${Date.now()}_${i}_${safe}`;
      const storageRef = refFunc(window.firebaseStorage, path);
      await uploadBytesFunc(storageRef, file);
      const url = await getDownloadURLFunc(storageRef);
      out.push({ url, name: raw.name || safe });
    }
    return out;
  }

  function statusBadge(status) {
    const cls = status === "atendido" ? "ok" : status === "aguardando_usuario" ? "wait" : "pend";
    return `<span class="suporte-badge ${cls}">${esc(STATUS_LABEL[status] || status)}</span>`;
  }

  function fmtDate(v) {
    if (!v) return "—";
    try {
      const d = v.toDate ? v.toDate() : new Date(v);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch (e) {
      return "—";
    }
  }

  function ensureShell() {
    if (document.getElementById("suporte-overlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "suporte-overlay";
    wrap.className = "suporte-overlay";
    wrap.style.display = "none";
    wrap.innerHTML = `<div class="suporte-modal" id="suporte-modal-box" role="dialog" aria-modal="true"></div>`;
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
  }

  function closeModal() {
    const ov = document.getElementById("suporte-overlay");
    if (ov) ov.style.display = "none";
    draftFiles = [];
  }

  function openModal() {
    ensureShell();
    document.getElementById("suporte-overlay").style.display = "flex";
    if (window.lucide) lucide.createIcons();
  }

  function toggleMenu(force) {
    const menu = document.getElementById("suporte-menu");
    if (!menu) return;
    const show = force === true || (force !== false && menu.style.display !== "block");
    menu.style.display = show ? "block" : "none";
  }

  function optionList(items, selected, placeholder) {
    const first = `<option value="">${esc(placeholder)}</option>`;
    return first + items.map(m =>
      `<option value="${esc(m.id)}"${m.id === selected ? " selected" : ""}>${esc(m.label)}</option>`
    ).join("");
  }

  function refreshSubAba(pref) {
    const modSel = document.getElementById("suporte-modulo");
    const subWrap = document.getElementById("suporte-sub-wrap");
    const abaWrap = document.getElementById("suporte-aba-wrap");
    const subSel = document.getElementById("suporte-subitem");
    const abaSel = document.getElementById("suporte-aba");
    if (!modSel || !subWrap || !abaWrap) return;
    const mod = findModulo(modSel.value);
    const subs = (mod && mod.subs) || [];
    if (!subs.length) {
      subWrap.style.display = "none";
      abaWrap.style.display = "none";
      if (subSel) subSel.innerHTML = "";
      if (abaSel) abaSel.innerHTML = "";
      return;
    }
    subWrap.style.display = "";
    const wantSub = (pref && pref.subitem) || (subSel && subSel.value) || "";
    subSel.innerHTML = optionList(subs, wantSub, "Selecione o subitem");
    if (wantSub && !subs.some(s => s.id === wantSub)) subSel.value = "";
    refreshAba(pref);
  }

  function refreshAba(pref) {
    const modSel = document.getElementById("suporte-modulo");
    const subSel = document.getElementById("suporte-subitem");
    const abaWrap = document.getElementById("suporte-aba-wrap");
    const abaSel = document.getElementById("suporte-aba");
    const abaLab = document.getElementById("suporte-aba-label");
    if (!abaWrap || !abaSel) return;
    const sub = findSub(modSel && modSel.value, subSel && subSel.value);
    const abas = (sub && sub.abas) || [];
    if (!abas.length) {
      abaWrap.style.display = "none";
      abaSel.innerHTML = "";
      return;
    }
    abaWrap.style.display = "";
    if (abaLab) abaLab.textContent = sub.abaObrigatoria ? "Aba *" : "Aba";
    const wantAba = (pref && pref.aba) || abaSel.value || "";
    abaSel.innerHTML = optionList(abas, wantAba, "Selecione a aba");
  }

  function bindLocationSelects(pref) {
    const modSel = document.getElementById("suporte-modulo");
    const subSel = document.getElementById("suporte-subitem");
    if (modSel) {
      modSel.addEventListener("change", () => refreshSubAba());
    }
    if (subSel) {
      subSel.addEventListener("change", () => refreshAba());
    }
    refreshSubAba(pref);
  }

  function renderPreviews() {
    const box = document.getElementById("suporte-preview-list");
    if (!box) return;
    if (!draftFiles.length) {
      box.innerHTML = `<span class="suporte-hint">Nenhuma imagem selecionada.</span>`;
      return;
    }
    box.innerHTML = draftFiles.map((f, i) => {
      const url = URL.createObjectURL(f);
      return `<div class="suporte-thumb">
        <img src="${url}" alt="">
        <button type="button" class="suporte-thumb-x" data-i="${i}" title="Remover">×</button>
      </div>`;
    }).join("");
    box.querySelectorAll(".suporte-thumb-x").forEach(btn => {
      btn.addEventListener("click", () => {
        draftFiles.splice(Number(btn.getAttribute("data-i")), 1);
        renderPreviews();
      });
    });
  }

  function bindFileInput() {
    const input = document.getElementById("suporte-files");
    if (!input) return;
    input.addEventListener("change", () => {
      const added = Array.from(input.files || []);
      added.forEach(f => {
        if (!String(f.type || "").startsWith("image/")) return;
        if (f.size > MAX_BYTES) {
          alert("A imagem \"" + f.name + "\" passa de 6 MB.");
          return;
        }
        if (draftFiles.length >= MAX_IMAGES) return;
        draftFiles.push(f);
      });
      input.value = "";
      renderPreviews();
    });
  }

  function formHtml(opts) {
    const title = opts.tipo === "melhoria" ? "Sugerir uma melhoria"
      : opts.tipo === "interno" ? "Novo chamado interno"
      : "Relatar um problema";
    const imgReq = opts.tipo !== "interno";
    const loc = suggestLocation();
    return `
      <div class="suporte-modal-head">
        <h2><i data-lucide="life-buoy"></i> ${esc(title)}</h2>
        <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
      </div>
      <div class="suporte-modal-body">
        <div class="form-group">
          <label>Módulo *</label>
          <select id="suporte-modulo" class="form-control">${optionList(MENU, loc.modulo, "Selecione o módulo")}</select>
        </div>
        <div class="form-group" id="suporte-sub-wrap">
          <label>Subitem *</label>
          <select id="suporte-subitem" class="form-control"></select>
        </div>
        <div class="form-group" id="suporte-aba-wrap" style="display:none;">
          <label id="suporte-aba-label">Aba *</label>
          <select id="suporte-aba" class="form-control"></select>
        </div>
        <div class="form-group">
          <label>Print da tela ${imgReq ? "*" : "(opcional)"}</label>
          <input type="file" id="suporte-files" class="form-control" accept="image/*" multiple>
          <div id="suporte-preview-list" class="suporte-preview-list"></div>
          <small class="suporte-hint">Envie uma ou mais imagens (até ${MAX_IMAGES}). ${imgReq ? "Obrigatório." : ""}</small>
        </div>
        <div class="form-group">
          <label>${opts.tipo === "melhoria" ? "Descreva a melhoria *" : "Descreva o problema *"}</label>
          <textarea id="suporte-desc" class="form-control" rows="5" placeholder="Conte o que aconteceu, o que esperava e como reproduzir."></textarea>
        </div>
      </div>
      <div class="suporte-modal-foot">
        <button type="button" class="btn btn-cancel" id="suporte-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="suporte-submit">Enviar</button>
      </div>`;
  }

  function openForm(tipo) {
    ensureShell();
    draftFiles = [];
    const loc = suggestLocation();
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = formHtml({ tipo });
    box.dataset.mode = "form";
    box.dataset.tipo = tipo;
    openModal();
    bindLocationSelects(loc);
    bindFileInput();
    renderPreviews();
    document.getElementById("suporte-close-x").onclick = closeModal;
    document.getElementById("suporte-cancel").onclick = closeModal;
    document.getElementById("suporte-submit").onclick = () => submitTicket(tipo);
  }

  async function submitTicket(tipo) {
    const modulo = (document.getElementById("suporte-modulo") || {}).value;
    const subitem = (document.getElementById("suporte-subitem") || {}).value || "";
    const aba = (document.getElementById("suporte-aba") || {}).value || "";
    const descricao = String((document.getElementById("suporte-desc") || {}).value || "").trim();
    if (!modulo) {
      alert("Escolha o módulo.");
      return;
    }
    const modObj = findModulo(modulo);
    if (modObj && modObj.subs && modObj.subs.length && !subitem) {
      alert("Escolha o subitem.");
      return;
    }
    const subObj = findSub(modulo, subitem);
    if (subObj && subObj.abas && subObj.abas.length && !aba) {
      alert("Escolha a aba.");
      return;
    }
    if (!descricao) {
      alert("Preencha a descrição.");
      return;
    }
    if (tipo !== "interno" && !draftFiles.length) {
      alert("Envie pelo menos um print da tela.");
      return;
    }
    const btn = document.getElementById("suporte-submit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    try {
      const { db, c } = fb();
      const u = currentUser();
      const now = new Date().toISOString();
      const payload = {
        tipo,
        modulo,
        subitem,
        aba,
        subitemLabel: subObj ? subObj.label : "",
        abaLabel: (findAba(modulo, subitem, aba) || {}).label || "",
        localPath: localPathOf({ modulo, subitem, aba }),
        descricao,
        imagens: [],
        status: "pendente",
        userId: userKey(u),
        userName: u.name || "",
        userEmail: String(u.email || "").toLowerCase(),
        createdByAdmin: tipo === "interno",
        mensagens: [],
        createdAt: now,
        updatedAt: now
      };
      const refDoc = await c.addDoc(c.collection(db, COLLECTION), payload);
      let imagens = [];
      if (draftFiles.length) {
        imagens = await uploadImages(draftFiles, refDoc.id);
        await c.updateDoc(c.doc(db, COLLECTION, refDoc.id), { imagens, updatedAt: new Date().toISOString() });
      }
      closeModal();
      alert("Chamado enviado. Você pode acompanhar em “Acompanhar meus chamados”.");
      if (window.activeAppTab === "suporte") renderAdmin();
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o chamado: " + (err.message || err));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar";
      }
    }
  }

  function ticketFromSnap(d) {
    const data = d.data ? d.data() : d;
    return Object.assign({ id: d.id }, data);
  }

  async function listAll() {
    const { db, c } = fb();
    const snap = await c.getDocs(c.collection(db, COLLECTION));
    const list = [];
    snap.forEach(docu => list.push(ticketFromSnap(docu)));
    list.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return list;
  }

  async function listMine() {
    const all = await listAll();
    const key = userKey();
    return all.filter(t => String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key);
  }

  function listHtml(tickets, emptyMsg) {
    if (!tickets.length) return `<p class="suporte-empty">${esc(emptyMsg)}</p>`;
    return `<div class="suporte-list">${tickets.map(t => `
      <button type="button" class="suporte-card" data-id="${esc(t.id)}">
        <div class="suporte-card-top">
          <strong>${esc(TIPO_LABEL[t.tipo] || t.tipo)} · ${esc(localPathOf(t))}</strong>
          ${statusBadge(t.status)}
        </div>
        <p>${esc((t.descricao || "").slice(0, 160))}${(t.descricao || "").length > 160 ? "…" : ""}</p>
        <small>${esc(t.userName || t.userEmail || "")} · ${esc(fmtDate(t.updatedAt || t.createdAt))}</small>
      </button>`).join("")}</div>`;
  }

  async function openMine() {
    ensureShell();
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = `
      <div class="suporte-modal-head">
        <h2><i data-lucide="ticket"></i> Meus chamados</h2>
        <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
      </div>
      <div class="suporte-modal-body" id="suporte-mine-body"><p class="suporte-hint">Carregando…</p></div>
      <div class="suporte-modal-foot">
        <button type="button" class="btn btn-cancel" id="suporte-cancel">Fechar</button>
      </div>`;
    openModal();
    document.getElementById("suporte-close-x").onclick = closeModal;
    document.getElementById("suporte-cancel").onclick = closeModal;
    try {
      const tickets = await listMine();
      const body = document.getElementById("suporte-mine-body");
      body.innerHTML = listHtml(tickets, "Você ainda não abriu chamados.");
      body.querySelectorAll(".suporte-card").forEach(el => {
        el.addEventListener("click", () => openDetail(el.getAttribute("data-id"), { mine: true }));
      });
    } catch (err) {
      document.getElementById("suporte-mine-body").innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
    }
    if (window.lucide) lucide.createIcons();
  }

  function threadHtml(t) {
    const msgs = Array.isArray(t.mensagens) ? t.mensagens : [];
    const imgs = Array.isArray(t.imagens) ? t.imagens : [];
    return `
      <div class="suporte-detail-meta">
        ${statusBadge(t.status)}
        <span>${esc(TIPO_LABEL[t.tipo] || t.tipo)}</span>
        <span>${esc(localPathOf(t))}</span>
        <span>${esc(t.userName || t.userEmail || "")}</span>
        <span>${esc(fmtDate(t.createdAt))}</span>
      </div>
      <p class="suporte-desc">${esc(t.descricao)}</p>
      ${imgs.length ? `<div class="suporte-preview-list">${imgs.map(im =>
        `<a class="suporte-thumb" href="${esc(im.url)}" target="_blank" rel="noopener"><img src="${esc(im.url)}" alt="${esc(im.name || "")}"></a>`
      ).join("")}</div>` : ""}
      <div class="suporte-thread">
        ${msgs.length ? msgs.map(m => `
          <div class="suporte-msg ${m.papel === "admin" ? "admin" : "user"}">
            <strong>${esc(m.autorNome || m.papel)} · ${esc(fmtDate(m.at))}</strong>
            <p>${esc(m.texto)}</p>
          </div>`).join("") : `<p class="suporte-hint">Ainda não há respostas.</p>`}
      </div>`;
  }

  async function loadTicket(id) {
    const { db, c } = fb();
    const snap = await c.getDoc(c.doc(db, COLLECTION, id));
    if (!snap.exists()) throw new Error("Chamado não encontrado.");
    return Object.assign({ id: snap.id }, snap.data());
  }

  async function openDetail(id, ctx) {
    ensureShell();
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-hint">Carregando…</p></div>`;
    openModal();
    try {
      const t = await loadTicket(id);
      const mine = !!(ctx && ctx.mine);
      const adminView = !!(ctx && ctx.admin) || (isAdmin() && !mine);
      const canReplyUser = mine || userKey() === String(t.userId || "").toLowerCase() || userKey() === String(t.userEmail || "").toLowerCase();
      box.innerHTML = `
        <div class="suporte-modal-head">
          <h2><i data-lucide="message-square"></i> Chamado</h2>
          <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
        </div>
        <div class="suporte-modal-body" id="suporte-detail-body">${threadHtml(t)}</div>
        <div class="suporte-modal-foot suporte-reply-foot">
          <textarea id="suporte-reply" class="form-control" rows="3" placeholder="${adminView ? "Resposta ou pedido de mais informações" : "Sua resposta"}"></textarea>
          <div class="suporte-reply-actions">
            ${adminView ? `
              <button type="button" class="btn btn-cancel" id="suporte-back-admin">Voltar</button>
              <button type="button" class="btn btn-outline" id="suporte-ask-info">Solicitar mais informações</button>
              <button type="button" class="btn btn-primary" id="suporte-mark-done">Marcar como atendido</button>
              <button type="button" class="btn btn-primary" id="suporte-send-admin">Enviar resposta</button>
            ` : `
              <button type="button" class="btn btn-cancel" id="suporte-back-mine">Voltar</button>
              ${canReplyUser && t.status !== "atendido" ? `<button type="button" class="btn btn-primary" id="suporte-send-user">Responder</button>` : ""}
            `}
          </div>
        </div>`;
      document.getElementById("suporte-close-x").onclick = closeModal;
      const backAdmin = document.getElementById("suporte-back-admin");
      if (backAdmin) backAdmin.onclick = () => { closeModal(); };
      const backMine = document.getElementById("suporte-back-mine");
      if (backMine) backMine.onclick = () => openMine();
      const sendUser = document.getElementById("suporte-send-user");
      if (sendUser) sendUser.onclick = () => replyTicket(id, { asAdmin: false, status: "pendente" });
      const sendAdmin = document.getElementById("suporte-send-admin");
      if (sendAdmin) sendAdmin.onclick = () => replyTicket(id, { asAdmin: true, status: "em_atendimento" });
      const ask = document.getElementById("suporte-ask-info");
      if (ask) ask.onclick = () => replyTicket(id, { asAdmin: true, status: "aguardando_usuario", requireText: true });
      const done = document.getElementById("suporte-mark-done");
      if (done) done.onclick = () => replyTicket(id, { asAdmin: true, status: "atendido", allowEmpty: true });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-empty">${esc(err.message)}</p></div>
        <div class="suporte-modal-foot"><button type="button" class="btn btn-cancel" onclick="document.getElementById('suporte-overlay').style.display='none'">Fechar</button></div>`;
    }
  }

  async function replyTicket(id, opts) {
    const text = String((document.getElementById("suporte-reply") || {}).value || "").trim();
    if (!opts.allowEmpty && !text) {
      alert(opts.requireText ? "Escreva o que precisa do usuário." : "Escreva a mensagem.");
      return;
    }
    try {
      const t = await loadTicket(id);
      const u = currentUser();
      const mensagens = Array.isArray(t.mensagens) ? t.mensagens.slice() : [];
      if (text) {
        mensagens.push({
          autorNome: u.name || (opts.asAdmin ? "Administrador" : "Usuário"),
          autorEmail: String(u.email || "").toLowerCase(),
          papel: opts.asAdmin ? "admin" : "usuario",
          texto: text,
          at: new Date().toISOString()
        });
      }
      const { db, c } = fb();
      await c.updateDoc(c.doc(db, COLLECTION, id), {
        mensagens,
        status: opts.status || t.status,
        updatedAt: new Date().toISOString()
      });
      if (opts.asAdmin) {
        closeModal();
        if (window.activeAppTab === "suporte") renderAdmin();
        alert("Atualizado.");
      } else {
        await openDetail(id, { mine: true });
      }
    } catch (err) {
      alert("Não foi possível responder: " + (err.message || err));
    }
  }

  function pendingStatuses() {
    return { pendente: true, aguardando_usuario: true, em_atendimento: true };
  }

  function filterAdmin(list, filtro) {
    if (filtro === "pendentes") return list.filter(t => pendingStatuses()[t.status]);
    if (filtro === "atendidos") return list.filter(t => t.status === "atendido");
    return list;
  }

  async function renderAdmin() {
    const root = document.getElementById("suporte-admin-root");
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = `<p class="suporte-empty">Sem permissão para o módulo de suporte.</p>`;
      return;
    }
    root.innerHTML = `<p class="suporte-hint">Carregando chamados…</p>`;
    try {
      adminListCache = await listAll();
    } catch (err) {
      root.innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
      return;
    }
    const pend = adminListCache.filter(t => pendingStatuses()[t.status]).length;
    const done = adminListCache.filter(t => t.status === "atendido").length;
    const shown = filterAdmin(adminListCache, adminFilter);
    root.innerHTML = `
      <div class="suporte-admin-bar">
        <div class="suporte-kpis">
          <div class="est-kpi"><span>Pendentes</span><strong>${pend}</strong></div>
          <div class="est-kpi"><span>Atendidos</span><strong>${done}</strong></div>
          <div class="est-kpi"><span>Total</span><strong>${adminListCache.length}</strong></div>
        </div>
        <div class="suporte-admin-actions">
          <button type="button" class="btn btn-primary" id="suporte-admin-new">Novo chamado interno</button>
        </div>
      </div>
      <div class="suporte-filters">
        <button type="button" class="suporte-chip${adminFilter === "pendentes" ? " active" : ""}" data-f="pendentes">Pendentes</button>
        <button type="button" class="suporte-chip${adminFilter === "atendidos" ? " active" : ""}" data-f="atendidos">Atendidos</button>
        <button type="button" class="suporte-chip${adminFilter === "todos" ? " active" : ""}" data-f="todos">Todos</button>
      </div>
      ${listHtml(shown, "Nenhum chamado neste filtro.")}`;
    root.querySelectorAll(".suporte-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        adminFilter = btn.getAttribute("data-f");
        renderAdmin();
      });
    });
    const neu = document.getElementById("suporte-admin-new");
    if (neu) neu.onclick = () => openForm("interno");
    root.querySelectorAll(".suporte-card").forEach(el => {
      el.addEventListener("click", () => openDetail(el.getAttribute("data-id"), { admin: true }));
    });
  }

  function onMenuClick(action) {
    toggleMenu(false);
    if (action === "problema") openForm("problema");
    else if (action === "melhoria") openForm("melhoria");
    else if (action === "meus") openMine();
  }

  function initWidget() {
    const btn = document.getElementById("suporte-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    document.getElementById("suporte-menu").querySelectorAll("button[data-action]").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onMenuClick(b.getAttribute("data-action"));
      });
    });
    document.addEventListener("click", () => toggleMenu(false));
    if (window.lucide) lucide.createIcons();
  }

  document.addEventListener("tabChanged", (e) => {
    if (e.detail === "suporte") renderAdmin();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
  window.SuporteApp = { renderAdmin, openForm, isAdmin, openMine };
})();
