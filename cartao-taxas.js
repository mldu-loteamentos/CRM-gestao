(function () {
  const STORAGE_KEY = "crm_moura_cartao_taxas";

  const PRODUCTS = [
    { id: "credito_vista", label: "Crédito à vista", icon: "credit-card", hint: "1x no crédito" },
    { id: "credito_2_6", label: "Crédito parcelado de 2 a 6x", icon: "layers", hint: "2 a 6 parcelas" },
    { id: "credito_7_12", label: "Crédito parcelado de 7 a 12x", icon: "calendar-range", hint: "7 a 12 parcelas" }
  ];

  const DEFAULT_RATES = {
    debito: { masterVisa: 1.3, eloAmex: 2.1 },
    credito_vista: { masterVisa: 1.51, eloAmex: 2.31 },
    credito_2_6: { masterVisa: 1.88, eloAmex: 2.68 },
    credito_7_12: { masterVisa: 1.91, eloAmex: 2.71 }
  };

  function cloneDefaults() {
    const rates = {};
    PRODUCTS.forEach(function (p) {
      rates[p.id] = {
        masterVisa: DEFAULT_RATES[p.id].masterVisa,
        eloAmex: DEFAULT_RATES[p.id].eloAmex
      };
    });
    return { rates: rates, passFeeByProduct: defaultPassFees(), passFee: true, updatedAt: null };
  }

  function defaultPassFees() {
    const map = {};
    PRODUCTS.forEach(function (p) { map[p.id] = true; });
    return map;
  }

  function normalizePassFees(parsed) {
    const map = defaultPassFees();
    const src = parsed && parsed.passFeeByProduct;
    if (src && typeof src === "object") {
      PRODUCTS.forEach(function (p) {
        if (Object.prototype.hasOwnProperty.call(src, p.id)) map[p.id] = src[p.id] !== false;
      });
      return map;
    }
    if (parsed && parsed.passFee === false) {
      PRODUCTS.forEach(function (p) { map[p.id] = false; });
    }
    return map;
  }

  function productPassesFee(cfg, productId) {
    const map = (cfg && cfg.passFeeByProduct) || {};
    if (Object.prototype.hasOwnProperty.call(map, productId)) return map[productId] !== false;
    return !cfg || cfg.passFee !== false;
  }

  function formatPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function parsePct(raw) {
    const s = String(raw || "").trim().replace("%", "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    if (!s) return NaN;
    return parseFloat(s);
  }

  function parseMoney(raw) {
    const s = String(raw || "").trim().replace(/[R$\s]/g, "");
    if (!s) return 0;
    const normalized = s.indexOf(",") !== -1
      ? s.replace(/\./g, "").replace(",", ".")
      : s;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeBrand(brand) {
    const b = String(brand || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (b.indexOf("elo") !== -1 || b.indexOf("amex") !== -1 || b.indexOf("american") !== -1) return "eloAmex";
    return "masterVisa";
  }

  function productForInstallments(n) {
    const q = Number(n);
    if (!Number.isFinite(q) || q <= 0) return "credito_vista";
    if (q === 1) return "credito_vista";
    if (q <= 6) return "credito_2_6";
    return "credito_7_12";
  }

  window.getDefaultCardFees = cloneDefaults;

  window.loadCardFeesConfig = function () {
    const fallback = cloneDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const rates = fallback.rates;
      PRODUCTS.forEach(function (p) {
        const src = (parsed.rates && parsed.rates[p.id]) || parsed[p.id] || {};
        const mv = Number(src.masterVisa);
        const ea = Number(src.eloAmex);
        if (Number.isFinite(mv)) rates[p.id].masterVisa = mv;
        if (Number.isFinite(ea)) rates[p.id].eloAmex = ea;
      });
      const passFeeByProduct = normalizePassFees(parsed);
      return {
        rates: rates,
        passFeeByProduct: passFeeByProduct,
        passFee: PRODUCTS.every(function (p) { return passFeeByProduct[p.id] !== false; }),
        updatedAt: parsed.updatedAt || null
      };
    } catch (e) {
      return fallback;
    }
  };

  window.getCardFeeRate = function (productOrInstallments, brand) {
    const cfg = window.loadCardFeesConfig();
    let productId = String(productOrInstallments || "");
    if (PRODUCTS.every(function (p) { return p.id !== productId; })) {
      productId = productForInstallments(productOrInstallments);
    }
    if (!productPassesFee(cfg, productId)) return 0;
    const group = normalizeBrand(brand);
    const row = cfg.rates[productId] || cfg.rates.credito_vista || {};
    return Number(row[group]) || 0;
  };

  window.calcCardFee = function (amount, productOrInstallments, brand) {
    const cfg = window.loadCardFeesConfig();
    let productId = String(productOrInstallments || "");
    if (PRODUCTS.every(function (p) { return p.id !== productId; })) {
      productId = productForInstallments(productOrInstallments);
    }
    const rate = window.getCardFeeRate(productId, brand);
    const base = Number(amount) || 0;
    const fee = base * (rate / 100);
    return { rate: rate, fee: fee, net: base - fee, passFee: productPassesFee(cfg, productId), productId: productId };
  };

  function collectRatesFromInputs() {
    const rates = {};
    let valid = true;
    PRODUCTS.forEach(function (p) {
      const mvEl = document.getElementById("cartao-taxa-" + p.id + "-mv");
      const eaEl = document.getElementById("cartao-taxa-" + p.id + "-ea");
      const mv = parsePct(mvEl && mvEl.value);
      const ea = parsePct(eaEl && eaEl.value);
      if (!Number.isFinite(mv) || mv < 0 || mv > 100 || !Number.isFinite(ea) || ea < 0 || ea > 100) {
        valid = false;
      }
      rates[p.id] = {
        masterVisa: Number.isFinite(mv) ? mv : DEFAULT_RATES[p.id].masterVisa,
        eloAmex: Number.isFinite(ea) ? ea : DEFAULT_RATES[p.id].eloAmex
      };
    });
    return { rates: rates, valid: valid };
  }

  function paintUpdated(updatedAt) {
    const el = document.getElementById("cartao-taxas-updated");
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

  function passSwitchHtml(productId, passFee) {
    const on = passFee !== false;
    return (
      '<label class="moura-switch">' +
        '<input type="checkbox" id="cartao-taxas-pass-' + productId + '"' + (on ? ' checked' : '') + '>' +
        '<span class="moura-switch-track" aria-hidden="true"></span>' +
        '<span class="moura-switch-text">Repassar para cliente</span>' +
      '</label>'
    );
  }

  function collectPassFeesFromToggles() {
    const map = defaultPassFees();
    PRODUCTS.forEach(function (p) {
      const input = document.getElementById("cartao-taxas-pass-" + p.id);
      if (input) map[p.id] = !!input.checked;
    });
    return map;
  }

  window.renderCardFeesTab = function (cfg) {
    const body = document.getElementById("cartao-taxas-table-body");
    if (!body) return;
    const data = cfg || window.loadCardFeesConfig();
    const passMap = data.passFeeByProduct || normalizePassFees(data);
    body.innerHTML = PRODUCTS.map(function (p, idx) {
      const row = data.rates[p.id] || DEFAULT_RATES[p.id];
      const zebra = idx % 2 === 0 ? " is-alt" : "";
      return (
        '<tr class="' + zebra + '">' +
          '<td>' +
            '<div class="cartao-prod">' +
              '<i data-lucide="' + p.icon + '"></i>' +
              '<div><strong>' + p.label + '</strong><span>' + p.hint + '</span></div>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<label class="cartao-rate-field">' +
              '<input type="text" inputmode="decimal" id="cartao-taxa-' + p.id + '-mv" value="' + formatPct(row.masterVisa) + '">' +
              '<span>%</span>' +
            '</label>' +
          '</td>' +
          '<td>' +
            '<label class="cartao-rate-field">' +
              '<input type="text" inputmode="decimal" id="cartao-taxa-' + p.id + '-ea" value="' + formatPct(row.eloAmex) + '">' +
              '<span>%</span>' +
            '</label>' +
          '</td>' +
          '<td>' + passSwitchHtml(p.id, passMap[p.id] !== false) + '</td>' +
        '</tr>'
      );
    }).join("");
    paintUpdated(data.updatedAt);
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  };

  window.saveCardFeesConfig = async function () {
    if (typeof window.hasFinCrAction === "function" && !window.hasFinCrAction("regras_cobranca", "editar")) {
      alert("Sem permissão para editar as taxas de cartão.");
      return;
    }
    const collected = collectRatesFromInputs();
    if (!collected.valid) {
      alert("Informe taxas válidas entre 0 e 100, no formato 1,30.");
      return;
    }
    const passFeeByProduct = collectPassFeesFromToggles();
    const payload = {
      rates: collected.rates,
      passFeeByProduct: passFeeByProduct,
      passFee: PRODUCTS.every(function (p) { return passFeeByProduct[p.id] !== false; }),
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    paintUpdated(payload.updatedAt);
    try {
      if (window.forceUploadLocalConfig) await window.forceUploadLocalConfig(true);
      alert("Taxas de cartão salvas com sucesso.");
    } catch (err) {
      alert("Taxas salvas neste computador, mas a nuvem falhou: " + (err && err.message ? err.message : err));
    }
  };

  window.resetCardFeesToDefault = async function () {
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Restaurar as taxas padrão da tabela e o repasse de cada faixa? As alterações não salvas serão perdidas.")
      : window.confirm("Restaurar as taxas padrão?");
    if (!ok) return;
    window.renderCardFeesTab(cloneDefaults());
  };
})();
