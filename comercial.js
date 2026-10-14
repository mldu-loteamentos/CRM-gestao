// comercial.js - Dashboard Comercial (Vendas e Distratos)

const COM_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COM_MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const ComercialApp = {
  state: {
    loading: false,
    loaded: false,
    rawMonths: [],
    year: 0,
    months: [],
    selectedProduct: '',
    sortKey: 'var',
    sortDir: 'desc',
    updatedAt: null,
    charts: {},
    aba: 'resumo',
    velEmp: '',
    velEmpOpen: false,
    velEmpQuery: '',
    velUnidadeIds: null,
    velVendaIds: null,
    velAberto: {},
    velCache: {},
    velGen: 0
  },

  todayParts() {
    const today = new Date();
    return { yNow: today.getFullYear(), mNow: today.getMonth() + 1 };
  },

  availableMonths(year) {
    const { yNow, mNow } = this.todayParts();
    const last = year === yNow ? mNow : 12;
    const out = [];
    for (let m = 1; m <= last; m++) out.push(m);
    return out;
  },

  normalizeMonths(year, months) {
    const allowed = this.availableMonths(year);
    const allow = new Set(allowed);
    const next = (months || []).map((n) => parseInt(n, 10)).filter((m) => allow.has(m));
    const unique = [...new Set(next)].sort((a, b) => a - b);
    if (unique.length) return unique;
    const { yNow, mNow } = this.todayParts();
    return [year === yNow ? mNow : allowed[allowed.length - 1]];
  },

  currentPeriod() {
    const { yNow, mNow } = this.todayParts();
    const yEl = document.getElementById('comercial-year');
    const year = yEl && yEl.value ? parseInt(yEl.value, 10) : (this.state.year || yNow);
    const months = this.normalizeMonths(year, this.state.months.length ? this.state.months : [mNow]);
    return { year, months, maxMonth: months[months.length - 1] };
  },

  periodLabel(months) {
    const list = (months || []).slice().sort((a, b) => a - b);
    if (!list.length) return 'Período';
    if (list.length === 1) return COM_MESES[list[0] - 1];
    if (list.length <= 3) return list.map((m) => COM_MESES[m - 1]).join(', ');
    return `${list.length} meses`;
  },

  ytdLabel(maxMonth) {
    return maxMonth === 1 ? 'jan' : `jan–${COM_MESES[maxMonth - 1]}`;
  },

  fillFilters() {
    const { yNow, mNow } = this.todayParts();
    const yEl = document.getElementById('comercial-year');
    if (yEl && !yEl.options.length) {
      for (let y = yNow; y >= yNow - 3; y--) {
        yEl.appendChild(new Option(String(y), String(y)));
      }
      yEl.value = String(yNow);
    }
    if (!this.state.months.length) this.state.months = [mNow];
    const year = yEl && yEl.value ? parseInt(yEl.value, 10) : yNow;
    this.state.year = year;
    this.state.months = this.normalizeMonths(year, this.state.months);
    this.renderMonthFilter();
  },

  monthListHtml() {
    const { year, months } = this.currentPeriod();
    const selected = new Set(months);
    const allowed = new Set(this.availableMonths(year));
    return COM_MESES.map((short, i) => {
      const m = i + 1;
      const on = selected.has(m);
      const ok = allowed.has(m);
      return `<button type="button" class="com-month-sq${on ? ' is-on' : ''}${ok ? '' : ' is-off'}" ${ok ? '' : 'disabled'} onclick="ComercialApp.toggleMonth(${m}, ${on ? 'false' : 'true'})" title="${COM_MESES_FULL[i]} ${year}">${short}</button>`;
    }).join('');
  },

  renderMonthFilter() {
    const list = document.getElementById('comercial-month-list');
    if (list) list.innerHTML = this.monthListHtml();
  },

  applyMonths(months) {
    const { year } = this.currentPeriod();
    this.state.months = this.normalizeMonths(year, months);
    this.renderMonthFilter();
    this.onFilterChange();
  },

  toggleMonth(month, on) {
    const { months } = this.currentPeriod();
    const next = on ? [...months, month] : months.filter((m) => m !== month);
    this.applyMonths(next);
  },

  selectAllMonths() {
    const { year } = this.currentPeriod();
    this.applyMonths(this.availableMonths(year));
  },

  selectNoneMonths() {
    const { yNow, mNow } = this.todayParts();
    const { year } = this.currentPeriod();
    this.applyMonths([year === yNow ? mNow : 1]);
  },

  onYearChange() {
    const yEl = document.getElementById('comercial-year');
    const year = yEl && yEl.value ? parseInt(yEl.value, 10) : this.todayParts().yNow;
    this.state.year = year;
    this.state.months = this.normalizeMonths(year, this.state.months);
    this.renderMonthFilter();
    this.onFilterChange();
  },

  init() {
    this.fillFilters();
    if (this.state.loaded && !this.state.loading) {
      this.updateDashboardUI();
      return;
    }
    if (!this.state.loading) this.fetchData();
  },

  onFilterChange() {
    if (this.state.loaded && this.hasCachedPeriod()) {
      this.updateDashboardUI();
      return;
    }
    this.fetchData();
  },

  hasCachedPeriod() {
    const { year, maxMonth } = this.currentPeriod();
    const need = [];
    for (let y = year - 1; y <= year; y++) {
      const last = y === year ? maxMonth : 12;
      for (let m = 1; m <= last; m++) need.push(`${y}-${m}`);
    }
    const have = new Set((this.state.rawMonths || []).map((r) => `${r.year}-${r.month}`));
    return need.every((k) => have.has(k));
  },

  setLoading(on) {
    const load = document.getElementById('comercial-loading');
    const content = document.getElementById('comercial-dashboard-content');
    const btn = document.getElementById('comercial-btn-search');
    if (load) load.style.display = on && !this.state.loaded && this.state.aba !== 'velocidade' ? 'flex' : 'none';
    if (content && this.state.loaded && this.state.aba !== 'velocidade') content.style.display = 'block';
    if (on) this.setLoadProgress(4);
    else this.stopLoadTicker();
    if (btn) {
      btn.disabled = !!on;
      btn.innerHTML = on
        ? '<i data-lucide="loader" class="spin" style="width:15px;"></i> Atualizando'
        : '<i data-lucide="refresh-cw" style="width:15px;"></i> Atualizar';
      if (window.lucide) window.lucide.createIcons();
    }
  },

  setLoadProgress(pct) {
    const bar = document.getElementById('comercial-load-bar');
    if (!bar) return;
    const w = Math.max(2, Math.min(100, Number(pct) || 0));
    bar.style.width = w + '%';
  },

  startLoadTicker() {
    this.stopLoadTicker();
    let pct = 4;
    this._loadCap = Math.max(this._loadCap || 8, 8);
    this.setLoadProgress(pct);
    this._loadTicker = setInterval(() => {
      const cap = this._loadCap || 8;
      if (pct >= cap) return;
      pct = Math.min(cap, pct + Math.max(0.35, (cap - pct) * 0.08));
      this.setLoadProgress(pct);
    }, 280);
  },

  stopLoadTicker() {
    if (this._loadTicker) clearInterval(this._loadTicker);
    this._loadTicker = null;
  },

  async fetchData(force) {
    if (this.state.loading) return;
    this.fillFilters();
    const { year, maxMonth } = this.currentPeriod();
    if (!force && this.state.loaded && this.hasCachedPeriod()) {
      this.updateDashboardUI();
      return;
    }

    this.state.loading = true;
    this._loadCap = 8;
    this.setLoading(true);
    this.startLoadTicker();

    try {
      const monthsNeeded = [];
      for (let y = year - 1; y <= year; y++) {
        const last = y === year ? maxMonth : 12;
        for (let m = 1; m <= last; m++) monthsNeeded.push({ year: y, month: m });
      }
      const have = new Set((this.state.rawMonths || []).map((r) => `${r.year}-${r.month}`));
      const monthsToFetch = force ? monthsNeeded : monthsNeeded.filter((m) => !have.has(`${m.year}-${m.month}`));

      const fetchAllPages = async (baseUrl) => {
        let allResults = [];
        let offset = 0;
        const limit = 200;
        let hasMore = true;
        while (hasMore) {
          const url = `${baseUrl}&limit=${limit}&offset=${offset}`;
          const res = await siengeFetchWithRetry(url).catch(() => ({ results: [] }));
          const results = res.results || [];
          allResults = allResults.concat(results);
          if (results.length < limit) hasMore = false;
          else offset += limit;
        }
        return allResults;
      };

      const totalMeses = Math.max(monthsToFetch.length, 1);
      let mesesProntos = 0;
      const results = await Promise.all(monthsToFetch.map(async (m) => {
        try {
          const firstDay = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
          const lastDayObj = new Date(m.year, m.month, 0);
          const lastDay = `${m.year}-${String(m.month).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
          const [vAtivas, vCanceladas, vQuitadas, distratos] = await Promise.all([
            fetchAllPages(`/sales-contracts?situation=2&initialIssueDate=${firstDay}&finalIssueDate=${lastDay}`),
            fetchAllPages(`/sales-contracts?situation=3&initialIssueDate=${firstDay}&finalIssueDate=${lastDay}`),
            fetchAllPages(`/sales-contracts?situation=4&initialIssueDate=${firstDay}&finalIssueDate=${lastDay}`),
            fetchAllPages(`/sales-contracts?situation=3&initialCancelDate=${firstDay}&finalCancelDate=${lastDay}`)
          ]);
          const seen = new Set();
          const vendas = [];
          vAtivas.concat(vCanceladas).concat(vQuitadas).forEach((c) => {
            const id = String(c && c.id != null ? c.id : '');
            if (!id || seen.has(id)) return;
            seen.add(id);
            vendas.push(c);
          });
          return { year: m.year, month: m.month, vendas, distratos };
        } finally {
          mesesProntos += 1;
          this._loadCap = Math.min(96, 8 + (mesesProntos / totalMeses) * 88);
        }
      }));

      const byKey = new Map((force ? [] : (this.state.rawMonths || [])).map((r) => [`${r.year}-${r.month}`, r]));
      results.forEach((r) => byKey.set(`${r.year}-${r.month}`, r));
      this.state.rawMonths = [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month);
      this.state.loaded = true;
      this.state.updatedAt = new Date();
      this.stopLoadTicker();
      this.setLoadProgress(100);
      this.updateDashboardUI();
    } catch (e) {
      console.error('[ComercialApp] Erro ao buscar dados do dashboard', e);
      alert('Falha ao buscar os dados no Sienge.');
    } finally {
      this.state.loading = false;
      this.setLoading(false);
    }
  },

  contractQty(contract) {
    const units = (contract && (contract.salesContractUnits || contract.units)) || [];
    return units.length > 0 ? units.length : 1;
  },

  contractArea(contract) {
    const units = contract.salesContractUnits || contract.units || [];
    let sum = 0;
    units.forEach((u) => {
      sum += Number(u.privateArea || u.indexedPrivateArea || u.totalArea || u.area || 0);
    });
    if (sum) return sum;
    return Number(contract.totalArea || contract.privateArea || contract.indexedPrivateArea || 0) || 0;
  },

  resolveEnterprise(contract) {
    const units = (contract && (contract.salesContractUnits || contract.units)) || [];
    const firstUnit = units[0] || {};
    const unitId = String(contract.unitId || firstUnit.id || firstUnit.unitId || '');
    const enterpriseId = String(
      contract.enterpriseId || contract.costCenterId || firstUnit.enterpriseId || firstUnit.costCenterId
      || (unitId.includes('-') ? unitId.split('-')[0] : '')
    );
    let name = enterpriseId || 'N/D';
    if (window.AppState && window.AppState.cachedCostCenters) {
      const cc = window.AppState.cachedCostCenters.find((c) =>
        String(c.id) === enterpriseId || String(c.id) === String(contract.costCenterId)
      );
      if (cc && cc.name) name = cc.name;
    }
    if (firstUnit.enterpriseName) name = firstUnit.enterpriseName;
    if (contract.enterpriseName) name = contract.enterpriseName;
    return { enterpriseId: String(enterpriseId || name), name: String(name).toUpperCase() };
  },

  cityFromName(name) {
    const raw = String(name || '');
    if (raw.includes(' - ')) return raw.split(' - ')[0].trim().toUpperCase();
    return raw.trim().toUpperCase() || 'OUTROS';
  },

  aggregate() {
    const { year, months, maxMonth } = this.currentPeriod();
    const selected = new Set(months);
    const produtos = {};
    const cidades = {};
    const chartSlots = new Map();
    const selectedProd = this.state.selectedProduct || '';
    let vendasPeriodo = 0;
    let distratosPeriodo = 0;
    let vendasPeriodoAnt = 0;
    let distratosPeriodoAnt = 0;
    let vendasAno = 0;
    let distratosAno = 0;
    let vendasAnoAnt = 0;
    let distratosAnoAnt = 0;
    let m2Venda = 0;
    let m2Dist = 0;

    (this.state.rawMonths || []).forEach((res) => {
      const inPeriod = res.year === year && selected.has(res.month);
      const inPeriodPrev = res.year === year - 1 && selected.has(res.month);
      const inYear = res.year === year && res.month <= maxMonth;
      const inPrev = res.year === year - 1 && res.month <= maxMonth;
      const inChart = (res.year === year - 1 && res.month >= 1) || (res.year === year && res.month <= maxMonth);

      let vMes = 0;
      let dMes = 0;
      const mesProdutos = {};
      const bumpMes = (name, field, qty, enterpriseId) => {
        if (!mesProdutos[name]) mesProdutos[name] = { id: enterpriseId || '', vendas: 0, distratos: 0 };
        if (enterpriseId && !mesProdutos[name].id) mesProdutos[name].id = enterpriseId;
        mesProdutos[name][field] += qty;
      };
      const ensureProduto = (name, enterpriseId) => {
        if (!produtos[name]) produtos[name] = { id: enterpriseId || '', vendas: 0, distratos: 0, vendasYtd: 0, distratosYtd: 0 };
        if (enterpriseId && !produtos[name].id) produtos[name].id = enterpriseId;
      };

      res.vendas.forEach((v) => {
        const qty = this.contractQty(v);
        const area = this.contractArea(v);
        const { name, enterpriseId } = this.resolveEnterprise(v);
        if (inChart) {
          bumpMes(name, 'vendas', qty, enterpriseId);
          if (!selectedProd || selectedProd === name) vMes += qty;
        }
        if (inPeriod || inYear) {
          ensureProduto(name, enterpriseId);
        }
        if (inPeriod) {
          vendasPeriodo += qty;
          m2Venda += area;
          produtos[name].vendas += qty;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].vendas += qty;
        }
        if (inYear) {
          vendasAno += qty;
          produtos[name].vendasYtd += qty;
        }
        if (inPeriodPrev) vendasPeriodoAnt += qty;
        if (inPrev) vendasAnoAnt += qty;
      });

      res.distratos.forEach((d) => {
        const qty = this.contractQty(d);
        const area = this.contractArea(d);
        const { name, enterpriseId } = this.resolveEnterprise(d);
        if (inChart) {
          bumpMes(name, 'distratos', qty, enterpriseId);
          if (!selectedProd || selectedProd === name) dMes += qty;
        }
        if (inPeriod || inYear) {
          ensureProduto(name, enterpriseId);
        }
        if (inPeriod) {
          distratosPeriodo += qty;
          m2Dist += area;
          produtos[name].distratos += qty;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].distratos += qty;
        }
        if (inYear) {
          distratosAno += qty;
          produtos[name].distratosYtd += qty;
        }
        if (inPeriodPrev) distratosPeriodoAnt += qty;
        if (inPrev) distratosAnoAnt += qty;
      });

      if (inChart) {
        chartSlots.set(res.year + '-' + res.month, {
          year: res.year,
          month: res.month,
          label: `${COM_MESES[res.month - 1]}/${String(res.year).slice(2)}`,
          vendas: vMes,
          distratos: dMes,
          variacao: vMes - dMes,
          produtos: mesProdutos
        });
      }
    });

    const serie = [];
    const emptySlot = (y, m) => ({
      year: y,
      month: m,
      label: `${COM_MESES[m - 1]}/${String(y).slice(2)}`,
      vendas: 0,
      distratos: 0,
      variacao: 0,
      produtos: {}
    });
    for (let m = 1; m <= 12; m++) serie.push(chartSlots.get((year - 1) + '-' + m) || emptySlot(year - 1, m));
    for (let m = 1; m <= maxMonth; m++) serie.push(chartSlots.get(year + '-' + m) || emptySlot(year, m));

    return {
      year, months, maxMonth, produtos, cidades, serie,
      vendasPeriodo, distratosPeriodo, vendasPeriodoAnt, distratosPeriodoAnt,
      vendasAno, distratosAno, vendasAnoAnt, distratosAnoAnt,
      m2Venda, m2Dist
    };
  },

  fmtInt(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString('pt-BR');
  },

  fmtPct(val, prev, invert) {
    const diff = val - prev;
    const percent = prev > 0 ? ((diff / prev) * 100).toFixed(1).replace('.', ',') : (diff > 0 ? '100,0' : '0,0');
    const better = invert ? diff < 0 : diff > 0;
    const color = diff === 0 ? '#f37021' : (better ? 'var(--color-success)' : 'var(--color-danger)');
    const sign = diff > 0 ? '+' : '';
    return `<span style="color:${color};font-weight:700;">${sign}${percent}%</span> vs ano ant. (${this.fmtInt(prev)})`;
  },

  prodLabel(id, name) {
    const code = String(id || '').trim();
    const label = String(name || '').trim();
    if (code && label && this.foldCode(code) !== this.foldCode(label)) return code + ' | ' + label;
    return label || code || '—';
  },

  foldCode(s) {
    return String(s || '').replace(/\s+/g, '').toUpperCase();
  },

  prodLabelHtml(id, name) {
    const code = String(id || '').trim();
    const label = String(name || '').trim();
    if (code && label && this.foldCode(code) !== this.foldCode(label)) {
      return `<span class="com-prod-id">${this.esc(code)}</span><span class="com-prod-sep"> | </span>${this.esc(label)}`;
    }
    return this.esc(label || code || '—');
  },

  fmtM2(n) {
    if (!n) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  destroyCharts() {
    Object.keys(this.state.charts || {}).forEach((k) => {
      try { this.state.charts[k].destroy(); } catch (e) {}
    });
    this.state.charts = {};
  },

  chartBarLabelsPlugin() {
    return {
      id: 'comBarValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta || meta.hidden || ds.type === 'line') return;
          meta.data.forEach((bar, i) => {
            const val = ds.data[i];
            if (val == null || val === '') return;
            const color = ds.datalabelColor || '#0f172a';
            ctx.save();
            ctx.font = '700 11px Inter, system-ui, sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = val >= 0 ? 'bottom' : 'top';
            const text = Number.isFinite(Number(val))
              ? Math.round(Number(val)).toLocaleString('pt-BR')
              : String(val);
            ctx.fillText(text, bar.x, val >= 0 ? bar.y - 4 : bar.y + 12);
            ctx.restore();
          });
        });
      }
    };
  },

  chartYearAxisPlugin(serie) {
    return {
      id: 'comYearAxis',
      afterDraw(chart) {
        const rows = serie || [];
        if (!rows.length) return;
        const xScale = chart.scales.x;
        if (!xScale) return;
        const groups = {};
        rows.forEach((s, i) => {
          if (!groups[s.year]) groups[s.year] = { min: i, max: i };
          groups[s.year].max = i;
        });
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.fillStyle = '#334155';
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        Object.keys(groups).forEach((year) => {
          const g = groups[year];
          const left = xScale.getPixelForValue(g.min);
          const right = xScale.getPixelForValue(g.max);
          ctx.fillText(String(year), (left + right) / 2, chartArea.bottom + 22);
        });
        ctx.restore();
      }
    };
  },

  renderCharts(agg) {
    if (typeof Chart === 'undefined') return;
    this.destroyCharts();

    const serie = agg.serie || [];
    const labels = serie.map((s) => COM_MESES[s.month - 1]);
    const vars = serie.map((s) => s.variacao);
    const vendaColor = '#1e3a8a';
    const distColor = '#ef4444';
    const varColor = '#15803d';
    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      clip: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18, bottom: 28 } },
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 16, color: '#334155' }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: false, color: '#64748b', font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grace: '18%',
          display: false
        }
      }
    };
    const vd = document.getElementById('comercial-chart-vd');
    const vr = document.getElementById('comercial-chart-var');
    if (vd) {
      this.state.charts.vd = new Chart(vd, {
        type: 'bar',
        plugins: [this.chartBarLabelsPlugin(), this.chartYearAxisPlugin(serie)],
        data: {
          labels,
          datasets: [
            {
              label: 'Vendas',
              data: serie.map((s) => s.vendas),
              backgroundColor: vendaColor,
              borderRadius: 0,
              borderSkipped: false,
              maxBarThickness: 34,
              datalabelColor: vendaColor
            },
            {
              label: 'Distratos',
              data: serie.map((s) => s.distratos),
              backgroundColor: distColor,
              borderRadius: 0,
              borderSkipped: false,
              maxBarThickness: 34,
              datalabelColor: distColor
            }
          ]
        },
        options: Object.assign({}, chartOpts, {
          datasets: { bar: { categoryPercentage: 0.72, barPercentage: 0.86 } },
          plugins: Object.assign({}, chartOpts.plugins, {
            tooltip: {
              enabled: false,
              external: (ctx) => this.paintMonthTip(ctx, serie, 'vd')
            }
          })
        })
      });
    }
    if (vr) {
      this.state.charts.vr = new Chart(vr, {
        type: 'bar',
        plugins: [this.chartBarLabelsPlugin(), this.chartYearAxisPlugin(serie)],
        data: {
          labels,
          datasets: [{
            label: 'Variação',
            data: vars,
            backgroundColor: varColor,
            borderRadius: 0,
            borderSkipped: false,
            maxBarThickness: 42,
            datalabelColor: varColor
          }]
        },
        options: Object.assign({}, chartOpts, {
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: (ctx) => this.paintMonthTip(ctx, serie, 'var')
            }
          }
        })
      });
    }
    const filterEl = document.getElementById('comercial-chart-filter');
    if (filterEl) {
      filterEl.innerHTML = this.state.selectedProduct
        ? `<span class="com-chart-chip">${this.esc(this.state.selectedProduct)} <button type="button" onclick="ComercialApp.selectProduct('')" title="Limpar filtro">×</button></span>`
        : '';
    }
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  paintMonthTip(context, serie, kind) {
    const isVar = kind === 'var';
    const tip = document.getElementById(isVar ? 'comercial-chart-var-tip' : 'comercial-chart-tip');
    const other = document.getElementById(isVar ? 'comercial-chart-tip' : 'comercial-chart-var-tip');
    if (!tip) return;
    const tooltip = context && context.tooltip;
    if (!tooltip || !tooltip.opacity || !tooltip.dataPoints || !tooltip.dataPoints.length) {
      tip.hidden = true;
      return;
    }
    if (other) other.hidden = true;
    const idx = tooltip.dataPoints[0].dataIndex;
    const point = (serie || [])[idx];
    if (!point) { tip.hidden = true; return; }
    const rows = Object.keys(point.produtos || {}).map((name) => {
      const d = point.produtos[name];
      return { name, id: d.id || '', v: d.vendas || 0, d: d.distratos || 0, var: (d.vendas || 0) - (d.distratos || 0) };
    }).filter((r) => r.v || r.d).sort((a, b) => (b.v - b.d) - (a.v - a.d));
    const top = rows.slice(0, 8);
    const extra = rows.length - top.length;
    const mesNome = COM_MESES_FULL[point.month - 1] + ' ' + point.year;
    const varCls = point.variacao > 0 ? 'com-tip-pos' : (point.variacao < 0 ? 'com-tip-neg' : 'com-tip-zero');
    tip.innerHTML = isVar ? `
      <div class="com-chart-tip-head">
        <strong>${this.esc(mesNome)}</strong>
        <span>variação <em class="${varCls}">${this.fmtInt(point.variacao)}</em></span>
      </div>
      ${top.length ? `<table>
        <thead><tr><th>Empreendimento</th><th>Variação</th></tr></thead>
        <tbody>
          ${top.map((r) => `<tr>
            <td>${this.esc(this.prodLabel(r.id, r.name))}</td>
            <td class="${r.var > 0 ? 'com-tip-pos' : (r.var < 0 ? 'com-tip-neg' : 'com-tip-zero')}">${this.fmtInt(r.var)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div class="com-chart-tip-empty">Sem movimento neste mês</div>'}
      ${extra > 0 ? `<div class="com-chart-tip-more">+ ${this.fmtInt(extra)} empreendimento(s)</div>` : ''}
    ` : `
      <div class="com-chart-tip-head">
        <strong>${this.esc(mesNome)}</strong>
        <span><em class="com-tip-v">${this.fmtInt(point.vendas)}</em> vendas · <em class="com-tip-d">${this.fmtInt(point.distratos)}</em> distratos · saldo ${this.fmtInt(point.variacao)}</span>
      </div>
      ${top.length ? `<table>
        <thead><tr><th>Empreendimento</th><th>Vendas</th><th>Distratos</th><th>Saldo</th></tr></thead>
        <tbody>
          ${top.map((r) => `<tr>
            <td>${this.esc(this.prodLabel(r.id, r.name))}</td>
            <td class="com-tip-v">${this.fmtInt(r.v)}</td>
            <td class="com-tip-d">${this.fmtInt(r.d)}</td>
            <td class="${r.var > 0 ? 'com-tip-pos' : (r.var < 0 ? 'com-tip-neg' : 'com-tip-zero')}">${this.fmtInt(r.var)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div class="com-chart-tip-empty">Sem movimento neste mês</div>'}
      ${extra > 0 ? `<div class="com-chart-tip-more">+ ${this.fmtInt(extra)} empreendimento(s)</div>` : ''}
    `;
    const box = tip.parentElement;
    const caretX = tooltip.caretX || 0;
    const caretY = tooltip.caretY || 0;
    tip.hidden = false;
    const tw = tip.offsetWidth || 280;
    const th = tip.offsetHeight || 120;
    const maxW = box ? box.clientWidth : 400;
    const maxH = box ? box.clientHeight : 380;
    tip.style.left = Math.max(8, Math.min(caretX + 14, maxW - tw - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(caretY - 10, maxH - th - 8)) + 'px';
  },

  fmtRel(vendas, distratos) {
    const rel = distratos > 0 ? (vendas / distratos) : vendas;
    return rel.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },

  updateDashboardUI() {
    const agg = this.aggregate();
    const monthsCount = Math.max(1, agg.maxMonth);
    const saldo = agg.vendasPeriodo - agg.distratosPeriodo;
    const saldoAnt = agg.vendasPeriodoAnt - agg.distratosPeriodoAnt;
    const saldoYtd = agg.vendasAno - agg.distratosAno;
    const saldoYtdAnt = agg.vendasAnoAnt - agg.distratosAnoAnt;
    const periodLbl = this.periodLabel(agg.months);
    const ytdLbl = this.ytdLabel(agg.maxMonth);

    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    ['kpi-vendas-period-lbl', 'kpi-distratos-period-lbl', 'kpi-variacao-period-lbl']
      .forEach((id) => set(id, periodLbl));
    ['kpi-vendas-ytd-lbl', 'kpi-distratos-ytd-lbl', 'kpi-variacao-ytd-lbl']
      .forEach((id) => set(id, `Acum. ${ytdLbl}`));

    set('kpi-vendas', this.fmtInt(agg.vendasPeriodo));
    set('kpi-vendas-comp', this.fmtPct(agg.vendasPeriodo, agg.vendasPeriodoAnt, false));
    set('kpi-vendas-ytd', this.fmtInt(agg.vendasAno));
    set('kpi-vendas-ytd-comp', this.fmtPct(agg.vendasAno, agg.vendasAnoAnt, false));
    set('kpi-vendas-avg', `média mensal ${agg.year}: ${this.fmtInt(Math.round(agg.vendasAno / monthsCount))}`);
    set('kpi-distratos', this.fmtInt(agg.distratosPeriodo));
    set('kpi-distratos-comp', this.fmtPct(agg.distratosPeriodo, agg.distratosPeriodoAnt, true));
    set('kpi-distratos-ytd', this.fmtInt(agg.distratosAno));
    set('kpi-distratos-ytd-comp', this.fmtPct(agg.distratosAno, agg.distratosAnoAnt, true));
    set('kpi-distratos-avg', `média mensal ${agg.year}: ${this.fmtInt(Math.round(agg.distratosAno / monthsCount))}`);
    set('kpi-variacao', this.fmtInt(saldo));
    set('kpi-variacao-comp', this.fmtPct(saldo, saldoAnt, false));
    set('kpi-variacao-ytd', this.fmtInt(saldoYtd));
    set('kpi-variacao-ytd-comp', this.fmtPct(saldoYtd, saldoYtdAnt, false));

    set('comercial-produto-period', periodLbl + ' · ' + agg.year + '  ·  acum. ' + ytdLbl);
    this.renderProdutoTable(agg);

    const upd = document.getElementById('comercial-updated');
    if (upd && this.state.updatedAt) {
      upd.textContent = 'atualizado ' + this.state.updatedAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    const content = document.getElementById('comercial-dashboard-content');
    if (content) content.style.display = this.state.aba === 'velocidade' ? 'none' : 'block';
    if (this.state.aba === 'velocidade') this.renderVelocidade();
    else this.renderCharts(agg);
    if (window.lucide) window.lucide.createIcons();
  },

  sortValue(row, key) {
    if (key === 'name') {
      const id = Number(String(row.id || '').replace(/\D/g, ''));
      if (Number.isFinite(id) && id > 0) return id;
      return row.name;
    }
    if (key === 'vendas') return row.v;
    if (key === 'distratos') return row.d;
    if (key === 'var') return row.v - row.d;
    if (key === 'vendasYtd') return row.vy;
    if (key === 'distratosYtd') return row.dy;
    if (key === 'varYtd') return row.vy - row.dy;
    return row.v - row.d;
  },

  sortProdutos(key) {
    if (this.state.sortKey === key) {
      this.state.sortDir = this.state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.state.sortKey = key;
      this.state.sortDir = key === 'name' ? 'asc' : 'desc';
    }
    if (this.state.loaded) this.renderProdutoTable(this.aggregate());
  },

  selectProduct(name) {
    const next = String(name || '');
    this.state.selectedProduct = this.state.selectedProduct === next ? '' : next;
    if (this.state.loaded) this.updateDashboardUI();
  },

  thSort(key, label, cls, rowspan) {
    const on = this.state.sortKey === key;
    const dir = on ? (this.state.sortDir === 'asc' ? ' is-asc' : ' is-desc') : '';
    return `<th ${rowspan ? 'rowspan="2"' : ''} class="${cls} com-th-sort${on ? ' is-sorted' : ''}${dir}" onclick="ComercialApp.sortProdutos('${key}')" title="Ordenar por ${label}"><span class="com-th-label">${label}</span><i data-lucide="chevrons-up-down" class="com-sort-ico" style="width:11px;height:11px;vertical-align:middle;"></i></th>`;
  },

  renderProdutoTable(agg) {
    const thead = document.getElementById('comercial-table-head');
    const tbody = document.getElementById('comercial-table-body');
    if (thead) {
      thead.innerHTML = `
        <tr>
          ${this.thSort('name', 'Produto', 'com-th-prod', true)}
          <th colspan="3" class="com-th-mensal">Mensal (período selecionado)</th>
          <th colspan="3" class="com-th-acum">Acumulado</th>
        </tr>
        <tr>
          ${this.thSort('vendas', 'Vendas', 'com-th-venda')}
          ${this.thSort('distratos', 'Distrato', 'com-th-dist')}
          ${this.thSort('var', 'Variação', 'com-th-var')}
          ${this.thSort('vendasYtd', 'Vendas', 'com-th-venda com-th-acum-col')}
          ${this.thSort('distratosYtd', 'Distrato', 'com-th-dist com-th-acum-col')}
          ${this.thSort('varYtd', 'Variação', 'com-th-var com-th-acum-col')}
        </tr>`;
    }
    if (!tbody) return;
    const rows = Object.keys(agg.produtos || {}).map((name) => {
      const d = agg.produtos[name];
      return {
        name,
        id: d.id || '',
        v: d.vendas || 0,
        d: d.distratos || 0,
        vy: d.vendasYtd || 0,
        dy: d.distratosYtd || 0
      };
    });
    const dir = this.state.sortDir === 'asc' ? 1 : -1;
    const key = this.state.sortKey || 'var';
    rows.sort((a, b) => {
      const va = this.sortValue(a, key);
      const vb = this.sortValue(b, key);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'pt-BR') * dir;
      }
      return (va - vb) * dir;
    });
    const num = (n, kind) => {
      const cls = kind === 'venda' ? 'com-num com-num--venda'
        : kind === 'distrato' ? 'com-num com-num--distrato'
        : (n > 0 ? 'com-num com-num--var' : (n < 0 ? 'com-num com-num--var-neg' : 'com-num com-num--var-zero'));
      return `<td class="${cls}">${this.fmtInt(n)}</td>`;
    };
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Nenhum dado no período.</td></tr>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    let totV = 0, totD = 0, totVY = 0, totDY = 0;
    const selected = this.state.selectedProduct || '';
    tbody.innerHTML = rows.map((r, i) => {
      totV += r.v;
      totD += r.d;
      totVY += r.vy;
      totDY += r.dy;
      const on = selected === r.name;
      return `<tr class="com-prod-row${i % 2 ? ' is-alt' : ''}${on ? ' is-selected' : ''}" onclick="ComercialApp.selectProduct(${JSON.stringify(r.name)})">
        <td class="com-prod-name" title="${this.esc(this.prodLabel(r.id, r.name))}">${this.prodLabelHtml(r.id, r.name)}</td>
        ${num(r.v, 'venda')}${num(r.d, 'distrato')}${num(r.v - r.d, 'var')}
        ${num(r.vy, 'venda')}${num(r.dy, 'distrato')}${num(r.vy - r.dy, 'var')}
      </tr>`;
    }).join('') + `<tr class="com-dash-total">
        <td class="com-prod-name">Total</td>
        ${num(totV, 'venda')}${num(totD, 'distrato')}${num(totV - totD, 'var')}
        ${num(totVY, 'venda')}${num(totDY, 'distrato')}${num(totVY - totDY, 'var')}
      </tr>`;
    if (window.lucide) window.lucide.createIcons();
  },

  setAba(id) {
    this.state.aba = id === 'velocidade' ? 'velocidade' : 'resumo';
    document.querySelectorAll('#comercial-abas .ml-tab').forEach((btn, i) => {
      const on = (i === 0 && this.state.aba === 'resumo') || (i === 1 && this.state.aba === 'velocidade');
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const resumo = document.getElementById('comercial-dashboard-content');
    const vel = document.getElementById('comercial-velocidade');
    const head = document.querySelector('#tab-dashboard-comercial .com-dash-head');
    const load = document.getElementById('comercial-loading');
    const naVel = this.state.aba === 'velocidade';
    if (head) head.hidden = naVel;
    if (load) load.style.display = !naVel && this.state.loading && !this.state.loaded ? 'flex' : 'none';
    if (resumo) resumo.style.display = !naVel && this.state.loaded ? 'block' : 'none';
    if (vel) vel.hidden = !naVel;
    if (naVel) this.abrirVelocidade();
    else if (this.state.loaded) this.renderCharts(this.aggregate());
    if (window.lucide) window.lucide.createIcons();
  },

  abrirVelocidade() {
    this.renderVelocidade();
    if (!this.state.velUnidadeIds) {
      this.carregarIdsUnidade();
      return;
    }
    if (!this.state.velVendaIds) {
      this.carregarIdsVenda();
      return;
    }
    this.aplicarEmpDoResumo();
    this.renderVelocidade();
    if (this.state.velEmp) this.carregarVelocidade(this.state.velEmp);
  },

  aplicarEmpDoResumo() {
    if (this.state.velEmp || !this.state.selectedProduct) return;
    const alvo = String(this.state.selectedProduct).toUpperCase();
    const hit = this.empreendimentosVel().find((e) => e.label.endsWith(alvo) || e.label.indexOf(' - ' + alvo) >= 0);
    if (hit) this.state.velEmp = hit.id;
  },

  setVelEmp(id) {
    this.state.velEmp = String(id || '');
    this.state.velAberto = {};
    this.renderVelocidade();
    if (this.state.velEmp) this.carregarVelocidade(this.state.velEmp);
  },

  bindVelEmp() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind('com-vel-emp', {
      toggleOpen() {
        self.state.velEmpOpen = !self.state.velEmpOpen;
        if (self.state.velEmpOpen) self.state.velEmpQuery = '';
        self.renderVelocidade();
      },
      close() {
        self.state.velEmpOpen = false;
        self.renderVelocidade();
      },
      setQuery(q) {
        self.state.velEmpQuery = q || '';
        self.renderVelocidade();
      },
      toggleId(id, on) {
        if (!on) return;
        self.state.velEmpOpen = false;
        self.state.velEmpQuery = '';
        self.setVelEmp(id);
      }
    });
  },

  async carregarIdsUnidade() {
    if (this._velUnidadeLoading) return;
    if (this.state.velUnidadeIds && this.state.velUnidadeIds.size) return;
    this._velUnidadeLoading = true;
    const ids = new Set();
    const porUnidade = (lista) => {
      (lista || []).forEach((u) => {
        const id = u && (u.enterpriseId || u.costCenterId);
        if (id) ids.add(String(id));
      });
    };
    const E = window.EstoqueComercialApp;
    porUnidade(E && E.state && E.state.units);
    try {
      const raw = JSON.parse(localStorage.getItem('crm_estoque_posicao_v1') || 'null');
      porUnidade(raw && (raw.units || (raw.data && raw.data.units)));
    } catch (e) {}
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDocs) {
      try {
        const snap = await fc.getDocs(fc.collection(window.firebaseDb, 'estoque_comercial'));
        snap.forEach((d) => {
          const data = d.data() || {};
          if (d.id !== '_meta' && data.enterpriseId && Array.isArray(data.units) && data.units.length) ids.add(String(data.enterpriseId));
        });
      } catch (e) {}
    }
    this._velUnidadeLoading = false;
    this.state.velUnidadeIds = ids;
    if (this.state.velEmp && !ids.has(String(this.state.velEmp))) this.state.velEmp = '';
    if (this.state.aba === 'velocidade') this.renderVelocidade();
    this.carregarIdsVenda();
  },

  toggleAnoVel(ano) {
    const y = String(ano);
    this.state.velAberto[y] = !this.state.velAberto[y];
    this.renderVelocidade();
  },

  empreendimentosBase() {
    const E = window.EstoqueComercialApp;
    const ccs = (window.AppState && AppState.cachedCostCenters) || [];
    let custom = {};
    try { custom = JSON.parse(localStorage.getItem('crm_centros_custo_custom') || '{}') || {}; } catch (e) {}
    const tipos = ['Loteamento Aberto', 'Loteamento Fechado', 'Incorporação'];
    const base = ccs.filter((c) => {
      const id = String((c && c.id) || '').trim();
      if (!id || !String(c.name || '').trim()) return false;
      if (!(E && typeof E.isEmpreendimentoCcId === 'function' ? E.isEmpreendimentoCcId(id) : /^[12]/.test(id))) return false;
      return !(E && typeof E.isDeptOnlyCc === 'function' && E.isDeptOnlyCc(c));
    });
    const tipados = base.filter((c) => tipos.includes((custom[c.id] || custom[String(c.id)] || {}).tipo_cc || ''));
    return tipados.length ? tipados : base;
  },

  empreendimentosVel() {
    const unidades = this.state.velUnidadeIds;
    const vendas = this.state.velVendaIds;
    const comUnidade = unidades ? this.empreendimentosBase().filter((c) => unidades.has(String(c.id))) : [];
    const lista = vendas ? comUnidade.filter((c) => vendas.has(String(c.id))) : [];
    return lista.map((c) => ({
      id: String(c.id),
      label: String(c.id) + ' - ' + String(c.name || '').trim().toUpperCase()
    }));
  },

  async temContratoAtivo(id) {
    for (const sit of [2, 4]) {
      const res = await siengeFetchWithRetry('/sales-contracts?enterpriseId=' + encodeURIComponent(id) + '&situation=' + sit + '&limit=1').catch(() => null);
      if (((res && res.results) || []).length) return true;
    }
    return false;
  },

  async carregarIdsVenda() {
    if (this._velVendaLoading || this.state.velVendaIds) return;
    if (!this.state.velUnidadeIds) return;
    this._velVendaLoading = true;
    const candidatos = this.empreendimentosBase().filter((c) => this.state.velUnidadeIds.has(String(c.id))).map((c) => String(c.id));
    const ids = new Set();
    const lote = 4;
    for (let i = 0; i < candidatos.length; i += lote) {
      const fatia = candidatos.slice(i, i + lote);
      const achou = await Promise.all(fatia.map((id) => this.temContratoAtivo(id)));
      fatia.forEach((id, idx) => { if (achou[idx]) ids.add(id); });
    }
    this._velVendaLoading = false;
    this.state.velVendaIds = ids;
    if (this.state.velEmp && !ids.has(String(this.state.velEmp))) this.state.velEmp = '';
    this.aplicarEmpDoResumo();
    if (this.state.aba !== 'velocidade') return;
    this.renderVelocidade();
    if (this.state.velEmp) this.carregarVelocidade(this.state.velEmp);
  },

  async paginarSienge(base) {
    const all = [];
    let offset = 0;
    while (offset < 20000) {
      const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'limit=200&offset=' + offset;
      const res = await siengeFetchWithRetry(url).catch(() => ({ results: [] }));
      const results = (res && res.results) || [];
      all.push.apply(all, results);
      if (results.length < 200) break;
      offset += 200;
    }
    return all;
  },

  foldVel(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  },

  parcelasContrato(c) {
    const conds = Array.isArray(c && c.paymentConditions) ? c.paymentConditions : [];
    let mensal = 0;
    let todas = 0;
    conds.forEach((cond) => {
      const q = Number(cond.installmentsNumber || cond.numberOfInstallments || cond.quantity || cond.installments) || 0;
      if (!(q > 0)) return;
      todas += q;
      const nome = this.foldVel(cond.conditionTypeName || cond.conditionType || cond.description || '');
      if (/SINAL|ENTRADA|\bATO\b|CHAVES|INTERMEDIAR|BALAO|REFORCO/.test(nome) && q <= 4) return;
      mensal += q;
    });
    if (mensal > 0) return mensal;
    if (todas > 0) return todas;
    const n = Number(c && (c.numberOfInstallments || c.installmentsNumber)) || 0;
    return n > 0 ? n : 0;
  },

  ladoCac(id, nome) {
    const code = String(id || '');
    const fold = this.foldVel(nome);
    if (/COMISS|CORRETAG/.test(fold)) return '';
    const dig = code.replace(/\D/g, '');
    if (code === '2.03.05' || code.indexOf('2.03.05.') === 0 || (dig && dig.indexOf('20305') === 0) || fold.indexOf('MARKETING') >= 0) return 'marketing';
    const PF = window.PlanoFinanceiroApp;
    let g = null;
    if (PF && typeof PF.suggestGroup === 'function') g = PF.suggestGroup({ id: code, name: nome || '' });
    if (g === 'g_05_02') return 'marketing';
    if (g === 'g_05_01') return 'comercial';
    return '';
  },

  async carregarVelocidade(empId) {
    const id = String(empId || '');
    if (!id) return;
    const gen = (this.state.velGen += 1);
    const ja = this.state.velCache[id];
    if (ja && ja.pronto) {
      this.renderVelocidade();
      return;
    }
    this.state.velCache[id] = { pronto: false, status: 'Lendo lotes e contratos…', unidades: [], contratos: [] };
    this.renderVelocidade();
    try {
      const unidades = await this.paginarSienge('/units?enterpriseId=' + encodeURIComponent(id) + '&additionalData=NONE');
      if (gen !== this.state.velGen) return;
      const listas = await Promise.all([2, 3, 4].map((s) => this.paginarSienge('/sales-contracts?enterpriseId=' + encodeURIComponent(id) + '&situation=' + s)));
      if (gen !== this.state.velGen) return;
      const byId = new Map();
      listas.flat().forEach((c) => { if (c && c.id != null) byId.set(String(c.id), c); });
      this.state.velCache[id] = { pronto: true, unidades: unidades, contratos: [...byId.values()], status: '', cac: null, cacPronto: false };
      this.renderVelocidade();
    } catch (e) {
      if (gen !== this.state.velGen) return;
      this.state.velCache[id] = { pronto: true, erro: 'Não foi possível ler este empreendimento no Sienge.', unidades: [], contratos: [], cacPronto: true };
      this.renderVelocidade();
    }
  },

  somarCac(bills, empId, porMes) {
    (bills || []).forEach((bill) => {
      const cats = (Array.isArray(bill && bill.paymentsCategories) ? bill.paymentsCategories : []).filter((c) => c && String(c.costCenterId) === String(empId));
      if (!cats.length) return;
      const pays = Array.isArray(bill.payments) ? bill.payments : [];
      pays.forEach((p) => {
        const dia = String((p && (p.paymentDate || p.payOffDate)) || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
        const liquido = Number(p.netAmount != null ? p.netAmount : (p.grossAmount != null ? p.grossAmount : 0)) || 0;
        const valor = Math.abs(liquido) + Math.abs(Number(p.taxAmount) || 0);
        if (!(valor > 0.009)) return;
        const ym = dia.slice(0, 7);
        cats.forEach((cat) => {
          const lado = this.ladoCac(cat.financialCategoryId, cat.financialCategoryName);
          if (!lado) return;
          const rate = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) / 100 : 1;
          const bag = porMes[ym] || (porMes[ym] = { comercial: 0, marketing: 0 });
          bag[lado] += valor * (Number.isFinite(rate) ? rate : 1);
        });
      });
    });
  },

  async carregarCac(empId, gen) {
    const pack = this.state.velCache[empId];
    if (!pack || !pack.pronto || pack.cacPronto) return;
    const ccs = (window.AppState && AppState.cachedCostCenters) || [];
    const cc = ccs.find((c) => String(c.id) === String(empId));
    const companyId = cc && (cc.idCompany != null ? cc.idCompany : cc.companyId);
    const base = window.ComprasPrevisoesApp;
    if (!companyId || !base || typeof base.outcomeRange !== 'function') {
      pack.cacPronto = true;
      pack.cacNota = 'O centro não tem empresa para somar as despesas do CAC.';
      this.renderVelocidade();
      return;
    }
    const anos = [];
    (pack.contratos || []).forEach((c) => {
      const y = Number(String(c.issueDate || c.contractDate || '').slice(0, 4));
      if (y > 1990 && anos.indexOf(y) < 0) anos.push(y);
    });
    anos.sort((a, b) => a - b);
    const porMes = {};
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, emp) => '/bulk-data/v1/outcome?startDate=' + encodeURIComponent(start)
      + '&endDate=' + encodeURIComponent(end)
      + '&selectionType=P&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true'
      + '&costCentersId=' + encodeURIComponent(empId)
      + (emp ? '&companyId=' + encodeURIComponent(emp) : '');
    try {
      for (let i = 0; i < anos.length; i++) {
        if (gen !== this.state.velGen) return;
        pack.status = 'Somando despesas de ' + anos[i] + '…';
        this.renderVelocidade();
        const bills = await api.outcomeRange(anos[i] + '-01-01', anos[i] + '-12-31', String(companyId));
        this.somarCac(bills, empId, porMes);
      }
    } catch (e) {
      pack.cacNota = 'As despesas do CAC não fecharam nesta consulta.';
    }
    if (gen !== this.state.velGen) return;
    pack.cac = porMes;
    pack.cacPronto = true;
    pack.status = '';
    this.renderVelocidade();
  },

  modeloVel(pack) {
    const unidades = (pack && pack.unidades) || [];
    const contratos = (pack && pack.contratos) || [];
    const fora = { E: 1, M: 1, R: 1 };
    let lotes = 0;
    let estoque = 0;
    let vendaveis = 0;
    unidades.forEach((u) => {
      lotes += 1;
      const code = String((u && u.commercialStock) || '').toUpperCase();
      if (code === 'D') estoque += 1;
      if (!fora[code]) vendaveis += 1;
    });
    const limites = [6, 12, 24, 36, 48, 60, 120, 156, 180];
    const rotulos = ['Até 6x', 'Até 12x', 'Até 24x', 'Até 36x', 'Até 48x', 'Até 60x', 'Até 120x', 'Até 156x', 'Até 180x'];
    const faixas = limites.map(() => 0);
    let curto = 0;
    let longo = 0;
    let semPlano = 0;
    const meses = {};
    contratos.forEach((c) => {
      const qty = this.contractQty(c);
      const venda = String(c.issueDate || c.contractDate || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(venda)) {
        const slot = meses[venda] || (meses[venda] = { v: 0, d: 0 });
        slot.v += qty;
      }
      const cancel = String(c.cancellationDate || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(cancel)) {
        const slot = meses[cancel] || (meses[cancel] = { v: 0, d: 0 });
        slot.d += qty;
      }
      const n = this.parcelasContrato(c);
      if (!(n > 0)) { semPlano += 1; return; }
      if (n <= 48) curto += 1;
      else longo += 1;
      let i = limites.findIndex((l) => n <= l);
      if (i < 0) i = limites.length - 1;
      faixas[i] += 1;
    });
    let vendas = 0;
    let distratos = 0;
    Object.keys(meses).forEach((k) => { vendas += meses[k].v; distratos += meses[k].d; });
    return { lotes: lotes, estoque: estoque, vendaveis: vendaveis || lotes, vendas: vendas, distratos: distratos, curto: curto, longo: longo, semPlano: semPlano, faixas: faixas, rotulos: rotulos, meses: meses };
  },

  fmtPctVel(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  },

  fmtCac(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  },

  renderVelocidade() {
    const root = document.getElementById('comercial-velocidade');
    if (!root || this.state.aba !== 'velocidade') return;
    const emps = this.empreendimentosVel();
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: 'com-vel-emp',
      label: 'Empreendimento',
      items: emps,
      selectedIds: this.state.velEmp ? [this.state.velEmp] : [],
      open: this.state.velEmpOpen,
      query: this.state.velEmpQuery,
      single: true,
      emptyMeansAll: false,
      emptyLabel: 'Selecione o empreendimento',
      nouns: {
        singular: 'empreendimento',
        plural: 'empreendimentos',
        none: this.state.velVendaIds ? 'Nenhum empreendimento com venda' : 'Lendo empreendimentos…',
        noMatch: 'Nenhum empreendimento com esse nome.'
      }
    }) : '';
    const pack = this.state.velEmp ? this.state.velCache[this.state.velEmp] : null;
    let miolo = '<p class="com-vel-nota">Escolha um empreendimento que já tem contrato de venda. A velocidade usa toda a história dele.</p>';
    if (pack && !pack.pronto) miolo = `<p class="com-vel-status">${this.esc(pack.status || 'Carregando…')}</p>`;
    else if (pack && pack.erro) miolo = `<p class="com-vel-status">${this.esc(pack.erro)}</p>`;
    else if (pack && pack.pronto) miolo = this.htmlVelocidade(pack);
    root.innerHTML = `
      <div class="com-vel-top">
        ${filtro}
      </div>
      ${miolo}`;
    this.bindVelEmp();
    if (this.state.velEmpOpen) {
      const q = document.getElementById('com-vel-emp-search');
      if (q) {
        q.focus();
        const n = q.value.length;
        q.setSelectionRange(n, n);
      }
    }
    if (window.lucide) window.lucide.createIcons();
  },

  htmlVelocidade(pack) {
    const m = this.modeloVel(pack);
    const base = m.vendaveis || m.lotes;
    const vezes = m.lotes > 0 ? (m.vendas / m.lotes) * 100 : null;
    const comPlano = m.curto + m.longo;
    const pct = (n) => comPlano > 0 ? (n / comPlano) * 100 : 0;
    const anel = Math.max(0, Math.min(100, vezes || 0));
    const barras = m.rotulos.map((nome, i) => {
      const p = pct(m.faixas[i]);
      return `<div class="com-vel-bar"><span>${nome}</span><i><b style="width:${p.toFixed(1)}%"></b></i><em>${this.fmtInt(m.faixas[i])} · ${this.fmtPctVel(comPlano ? p : null)}</em></div>`;
    }).join('');
    const anos = [...new Set(Object.keys(m.meses).map((k) => k.slice(0, 4)))].sort();
    if (anos.length && !Object.keys(this.state.velAberto).length) this.state.velAberto[anos[anos.length - 1]] = true;
    const linha = (rotulo, v, d, cls, clique) => {
      const saldo = v - d;
      const parte = m.vendas > 0 ? (v / m.vendas) * 100 : null;
      const vel = base > 0 ? (v / base) * 100 : null;
      return `<tr class="${cls}"${clique ? ` onclick="ComercialApp.toggleAnoVel('${rotulo}')"` : ''}>
        <td>${this.esc(rotulo)}</td>
        <td>${this.fmtInt(v)}</td><td>${this.fmtInt(d)}</td><td>${this.fmtInt(saldo)}</td>
        <td>${this.fmtPctVel(parte)}</td><td>${this.fmtPctVel(vel)}</td>
      </tr>`;
    };
    let corpo = '';
    anos.forEach((ano) => {
      let v = 0;
      let d = 0;
      const chaves = Object.keys(m.meses).filter((k) => k.slice(0, 4) === ano).sort();
      chaves.forEach((k) => { v += m.meses[k].v; d += m.meses[k].d; });
      corpo += linha(ano, v, d, 'com-vel-ano', true);
      if (this.state.velAberto[ano]) {
        chaves.forEach((k) => {
          const mes = COM_MESES[Number(k.slice(5, 7)) - 1] || k;
          corpo += linha(mes, m.meses[k].v, m.meses[k].d, 'com-vel-mes', false);
        });
      }
    });
    corpo += linha('Total', m.vendas, m.distratos, 'com-vel-total', false);
    return `
      <div class="com-vel-kpis">
        <article class="com-vel-kpi"><span>Total de lotes</span><strong>${m.lotes ? this.fmtInt(m.lotes) : '—'}</strong><small>${this.fmtInt(m.vendaveis)} vendáveis, fora permuta, mútuo e reserva técnica</small></article>
        <article class="com-vel-kpi"><span>Lotes vendidos</span><strong>${this.fmtInt(m.vendas)}</strong><small>${this.fmtPctVel(vezes)} em relação aos lotes</small></article>
        <article class="com-vel-kpi"><span>Estoque de lotes</span><strong>${m.lotes ? this.fmtInt(m.estoque) : '—'}</strong><small>Disponíveis agora</small></article>
      </div>
      <div class="com-vel-grid">
        <div class="com-vel-card">
          <h3>Quantas vezes o lote foi vendido</h3>
          <p>100% é o total de lotes. Acima disso, o mesmo lote entrou em mais de um contrato.</p>
          <div class="com-vel-vezes">
            <div class="com-vel-donut" style="--p:${anel.toFixed(2)}">
              <div class="com-vel-donut-miolo">
                <strong>${this.fmtPctVel(vezes)}</strong>
                <span>${this.fmtInt(m.vendas)} vendas<br>${this.fmtInt(m.lotes)} lotes</span>
              </div>
            </div>
            <div class="com-vel-vezes-lado">
              <div class="com-vel-bloco"><span>Lotes</span><i><b style="width:100%"></b></i><em>${this.fmtInt(m.lotes)}</em></div>
              <div class="com-vel-bloco"><span>Vendas</span><i><b style="width:${anel.toFixed(1)}%"></b></i><em>${this.fmtPctVel(vezes)}</em></div>
            </div>
          </div>
        </div>
        <div class="com-vel-card">
          <h3>Planos contratados</h3>
          <p>Curto ${this.fmtInt(m.curto)} · ${this.fmtPctVel(pct(m.curto))}. Longo ${this.fmtInt(m.longo)} · ${this.fmtPctVel(pct(m.longo))}.${m.semPlano ? ' ' + this.fmtInt(m.semPlano) + ' contratos sem a quantidade de parcelas.' : ''}</p>
          <div class="com-vel-planos">${barras}</div>
        </div>
      </div>
      <div class="com-vel-card">
        <p>Clique no ano para abrir os meses. A velocidade do mês é as vendas daquele mês divididas pelos lotes vendáveis.</p>
        <div class="com-vel-scroll">
          <table class="cc-table com-vel-table">
            <thead><tr><th>Ano</th><th>Vendas</th><th>Distratos</th><th>Saldo</th><th>% do vendido</th><th>Velocidade</th></tr></thead>
            <tbody>${corpo || '<tr><td colspan="6">Nenhum contrato neste empreendimento.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }
};

window.ComercialApp = ComercialApp;

document.addEventListener('tabChanged', function (e) {
  if (e.detail === 'dashboard-comercial') ComercialApp.init();
});
