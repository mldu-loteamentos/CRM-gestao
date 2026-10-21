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
    { id: "ficha-compradores", label: "Compradores" },
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
    { id: "engenharia", label: "Engenharia", subs: [
      { id: "caucao", label: "Gestão de caução" },
      { id: "config", label: "Configurações" }
    ]},
    { id: "vistoria", label: "Vistoria" },
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
        { id: "elegiveis-entrada", label: "Elegíveis Pgto Entrada" },
        { id: "elegiveis-61", label: "Demais clientes elegíveis" }
      ]},
      { id: "config_cr", label: "Configurações (CR)", abas: [
        { id: "regra-regua", label: "Régua de Cobrança" },
        { id: "regra-judiciais", label: "Etapas Judiciais" },
        { id: "regra-financiamento", label: "Etapas Financiamento" },
        { id: "regra-atribuicao", label: "Atribuição de Operadores" },
        { id: "regra-negociacao", label: "Regras de Negociação" },
        { id: "regra-fila", label: "Fila de Cobrança" },
        { id: "regra-cartao", label: "Cartão de Crédito" },
        { id: "regra-alcada", label: "Alçada para Desconto" },
        { id: "regra-honorarios-internos", label: "Honorários internos" }
      ]},
      { id: "extrato", label: "Extrato" },
      { id: "mapa", label: "Mapa jurídico" },
      { id: "detalhes_cliente", label: "Detalhes do cliente", abas: ABAS_DETALHES, abaObrigatoria: true },
      { id: "renegociacao", label: "Renegociação" },
      { id: "distrato", label: "Distrato" },
      { id: "cp_assistente", label: "Assistente de Contas a Pagar" },
      { id: "gerar_pagamento", label: "Gerar Pagamento" },
      { id: "titulos_incompletos", label: "Títulos incompletos" },
      { id: "rydoo", label: "Rydoo" },
      { id: "prestacao_contas", label: "Prestação de contas · Nova prestação" },
      { id: "param_parceiro", label: "Prestação de contas · Configurações" },
      { id: "investimento", label: "Aplicações e Investimentos" },
      { id: "fluxo_caixa", label: "Fluxo de caixa (DFC)" },
      { id: "fluxo_diario", label: "Fluxo de caixa diário" },
      { id: "resultado_caixa", label: "Resultado de caixa" },
      { id: "financiamento", label: "Financiamento" },
      { id: "repactuacao", label: "Repactuação" }
    ]},
    { id: "fiscal", label: "Fiscal", subs: [
      { id: "pis_cofins", label: "Calcular impostos" },
      { id: "enviar_nota", label: "Enviar nota" },
      { id: "inserir_nota", label: "Validar nota" },
      { id: "rastrear_pedido", label: "Rastrear pedido" }
    ]},
    { id: "gerencial", label: "Gerencial", subs: [
      { id: "participacoes", label: "Prestação contas Ellenco" },
      { id: "estrutura", label: "Organograma Societário" }
    ]},
    { id: "comercial", label: "Comercial", subs: [
      { id: "dash_com", label: "Dashboard" },
      { id: "estoque", label: "Posição de estoque" },
      { id: "anexos", label: "Assistente de Anexos" },
      { id: "condicoes", label: "Condições de Pagamento" },
      { id: "tabelas", label: "Tabelas vigentes" }
    ]},
    { id: "marketing", label: "Marketing", subs: [
      { id: "budget", label: "Budget" },
      { id: "eventos", label: "Eventos" },
      { id: "config", label: "Configurações" }
    ]},
    { id: "relacionamento", label: "Relacionamento", subs: [
      { id: "buscar", label: "Buscar Cliente" },
      { id: "autorizacao", label: "Autorização de escritura" },
      { id: "terceiros", label: "Autorização de terceiros" },
      { id: "vencimento", label: "Alteração de vencimento" }
    ]},
    { id: "compromissario", label: "Compromissário", subs: [
      { id: "prefeitura", label: "Prefeitura" },
      { id: "associacoes", label: "Associações" }
    ]},
    { id: "seguranca", label: "Segurança", subs: [
      { id: "auditoria", label: "Auditoria do Sistema" },
      { id: "auditoria_login", label: "Auditoria do Login Sienge" },
      { id: "consumo", label: "Consumo de API" },
      { id: "usuarios_online", label: "Usuários online" }
    ]},
    { id: "suporte", label: "Suporte" },
    { id: "configuracoes", label: "Configurações gerais", subs: [
      { id: "centro_custo", label: "Centro de Custo" },
      { id: "doc_padrao", label: "Documentos Padrões" },
      { id: "empresas", label: "Empresas" },
      { id: "indexadores", label: "Indexadores" },
      { id: "motivos_cancelamento", label: "Motivos de cancelamento" },
      { id: "plano_financeiro", label: "Plano Financeiro e Visões" },
      { id: "preambulos", label: "Preâmbulos" },
      { id: "upload_mapa", label: "Projeto Urbanístico" },
      { id: "tags", label: "Tags de Anexos" },
      { id: "documentos", label: "Tipos de Documento" },
      { id: "upload_kmz", label: "Upload de KMZ" },
      { id: "usuarios", label: "Usuários e Perfis" }
    ]},
    { id: "outro", label: "Outro / Geral" }
  ];

  const TAB_TO_LOC = {
    "construcao-home": { modulo: "home" },
    "construcao-engenharia": { modulo: "engenharia", subitem: "caucao" },
    "engenharia-caucao": { modulo: "engenharia", subitem: "caucao" },
    "engenharia-custo-obra": { modulo: "engenharia", subitem: "custo_obra" },
    "engenharia-config": { modulo: "engenharia", subitem: "config" },
    vistoria: { modulo: "vistoria" },
    "construcao-compras": { modulo: "compras" },
    "compras-controle": { modulo: "compras", subitem: "controle_financeiro" },
    "compras-previsoes": { modulo: "compras", subitem: "previsoes" },
    "compras-config": { modulo: "compras", subitem: "config" },
    dashboard: { modulo: "financeiro", subitem: "fila" },
    inadimplencia_dashboard: { modulo: "financeiro", subitem: "dashboard" },
    agenda: { modulo: "financeiro", subitem: "agenda" },
    zeropaid: { modulo: "financeiro", subitem: "zeropaid" },
    subjudice: { modulo: "financeiro", subitem: "subjudice" },
    wesend: { modulo: "financeiro", subitem: "notificacoes" },
    configuracoes: { modulo: "financeiro", subitem: "config_cr" },
    "contas-pagar": { modulo: "financeiro", subitem: "cp_assistente" },
    "gerar-pagamento": { modulo: "financeiro", subitem: "gerar_pagamento" },
    "titulos-incompletos": { modulo: "financeiro", subitem: "titulos_incompletos" },
    rydoo: { modulo: "financeiro", subitem: "rydoo" },
    "prestacao-contas": { modulo: "financeiro", subitem: "prestacao_contas" },
    "parametrizacao-parceiro": { modulo: "financeiro", subitem: "param_parceiro" },
    "construcao-caixa": { modulo: "financeiro", subitem: "caixa_mov" },
    "fluxo-caixa": { modulo: "financeiro", subitem: "fluxo_caixa" },
    "fluxo-caixa-diario": { modulo: "financeiro", subitem: "fluxo_diario" },
    "resultado-caixa": { modulo: "financeiro", subitem: "resultado_caixa" },
    investimento: { modulo: "financeiro", subitem: "investimento" },
    "repactuacao-lote": { modulo: "financeiro", subitem: "repactuacao" },
    "construcao-fiscal": { modulo: "fiscal", subitem: "pis_cofins" },
    "construcao-fiscal-csll": { modulo: "fiscal", subitem: "pis_cofins" },
    "fiscal-inserir-nota": { modulo: "fiscal", subitem: "inserir_nota" },
    "fiscal-enviar-nota": { modulo: "fiscal", subitem: "enviar_nota" },
    "fiscal-rastrear-pedido": { modulo: "fiscal", subitem: "rastrear_pedido" },
    participacoes: { modulo: "gerencial", subitem: "participacoes" },
    "estrutura-societaria": { modulo: "gerencial", subitem: "estrutura" },
    "dashboard-comercial": { modulo: "comercial", subitem: "dash_com" },
    "estoque-comercial": { modulo: "comercial", subitem: "estoque" },
    anexos: { modulo: "comercial", subitem: "anexos" },
    "condicoes-pagamento": { modulo: "comercial", subitem: "condicoes" },
    "tabelas-vigentes": { modulo: "comercial", subitem: "tabelas" },
    "controle-comissao": { modulo: "comercial", subitem: "comissao" },
    "marketing-eventos": { modulo: "marketing", subitem: "eventos" },
    "marketing-budget": { modulo: "marketing", subitem: "budget" },
    "marketing-config": { modulo: "marketing", subitem: "config" },
    relacionamento_gestao: { modulo: "relacionamento", subitem: "buscar" },
    relacionamento_autorizacao: { modulo: "relacionamento", subitem: "autorizacao" },
    relacionamento_cessao: { modulo: "relacionamento", subitem: "cessao" },
    compromissario_prefeitura: { modulo: "compromissario", subitem: "prefeitura" },
    compromissario_associacoes: { modulo: "compromissario", subitem: "associacoes" },
    auditoria: { modulo: "seguranca", subitem: "auditoria" },
    "auditoria-login": { modulo: "seguranca", subitem: "auditoria_login" },
    "consumo-api": { modulo: "seguranca", subitem: "consumo" },
    "usuarios-online": { modulo: "seguranca", subitem: "usuarios_online" },
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
    indexadores: { modulo: "configuracoes", subitem: "indexadores" },
    "motivos-cancelamento": { modulo: "configuracoes", subitem: "motivos_cancelamento" },
    "documentos-sienge": { modulo: "configuracoes", subitem: "documentos" }
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
  let replyDraftFiles = [];
  let adminFilter = "pendentes";
  let adminListCache = [];
  let ticketsCache = [];
  const ticketMap = {};
  let mineFilter = "abertos";

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
      const ficha = document.querySelector(".ficha-tabs .ml-tab.is-active");
      const cust = document.querySelector(".ficha-contrato-tabs .ml-tab.is-active");
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
      const isImg = String(raw.type || "").startsWith("image/");
      const file = isImg ? await compressImage(raw) : raw;
      const safe = String(file.name || "anexo").replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `suporte/${ticketId}/${Date.now()}_${i}_${safe}`;
      const storageRef = refFunc(window.firebaseStorage, path);
      await uploadBytesFunc(storageRef, file);
      const url = await getDownloadURLFunc(storageRef);
      out.push({ url, name: raw.name || safe, type: raw.type || file.type || "" });
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

  function ticketTime(v) {
    if (!v) return 0;
    try {
      const d = v.toDate ? v.toDate() : new Date(v);
      const n = d.getTime();
      return Number.isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function seenStorageKey() {
    return "crm_suporte_seen_" + (userKey() || "anon");
  }

  function loadSeenMap() {
    try {
      return JSON.parse(localStorage.getItem(seenStorageKey()) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveSeenMap(map) {
    try { localStorage.setItem(seenStorageKey(), JSON.stringify(map || {})); } catch (e) {}
  }

  function lastAdminActivityAt(t) {
    if (!t) return 0;
    const msgs = Array.isArray(t.mensagens) ? t.mensagens : [];
    let max = 0;
    msgs.forEach((m) => {
      if (!m || m.papel !== "admin") return;
      const at = ticketTime(m.at);
      if (at > max) max = at;
    });
    if (t.status === "aguardando_usuario" || t.status === "em_atendimento") {
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      if (!last || last.papel === "admin") {
        const upd = ticketTime(t.updatedAt);
        if (upd > max) max = upd;
      }
    }
    return max;
  }

  function ticketHasUnread(t) {
    if (!t || t.status === "atendido") return false;
    const adminAt = lastAdminActivityAt(t);
    if (!adminAt) return false;
    const seenAt = ticketTime(loadSeenMap()[t.id]);
    return adminAt > seenAt;
  }

  function markTicketSeen(t) {
    if (!t || !t.id) return;
    const map = loadSeenMap();
    const at = Math.max(ticketTime(t.updatedAt), lastAdminActivityAt(t), Date.now());
    map[t.id] = new Date(at).toISOString();
    saveSeenMap(map);
    refreshUnreadBadge();
  }

  function adminSeenStorageKey() {
    return "crm_suporte_admin_seen_" + (userKey() || "anon");
  }

  function loadAdminSeenMap() {
    try {
      return JSON.parse(localStorage.getItem(adminSeenStorageKey()) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveAdminSeenMap(map) {
    try { localStorage.setItem(adminSeenStorageKey(), JSON.stringify(map || {})); } catch (e) {}
  }

  function ensureAdminSeenBaseline(tickets) {
    const flag = "crm_suporte_admin_baseline_" + (userKey() || "anon");
    try {
      if (localStorage.getItem(flag) === "1") return;
      const map = loadAdminSeenMap();
      (tickets || []).forEach((t) => {
        if (!t || !t.id || map[t.id]) return;
        map[t.id] = t.createdAt || t.updatedAt || new Date().toISOString();
      });
      saveAdminSeenMap(map);
      localStorage.setItem(flag, "1");
    } catch (e) {}
  }

  function ticketIsNewForAdmin(t) {
    if (!t || t.createdByAdmin || t.status !== "pendente") return false;
    const key = userKey();
    if (key && (String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key)) return false;
    const seen = ticketTime(loadAdminSeenMap()[t.id]);
    if (!seen) return true;
    return ticketTime(t.createdAt) > seen;
  }

  function markAdminTicketSeen(t) {
    if (!t || !t.id) return;
    const map = loadAdminSeenMap();
    map[t.id] = new Date().toISOString();
    saveAdminSeenMap(map);
    refreshUnreadBadge();
  }

  function isTicketArquivado(t) {
    return !!(t && t.arquivadoAt) && t.status === "atendido";
  }

  function unreadPill(n) {
    return n > 9 ? "9+" : String(n);
  }

  function ensureAdminInboxButton() {
    const menu = document.getElementById("suporte-menu");
    if (!menu) return null;
    let btn = menu.querySelector('button[data-action="recebidos"]');
    if (!isAdmin()) {
      if (btn) btn.remove();
      return null;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-action", "recebidos");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onMenuClick("recebidos");
      });
      menu.insertBefore(btn, menu.firstChild);
    }
    return btn;
  }

  function applyAdminNavBadge(count) {
    const n = Number(count) || 0;
    const li = document.querySelector('.nav-item[data-tab="suporte"]');
    if (!li) return;
    const link = li.querySelector("a");
    if (!link) return;
    li.classList.toggle("has-new-tickets", n > 0);
    let badge = link.querySelector(".suporte-nav-badge");
    if (n <= 0) {
      if (badge) badge.remove();
      link.setAttribute("title", "Suporte");
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "suporte-nav-badge";
      link.appendChild(badge);
    }
    badge.textContent = unreadPill(n);
    link.setAttribute("title", `Suporte — ${n} chamado${n === 1 ? " novo" : "s novos"}`);
  }

  function applyUnreadUi(userCount, adminCount) {
    const u = Number(userCount) || 0;
    const a = Number(adminCount) || 0;
    const n = u + a;
    const btn = document.getElementById("suporte-btn");
    const badge = document.getElementById("suporte-fab-badge");
    const meus = document.querySelector('#suporte-menu button[data-action="meus"]');
    const recebidos = ensureAdminInboxButton();
    if (btn) {
      btn.classList.toggle("has-unread", n > 0);
      const parts = [];
      if (a > 0) parts.push(`${a} chamado${a === 1 ? " novo" : "s novos"}`);
      if (u > 0) parts.push(`${u} com nova mensagem`);
      const title = parts.length ? `Suporte — ${parts.join(" · ")}` : "Suporte";
      btn.setAttribute("title", title);
      btn.setAttribute("aria-label", title);
    }
    if (badge) {
      badge.hidden = n <= 0;
      badge.textContent = unreadPill(n);
    }
    if (meus) {
      meus.classList.toggle("has-unread", u > 0);
      const label = "Acompanhar meus chamados";
      meus.innerHTML = u > 0
        ? `${label}<span class="suporte-menu-unread">${unreadPill(u)}</span>`
        : label;
    }
    if (recebidos) {
      recebidos.classList.toggle("has-unread", a > 0);
      const label = "Chamados recebidos";
      recebidos.innerHTML = a > 0
        ? `${label}<span class="suporte-menu-unread">${unreadPill(a)}</span>`
        : label;
    }
    applyAdminNavBadge(a);
  }

  let unreadRefreshSeq = 0;
  function rememberTickets(list) {
    ticketsCache = Array.isArray(list) ? list.slice() : [];
    ticketsCache.forEach((t) => { if (t && t.id) ticketMap[t.id] = t; });
  }

  function ticketById(id) {
    return ticketMap[id] || ticketsCache.find((t) => t && t.id === id) || adminListCache.find((t) => t && t.id === id) || null;
  }

  function applyUnreadFrom(all) {
    if (isAdmin()) ensureAdminSeenBaseline(all);
    const key = userKey();
    const mine = all.filter(t => String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key);
    applyUnreadUi(mine.filter(ticketHasUnread).length, isAdmin() ? all.filter(ticketIsNewForAdmin).length : 0);
  }

  async function refreshUnreadBadge(forceNetwork) {
    const seq = ++unreadRefreshSeq;
    if (!userKey() || !window.firebaseDb) {
      applyUnreadUi(0);
      return;
    }
    if (!forceNetwork && ticketsCache.length) {
      applyUnreadFrom(ticketsCache);
      return;
    }
    try {
      const all = await listAll();
      if (seq !== unreadRefreshSeq) return;
      applyUnreadFrom(all);
      if (isAdmin() && window.activeAppTab === "suporte") {
        const ov = document.getElementById("suporte-overlay");
        if (!ov || ov.style.display === "none") {
          adminListCache = all;
          paintAdmin();
        }
      }
    } catch (e) {
      if (seq !== unreadRefreshSeq) return;
    }
  }

  function scheduleUnreadPoll() {
    if (window._suporteUnreadTimer) return;
    window._suporteUnreadTimer = setInterval(() => {
      if (document.hidden) return;
      refreshUnreadBadge(true);
    }, 30000);
  }

  function startUnreadWatch() {
    if (window._suporteUnreadWatchStarted) return;
    window._suporteUnreadWatchStarted = true;
    refreshUnreadBadge();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshUnreadBadge();
    });
    try {
      const { db, c } = fb();
      if (c.onSnapshot) {
        let snapTimer = null;
        window._suporteUnreadUnsub = c.onSnapshot(
          c.collection(db, COLLECTION),
          (snap) => {
            const list = [];
            snap.forEach((d) => list.push(ticketFromSnap(d)));
            list.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => {
              rememberTickets(list);
              applyUnreadFrom(list);
              if (isAdmin() && window.activeAppTab === "suporte") {
                const ov = document.getElementById("suporte-overlay");
                if (!ov || ov.style.display === "none") {
                  adminListCache = list;
                  paintAdmin();
                }
              }
            }, 600);
          },
          () => { scheduleUnreadPoll(); }
        );
        return;
      }
    } catch (e) {}
    scheduleUnreadPoll();
  }

  function startUnreadWatchWhenReady() {
    const tryStart = () => {
      if (!userKey() || !window.firebaseDb || !window.firebaseCollections) {
        setTimeout(tryStart, 1200);
        return;
      }
      startUnreadWatch();
    };
    tryStart();
  }

  function ensureShell() {
    if (document.getElementById("suporte-overlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "suporte-overlay";
    wrap.className = "suporte-overlay";
    wrap.style.display = "none";
    wrap.innerHTML = `<div class="suporte-modal" id="suporte-modal-box" role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(wrap);
  }

  function closeModal() {
    const ov = document.getElementById("suporte-overlay");
    if (ov) ov.style.display = "none";
    const box = document.getElementById("suporte-modal-box");
    if (box) box.classList.remove("is-detail");
    draftFiles = [];
    replyDraftFiles = [];
    pasteOpts = null;
    if (userKey() && window.firebaseDb) refreshUnreadBadge();
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

  function renderPreviews(opts) {
    opts = opts || {};
    const listId = opts.listId || "suporte-preview-list";
    const files = opts.files || draftFiles;
    const box = document.getElementById(listId);
    if (!box) return;
    if (!files.length) {
      box.innerHTML = `<span class="suporte-hint">${opts.emptyHint || "Nenhuma imagem selecionada."}</span>`;
      return;
    }
    box.innerHTML = files.map((f, i) => {
      const isImg = String(f.type || "").startsWith("image/");
      const url = isImg ? URL.createObjectURL(f) : "";
      return `<div class="suporte-thumb${isImg ? "" : " is-file"}">
        ${isImg ? `<img src="${url}" alt="">` : `<span class="suporte-file-chip" title="${esc(f.name)}">${esc((f.name || "arquivo").slice(0, 18))}</span>`}
        <button type="button" class="suporte-thumb-x" data-i="${i}" title="Remover">×</button>
      </div>`;
    }).join("");
    box.querySelectorAll(".suporte-thumb-x").forEach(btn => {
      btn.addEventListener("click", () => {
        files.splice(Number(btn.getAttribute("data-i")), 1);
        renderPreviews(opts);
      });
    });
  }

  let pasteOpts = null;

  function clipboardImages(e) {
    const cd = e && e.clipboardData;
    if (!cd) return [];
    const out = [];
    const items = cd.items ? Array.from(cd.items) : [];
    items.forEach((item) => {
      if (!item || item.kind !== "file") return;
      const file = item.getAsFile();
      if (!file) return;
      const type = String(file.type || item.type || "");
      if (!type.startsWith("image/")) return;
      out.push(file);
    });
    if (out.length) return out;
    return Array.from(cd.files || []).filter((f) => String(f.type || "").startsWith("image/"));
  }

  function printFileName(file, index) {
    const type = String((file && file.type) || "image/png");
    const given = String((file && file.name) || "");
    if (given && !/^(image|blob|screenshot)(\.[a-z0-9]+)?$/i.test(given)) return file;
    const ext = /jpeg|jpg/i.test(type) ? "jpg" : /webp/i.test(type) ? "webp" : /gif/i.test(type) ? "gif" : "png";
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return new File([file], "print-" + stamp + (index ? "-" + (index + 1) : "") + "." + ext, { type: type || "image/png" });
  }

  function pushDraftFiles(list, added, opts) {
    let changed = false;
    for (let i = 0; i < added.length; i++) {
      const f = printFileName(added[i], list.length);
      const isImg = String(f.type || "").startsWith("image/");
      const isPdf = String(f.type || "") === "application/pdf" || /\.pdf$/i.test(f.name || "");
      if (!isImg && !(opts.allowDocs && isPdf)) continue;
      if (f.size > MAX_BYTES) {
        alert("O arquivo \"" + (f.name || "print") + "\" passa de 6 MB.");
        continue;
      }
      if (list.length >= MAX_IMAGES) {
        alert("Limite de " + MAX_IMAGES + " anexos por envio.");
        break;
      }
      list.push(f);
      changed = true;
    }
    if (changed) renderPreviews(opts);
  }

  function bindFileInput(opts) {
    opts = opts || {};
    const inputId = opts.inputId || "suporte-files";
    const files = opts.files || draftFiles;
    const allowDocs = !!opts.allowDocs;
    pasteOpts = opts;
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("change", () => {
      pushDraftFiles(files, Array.from(input.files || []), opts);
      input.value = "";
    });
  }

  document.addEventListener("paste", (e) => {
    const ov = document.getElementById("suporte-overlay");
    if (!ov || ov.style.display === "none" || !pasteOpts) return;
    const imgs = clipboardImages(e);
    if (!imgs.length) return;
    e.preventDefault();
    pushDraftFiles(pasteOpts.files || draftFiles, imgs, pasteOpts);
  });

  function formHtml(opts) {
    const title = opts.tipo === "melhoria" ? "Sugerir uma melhoria"
      : opts.tipo === "interno" ? "Novo chamado interno"
      : "Relatar um problema";
    const imgReq = opts.tipo !== "interno";
    const loc = suggestLocation();
    return `
      <div class="suporte-modal-head">
        <h2><i data-lucide="life-buoy"></i> ${esc(title)}</h2>
        <button type="button" class="btn btn-fechar" id="suporte-close-x">Fechar</button>
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
          <label>Prints / imagens ${imgReq ? "*" : "(opcional)"}</label>
          <input type="file" id="suporte-files" class="form-control" accept="image/*" multiple>
          <div id="suporte-preview-list" class="suporte-preview-list"></div>
          <small class="suporte-hint">Pode selecionar vários arquivos (até ${MAX_IMAGES}) ou colar um print com Ctrl+V. ${imgReq ? "Pelo menos um print é obrigatório." : ""}</small>
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
      const msg = String((err && err.message) || err || "");
      const isPerm = /insufficient permissions|permission-denied|PERMISSION_DENIED/i.test(msg)
        || (err && err.code === "permission-denied");
      if (isPerm) {
        try {
          queuePendingTicket({
            tipo,
            modulo,
            subitem,
            aba,
            subitemLabel: subObj ? subObj.label : "",
            abaLabel: (findAba(modulo, subitem, aba) || {}).label || "",
            localPath: localPathOf({ modulo, subitem, aba }),
            descricao,
            filesCount: draftFiles.length,
            userName: (currentUser() || {}).name || "",
            userEmail: String((currentUser() || {}).email || "").toLowerCase(),
            createdAt: new Date().toISOString()
          });
        } catch (e) {}
        const mailOk = openTicketMailtoFallback({
          tipo,
          modulo,
          subitem,
          aba,
          descricao,
          filesCount: draftFiles.length
        });
        alert(
          "O Firebase bloqueou o envio do chamado (regras de segurança / Missing or insufficient permissions).\n\n"
          + "O chamado ficou salvo neste navegador para não se perder"
          + (mailOk ? " e o e-mail de suporte foi aberto com o texto." : ".")
          + "\n\nPeça ao administrador liberar escrita na collection \"suporte_chamados\" (e Storage em suporte/) no Console do Firebase."
        );
      } else {
        alert("Não foi possível enviar o chamado: " + msg);
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar";
      }
    }
  }

  function queuePendingTicket(ticket) {
    const key = "crm_suporte_pending";
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || "[]") || []; } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list.unshift(Object.assign({ id: "local-" + Date.now() }, ticket));
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  }

  function openTicketMailtoFallback(ticket) {
    try {
      const to = "israel@mouraleite.com.br";
      const tipoLabel = TIPO_LABEL[ticket.tipo] || ticket.tipo || "Chamado";
      const subject = encodeURIComponent(`[CRM Suporte] ${tipoLabel} — ${ticket.modulo || ""}`);
      const body = encodeURIComponent(
        `Tipo: ${tipoLabel}\n`
        + `Módulo: ${ticket.modulo || ""}\n`
        + `Subitem: ${ticket.subitem || ""}\n`
        + `Aba: ${ticket.aba || ""}\n`
        + `Usuário: ${(currentUser() || {}).name || ""} <${(currentUser() || {}).email || ""}>\n`
        + `Prints anexados no formulário: ${ticket.filesCount || 0} (reenvie manualmente se necessário)\n\n`
        + `Descrição:\n${ticket.descricao || ""}\n`
      );
      const a = document.createElement("a");
      a.href = `mailto:${to}?subject=${subject}&body=${body}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) {
      return false;
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
    rememberTickets(list);
    return list;
  }

  function withTimeout(promise, ms, msg) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(msg)), ms);
      promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
  }

  async function listMine() {
    const all = await listAll();
    const key = userKey();
    return all.filter(t => String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key);
  }

  function listHtml(tickets, emptyMsg, opts) {
    if (!tickets.length) return `<p class="suporte-empty">${esc(emptyMsg)}</p>`;
    const markUnread = !!(opts && opts.unread);
    const markAdminNew = !!(opts && opts.adminNew);
    const archiveMode = (opts && opts.archiveMode) || "";
    return `<div class="suporte-list">${tickets.map(t => {
      const unread = markUnread && ticketHasUnread(t);
      const isNew = markAdminNew && ticketIsNewForAdmin(t);
      const arquivar = archiveMode === "archive" && t.status === "atendido" && !t.arquivadoAt;
      const desarquivar = archiveMode === "unarchive" && !!t.arquivadoAt;
      const flag = unread
        ? `<span class="suporte-badge new">Nova mensagem</span>`
        : isNew ? `<span class="suporte-badge new">Novo</span>` : "";
      const action = arquivar || desarquivar ? `
        <div class="suporte-card-actions">
          <button type="button" class="btn btn-outline suporte-arquivar" data-id="${esc(t.id)}" data-on="${arquivar ? "1" : "0"}">
            <i data-lucide="${arquivar ? "archive" : "archive-restore"}"></i> ${arquivar ? "Arquivar" : "Desarquivar"}
          </button>
        </div>` : "";
      return `
      <div class="suporte-card${unread || isNew ? " has-unread" : ""}">
        <button type="button" class="suporte-card-hit" data-id="${esc(t.id)}">
          <div class="suporte-card-top">
            <strong>${esc(TIPO_LABEL[t.tipo] || t.tipo)} · ${esc(localPathOf(t))}</strong>
            <span style="display:inline-flex;align-items:center;gap:6px;">
              ${flag}
              ${statusBadge(t.status)}
            </span>
          </div>
          <p>${esc((t.descricao || "").slice(0, 160))}${(t.descricao || "").length > 160 ? "…" : ""}</p>
          <small>${esc(t.userName || t.userEmail || "")} · ${esc(fmtDate(t.updatedAt || t.createdAt))}</small>
        </button>
        ${action}
      </div>`;
    }).join("")}</div>`;
  }

  function bindTicketCards(root, ctx) {
    if (!root) return;
    root.querySelectorAll(".suporte-card-hit").forEach(el => {
      el.addEventListener("click", () => openDetail(el.getAttribute("data-id"), ctx));
    });
    root.querySelectorAll(".suporte-arquivar").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          await setArquivado(btn.getAttribute("data-id"), btn.getAttribute("data-on") === "1");
          await paintMine();
        } catch (err) {
          btn.disabled = false;
          alert("Não foi possível atualizar o chamado: " + (err.message || err));
        }
      });
    });
  }

  async function setArquivado(id, arquivar) {
    const { db, c } = fb();
    await c.updateDoc(c.doc(db, COLLECTION, id), {
      arquivadoAt: arquivar ? new Date().toISOString() : null,
      arquivadoPor: arquivar ? userKey() : ""
    });
  }

  async function openMine() {
    ensureShell();
    const box = document.getElementById("suporte-modal-box");
    box.classList.remove("is-detail");
    box.innerHTML = `
      <div class="suporte-modal-head">
        <h2><i data-lucide="ticket"></i> Meus chamados</h2>
        <button type="button" class="btn btn-fechar" id="suporte-close-x">Fechar</button>
      </div>
      <div class="suporte-modal-body" id="suporte-mine-body"><p class="suporte-hint">Carregando…</p></div>
      <div class="suporte-modal-foot">
        <button type="button" class="btn btn-fechar" id="suporte-cancel">Fechar</button>
      </div>`;
    openModal();
    document.getElementById("suporte-close-x").onclick = closeModal;
    document.getElementById("suporte-cancel").onclick = closeModal;
    await paintMine();
  }

  async function paintMine() {
    const body = document.getElementById("suporte-mine-body");
    if (!body) return;
    try {
      const tickets = await listMine();
      const abertos = tickets.filter(t => !isTicketArquivado(t));
      const arquivados = tickets.filter(isTicketArquivado);
      const atual = mineFilter === "arquivados" ? "arquivados" : "abertos";
      const shown = atual === "arquivados" ? arquivados : abertos;
      const abas = [
        { id: "abertos", label: "Chamados", icon: "inbox", n: abertos.length },
        { id: "arquivados", label: "Arquivados", icon: "archive", n: arquivados.length }
      ];
      const empty = atual === "arquivados"
        ? "Nenhum chamado arquivado."
        : (tickets.length ? "Nenhum chamado em aberto." : "Você ainda não abriu chamados.");
      body.innerHTML = `
        <div class="ml-tabs suporte-mine-tabs" role="tablist">
          ${abas.map((t) => `
            <button type="button" role="tab" class="ml-tab${atual === t.id ? " is-active" : ""}" data-mine="${t.id}" aria-selected="${atual === t.id}">
              <i data-lucide="${t.icon}"></i> ${t.label} <span class="ml-tab-count">${t.n}</span>
            </button>`).join("")}
        </div>
        ${listHtml(shown, empty, { unread: true, archiveMode: atual === "arquivados" ? "unarchive" : "archive" })}`;
      body.querySelectorAll(".ml-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          mineFilter = btn.getAttribute("data-mine") || "abertos";
          paintMine();
        });
      });
      bindTicketCards(body, { mine: true });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      body.innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
    }
  }

  function anexosHtml(imgs) {
    const list = Array.isArray(imgs) ? imgs : [];
    if (!list.length) return "";
    return `<div class="suporte-preview-list">${list.map(im => {
      const isImg = !im.type || String(im.type).startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(im.name || im.url || "");
      if (isImg) {
        return `<a class="suporte-thumb" href="${esc(im.url)}" target="_blank" rel="noopener"><img src="${esc(im.url)}" alt="${esc(im.name || "")}"></a>`;
      }
      return `<a class="suporte-thumb is-file" href="${esc(im.url)}" target="_blank" rel="noopener"><span class="suporte-file-chip">${esc(im.name || "Anexo")}</span></a>`;
    }).join("")}</div>`;
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
      ${anexosHtml(imgs)}
      <div class="suporte-thread">
        ${msgs.length ? msgs.map(m => `
          <div class="suporte-msg ${m.papel === "admin" ? "admin" : "user"}">
            <strong>${esc(m.autorNome || m.papel)} · ${esc(fmtDate(m.at))}</strong>
            ${m.texto ? `<p>${esc(m.texto)}</p>` : ""}
            ${anexosHtml(m.imagens)}
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
    replyDraftFiles = [];
    const box = document.getElementById("suporte-modal-box");
    box.classList.add("is-detail");
    const cached = ticketById(id);
    if (!cached) box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-hint">Carregando…</p></div>`;
    openModal();
    const paint = (t) => {
      const mine = !!(ctx && ctx.mine);
      const adminView = !!(ctx && ctx.admin) || (isAdmin() && !mine);
      const canReplyUser = mine || userKey() === String(t.userId || "").toLowerCase() || userKey() === String(t.userEmail || "").toLowerCase();
      if (adminView) markAdminTicketSeen(t);
      else if (canReplyUser) markTicketSeen(t);
      const canAttach = adminView || (canReplyUser && t.status !== "atendido");
      const canArchiveOwn = canReplyUser && !adminView && t.status === "atendido";
      box.innerHTML = `
        <div class="suporte-modal-head">
          <h2><i data-lucide="message-square"></i> Chamado</h2>
          <button type="button" class="btn btn-fechar" id="suporte-close-x">Fechar</button>
        </div>
        <div class="suporte-modal-body" id="suporte-detail-body">${threadHtml(t)}</div>
        <div class="suporte-modal-foot suporte-reply-foot">
          ${canAttach ? `
            <textarea id="suporte-reply" class="form-control" rows="3" placeholder="${adminView ? "Resposta ou pedido de mais informações" : "Sua resposta"}"></textarea>
            <div class="suporte-reply-attach">
              <div class="suporte-reply-attach-row">
                <label class="suporte-attach-btn" for="suporte-reply-files">
                  <i data-lucide="paperclip" style="width:16px;height:16px;"></i>
                  ${adminView ? "Anexar prints ou PDF" : "Anexar mais prints"}
                </label>
                <input type="file" id="suporte-reply-files" accept="${adminView ? "image/*,application/pdf" : "image/*"}" multiple hidden>
                <small class="suporte-hint">Até ${MAX_IMAGES} arquivos · máx. 6 MB cada · Ctrl+V cola o print</small>
              </div>
              <div id="suporte-reply-preview" class="suporte-preview-list"></div>
            </div>
          ` : ""}
          <div class="suporte-reply-actions">
            ${adminView ? `
              <div class="suporte-reply-actions-main">
                <button type="button" class="btn btn-outline" id="suporte-ask-info"><i data-lucide="message-circle"></i> Solicitar mais informações</button>
                <button type="button" class="btn btn-primary suporte-btn-send" id="suporte-send-admin"><i data-lucide="send"></i> Enviar resposta</button>
              </div>
            ` : `
              ${canArchiveOwn ? `<button type="button" class="btn btn-outline" id="suporte-archive"><i data-lucide="${t.arquivadoAt ? "archive-restore" : "archive"}"></i> ${t.arquivadoAt ? "Desarquivar" : "Arquivar"}</button>` : ""}
              ${canReplyUser && t.status !== "atendido" ? `<button type="button" class="btn btn-primary" id="suporte-send-user"><i data-lucide="send"></i> Responder</button>` : ""}
            `}
          </div>
          ${adminView ? `
            <div class="suporte-reply-close">
              <p>Encerra o chamado. O texto acima só entra se você tiver escrito alguma coisa.</p>
              <button type="button" class="btn btn-outline suporte-btn-done" id="suporte-mark-done"><i data-lucide="circle-check"></i> Marcar como atendido</button>
            </div>
          ` : ""}
        </div>`;
      document.getElementById("suporte-close-x").onclick = closeModal;
      if (canAttach) {
        bindFileInput({
          inputId: "suporte-reply-files",
          listId: "suporte-reply-preview",
          files: replyDraftFiles,
          allowDocs: adminView,
          emptyHint: "Nenhum anexo na resposta."
        });
        renderPreviews({
          listId: "suporte-reply-preview",
          files: replyDraftFiles,
          emptyHint: "Nenhum anexo na resposta."
        });
      }
      const sendUser = document.getElementById("suporte-send-user");
      if (sendUser) sendUser.onclick = () => replyTicket(id, { asAdmin: false, status: "pendente" });
      const sendAdmin = document.getElementById("suporte-send-admin");
      if (sendAdmin) sendAdmin.onclick = () => replyTicket(id, { asAdmin: true, status: "em_atendimento" });
      const ask = document.getElementById("suporte-ask-info");
      if (ask) ask.onclick = () => replyTicket(id, { asAdmin: true, status: "aguardando_usuario", requireText: true });
      const done = document.getElementById("suporte-mark-done");
      if (done) done.onclick = () => replyTicket(id, { asAdmin: true, status: "atendido", allowEmpty: true });
      const arch = document.getElementById("suporte-archive");
      if (arch) arch.onclick = () => archiveFromDetail(id, !t.arquivadoAt);
      if (window.lucide) lucide.createIcons();
    };
    if (cached) paint(cached);
    try {
      const t = await withTimeout(loadTicket(id), 12000, "O Firebase não respondeu. A conexão com o Firestore falhou.");
      if (t && t.id) ticketMap[t.id] = t;
      const reply = document.getElementById("suporte-reply");
      const digitando = (reply && String(reply.value || "").trim()) || replyDraftFiles.length;
      const igual = cached && String(cached.updatedAt || cached.createdAt || "") === String(t.updatedAt || t.createdAt || "");
      if (!digitando && !igual) paint(t);
    } catch (err) {
      if (cached) return;
      box.classList.remove("is-detail");
      box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-empty">${esc(err.message)}</p></div>
        <div class="suporte-modal-foot"><button type="button" class="btn btn-fechar" onclick="document.getElementById('suporte-overlay').style.display='none'">Fechar</button></div>`;
    }
  }

  async function replyTicket(id, opts) {
    const text = String((document.getElementById("suporte-reply") || {}).value || "").trim();
    const filesToSend = replyDraftFiles.slice();
    if (!opts.allowEmpty && !text && !filesToSend.length) {
      alert(opts.requireText ? "Escreva o que precisa do usuário." : "Escreva a mensagem ou anexe um arquivo.");
      return;
    }
    if (opts.requireText && !text) {
      alert("Escreva o que precisa do usuário.");
      return;
    }
    const sendBtns = ["suporte-send-admin", "suporte-send-user", "suporte-ask-info", "suporte-mark-done"]
      .map((bid) => document.getElementById(bid))
      .filter(Boolean);
    sendBtns.forEach((b) => { b.disabled = true; });
    try {
      const t = await loadTicket(id);
      const u = currentUser();
      let anexosMsg = [];
      if (filesToSend.length) {
        anexosMsg = await uploadImages(filesToSend, id);
      }
      const mensagens = Array.isArray(t.mensagens) ? t.mensagens.slice() : [];
      if (text || anexosMsg.length) {
        mensagens.push({
          autorNome: u.name || (opts.asAdmin ? "Administrador" : "Usuário"),
          autorEmail: String(u.email || "").toLowerCase(),
          papel: opts.asAdmin ? "admin" : "usuario",
          texto: text || (anexosMsg.length ? "(anexos)" : ""),
          imagens: anexosMsg,
          at: new Date().toISOString()
        });
      }
      const imagens = (Array.isArray(t.imagens) ? t.imagens.slice() : []).concat(anexosMsg);
      const { db, c } = fb();
      const nextStatus = opts.status || t.status;
      const patch = {
        mensagens,
        imagens,
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };
      if (opts.asAdmin && nextStatus !== "atendido") {
        patch.arquivadoAt = null;
        patch.arquivadoPor = "";
      }
      await c.updateDoc(c.doc(db, COLLECTION, id), patch);
      replyDraftFiles = [];
      if (opts.asAdmin) {
        const box = document.getElementById("suporte-modal-box");
        if (box) box.classList.remove("is-detail");
        closeModal();
        if (window.activeAppTab === "suporte") renderAdmin();
        alert("Atualizado.");
      } else {
        await openDetail(id, { mine: true });
        refreshUnreadBadge();
      }
    } catch (err) {
      alert("Não foi possível responder: " + (err.message || err));
      sendBtns.forEach((b) => { b.disabled = false; });
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

  function paintAdmin() {
    const root = document.getElementById("suporte-admin-root");
    if (!root || !isAdmin()) return;
    const pend = adminListCache.filter(t => pendingStatuses()[t.status]).length;
    const done = adminListCache.filter(t => t.status === "atendido").length;
    const shown = filterAdmin(adminListCache, adminFilter);
    const abas = [
      { id: "pendentes", label: "Pendentes", icon: "inbox", n: pend },
      { id: "atendidos", label: "Atendidos", icon: "circle-check", n: done },
      { id: "todos", label: "Todos", icon: "list", n: adminListCache.length }
    ];
    root.innerHTML = `
      <div class="suporte-admin-top">
        <div class="ml-tabs" role="tablist">
          ${abas.map((t) => `
            <button type="button" role="tab" class="ml-tab${adminFilter === t.id ? " is-active" : ""}" data-f="${t.id}" aria-selected="${adminFilter === t.id}">
              <i data-lucide="${t.icon}"></i> ${t.label} <span class="ml-tab-count">${t.n}</span>
            </button>`).join("")}
        </div>
        <button type="button" class="btn btn-primary" id="suporte-admin-new"><i data-lucide="plus"></i> Novo chamado interno</button>
      </div>
      ${listHtml(shown, "Nenhum chamado neste filtro.", { adminNew: true })}`;
    root.querySelectorAll(".ml-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        adminFilter = btn.getAttribute("data-f");
        paintAdmin();
      });
    });
    const neu = document.getElementById("suporte-admin-new");
    if (neu) neu.onclick = () => openForm("interno");
    bindTicketCards(root, { admin: true });
    if (window.lucide) lucide.createIcons();
  }

  async function renderAdmin() {
    const root = document.getElementById("suporte-admin-root");
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = `<p class="suporte-empty">Sem permissão para o módulo de suporte.</p>`;
      return;
    }
    if (!adminListCache.length) root.innerHTML = `<p class="suporte-hint">Carregando chamados…</p>`;
    try {
      adminListCache = await listAll();
    } catch (err) {
      root.innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
      return;
    }
    ensureAdminSeenBaseline(adminListCache);
    paintAdmin();
    const key = userKey();
    const mine = adminListCache.filter(t => String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key);
    applyUnreadUi(mine.filter(ticketHasUnread).length, adminListCache.filter(ticketIsNewForAdmin).length);
  }

  async function archiveFromDetail(id, arquivar) {
    const btn = document.getElementById("suporte-archive");
    if (btn) btn.disabled = true;
    try {
      await setArquivado(id, arquivar);
      await openMine();
    } catch (err) {
      if (btn) btn.disabled = false;
      alert("Não foi possível atualizar o chamado: " + (err.message || err));
    }
  }

  function onMenuClick(action) {
    toggleMenu(false);
    if (action === "problema") openForm("problema");
    else if (action === "melhoria") openForm("melhoria");
    else if (action === "meus") {
      mineFilter = "abertos";
      openMine();
    } else if (action === "recebidos") {
      if (typeof switchTab === "function") switchTab("suporte", "Suporte");
    }
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
    startUnreadWatchWhenReady();
  }

  document.addEventListener("tabChanged", (e) => {
    if (e.detail === "suporte") renderAdmin();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
  window.SuporteApp = { renderAdmin, openForm, isAdmin, openMine, refreshUnreadBadge };
})();
