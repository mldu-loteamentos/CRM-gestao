// Alçadas de desconto para Valor Quitação
(function () {
  const STORAGE_KEY = "crm_moura_alcada_desconto";
  let saveTimer = null;
  let saving = false;

  const ALCADA_ROLES = [
    { id: "op_cobranca_interno", label: "Operador de cobrança interno", hint: "Perfil OPERADOR COBRANÇA · interno" },
    { id: "op_cobranca_back", label: "Operador de cobrança interno back office", hint: "Perfil OPERADOR COBRANÇA INTERNO BACK OFFICE" },
    { id: "time_rel", label: "Time relacionamento", hint: "Perfil TIME RELACIONAMENTO" },
    { id: "sup_rel", label: "Supervisor relacionamento", hint: "Perfil SUPERVISOR RELACIONAMENTO" },
    { id: "sup_tes", label: "Supervisor tesouraria", hint: "Perfil SUPERVISOR TESOURARIA" },
    { id: "ger_fpa", label: "Gerente FP&A", hint: "Perfil GERENTE FP&A" }
  ];

  const ui = {
    companyOpen: false,
    companyQuery: "",
    ccOpen: false,
    ccQuery: ""
  };

  function defaultRoleLevels(levels) {
    const firstId = levels && levels[0] ? Number(levels[0].id) || 1 : 1;
    const map = {};
    ALCADA_ROLES.forEach(function (role) { map[role.id] = firstId; });
    return map;
  }

  function defaultConfig() {
    const levels = [{ id: 1, minPct: 0, maxPct: 5 }];
    return {
      taxaZeroMaxPct: 5,
      taxaZeroCompanyIds: [],
      taxaZeroCostCenterIds: [],
      levels: levels,
      roleLevels: defaultRoleLevels(levels),
      updatedAt: null
    };
  }

  function parsePct(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function asIdList(arr) {
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map(function (x) { return String(x); }).filter(Boolean))];
  }

  function normalizeRoleLevels(raw, levels) {
    const map = defaultRoleLevels(levels);
    const src = raw && raw.roleLevels && typeof raw.roleLevels === "object" ? raw.roleLevels : {};
    ALCADA_ROLES.forEach(function (role) {
      const n = Number(src[role.id]);
      if (Number.isFinite(n) && levels.some(function (lv) { return Number(lv.id) === n; })) {
        map[role.id] = n;
      }
    });
    return map;
  }

  function normalize(raw) {
    const base = defaultConfig();
    if (!raw || typeof raw !== "object") return base;
    const taxa = parsePct(raw.taxaZeroMaxPct);
    base.taxaZeroMaxPct = taxa != null && taxa >= 0 ? taxa : base.taxaZeroMaxPct;
    base.taxaZeroCompanyIds = asIdList(raw.taxaZeroCompanyIds || (raw.taxaZeroScope && raw.taxaZeroScope.companyIds));
    base.taxaZeroCostCenterIds = asIdList(raw.taxaZeroCostCenterIds || (raw.taxaZeroScope && raw.taxaZeroScope.costCenterIds));
    const levels = Array.isArray(raw.levels) ? raw.levels : [];
    base.levels = (levels.length ? levels : base.levels).map(function (lv, i) {
      const min = parsePct(lv && lv.minPct);
      const max = parsePct(lv && lv.maxPct);
      return {
        id: Number(lv && lv.id) || (i + 1),
        minPct: min != null ? min : 0,
        maxPct: max != null ? max : 0
      };
    });
    base.roleLevels = normalizeRoleLevels(raw, base.levels);
    base.updatedAt = raw.updatedAt || null;
    return base;
  }

  function loadConfig() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (e) {
      return defaultConfig();
    }
  }

  function fmtPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function normName(s) {
    return String(s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " E ")
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchAlcadaRole(user) {
    if (!user) return null;
    const rec = (typeof window.findCrmRegisteredUser === "function")
      ? (window.findCrmRegisteredUser(user) || user)
      : user;
    const profile = normName(rec.profile_name || rec.profile || rec.perfil);
    const opType = String(rec.operator_type || "").toLowerCase();
    if (!profile) return null;

    if (profile.includes("BACK OFFICE") || profile.includes("BACKOFFICE")
      || (profile.includes("OPERADOR COBRANCA") && profile.includes(" BACK"))) {
      return "op_cobranca_back";
    }
    if (profile.includes("SUPERVISOR") && profile.includes("RELACIONAMENTO")) return "sup_rel";
    if (profile.includes("SUPERVISOR") && profile.includes("TESOURARIA")) return "sup_tes";
    if (profile.includes("GERENTE") && (profile.includes("FP E A") || profile.includes("FPA") || profile.includes("FP A"))) {
      return "ger_fpa";
    }
    if (profile.includes("TIME RELACIONAMENTO")
      || (profile.includes("RELACIONAMENTO") && !profile.includes("SUPERVISOR") && !profile.includes("GERENTE"))) {
      return "time_rel";
    }
    if (profile.includes("OPERADOR COBRANCA")) {
      if (opType === "externo" || opType === "advogado" || opType === "apoio_juridico") return null;
      return "op_cobranca_interno";
    }
    return null;
  }

  function upcomingAllZeroRate(installments) {
    const list = (installments || []).filter(function (inst) {
      const due = String(inst.dueDate || inst.due || "").slice(0, 10);
      const today = (typeof quitacaoTodayIso === "function")
        ? quitacaoTodayIso()
        : new Date().toISOString().slice(0, 10);
      const overdue = typeof distPermutaIsOverdue === "function"
        ? distPermutaIsOverdue(inst)
        : (due && due < today);
      const paid = typeof quitacaoInstIsPaid === "function" ? quitacaoInstIsPaid(inst) : false;
      return due && !overdue && !paid;
    });
    if (!list.length) return false;
    return list.every(function (inst) {
      const cands = [inst.interestPercentage, inst.interestRate, inst.interestPct];
      const nums = cands.map(Number).filter(function (n) { return Number.isFinite(n); });
      if (!nums.length) return false;
      return nums.every(function (n) {
        if (Math.abs(n) < 0.00001) return true;
        if (n > 0 && n < 0.0005) return true;
        return false;
      });
    });
  }

  /**
   * Regra "teto taxa 0" só vale se empresa/empreendimento estiverem no escopo.
   * Listas vazias = todas (compatível com configs antigas).
   */
  function taxaZeroScopeApplies(cfg, ctx) {
    const cos = asIdList(cfg && cfg.taxaZeroCompanyIds);
    const ccs = asIdList(cfg && cfg.taxaZeroCostCenterIds);
    if (!cos.length && !ccs.length) return true;
    const companyId = ctx && ctx.companyId != null ? String(ctx.companyId) : "";
    const costCenterId = ctx && ctx.costCenterId != null ? String(ctx.costCenterId) : "";
    if (cos.length && (!companyId || cos.indexOf(companyId) === -1)) return false;
    if (ccs.length && (!costCenterId || ccs.indexOf(costCenterId) === -1)) return false;
    return true;
  }

  function resolveAlcada(discountPct, allUpcomingZero, ctx) {
    const cfg = loadConfig();
    const pct = Number(discountPct);
    const user = window.AppState && AppState.currentUser;
    const roleId = matchAlcadaRole(user);
    const role = ALCADA_ROLES.find(function (r) { return r.id === roleId; });
    const isAdmin = typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(user);
    const roleLabel = role ? role.label : (isAdmin ? "Administrador" : null);

    if (allUpcomingZero) {
      if (!taxaZeroScopeApplies(cfg, ctx || {})) {
        return {
          kind: "taxa_zero_fora",
          maxPct: 0,
          minPct: 0,
          level: null,
          roleId: roleId,
          roleLabel: roleLabel,
          label: "Taxa 0 · empreendimento fora da regra (sem desconto por alçada taxa 0)",
          within: !Number.isFinite(pct) || pct <= 0.009,
          scopeBlocked: true
        };
      }
      return {
        kind: "taxa_zero",
        maxPct: cfg.taxaZeroMaxPct,
        minPct: 0,
        level: null,
        roleId: roleId,
        roleLabel: roleLabel,
        label: "Taxa 0 · máx. " + fmtPct(cfg.taxaZeroMaxPct) + "%",
        within: Number.isFinite(pct) ? pct <= cfg.taxaZeroMaxPct + 0.009 : true
      };
    }

    const levels = cfg.levels || [];
    let level = null;
    if (roleId && cfg.roleLevels) {
      const assigned = Number(cfg.roleLevels[roleId]);
      if (Number.isFinite(assigned)) {
        level = levels.find(function (lv) { return Number(lv.id) === assigned; }) || null;
      }
    }
    if (!level && isAdmin && levels.length) {
      level = levels.slice().sort(function (a, b) { return b.maxPct - a.maxPct; })[0];
    }
    if (!level) {
      return {
        kind: "none",
        maxPct: 0,
        minPct: 0,
        level: null,
        roleId: roleId,
        roleLabel: roleLabel,
        label: "Sem alçada para este perfil",
        within: !Number.isFinite(pct) || pct <= 0.009
      };
    }
    const idx = levels.findIndex(function (lv) { return Number(lv.id) === Number(level.id); });
    const label = "Nível " + (idx >= 0 ? idx + 1 : level.id) + " · até " + fmtPct(level.maxPct) + "%";
    return {
      kind: "nivel",
      level: level.id,
      minPct: level.minPct,
      maxPct: level.maxPct,
      roleId: roleId,
      roleLabel: roleLabel,
      label: label,
      within: !Number.isFinite(pct) || pct <= level.maxPct + 0.009
    };
  }

  function paintUpdated() {
    /* status de autosave removido da UI */
  }

  function levelRowHtml(lv, idx) {
    return (
      '<tr class="alcada-level-row" data-id="' + lv.id + '">' +
        '<td><strong>Nível ' + (idx + 1) + '</strong></td>' +
        '<td>' +
          '<label class="alcada-pct-field">' +
            '<input type="text" inputmode="decimal" class="alcada-min" value="' + fmtPct(lv.minPct) + '" placeholder="0">' +
            '<span>%</span>' +
          '</label>' +
        '</td>' +
        '<td>' +
          '<label class="alcada-pct-field">' +
            '<input type="text" inputmode="decimal" class="alcada-max" value="' + fmtPct(lv.maxPct) + '" placeholder="5">' +
            '<span>%</span>' +
          '</label>' +
        '</td>' +
        '<td>' +
          '<button type="button" class="alcada-del" onclick="window.removeAlcadaDescontoLevel(this)" title="Remover nível">' +
            '<i data-lucide="trash-2" style="width:13px;height:13px;"></i>' +
          '</button>' +
        '</td>' +
      '</tr>'
    );
  }

  function currentLevelsFromForm() {
    return Array.from(document.querySelectorAll("#alcada-levels-body .alcada-level-row")).map(function (row, i) {
      return {
        id: Number(row.getAttribute("data-id")) || (i + 1),
        minPct: parsePct((row.querySelector(".alcada-min") || {}).value),
        maxPct: parsePct((row.querySelector(".alcada-max") || {}).value)
      };
    });
  }

  function roleOptionsHtml(levels, selectedId) {
    return (levels || []).map(function (lv, i) {
      const sel = Number(selectedId) === Number(lv.id) ? " selected" : "";
      const max = fmtPct(lv.maxPct);
      return '<option value="' + lv.id + '"' + sel + ">Nível " + (i + 1) + (max !== "" ? " · até " + max + "%" : "") + "</option>";
    }).join("");
  }

  function renderRoles(roleLevels, levels) {
    const box = document.getElementById("alcada-roles-body");
    if (!box) return;
    const firstId = levels[0] && levels[0].id;
    box.innerHTML = ALCADA_ROLES.map(function (role) {
      const selected = roleLevels && roleLevels[role.id] != null ? roleLevels[role.id] : firstId;
      return (
        '<div class="alcada-role-row" data-role="' + role.id + '">' +
          '<div class="alcada-role-meta">' +
            '<strong>' + role.label + '</strong>' +
            '<span>' + role.hint + '</span>' +
          '</div>' +
          '<label class="alcada-role-ask">' +
            '<span>Qual o nível?</span>' +
            '<select class="alcada-role-level">' + roleOptionsHtml(levels, selected) + '</select>' +
          '</label>' +
        '</div>'
      );
    }).join("");
  }

  function refreshRoleSelects() {
    const levels = currentLevelsFromForm();
    document.querySelectorAll(".alcada-role-row").forEach(function (row) {
      const sel = row.querySelector("select");
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = roleOptionsHtml(levels, prev);
    });
  }

  function companiesList() {
    return ((window.AppState && AppState.companies) || []).map(function (c) {
      return { id: String(c.id), name: c.name || "", label: c.id + " - " + String(c.name || "").toUpperCase() };
    });
  }

  function ccCompanyId(cc) {
    if (!cc) return "";
    const raw = cc.companyId != null && cc.companyId !== "" ? cc.companyId
      : (cc.idCompany != null && cc.idCompany !== "" ? cc.idCompany : "");
    return raw === "" || raw == null ? "" : String(raw);
  }

  function resolveCostCentersRaw() {
    const fromState = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if (fromState && fromState.length) return fromState;
    const fromAuth = (window.MouraAuth && MouraAuth.costCenters) || [];
    if (fromAuth && fromAuth.length) return fromAuth;
    try {
      const cached = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "null");
      if (Array.isArray(cached) && cached.length) return cached;
    } catch (e) { /* ignore */ }
    return (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) || [];
  }

  async function ensureCostCentersLoaded() {
    let all = resolveCostCentersRaw();
    if (all.length) {
      if (window.AppState && !(AppState.cachedCostCenters && AppState.cachedCostCenters.length)) {
        AppState.cachedCostCenters = all;
      }
      return all;
    }
    try {
      if (window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
        all = await SiengeApiService.getCostCenters() || [];
        if (window.AppState) AppState.cachedCostCenters = all;
      }
    } catch (e) {
      console.warn("[Alçada] Falha ao carregar centros de custo:", e);
    }
    return all || [];
  }

  function costCentersList(companyIds) {
    let all = resolveCostCentersRaw().slice();
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
      const typed = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(all);
      if (typed && typed.length) all = typed;
    }
    const cos = asIdList(companyIds);
    const allCompanyIds = companiesList().map(function (c) { return String(c.id); });
    // Seleção vazia OU todas as SPEs = não restringe por empresa
    const filterByCompany = cos.length > 0 && !(allCompanyIds.length && cos.length === allCompanyIds.length && allCompanyIds.every(function (id) { return cos.indexOf(id) !== -1; }));
    return all
      .filter(function (cc) {
        if (!filterByCompany) return true;
        const cid = ccCompanyId(cc);
        if (!cid) return true;
        return cos.indexOf(cid) !== -1;
      })
      .map(function (cc) {
        return {
          id: String(cc.id),
          name: cc.name || "",
          label: cc.id + " - " + String(cc.name || "").toUpperCase()
        };
      })
      .sort(function (a, b) {
        const na = Number(a.id);
        const nb = Number(b.id);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.label).localeCompare(String(b.label), "pt-BR");
      });
  }

  function readScopeFromUiOrCfg(cfg) {
    const root = document.getElementById("alcada-taxa-zero-scope");
    if (!root) {
      return {
        companyIds: asIdList(cfg && cfg.taxaZeroCompanyIds),
        costCenterIds: asIdList(cfg && cfg.taxaZeroCostCenterIds)
      };
    }
    return {
      companyIds: asIdList(JSON.parse(root.getAttribute("data-companies") || "[]")),
      costCenterIds: asIdList(JSON.parse(root.getAttribute("data-ccs") || "[]"))
    };
  }

  function writeScopeAttrs(companyIds, costCenterIds) {
    const root = document.getElementById("alcada-taxa-zero-scope");
    if (!root) return;
    root.setAttribute("data-companies", JSON.stringify(asIdList(companyIds)));
    root.setAttribute("data-ccs", JSON.stringify(asIdList(costCenterIds)));
  }

  function renderScopeFilters(cfg) {
    const host = document.getElementById("alcada-taxa-zero-scope");
    if (!host || typeof window.MlEmpresaFilter === "undefined") return;
    const companyIds = asIdList(cfg.taxaZeroCompanyIds);
    let costCenterIds = asIdList(cfg.taxaZeroCostCenterIds);
    const cos = companiesList();
    const ccs = costCentersList(companyIds);
    const ccSet = new Set(ccs.map(function (x) { return String(x.id); }));
    costCenterIds = costCenterIds.filter(function (id) { return !companyIds.length || ccSet.has(String(id)); });
    writeScopeAttrs(companyIds, costCenterIds);

    const empHtml = MlEmpresaFilter.html({
      id: "alcada-emp",
      label: "EMPRESAS (SPE)",
      items: cos,
      selectedIds: companyIds,
      open: ui.companyOpen,
      query: ui.companyQuery,
      emptyMeansAll: true,
      countMode: true
    });
    const ccHtml = MlEmpresaFilter.html({
      id: "alcada-cc",
      label: "EMPREENDIMENTOS",
      items: ccs,
      selectedIds: costCenterIds,
      open: ui.ccOpen,
      query: ui.ccQuery,
      emptyMeansAll: true,
      countMode: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
    });

    host.innerHTML =
      '<p class="alcada-scope-hint">Marque onde a regra de teto taxa 0 vale. Sem seleção = todas. SPE/empreendimento de fora fica sem desconto por essa alçada, mesmo com contrato 0%.</p>' +
      '<div class="alcada-scope-filters">' + empHtml + ccHtml + "</div>";

    MlEmpresaFilter.bind("alcada-emp", {
      toggleOpen: function () {
        ui.companyOpen = !ui.companyOpen;
        ui.ccOpen = false;
        renderScopeFilters(Object.assign({}, cfg, {
          taxaZeroCompanyIds: readScopeFromUiOrCfg(cfg).companyIds,
          taxaZeroCostCenterIds: readScopeFromUiOrCfg(cfg).costCenterIds
        }));
        if (window.lucide) lucide.createIcons();
      },
      close: function () {
        if (!ui.companyOpen) return;
        ui.companyOpen = false;
        renderScopeFilters(Object.assign({}, cfg, {
          taxaZeroCompanyIds: readScopeFromUiOrCfg(cfg).companyIds,
          taxaZeroCostCenterIds: readScopeFromUiOrCfg(cfg).costCenterIds
        }));
        if (window.lucide) lucide.createIcons();
      },
      setQuery: function (q) {
        ui.companyQuery = q;
        const list = document.getElementById("alcada-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            items: cos,
            selectedIds: readScopeFromUiOrCfg(cfg).companyIds,
            query: q
          });
        }
      },
      toggleId: function (id, on) {
        const scope = readScopeFromUiOrCfg(cfg);
        const set = new Set(scope.companyIds);
        if (on) set.add(String(id)); else set.delete(String(id));
        const nextCos = [...set];
        const allowedCc = new Set(costCentersList(nextCos).map(function (x) { return String(x.id); }));
        const nextCcs = scope.costCenterIds.filter(function (cid) { return !nextCos.length || allowedCc.has(String(cid)); });
        writeScopeAttrs(nextCos, nextCcs);
        renderScopeFilters({
          taxaZeroCompanyIds: nextCos,
          taxaZeroCostCenterIds: nextCcs
        });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      },
      selectAll: function () {
        const nextCos = cos.map(function (c) { return String(c.id); });
        writeScopeAttrs(nextCos, readScopeFromUiOrCfg(cfg).costCenterIds);
        renderScopeFilters({
          taxaZeroCompanyIds: nextCos,
          taxaZeroCostCenterIds: readScopeFromUiOrCfg(cfg).costCenterIds
        });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      },
      selectNone: function () {
        writeScopeAttrs([], []);
        renderScopeFilters({ taxaZeroCompanyIds: [], taxaZeroCostCenterIds: [] });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      }
    });

    MlEmpresaFilter.bind("alcada-cc", {
      toggleOpen: function () {
        ui.ccOpen = !ui.ccOpen;
        ui.companyOpen = false;
        const scope = readScopeFromUiOrCfg(cfg);
        renderScopeFilters({
          taxaZeroCompanyIds: scope.companyIds,
          taxaZeroCostCenterIds: scope.costCenterIds
        });
        if (window.lucide) lucide.createIcons();
      },
      close: function () {
        if (!ui.ccOpen) return;
        ui.ccOpen = false;
        const scope = readScopeFromUiOrCfg(cfg);
        renderScopeFilters({
          taxaZeroCompanyIds: scope.companyIds,
          taxaZeroCostCenterIds: scope.costCenterIds
        });
        if (window.lucide) lucide.createIcons();
      },
      setQuery: function (q) {
        ui.ccQuery = q;
        const scope = readScopeFromUiOrCfg(cfg);
        const list = document.getElementById("alcada-cc-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            items: costCentersList(scope.companyIds),
            selectedIds: scope.costCenterIds,
            query: q
          });
        }
      },
      toggleId: function (id, on) {
        const scope = readScopeFromUiOrCfg(cfg);
        const set = new Set(scope.costCenterIds);
        if (on) set.add(String(id)); else set.delete(String(id));
        writeScopeAttrs(scope.companyIds, [...set]);
        renderScopeFilters({
          taxaZeroCompanyIds: scope.companyIds,
          taxaZeroCostCenterIds: [...set]
        });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      },
      selectAll: function () {
        const scope = readScopeFromUiOrCfg(cfg);
        const next = costCentersList(scope.companyIds).map(function (c) { return String(c.id); });
        writeScopeAttrs(scope.companyIds, next);
        renderScopeFilters({
          taxaZeroCompanyIds: scope.companyIds,
          taxaZeroCostCenterIds: next
        });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      },
      selectNone: function () {
        const scope = readScopeFromUiOrCfg(cfg);
        writeScopeAttrs(scope.companyIds, []);
        renderScopeFilters({
          taxaZeroCompanyIds: scope.companyIds,
          taxaZeroCostCenterIds: []
        });
        scheduleAutoSave();
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  function canEdit() {
    if (typeof window.hasFinCrAction !== "function") return true;
    return window.hasFinCrAction("regras_cobranca", "editar");
  }

  function collectFromForm() {
    const taxa = parsePct((document.getElementById("alcada-taxa-zero-max") || {}).value);
    if (taxa == null || taxa < 0 || taxa > 100) return { valid: false };
    const rows = document.querySelectorAll("#alcada-levels-body .alcada-level-row");
    const levels = [];
    let valid = true;
    rows.forEach(function (row, i) {
      const min = parsePct((row.querySelector(".alcada-min") || {}).value);
      const max = parsePct((row.querySelector(".alcada-max") || {}).value);
      if (min == null || max == null || min < 0 || max < 0 || max < min || min > 100 || max > 100) valid = false;
      levels.push({
        id: Number(row.getAttribute("data-id")) || (i + 1),
        minPct: min,
        maxPct: max
      });
    });
    const roleLevels = defaultRoleLevels(levels);
    document.querySelectorAll(".alcada-role-row").forEach(function (row) {
      const id = row.getAttribute("data-role");
      const n = Number((row.querySelector(".alcada-role-level") || {}).value);
      if (id && Number.isFinite(n) && levels.some(function (lv) { return Number(lv.id) === n; })) {
        roleLevels[id] = n;
      } else {
        valid = false;
      }
    });
    const scope = readScopeFromUiOrCfg({});
    return {
      valid: valid && levels.length > 0,
      taxaZeroMaxPct: taxa,
      levels: levels,
      roleLevels: roleLevels,
      taxaZeroCompanyIds: scope.companyIds,
      taxaZeroCostCenterIds: scope.costCenterIds
    };
  }

  window.persistAlcadaDescontoConfig = async function (opts) {
    opts = opts || {};
    if (!canEdit()) {
      if (!opts.silent) alert("Sem permissão para editar alçadas de desconto.");
      return false;
    }
    const collected = collectFromForm();
    if (!collected.valid) {
      if (!opts.silent) {
        alert("Informe o nível de cada perfil e percentuais válidos (0 a 100). Em cada nível, o máximo deve ser maior ou igual ao mínimo.");
      }
      paintUpdated(null, "error");
      return false;
    }
    const payload = {
      taxaZeroMaxPct: collected.taxaZeroMaxPct,
      taxaZeroCompanyIds: collected.taxaZeroCompanyIds,
      taxaZeroCostCenterIds: collected.taxaZeroCostCenterIds,
      levels: collected.levels,
      roleLevels: collected.roleLevels,
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    paintUpdated(payload.updatedAt, "saving");
    try {
      if (window.forceUploadLocalConfig) await window.forceUploadLocalConfig(true);
      paintUpdated(payload.updatedAt);
      return true;
    } catch (err) {
      paintUpdated(payload.updatedAt, "error");
      if (!opts.silent) {
        alert("Alçadas salvas neste computador, mas a nuvem falhou: " + (err && err.message ? err.message : err));
      }
      return false;
    }
  };

  function scheduleAutoSave() {
    if (!canEdit()) return;
    paintUpdated(Date.now(), "saving");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      if (saving) {
        scheduleAutoSave();
        return;
      }
      saving = true;
      try {
        await window.persistAlcadaDescontoConfig({ silent: true });
      } finally {
        saving = false;
      }
    }, 450);
  }

  function bindAutoSave() {
    const root = document.getElementById("content-regra-alcada");
    if (!root || root.dataset.alcadaAutoSave === "1") return;
    root.dataset.alcadaAutoSave = "1";
    root.addEventListener("input", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.id === "alcada-taxa-zero-max" || (t.classList && (t.classList.contains("alcada-min") || t.classList.contains("alcada-max")))) {
        if (t.classList && (t.classList.contains("alcada-min") || t.classList.contains("alcada-max"))) refreshRoleSelects();
        scheduleAutoSave();
      }
    });
    root.addEventListener("change", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.classList && t.classList.contains("alcada-role-level")) scheduleAutoSave();
      if (t.id === "alcada-taxa-zero-max") scheduleAutoSave();
    });
  }

  function renumberLevelLabels() {
    Array.from(document.querySelectorAll("#alcada-levels-body .alcada-level-row")).forEach(function (row, i) {
      const strong = row.querySelector("strong");
      if (strong) strong.textContent = "Nível " + (i + 1);
    });
  }

  function nextLevelId(body) {
    let max = 0;
    body.querySelectorAll(".alcada-level-row").forEach(function (row) {
      const n = Number(row.getAttribute("data-id"));
      if (Number.isFinite(n) && n > max) max = n;
    });
    return max + 1;
  }

  window.renderAlcadaDescontoTab = async function (cfg) {
    const data = cfg || loadConfig();
    const taxaEl = document.getElementById("alcada-taxa-zero-max");
    if (taxaEl) taxaEl.value = fmtPct(data.taxaZeroMaxPct);
    const body = document.getElementById("alcada-levels-body");
    if (body) {
      body.innerHTML = (data.levels || []).map(levelRowHtml).join("");
    }
    renderRoles(data.roleLevels || defaultRoleLevels(data.levels), data.levels || []);
    try {
      await ensureCostCentersLoaded();
    } catch (e) { /* ignore */ }
    renderScopeFilters(data);
    bindAutoSave();
    paintUpdated(data.updatedAt);
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.addAlcadaDescontoLevel = function () {
    if (!canEdit()) {
      alert("Sem permissão para editar alçadas de desconto.");
      return;
    }
    const body = document.getElementById("alcada-levels-body");
    if (!body) return;
    const lastMax = body.querySelector(".alcada-level-row:last-child .alcada-max");
    const start = lastMax ? (parsePct(lastMax.value) || 0) : 0;
    const n = body.querySelectorAll(".alcada-level-row").length;
    body.insertAdjacentHTML("beforeend", levelRowHtml({
      id: nextLevelId(body),
      minPct: start,
      maxPct: start
    }, n));
    renumberLevelLabels();
    refreshRoleSelects();
    scheduleAutoSave();
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.removeAlcadaDescontoLevel = function (btn) {
    if (!canEdit()) {
      alert("Sem permissão para editar alçadas de desconto.");
      return;
    }
    const body = document.getElementById("alcada-levels-body");
    if (!body) return;
    const rows = body.querySelectorAll(".alcada-level-row");
    if (rows.length <= 1) {
      alert("Mantenha ao menos um nível de alçada.");
      return;
    }
    const row = btn && btn.closest ? btn.closest(".alcada-level-row") : null;
    if (row) row.remove();
    renumberLevelLabels();
    refreshRoleSelects();
    scheduleAutoSave();
  };

  window.saveAlcadaDescontoConfig = function () {
    return window.persistAlcadaDescontoConfig({ silent: false });
  };

  window.resetAlcadaDescontoToDefault = async function () {
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Restaurar as alçadas padrão?")
      : window.confirm("Restaurar as alçadas padrão?");
    if (!ok) return;
    const payload = defaultConfig();
    payload.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.renderAlcadaDescontoTab(payload);
    scheduleAutoSave();
  };

  window.loadAlcadaDescontoConfig = loadConfig;
  window.resolveQuitacaoAlcada = resolveAlcada;
  window.quitacaoUpcomingAllZeroRate = upcomingAllZeroRate;
  window.alcadaTaxaZeroScopeApplies = function (ctx) {
    return taxaZeroScopeApplies(loadConfig(), ctx || {});
  };
  window.matchAlcadaDescontoRole = matchAlcadaRole;
  window.ALCADA_DESCONTO_ROLES = ALCADA_ROLES;
})();
