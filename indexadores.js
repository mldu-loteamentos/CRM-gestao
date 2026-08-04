const IndexadoresState = {
  siengeIndexers: [],
  allSiengeIndexers: [],
  bcbData: {}, // { 'INCC': [{data: '...', valor: '...'}, ...] }
  loading: false,
  viewingHistory: null, // stores the name of the indexer being viewed in modal
  selectedIndexerName: null
};

const IndexadoresApp = {
  // De-para Sienge Name -> BCB SGS Code
  bcbSeriesMapping: {
    'IPCA': 433,
    'IGPM': 189,
    'IGP-M': 189,
    'IPC-DI': 191,
    'IPCDI': 191,
    'INCC': 7456,
    'INCC-M': 7456,
    'INCC-DI': 192 // Can refine later if needed
  },

  async loadData() {
    IndexadoresState.loading = true;
    this.render();

    try {
      const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
      const port = 3000;
      
      // 1. Fetch Sienge Indexers
      const response = await fetch(`http://${host}:${port}/sienge-proxy/indexers?limit=100`, {
        headers: {
            'Authorization': 'Basic ' + btoa('mouraleite-contas-a-pagar:U2riBlrXuOPIpbb7TyRapoxSzaXWUisj')
        }
      });
      if (!response.ok) throw new Error("Erro ao buscar indexadores do Sienge");
      const data = await response.json();
      const rawIndexers = (data.results || [])
        .map(idx => {
          const lower = (idx.name || '').toLowerCase();
          if (lower.includes('incc (não utilizar')) {
            idx.name = 'INCC';
          }
          return idx;
        });

      IndexadoresState.allSiengeIndexers = rawIndexers;

      let activeNames = [];
      const saved = localStorage.getItem('crm_indexadores_ativos');
      if (saved) {
        activeNames = JSON.parse(saved);
      } else {
        const defaultActive = rawIndexers.filter(idx => {
          if (idx.name === 'INCC') return true;
          const lower = (idx.name || '').toLowerCase();
          if (lower.includes('não utilizar') || lower.includes('nao utilizar') || lower === 'real') return false;
          if (idx.name === lower) return false; 
          return true;
        });
        activeNames = defaultActive.map(i => i.name);
        localStorage.setItem('crm_indexadores_ativos', JSON.stringify(activeNames));
      }

      IndexadoresState.siengeIndexers = rawIndexers.filter(idx => activeNames.includes(idx.name));
        
      if (IndexadoresState.siengeIndexers.length > 0 && (!IndexadoresState.selectedIndexerName || !activeNames.includes(IndexadoresState.selectedIndexerName))) {
        IndexadoresState.selectedIndexerName = IndexadoresState.siengeIndexers[0].name;
      }

      await this.fetchBcbDataForActive();

    } catch (e) {
      console.error(e);
      alert("Erro ao carregar indexadores: " + e.message);
    } finally {
      IndexadoresState.loading = false;
      this.render();
    }
  },

  async fetchBcbDataForActive() {
    for (const idx of IndexadoresState.siengeIndexers) {
      if (IndexadoresState.bcbData[idx.name]) continue;

      const nameUpper = idx.name.toUpperCase();
      let bcbCode = null;
      for (const key in this.bcbSeriesMapping) {
        if (nameUpper === key || nameUpper.includes(key)) {
          bcbCode = this.bcbSeriesMapping[key];
          break;
        }
      }

      if (bcbCode) {
        try {
          const bcbRes = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${bcbCode}/dados?formato=json`);
          if (bcbRes.ok) {
            const bcbJson = await bcbRes.json();
            IndexadoresState.bcbData[idx.name] = bcbJson;
          }
        } catch(e) {
          console.error(`Erro ao buscar série ${bcbCode} do BCB`, e);
        }
      }
    }
  },

  openSettingsModal() {
    let activeNames = [];
    const saved = localStorage.getItem('crm_indexadores_ativos');
    if (saved) activeNames = JSON.parse(saved);

    const listHtml = IndexadoresState.allSiengeIndexers.map(idx => {
      const isChecked = activeNames.includes(idx.name) ? 'checked' : '';
      return `
        <label style="display:flex; align-items:center; gap:8px; padding: 10px; border-bottom: 1px solid #f1f5f9; cursor:pointer; background: #fff; transition: background 0.2s;">
          <input type="checkbox" value="${idx.name}" class="idx-setting-cb" ${isChecked} style="width:16px; height:16px; accent-color:#0f172a;">
          <span style="font-size: 0.95rem; font-weight:500; color:#1e293b;">${idx.name} <span style="color:#94a3b8; font-size:0.75rem; font-weight:400;">(ID: ${idx.id})</span></span>
        </label>
      `;
    }).join('');

    const modalHtml = `
      <div id="idx-settings-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
        <div style="background: #fff; width: 450px; max-width: 90%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column; max-height: 80vh;">
          <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b; display:flex; align-items:center; gap:8px;"><i data-lucide="settings" style="width:18px;"></i> Gerenciar Indexadores</h3>
            <button onclick="document.getElementById('idx-settings-modal').remove()" style="background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: #64748b;">&times;</button>
          </div>
          <div style="padding: 15px 20px; overflow-y: auto; flex: 1;">
            <p style="margin-top: 0; font-size: 0.85rem; color: #64748b; margin-bottom: 15px;">Selecione quais indexadores devem aparecer na sua lista principal para consulta:</p>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow:hidden;">
              ${listHtml}
            </div>
          </div>
          <div style="padding: 15px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; text-align: right;">
            <button class="btn btn-outline" onclick="document.getElementById('idx-settings-modal').remove()" style="margin-right: 10px;">Cancelar</button>
            <button class="btn btn-primary" onclick="IndexadoresApp.saveSettings()">Salvar Configurações</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.lucide) window.lucide.createIcons();
  },

  async saveSettings() {
    const checkboxes = document.querySelectorAll('.idx-setting-cb');
    const activeNames = [];
    checkboxes.forEach(cb => {
      if (cb.checked) activeNames.push(cb.value);
    });
    
    if (activeNames.length === 0) {
      alert("Por favor, selecione pelo menos um indexador.");
      return;
    }

    localStorage.setItem('crm_indexadores_ativos', JSON.stringify(activeNames));
    
    IndexadoresState.siengeIndexers = IndexadoresState.allSiengeIndexers.filter(idx => activeNames.includes(idx.name));
    
    if (!activeNames.includes(IndexadoresState.selectedIndexerName)) {
      IndexadoresState.selectedIndexerName = activeNames[0];
    }
    
    document.getElementById('idx-settings-modal').remove();
    
    IndexadoresState.loading = true;
    this.render();
    
    await this.fetchBcbDataForActive();
    
    IndexadoresState.loading = false;
    this.render();
  },

  formatDate(dataStr) {
    if (!dataStr) return '';
    const parts = dataStr.split('/');
    if (parts.length !== 3) return dataStr;
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const monthIndex = parseInt(parts[1], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${months[monthIndex]}/${parts[2]}`;
    }
    return dataStr;
  },

  formatNumber(valStr) {
    if (valStr === undefined || valStr === null) return '';
    return String(valStr).replace('.', ',');
  },

  calculateAccumulated(rates, periodType) {
    if (!rates || rates.length === 0) return 0;
    
    let relevantRates = [];
    if (periodType === '12m') {
      relevantRates = rates.slice(-12);
    } else if (periodType === 'YTD') {
      // Find the last rate's year to determine the "current" year context of the data
      const lastRate = rates[rates.length - 1];
      const lastYear = lastRate.data.split('/')[2];
      
      relevantRates = rates.filter(r => {
        const parts = r.data.split('/');
        return parts[2] === lastYear;
      });
    }

    let acc = 1;
    for (const r of relevantRates) {
      const val = parseFloat(r.valor);
      acc = acc * (1 + (val/100));
    }
    
    return ((acc - 1) * 100).toFixed(4);
  },

  openHistoryModal(indexerName) {
    IndexadoresState.viewingHistory = indexerName;
    this.renderHistoryModal();
  },

  closeHistoryModal() {
    IndexadoresState.viewingHistory = null;
    const container = document.getElementById('idx-history-modal-container');
    if (container) container.innerHTML = '';
  },

  renderHistoryModal() {
    const name = IndexadoresState.viewingHistory;
    if (!name) return;

    const data = IndexadoresState.bcbData[name] || [];
    let currentYearAcc = null;
    let accYearVal = 1;
    const enrichedData = data.map((d, index) => {
      const year = d.data.split('/')[2];
      if (year !== currentYearAcc) {
        currentYearAcc = year;
        accYearVal = 1;
      }
      accYearVal = accYearVal * (1 + (parseFloat(d.valor)/100));

      let acc12mVal = 1;
      let monthsCount = 0;
      for (let j = index; j >= 0 && monthsCount < 12; j--) {
        acc12mVal = acc12mVal * (1 + (parseFloat(data[j].valor)/100));
        monthsCount++;
      }
      const acc12mStr = monthsCount > 0 ? ((acc12mVal - 1) * 100).toFixed(4) : "0.0000";

      return {
        ...d,
        year,
        accAno: ((accYearVal - 1) * 100).toFixed(4),
        acc12m: acc12mStr
      };
    });

    // Sort descending for display (newest first)
    const reversedData = [...enrichedData].reverse();

    let rowsHtml = '';
    let currentYearTracking = null;
    let yearTotal = '';

    for (let i = 0; i < reversedData.length; i++) {
      const d = reversedData[i];
      if (currentYearTracking !== d.year) {
        currentYearTracking = d.year;
        yearTotal = d.accAno;
      }

      rowsHtml += `
        <tr data-year="${d.year}">
          <td style="padding: 8px 20px; text-align: center; border-bottom: 1px solid #e2e8f0;">${IndexadoresApp.formatDate(d.data)}</td>
          <td style="padding: 8px 20px; text-align: center; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${IndexadoresApp.formatNumber(d.valor)}%</td>
          <td style="padding: 8px 20px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 500;">${IndexadoresApp.formatNumber(d.accAno)}%</td>
          <td style="padding: 8px 20px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 500;">${IndexadoresApp.formatNumber(d.acc12m)}%</td>
        </tr>
      `;

      const nextData = reversedData[i+1];
      if (!nextData || nextData.year !== currentYearTracking) {
         rowsHtml += `
           <tr data-year="${currentYearTracking}" style="background-color: #f0fdf4; font-weight: bold; color: #166534;">
             <td style="padding: 8px 20px; text-align: right; border-bottom: 2px solid #cbd5e1;">TOTAL ${currentYearTracking}:</td>
             <td style="padding: 8px 20px; text-align: center; border-bottom: 2px solid #cbd5e1;"></td>
             <td style="padding: 8px 20px; text-align: center; border-bottom: 2px solid #cbd5e1;">${IndexadoresApp.formatNumber(yearTotal)}%</td>
             <td style="padding: 8px 20px; text-align: center; border-bottom: 2px solid #cbd5e1;"></td>
           </tr>
         `;
      }
    }

    const modalHtml = `
      <div id="idx-history-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center;">
        <div style="background: white; border-radius: 8px; width: 650px; max-width: 90%; max-height: 90vh; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #1b8253; color: white; border-radius: 8px 8px 0 0;">
            <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;"><i data-lucide="line-chart"></i> Histórico Completo: ${name}</h3>
            <button onclick="IndexadoresApp.closeHistoryModal()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #fff;">&times;</button>
          </div>
          
          <div style="padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; gap: 10px; align-items: center; background: #f9f9f9;">
            <div>
              <label style="font-size: 0.8rem; font-weight: bold; display: block;">Filtrar Ano</label>
              <select id="idx-history-year-filter" class="form-control" onchange="IndexadoresApp.filterHistoryModal(this.value)" style="padding: 4px 8px; font-size: 0.9rem;">
                <option value="ALL">Todos os Anos</option>
                ${[...new Set(reversedData.map(d => d.year))].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('')}
              </select>
            </div>
            <div style="flex: 1; text-align: right; font-size: 0.85rem; color: #666;">
              Total de registros: <strong>${reversedData.length}</strong> meses.
            </div>
          </div>

          <div style="flex: 1; overflow-y: auto; padding: 0;">
            <table class="custom-table" style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 1;">
                <tr>
                  <th style="padding: 10px 20px; border-bottom: 1px solid #cbd5e1; text-align: center;">Mês/Ano</th>
                  <th style="padding: 10px 20px; border-bottom: 1px solid #cbd5e1; text-align: center;">Taxa (%)</th>
                  <th style="padding: 10px 20px; border-bottom: 1px solid #cbd5e1; text-align: center;">Acum. no Ano (%)</th>
                  <th style="padding: 10px 20px; border-bottom: 1px solid #cbd5e1; text-align: center;">Acum. 12 Meses (%)</th>
                </tr>
              </thead>
              <tbody id="idx-history-tbody">
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          
          <div style="padding: 15px 20px; background: #f9f9f9; border-top: 1px solid #eee; text-align: right; border-radius: 0 0 8px 8px;">
            <button class="btn btn-outline" onclick="IndexadoresApp.closeHistoryModal()">Fechar</button>
          </div>
        </div>
      </div>
    `;

    let container = document.getElementById('idx-history-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'idx-history-modal-container';
        document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
    if (window.lucide) window.lucide.createIcons();
  },

  filterHistoryModal(year) {
    const tbody = document.getElementById('idx-history-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      if (year === 'ALL' || tr.dataset.year === year) {
        tr.style.display = '';
      } else {
        tr.style.display = 'none';
      }
    });
  },

  render() {
    const contentDiv = document.getElementById('indexadores-content');
    if (!contentDiv) return;

    if (IndexadoresState.loading) {
      contentDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Sincronizando indexadores com o Sienge e Banco Central...</p>
        </div>
      `;
      return;
    }

    let html = `
      <style>
        .idx-card {
          background: #fff;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .idx-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #f1f5f9;
        }
        .idx-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .idx-badge {
          background: #e0e7ff;
          color: #4338ca;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .idx-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
        }
        .idx-stat-box {
          background: #f8fafc;
          border-radius: 6px;
          padding: 10px 15px;
          flex: 1;
          text-align: center;
          border: 1px solid #e2e8f0;
        }
        .idx-stat-label {
          font-size: 0.75rem;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .idx-stat-value {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
        }
        .idx-stat-value.positive { color: #166534; }
        .idx-stat-value.negative { color: #991b1b; }
      </style>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="font-weight: 600; color: #374151;">Selecione o Indexador:</label>
          <select class="form-control" onchange="IndexadoresState.selectedIndexerName = this.value; IndexadoresApp.render()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.95rem; min-width: 250px; outline: none; background: #fff;">
            ${IndexadoresState.siengeIndexers.map(idx => `<option value="${idx.name}" ${IndexadoresState.selectedIndexerName === idx.name ? 'selected' : ''}>${idx.name}</option>`).join('')}
          </select>
          <button class="btn btn-outline" style="padding: 6px 12px; display:flex; align-items:center; gap:5px;" onclick="IndexadoresApp.openSettingsModal()" title="Configurar Indexadores Exibidos">
            <i data-lucide="settings" style="width:16px;"></i>
          </button>
        </div>
        <button class="btn btn-primary" style="display: flex; align-items: center; gap: 8px;" onclick="IndexadoresApp.loadData()">
          <i data-lucide="refresh-cw" style="width: 16px;"></i> Atualizar Dados
        </button>
      </div>
    `;

    if (IndexadoresState.siengeIndexers.length === 0) {
      html += `<div class="idx-card" style="text-align: center; padding: 40px; color: #64748b;">Nenhum indexador retornado pelo Sienge.</div>`;
    } else {
      const idx = IndexadoresState.siengeIndexers.find(i => i.name === IndexadoresState.selectedIndexerName);
      if (idx) {
        const bcbData = IndexadoresState.bcbData[idx.name];
        
        if (bcbData && bcbData.length > 0) {
          let currentYearAcc = null;
          let accYearVal = 1;
          const enrichedBcb = bcbData.map((d, index) => {
            const year = d.data.split('/')[2];
            if (year !== currentYearAcc) {
              currentYearAcc = year;
              accYearVal = 1;
            }
            accYearVal = accYearVal * (1 + (parseFloat(d.valor)/100));

            let acc12mVal = 1;
            let monthsCount = 0;
            for (let j = index; j >= 0 && monthsCount < 12; j--) {
              acc12mVal = acc12mVal * (1 + (parseFloat(bcbData[j].valor)/100));
              monthsCount++;
            }
            const acc12mStr = monthsCount > 0 ? ((acc12mVal - 1) * 100).toFixed(4) : "0.0000";

            return {
              ...d,
              year,
              accAno: ((accYearVal - 1) * 100).toFixed(4),
              acc12m: acc12mStr
            };
          });

          const lastRate = enrichedBcb[enrichedBcb.length - 1];
          const accYtd = this.calculateAccumulated(bcbData, 'YTD');
          const acc12m = this.calculateAccumulated(bcbData, '12m');

          const last24 = enrichedBcb.slice(-24).reverse();

          statsHtml = `
            <div class="idx-stats">
              <div class="idx-stat-box">
                <div class="idx-stat-label">Última Taxa (${IndexadoresApp.formatDate(lastRate.data)})</div>
                <div class="idx-stat-value ${parseFloat(lastRate.valor) > 0 ? 'positive' : ''}">${IndexadoresApp.formatNumber(lastRate.valor)}%</div>
              </div>
              <div class="idx-stat-box">
                <div class="idx-stat-label">Acumulado no Ano (YTD)</div>
                <div class="idx-stat-value ${parseFloat(accYtd) > 0 ? 'positive' : ''}">${IndexadoresApp.formatNumber(accYtd)}%</div>
              </div>
              <div class="idx-stat-box">
                <div class="idx-stat-label">Acumulado 12 Meses</div>
                <div class="idx-stat-value ${parseFloat(acc12m) > 0 ? 'positive' : ''}">${IndexadoresApp.formatNumber(acc12m)}%</div>
              </div>
            </div>
          `;

          tableHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; background: #f8fafc; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
              <h4 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="calendar-days" style="width: 18px; color: var(--color-primary);"></i> Histórico Recente (Últimos 24 meses)
              </h4>
              <button class="btn btn-primary btn-sm" onclick="IndexadoresApp.openHistoryModal('${idx.name}')" style="display: flex; align-items: center; gap: 6px;">
                <i data-lucide="history" style="width: 16px;"></i> Consultar Histórico Completo
              </button>
            </div>
            <div style="overflow-y: auto; max-height: 400px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table class="custom-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                  <tr>
                    <th style="padding: 8px 15px; border-bottom: 1px solid #cbd5e1; text-align: center;">Mês/Ano</th>
                    <th style="padding: 8px 15px; border-bottom: 1px solid #cbd5e1; text-align: center;">Taxa (%)</th>
                    <th style="padding: 8px 15px; border-bottom: 1px solid #cbd5e1; text-align: center;">Acum. no Ano (%)</th>
                    <th style="padding: 8px 15px; border-bottom: 1px solid #cbd5e1; text-align: center;">Acum. 12 Meses (%)</th>
                  </tr>
                </thead>
                <tbody>
                  ${last24.map(r => `
                    <tr>
                      <td style="padding: 8px 15px; text-align: center; border-bottom: 1px solid #f1f5f9; color: #475569;">${IndexadoresApp.formatDate(r.data)}</td>
                      <td style="padding: 8px 15px; text-align: center; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${IndexadoresApp.formatNumber(r.valor)}%</td>
                      <td style="padding: 8px 15px; text-align: center; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">${IndexadoresApp.formatNumber(r.accAno)}%</td>
                      <td style="padding: 8px 15px; text-align: center; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">${IndexadoresApp.formatNumber(r.acc12m)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        } else {
          statsHtml = `
            <div style="background: #fff8f1; border: 1px solid #fed7aa; color: #c2410c; padding: 15px; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 10px;">
              <i data-lucide="info" style="width: 18px; flex-shrink: 0;"></i>
              Este indexador não possui uma série configurada ou mapeada no Banco Central para busca automática de taxas.
            </div>
          `;
        }
        html += `
          <div class="idx-card">
            <div class="idx-header">
              <div class="idx-title">
                ${idx.name}
                <span class="idx-badge">ID: ${idx.id}</span>
              </div>
            </div>
            ${statsHtml}
            ${tableHtml}
          </div>
        `;
      }
    }

    contentDiv.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }
};

function initIndexadoresModule() {
  const root = document.getElementById('indexadores-root');
  if (!root) return;

  root.innerHTML = `
    <div style="padding: 20px; max-width: 1000px; margin: 0 auto;">
      <div id="indexadores-content">
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Inicializando módulo de indexadores...</p>
        </div>
      </div>
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();
  
  if (IndexadoresState.siengeIndexers.length > 0) {
    IndexadoresApp.render();
  } else {
    IndexadoresApp.loadData();
  }
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'indexadores') {
    initIndexadoresModule();
  }
});
