const MarketingState = {
  budgets: [],
  costCenters: [],
  loading: false,
  view: 'list',
  selectedId: null,
  filterText: '',
  filterStatus: 'todos'
};

const MarketingApp = {
  COLLECTION: 'marketing_budgets',
  LOCAL_KEY: 'crm_marketing_budgets',

  async init() {
    MarketingState.view = 'list';
    MarketingState.selectedId = null;
    await this.loadData();
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  },

  money(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  parseMoney(raw) {
    if (raw == null || raw === '') return 0;
    const s = String(raw).trim().replace(/\s/g, '').replace('R$', '');
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
    if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
    return Number(s) || 0;
  },

  fmtDate(iso) {
    if (!iso) return '—';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
  },

  currentUserName() {
    try {
      const u = window.MouraAuth && window.MouraAuth.getCurrentUser && window.MouraAuth.getCurrentUser();
      return (u && (u.name || u.email)) || 'Usuário';
    } catch (e) {
      return 'Usuário';
    }
  },

  spentOf(b) {
    return (b.expenses || []).reduce((s, x) => s + (Number(x.value) || 0), 0);
  },

  remainingOf(b) {
    return (Number(b.plannedValue) || 0) - this.spentOf(b);
  },

  pctOf(b) {
    const plan = Number(b.plannedValue) || 0;
    if (plan <= 0) return this.spentOf(b) > 0 ? 100 : 0;
    return (this.spentOf(b) / plan) * 100;
  },

  ccLabel(cc) {
    if (!cc) return '';
    return `${cc.id} — ${cc.name || cc.nome || 'Sem nome'}`;
  },

  selectedBudget() {
    return MarketingState.budgets.find(b => b.id === MarketingState.selectedId) || null;
  },

  async loadData() {
    MarketingState.loading = true;
    this.render();
    try {
      if (window.SiengeApiService && typeof window.SiengeApiService.getCostCenters === 'function') {
        MarketingState.costCenters = await window.SiengeApiService.getCostCenters();
      } else if (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) {
        MarketingState.costCenters = window.MOCK_DATA.COST_CENTERS;
      }
      MarketingState.costCenters.sort((a, b) => String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true }));

      let fromFb = [];
      if (window.firebaseDb && window.firebaseCollections) {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, this.COLLECTION));
        snap.forEach(d => fromFb.push({ id: d.id, ...d.data() }));
      }
      if (fromFb.length) {
        MarketingState.budgets = fromFb;
      } else {
        try {
          MarketingState.budgets = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]');
        } catch (e) {
          MarketingState.budgets = [];
        }
      }
      MarketingState.budgets.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    } catch (e) {
      console.error('[Marketing] Falha ao carregar', e);
      try {
        MarketingState.budgets = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]');
      } catch (e2) {
        MarketingState.budgets = [];
      }
    } finally {
      MarketingState.loading = false;
      this.render();
    }
  },

  persistLocal() {
    try {
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(MarketingState.budgets));
    } catch (e) {}
  },

  async persistBudget(budget) {
    this.persistLocal();
    if (!window.firebaseDb || !window.firebaseCollections) return;
    const { doc, setDoc, addDoc, collection } = window.firebaseCollections;
    const payload = { ...budget };
    if (budget.id && !String(budget.id).startsWith('local-')) {
      await setDoc(doc(window.firebaseDb, this.COLLECTION, budget.id), payload, { merge: true });
    } else {
      delete payload.id;
      const ref = await addDoc(collection(window.firebaseDb, this.COLLECTION), payload);
      budget.id = ref.id;
      const idx = MarketingState.budgets.findIndex(b => b === budget || (b.createdAt === budget.createdAt && b.eventName === budget.eventName));
      if (idx >= 0) MarketingState.budgets[idx].id = ref.id;
      this.persistLocal();
    }
  },

  async removeBudgetDoc(id) {
    if (!window.firebaseDb || !window.firebaseCollections) return;
    if (String(id).startsWith('local-')) return;
    const { doc, deleteDoc } = window.firebaseCollections;
    await deleteDoc(doc(window.firebaseDb, this.COLLECTION, id));
  },

  filteredBudgets() {
    const q = String(MarketingState.filterText || '').toLowerCase().trim();
    return MarketingState.budgets.filter(b => {
      if (MarketingState.filterStatus !== 'todos' && (b.status || 'aberto') !== MarketingState.filterStatus) return false;
      if (!q) return true;
      const blob = `${b.eventName} ${b.costCenterId} ${b.costCenterName} ${b.notes}`.toLowerCase();
      return blob.includes(q);
    });
  },

  render() {
    const root = document.getElementById('marketing-root');
    if (!root) return;

    if (MarketingState.loading && !MarketingState.budgets.length) {
      root.innerHTML = `
        <div style="text-align:center;padding:60px;color:#64748b;">
          <div class="spinner" style="margin:0 auto 12px;"></div>
          Carregando orçamentos de marketing...
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (MarketingState.view === 'detail') {
      root.innerHTML = this.renderDetail();
    } else {
      root.innerHTML = this.renderList();
    }
    if (window.lucide) lucide.createIcons();
    this.bindListEvents();
  },

  renderKpis(list) {
    const planned = list.reduce((s, b) => s + (Number(b.plannedValue) || 0), 0);
    const spent = list.reduce((s, b) => s + this.spentOf(b), 0);
    const open = list.filter(b => (b.status || 'aberto') === 'aberto').length;
    const over = list.filter(b => this.remainingOf(b) < 0).length;
    const card = (label, value, color) => `
      <div style="flex:1;min-width:160px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;border-left:4px solid ${color};">
        <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
        <div style="font-size:1.25rem;font-weight:800;color:#0f172a;margin-top:4px;">${value}</div>
      </div>`;
    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        ${card('Eventos', list.length, '#105436')}
        ${card('Orçado', this.money(planned), '#0ea5e9')}
        ${card('Gasto', this.money(spent), '#ea580c')}
        ${card('Saldo', this.money(planned - spent), planned - spent < 0 ? '#dc2626' : '#16a34a')}
        ${card('Abertos', open, '#6366f1')}
        ${card('Estouro', over, '#dc2626')}
      </div>`;
  },

  barHtml(b) {
    const pct = Math.min(this.pctOf(b), 100);
    const over = this.pctOf(b) > 100;
    const color = over ? '#dc2626' : (pct >= 80 ? '#ea580c' : '#16a34a');
    return `
      <div style="background:#e2e8f0;border-radius:999px;height:8px;overflow:hidden;min-width:90px;">
        <div style="width:${pct}%;height:100%;background:${color};"></div>
      </div>
      <div style="font-size:0.72rem;color:#64748b;margin-top:4px;">${this.pctOf(b).toFixed(0)}% usado</div>`;
  },

  renderList() {
    const list = this.filteredBudgets();
    const rows = list.map(b => {
      const rem = this.remainingOf(b);
      const remColor = rem < 0 ? '#dc2626' : '#166534';
      const status = b.status || 'aberto';
      return `<tr style="border-bottom:1px solid #e2e8f0;cursor:pointer;" onclick="MarketingApp.openDetail('${this.esc(b.id)}')">
        <td style="padding:12px 10px;font-weight:700;color:#0f172a;">${this.esc(b.eventName)}</td>
        <td style="padding:12px 10px;color:#334155;">${this.esc(b.costCenterId)} — ${this.esc(b.costCenterName || '')}</td>
        <td style="padding:12px 10px;white-space:nowrap;color:#64748b;">${this.fmtDate(b.startDate)} → ${this.fmtDate(b.endDate)}</td>
        <td style="padding:12px 10px;text-align:right;font-weight:700;">${this.money(b.plannedValue)}</td>
        <td style="padding:12px 10px;text-align:right;">${this.money(this.spentOf(b))}</td>
        <td style="padding:12px 10px;text-align:right;font-weight:800;color:${remColor};">${this.money(rem)}</td>
        <td style="padding:12px 10px;min-width:120px;">${this.barHtml(b)}</td>
        <td style="padding:12px 10px;">
          <span style="background:${status === 'aberto' ? '#dcfce7' : '#e2e8f0'};color:${status === 'aberto' ? '#166534' : '#475569'};padding:3px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;">
            ${status === 'aberto' ? 'Aberto' : 'Encerrado'}
          </span>
        </td>
      </tr>`;
    }).join('');

    return `
      <div style="padding:8px 4px 24px;">
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;color:#fff;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="megaphone" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <div style="font-weight:800;font-size:1.05rem;">Orçamentos de Eventos</div>
              <div style="font-size:0.8rem;opacity:0.85;">Controle de gastos por centro de custo</div>
            </div>
          </div>
          <button class="btn" style="background:#fff;color:#105436;font-weight:700;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px;" onclick="MarketingApp.openBudgetModal()">
            <i data-lucide="plus" style="width:16px;height:16px;"></i> Novo orçamento
          </button>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:18px 18px 8px;border-radius:0 0 12px 12px;">
          ${this.renderKpis(MarketingState.budgets)}
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
            <input id="mkt-filter-text" type="search" placeholder="Buscar evento ou centro de custo..." value="${this.esc(MarketingState.filterText)}"
              style="flex:1;min-width:220px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;">
            <select id="mkt-filter-status" style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;">
              <option value="todos" ${MarketingState.filterStatus === 'todos' ? 'selected' : ''}>Todos os status</option>
              <option value="aberto" ${MarketingState.filterStatus === 'aberto' ? 'selected' : ''}>Abertos</option>
              <option value="encerrado" ${MarketingState.filterStatus === 'encerrado' ? 'selected' : ''}>Encerrados</option>
            </select>
          </div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <thead>
                <tr style="background:#f1f5f9;text-align:left;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.3px;">
                  <th style="padding:10px;">Evento</th>
                  <th style="padding:10px;">Centro de custo</th>
                  <th style="padding:10px;">Período</th>
                  <th style="padding:10px;text-align:right;">Orçado</th>
                  <th style="padding:10px;text-align:right;">Gasto</th>
                  <th style="padding:10px;text-align:right;">Saldo</th>
                  <th style="padding:10px;">Uso</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="8" style="padding:28px;text-align:center;color:#94a3b8;">Nenhum orçamento ainda. Crie o primeiro a partir de um centro de custo.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ${this.renderModalShell()}`;
  },

  renderDetail() {
    const b = this.selectedBudget();
    if (!b) {
      MarketingState.view = 'list';
      return this.renderList();
    }
    const rem = this.remainingOf(b);
    const expenses = [...(b.expenses || [])].sort((a, c) => String(c.date || '').localeCompare(String(a.date || '')));
    const expRows = expenses.map(x => `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px;">${this.fmtDate(x.date)}</td>
        <td style="padding:10px;font-weight:600;">${this.esc(x.description)}</td>
        <td style="padding:10px;color:#64748b;">${this.esc(x.vendor || '—')}</td>
        <td style="padding:10px;text-align:right;font-weight:700;">${this.money(x.value)}</td>
        <td style="padding:10px;text-align:right;">
          ${(b.status || 'aberto') === 'aberto' ? `<button class="btn btn-outline btn-sm" style="color:#dc2626;border-color:#fecaca;padding:4px 8px;" onclick="event.stopPropagation();MarketingApp.deleteExpense('${this.esc(b.id)}','${this.esc(x.id)}')"><i data-lucide="trash" style="width:14px;height:14px;"></i></button>` : ''}
        </td>
      </tr>`).join('');

    return `
      <div style="padding:8px 4px 24px;">
        <button class="btn btn-outline" style="margin-bottom:12px;" onclick="MarketingApp.backToList()"><i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Voltar</button>
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;color:#fff;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.75rem;opacity:0.85;text-transform:uppercase;letter-spacing:0.4px;">Evento</div>
            <div style="font-size:1.2rem;font-weight:800;">${this.esc(b.eventName)}</div>
            <div style="font-size:0.85rem;margin-top:4px;opacity:0.9;">${this.esc(b.costCenterId)} — ${this.esc(b.costCenterName || '')}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;">
            ${(b.status || 'aberto') === 'aberto' ? `
              <button class="btn" style="background:#fff;color:#105436;font-weight:700;border:none;" onclick="MarketingApp.openBudgetModal('${this.esc(b.id)}')">Editar</button>
              <button class="btn" style="background:#fff7ed;color:#c2410c;font-weight:700;border:none;" onclick="MarketingApp.toggleStatus('${this.esc(b.id)}')">Encerrar</button>
            ` : `<button class="btn" style="background:#fff;color:#105436;font-weight:700;border:none;" onclick="MarketingApp.toggleStatus('${this.esc(b.id)}')">Reabrir</button>`}
            <button class="btn" style="background:#fee2e2;color:#b91c1c;font-weight:700;border:none;" onclick="MarketingApp.deleteBudget('${this.esc(b.id)}')">Excluir</button>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:18px;border-radius:0 0 12px 12px;">
          ${this.renderKpis([b])}
          <div style="margin-bottom:16px;">${this.barHtml(b)}</div>
          ${b.notes ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;color:#475569;"><strong>Observações:</strong> ${this.esc(b.notes)}</div>` : ''}

          ${(b.status || 'aberto') === 'aberto' ? `
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin-bottom:18px;">
            <div style="font-weight:800;color:#9a3412;margin-bottom:10px;">Lançar gasto</div>
            <div style="display:grid;grid-template-columns:1.4fr 1fr 0.8fr 0.8fr auto;gap:8px;align-items:end;">
              <div>
                <label style="font-size:0.75rem;font-weight:700;color:#7c2d12;">Descrição</label>
                <input id="mkt-exp-desc" style="width:100%;padding:8px 10px;border:1px solid #fdba74;border-radius:8px;" placeholder="Ex.: som, palco, mídia">
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;color:#7c2d12;">Fornecedor</label>
                <input id="mkt-exp-vendor" style="width:100%;padding:8px 10px;border:1px solid #fdba74;border-radius:8px;" placeholder="Opcional">
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;color:#7c2d12;">Data</label>
                <input id="mkt-exp-date" type="date" style="width:100%;padding:8px 10px;border:1px solid #fdba74;border-radius:8px;" value="${new Date().toISOString().slice(0, 10)}">
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;color:#7c2d12;">Valor</label>
                <input id="mkt-exp-value" type="text" inputmode="decimal" style="width:100%;padding:8px 10px;border:1px solid #fdba74;border-radius:8px;" placeholder="0,00">
              </div>
              <button class="btn btn-primary" onclick="MarketingApp.addExpense('${this.esc(b.id)}')">Adicionar</button>
            </div>
            ${rem < 0 ? `<div style="margin-top:10px;color:#b91c1c;font-weight:700;font-size:0.85rem;">Este evento já estourou o orçamento em ${this.money(Math.abs(rem))}.</div>` : ''}
          </div>` : ''}

          <h3 style="margin:0 0 10px;font-size:0.95rem;color:#0f172a;">Gastos lançados</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="background:#f1f5f9;color:#475569;font-size:0.75rem;text-transform:uppercase;">
                <th style="padding:8px 10px;text-align:left;">Data</th>
                <th style="padding:8px 10px;text-align:left;">Descrição</th>
                <th style="padding:8px 10px;text-align:left;">Fornecedor</th>
                <th style="padding:8px 10px;text-align:right;">Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${expRows || `<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">Nenhum gasto lançado neste evento.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      ${this.renderModalShell()}`;
  },

  renderModalShell() {
    const ccOptions = MarketingState.costCenters.map(cc =>
      `<option value="${this.esc(this.ccLabel(cc))}"></option>`
    ).join('');
    return `
      <div id="mkt-budget-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:100000;align-items:center;justify-content:center;padding:16px;">
        <div style="background:#fff;border-radius:12px;width:560px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 40px rgba(0,0,0,0.18);">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <h3 id="mkt-modal-title" style="margin:0;font-size:1.05rem;">Novo orçamento</h3>
            <button onclick="MarketingApp.closeBudgetModal()" style="border:none;background:none;cursor:pointer;font-size:1.2rem;color:#64748b;">✕</button>
          </div>
          <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">
            <input type="hidden" id="mkt-edit-id">
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Centro de custo *</label>
              <input id="mkt-cc-search" list="mkt-cc-list" placeholder="Digite o ID ou nome do empreendimento" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
              <datalist id="mkt-cc-list">${ccOptions}</datalist>
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Nome do evento *</label>
              <input id="mkt-event-name" placeholder="Ex.: Feirão Avaré 2026" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Início</label>
                <input id="mkt-start" type="date" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Fim</label>
                <input id="mkt-end" type="date" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
              </div>
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Valor orçado *</label>
              <input id="mkt-planned" type="text" inputmode="decimal" placeholder="0,00" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Observações</label>
              <textarea id="mkt-notes" rows="3" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;resize:vertical;"></textarea>
            </div>
          </div>
          <div style="padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn btn-outline" onclick="MarketingApp.closeBudgetModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="MarketingApp.saveBudget()">Salvar orçamento</button>
          </div>
        </div>
      </div>`;
  },

  bindListEvents() {
    const text = document.getElementById('mkt-filter-text');
    const status = document.getElementById('mkt-filter-status');
    if (text) {
      text.onchange = () => {
        MarketingState.filterText = text.value;
        this.render();
      };
      text.onkeydown = (e) => {
        if (e.key === 'Enter') {
          MarketingState.filterText = text.value;
          this.render();
        }
      };
    }
    if (status) {
      status.onchange = () => {
        MarketingState.filterStatus = status.value;
        this.render();
      };
    }
  },

  resolveCcFromInput(raw) {
    const val = String(raw || '').trim();
    if (!val) return null;
    return MarketingState.costCenters.find(c =>
      String(c.id) === val ||
      this.ccLabel(c) === val ||
      `${c.id} — ${c.name}` === val ||
      String(c.name || '').toLowerCase() === val.toLowerCase()
    ) || null;
  },

  openBudgetModal(id) {
    const modal = document.getElementById('mkt-budget-modal');
    if (!modal) return;
    const b = id ? MarketingState.budgets.find(x => x.id === id) : null;
    document.getElementById('mkt-modal-title').textContent = b ? 'Editar orçamento' : 'Novo orçamento';
    document.getElementById('mkt-edit-id').value = b ? b.id : '';
    document.getElementById('mkt-cc-search').value = b ? this.ccLabel({ id: b.costCenterId, name: b.costCenterName }) : '';
    document.getElementById('mkt-event-name').value = b ? (b.eventName || '') : '';
    document.getElementById('mkt-start').value = b ? (b.startDate || '') : '';
    document.getElementById('mkt-end').value = b ? (b.endDate || '') : '';
    document.getElementById('mkt-planned').value = b ? String(b.plannedValue || '').replace('.', ',') : '';
    document.getElementById('mkt-notes').value = b ? (b.notes || '') : '';
    modal.style.display = 'flex';
  },

  closeBudgetModal() {
    const modal = document.getElementById('mkt-budget-modal');
    if (modal) modal.style.display = 'none';
  },

  async saveBudget() {
    const editId = document.getElementById('mkt-edit-id').value;
    const cc = this.resolveCcFromInput(document.getElementById('mkt-cc-search').value);
    const eventName = document.getElementById('mkt-event-name').value.trim();
    const planned = this.parseMoney(document.getElementById('mkt-planned').value);
    if (!cc) {
      alert('Selecione um centro de custo válido.');
      return;
    }
    if (!eventName) {
      alert('Informe o nome do evento.');
      return;
    }
    if (planned <= 0) {
      alert('Informe o valor orçado do evento.');
      return;
    }
    const existing = editId ? MarketingState.budgets.find(b => b.id === editId) : null;
    const budget = existing || {
      id: 'local-' + Date.now(),
      expenses: [],
      status: 'aberto',
      createdAt: new Date().toISOString(),
      createdBy: this.currentUserName()
    };
    budget.eventName = eventName;
    budget.costCenterId = String(cc.id);
    budget.costCenterName = cc.name || cc.nome || '';
    budget.companyId = cc.companyId != null ? String(cc.companyId) : '';
    budget.startDate = document.getElementById('mkt-start').value || '';
    budget.endDate = document.getElementById('mkt-end').value || '';
    budget.plannedValue = planned;
    budget.notes = document.getElementById('mkt-notes').value.trim();
    budget.updatedAt = new Date().toISOString();
    if (!existing) MarketingState.budgets.unshift(budget);
    try {
      await this.persistBudget(budget);
      this.closeBudgetModal();
      if (existing) MarketingState.selectedId = budget.id;
      this.render();
    } catch (e) {
      console.error(e);
      alert('Não foi possível salvar o orçamento: ' + e.message);
    }
  },

  openDetail(id) {
    MarketingState.selectedId = id;
    MarketingState.view = 'detail';
    this.render();
  },

  backToList() {
    MarketingState.view = 'list';
    MarketingState.selectedId = null;
    this.render();
  },

  async addExpense(budgetId) {
    const b = MarketingState.budgets.find(x => x.id === budgetId);
    if (!b) return;
    const description = (document.getElementById('mkt-exp-desc') || {}).value || '';
    const value = this.parseMoney((document.getElementById('mkt-exp-value') || {}).value);
    if (!description.trim() || value <= 0) {
      alert('Informe a descrição e o valor do gasto.');
      return;
    }
    b.expenses = b.expenses || [];
    b.expenses.push({
      id: 'e-' + Date.now(),
      description: description.trim(),
      vendor: ((document.getElementById('mkt-exp-vendor') || {}).value || '').trim(),
      date: (document.getElementById('mkt-exp-date') || {}).value || new Date().toISOString().slice(0, 10),
      value,
      createdAt: new Date().toISOString(),
      createdBy: this.currentUserName()
    });
    b.updatedAt = new Date().toISOString();
    try {
      await this.persistBudget(b);
      this.render();
    } catch (e) {
      alert('Não foi possível lançar o gasto: ' + e.message);
    }
  },

  async deleteExpense(budgetId, expenseId) {
    const b = MarketingState.budgets.find(x => x.id === budgetId);
    if (!b) return;
    if (!confirm('Excluir este gasto?')) return;
    b.expenses = (b.expenses || []).filter(x => x.id !== expenseId);
    b.updatedAt = new Date().toISOString();
    await this.persistBudget(b);
    this.render();
  },

  async toggleStatus(id) {
    const b = MarketingState.budgets.find(x => x.id === id);
    if (!b) return;
    b.status = (b.status || 'aberto') === 'aberto' ? 'encerrado' : 'aberto';
    b.updatedAt = new Date().toISOString();
    await this.persistBudget(b);
    this.render();
  },

  async deleteBudget(id) {
    if (!confirm('Excluir este orçamento e todos os gastos lançados?')) return;
    MarketingState.budgets = MarketingState.budgets.filter(b => b.id !== id);
    this.persistLocal();
    try { await this.removeBudgetDoc(id); } catch (e) { console.warn(e); }
    this.backToList();
  }
};

window.MarketingApp = MarketingApp;

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'construcao-marketing') {
    MarketingApp.init();
  }
});
