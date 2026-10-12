// MÓDULO: CONFIGURAÇÕES > USUÁRIOS E PERFIS

window.isOperadorCobrancaProfile = function(name) {
  const n = String(name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return n.includes("OPERADOR COBRANCA");
};

window.isAdvogadoCobrancaProfile = function(name) {
  const n = String(name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return n.includes("ADVOGADO") && n.includes("COBRANCA") && !n.includes("OPERADOR");
};

window.isAdvogadoCobrancaUser = function(user) {
  if (!user || user.status === "INATIVO") return false;
  if (window.isAdvogadoCobrancaProfile(user.profile_name)) return true;
  return window.isOperadorCobrancaProfile(user.profile_name) && String(user.operator_type || "") === "advogado";
};

window.isOperadorCobrancaTerceirizadoProfile = function(name) {
  const n = String(name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return n.includes("OPERADOR COBRANCA") && n.includes("TERCEIRIZ");
};

/** Tipo efetivo: o perfil Terceirizado vale como Externo, mesmo sem o subtipo antigo. */
window.crmOperatorType = function(user) {
  if (!user) return "";
  if (window.isAdvogadoCobrancaProfile(user.profile_name)) return "advogado";
  if (window.isOperadorCobrancaTerceirizadoProfile(user.profile_name)) return "externo";
  return String(user.operator_type || "");
};

window.syncUserModalProfile = function(sel) {
  const name = sel && sel.value;
  const isOp = window.isOperadorCobrancaProfile(name);
  const isTerc = window.isOperadorCobrancaTerceirizadoProfile(name);
  const isAdv = window.isAdvogadoCobrancaProfile(name);
  const typeBox = document.getElementById("umodal-operator-type-container");
  const advBox = document.getElementById("umodal-advogado-config");
  const resend = document.getElementById("umodal-resend-billet-container");
  const opType = document.getElementById("umodal-operator-type");
  if (typeBox) typeBox.style.display = (isOp && !isTerc) ? "block" : "none";
  if (resend) resend.style.display = (isOp || isAdv) ? "block" : "none";
  if (opType && isTerc) opType.value = "externo";
  if (advBox) advBox.style.display = (isAdv || (isOp && opType && opType.value === "advogado")) ? "block" : "none";
  if (window.ConfigUsersApp && typeof ConfigUsersApp.syncDeptBox === "function") ConfigUsersApp.syncDeptBox();
};

/** Quem está usando o sistema agora, inclusive no teste de conta. */
window.crmUsuarioEfetivo = function(user) {
  if (user) return user;
  if (typeof window.crmUsuarioAcesso === "function") {
    const acesso = window.crmUsuarioAcesso();
    if (acesso) return acesso;
  }
  return (typeof AppState !== "undefined" && AppState.currentUser) || (window.AppState && window.AppState.currentUser) || null;
};

/** Perfis/usuários que só enxergam clientes da própria carteira atribuída. */
window.userSeesOnlyAssignedClients = function(user) {
  const u = window.crmUsuarioEfetivo(user);
  if (!u) return false;
  if (window.isOperadorCobrancaTerceirizadoProfile(u.profile_name)) return true;
  return window.isOperadorCobrancaProfile(u.profile_name) && String(u.operator_type || "") === "externo";
};

window.currentUserCityRuleIds = function() {
  const rules = (typeof AppState !== "undefined" && AppState.rules)
    || (window.AppState && window.AppState.rules)
    || {};
  const ids = new Set();
  Object.keys(rules).forEach(function(key) {
    if (String(key).indexOf("CID_") !== 0) return;
    const ops = typeof window.mergeCityOperatorValues === "function"
      ? window.mergeCityOperatorValues(rules[key].operator)
      : [];
    if (!ops.some(function(op) { return window.clientAssignedToCurrentUser(op); })) return;
    ids.add(String(key));
    if (typeof window.canonicalCityRuleId === "function") {
      const canon = window.canonicalCityRuleId(key);
      if (canon) ids.add(String(canon));
    }
  });
  return ids;
};

/** Terceirizado: o dashboard só inclui as cidades em que ele está na régua. */
window.clientInCurrentUserCities = function(client) {
  if (typeof window.userSeesOnlyAssignedClients === "function" && !window.userSeesOnlyAssignedClients()) return true;
  const ids = window.currentUserCityRuleIds();
  if (!ids || !ids.size) return true;
  const cc = client && (client.costCenterId || client.enterpriseId);
  if (cc == null || cc === "" || typeof window.resolveCityRuleId !== "function") return true;
  const resolved = window.resolveCityRuleId(cc);
  const ruleId = resolved && resolved.ruleId;
  if (!ruleId) return false;
  return ids.has(String(ruleId));
};

window.clientAssignedToCurrentUser = function(clientOrOp) {
  const assigned = typeof clientOrOp === "string"
    ? clientOrOp
    : (clientOrOp && (clientOrOp.assignedOperator || clientOrOp.operator)) || "";
  const u = window.crmUsuarioEfetivo();
  if (!u || !assigned) return false;
  const match = typeof window.occurrenceAuthorMatchesOperator === "function"
    ? window.occurrenceAuthorMatchesOperator
    : function(a, b) { return String(a || "").toUpperCase() === String(b || "").toUpperCase(); };
  const candidates = [u.name, u.sienge_user];
  if (u.sienge_user) candidates.push(String(u.sienge_user).replace(/\./g, " "));
  return candidates.filter(Boolean).some(function(c) { return match(assigned, c); });
};

window.currentUserCanViewCustomer = function(customerId) {
  if (!window.userSeesOnlyAssignedClients()) return true;
  const id = String(customerId == null ? "" : customerId);
  if (!id) return false;
  const list = window.rawClientList || [];
  const mine = list.filter(function(c) { return String(c.customerId) === id; });
  if (!mine.length) return false;
  return mine.some(function(c) {
    return window.clientAssignedToCurrentUser(c)
      && (typeof window.clientInCurrentUserCities !== "function" || window.clientInCurrentUserCities(c));
  });
};

window.filterCustomersToAssignedPortfolio = function(customers) {
  if (!window.userSeesOnlyAssignedClients() || !Array.isArray(customers)) return customers || [];
  const allowed = new Set();
  (window.rawClientList || []).forEach(function(c) {
    if (window.clientAssignedToCurrentUser(c)
      && (typeof window.clientInCurrentUserCities !== "function" || window.clientInCurrentUserCities(c))) {
      allowed.add(String(c.customerId));
    }
  });
  return customers.filter(function(c) {
    const id = String((c && (c.customerId != null ? c.customerId : c.id)) || "");
    return id && allowed.has(id);
  });
};

window.syncConfiguracoesPermAliases = function(perms) {
  if (!perms) return perms;
  ["acessar", "visualizar", "editar"].forEach(flag => {
    const cfg = !!perms["sub_fin_cr_configuracoes_" + flag];
    perms["sub_fin_cr_regras_cobranca_" + flag] = cfg;
    perms["sub_fin_cr_regras_negociacao_" + flag] = cfg;
  });
  return perms;
};

window.configuracoesPermChecked = function(savedPerms, flag) {
  return !!(savedPerms["sub_fin_cr_configuracoes_" + flag]
    || savedPerms["sub_fin_cr_regras_cobranca_" + flag]
    || savedPerms["sub_fin_cr_regras_negociacao_" + flag]);
};

window.permFlagsForAction = function(sub, act) {
  const base = (act && act.permBase) || ((sub && sub.key) + "_" + (act && act.id));
  return {
    base,
    acessar: base + "_acessar",
    visualizar: base + "_visualizar",
    editar: base + "_editar"
  };
};

const ConfigUsersApp = {
  
  users: [],

  profiles: [], // Será carregado dinamicamente

  permFlags(sub, act) {
    return window.permFlagsForAction(sub, act);
  },

  hydrateSubmoduleFlags(savedPerms) {
    if (!savedPerms) return savedPerms;
    this.modules.forEach(m => {
      m.submodules.forEach(sub => {
        if (savedPerms[sub.key]) return;
        const on = sub.actions.some(act => {
          const f = this.permFlags(sub, act);
          return !!(savedPerms[f.acessar] || savedPerms[f.visualizar] || savedPerms[f.editar]);
        });
        if (on) savedPerms[sub.key] = true;
      });
    });
    ["acessar", "visualizar", "editar"].forEach((flag) => {
      const oldKey = "sub_eng_geral_engenharia_" + flag;
      const newKey = "sub_eng_geral_caucao_" + flag;
      if (savedPerms[newKey] == null && savedPerms[oldKey] === true) savedPerms[newKey] = true;
    });
    ["acessar", "visualizar", "editar"].forEach((flag) => {
      const oldKey = "sub_rel_geral_relacionamento_" + flag;
      const newKey = "sub_rel_geral_buscar_cliente_" + flag;
      if (savedPerms.mod_rel === true && savedPerms[newKey] == null && savedPerms[oldKey] === true) savedPerms[newKey] = true;
    });
    if (!savedPerms.mod_gerencial && (
      savedPerms.sub_part_geral_participacoes_acessar === true
      || savedPerms.sub_soc_geral_estrutura_societaria_acessar === true
    )) {
      savedPerms.mod_gerencial = true;
    }
    if (!savedPerms.mod_vistoria && (
      savedPerms.sub_vist_tela
      || savedPerms.sub_vist_verificar
      || savedPerms.sub_vistoria_geral_vistoria_acessar
      || savedPerms.sub_vistoria_geral_vistoria_visualizar
      || savedPerms.sub_vistoria_geral_vistoria_editar
      || savedPerms.sub_vistoria_geral_verificar_construcao_acessar
      || savedPerms.sub_vistoria_geral_verificar_construcao_visualizar
      || savedPerms.sub_vistoria_geral_verificar_construcao_editar
    )) {
      savedPerms.mod_vistoria = true;
    }
    return savedPerms;
  },

  restoreNaiaraCadastroName() {
    const email = "naiara.cassio@mouraleite.com.br";
    const cadastro = "NAIARA DE CASSIO LAMBASSO";
    let changed = false;
    (this.users || []).forEach((u) => {
      if (!u || String(u.email || "").toLowerCase().trim() !== email) return;
      if (!window.crmUserNameIsAzure || !window.crmUserNameIsAzure(u.name)) return;
      if (window.crmUserEditedAt && window.crmUserEditedAt(u)) return;
      u.name = cadastro;
      u.editedAt = Date.now();
      changed = true;
    });
    return changed;
  },

  persistUsers() {
    const raw = JSON.stringify(this.users);
    try {
      const setter = (typeof window !== "undefined" && window._originalSetItem) ? window._originalSetItem : localStorage.setItem.bind(localStorage);
      setter.call(localStorage, "crm_users", raw);
    } catch (e) {
      console.warn("[ConfigUsers] localStorage", e);
    }
    if (typeof window !== "undefined") {
      window._cachedCrmUsersBadge = null;
      if (typeof window.updateOperatorTabsUI === "function") window.updateOperatorTabsUI();
    }
    if (typeof window.persistCrmUsersToFirebase === "function") {
      return window.persistCrmUsersToFirebase(this.users).then((saved) => {
        if (Array.isArray(saved) && saved.length) this.users = saved;
        return saved;
      });
    }
    if (typeof window.forceUploadLocalConfig === "function") {
      return window.forceUploadLocalConfig(true);
    }
    return Promise.resolve(this.users);
  },

  nextUserId() {
    let max = 0;
    (this.users || []).forEach((u) => {
      const n = Number(u && u.id);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return max + 1;
  },

  normalizeUserIds() {
    let max = 0;
    let changed = false;
    (this.users || []).forEach((u) => {
      const n = Number(u && u.id);
      if (Number.isFinite(n) && n > max) max = n;
    });
    const seen = new Set();
    (this.users || []).forEach((u) => {
      if (!u) return;
      const n = Number(u.id);
      if (!Number.isFinite(n) || seen.has(n)) {
        max += 1;
        u.id = max;
        changed = true;
      }
      seen.add(Number(u.id));
    });
    return changed;
  },

  findUser(userId, email) {
    const em = String(email || "").toLowerCase().trim();
    const list = this.users || [];
    if (em) {
      const exact = list.find((u) => u && String(u.id) === String(userId) && String(u.email || "").toLowerCase().trim() === em);
      if (exact) return exact;
    }
    return list.find((u) => u && String(u.id) === String(userId)) || null;
  },

  attrArg(value) {
    return JSON.stringify(value == null ? null : value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  },

  dropReplacedUserEmails() {
    const swaps = [{ from: "caco@colenci.com.br", to: "colenci@mouraleite.com.br" }];
    let changed = false;
    swaps.forEach(({ from, to }) => {
      const list = this.users || [];
      const emailOf = (u) => String((u && u.email) || "").toLowerCase().trim();
      const keep = list.find((u) => emailOf(u) === to);
      const olds = list.filter((u) => emailOf(u) === from);
      if (!keep || !olds.length) return;
      olds.forEach((old) => {
        if (window.crmUserEditedAt(old) > window.crmUserEditedAt(keep)) {
          const { id, email, ...rest } = old;
          Object.assign(keep, rest);
        }
      });
      this.users = list.filter((u) => emailOf(u) !== from);
      if (typeof window.removeCrmUserEmail === "function") window.removeCrmUserEmail(from);
      changed = true;
    });
    return changed;
  },

  modules: [
    {
      name: "Engenharia", icon: "hard-hat", key: "mod_eng",
      submodules: [{ name: "Engenharia", key: "sub_eng_geral", actions: [
        { id: "caucao", label: "Gestão de caução", permBase: "sub_eng_geral_caucao" },
        { id: "config", label: "Configurações", permBase: "sub_eng_geral_config" }
      ] }]
    },
    {
      name: "Vistoria", icon: "camera", key: "mod_vistoria", direct: true,
      submodules: []
    },
    {
      name: "Compras", icon: "shopping-cart", key: "mod_compras",
      submodules: [{ name: "Compras", key: "sub_compras_geral", actions: [
        { id: "dashboard", label: "Dashboard", permBase: "sub_compras_geral_dashboard" },
        { id: "controle_financeiro", label: "Controle financeiro", permBase: "sub_compras_geral_controle_financeiro" },
        { id: "previsoes", label: "Follow-up de previsões", permBase: "sub_compras_geral_previsoes" },
        { id: "config", label: "Configurações", permBase: "sub_compras_geral_config" }
      ] }]
    },
    {
      name: "Financeiro", icon: "dollar-sign", key: "mod_fin",
      submodules: [
        {
          name: "Contas a Receber", key: "sub_fin_cr",
          actions: [
            { id: "dashboard", label: "Dashboard", permBase: "sub_fin_cr_dashboard" },
            { id: "fila_cobranca", label: "Fila de Cobrança" },
            { id: "agenda", label: "Agenda do Operador" },
            { id: "zero_paid", label: "Clientes 0% Pago" },
            { id: "sub_judice", label: "Sub Judice" },
            { id: "notificacoes", label: "Notificações" },
            { id: "recebimentos_webro", label: "Recebimentos Webro" },
            { id: "scod", label: "Scod" },
            { id: "relatorios", label: "Relatórios" },
            { id: "configuracoes", label: "Configurações" }
          ]
        },
        {
          name: "Contas a Pagar", key: "sub_fin_cp",
          actions: [
            { id: "assistente_cp", label: "Assistente de Contas a Pagar" },
            { id: "gerar_pagamento", label: "Gerar Pagamento", permBase: "sub_fin_cp_gerar_pagamento" },
            { id: "titulos_incompletos", label: "Títulos incompletos", permBase: "sub_fin_cp_titulos_incompletos" },
            { id: "rydoo", label: "Rydoo", permBase: "sub_fin_cp_rydoo" }
          ]
        },
        {
          name: "Prestação de contas", key: "sub_fin_pc",
          actions: [
            { id: "nova_prestacao", label: "Nova prestação", permBase: "sub_fin_cp_prestacao_contas" },
            { id: "config", label: "Configurações", permBase: "sub_fin_cp_parametrizacao_parceiro" }
          ]
        },
        {
          name: "Caixa e Banco", key: "sub_fin_cb",
          actions: [
            { id: "investimento", label: "Aplicações e Investimentos" },
            { id: "fluxo_caixa", label: "Fluxo de caixa (DFC)" },
            { id: "fluxo_caixa_diario", label: "Fluxo de caixa diário" },
            { id: "resultado_caixa", label: "Resultado de caixa" }
          ]
        },
        {
          name: "Orçamento", key: "sub_fin_orc",
          actions: [{ id: "orcamento", label: "Orçamento" }]
        },
        {
          name: "Financiamento", key: "sub_fin_finan",
          actions: [{ id: "financiamento", label: "Financiamento" }]
        },
        {
          name: "Repactuação", key: "sub_fin_repac",
          actions: [{ id: "repactuacao", label: "Repactuação" }]
        }
      ]
    },
    {
      name: "Fiscal", icon: "receipt", key: "mod_fiscal",
      submodules: [
        { name: "Calcular impostos", key: "sub_fiscal_pis", actions: [{ id: "fiscal", label: "Calcular impostos", permBase: "sub_fiscal_geral_fiscal" }] },
        { name: "Enviar nota", key: "sub_fiscal_enviar_nota", actions: [{ id: "enviar_nota", label: "Enviar nota ao fiscal", permBase: "sub_fiscal_geral_enviar_nota" }] },
        { name: "Validar nota", key: "sub_fiscal_inserir_nota", actions: [{ id: "inserir_nota", label: "Validar nota", permBase: "sub_fiscal_geral_inserir_nota" }] },
        { name: "Rastrear pedido", key: "sub_fiscal_rastrear_pedido", actions: [{ id: "rastrear_pedido", label: "Rastrear pedido", permBase: "sub_fiscal_geral_rastrear_pedido" }] }
      ]
    },
    {
      name: "Gerencial", icon: "briefcase", key: "mod_gerencial",
      submodules: [
        { name: "Prestação Contas Ellenceo", key: "sub_part_geral", actions: [{ id: "participacoes", label: "Prestação Contas Ellenceo" }] },
        { name: "Organograma Societário", key: "sub_soc_geral", actions: [{ id: "estrutura_societaria", label: "Organograma Societário" }] }
      ]
    },
    {
      name: "Comercial", icon: "store", key: "mod_comercial",
      submodules: [
        { name: "Dashboard Comercial", key: "sub_com_dash", actions: [{ id: "dashboard", label: "Dashboard Comercial", permBase: "sub_com_geral_dashboard" }] },
        { name: "Posição de estoque", key: "sub_com_estoque", actions: [{ id: "estoque", label: "Posição de estoque", permBase: "sub_com_geral_estoque" }] },
        { name: "Assistente de Anexos", key: "sub_com_anexos", actions: [{ id: "assistente_anexos", label: "Assistente de Anexos", permBase: "sub_com_geral_assistente_anexos" }] },
        { name: "Condições de Pagamento", key: "sub_com_condicoes", actions: [{ id: "condicoes_pagamento", label: "Condições de Pagamento", permBase: "sub_com_geral_condicoes_pagamento" }] },
        { name: "Tabelas vigentes", key: "sub_com_tabelas", actions: [{ id: "tabelas_vigentes", label: "Tabelas vigentes", permBase: "sub_com_geral_tabelas_vigentes" }] },
        { name: "Controle de comissão", key: "sub_com_comissao", actions: [{ id: "controle_comissao", label: "Controle de comissão", permBase: "sub_com_geral_controle_comissao" }] }
      ]
    },
    {
      name: "Marketing", icon: "megaphone", key: "mod_mkt",
      submodules: [
        { name: "Budget", key: "sub_mkt_budget", actions: [{ id: "budget", label: "Budget", permBase: "sub_mkt_geral_budget" }] },
        { name: "Eventos", key: "sub_mkt_eventos", actions: [{ id: "eventos", label: "Eventos", permBase: "sub_mkt_geral_eventos" }] },
        { name: "Configurações", key: "sub_mkt_config", actions: [{ id: "config", label: "Configurações", permBase: "sub_mkt_geral_config" }] }
      ]
    },
    {
      name: "Relacionamento", icon: "users", key: "mod_rel",
      submodules: [
        { name: "Buscar Cliente", key: "sub_rel_busca", actions: [{ id: "buscar_cliente", label: "Buscar Cliente", permBase: "sub_rel_geral_buscar_cliente" }] }
      ]
    },
    {
      name: "Compromissário", icon: "building", key: "mod_compromissario",
      submodules: [
        { name: "Prefeitura", key: "sub_comp_pref", actions: [{ id: "prefeitura", label: "Prefeitura", permBase: "sub_compromissario_geral_prefeitura" }] },
        { name: "Associações", key: "sub_comp_assoc", actions: [{ id: "associacoes", label: "Associações", permBase: "sub_compromissario_geral_associacoes" }] }
      ]
    },
    {
      name: "Segurança", icon: "shield", key: "mod_seg",
      submodules: [
        { name: "Auditoria do Sistema", key: "sub_seg_aud", actions: [
          { id: "auditoria", label: "Auditoria do Sistema", permBase: "sub_seg_geral_auditoria" },
          { id: "auditoria_login", label: "Auditoria do Login Sienge", permBase: "sub_seg_geral_auditoria_login" },
          { id: "consumo_api", label: "Consumo de API", permBase: "sub_seg_geral_consumo_api" },
          { id: "usuarios_online", label: "Usuários online", permBase: "sub_seg_geral_usuarios_online" }
        ] }
      ]
    },
    {
      name: "Suporte", icon: "headphones", key: "mod_suporte",
      submodules: [{ name: "Suporte", key: "sub_suporte_geral", actions: [{ id: "chamados", label: "Suporte" }] }]
    },
    {
      name: "Configurações", icon: "settings-2", key: "mod_cfg",
      submodules: [
        {
          name: "Apoio", key: "sub_cfg_apoio",
          actions: [
            { id: "preambulos", label: "Preâmbulos" },
            { id: "tags", label: "Tags de Anexos" },
            { id: "usuarios", label: "Usuários e Perfis" },
            { id: "empresas", label: "Empresas" },
            { id: "centro_custo", label: "Centro de Custo" },
            { id: "plano_financeiro", label: "Plano Financeiro e Visões" },
            { id: "doc_padrao", label: "Documentos Padrões" },
            { id: "upload_kmz", label: "Upload de KMZ" },
            { id: "upload_mapa", label: "Projeto Urbanístico" },
            { id: "indexadores", label: "Indexadores" },
            { id: "documentos", label: "Tipos de Documento" }
          ]
        }
      ]
    }
  ],

  selectedProfile: "admin",
  view: "usuarios",
  modView: { module: "", sub: "", action: "" },
  userFilters: { nome: "", perfil: "", email: "", status: "todos" },

  async loadUsers() {
    try {
    let gotCloudUsers = false;
    if (typeof window.syncCrmUsersFromFirebase === "function") {
      try {
        const rawUsers = await window.syncCrmUsersFromFirebase();
        const parsedUsers = typeof rawUsers === "string" ? JSON.parse(rawUsers) : rawUsers;
        if (Array.isArray(parsedUsers) && parsedUsers.length) {
          this.users = parsedUsers;
          gotCloudUsers = true;
        }
      } catch (e) { console.warn("[ConfigUsers] sync usuários:", e); }
    }
    if (!gotCloudUsers) {
      const savedUsers = localStorage.getItem('crm_users');
      if (savedUsers) this.users = JSON.parse(savedUsers);
    }
    if (!Array.isArray(this.users)) this.users = [];
    const droppedOld = this.dropReplacedUserEmails();
    if ((this.normalizeUserIds() || droppedOld) && typeof window.persistCrmUsersToFirebase === "function") {
      try {
        const saved = await window.persistCrmUsersToFirebase(this.users);
        if (Array.isArray(saved) && saved.length) this.users = saved;
      } catch (e) {
        console.warn("[ConfigUsers] ids:", e);
      }
    }

    if (typeof window.syncCrmProfilesFromFirebase === "function") {
      try {
        const syncedProfiles = await window.syncCrmProfilesFromFirebase();
        if (Array.isArray(syncedProfiles) && syncedProfiles.length) this.profiles = syncedProfiles;
      } catch (e) { console.warn("[ConfigUsers] sync perfis:", e); }
    }
    const savedProfiles = localStorage.getItem('crm_moura_profiles');
    if (!Array.isArray(this.profiles) || !this.profiles.length) {
      if (savedProfiles) this.profiles = JSON.parse(savedProfiles);
    }
    if (!Array.isArray(this.profiles) || !this.profiles.length) {
      this.profiles = [
        { id: "admin", name: "ADMINISTRADOR" },
        { id: "operador_pagadoria", name: "OPERADOR PAGADORIA" },
        { id: "operador_cobranca", name: "OPERADOR COBRANÇA" },
        { id: "operador_cobranca_back_office", name: "OPERADOR COBRANÇA BACK OFFICE" },
        { id: "operador_cobranca_terceirizado", name: "OPERADOR COBRANÇA TERCEIRIZADO" },
        { id: "time_relacionamento", name: "TIME RELACIONAMENTO" },
        { id: "supervisor_relacionamento", name: "SUPERVISOR RELACIONAMENTO" },
        { id: "supervisor_tesouraria", name: "SUPERVISOR TESOURARIA" },
        { id: "gerente_fpa", name: "GERENTE FP&A" },
        { id: "engenharia", name: "ENGENHARIA" }
      ];
      this.safeLocalSet('crm_moura_profiles', JSON.stringify(this.profiles));
    }

    this.ensureAlcadaProfiles();
    try { await this.ensureProfilesReferencedByUsers(); } catch (e) { console.warn("[ConfigUsers] perfis dos usuários:", e); }
    try { this.unifyBackOfficeProfiles(); } catch (e) { console.warn("[ConfigUsers] unify back-office:", e); }
    try { this.breakSharedCobrancaMirrors(); } catch (e) { console.warn("[ConfigUsers] break mirrors:", e); }
    try { this.seedTerceirizadoPermsFromCobranca(); } catch (e) { console.warn("[ConfigUsers] seed terceirizado:", e); }
    try { this.migrateLuceliaToBackOffice(); } catch (e) { console.warn("[ConfigUsers] migrate lucelia:", e); }
    if (!window._crmCloudIdentitySaved) {
      window._crmCloudIdentitySaved = true;
      if (this.profiles.length && typeof window.persistCrmProfilesNow === "function") {
        this.persistProfilesCloud().catch((e) => console.warn("[ConfigUsers] perfis na nuvem:", e));
      }
      if (this.users.length && typeof window.persistCrmUsersToFirebase === "function") {
        window.persistCrmUsersToFirebase(this.users).catch((e) => console.warn("[ConfigUsers] usuários na nuvem:", e));
      }
    }
    if (this.restoreNaiaraCadastroName()) {
      try { await this.persistUsers(); } catch (e) { console.warn("[ConfigUsers] nome Naiara:", e); }
    }
    } catch (e) {
      console.error("[ConfigUsers] loadUsers:", e);
      if (!Array.isArray(this.profiles) || !this.profiles.length) {
        this.profiles = [{ id: "admin", name: "ADMINISTRADOR" }];
      }
      if (!Array.isArray(this.users)) this.users = [];
    }
    
    // Aqui no futuro poderia fazer um fetch para a API de usuários
    this.render();
  },

  prunePermissionStorage(keepKey) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("crm_perms_")) continue;
        if (k === keepKey) continue;
        const raw = localStorage.getItem(k);
        try {
          const obj = raw ? JSON.parse(raw) : null;
          if (obj && obj.__mirror_of__) keysToRemove.push(k);
        } catch (e) {}
      }
      if (!keysToRemove.length) return;
      keysToRemove.forEach((k) => {
        try { localStorage.removeItem(k); } catch (e) { console.warn("[ConfigUsers] falha ao limpar permissão antiga", k, e); }
      });
      console.info("[ConfigUsers] liberou cota do localStorage removendo espelhos antigos de permissões.");
    } catch (e) {
      console.warn("[ConfigUsers] falha ao varrer permissões antigas", e);
    }
  },

  safeLocalSet(key, value) {
    const write = () => {
      localStorage.setItem(key, value);
      return true;
    };
    try {
      return write();
    } catch (e) {
      console.warn("[ConfigUsers] localStorage cheio ao gravar", key, e);
      try {
        if (typeof window.freeCrmLocalStorage === "function") window.freeCrmLocalStorage();
        if (key.startsWith("crm_perms_")) this.prunePermissionStorage(key);
        return write();
      } catch (retryErr) {
        console.warn("[ConfigUsers] retry do localStorage falhou", retryErr);
        return false;
      }
    }
  },

  profileIdFromName(profileName) {
    return String(profileName || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  },

  async persistProfilesCloud() {
    if (typeof window.persistCrmProfilesNow !== "function") return this.profiles;
    const saved = await window.persistCrmProfilesNow(this.profiles);
    if (Array.isArray(saved) && saved.length) this.profiles = saved;
    return this.profiles;
  },

  async ensureProfilesReferencedByUsers() {
    return;
  },

  writePermissionPayload(profileId, perms) {
    const existing = this.getProfilePermsObject(profileId) || {};
    const incomingHas = typeof window.crmPermsHasAnyTrue === "function"
      ? window.crmPermsHasAnyTrue(perms)
      : Object.keys(perms || {}).some((k) => perms[k] === true);
    const existingHas = typeof window.crmPermsHasAnyTrue === "function"
      ? window.crmPermsHasAnyTrue(existing)
      : Object.keys(existing).some((k) => existing[k] === true);
    if (!incomingHas && existingHas) {
      return true;
    }
    const toSave = Object.assign({}, perms || {}, { _savedAt: Date.now() });
    delete toSave.__mirror_of__;
    const payload = JSON.stringify(toSave);
    if (typeof window.markCrmPermsLocalSave === "function") window.markCrmPermsLocalSave();
    const profile = (this.profiles || []).find((p) => String(p.id) === String(profileId));
    const kind = typeof window.crmProfileKind === "function"
      ? window.crmProfileKind((profile && profile.name) || profileId)
      : "";
    if (kind === "back_office" && typeof window.persistBackOfficePermsObject === "function") {
      window._crmBackOfficePermsSavedAt = Date.now();
      if (typeof window.markCrmPermsLocalSave === "function") window.markCrmPermsLocalSave();
      return window.persistBackOfficePermsObject(toSave);
    }
    const keys = new Set();
    if (kind === "terceirizado") {
      keys.add("operador_cobranca_terceirizado");
    } else if (kind === "cobranca") {
      keys.add("operador_cobranca");
      keys.add("operador_cobrança");
    } else {
      keys.add(String(profileId || ""));
    }
    let ok = true;
    keys.forEach((k) => {
      if (!k) return;
      const permKey = `crm_perms_${k}`;
      if (!this.safeLocalSet(permKey, payload)) ok = false;
      if (typeof window.backupCrmProfilePerms === "function") window.backupCrmProfilePerms(k, payload);
    });
    if (profile) {
      profile.perms = toSave;
      try { this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles)); } catch (e) {}
    }
    return ok;
  },

  syncPermsToCloud() {
    if (typeof window.forceUploadLocalConfig === "function") {
      try {
        window.forceUploadLocalConfig(true).catch((e) => {
          console.warn("[ConfigUsers] upload automático falhou", e);
        });
      } catch (e) {
        console.warn("[ConfigUsers] upload automático falhou", e);
      }
    }
  },

  resolveCobrancaProfileId() {
    const cob = (this.profiles || []).find(p => {
      const n = String(p.name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n === "OPERADOR COBRANCA";
    });
    if (cob) return cob.id;
    if (localStorage.getItem("crm_perms_operador_cobranca")) return "operador_cobranca";
    if (localStorage.getItem("crm_perms_operador_cobrança")) return "operador_cobrança";
    return "operador_cobranca";
  },

  getProfilePermsObject(profileId) {
    const profile = (this.profiles || []).find((p) => String(p.id) === String(profileId));
    const label = (profile && profile.name) || profileId;
    if (typeof window.crmProfileKind === "function" && window.crmProfileKind(label) === "back_office") {
      if (typeof window.readBackOfficePerms === "function") return window.readBackOfficePerms();
      if (typeof window.readCrmProfilePerms === "function") {
        return window.readCrmProfilePerms(window.CRM_BACK_OFFICE_PROFILE_NAME || label);
      }
    }
    if (typeof window.readCrmProfilePerms === "function") {
      return window.readCrmProfilePerms((profile && profile.name) || profileId);
    }
    if (profile && profile.perms && typeof profile.perms === "object") return Object.assign({}, profile.perms);
    if (typeof window.materializeCrmProfilePerms === "function") {
      return window.materializeCrmProfilePerms(profileId) || {};
    }
    return {};
  },

  seedIndependentPermsCopy(targetId, preferredSourceId) {
    if (!targetId) return;
    const existing = localStorage.getItem(`crm_perms_${targetId}`);
    if (existing) {
      try {
        const obj = JSON.parse(existing);
        if (obj && obj.__mirror_of__ && typeof window.materializeCrmProfilePerms === "function") {
          window.materializeCrmProfilePerms(targetId);
        }
      } catch (e) {}
      return;
    }
    const sourceId = preferredSourceId || this.resolveCobrancaProfileId();
    const srcRaw = localStorage.getItem(`crm_perms_${sourceId}`)
      || localStorage.getItem("crm_perms_operador_cobrança")
      || localStorage.getItem("crm_perms_operador_cobranca");
    if (!srcRaw) return;
    let src = {};
    try { src = JSON.parse(srcRaw) || {}; } catch (e) { src = {}; }
    if (src && src.__mirror_of__) src = {};
    const copy = Object.assign({}, src);
    delete copy.__mirror_of__;
    this.safeLocalSet(`crm_perms_${targetId}`, JSON.stringify(copy));
  },

  seedPermsAsMirror(targetId, preferredSourceId) {
    this.seedIndependentPermsCopy(targetId, preferredSourceId);
  },

  ensureAlcadaProfiles() {
    if (!Array.isArray(this.profiles)) this.profiles = [];
    const norm = (name) => String(name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " E ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const extras = [
      { id: "operador_cobranca_back_office", name: "OPERADOR COBRANÇA BACK OFFICE", match: (n) => n.includes("OPERADOR COBRANCA") && (n.includes("BACK OFFICE") || n.includes("BACKOFFICE") || /\bBACK\b/.test(n)) },
      { id: "operador_cobranca_terceirizado", name: "OPERADOR COBRANÇA TERCEIRIZADO", match: (n) => n.includes("OPERADOR COBRANCA") && n.includes("TERCEIRIZ") },
      { id: "time_relacionamento", name: "TIME RELACIONAMENTO", match: (n) => n === "TIME RELACIONAMENTO" || (n.includes("TIME") && n.includes("RELACIONAMENTO")) },
      { id: "supervisor_relacionamento", name: "SUPERVISOR RELACIONAMENTO", match: (n) => n.includes("SUPERVISOR") && n.includes("RELACIONAMENTO") },
      { id: "supervisor_tesouraria", name: "SUPERVISOR TESOURARIA", match: (n) => n.includes("SUPERVISOR") && n.includes("TESOURARIA") },
      { id: "gerente_fpa", name: "GERENTE FP&A", match: (n) => n.includes("GERENTE") && (n.includes("FP E A") || n.includes("FPA") || n.includes("FP A")) }
    ];
    let changed = false;
    extras.forEach((ex) => {
      const exists = this.profiles.some((p) => p.id === ex.id || ex.match(norm(p.name)));
      if (!exists) {
        this.profiles.push({ id: ex.id, name: ex.name });
        changed = true;
      }
    });
    if (changed) this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles));
  },

  seedBackOfficePermsFromCobranca() {
    return;
  },

  unifyBackOfficeProfiles() {
    const backId = window.CRM_BACK_OFFICE_PROFILE_ID || "operador_cobranca_back_office";
    const backName = window.CRM_BACK_OFFICE_PROFILE_NAME || "OPERADOR COBRANÇA BACK OFFICE";
    const kindOf = (p) => (typeof window.crmProfileKind === "function" ? window.crmProfileKind(p.name || p.id) : "");
    const backs = (this.profiles || []).filter((p) => kindOf(p) === "back_office");
    const selectedWasBack = backs.some((p) => String(p.id) === String(this.selectedProfile));
    const keep = backs[0] || { id: backId, name: backName };
    keep.id = backId;
    keep.name = backName;
    const permCandidates = backs.map((p) => p && p.perms).filter(Boolean);
    if (permCandidates.length) {
      keep.perms = typeof window.pickBestCrmPermsObject === "function"
        ? window.pickBestCrmPermsObject(permCandidates.map((p) => (typeof p === "string" ? p : JSON.stringify(p))))
        : (keep.perms || permCandidates[0]);
    }
    this.profiles = (this.profiles || []).filter((p) => kindOf(p) !== "back_office");
    this.profiles.push(keep);
    this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles));
    let usersChanged = false;
    (this.users || []).forEach((u) => {
      if (kindOf({ name: u.profile_name }) === "back_office" && u.profile_name !== backName) {
        u.profile_name = backName;
        usersChanged = true;
      }
    });
    if (usersChanged) this.safeLocalSet("crm_users", JSON.stringify(this.users));
    if (selectedWasBack) this.selectedProfile = backId;
    try {
      const savedSel = localStorage.getItem("crm_selected_profile");
      if (savedSel && (this.profiles || []).some((p) => String(p.id) === String(savedSel))) {
        this.selectedProfile = savedSel;
      }
    } catch (e) {}
  },

  seedTerceirizadoPermsFromCobranca() {
    return false;
  },

  breakSharedCobrancaMirrors() {
    const ids = new Set();
    (this.profiles || []).forEach((p) => { if (p && p.id) ids.add(String(p.id)); });
    ids.add("operador_cobranca_back_office");
    ids.add("operador_cobranca_terceirizado");
    ids.forEach((id) => {
      if (typeof window.materializeCrmProfilePerms === "function") {
        window.materializeCrmProfilePerms(id);
      }
    });
  },

  migrateLuceliaToBackOffice() {
    const targetName = window.CRM_BACK_OFFICE_PROFILE_NAME || "OPERADOR COBRANÇA BACK OFFICE";
    let changed = false;
    (this.users || []).forEach((u) => {
      const blob = String((u && u.name) || "") + " " + String((u && u.sienge_user) || "") + " " + String((u && u.email) || "");
      if (!/LUCELIA/i.test(blob)) return;
      const n = String(u.profile_name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (n === "ADMINISTRADOR") return;
      if (u.profile_name !== targetName) {
        u.profile_name = targetName;
        changed = true;
      }
    });
    if (changed) {
      this.safeLocalSet("crm_users", JSON.stringify(this.users));
      this.syncPermsToCloud();
    }
  },

  closeProfileNameModal() {
    const el = document.getElementById("config-profile-name-modal");
    if (el) el.remove();
    this._profileNameCtx = null;
  },

  openProfileNameModal(opts) {
    const options = opts || {};
    this.closeProfileNameModal();
    this._profileNameCtx = options;
    const title = options.title || "Perfil";
    const label = options.label || "Nome do perfil";
    const hint = options.hint || "";
    const defaultValue = options.defaultValue || "";
    const confirmLabel = options.confirmLabel || "Salvar";
    const icon = options.icon || "shield-plus";

    const overlay = document.createElement("div");
    overlay.id = "config-profile-name-modal";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:520px;max-width:96vw;box-shadow:0 20px 50px rgba(0,0,0,0.25);padding:22px 24px;" onclick="event.stopPropagation()">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
          <h3 style="margin:0;color:var(--color-primary);font-size:1.1rem;display:flex;align-items:center;gap:8px;">
            <i data-lucide="${icon}" style="width:18px;height:18px;"></i> ${title}
          </h3>
          <button type="button" onclick="ConfigUsersApp.closeProfileNameModal()" style="background:none;border:none;font-size:1.4rem;line-height:1;cursor:pointer;color:#64748b;">&times;</button>
        </div>
        ${hint ? `<p style="margin:0 0 14px;font-size:0.85rem;color:#64748b;line-height:1.45;">${hint}</p>` : ""}
        <label for="config-profile-name-input" style="display:block;font-size:0.75rem;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;">
          ${label} <span style="color:var(--color-danger);">*</span>
        </label>
        <input id="config-profile-name-input" type="text" class="form-control"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.95rem;text-transform:uppercase;"
          value="${String(defaultValue).replace(/"/g, "&quot;")}">
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
          <button type="button" class="btn btn-cancel" onclick="ConfigUsersApp.closeProfileNameModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="ConfigUsersApp.confirmProfileNameModal()">
            <i data-lucide="check" style="width:14px;height:14px;"></i> ${confirmLabel}
          </button>
        </div>
      </div>
    `;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeProfileNameModal();
    });
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    const input = document.getElementById("config-profile-name-input");
    if (input) {
      input.focus();
      input.select();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.confirmProfileNameModal();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.closeProfileNameModal();
        }
      });
    }
  },

  confirmProfileNameModal() {
    const ctx = this._profileNameCtx;
    const input = document.getElementById("config-profile-name-input");
    const name = input ? input.value.trim() : "";
    if (!name) {
      alert("Informe o nome do perfil.");
      if (input) input.focus();
      return;
    }
    this.closeProfileNameModal();
    if (ctx && typeof ctx.onConfirm === "function") ctx.onConfirm(name);
  },

  addProfile() {
    this.openProfileNameModal({
      title: "Novo perfil",
      label: "Nome do perfil",
      hint: "O nome será salvo em maiúsculas. Depois ajuste as permissões e clique em Salvar Permissões.",
      defaultValue: "",
      confirmLabel: "Criar perfil",
      icon: "shield-plus",
      onConfirm: (profileName) => {
        const id = this.profileIdFromName(profileName);
        if (!id) {
          alert("Nome inválido.");
          return;
        }
        if (this.profiles.find(p => p.id === id || String(p.name).toUpperCase() === profileName.trim().toUpperCase())) {
          alert("Este perfil já existe.");
          return;
        }
        this.profiles.push({ id, name: profileName.trim().toUpperCase() });
        if (typeof window.forgetRemovedCrmProfile === "function") window.forgetRemovedCrmProfile(id);
        const savedProfile = this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles));
        if (!savedProfile) {
          alert("O navegador está sem espaço. Vou tentar gravar o perfil direto na nuvem.");
        }
        this.persistProfilesCloud().catch((e) => {
          alert("Não consegui gravar o perfil na nuvem. Ele some ao atualizar a página. " + (e && e.message ? e.message : ""));
        });
        if (window.isOperadorCobrancaProfile(profileName) && String(profileName).toUpperCase().includes("BACK")) {
          this.unifyBackOfficeProfiles();
        }
        if (window.isOperadorCobrancaTerceirizadoProfile(profileName)) {
          this.seedTerceirizadoPermsFromCobranca();
        }
        this.selectedProfile = id;
        this.render();
      }
    });
  },

  editProfile(id) {
    if (id === "admin") return;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;

    this.openProfileNameModal({
      title: "Editar perfil",
      label: "Nome do perfil",
      defaultValue: profile.name,
      confirmLabel: "Salvar nome",
      icon: "pencil",
      onConfirm: async (newName) => {
        const next = newName.trim().toUpperCase();
        if (!next || next === profile.name) return;
        if (this.profiles.some(p => p.id !== id && String(p.name).toUpperCase() === next)) {
          alert("Já existe outro perfil com esse nome.");
          return;
        }
        const previous = profile.name;
        profile.name = next;
        (this.users || []).forEach((u) => {
          if (String(u.profile_name || "").trim().toUpperCase() === previous.toUpperCase()) u.profile_name = next;
        });
        this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles));
        try { await this.persistProfilesCloud(); } catch (e) {
          alert("O nome mudou nesta tela, mas não gravou na nuvem. " + (e && e.message ? e.message : "Tente de novo."));
        }
        try { await this.persistUsers(); } catch (e) {}
        this.render();
      }
    });
  },

  duplicateProfile(sourceId) {
     if (sourceId === "admin") {
         alert("Operação bloqueada: Por medidas de segurança, não é permitido copiar o perfil de Administrador.");
         return;
     }

     const sourceProfile = this.profiles.find(p => p.id === sourceId);
     if (!sourceProfile) return;

     const sourceNorm = String(sourceProfile.name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
     const suggestTerc = sourceNorm === "OPERADOR COBRANCA";
     const defaultName = suggestTerc
       ? "OPERADOR COBRANÇA TERCEIRIZADO"
       : `CÓPIA DE ${sourceProfile.name}`;

     this.openProfileNameModal({
       title: "Copiar perfil",
       label: "Nome do novo perfil",
         hint: `Cópia de <strong>${sourceProfile.name}</strong>. As permissões serão copiadas neste momento; depois cada perfil se edita sozinho.`,
       defaultValue: defaultName,
       confirmLabel: "Criar cópia",
       icon: "copy",
       onConfirm: (profileName) => {
         const newId = profileName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
         if (!newId) {
           alert("Nome inválido.");
           return;
         }
         if (this.profiles.find(p => p.id === newId || String(p.name).toUpperCase() === profileName.trim().toUpperCase())) {
           alert("Este perfil já existe.");
           return;
         }

         this.profiles.push({ id: newId, name: profileName.trim().toUpperCase() });
         this.safeLocalSet("crm_moura_profiles", JSON.stringify(this.profiles));

         // Espelho leve das permissões (evita estourar localStorage)
         this.seedPermsAsMirror(newId, sourceId);

         this.selectedProfile = newId;
         this.render();
       }
     });
  },

  async deleteProfile(id) {
     if (id === "admin") {
         alert("Não é possível excluir o perfil de Administrador.");
         return;
     }

     const profile = this.profiles.find(p => p.id === id);
     if (!profile) return;

     const inUse = this.users.some(u => u.profile_name === profile.name);
     if (inUse) {
         alert(`Não é possível excluir o perfil "${profile.name}", pois existem usuários vinculados a ele.`);
         return;
     }

     const ok = typeof window.mouraConfirm === "function"
       ? await window.mouraConfirm(`Tem certeza que deseja excluir o perfil "${profile.name}"? Esta ação não pode ser desfeita.`)
       : confirm(`Tem certeza que deseja excluir o perfil "${profile.name}"? Esta ação não pode ser desfeita.`);
     if (!ok) return;

     this.profiles = this.profiles.filter(p => p.id !== id);
     if (typeof window.rememberRemovedCrmProfile === "function") window.rememberRemovedCrmProfile(id);
     localStorage.setItem("crm_moura_profiles", JSON.stringify(this.profiles));
     localStorage.removeItem(`crm_perms_${id}`);
     this.selectedProfile = "admin";
     this.render();
  },

  // Método movido para dentro do modal de edição

  isPagadoriaProfile(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes("PAGADORIA");
  },

  syncDeptBox() {
    const box = document.getElementById("umodal-dept-box");
    const sel = document.getElementById("umodal-profile");
    if (!box || !sel) return;
    box.style.display = this.isPagadoriaProfile(sel.value) ? "none" : "";
  },

  deptUserLine(u) {
    if (this.isPagadoriaProfile(u && u.profile_name)) return "";
    const today = new Date();
    const iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const current = this.deptHistoryOf(u).filter((h) => h.name && (!h.to || h.to >= iso));
    if (!current.length) return "";
    return `<div style="font-size: 0.75rem; color: #105436; margin-top: 4px;">${current.map((h) => this.esc(h.name)).join(" · ")}</div>`;
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  deptHistoryOf(user) {
    const list = user && Array.isArray(user.department_history) ? user.department_history : [];
    return list.map((h) => ({
      id: String(h && h.id != null ? h.id : ""),
      name: String(h && h.name || "").trim(),
      from: String(h && h.from || "").slice(0, 10),
      to: String(h && h.to || "").slice(0, 10),
      keep: !!(h && h.keep)
    }));
  },

  deptOptionHtml(selectedId, selectedName) {
    const cat = this._deptCatalog || [];
    const sid = String(selectedId || "");
    let found = !sid;
    const opts = ['<option value="">Selecione</option>'];
    cat.forEach((d) => {
      const id = String(d.id);
      if (id === sid) found = true;
      const label = id + " - " + String(d.name || "").toUpperCase();
      opts.push(`<option value="${this.esc(id)}" data-name="${this.esc(d.name)}" ${id === sid ? "selected" : ""}>${this.esc(label)}</option>`);
    });
    if (sid && !found) {
      opts.push(`<option value="${this.esc(sid)}" data-name="${this.esc(selectedName)}" selected>${this.esc(selectedName || sid)}</option>`);
    }
    return opts.join("");
  },

  deptRowHtml(row) {
    const item = row || { id: "", name: "", from: "", to: "", keep: false };
    return `
      <div data-dept-row style="display:grid; grid-template-columns: minmax(0, 1.4fr) 140px 140px minmax(160px, auto) auto; gap: 8px; align-items: end; margin-bottom: 8px;">
        <label style="display:block; font-size:0.75rem; font-weight:700; color:#64748b;">
          Departamento
          <select data-dept-select style="display:block; width:100%; margin-top:4px; padding:8px; border:1px solid #e8eaed; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
            ${this.deptOptionHtml(item.id, item.name)}
          </select>
        </label>
        <label style="display:block; font-size:0.75rem; font-weight:700; color:#64748b;">
          De
          <input type="date" data-dept-from value="${this.esc(item.from)}" style="display:block; width:100%; margin-top:4px; padding:8px; border:1px solid #e8eaed; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
        </label>
        <label style="display:block; font-size:0.75rem; font-weight:700; color:#64748b;">
          Até
          <input type="date" data-dept-to value="${this.esc(item.to)}" style="display:block; width:100%; margin-top:4px; padding:8px; border:1px solid #e8eaed; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:#334155; margin:0 0 8px;">
          <input type="checkbox" data-dept-keep ${item.keep ? "checked" : ""}>
          Continuar vendo
        </label>
        <button type="button" onclick="this.closest('[data-dept-row]').remove()" style="height:38px; padding:0 10px; border:1px solid #e8eaed; background:#fff; border-radius:8px; cursor:pointer; color:#64748b; font-size:0.75rem;">Excluir</button>
      </div>`;
  },

  paintDeptRows(note) {
    const box = document.getElementById("umodal-dept-rows");
    if (!box) return;
    const rows = this._deptDraft || [];
    box.innerHTML = rows.length
      ? rows.map((r) => this.deptRowHtml(r)).join("")
      : `<p style="margin:0 0 8px; font-size:0.8rem; color:#64748b;">Nenhum período. Sem departamento, a pessoa vê todas as previsões.</p>`;
    const msg = document.getElementById("umodal-dept-note");
    if (msg) msg.textContent = note || "";
  },

  readDeptDraft() {
    return Array.from(document.querySelectorAll("[data-dept-row]")).map((row) => {
      const sel = row.querySelector("[data-dept-select]");
      const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
      return {
        id: sel ? sel.value : "",
        name: opt ? (opt.getAttribute("data-name") || "") : "",
        from: (row.querySelector("[data-dept-from]") || {}).value || "",
        to: (row.querySelector("[data-dept-to]") || {}).value || "",
        keep: !!((row.querySelector("[data-dept-keep]") || {}).checked)
      };
    });
  },

  addDeptRow() {
    const today = new Date();
    const iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    this._deptDraft = this.readDeptDraft().concat([{ id: "", name: "", from: iso, to: "" }]);
    this.paintDeptRows("");
  },

  async loadDeptCatalog() {
    const note = document.getElementById("umodal-dept-note");
    if (!window.SiengeApiService || typeof SiengeApiService.getDepartments !== "function") {
      if (note) note.textContent = "API Sienge indisponível.";
      return;
    }
    if (note) note.textContent = "Carregando departamentos do Sienge…";
    try {
      const list = await SiengeApiService.getDepartments(false);
      this._deptCatalog = Array.isArray(list) ? list : [];
      if (!document.getElementById("umodal-dept-rows")) return;
      this._deptDraft = this.readDeptDraft();
      this.paintDeptRows(this._deptCatalog.length ? "" : "O Sienge não retornou departamentos.");
    } catch (e) {
      if (document.getElementById("umodal-dept-note")) {
        document.getElementById("umodal-dept-note").textContent = "Não foi possível carregar os departamentos do Sienge.";
      }
    }
  },

  collectDeptHistory() {
    const sel = document.getElementById("umodal-profile");
    if (this.isPagadoriaProfile(sel && sel.value)) return [];
    if (!document.getElementById("umodal-dept-box")) return null;
    const rows = this.readDeptDraft();
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.id && !row.from && !row.to && !row.keep) continue;
      if (!row.id) {
        alert("Selecione o departamento na linha " + (i + 1) + ".");
        return false;
      }
      if (!row.from) {
        alert("Informe desde quando a pessoa está nesse departamento.");
        return false;
      }
      if (row.to && row.to < row.from) {
        alert("A data final do departamento não pode ser anterior à inicial.");
        return false;
      }
      out.push({
        id: String(row.id),
        name: String(row.name || "").trim(),
        from: row.from,
        to: row.to || "",
        keep: !!row.keep
      });
    }
    return out;
  },

  openUserModal(userId = null, userEmail = null) {
      let user = null;
      if (userId) {
         user = this.findUser(userId, userEmail);
         if (!user) return;
      }
      
      const userProfileOptions = this.profiles.map(p => 
          `<option value="${p.name}" ${user && p.name === user.profile_name ? 'selected' : (!user && p.name === 'OPERADOR COBRANÇA' ? 'selected' : '')}>${p.name}</option>`
      ).join('');

      let companies = [];
      let cities = [];
      
      const currentAppState = typeof AppState !== 'undefined' ? AppState : window.AppState;
      
      if (currentAppState) {
          let allComps = currentAppState.cachedCompanies || currentAppState.companies || [];
          try {
             const localCustom = localStorage.getItem('crm_empresas_custom');
             if (localCustom) {
                 const customData = JSON.parse(localCustom);
                 const isCompanyInternal = (company) => {
                     if (!company || typeof company !== 'object') return false;
                     const value = company.cobranca_interna;
                     return value === 1 || value === true || value === "1" || value === "true";
                 };
                 const internalIds = Object.entries(customData)
                     .filter(([id, c]) => isCompanyInternal(c))
                     .map(([id, c]) => Number(c.company_id ?? c.id ?? id))
                     .filter(Number.isFinite);
                 companies = allComps.filter(c => internalIds.includes(Number(c.id))).map(c => {
                     const custom = customData[c.id] || {};
                     return { ...c, nome_usual: custom.nome_usual || c.name || c.nome };
                 });
             }
          } catch(e) {}
          
          if (currentAppState.rules) {
              const rules = currentAppState.rules;
              Object.keys(rules).forEach(k => {
                  if (k.startsWith('CID_')) {
                      const op = rules[k].operator;
                      const isSemCarteira = Array.isArray(op) ? op.includes("SEM CARTEIRA INADIMPLENTE") : op === "SEM CARTEIRA INADIMPLENTE";
                      if (!isSemCarteira) {
                          cities.push(k.replace('CID_', '').replace(/_/g, ' '));
                      }
                  }
              });
          }
      }
      
      cities.sort();
      companies.sort((a,b) => Number(a.id) - Number(b.id));

      const buildCheckboxList = (items, inputName, selectedValues, extraAttrs = '') => {
          if (!items || items.length === 0) return `<div style="padding: 10px; font-size: 0.85rem; color: #80868b;">Nenhum item encontrado</div>`;
          
          let onSelectAll = '';
          if (inputName === 'umodal-adv-companies') {
              onSelectAll = `onchange="const isChecked = this.checked; this.closest('div').querySelectorAll('input[type=\\'checkbox\\']').forEach(cb => cb.checked = isChecked); window.updateAdvogadoCities();"`;
          } else if (inputName === 'umodal-const-companies') {
              onSelectAll = `onchange="const isChecked = this.checked; this.closest('div').querySelectorAll('input[type=\\'checkbox\\']').forEach(cb => cb.checked = isChecked); window.updateConstCities();"`;
          } else {
              onSelectAll = `onchange="const isChecked = this.checked; this.closest('div').querySelectorAll('input[type=\\'checkbox\\']').forEach(cb => cb.checked = isChecked);"`;
          }

          let html = `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; color: var(--color-primary); border-bottom: 1px solid #eee; padding-bottom: 6px;">
                         <input type="checkbox" ${onSelectAll}>
                         Selecionar Todos
                      </label>`;
                      
          html += items.map(item => {
              const val = item.value;
              const label = item.label;
              const isChecked = selectedValues && selectedValues.includes(val) ? 'checked' : '';
              return `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.85rem; cursor: pointer; color: #202124;">
                         <input type="checkbox" name="${inputName}" value="${val}" ${isChecked} ${extraAttrs}>
                         ${label}
                      </label>`;
          }).join('');
          
          return html;
      };

      window.updateAdvogadoCities = () => {
          const selectedCompanyCheckboxes = document.querySelectorAll('input[name="umodal-adv-companies"]:checked');
          const selectedCompanyIds = Array.from(selectedCompanyCheckboxes).map(cb => cb.value);
          let allowedCities = [];
          
          if (selectedCompanyIds.length > 0 && currentAppState && currentAppState.cachedCostCenters) {
              const ccIdToCity = {};
              currentAppState.cachedCostCenters.forEach(cc => {
                  let city = "";
                  if (String(cc.id) === "14201" || (cc.name && cc.name.toUpperCase().includes("ARAÇARI"))) {
                      city = "ARAÇARIGUAMA";
                  } else if (cc.name && cc.name.includes('-')) {
                      city = cc.name.split('-')[0].trim().toUpperCase();
                  }
                  if (city) ccIdToCity[cc.id] = city;
              });

              const clients = window.rawClientList || currentAppState.sales || [];
              clients.forEach(c => {
                  const sComp = String(c.companyId || "");
                  if (selectedCompanyIds.includes(sComp) && c.costCenterId) {
                      const city = ccIdToCity[c.costCenterId];
                      if (city && cities.includes(city) && !allowedCities.includes(city)) {
                          allowedCities.push(city);
                      }
                  }
              });

              allowedCities.sort();
          }
          if (!allowedCities.length) allowedCities = [...cities];
          
          const currentlyChecked = Array.from(document.querySelectorAll('input[name="umodal-adv-cities"]:checked')).map(cb => cb.value);
          currentlyChecked.forEach((city) => { if (!allowedCities.includes(city)) allowedCities.push(city); });
          allowedCities.sort();
          const cityItems = allowedCities.map(c => ({ value: c, label: c }));
          const newHtml = buildCheckboxList(cityItems, 'umodal-adv-cities', currentlyChecked);
          const container = document.getElementById('adv-cities-container');
          if (container) container.innerHTML = newHtml;
      };

      const companyItems = companies.map(c => ({ value: String(c.id), label: `${c.id} - ${c.nome_usual}` }));
      const allCompanyItems = (currentAppState.cachedCompanies || currentAppState.companies || []).map(c => ({ value: String(c.id), label: `${c.id} - ${c.name || c.nome}` }));
      
      const cityItems = cities.map(c => ({ value: c, label: c }));

      const advCompaniesHtml = buildCheckboxList(companyItems, 'umodal-adv-companies', user ? user.adv_companies : [], 'onchange="window.updateAdvogadoCities()"');
      const savedAdvCities = (user && Array.isArray(user.adv_cities)) ? user.adv_cities : [];
      const advCityItems = cities.concat(savedAdvCities.filter((c) => !cities.includes(c))).sort().map(c => ({ value: c, label: c }));
      const advCitiesHtml = buildCheckboxList(advCityItems, 'umodal-adv-cities', savedAdvCities);

      window.updateConstCities = () => {};

      // constCompaniesHtml was removed because construction checking only requires cities.
      const constCitiesHtml = buildCheckboxList(cityItems, 'umodal-const-cities', user ? user.const_cities : []);

      const switchCss = `
        <style>
          .ml-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
          .ml-switch input { opacity: 0; width: 0; height: 0; }
          .ml-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #cbd5e1; transition: .25s; border-radius: 24px; }
          .ml-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; transition: .25s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
          .ml-switch input:checked + .ml-slider { background: #105436; }
          .ml-switch input:checked + .ml-slider:before { transform: translateX(20px); }
          .ml-switch-row { display: flex; align-items: center; gap: 10px; font-weight: 600; color: #334155; font-size: 0.85rem; cursor: pointer; margin: 0; }
        </style>`;
      const switchField = (id, checked, onchange, label) => `
        <label class="ml-switch-row">
          <span class="ml-switch">
            <input type="checkbox" id="${id}" ${checked ? "checked" : ""} onchange="${onchange}">
            <span class="ml-slider"></span>
          </span>
          ${label}
        </label>`;

      const modalHtml = `
      <div id="user-modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(12, 41, 29, 0.55); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px;">
         ${switchCss}
         <div style="background: #fff; border-radius: 16px; width: 920px; max-width: 100%; max-height: 92vh; overflow: hidden; box-shadow: 0 16px 48px rgba(16, 84, 54, 0.22); display: flex; flex-direction: column; border: 1px solid rgba(16,84,54,0.12);">
            <div style="background: #105436; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;">
              <div>
                <div style="color: rgba(255,255,255,0.75); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;">Cadastro de usuários</div>
                <h3 style="margin: 4px 0 0; font-size: 1.2rem; color: #fff; font-weight: 700;">${user ? 'Editar usuário' : 'Convidar novo usuário'}</h3>
              </div>
              <button type="button" onclick="document.getElementById('user-modal-overlay').remove()" style="border: none; background: rgba(255,255,255,0.15); color: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 1.1rem; line-height: 1;">×</button>
            </div>
            <div style="padding: 24px 28px; overflow-y: auto; flex: 1;">
            
            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Nome Completo</label>
                  <input type="text" id="umodal-name" value="${user ? user.name : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">E-mail Corporativo</label>
                  <input type="email" id="umodal-email" value="${user ? user.email : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>
            
            <div style="margin-bottom: 16px; display: flex; gap: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Usuário Sienge</label>
                  <input type="text" id="umodal-sienge" value="${user ? (user.sienge_user||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Celular</label>
                  <input type="text" id="umodal-phone" placeholder="(00) 00000-0000" maxlength="15" oninput="this.value = this.value.replace(/\\D/g, '').replace(/(\\d{2})(\\d)/, '($1) $2').replace(/(\\d{5})(\\d)/, '$1-$2').slice(0, 15);" value="${user ? (user.phone||'') : ''}" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Telefone corporativo</label>
                  <input type="text" id="umodal-fone-corp" placeholder="(00) 0000-0000" maxlength="14" oninput="this.value = this.value.replace(/\\D/g, '').replace(/(\\d{2})(\\d)/, '($1) $2').replace(/(\\d{4})(\\d)/, '$1-$2').slice(0, 14);" value="${user ? (user.telefone_corporativo||'') : ''}" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>

            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Cor de Destaque (Fila de Cobrança)</label>
                  <div style="display: flex; gap: 12px; align-items: center;">
                    <input type="color" id="umodal-badge-color" value="${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'}" style="width: 45px; height: 40px; padding: 0; border: 1px solid #e8eaed; border-radius: 4px; cursor: pointer; box-sizing: border-box; outline: none;" onchange="
                      const hex = this.value;
                      const preview = document.getElementById('badge-color-preview');
                      preview.style.backgroundColor = 'color-mix(in srgb, ' + hex + ' 15%, white)';
                      preview.style.color = 'color-mix(in srgb, ' + hex + ' 60%, black)';
                      preview.style.border = '1px solid color-mix(in srgb, ' + hex + ' 30%, white)';
                    ">
                    <div id="badge-color-preview" style="
                      padding: 4px 12px; 
                      border-radius: 12px; 
                      font-size: 0.75rem; 
                      font-weight: 600;
                      background-color: color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 15%, white);
                      color: color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 60%, black);
                      border: 1px solid color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 30%, white);
                    ">
                      Visualização
                    </div>
                  </div>
                  <span style="font-size: 0.75rem; color: #9aa0a6; display: block; margin-top: 6px;">
                    Escolha a cor base. O fundo e a fonte serão ajustados para dar contraste automático.
                  </span>
               </div>
               <div style="flex: 1;"></div>
            </div>

            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Perfil de Acesso</label>
                  <select id="umodal-profile" onchange="window.syncUserModalProfile(this)" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; cursor: pointer; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
                     ${userProfileOptions}
                  </select>
               </div>
               <div id="umodal-operator-type-container" style="flex: 1; display: ${((window.isOperadorCobrancaProfile(user && user.profile_name) && !window.isOperadorCobrancaTerceirizadoProfile(user && user.profile_name)) || !user) ? 'block' : 'none'};">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Tipo de Operador</label>
                  <select id="umodal-operator-type" onchange="window.syncUserModalProfile(document.getElementById('umodal-profile'))" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; cursor: pointer; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
                     <option value="interno" ${user && user.operator_type === 'interno' && !window.isOperadorCobrancaTerceirizadoProfile(user.profile_name) ? 'selected' : ''}>Interno</option>
                     <option value="externo" ${user && (user.operator_type === 'externo' || window.isOperadorCobrancaTerceirizadoProfile(user.profile_name)) ? 'selected' : (!user ? '' : '')}>Externo (Terceirizada)</option>
                     <option value="apoio_juridico" ${user && user.operator_type === 'apoio_juridico' ? 'selected' : ''}>Apoio Jurídico (Interno)</option>
                     <option value="advogado" ${user && user.operator_type === 'advogado' ? 'selected' : ''}>Advogado (Jurídico)</option>
                  </select>
               </div>
            </div>
            
            <div id="umodal-advogado-config" style="margin-bottom: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e8eaed; display: ${user && (window.isAdvogadoCobrancaProfile(user.profile_name) || user.operator_type === 'advogado') ? 'block' : 'none'};">
               <h4 style="margin: 0 0 8px 0; font-size: 0.95rem; color: #202124;">Configurações de Atuação do Advogado</h4>
               <p style="font-size: 0.8rem; color: #5f6368; margin-top: 0; margin-bottom: 12px;">Selecione os locais onde este advogado irá atuar (se o título coincidir com qualquer um dos locais marcados, será atribuído a este advogado).</p>
               
               <div style="display: flex; gap: 16px;">
                   <div style="flex: 1;">
                      <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.8rem;">Empresas (Cobrança Interna)</label>
                      <div style="height: 150px; overflow-y: auto; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; background: #fff;">
                         ${advCompaniesHtml}
                      </div>
                   </div>
                   <div style="flex: 1;">
                      <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.8rem;">Cidades (Com Carteira Inadimplente)</label>
                      <div id="adv-cities-container" style="height: 150px; overflow-y: auto; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; background: #fff;">
                         ${advCitiesHtml}
                      </div>
                   </div>
               </div>
            </div>

            <div style="margin-bottom: 18px; padding: 16px; background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 10px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
               ${switchField("umodal-check-const", !!(user && user.check_construction), "document.getElementById('umodal-const-config').style.display = this.checked ? 'block' : 'none';", "Responsável por checar construção")}
               <div id="umodal-resend-billet-container" style="display: ${window.isOperadorCobrancaProfile(user && user.profile_name) || window.isAdvogadoCobrancaProfile(user && user.profile_name) || !user ? 'block' : 'none'};">
                   ${switchField("umodal-resend-billet", !!(user && user.resend_billet), "", "Responsável por reenviar boleto de cliente")}
               </div>
               ${switchField("umodal-assina-testemunha", !!(user && user.assina_testemunha), "document.getElementById('umodal-witness-docs').style.display = this.checked ? 'block' : 'none';", "Assina documentos como testemunha")}
            </div>
            <div id="umodal-witness-docs" style="margin-bottom: 16px; display: ${user && user.assina_testemunha ? 'block' : 'none'};">
               <label style="display: block; font-weight: 600; color: #334155; margin-bottom: 6px; font-size: 0.85rem;">RG da testemunha</label>
               <input type="text" id="umodal-doc-rg" value="${user ? (user.doc_rg || user.rg || '') : ''}" placeholder="00.000.000-0" style="width: 280px; max-width: 100%; padding: 10px; border: 1px solid #d1fae5; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box;">
            </div>

            <div id="umodal-const-config" style="margin-bottom: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e8eaed; display: ${user && user.check_construction ? 'block' : 'none'};">
               <h4 style="margin: 0 0 8px 0; font-size: 0.95rem; color: #202124;">Configurações de Atuação (Construção)</h4>
               <p style="font-size: 0.8rem; color: #5f6368; margin-top: 0; margin-bottom: 12px;">Selecione as cidades pelas quais este operador será responsável por verificar a construção.</p>
               
               <div style="display: flex; gap: 16px;">
                   <div style="flex: 1;">
                      <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.8rem;">Cidades</label>
                      <div id="const-cities-container" style="height: 150px; overflow-y: auto; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; background: #fff;">
                         ${constCitiesHtml}
                      </div>
                   </div>
               </div>
            </div>
            
            <div id="umodal-dept-box" style="margin-bottom: 16px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e8eaed;">
               <h4 style="margin: 0 0 6px; font-size: 0.95rem; color: #202124;">Departamentos</h4>
               <p style="font-size: 0.8rem; color: #5f6368; margin: 0 0 12px;">Quem está no departamento hoje vê as previsões anteriores dele. Deixe <strong>Até</strong> vazio enquanto ela permanece. Ao mudar de área, preencha a data final e marque <strong>Continuar vendo</strong> só se ela ainda puder ver o departamento anterior. O período fica no histórico.</p>
               <div id="umodal-dept-rows"></div>
               <p id="umodal-dept-note" style="margin: 0 0 8px; font-size: 0.78rem; color: #9a3412;"></p>
               <button type="button" onclick="ConfigUsersApp.addDeptRow()" style="padding: 8px 12px; border: 1px solid #105436; background: #fff; color: #105436; font-weight: 700; border-radius: 8px; cursor: pointer; font-size: 0.8rem;">Adicionar departamento</button>
            </div>

            <div style="margin-bottom: 16px; display: flex; gap: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Gestor Imediato (Nome)</label>
                  <input type="text" id="umodal-manager-name" placeholder="Ex: Joao Silva" value="${user ? (user.manager_name||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Gestor Imediato (E-mail)</label>
                  <input type="email" id="umodal-manager-email" placeholder="gestor@empresa.com.br" value="${user ? (user.manager_email||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; padding-top: 18px; border-top: 1px solid #e8eaed;">
               <button class="btn btn-cancel" onclick="document.getElementById('user-modal-overlay').remove()">Cancelar</button>
               <button onclick="ConfigUsersApp.saveUserModal(${user ? this.attrArg(user.id) : 'null'}, ${user ? this.attrArg(user.email || '') : 'null'})" style="padding: 11px 20px; border: none; background: #105436; color: #fff; font-weight: 700; border-radius: 8px; cursor: pointer;" onmouseover="this.style.background='#0c4028'" onmouseout="this.style.background='#105436'">Salvar dados</button>
            </div>
            </div>
         </div>
      </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      this.syncDeptBox();
      if (!this.isPagadoriaProfile(user && user.profile_name)) {
        this._deptDraft = this.deptHistoryOf(user);
        this._deptCatalog = this._deptCatalog || [];
        this.paintDeptRows("");
        this.loadDeptCatalog();
      }
  },

  async toggleUserStatus(userId, userEmail = null) {
      const user = this.findUser(userId, userEmail);
      if (!user) return;
      user.status = String(user.status || "").toUpperCase() === "ATIVO" ? "INATIVO" : "ATIVO";
      user.statusAt = Date.now();
      try {
          await this.persistUsers();
      } catch (e) {
          alert("Não consegui gravar a situação do usuário. " + ((e && e.message) || "Tente de novo."));
      }
      this.render();
  },

  async saveUserModal(userId, userEmail = null) {
      const name = document.getElementById('umodal-name').value.trim();
      const email = document.getElementById('umodal-email').value.trim();
      const sienge = document.getElementById('umodal-sienge').value.trim();
      const phone = document.getElementById('umodal-phone').value.trim();
      const telefoneCorporativo = document.getElementById('umodal-fone-corp') ? document.getElementById('umodal-fone-corp').value.trim() : '';
      const profileName = document.getElementById('umodal-profile').value;
      const managerName = document.getElementById('umodal-manager-name').value.trim();
      const managerEmail = document.getElementById('umodal-manager-email').value.trim();
      const operatorTypeEl = document.getElementById('umodal-operator-type');
      let operatorType = operatorTypeEl ? operatorTypeEl.value : null;
      if (window.isOperadorCobrancaTerceirizadoProfile(profileName)) {
        operatorType = "externo";
      }
      const badgeColor = document.getElementById('umodal-badge-color') ? document.getElementById('umodal-badge-color').value : null;

      const advCompanies = Array.from(document.querySelectorAll('input[name="umodal-adv-companies"]:checked')).map(el => el.value);
      const advCities = Array.from(document.querySelectorAll('input[name="umodal-adv-cities"]:checked')).map(el => el.value);
      const advCostCenters = Array.from(document.querySelectorAll('input[name="umodal-adv-costcenters"]:checked')).map(el => el.value);

      const checkConstruction = document.getElementById('umodal-check-const') ? document.getElementById('umodal-check-const').checked : false;
      const constCities = Array.from(document.querySelectorAll('input[name="umodal-const-cities"]:checked')).map(el => el.value);

      const resendBillet = document.getElementById('umodal-resend-billet') ? document.getElementById('umodal-resend-billet').checked : false;
      const assinaTestemunha = document.getElementById('umodal-assina-testemunha') ? document.getElementById('umodal-assina-testemunha').checked : false;
      const docRg = document.getElementById('umodal-doc-rg') ? document.getElementById('umodal-doc-rg').value.trim() : '';
      const departmentHistory = this.collectDeptHistory();
      if (departmentHistory === false) return;

      if (!name || !email) {
          alert("Nome e E-mail são obrigatórios.");
          return;
      }

      const isAdvProfile = window.isAdvogadoCobrancaProfile(profileName);
      const isOperatorProfile = window.isOperadorCobrancaProfile(profileName) || profileName.toUpperCase().includes("OPERADOR");
      const resolvedOperatorType = isAdvProfile ? "advogado" : (isOperatorProfile ? operatorType : null);
      const fields = {
          name: name,
          email: email,
          sienge_user: sienge,
          phone: phone,
          telefone_corporativo: telefoneCorporativo,
          profile_name: profileName,
          operator_type: resolvedOperatorType,
          adv_companies: resolvedOperatorType === 'advogado' ? advCompanies : [],
          adv_cities: resolvedOperatorType === 'advogado' ? advCities : [],
          adv_cost_centers: resolvedOperatorType === 'advogado' ? advCostCenters : [],
          check_construction: checkConstruction,
          const_companies: [],
          const_cities: checkConstruction ? constCities : [],
          manager_name: managerName,
          manager_email: managerEmail,
          editedAt: Date.now(),
          badge_color: badgeColor,
          resend_billet: resendBillet,
          assina_testemunha: assinaTestemunha,
          doc_rg: docRg,
          department_history: departmentHistory || []
      };

      try {
      const emailKey = email.toLowerCase();
      if (typeof window.reviveCrmUserEmail === "function") window.reviveCrmUserEmail(emailKey);
      if (userId) {
          const user = this.findUser(userId, userEmail);
          if (!user) {
              alert("Não encontrei esse usuário na lista. Atualize a tela e tente de novo.");
              return;
          }
          const oldEmail = String(user.email || "").toLowerCase().trim();
          Object.assign(user, fields);
          if (oldEmail && oldEmail !== emailKey) {
              this.users = this.users.filter((u) => {
                  if (u === user) return true;
                  const em = String((u && u.email) || "").toLowerCase().trim();
                  return em !== oldEmail && em !== emailKey;
              });
              if (typeof window.removeCrmUserEmail === "function") window.removeCrmUserEmail(oldEmail);
          }
          if (String(user.status || "").toUpperCase() === "PENDENTE") {
            user.status = "ATIVO";
            user.statusAt = Date.now();
          }
      } else {
          const existing = this.users.find(u => String(u.email || "").toLowerCase().trim() === emailKey);
          if (existing) {
              Object.assign(existing, fields);
              if (String(existing.status || "").toUpperCase() !== "INATIVO") existing.status = "ATIVO";
          } else {
              this.users.push(Object.assign({ id: this.nextUserId(), status: "ATIVO" }, fields));
          }
      }

      if (window.isOperadorCobrancaTerceirizadoProfile(profileName)) {
        try { this.seedTerceirizadoPermsFromCobranca(); } catch (e) { console.warn("[ConfigUsers] perfil terceirizado:", e); }
      }
      await this.persistUsers();
      const cu = window.AppState && AppState.currentUser;
      if (cu && String(cu.email || "").toLowerCase().trim() === email.toLowerCase()) {
          cu.department_history = fields.department_history;
      }
      const stillThere = this.users.some(u => String(u.email || "").toLowerCase().trim() === email.toLowerCase());
      if (!stillThere) {
          alert("O usuário não permaneceu na lista salva. Nada foi apagado na nuvem. Tente de novo.");
          return;
      }
      const overlay = document.getElementById('user-modal-overlay');
      if (overlay) overlay.remove();
      this.render();
      } catch (e) {
          console.error("[ConfigUsers] save", e);
          alert("Não foi possível salvar o usuário no Firebase. " + (e && e.message ? e.message : "Tente de novo."));
      }
  },

  setView(view) {
    this.view = view === "perfis" || view === "modulos" ? view : "usuarios";
    this.render();
  },

  setModPick(field, value) {
    if (!this.modView) this.modView = { module: "", sub: "", action: "" };
    this.modView[field] = value || "";
    if (field === "module") {
      this.modView.sub = "";
      this.modView.action = "";
    } else if (field === "sub") {
      this.modView.action = "";
    }
    this.render();
  },

  profileAccess(profileName) {
    const name = String(profileName || "").trim();
    const profile = (this.profiles || []).find((p) => String(p && p.name || "").trim() === name);
    const id = profile ? profile.id : name;
    const isAdmin = String(id) === "admin"
      || (typeof window.isCrmAdminProfileName === "function" && window.isCrmAdminProfileName(name));
    let perms = {};
    try { perms = Object.assign({}, this.getProfilePermsObject(id) || {}); } catch (e) { perms = {}; }
    this.hydrateSubmoduleFlags(perms);
    return { perms, isAdmin };
  },

  actionAccess(perms, sub, act) {
    if (act && act.id === "configuracoes" && typeof window.configuracoesPermChecked === "function") {
      return {
        acessar: !!window.configuracoesPermChecked(perms, "acessar"),
        visualizar: !!window.configuracoesPermChecked(perms, "visualizar"),
        editar: !!window.configuracoesPermChecked(perms, "editar")
      };
    }
    const f = this.permFlags(sub, act);
    return {
      acessar: !!(perms && perms[f.acessar]),
      visualizar: !!(perms && perms[f.visualizar]),
      editar: !!(perms && perms[f.editar])
    };
  },

  moduleScope() {
    const pick = this.modView || { module: "", sub: "", action: "" };
    if (!pick.module) return null;
    const mod = (this.modules || []).find((m) => m.key === pick.module);
    if (!mod) return null;
    const subs = (mod.submodules || []).filter((s) => !pick.sub || s.key === pick.sub);
    const actions = [];
    subs.forEach((sub) => {
      (sub.actions || []).forEach((act) => {
        const token = sub.key + "|" + act.id;
        if (pick.action && pick.action !== token) return;
        actions.push({ sub, act, token });
      });
    });
    const level = pick.action ? "item" : (pick.sub ? "sub" : "module");
    return { mod, subs, actions, level };
  },

  /** No módulo ou no subitem inteiro, Sim só vale se todas as telas daquele nível tiverem a permissão. */
  scopeFlagsAll(perms, actions) {
    const out = { acessar: true, visualizar: true, editar: true };
    (actions || []).forEach(({ sub, act }) => {
      const f = this.actionAccess(perms, sub, act);
      if (!f.acessar) out.acessar = false;
      if (!f.visualizar) out.visualizar = false;
      if (!f.editar) out.editar = false;
    });
    return out;
  },

  scopeAccess(perms, isAdmin, scope) {
    const none = { acessar: false, visualizar: false, editar: false };
    if (!scope) return none;
    if (isAdmin) return { acessar: true, visualizar: true, editar: true };
    const modOn = !!(perms && perms[scope.mod.key]);
    if (!modOn) return none;
    if (scope.level === "module") {
      if (!(scope.actions || []).length) {
        return { acessar: true, visualizar: true, editar: true };
      }
      return this.scopeFlagsAll(perms, scope.actions);
    }
    if (scope.level === "sub") {
      const sub = scope.subs[0];
      if (!sub || !perms[sub.key] || !(scope.actions || []).length) return none;
      return this.scopeFlagsAll(perms, scope.actions);
    }
    const one = scope.actions[0];
    if (!one || !perms[one.sub.key]) return none;
    return this.actionAccess(perms, one.sub, one.act);
  },

  modulosPanelHtml() {
    const pick = this.modView || { module: "", sub: "", action: "" };
    const mod = (this.modules || []).find((m) => m.key === pick.module);
    const subs = mod ? (mod.submodules || []) : [];
    const sub = subs.find((s) => s.key === pick.sub);
    const actions = sub ? (sub.actions || []) : [];
    const opt = (value, label, selected) => `<option value="${this.esc(value)}" ${selected ? "selected" : ""}>${this.esc(label)}</option>`;
    const scope = this.moduleScope();
    const cache = {};
    const people = [];
    if (scope) {
      (this.users || []).forEach((u) => {
        if (!u) return;
        const key = String(u.profile_name || "");
        if (!cache[key]) cache[key] = this.profileAccess(key);
        const access = this.scopeAccess(cache[key].perms, cache[key].isAdmin, scope);
        if (!access.acessar && !access.visualizar && !access.editar) return;
        people.push({ user: u, access });
      });
      people.sort((a, b) => {
        const aa = String(a.user.status || "").toUpperCase() === "ATIVO" ? 0 : 1;
        const bb = String(b.user.status || "").toUpperCase() === "ATIVO" ? 0 : 1;
        if (aa !== bb) return aa - bb;
        return String(a.user.name || "").localeCompare(String(b.user.name || ""), "pt-BR");
      });
    }
    const mark = (on) => on
      ? '<span style="color:#105436;font-weight:800;">Sim</span>'
      : '<span style="color:#94a3b8;">—</span>';
    const rows = people.map(({ user, access }) => {
      const st = String(user.status || "").toUpperCase();
      const tag = st === "ATIVO" ? "" : `<span style="margin-left:8px;background:#f1f5f9;color:#64748b;border-radius:999px;padding:2px 8px;font-size:0.7rem;font-weight:800;">${this.esc(st || "INATIVO")}</span>`;
      return `<tr>
        <td><div style="font-weight:700;">${this.esc(user.name || "—")}${tag}</div><div style="font-size:0.8rem;color:#64748b;margin-top:3px;">${this.esc(user.email || "")}</div></td>
        <td style="font-weight:700;">${this.esc(user.profile_name || "—")}</td>
        <td style="text-align:center;">${mark(access.acessar)}</td>
        <td style="text-align:center;">${mark(access.visualizar)}</td>
        <td style="text-align:center;">${mark(access.editar)}</td>
      </tr>`;
    }).join("");
    const empty = !scope
      ? "Selecione um módulo para ver quem tem permissão."
      : "Ninguém com permissão neste nível.";
    const path = [];
    if (mod) path.push(mod.name);
    if (sub) path.push(sub.name);
    if (pick.action && sub) {
      const act = actions.find((a) => (sub.key + "|" + a.id) === pick.action);
      if (act) path.push(act.label);
    }
    return `
      <div class="cfg-panel">
        <div class="cfg-filters">
          <div>
            <label for="cfg-mod-modulo" class="ml-emp-filter-label">Módulo</label>
            <select id="cfg-mod-modulo" class="form-control" onchange="ConfigUsersApp.setModPick('module', this.value)">
              ${opt("", "Selecione", !pick.module)}
              ${(this.modules || []).map((m) => opt(m.key, m.name, pick.module === m.key)).join("")}
            </select>
          </div>
          <div>
            <label for="cfg-mod-sub" class="ml-emp-filter-label">Subitem</label>
            <select id="cfg-mod-sub" class="form-control" ${mod ? "" : "disabled"} onchange="ConfigUsersApp.setModPick('sub', this.value)">
              ${opt("", "Todo o módulo", !pick.sub)}
              ${subs.map((s) => opt(s.key, s.name, pick.sub === s.key)).join("")}
            </select>
          </div>
          <div>
            <label for="cfg-mod-item" class="ml-emp-filter-label">Item</label>
            <select id="cfg-mod-item" class="form-control" ${sub ? "" : "disabled"} onchange="ConfigUsersApp.setModPick('action', this.value)">
              ${opt("", "Todo o subitem", !pick.action)}
              ${actions.map((a) => opt(sub.key + "|" + a.id, a.label, pick.action === (sub.key + "|" + a.id))).join("")}
            </select>
          </div>
          <div class="cfg-count">${scope ? people.length + " pessoa(s)" : ""}</div>
        </div>
        ${path.length ? `<p style="margin:0 0 12px;color:#105436;font-weight:800;">${this.esc(path.join(" · "))}</p>` : ""}
        <div class="cfg-table-wrap">
          <table class="cfg-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Perfil</th>
                <th style="text-align:center;">Acessar</th>
                <th style="text-align:center;">Visualizar</th>
                <th style="text-align:center;">Editar</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="5" style="padding:28px 16px;text-align:center;color:#64748b;">${empty}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  onUserFilter(field, value) {
    if (!this.userFilters) this.userFilters = { nome: "", perfil: "", email: "", status: "todos" };
    this.userFilters[field] = value;
    const el = document.activeElement;
    const id = el && el.id;
    const pos = el && typeof el.selectionStart === "number" ? el.selectionStart : null;
    this.render();
    if (!id) return;
    const next = document.getElementById(id);
    if (!next) return;
    next.focus();
    if (pos != null && next.setSelectionRange) {
      try { next.setSelectionRange(pos, pos); } catch (e) {}
    }
  },

  filteredUsers() {
    const f = this.userFilters || {};
    const nome = String(f.nome || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const email = String(f.email || "").toLowerCase().trim();
    const perfil = String(f.perfil || "");
    const status = f.status || "todos";
    return (this.users || []).filter((u) => {
      const un = String(u.name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (nome && un.indexOf(nome) < 0) return false;
      if (email && String(u.email || "").toLowerCase().indexOf(email) < 0) return false;
      if (perfil && String(u.profile_name || "") !== perfil) return false;
      const st = String(u.status || "").toUpperCase();
      if (status === "ativos" && st !== "ATIVO") return false;
      if (status === "inativos" && st !== "INATIVO") return false;
      return true;
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { sensitivity: "base" }));
  },

  render() {
    const root = document.getElementById('config-users-root');
    if (!root) return;

    const shownUsers = this.filteredUsers();
    let trs = shownUsers.map(u => {
      const isActive = u.status === 'ATIVO';
      const isPending = String(u.status || '').toUpperCase() === 'PENDENTE';
      const statusSwitch = `<div class="cfg-st">
             ${isPending ? '<span class="cfg-pend">PENDENTE</span>' : ''}
             <label class="moura-switch" title="${isActive ? 'Desativar' : 'Ativar'}">
               <input type="checkbox" ${isActive ? 'checked' : ''} onchange="ConfigUsersApp.toggleUserStatus(${this.attrArg(u.id)}, ${this.attrArg(u.email || '')})">
               <span class="moura-switch-track" aria-hidden="true"></span>
             </label>
           </div>`;
      const tipoOperador = (window.crmOperatorType(u) && window.isOperadorCobrancaProfile(u.profile_name))
        ? (window.crmOperatorType(u) === 'interno' ? 'Cobrança Interna' : (window.crmOperatorType(u) === 'externo' ? 'Terceirizada' : (window.crmOperatorType(u) === 'advogado' ? 'Advogado (Jurídico)' : 'Apoio Jurídico')))
        : '';

      return `
        <tr>
          <td class="cfg-nome">
            <strong>${this.esc(u.name)}</strong>
            ${this.deptUserLine(u)}
          </td>
          <td class="cfg-email" title="${this.esc(u.email || '')}">${this.esc(u.email || '-')}</td>
          <td>${this.esc(u.sienge_user || '-')}</td>
          <td>${this.esc(u.phone || '-')}</td>
          <td class="cfg-perfil">
            <strong>${this.esc(u.profile_name || '-')}</strong>
            ${tipoOperador ? `<small>${tipoOperador}</small>` : ''}
          </td>
          <td class="is-center">${statusSwitch}</td>
          <td class="is-right cfg-acoes">
            <button type="button" class="tvig-ico" title="Editar" onclick="ConfigUsersApp.openUserModal(${this.attrArg(u.id)}, ${this.attrArg(u.email || '')})">
              <i data-lucide="pencil" style="width:15px;height:15px;"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
    if (!trs) {
      trs = `<tr><td colspan="7" style="padding:28px 16px;text-align:center;color:#64748b;">Nenhum usuário neste filtro.</td></tr>`;
    }

    const filters = this.userFilters || { nome: "", perfil: "", email: "", status: "todos" };
    const profileChoices = [];
    const seenProfile = {};
    (this.profiles || []).forEach((p) => {
      const name = String(p && p.name || "").trim();
      if (!name || seenProfile[name]) return;
      seenProfile[name] = true;
      profileChoices.push(name);
    });
    (this.users || []).forEach((u) => {
      const name = String(u && u.profile_name || "").trim();
      if (!name || seenProfile[name]) return;
      seenProfile[name] = true;
      profileChoices.push(name);
    });
    profileChoices.sort((a, b) => a.localeCompare(b, "pt-BR"));

    const optionsHtml = this.profiles.map(p => {
       const isSelected = p.id === this.selectedProfile;
       return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name}</option>`;
    }).join('');
    
    const adminHidden = this.selectedProfile === 'admin' ? 'visibility: hidden;' : '';
    const actionBtns = `
      <div style="display: flex; gap: 2px;">
         <button type="button" class="tvig-ico" onclick="ConfigUsersApp.duplicateProfile('${this.selectedProfile}')" title="Duplicar perfil (copiar permissões)">
            <i data-lucide="copy" style="width:15px;height:15px;"></i>
         </button>
         <button type="button" class="tvig-ico" onclick="ConfigUsersApp.editProfile('${this.selectedProfile}')" style="${adminHidden}" title="Editar nome">
            <i data-lucide="pencil" style="width:15px;height:15px;"></i>
         </button>
         <button type="button" class="tvig-ico is-danger" onclick="ConfigUsersApp.deleteProfile('${this.selectedProfile}')" style="${adminHidden}" title="Excluir perfil">
            <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
         </button>
      </div>
    `;

    const profileOptions = `
      <select onchange="ConfigUsersApp.selectProfile(this.value)" style="padding: 8px 36px 8px 16px; border: 1px solid #e8eaed; border-radius: 8px; font-weight: 600; color: #202124; background: #fff url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' fill=\\'none\\' stroke=\\'%235f6368\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><polyline points=\\'6 9 12 15 18 9\\'/></svg>') no-repeat right 12px center; appearance: none; font-size: 0.95rem; cursor: pointer; width: 350px; flex-shrink: 0;">
         ${optionsHtml}
      </select>
      ${actionBtns}
    `;

    // Load saved permissions for selected profile
    let savedPerms = this.getProfilePermsObject(this.selectedProfile);
    this.hydrateSubmoduleFlags(savedPerms);
    
    const isAdmin = this.selectedProfile === 'admin';

    // Admin always has all permissions forced
    if (isAdmin) {
      this.modules.forEach(m => {
         savedPerms[m.key] = true;
         m.submodules.forEach(sub => {
            savedPerms[sub.key] = true;
            sub.actions.forEach(act => {
               const f = this.permFlags(sub, act);
               savedPerms[f.acessar] = true;
               savedPerms[f.visualizar] = true;
               savedPerms[f.editar] = true;
            });
         });
      });
    }

    const modulesHtml = this.view !== "perfis" ? "" : this.modules.map(mod => {
      const isModChecked = savedPerms[mod.key] ? 'checked' : '';
      const modDisabledAttr = isAdmin ? 'disabled' : '';
      const direct = !!mod.direct || !(mod.submodules || []).length;

      if (direct) {
        return `
        <div style="background: #fff; border: 1px solid #e8eaed; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
           <div style="padding: 18px 24px; font-size: 1.1rem; color: #202124; display: flex; align-items: center; gap: 10px; font-weight: 600; background: #f8f9fa;">
             <input type="checkbox" class="profile-perm-checkbox" data-level="module" data-key="${mod.key}" ${isModChecked} ${modDisabledAttr} style="width: 18px; height: 18px; accent-color: #105436;">
             <i data-lucide="${mod.icon || 'folder'}" style="width: 20px; color: #105436;"></i>
             <label style="margin: 0;">Módulo ${mod.name}</label>
           </div>
        </div>`;
      }

      const submodulesHtml = mod.submodules.map(sub => {
         const isSubChecked = savedPerms[sub.key] ? 'checked' : '';
         
         // Se não for admin e o pai não tiver marcado, desabilita visualmente e bloqueia
         const subIsBlockedByParent = !isAdmin && !savedPerms[mod.key];
         const subDisabledAttr = (isAdmin || subIsBlockedByParent) ? 'disabled' : '';
         const subOpacity = subIsBlockedByParent ? '0.5' : '1';

         const actionsHtml = (() => {
            const regular = [];
            const regras = [];
            sub.actions.forEach(act => {
              const f = this.permFlags(sub, act);
              const permKeyAcc = f.acessar;
              const permKeyVis = f.visualizar;
              const permKeyEdi = f.editar;
              const unionCfg = act.id === "configuracoes" && typeof window.configuracoesPermChecked === "function";
              const chkAcc = (unionCfg ? window.configuracoesPermChecked(savedPerms, "acessar") : savedPerms[permKeyAcc]) ? "checked" : "";
              const chkVis = (unionCfg ? window.configuracoesPermChecked(savedPerms, "visualizar") : savedPerms[permKeyVis]) ? "checked" : "";
              const chkEdi = (unionCfg ? window.configuracoesPermChecked(savedPerms, "editar") : savedPerms[permKeyEdi]) ? "checked" : "";
              const actIsBlockedByParent = !isAdmin && (!savedPerms[mod.key] || !savedPerms[sub.key]);
              const actDisabledAttr = (isAdmin || actIsBlockedByParent) ? 'disabled' : '';
              const actOpacity = actIsBlockedByParent ? '0.5' : '1';
              const tile = `
               <div style="background: #f8f9fa; border: 1px solid #e8eaed; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 280px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); opacity: ${actOpacity};">
                  <div style="font-weight: 600; color: #202124; margin-bottom: 10px; font-size: 0.9rem; border-bottom: 1px solid #e8eaed; padding-bottom: 6px;">${act.label}</div>
                  <div style="display: flex; gap: 12px; font-size: 0.8rem;">
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyAcc}" ${chkAcc} ${actDisabledAttr} style="accent-color: #105436;"> Acessar
                     </label>
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyVis}" ${chkVis} ${actDisabledAttr} style="accent-color: #105436;"> Visualizar
                     </label>
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyEdi}" ${chkEdi} ${actDisabledAttr} style="accent-color: #105436;"> Editar
                     </label>
                  </div>
               </div>`;
              if (act.id === "configuracoes") regras.push(tile);
              else regular.push(tile);
            });
            const regrasBlock = regras.length ? `
              <div style="flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: 16px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                <div style="flex: 1 1 100%; font-size: 0.75rem; font-weight: 700; color: #105436; letter-spacing: 0.04em; text-transform: uppercase;">Configurações</div>
                ${regras.join("")}
              </div>` : "";
            return regular.join("") + regrasBlock;
         })();

         return `
            <details style="margin-bottom: 12px; border: 1px solid #e8eaed; border-radius: 8px; background: #fff; overflow: hidden;">
               <summary style="padding: 14px 16px; font-weight: 700; color: #105436; font-size: 0.95rem; cursor: pointer; user-select: none; background: #fdfdfd; display: flex; align-items: center; border-left: 3px solid #105436; outline: none;">
                  <span style="flex: 1; display: flex; align-items: center; gap: 10px;">
                     <input type="checkbox" class="profile-perm-checkbox action-container" data-level="submodule" data-parent-mod="${mod.key}" data-key="${sub.key}" ${isSubChecked} ${subDisabledAttr} style="width: 16px; height: 16px; accent-color: #105436;" onclick="event.stopPropagation(); ConfigUsersApp.toggleChildren(this);">
                     <label style="cursor: ${subDisabledAttr ? 'not-allowed' : 'pointer'}; margin: 0; opacity: ${subOpacity};" onclick="event.preventDefault();">${sub.name}</label>
                  </span>
                  <i data-lucide="chevron-down" style="width: 18px; color: #80868b; transition: transform 0.2s;" class="details-chevron"></i>
               </summary>
               <div style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; background: #fff; border-top: 1px dashed #e8eaed;">
                  ${actionsHtml}
               </div>
            </details>
         `;
      }).join('');

      return `
        <details style="background: #fff; border: 1px solid #e8eaed; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
           <summary style="padding: 18px 24px; font-size: 1.1rem; color: #202124; display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; font-weight: 600; background: #f8f9fa; outline: none;">
             <span style="display: flex; align-items: center; gap: 10px; flex: 1;">
               <input type="checkbox" class="profile-perm-checkbox" data-level="module" data-key="${mod.key}" ${isModChecked} ${modDisabledAttr} style="width: 18px; height: 18px; accent-color: #105436;" onclick="event.stopPropagation(); ConfigUsersApp.toggleChildren(this);">
               <i data-lucide="${mod.icon || 'folder'}" style="width: 20px; color: #105436;"></i>
               <label style="margin: 0; cursor: pointer;" onclick="event.preventDefault();">Módulo ${mod.name}</label>
             </span>
             <i data-lucide="chevron-down" style="width: 20px; color: #80868b; transition: transform 0.2s;" class="details-chevron"></i>
           </summary>
           <div style="padding: 20px 24px; background: #fdfdfd;">
             ${submodulesHtml}
           </div>
        </details>
      `;
    }).join('');

    root.innerHTML = `
      <style>
        .ml-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; vertical-align: middle; }
        .ml-switch input { opacity: 0; width: 0; height: 0; }
        .ml-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #94a3b8; transition: .25s; border-radius: 24px; }
        .ml-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; transition: .25s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
        .ml-switch input:checked + .ml-slider { background: #105436; }
        .ml-switch input:checked + .ml-slider:before { transform: translateX(20px); }
        .cfg-page { padding: 4px 2px 12px; }
        .cfg-head { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 12px; }
        .cfg-head .ml-tabs { flex: 1; min-width: 0; }
        .cfg-head .btn { flex-shrink: 0; height: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0 16px; border-radius: 6px; margin-bottom: 4px; font-weight: 700; background: #105436; border-color: #105436; }
        .cfg-head .btn svg { width: 16px; height: 16px; }
        .cfg-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
        .cfg-filters { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .cfg-filters > div { flex: 1 1 180px; min-width: 160px; }
        .cfg-filters > .cfg-f-nome, .cfg-filters > .cfg-f-email { flex: 1.4 1 240px; }
        .cfg-filters .form-control { height: 36px; border: 1px solid #334155; border-radius: 6px; background: #fff; color: #0f172a; padding: 0 10px; width: 100%; box-sizing: border-box; font-size: 0.85rem; font-weight: 600; }
        .cfg-filters .form-control:focus { outline: none; border-color: #105436; box-shadow: 0 0 0 2px rgba(16, 84, 54, 0.15); }
        .cfg-filters > .cfg-count { flex: 0 0 auto; min-width: 0; height: 36px; display: flex; align-items: center; padding: 0 12px; border-radius: 6px; background: #e7f6ee; color: #105436; font-weight: 800; font-size: 0.82rem; white-space: nowrap; }
        .cfg-table-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: auto; }
        .cfg-table { width: 100%; border-collapse: collapse; text-align: left; background: #fff; font-size: 0.82rem; }
        .cfg-table th { padding: 8px 10px; color: #fff; background: #1b8253; font-weight: 700; font-size: 0.78rem; }
        .cfg-table td { padding: 8px 10px; border-bottom: 1px solid #e8eee9; color: #1c2e24; }
        .cfg-table tbody tr:nth-child(even) { background: #f7faf8; }
        .cfg-scroll { overflow: auto; max-height: calc(100vh - 230px); border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
        .cfg-utable { width: 100%; min-width: 1040px; table-layout: fixed; border-collapse: collapse; text-align: left; font-size: 0.8rem; }
        .cfg-utable col.c-nome { width: 22%; }
        .cfg-utable col.c-email { width: 22%; }
        .cfg-utable col.c-sienge { width: 13%; }
        .cfg-utable col.c-cel { width: 130px; }
        .cfg-utable col.c-perfil { width: 18%; }
        .cfg-utable col.c-st { width: 110px; }
        .cfg-utable col.c-acao { width: 64px; }
        .cfg-utable thead th { position: sticky; top: 0; z-index: 2; background: #1b8253; color: #fff; padding: 8px 10px; font-weight: 700; font-size: 0.78rem; }
        .cfg-utable td { padding: 6px 10px; border-bottom: 1px solid #e8eee9; color: #1c2e24; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cfg-utable tbody tr:nth-child(even) { background: #f7faf8; }
        .cfg-utable tbody tr:hover { background: #e7f6ee; }
        .cfg-utable .is-center { text-align: center; }
        .cfg-utable .is-right { text-align: right; }
        .cfg-utable td.cfg-nome, .cfg-utable td.cfg-perfil { white-space: normal; }
        .cfg-utable td.cfg-nome strong { color: #0f172a; }
        .cfg-utable td.cfg-nome > div { font-size: 0.72rem !important; margin-top: 2px !important; }
        .cfg-utable td.cfg-email { color: #475569; }
        .cfg-utable td.cfg-perfil strong { font-size: 0.76rem; }
        .cfg-utable td.cfg-perfil small { display: block; font-size: 0.68rem; color: #64748b; text-transform: uppercase; margin-top: 2px; }
        .cfg-utable .cfg-st { display: inline-flex; align-items: center; gap: 6px; }
        .cfg-utable .cfg-pend { background: #fef7e0; color: #b45309; padding: 2px 8px; border-radius: 999px; font-size: 0.66rem; font-weight: 700; }
        .cfg-utable td.cfg-acoes { overflow: visible; }
        .cfg-prof-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
        .cfg-prof-bar select { height: 40px; min-width: 280px; border: 1px solid #475569; border-radius: 8px; padding: 0 12px; font-weight: 700; color: #0f172a; background: #fff; }
      </style>
      <div class="cfg-page">
        <div class="cfg-head">
          <div class="ml-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${this.view === "usuarios"}" class="ml-tab ${this.view === "usuarios" ? "is-active" : ""}" onclick="ConfigUsersApp.setView('usuarios')"><i data-lucide="users"></i> Usuários</button>
            <button type="button" role="tab" aria-selected="${this.view === "perfis"}" class="ml-tab ${this.view === "perfis" ? "is-active" : ""}" onclick="ConfigUsersApp.setView('perfis')"><i data-lucide="shield"></i> Perfis</button>
            <button type="button" role="tab" aria-selected="${this.view === "modulos"}" class="ml-tab ${this.view === "modulos" ? "is-active" : ""}" onclick="ConfigUsersApp.setView('modulos')"><i data-lucide="layout-grid"></i> Módulos</button>
          </div>
          ${this.view === "usuarios" ? `
          <button type="button" class="btn btn-primary" onclick="ConfigUsersApp.openUserModal()">
            <i data-lucide="user-plus"></i> Convidar Usuário
          </button>` : this.view === "perfis" ? `
          <button type="button" class="btn btn-primary" onclick="ConfigUsersApp.savePermissions()">
            <i data-lucide="save"></i> Salvar Permissões
          </button>` : ""}
        </div>

        ${this.view === "modulos" ? this.modulosPanelHtml() : this.view === "usuarios" ? `
        <div>
          <div class="cfg-filters">
            <div class="cfg-f-nome">
              <label for="cfg-user-nome" class="ml-emp-filter-label">Nome</label>
              <input id="cfg-user-nome" class="form-control" type="search" placeholder="Nome do usuário" value="${this.esc(filters.nome)}" oninput="ConfigUsersApp.onUserFilter('nome', this.value)">
            </div>
            <div>
              <label for="cfg-user-perfil" class="ml-emp-filter-label">Perfil</label>
              <select id="cfg-user-perfil" class="form-control" onchange="ConfigUsersApp.onUserFilter('perfil', this.value)">
                <option value="">Todos</option>
                ${profileChoices.map((name) => `<option value="${this.esc(name)}" ${filters.perfil === name ? "selected" : ""}>${this.esc(name)}</option>`).join("")}
              </select>
            </div>
            <div class="cfg-f-email">
              <label for="cfg-user-email" class="ml-emp-filter-label">E-mail</label>
              <input id="cfg-user-email" class="form-control" type="search" placeholder="E-mail" value="${this.esc(filters.email)}" oninput="ConfigUsersApp.onUserFilter('email', this.value)">
            </div>
            <div>
              <label for="cfg-user-status" class="ml-emp-filter-label">Situação</label>
              <select id="cfg-user-status" class="form-control" onchange="ConfigUsersApp.onUserFilter('status', this.value)">
                <option value="todos" ${filters.status === "todos" ? "selected" : ""}>Todos</option>
                <option value="ativos" ${filters.status === "ativos" ? "selected" : ""}>Somente ativos</option>
                <option value="inativos" ${filters.status === "inativos" ? "selected" : ""}>Desativados</option>
              </select>
            </div>
            <div class="cfg-count">${shownUsers.length} usuário(s)</div>
          </div>
          <div class="cfg-scroll">
          <table class="cfg-utable">
            <colgroup>
              <col class="c-nome"><col class="c-email"><col class="c-sienge"><col class="c-cel">
              <col class="c-perfil"><col class="c-st"><col class="c-acao">
            </colgroup>
            <thead>
              <tr>
                <th>Nome completo</th>
                <th>E-mail</th>
                <th>Usuário Sienge</th>
                <th>Celular</th>
                <th>Perfil de acesso</th>
                <th class="is-center">Status</th>
                <th class="is-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${trs}
            </tbody>
          </table>
          </div>
        </div>
        ` : `
        <div class="cfg-panel">
        <div class="cfg-prof-bar">
           <div style="display: flex; gap: 10px; align-items: center; flex: 1;">
              ${profileOptions}
           </div>
           <button onclick="ConfigUsersApp.addProfile()" style="padding: 8px 16px; border: 1px solid #105436; background: #fff; color: #105436; font-weight: 800; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; flex-shrink: 0;"><i data-lucide="plus" style="width: 16px; margin-right: 6px;"></i> Novo Perfil</button>
        </div>

        <div id="permissions-container">
           ${modulesHtml}
        </div>
        </div>
        `}

      </div>
    `;

    lucide.createIcons();
  },

  selectProfile(profileId) {
    this.selectedProfile = profileId;
    try { localStorage.setItem("crm_selected_profile", profileId); } catch (e) {}
    this.render();
  },

  toggleChildren(checkbox) {
    const level = checkbox.getAttribute('data-level');
    const key = checkbox.getAttribute('data-key');
    const isChecked = checkbox.checked;

    // Se salvarmos no localStorage na hora da tela piscar, podemos ter problemas,
    // então a função Save fará a varredura das caixas marcadas e também
    // checaremos visualmente pra não ter que recarregar a tela (this.render).
    
    // Salvar as flags no localStorage ANTES do render pra que a tela volte já com a nova lógica desabilitada
    const checkboxes = document.querySelectorAll('.profile-perm-checkbox');
    const perms = {};
    checkboxes.forEach(cb => {
       perms[cb.getAttribute('data-key')] = cb.checked;
    });

    if (level === 'module') {
       // Se desligou o módulo, desliga todos os submódulos e actions daquele módulo
       // e força a atualização no objeto
       this.modules.find(m => m.key === key).submodules.forEach(sub => {
          perms[sub.key] = isChecked;
          sub.actions.forEach(act => {
             const f = this.permFlags(sub, act);
             perms[f.acessar] = isChecked;
             perms[f.visualizar] = isChecked;
             perms[f.editar] = isChecked;
          });
       });
    } else if (level === 'submodule') {
       const parentModKey = checkbox.getAttribute('data-parent-mod');
       if (isChecked) {
          perms[parentModKey] = true;
          this.modules.forEach(m => {
             m.submodules.forEach(s => {
                if (s.key !== key) return;
                s.actions.forEach(act => {
                  const f = this.permFlags(s, act);
                  perms[f.acessar] = true;
                  perms[f.visualizar] = true;
                  perms[f.editar] = true;
                });
             });
          });
       } else {
          // Se desligou o submódulo, desliga todas as actions dele
          const subKey = key;
          this.modules.forEach(m => {
             m.submodules.forEach(s => {
                if(s.key === subKey) {
                   s.actions.forEach(act => {
                     const f = this.permFlags(s, act);
                     perms[f.acessar] = false;
                     perms[f.visualizar] = false;
                     perms[f.editar] = false;
                   });
                }
             })
          });
       }
    } else if (level === 'action') {
       // Se ligou uma action, liga o submodulo pai, que por sua vez liga o modulo
       if (isChecked) {
          const parentSubKey = checkbox.getAttribute('data-parent-sub');
          perms[parentSubKey] = true;
          // achar qual module ele pertence pra ligar
          this.modules.forEach(m => {
             if (m.submodules.find(s => s.key === parentSubKey)) {
                perms[m.key] = true;
             }
          });
       }
    }

    window.syncConfiguracoesPermAliases(perms);
    
    const isAdmin = this.selectedProfile === 'admin';
    if (isAdmin) return; // Se for admin, ignora a lógica de cascata no click pois já é bloqueado
    
    // Atualização visual das checkboxes e labels via DOM para evitar re-render da tela (que fecharia as sanfonas)
    checkboxes.forEach(cb => {
       const lvl = cb.getAttribute('data-level');
       const cbKey = cb.getAttribute('data-key');
       
       // Sincronizar o checked property
       cb.checked = !!perms[cbKey];
       
       if (lvl === 'submodule') {
          const pMod = cb.getAttribute('data-parent-mod');
          const disabled = !perms[pMod];
          cb.disabled = disabled;
          
          // O label está logo ao lado do checkbox
          const label = cb.nextElementSibling;
          if (label && label.tagName === 'LABEL') {
             label.style.cursor = disabled ? 'not-allowed' : 'pointer';
             label.style.opacity = disabled ? '0.5' : '1';
          }
       } else if (lvl === 'action') {
          const pSub = cb.getAttribute('data-parent-sub');
          
          // Precisamos achar qual o módulo pai do submódulo pra saber se desabilita
          const subCb = document.querySelector(`.profile-perm-checkbox[data-level="submodule"][data-key="${pSub}"]`);
          const pMod = subCb ? subCb.getAttribute('data-parent-mod') : null;
          
          const disabled = !perms[pMod] || !perms[pSub];
          cb.disabled = disabled;
          
          const label = cb.closest('label');
          if (label) {
             label.style.cursor = disabled ? 'not-allowed' : 'pointer';
          }
          
          const container = cb.closest('div[style*="background: #f8f9fa"]');
          if (container) {
             container.style.opacity = disabled ? '0.5' : '1';
          }
       }
    });
  },

  async savePermissions() {
    const checkboxes = document.querySelectorAll('.profile-perm-checkbox');
    if (!checkboxes.length) {
      alert("A tela de permissões não carregou. Nenhum acesso foi alterado.");
      return;
    }
    let totalEdit = 0;
    let checkedEdit = 0;
    const incoming = {};
    checkboxes.forEach(cb => {
       const key = cb.getAttribute('data-key');
       if (!key) return;
       if (key.endsWith('_editar')) {
          totalEdit++;
          if (cb.checked) checkedEdit++;
       }
       incoming[key] = cb.checked;
    });
    window.syncConfiguracoesPermAliases(incoming);

    const existing = this.getProfilePermsObject(this.selectedProfile) || {};
    const incomingHas = typeof window.crmPermsHasAnyTrue === "function"
      ? window.crmPermsHasAnyTrue(incoming)
      : Object.keys(incoming).some((k) => incoming[k] === true);
    const existingHas = typeof window.crmPermsHasAnyTrue === "function"
      ? window.crmPermsHasAnyTrue(existing)
      : Object.keys(existing).some((k) => existing[k] === true);
    if (!incomingHas && existingHas) {
      alert("As marcações da tela vieram vazias, então as permissões já salvas deste perfil foram mantidas. Abra o perfil de novo, marque os módulos e clique em Salvar Permissões.");
      return;
    }
    if (this.selectedProfile !== "admin" && totalEdit > 0 && checkedEdit === totalEdit) {
      alert("Acesso Negado: Não é permitido criar um perfil com permissão de edição em todas as funcionalidades. Perfil com edição irrestrita é um privilégio exclusivo do Administrador.");
      return;
    }
    const removed = Object.keys(incoming).filter((k) => existing[k] === true && incoming[k] !== true);
    if (removed.length) {
      const msg = "Você está tirando " + removed.length + " acesso(s) deste perfil. Permissão não é apagada sozinha. Confirma a retirada?";
      const ok = typeof window.mouraConfirm === "function"
        ? await window.mouraConfirm(msg)
        : confirm(msg);
      if (!ok) return;
    }
    const perms = Object.assign({}, existing, incoming, { _savedAt: Date.now() });
    delete perms.__mirror_of__;
    if (perms.mod_rel !== true) {
      Object.keys(perms).forEach((k) => {
        if (k === "mod_rel" || k.indexOf("sub_rel_") === 0) perms[k] = false;
      });
    }
    if (removed.length) perms._shrinkConfirmedAt = Date.now();
    else if (!existing._shrinkConfirmedAt) delete perms._shrinkConfirmedAt;

    if (!this.writePermissionPayload(this.selectedProfile, perms)) {
       alert("Armazenamento local cheio: não foi possível salvar as permissões deste perfil. Libere espaço no navegador e tente de novo.");
       return;
    }
    if (typeof window.persistCrmProfilePermsNow === "function") {
      try {
        const savedRaw = await window.persistCrmProfilePermsNow(this.selectedProfile, perms);
        const savedObj = window.parseCrmPermsPayload ? window.parseCrmPermsPayload(savedRaw) : null;
        const profile = (this.profiles || []).find((p) => String(p.id) === String(this.selectedProfile));
        if (profile && savedObj) profile.perms = savedObj;
        const shown = window.crmPermsTrueCount ? window.crmPermsTrueCount(incoming) : 0;
        const kept = window.crmPermsTrueCount ? window.crmPermsTrueCount(savedObj) : shown;
        if (kept > shown) {
          alert("Os acessos que já estavam na nuvem foram mantidos. A tela tinha menos marcações e nada disso foi apagado.");
        }
      } catch (e) {
        alert("As permissões ficaram neste navegador, mas não chegaram para os outros usuários. Abra de novo e clique em Salvar Permissões.\n\n" + (e && e.message ? e.message : e));
        return;
      }
    }
    this.syncPermsToCloud();
    try {
      if (typeof window.applyPermissions === "function" && window.AppState && AppState.currentUser) {
        window.applyPermissions(AppState.currentUser.profile_name);
      }
    } catch (e) {}
    
    // Animação de sucesso no botão e sincronização com o Firebase
    const btn = document.querySelector('button[onclick="ConfigUsersApp.savePermissions()"]');
    if (btn) {
       const originalText = btn.innerHTML;
       btn.innerHTML = '<i data-lucide="upload-cloud" style="width: 18px; margin-right: 6px;"></i> Sincronizando...';
       if (window.lucide) lucide.createIcons();
       
       // Faz o upload de todas as permissões locais para o Firebase
       if (window.forceUploadLocalConfig) {
          window.forceUploadLocalConfig().then(() => {
             btn.innerHTML = '<i data-lucide="check" style="width: 18px; margin-right: 6px;"></i> Salvo e Sincronizado';
             if (window.lucide) lucide.createIcons();
             setTimeout(() => {
                btn.innerHTML = originalText;
                if (window.lucide) lucide.createIcons();
             }, 3000);
          }).catch(e => {
             btn.innerHTML = '<i data-lucide="alert-circle" style="width: 18px; margin-right: 6px;"></i> Erro na Nuvem';
             console.error(e);
             if (window.lucide) lucide.createIcons();
             setTimeout(() => {
                btn.innerHTML = originalText;
                if (window.lucide) lucide.createIcons();
             }, 3000);
          });
       } else {
           btn.innerHTML = '<i data-lucide="check" style="width: 18px; margin-right: 6px;"></i> Salvo com Sucesso';
           if (window.lucide) lucide.createIcons();
           setTimeout(() => {
              btn.innerHTML = originalText;
              if (window.lucide) lucide.createIcons();
           }, 2000);
       }
    }
  }
};

// Interceptar também o tab config-users
document.addEventListener('DOMContentLoaded', () => {
  if (window.switchTab) {
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId, tabName) {
      originalSwitchTab(tabId, tabName);
      if (tabId === 'config-users') {
        ConfigUsersApp.loadUsers();
      }
    };
  } else {
    // Caso a função ainda não exista, criar um hook ou esperar
    setTimeout(() => {
      if (window.switchTab) {
        const originalSwitchTab = window.switchTab;
        window.switchTab = function(tabId, tabName) {
          originalSwitchTab(tabId, tabName);
          if (tabId === 'config-users') {
            ConfigUsersApp.loadUsers();
          }
        };
      }
    }, 1000);
  }

  // Estilo global para animação das sanfonas (details chevron)
  const style = document.createElement('style');
  style.innerHTML = `
    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    details[open] > summary .details-chevron { transform: rotate(180deg); }
  `;
  document.head.appendChild(style);
});
