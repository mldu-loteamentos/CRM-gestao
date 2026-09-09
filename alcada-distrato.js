(function () {
  const STORAGE_KEY = "crm_moura_alcada_distrato";
  const OBRAS_KEY = "crm_obras_andamento";
  let saveTimer = null;
  let saving = false;
  let obrasSaveTimer = null;

  function num(v) {
    const n = Number(String(v == null ? "" : v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function clampInt(v, min, max) {
    const n = Math.round(Number(v) || 0);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function defaultConfig() {
    return {
      workInProgress: {
        minPct: 35,
        maxPct: 55,
        minInstallments: 6,
        maxInstallments: 12
      },
      withTvo: {
        minPct: 55,
        maxPct: 65,
        minInstallments: 3,
        maxInstallments: 12
      },
      updatedAt: null
    };
  }

  function normalizeRule(raw, fallback) {
    const base = Object.assign({}, fallback || {});
    const minPct = num(raw && raw.minPct);
    const maxPct = num(raw && raw.maxPct);
    const minInst = num(raw && raw.minInstallments);
    const maxInst = num(raw && raw.maxInstallments);
    base.minPct = minPct != null && minPct >= 0 ? minPct : Number(base.minPct) || 0;
    base.maxPct = maxPct != null && maxPct >= 0 ? maxPct : Number(base.maxPct) || 0;
    base.minInstallments = minInst != null && minInst >= 0 ? clampInt(minInst, 0, 120) : Number(base.minInstallments) || 0;
    base.maxInstallments = maxInst != null && maxInst >= 0 ? clampInt(maxInst, 0, 120) : Number(base.maxInstallments) || 0;
    if (base.maxPct < base.minPct) base.maxPct = base.minPct;
    if (base.maxInstallments < base.minInstallments) base.maxInstallments = base.minInstallments;
    return base;
  }

  function normalizeConfig(raw) {
    const def = defaultConfig();
    if (!raw || typeof raw !== "object") return def;
    return {
      workInProgress: normalizeRule(raw.workInProgress, def.workInProgress),
      withTvo: normalizeRule(raw.withTvo, def.withTvo),
      updatedAt: raw.updatedAt || null
    };
  }

  function loadConfig() {
    try {
      return normalizeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (e) {
      return defaultConfig();
    }
  }

  function fmtPct(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : "";
  }

  function fmtInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : "";
  }

  function canEdit() {
    if (typeof window.hasFinCrAction !== "function") return true;
    return window.hasFinCrAction("regras_cobranca", "editar");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readObrasState() {
    try {
      const raw = JSON.parse(localStorage.getItem(OBRAS_KEY) || "{}");
      const out = {};
      Object.keys(raw || {}).forEach((k) => {
        const v = raw[k];
        if (typeof v === "boolean") out[String(k)] = { isOn: v, previsao: "" };
        else if (v && typeof v === "object") out[String(k)] = { isOn: !!v.isOn, previsao: v.previsao || "" };
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  function currentCtx(ctx) {
    const st = ctx || {};
    const sale = window.g_distSale || window.sale || {};
    const unit = (window.AppState && AppState.units && sale.unitId && AppState.units[sale.unitId]) || {};
    const costCenterId = st.costCenterId || (window.AppState && AppState.currentCostCenterId) || unit.costCenterId || sale.costCenterId || sale.enterpriseId || "";
    const companyId = st.companyId || (window.AppState && AppState.currentCompanyId) || unit.companyId || sale.companyId || "";
    const enterpriseName = st.enterpriseName || unit.enterpriseName || unit.projectName || sale.enterpriseName || "";
    return {
      costCenterId: costCenterId != null ? String(costCenterId) : "",
      companyId: companyId != null ? String(companyId) : "",
      enterpriseName: String(enterpriseName || "")
    };
  }

  function resolveRule(ctx) {
    const cfg = loadConfig();
    const x = currentCtx(ctx);
    const obras = readObrasState();
    const obraEntry = (x.costCenterId && obras[x.costCenterId]) || (x.enterpriseName && obras[x.enterpriseName]) || { isOn: false, previsao: "" };
    const isWorkInProgress = !!obraEntry.isOn;
    const rule = normalizeRule(isWorkInProgress ? cfg.workInProgress : cfg.withTvo, isWorkInProgress ? defaultConfig().workInProgress : defaultConfig().withTvo);
    const enabled = (Number(rule.maxPct) || 0) > 0 && (Number(rule.maxInstallments) || 0) > 0;
    return {
      kind: isWorkInProgress ? "work_in_progress" : "with_tvo",
      label: isWorkInProgress ? "Obra em andamento (sem TVO)" : "Empreendimento com TVO",
      minPct: Number(rule.minPct) || 0,
      maxPct: Number(rule.maxPct) || 0,
      minInstallments: Number(rule.minInstallments) || 0,
      maxInstallments: Number(rule.maxInstallments) || 0,
      enabled,
      costCenterId: x.costCenterId,
      companyId: x.companyId,
      enterpriseName: x.enterpriseName,
      obraEntry
    };
  }

  function resolveCostCentersRaw() {
    const fromState = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if (fromState && fromState.length) return fromState;
    try {
      const cached = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "null");
      if (Array.isArray(cached) && cached.length) return cached;
    } catch (e) { /* ignore */ }
    return [];
  }

  function isEmpreendimentoCcId(id) {
    const s = String(id || "").trim();
    return s.charAt(0) === "1" || s.charAt(0) === "2";
  }

  function listEmpreendimentosForObras() {
    let all = resolveCostCentersRaw().slice();
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
      const typed = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(all);
      if (typed && typed.length) all = typed;
    } else {
      all = all.filter((cc) => isEmpreendimentoCcId(cc && cc.id));
    }

    const byId = new Map();
    all.forEach((cc) => {
      if (!cc || cc.id == null) return;
      const id = String(cc.id);
      byId.set(id, {
        id: id,
        label: id + " - " + String(cc.name || "").toUpperCase()
      });
    });

    // Mantém empreendimentos já marcados mesmo se sumirem do inventário atual.
    const state = readObrasState();
    Object.keys(state).forEach((k) => {
      if (!/^\d+$/.test(k)) return;
      if (byId.has(k)) return;
      byId.set(k, { id: k, label: k });
    });

    return [...byId.values()].sort((a, b) => {
      const na = Number(a.id);
      const nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.label).localeCompare(String(b.label), "pt-BR", { numeric: true });
    });
  }

  function persistObrasState(nextState) {
    const toSave = {};
    Object.keys(nextState || {}).forEach((k) => {
      const v = nextState[k];
      if (!v) return;
      toSave[k] = { isOn: !!v.isOn, previsao: v.previsao || "" };
    });
    localStorage.setItem(OBRAS_KEY, JSON.stringify(toSave));
    if (window.firebaseDb && window.firebaseCollections) {
      const { doc, setDoc } = window.firebaseCollections;
      const userName = (window.AppState && window.AppState.currentUser && window.AppState.currentUser.name) || "";
      setDoc(doc(window.firebaseDb, "config", "global"), {
        crm_obras_andamento: JSON.stringify(toSave),
        crm_obras_andamento_meta: JSON.stringify({ updatedAt: Date.now(), updatedBy: userName })
      }, { merge: true }).catch((err) => console.error("[Alçada Distrato] Falha ao sincronizar obras:", err));
    }
    if (window.VerificarConstrucaoApp && typeof window.VerificarConstrucaoApp.renderTable === "function") {
      try { window.VerificarConstrucaoApp.renderTable(); } catch (e) { /* ignore */ }
    }
  }

  function scheduleObrasSave() {
    if (!canEdit()) return;
    if (obrasSaveTimer) clearTimeout(obrasSaveTimer);
    obrasSaveTimer = setTimeout(function () {
      const host = document.getElementById("dist-alcada-obras-editor");
      if (!host) return;
      const next = readObrasState();
      host.querySelectorAll(".dist-obra-row").forEach((row) => {
        const id = row.getAttribute("data-id");
        if (!id) return;
        const on = !!(row.querySelector(".dist-obra-toggle") || {}).checked;
        const previsao = String(((row.querySelector(".dist-obra-previsao") || {}).value) || "");
        next[id] = { isOn: on, previsao: on ? previsao : (previsao || "") };
      });
      persistObrasState(next);
    }, 280);
  }

  function collectForm() {
    const workInProgress = {
      minPct: num((document.getElementById("dist-alcada-obra-min") || {}).value),
      maxPct: num((document.getElementById("dist-alcada-obra-max") || {}).value),
      minInstallments: num((document.getElementById("dist-alcada-obra-parc-min") || {}).value),
      maxInstallments: num((document.getElementById("dist-alcada-obra-parc-max") || {}).value)
    };
    const withTvo = {
      minPct: num((document.getElementById("dist-alcada-tvo-min") || {}).value),
      maxPct: num((document.getElementById("dist-alcada-tvo-max") || {}).value),
      minInstallments: num((document.getElementById("dist-alcada-tvo-parc-min") || {}).value),
      maxInstallments: num((document.getElementById("dist-alcada-tvo-parc-max") || {}).value)
    };
    const normalized = {
      workInProgress: normalizeRule(workInProgress, defaultConfig().workInProgress),
      withTvo: normalizeRule(withTvo, defaultConfig().withTvo)
    };
    const valid =
      normalized.workInProgress.minPct >= 0 &&
      normalized.workInProgress.maxPct >= normalized.workInProgress.minPct &&
      normalized.withTvo.minPct >= 0 &&
      normalized.withTvo.maxPct >= normalized.withTvo.minPct;
    return { valid, data: normalized };
  }

  async function persist(opts) {
    opts = opts || {};
    if (!canEdit()) {
      if (!opts.silent) alert("Sem permissão para editar a alçada de distrato.");
      return false;
    }
    const collected = collectForm();
    if (!collected.valid) {
      if (!opts.silent) alert("Informe percentuais e parcelas válidos. O máximo deve ser maior ou igual ao mínimo.");
      return false;
    }
    const payload = {
      workInProgress: collected.data.workInProgress,
      withTvo: collected.data.withTvo,
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    try {
      if (window.forceUploadLocalConfig) await window.forceUploadLocalConfig(true);
      return true;
    } catch (e) {
      if (!opts.silent) {
        alert("Alçada de distrato salva neste computador, mas a nuvem falhou: " + (e && e.message ? e.message : e));
      }
      return false;
    }
  }

  function scheduleAutoSave() {
    if (!canEdit()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      if (saving) return;
      saving = true;
      try {
        await persist({ silent: true });
      } finally {
        saving = false;
      }
    }, 350);
  }

  function ruleCardHtml(prefix, title, hint, rule) {
    return (
      '<section class="alcada-card">' +
        '<div class="alcada-card-h"><span>' + title + '</span></div>' +
        '<div style="padding:14px;">' +
          '<p style="margin:0 0 14px;font-size:0.82rem;color:#64748b;line-height:1.45;">' + hint + '</p>' +
          '<div style="display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:12px;">' +
            '<label class="alcada-pct-field">' +
              '<input type="text" inputmode="decimal" id="' + prefix + '-min" value="' + fmtPct(rule.minPct) + '" placeholder="0">' +
              '<span>% mín.</span>' +
            '</label>' +
            '<label class="alcada-pct-field">' +
              '<input type="text" inputmode="decimal" id="' + prefix + '-max" value="' + fmtPct(rule.maxPct) + '" placeholder="0">' +
              '<span>% máx.</span>' +
            '</label>' +
            '<label class="alcada-pct-field">' +
              '<input type="number" min="0" max="120" id="' + prefix + '-parc-min" value="' + fmtInt(rule.minInstallments) + '" placeholder="0">' +
              '<span>parc. mín.</span>' +
            '</label>' +
            '<label class="alcada-pct-field">' +
              '<input type="number" min="0" max="120" id="' + prefix + '-parc-max" value="' + fmtInt(rule.maxInstallments) + '" placeholder="0">' +
              '<span>parc. máx.</span>' +
            '</label>' +
          '</div>' +
          '<div style="margin-top:10px;font-size:0.78rem;color:#64748b;">Use <strong>0</strong> para desabilitar a negociação nessa faixa.</div>' +
        '</div>' +
      '</section>'
    );
  }

  function obraRowHtml(emp, state) {
    const isOn = !!(state && state.isOn);
    const previsao = (state && state.previsao) || "";
    const disabled = canEdit() ? "" : " disabled";
    return (
      '<div class="dist-obra-row" data-id="' + escapeHtml(emp.id) + '" style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-bottom:1px solid #e2e8f0;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;">' +
          '<strong style="color:#1e293b;font-size:0.84rem;line-height:1.35;">' + escapeHtml(emp.label) + '</strong>' +
          '<label class="moura-switch" title="Marcar obra em andamento">' +
            '<input type="checkbox" class="dist-obra-toggle"' + (isOn ? " checked" : "") + disabled + '>' +
            '<span class="moura-switch-track" aria-hidden="true"></span>' +
          '</label>' +
        '</div>' +
        '<div class="dist-obra-date-wrap" style="display:' + (isOn ? "flex" : "none") + ';align-items:center;gap:8px;">' +
          '<span style="font-size:0.8rem;color:#64748b;">Previsão de término:</span>' +
          '<input type="date" class="dist-obra-previsao" value="' + escapeHtml(previsao) + '"' + disabled +
            ' style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.8rem;color:#334155;outline:none;">' +
        '</div>' +
      '</div>'
    );
  }

  function renderObrasEditor() {
    const host = document.getElementById("dist-alcada-obras-editor");
    if (!host) return;
    const state = readObrasState();
    const list = listEmpreendimentosForObras();
    if (!list.length) {
      host.innerHTML = '<div style="padding:14px 16px;color:#64748b;font-size:0.82rem;">Nenhum empreendimento encontrado para marcar obra em andamento.</div>';
      return;
    }
    const onCount = list.filter((e) => state[e.id] && state[e.id].isOn).length;
    host.innerHTML =
      '<div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:0.78rem;color:#64748b;">' +
        '<strong style="color:#334155;">' + onCount + '</strong> com obra ativa · ' + list.length + ' empreendimento(s)' +
      '</div>' +
      '<div style="max-height:420px;overflow:auto;">' +
        list.map((emp) => obraRowHtml(emp, state[emp.id])).join("") +
      '</div>';
  }

  function bind() {
    const root = document.getElementById("content-regra-alcada-distrato");
    if (!root || root.dataset.boundDistratoAlcada === "1") return;
    root.dataset.boundDistratoAlcada = "1";
    root.addEventListener("input", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.classList && (t.classList.contains("dist-obra-toggle") || t.classList.contains("dist-obra-previsao"))) {
        const row = t.closest(".dist-obra-row");
        if (row && t.classList.contains("dist-obra-toggle")) {
          const wrap = row.querySelector(".dist-obra-date-wrap");
          if (wrap) wrap.style.display = t.checked ? "flex" : "none";
        }
        scheduleObrasSave();
        return;
      }
      if (t.matches("input")) scheduleAutoSave();
    });
    root.addEventListener("change", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.classList && (t.classList.contains("dist-obra-toggle") || t.classList.contains("dist-obra-previsao"))) {
        scheduleObrasSave();
        return;
      }
      if (t.matches("input")) scheduleAutoSave();
    });
  }

  window.renderAlcadaDistratoTab = function () {
    const root = document.getElementById("content-regra-alcada-distrato");
    if (!root) return;
    const cfg = loadConfig();
    root.innerHTML =
      '<div class="alcada-head">' +
        "<div>" +
          "<h3><i data-lucide=\"badge-percent\"></i> Alçada para Distrato</h3>" +
        "</div>" +
      "</div>" +
      '<div class="alcada-zero-bar">' +
        '<div class="alcada-zero-copy">' +
          "<strong>Faixas por status da obra / TVO</strong>" +
          "<span>Empreendimentos com <em>obra em andamento</em> usam uma alçada; empreendimentos com <em>TVO liberado</em> usam outra. Quando a faixa estiver zerada, a tela do distrato não libera negociação e mantém apenas a Lei do Distrato.</span>" +
        "</div>" +
      "</div>" +
      '<div class="alcada-layout">' +
        ruleCardHtml("dist-alcada-obra", "Sem TVO · obra em andamento", "Aplica quando o empreendimento estiver marcado em obras em andamento.", cfg.workInProgress) +
        ruleCardHtml("dist-alcada-tvo", "Com TVO · sem obra", "Aplica quando o empreendimento não estiver marcado como obra em andamento.", cfg.withTvo) +
      "</div>" +
      '<section class="alcada-card" style="margin-top:14px;">' +
        '<div class="alcada-card-h">' +
          "<span>Obras em andamento</span>" +
        "</div>" +
        '<div id="dist-alcada-obras-editor"></div>' +
      "</section>";
    renderObrasEditor();
    bind();
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.openDistratoObrasAndamentoConfig = function () {
    if (typeof window.renderAlcadaDistratoTab === "function") {
      window.renderAlcadaDistratoTab();
      const editor = document.getElementById("dist-alcada-obras-editor");
      if (editor && editor.scrollIntoView) editor.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (window.VerificarConstrucaoApp && typeof window.VerificarConstrucaoApp.abrirModalObrasAndamento === "function") {
      if (typeof window.VerificarConstrucaoApp._ensureModals === "function") {
        window.VerificarConstrucaoApp._ensureModals();
      }
      window.VerificarConstrucaoApp.abrirModalObrasAndamento();
    }
  };

  window.saveAlcadaDistratoConfig = function () {
    return persist({ silent: false });
  };

  window.loadAlcadaDistratoConfig = loadConfig;
  window.resolveDistratoAlcada = resolveRule;
})();
