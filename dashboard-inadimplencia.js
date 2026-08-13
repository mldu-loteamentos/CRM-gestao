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
    
    // 1. KPI Totals
    let totalOverdue = 0;
    let totalBills = 0;
    const uniqueClients = new Set();
    let sumMaxDaysDelay = 0;
    
    // 2. Por Empresa/Empreendimento (costCenterId)
    const companyData = {};
    
    // 3. Por Operador
    const operatorData = {};
    
    // 4. Zero Paid
    const zeroPaidClients = [];
    
    bills.forEach(b => {
      // Basic KPIs
      totalOverdue += b.overdueValue || 0;
      uniqueClients.add(b.customerId);
      totalBills += (b.billCount || 1);
      sumMaxDaysDelay += (b.maxDaysDelay || 0);

      const delay = b.maxDaysDelay || 0;
      let delayBucketCompany = '';
      if (delay <= 30) delayBucketCompany = 'd30';
      else if (delay <= 60) delayBucketCompany = 'd60';
      else if (delay <= 90) delayBucketCompany = 'd90';
      else if (delay <= 120) delayBucketCompany = 'd120';
      else delayBucketCompany = 'd120p';

      // 1. Empresa / Empreendimento
      const ccId = String(b.costCenterId || 'N/D');
      if (!companyData[ccId]) {
         let ccName = 'N/D';
         if (window.AppState && window.AppState.cachedCostCenters) {
             const ccObj = window.AppState.cachedCostCenters.find(cc => String(cc.id) === ccId);
             if (ccObj && ccObj.name) ccName = ccObj.name.toUpperCase();
         }
         companyData[ccId] = {
            id: ccId,
            name: ccName,
            totalBills: 0,
            totalValue: 0,
            d30_v: 0, d60_v: 0, d90_v: 0, d120_v: 0, d120p_v: 0,
            subjudice_v: 0
         };
      }
      
      const comp = companyData[ccId];
      comp.totalBills += (b.billCount || 1);
      comp.totalValue += (b.overdueValue || 0);
      
      if (b.subjudice === 'S') {
         comp.subjudice_v += (b.overdueValue || 0);
      } else {
         if (delayBucketCompany === 'd30') comp.d30_v += (b.overdueValue || 0);
         else if (delayBucketCompany === 'd60') comp.d60_v += (b.overdueValue || 0);
         else if (delayBucketCompany === 'd90') comp.d90_v += (b.overdueValue || 0);
         else if (delayBucketCompany === 'd120') comp.d120_v += (b.overdueValue || 0);
         else comp.d120p_v += (b.overdueValue || 0);
      }

      // 2. Operador Aging (Títulos > 31 dias)
      let opName = b.subjudice === 'S' ? 'APOIO JURÍDICO INTERNO' : (b.assignedOperator || 'NÃO ATRIBUÍDO');
      opName = opName.toUpperCase();
      
      if (!operatorData[opName]) {
          operatorData[opName] = {
              name: opName,
              d31_90_c: 0, d31_90_v: 0,
              d91_120_c: 0, d91_120_v: 0,
              d120p_c: 0, d120p_v: 0,
              customers: []
          };
      }
      
      const op = operatorData[opName];
      op.customers.push({ name: b.customerName || 'N/D', value: b.overdueValue || 0, delay: b.maxDaysDelay || 0 });
      
      // Bucket operator (> 31)
      if (delay >= 31 && delay <= 90) {
          op.d31_90_c += (b.billCount || 1);
          op.d31_90_v += (b.overdueValue || 0);
      } else if (delay >= 91 && delay <= 120) {
          op.d91_120_c += (b.billCount || 1);
          op.d91_120_v += (b.overdueValue || 0);
      } else if (delay > 120) {
          op.d120p_c += (b.billCount || 1);
          op.d120p_v += (b.overdueValue || 0);
      }

      // 3. 0% Pago
      if (b.isZeroPaid || b.percPaid === 0) {
          zeroPaidClients.push({ name: b.customerName || 'N/D', delay: b.maxDaysDelay || 0, value: b.overdueValue || 0 });
      }
    });

    const avgDelay = bills.length > 0 ? Math.round(sumMaxDaysDelay / bills.length) : 0;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    
    // Sort company data by totalValue DESC
    const compSorted = Object.values(companyData).sort((a,b) => b.totalValue - a.totalValue);
    
    // Total row for company data
    const compTotals = {
        totalBills: 0, totalValue: 0,
        d30_v: 0, d60_v: 0, d90_v: 0, d120_v: 0, d120p_v: 0, subjudice_v: 0
    };
    compSorted.forEach(c => {
        compTotals.totalBills += c.totalBills;
        compTotals.totalValue += c.totalValue;
        compTotals.d30_v += c.d30_v;
        compTotals.d60_v += c.d60_v;
        compTotals.d90_v += c.d90_v;
        compTotals.d120_v += c.d120_v;
        compTotals.d120p_v += c.d120p_v;
        compTotals.subjudice_v += c.subjudice_v;
    });

    const getPct = (val, total) => total > 0 ? ((val/total)*100).toFixed(1) + '%' : '0.0%';

    let html = \`
      <html>
        <head>
          <title>Sprint Diário - \${dateStr}</title>
          <style>
            @page { size: A4 landscape; margin: 8mm; }
            body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 0; color: #1e293b; font-size: 10px; background: #f8fafc; -webkit-print-color-adjust: exact; }
            .print-btn { text-align: center; margin-bottom: 10px; }
            .print-btn button { padding: 8px 16px; background: #0f172a; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
            @media print { .print-btn { display: none !important; } body { background: white; } }
            h1 { text-align: center; color: #0f172a; margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; }
            h2 { font-size: 11px; margin: 10px 0 5px 0; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 3px; display: flex; align-items: center; gap: 4px; }
            
            .kpi-container { display: flex; gap: 10px; justify-content: space-between; margin-bottom: 15px; }
            .kpi { flex: 1; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .kpi-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
            .kpi-value { font-size: 16px; font-weight: 800; color: #0f172a; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; font-size: 9px; }
            th { background-color: #f1f5f9; font-weight: 700; color: #334155; text-transform: uppercase; text-align: center; }
            .val { text-align: right; }
            .center { text-align: center; }
            .row-total { background-color: #fff7ed; font-weight: 800; }
            .row-total td { color: #c2410c; }
            
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
            
            .pct-badge { display: block; font-size: 7.5px; color: #64748b; margin-top: 2px; }
            .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 3px; }
            .dot-green { background: #22c55e; }
            .dot-yellow { background: #eab308; }
            .dot-orange { background: #f97316; }
            .dot-red { background: #ef4444; }
            .dot-darkred { background: #991b1b; }
            .dot-gray { background: #64748b; }
          </style>
        </head>
        <body>
          <div class="print-btn"><button onclick="window.print()">🖨️ Imprimir Relatório</button></div>
          <h1>Posição de Inadimplência Geral (\${dateStr})</h1>

          <div class="kpi-container">
            <div class="kpi" style="border-left: 4px solid #ef4444;">
              <div class="kpi-title">Valor em Atraso</div>
              <div class="kpi-value" style="color: #0f172a;">\${formatMoney(totalOverdue)}</div>
            </div>
            <div class="kpi" style="border-left: 4px solid #f59e0b;">
              <div class="kpi-title">Clientes em Atraso</div>
              <div class="kpi-value">\${uniqueClients.size}</div>
            </div>
            <div class="kpi" style="border-left: 4px solid #22c55e;">
              <div class="kpi-title">Títulos Vencidos</div>
              <div class="kpi-value">\${totalBills}</div>
            </div>
            <div class="kpi" style="border-left: 4px solid #3b82f6;">
              <div class="kpi-title">Atraso Médio</div>
              <div class="kpi-value">\${avgDelay} dias</div>
            </div>
          </div>

          <h2>Inadimplência por Empresa | Empreendimento</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">ID</th>
                <th style="text-align: left;">EMPRESA | EMPREENDIMENTO</th>
                <th>TÍTULOS</th>
                <th class="val">R$ ATUALIZADO</th>
                <th class="val">ATÉ 30 DIAS</th>
                <th class="val">ATÉ 60 DIAS</th>
                <th class="val">ATÉ 90 DIAS</th>
                <th class="val">ATÉ 120 DIAS</th>
                <th class="val">ACIMA 120 DIAS</th>
                <th class="val">SUB JUDICE</th>
              </tr>
            </thead>
            <tbody>
    \`;

    compSorted.forEach(c => {
        html += \`
              <tr>
                <td class="center">\${c.id}</td>
                <td><strong>\${c.name}</strong></td>
                <td class="center">\${c.totalBills}</td>
                <td class="val"><strong>\${formatMoney(c.totalValue)}</strong></td>
                <td class="val">\${c.d30_v > 0 ? formatMoney(c.d30_v) + '<span class="pct-badge"><span class="dot dot-green"></span>'+getPct(c.d30_v, c.totalValue)+'</span>' : '-'}</td>
                <td class="val">\${c.d60_v > 0 ? formatMoney(c.d60_v) + '<span class="pct-badge"><span class="dot dot-yellow"></span>'+getPct(c.d60_v, c.totalValue)+'</span>' : '-'}</td>
                <td class="val">\${c.d90_v > 0 ? formatMoney(c.d90_v) + '<span class="pct-badge"><span class="dot dot-orange"></span>'+getPct(c.d90_v, c.totalValue)+'</span>' : '-'}</td>
                <td class="val">\${c.d120_v > 0 ? formatMoney(c.d120_v) + '<span class="pct-badge"><span class="dot dot-red"></span>'+getPct(c.d120_v, c.totalValue)+'</span>' : '-'}</td>
                <td class="val">\${c.d120p_v > 0 ? formatMoney(c.d120p_v) + '<span class="pct-badge"><span class="dot dot-darkred"></span>'+getPct(c.d120p_v, c.totalValue)+'</span>' : '-'}</td>
                <td class="val">\${c.subjudice_v > 0 ? formatMoney(c.subjudice_v) + '<span class="pct-badge"><span class="dot dot-gray"></span>'+getPct(c.subjudice_v, c.totalValue)+'</span>' : '-'}</td>
              </tr>
        \`;
    });

    html += \`
              <tr class="row-total">
                <td colspan="2" class="val">TOTAL GERAL</td>
                <td class="center">\${compTotals.totalBills}</td>
                <td class="val">\${formatMoney(compTotals.totalValue)}</td>
                <td class="val">\${formatMoney(compTotals.d30_v)}<span class="pct-badge">\${getPct(compTotals.d30_v, compTotals.totalValue)}</span></td>
                <td class="val">\${formatMoney(compTotals.d60_v)}<span class="pct-badge">\${getPct(compTotals.d60_v, compTotals.totalValue)}</span></td>
                <td class="val">\${formatMoney(compTotals.d90_v)}<span class="pct-badge">\${getPct(compTotals.d90_v, compTotals.totalValue)}</span></td>
                <td class="val">\${formatMoney(compTotals.d120_v)}<span class="pct-badge">\${getPct(compTotals.d120_v, compTotals.totalValue)}</span></td>
                <td class="val">\${formatMoney(compTotals.d120p_v)}<span class="pct-badge">\${getPct(compTotals.d120p_v, compTotals.totalValue)}</span></td>
                <td class="val">\${formatMoney(compTotals.subjudice_v)}<span class="pct-badge">\${getPct(compTotals.subjudice_v, compTotals.totalValue)}</span></td>
              </tr>
            </tbody>
          </table>
    \`;

    // Operator Aging
    html += \`
          <div class="grid-2">
            <div>
              <h2>Aging por Operador (Títulos Vencidos)</h2>
              <table>
                <thead>
                  <tr>
                    <th style="text-align:left;">OPERADOR</th>
                    <th class="val">31 a 90 Dias<br><span style="font-size:7px;font-weight:normal">(Qtd | R$)</span></th>
                    <th class="val">91 a 120 Dias<br><span style="font-size:7px;font-weight:normal">(Qtd | R$)</span></th>
                    <th class="val">Acima 120 Dias<br><span style="font-size:7px;font-weight:normal">(Qtd | R$)</span></th>
                  </tr>
                </thead>
                <tbody>
    \`;

    const opSorted = Object.values(operatorData).sort((a,b) => (b.d31_90_v+b.d91_120_v+b.d120p_v) - (a.d31_90_v+a.d91_120_v+a.d120p_v));
    opSorted.forEach(op => {
       const hasData = op.d31_90_c > 0 || op.d91_120_c > 0 || op.d120p_c > 0;
       if (!hasData) return;
       html += \`
          <tr>
            <td><strong>\${op.name}</strong></td>
            <td class="val">\${op.d31_90_c > 0 ? op.d31_90_c + ' | ' + formatMoney(op.d31_90_v) : '-'}</td>
            <td class="val">\${op.d91_120_c > 0 ? op.d91_120_c + ' | ' + formatMoney(op.d91_120_v) : '-'}</td>
            <td class="val">\${op.d120p_c > 0 ? op.d120p_c + ' | ' + formatMoney(op.d120p_v) : '-'}</td>
          </tr>
       \`;
    });
    
    html += \`
                </tbody>
              </table>
            </div>
            
            <div>
              <h2>Clientes 0% Pago</h2>
    \`;
    
    // Top 5 0% Pago
    zeroPaidClients.sort((a,b) => b.delay - a.delay);
    const zeroPaidTotalValue = zeroPaidClients.reduce((acc, c) => acc + c.value, 0);
    const zeroPaidTop5 = zeroPaidClients.slice(0, 5);

    html += \`
              <div style="display:flex; justify-content:space-between; margin-bottom: 5px; background: #fff; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px;">
                <span style="font-weight:bold; color: #ef4444; font-size: 10px;">Total Contratos: \${zeroPaidClients.length}</span>
                <span style="font-weight:bold; font-size: 10px;">Valor Total: \${formatMoney(zeroPaidTotalValue)}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="text-align:left;">TOP 5 - CLIENTE (MAIOR ATRASO)</th>
                    <th class="center">DIAS</th>
                    <th class="val">VALOR (R$)</th>
                  </tr>
                </thead>
                <tbody>
    \`;
    zeroPaidTop5.forEach(c => {
       html += \`<tr><td>\${c.name}</td><td class="center" style="color:#ef4444;font-weight:bold;">\${c.delay}</td><td class="val">\${formatMoney(c.value)}</td></tr>\`;
    });
    if (zeroPaidTop5.length === 0) html += \`<tr><td colspan="3" class="center">Nenhum cliente 0% pago</td></tr>\`;
    
    html += \`
                </tbody>
              </table>
            </div>
          </div>
          
          <h2>Top Maiores Valores por Operador</h2>
          <div class="grid-3" style="align-items: start; display: flex; flex-wrap: wrap; gap: 10px;">
    \`;
    
    // Top 5 operators (only those with customers)
    opSorted.forEach(op => {
       if (op.customers.length === 0) return;
       // Sort customers by value desc
       op.customers.sort((a,b) => b.value - a.value);
       const top5 = op.customers.slice(0, 5);
       
       html += \`
            <table style="margin-bottom:0; flex: 1 1 30%; min-width: 250px;">
              <thead>
                <tr><th colspan="2" style="background:#0f172a; color:white; text-align:left;">\${op.name}</th></tr>
                <tr><th style="text-align:left;">CLIENTE</th><th class="val">VALOR (R$)</th></tr>
              </thead>
              <tbody>
       \`;
       top5.forEach(c => {
          html += \`<tr><td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 140px;" title="\${c.name}">\${c.name}</td><td class="val"><strong>\${formatMoney(c.value)}</strong></td></tr>\`;
       });
       html += \`
              </tbody>
            </table>
       \`;
    });

    html += \`
          </div>
        </body>
      </html>
    \`;

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
