(function () {
  const STORAGE_KEY = "crm_moura_alcada_distrato";
  let saveTimer = null;
  let saving = false;

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

  function readObrasState() {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_obras_andamento") || "{}");
      const out = {};
      Object.keys(raw || {}).forEach((k) => {
        const v = raw[k] || {};
        out[String(k)] = { isOn: !!v.isOn, previsao: v.previsao || "" };
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

  function currentObrasSummary() {
    const state = readObrasState();
    const allCcs = ((window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || []).slice();
    return Object.keys(state)
      .filter((k) => state[k] && state[k].isOn)
      .map((k) => {
        const cc = allCcs.find((x) => String(x.id) === String(k));
        const label = cc ? `${cc.id} - ${String(cc.name || "").toUpperCase()}` : String(k);
        return { id: String(k), label, previsao: state[k].previsao || "" };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
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

  function renderObrasSummary() {
    const host = document.getElementById("dist-alcada-obras-summary");
    if (!host) return;
    const rows = currentObrasSummary();
    if (!rows.length) {
      host.innerHTML = '<div style="padding:14px 16px;color:#64748b;font-size:0.82rem;">Nenhum empreendimento marcado com obra em andamento no momento.</div>';
      return;
    }
    host.innerHTML = rows.map((row) => (
      '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">' +
        '<strong style="color:#1e293b;font-size:0.83rem;">' + row.label + "</strong>" +
        '<span style="font-size:0.8rem;color:#64748b;">' + (row.previsao ? ("Previsão: " + row.previsao.split("-").reverse().join("/")) : "Sem previsão") + "</span>" +
      "</div>"
    )).join("");
  }

  function bind() {
    const root = document.getElementById("content-regra-alcada-distrato");
    if (!root || root.dataset.boundDistratoAlcada === "1") return;
    root.dataset.boundDistratoAlcada = "1";
    root.addEventListener("input", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.matches("input")) scheduleAutoSave();
    });
    root.addEventListener("change", function (ev) {
      const t = ev.target;
      if (!t) return;
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
        '<div class="alcada-card-h" style="justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          "<span>Obras em andamento usadas no Distrato</span>" +
          '<button type="button" class="btn btn-outline btn-sm" onclick="window.openDistratoObrasAndamentoConfig()">' +
            '<i data-lucide="building" style="width:14px;height:14px;"></i> Editar lista' +
          "</button>" +
        "</div>" +
        '<div style="padding:14px 16px 0;color:#64748b;font-size:0.82rem;line-height:1.45;">Essa lista é a mesma da tela <strong>Vistoria → Obras em andamento</strong> e sincroniza via Firebase.</div>' +
        '<div id="dist-alcada-obras-summary" style="margin-top:12px;border-top:1px solid #e2e8f0;"></div>' +
      "</section>";
    renderObrasSummary();
    bind();
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  };

  window.openDistratoObrasAndamentoConfig = function () {
    if (window.VerificarConstrucaoApp && typeof window.VerificarConstrucaoApp.abrirModalObrasAndamento === "function") {
      if (typeof window.VerificarConstrucaoApp._ensureModals === "function") {
        window.VerificarConstrucaoApp._ensureModals();
      }
      window.VerificarConstrucaoApp.abrirModalObrasAndamento();
      return;
    }
    alert("A tela de obras em andamento não está disponível nesta sessão.");
  };

  window.saveAlcadaDistratoConfig = function () {
    return persist({ silent: false });
  };

  window.loadAlcadaDistratoConfig = loadConfig;
  window.resolveDistratoAlcada = resolveRule;
})();
