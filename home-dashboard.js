const HomeDashboard = {
  // Mascotes disponíveis
  pets: [
    { id: '3d_iael', is3DModel: true, glbUrl: 'assets/pets/IA.eL.glb', icon: '🤖', name: 'IA.EL' },
    { id: '3d_bluy', is3DModel: true, glbUrl: 'assets/pets/Bluy.glb', icon: '⚙️', name: 'Bluy' },
    { id: '3d_ledis', is3DModel: true, glbUrl: 'assets/pets/Ledis.glb', icon: '🦟', name: 'Ledis' },
    { id: '3d_lety', is3DModel: true, glbUrl: 'assets/pets/LeTy.glb', icon: '🛸', name: 'LeTy' },
    { id: '3d_nial', is3DModel: true, glbUrl: 'assets/pets/niAL.glb', icon: '<div style="width: 28px; height: 28px; background: #e11d48; border-radius: 50%; margin: 0 auto; box-shadow: inset 0 -6px 0 rgba(0,0,0,0.3); position: relative;"><div style="position: absolute; top: 8px; left: 6px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid white; transform: rotate(45deg);"></div><div style="position: absolute; top: 12px; right: 4px; width: 4px; height: 4px; background: black; border-radius: 50%;"></div></div>', name: 'NiAL' }
  ],
  
  motivationalQuotes: [
    "Acredite em si próprio e chegará um dia em que os outros não terão outra escolha senão acreditar com você.",
    "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
    "Com fé e dedicação, nenhum obstáculo é grande demais.",
    "Cada novo dia é uma página em branco para escrever uma nova vitória.",
    "A persistência realiza o impossível.",
    "Deus não te daria um fardo maior do que você pode carregar. Força!",
    "Seja a mudança que você deseja ver no mundo.",
    "A excelência não é um ato, mas um hábito.",
    "Grandes batalhas são dadas a grandes guerreiros.",
    "O segredo do sucesso é a constância do propósito."
  ],

  get selectedPetId() {
    let key = 'crm_home_pet';
    try {
      const u = JSON.parse(localStorage.getItem("crm_logged_user"));
      if (u && (u.id || u.email)) key += '_' + (u.id || u.email);
    } catch(e){}
    return localStorage.getItem(key) || '3d_iael';
  },
  
  set selectedPetId(value) {
    let key = 'crm_home_pet';
    try {
      const u = JSON.parse(localStorage.getItem("crm_logged_user"));
      if (u && (u.id || u.email)) key += '_' + (u.id || u.email);
    } catch(e){}
    localStorage.setItem(key, value);
  },
  intervalId: null,
  DEFAULT_PREVIEW_SIENGE: 'LETICIA.OLIVEIRA',

  normalizeOperatorKey(value) {
    return String(value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  isAdminUser(user) {
    const profile = (user?.profile_name || '').toUpperCase();
    const email = (user?.email || '').toLowerCase();
    return profile.includes('ADMIN') || profile.includes('GESTOR') || profile.includes('GERENTE')
      || email === 'israel@mouraleite.com.br' || email === 'admin@mouraleite.com.br';
  },

  getCrmUsers() {
    try {
      return JSON.parse(localStorage.getItem('crm_users') || '[]') || [];
    } catch (e) {
      return [];
    }
  },

  getOperatorUsers() {
    const fromStorage = this.getCrmUsers().filter(u => {
      const profile = (u.profile_name || '').toUpperCase();
      const status = (u.status || '').toUpperCase();
      return profile.includes('OPERADOR') && status !== 'INATIVO';
    });
    if (fromStorage.length) return fromStorage;
    return [
      { name: 'LETICIA PEREIRA DE OLIVEIRA', sienge_user: 'LETICIA.OLIVEIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'MICHELLE FRANCINE VIEIRA', sienge_user: 'MICHELLE.VIEIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'MICHELLE PEREIRA YAMASHIRO', sienge_user: 'MICHELLE.PEREIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'THAIANE CRISTINA', sienge_user: 'THAIANE.CORDEIRO', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'LUCELIA SALVADOR JUSTO', sienge_user: 'LUCELIA JUSTO', profile_name: 'OPERADOR COBRANÇA' }
    ];
  },

  getViewUser() {
    const real = window.AppState?.currentUser;
    if (!this.isAdminUser(real)) return real;

    const operators = this.getOperatorUsers();
    const stored = sessionStorage.getItem('crm_home_preview_op') || this.DEFAULT_PREVIEW_SIENGE;
    const wanted = this.normalizeOperatorKey(stored);
    const preview = operators.find(u =>
      this.normalizeOperatorKey(u.sienge_user) === wanted
      || this.normalizeOperatorKey(u.name) === wanted
      || String(u.id) === String(stored)
    ) || operators.find(u => this.normalizeOperatorKey(u.sienge_user).includes('LETICIA'))
      || operators[0];

    return preview || real;
  },

  getViewOperatorKey() {
    const user = this.getViewUser();
    return this.normalizeOperatorKey(user?.sienge_user || user?.name || '');
  },

  getMyClients() {
    const list = window.rawClientList || [];
    const opKey = this.getViewOperatorKey();
    if (!opKey) return list;
    return list.filter(c => this.normalizeOperatorKey(c.assignedOperator) === opKey);
  },

  isBackOfficeUser(user) {
    const p = String(user?.profile_name || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (p.includes('BACK OFFICE') || p.includes('BACKOFFICE')) return true;
    const blob = String(user?.name || '') + ' ' + String(user?.sienge_user || '');
    return /LUCELIA/i.test(blob);
  },

  isInternoCobrancaUser(user) {
    if (!user) return false;
    if (this.isBackOfficeUser(user)) return false;
    const p = String(user.profile_name || '').toUpperCase();
    const t = String(user.operator_type || 'interno');
    return p.includes('OPERADOR') && t === 'interno';
  },

  clientKey(c) {
    return String(c.customerId) + '-' + String(c.saleId);
  },

  displayedTitle(c) {
    return String((c.billIds && c.billIds[0]) || c.saleId || '').replace(/^B-/, '').split('-')[0];
  },

  hasRealContact(c) {
    const notes = (window.AppState && AppState.notes && AppState.notes[c.customerId]) || [];
    return notes.some(n => {
      const canal = String(n.canal || '').toLowerCase();
      if (canal === 'nota interna' || n.fase === 'Nota Interna') return false;
      return !!(n.text || n.date);
    });
  },

  isZeroPaidClient(c) {
    if (!c) return false;
    if (c.isZeroPaid) return true;
    if (c.percPaid != null && Number(c.percPaid) === 0) return true;
    return typeof window.nexClientIsZeroPaid === 'function' && window.nexClientIsZeroPaid(c.customerId, c.saleId);
  },

  isSuspenderZero(c) {
    if (!this.isZeroPaidClient(c)) return false;
    const cc = typeof window.nexCcConfig === 'function' ? window.nexCcConfig(c.costCenterId, c.unitName) : {};
    if (!cc.clausula_suspensiva_ativa) return false;
    const days = Number(c.maxDaysDelay) || 0;
    return days >= (Number(cc.clausula_suspensiva_dias) || 30);
  },

  isEnviarNexZero(c) {
    if (!this.isZeroPaidClient(c)) return false;
    const cc = typeof window.nexCcConfig === 'function' ? window.nexCcConfig(c.costCenterId, c.unitName) : {};
    if (cc.clausula_suspensiva_ativa) return false;
    const days = Number(c.maxDaysDelay) || 0;
    const zeroDays = (typeof window.nexReguaDays === 'function' ? window.nexReguaDays().zero : 31) || 31;
    if (days < zeroDays) return false;
    if (typeof window.nexHasLetterForClient === 'function') return !window.nexHasLetterForClient(c);
    return !(typeof window.nexHasLetter === 'function' && window.nexHasLetter(c.customerId, c.saleId));
  },

  isRecenteJuridico(c) {
    try {
      const hist = JSON.parse(localStorage.getItem('subjudiceHistory') || '{}') || {};
      const mem = hist[c.customerId] || hist[String(c.customerId)];
      if (!mem || !mem.exitDate) return false;
      const retroDays = parseInt((window.advFilters && window.advFilters.retroMeses) || '90', 10);
      const limit = new Date();
      limit.setDate(limit.getDate() - retroDays);
      const ed = new Date(String(mem.exitDate).split('T')[0] + 'T12:00:00');
      return !Number.isNaN(ed.getTime()) && ed >= limit;
    } catch (e) {
      return false;
    }
  },

  unfinishedYesterday(opName) {
    let cache = {};
    try {
      cache = JSON.parse(localStorage.getItem('crm_daily_queue_cache_v3') || localStorage.getItem('crm_daily_queue_cache_v2') || '{}') || {};
    } catch (e) { cache = {}; }
    const today = new Date().toISOString().split('T')[0];
    const prefixes = [opName, this.normalizeOperatorKey(opName)];
    let latest = null;
    let latestKey = null;
    Object.keys(cache).forEach(k => {
      const d = k.split('_').pop();
      if (!d || d >= today) return;
      const head = k.slice(0, k.length - d.length - 1);
      const ok = prefixes.some(p => this.normalizeOperatorKey(head) === this.normalizeOperatorKey(p) || this.normalizeOperatorKey(head).includes(this.normalizeOperatorKey(p).split(' ')[0]));
      if (!ok) return;
      if (!latest || d > latest) {
        latest = d;
        latestKey = k;
      }
    });
    if (!latestKey) return [];
    const queue = cache[latestKey] || [];
    return queue.filter(item => {
      const notes = (window.AppState && AppState.notes && AppState.notes[item.customerId]) || [];
      let done = false;
      notes.forEach(n => {
        if (n.promiseDate >= today && n.promiseStatus === 'Pendente' && n.status !== 'Cancelada') {
          if (!n.saleId || String(n.saleId) === String(item.saleId)) done = true;
        }
        if (n.date && String(n.date).slice(0, 10) >= latest && n.author && this.normalizeOperatorKey(n.author).includes(this.normalizeOperatorKey(opName).split(' ')[0])) {
          if (!n.saleId || String(n.saleId) === String(item.saleId)) done = true;
        }
      });
      return !done;
    });
  },

  collectInsightGroups(scopeClients, user) {
    const juridicoNode = window.TimelineState ? window.TimelineState.find(n => n.acao === 'juridico') : null;
    const thresholdJuridico = juridicoNode ? juridicoNode.dias : 151;
    const groups = [];
    const back = this.isBackOfficeUser(user);

    if (back) {
      const vencidos = scopeClients.filter(c => {
        const info = typeof window.getClientJudicialPhaseInfo === 'function' ? window.getClientJudicialPhaseInfo(c) : null;
        return info && info.status === 'VENCIDO';
      });
      const paraJuridico = scopeClients.filter(c => c.subjudice !== 'S' && (Number(c.maxDaysDelay) || 0) >= thresholdJuridico);
      const aposAcordo = scopeClients.filter(c => this.isRecenteJuridico(c));
      groups.push({ id: 'prazo-etapa', label: vencidos.length + ' títulos venceram prazo da etapa', items: vencidos, hideIfEmpty: false });
      groups.push({ id: 'ir-juridico', label: paraJuridico.length + ' títulos precisam ir para jurídico', items: paraJuridico, hideIfEmpty: false });
      groups.push({ id: 'apos-acordo', label: aposAcordo.length + ' títulos atrasaram após acordo', items: aposAcordo, hideIfEmpty: false });
      return groups;
    }

    const suspender = scopeClients.filter(c => this.isSuspenderZero(c));
    const uniqueCust = new Set(suspender.map(c => String(c.customerId)));
    const enviar = scopeClients.filter(c => this.isEnviarNexZero(c));
    const semContato = scopeClients.filter(c => this.isZeroPaidClient(c) && !this.hasRealContact(c));
    const opName = user?.sienge_user || user?.name || '';
    const leftover = this.unfinishedYesterday(opName);
    const leftoverKeys = new Set(leftover.map(i => String(i.customerId) + '-' + String(i.saleId)));
    const leftoverClients = scopeClients.filter(c => leftoverKeys.has(this.clientKey(c)));
    const mais91 = scopeClients.filter(c => (Number(c.maxDaysDelay) || 0) >= 91);

    groups.push({ id: 'suspender', label: uniqueCust.size + ' clientes 0% pago para suspender', items: suspender, hideIfEmpty: true, count: uniqueCust.size });
    groups.push({ id: 'enviar-nex', label: enviar.length + ' títulos 0% pago enviar Nex', items: enviar, hideIfEmpty: true });
    groups.push({ id: 'sem-contato', label: semContato.length + ' títulos 0% sem nenhum contato', items: semContato, hideIfEmpty: false });
    groups.push({ id: 'ontem', label: leftoverClients.length + ' títulos da sua fila não foram finalizados ontem', items: leftoverClients.length ? leftoverClients : leftover, hideIfEmpty: false });
    groups.push({ id: 'mais-91', label: mais91.length + ' títulos com mais de 91 dias', items: mais91, hideIfEmpty: false });
    return groups;
  },

  escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  localDateStr(dateObj) {
    if (typeof window.localDateStr === 'function') return window.localDateStr(dateObj);
    const d = dateObj instanceof Date ? dateObj : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  weekMondayStr(dateObj) {
    const d = dateObj instanceof Date ? new Date(dateObj) : new Date();
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return this.localDateStr(d);
  },

  getTodayWorkStats() {
    const user = this.getViewUser();
    const opName = user?.sienge_user || user?.name || '';
    const today = this.localDateStr();
    const notes = (window.AppState && AppState.notes) || {};
    let ativo = 0;
    let receptivo = 0;
    Object.values(notes).forEach(list => {
      (list || []).forEach(n => {
        const nd = String(n.date || '').slice(0, 10);
        if (nd !== today) return;
        if (n.status === 'Cancelada') return;
        if (opName && typeof window.occurrenceAuthorMatchesOperator === 'function') {
          if (!window.occurrenceAuthorMatchesOperator(n.author, opName)) return;
        }
        const ini = String(n.iniciativa || '').toLowerCase();
        if (ini === 'receptivo') receptivo++;
        else if (ini === 'ativo') ativo++;
      });
    });

    let filaTotal = 0;
    let filaDone = 0;
    try {
      const cache = JSON.parse(localStorage.getItem('crm_daily_queue_cache_v3') || localStorage.getItem('crm_daily_queue_cache_v2') || '{}') || {};
      const prefixes = [opName, this.normalizeOperatorKey(opName)];
      Object.keys(cache).forEach(k => {
        const d = k.split('_').pop();
        if (d !== today) return;
        const head = k.slice(0, k.length - d.length - 1);
        const ok = prefixes.some(p => this.normalizeOperatorKey(head) === this.normalizeOperatorKey(p)
          || this.normalizeOperatorKey(head).includes(this.normalizeOperatorKey(p).split(' ')[0]));
        if (!ok) return;
        const queue = cache[k] || [];
        filaTotal = Math.max(filaTotal, queue.length);
        filaDone = queue.filter(item => {
          const occs = (window.AppState && AppState.notes && AppState.notes[item.customerId]) || [];
          return occs.some(n => {
            const nd = String(n.date || '').slice(0, 10);
            if (nd !== today) return false;
            if (n.status === 'Cancelada') return false;
            if (n.saleId && String(n.saleId) !== String(item.saleId)) return false;
            return true;
          }) || item.isResolved;
        }).length;
      });
    } catch (e) {}

    const capacity = 25;
    return { ativo, receptivo, filaTotal: filaTotal || capacity, filaDone, capacity };
  },

  getWeekBarrigaCount() {
    const user = this.getViewUser();
    const opName = user?.sienge_user || user?.name || '';
    const monday = this.weekMondayStr();
    let count = 0;
    try {
      const data = JSON.parse(localStorage.getItem('crm_barriga_seals') || '{}') || {};
      Object.keys(data).forEach(k => {
        if (opName && typeof window.occurrenceAuthorMatchesOperator === 'function') {
          if (!window.occurrenceAuthorMatchesOperator(k, opName) && this.normalizeOperatorKey(k) !== this.normalizeOperatorKey(opName)) return;
        } else if (this.normalizeOperatorKey(k) !== this.normalizeOperatorKey(opName)) return;
        (data[k] || []).forEach(d => {
          if (String(d) >= monday) count++;
        });
      });
    } catch (e) {}
    return count;
  },

  uniqueInsightClients(items) {
    const seen = new Set();
    const out = [];
    (items || []).forEach(c => {
      const id = String(c.customerId || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(c);
    });
    return out;
  },

  renderInsights() {
    const box = document.getElementById('home-op-insights-container');
    if (!box) return;
    const user = this.getViewUser();
    const back = this.isBackOfficeUser(user);
    const scope = back ? (window.rawClientList || []) : this.getMyClients();
    const groups = this.collectInsightGroups(scope, user).filter(g => !g.hideIfEmpty || (g.count != null ? g.count : g.items.length) > 0);
    this._insightGroups = groups;
    if (!groups.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    const firstName = (user?.name || 'Operador').split(' ')[0].toUpperCase();
    const openIdx = this._insightOpenIdx;
    const stats = this.getTodayWorkStats();
    const seals = this.getWeekBarrigaCount();
    const bar = (val, max, color) => {
      const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
      return `<div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;"></div>
      </div>`;
    };
    box.style.display = 'block';
    box.innerHTML = `
      <style>@media (max-width: 900px) { #home-op-insights-container .home-insights-layout { grid-template-columns: 1fr !important; } }</style>
      <div class="home-insights-layout" style="display:grid; grid-template-columns: minmax(0,1.4fr) minmax(240px,0.7fr); gap:16px; align-items:stretch;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
          <div style="background:#f8fafc; padding:14px 18px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="lightbulb" style="width:18px;color:#ca8a04;"></i>
            <h3 style="margin:0;font-size:1.05rem;color:#1e293b;">Insights importantes — ${firstName}</h3>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; padding:14px;">
            ${groups.map((g, i) => {
              const open = openIdx === i;
              const clients = this.uniqueInsightClients(g.items);
              return `<div>
                <button type="button" onclick="window.openHomeInsight(${i})" style="width:100%; text-align:left; border:1px solid ${open ? '#f59e0b' : '#e2e8f0'}; background:${open ? '#fef3c7' : '#fffbeb'}; border-radius:8px; padding:10px 12px; cursor:pointer; font-size:0.88rem; font-weight:700; color:#854d0e;">
                  ${this.escHtml(g.label)}
                </button>
                ${open ? `
                  <div style="margin-top:6px; border:1px solid #fde68a; background:#fff; border-radius:8px; padding:8px 10px; max-height:280px; overflow:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <span style="font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase;">${clients.length} cliente(s)</span>
                      <button type="button" onclick="window.closeHomeInsightList()" style="border:none; background:#f1f5f9; border-radius:6px; padding:4px 8px; font-size:0.75rem; font-weight:700; cursor:pointer; color:#334155;">Voltar</button>
                    </div>
                    ${clients.length ? clients.map(c => `
                      <button type="button" onclick="window.openHomeInsightClient(${Number(c.customerId)}, ${JSON.stringify(String(c.saleId || ''))})" style="display:block; width:100%; text-align:left; border:none; background:transparent; padding:7px 4px; cursor:pointer; font-size:0.84rem; font-weight:600; color:#105436; border-bottom:1px solid #f1f5f9;">
                        ${this.escHtml(c.customerName || ('Cliente ' + c.customerId))}
                        <span style="display:block; font-size:0.7rem; font-weight:500; color:#94a3b8;">Título ${this.escHtml(this.displayedTitle(c) || c.saleId || '')}</span>
                      </button>`).join('') : `<div style="padding:8px; font-size:0.8rem; color:#64748b;">Nenhum cliente listado.</div>`}
                  </div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
          <div style="background:#f8fafc; padding:14px 18px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="activity" style="width:18px;color:#105436;"></i>
            <h3 style="margin:0;font-size:1.05rem;color:#1e293b;">Resumo do dia</h3>
          </div>
          <div style="padding:16px; display:flex; flex-direction:column; gap:16px;">
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:6px;">
                <span>Fila do dia</span><span>${stats.filaDone}/${stats.capacity}</span>
              </div>
              ${bar(stats.filaDone, stats.capacity, '#105436')}
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:6px;">
                <span>Ativo</span><span>${stats.ativo}</span>
              </div>
              ${bar(stats.ativo, stats.capacity, '#2563eb')}
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:6px;">
                <span>Receptivo</span><span>${stats.receptivo}</span>
              </div>
              ${bar(stats.receptivo, stats.capacity, '#7c3aed')}
            </div>
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; text-align:center;">
              <div style="font-size:0.7rem; font-weight:800; color:#166534; letter-spacing:0.04em; text-transform:uppercase;">Selos Seu Barriga</div>
              <div style="font-size:2rem; font-weight:800; color:#166534; line-height:1.1; margin:4px 0;">${seals}</div>
              <div style="font-size:0.75rem; color:#15803d;">ganhos nesta semana</div>
            </div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  renderPreviewBar() {
    const bar = document.getElementById('home-op-preview-bar');
    const select = document.getElementById('home-op-preview-select');
    if (!bar || !select) return;

    const real = window.AppState?.currentUser;
    if (!this.isAdminUser(real)) {
      bar.style.display = 'none';
      return;
    }

    const operators = this.getOperatorUsers();
    const currentKey = this.getViewOperatorKey();
    select.innerHTML = operators.map(u => {
      const key = u.sienge_user || u.name;
      const selected = this.normalizeOperatorKey(key) === currentKey ? 'selected' : '';
      const first = (u.name || key || '').split(' ')[0];
      return `<option value="${key}" ${selected}>${first} — ${u.name}</option>`;
    }).join('');
    bar.style.display = 'flex';
  },
  
  init() {
    const user = window.AppState?.currentUser;
    const isOperador = user?.profile_name?.toUpperCase().includes('OPERADOR') || user?.profile_name?.toUpperCase().includes('ADMIN');
    
    if (isOperador) {
      document.getElementById('home-em-construcao-container').style.display = 'none';
      document.getElementById('home-operador-container').style.display = 'block';
      document.getElementById('home-pet-container').style.display = 'flex';
      
      this.renderPreviewBar();
      this.updateGreeting();
      this.renderPetSelector();
      this.updatePetIcon();
      
      if (!window.rawClientList || window.rawClientList.length === 0) {
         document.getElementById('home-op-load-data-container').style.display = 'block';
         document.getElementById('home-op-grids-container').style.display = 'none';
         document.getElementById('home-op-lembretes-container').style.display = 'none';
         const ins0 = document.getElementById('home-op-insights-container');
         if (ins0) ins0.style.display = 'none';
      } else {
         document.getElementById('home-op-load-data-container').style.display = 'none';
         document.getElementById('home-op-grids-container').style.display = 'grid';
         document.getElementById('home-op-lembretes-container').style.display = 'block';
         
         this.renderGrids();
         this.renderLembretes();
         this.renderInsights();
         
         setTimeout(() => { this.speak(true, false); }, 2000);
      }
      
      // Enviar mensagens motivacionais automaticamente e atualizar a frase do banner
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
          this.speak(false, false); // false para apenas mostrar balão, não correr
          this.updateGreeting();
      }, 60000); // 1 minuto

    } else {
      document.getElementById('home-em-construcao-container').style.display = 'flex';
      document.getElementById('home-operador-container').style.display = 'none';
      document.getElementById('home-pet-container').style.display = 'none';
      if (this.intervalId) clearInterval(this.intervalId);
    }
  },

  updateGreeting() {
    const user = this.getViewUser();
    const name = user?.name?.split(' ')[0] || '';
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour < 12) greeting = 'Bom dia';
    else if (hour < 18) greeting = 'Boa tarde';
    
    const quote = this.motivationalQuotes[Math.floor(Math.random() * this.motivationalQuotes.length)];
    
    const greetingEl = document.getElementById('home-op-greeting');
    if (greetingEl) {
        greetingEl.textContent = `${greeting}, ${name.toUpperCase()}!`;
    }
    
    const quoteEl = document.getElementById('home-op-motivational');
    if (quoteEl) {
        quoteEl.textContent = `"${quote}"`;
    }
  },

  renderPetSelector() {
    const grid = document.getElementById('home-pet-selector-grid');
    if (!grid) return;
    
    grid.innerHTML = this.pets.map(p => `
      <div class="pet-selector-item" onclick="window.selectHomePet('${p.id}')" title="${p.name}">
        <div style="font-size: 32px; margin-bottom: 8px;">${p.icon}</div>
        <div style="font-size: 0.75rem; color: #475569; font-weight: 600;">${p.name}</div>
      </div>
    `).join('');
  },

  updatePetIcon() {
    const pet = this.pets.find(p => p.id === this.selectedPetId) || this.pets[0];
    const container = document.getElementById('home-pet-emoji');
    if (container) {
        if (pet.is3DModel) {
           // Aumentando o camera-orbit para 300% (afasta bastante a câmera) e reduzindo a caixa para 200x200 para ficar no tamanho ideal
           container.innerHTML = `<model-viewer id="my-3d-assistant" src="${pet.glbUrl}" autoplay auto-rotate rotation-per-second="5deg" animation-name="Idle" camera-controls interaction-prompt="none" disable-zoom disable-pan camera-orbit="0deg 75deg 300%" min-camera-orbit="auto 75deg auto" max-camera-orbit="auto 75deg auto" style="width: 200px; height: 200px; outline: none; --poster-color: transparent; background-color: transparent; margin-bottom: 0px; margin-right: 0px;"></model-viewer>`;
       } else {
           container.innerHTML = `<img src="${pet.url}" alt="${pet.name}" style="width: 120px; height: 120px; object-fit: contain; mix-blend-mode: multiply; display: block; margin-bottom: -15px;">`;
       }
    }
  },

  async loadData() {
    const btn = document.querySelector('#home-op-load-data-container button');
    if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 18px; margin-right: 8px;"></i> Carregando...';
    
    // Isso deve usar a função global de carregar do Dashboard se existir
    try {
      if (typeof window.carregarDados === 'function') {
         await window.carregarDados(); // Essa função preenche rawClientList
      } else {
         alert("Função de carregamento não encontrada.");
      }
    } catch (e) {
      console.error(e);
    }
    
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 18px; margin-right: 8px;"></i> Carregar Minha Fila';
    // Após carregar, re-renderizar
    this.init();
  },

  renderGrids() {
    if (!window.rawClientList) return;
    
    const myClients = this.getMyClients();
    
    const totalDelayedValue = myClients.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
    
    // Ordenar Top 10 Maiores Valores
    const sortedByValue = [...myClients].sort((a, b) => b.overdueValue - a.overdueValue);
    const topValores = sortedByValue.slice(0, 10);
    const idValores = new Set(topValores.map(c => `${c.customerId}-${c.saleId}`));
    
    const othersByValue = sortedByValue.slice(10);
    const sumOthersValue = othersByValue.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
    
    // Ordenar Top 10 Maiores Dias (ignorar os que estão no top valores)
    const topDias = [...myClients]
        .sort((a, b) => b.maxDaysDelay - a.maxDaysDelay)
        .filter(c => !idValores.has(`${c.customerId}-${c.saleId}`))
        .slice(0, 10);
        
    // Mas precisamos saber quais do topValores TAMBÉM estão no topo de dias (para a bolinha de info)
    const allDiasSorted = [...myClients].sort((a, b) => b.maxDaysDelay - a.maxDaysDelay);
    const top20DiasIds = new Set(allDiasSorted.slice(0, 20).map(c => `${c.customerId}-${c.saleId}`));

    const tbodyValores = document.getElementById('home-op-tbody-valores');
    if (topValores.length === 0) {
        tbodyValores.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum cliente em atraso na sua fila! 🎉</td></tr>';
    } else {
        let html = topValores.map(c => {
            const hasHighDelay = top20DiasIds.has(`${c.customerId}-${c.saleId}`);
            const warningIcon = hasHighDelay ? `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: #f59e0b; margin-left: 5px; vertical-align: -2px;"></i>` : '';
            const percent = totalDelayedValue > 0 ? ((c.overdueValue / totalDelayedValue) * 100).toFixed(1) : 0;
            
            const customerNotes = window.AppState?.notes?.[c.customerId] || [];
            const validNotes = customerNotes.filter(n => { const c = (n.canal||"").toLowerCase(); return c !== 'nota interna' && n.fase !== 'Nota Interna'; });
            const lastContact = validNotes.length > 0 ? new Date(Math.max(...validNotes.map(n => new Date(n.date)))).toLocaleDateString('pt-BR') : "Sem Contato";
            const promiseNotes = customerNotes.filter(n => n.promiseDate);
            const lastPromise = promiseNotes.length > 0 ? new Date(Math.max(...promiseNotes.map(n => new Date(n.promiseDate + 'T12:00:00')))).toLocaleDateString('pt-BR') : "Nenhum";
            const extraInfo = hasHighDelay ? `&#10;Atenção: Cliente está no topo de dias em atraso.` : '';
            const tooltip = `Parcelas em atraso: ${c.billCount || 1}&#10;Dias em atraso: ${c.maxDaysDelay} dias&#10;Último contato: ${lastContact}&#10;Próximo retorno: ${lastPromise}${extraInfo}`;
            
            return `
            <tr onclick="window.viewCustomerCard(${c.customerId}, ${c.saleId})" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'" title="${tooltip}">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 0.85rem;">${c.saleId || '-'}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.customerName || ''} ${warningIcon}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percent}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">${c.maxDaysDelay} dias</td>
            </tr>
            `;
        }).join('');
        
        if (sumOthersValue > 0) {
            const percentOthers = totalDelayedValue > 0 ? ((sumOthersValue / totalDelayedValue) * 100).toFixed(1) : 0;
            html += `
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; font-weight: 700;">Outros (${othersByValue.length} clientes)</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${sumOthersValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percentOthers}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">-</td>
            </tr>`;
        }
        
        html += `
        <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1;">
          <td style="padding: 8px 15px; font-weight: 500;">-</td>
          <td style="padding: 8px 15px; color: #1e293b; font-size: 0.85rem; font-weight: 800;">TOTAL GERAL (${myClients.length} clientes)</td>
          <td style="padding: 8px 15px; text-align: right; color: #ef4444; font-weight: 800; font-size: 0.9rem;">${totalDelayedValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
          <td style="padding: 8px 15px; text-align: right; font-weight: 800; color: #1e293b; font-size: 0.9rem;">100%</td>
          <td style="padding: 8px 15px; text-align: right; color: #f59e0b; font-weight: 800; font-size: 0.9rem;">-</td>
        </tr>`;
        
        tbodyValores.innerHTML = html;
    }

    const tbodyDias = document.getElementById('home-op-tbody-dias');
    if (topDias.length === 0) {
        tbodyDias.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum outro cliente.</td></tr>';
    } else {
        const othersDias = [...myClients]
            .sort((a, b) => b.maxDaysDelay - a.maxDaysDelay)
            .filter(c => !idValores.has(`${c.customerId}-${c.saleId}`))
            .slice(10);
            
        const sumOthersDiasValue = othersDias.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
        
        let htmlDias = topDias.map(c => {
            const customerNotes = window.AppState?.notes?.[c.customerId] || [];
            const validNotes = customerNotes.filter(n => { const c = (n.canal||"").toLowerCase(); return c !== 'nota interna' && n.fase !== 'Nota Interna'; });
            const lastContact = validNotes.length > 0 ? new Date(Math.max(...validNotes.map(n => new Date(n.date)))).toLocaleDateString('pt-BR') : "Sem Contato";
            const promiseNotes = customerNotes.filter(n => n.promiseDate);
            const lastPromise = promiseNotes.length > 0 ? new Date(Math.max(...promiseNotes.map(n => new Date(n.promiseDate + 'T12:00:00')))).toLocaleDateString('pt-BR') : "Nenhum";
            const tooltip = `Parcelas em atraso: ${c.billCount || 1}&#10;Dias em atraso: ${c.maxDaysDelay} dias&#10;Último contato: ${lastContact}&#10;Próximo retorno: ${lastPromise}&#10;Valor atrasado: R$ ${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
            
            const percent = totalDelayedValue > 0 ? ((c.overdueValue / totalDelayedValue) * 100).toFixed(1) : 0;
            return `
            <tr onclick="window.viewCustomerCard(${c.customerId}, ${c.saleId})" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'" title="${tooltip}">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 0.85rem;">${c.saleId || '-'}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.customerName || ''}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">${c.maxDaysDelay} dias</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percent}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>
            `;
        }).join('');
        
        if (sumOthersDiasValue > 0) {
            const percentOthersDias = totalDelayedValue > 0 ? ((sumOthersDiasValue / totalDelayedValue) * 100).toFixed(1) : 0;
            htmlDias += `
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; font-weight: 700;">Outros (${othersDias.length} clientes)</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percentOthersDias}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${sumOthersDiasValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>`;
        }
        
        const topDiasSumValue = topDias.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
        const totalDiasValue = topDiasSumValue + sumOthersDiasValue;
        const totalDiasPercent = totalDelayedValue > 0 ? ((totalDiasValue / totalDelayedValue) * 100).toFixed(1) : 0;
        
        htmlDias += `
        <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1;">
          <td style="padding: 8px 15px; font-weight: 500;">-</td>
          <td style="padding: 8px 15px; color: #1e293b; font-size: 0.85rem; font-weight: 800;">TOTAL GERAL (${myClients.length} clientes)</td>
          <td style="padding: 8px 15px; text-align: right; color: #f59e0b; font-weight: 800; font-size: 0.9rem;">-</td>
          <td style="padding: 8px 15px; text-align: right; font-weight: 800; color: #1e293b; font-size: 0.9rem;">100%</td>
          <td style="padding: 8px 15px; text-align: right; color: #ef4444; font-weight: 800; font-size: 0.9rem;">${totalDelayedValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
        </tr>`;
        
        tbodyDias.innerHTML = htmlDias;
    }
    
    if(window.lucide) window.lucide.createIcons();
  },

  renderLembretes() {
    const list = document.getElementById('home-op-lembretes-list');
    
    // Obter os lembretes de hoje do operador
    if (typeof window.getAgendaTasksForDate === 'function') {
        const todayStr = new Date().toISOString().split('T')[0];
        const tasks = window.getAgendaTasksForDate(todayStr);
        const viewUser = this.getViewUser();
        const userOp = viewUser?.name?.split(' ')[0] || '';
        const opKey = this.getViewOperatorKey();
        
        const myTasks = tasks.filter(t => {
           if (t.operator && t.operator !== 'NÃO ATRIBUÍDO' && t.operator !== 'OUTROS' && opKey) {
               const taskKey = this.normalizeOperatorKey(t.operator);
               if (taskKey !== opKey && !taskKey.includes(this.normalizeOperatorKey(userOp))) {
                   if (t.sharedWith && t.sharedWith.includes(userOp)) return true;
                   return false;
               }
           }
           return true;
        });

        if (myTasks.length === 0) {
           list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Você não tem lembretes para hoje.</div>';
        } else {
           list.innerHTML = myTasks.map(t => {
               const st = (t.status||'').toLowerCase();
               const isResolved = st === 'resolvido';
               if (isResolved) return ''; // Podemos omitir
               
               return `
               <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--color-primary);">
                 <div>
                   <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t.title}</div>
                   <div style="font-size: 0.8rem; color: #64748b;">${t.clientName}</div>
                   <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Lembrete: ${t.reminder || 'Acompanhar'}</div>
                 </div>
                 <button class="btn btn-outline btn-sm" onclick="window.switchTab('agenda'); setTimeout(()=>window.setAgendaOperator('${userOp}'), 500);" style="padding: 4px 8px; font-size: 0.75rem;">Ver na Agenda</button>
               </div>
               `;
           }).join('');
           
           if(list.innerHTML.trim() === '') {
              list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum lembrete pendente para hoje.</div>';
           }
        }
    } else {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Erro ao carregar lembretes.</div>';
    }
  },

  async speak(includeFeedback = false, isClick = false, isNewSelection = false) {
    const box = document.getElementById('home-pet-speech');
    const textEl = document.getElementById('home-pet-speech-text');
    const modelViewer = document.getElementById('my-3d-assistant');
    const petContainer = document.getElementById('home-pet-container');
    
    const user = this.getViewUser();
    let rawOpName = (user?.name || user?.profile_name || 'Parceiro').split(' ')[0];
    const opName = rawOpName.charAt(0).toUpperCase() + rawOpName.slice(1).toLowerCase();
    
    if (isClick && petContainer) {
        let stateStr = localStorage.getItem('mascotPlayState');
        let playState = stateStr ? JSON.parse(stateStr) : { clickCount: 0, lockTime: 0, lastMascotName: '' };
        
        const currentPetId = localStorage.getItem('selectedHomePet') || 'pet_nivea';
        const now = Date.now();
        const lockDuration = 3600000; // 1 hour
        
        const tiredPhrases = [
            "Cansei de brincar, vamos focar agora! 🥵",
            "Acendeu um alerta na tela do Israel que estamos brincando! 🚨",
            "Deu tontura, quero parar um pouco! 😵",
            "Minhas engrenagens estão fritando, chega de voo! 🤖",
            "Você não tem boleto pra cobrar não? Vai trabalhar! 📄",
            "O RH já anotou meu nome, vou me esconder! 🫣",
            "Vitor vai cancelar minha comissão se eu voar de novo! 💸",
            "Pausa pro descanso, minha bateria foi pra 1%! 🔋",
            "Chega, me deu náusea! 🤢",
            "Tô em greve de voo por uma hora! 🛑",
            "Preciso de um café da Ju urgente pra recuperar as forças! ☕",
            "Israel tá vindo aí, disfarça e vai pra fila de cobrança! 👀",
            "Se você clicar mais uma vez o Vitor aparece atrás de você! 👻",
            "Cota de diversão atingida. Voltamos ao modo sério! 👔",
            "Já rodei tanto que esqueci como fala com cliente! 🤐",
            "O servidor da Sienge tá pesado de tanto que eu voei! 💻",
            "Chega de Uno e de voo, hora de bater a meta! 🎯",
            "Tô {exausto}! Vai ligar pra um inadimplente, vai! 📞",
            "Meu motor superaqueceu! 🌡️",
            "Nem tente me girar de novo, travei o cinto! 🛑",
            "Alô? É do RH? Quero reportar cliques excessivos! 📞",
            "Vou me esconder atrás da tabela até a tontura passar! 📊",
            "O chefe tá olhando, volta pro trabalho! 🤫",
            "Você acha que vida de mascote é só diversão? Cansei! 😫",
            "Já voei o equivalente a uma maratona hoje! 🏃‍♂️",
            "Minha cota de giros acabou. Volto daqui a uma hora! ⏳",
            "A Ju nem fez café suficiente pra me dar energia pra outro voo! ☕",
            "Vou lá cobrar quem deve e depois volto a brincar! 🏃",
            "Chega! Vai ver se o cliente já pagou a entrada! 🧾",
            "Até o sistema pediu arrego agora! 📉",
            "Bora fechar acordo, a brincadeira ficou pra depois! 💸",
            "Estou em manutenção preventiva após 10 voos. 🛠️",
            "Fui {bloqueado} por excesso de alegria. 🚨",
            "Se eu voar de novo eu perco minha licença de voo! ✈️",
            "Vitor mandou eu ficar {quieto} no meu canto. 🤐",
            "Não tô legal, o mundo tá girando! 🌍",
            "Acho que perdi um parafuso nesse último giro. 🔩",
            "Meu processador precisa de uma pausa de uma hora! ⏱️",
            "Vai mandar WhatsApp pros atrasados! Deixa eu respirar! 📱",
            "Socorro, tô vendo estrelas! ✨",
            "Quem brinca muito não bate meta de recuperação! 📊",
            "Israel me deu advertência por abandono de tela! 📝",
            "Basta! Foco total nos inadimplentes agora! 🔍",
            "Cansei! Só volto a voar quando batermos a meta do dia! 🏆",
            "Aviso do sistema: mascote {sobrecarregado}. ⚠️",
            "Estou {mareado}, chega de acrobacias. 🤢",
            "Vou me fingir de {morto} pra ver se você trabalha. 🪦",
            "Tô fora de área, deixe sua mensagem após o bipe... 📵",
            "A tela do Israel já apitou: 'Excesso de diversão no CRM'. 🚨",
            "Descanso de mascote é direito garantido por lei! ⚖️"
        ];
        
        const otherMascotPhrases = [
            "O outro mascote me avisou que vocês já brincaram bastante. Vamos focar agora! 🧐",
            "Fiquei sabendo que a cota de diversão estourou! Bora bater meta! 📈",
            "{O_A} colega ali me disse que você cansou {ele_ela}. Comigo é só trabalho! 💼",
            "Estou {bloqueado} de voar porque o limite de diversão já estourou! 🚫",
            "Ah não, o outro mascote já me alertou sobre você! Vai cobrar! 📞",
            "O Israel mandou eu ficar {parado} porque vocês já brincaram demais! 🤫",
            "Cheguei agora e já me falaram que você estourou a cota de brincadeira! ⚠️",
            "Sem choro! A brincadeira acabou pro outro e pra mim também! 🛑",
            "Vou ficar {paradinho} aqui, me disseram que o Israel tá de olho em você! 👀",
            "O RH avisou que vocês já extrapolaram o recreio hoje! 🏢",
            "O mascote anterior pediu férias depois de vocês. Eu vou focar! 🏖️",
            "Nada de voos. Vamos focar nos boletos atrasados! 📄"
        ];
        
        if (now - playState.lockTime < lockDuration) {
            // Travado
            
            // Verifica se está no período de silêncio (15 min)
            if (playState.silenceUntil && now < playState.silenceUntil) {
                return; // Fica completamente mudo e não reage
            }
            
            // Computa a bronca
            playState.warningCount = (playState.warningCount || 0) + 1;
            
            // Se já deu 5 broncas, entra em silêncio por 15 min
            if (playState.warningCount >= 5) {
                playState.silenceUntil = now + 900000; // 15 minutos
                playState.warningCount = 0; // Reseta para o próximo lote depois de 15 min
            }
            
            localStorage.setItem('mascotPlayState', JSON.stringify(playState));
            
            if (box && textEl) {
                // Para qualquer animação de voo, mas preserva o float CSS
                petContainer.getAnimations().forEach(anim => {
                    if (anim.animationName !== 'petFloat' && anim.animationName !== 'popIn') {
                        anim.cancel();
                    }
                });
                
                let selectedPhrase = "";
                if (playState.lastMascotName === currentPetId) {
                    selectedPhrase = tiredPhrases[Math.floor(Math.random() * tiredPhrases.length)];
                } else {
                    selectedPhrase = otherMascotPhrases[Math.floor(Math.random() * otherMascotPhrases.length)];
                }
                
                const isFemale = currentPetId === '3d_lety' || currentPetId === '3d_nial';
                const wasFemale = playState.lastMascotName === '3d_lety' || playState.lastMascotName === '3d_nial';
                
                selectedPhrase = selectedPhrase.replace('{exausto}', isFemale ? 'exausta' : 'exausto');
                selectedPhrase = selectedPhrase.replace('{bloqueado}', isFemale ? 'bloqueada' : 'bloqueado');
                selectedPhrase = selectedPhrase.replace('{quieto}', isFemale ? 'quieta' : 'quieto');
                selectedPhrase = selectedPhrase.replace('{sobrecarregado}', isFemale ? 'sobrecarregada' : 'sobrecarregado');
                selectedPhrase = selectedPhrase.replace('{mareado}', isFemale ? 'mareada' : 'mareado');
                selectedPhrase = selectedPhrase.replace('{morto}', isFemale ? 'morta' : 'morto');
                selectedPhrase = selectedPhrase.replace('{parado}', isFemale ? 'parada' : 'parado');
                selectedPhrase = selectedPhrase.replace('{paradinho}', isFemale ? 'paradinha' : 'paradinho');
                
                selectedPhrase = selectedPhrase.replace('{O_A}', wasFemale ? 'A' : 'O');
                selectedPhrase = selectedPhrase.replace('{ele_ela}', wasFemale ? 'ela' : 'ele');
                
                textEl.innerHTML = selectedPhrase;
                box.style.display = 'block';
                if (window.mascotShowPhraseTimeout) clearTimeout(window.mascotShowPhraseTimeout);
                window.mascotShowPhraseTimeout = setTimeout(() => { box.style.display = 'none'; }, 3000);
            }
            return;
        }
        
        // Se passou do castigo de 1 hora, zera as variáveis de bronca
        playState.warningCount = 0;
        playState.silenceUntil = 0;
        
        // Incrementa contador de brincadeira
        playState.clickCount = (playState.clickCount || 0) + 1;
        
        if (playState.clickCount >= 10) {
            playState.lockTime = now;
            playState.lastMascotName = currentPetId;
            playState.clickCount = 0;
            playState.warningCount = 1; // Já conta a primeira bronca
            localStorage.setItem('mascotPlayState', JSON.stringify(playState));
            
            if (box && textEl) {
                // Para qualquer animação de voo instantaneamente, preservando CSS float
                petContainer.getAnimations().forEach(anim => {
                    if (anim.animationName !== 'petFloat' && anim.animationName !== 'popIn') {
                        anim.cancel();
                    }
                });
                
                let selectedPhrase = tiredPhrases[Math.floor(Math.random() * tiredPhrases.length)];
                
                const isFemale = currentPetId === '3d_lety' || currentPetId === '3d_nial';
                
                selectedPhrase = selectedPhrase.replace('{exausto}', isFemale ? 'exausta' : 'exausto');
                selectedPhrase = selectedPhrase.replace('{bloqueado}', isFemale ? 'bloqueada' : 'bloqueado');
                selectedPhrase = selectedPhrase.replace('{quieto}', isFemale ? 'quieta' : 'quieto');
                selectedPhrase = selectedPhrase.replace('{sobrecarregado}', isFemale ? 'sobrecarregada' : 'sobrecarregado');
                selectedPhrase = selectedPhrase.replace('{mareado}', isFemale ? 'mareada' : 'mareado');
                selectedPhrase = selectedPhrase.replace('{morto}', isFemale ? 'morta' : 'morto');
                selectedPhrase = selectedPhrase.replace('{parado}', isFemale ? 'parada' : 'parado');
                selectedPhrase = selectedPhrase.replace('{paradinho}', isFemale ? 'paradinha' : 'paradinho');
                
                textEl.innerHTML = selectedPhrase;
                box.style.display = 'block';
                if (window.mascotShowPhraseTimeout) clearTimeout(window.mascotShowPhraseTimeout);
                window.mascotShowPhraseTimeout = setTimeout(() => { box.style.display = 'none'; }, 3000);
            }
            return; // Impede a animação
        }
        
        localStorage.setItem('mascotPlayState', JSON.stringify(playState));

        // Gerar 30 caminhos aleatórios pela tela, sem virar no eixo Y (apenas translate e leve tilt no Z)
        const paths = [];
        for (let i = 0; i < 30; i++) {
            const path = [{ transform: 'translate(0px, 0px) rotateZ(0deg)' }];
            const numPoints = Math.floor(Math.random() * 3) + 3; // 3 a 5 pontos intermediários
            for (let j = 1; j < numPoints; j++) {
                const x = (Math.random() - 0.5) * 700; // range de -350 a 350
                const y = (Math.random() - 0.5) * 400; // range de -200 a 200
                const rotateZ = (Math.random() - 0.5) * 20; // leve inclinação de -10 a 10 graus
                path.push({ transform: `translate(${x}px, ${y}px) rotateZ(${rotateZ}deg)`, offset: j / numPoints });
            }
            path.push({ transform: 'translate(0px, 0px) rotateZ(0deg)' });
            paths.push(path);
        }
        
        const randomPath = paths[Math.floor(Math.random() * paths.length)];
        const duration = 1800 + Math.random() * 700;
        
        petContainer.animate(randomPath, {
            duration: duration,
            easing: 'ease-in-out'
        });
        
        if (modelViewer && modelViewer.availableAnimations && modelViewer.availableAnimations.length > 0) {
            const randAnim = modelViewer.availableAnimations[Math.floor(Math.random() * modelViewer.availableAnimations.length)];
            modelViewer.setAttribute('animation-name', randAnim);
        }
        
        // Se foi clique, esconde o box inicialmente, e quando terminar, mostra as frases brincando
        if (box) box.style.display = 'none';
        
        if (window.mascotShowPhraseTimeout) clearTimeout(window.mascotShowPhraseTimeout);
        window.mascotShowPhraseTimeout = setTimeout(() => {
            if (box && textEl) {
                const playPhrases = [
                    // Vitor (Gerente)
                    "Será que o Vitor aprovou esse meu voo? ✈️",
                    "Esconde isso antes que o Vitor veja! 🫣",
                    "O Vitor mandou focar na meta, mas só um voozinho não faz mal! 😂",
                    "Se o Vitor perguntar, eu estava analisando os inadimplentes! 📊",
                    "O Vitor quer resultado e eu quero diversão! 🎉",
                    "Gerente Vitor na área... disfarça e finge que tô cobrando! 🤫",
                    "Acha que o Vitor me daria um bônus por acrobacias? 🤸‍♂️",
                    "Se o Vitor soubesse o quanto a gente brinca... 😬",
                    "O Vitor falou de meta, não de gravidade zero! 🌌",
                    "Vou ali cobrar um cliente antes que o Vitor brigue comigo! 🏃‍♂️",
                    "A meta do Vitor tá alta hoje, hein? 📈",
                    "Tô voando tão rápido que o Vitor nem me viu passar! 🏎️",
                    "O Vitor que não me escute, mas esse rolê foi top! 🎢",
                    "Você acha que o Vitor prefere Uno ou Banco Imobiliário? 🎲",
                    "Bora bater a meta senão o Vitor cancela a sexta! 😱",
                    "Fui mostrar meus giros pro Vitor e ele mandou eu voltar pro CRM! 🖥️",
                    "O Vitor disse: 'foco na cobrança!'... Ops! 🤐",
                    "Será que o Vitor me promove se eu zerar a fila de cobrança? 🥇",
                    "O Vitor tá de olho, melhor eu voltar pro meu lugar! 👀",
                    "Tô correndo do relatório que o Vitor pediu! 🏃💨",
                    
                    // Israel (Supervisor)
                    "O Israel vai brigar com a gente se ficarmos brincando kkkkk 🤫",
                    "O Israel não tá vendo, pode clicar de novo! 👀",
                    "Fica tranquilo(a), o Israel tá em reunião, pode clicar! 🤫",
                    "O Israel que lute pra me segurar! 🤣",
                    "Mais um clique e eu peço aumento pro Israel! 💸",
                    "Certeza que o Israel tá programando mais alguma coisa! 💻",
                    "O Israel falou que quem bater a meta ganha prêmio! 👀",
                    "Me ajuda! O Israel tá vindo aí! 😱",
                    "O Israel mandou parar de brincar, mas quem liga? 😂",
                    "Supervisionado pelo Israel, mas voando livre, leve e solto! 🦋",
                    "Se o Israel ver a gente brincando assim, é justa causa! ⚖️",
                    "O Israel é o supervisor, mas eu sou o rei da tela! 👑",
                    "Alguém avisa pro Israel que eu tô precisando de férias? 🏖️",
                    "Será que o Israel gosta de café forte igual a Ju faz? ☕",
                    "O Israel tá olhando pra cá? Finge costume! 😐",
                    "Acho que o Israel bloqueou meu WhatsApp, mandei muitos memes! 📱",
                    "Se o Israel perguntar, eu fui ali imprimir um boleto. 🖨️",
                    "O Israel disse pra não dar zoom na cara do cliente! 🔍",
                    "Mais rápido que eu, só o Israel correndo atrás da meta! 🏃‍♂️",
                    "Israel, perdoa a gente, é que brincar aqui é muito bom! 🙏",
                    "Será que o Israel vai notar que eu sumi por 5 segundos? ⏱️",
                    "Aposto que o Israel ganha de todo mundo no Uno! 🃏",

                    // RH (Recursos Humanos)
                    "O RH não tá vendo, vamos de novo kkkk 🤣",
                    "Se o RH descobrir essa bagunça, tô na rua! 🚪",
                    "Pausa pro voo aprovada pelo RH? Acho que não! 🚫",
                    "O RH mandou e-mail de advertência? Não li! 🙈",
                    "Tô sentindo que o RH vai me chamar pra conversar hoje... 🗣️",
                    "O RH falou que diversão também é qualidade de vida! 🙌",
                    "Se o RH perguntar, isso aqui é 'ginástica laboral visual' 🤸‍♀️",
                    "Será que o RH desconta do meu VR esse tempo de voo? 🍔",
                    "RH, eu juro que estava trabalhando! 🤞",
                    "Vou ali no RH perguntar se mascote tem direito a férias! 🏖️",
                    "Mais um voo desses e o RH me manda embora! 🏃‍♂️",
                    "Cuidado, a moça do RH tá passando ali no corredor! 🤫",
                    "Isso dá justa causa no RH? Perguntando pra um amigo... 🤷‍♂️",
                    "O RH deve estar orgulhoso do meu desempenho aéreo! 🛩️",
                    "Acho que vou pedir pro RH me dar um aumento de bateria! 🔋",
                    "Se o RH não viu, não aconteceu! 😎",

                    // Ju e Café e Uno
                    "Será se a Ju fez café? ☕",
                    "Você vai jogar Uno essa semana? 🃏",
                    "A Ju devia trazer café na nossa mesa hoje, né? ☕",
                    "A Ju já trouxe a garrafa de café nova? 🍵",
                    "Quem perder no Uno paga a janta, hein! 🍔",
                    "Se o Uno for com regras inventadas, eu não jogo! 🚫",
                    "Uno é bom, mas bater meta é melhor ainda! 🏆",
                    "Me chama pro Uno que eu jogo meu +4! 🔥",
                    "Cadê meu café pra recuperar a energia desse voo? ☕",
                    "Vai um cafezinho aí pra acordar? ☕",
                    "Espero que a Ju tenha deixado um docinho pra mim... 🍫",
                    "Me leva junto se for tomar um cafezinho? ☕",
                    "A Ju já preparou aquele café maravilhoso? 🤤",
                    "Alguém falou em pausa pro café? ☕",
                    "Uno? Eu sou invencível no Uno, pode avisar! 🥇",
                    "Será que a Ju deixou um bolo ali na copa? 🍰",
                    "Com o café da Ju e minha velocidade, a gente zera a carteira! 🚀",

                    // CRM, Cobrança, Clientes e Boletos
                    "De boleto em boleto a gente enche a conta! 💰",
                    "Estou patrulhando a carteira de inadimplentes! 🕵️",
                    "Estou sentindo cheiro de acordo fechado no ar! 💸",
                    "Eita, bati num boleto vencido no caminho! 📄",
                    "Fui ali cobrar um cliente e já voltei! 🏃‍♂️",
                    "Partiu fechar os acordos mais difíceis da semana! 💼",
                    "A vida é como um boleto, uma hora ele vence. E eu tô aqui pra cobrar! 📜",
                    "Estou indo atrás do dinheiro que sumiu! 💵",
                    "Tô procurando quem não pagou a fatura! 🔎",
                    "Partiu bater recorde de acordos? 📈",
                    "Opa, desviei de um distrato agora pouco! 🛡️",
                    "Bora cobrar! Tempo é dinheiro! ⏳",
                    "Que tal mandar aquele Zap pro cliente agora? 📱",
                    "Estou fiscalizando as renegociações! 🧐",
                    "Não tem escapatória, o boleto vai chegar! 📨",
                    "Bora, bora! A fila de atrasados não se cobra sozinha! 🏃‍♀️",
                    "Acho que vi um cliente bom pagador por ali! 😇",
                    "Tô de vigia nas promessas de pagamento! 📅",
                    "Bora organizar essa carteira que hoje é dia de lucro! 💸",
                    "Fui conferir as comissões e estão maravilhosas! 🤑",
                    "Vou ali cobrar uma dívida com meu chame, já volto! 😘",
                    "Eu nasci pra voar... e cobrar boletos! 💸",
                    "O cliente achou que ia me enrolar, mas eu sou mais rápido! 🌪️",
                    "Se o cliente não pagar hoje, eu vou aí puxar o pé dele à noite! 👻",
                    "Será que aquele cliente da parcela 10 já pagou? 🤔",
                    "Fui imprimir um relatório e acabei voando! 🖨️",
                    "Bora zerar os vencimentos dessa semana! 📉",
                    "Tem cliente visualizando o Zap e não respondendo... Tô de olho! 👀",
                    "Será que eu posso dar desconto na multa? Não, né? ❌",
                    "Sinto a presença de um fiador nervoso por aqui! 🥵",
                    
                    // Frases animadas e voos
                    "Isso é divertido! 🤩",
                    "Uauu! Que rolêêê! 🚀",
                    "Amei esse passeio! ✨",
                    "Uhull! Mais rápido na próxima! 💨",
                    "Se me girar de novo, eu vou ficar tonto! 🌀",
                    "Apertem os cintos, turbulência à vista! ✈️",
                    "Fui dar uma voltinha pra esticar as pernas... ops, engrenagens! 🤖",
                    "Quem precisa de avião quando se tem você clicando em mim? ✈️",
                    "Atenção passageiros, chegamos ao destino final: A TELA PRINCIPAL! 🗺️",
                    "Vruuum! Sou o mascote mais rápido do oeste! 🤠",
                    "Você sabia que eu adoro voar pela tela? 🦋",
                    "Não me clica muito forte que eu tenho cócegas! 😂",
                    "Hoje eu tô que tô! Pode me jogar pra onde quiser! 🤸‍♂️",
                    "Minha nossa, que velocidade! 🏎️",
                    "Sou pequeno mas carrego uma meta gigante nas costas! 🐢",
                    "Que tela bonita, parabéns pela organização! 🖥️",
                    "Isso me lembra um parque de diversões! 🎢",
                    "Tô voando tão alto que quase saí do monitor! 🖥️",
                    "Não conta pra ninguém, mas eu adoro quando você clica em mim! 🤭",
                    "Alô? Sim, sou eu, o melhor mascote do CRM! 📞",
                    "Atenção: alto risco de diversão na tela! ⚠️",
                    "Clica em mim de novo se for capaz! 🎯",
                    "Se continuar brincando eu não vou trabalhar! 🫣",
                    "Me sinto uma estrela cadente! 🌠",
                    "Tô fazendo meu cardio do dia! 🏃‍♂️",
                    "Ufa, que viagem cansativa! Mentira, foi ótimo! 😎",
                    "Se eu tivesse asas, voaria de verdade! 🕊️",
                    "Me dá um descanso, acabei de vir de uma ligação longa! 🥵",
                    "Meu nome é velocidade, sobrenome: mascote! ⚡",
                    "Tô de olho na tela enquanto você digita! 👀",
                    "Gostou da minha performance aérea? 🛩️",
                    "Avisem lá que o melhor negociador chegou! 🎩",
                    "Ui! Essa curvinha aí me deu frio na barriga! 🎢",
                    "Cuidado pra não me deixar tonto com tanto voo! 😵",
                    "Hoje eu tô cheio de energia pra cobrar! 🔋",
                    "Aí sim! Adoro uma adrenalina! 🎢",
                    "Tô me sentindo um astronauta! 👩‍🚀",
                    "Ninguém me segura hoje! 🦸‍♂️",
                    "Vamos pra cima, time! O céu é o limite! ☁️",
                    "Clica aqui, ali, acolá... adorei! ✨",
                    "Alguém mais tá ouvindo meu motorzinho de voo? 🚁",
                    "Atenção: Nível de diversão atingiu o limite! 🚨",
                    "Isso é melhor que o simulador de voo! 🕹️",
                    "Me sinto o próprio Iron Man! 🦾",
                    "Se me clicar 100 vezes eu mostro um segredo... brincadeira! 😂",
                    
                    // Extra 100+ random variations para volume
                    "Mais um voo e eu mereço um prêmio! 🏅",
                    "Tá achando que eu sou drone? 🚁",
                    "Eita, quase bati na logo ali em cima! 💥",
                    "Cuidado, o chão tá liso de tanta grana! 💸",
                    "Fui e voltei mais rápido que o sistema calculando juros! ⚡",
                    "Você não me viu aqui! 🫣",
                    "Se continuar brincando o Vitor vai descobrir! 🤫",
                    "Sextou na segunda? Pra mim sim! 🎉",
                    "Uhuu! Eu amo esse trabalho! ❤️",
                    "Vou ali cobrar e já volto. 🏃‍♀️",
                    "Opa, desviei de um boleto perdido! 🧾",
                    "Será que o RH aceita atestado de tontura? 😵",
                    "O Israel falou que a meta é dobrada hoje, mas eu tô brincando! 😂",
                    "Já mandou mensagem pra aquele cliente sumido? 📱",
                    "A Ju já colocou açúcar no café? 🍬",
                    "Não conta pro Vitor, mas eu bati na tela do lado! 🖥️",
                    "Israel me perdoa, mas eu não resisti a esse clique! 🥺",
                    "Estou só testando a aerodinâmica do meu corpo! 🤖",
                    "A vida é curta, clique no mascote! 👇",
                    "Tô de vigia nas suas ligações! 📞",
                    "Bora faturar, minha gente! 💵",
                    "RH, juro que isso é para manter a saúde mental! 🧘‍♂️",
                    "Você sabia que mascotes também ficam estressados? 🤯",
                    "Quem precisa de passaporte quando se tem cliques? 🛂",
                    "Uau, essa foi uma curva perigosa! ⚠️",
                    "Vou ali no RH assinar minha advertência por voar no expediente! 📝",
                    "Meu Deus, que adrenalina! 🏎️",
                    "Foca na meta, mas não esquece de mim! 🥺",
                    "Se o Vitor me vir voando ele me vende pra outra empresa! 🏢",
                    "A Ju podia trazer um docinho pra acompanhar, né? 🍫",
                    "Uno sem comprar +4 não tem graça! 🃏",
                    "O Israel é supervisor, eu sou apenas um viajante estelar! ✨",
                    "Acho que bati a cabeça num cliente chato agora pouco... 🤕",
                    "Partiu cobrar com alegria no coração! 🥰",
                    "Tô voando tão rápido que esqueci o que ia falar! 😶",
                    "Alô, é do RH? Gostaria de reportar abuso de cliques! 📞",
                    "O Vitor não perdoa quem não bate a meta! Bora correr! 🏃",
                    "Não me faz vomitar com essas rodopiadas! 🤢",
                    "Israel tá ocupado, bora brincar mais um pouquinho! 🎮",
                    "Será que eu ganho VT pra voar tanto assim? 🚌",
                    "Aposto que a Ju tá de olho na gente! 👀",
                    "Vou jogar um Uno pra desestressar! 🃏",
                    "Meu sistema acusou diversão em excesso! 🚨",
                    "Se o cliente chorar, dá um desconto... mentira, dá não! 🛑",
                    "Será que o Vitor sabe jogar Uno? 🤔",
                    "Tô fiscalizando a fila do café! ☕",
                    "RH tá passando, finge costume! 🕴️",
                    "Eu juro que eu tava focado, foi sem querer! 😅",
                    "Voando alto igual nossa comissão de hoje! 💸",
                    "Israel, perdoa eles, não sabem o que clicam! 🙏",
                    "Tô quase pedindo férias no RH! 🏖️",
                    "Cuidado, o Vitor tá lendo seus relatórios! 📊",
                    "O café da Ju é meu combustível! ⛽",
                    "Fui bater a meta e me perdi pelo caminho! 🗺️",
                    "Mais um pouco e eu chego no outro monitor! 📺",
                    "Alguém anotou a placa daquele boleto?! 🧾",
                    "Fui ali e já voltei... você piscou? 😉",
                    "Eu acho que vi o Vitor passando! 😬",
                    "Se fosse pra eu ficar parado, eu seria uma estátua! 🗿",
                    "Bora fazer acontecer, que o Israel tá só de olho! 👀",
                    "Vou ali chorar no cantinho do RH! 😭",
                    "A Ju salva nossos dias com aquele cafézinho! ❤️",
                    "Uno com regra da casa não vale! 🚫",
                    "Gente, foca na tela, não em mim! 😂",
                    "Você acha que eu tenho medo de altura? 🧗‍♂️",
                    "Tô voando igual os juros de atraso! 📈",
                    "Vou pedir um aumento pro Vitor depois dessa! 💰",
                    "O Israel me ensinou a cobrar com estilo! 😎",
                    "O RH aprova essas paradas pra relaxar, confia! 👍",
                    "Uno sem treta não é Uno de verdade! 🤬",
                    "Ju, salva a gente com um café, o dia tá longo! 🥱",
                    "Essa curvinha merecia uma medalha! 🏅",
                    "E lá vamos nós de novo! 🎢",
                    "Se o Vitor me olhar feio eu corro pro RH! 🏃‍♂️",
                    "Será que o Israel já bateu a meta dele? 🤔",
                    "Bora fazer o cliente sorrir enquanto ele paga! 😁",
                    "Foca na meta, que a comissão tá te esperando! 💸",
                    "Mais um voo pra relaxar a mente! 🧘‍♀️",
                    "Estou só alongando minhas articulações! 🦾",
                    "Se a Ju não tiver feito café, eu nem trabalho hoje! 😴",
                    "Quem vai ser o primeiro a bater meta? 🥇",
                    "O RH tá com a orelha quente de tanto que a gente fala deles! 👂",
                    "Aposto 10 boletos que o Israel ganha no Uno! 🃏",
                    "Vitor não tá aqui, partiu fazer bagunça! 🎉",
                    "Atenção, apertem os cintos, decolagem autorizada! 🛫",
                    "Acho que o cliente sentiu meu vácuo passando! 💨",
                    "Esse voo gastou 20% da minha bateria! 🔋",
                    "Vou falar pro Vitor que a culpa do voo é sua! 👉",
                    "O Israel disse: 'Mais foco, menos cliques!' 🗣️",
                    "A Ju sabe que a gente depende do café dela? 🙏",
                    "Isso conta como intervalo pro RH? ⌚",
                    "Se eu bater, o conserto sai do seu salário! 💸",
                    "Partiu cobrar aquele cara que disse que ia pagar amanhã! 🤥",
                    "Será que o Vitor sabe a senha do WiFi? 📶",
                    "O Israel tá supervisionando até o meu nível de diversão! 🧐",
                    "Uhuuuu! Viva a sexta-feira... ou a segunda, tanto faz! 🥳",
                    "Foca na meta, o resto a gente resolve depois! 🚀",
                    "A Ju é a verdadeira heroína dessa empresa! 🦸‍♀️",
                    "No Uno eu jogo carta amarela só de sacanagem! 🟨",
                    "Vou ligar pro cliente só pra dizer oi... brincadeira, é pra cobrar! 📞",
                    "Se o RH ver isso... melhor a gente nem pensar! 😬",
                    "Esse passeio valeu a pena! ✨",
                    "Vou ver qual cliente deve mais pra cobrar primeiro! 🤑",
                    "Vou lá no loteamento ver se ele construiu escondido! 🏗️👀",
                    "Por que ele não paga a gente? Somos tão legais! 🥺💔"
                ];
                textEl.innerHTML = playPhrases[Math.floor(Math.random() * playPhrases.length)];
                box.style.display = 'block';
                if (window.mascotHideTimeout) clearTimeout(window.mascotHideTimeout);
                window.mascotHideTimeout = setTimeout(() => { box.style.display = 'none'; }, 5000);
            }
        }, duration);
        return;
    }
    
    if (!box || !textEl) return;
    
    const petName = this.pets.find(p => p.id === this.selectedPetId)?.name || 'seu Assistente';
    
    if (isNewSelection) {
        textEl.textContent = "Pensando...";
        box.style.display = 'block';
        const welcomePhrases = [
            `Oii, eu sou o ${petName}! Vamos trabalhar juntos? 🤩`,
            `Volteiiii, olha eu aqui. Sou o ${petName}! Prontinho para te ajudar.`,
            `Cheguei, ${opName}! Eu sou o ${petName}, o seu novo parceiro de bater metas! 🚀`,
            `Olá! Que bom que me escolheu! Eu sou o ${petName} e vou te acompanhar.`,
            `Eba! Sou eu, o ${petName}! Já me sinto em casa por aqui! 🥰`,
            `Apresentando-me para o trabalho! ${petName} a postos! 🫡`,
            `Aí sim! Adoro trabalhar com você, ${opName}. Sou o ${petName}!`,
            `Trocamos de ares! Eu sou o ${petName}, vamos fechar grandes acordos hoje! 💼`
        ];
        textEl.innerHTML = welcomePhrases[Math.floor(Math.random() * welcomePhrases.length)];
        setTimeout(() => { box.style.display = 'none'; }, 8000);
        return;
    }
    
    const hour = new Date().getHours();
    let timeGreeting = hour < 12 ? 'Bom dia' : (hour < 18 ? 'Boa tarde' : 'Boa noite');
    
    const rand = Math.random();
    let finalMsg = '';

    // 20% Saudação
    if (rand < 0.20) {
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 1) finalMsg = `Oii ${opName}! Eu sou o ${petName}. Estava morrendo de saudades de você no fim de semana! 🥰`;
        else if (dayOfWeek === 5) {
            const sexPhrases = [
                `Vamos fechar com chave de ouro, ${opName}! 🔑✨`,
                `Vamos sextar com força e bons resultados, ${opName}! 🎉🚀`,
                `Sextou, ${opName}! Dia de bater meta e comemorar! 🍻`,
                `Sexta-feira chegou, ${opName}! Vamos fechar a semana com chave de ouro! 🏆`
            ];
            finalMsg = sexPhrases[Math.floor(Math.random() * sexPhrases.length)];
        }
        else finalMsg = `${timeGreeting}, ${opName}! Eu sou o ${petName} e adoro trabalhar com você! 🥰`;
    }
    // 10% Clima
    else if (rand < 0.30) {
        try {
            const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-22.8833&longitude=-48.4417&current=temperature_2m,weather_code&timezone=America%2FSao_Paulo');
            if (res.ok) {
                const data = await res.json();
                const temp = data.current?.temperature_2m || 25;
                const code = data.current?.weather_code || 0;
                // Códigos de chuva pela OMM (51-65, 80-82)
                const isRaining = [51,53,55,61,63,65,80,81,82].includes(code);
                
                if (temp >= 28) {
                    finalMsg = `Que calor, ${opName}! 🥵 Está marcando ${Math.round(temp)}°C. Mantenha a água por perto!`;
                } else if (isRaining && temp < 22) {
                    finalMsg = `Queria estar debaixo de uma cobertinha... 🥶 Tá chovendo e fazendo ${Math.round(temp)}°C.`;
                } else if (temp <= 18) {
                    finalMsg = `Ai que friooo! ⛄ A temperatura está em ${Math.round(temp)}°C. Melhor pegar um casaco!`;
                } else if (isRaining) {
                    finalMsg = `${opName}, parece que está chovendo agora (${Math.round(temp)}°C). Não esqueça o guarda-chuva! ☔`;
                } else {
                    finalMsg = `${opName}, o clima está agradável (${Math.round(temp)}°C). ☀️ Dia perfeito pra bater meta!`;
                }
            }
        } catch(e) {}
        if (!finalMsg) finalMsg = `Ei ${opName}, o clima está ótimo para fecharmos bons negócios hoje! 🚀`;
    }
    // 40% Análise de Cliente Problemático
    else if (rand < 0.70 && window.rawClientList) {
        const myClients = this.getMyClients();
        if (myClients.length > 0) {
            let worst = myClients[0];
            myClients.forEach(c => {
                const cScore = (Number(c.overdueValue)||0) * (Number(c.overdueDays)||1);
                const wScore = (Number(worst.overdueValue)||0) * (Number(worst.overdueDays)||1);
                if (cScore > wScore) worst = c;
            });
            const cName = worst.customerName.split(' ')[0];
            const cTitle = worst.receivableBillId || worst.saleId;
            const cVal = (Number(worst.overdueValue)||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
            const cDays = worst.overdueDays || 0;
            
            if (cDays > 90) finalMsg = `Atenção ${opName}! O título ${cTitle} de ${cName} está atrasado há ${cDays} dias. Tente uma abordagem mais consultiva hoje! 📞`;
            else finalMsg = `Foco total, ${opName}! Nossa maior prioridade agora é o cliente ${cName} (Título ${cTitle} - R$ ${cVal}). Vamos propor um acordo! 💪`;
        } else {
            finalMsg = `${timeGreeting}, ${opName}! Sua carteira está impecável hoje, zero inadimplência! 🎉`;
        }
    }
    // 10% Bem-estar
    else if (rand < 0.80) {
        const wellness = [
            `Já bebeu água hoje, ${opName}? Manter-se hidratado ajuda no foco. 💧`,
            `Respire fundo, ${opName}... Inspire em 4s, segure 4s, solte 4s. Ajuda nas ligações difíceis! 🧘`,
            `Ei ${opName}, dê uma espreguiçada rápida! Sua postura agradece. 🙆‍♂️`,
            `Que tal olhar um pouco para longe da tela, ${opName}? Descansar a vista é importante! 👀`,
            `Faça uma pausa de 2 minutinhos, ${opName}. Pegue um café e volte com tudo! ☕`
        ];
        finalMsg = wellness[Math.floor(Math.random() * wellness.length)];
    }
    // 20% Dicas e Motivação
    else {
        const tips = [
            `Dica de ouro, ${opName}: Um 'bom dia' sincero e um sorriso na voz mudam o tom de qualquer ligação. 😊`,
            `Lembre-se ${opName}: O segredo para um bom acordo é ouvir o cliente antes de propor a solução. 🚀`,
            `Chamar o cliente pelo nome demonstra respeito e gera conexão. Tente isso hoje, ${opName}! 🤝`,
            `Seja empático, ${opName}! Muitas vezes o atraso é apenas um imprevisto. 💡`,
            `Ofereça alternativas reais, ${opName}. O objetivo é ajudar o cliente a voltar a ficar em dia! 📊`,
            `Destaque os benefícios de estar com o nome limpo e com as parcelas em dia, ${opName}! ✨`,
            `Dica, ${opName}: Tente ligar para os clientes com maiores valores ou mais dias de atraso primeiro!`,
            `Organize suas abas e deixe as informações do cliente prontas antes de ligar. Boa sorte, ${opName}! 🗂️`,
            `Acredite em si próprio, ${opName}, e chegará um dia em que os outros não terão outra escolha senão acreditar com você.`,
            `O sucesso é a soma de pequenos esforços repetidos dia após dia. Pra cima, ${opName}!`,
            `Com fé e dedicação, nenhum obstáculo é grande demais. Bom trabalho, ${opName}!`
        ];
        finalMsg = tips[Math.floor(Math.random() * tips.length)];
    }

    textEl.innerHTML = finalMsg;
    box.style.display = 'block';
    
    setTimeout(() => {
       box.style.display = 'none';
    }, 8000);
  }
};

window.openHomeInsight = function(idx) {
  const groups = HomeDashboard._insightGroups || [];
  const g = groups[idx];
  if (!g) return;
  HomeDashboard._insightOpenIdx = HomeDashboard._insightOpenIdx === idx ? null : idx;
  HomeDashboard.renderInsights();
};

window.closeHomeInsightList = function() {
  HomeDashboard._insightOpenIdx = null;
  HomeDashboard.renderInsights();
};

window.openHomeInsightClient = async function(customerId, saleId) {
  window._homeInsightReturn = true;
  const btnBack = document.getElementById('btn-back-to-list');
  const textBack = document.getElementById('text-back-to-list');
  if (textBack) textBack.innerText = 'Voltar para Insights';
  if (btnBack) {
    btnBack.onclick = function() { goBackToDashboard(); };
  }
  if (typeof viewCustomerCard === 'function') {
    await viewCustomerCard(customerId, saleId);
  }
};

window.clearHomeInsightFilter = function() {
  window.homeInsightFilter = null;
  const banner = document.getElementById('home-insight-banner');
  if (banner) banner.style.display = 'none';
  if (typeof renderTabelaInadimplencia === 'function') renderTabelaInadimplencia();
};

window.buildSprintOperatorSummaries = function() {
  const hd = HomeDashboard;
  const users = hd.getOperatorUsers();
  const all = window.rawClientList || [];
  const lines = [];
  users.filter(u => hd.isInternoCobrancaUser(u)).forEach(u => {
    const opKey = hd.normalizeOperatorKey(u.sienge_user || u.name);
    const mine = all.filter(c => hd.normalizeOperatorKey(c.assignedOperator) === opKey);
    const groups = hd.collectInsightGroups(mine, u).filter(g => !g.hideIfEmpty || (g.count != null ? g.count : g.items.length) > 0);
    if (!groups.length) return;
    const first = (u.name || u.sienge_user || 'Operador').split(' ')[0].toUpperCase();
    lines.push('*' + first + '*');
    groups.forEach(g => lines.push('• ' + g.label));
  });
  users.filter(u => hd.isBackOfficeUser(u)).forEach(u => {
    const groups = hd.collectInsightGroups(all, u).filter(g => !g.hideIfEmpty || (g.count != null ? g.count : g.items.length) > 0);
    if (!groups.length) return;
    const first = (u.name || u.sienge_user || 'Operador').split(' ')[0].toUpperCase();
    lines.push('*' + first + '*');
    groups.forEach(g => lines.push('• ' + g.label));
  });
  return lines.join('\n');
};

// Funções globais necessárias para os botões do HTML
window.renderOperadorHomeDashboard = () => HomeDashboard.init();
window.loadOperadorHomeData = () => HomeDashboard.loadData();
window.setHomePreviewOperator = (siengeUser) => {
   sessionStorage.setItem('crm_home_preview_op', siengeUser);
   HomeDashboard.init();
};
window.openPetSelector = () => document.getElementById('home-pet-selector-modal').style.display = 'flex';
window.selectHomePet = (id) => {
   HomeDashboard.selectedPetId = id;
   localStorage.setItem('selectedHomePet', id);
   HomeDashboard.updatePetIcon();
   document.getElementById('home-pet-selector-modal').style.display = 'none';
   
   // Verifica se estamos no castigo
   let stateStr = localStorage.getItem('mascotPlayState');
   let playState = stateStr ? JSON.parse(stateStr) : null;
   const now = Date.now();
   
   if (playState && (now - playState.lockTime < 3600000)) {
       if (playState.silenceUntil && now < playState.silenceUntil) {
           // Já está no silêncio de 15 min, não fala nada ao trocar
           HomeDashboard.speak(false, false, true);
       } else {
           // Se trocar de mascote durante o castigo, dá apenas UMA bronca e entra em silêncio
           playState.warningCount = 4; // Ao chamar speak() vai para 5 e aciona o silêncio de 15 min
           localStorage.setItem('mascotPlayState', JSON.stringify(playState));
           
           // Passa isClick = true para forçar a execução da lógica de bronca na função speak()
           HomeDashboard.speak(false, true, false);
       }
   } else {
       HomeDashboard.speak(false, false, true);
   }
};
window.homePetSpeak = (includeFeedback) => HomeDashboard.speak(includeFeedback, true);

// Fim das configurações do Mascot

