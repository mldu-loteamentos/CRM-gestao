// comercial.js - Lógica para o Dashboard Comercial

const ComercialApp = {
  state: {
    loading: false,
    vendasMes: 0,
    distratosMes: 0,
    saldoMes: 0,
    vendasMesAnterior: 0,
    distratosMesAnterior: 0,
    saldoMesAnterior: 0,
    vendasAno: 0,
    distratosAno: 0,
    saldoAno: 0,
    vendasAnoAnterior: 0,
    distratosAnoAnterior: 0,
    saldoAnoAnterior: 0,
    produtos: {}
  },

  init: function() {
    console.log("[ComercialApp] Inicializado");
    // Configurar o input de mês para o mês atual
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const el = document.getElementById('comercial-month-end');
    if (el) {
      el.value = currentMonth;
    }
  },

  fetchData: async function() {
    if (this.state.loading) return;

    const monthInput = document.getElementById('comercial-month-end').value;
    if (!monthInput) {
      alert("Por favor, selecione o mês de referência.");
      return;
    }

    const [yearStr, monthStr] = monthInput.split('-');
    const selectedYear = parseInt(yearStr, 10);
    const selectedMonth = parseInt(monthStr, 10);

    const btn = document.getElementById('comercial-btn-search');
    btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> <span>Carregando Dados...</span>';
    if (window.lucide) window.lucide.createIcons();
    this.state.loading = true;

    try {
      // Zerar estado
      this.state.produtos = {};
      this.state.vendasMes = 0;
      this.state.distratosMes = 0;
      this.state.vendasMesAnterior = 0;
      this.state.distratosMesAnterior = 0;
      this.state.vendasAno = 0;
      this.state.distratosAno = 0;
      this.state.vendasAnoAnterior = 0;
      this.state.distratosAnoAnterior = 0;

      // Montar lista de meses para buscar
      const monthsToFetch = [];
      
      // Mês corrente e meses do ano até o mês corrente
      for (let m = 1; m <= selectedMonth; m++) {
        monthsToFetch.push({ year: selectedYear, month: m });
      }
      // Meses correspondentes do ano anterior
      const previousYear = selectedYear - 1;
      for (let m = 1; m <= selectedMonth; m++) {
        monthsToFetch.push({ year: previousYear, month: m });
      }

      // Função auxiliar para buscar todas as páginas de um endpoint
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
          if (results.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        }
        return allResults;
      };

      // Disparar requisições em paralelo
      const fetchPromises = monthsToFetch.map(async (m) => {
        const firstDay = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
        const lastDayObj = new Date(m.year, m.month, 0);
        const lastDay = `${m.year}-${String(m.month).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;

        const urlVendas = `/sales-contracts?situation=2&initialIssueDate=${firstDay}&finalIssueDate=${lastDay}`;
        const urlDistratos = `/sales-contracts?situation=3&initialCancelDate=${firstDay}&finalCancelDate=${lastDay}`;

        const [vendas, distratos] = await Promise.all([
          fetchAllPages(urlVendas),
          fetchAllPages(urlDistratos)
        ]);

        return {
          year: m.year,
          month: m.month,
          vendas: vendas,
          distratos: distratos
        };
      });

      const results = await Promise.all(fetchPromises);

      // Processar os resultados
      results.forEach(res => {
        const isCurrentYear = res.year === selectedYear;
        const isSelectedMonth = res.month === selectedMonth;

        // Vendas
        res.vendas.forEach(v => {
          this.addProdutoData(v, 'venda', isCurrentYear, isSelectedMonth);
          if (isCurrentYear) {
            this.state.vendasAno++;
            if (isSelectedMonth) this.state.vendasMes++;
          } else {
            this.state.vendasAnoAnterior++;
            if (isSelectedMonth) this.state.vendasMesAnterior++;
          }
        });

        // Distratos
        res.distratos.forEach(d => {
          this.addProdutoData(d, 'distrato', isCurrentYear, isSelectedMonth);
          if (isCurrentYear) {
            this.state.distratosAno++;
            if (isSelectedMonth) this.state.distratosMes++;
          } else {
            this.state.distratosAnoAnterior++;
            if (isSelectedMonth) this.state.distratosMesAnterior++;
          }
        });
      });

      this.updateDashboardUI();
      document.getElementById('comercial-dashboard-content').style.display = 'block';

    } catch (e) {
      console.error("[ComercialApp] Erro ao buscar dados do dashboard", e);
      alert("Falha ao buscar os dados no Sienge.");
    } finally {
      this.state.loading = false;
      btn.innerHTML = '<i data-lucide="search" style="width: 16px;"></i> <span>Carregar Dados</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  },

  addProdutoData: function(contract, type, isCurrentYear, isSelectedMonth) {
    let unitId = contract.unitId || 'N/D';
    let enterpriseId = unitId.split('-')[0];
    let enterpriseName = enterpriseId;
    
    // Tentar resolver o nome do empreendimento a partir do centro de custo, se disponível
    if (window.AppState && window.AppState.cachedCostCenters) {
      const cc = window.AppState.cachedCostCenters.find(c => c.id == enterpriseId || c.id == contract.costCenterId);
      if (cc) enterpriseName = cc.name;
    }

    if (!this.state.produtos[enterpriseName]) {
      this.state.produtos[enterpriseName] = {
        vendasMes: 0, distratosMes: 0,
        vendasAno: 0, distratosAno: 0
      };
    }

    if (isCurrentYear) {
      if (type === 'venda') {
        this.state.produtos[enterpriseName].vendasAno++;
        if (isSelectedMonth) this.state.produtos[enterpriseName].vendasMes++;
      } else {
        this.state.produtos[enterpriseName].distratosAno++;
        if (isSelectedMonth) this.state.produtos[enterpriseName].distratosMes++;
      }
    }
  },

  updateDashboardUI: function() {
    this.state.saldoMes = this.state.vendasMes - this.state.distratosMes;
    this.state.saldoAno = this.state.vendasAno - this.state.distratosAno;
    this.state.saldoMesAnterior = this.state.vendasMesAnterior - this.state.distratosMesAnterior;
    this.state.saldoAnoAnterior = this.state.vendasAnoAnterior - this.state.distratosAnoAnterior;

    const monthInput = document.getElementById('comercial-month-end').value;
    const [yearStr, monthStr] = monthInput ? monthInput.split('-') : [new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString()];
    const selectedYear = parseInt(yearStr, 10);
    const selectedMonth = parseInt(monthStr, 10);
    const today = new Date();
    const isProjection = selectedYear > today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth > today.getMonth() + 1);

    const renderKPI = (id, val, prevVal) => {
      const isAcumulado = id.includes('-ano');
      if (isProjection && isAcumulado) {
          document.getElementById(`kpi-${id}`).innerHTML = '<span style="font-size: 1.2rem; color: #94a3b8;">Indisponível</span>';
          document.getElementById(`kpi-${id}-comp`).innerHTML = '';
          return;
      }
      
      document.getElementById(`kpi-${id}`).textContent = val;
      const compEl = document.getElementById(`kpi-${id}-comp`);
      let diff = val - prevVal;
      let percent = prevVal > 0 ? ((diff / prevVal) * 100).toFixed(1) : (diff > 0 ? 100 : 0);
      
      let color = diff > 0 ? "var(--color-success)" : (diff < 0 ? "var(--color-danger)" : "#64748b");
      // Se for distrato, menos é melhor (verde)
      if (id.includes('distratos')) {
        color = diff > 0 ? "var(--color-danger)" : (diff < 0 ? "var(--color-success)" : "#64748b");
      }
      
      let sign = diff > 0 ? "+" : "";
      compEl.innerHTML = `<span style="color: ${color}; font-weight: 700;">${sign}${percent}%</span> vs ano ant. (${prevVal})`;
    };

    renderKPI('vendas-mes', this.state.vendasMes, this.state.vendasMesAnterior);
    renderKPI('distratos-mes', this.state.distratosMes, this.state.distratosMesAnterior);
    renderKPI('saldo-mes', this.state.saldoMes, this.state.saldoMesAnterior);

    renderKPI('vendas-ano', this.state.vendasAno, this.state.vendasAnoAnterior);
    renderKPI('distratos-ano', this.state.distratosAno, this.state.distratosAnoAnterior);
    renderKPI('saldo-ano', this.state.saldoAno, this.state.saldoAnoAnterior);

    const tbody = document.getElementById('comercial-table-body');
    tbody.innerHTML = '';

    const sortedProdutos = Object.keys(this.state.produtos).sort();
    
    if (sortedProdutos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">Nenhum dado encontrado para o período selecionado.</td></tr>`;
      return;
    }

    sortedProdutos.forEach(prod => {
      const data = this.state.produtos[prod];
      const saldoMes = data.vendasMes - data.distratosMes;
      const saldoAno = data.vendasAno - data.distratosAno;
      
      const textVendasAno = isProjection ? '<span style="color:#94a3b8;font-size:0.85em;">Indisp.</span>' : data.vendasAno;
      const textDistratosAno = isProjection ? '<span style="color:#94a3b8;font-size:0.85em;">Indisp.</span>' : data.distratosAno;
      const textSaldoAno = isProjection ? '<span style="color:#94a3b8;font-size:0.85em;">Indisp.</span>' : `<strong style="color: ${saldoAno > 0 ? 'var(--color-success)' : (saldoAno < 0 ? 'var(--color-danger)' : '#1e293b')}">${saldoAno}</strong>`;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color: #1e293b;">${prod}</strong></td>
        <td style="text-align: center;">${data.vendasMes}</td>
        <td style="text-align: center;">${data.distratosMes}</td>
        <td style="text-align: center;"><strong style="color: ${saldoMes > 0 ? 'var(--color-success)' : (saldoMes < 0 ? 'var(--color-danger)' : '#1e293b')}">${saldoMes}</strong></td>
        <td style="text-align: center;">${textVendasAno}</td>
        <td style="text-align: center;">${textDistratosAno}</td>
        <td style="text-align: center;">${textSaldoAno}</td>
      `;
      tbody.appendChild(tr);
    });
  }
};

// Auto-init ao carregar a aba
document.addEventListener("tabChanged", function(e) {
  if (e.detail === 'dashboard-comercial') {
    ComercialApp.init();
  }
});
