// Alçadas de desconto para Valor Quitação
(function () {
  const STORAGE_KEY = "crm_moura_alcada_desconto";

  function defaultConfig() {
    return {
      taxaZeroMaxPct: 5,
      levels: [{ id: 1, minPct: 0, maxPct: 5 }],
      updatedAt: null
    };
  }

  function parsePct(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
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
    if (allUpcomingZero) {
      return {
        kind: "taxa_zero",
        maxPct: cfg.taxaZeroMaxPct,
        minPct: 0,
        level: null,
        label: "Taxa 0 · máx. " + fmtPct(cfg.taxaZeroMaxPct) + "%",
        within: Number.isFinite(pct) ? pct <= cfg.taxaZeroMaxPct + 0.009 : true
      };
    }
    const levels = (cfg.levels || []).slice().sort(function (a, b) { return a.minPct - b.minPct; });
    if (!levels.length) {
      return { kind: "none", maxPct: null, minPct: null, level: null, label: "Sem alçada cadastrada", within: true };
    }
    if (!Number.isFinite(pct)) {
      const first = levels[0];
      return {
        kind: "nivel",
        level: first.id,
        minPct: first.minPct,
        maxPct: first.maxPct,
        label: "Nível " + first.id + " · " + fmtPct(first.minPct) + "% a " + fmtPct(first.maxPct) + "%",
        within: true
      };
    }
    const hit = levels.find(function (lv) {
      return pct + 0.009 >= lv.minPct && pct - 0.009 <= lv.maxPct;
    });
    if (hit) {
      return {
        kind: "nivel",
        level: hit.id,
        minPct: hit.minPct,
        maxPct: hit.maxPct,
        label: "Nível " + hit.id + " · " + fmtPct(hit.minPct) + "% a " + fmtPct(hit.maxPct) + "%",
        within: true
      };
    }
    const last = levels[levels.length - 1];
    return {
      kind: "acima",
      level: null,
      minPct: last.maxPct,
      maxPct: last.maxPct,
      label: "Acima do Nível " + last.id + " (>" + fmtPct(last.maxPct) + "%)",
      within: false
    };
  }

  function paintUpdated(updatedAt) {
    const el = document.getElementById("alcada-desconto-updated");
    if (!el) return;
    if (!updatedAt) {
      el.textContent = "Valores ainda não salvos nesta estação";
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
            '<input type="text" inputmode="decimal" class="alcada-min" value="' + fmtPct(lv.minPct) + '" placeholder="Ex: 0">' +
            '<span>%</span>' +
          '</label>' +
        '</td>' +
        '<td>' +
          '<label class="alcada-pct-field">' +
            '<input type="text" inputmode="decimal" class="alcada-max" value="' + fmtPct(lv.maxPct) + '" placeholder="Ex: 5">' +
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

  window.renderAlcadaDescontoTab = function (cfg) {
    const data = cfg || loadConfig();
    const taxaEl = document.getElementById("alcada-taxa-zero-max");
    if (taxaEl) taxaEl.value = fmtPct(data.taxaZeroMaxPct);
    const body = document.getElementById("alcada-levels-body");
    if (body) {
      body.innerHTML = (data.levels || []).map(levelRowHtml).join("");
    }
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
    const n = body.querySelectorAll(".alcada-level-row").length + 1;
    const lastMax = body.querySelector(".alcada-level-row:last-child .alcada-max");
    const start = lastMax ? (parsePct(lastMax.value) || 0) : 0;
    body.insertAdjacentHTML("beforeend", levelRowHtml({ id: Date.now(), minPct: start, maxPct: start }, n - 1));
    Array.from(body.querySelectorAll(".alcada-level-row")).forEach(function (row, i) {
      const strong = row.querySelector("strong");
      if (strong) strong.textContent = "Nível " + (i + 1);
    });
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
    Array.from(body.querySelectorAll(".alcada-level-row")).forEach(function (r, i) {
      const strong = r.querySelector("strong");
      if (strong) strong.textContent = "Nível " + (i + 1);
    });
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
      levels.push({ id: i + 1, minPct: min, maxPct: max });
    });
    return { valid: valid && levels.length > 0, taxaZeroMaxPct: taxa, levels: levels };
  }

  window.saveAlcadaDescontoConfig = async function () {
    if (typeof window.hasFinCrAction === "function" && !window.hasFinCrAction("regras_cobranca", "editar")) {
      alert("Sem permissão para editar alçadas de desconto.");
      return;
    }
    const collected = collectFromForm();
    if (!collected.valid) {
      alert("Informe percentuais válidos (0 a 100). Em cada nível, o máximo deve ser maior ou igual ao mínimo.");
      return;
    }
    const payload = {
      taxaZeroMaxPct: collected.taxaZeroMaxPct,
      levels: collected.levels,
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
})();
