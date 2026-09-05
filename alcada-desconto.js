// Alçadas de desconto para Valor Quitação
(function () {
  const STORAGE_KEY = "crm_moura_alcada_desconto";

  const ALCADA_ROLES = [
    { id: "op_cobranca_interno", label: "Operador de cobrança interno", hint: "Perfil OPERADOR COBRANÇA · interno" },
    { id: "op_cobranca_back", label: "Operador de cobrança interno back office", hint: "Perfil OPERADOR COBRANÇA INTERNO BACK OFFICE" },
    { id: "time_rel", label: "Time relacionamento", hint: "Perfil TIME RELACIONAMENTO" },
    { id: "sup_rel", label: "Supervisor relacionamento", hint: "Perfil SUPERVISOR RELACIONAMENTO" },
    { id: "sup_tes", label: "Supervisor tesouraria", hint: "Perfil SUPERVISOR TESOURARIA" },
    { id: "ger_fpa", label: "Gerente FP&A", hint: "Perfil GERENTE FP&A" }
  ];

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

  function resolveAlcada(discountPct, allUpcomingZero) {
    const cfg = loadConfig();
    const pct = Number(discountPct);
    const user = window.AppState && AppState.currentUser;
    const roleId = matchAlcadaRole(user);
    const role = ALCADA_ROLES.find(function (r) { return r.id === roleId; });
    const isAdmin = typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(user);
    const roleLabel = role ? role.label : (isAdmin ? "Administrador" : null);

    if (allUpcomingZero) {
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

  function paintUpdated(updatedAt) {
    const el = document.getElementById("alcada-desconto-updated");
    if (!el) return;
    if (!updatedAt) {
      el.textContent = "";
      return;
    }
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) {
      el.textContent = "";
      return;
    }
    el.textContent = "última atualização · " + d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
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
            '<i data-lucide="trash-2"></i>' +
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

  function bindLevelInputs() {
    const body = document.getElementById("alcada-levels-body");
    if (!body || body._alcadaBound) return;
    body._alcadaBound = true;
    body.addEventListener("input", function (e) {
      const t = e.target;
      if (t && (t.classList.contains("alcada-min") || t.classList.contains("alcada-max"))) {
        refreshRoleSelects();
      }
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

  window.renderAlcadaDescontoTab = function (cfg) {
    const data = cfg || loadConfig();
    const taxaEl = document.getElementById("alcada-taxa-zero-max");
    if (taxaEl) taxaEl.value = fmtPct(data.taxaZeroMaxPct);
    const body = document.getElementById("alcada-levels-body");
    if (body) {
      body.innerHTML = (data.levels || []).map(levelRowHtml).join("");
    }
    renderRoles(data.roleLevels || defaultRoleLevels(data.levels), data.levels || []);
    bindLevelInputs();
    paintUpdated(data.updatedAt);
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.addAlcadaDescontoLevel = function () {
    if (typeof window.hasFinCrAction === "function" && !window.hasFinCrAction("regras_cobranca", "editar")) {
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
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.removeAlcadaDescontoLevel = function (btn) {
    if (typeof window.hasFinCrAction === "function" && !window.hasFinCrAction("regras_cobranca", "editar")) {
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
  };

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
    return { valid: valid && levels.length > 0, taxaZeroMaxPct: taxa, levels: levels, roleLevels: roleLevels };
  }

  window.saveAlcadaDescontoConfig = async function () {
    if (typeof window.hasFinCrAction === "function" && !window.hasFinCrAction("regras_cobranca", "editar")) {
      alert("Sem permissão para editar alçadas de desconto.");
      return;
    }
    const collected = collectFromForm();
    if (!collected.valid) {
      alert("Informe o nível de cada perfil e percentuais válidos (0 a 100). Em cada nível, o máximo deve ser maior ou igual ao mínimo.");
      return;
    }
    const payload = {
      taxaZeroMaxPct: collected.taxaZeroMaxPct,
      levels: collected.levels,
      roleLevels: collected.roleLevels,
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    paintUpdated(payload.updatedAt);
    try {
      if (window.forceUploadLocalConfig) await window.forceUploadLocalConfig(true);
      alert("Alçadas de desconto salvas com sucesso.");
    } catch (err) {
      alert("Alçadas salvas neste computador, mas a nuvem falhou: " + (err && err.message ? err.message : err));
    }
  };

  window.resetAlcadaDescontoToDefault = async function () {
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Restaurar as alçadas padrão? As alterações não salvas serão perdidas.")
      : window.confirm("Restaurar as alçadas padrão?");
    if (!ok) return;
    window.renderAlcadaDescontoTab(defaultConfig());
  };

  window.loadAlcadaDescontoConfig = loadConfig;
  window.resolveQuitacaoAlcada = resolveAlcada;
  window.quitacaoUpcomingAllZeroRate = upcomingAllZeroRate;
  window.matchAlcadaDescontoRole = matchAlcadaRole;
  window.ALCADA_DESCONTO_ROLES = ALCADA_ROLES;
})();
