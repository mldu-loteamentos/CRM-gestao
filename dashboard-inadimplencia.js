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
         if (found) nome = `${cc.id} - ${found.name}`;
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
      comp.totalBills += (b.billCount || 1);
      comp.totalValue += (b.overdueValue || 0);
      if (b.subjudice === 'S') comp.subjudice_v += (b.overdueValue || 0);
      else comp[delayBucket + '_v'] += (b.overdueValue || 0);

      // Operador
      let opName = (b.assignedOperator || 'NÃO ATRIBUÍDO').toUpperCase().trim();
      if (!operatorData[opName]) {
          operatorData[opName] = { name: opName, d30_c:0,d30_v:0, d60_c:0,d60_v:0, d90_c:0,d90_v:0, d120_c:0,d120_v:0, d120p_c:0,d120p_v:0, total_c:0,total_v:0, customers:[] };
      }
        const op = operatorData[opName];
        op.customers.push({ name: b.customerName || 'N/D', title: (b.titles && b.titles.length) ? b.titles.join(', ') : (b.documentNumber || b.id || ''), value: b.overdueValue || 0, delay: b.maxDaysDelay || 0 });
        const numTitulos = (b.titles && b.titles.length > 0) ? b.titles.length : 1;
        op.total_c += numTitulos; op.total_v += (b.overdueValue||0);
        op[delayBucket+'_c'] += numTitulos; op[delayBucket+'_v'] += (b.overdueValue||0);

      if (b.isZeroPaid) zeroPaidClients.push({ name: b.customerName || 'N/D', delay: b.maxDaysDelay || 0, value: b.overdueValue || 0 });
      if (b.subjudice === 'S') {
          if (!window._subjudiceClientsList) window._subjudiceClientsList = [];
          window._subjudiceClientsList.push({ name: b.customerName || 'N/D', value: b.overdueValue || 0, delay: b.maxDaysDelay || 0, billCount: (b.titles && b.titles.length > 0) ? b.titles.length : 1 });
      }
    });

    const avgDelay = bills.length > 0 ? Math.round(sumMaxDaysDelay / bills.length) : 0;
    const dateStr = new Date().toLocaleDateString('pt-BR');

    const opSorted = Object.values(operatorData).sort((a,b) => b.total_v - a.total_v);
    
    let subjudiceClientsList = window._subjudiceClientsList || [];
    window._subjudiceClientsList = []; // clear for next run
    const subjudiceTotal = subjudiceClientsList.reduce((acc, c) => ({ c: acc.c + c.billCount, v: acc.v + c.value }), { c:0, v:0 });
    const subjudiceClients = subjudiceClientsList.sort((a,b) => b.value - a.value);

    const opTotals = { d30_c:0,d30_v:0,d60_c:0,d60_v:0,d90_c:0,d90_v:0,d120_c:0,d120_v:0,d120p_c:0,d120p_v:0,total_c:0,total_v:0 };
    opSorted.forEach(op => { ['d30','d60','d90','d120','d120p','total'].forEach(k => { opTotals[k+'_c'] += op[k+'_c']; opTotals[k+'_v'] += op[k+'_v']; }); });

    const snaps = snapshots.slice(-8);
    const snapLabels = snaps.map((s,i) => { if(s.is_month_close) return 'Fecham.'; const diff=snaps.length-1-i; return diff===0?'Hoje':`d-${diff}`; });
    const fechSnap = snaps.find(s=>s.is_month_close) || snaps[0];
    const hojeSnap = snaps[snaps.length-1];

    function fmtK(v) { if(!v) return 'R$ 0'; if(v>=1000000) return 'R$ '+(v/1000000).toFixed(1)+'M'; if(v>=1000) return 'R$ '+(v/1000).toFixed(0)+'K'; return formatMoney(v); }
    function fmtMoneyNoRs(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function cellOp(c, v) { if(c===0) return '<span style="color:#cbd5e1;">—</span>'; return `<span style="font-weight:700;">${fmtMoneyNoRs(v)}</span><br><span style="font-size:7.5px;color:#64748b;">${c} cliente${c>1?'s':''}</span>`; }

    function stackedBarSvg(snap, label) {
      if (!snap) return `<div style="text-align:center;color:#94a3b8;font-size:9px;">${label}<br>Sem dados</div>`;
      const total = snap.total_value || totalOverdue || 1;
      const bands = [{ v:snap.d30_value||0,color:'#3b82f6'},{v:snap.d60_value||0,color:'#22c55e'},{v:snap.d90_value||0,color:'#f59e0b'},{v:snap.d120_value||0,color:'#ef4444'},{v:snap.above120_value||0,color:'#7f1d1d'}];
      const H=140, W=44; let y=0;
      const rects = bands.map(b=>{ const h=(b.v/total)*H; const r=`<rect x="0" y="${H-y-h}" width="${W}" height="${h}" fill="${b.color}"/>`; y+=h; return r; }).join('');
      return `<div style="text-align:center;"><div style="font-size:8.5px;font-weight:700;color:#334155;margin-bottom:3px;">${fmtK(total)}</div><svg width="${W}" height="${H}" style="display:block;margin:0 auto;">${rects}</svg><div style="font-size:8.5px;color:#64748b;margin-top:3px;">${label}</div></div>`;
    }

    function sparklineSvg(data, color) {
      if (!data || data.length < 2 || !data.some(v=>v>0)) return '<div style="color:#94a3b8;font-size:9px;text-align:center;padding:20px 0;">Sem dados históricos</div>';
      const max=Math.max(...data)||1, min=Math.min(...data);
      const W=280, H=55, pad=12;
      const pts = data.map((v,i)=>{ const x=pad+(i/(data.length-1))*(W-pad*2); const y=H-pad-((v-min)/(max-min||1))*(H-pad*2); return `${x},${y}`; }).join(' ');
      const dotPts = data.map((v,i)=>{ const x=pad+(i/(data.length-1))*(W-pad*2); const y=H-pad-((v-min)/(max-min||1))*(H-pad*2); return {x,y,v}; });
      const dots = dotPts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="white" stroke-width="1.5"/><text x="${p.x}" y="${p.y-7}" text-anchor="middle" font-size="7.5" fill="#334155">${fmtK(p.v)}</text>`).join('');
      const labels = (snapLabels||[]).map((l,i)=>`<text x="${pad+(i/(data.length-1))*(W-pad*2)}" y="${H+10}" text-anchor="middle" font-size="7.5" fill="#94a3b8">${l}</text>`).join('');
      return `<svg width="${W}" height="${H+14}" style="overflow:visible;display:block;margin:0 auto;"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`;
    }

    zeroPaidClients.sort((a,b)=>b.delay-a.delay);
    const zeroPaidTotalValue = zeroPaidClients.reduce((acc,c)=>acc+c.value,0);
    const zeroPaidTop5 = zeroPaidClients.slice(0,5);
    subjudiceClients.sort((a,b)=>b.value-a.value);
    const subjudiceTop5 = subjudiceClients.slice(0,5);
    const spark31v = snaps.map(s=>s.above31_value||0);
    const spark31t = snaps.map(s=>s.above31_count||0);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sprint Diário - ${dateStr}</title><style>
@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;padding:0;color:#1e293b;font-size:10px;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.no-print{display:none!important}body{background:white}}
.no-print{text-align:center;padding:8px;background:#0f1e17}
.no-print button{padding:7px 24px;background:#22c55e;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:700;font-size:11px}
h1{text-align:center;color:#0f1e17;margin:0 0 10px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:15px; margin-bottom:15px; }
.kpi { display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
.kpi-icon-wrapper { width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.kpi.danger .kpi-icon-wrapper { background:#fee2e2; color:#ef4444; }
.kpi.warning .kpi-icon-wrapper { background:#fef3c7; color:#f59e0b; }
.kpi.success .kpi-icon-wrapper { background:#dcfce7; color:#10b981; }
.kpi.info .kpi-icon-wrapper { background:#e0f2fe; color:#3b82f6; }
.kpi-content { display:flex; flex-direction:column; gap:4px; }
.kpi-label { font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.02em; }
.kpi-value { font-size:20px; font-weight:800; color:#0f1e17; line-height:1; }
.row-2{display:grid;grid-template-columns:1fr 2fr;gap:15px;margin-bottom:15px;align-items:start}
.bar-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px}
.bar-title{font-size:10px;font-weight:700;color:#334155;margin-bottom:4px}
.bar-delta{font-size:12px;font-weight:800;color:#16a34a;margin-bottom:10px}
.bars-row{display:flex;gap:30px;justify-content:center;align-items:flex-end}
.legend-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;justify-content:center}
.legend-item{display:flex;align-items:center;gap:4px;font-size:8.5px;color:#64748b}
.legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.op-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;padding:6px 8px;font-size:8.5px;font-weight:700;color:#475569;text-transform:uppercase;border-bottom:2px solid #e2e8f0;text-align:center}
th.L{text-align:left}
td{padding:6px 8px;font-size:9px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle}
td.L{text-align:left;font-weight:700;color:#1e293b}
tr:nth-child(even) td{background:#fafafa}
tr.tot td{background:#fff7ed!important;font-weight:800;color:#c2410c;border-top:2px solid #fed7aa}
.trends-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.trend-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
.trend-title{font-size:9.5px;font-weight:700;color:#334155;text-align:center;margin-bottom:8px}
.summary-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.sbox{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}
.stag{display:inline-block;font-size:9px;font-weight:800;color:#fff;padding:2px 10px;border-radius:12px;margin-bottom:6px}
.sstat{font-size:9px;color:#475569;line-height:1.8}
.sstat strong{color:#1e293b}
.sright table{margin:0}
.sright td{padding:3px 6px;font-size:9px;border:none;border-bottom:1px solid #f1f5f9}
.sright td:first-child{text-align:left;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sright td:last-child{text-align:right;color:#dc2626;font-weight:700}
.op-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.op-card{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
      .op-head{background:#f8fafc;color:#1e4620;padding:8px;font-size:10px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #22c55e;}
      .op-card table{width:100%;border-collapse:collapse;margin:0;font-size:8.5px}
      .op-card td{padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#334155}
      .op-card td:first-child{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;font-weight:600;color:#1e293b}
      .op-card td:last-child{text-align:right;font-weight:800;color:#1e4620}
</style></head><body>
<div class="no-print"><button onclick="window.print()">🖨️ Imprimir Sprint Diário</button></div>
<h1>Sprint Diário — Inadimplência &nbsp;·&nbsp; ${dateStr}</h1>
<div class="kpi-strip">
  <div class="kpi danger"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div><div class="kpi-content"><span class="kpi-label">Valor em Atraso</span><span class="kpi-value">${fmtK(totalOverdue)}</span></div></div>
  <div class="kpi warning"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div><div class="kpi-content"><span class="kpi-label">Clientes em Atraso</span><span class="kpi-value">${uniqueClients.size}</span></div></div>
  <div class="kpi success"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div><div class="kpi-content"><span class="kpi-label">Títulos Vencidos</span><span class="kpi-value">${totalBills}</span></div></div>
  <div class="kpi info"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div><div class="kpi-content"><span class="kpi-label">Atraso Médio</span><span class="kpi-value">${avgDelay} dias</span></div></div>
</div>
<div class="row-2">
  <div class="bar-panel">
    <div class="bar-title">Valor em Atraso</div>
    ${fechSnap&&hojeSnap?`<div class="bar-delta">+ ${fmtK(Math.abs(hojeSnap.total_value-fechSnap.total_value))} | ${(((hojeSnap.total_value-fechSnap.total_value)/(fechSnap.total_value||1))*100).toFixed(1)}%</div>`:''}
    <div class="bars-row">${stackedBarSvg(fechSnap,'Fechamento')}${stackedBarSvg(hojeSnap,'Hoje')}</div>
    <div class="legend-row">
      <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div>até 30</div>
      <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>31-60</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>61-90</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>91-120</div>
      <div class="legend-item"><div class="legend-dot" style="background:#7f1d1d"></div>ac.120</div>
    </div>
  </div>
  <div class="op-wrap"><table>
    <thead><tr><th class="L">Operador</th><th>Até 30</th><th>31 a 60</th><th>61 a 90</th><th>91 a 120</th><th>Acima 120</th><th>Total</th></tr></thead>
    <tbody>
      ${opSorted.map(op=>`<tr><td class="L">${op.name.split(' ')[0]}</td><td>${cellOp(op.d30_c,op.d30_v)}</td><td>${cellOp(op.d60_c,op.d60_v)}</td><td>${cellOp(op.d90_c,op.d90_v)}</td><td>${cellOp(op.d120_c,op.d120_v)}</td><td>${cellOp(op.d120p_c,op.d120p_v)}</td><td><span style="font-weight:800">${fmtMoneyNoRs(op.total_v)}</span><br><span style="font-size:7.5px;color:#64748b">${op.total_c} tít.</span></td></tr>`).join('')}
      <tr class="tot"><td class="L">Total</td><td>${cellOp(opTotals.d30_c,opTotals.d30_v)}</td><td>${cellOp(opTotals.d60_c,opTotals.d60_v)}</td><td>${cellOp(opTotals.d90_c,opTotals.d90_v)}</td><td>${cellOp(opTotals.d120_c,opTotals.d120_v)}</td><td>${cellOp(opTotals.d120p_c,opTotals.d120p_v)}</td><td>${fmtMoneyNoRs(opTotals.total_v)}</td></tr>
    </tbody>
  </table></div>
</div>
<div class="trends-row">
  <div class="trend-panel"><div class="trend-title">Acima 31 dias — valores</div>${sparklineSvg(spark31v,'#f59e0b')}</div>
  <div class="trend-panel"><div class="trend-title">Acima 31 dias — títulos</div>${sparklineSvg(spark31t,'#3b82f6')}</div>
</div>
<div class="summary-row">
  <div class="sbox">
    <div><span class="stag" style="background:#dc2626">0% pago</span><div class="sstat">Total de clientes: <strong>${zeroPaidClients.length}</strong><br>Valor total: <strong>${fmtK(zeroPaidTotalValue)}</strong></div></div>
    <div class="sleft"><table><tbody>${zeroPaidTop5.map(c=>`<tr><td>${c.name.split(' ').slice(0,2).join(' ')} <span style="color:#64748b;font-size:7.5px">${c.title ? '['+c.title+']' : ''}</span></td><td>${fmtK(c.value)}</td></tr>`).join('')}${zeroPaidTop5.length===0?'<tr><td colspan="2" style="color:#94a3b8;text-align:center">Nenhum</td></tr>':''}</tbody></table></div>
  </div>
  <div class="sbox">
    <div><span class="stag" style="background:#7c3aed">Sub judice</span><div class="sstat">Total de clientes: <strong>${subjudiceClients.length}</strong><br>Valor total: <strong>${fmtK(subjudiceTotal.v)}</strong></div></div>
    <div class="sleft"><table><tbody>${subjudiceTop5.map(c=>`<tr><td>${c.name.split(' ').slice(0,3).join(' ')} <span style="color:#64748b;font-size:7.5px">${c.title ? '['+c.title+']' : ''}</span></td><td>${fmtK(c.value)}</td></tr>`).join('')}${subjudiceTop5.length===0?'<tr><td colspan="2" style="color:#94a3b8;text-align:center">Nenhum</td></tr>':''}</tbody></table></div>
  </div>
</div>
<div style="background: #e6f4ea; border-top: 3px solid #1e4620; color: #1e4620; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; font-weight: 700; font-size: 14px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"><i class="fas fa-trophy" style="margin-right: 10px; color: #fbbf24;"></i> TOP 5 TÍTULOS COM MAIORES VALORES EM ATRASO POR OPERADOR</div>
<div class="op-grid">
  ${opSorted.filter(op=>op.customers.length>0).map(op=>{
    op.customers.sort((a,b)=>b.value-a.value);
    const top5=op.customers.slice(0,5);
    const totalTop5 = top5.reduce((sum, c) => sum + c.value, 0);
    return \`<div class="op-card"><div class="op-head">\${op.name.split(' ').slice(0,2).join(' ')}</div><table><tbody>\${top5.map(c=>\`<tr><td>\${c.name.split(' ').slice(0,3).join(' ')} <span style="color:#64748b;font-size:7.5px">\${c.title ? '['+c.title+']' : ''}</span></td><td>\${fmtMoney(c.value)}</td></tr>\`).join('')}</tbody><tfoot><tr><td style="text-align:right;font-weight:bold;">Total Top 5:</td><td style="font-weight:bold;color:#0f1e17;">\${fmtMoneyNoRs(totalTop5)}</td></tr></tfoot></table></div>\`;
  }).join('')}
</div>
</body></html>\`;

    const win = window.open('', '_blank');
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
