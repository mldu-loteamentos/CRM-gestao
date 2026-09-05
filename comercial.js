// comercial.js - Dashboard Comercial (Vendas e Distratos)

const COM_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ComercialApp = {
  state: {
    loading: false,
    loaded: false,
    rawMonths: [],
    year: 0,
    month: 0,
    updatedAt: null,
    charts: {}
  },

  currentPeriod() {
    const today = new Date();
    const yEl = document.getElementById('comercial-year');
    const mEl = document.getElementById('comercial-month');
    const year = yEl && yEl.value ? parseInt(yEl.value, 10) : today.getFullYear();
    const month = mEl && mEl.value ? parseInt(mEl.value, 10) : (today.getMonth() + 1);
    return { year, month: month || (today.getMonth() + 1) };
  },

  fillFilters() {
    const today = new Date();
    const yNow = today.getFullYear();
    const mNow = today.getMonth() + 1;
    const yEl = document.getElementById('comercial-year');
    const mEl = document.getElementById('comercial-month');
    if (yEl && !yEl.options.length) {
      for (let y = yNow; y >= yNow - 3; y--) {
        yEl.appendChild(new Option(String(y), String(y)));
      }
      yEl.value = String(yNow);
    }
    if (mEl && !mEl.options.length) {
      COM_MESES.forEach((nome, i) => mEl.appendChild(new Option(nome, String(i + 1))));
      mEl.value = String(mNow);
    }
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
    const { year, month } = this.currentPeriod();
    const need = [];
    for (let y = year - 1; y <= year; y++) {
      const last = y === year ? month : 12;
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
    const { year, month } = this.currentPeriod();
    if (!force && this.state.loaded && this.hasCachedPeriod()) {
      this.updateDashboardUI();
      return;
    }

    this.state.loading = true;
    this.setLoading(true);

    try {
      const monthsToFetch = [];
      for (let y = year - 1; y <= year; y++) {
        const last = y === year ? month : 12;
        for (let m = 1; m <= last; m++) monthsToFetch.push({ year: y, month: m });
      }

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
        const [vendas, distratos] = await Promise.all([
          fetchAllPages(`/sales-contracts?situation=2&initialIssueDate=${firstDay}&finalIssueDate=${lastDay}`),
          fetchAllPages(`/sales-contracts?situation=3&initialCancelDate=${firstDay}&finalCancelDate=${lastDay}`)
        ]);
        return { year: m.year, month: m.month, vendas, distratos };
      }));

      this.state.rawMonths = results;
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
    const unitId = String(contract.unitId || '');
    const enterpriseId = unitId.includes('-') ? unitId.split('-')[0] : (contract.enterpriseId || contract.costCenterId || '');
    let name = String(enterpriseId || 'N/D');
    if (window.AppState && window.AppState.cachedCostCenters) {
      const cc = window.AppState.cachedCostCenters.find((c) =>
        String(c.id) === String(enterpriseId) || String(c.id) === String(contract.costCenterId)
      );
      if (cc && cc.name) name = cc.name;
    }
    if (contract.enterpriseName) name = contract.enterpriseName;
    return { enterpriseId: String(enterpriseId || name), name: String(name).toUpperCase() };
  },

  cityFromName(name) {
    const raw = String(name || '');
    if (raw.includes(' - ')) return raw.split(' - ')[0].trim().toUpperCase();
    return raw.trim().toUpperCase() || 'OUTROS';
  },

  aggregate() {
    const { year, month } = this.currentPeriod();
    const produtos = {};
    const cidades = {};
    const serie = [];
    let vendasAno = 0;
    let distratosAno = 0;
    let vendasAnoAnt = 0;
    let distratosAnoAnt = 0;
    let m2Venda = 0;
    let m2Dist = 0;

    (this.state.rawMonths || []).forEach((res) => {
      const inYear = res.year === year && res.month <= month;
      const inPrev = res.year === year - 1 && res.month <= month;
      const inChart = (res.year === year - 1 && res.month >= 1) || (res.year === year && res.month <= month);

      let vMes = 0;
      let dMes = 0;

      res.vendas.forEach((v) => {
        const area = this.contractArea(v);
        const { name } = this.resolveEnterprise(v);
        if (inChart) vMes += 1;
        if (inYear) {
          vendasAno += 1;
          m2Venda += area;
          if (!produtos[name]) produtos[name] = { vendas: 0, distratos: 0 };
          produtos[name].vendas += 1;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].vendas += 1;
        } else if (inPrev) {
          vendasAnoAnt += 1;
        }
      });

      res.distratos.forEach((d) => {
        const area = this.contractArea(d);
        const { name } = this.resolveEnterprise(d);
        if (inChart) dMes += 1;
        if (inYear) {
          distratosAno += 1;
          m2Dist += area;
          if (!produtos[name]) produtos[name] = { vendas: 0, distratos: 0 };
          produtos[name].distratos += 1;
          const city = this.cityFromName(name);
          if (!cidades[city]) cidades[city] = { vendas: 0, distratos: 0 };
          cidades[city].distratos += 1;
        } else if (inPrev) {
          distratosAnoAnt += 1;
        }
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
      year, month, produtos, cidades, serie,
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

  updateDashboardUI() {
    const agg = this.aggregate();
    const monthsCount = Math.max(1, agg.month);
    const saldo = agg.vendasAno - agg.distratosAno;
    const saldoAnt = agg.vendasAnoAnt - agg.distratosAnoAnt;
    const rel = agg.distratosAno > 0 ? (agg.vendasAno / agg.distratosAno) : agg.vendasAno;
    const relAnt = agg.distratosAnoAnt > 0 ? (agg.vendasAnoAnt / agg.distratosAnoAnt) : agg.vendasAnoAnt;

    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    set('kpi-vendas', String(agg.vendasAno));
    set('kpi-vendas-comp', this.fmtPct(agg.vendasAno, agg.vendasAnoAnt, false));
    set('kpi-vendas-avg', `média mensal ${agg.year}: ${Math.round(agg.vendasAno / monthsCount)}`);
    set('kpi-distratos', String(agg.distratosAno));
    set('kpi-distratos-comp', this.fmtPct(agg.distratosAno, agg.distratosAnoAnt, true));
    set('kpi-distratos-avg', `média mensal ${agg.year}: ${Math.round(agg.distratosAno / monthsCount)}`);
    set('kpi-variacao', String(saldo));
    set('kpi-variacao-comp', this.fmtPct(saldo, saldoAnt, false));
    set('kpi-relacao', rel.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    set('kpi-relacao-comp', `ano ant. ${relAnt.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
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

document.addEventListener('tabChanged', function (e) {
  if (e.detail === 'dashboard-comercial') ComercialApp.init();
});
