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

  async loadData(forcar = false) {
    if (forcar) IndexadoresState.bcbData = {};
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
          <input type="checkbox" value="${idx.name}" class="idx-setting-cb" ${isChecked} style="width:16px; height:16px; accent-color:#105436;">
          <span style="font-size: 0.95rem; font-weight:500; color:#1e293b;">${idx.name} <span style="color:#94a3b8; font-size:0.75rem; font-weight:400;">(ID: ${idx.id})</span></span>
        </label>
      `;
    }).join('');

    const modalHtml = `
      <div id="idx-settings-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
        <div style="background: #fff; width: 450px; max-width: 90%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column; max-height: 80vh;">
          <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b; display:flex; align-items:center; gap:8px;"><i data-lucide="settings" style="width:18px;"></i> Gerenciar Indexadores</h3>
            <button type="button" class="btn btn-fechar" onclick="document.getElementById('idx-settings-modal').remove()">Fechar</button>
          </div>
          <div style="padding: 15px 20px; overflow-y: auto; flex: 1;">
            <p style="margin-top: 0; font-size: 0.85rem; color: #64748b; margin-bottom: 15px;">Selecione quais indexadores devem aparecer na sua lista principal para consulta:</p>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow:hidden;">
              ${listHtml}
            </div>
          </div>
          <div style="padding: 15px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; text-align: right;">
            <button class="btn btn-cancel" onclick="document.getElementById('idx-settings-modal').remove()" style="margin-right: 10px;">Cancelar</button>
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

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  serieBcb(name) {
    const nameUpper = String(name || '').toUpperCase();
    for (const key in this.bcbSeriesMapping) {
      if (nameUpper === key || nameUpper.includes(key)) return this.bcbSeriesMapping[key];
    }
    return null;
  },

  /** Acrescenta a cada mês o acumulado no ano e o acumulado dos últimos 12 meses. */
  enriquecer(data) {
    let anoAtual = null;
    let accAno = 1;
    return (data || []).map((d, index) => {
      const year = d.data.split('/')[2];
      if (year !== anoAtual) {
        anoAtual = year;
        accAno = 1;
      }
      accAno *= 1 + parseFloat(d.valor) / 100;
      let acc12 = 1;
      for (let j = index; j >= 0 && j > index - 12; j--) acc12 *= 1 + parseFloat(data[j].valor) / 100;
      return { ...d, year, accAno: ((accAno - 1) * 100).toFixed(4), acc12m: ((acc12 - 1) * 100).toFixed(4) };
    });
  },

  sinal(v) {
    return parseFloat(v) < 0 ? 'is-neg' : '';
  },

  /** Linhas do mais recente para o mais antigo, com uma faixa por ano mostrando o acumulado do ano. */
  linhasHtml(lista) {
    let ano = null;
    return lista.map((r) => {
      let faixa = '';
      if (r.year !== ano) {
        ano = r.year;
        faixa = `
          <tr class="idx-ano" data-year="${r.year}">
            <td colspan="4">
              <div class="idx-ano-linha">
                <strong>${r.year}</strong>
                <span>Acumulado no ano <b class="${this.sinal(r.accAno)}">${this.formatNumber(r.accAno)}%</b></span>
              </div>
            </td>
          </tr>`;
      }
      return faixa + `
          <tr data-year="${r.year}">
            <td class="idx-mes">${this.formatDate(r.data)}</td>
            <td class="is-right idx-taxa ${this.sinal(r.valor)}">${this.formatNumber(r.valor)}%</td>
            <td class="is-right ${this.sinal(r.accAno)}">${this.formatNumber(r.accAno)}%</td>
            <td class="is-right ${this.sinal(r.acc12m)}">${this.formatNumber(r.acc12m)}%</td>
          </tr>`;
    }).join('');
  },

  tabelaHtml(lista, tbodyId) {
    return `
      <table class="cc-table idx-table">
        <colgroup><col class="idx-c-mes"><col><col><col></colgroup>
        <thead>
          <tr>
            <th>Mês/ano</th>
            <th class="is-right">Taxa do mês</th>
            <th class="is-right">Acumulado no ano</th>
            <th class="is-right">Acumulado 12 meses</th>
          </tr>
        </thead>
        <tbody${tbodyId ? ` id="${tbodyId}"` : ''}>${this.linhasHtml(lista)}</tbody>
      </table>`;
  },

  renderHistoryModal() {
    const name = IndexadoresState.viewingHistory;
    if (!name) return;

    const lista = this.enriquecer(IndexadoresState.bcbData[name] || []).reverse();
    const anos = [...new Set(lista.map((d) => d.year))];
    const maisAntigo = lista.length ? this.formatDate(lista[lista.length - 1].data) : '';

    const modalHtml = `
      <div id="idx-history-modal-overlay" class="idx-modal-overlay" onclick="if (event.target === this) IndexadoresApp.closeHistoryModal()">
        <div class="idx-modal" role="dialog" aria-label="Histórico completo">
          <div class="idx-modal-head">
            <h3><i data-lucide="line-chart" style="width:18px;height:18px;"></i> Histórico completo · ${this.esc(name)}</h3>
            <button type="button" class="btn btn-fechar" onclick="IndexadoresApp.closeHistoryModal()">Fechar</button>
          </div>
          <div class="idx-modal-tools">
            <div class="idx-campo">
              <label class="ml-emp-filter-label" for="idx-history-year-filter">Ano</label>
              <select id="idx-history-year-filter" class="idx-select is-curto" onchange="IndexadoresApp.filterHistoryModal(this.value)">
                <option value="ALL">Todos os anos</option>
                ${anos.map((y) => `<option value="${y}">${y}</option>`).join('')}
              </select>
            </div>
            <div class="idx-modal-info">${lista.length} meses${maisAntigo ? `, desde ${maisAntigo}` : ''}</div>
          </div>
          <div class="idx-modal-body">
            ${this.tabelaHtml(lista, 'idx-history-tbody')}
          </div>
          <div class="idx-modal-foot">
            <button type="button" class="btn btn-fechar" onclick="IndexadoresApp.closeHistoryModal()">Fechar</button>
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
    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.style.display = (year === 'ALL' || tr.dataset.year === year) ? '' : 'none';
    });
  },

  kpiHtml(rotulo, valor) {
    const cls = parseFloat(valor) < 0 ? 'is-neg' : 'is-pos';
    return `
      <div class="ppcc-kpi">
        <span class="ppcc-kpi-rot">${rotulo}</span>
        <span class="ppcc-kpi-val ${cls}">${this.formatNumber(valor)}%</span>
      </div>`;
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

    const S = IndexadoresState;
    const idx = S.siengeIndexers.find((i) => i.name === S.selectedIndexerName);
    const dados = idx ? (S.bcbData[idx.name] || []) : [];

    let html = `
      <div class="cc-toolbar idx-toolbar">
        <div class="cc-filters">
          <div class="idx-campo">
            <label class="ml-emp-filter-label" for="idx-sel">Indexador</label>
            <div class="idx-sel-linha">
              <select id="idx-sel" class="idx-select" onchange="IndexadoresState.selectedIndexerName = this.value; IndexadoresApp.render()">
                ${S.siengeIndexers.map((i) => `<option value="${this.esc(i.name)}" ${S.selectedIndexerName === i.name ? 'selected' : ''}>${this.esc(i.name)}</option>`).join('')}
              </select>
              <button type="button" class="idx-config" onclick="IndexadoresApp.openSettingsModal()" title="Escolher os indexadores da lista">
                <i data-lucide="settings-2"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="cc-toolbar-actions">
          ${idx && dados.length ? `
          <button type="button" class="ppcc-trazer" onclick="IndexadoresApp.openHistoryModal(IndexadoresState.selectedIndexerName)">
            <i data-lucide="history" style="width:15px;height:15px;"></i> Histórico completo
          </button>` : ''}
          <button type="button" class="btn btn-primary cc-atualizar" onclick="IndexadoresApp.loadData(true)">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar
          </button>
        </div>
      </div>
    `;

    if (!S.siengeIndexers.length) {
      html += `<div class="idx-vazio">Nenhum indexador retornado pelo Sienge.</div>`;
    } else if (idx) {
      const serie = this.serieBcb(idx.name);
      const enriched = this.enriquecer(dados);
      const ultimo = enriched[enriched.length - 1];
      const sub = [`ID ${this.esc(idx.id)} no Sienge`];
      if (serie) sub.push(`série ${serie} do Banco Central`);
      if (ultimo) sub.push(`últimos 24 meses até ${this.formatDate(ultimo.data)}`);

      html += `
        <div class="ppcc-head idx-head">
          <div>
            <div class="ppcc-titulo">${this.esc(idx.name)}</div>
            <div class="ppcc-sub">${sub.join(' · ')}</div>
          </div>
          ${ultimo ? `
          <div class="ppcc-kpis">
            ${this.kpiHtml(`Taxa de ${this.formatDate(ultimo.data)}`, ultimo.valor)}
            ${this.kpiHtml(`Acumulado em ${ultimo.year}`, this.calculateAccumulated(dados, 'YTD'))}
            ${this.kpiHtml('Acumulado 12 meses', this.calculateAccumulated(dados, '12m'))}
          </div>` : ''}
        </div>
      `;

      html += ultimo
        ? `<div class="cc-scroll idx-scroll">${this.tabelaHtml(enriched.slice(-24).reverse())}</div>`
        : `
          <div class="idx-aviso">
            <i data-lucide="info" style="width:18px;height:18px;flex-shrink:0;"></i>
            Este indexador não tem série do Banco Central configurada para buscar as taxas automaticamente.
          </div>`;
    }

    contentDiv.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }
};

function initIndexadoresModule() {
  const root = document.getElementById('indexadores-root');
  if (!root) return;

  root.innerHTML = `
    <div class="cc-page">
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
