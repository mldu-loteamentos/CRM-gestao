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
          <button class="btn btn-outline" style="border-color: #3b82f6; color: #3b82f6;" onclick="window.DashboardInadimplencia.salvarPosicaoHoje()">
            <i data-lucide="save" style="width: 16px;"></i> Salvar Posição Hoje
          </button>
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
    if (!window.AppState || !window.AppState.inadimplentes || window.AppState.inadimplentes.length === 0) {
      alert("Nenhum dado na fila de cobrança para gerar o relatório. Carregue os dados primeiro.");
      return;
    }

    const bills = window.AppState.inadimplentes;
    
    // 1. Por Cidade/Empreendimento
    const cities = {};
    // 2. Por Operador
    const ops = {};
    // 3. Contratos 0% Pago
    let zeroPaidCount = 0;

    bills.forEach(b => {
      // 0% pago
      if (b.porcentagem_paga === 0 || b.porcentagem_paga === "0%" || b.porcentagem_paga === "0.00%") {
        zeroPaidCount++;
      }

      // Por Cidade
      let city = 'N/D';
      if (b.customer && b.customer.address && b.customer.address.city) {
         city = b.customer.address.city.toUpperCase();
      }
      if (!cities[city]) cities[city] = 0;
      cities[city] += b.value;

      // Por Operador
      let op = b.operator || 'SEM OPERADOR';
      if (!ops[op]) ops[op] = { total: 0, customers: {} };
      ops[op].total += b.value;
      
      const custName = b.customerName || 'N/D';
      if (!ops[op].customers[custName]) ops[op].customers[custName] = 0;
      ops[op].customers[custName] += b.value;
    });

    const dateStr = new Date().toLocaleDateString('pt-BR');
    let html = `
      <html>
        <head>
          <title>Sprint Diário - ${dateStr}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; }
            h1 { text-align: center; color: #0f172a; margin-bottom: 5px; }
            h2 { font-size: 1.2rem; margin-top: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; color: #334155; }
            h3 { font-size: 1rem; margin-top: 15px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
            th { background-color: #f8fafc; font-weight: 600; color: #475569; }
            .val { text-align: right; }
            .kpi-container { display: flex; gap: 20px; justify-content: center; margin-top: 20px; margin-bottom: 30px; }
            .kpi { padding: 15px 25px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; text-align: center; }
            .kpi-title { font-size: 0.85rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
            .kpi-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-top: 5px; }
            @media print {
              body { padding: 0; }
              button { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 20px;">
             <button onclick="window.print()" style="padding: 10px 20px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Imprimir PDF</button>
          </div>
          <h1>Relatório de Sprint Diário</h1>
          <div style="text-align: center; color: #64748b;">Posição: ${dateStr}</div>

          <div class="kpi-container">
            <div class="kpi">
              <div class="kpi-title">Valor Total em Atraso</div>
              <div class="kpi-value">${formatMoney(Object.values(cities).reduce((a,b)=>a+b, 0))}</div>
            </div>
            <div class="kpi">
              <div class="kpi-title">Contratos 0% Pagos Abertos</div>
              <div class="kpi-value" style="color: #ef4444;">${zeroPaidCount}</div>
            </div>
          </div>

          <h2>1. Valor em Atraso por Cidade (Empreendimento)</h2>
          <table>
            <thead><tr><th>Cidade</th><th class="val">Valor Total (R$)</th></tr></thead>
            <tbody>
              ${Object.entries(cities).sort((a,b)=>b[1]-a[1]).map(([city, val]) => `
                <tr><td>${city}</td><td class="val">${formatMoney(val)}</td></tr>
              `).join('')}
            </tbody>
          </table>

          <h2>2. Valor em Atraso por Operador (Top 5 Clientes)</h2>
    `;

    // Operadores sorted by total descending
    const opsSorted = Object.entries(ops).sort((a,b) => b[1].total - a[1].total);
    opsSorted.forEach(([opName, opData]) => {
      html += `
        <h3>Operador: ${opName} <span style="float: right; color: #0f172a;">Total: ${formatMoney(opData.total)}</span></h3>
        <table>
          <thead><tr><th>Top 5 Clientes Inadimplentes</th><th class="val" style="width: 150px;">Valor (R$)</th></tr></thead>
          <tbody>
      `;
      // Sort customers by value descending, take top 5
      const custSorted = Object.entries(opData.customers).sort((a,b) => b[1] - a[1]).slice(0, 5);
      custSorted.forEach(([custName, val]) => {
        html += `<tr><td>${custName}</td><td class="val">${formatMoney(val)}</td></tr>`;
      });
      html += `</tbody></table>`;
    });

    html += `
        </body>
      </html>
    `;

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
