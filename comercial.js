// comercial.js - Dashboard Comercial (Vendas e Distratos)

const COM_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ComercialApp = {
  state: {
    loading: false,
    loaded: false,
    rawMonths: [],
    year: 0,
    months: [],
    monthOpen: false,
    updatedAt: null,
    charts: {}
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

  renderMonthFilter() {
    const { year, months } = this.currentPeriod();
    const list = document.getElementById('comercial-month-list');
    const label = document.getElementById('comercial-month-label');
    if (label) label.textContent = this.periodLabel(months);
    if (list) {
      const selected = new Set(months);
      list.innerHTML = this.availableMonths(year).map((m) => `
        <label class="com-month-filter-item">
          <input type="checkbox" value="${m}" ${selected.has(m) ? 'checked' : ''} onchange="ComercialApp.toggleMonth(${m}, this.checked)">
          ${COM_MESES[m - 1]}
        </label>`).join('');
    }
    const wrap = document.getElementById('comercial-month-filter');
    const panel = document.getElementById('comercial-month-panel');
    if (wrap) wrap.classList.toggle('is-open', !!this.state.monthOpen);
    if (panel) panel.hidden = !this.state.monthOpen;
    this.bindMonthOutside();
    if (window.lucide) window.lucide.createIcons();
  },

  bindMonthOutside() {
    if (this._monthOutside) return;
    this._monthOutside = true;
    document.addEventListener('mousedown', (e) => {
      if (!this.state.monthOpen) return;
      const wrap = document.getElementById('comercial-month-filter');
      if (wrap && !wrap.contains(e.target)) this.closeMonthFilter();
    });
  },

  toggleMonthFilter(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    this.state.monthOpen = !this.state.monthOpen;
    this.renderMonthFilter();
  },

  closeMonthFilter() {
    if (!this.state.monthOpen) return;
    this.state.monthOpen = false;
    this.renderMonthFilter();
  },

  applyMonths(months, keepOpen) {
    const { year } = this.currentPeriod();
    this.state.months = this.normalizeMonths(year, months);
    this.state.monthOpen = !!keepOpen;
    this.renderMonthFilter();
    this.onFilterChange();
  },

  toggleMonth(month, on) {
    const { months } = this.currentPeriod();
    const next = on ? [...months, month] : months.filter((m) => m !== month);
    this.applyMonths(next, true);
  },

  selectAllMonths() {
    const { year } = this.currentPeriod();
    this.applyMonths(this.availableMonths(year), true);
  },

  selectNoneMonths() {
    const { yNow, mNow } = this.todayParts();
    const { year } = this.currentPeriod();
    this.applyMonths([year === yNow ? mNow : 1], true);
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
    if (load) load.style.display = on && !this.state.loaded ? 'flex' : 'none';
    if (content && this.state.loaded) content.style.display = 'block';
    if (btn) {
      btn.disabled = !!on;
      btn.innerHTML = on
        ? '<i data-lucide="loader" class="spin" style="width:15px;"></i> Atualizando'
        : '<i data-lucide="refresh-cw" style="width:15px;"></i> Atualizar';
      if (window.lucide) window.lucide.createIcons();
    }
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
    this.setLoading(true);

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

      const results = await Promise.all(monthsToFetch.map(async (m) => {
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
      }));

      const byKey = new Map((force ? [] : (this.state.rawMonths || [])).map((r) => [`${r.year}-${r.month}`, r]));
      results.forEach((r) => byKey.set(`${r.year}-${r.month}`, r));
      this.state.rawMonths = [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month);
      this.state.loaded = true;
      this.state.updatedAt = new Date();
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
    const serie = [];
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

      res.vendas.forEach((v) => {
        const qty = this.contractQty(v);
        const area = this.contractArea(v);
        const { name } = this.resolveEnterprise(v);
        if (inChart) vMes += qty;
        if (inPeriod) {
          vendasPeriodo += qty;
          m2Venda += area;
          if (!produtos[name]) produtos[name] = { vendas: 0, distratos: 0 };
          produtos[name].vendas += qty;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].vendas += qty;
        }
        if (inYear) vendasAno += qty;
        if (inPeriodPrev) vendasPeriodoAnt += qty;
        if (inPrev) vendasAnoAnt += qty;
      });

      res.distratos.forEach((d) => {
        const qty = this.contractQty(d);
        const area = this.contractArea(d);
        const { name } = this.resolveEnterprise(d);
        if (inChart) dMes += qty;
        if (inPeriod) {
          distratosPeriodo += qty;
          m2Dist += area;
          if (!produtos[name]) produtos[name] = { vendas: 0, distratos: 0 };
          produtos[name].distratos += qty;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].distratos += qty;
        }
        if (inYear) distratosAno += qty;
        if (inPeriodPrev) distratosPeriodoAnt += qty;
        if (inPrev) distratosAnoAnt += qty;
      });

      if (inChart) {
        serie.push({
          year: res.year,
          month: res.month,
          label: `${COM_MESES[res.month - 1]}/${String(res.year).slice(2)}`,
          vendas: vMes,
          distratos: dMes,
          variacao: vMes - dMes
        });
      }
    });

    return {
      year, months, maxMonth, produtos, cidades, serie,
      vendasPeriodo, distratosPeriodo, vendasPeriodoAnt, distratosPeriodoAnt,
      vendasAno, distratosAno, vendasAnoAnt, distratosAnoAnt,
      m2Venda, m2Dist
    };
  },

  fmtPct(val, prev, invert) {
    const diff = val - prev;
    const percent = prev > 0 ? ((diff / prev) * 100).toFixed(1) : (diff > 0 ? '100.0' : '0.0');
    const better = invert ? diff < 0 : diff > 0;
    const color = diff === 0 ? '#64748b' : (better ? 'var(--color-success)' : 'var(--color-danger)');
    const sign = diff > 0 ? '+' : '';
    return `<span style="color:${color};font-weight:700;">${sign}${percent}%</span> vs ano ant. (${prev})`;
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

  renderCharts(agg) {
    if (typeof Chart === 'undefined') return;
    this.destroyCharts();

    const labels = agg.serie.map((s) => s.label);
    const vd = document.getElementById('comercial-chart-vd');
    const vr = document.getElementById('comercial-chart-var');
    const ct = document.getElementById('comercial-chart-city');
    if (vd) {
      this.state.charts.vd = new Chart(vd, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Vendas', data: agg.serie.map((s) => s.vendas), backgroundColor: '#2563eb', borderRadius: 3 },
            { label: 'Distratos', data: agg.serie.map((s) => s.distratos), backgroundColor: '#ef4444', borderRadius: 3 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }
    if (vr) {
      this.state.charts.vr = new Chart(vr, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Variação',
            data: agg.serie.map((s) => s.variacao),
            backgroundColor: agg.serie.map((s) => s.variacao >= 0 ? '#16a34a' : '#ef4444'),
            borderRadius: 3
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }
    if (ct) {
      const cities = Object.keys(agg.cidades).sort((a, b) => {
        const va = (agg.cidades[a].vendas - agg.cidades[a].distratos);
        const vb = (agg.cidades[b].vendas - agg.cidades[b].distratos);
        return vb - va;
      }).slice(0, 10);
      this.state.charts.ct = new Chart(ct, {
        type: 'bar',
        data: {
          labels: cities,
          datasets: [
            { label: 'Vendas', data: cities.map((c) => agg.cidades[c].vendas), backgroundColor: '#2563eb' },
            { label: 'Distratos', data: cities.map((c) => agg.cidades[c].distratos), backgroundColor: '#ef4444' },
            { label: 'Variação', data: cities.map((c) => agg.cidades[c].vendas - agg.cidades[c].distratos), backgroundColor: '#94a3b8' }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { beginAtZero: true } }
        }
      });
    }
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

    ['kpi-vendas-period-lbl', 'kpi-distratos-period-lbl', 'kpi-variacao-period-lbl', 'kpi-relacao-period-lbl']
      .forEach((id) => set(id, periodLbl));
    ['kpi-vendas-ytd-lbl', 'kpi-distratos-ytd-lbl', 'kpi-variacao-ytd-lbl', 'kpi-relacao-ytd-lbl']
      .forEach((id) => set(id, `Acum. ${ytdLbl}`));

    set('kpi-vendas', String(agg.vendasPeriodo));
    set('kpi-vendas-comp', this.fmtPct(agg.vendasPeriodo, agg.vendasPeriodoAnt, false));
    set('kpi-vendas-ytd', String(agg.vendasAno));
    set('kpi-vendas-ytd-comp', this.fmtPct(agg.vendasAno, agg.vendasAnoAnt, false));
    set('kpi-vendas-avg', `média mensal ${agg.year}: ${Math.round(agg.vendasAno / monthsCount)}`);
    set('kpi-distratos', String(agg.distratosPeriodo));
    set('kpi-distratos-comp', this.fmtPct(agg.distratosPeriodo, agg.distratosPeriodoAnt, true));
    set('kpi-distratos-ytd', String(agg.distratosAno));
    set('kpi-distratos-ytd-comp', this.fmtPct(agg.distratosAno, agg.distratosAnoAnt, true));
    set('kpi-distratos-avg', `média mensal ${agg.year}: ${Math.round(agg.distratosAno / monthsCount)}`);
    set('kpi-variacao', String(saldo));
    set('kpi-variacao-comp', this.fmtPct(saldo, saldoAnt, false));
    set('kpi-variacao-ytd', String(saldoYtd));
    set('kpi-variacao-ytd-comp', this.fmtPct(saldoYtd, saldoYtdAnt, false));
    set('kpi-relacao', this.fmtRel(agg.vendasPeriodo, agg.distratosPeriodo));
    set('kpi-relacao-comp', `ano ant. ${this.fmtRel(agg.vendasPeriodoAnt, agg.distratosPeriodoAnt)}`);
    set('kpi-relacao-ytd', this.fmtRel(agg.vendasAno, agg.distratosAno));
    set('kpi-relacao-ytd-comp', `ano ant. ${this.fmtRel(agg.vendasAnoAnt, agg.distratosAnoAnt)}`);
    set('kpi-m2-vendido', this.fmtM2(agg.m2Venda));
    set('kpi-m2-devolvido', this.fmtM2(agg.m2Dist));
    set('kpi-m2-saldo', this.fmtM2(agg.m2Venda - agg.m2Dist));

    const tbody = document.getElementById('comercial-table-body');
    if (tbody) {
      const rows = Object.keys(agg.produtos).sort((a, b) => {
        const va = agg.produtos[a].vendas - agg.produtos[a].distratos;
        const vb = agg.produtos[b].vendas - agg.produtos[b].distratos;
        return vb - va;
      });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">Nenhum dado no período.</td></tr>';
      } else {
        let totV = 0, totD = 0;
        tbody.innerHTML = rows.map((prod) => {
          const d = agg.produtos[prod];
          const varn = d.vendas - d.distratos;
          totV += d.vendas;
          totD += d.distratos;
          return `<tr>
            <td><strong>${prod}</strong></td>
            <td style="text-align:center;">${d.vendas}</td>
            <td style="text-align:center;">${d.distratos}</td>
            <td style="text-align:center;font-weight:700;color:${varn > 0 ? 'var(--color-success)' : (varn < 0 ? 'var(--color-danger)' : '#1e293b')}">${varn}</td>
          </tr>`;
        }).join('') + `<tr class="com-dash-total">
          <td><strong>Total</strong></td>
          <td style="text-align:center;"><strong>${totV}</strong></td>
          <td style="text-align:center;"><strong>${totD}</strong></td>
          <td style="text-align:center;"><strong>${totV - totD}</strong></td>
        </tr>`;
      }
    }

    const upd = document.getElementById('comercial-updated');
    if (upd && this.state.updatedAt) {
      upd.textContent = 'atualizado ' + this.state.updatedAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    const content = document.getElementById('comercial-dashboard-content');
    if (content) content.style.display = 'block';
    this.renderCharts(agg);
    if (window.lucide) window.lucide.createIcons();
  }
};

window.ComercialApp = ComercialApp;

document.addEventListener('tabChanged', function (e) {
  if (e.detail === 'dashboard-comercial') ComercialApp.init();
});
