// Cessão de Direitos — Relacionamento
const CessaoState = {
  view: 'busca', // busca | fluxo
  customer: null,
  contracts: [],
  selected: null, // { customerId, contractId, titulo, contract, bill }
  tab: 'contrato',
  cedentes: [], // { id, name, pct, cederPct, main }
  condicoes: [], // { id, tipo, qtde, valor, vencimento }
  cessionarios: [], // { id, customerId, name, doc, pct }
  cessionarioBusca: '',
  cessionarioSugestoes: [],
  extratoRows: [],
  loading: false
};

const CESSAO_TIPOS_CONDICAO = ['Ato', 'Entrada', 'Intermediária', 'Mensal', 'Sinal', 'Única'];

const CessaoApp = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  fmtMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  fmtDate(raw) {
    if (!raw) return '—';
    const s = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    }
    return s;
  },

  pctOf(cust, totalPeople) {
    const raw = cust && (cust.percentage != null ? cust.percentage : cust.participationPercentage);
    if (raw != null && raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
    return totalPeople <= 1 ? 100 : 0;
  },

  totalCedido() {
    return (CessaoState.cedentes || []).reduce((s, c) => s + (Number(c.cederPct) || 0), 0);
  },

  totalAdquirido() {
    return (CessaoState.cessionarios || []).reduce((s, c) => s + (Number(c.pct) || 0), 0);
  },

  init() {
    this.render();
  },

  render() {
    const root = document.getElementById('relacionamento-cessao-root');
    if (!root) return;
    root.innerHTML = CessaoState.view === 'fluxo' ? this.fluxoHtml() : this.buscaHtml();
    if (window.lucide) lucide.createIcons();
  },

  // ——— BUSCA ———
  buscaHtml() {
    return `
      <div class="cessao-shell">
        <div class="crm-card cessao-search-card" style="margin-bottom:20px;">
          <div class="crm-card-content" style="padding:18px 20px;">
            <div class="cessao-search-grid">
              <div class="form-group" style="margin:0;">
                <label for="cessao-filter-nome">Nome</label>
                <input type="text" id="cessao-filter-nome" class="form-control" placeholder="Digite para buscar..."
                  onkeydown="if(event.key==='Enter'){event.preventDefault();CessaoApp.buscar();}"
                  oninput="CessaoApp.sugerirCliente(this.value,'nome')" autocomplete="off">
              </div>
              <div class="form-group" style="margin:0;">
                <label for="cessao-filter-doc">ID ou CPF/CNPJ</label>
                <input type="text" id="cessao-filter-doc" class="form-control" placeholder="ID ou 000.000.000-00"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();CessaoApp.buscar();}"
                  oninput="if(typeof maskCpfCnpj==='function' && this.value.replace(/\\D/g,'').length>3) maskCpfCnpj(this);">
              </div>
              <div class="form-group" style="margin:0;">
                <label for="cessao-filter-telefone">Telefone</label>
                <input type="text" id="cessao-filter-telefone" class="form-control" placeholder="Somente números"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();CessaoApp.buscar();}"
                  oninput="this.value=this.value.replace(/[^0-9]/g,'');CessaoApp.sugerirCliente(this.value,'telefone')" autocomplete="off">
              </div>
              <div class="form-group" style="margin:0;">
                <label for="cessao-filter-email">E-mail</label>
                <input type="text" id="cessao-filter-email" class="form-control" placeholder="Digite para buscar..."
                  onkeydown="if(event.key==='Enter'){event.preventDefault();CessaoApp.buscar();}"
                  oninput="CessaoApp.sugerirCliente(this.value,'email')" autocomplete="off">
              </div>
              <div class="cessao-search-actions">
                <button type="button" class="btn btn-primary" onclick="CessaoApp.buscar()">
                  <i data-lucide="search" style="width:16px;height:16px;"></i> Buscar
                </button>
                <button type="button" class="btn btn-outline" onclick="CessaoApp.limparBusca()" title="Limpar">
                  <i data-lucide="eraser" style="width:16px;height:16px;"></i>
                </button>
              </div>
            </div>
            <div id="cessao-sugestoes" class="cessao-sugestoes" style="display:none;"></div>
          </div>
        </div>

        <div class="crm-card" id="cessao-customer-card" style="display:none;margin-bottom:20px;">
          <div class="crm-card-header" style="background:#f8fafc;padding:12px 20px;border-bottom:1px solid #e2e8f0;border-radius:8px 8px 0 0;">
            <h3 style="margin:0;font-size:1.05rem;color:var(--color-primary);">Dados do cliente</h3>
          </div>
          <div id="cessao-customer-info" class="crm-card-content"></div>
        </div>

        <div class="crm-card" id="cessao-results-card" style="display:none;">
          <div class="crm-card-header" style="background:#f8fafc;padding:12px 20px;border-bottom:1px solid #e2e8f0;border-radius:8px 8px 0 0;">
            <h3 style="margin:0;font-size:1.05rem;color:var(--color-primary);">Contratos do cliente</h3>
          </div>
          <div class="crm-card-content" style="padding:0;">
            <div style="overflow:auto;max-height:480px;">
              <table class="crm-table" style="width:100%;border-collapse:separate;border-spacing:0;">
                <thead style="position:sticky;top:0;background:#f8fafc;z-index:2;">
                  <tr>
                    <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Contrato</th>
                    <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Título</th>
                    <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Empreendimento</th>
                    <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Unidade</th>
                    <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Data Venda</th>
                    <th style="text-align:center;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Status</th>
                    <th style="text-align:center;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Ações</th>
                  </tr>
                </thead>
                <tbody id="cessao-results-tbody">
                  <tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">Faça uma busca para encontrar clientes.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
  },

  limparBusca() {
    ['cessao-filter-nome', 'cessao-filter-doc', 'cessao-filter-telefone', 'cessao-filter-email'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    window.CessaoSelectedCustomerId = null;
    CessaoState.customer = null;
    CessaoState.contracts = [];
    const sug = document.getElementById('cessao-sugestoes');
    if (sug) sug.style.display = 'none';
    const cc = document.getElementById('cessao-customer-card');
    const rc = document.getElementById('cessao-results-card');
    if (cc) cc.style.display = 'none';
    if (rc) rc.style.display = 'none';
  },

  norm(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  sugerirCliente(val, tipo) {
    const box = document.getElementById('cessao-sugestoes');
    if (!box) return;
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const term = String(val || '').trim();
    if (!term || term.length < 2 || !cache.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    let hits = [];
    if (tipo === 'nome') {
      const terms = this.norm(term).split(/\s+/).filter(Boolean);
      hits = cache.filter((c) => {
        const n = this.norm(c.name);
        return terms.every((t) => n.includes(t));
      }).slice(0, 12);
    } else if (tipo === 'telefone') {
      const digits = term.replace(/\D/g, '');
      if (digits.length < 4) { box.style.display = 'none'; return; }
      hits = cache.filter((c) => (c.phones || []).some((p) => {
        const full = String(p.areaCode || '') + String(p.number || p.phoneNumber || '');
        return full.replace(/\D/g, '').includes(digits);
      })).slice(0, 12);
    } else if (tipo === 'email') {
      const t = this.norm(term);
      hits = cache.filter((c) => this.norm(c.email).includes(t)).slice(0, 12);
    }
    if (!hits.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = hits.map((c) => {
      const doc = c.cpf || c.cnpj || c.cpfCnpj || '';
      return `<button type="button" class="cessao-sugestao-item" onclick="CessaoApp.escolherSugestao('${String(c.id).replace(/'/g, '')}')">
        <strong>${this.esc(c.name)}</strong>
        <span>${this.esc(doc || ('ID ' + c.id))}</span>
      </button>`;
    }).join('');
  },

  escolherSugestao(id) {
    window.CessaoSelectedCustomerId = id;
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === String(id));
    if (hit) {
      const nome = document.getElementById('cessao-filter-nome');
      const doc = document.getElementById('cessao-filter-doc');
      if (nome) nome.value = hit.name || '';
      if (doc) doc.value = hit.cpf || hit.cnpj || hit.cpfCnpj || String(hit.id);
    }
    const sug = document.getElementById('cessao-sugestoes');
    if (sug) sug.style.display = 'none';
    this.buscar();
  },

  async resolveCustomerId() {
    if (window.CessaoSelectedCustomerId) return String(window.CessaoSelectedCustomerId);
    const nome = (document.getElementById('cessao-filter-nome') || {}).value || '';
    const docRaw = (document.getElementById('cessao-filter-doc') || {}).value || '';
    const tel = ((document.getElementById('cessao-filter-telefone') || {}).value || '').replace(/\D/g, '');
    const email = (document.getElementById('cessao-filter-email') || {}).value || '';
    const docDigits = String(docRaw).replace(/\D/g, '');
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];

    if (docDigits.length >= 11 && cache.length) {
      const byDoc = cache.find((c) => String(c.cpf || c.cnpj || c.cpfCnpj || '').replace(/\D/g, '') === docDigits);
      if (byDoc) return String(byDoc.id);
    }

    if (/^\d+$/.test(String(docRaw).trim()) && String(docRaw).trim().length <= 8) {
      return String(docRaw).trim();
    }

    let match = null;
    if (nome && cache.length) {
      const terms = this.norm(nome).split(/\s+/).filter(Boolean);
      match = cache.find((c) => {
        const n = this.norm(c.name);
        return terms.every((t) => n.includes(t));
      });
    } else if (tel.length >= 4 && cache.length) {
      match = cache.find((c) => (c.phones || []).some((p) => {
        const full = String(p.areaCode || '') + String(p.number || p.phoneNumber || '');
        return full.replace(/\D/g, '').includes(tel);
      }));
    } else if (email && cache.length) {
      match = cache.find((c) => this.norm(c.email).includes(this.norm(email)));
    } else if (docDigits.length >= 11 && cache.length) {
      match = cache.find((c) => String(c.cpf || c.cnpj || c.cpfCnpj || '').replace(/\D/g, '') === docDigits);
    }
    return match ? String(match.id) : null;
  },

  customerCardHtml(c) {
    const doc = c.cpfCnpj || c.cpf || c.cnpj || '';
    const docLabel = String(doc).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF';
    let age = 'Não informado';
    if (c.birthDate && String(doc).replace(/\D/g, '').length <= 11) {
      const birth = new Date(String(c.birthDate).slice(0, 10) + 'T12:00:00');
      if (!isNaN(birth.getTime())) {
        const today = new Date();
        let diff = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) diff--;
        age = diff + ' anos';
      }
    }
    const prof = c.profession || c.occupation || 'N/D';
    let addr = 'Não informado';
    if (c.addresses && c.addresses[0]) {
      const a = c.addresses[0];
      addr = [a.street || a.streetName, a.number, a.complement, a.neighborhood, [a.cityName || a.city, a.stateName || a.state].filter(Boolean).join('/'), a.postalCode || a.zipCode ? 'CEP: ' + (a.postalCode || a.zipCode) : '']
        .filter(Boolean).join(', ');
    }
    let phone = 'Não informado';
    const phones = c.phones || [];
    if (phones[0]) {
      const p = phones[0];
      const raw = String(p.areaCode || '') + String(p.number || p.phoneNumber || '');
      const d = raw.replace(/\D/g, '');
      phone = d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : (d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : raw);
    } else if (c.phone) phone = c.phone;
    const email = c.email || 'Não informado';
    const fmtDoc = typeof formatCpfCnpj === 'function' ? formatCpfCnpj(doc) : doc;
    return `
      <div class="cessao-customer-grid">
        <div class="cessao-customer-field cessao-customer-field--wide">
          <span class="cessao-lbl">Nome</span>
          <span class="cessao-val">${this.esc(c.name || '—')}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">${docLabel}</span>
          <span class="cessao-val">${this.esc(fmtDoc || '—')}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Idade</span>
          <span class="cessao-val">${this.esc(age)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Profissão</span>
          <span class="cessao-val">${this.esc(prof)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Telefones</span>
          <span class="cessao-val">${this.esc(phone)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">E-mail</span>
          <span class="cessao-val">${this.esc(email)}</span>
        </div>
        <div class="cessao-customer-field cessao-customer-field--full">
          <span class="cessao-lbl">Endereço</span>
          <span class="cessao-val">${this.esc(addr)}</span>
        </div>
      </div>`;
  },

  statusPill(ok) {
    if (ok) {
      return '<span style="background:#ecfdf5;border:1px solid #86efac;color:#166534;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Adimplente</span>';
    }
    return '<span style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Inadimplente</span>';
  },

  async buscar() {
    const tbody = document.getElementById('cessao-results-tbody');
    const info = document.getElementById('cessao-customer-info');
    const card = document.getElementById('cessao-customer-card');
    const results = document.getElementById('cessao-results-card');
    const sug = document.getElementById('cessao-sugestoes');
    if (sug) sug.style.display = 'none';

    const customerId = await this.resolveCustomerId();
    if (!customerId) {
      alert('Informe nome, ID/CPF/CNPJ, telefone ou e-mail para pesquisar.');
      return;
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:#64748b;">
        <div class="loading-spinner" style="width:28px;height:28px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
        Buscando contratos do cliente…
      </td></tr>`;
    }
    if (results) results.style.display = 'block';
    if (card) card.style.display = 'none';

    try {
      const svc = window.SiengeApiService;
      if (!svc) throw new Error('API Sienge indisponível');
      const customer = await svc.getCustomer(customerId);
      if (!customer) throw new Error('Cliente não encontrado');
      CessaoState.customer = customer;
      if (info) info.innerHTML = this.customerCardHtml(customer);
      if (card) card.style.display = 'block';

      let contracts = [];
      if (typeof svc.getSales === 'function') {
        contracts = await svc.getSales(customerId);
      }
      if (!Array.isArray(contracts)) contracts = [];
      contracts = contracts.filter((c) => {
        const st = String(c.status || c.situation || '').toUpperCase();
        return !st.includes('CANCEL') && !st.includes('DISTRAT');
      });
      CessaoState.contracts = contracts;

      if (!contracts.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">Nenhum contrato ativo encontrado para este cliente.</td></tr>';
        return;
      }

      const ccs = (typeof svc.getCostCenters === 'function') ? (await svc.getCostCenters().catch(() => [])) : [];
      const ccMap = {};
      (ccs || []).forEach((cc) => { ccMap[String(cc.id)] = cc.name; });

      tbody.innerHTML = contracts.map((c) => {
        const cid = c.id || c.contractId;
        const num = c.contractNumber || c.number || cid;
        const titulo = c.receivableBillId || c.billReceivableId || '—';
        const empId = c.enterpriseId || c.costCenterId || '';
        const empName = ccMap[String(empId)] || c.enterpriseName || empId || '—';
        const unitFromState = (window.AppState && AppState.units && c.unitId && AppState.units[c.unitId]) || null;
        const unitLabel = unitFromState
          ? `${empId} - ${[unitFromState.block, unitFromState.lot].filter(Boolean).join('-')}`
          : (c.unitName || c.unitId || '—');
        const dataVenda = this.fmtDate(c.saleDate || c.contractDate || c.issueDate);
        const active = String(c.status || '').toUpperCase() === 'ATIVO' || String(c.status || '').toUpperCase() === 'QUITADO';
        const statusHtml = String(c.status || '').toUpperCase() === 'QUITADO'
          ? '<span style="background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Quitado</span>'
          : this.statusPill(active);
        return `<tr>
          <td style="padding:10px;font-weight:700;font-size:0.75rem;">${this.esc(num)}</td>
          <td style="padding:10px;font-weight:800;font-size:0.75rem;">${this.esc(titulo)}</td>
          <td style="padding:10px;font-size:0.75rem;">${this.esc(empName)}</td>
          <td style="padding:10px;font-size:0.75rem;">${this.esc(unitLabel)}</td>
          <td style="padding:10px;font-size:0.75rem;">${this.esc(dataVenda)}</td>
          <td style="padding:10px;text-align:center;">${statusHtml}</td>
          <td style="padding:10px;text-align:center;white-space:nowrap;">
            <button type="button" class="btn btn-primary btn-sm"
              onclick="openGestaoDocumentoMenu({customerId:'${String(customerId).replace(/'/g, '')}',contractId:'${String(cid).replace(/'/g, '')}',titulo:'${String(titulo).replace(/'/g, '')}',contractNumber:'${String(num).replace(/'/g, '')}',customerName:'${String(customer.name || '').replace(/'/g, "\\'")}'})"
              style="margin-right:6px;padding:6px 12px;font-size:0.75rem;font-weight:700;">
              <i data-lucide="briefcase" style="width:14px;height:14px;margin-right:4px;"></i> Gestão
            </button>
            <button type="button" class="btn btn-secondary btn-sm"
              data-customer-id="${this.esc(customerId)}"
              data-title="${this.esc(titulo)}"
              data-name="${this.esc(customer.name || '')}"
              data-unit="${this.esc(unitLabel)}"
              data-cc="${this.esc(empId)}"
              onclick="visualizarExtratoDireto(this)"
              style="padding:6px 12px;font-size:0.75rem;font-weight:700;">
              <i data-lucide="file-text" style="width:14px;height:14px;margin-right:4px;"></i> Extrato
            </button>
          </td>
        </tr>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('[Cessão] busca', e);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-danger);">${this.esc(e.message || 'Falha na busca')}</td></tr>`;
    }
  },

  // ——— FLUXO ———
  async abrirFluxo(customerId, contractId, titulo) {
    CessaoState.loading = true;
    CessaoState.view = 'fluxo';
    CessaoState.tab = 'contrato';
    CessaoState.condicoes = [];
    CessaoState.cessionarios = [];
    CessaoState.extratoRows = [];
    this.render();
    try {
      const svc = window.SiengeApiService;
      let contract = (CessaoState.contracts || []).find((c) => String(c.id || c.contractId) === String(contractId));
      if (svc && typeof svc.getContractRaw === 'function') {
        try {
          const raw = await svc.getContractRaw(contractId);
          if (raw) contract = { ...(contract || {}), ...raw };
        } catch (e) {}
      }
      if (!CessaoState.customer && svc) {
        CessaoState.customer = await svc.getCustomer(customerId);
      }
      const people = (contract && (contract.salesContractCustomers || contract.customers)) || [];
      CessaoState.cedentes = people.map((p) => {
        const id = p.customerId || p.id;
        return {
          id: String(id),
          name: p.name || p.customerName || ('Cliente ' + id),
          pct: this.pctOf(p, people.length),
          cederPct: 0,
          main: !!(p.main === true || p.main === 'true')
        };
      });
      if (!CessaoState.cedentes.length && CessaoState.customer) {
        CessaoState.cedentes = [{
          id: String(customerId),
          name: CessaoState.customer.name || 'Cliente',
          pct: 100,
          cederPct: 0,
          main: true
        }];
      }

      let bill = null;
      const billId = titulo && String(titulo) !== '—' ? titulo : (contract && (contract.receivableBillId || contract.billReceivableId));
      if (billId && svc && typeof svc.getBillInstallments === 'function') {
        try {
          const inst = await svc.getBillInstallments(billId);
          const rows = (inst && inst.results) || inst || [];
          if (Array.isArray(rows)) CessaoState.extratoRows = rows.slice(0, 80);
          bill = { id: billId, installments: rows };
        } catch (e) {}
      }

      CessaoState.selected = {
        customerId,
        contractId,
        titulo: billId || titulo || '—',
        contract: contract || {},
        bill
      };
      CessaoState.condicoes = [{ id: 'c1', tipo: 'Mensal', qtde: 1, valor: '', vencimento: '' }];
    } catch (e) {
      console.error('[Cessão] abrirFluxo', e);
      alert('Não foi possível abrir a cessão deste contrato.');
      CessaoState.view = 'busca';
    } finally {
      CessaoState.loading = false;
      this.render();
    }
  },

  voltarBusca() {
    CessaoState.view = 'busca';
    CessaoState.selected = null;
    this.render();
    if (CessaoState.customer) {
      // re-show last search cards after re-render
      setTimeout(() => this.buscar(), 0);
    }
  },

  setTab(tab) {
    CessaoState.tab = tab;
    this.render();
  },

  setCederPct(idx, val) {
    const row = CessaoState.cedentes[idx];
    if (!row) return;
    let n = Number(String(val).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > row.pct) n = row.pct;
    row.cederPct = Math.round(n * 100) / 100;
    this.patchCedentesResumo();
  },

  patchCedentesResumo() {
    const el = document.getElementById('cessao-total-cedido');
    if (el) el.textContent = this.totalCedido().toFixed(2).replace('.', ',') + '%';
    const rest = document.getElementById('cessao-restante-cessionarios');
    if (rest) {
      const rem = Math.max(0, this.totalCedido() - this.totalAdquirido());
      rest.textContent = rem.toFixed(2).replace('.', ',') + '%';
    }
  },

  addCondicao() {
    CessaoState.condicoes.push({
      id: 'c' + Date.now(),
      tipo: 'Mensal',
      qtde: 1,
      valor: '',
      vencimento: ''
    });
    this.render();
  },

  removeCondicao(id) {
    CessaoState.condicoes = CessaoState.condicoes.filter((c) => c.id !== id);
    if (!CessaoState.condicoes.length) this.addCondicao();
    else this.render();
  },

  updateCondicao(id, field, value) {
    const row = CessaoState.condicoes.find((c) => c.id === id);
    if (!row) return;
    row[field] = value;
  },

  async buscarCessionario(term) {
    CessaoState.cessionarioBusca = term;
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const t = String(term || '').trim();
    if (t.length < 2) {
      CessaoState.cessionarioSugestoes = [];
      this.patchCessionarioSugestoes();
      return;
    }
    const digits = t.replace(/\D/g, '');
    const norm = this.norm(t);
    const terms = norm.split(/\s+/).filter(Boolean);
    let hits = cache.filter((c) => {
      const n = this.norm(c.name);
      const doc = String(c.cpf || c.cnpj || c.cpfCnpj || '').replace(/\D/g, '');
      const email = this.norm(c.email);
      const phoneHit = (c.phones || []).some((p) => {
        const full = String(p.areaCode || '') + String(p.number || p.phoneNumber || '');
        return digits.length >= 4 && full.replace(/\D/g, '').includes(digits);
      });
      return terms.every((x) => n.includes(x))
        || (digits.length >= 11 && doc === digits)
        || (digits.length >= 4 && String(c.id) === digits)
        || email.includes(norm)
        || phoneHit;
    }).slice(0, 10);
    CessaoState.cessionarioSugestoes = hits;
    this.patchCessionarioSugestoes();
  },

  patchCessionarioSugestoes() {
    const box = document.getElementById('cessao-cessionario-sugestoes');
    if (!box) return;
    const hits = CessaoState.cessionarioSugestoes || [];
    if (!hits.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = hits.map((c) => {
      const doc = c.cpf || c.cnpj || c.cpfCnpj || '';
      return `<button type="button" class="cessao-sugestao-item" onclick="CessaoApp.addCessionario('${String(c.id).replace(/'/g, '')}')">
        <strong>${this.esc(c.name)}</strong>
        <span>${this.esc(doc || ('ID ' + c.id))}</span>
      </button>`;
    }).join('');
  },

  addCessionario(customerId) {
    if ((CessaoState.cedentes || []).some((c) => String(c.id) === String(customerId))) {
      alert('Este cliente já é cedente do contrato. Escolha outro cessionário.');
      return;
    }
    if ((CessaoState.cessionarios || []).some((c) => String(c.customerId) === String(customerId))) {
      alert('Cessionário já adicionado.');
      return;
    }
    const rem = this.totalCedido() - this.totalAdquirido();
    if (this.totalCedido() <= 0) {
      alert('Defina primeiro o percentual cedido na aba Cedentes.');
      this.setTab('cedentes');
      return;
    }
    if (rem <= 0.001) {
      alert('O percentual cedido já foi totalmente alocado aos cessionários.');
      return;
    }
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === String(customerId));
    CessaoState.cessionarios.push({
      id: 'x' + Date.now(),
      customerId: String(customerId),
      name: (hit && hit.name) || ('Cliente ' + customerId),
      doc: (hit && (hit.cpf || hit.cnpj || hit.cpfCnpj)) || '',
      pct: Math.round(Math.min(rem, rem) * 100) / 100
    });
    CessaoState.cessionarioSugestoes = [];
    CessaoState.cessionarioBusca = '';
    this.render();
  },

  setCessionarioPct(idx, val) {
    const row = CessaoState.cessionarios[idx];
    if (!row) return;
    let n = Number(String(val).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) n = 0;
    row.pct = Math.round(n * 100) / 100;
    this.patchCedentesResumo();
    const tot = document.getElementById('cessao-total-adquirido');
    if (tot) tot.textContent = this.totalAdquirido().toFixed(2).replace('.', ',') + '%';
  },

  removeCessionario(id) {
    CessaoState.cessionarios = CessaoState.cessionarios.filter((c) => c.id !== id);
    this.render();
  },

  fluxoHtml() {
    const c = CessaoState.customer || {};
    const sel = CessaoState.selected || {};
    const contract = sel.contract || {};
    const units = contract.salesContractUnits || contract.units || [];
    const u0 = units[0] || {};
    const emp = contract.enterpriseName || contract.enterpriseId || '—';
    const unit = u0.name || contract.unitName || '—';
    const tabs = [
      { id: 'contrato', label: 'Dados do Contrato' },
      { id: 'extrato', label: 'Extrato' },
      { id: 'cedentes', label: 'Cedentes' },
      { id: 'condicoes', label: 'Dados do Contrato Atual' },
      { id: 'cessionarios', label: 'Cessionários' }
    ];
    if (CessaoState.loading) {
      return `<div class="cessao-shell" style="padding:48px;text-align:center;color:#64748b;">
        <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
        Carregando dados da cessão…
      </div>`;
    }
    return `
      <div class="cessao-shell">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
          <button type="button" class="btn btn-outline btn-sm" onclick="CessaoApp.voltarBusca()">
            <i data-lucide="arrow-left" style="width:14px;"></i> Voltar à busca
          </button>
          <strong style="color:var(--color-primary);font-size:1rem;">Cessão de Direitos</strong>
        </div>

        <div class="crm-card" style="margin-bottom:14px;">
          <div class="crm-card-header" style="background:#f3f4f6;padding:10px 16px;border-bottom:1px solid #e5e7eb;">
            <h3 style="margin:0;font-size:1rem;color:var(--color-primary);">Dados do cliente</h3>
          </div>
          ${this.customerCardHtml(c)}
        </div>

        <div class="cessao-tabs">
          ${tabs.map((t) => `<button type="button" class="cessao-tab-btn ${CessaoState.tab === t.id ? 'active' : ''}" onclick="CessaoApp.setTab('${t.id}')">${t.label}</button>`).join('')}
        </div>

        <div class="crm-card cessao-tab-panel">
          ${this.tabContentHtml(emp, unit)}
        </div>
      </div>`;
  },

  tabContentHtml(emp, unit) {
    const sel = CessaoState.selected || {};
    const contract = sel.contract || {};
    const tab = CessaoState.tab;
    if (tab === 'contrato') {
      return `
        <div class="crm-card-header" style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Dados do Contrato</h3>
          <button type="button" class="btn btn-sm" style="background:#eab308;color:#1e293b;font-weight:700;border:none;"
            data-customer-id="${this.esc(sel.customerId || '')}"
            data-title="${this.esc(sel.titulo || '')}"
            data-name="${this.esc((CessaoState.customer && CessaoState.customer.name) || '')}"
            data-unit="${this.esc(unit)}"
            data-cc="${this.esc(contract.enterpriseId || '')}"
            onclick="visualizarExtratoDireto(this)">
            <i data-lucide="file-text" style="width:14px;height:14px;"></i> Visualizar Extrato
          </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:16px;">
          <div><span class="cessao-lbl">Título</span><span class="cessao-val">${this.esc(sel.titulo || '—')}</span></div>
          <div><span class="cessao-lbl">Contrato</span><span class="cessao-val">${this.esc(contract.contractNumber || contract.number || sel.contractId || '—')}</span></div>
          <div><span class="cessao-lbl">Empreendimento</span><span class="cessao-val">${this.esc(emp)}</span></div>
          <div><span class="cessao-lbl">Quadra / Lote</span><span class="cessao-val">${this.esc(unit)}</span></div>
          <div><span class="cessao-lbl">Data Venda</span><span class="cessao-val">${this.esc(this.fmtDate(contract.contractDate || contract.issueDate || contract.saleDate))}</span></div>
          <div><span class="cessao-lbl">ID Contrato</span><span class="cessao-val">${this.esc(sel.contractId || '—')}</span></div>
        </div>`;
    }
    if (tab === 'extrato') {
      const rows = CessaoState.extratoRows || [];
      if (!rows.length) {
        return `<div style="padding:28px;text-align:center;color:#94a3b8;">Nenhuma parcela carregada. Use <strong>Visualizar Extrato</strong> na aba Dados do Contrato para o PDF completo.</div>`;
      }
      return `
        <div class="crm-card-header" style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Extrato (parcelas)</h3>
        </div>
        <div style="overflow:auto;max-height:420px;">
          <table class="crm-table" style="width:100%;">
            <thead><tr>
              <th style="text-align:left;padding:8px;font-size:0.65rem;color:#64748b;">#</th>
              <th style="text-align:left;padding:8px;font-size:0.65rem;color:#64748b;">Tipo</th>
              <th style="text-align:left;padding:8px;font-size:0.65rem;color:#64748b;">Vencimento</th>
              <th style="text-align:right;padding:8px;font-size:0.65rem;color:#64748b;">Valor</th>
              <th style="text-align:left;padding:8px;font-size:0.65rem;color:#64748b;">Situação</th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr>
                  <td style="padding:8px;font-size:0.8rem;">${r.installmentNumber || i + 1}</td>
                  <td style="padding:8px;font-size:0.8rem;">${this.esc(r.conditionType || r.paymentConditionType || r.installmentType || '—')}</td>
                  <td style="padding:8px;font-size:0.8rem;">${this.esc(this.fmtDate(r.dueDate))}</td>
                  <td style="padding:8px;font-size:0.8rem;text-align:right;">${this.fmtMoney(r.originalAmount || r.amount || r.balanceDue)}</td>
                  <td style="padding:8px;font-size:0.8rem;">${this.esc(r.situation || r.status || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
    if (tab === 'cedentes') {
      const totalCed = this.totalCedido();
      return `
        <div class="crm-card-header" style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Cedentes do contrato</h3>
            <p style="margin:4px 0 0;font-size:0.8rem;color:#64748b;">Informe quanto % cada titular atual irá ceder.</p>
          </div>
          <div style="font-size:0.85rem;font-weight:700;color:var(--color-primary);">Total cedido: <span id="cessao-total-cedido">${totalCed.toFixed(2).replace('.', ',')}%</span></div>
        </div>
        <div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">
          ${(CessaoState.cedentes || []).map((row, idx) => `
            <div class="cessao-cedent-row">
              <div>
                <strong>${this.esc(row.name)}</strong>
                ${row.main ? '<span class="cessao-badge">Principal</span>' : ''}
                <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">ID ${this.esc(row.id)} · Participação atual: <b>${Number(row.pct).toFixed(2).replace('.', ',')}%</b></div>
              </div>
              <label style="display:flex;flex-direction:column;gap:4px;min-width:140px;">
                <span style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">% a ceder</span>
                <input type="number" min="0" max="${row.pct}" step="0.01" class="form-control"
                  value="${row.cederPct || 0}"
                  oninput="CessaoApp.setCederPct(${idx}, this.value)">
              </label>
            </div>`).join('') || '<p style="color:#94a3b8;">Nenhum cedente encontrado no contrato.</p>'}
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button type="button" class="btn btn-primary" onclick="CessaoApp.setTab('condicoes')">Avançar</button>
          </div>
        </div>`;
    }
    if (tab === 'condicoes') {
      return `
        <div class="cessao-cond-head">CONDIÇÕES DE PAGAMENTO</div>
        <p style="margin:0;padding:10px 16px;font-size:0.82rem;color:#64748b;">Informe como o cliente comprou o lote no passado. Você pode adicionar várias condições.</p>
        <div style="overflow:auto;padding:0 12px 12px;">
          <table class="cessao-cond-table">
            <thead>
              <tr>
                <th>Tipo de Condição</th>
                <th>Qtde. Parcelas</th>
                <th>Valor da Parcela</th>
                <th>Total da Condição</th>
                <th>Vencimento</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(CessaoState.condicoes || []).map((row) => {
                const qtde = Number(row.qtde) || 0;
                const valor = Number(String(row.valor || '').replace(/\./g, '').replace(',', '.')) || 0;
                const total = qtde * valor;
                return `<tr>
                  <td>
                    <select class="form-control" onchange="CessaoApp.updateCondicao('${row.id}','tipo',this.value)">
                      ${CESSAO_TIPOS_CONDICAO.map((t) => `<option value="${t}" ${row.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                  </td>
                  <td><input type="number" min="1" class="form-control" value="${row.qtde || 1}" onchange="CessaoApp.updateCondicao('${row.id}','qtde',this.value);CessaoApp.render();"></td>
                  <td><input type="text" class="form-control" placeholder="0,00" value="${this.esc(row.valor)}" onchange="CessaoApp.updateCondicao('${row.id}','valor',this.value);CessaoApp.render();"></td>
                  <td style="font-weight:700;white-space:nowrap;">${this.fmtMoney(total)}</td>
                  <td><input type="date" class="form-control" value="${this.esc(row.vencimento || '')}" onchange="CessaoApp.updateCondicao('${row.id}','vencimento',this.value)"></td>
                  <td><button type="button" class="btn btn-outline btn-sm" onclick="CessaoApp.removeCondicao('${row.id}')" title="Remover"><i data-lucide="trash-2" style="width:14px;"></i></button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:0 16px 16px;display:flex;justify-content:space-between;gap:10px;">
          <button type="button" class="btn btn-outline" onclick="CessaoApp.addCondicao()"><i data-lucide="plus" style="width:14px;"></i> Adicionar condição</button>
          <button type="button" class="btn btn-primary" onclick="CessaoApp.setTab('cessionarios')">Avançar para Cessionários</button>
        </div>`;
    }
    if (tab === 'cessionarios') {
      const cedido = this.totalCedido();
      const adquirido = this.totalAdquirido();
      const resto = Math.max(0, cedido - adquirido);
      return `
        <div class="crm-card-header" style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Cessionários (adquirentes)</h3>
          <p style="margin:4px 0 0;font-size:0.8rem;color:#64748b;">Busque por nome, ID, telefone ou e-mail e aloque o % até atingir o total cedido.</p>
        </div>
        <div style="padding:14px 16px;">
          <div class="cessao-kpi-row">
            <div class="cessao-kpi"><span>Total cedido</span><strong>${cedido.toFixed(2).replace('.', ',')}%</strong></div>
            <div class="cessao-kpi"><span>Total adquirido</span><strong id="cessao-total-adquirido">${adquirido.toFixed(2).replace('.', ',')}%</strong></div>
            <div class="cessao-kpi"><span>Restante</span><strong id="cessao-restante-cessionarios">${resto.toFixed(2).replace('.', ',')}%</strong></div>
          </div>
          <div style="position:relative;margin:12px 0 16px;">
            <label style="display:block;font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Buscar cessionário</label>
            <input type="text" class="form-control" placeholder="Nome, ID, telefone ou e-mail"
              value="${this.esc(CessaoState.cessionarioBusca || '')}"
              oninput="CessaoApp.buscarCessionario(this.value)">
            <div id="cessao-cessionario-sugestoes" class="cessao-sugestoes" style="display:none;"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${(CessaoState.cessionarios || []).map((row, idx) => `
              <div class="cessao-cedent-row">
                <div>
                  <strong>${this.esc(row.name)}</strong>
                  <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">ID ${this.esc(row.customerId)}${row.doc ? ' · ' + this.esc(row.doc) : ''}</div>
                </div>
                <div style="display:flex;align-items:end;gap:8px;">
                  <label style="display:flex;flex-direction:column;gap:4px;min-width:120px;">
                    <span style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">% a adquirir</span>
                    <input type="number" min="0" step="0.01" class="form-control" value="${row.pct || 0}"
                      oninput="CessaoApp.setCessionarioPct(${idx}, this.value)">
                  </label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="CessaoApp.removeCessionario('${row.id}')"><i data-lucide="trash-2" style="width:14px;"></i></button>
                </div>
              </div>`).join('') || '<p style="color:#94a3b8;margin:0;">Nenhum cessionário adicionado ainda.</p>'}
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;gap:8px;">
            <button type="button" class="btn btn-cancel" onclick="CessaoApp.voltarBusca()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="CessaoApp.concluir()">
              <i data-lucide="check" style="width:16px;"></i> Registrar cessão
            </button>
          </div>
        </div>`;
    }
    return '';
  },

  concluir() {
    const cedido = this.totalCedido();
    const adquirido = this.totalAdquirido();
    if (cedido <= 0) {
      alert('Informe o percentual cedido pelos titulares na aba Cedentes.');
      this.setTab('cedentes');
      return;
    }
    if (!(CessaoState.cessionarios || []).length) {
      alert('Adicione ao menos um cessionário.');
      this.setTab('cessionarios');
      return;
    }
    if (Math.abs(cedido - adquirido) > 0.05) {
      alert(`O total adquirido (${adquirido.toFixed(2)}%) deve fechar com o total cedido (${cedido.toFixed(2)}%).`);
      this.setTab('cessionarios');
      return;
    }
    const incomplete = (CessaoState.condicoes || []).some((c) => !c.tipo || !c.qtde || !c.valor || !c.vencimento);
    if (incomplete) {
      alert('Preencha todas as condições de pagamento (tipo, qtde, valor e vencimento).');
      this.setTab('condicoes');
      return;
    }
    const payload = {
      contractId: CessaoState.selected && CessaoState.selected.contractId,
      titulo: CessaoState.selected && CessaoState.selected.titulo,
      cedentes: CessaoState.cedentes.filter((c) => Number(c.cederPct) > 0),
      condicoes: CessaoState.condicoes,
      cessionarios: CessaoState.cessionarios,
      at: new Date().toISOString(),
      by: (window.AppState && AppState.currentUser && (AppState.currentUser.email || AppState.currentUser.name)) || ''
    };
    try {
      const key = 'crm_moura_cessoes';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.unshift(payload);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
    } catch (e) {}
    alert('Cessão registrada nesta sessão. Integração definitiva com o Sienge pode ser ligada na próxima etapa.');
    this.voltarBusca();
  }
};

window.CessaoApp = CessaoApp;
window.CessaoState = CessaoState;

/* Popup da Gestão: Cedentes → Condições da compra → Cessionário → PDF. */
const CessaoPopupState = {
  tab: "cedentes",
  loading: false,
  gerando: false,
  ctx: null,
  customer: null,
  contract: {},
  unit: {},
  unitDetails: null,
  empName: "",
  quadraLote: "",
  titulo: "",
  dataVenda: "",
  recente: false,
  preamble: "",
  empresaNome: "",
  cedentes: [],
  faltaPct: false,
  condicoes: [],
  juros: 0,
  indexador: "REAL",
  qtdPagas: 0,
  qtdAbertas: 0,
  valorParcelaAberta: 0,
  primeiroVencAberto: "",
  saldoAberto: 0,
  cessionarios: [],
  busca: "",
  buscaModo: { tipo: "cessionario" },
  sugestoes: [],
      valorPago: 0,
  testemunha1: "",
  testemunha2: ""
};

const CessaoPopup = {
  esc(s) { return CessaoApp.esc(s); },

  parseValor(raw) {
    let s = String(raw == null ? "" : raw).replace(/[R$\s]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  },

  fmtPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  extensoValor(n) {
    return typeof valorPorExtensoBRL === "function" ? valorPorExtensoBRL(n) : "";
  },

  extensoQtd(n) {
    return typeof numeroPorExtenso === "function" ? numeroPorExtenso(n) : String(n);
  },

  inclusive(word) {
    const raw = String(word || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (/\([oa]\)$/i.test(lower) || /(ista|ante|ente|ense)$/i.test(lower)) return lower;
    if (/eira$/i.test(lower)) return lower.slice(0, -4) + "eiro(a)";
    if (/eiro$/i.test(lower)) return lower + "(a)";
    if (/ora$/i.test(lower)) return lower.slice(0, -1) + "(a)";
    if (/(ador|edor|idor|utor|essor|itor|or)$/i.test(lower)) return lower + "(a)";
    if (/a$/i.test(lower)) return lower.slice(0, -1) + "o(a)";
    if (/o$/i.test(lower)) return lower + "(a)";
    return lower;
  },

  isPj(c) {
    if (!c) return false;
    const t = String(c.personType || c.type || "").toUpperCase();
    if (t.startsWith("J")) return true;
    const doc = String(c.cnpj || c.cpfCnpj || c.cpf || "").replace(/\D/g, "");
    return doc.length > 11;
  },

  docDe(c) {
    const raw = (c && (c.cpfCnpj || c.cpf || c.cnpj)) || "";
    return typeof formatCpfCnpj === "function" ? (formatCpfCnpj(raw) || raw) : raw;
  },

  foneDe(c) {
    if (!c) return "";
    const phones = c.phones || [];
    const p = phones.find((x) => x && (x.main || x.isMain)) || phones[0];
    if (!p) return c.phone && c.phone !== "N/D" ? String(c.phone) : "";
    const d = (String(p.areaCode || "") + String(p.number || p.phoneNumber || "")).replace(/\D/g, "");
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return d;
  },

  emailDe(c) {
    const e = c && c.email;
    return e && e !== "N/D" && e !== "undefined" ? String(e) : "";
  },

  totalCedido() {
    return (CessaoPopupState.cedentes || []).reduce((s, c) => s + (c.cede ? (Number(c.cederPct) || 0) : 0), 0);
  },

  totalAdquirido() {
    return (CessaoPopupState.cessionarios || []).reduce((s, c) => s + (Number(c.pct) || 0), 0);
  },

  pendenciaAba(tab) {
    const st = CessaoPopupState;
    if (tab === "cedentes") {
      if (st.faltaPct) {
        const soma = st.cedentes.reduce((s, c) => s + (Number(c.participacao) || 0), 0);
        if (Math.abs(soma - 100) > 0.05) return "A soma da participação de cada pessoa precisa fechar em 100%.";
      }
      if (!(st.cedentes || []).some((c) => c.cede && Number(c.cederPct) > 0)) return "Escolha quem vai ceder e informe o percentual.";
      const estoura = st.cedentes.find((c) => c.cede && Number(c.cederPct) - Number(c.participacao) > 0.05);
      if (estoura) return estoura.name + " não pode ceder mais do que a participação dela.";
      return "";
    }
    if (tab === "condicoes") {
      const rows = st.condicoes || [];
      if (!rows.length || rows.some((r) => !(Number(r.qtde) > 0) || !(this.parseValor(r.valor) > 0) || !r.vencimento)) {
        return "Preencha quantidade, valor e vencimento de cada condição.";
      }
      if (!Number.isFinite(Number(st.juros)) || Number(st.juros) < 0) return "Informe os juros do contrato. Use 0 quando não houver.";
      return "";
    }
    return "";
  },

  pendenciaPdf() {
    const aba = this.pendenciaAba("cedentes") || this.pendenciaAba("condicoes");
    if (aba) return aba;
    const st = CessaoPopupState;
    if (!(st.cessionarios || []).length) return "Escolha o cessionário.";
    if (Math.abs(this.totalCedido() - this.totalAdquirido()) > 0.05) return "O percentual adquirido precisa fechar com o percentual cedido.";
    const semRep = st.cessionarios.find((c) => this.isPj(c.customer) && !c.representante);
    if (semRep) return "Pessoa jurídica precisa de representante: " + (semRep.customer.name || "cessionário") + ".";
    if (!(Number(st.valorPago) > 0)) return "O contrato não tem valores pagos para a cláusula 4.";
    if (!st.testemunha1 || !st.testemunha2) return "Escolha as duas testemunhas.";
    if (String(st.testemunha1) === String(st.testemunha2)) return "As testemunhas precisam ser pessoas diferentes.";
    return "";
  },

  async abrir(ctx) {
    ctx = ctx || {};
    if (!ctx.customerId || !ctx.contractId) {
      alert("Abra a cessão a partir de um contrato, em Buscar Cliente → Gestão.");
      return;
    }
    Object.assign(CessaoPopupState, {
      tab: "cedentes",
      loading: true,
      gerando: false,
      ctx: ctx,
      customer: null,
      contract: {},
      unit: {},
      unitDetails: null,
      empName: "",
      quadraLote: "",
      titulo: ctx.titulo || "",
      dataVenda: "",
      recente: false,
      preamble: "",
      empresaNome: "",
      cedentes: [],
      faltaPct: false,
      condicoes: [],
      juros: 0,
      indexador: "REAL",
      qtdPagas: 0,
      qtdAbertas: 0,
      valorParcelaAberta: 0,
      primeiroVencAberto: "",
      saldoAberto: 0,
      cessionarios: [],
      busca: "",
      buscaModo: { tipo: "cessionario" },
      sugestoes: [],
      valorPago: 0,
      testemunha1: "",
      testemunha2: ""
    });
    this.montar();
    this.pintar();
    try {
      await this.carregar(ctx);
    } catch (e) {
      console.error("[Cessão] popup", e);
      alert("Não foi possível carregar o contrato no Sienge.");
      this.fechar();
      return;
    }
    CessaoPopupState.loading = false;
    this.pintar();
  },

  montar() {
    let ov = document.getElementById("cessao-popup");
    if (ov) return;
    ov = document.createElement("div");
    ov.id = "cessao-popup";
    ov.innerHTML = `
      <div class="cessao-popup-panel" role="dialog" aria-modal="true" aria-labelledby="cessao-popup-title">
        <header>
          <div>
            <h3 id="cessao-popup-title">Cessão de direitos</h3>
            <p id="cessao-popup-sub"></p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="CessaoPopup.fechar()" title="Fechar" style="padding:4px 8px;">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </header>
        <div id="cessao-popup-tabs"></div>
        <div class="cessao-popup-body" id="cessao-popup-body"></div>
        <footer>
          <span class="cessao-pop-aviso" id="cessao-popup-aviso"></span>
          <button type="button" class="btn btn-cancel" onclick="CessaoPopup.fechar()">Cancelar</button>
          <button type="button" class="btn btn-outline" id="cessao-popup-voltar" onclick="CessaoPopup.voltar()">Voltar</button>
          <button type="button" class="btn btn-primary" id="cessao-popup-proximo" onclick="CessaoPopup.proximo()"></button>
        </footer>
      </div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) this.fechar(); });
    document.body.appendChild(ov);
    if (!this._tecla) {
      this._tecla = true;
      document.addEventListener("keydown", (ev) => {
        const box = document.getElementById("cessao-popup");
        if (ev.key === "Escape" && box && box.style.display === "flex" && !CessaoPopupState.gerando) this.fechar();
      });
    }
  },

  fechar() {
    const ov = document.getElementById("cessao-popup");
    if (ov) ov.style.display = "none";
  },

  async carregar(ctx) {
    const svc = window.SiengeApiService;
    if (!svc) throw new Error("API indisponível");
    let contract = {};
    if (typeof svc.getContractRaw === "function") {
      contract = await svc.getContractRaw(ctx.contractId) || {};
    }
    let customer = null;
    if (typeof svc.getCustomer === "function") customer = await svc.getCustomer(ctx.customerId);
    if (customer && typeof window.enrichCustomerForLegalDocs === "function") {
      customer = await window.enrichCustomerForLegalDocs(customer);
    }
    const billId = ctx.titulo || contract.receivableBillId || contract.billReceivableId || "";
    let installments = [];
    if (billId && typeof svc.getBillInstallments === "function") {
      try {
        const inst = await svc.getBillInstallments(billId);
        const rows = (inst && inst.results) || inst || [];
        if (Array.isArray(rows)) installments = rows;
      } catch (e) {}
    }
    const units = contract.salesContractUnits || contract.units || [];
    const u0 = units.find((u) => u && u.main) || units[0] || {};
    const unitName = String(u0.name || ctx.unidade || "").trim();
    const enterpriseId = contract.enterpriseId || contract.costCenterId || "";
    const parts = unitName.split("-").map((x) => x.trim()).filter(Boolean);
    const unit = {
      id: u0.id || "",
      name: unitName,
      block: parts[0] || "",
      lot: parts.slice(1).join("-") || "",
      costCenterId: enterpriseId,
      enterpriseId: enterpriseId
    };
    const sale = Object.assign({}, contract, {
      id: contract.id || ctx.contractId,
      enterpriseId: enterpriseId,
      costCenterId: enterpriseId,
      receivableBillId: billId,
      unitId: unitName,
      customerId: ctx.customerId
    });
    let unitDetails = u0.id ? { id: u0.id, name: u0.name } : null;
    const rel = window.RelacionamentoApp;
    if (rel && typeof rel._localizarUnidadeSienge === "function") {
      const achou = await rel._localizarUnidadeSienge(sale, enterpriseId, unitName).catch(() => null);
      if (achou) unitDetails = Object.assign({}, unitDetails || {}, achou);
    }
    if (rel && typeof rel._carregarUnidadeCompleta === "function" && unitDetails && unitDetails.id) {
      const fake = { unitDetails: unitDetails, unit: unit, sale: sale };
      await rel._carregarUnidadeCompleta(fake);
      unitDetails = fake.unitDetails || unitDetails;
    }
    const iso = String(contract.contractDate || contract.issueDate || contract.saleDate || "").slice(0, 10);
    const ano = Number(iso.slice(0, 4));
    const recente = ano >= 2017;
    const people = contract.salesContractCustomers || contract.customers || [];
    const cedentes = [];
    for (const p of (people.length ? people : [{ id: ctx.customerId, name: ctx.nome, main: true }])) {
      const id = String(p.customerId || p.id || "");
      let full = null;
      if (id && String(id) === String(ctx.customerId)) full = customer;
      else if (id && svc.getCustomer) {
        try { full = await svc.getCustomer(id); } catch (e) { full = null; }
        if (full && typeof window.enrichCustomerForLegalDocs === "function") {
          try { full = await window.enrichCustomerForLegalDocs(full); } catch (e) {}
        }
      }
      const raw = p.percentage != null ? p.percentage : p.participationPercentage;
      const pctSienge = raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
      cedentes.push({
        id: id,
        name: (full && full.name) || p.name || p.customerName || ctx.nome || ("Cliente " + id),
        main: !!(p.main === true || p.main === "true" || String(p.main).toLowerCase() === "s"),
        pctSienge: pctSienge,
        participacao: pctSienge != null && pctSienge > 0 ? pctSienge : (people.length <= 1 ? 100 : 0),
        cede: people.length <= 1,
        cederPct: people.length <= 1 ? (pctSienge != null && pctSienge > 0 ? pctSienge : 100) : 0,
        customer: full || { id: id, name: p.name || ctx.nome || "" }
      });
    }
    if (cedentes.length === 1 && !(cedentes[0].participacao > 0)) {
      cedentes[0].participacao = 100;
      cedentes[0].cederPct = 100;
    }
    const faltaPct = cedentes.length > 1 && cedentes.some((c) => !c.main && !(c.pctSienge > 0));
    const condsApi = Array.isArray(contract.paymentConditions) ? contract.paymentConditions : [];
    let condicoes = [];
    let juros = 0;
    let indexador = "REAL";
    if (recente) {
      condicoes = this.condicoesDoContrato(condsApi, installments);
      juros = this.jurosDoContrato(contract, condsApi, installments);
      indexador = this.indiceDoContrato(condsApi, installments);
    }
    if (!condicoes.length) condicoes = [{ id: "c1", tipo: "Mensal", qtde: "", valor: "", vencimento: "" }];
    const situacao = this.situacaoParcelas(installments);
    const empName = typeof window.resolveLoteamentoName === "function" ? window.resolveLoteamentoName(unit, sale) : (ctx.empreendimento || "");
    let preamble = "";
    if (typeof window.getPreambleForContract === "function") preamble = window.getPreambleForContract(unit, sale) || "";
    let empresaNome = "";
    if (typeof window.buildLegalDocVarMap === "function") {
      const mapa = window.buildLegalDocVarMap(customer || {}, sale, unit, { preambleText: preamble, empName: empName });
      empresaNome = mapa.EMPRESA_NOME || mapa.PROMITENTE_VENDEDOR || "";
      if (!preamble) preamble = mapa.PREAMBULO || "";
    }
    Object.assign(CessaoPopupState, {
      customer: customer,
      contract: sale,
      unit: unit,
      unitDetails: unitDetails,
      empName: empName,
      quadraLote: [unit.block, unit.lot].filter(Boolean).join("-") || unitName || "—",
      titulo: billId || "—",
      dataVenda: iso,
      recente: recente,
      preamble: preamble,
      empresaNome: empresaNome,
      cedentes: cedentes,
      faltaPct: faltaPct,
      condicoes: condicoes,
      juros: juros,
      indexador: indexador,
      qtdPagas: situacao.pagas,
      qtdAbertas: situacao.abertas,
      valorParcelaAberta: situacao.valor,
      primeiroVencAberto: situacao.primeiro,
      saldoAberto: situacao.saldo,
      valorPago: situacao.pago
    });
  },

  condicoesDoContrato(conds, installments) {
    const rows = (conds || []).map((c, i) => {
      const qtde = Number(c.installmentsNumber || c.numberOfInstallments || c.quantity || c.installments) || 0;
      const total = Number(c.totalValue || c.totalAmount || c.value) || 0;
      const valor = qtde > 0 && total > 0
        ? total / qtde
        : (Number(c.installmentValue || c.installmentAmount || c.amount) || 0);
      const venc = String(c.firstPayment || c.firstDueDate || c.baseDate || c.dueDate || "").slice(0, 10);
      const tipo = c.conditionTypeName || c.description || c.conditionType || "Mensal";
      if (!(qtde > 0) || !(valor > 0)) return null;
      return {
        id: "c" + i,
        tipo: String(tipo),
        qtde: qtde,
        valor: valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        vencimento: /^\d{4}-\d{2}-\d{2}/.test(venc) ? venc : ""
      };
    }).filter(Boolean);
    if (rows.length) return rows;
    return this.condicoesDasParcelas(installments);
  },

  condicoesDasParcelas(installments) {
    const grupos = new Map();
    (installments || []).forEach((p) => {
      const tipo = p.conditionTypeName || p.conditionType || p.paymentConditionType || "Mensal";
      const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
      const valor = Number(p.originalAmount != null ? p.originalAmount : (p.originalValue != null ? p.originalValue : p.amount)) || 0;
      if (!grupos.has(tipo)) grupos.set(tipo, []);
      grupos.get(tipo).push({ due: due, valor: valor });
    });
    const out = [];
    let i = 0;
    grupos.forEach((itens, tipo) => {
      itens.sort((a, b) => String(a.due).localeCompare(String(b.due)));
      const valores = itens.map((x) => x.valor).filter((v) => v > 0);
      const valor = valores.length ? valores.slice().sort((a, b) => a - b)[Math.floor(valores.length / 2)] : 0;
      if (!(itens.length > 0) || !(valor > 0)) return;
      out.push({
        id: "g" + (i++),
        tipo: String(tipo),
        qtde: itens.length,
        valor: valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        vencimento: itens[0].due || ""
      });
    });
    return out;
  },

  jurosDoContrato(contract, conds, installments) {
    const lista = [contract && contract.interestPercentage].concat((conds || []).map((c) => c && c.interestPercentage));
    for (const v of lista) {
      const n = Number(v);
      if (v != null && v !== "" && Number.isFinite(n)) return n;
    }
    return 0;
  },

  indiceDoContrato(conds, installments) {
    const fontes = (conds || []).concat(installments || []);
    for (const o of fontes) {
      if (!o) continue;
      const nome = o.indexerName || o.indexerDescription || (typeof o.indexer === "string" ? o.indexer : "");
      if (!nome) continue;
      if (/real/i.test(String(nome))) return "REAL";
      return String(nome).trim();
    }
    return "REAL";
  },

  valorRecibos(p) {
    const recs = Array.isArray(p && p.receipts) ? p.receipts : [];
    const direta = Number(p && p.receiptValue);
    if (!recs.length && !(direta > 0)) return null;
    let soma = 0;
    recs.forEach((r) => {
      if (typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(r)) return;
      soma += Number(r.receiptValue || 0);
    });
    if (!recs.length) soma = direta;
    return soma;
  },

  situacaoParcelas(installments) {
    const rel = window.RelacionamentoApp;
    let pagas = 0;
    let abertas = 0;
    let saldo = 0;
    let pago = 0;
    const abertos = [];
    (installments || []).forEach((p) => {
      const paga = rel && typeof rel._installmentSettled === "function" ? rel._installmentSettled(p) : false;
      const valor = Number(p.originalAmount != null ? p.originalAmount : (p.originalValue != null ? p.originalValue : (p.amount || 0))) || 0;
      if (paga) pagas += 1;
      const recibos = this.valorRecibos(p);
      if (recibos != null) pago += recibos;
      else if (paga) pago += valor;
      if (!paga) {
        abertas += 1;
        const atual = Number(p.currentBalance != null ? p.currentBalance : (p.balanceDue != null ? p.balanceDue : valor)) || 0;
        saldo += atual;
        abertos.push({
          due: String(p.dueDate || p.originalDueDate || "").slice(0, 10),
          valor: valor
        });
      }
    });
    abertos.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const valores = abertos.map((x) => x.valor).filter((v) => v > 0);
    const valor = valores.length ? valores.slice().sort((a, b) => a - b)[Math.floor(valores.length / 2)] : 0;
    return {
      pagas: pagas,
      abertas: abertas,
      pago: Math.round(pago * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      valor: Math.round(valor * 100) / 100,
      primeiro: (abertos[0] && abertos[0].due) || ""
    };
  },

  pintar() {
    const ov = document.getElementById("cessao-popup");
    if (!ov) return;
    ov.style.display = "flex";
    const st = CessaoPopupState;
    const sub = document.getElementById("cessao-popup-sub");
    if (sub) {
      sub.textContent = [
        st.titulo ? "Título " + st.titulo : "",
        st.quadraLote && st.quadraLote !== "—" ? "Unidade " + st.quadraLote : "",
        (st.customer && st.customer.name) || (st.ctx && st.ctx.nome) || ""
      ].filter(Boolean).join(" · ");
    }
    const tabs = [
      { id: "cedentes", label: "Cedentes", icon: "users" },
      { id: "condicoes", label: "Condições da compra", icon: "wallet" },
      { id: "cessionario", label: "Cessionário", icon: "user-plus" }
    ];
    const box = document.getElementById("cessao-popup-tabs");
    if (box) {
      box.innerHTML = `<div class="ml-tabs" role="tablist">${tabs.map((t) => {
        const ativa = st.tab === t.id;
        return `<button type="button" role="tab" aria-selected="${ativa}" class="ml-tab ${ativa ? "is-active" : "is-locked"}" ${ativa ? "" : "disabled"} tabindex="-1" title="${ativa ? "Etapa atual" : "Use Avançar para seguir e Voltar para retornar"}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
      }).join("")}</div>`;
    }
    const body = document.getElementById("cessao-popup-body");
    if (body) {
      body.innerHTML = st.loading
        ? `<div style="padding:48px;text-align:center;color:#64748b;"><div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>Carregando o contrato no Sienge…</div>`
        : this.corpoHtml();
    }
    const voltar = document.getElementById("cessao-popup-voltar");
    const prox = document.getElementById("cessao-popup-proximo");
    if (voltar) voltar.style.display = st.tab === "cedentes" ? "none" : "";
    if (prox) {
      prox.innerHTML = st.tab === "cessionario"
        ? (st.gerando ? `<span class="btn-spin"></span> Gerando...` : `<i data-lucide="file-down" style="width:16px;height:16px;"></i> Gerar PDF`)
        : "Avançar";
      prox.disabled = !!st.loading || !!st.gerando;
    }
    const aviso = document.getElementById("cessao-popup-aviso");
    if (aviso) aviso.textContent = st.loading ? "" : (st.tab === "cessionario" ? this.pendenciaPdf() : this.pendenciaAba(st.tab));
    if (window.lucide) lucide.createIcons();
  },

  corpoHtml() {
    if (CessaoPopupState.tab === "condicoes") return this.condicoesHtml();
    if (CessaoPopupState.tab === "cessionario") return this.cessionarioHtml();
    return this.cedentesHtml();
  },

  cedentesHtml() {
    const st = CessaoPopupState;
    const nota = st.faltaPct
      ? `<p class="cessao-pop-nota">Há comprador secundário sem percentual no Sienge. O campo % Sienge fica como veio do cadastro. Informe quanto cada pessoa tem.</p>`
      : `<p class="cessao-pop-nota is-ok">Marque quem cede e quanto do percentual dela passa para o cessionário.</p>`;
    const linhas = (st.cedentes || []).map((row, idx) => `
      <div class="cessao-pop-pessoa">
        <div>
          <strong>${this.esc(row.name)}</strong>
          ${row.main ? '<span class="cessao-badge">Principal</span>' : (st.cedentes.length > 1 ? '<span class="cessao-badge">Secundário</span>' : '')}
          <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">ID ${this.esc(row.id || "—")}</div>
        </div>
        <label>% Sienge
          <input class="form-control" value="${row.pctSienge == null ? "" : this.fmtPct(row.pctSienge)}" disabled>
        </label>
        <label>% desta pessoa
          <input class="form-control" type="number" min="0" max="100" step="0.01" value="${row.participacao}" ${st.faltaPct ? "" : "disabled"}
            oninput="CessaoPopup.setParticipacao(${idx}, this)">
        </label>
        <label style="align-items:center;text-transform:none;font-size:0.82rem;color:#0f172a;">
          <span style="display:flex;align-items:center;gap:6px;height:38px;">
            <input type="checkbox" ${row.cede ? "checked" : ""} onchange="CessaoPopup.setCede(${idx}, this.checked)"> Cede
          </span>
        </label>
        <label>% a ceder
          <input class="form-control" type="number" min="0" max="${row.participacao}" step="0.01" value="${row.cede ? row.cederPct : 0}" ${row.cede ? "" : "disabled"}
            oninput="CessaoPopup.setCeder(${idx}, this)">
        </label>
      </div>`).join("");
    return nota + (linhas || "<p>Nenhum comprador encontrado neste contrato.</p>") +
      `<div style="text-align:right;font-weight:700;color:var(--color-primary);">Total cedido: <span id="cessao-pop-total-cedido">${this.fmtPct(this.totalCedido())}%</span></div>`;
  },

  condicoesHtml() {
    const st = CessaoPopupState;
    const quando = st.dataVenda ? CessaoApp.fmtDate(st.dataVenda) : "sem data de venda";
    const nota = st.recente
      ? `<p class="cessao-pop-nota is-ok">Venda de ${this.esc(quando)}. Ajuste as condições da compra se precisar. Juros, indexador, parcelas e saldo vêm do contrato e não podem ser editados.</p>`
      : `<p class="cessao-pop-nota">Venda de ${this.esc(quando)}, anterior a 2017. Preencha as condições da compra: o Sienge não traz o parcelamento original. Juros, indexador, parcelas e saldo vêm do que o sistema leu e não podem ser editados.</p>`;
    const rows = (st.condicoes || []).map((row) => {
      const total = (Number(row.qtde) || 0) * this.parseValor(row.valor);
      return `<tr>
        <td><input class="form-control" value="${this.esc(row.tipo)}" oninput="CessaoPopup.setCond('${row.id}','tipo',this.value)"></td>
        <td><input class="form-control" type="number" min="1" value="${this.esc(row.qtde)}" oninput="CessaoPopup.setCond('${row.id}','qtde',this.value)"></td>
        <td><input class="form-control" value="${this.esc(row.valor)}" placeholder="0,00" oninput="CessaoPopup.setCond('${row.id}','valor',this.value)"></td>
        <td id="cessao-cond-total-${row.id}" style="font-weight:700;white-space:nowrap;">${this.money(total)}</td>
        <td><input class="form-control" type="date" value="${this.esc(row.vencimento || "")}" onchange="CessaoPopup.setCond('${row.id}','vencimento',this.value)"></td>
        <td><button type="button" class="btn btn-outline btn-sm" onclick="CessaoPopup.removeCond('${row.id}')" title="Remover"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>
      </tr>`;
    }).join("");
    return `${nota}
      <div class="cessao-cond-head">CONDIÇÕES DE PAGAMENTO DA COMPRA</div>
      <div class="cessao-cond-scroll">
        <table class="cessao-cond-table">
          <thead><tr>
            <th>Tipo</th><th>Qtde. parcelas</th><th>Valor da parcela</th><th>Total</th><th>1º vencimento</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <button type="button" class="btn btn-outline" onclick="CessaoPopup.addCond()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Adicionar condição</button>
      <div class="cessao-contrato-dados">
        ${this.campoContrato("Juros ao mês (%)", this.fmtPct(st.juros))}
        ${this.campoContrato("Indexador", st.indexador || "REAL")}
        ${this.campoContrato("Parcelas já pagas", String(st.qtdPagas || 0))}
        ${this.campoContrato("Parcelas a pagar", String(st.qtdAbertas || 0))}
        ${this.campoContrato("Valor da parcela em aberto", this.money(st.valorParcelaAberta), true)}
        ${this.campoContrato("Próximo vencimento", st.primeiroVencAberto ? CessaoApp.fmtDate(st.primeiroVencAberto) : "—", true)}
        ${this.campoContrato("Saldo com o vendedor", this.money(st.saldoAberto), true)}
      </div>
      <p style="margin:0;color:#64748b;font-size:0.78rem;">Juros 0 significa contrato sem juros de parcelamento. Indexador REAL significa parcela sem reajuste anual. As quantidades e o saldo entram nas cláusulas 1.5 e 5.</p>`;
  },

  campoContrato(rotulo, valor, largo) {
    return `<label class="cessao-pop-field${largo ? " is-wide" : ""}">${rotulo}<input class="form-control" value="${this.esc(valor == null || valor === "" ? "—" : valor)}" disabled></label>`;
  },

  opcoesTestemunha(selecionada, outra) {
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const bloqueada = String(outra || "");
    const opts = users.filter((u) => String(u.id) !== bloqueada).map((u) => {
      const id = String(u.id);
      return `<option value="${this.esc(id)}" ${String(selecionada) === id ? "selected" : ""}>${this.esc(u.name || u.nome || u.email || id)}</option>`;
    }).join("");
    return `<option value="">Selecione</option>${opts}`;
  },

  cessionarioHtml() {
    const st = CessaoPopupState;
    const modoRep = st.buscaModo && st.buscaModo.tipo === "representante";
    const alvo = modoRep ? st.cessionarios[st.buscaModo.idx] : null;
    const cards = (st.cessionarios || []).map((row, idx) => this.cardCessionario(row, idx)).join("");
    return `
      <p class="cessao-pop-nota ${modoRep ? "" : "is-ok"}">${modoRep
        ? "Selecione o representante de " + this.esc((alvo && alvo.customer && alvo.customer.name) || "o cessionário") + "."
        : "Busque o cliente no Sienge. Confira estado civil, regime de casamento e cônjuge, e informe o percentual que essa pessoa adquiriu."}</p>
      <div class="cessao-ces-busca">
        <label class="cessao-pop-field">${modoRep ? "Representante" : "Cessionário"}
          <input id="cessao-pop-busca" class="form-control" placeholder="ID, nome ou CPF/CNPJ" value="${this.esc(st.busca)}"
            oninput="CessaoPopup.aoDigitar(this.value)" autocomplete="off">
        </label>
        <div id="cessao-pop-sug" class="cessao-sugestoes" style="display:none;"></div>
      </div>
      ${cards || `<p class="cessao-ces-vazio">Nenhum cessionário selecionado. Total cedido: ${this.fmtPct(this.totalCedido())}%.</p>`}
      <div class="cessao-ces-fechamento">
        <div class="cessao-cond-head">TESTEMUNHAS</div>
        <div class="cessao-ces-fechamento-grid">
          <label class="cessao-pop-field">Testemunha 1
            <select class="form-control" onchange="CessaoPopup.setTxt('testemunha1', this.value)">${this.opcoesTestemunha(st.testemunha1, st.testemunha2)}</select>
          </label>
          <label class="cessao-pop-field">Testemunha 2
            <select class="form-control" onchange="CessaoPopup.setTxt('testemunha2', this.value)">${this.opcoesTestemunha(st.testemunha2, st.testemunha1)}</select>
          </label>
        </div>
      </div>`;
  },

  cardCessionario(row, idx) {
    const c = row.customer || {};
    const pj = this.isPj(c);
    const conj = typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(c) : null;
    const rep = row.representante;
    const civil = c.civilStatus || c.maritalStatus || "";
    const regime = c.matrimonialRegime || (conj && conj.matrimonialRegime) || "";
    const bloco = (titulo, pessoa) => {
      if (!pessoa) return "";
      const doc = this.docDe(pessoa);
      const docTipo = String(pessoa.cnpj || pessoa.cpfCnpj || pessoa.cpf || "").replace(/\D/g, "").length > 11 ? "CNPJ " : "CPF ";
      const rg = typeof window.pickCustomerRg === "function" ? window.pickCustomerRg(pessoa) : (pessoa.rg || "");
      return `<div style="margin-top:8px;">
        <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">${titulo}</div>
        <strong>${this.esc(pessoa.name || "—")}</strong>
        <div style="font-size:0.8rem;color:#334155;margin-top:4px;">
          ${doc ? this.esc(docTipo + doc) : ""}
          ${rg ? " · RG " + this.esc(rg) : ""}
          ${pessoa.profession || pessoa.occupation ? " · " + this.esc(pessoa.profession || pessoa.occupation) : ""}
        </div>
      </div>`;
    };
    return `<div class="cessao-ces-card">
      <div class="cessao-ces-top">
        <div>
          <strong>${this.esc(c.name || "—")}</strong>
          <span class="cessao-badge">${pj ? "Pessoa jurídica" : "Pessoa física"}</span>
          <div class="cessao-ces-id">ID ${this.esc(c.id || row.customerId)}</div>
        </div>
        <div class="cessao-ces-acoes">
          <label class="cessao-pop-field">% adquirido
            <input class="form-control" type="number" min="0" step="0.01" value="${row.pct}" oninput="CessaoPopup.setCessionarioPct(${idx}, this.value)">
          </label>
          <button type="button" class="btn btn-outline btn-sm" onclick="CessaoPopup.pedirRepresentante(${idx})" title="${pj ? "Obrigatório para pessoa jurídica" : "Adicionar representante"}">
            <i data-lucide="user-plus" style="width:14px;height:14px;"></i> ${rep ? "Trocar representante" : "Adicionar representante"}
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="CessaoPopup.removeCessionario(${idx})" title="Remover cessionário"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </div>
      <dl class="cessao-ces-dados">
        <div><dt>Documento</dt><dd>${this.esc(this.docDe(c) || "não informado")}</dd></div>
        <div><dt>Estado civil</dt><dd>${this.esc(civil || "não informado")}</dd></div>
        <div><dt>Regime de casamento</dt><dd>${this.esc(regime || "não informado")}</dd></div>
        <div><dt>Telefone</dt><dd>${this.esc(this.foneDe(c) || "não consta")}</dd></div>
        <div class="is-full"><dt>Endereço</dt><dd>${this.esc(typeof window.formatLegalCustomerAddress === "function" ? (window.formatLegalCustomerAddress(c) || "Endereço não informado") : "Endereço não informado")}</dd></div>
        <div class="is-full"><dt>E-mail</dt><dd>${this.esc(this.emailDe(c) || "não consta")}</dd></div>
      </dl>
      ${bloco("Cônjuge", conj)}
      ${bloco("Representante", rep)}
    </div>`;
  },

  ir(tab) {
    if (tab === "condicoes" && this.pendenciaAba("cedentes")) return;
    if (tab === "cessionario" && (this.pendenciaAba("cedentes") || this.pendenciaAba("condicoes"))) return;
    CessaoPopupState.tab = tab;
    this.pintar();
  },

  voltar() {
    const ordem = ["cedentes", "condicoes", "cessionario"];
    const i = ordem.indexOf(CessaoPopupState.tab);
    if (i > 0) this.ir(ordem[i - 1]);
  },

  proximo() {
    const st = CessaoPopupState;
    if (st.tab === "cessionario") {
      this.gerarPdf();
      return;
    }
    const erro = this.pendenciaAba(st.tab);
    if (erro) {
      const aviso = document.getElementById("cessao-popup-aviso");
      if (aviso) aviso.textContent = erro;
      return;
    }
    this.ir(st.tab === "cedentes" ? "condicoes" : "cessionario");
  },

  setParticipacao(idx, el) {
    const row = CessaoPopupState.cedentes[idx];
    if (!row) return;
    let n = Number(String(el && el.value).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > 100) n = 100;
    row.participacao = Math.round(n * 100) / 100;
    if (row.cederPct > row.participacao) row.cederPct = row.participacao;
    this.atualizarAviso();
  },

  setCede(idx, on) {
    const row = CessaoPopupState.cedentes[idx];
    if (!row) return;
    row.cede = !!on;
    if (row.cede && !(row.cederPct > 0)) row.cederPct = row.participacao;
    if (!row.cede) row.cederPct = 0;
    this.pintar();
  },

  setCeder(idx, el) {
    const row = CessaoPopupState.cedentes[idx];
    if (!row) return;
    let n = Number(String(el && el.value).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > Number(row.participacao)) n = Number(row.participacao);
    row.cederPct = Math.round(n * 100) / 100;
    if (el && String(el.value) !== "" && Number(String(el.value).replace(",", ".")) !== row.cederPct) el.value = row.cederPct;
    this.atualizarAviso();
  },

  atualizarAviso() {
    const aviso = document.getElementById("cessao-popup-aviso");
    if (!aviso || CessaoPopupState.loading) return;
    aviso.textContent = CessaoPopupState.tab === "cessionario" ? this.pendenciaPdf() : this.pendenciaAba(CessaoPopupState.tab);
    const tot = document.getElementById("cessao-pop-total-cedido");
    if (tot) tot.textContent = this.fmtPct(this.totalCedido()) + "%";
  },

  setCond(id, field, value) {
    const row = (CessaoPopupState.condicoes || []).find((c) => c.id === id);
    if (!row) return;
    row[field] = value;
    if (field === "qtde" || field === "valor") {
      const el = document.getElementById("cessao-cond-total-" + id);
      if (el) el.textContent = this.money((Number(row.qtde) || 0) * this.parseValor(row.valor));
    }
    this.atualizarAviso();
  },

  addCond() {
    CessaoPopupState.condicoes.push({ id: "c" + Date.now(), tipo: "Mensal", qtde: "", valor: "", vencimento: "" });
    this.pintar();
  },

  removeCond(id) {
    CessaoPopupState.condicoes = CessaoPopupState.condicoes.filter((c) => c.id !== id);
    if (!CessaoPopupState.condicoes.length) this.addCond();
    else this.pintar();
  },

  setNum(campo, val) {
    const n = Number(String(val).replace(",", "."));
    CessaoPopupState[campo] = Number.isFinite(n) && n >= 0 ? n : 0;
    this.atualizarAviso();
  },

  setMoney(campo, val) {
    CessaoPopupState[campo] = this.parseValor(val);
    this.atualizarAviso();
  },

  setTxt(campo, val) {
    CessaoPopupState[campo] = val;
    if ((campo === "testemunha1" || campo === "testemunha2") && val) {
      const outra = campo === "testemunha1" ? "testemunha2" : "testemunha1";
      if (String(CessaoPopupState[outra]) === String(val)) CessaoPopupState[outra] = "";
      this.pintar();
      return;
    }
    this.atualizarAviso();
  },

  setCessionarioPct(idx, val) {
    const row = CessaoPopupState.cessionarios[idx];
    if (!row) return;
    let n = Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    row.pct = Math.round(n * 100) / 100;
    this.atualizarAviso();
  },

  removeCessionario(idx) {
    CessaoPopupState.cessionarios.splice(idx, 1);
    if (CessaoPopupState.buscaModo.tipo === "representante") CessaoPopupState.buscaModo = { tipo: "cessionario" };
    this.pintar();
  },

  pedirRepresentante(idx) {
    CessaoPopupState.buscaModo = { tipo: "representante", idx: idx };
    CessaoPopupState.busca = "";
    CessaoPopupState.sugestoes = [];
    this.pintar();
    const el = document.getElementById("cessao-pop-busca");
    if (el) el.focus();
  },

  aoDigitar(val) {
    CessaoPopupState.busca = val;
    const termo = String(val || "").trim();
    clearTimeout(this._buscaTimer);
    if (termo.length < 2) {
      this.pintarSugestoes([]);
      return;
    }
    const locais = this.filtrarCache(termo);
    this.pintarSugestoes(locais);
    if (locais.length) return;
    this._buscaTimer = setTimeout(() => this.buscarRemoto(termo), 280);
  },

  filtrarCache(termo) {
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const digits = termo.replace(/\D/g, "");
    const terms = norm(termo).split(/\s+/).filter(Boolean);
    return cache.filter((c) => {
      const doc = String(c.cpf || c.cnpj || c.cpfCnpj || "").replace(/\D/g, "");
      if (digits.length >= 11 && doc === digits) return true;
      if (digits && digits.length <= 8 && String(c.id) === digits) return true;
      const nome = norm(c.name);
      return terms.length > 0 && terms.every((t) => nome.includes(t));
    }).slice(0, 12);
  },

  async buscarRemoto(termo) {
    if (String(CessaoPopupState.busca || "").trim() !== termo) return;
    const svc = window.SiengeApiService;
    if (!svc || typeof svc.searchCustomers !== "function") return;
    let hits = [];
    try { hits = await svc.searchCustomers(termo); } catch (e) { hits = []; }
    if (String(CessaoPopupState.busca || "").trim() !== termo) return;
    this.pintarSugestoes(Array.isArray(hits) ? hits.slice(0, 12) : []);
  },

  pintarSugestoes(hits) {
    const box = document.getElementById("cessao-pop-sug");
    if (!box) return;
    CessaoPopupState.sugestoes = hits || [];
    if (!hits || !hits.length) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "block";
    box.innerHTML = hits.map((c) => {
      const doc = c.cpf || c.cnpj || c.cpfCnpj || "";
      return `<button type="button" class="cessao-sugestao-item" onclick="CessaoPopup.escolher('${String(c.id).replace(/\D/g, "")}')">
        <strong>${this.esc(c.name)}</strong><span>${this.esc(doc || ("ID " + c.id))}</span>
      </button>`;
    }).join("");
  },

  async escolher(id) {
    if (!id) return;
    const modo = CessaoPopupState.buscaModo || { tipo: "cessionario" };
    const svc = window.SiengeApiService;
    let full = (CessaoPopupState.sugestoes || []).find((c) => String(c.id) === String(id)) || { id: id };
    if (svc && typeof svc.getCustomer === "function") {
      try {
        const det = await svc.getCustomer(id);
        if (det) full = det;
      } catch (e) {}
    }
    if (typeof window.enrichCustomerForLegalDocs === "function") {
      try { full = await window.enrichCustomerForLegalDocs(full); } catch (e) {}
    }
    if (modo.tipo === "representante") {
      const row = CessaoPopupState.cessionarios[modo.idx];
      if (row) row.representante = full;
      CessaoPopupState.buscaModo = { tipo: "cessionario" };
    } else {
      if ((CessaoPopupState.cedentes || []).some((c) => String(c.id) === String(id))) {
        alert("Este cliente é cedente do contrato. Escolha outra pessoa.");
        return;
      }
      if ((CessaoPopupState.cessionarios || []).some((c) => String(c.customerId) === String(id))) {
        alert("Cessionário já adicionado.");
        return;
      }
      const rem = Math.max(0, this.totalCedido() - this.totalAdquirido());
      CessaoPopupState.cessionarios.push({
        customerId: String(id),
        customer: full,
        pct: Math.round(rem * 100) / 100,
        representante: null
      });
    }
    CessaoPopupState.busca = "";
    CessaoPopupState.sugestoes = [];
    this.pintar();
  },

  textoCondicoes() {
    const rows = (CessaoPopupState.condicoes || []).filter((r) => Number(r.qtde) > 0 && this.parseValor(r.valor) > 0);
    const total = rows.reduce((s, r) => s + (Number(r.qtde) * this.parseValor(r.valor)), 0);
    const frase = (r) => {
      const q = Number(r.qtde);
      const v = this.parseValor(r.valor);
      const tipo = String(r.tipo || "mensal").toLowerCase();
      const mensal = /mensal|^pm$/.test(tipo);
      const quando = CessaoApp.fmtDate(r.vencimento);
      const valor = this.money(v) + " (" + this.extensoValor(v) + ")";
      if (q === 1) return "1 parcela no valor de " + valor + ", com vencimento no dia " + quando;
      return q + " parcelas " + (mensal ? "mensais" : tipo) + " no valor de " + valor + " cada, com primeiro vencimento no dia " + quando + (mensal ? " e demais nos meses subsequentes" : "");
    };
    const miolo = rows.length <= 1 ? frase(rows[0] || { qtde: 0, valor: 0, vencimento: "" }) : rows.map((r, i) => String.fromCharCode(97 + i) + ") " + frase(r)).join("; ");
    return "a quantia total de " + this.money(total) + " (" + this.extensoValor(total) + "), mediante pagamento de " + miolo;
  },

  clausulaReajuste() {
    const nome = String(CessaoPopupState.indexador || "REAL").trim();
    if (!nome || /^real$/i.test(nome)) return "1.2. Referidas parcelas não possuem reajuste anual.";
    return "1.2. Referidas parcelas contam com reajuste anual pelo " + nome + " na data de aniversário do contrato.";
  },

  clausulaJuros() {
    const juros = Number(CessaoPopupState.juros) || 0;
    const saldo = Number(CessaoPopupState.saldoAberto) || 0;
    if (juros <= 0.000001) return "1.3. O contrato não possui juros de parcelamento.";
    if (saldo <= 0.009) return "1.3. O contrato está quitado.";
    return "1.3. O contrato possui juros de parcelamento de " + this.fmtPct(juros) + "% ao mês.";
  },

  clausulaPagas() {
    const pagas = Math.round(Number(CessaoPopupState.qtdPagas) || 0);
    const abertas = Math.round(Number(CessaoPopupState.qtdAbertas) || 0);
    if (abertas === 0) {
      return "1.5. Até a presente data, o(s) CEDENTE(S) efetuou(aram) o pagamento de " + pagas + " (" + this.extensoQtd(pagas) + ") prestações, estando o contrato integralmente pago.";
    }
    if (pagas === 0) {
      return "1.5. Até a presente data, o(s) CEDENTE(S) não efetuou(aram) o pagamento de nenhuma prestação, estando em dia com o pagamento do parcelamento do imóvel.";
    }
    if (pagas === 1) {
      return "1.5. Até a presente data, o(s) CEDENTE(S) efetuou(aram) o pagamento de 1 prestação, estando em dia com o pagamento do parcelamento do imóvel.";
    }
    return "1.5. Até a presente data, o(s) CEDENTE(S) efetuou(aram) o pagamento de " + pagas + " (" + this.extensoQtd(pagas) + ") prestações, estando em dia com o pagamento do parcelamento do imóvel.";
  },

  qualificacao(c, comEndereco, semCivil) {
    if (!c) return "";
    const nome = String(c.name || "").trim().toUpperCase();
    if (this.isPj(c)) {
      const doc = this.docDe(c);
      const end = typeof window.formatLegalCustomerAddress === "function" ? window.formatLegalCustomerAddress(c) : "";
      return nome + ", inscrita no CNPJ sob o nº " + (doc || "____") + (end ? ", com endereço na " + end : "");
    }
    const limpo = (v) => String(v || "").replace(/^[\s,.;]+|[\s,.;]+$/g, "").trim();
    const nac = typeof window.formatLegalNationality === "function" ? window.formatLegalNationality(c.nationality) : "brasileiro(a)";
    const prof = typeof window.formatLegalProfession === "function" ? window.formatLegalProfession(c.profession || c.occupation) : this.inclusive(c.profession || "");
    const civil = semCivil ? "" : this.inclusive(c.civilStatus || c.maritalStatus || "");
    const rg = typeof window.pickCustomerRg === "function" ? window.pickCustomerRg(c) : "";
    const doc = this.docDe(c);
    const partes = [nome, limpo(nac), limpo(prof), limpo(civil)].filter(Boolean);
    let txt = partes.join(", ");
    if (rg) txt += ", portador(a) da Cédula de Identidade RG Nº " + rg;
    if (doc) txt += ", inscrito(a) no CPF-MF sob o Nº " + doc;
    if (comEndereco) {
      const end = typeof window.formatLegalCustomerAddress === "function" ? window.formatLegalCustomerAddress(c) : "";
      if (end) txt += ", residente(s) e domiciliado(s) na " + end;
    }
    return txt;
  },

  blocoPessoas(lista, rotulo) {
    const frases = lista.map((item) => {
      const c = item.customer;
      const conj = !this.isPj(c) && typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(c) : null;
      let txt = this.qualificacao(c, !conj, !!conj);
      if (conj) {
        const regime = c.matrimonialRegime || conj.matrimonialRegime || "";
        txt += " e " + this.qualificacao(conj, false, true);
        txt += ", " + this.inclusive(c.civilStatus || c.maritalStatus || "casado");
        if (regime) txt += " - regime " + String(regime).toLowerCase();
        const end = (typeof window.formatLegalCustomerAddress === "function" && (window.formatLegalCustomerAddress(c) || window.formatLegalCustomerAddress(conj))) || "";
        if (end) txt += ", residente(s) e domiciliado(s) na " + end;
      }
      if (item.representante) {
        txt += ", neste ato representada por " + this.qualificacao(item.representante, true);
      }
      return txt;
    });
    const junto = frases.length <= 1 ? frases[0] : frases.slice(0, -1).join("; ") + "; e " + frases[frases.length - 1];
    if (rotulo === false) return junto;
    return junto + ", de ora em diante " + rotulo;
  },

  clausulaSaldo() {
    const qtd = Math.round(Number(CessaoPopupState.qtdAbertas) || 0);
    const saldo = Number(CessaoPopupState.saldoAberto) || 0;
    if (qtd <= 0 || saldo <= 0.009) {
      return "5. O(s) CESSIONÁRIO(S) não possuem saldo em aberto junto ao(s) PROMITENTE(S) VENDEDOR(ES), estando o contrato integralmente pago.";
    }
    const valor = Number(CessaoPopupState.valorParcelaAberta) || (qtd ? saldo / qtd : 0);
    const quando = CessaoApp.fmtDate(CessaoPopupState.primeiroVencAberto);
    return "5. Que o(s) CESSIONÁRIO(S) obrigam-se ao pagamento total da dívida junto ao(s) PROMITENTE(S) VENDEDOR(ES), no valor de " +
      this.money(saldo) + " (" + this.extensoValor(saldo) + "), sendo " + qtd + " (" + this.extensoQtd(qtd) + ") parcelas mensais no valor de " +
      this.money(valor) + " (" + this.extensoValor(valor) + ") com primeiro vencimento em " + quando +
      "; serão pagas através de boletos bancários em nome do CESSIONÁRIO junto ao(s) PROMITENTE(S) VENDEDOR(ES).";
  },

  clausulaContato() {
    const principal = (CessaoPopupState.cessionarios || [])[0];
    const c = (principal && principal.customer) || {};
    const fone = this.foneDe(c);
    const email = this.emailDe(c) || "* não consta *";
    const tel = fone ? fone : "* não consta *";
    return "11. O(s) CESSIONÁRIO(s) expressamente concorda(m) que eventuais notificações e comunicados sejam encaminhados ao(s) mesmo(s), não só em seu endereço físico, como também pelos endereços eletrônicos a seguir elencados: Telefone " +
      tel + "; e-mail " + email + ", reconhecendo como válida as notificações encaminhadas nestes meios.";
  },

  assinaturaHtml() {
    const st = CessaoPopupState;
    const linha = (nomes, papel) => `<div style="margin-top:12px;text-align:center;white-space:normal;"><div style="width:260px;margin:0 auto 2px;border-top:1px solid #111;"></div><strong>${nomes}</strong><br>${papel}</div>`;
    const ced = (st.cedentes || []).filter((c) => c.cede && Number(c.cederPct) > 0).map((c) => String(c.name || "").toUpperCase());
    const ces = [];
    (st.cessionarios || []).forEach((row) => {
      if (row.customer) ces.push(String(row.customer.name || "").toUpperCase());
      const conj = row.customer && typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(row.customer) : null;
      if (conj && conj.name) ces.push(String(conj.name).toUpperCase());
      if (row.representante && row.representante.name) ces.push(String(row.representante.name).toUpperCase());
    });
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const w = (id) => users.find((u) => String(u.id) === String(id)) || {};
    const w1 = w(st.testemunha1);
    const w2 = w(st.testemunha2);
    const rg = (u) => u.doc_rg || u.rg || "________________";
    const nome = (u) => u.name || u.nome || "________________";
    const data = this.dataHoje();
    const testemunha = (u) => `<div style="text-align:center;white-space:normal;min-width:200px;">Nome: ${this.esc(nome(u))}<br>RG: ${this.esc(rg(u))}</div>`;
    return `<div style="font-family:'Times New Roman',serif;white-space:normal;line-height:1.25;">` +
      `<p style="text-align:justify;margin:0;">${this.htmlTexto("E assim, por estarem justas e contratadas, assinam o presente em 03 (três) vias de igual teor, na presença das testemunhas abaixo.")}</p>` +
      `<p style="text-align:center;margin:12px 0 0;">Botucatu, ${this.esc(data)}</p>` +
      linha(this.esc(ced.join(" ")), "Cedente(s)") +
      linha(this.esc(ces.join(" ")), "Cessionário(s)") +
      linha(this.esc(String(st.empresaNome || "ANUENTE").toUpperCase()), "Anuente(s)") +
      `<div style="margin-top:14px;text-align:center;white-space:normal;">` +
      `<div style="font-weight:bold;">Testemunhas</div>` +
      `<div style="display:flex;justify-content:center;gap:48px;margin-top:8px;">${testemunha(w1)}${testemunha(w2)}</div>` +
      `</div></div>`;
  },

  /** Cada palavra vira um bloco: o gerador de PDF apagava o espaço no texto justificado. */
  htmlTexto(s) {
    return String(s || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
      .map((w) => `<span style="display:inline-block;margin-right:4px">${this.esc(w)}</span>`).join("");
  },

  dataHoje() {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const agora = new Date();
    return agora.getDate() + " de " + meses[agora.getMonth()] + " de " + agora.getFullYear();
  },

  /** 17701, 17702 e 17703 compartilham o tipo e o nome da associação. */
  loteamentoFechado(ccId) {
    let custom = {};
    try { custom = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}"); } catch (e) { custom = {}; }
    if (window.CentrosCustoState && CentrosCustoState.customFields) {
      custom = Object.assign({}, custom, CentrosCustoState.customFields);
    }
    const dig = String(ccId || "").replace(/\D/g, "");
    const obra = dig.length > 2 ? dig.slice(0, -2) : dig;
    let fechado = false;
    let nome = "";
    Object.keys(custom || {}).forEach((key) => {
      const id = String(key).replace(/\D/g, "");
      if (!obra || id.slice(0, -2) !== obra) return;
      const c = custom[key] || {};
      if (String(c.tipo_cc || "") === "Loteamento Fechado") fechado = true;
      if (!nome && String(c.associacao_nome || "").trim()) nome = String(c.associacao_nome).trim();
    });
    const atual = custom[ccId] || custom[String(ccId)] || custom[dig] || {};
    if (String(atual.tipo_cc || "") === "Loteamento Fechado") fechado = true;
    if (!nome && String(atual.associacao_nome || "").trim()) nome = String(atual.associacao_nome).trim();
    return { fechado: fechado, nome: nome };
  },

  paginasAdesao(rel, info) {
    const st = CessaoPopupState;
    const ces = st.cessionarios || [];
    const cedentes = (st.cedentes || []).filter((c) => c.cede && Number(c.cederPct) > 0);
    const principal = (ces[0] && ces[0].customer) || {};
    const nomesCed = cedentes.map((c) => String(c.name || "").trim().toUpperCase()).filter(Boolean).join(" e ");
    const empresa = String(st.empresaNome || "ANUENTE").toUpperCase();
    const lote = st.quadraLote && st.quadraLote !== "—" ? st.quadraLote : "____";
    const emp = st.empName || "____";
    const assoc = info.nomeAssoc;
    const intro = this.blocoPessoas(ces, false) + ", na qualidade de COMPRADOR(A) da unidade " + lote + ", do Loteamento " + emp + ", DECLARA(AM), para todos os fins de direito, que:";
    const itens = [
      "(i) nesta data, firmei Instrumento Particular de Cessão de Direitos do Lote supracitado com o(a) comprador(a) " + nomesCed + ", com a anuência de " + empresa + ", tendo ainda rubricado seus respectivos anexos;",
      "(ii) tenho ciência que, sobre o Loteamento foi instituído o Regulamento Interno, o qual é parte integrante e indissociável do Compromisso, que depende de administração e fiscalização para o respectivo cumprimento;",
      "(iii) para exercer a administração do Loteamento, dos equipamentos urbanos e, ainda, para fiscalização do cumprimento do Regulamento Interno do Loteamento, foi constituída a " + assoc + ", a quem incumbirá tais obrigações, sem interesse econômico;",
      "(iv) estou ciente e concordo com o pagamento das taxas devidas à Associação na forma prevista no seu Estatuto Social, taxas estas que podem ser alteradas nos termos previstos no Estatuto Social, visando custear as despesas de manutenção, vigilância e demais atividades necessárias ao bom funcionamento do Loteamento;",
      "(v) o(a) CESSIONÁRIO(A), neste ato, ASSOCIA-SE à " + assoc + ", assim permanecendo enquanto titular de direitos de Lote, cumprindo fielmente todas as obrigações e regras aplicáveis ao Loteamento, em especial as constantes do Estatuto Social da Associação;",
      "(vi) A representação junto à Associação, será feita por:"
    ];
    const ficha = this.fichaRepresentante(principal);
    const nomesCes = [];
    ces.forEach((row) => {
      if (row.customer && row.customer.name) nomesCes.push(String(row.customer.name).toUpperCase());
      const conj = row.customer && typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(row.customer) : null;
      if (conj && conj.name) nomesCes.push(String(conj.name).toUpperCase());
    });
    const blocos = [this.htmlTexto(intro)].concat(itens.map((t) => this.htmlTexto(t)));
    blocos.push(ficha);
    blocos.push(`<div style="font-family:'Times New Roman',serif;text-align:center;margin-top:22px;">
      <p>Botucatu, ${this.esc(this.dataHoje())}</p>
      <div style="margin-top:28px;">__________________________________________________________________<br><strong>${this.esc(nomesCes.join(" "))}</strong></div>
    </div>`);
    const topo = `<div style="font-family:'Times New Roman',serif;font-size:11pt;color:#111;margin:0 0 24px;">${this.esc(info.cod || "")} - Quadra-Lote: ${this.esc(lote)}<br>Título ${this.esc(info.titulo || "")}</div>
      <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.02em;margin:0 0 22px;font-family:'Times New Roman',serif;">TERMO DE INSCRIÇÃO E ADESÃO À ${this.esc(String(assoc).toUpperCase())}</h2>`;
    const corpoCss = "font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;text-align:justify;white-space:pre-wrap;color:#111;";
    return rel._paginarDoc(topo, blocos, corpoCss);
  },

  fichaRepresentante(c) {
    const nome = String((c && c.name) || "").trim().toUpperCase();
    const rg = (typeof window.pickCustomerRg === "function" ? window.pickCustomerRg(c) : "") || "________________";
    const orgao = String((c && (c.issuingBody || c.identityIssuingBody || c.issuingAuthority)) || "").trim() || "—";
    const doc = this.docDe(c) || "________________";
    const nac = typeof window.formatLegalNationality === "function" ? window.formatLegalNationality(c && c.nationality) : "brasileiro(a)";
    const civil = [this.inclusive((c && (c.civilStatus || c.maritalStatus)) || ""), (c && c.matrimonialRegime) ? "regime " + String(c.matrimonialRegime).toLowerCase() : ""]
      .filter(Boolean).join(" - ") || "—";
    const end = typeof window.formatLegalCustomerAddress === "function" ? window.formatLegalCustomerAddress(c) : "";
    const linhas = [
      "Nome: " + nome,
      "RG: " + rg + "   Orgão Emissor: " + orgao,
      "CPF: " + doc + "   Nacionalidade: " + nac.charAt(0).toUpperCase() + nac.slice(1),
      "Estado Civil: " + civil,
      "E-mail: " + (this.emailDe(c) || "—") + "   Telefone: " + (this.foneDe(c) || "—"),
      "Endereço Residencial",
      String(end || "—").toUpperCase()
    ];
    return `<div style="font-family:'Times New Roman',serif;line-height:1.55;margin-top:8px;">${linhas.map((l) => `<div>${this.htmlTexto(l)}</div>`).join("")}</div>`;
  },

  async baixarJunto(rel, pdfA, pdfB, fileName) {
    const { PDFDocument } = await rel._carregarPdfLib();
    const out = await PDFDocument.load(pdfA.output("arraybuffer"));
    const extra = await PDFDocument.load(pdfB.output("arraybuffer"));
    const pages = await out.copyPages(extra, extra.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "cessao.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },

  async gerarPdf() {
    const erro = this.pendenciaPdf();
    if (erro) {
      alert(erro);
      return;
    }
    const rel = window.RelacionamentoApp;
    if (!rel || typeof rel._baixarPaginasPdf !== "function" || typeof rel._paginarDoc !== "function") {
      alert("O gerador de PDF dos documentos não está disponível.");
      return;
    }
    const st = CessaoPopupState;
    if (!st.preamble || /NÃO CADASTRADO/i.test(String(st.preamble))) {
      alert("Preâmbulo não cadastrado para o centro de custo deste contrato. Cadastre-o antes de gerar a cessão.");
      return;
    }
    CessaoPopupState.gerando = true;
    this.pintar();
    try {
      const ud = st.unitDetails || {};
      const matriculaRaw = ud.legalRegistrationNumber || ud.legalregistrationnumber || "";
      const matriculaNum = String(matriculaRaw || "").replace(/\D/g, "");
      const matricula = matriculaNum ? Number(matriculaNum).toLocaleString("pt-BR") : (matriculaRaw || "____");
      const areaNum = typeof window.parseAreaNumber === "function"
        ? window.parseAreaNumber(ud.privateArea || ud.Privatearea || ud.terrainArea)
        : Number(ud.privateArea || 0);
      const areaTxt = areaNum
        ? areaNum.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " (" + this.extensoQtd(Math.round(areaNum)) + " metros quadrados)"
        : "____";
      const lote = st.quadraLote && st.quadraLote !== "—" ? st.quadraLote : "____";
      const emp = st.empName || "____";
      const data = st.dataVenda ? CessaoApp.fmtDate(st.dataVenda) : "____";
      const pct = this.totalCedido();
      const pctTxt = Math.abs(pct - Math.round(pct)) < 0.001 ? String(Math.round(pct)) : this.fmtPct(pct);
      const preco = Number(st.valorPago) || 0;
      const cedentes = (st.cedentes || []).filter((c) => c.cede && Number(c.cederPct) > 0);
      const ces = st.cessionarios || [];
      const paragrafos = [
        "Por este instrumento particular de cessão de direitos sobre imóveis, de um lado " + this.blocoPessoas(cedentes.map((c) => ({ customer: c.customer, representante: null })), "chamado(s) simplesmente CEDENTE(S)."),
        "De outro lado, " + this.blocoPessoas(ces, "denominado(s) simplesmente CESSIONÁRIO(S), têm entre si como justo e contratado o que segue:"),
        "1. Por força de contrato de promessa de compra e venda, firmado em " + data + ", o(s) CEDENTE(S) tornou-se (tornaram-se) titular(es) dos direitos aquisitivos do imóvel Lote-Quadra " + lote + ", do loteamento " + emp + ", matrícula nº " + matricula + ", com " + areaTxt + "; livre e desembaraçado de todos e quaisquer ônus com o PROMITENTE(S) VENDEDOR(ES) " + String(st.preamble).trim().replace(/[.;,\s]+$/, "") + ". De ora em diante denominado(s) ANUENTE(S).",
        "1.1. Para pagamento do contrato em comento, o(s) CEDENTE(S) aceitou(aram) o pagamento da " + this.textoCondicoes() + ".",
        this.clausulaReajuste(),
        this.clausulaJuros(),
        "1.4. No caso de inadimplemento no pagamento de qualquer parcela, incidem juros de 1% ao mês e multa moratória de 2%, além da correção monetária.",
        this.clausulaPagas(),
        "2. Pelo presente instrumento, o(s) CEDENTE(S) cede(m) e transfere(m) ao(s) CESSIONÁRIO(S) os seus direitos e obrigações para adquirir(em) referido imóvel, pelo preço estipulado na cláusula 4.",
        "3. O ora CESSIONÁRIO(S) sub-roga-se em todas as cláusulas e condições daquele compromisso, obrigando-se a cumprir fielmente as estipulações contratuais nele avençadas.",
        "4. O preço certo e ajustado para a presente cessão é de " + this.money(preco) + " (" + this.extensoValor(preco) + "), pago pelo(s) CESSIONÁRIO(S) neste ato, do qual o(s) CEDENTE(S) outorga(m) a mais geral e irrevogável quitação.",
        this.clausulaSaldo(),
        "5.1. Em caso de atraso no pagamento de qualquer parcela acarretará ao(s) CESSIONÁRIO(S) as sanções descritas no contrato acerca do inadimplemento, notadamente a atualização do valor, juros de mora, multa, honorários advocatícios e a inclusão no cadastro de inadimplentes (SCPC/SERASA), além de todas as outras cominações consignadas, nas formas estabelecidas no contrato particular de compromisso de compra e venda.",
        "6. Todos os impostos e taxas que incidam ou venham a incidir sobre o imóvel, a partir da presente data, correrão por conta exclusiva do(s) CESSIONÁRIO(S), sendo que o(s) CEDENTE(S) apresenta(m) nesta ocasião a certidão negativa de débitos.",
        "7. O presente instrumento é feito em caráter irrevogável e irretratável, obrigando não só as partes contratantes como também seus herdeiros e sucessores.",
        "8. O(s) CESSIONÁRIO(S) arcará(ão) com o pagamento de todas as despesas necessárias para a efetivação desta cessão, inclusive tributos que onerem ou venham onerar a presente transação.",
        "9. O(s) ANUENTE(S) declara(m) nada ter a opor à presente cessão, desobrigando assim o(s) CEDENTE(S) de quaisquer responsabilidades e obrigações decorrentes do compromisso celebrado, as quais, por força deste contrato, passam a constituir único e exclusivo encargo do(s) CESSIONÁRIO(S).",
        "10. O(s) CESSIONÁRIO(S) declara(m) e confessa(m) ter plena ciência do contrato original firmado entre o(s) CEDENTE(S) e o(s) ANUENTE(S), ratificando todos seus termos nesta ocasião, sendo que o mesmo segue encartado à presente cessão como anexo.",
        this.clausulaContato(),
        "11.1. O(s) CESSIONÁRIO(S) se obriga(m) a comunicar imediatamente, por escrito, o(s) ANUENTE(S), qualquer eventual mudança de seu endereço e domicílio, sob pena de não o fazendo, considerarem-se regularmente recebidos os avisos e comunicações enviados para o último endereço comunicado. Nesta hipótese, nenhuma responsabilidade poderá ser imputada ao(s) PROMITENTE(S) VENDEDOR(ES), pelas consequências do desconhecimento de tais avisos e comunicações.",
        "12. A escritura definitiva será outorgada diretamente ao(s) CESSIONÁRIO(S), a que tudo se dará por firme e valioso, em conformidade e mantendo-se os termos contratuais, uma vez estando integralizados os pagamentos das prestações aqui convencionadas, além de cumpridas todas as demais cláusulas e condições do contrato de compromisso de venda e compra.",
        "13. A presente cessão é assinada nos termos da lei 6.766/79 com as alterações dadas pela lei nº 13.786/2018 (lei do distrato), cuja aplicação concordam as partes.",
        "14. As partes elegem o foro da Comarca de Botucatu-SP para dirimir eventuais litígios decorrentes do presente."
      ];
      const blocos = paragrafos.map((p) => this.htmlTexto(p));
      blocos.push(this.assinaturaHtml());
      const cod = st.unit.costCenterId || st.contract.enterpriseId || "";
      const unidade = [cod, st.quadraLote].filter((x) => x && x !== "—").join(" - ");
      const titulo = st.titulo || "____";
      const topo = `<div style="font-family:'Times New Roman',serif;font-size:11pt;color:#111;margin:0 0 24px;">Título: ${this.esc(titulo)} | Unidade: ${this.esc(unidade || "____")}</div>
        <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.02em;margin:0 0 22px;font-family:'Times New Roman',serif;">CESSÃO DE DIREITOS ${this.esc(pctTxt)}% SOBRE INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA DE TERRENO URBANO</h2>`;
      const corpoCss = "font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;text-align:justify;white-space:pre-wrap;color:#111;";
      const paginas = rel._paginarDoc(topo, blocos, corpoCss);
      const nome = (ces[0] && ces[0].customer && ces[0].customer.name) || "";
      const fileName = typeof window.buildFichaPdfFilename === "function"
        ? window.buildFichaPdfFilename("Cessão de direitos", { contrato: unidade, costCenterId: cod, titulo: titulo, nome: nome })
        : "Cessão de direitos | Título " + titulo + ".pdf";
      const pdfCessao = await rel._baixarPaginasPdf(paginas, fileName, { retornar: true });
      const assoc = this.loteamentoFechado(cod);
      if (assoc.fechado && assoc.nome) {
        const adesao = this.paginasAdesao(rel, { cod, unidade, titulo, pctTxt, nomeAssoc: assoc.nome });
        const pdfAdesao = await rel._baixarPaginasPdf(adesao, fileName, { retornar: true });
        await this.baixarJunto(rel, pdfCessao, pdfAdesao, fileName);
      } else {
        if (assoc.fechado) {
          alert("Este loteamento é fechado e ainda não tem o nome da associação no centro de custo. A cessão foi gerada sem o termo de adesão.");
        }
        pdfCessao.save(fileName);
      }
      this.fechar();
    } catch (e) {
      console.error("[Cessão] PDF", e);
      alert("Não foi possível gerar o PDF da cessão.");
    } finally {
      CessaoPopupState.gerando = false;
      const ov = document.getElementById("cessao-popup");
      if (ov && ov.style.display === "flex") this.pintar();
    }
  }
};

CessaoApp.abrirPopup = function (ctx) { return CessaoPopup.abrir(ctx); };
window.CessaoPopup = CessaoPopup;

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'relacionamento_cessao') {
    CessaoApp.init();
  }
});
