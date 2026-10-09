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

/** Perfis/usuários que só enxergam clientes da própria carteira atribuída. */
window.userSeesOnlyAssignedClients = function(user) {
  const u = user || (typeof AppState !== "undefined" && AppState.currentUser) || (window.AppState && window.AppState.currentUser) || null;
  if (!u) return false;
  if (window.isOperadorCobrancaTerceirizadoProfile(u.profile_name)) return true;
  return window.isOperadorCobrancaProfile(u.profile_name) && String(u.operator_type || "") === "externo";
};

window.clientAssignedToCurrentUser = function(clientOrOp) {
  const assigned = typeof clientOrOp === "string"
    ? clientOrOp
    : (clientOrOp && (clientOrOp.assignedOperator || clientOrOp.operator)) || "";
  const u = (typeof AppState !== "undefined" && AppState.currentUser) || (window.AppState && window.AppState.currentUser) || null;
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
  return mine.some(function(c) { return window.clientAssignedToCurrentUser(c); });
};

window.filterCustomersToAssignedPortfolio = function(customers) {
  if (!window.userSeesOnlyAssignedClients() || !Array.isArray(customers)) return customers || [];
  const allowed = new Set();
  (window.rawClientList || []).forEach(function(c) {
    if (window.clientAssignedToCurrentUser(c)) allowed.add(String(c.customerId));
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
    if (savedPerms.sub_eng_geral_caucao_acessar == null && (
      savedPerms.mod_eng || savedPerms.sub_eng_geral || savedPerms.sub_eng_geral_engenharia_acessar
    )) {
      savedPerms.sub_eng_geral_caucao_acessar = true;
      savedPerms.sub_eng_geral_caucao_visualizar = true;
      savedPerms.sub_eng_geral_caucao_editar = !!savedPerms.sub_eng_geral_engenharia_editar;
    }
    if (savedPerms.sub_eng_geral_config_acessar == null && (
      savedPerms.mod_eng || savedPerms.sub_eng_geral || savedPerms.sub_eng_geral_engenharia_acessar
    )) {
      savedPerms.sub_eng_geral_config_acessar = true;
      savedPerms.sub_eng_geral_config_visualizar = true;
      savedPerms.sub_eng_geral_config_editar = true;
    }
    ["acessar", "visualizar", "editar"].forEach((flag) => {
      const oldKey = "sub_rel_geral_relacionamento_" + flag;
      const newKey = "sub_rel_geral_buscar_cliente_" + flag;
      if (savedPerms[newKey] == null && savedPerms[oldKey] === true) savedPerms[newKey] = true;
    });
    if (savedPerms.sub_fiscal_geral_fiscal_acessar && savedPerms.sub_fiscal_geral_csll_acessar == null) {
      savedPerms.sub_fiscal_geral_csll_acessar = true;
      savedPerms.sub_fiscal_geral_csll_visualizar = !!savedPerms.sub_fiscal_geral_fiscal_visualizar;
      savedPerms.sub_fiscal_geral_csll_editar = !!savedPerms.sub_fiscal_geral_fiscal_editar;
    }
    if (!savedPerms.mod_gerencial && (
      savedPerms.mod_participacoes
      || savedPerms.mod_societario
      || savedPerms.sub_part_geral
      || savedPerms.sub_soc_geral
      || savedPerms.sub_part_geral_participacoes_acessar
      || savedPerms.sub_soc_geral_estrutura_societaria_acessar
    )) {
      savedPerms.mod_gerencial = true;
    }
    if (savedPerms.sub_com_geral_tabelas_vigentes_acessar == null && (
      savedPerms.mod_comercial
      || savedPerms.sub_com_geral_dashboard_acessar
      || savedPerms.sub_com_geral_estoque_acessar
      || savedPerms.sub_com_geral_condicoes_pagamento_acessar
    )) {
      savedPerms.sub_com_geral_tabelas_vigentes_acessar = true;
      savedPerms.sub_com_geral_tabelas_vigentes_visualizar = true;
      savedPerms.sub_com_geral_tabelas_vigentes_editar = !!(
        savedPerms.sub_com_geral_condicoes_pagamento_editar
        || savedPerms.sub_com_geral_dashboard_editar
        || savedPerms.sub_com_geral_estoque_editar
      );
    }
    if (savedPerms.sub_compras_geral_previsoes_acessar == null && (
      savedPerms.mod_compras
      || savedPerms.sub_compras_geral_compras_acessar
    )) {
      savedPerms.sub_compras_geral_previsoes_acessar = true;
      savedPerms.sub_compras_geral_previsoes_visualizar = true;
      savedPerms.sub_compras_geral_previsoes_editar = !!savedPerms.sub_compras_geral_compras_editar;
    }
    if (savedPerms.sub_compras_geral_dashboard_acessar == null && (
      savedPerms.mod_compras
      || savedPerms.sub_compras_geral_compras_acessar
      || savedPerms.sub_compras_geral_previsoes_acessar
    )) {
      savedPerms.sub_compras_geral_dashboard_acessar = true;
      savedPerms.sub_compras_geral_dashboard_visualizar = true;
      savedPerms.sub_compras_geral_dashboard_editar = !!(
        savedPerms.sub_compras_geral_compras_editar
        || savedPerms.sub_compras_geral_previsoes_editar
      );
    }
    if (savedPerms.sub_compras_geral_controle_financeiro_acessar == null && (
      savedPerms.mod_compras
      || savedPerms.sub_compras_geral_compras_acessar
      || savedPerms.sub_compras_geral_previsoes_acessar
      || savedPerms.sub_compras_geral_dashboard_acessar
    )) {
      savedPerms.sub_compras_geral_controle_financeiro_acessar = true;
      savedPerms.sub_compras_geral_controle_financeiro_visualizar = true;
      savedPerms.sub_compras_geral_controle_financeiro_editar = !!(
        savedPerms.sub_compras_geral_compras_editar
        || savedPerms.sub_compras_geral_previsoes_editar
      );
    }
    if (savedPerms.sub_fin_cp_rydoo_acessar == null && (
      savedPerms.sub_fin_cp === true
      || savedPerms.sub_fin_cp_assistente_cp_acessar
      || savedPerms.sub_fin_cp_prestacao_contas_acessar
      || savedPerms.sub_fin_cp_parametrizacao_parceiro_acessar
    )) {
      savedPerms.sub_fin_cp_rydoo_acessar = true;
      savedPerms.sub_fin_cp_rydoo_visualizar = true;
      savedPerms.sub_fin_cp_rydoo_editar = !!(
        savedPerms.sub_fin_cp_assistente_cp_editar
        || savedPerms.sub_fin_cp_prestacao_contas_editar
      );
    }
    if (savedPerms.sub_fin_cr_recebimentos_webro_acessar == null && (
      savedPerms.sub_fin_cr === true
      || savedPerms.sub_fin_cr_fila_cobranca_acessar
      || savedPerms.sub_fin_cr_fila_cobranca_visualizar
      || savedPerms.sub_fin_cr_fila_cobranca_editar
    )) {
      savedPerms.sub_fin_cr_recebimentos_webro_acessar = true;
      savedPerms.sub_fin_cr_recebimentos_webro_visualizar = true;
      savedPerms.sub_fin_cr_recebimentos_webro_editar = !!(
        savedPerms.sub_fin_cr_fila_cobranca_editar || savedPerms.sub_fin_cr === true
      );
    }
    if (savedPerms.sub_fin_cr_dashboard_acessar == null && (
      savedPerms.sub_fin_cr_fila_cobranca_acessar
      || savedPerms.sub_fin_cr_fila_cobranca_visualizar
      || savedPerms.sub_fin_cr_fila_cobranca_editar
    )) {
      savedPerms.sub_fin_cr_dashboard_acessar = !!savedPerms.sub_fin_cr_fila_cobranca_acessar;
      savedPerms.sub_fin_cr_dashboard_visualizar = !!savedPerms.sub_fin_cr_fila_cobranca_visualizar;
      savedPerms.sub_fin_cr_dashboard_editar = !!savedPerms.sub_fin_cr_fila_cobranca_editar;
    }
    if (savedPerms.sub_seg_geral_consumo_api_acessar == null && (
      savedPerms.sub_seg_geral_auditoria_acessar
      || savedPerms.sub_seg_geral_auditoria_visualizar
      || savedPerms.sub_seg_geral_auditoria_editar
    )) {
      savedPerms.sub_seg_geral_consumo_api_acessar = !!savedPerms.sub_seg_geral_auditoria_acessar;
      savedPerms.sub_seg_geral_consumo_api_visualizar = !!savedPerms.sub_seg_geral_auditoria_visualizar;
      savedPerms.sub_seg_geral_consumo_api_editar = !!savedPerms.sub_seg_geral_auditoria_editar;
    }
    if (savedPerms.sub_com_geral_controle_comissao_acessar == null && (
      savedPerms.mod_comercial
      || savedPerms.sub_com_geral_dashboard_acessar
      || savedPerms.sub_com_geral_tabelas_vigentes_acessar
    )) {
      savedPerms.sub_com_geral_controle_comissao_acessar = true;
      savedPerms.sub_com_geral_controle_comissao_visualizar = true;
      savedPerms.sub_com_geral_controle_comissao_editar = !!(
        savedPerms.sub_com_geral_tabelas_vigentes_editar
        || savedPerms.sub_com_geral_dashboard_editar
      );
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
    (this.users || []).forEach((u) => {
      if (!u) return;
      const n = Number(u.id);
      if (!Number.isFinite(n)) {
        max += 1;
        u.id = max;
        changed = true;
      }
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
            { id: "configuracoes", label: "Configurações" }
          ]
        },
        {
          name: "Contas a Pagar", key: "sub_fin_cp",
          actions: [
            { id: "assistente_cp", label: "Assistente de Contas a Pagar" },
            { id: "prestacao_contas", label: "Prestação de Contas" },
            { id: "parametrizacao_parceiro", label: "Parametrização de Parceiro" },
            { id: "rydoo", label: "Rydoo", permBase: "sub_fin_cp_rydoo" }
          ]
        },
        {
          name: "Caixa e Banco", key: "sub_fin_cb",
          actions: [
            { id: "caixa_banco", label: "Movimentações" },
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
      name: "Fiscal / Contábil", icon: "calculator", key: "mod_fiscal",
      submodules: [
        { name: "PIS/COFINS", key: "sub_fiscal_pis", actions: [{ id: "fiscal", label: "PIS/COFINS", permBase: "sub_fiscal_geral_fiscal" }] },
        { name: "CSLL/IRPJ", key: "sub_fiscal_csll", actions: [{ id: "csll", label: "CSLL/IRPJ", permBase: "sub_fiscal_geral_csll" }] }
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
        { name: "Eventos", key: "sub_mkt_eventos", actions: [{ id: "eventos", label: "Eventos", permBase: "sub_mkt_geral_eventos" }] }
      ]
    },
    {
      name: "Relacionamento", icon: "users", key: "mod_rel",
      submodules: [
        { name: "Buscar Cliente", key: "sub_rel_busca", actions: [{ id: "buscar_cliente", label: "Buscar Cliente", permBase: "sub_rel_geral_buscar_cliente" }] },
        { name: "Gerar documentos", key: "sub_rel_docs", actions: [
          { id: "autorizacao_escritura", label: "Autorização de escritura", permBase: "sub_rel_docs_autorizacao_escritura" },
          { id: "autorizacao_terceiros", label: "Autorização de terceiros", permBase: "sub_rel_docs_autorizacao_terceiros" },
          { id: "alteracao_vencimento", label: "Alteração de vencimento", permBase: "sub_rel_docs_alteracao_vencimento" },
          { id: "cessao_direitos", label: "Cessão de Direitos", permBase: "sub_rel_docs_cessao_direitos" }
        ] }
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
          { id: "consumo_api", label: "Consumo de API", permBase: "sub_seg_geral_consumo_api" }
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
            { id: "indexadores", label: "Indexadores" }
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
    if (this.normalizeUserIds() && typeof window.persistCrmUsersToFirebase === "function") {
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
    const terc = (this.profiles || []).find(p => window.isOperadorCobrancaTerceirizadoProfile(p && p.name));
    if (!terc) return false;
    const hasTrue = (obj) => (typeof window.crmPermsHasAnyTrue === "function"
      ? window.crmPermsHasAnyTrue(obj)
      : Object.keys(obj || {}).some((k) => obj[k] === true));
    const current = this.getProfilePermsObject(terc.id);
    if (hasTrue(current)) return false;
    const src = this.getProfilePermsObject(this.resolveCobrancaProfileId());
    if (!hasTrue(src)) return false;
    const copy = Object.assign({}, src);
    delete copy.__mirror_of__;
    delete copy._shrinkConfirmedAt;
    const wrote = this.writePermissionPayload(terc.id, copy);
    if (wrote) this.syncPermsToCloud();
    return !!wrote;
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

  openUserModal(userId = null) {
      let user = null;
      if (userId) {
         user = this.users.find(u => String(u.id) === String(userId));
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
          } else {
              allowedCities = [...cities];
          }
          
          const cityItems = allowedCities.map(c => ({ value: c, label: c }));
          const currentlyChecked = Array.from(document.querySelectorAll('input[name="umodal-adv-cities"]:checked')).map(cb => cb.value);
          const newHtml = buildCheckboxList(cityItems, 'cities', currentlyChecked);
          const container = document.getElementById('adv-cities-container');
          if (container) container.innerHTML = newHtml;
      };

      const companyItems = companies.map(c => ({ value: String(c.id), label: `${c.id} - ${c.nome_usual}` }));
      const allCompanyItems = (currentAppState.cachedCompanies || currentAppState.companies || []).map(c => ({ value: String(c.id), label: `${c.id} - ${c.name || c.nome}` }));
      
      const cityItems = cities.map(c => ({ value: c, label: c }));

      const advCompaniesHtml = buildCheckboxList(companyItems, 'umodal-adv-companies', user ? user.adv_companies : [], 'onchange="window.updateAdvogadoCities()"');
      const advCitiesHtml = buildCheckboxList(cityItems, 'umodal-adv-cities', user ? user.adv_cities : []);

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
               <button onclick="ConfigUsersApp.saveUserModal(${user ? JSON.stringify(user.id) : 'null'})" style="padding: 11px 20px; border: none; background: #105436; color: #fff; font-weight: 700; border-radius: 8px; cursor: pointer;" onmouseover="this.style.background='#0c4028'" onmouseout="this.style.background='#105436'">Salvar dados</button>
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

  async toggleUserStatus(userId) {
      const user = this.users.find(u => String(u.id) === String(userId));
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

  async saveUserModal(userId) {
      const name = document.getElementById('umodal-name').value.trim();
      const email = document.getElementById('umodal-email').value.trim();
      const sienge = document.getElementById('umodal-sienge').value.trim();
      const phone = document.getElementById('umodal-phone').value.trim();
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
      if (userId) {
          const user = this.users.find(u => String(u.id) === String(userId));
          if (!user) {
              alert("Não encontrei esse usuário na lista. Atualize a tela e tente de novo.");
              return;
          }
          Object.assign(user, fields);
          if (String(user.status || "").toUpperCase() === "PENDENTE") {
            user.status = "ATIVO";
            user.statusAt = Date.now();
          }
      } else {
          const emailKey = email.toLowerCase();
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

  scopeAccess(perms, isAdmin, scope) {
    const none = { acessar: false, visualizar: false, editar: false };
    if (!scope) return none;
    if (isAdmin) return { acessar: true, visualizar: true, editar: true };
    const modOn = !!(perms && perms[scope.mod.key]);
    if (scope.level === "module") {
      if (!(scope.actions || []).length) {
        return { acessar: modOn, visualizar: modOn, editar: modOn };
      }
      let visualizar = false;
      let editar = false;
      if (modOn) {
        scope.actions.forEach(({ sub, act }) => {
          if (!perms[sub.key]) return;
          const f = this.actionAccess(perms, sub, act);
          if (f.visualizar) visualizar = true;
          if (f.editar) editar = true;
        });
      }
      return { acessar: modOn, visualizar, editar };
    }
    if (scope.level === "sub") {
      const sub = scope.subs[0];
      const subOn = modOn && !!(sub && perms[sub.key]);
      let visualizar = false;
      let editar = false;
      if (subOn) {
        scope.actions.forEach(({ sub: s, act }) => {
          const f = this.actionAccess(perms, s, act);
          if (f.visualizar) visualizar = true;
          if (f.editar) editar = true;
        });
      }
      return { acessar: subOn, visualizar, editar };
    }
    const one = scope.actions[0];
    if (!one || !modOn || !perms[one.sub.key]) return none;
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
        <div class="cfg-filters" style="grid-template-columns: 1fr 1fr 1fr auto;">
          <div>
            <label for="cfg-mod-modulo">Módulo</label>
            <select id="cfg-mod-modulo" class="form-control" onchange="ConfigUsersApp.setModPick('module', this.value)">
              ${opt("", "Selecione", !pick.module)}
              ${(this.modules || []).map((m) => opt(m.key, m.name, pick.module === m.key)).join("")}
            </select>
          </div>
          <div>
            <label for="cfg-mod-sub">Subitem</label>
            <select id="cfg-mod-sub" class="form-control" ${mod ? "" : "disabled"} onchange="ConfigUsersApp.setModPick('sub', this.value)">
              ${opt("", "Todo o módulo", !pick.sub)}
              ${subs.map((s) => opt(s.key, s.name, pick.sub === s.key)).join("")}
            </select>
          </div>
          <div>
            <label for="cfg-mod-item">Item</label>
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
      const statusSwitch = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
             ${isPending ? '<span style="background: #fef7e0; color: #f29900; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 700;">PENDENTE</span>' : ''}
             <label class="ml-switch" title="${isActive ? 'Desativar' : 'Ativar'}">
             <input type="checkbox" ${isActive ? 'checked' : ''} onchange="ConfigUsersApp.toggleUserStatus(${JSON.stringify(u.id)})">
             <span class="ml-slider"></span>
           </label>
           </div>`;

      return `
        <tr style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 16px 15px;">
            <div style="font-weight: 700; color: #202124;">${u.name}</div>
            <div style="font-size: 0.85rem; color: #80868b; margin-top: 4px;">${u.email}</div>
            ${this.deptUserLine(u)}
          </td>
          <td style="padding: 16px 15px; color: #202124; font-size: 0.9rem;">${u.sienge_user || '-'}</td>
          <td style="padding: 16px 15px; color: #202124; font-size: 0.9rem;">${u.phone || '-'}</td>
          <td style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.85rem;">
             ${u.profile_name}
             ${(window.crmOperatorType(u) && window.isOperadorCobrancaProfile(u.profile_name)) ? `<div style="font-size: 0.75rem; color: #80868b; font-weight: 500; margin-top: 4px; text-transform: uppercase;">${window.crmOperatorType(u) === 'interno' ? 'Cobrança Interna' : (window.crmOperatorType(u) === 'externo' ? 'Terceirizada' : (window.crmOperatorType(u) === 'advogado' ? 'Advogado (Jurídico)' : 'Apoio Jurídico'))}</div>` : ''}
          </td>
          <td style="padding: 16px 15px;">${statusSwitch}</td>
          <td style="padding: 16px 15px;">
             <button onclick="ConfigUsersApp.openUserModal(${JSON.stringify(u.id)})" class="btn btn-outline" style="padding: 6px; border-radius: 8px; border-color: #105436; color: #105436;" title="Editar Dados"><i data-lucide="edit" style="width:18px;height:18px;"></i></button>
          </td>
        </tr>
      `;
    }).join('');
    if (!trs) {
      trs = `<tr><td colspan="6" style="padding:28px 16px;text-align:center;color:#64748b;">Nenhum usuário neste filtro.</td></tr>`;
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
      <div style="display: flex; gap: 6px;">
         <button onclick="ConfigUsersApp.editProfile('${this.selectedProfile}')" style="${adminHidden} padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #5f6368; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Editar Nome">
            <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
         </button>
         
         <button onclick="ConfigUsersApp.duplicateProfile('${this.selectedProfile}')" style="padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #1a73e8; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Duplicar Perfil (Copiar Permissões)">
            <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
         </button>
         
         <button onclick="ConfigUsersApp.deleteProfile('${this.selectedProfile}')" style="${adminHidden} padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #d93025; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Excluir Perfil">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
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
        .cfg-page { padding: 22px; max-width: 1140px; margin: 0 auto; }
        .cfg-tabs { display: flex; gap: 8px; margin: 0 0 16px; }
        .cfg-tab { border: 1px solid #0c3d28; background: #fff; color: #0c3d28; border-radius: 999px; padding: 8px 16px; font-weight: 800; cursor: pointer; }
        .cfg-tab.is-on { background: #105436; color: #fff; border-color: #105436; }
        .cfg-panel { background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); padding: 16px; }
        .cfg-filters { display: grid; grid-template-columns: 1.3fr 1.1fr 1.2fr 0.9fr auto; gap: 12px; align-items: end; margin-bottom: 14px; }
        .cfg-filters label { display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 6px; }
        .cfg-filters .form-control { height: 40px; border: 1px solid #475569; border-radius: 8px; background: #fff; color: #0f172a; padding: 0 12px; width: 100%; font-size: 0.9rem; }
        .cfg-filters .form-control:focus { outline: 2px solid #105436; border-color: #105436; }
        .cfg-count { height: 40px; display: flex; align-items: center; padding: 0 12px; border-radius: 8px; background: #ecfdf5; color: #064e3b; font-weight: 800; font-size: 0.85rem; white-space: nowrap; }
        .cfg-table-wrap { border: 1px solid #cbd5e1; border-radius: 12px; overflow: auto; }
        .cfg-table { width: 100%; border-collapse: collapse; text-align: left; background: #fff; }
        .cfg-table th { padding: 12px 14px; color: #fff; background: #105436; font-weight: 800; font-size: 0.82rem; }
        .cfg-table td { padding: 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; }
        .cfg-table tr:last-child td { border-bottom: 0; }
        .cfg-prof-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
        .cfg-prof-bar select { height: 40px; min-width: 280px; border: 1px solid #475569; border-radius: 8px; padding: 0 12px; font-weight: 700; color: #0f172a; background: #fff; }
        @media (max-width: 900px) { .cfg-filters { grid-template-columns: 1fr 1fr; } }
      </style>
      <div class="cfg-page">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 12px; flex-wrap: wrap;">
          <h2 style="display: flex; align-items: center; gap: 10px; font-size: 1.5rem; margin: 0; color: #202124;">
            <i data-lucide="users" style="width: 24px; height: 24px;"></i> Usuários e Perfis
          </h2>
          ${this.view === "usuarios" ? `
          <button class="btn btn-primary" style="background-color: #105436; border-color: #105436; font-weight: 600; padding: 10px 20px; border-radius: 8px;" onclick="ConfigUsersApp.openUserModal()">
            <i data-lucide="user-plus" style="width: 18px; margin-right: 6px;"></i> Convidar Usuário
          </button>` : this.view === "perfis" ? `
          <button class="btn btn-primary" style="background-color: #105436; border-color: #105436; font-weight: 600; padding: 10px 20px; border-radius: 8px;" onclick="ConfigUsersApp.savePermissions()">
            <i data-lucide="save" style="width: 18px; margin-right: 6px;"></i> Salvar Permissões
          </button>` : ""}
        </div>
        <div class="cfg-tabs">
          <button type="button" class="cfg-tab ${this.view === "usuarios" ? "is-on" : ""}" onclick="ConfigUsersApp.setView('usuarios')">Usuários</button>
          <button type="button" class="cfg-tab ${this.view === "perfis" ? "is-on" : ""}" onclick="ConfigUsersApp.setView('perfis')">Perfis</button>
          <button type="button" class="cfg-tab ${this.view === "modulos" ? "is-on" : ""}" onclick="ConfigUsersApp.setView('modulos')">Módulos</button>
        </div>

        ${this.view === "modulos" ? this.modulosPanelHtml() : this.view === "usuarios" ? `
        <div class="cfg-panel">
          <div class="cfg-filters">
            <div>
              <label for="cfg-user-nome">Nome</label>
              <input id="cfg-user-nome" class="form-control" type="search" placeholder="Nome do usuário" value="${this.esc(filters.nome)}" oninput="ConfigUsersApp.onUserFilter('nome', this.value)">
            </div>
            <div>
              <label for="cfg-user-perfil">Perfil</label>
              <select id="cfg-user-perfil" class="form-control" onchange="ConfigUsersApp.onUserFilter('perfil', this.value)">
                <option value="">Todos</option>
                ${profileChoices.map((name) => `<option value="${this.esc(name)}" ${filters.perfil === name ? "selected" : ""}>${this.esc(name)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label for="cfg-user-email">E-mail</label>
              <input id="cfg-user-email" class="form-control" type="search" placeholder="E-mail" value="${this.esc(filters.email)}" oninput="ConfigUsersApp.onUserFilter('email', this.value)">
            </div>
            <div>
              <label for="cfg-user-status">Situação</label>
              <select id="cfg-user-status" class="form-control" onchange="ConfigUsersApp.onUserFilter('status', this.value)">
                <option value="todos" ${filters.status === "todos" ? "selected" : ""}>Todos</option>
                <option value="ativos" ${filters.status === "ativos" ? "selected" : ""}>Somente ativos</option>
                <option value="inativos" ${filters.status === "inativos" ? "selected" : ""}>Desativados</option>
              </select>
            </div>
            <div class="cfg-count">${shownUsers.length} usuário(s)</div>
          </div>
          <div class="cfg-table-wrap">
          <table class="cfg-table">
            <thead>
              <tr>
                <th>Nome Completo / E-mail</th>
                <th>Usuário Sienge</th>
                <th>Celular</th>
                <th>Perfil de Acesso</th>
                <th>Status</th>
                <th>Ações</th>
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
      const ok = window.confirm("Você está tirando " + removed.length + " acesso(s) deste perfil. Permissão não é apagada sozinha. Confirma a retirada?");
      if (!ok) return;
    }
    const perms = Object.assign({}, existing, incoming, { _savedAt: Date.now() });
    delete perms.__mirror_of__;
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
