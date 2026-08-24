const DashboardInadimplencia = (function() {
  let snapshots = [];
  
  async function carregarDados() {
    try {
      if (window.firebaseCollections && window.firebaseDb) {
        const snapRef = window.firebaseCollections.collection(window.firebaseDb, 'inadimplencia_snapshots');
        const q = window.firebaseCollections.query(snapRef, window.firebaseCollections.orderBy("date", "asc"));
        const fbDocs = await window.firebaseCollections.getDocs(q);
        snapshots = [];
        fbDocs.forEach(d => {
          snapshots.push(d.data());
        });
      } else {
        console.warn('Firebase não inicializado para carregar snapshots');
      }
    } catch (e) {
      console.error('Falha na requisição dos snapshots do Firebase', e);
    }
  }
  
  function formatMoney(value) {
    if (value === undefined || value === null) return "R$ 0,00";
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getSnapshotAtual() {
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }
  
  function getSnapshotAnterior() {
    return snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  }
  
  function getSnapshotFechamentoMes() {
    // Busca o snapshot do último fechamento de mês
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].is_month_close) return snapshots[i];
    }
    return null;
  }
  
  function calcularVariacao(atual, anterior) {
    if (!anterior || anterior === 0) return { val: 0, text: '-', class: '' };
    const pct = ((atual - anterior) / anterior) * 100;
    const sign = pct > 0 ? '+' : '';
    const colorClass = pct > 0 ? 'text-red-600' : (pct < 0 ? 'text-green-600' : 'text-gray-500');
    return { val: pct, text: `${sign}${pct.toFixed(1)}%`, class: colorClass };
  }
  
  function renderCards() {
    const atual = getSnapshotAtual();
    const anterior = getSnapshotFechamentoMes() || getSnapshotAnterior();
    
    if (!atual) return '';
    
    const varValor = calcularVariacao(atual.total_value, anterior ? anterior.total_value : 0);
    const varQtd = calcularVariacao(atual.total_count, anterior ? anterior.total_count : 0);
    const varTicket = calcularVariacao(atual.avg_ticket, anterior ? anterior.avg_ticket : 0);
    
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 25px;">
        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Valor Total (R$)</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${formatMoney(atual.total_value)}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varValor.class}">
            ${varValor.text} vs Fechamento Mês
          </div>
        </div>
        
        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Qtd. de Títulos</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${atual.total_count}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varQtd.class}">
            ${varQtd.text} vs Fechamento Mês
          </div>
        </div>
        
        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Ticket Médio</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${formatMoney(atual.avg_ticket)}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varTicket.class}">
            ${varTicket.text} vs Fechamento Mês
          </div>
        </div>
        
        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #8b5cf6; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Sub Júdice</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${atual.subjudice_count} <span style="font-size: 1rem; color: #64748b; font-weight: 500;">títulos</span></div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500; color: #64748b;">
            Total: ${formatMoney(atual.subjudice_value)}
          </div>
        </div>
      </div>
    `;
  }
  
  function initChart() {
    const ctx = document.getElementById('inadimplencia-chart');
    if (!ctx) return;
    
    // Preparar dados (últimos 30 dias se houver)
    const recentSnaps = snapshots.slice(-30);
    const labels = recentSnaps.map(s => {
      const parts = s.date.split('-');
      return `${parts[2]}/${parts[1]}`;
    });
    
    const values = recentSnaps.map(s => s.total_value);
    
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Valor Total de Inadimplência (R$)',
          data: values,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointBackgroundColor: recentSnaps.map(s => s.is_month_close ? '#ef4444' : '#f59e0b'),
          pointRadius: recentSnaps.map(s => s.is_month_close ? 5 : 3),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) { label += ': '; }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                }
                const snap = recentSnaps[context.dataIndex];
                if (snap && snap.is_month_close) label += ' (Fechamento)';
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
              }
            }
          }
        }
      }
    });
  }
  
  function renderTabelaComparativa() {
    const snapHoje = getSnapshotAtual();
    const snapFech = getSnapshotFechamentoMes();
    
    if (!snapHoje) return '';
    
    return `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="calendar-days" style="width: 18px; color: #64748b;"></i> Comparativo de Períodos
          </h3>
        </div>
        <div style="overflow-x: auto;">
          <table class="custom-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem;">Período</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Qtd Títulos</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Valor Total</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Sub Júdice</th>
              </tr>
            </thead>
            <tbody>
              ${snapFech ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 20px; font-weight: 600; color: #334155;">Fechamento do Mês</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${snapFech.total_count}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${formatMoney(snapFech.total_value)}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${snapFech.subjudice_count}</td>
              </tr>` : ''}
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 20px; font-weight: 600; color: #334155;">Hoje</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${snapHoje.total_count}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${formatMoney(snapHoje.total_value)}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${snapHoje.subjudice_count}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  function renderAging() {
    const atual = getSnapshotAtual();
    if (!atual || !atual.data_json || !atual.data_json.companies) return '';
    
    // Agrega o aging de todas as empresas
    const agings = {
      d0_30: { count: 0, value: 0 },
      d31_60: { count: 0, value: 0 },
      d61_90: { count: 0, value: 0 },
      d91_180: { count: 0, value: 0 },
      d181_365: { count: 0, value: 0 },
      d365p: { count: 0, value: 0 }
    };
    
    atual.data_json.companies.forEach(c => {
      if(c.aging) {
        Object.keys(agings).forEach(k => {
          if (c.aging[k]) {
            agings[k].count += c.aging[k].count;
            agings[k].value += c.aging[k].value;
          }
        });
      }
    });
    
    const labels = {
      d0_30: '0 a 30 dias',
      d31_60: '31 a 60 dias',
      d61_90: '61 a 90 dias',
      d91_180: '91 a 180 dias',
      d181_365: '181 a 365 dias',
      d365p: 'Acima de 365 dias'
    };
    
    let html = `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="bar-chart-3" style="width: 18px; color: #64748b;"></i> Faixa de Atraso (Aging)
          </h3>
        </div>
        <div style="padding: 20px;">
    `;
    
    Object.keys(agings).forEach(k => {
      const val = agings[k].value;
      const pct = atual.total_value > 0 ? (val / atual.total_value) * 100 : 0;
      html += `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.85rem; color: #334155;">
            <span>${labels[k]} (${agings[k].count} tít.)</span>
            <span style="font-weight: 600;">${formatMoney(val)} (${pct.toFixed(1)}%)</span>
          </div>
          <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: #f59e0b; border-radius: 4px;"></div>
          </div>
        </div>
      `;
    });
    
    html += `</div></div>`;
    return html;
  }
  
  function renderCentrosDeCusto() {
    const atual = getSnapshotAtual();
    if (!atual || !atual.data_json || !atual.data_json.companies) return '';
    
    const ccs = [];
    atual.data_json.companies.forEach(c => {
      if (c.cost_centers) {
        c.cost_centers.forEach(cc => {
          ccs.push({
            id: cc.id,
            count: cc.count,
            value: cc.value
          });
        });
      }
    });
    
    // Ordena do maior valor para o menor e pega top 15
    ccs.sort((a, b) => b.value - a.value);
    const topCcs = ccs.slice(0, 15);
    
    let html = `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="building-2" style="width: 18px; color: #64748b;"></i> Maiores Empreendimentos em Inadimplência
          </h3>
        </div>
        <div style="overflow-x: auto;">
          <table class="custom-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem;">Centro de Custo</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Qtd Títulos</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    topCcs.forEach(cc => {
      // Tentar pegar nome do cache
      let nome = cc.id;
      if (window.MouraAuth && window.MouraAuth.costCenters) {
         const found = window.MouraAuth.costCenters.find(x => String(x.id) === String(cc.id));
         if (found) nome = `${cc.id} - ${found.name.toUpperCase()}`;
      } else if (window.AppState && window.AppState.cachedCostCenters) {
         const found = window.AppState.cachedCostCenters.find(x => String(x.id) === String(cc.id));
         if (found) nome = `${cc.id} - ${found.name.toUpperCase()}`;
      }
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 20px; color: #334155; font-size: 0.85rem;">${nome}</td>
          <td style="padding: 12px 20px; text-align: right; color: #334155; font-size: 0.85rem;">${cc.count}</td>
          <td style="padding: 12px 20px; text-align: right; color: #334155; font-size: 0.85rem; font-weight: 500;">${formatMoney(cc.value)}</td>
        </tr>
      `;
    });
    
    html += `</tbody></table></div></div>`;
    return html;
  }
  
  async function render() {
    try {
      const container = document.getElementById('inadimplencia-dashboard-root');
      if (!container) return;
      
      container.innerHTML = `
        <div style="display: flex; justify-content: center; padding: 40px;">
          <div class="loader" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
      `;
      
      await carregarDados();
      
      if (snapshots.length === 0) {
        container.innerHTML = `
          <div style="background: #fff; padding: 40px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <i data-lucide="inbox" style="width: 48px; height: 48px; color: #94a3b8; margin-bottom: 15px;"></i>
            <h3 style="margin: 0 0 10px 0; color: #1e293b;">Nenhum histórico disponível</h3>
            <p style="color: #64748b; margin: 0;">O dashboard passará a ter dados após a primeira atualização da Fila de Cobrança.</p>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      
      let html = `
        <div style="max-width: 1200px; margin: 0 auto;">
          
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="window.DashboardInadimplencia.gerarRelatorioDiarioPdf()">
              <i data-lucide="file-text" style="width: 16px;"></i> Gerar Sprint Diário (PDF)
            </button>
          </div>

          ${renderCards()}
          
          <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
            <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="trending-up" style="width: 18px; color: #64748b;"></i> Evolução Diária da Inadimplência
              </h3>
            </div>
            <div style="padding: 20px; height: 350px;">
              <canvas id="inadimplencia-chart"></canvas>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px;">
            <div>
              ${renderTabelaComparativa()}
              ${renderAging()}
            </div>
            <div>
              ${renderCentrosDeCusto()}
            </div>
          </div>
        </div>
      `;
      
      container.innerHTML = html;
      
      // Atualiza ícones lucide
      if (window.lucide) {
        window.lucide.createIcons({
          root: container
        });
      }
      
      // Inicializa o Chart.js
      setTimeout(() => {
        initChart();
      }, 100);
    } catch(err) {
      console.error("Erro ao renderizar dashboard de inadimplência:", err);
      alert("ERRO NO DASHBOARD DE INADIMPLÊNCIA:\n\n" + err.message + "\n\nStack:\n" + err.stack);
    }
  }
  
  // Intercepta a ativação da aba
  const originalSwitchTab = window.switchTab;
  if (originalSwitchTab) {
    window.switchTab = function(tabId, title, fromSidebar) {
      originalSwitchTab(tabId, title, fromSidebar);
      if (tabId === 'inadimplencia_dashboard') {
        render();
      }
    };
  } else {
    // Se ainda não existir, cria um observer para quando existir
    setTimeout(() => {
        if (window.switchTab) {
            const os = window.switchTab;
            window.switchTab = function(tabId, title, fromSidebar) {
                os(tabId, title, fromSidebar);
                if (tabId === 'inadimplencia_dashboard') render();
            };
        }
    }, 1000);
  }

  async function salvarPosicaoHoje() {
    if (!window.AppState || !window.AppState.inadimplentes || window.AppState.inadimplentes.length === 0) {
      alert("Nenhum dado na fila de cobrança para salvar. Carregue os dados primeiro.");
      return;
    }
    if (confirm("Deseja salvar a posição atual da Fila de Cobrança como o snapshot de hoje?")) {
      try {
        await window.SiengeAPI.saveDefaultersSnapshot(window.AppState.inadimplentes);
        alert("Posição salva com sucesso!");
        await carregarDados(); // Recarrega para exibir no gráfico
        render();
      } catch (e) {
        alert("Erro ao salvar posição: " + e.message);
      }
    }
  }

  function gerarRelatorioDiarioPdf() {
    if (!window.rawClientList || window.rawClientList.length === 0) {
      alert("Nenhum dado na fila de cobrança para gerar o relatório. Carregue os dados primeiro.");
      return;
    }

    const bills = window.rawClientList;
    
    let totalOverdue = 0;
    let totalBills = 0;
    const uniqueClients = new Set();
    let sumMaxDaysDelay = 0;
    const companyData = {};
    const operatorData = {};
    const zeroPaidClients = [];
    
    bills.forEach(b => {
      totalOverdue += b.overdueValue || 0;
      uniqueClients.add(b.customerId);
      totalBills += (b.titles && b.titles.length > 0) ? b.titles.length : 1;
      sumMaxDaysDelay += (b.maxDaysDelay || 0);

      const delay = b.maxDaysDelay || 0;
      let delayBucket = '';
      if (delay <= 30) delayBucket = 'd30';
      else if (delay <= 60) delayBucket = 'd60';
      else if (delay <= 90) delayBucket = 'd90';
      else if (delay <= 120) delayBucket = 'd120';
      else delayBucket = 'd120p';

      // Empresa
      const compId = String(b.companyId || 'N/D');
      if (!companyData[compId]) {
         let compName = 'N/D';
         if (window.AppState && window.AppState.companies) {
             const cObj = window.AppState.companies.find(c => String(c.id) === compId);
             if (cObj) compName = cObj.tradeName || cObj.name || `EMPRESA ${compId}`;
         }
         if (compName === 'N/D' && typeof window.getCompanyName === 'function') compName = window.getCompanyName(compId);
         companyData[compId] = { id: compId, name: compName.toUpperCase(), totalBills: 0, totalValue: 0, d30_v: 0, d60_v: 0, d90_v: 0, d120_v: 0, d120p_v: 0, subjudice_v: 0 };
      }
      const comp = companyData[compId];
      comp.totalBills += (b.titles && b.titles.length > 0) ? b.titles.length : 1;
      comp.totalValue += (b.overdueValue || 0);
      if (b.subjudice === 'S') comp.subjudice_v += (b.overdueValue || 0);
      else comp[delayBucket + '_v'] += (b.overdueValue || 0);

      // Operador
      let opName = (b.assignedOperator || 'NÃO ATRIBUÍDO').toUpperCase().trim();
      if (!operatorData[opName]) {
          operatorData[opName] = { name: opName, d30_c:0,d30_v:0, d60_c:0,d60_v:0, d90_c:0,d90_v:0, d120_c:0,d120_v:0, d120p_c:0,d120p_v:0, total_c:0,total_v:0, customers:[] };
      }
        const op = operatorData[opName];
        const numTitulos = (b.titles && b.titles.length > 0) ? b.titles.length : 1;
        const bTitle = b.saleId || (b.billIds && b.billIds.length ? b.billIds[0] : '-');
        op.customers.push({ name: b.customerName || 'N/D', title: String(bTitle), value: b.overdueValue || 0, delay: b.maxDaysDelay || 0 });
        op.total_c += numTitulos; op.total_v += (b.overdueValue||0);
        op[delayBucket+'_c'] += numTitulos; op[delayBucket+'_v'] += (b.overdueValue||0);

      if (b.isZeroPaid) zeroPaidClients.push({ name: b.customerName || 'N/D', title: String(bTitle), delay: b.maxDaysDelay || 0, value: b.overdueValue || 0, billCount: Number(b.totalInstallmentsCount || b.billCount || (b.billIds && b.billIds.length) || 1), unitName: b.unitName, costCenterId: b.costCenterId });
    });

    const avgDelay = bills.length > 0 ? Math.round(sumMaxDaysDelay / bills.length) : 0;
    const dateStr = new Date().toLocaleDateString('pt-BR');

    const opSorted = Object.values(operatorData).sort((a,b) => b.total_v - a.total_v);

    const opTotals = { d30_c:0,d30_v:0,d60_c:0,d60_v:0,d90_c:0,d90_v:0,d120_c:0,d120_v:0,d120p_c:0,d120p_v:0,total_c:0,total_v:0 };
    opSorted.forEach(op => { ['d30','d60','d90','d120','d120p','total'].forEach(k => { opTotals[k+'_c'] += op[k+'_c']; opTotals[k+'_v'] += op[k+'_v']; }); });

    const fechSnapReal = snapshots.find(s => s.is_month_close) || snapshots[0];
    const dateSet = new Set();
    let chartSnaps = [];
    if (fechSnapReal) {
        chartSnaps.push(fechSnapReal);
        dateSet.add(fechSnapReal.date);
    }
    const lastSnaps = snapshots.slice(-30);
    lastSnaps.forEach(s => {
        if (!dateSet.has(s.date)) {
            dateSet.add(s.date);
            chartSnaps.push(s);
        } else {
            const idx = chartSnaps.findIndex(cs => cs.date === s.date && !cs.is_month_close);
            if (idx !== -1) chartSnaps[idx] = s;
        }
    });
    if (chartSnaps.length > 8) {
        chartSnaps = [chartSnaps[0], ...chartSnaps.slice(-7)];
    }
    const chartLabels = chartSnaps.map((s, i) => {
        if (i === 0 && s.is_month_close) return 'Fech.';
        if (s.date === snapshots[snapshots.length-1].date) return 'Hoje';
        if (s.date) {
            const parts = s.date.split('-');
            const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
            if (parts.length === 3) return `${parts[2]}/${months[parseInt(parts[1],10)-1]}`;
        }
        return `d-${chartSnaps.length - 1 - i}`;
    });
    const fechSnap = fechSnapReal;
    const hojeSnap = snapshots[snapshots.length-1];

    function fmtK(v) { if(!v) return 'R$ 0'; if(v>=1000000) return 'R$ '+(v/1000000).toFixed(1)+'M'; if(v>=1000) return 'R$ '+(v/1000).toFixed(0)+'K'; return formatMoney(v); }
    function fmtMoneyNoRs(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
    function fmtMoney(v) { return 'R$ ' + fmtMoneyNoRs(v); }
    function fmtInteiro(v) { return Math.floor(v).toLocaleString('pt-BR'); }
    function cellOp(c, v) { if(c===0) return '<span style="color:#cbd5e1;">—</span>'; return `<span style="font-weight:700;">${fmtMoneyNoRs(v)}</span><br><span style="font-size:7.5px;color:#64748b;">${c} tít.</span>`; }
    function cellOpTot(c, v, totC, totalValue, totalTitles) {
      if (c === 0) return '<span style="color:#cbd5e1;">—</span>';
      const pctValue = totalValue > 0 ? Math.round((v / totalValue) * 100) : 0;
      const pctTitles = totalTitles > 0 ? Math.round((c / totalTitles) * 100) : 0;
      return `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; white-space:nowrap;"><span style="font-weight:700; font-size:8px;">${fmtMoneyNoRs(v)} | ${pctValue}%</span><span style="font-size:7px;color:#ea580c;">${c} tít. | ${pctTitles}%</span></div>`;
    }
    
    function dualStackedBarWithArrow(snap1, snap2, label1, label2) {
      if (!snap1 || !snap2) return '';
      
      function getBands(snap) {
          let d30=0, d60=0, d90=0, d120=0, above120=0;
          if (snap && snap.data_json && snap.data_json.companies) {
              snap.data_json.companies.forEach(c => {
                  if (c.aging) {
                      d30 += (c.aging.d0_30 && c.aging.d0_30.value) || 0;
                      d60 += (c.aging.d31_60 && c.aging.d31_60.value) || 0;
                      d90 += (c.aging.d61_90 && c.aging.d61_90.value) || 0;
                      d120 += (c.aging.d91_180 && c.aging.d91_180.value) || 0;
                      above120 += ((c.aging.d181_365 && c.aging.d181_365.value) || 0) + ((c.aging.d365p && c.aging.d365p.value) || 0);
                  }
              });
          }
          if (d30===0 && d60===0 && d90===0) {
              d30 = snap.d30_value || 0;
              d60 = snap.d60_value || 0;
              d90 = snap.d90_value || 0;
              d120 = snap.d120_value || 0;
              above120 = snap.above120_value || 0;
          }
          return { d30, d60, d90, d120, above120 };
      }
      
      const b1Raw = getBands(snap1), b2Raw = getBands(snap2);
      const t1 = snap1.total_value || 1, t2 = snap2.total_value || 1;
      
      // Proporcional fallback para o fechamento se não tivermos histórico de aging
      if (b1Raw.d30 === 0 && b1Raw.d60 === 0 && b1Raw.d90 === 0 && snap1.total_value > 0) {
          const tot2 = b2Raw.d30 + b2Raw.d60 + b2Raw.d90 + b2Raw.d120 + b2Raw.above120 || 1;
          b1Raw.d30 = (b2Raw.d30 / tot2) * snap1.total_value;
          b1Raw.d60 = (b2Raw.d60 / tot2) * snap1.total_value;
          b1Raw.d90 = (b2Raw.d90 / tot2) * snap1.total_value;
          b1Raw.d120 = (b2Raw.d120 / tot2) * snap1.total_value;
          b1Raw.above120 = (b2Raw.above120 / tot2) * snap1.total_value;
      }
      
      const b1 = [
          {v: b1Raw.d30, color:'#22c55e'},
          {v: b1Raw.d60, color:'#eab308'},
          {v: b1Raw.d90, color:'#f97316'},
          {v: b1Raw.d120, color:'#ef4444'},
          {v: b1Raw.above120, color:'#991b1b'}
      ];
      const b2 = [
          {v: b2Raw.d30, color:'#22c55e'},
          {v: b2Raw.d60, color:'#eab308'},
          {v: b2Raw.d90, color:'#f97316'},
          {v: b2Raw.d120, color:'#ef4444'},
          {v: b2Raw.above120, color:'#991b1b'}
      ];
      
      const diff = t2 - t1;
      const pct = t1 ? ((diff / t1) * 100).toFixed(1) : 0;
      const sign = diff > 0 ? '+' : '';
      const diffText = `${sign}${(diff/1000000).toFixed(3).replace('.',',')} | ${sign}${pct}%`;
      
      const W = 320, H = 180, padTop = 50, padBot = 25, padSide = 80;
      const barW = 30;
      const x1 = padSide, x2 = W - padSide;
      
      const arrowY = 15;
      const arrowPath = `M ${x1} ${arrowY+6} L ${x1} ${arrowY} L ${x2} ${arrowY} L ${x2} ${arrowY+6}`;
      const arrowHead = `M ${x2-3.5} ${arrowY+2.5} L ${x2} ${arrowY+6} L ${x2+3.5} ${arrowY+2.5}`;
      const topArrowSvg = `
        <path d="${arrowPath}" fill="none" stroke="#0f1e17" stroke-width="1.5" />
        <path d="${arrowHead}" fill="none" stroke="#0f1e17" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="${W/2 - 45}" y="${arrowY - 10}" width="90" height="16" fill="#fff" />
        <text x="${W/2}" y="${arrowY + 3}" text-anchor="middle" font-size="10" font-weight="800" fill="#0f1e17">${diffText}</text>
      `;
      
      let rects = '';
      let y1 = 0;
      b1.forEach(b => { const h = (b.v/t1)*(H-padTop-padBot); rects += `<rect x="${x1 - barW/2}" y="${H-padBot-y1-h}" width="${barW}" height="${h}" fill="${b.color}"/>`; y1+=h; });
      let y2 = 0;
      b2.forEach(b => { const h = (b.v/t2)*(H-padTop-padBot); rects += `<rect x="${x2 - barW/2}" y="${H-padBot-y2-h}" width="${barW}" height="${h}" fill="${b.color}"/>`; y2+=h; });
      
      return `<svg width="${W}" height="${H}" style="overflow:visible;display:block;margin:0 auto;">
          ${topArrowSvg}
          ${rects}
          <text x="${x1}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="#64748b">${label1}</text>
          <text x="${x2}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="#64748b">${label2}</text>
          <text x="${x1}" y="${H-padBot-y1-5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${(t1/1000000).toFixed(3).replace('.',',')}</text>
          <text x="${x2}" y="${H-padBot-y2-5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${(t2/1000000).toFixed(3).replace('.',',')}</text>
      </svg>`;
    }

    function stackedBarSvg(snap, label) {
      if (!snap) return `<div style="text-align:center;color:#94a3b8;font-size:9px;">${label}<br>Sem dados</div>`;
      const total = snap.total_value || totalOverdue || 1;
      const bands = [{ v:snap.d30_value||0,color:'#3b82f6'},{v:snap.d60_value||0,color:'#22c55e'},{v:snap.d90_value||0,color:'#f59e0b'},{v:snap.d120_value||0,color:'#ef4444'},{v:snap.above120_value||0,color:'#7f1d1d'}];
      const H=140, W=44; let y=0;
      const rects = bands.map(b=>{ const h=(b.v/total)*H; const r=`<rect x="0" y="${H-y-h}" width="${W}" height="${h}" fill="${b.color}"/>`; y+=h; return r; }).join('');
      return `<div style="text-align:center;"><div style="font-size:8.5px;font-weight:700;color:#334155;margin-bottom:3px;">${fmtK(total)}</div><svg width="${W}" height="${H}" style="display:block;margin:0 auto;">${rects}</svg><div style="font-size:8.5px;color:#64748b;margin-top:3px;">${label}</div></div>`;
    }

    function barChartSvg(data, labels, color, isVal=false) {
      if (!data||data.length===0) return '';
      const maxVal = Math.max(...data, 1);
      const W = 320, H = 140, padTop = 45, padBot = 25, padSide = 40;
      const barCount = data.length;
      const stepX = (W - padSide * 2) / (barCount > 1 ? barCount - 1 : 1);
      const barWidth = Math.min(18, stepX * 0.5);
      
      let bars = '';
      let textLabels = '';
      let xLabels = '';
      
      const firstVal = data[0];
      const lastVal = data[data.length - 1];
      const diff = lastVal - firstVal;
      const pct = firstVal ? ((diff / firstVal) * 100).toFixed(1) : 0;
      const sign = diff > 0 ? '+' : '';
      
      const barColor = diff < 0 ? '#4ade80' : '#f87171';
      
      function formatVal(v) {
          if (!isVal) return v;
          return (v / 1000000).toFixed(3).replace('.', ',');
      }
      
      const diffStr = isVal ? formatVal(diff) : diff;
      const diffText = `${sign}${diffStr} | ${sign}${pct}%`;
      
      const arrowY = 15;
      const arrowStartX = padSide;
      const arrowEndX = W - padSide;
      const arrowPath = `M ${arrowStartX} ${arrowY+6} L ${arrowStartX} ${arrowY} L ${arrowEndX} ${arrowY} L ${arrowEndX} ${arrowY+6}`;
      const arrowHead = `M ${arrowEndX-3.5} ${arrowY+2.5} L ${arrowEndX} ${arrowY+6} L ${arrowEndX+3.5} ${arrowY+2.5}`;
      
      const topArrowSvg = `
        <path d="${arrowPath}" fill="none" stroke="#0f1e17" stroke-width="1.5" />
        <path d="${arrowHead}" fill="none" stroke="#0f1e17" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="${W/2 - 40}" y="${arrowY - 10}" width="80" height="16" fill="#fff" />
        <text x="${W/2}" y="${arrowY + 3}" text-anchor="middle" font-size="10" font-weight="800" fill="#0f1e17">${diffText}</text>
      `;

      data.forEach((v, i) => {
          const xCenter = padSide + i * stepX;
          const barH = (v / maxVal) * (H - padTop - padBot);
          const y = H - padBot - barH;
          
          let currentBarColor = '#94a3b8';
          if (labels[i] !== 'Fech.') {
              currentBarColor = (v <= firstVal) ? '#4ade80' : '#f87171';
          }
          
          bars += `<rect x="${xCenter - barWidth/2}" y="${y}" width="${barWidth}" height="${barH}" fill="${currentBarColor}" rx="2" />`;
          
          const valText = formatVal(v);
          textLabels += `<text x="${xCenter}" y="${y - 5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${valText}</text>`;
          
          xLabels += `<text x="${xCenter}" y="${H - 5}" text-anchor="middle" font-size="8.5" fill="#64748b">${labels[i]}</text>`;
      });
      
      const axisLine = `<line x1="${0}" y1="${H - padBot}" x2="${W}" y2="${H - padBot}" stroke="#e2e8f0" stroke-width="1.5" />`;

      return `<svg width="${W}" height="${H}" style="overflow:visible;display:block;margin:0 auto;">
          ${topArrowSvg}
          ${axisLine}
          ${bars}
          ${textLabels}
          ${xLabels}
      </svg>`;
    }

    zeroPaidClients.sort((a,b)=>b.delay-a.delay);
    const zeroPaidTotalValue = zeroPaidClients.reduce((acc,c)=>acc+c.value,0);
    const zeroPaidTotalTitles = zeroPaidClients.reduce((acc,c)=>acc+(c.billCount||1),0);
    const zeroPaidTop5 = zeroPaidClients.slice(0,5);
    
    const zeroPaidEmp = {};
    zeroPaidClients.forEach(c => {
        let emp = 'Outros';
        if (c.costCenterId && c.costCenterId !== 'N/D') {
            let ccName = '';
            if (window.AppState && window.AppState.cachedCostCenters) {
                const ccObj = window.AppState.cachedCostCenters.find(cc => String(cc.id) === String(c.costCenterId));
                if (ccObj) ccName = ccObj.name || '';
            }
            if (ccName) {
                ccName = ccName.trim().toUpperCase();
                // Se por acaso o nome já vier com o ID, removemos para padronizar
                if (ccName.startsWith(c.costCenterId + ' - ')) {
                    ccName = ccName.substring((c.costCenterId + ' - ').length).trim();
                } else if (ccName.startsWith(c.costCenterId + '-')) {
                    ccName = ccName.substring((c.costCenterId + '-').length).trim();
                }
            }
            emp = ccName ? `${c.costCenterId} - ${ccName}` : c.costCenterId;
        }
        if (!zeroPaidEmp[emp]) zeroPaidEmp[emp] = 0;
        zeroPaidEmp[emp] += (c.billCount||1);
    });
    const zeroPaidEmpListFull = Object.keys(zeroPaidEmp).map(k => ({ name: k, count: zeroPaidEmp[k] })).sort((a,b) => b.count - a.count);
    let zeroPaidEmpList = [];
    if (zeroPaidEmpListFull.length > 5) {
        zeroPaidEmpList = zeroPaidEmpListFull.slice(0, 4);
        const outrosCount = zeroPaidEmpListFull.slice(4).reduce((sum, item) => sum + item.count, 0);
        zeroPaidEmpList.push({ name: 'OUTROS', count: outrosCount });
    } else {
        zeroPaidEmpList = zeroPaidEmpListFull;
    }
    function getAbove31(snap) {
        let v = 0, c = 0;
        if (snap && snap.data_json && snap.data_json.companies) {
            snap.data_json.companies.forEach(comp => {
                if (comp.aging) {
                    ['d31_60', 'd61_90', 'd91_180', 'd181_365', 'd365p'].forEach(k => {
                        if (comp.aging[k]) {
                            v += comp.aging[k].value || 0;
                            c += comp.aging[k].count || 0;
                        }
                    });
                }
            });
        }
        // Se as propriedades sumadas derem zero, tenta usar os campos que já vinham calculados na raiz
        if (v === 0 && snap.above31_value) v = snap.above31_value;
        if (c === 0 && snap.above31_count) c = snap.above31_count;
        
        return { v, c };
    }
    
    const hojeSnapForFallback = chartSnaps[chartSnaps.length - 1];
    const hojeAbove31 = getAbove31(hojeSnapForFallback);

    const chart31v = chartSnaps.map(s => {
        let res = getAbove31(s);
        if (res.v === 0 && s.total_value > 0 && hojeSnapForFallback.total_value > 0) {
            res.v = (hojeAbove31.v / hojeSnapForFallback.total_value) * s.total_value;
            res.c = Math.round((hojeAbove31.c / hojeSnapForFallback.total_count) * s.total_count);
        }
        return res.v;
    });
    const chart31t = chartSnaps.map(s => {
        let res = getAbove31(s);
        if (res.v === 0 && s.total_value > 0 && hojeSnapForFallback.total_value > 0) {
            res.c = Math.round((hojeAbove31.c / hojeSnapForFallback.total_count) * s.total_count);
        }
        return res.c;
    });

    let ontemSnap = null;
    if (snapshots.length > 1) {
        const hojeDateStr = snapshots[snapshots.length-1].date;
        for (let i = snapshots.length - 2; i >= 0; i--) {
            const s = snapshots[i];
            if (s.date === hojeDateStr) continue;
            let isDiaUtil = true;
            if (s.date) {
                const d = new Date(s.date + 'T12:00:00');
                const day = d.getDay();
                if (day === 0 || day === 6) isDiaUtil = false; // Domingo ou Sábado
            }
            if (isDiaUtil) {
                ontemSnap = s;
                break;
            }
        }
        if (!ontemSnap) {
            ontemSnap = snapshots[snapshots.length - 2];
        }
    }

    let diffValueStr = "";
    let diffClientsStr = "";
    let diffBillsStr = "";
    
    if (ontemSnap) {
        const diffVal = totalOverdue - (ontemSnap.total_value || 0);
        if (Math.abs(diffVal) > 1) {
            const diffValFmt = Math.abs(diffVal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            diffValueStr = ` (${diffVal > 0 ? '+' : '-'} ${diffValFmt} do que o último dia útil)`;
        }
        
        let ontemTotCust = ontemSnap.total_customers;
        if (ontemTotCust === undefined && ontemSnap.data_json && ontemSnap.data_json.companies) {
            // Se não tem salvo, não temos como saber o numero exato de clientes unicos facilmente sem recalcular tudo,
            // mas o CRM agora salva total_customers.
        }
        
        if (ontemTotCust !== undefined) {
            const diffCli = uniqueClients.size - ontemTotCust;
            if (diffCli !== 0) {
                diffClientsStr = ` (${diffCli > 0 ? '+' : '-'} ${Math.abs(diffCli)} do que o último dia útil)`;
            }
        }
        
        if (ontemSnap.total_count !== undefined) {
            const diffTit = totalBills - ontemSnap.total_count;
            if (diffTit !== 0) {
                diffBillsStr = ` (${diffTit > 0 ? '+' : '-'} ${Math.abs(diffTit)} do que o último dia útil)`;
            }
        }
    }

    const teamsText = `📊 *Sprint Diário - ${dateStr}*\n💰 *Valor em Atraso:* ${fmtInteiro(totalOverdue)}${diffValueStr}\n👥 *Clientes em Atraso:* ${uniqueClients.size}${diffClientsStr}\n📄 *Títulos Vencidos:* ${totalBills}${diffBillsStr}\n⏱️ *Atraso Médio:* ${avgDelay} dias`;
    const teamsLink = `https://teams.microsoft.com/l/chat/19:1d1e6bd7448a479bace24f762a30b425@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D&message=${encodeURIComponent(teamsText)}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sprint Diário - ${dateStr}</title><style>
@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;padding:0;color:#1e293b;font-size:9.5px;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.2}
@media print{.no-print{display:none!important}body{background:white}}
.no-print{text-align:center;padding:10px;background:#0f1e17;display:flex;justify-content:center;gap:15px;}
.no-print button{padding:8px 24px;background:#22c55e;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);transition:opacity 0.2s}
.no-print button:hover{opacity:0.9}
h1{text-align:center;color:#0f1e17;margin:0 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.kpi-strip { display:grid; grid-template-columns: 60px repeat(4, 1fr); gap:10px; margin-bottom:10px; }
.kpi { display:flex; align-items:center; gap:8px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
.kpi-icon-wrapper { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.kpi.danger .kpi-icon-wrapper { background:#fee2e2; color:#ef4444; }
.kpi.warning .kpi-icon-wrapper { background:#fef3c7; color:#f59e0b; }
.kpi.success .kpi-icon-wrapper { background:#dcfce7; color:#10b981; }
.kpi.info .kpi-icon-wrapper { background:#e0f2fe; color:#3b82f6; }
.kpi-content { display:flex; flex-direction:column; gap:2px; }
.kpi-label { font-size:8.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.02em; }
.kpi-value { font-size:16px; font-weight:800; color:#0f1e17; line-height:1; }
.row-2{display:grid;grid-template-columns: 60px repeat(4, 1fr);gap:10px;margin-bottom:10px;align-items:stretch}
.bar-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px}
.bar-title{font-size:9.5px;font-weight:700;color:#334155;margin-bottom:4px}
.bar-delta{font-size:11px;font-weight:800;color:#16a34a;margin-bottom:6px}
.bars-row{display:flex;gap:20px;justify-content:center;align-items:flex-end}
.legend-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;justify-content:center}
.legend-item{display:flex;align-items:center;gap:4px;font-size:8px;color:#64748b}
.legend-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.op-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;padding:4px 6px;font-size:8px;font-weight:700;color:#475569;text-transform:uppercase;border-bottom:2px solid #e2e8f0;text-align:center}
th.L{text-align:left}
td{padding:4px 6px;font-size:8.5px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle}
td.L{text-align:left;font-weight:700;color:#1e293b;white-space:nowrap;}
tr:nth-child(even) td{background:#fafafa}
tr.tot td{background:#fff7ed!important;font-weight:800;color:#c2410c;border-top:2px solid #fed7aa}
.trends-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.trend-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px}
.trend-title{font-size:9px;font-weight:700;color:#334155;text-align:center;margin-bottom:6px}
.summary-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.sbox{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
.stag{display:inline-block;font-size:9px;font-weight:800;color:#fff;padding:2px 10px;border-radius:12px;margin-bottom:6px}
.sstat{font-size:9px;color:#475569;line-height:1.8}
.sstat strong{color:#1e293b}
.sright table{margin:0}
.sright td{padding:3px 6px;font-size:9px;border:none;border-bottom:1px solid #f1f5f9}
.sright td:first-child{text-align:left;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sright td:last-child{text-align:right;color:#dc2626;font-weight:700}
.op-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.op-card{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
.op-head{background:#fff7ed;color:#ea580c;padding:3px;font-size:8px;font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #ea580c;}
.op-card table{width:100%;border-collapse:collapse;margin:0;font-size:6.5px}
.op-card th{padding:2px 4px;border-bottom:1px solid #f1f5f9;color:#64748b;font-weight:700;text-align:left;}
.op-card td{padding:2px 4px;border-bottom:1px solid #f1f5f9;color:#334155}
.op-card td:nth-child(1){font-weight:700;color:#64748b;max-width:35px;overflow:hidden;text-overflow:ellipsis;}
.op-card td:nth-child(2){font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;}
.op-card td:last-child{text-align:right;font-weight:800;color:#1e293b}
</style>
<script>
    function sendToTeams() {
        const txt = \`${teamsText.replace(/`/g, "\\`").replace(/\\/g, "\\\\")}\`;
        navigator.clipboard.writeText(txt).then(() => {
            alert("O texto padrão foi copiado para a área de transferência (Ctrl+C)!\\n\\nSalve o PDF na próxima tela e cole-o na janela do Teams que será aberta a seguir.");
            window.print();
            setTimeout(() => { window.open('${teamsLink}', '_blank'); }, 1000);
        }).catch(e => {
            console.error("Erro ao copiar", e);
            window.print();
            setTimeout(() => { window.open('${teamsLink}', '_blank'); }, 1000);
        });
    }
</script>
</head><body>
<div class="no-print">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="sendToTeams()" style="background:#464eb8;">💬 Enviar por Teams</button>
</div>
<h1>Sprint Diário — Inadimplência &nbsp;·&nbsp; ${dateStr}</h1>
<div class="kpi-strip">
  <div style="display:flex; align-items:center; justify-content:center; padding: 0 5px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;">
    <img src="https://yt3.googleusercontent.com/rx0DOaXFXLF0HHeZtC_xI7vR23Y7Jxmm7gA6o_emTX6qFNIDo3J91z11ASXDNypT57crV1EPOQ=s900-c-k-c0x00ffffff-no-rj" style="width: 45px; height: 45px; object-fit: contain; border-radius: 50%;">
  </div>
  <div class="kpi danger"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div><div class="kpi-content"><span class="kpi-label">Valor em Atraso</span><span class="kpi-value">${fmtInteiro(totalOverdue)}</span></div></div>
  <div class="kpi warning"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div><div class="kpi-content"><span class="kpi-label">Clientes em Atraso</span><span class="kpi-value">${uniqueClients.size}</span></div></div>
  <div class="kpi success"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div><div class="kpi-content"><span class="kpi-label">Títulos Vencidos</span><span class="kpi-value">${totalBills}</span></div></div>
  <div class="kpi info"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div><div class="kpi-content"><span class="kpi-label">Atraso Médio</span><span class="kpi-value">${avgDelay} dias</span></div></div>
</div>
<div class="row-2">
  <div class="bar-panel" style="display:flex; flex-direction:column; justify-content:space-between; height: 100%; grid-column: 1 / 3;">
    <div style="background: #ea580c; color: white; padding: 8px; font-size: 9px; font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin: -8px -8px 8px -8px; border-top-left-radius: 6px; border-top-right-radius: 6px;">VALOR EM ATRASO (EM MILHÕES)</div>
    <div class="bars-row">${dualStackedBarWithArrow(fechSnap, hojeSnap, 'Fech.', 'Hoje')}</div>
    <div class="legend-row">
      <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>até 30</div>
      <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div>31-60</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>61-90</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>91-120</div>
      <div class="legend-item"><div class="legend-dot" style="background:#991b1b"></div>ac.120</div>
    </div>
  </div>
  <div class="op-wrap" style="grid-column: 3 / 6;">
    <table class="tb" style="width:100%; height:100%; border-collapse:separate; border-spacing:0; margin-top:0;">
    <thead><tr><th class="L" style="padding:8px; background: #ea580c; color: white !important; border-top-left-radius: 5px;">Operador</th><th style="padding:8px; background: #ea580c; color: white !important;">Até 30</th><th style="padding:8px; background: #ea580c; color: white !important;">31 a 60</th><th style="padding:8px; background: #ea580c; color: white !important;">61 a 90</th><th style="padding:8px; background: #ea580c; color: white !important;">91 a 120</th><th style="padding:8px; background: #ea580c; color: white !important;">Acima 120</th><th style="padding:8px; background: #ea580c; color: white !important; border-top-right-radius: 5px;">Total</th></tr></thead>
    <tbody>
      ${opSorted.map((op, idx)=>`<tr style="background:${idx%2===0?'#ffffff':'#ffedd5'}"><td class="L">${op.name !== 'NÃO ATRIBUÍDO' && op.name.split(' ').length > 1 ? op.name.split(' ')[0] + ' ' + op.name.split(' ')[1][0] + '.' : op.name.split(' ')[0]}</td><td>${cellOp(op.d30_c,op.d30_v)}</td><td>${cellOp(op.d60_c,op.d60_v)}</td><td>${cellOp(op.d90_c,op.d90_v)}</td><td>${cellOp(op.d120_c,op.d120_v)}</td><td>${cellOp(op.d120p_c,op.d120p_v)}</td><td><span style="font-weight:800">${fmtMoneyNoRs(op.total_v)}</span><br><span style="font-size:7.5px;color:#64748b">${op.total_c} tít.</span></td></tr>`).join('')}
      <tr class="tot" style="background:#ffedd5; border-top:2px solid #fdba74;"><td class="L" style="color:#ea580c; border-bottom-left-radius: 5px;">Total</td><td>${cellOpTot(opTotals.d30_c,opTotals.d30_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d60_c,opTotals.d60_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d90_c,opTotals.d90_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d120_c,opTotals.d120_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d120p_c,opTotals.d120p_v,opTotals.total_c, totalOverdue, totalBills)}</td><td style="border-bottom-right-radius: 5px;"><div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; white-space:nowrap;"><span style="font-weight:800;color:#ea580c; font-size:8px;">${fmtMoneyNoRs(opTotals.total_v)} | ${Math.round((opTotals.total_v / (totalOverdue || 1)) * 100)}%</span><span style="font-size:7px;color:#ea580c">${opTotals.total_c} tít. | ${Math.round((opTotals.total_c / (totalBills || 1)) * 100)}%</span></div></td></tr>
    </tbody>
  </table></div>
</div>
<div style="margin-bottom:12px;">
  <div style="background: linear-gradient(135deg, #f97316 0%, #c2410c 100%); border-radius:8px; padding:12px; color:white; display:flex; flex-direction:column; box-shadow:0 4px 6px rgba(249, 115, 22, 0.2);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">📅 Títulos com 31 dias de atraso ou mais</div>
      <div style="font-size:12px; font-weight:700;">${chart31t[chart31t.length-1] || 0} Títulos <span style="font-size:10px; font-weight:500;">(${(((chart31t[chart31t.length-1] || 0) / (totalBills || 1)) * 100).toFixed(1)}% do total de Títulos)</span></div>
      <div style="font-size:12px; font-weight:800;">Total: ${fmtMoneyNoRs(chart31v[chart31v.length-1] || 0)}</div>
    </div>
    <div style="background:rgba(255,255,255,0.95); border-radius:6px; padding:10px; display:flex; gap:15px; justify-content:space-around;">
      <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
          <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Título</div>
          ${barChartSvg(chart31t, chartLabels, '#c2410c', false)}
      </div>
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; border-left:1px solid #e2e8f0;">
          <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Valores (em milhões)</div>
          ${barChartSvg(chart31v, chartLabels, '#c2410c', true)}
      </div>
    </div>
  </div>
</div>
<div style="margin-bottom:12px;">
  <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border-radius:8px; padding:12px; color:white; display:flex; flex-direction:column; box-shadow:0 4px 6px rgba(239, 68, 68, 0.2);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">💸 0% Pago</div>
      <div style="font-size:12px; font-weight:700;">${zeroPaidTotalTitles} Títulos <span style="font-size:10px; font-weight:500;">(${((zeroPaidTotalTitles / (totalBills || 1)) * 100).toFixed(1)}% do total de Títulos)</span></div>
      <div style="font-size:12px; font-weight:800;">Total: ${fmtMoneyNoRs(zeroPaidTotalValue)}</div>
    </div>
    <div style="background:rgba(255,255,255,0.95); border-radius:6px; padding:10px; display:flex; gap:15px;">
      <div style="flex:1;">
        <table style="width:100%; border-collapse:collapse; font-size:8.5px; color:#1e293b;">
          <thead>
            <tr><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Título</th><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Cliente</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Dias em Atraso</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Parcelas</th></tr>
          </thead>
          <tbody>
            ${zeroPaidTop5.map(c=>`<tr><td class="L" style="padding:4px;">${c.title || '-'}</td><td class="L" style="padding:4px;">${c.name.split(' ').slice(0,3).join(' ')}</td><td style="padding:4px;text-align:center;">${c.delay}</td><td style="padding:4px;text-align:center;">${c.billCount}</td></tr>`).join('')}
            ${zeroPaidTop5.length===0?'<tr><td colspan="4" style="padding:10px 0; color:#94a3b8; text-align:center;">Nenhum título 0% pago</td></tr>':''}
          </tbody>
        </table>
      </div>
      <div style="width:1px; background:#0284c7; opacity: 0.3;"></div>
      <div style="flex:1;">
        <table style="width:100%; border-collapse:collapse; font-size:8.5px; color:#1e293b;">
          <thead>
            <tr><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Empreendimento</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;text-align:center;font-weight:700;text-transform:none;">Título</th></tr>
          </thead>
          <tbody>
            ${zeroPaidEmpList.slice(0,6).map(e=>`<tr><td class="L" style="padding:4px;">${e.name}</td><td style="padding:4px;text-align:center;">${e.count}</td></tr>`).join('')}
            ${zeroPaidEmpList.length===0?'<tr><td colspan="2" style="padding:10px 0; color:#94a3b8; text-align:center;">Nenhum empreendimento</td></tr>':''}
          </tbody>

        </table>
      </div>
    </div>
  </div>
</div>
<div style="background: #fff7ed; border-top: 3px solid #ea580c; color: #ea580c; padding: 4px 10px; border-radius: 6px; margin-bottom: 4px; font-weight: 800; font-size: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><i class="fas fa-trophy" style="margin-right: 8px; color: #ea580c;"></i> TOP 5 TÍTULOS COM MAIORES VALORES EM ATRASO POR OPERADOR</div>
<div class="op-grid">
  ${opSorted.filter(op=>op.customers.length>0).map(op=>{
    op.customers.sort((a,b)=>b.value-a.value);
    const top5=op.customers.slice(0,5);
    const totalTop5 = top5.reduce((sum, c) => sum + c.value, 0);
    return `<div class="op-card"><div class="op-head">${op.name.split(' ').slice(0,2).join(' ')}</div><table><thead><tr><th style="text-align:left">TÍTULO</th><th style="text-align:left">CLIENTE</th><th style="text-align:right">VALOR</th></tr></thead><tbody>${top5.map(c=>`<tr><td style="text-align:left">${c.title || '-'}</td><td style="text-align:left">${c.name.split(' ').slice(0,3).join(' ')}</td><td>${fmtMoneyNoRs(c.value)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2" style="text-align:left;font-weight:800;border-top:1px solid #ea580c;color:#ea580c;padding-top:4px;">Total</td><td style="font-weight:800;color:#ea580c;border-top:1px solid #ea580c;padding-top:4px;text-align:right;">${fmtMoneyNoRs(totalTop5)}</td></tr></tfoot></table></div>`;
  }).join('')}
</div>
<div style="background: #fff7ed; border-bottom: 3px solid #ea580c; padding: 4px 10px; border-radius: 6px; margin-top: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); height: 8px;"></div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert("Navegador bloqueou a abertura da nova aba! Por favor, libere os pop-ups.");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  return {
    render,
    salvarPosicaoHoje,
    gerarRelatorioDiarioPdf
  };
})();
window.DashboardInadimplencia = DashboardInadimplencia;
