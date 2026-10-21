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
  enviandoClick: false,
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

  jurosConsiderado(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const quatro = Number(v.toFixed(4));
    if (quatro <= 0.0001) return 0;
    return quatro;
  },

  fmtJuros(n) {
    const seguro = this.jurosConsiderado(n);
    return seguro.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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
    return e && e !== "N/D" && e !== "undefined" ? String(e).trim() : "";
  },

  cessionariosSemEmail() {
    return (CessaoPopupState.cessionarios || []).filter((row) => !this.emailDe(row && row.customer));
  },

  pendenciaEmailCessionarios() {
    const sem = this.cessionariosSemEmail();
    if (!sem.length) return "";
    const nomes = sem.map((row) => (row.customer && row.customer.name) || "cessionário").join(", ");
    const quem = sem.length === 1
      ? "O cessionário " + nomes + " não tem e-mail."
      : "Estes cessionários não têm e-mail: " + nomes + ".";
    return quem + " Os boletos são enviados por e-mail, então o e-mail é obrigatório. Atualize o cadastro do cliente antes de gerar a cessão.";
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
    if (tab === "cessionario") {
      if (!(st.cessionarios || []).length) return "Escolha o cessionário.";
      if (Math.abs(this.totalCedido() - this.totalAdquirido()) > 0.05) return "O percentual adquirido precisa fechar com o percentual cedido.";
      const semRep = (st.cessionarios || []).find((c) => this.isPj(c.customer) && !c.representante);
      if (semRep) return "Pessoa jurídica precisa de representante: " + (semRep.customer.name || "cessionário") + ".";
      const semEmail = this.pendenciaEmailCessionarios();
      if (semEmail) return semEmail;
      return "";
    }
    if (tab === "testemunhas") {
      if (!st.testemunha1 || !st.testemunha2) return "Escolha as duas testemunhas.";
      if (String(st.testemunha1) === String(st.testemunha2)) return "As testemunhas precisam ser pessoas diferentes.";
      return "";
    }
    if (tab === "taxa") return "";
    return "";
  },

  pendenciaPdf() {
    const aba = this.pendenciaAba("cedentes") || this.pendenciaAba("condicoes") || this.pendenciaAba("cessionario") || this.pendenciaAba("testemunhas");
    if (aba) return aba;
    if (!(Number(CessaoPopupState.valorPago) > 0)) return "Não encontrei o líquido recebido deste título para a cláusula 4.";
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
      enviandoClick: false,
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
      testemunha2: "",
      taxaTitulo: "",
      taxaStatus: "",
      taxaMsg: "",
      cesAberto: -1
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
          <button type="button" class="btn btn-fechar" onclick="CessaoPopup.fechar()">Fechar</button>
        </header>
        <div id="cessao-popup-tabs"></div>
        <div class="cessao-popup-body" id="cessao-popup-body"></div>
        <footer>
          <span class="cessao-pop-aviso" id="cessao-popup-aviso"></span>
          <button type="button" class="btn btn-cancel" onclick="CessaoPopup.fechar()">Cancelar</button>
          <button type="button" class="btn btn-outline" id="cessao-popup-voltar" onclick="CessaoPopup.voltar()">Voltar</button>
          <button type="button" class="btn btn-outline" id="cessao-popup-clicksign" onclick="CessaoPopup.enviarClickSign()" style="display:none;">Enviar para ClickSign</button>
          <button type="button" class="btn btn-primary" id="cessao-popup-proximo" onclick="CessaoPopup.proximo()"></button>
        </footer>
      </div>`;
    document.body.appendChild(ov);
    if (!document.getElementById("cessao-click-ordem")) {
      const ordem = document.createElement("div");
      ordem.id = "cessao-click-ordem";
      ordem.innerHTML = `
        <div class="cessao-ordem-panel" role="dialog" aria-modal="true" aria-labelledby="cessao-ordem-titulo">
          <h3 id="cessao-ordem-titulo">Ordem de assinatura</h3>
          <div id="cessao-ordem-lista"></div>
          <label class="cessao-ordem-data" for="cessao-click-prazo">Data limite para assinar
            <input type="date" id="cessao-click-prazo">
          </label>
          <p id="cessao-ordem-max" class="cessao-ordem-max"></p>
          <p id="cessao-ordem-erro" class="cessao-ordem-erro"></p>
          <p class="cessao-ordem-nota">O envelope fica em rascunho. Nenhum e-mail de assinatura é enviado.</p>
          <div class="cessao-ordem-acoes">
            <button type="button" class="btn btn-cancel" onclick="CessaoPopup.fecharOrdemClick()">Cancelar</button>
            <button type="button" class="btn btn-primary" id="cessao-ordem-ok" onclick="CessaoPopup.confirmarEnvioClick()">Criar rascunho</button>
          </div>
        </div>`;
      document.body.appendChild(ordem);
    }
  },

  fechar() {
    const ov = document.getElementById("cessao-popup");
    if (ov) ov.style.display = "none";
    this.fecharOrdemClick();
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
    const installments = await this.parcelasCompletas(billId);
    const billFin = await this.billFinanceiro(ctx.customerId, billId);
    const liquidoRecebido = this.liquidoDe(billFin);
    const instFin = billFin && Array.isArray(billFin.installments) && billFin.installments.length
      ? billFin.installments
      : [].concat((billFin && billFin.paidInstallments) || [], (billFin && billFin.dueInstallments) || []);
    const extrato = instFin.length ? [] : await this.parcelasDoExtrato(billId);
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
      const row = {
        id: id,
        name: (full && full.name) || p.name || p.customerName || ctx.nome || ("Cliente " + id),
        main: !!(p.main === true || p.main === "true" || String(p.main).toLowerCase() === "s"),
        pctSienge: pctSienge,
        participacao: pctSienge != null && pctSienge > 0 ? pctSienge : (people.length <= 1 ? 100 : 0),
        cede: people.length <= 1,
        cederPct: people.length <= 1 ? (pctSienge != null && pctSienge > 0 ? pctSienge : 100) : 0,
        customer: full || { id: id, name: p.name || ctx.nome || "" }
      };
      const ja = id && cedentes.find((c) => String(c.id) === id);
      if (ja) {
        if ((row.participacao || 0) > (ja.participacao || 0)) {
          ja.participacao = row.participacao;
          ja.pctSienge = row.pctSienge;
          ja.cederPct = row.cederPct;
        }
        if (row.main) ja.main = true;
        if (row.customer && row.customer.name && (!ja.customer || !ja.customer.name)) ja.customer = row.customer;
        continue;
      }
      cedentes.push(row);
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
      condicoes = this.condicoesDoContrato(condsApi, installments, contract);
      const daTela = (window.AppState && window.AppState.currentContractInstallments) || [];
      juros = this.jurosDoContrato(contract, condsApi, []
        .concat(installments || [])
        .concat(instFin || [])
        .concat(extrato || [])
        .concat(daTela));
      indexador = this.indiceDoContrato(condsApi, installments);
    }
    if (!condicoes.length) condicoes = [{ id: "c1", tipo: "Mensal", qtde: "", valor: "", vencimento: "" }];
    condicoes.sort((a, b) => this.cmpVencimento(a, b));
    const situacao = this.situacaoParcelas(instFin.length ? instFin : (extrato.length ? extrato : installments));
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
      qtdAVencer: situacao.aVencer,
      valorParcelaAberta: situacao.valor,
      primeiroVencAberto: situacao.primeiro,
      saldoAberto: situacao.saldo,
      valorPresente: situacao.valorPresente,
      saldoVencer: situacao.saldoVencer,
      parcelasVencer: situacao.parcelasVencer,
      valorPago: liquidoRecebido > 0 ? liquidoRecebido : situacao.pago
    });
  },

  /** totalValue do Sienge é o valor presente. Com juros, a parcela do contrato é a prestação da Tabela Price. */
  valorNominalCondicao(c, qtde, total, contract) {
    const fatia = qtde > 0 && total > 0 ? Math.round((total / qtde) * 100) / 100 : 0;
    const explicito = Number(c.installmentValue || c.installmentAmount || c.installmentBaseValue) || 0;
    if (explicito > 0.009 && explicito + 0.02 < total && explicito > fatia + 0.05) return explicito;
    const tipo = String(c.interestType || "").trim().toUpperCase();
    const semPrice = tipo === "S" || tipo === "N";
    let juros = this.taxaMensalPct(c.interestPercentage);
    if (juros == null && contract) juros = this.taxaMensalPct(contract.interestPercentage);
    if (!semPrice && juros > 0 && qtde > 1 && total > 0) {
      const i = juros / 100;
      const pot = Math.pow(1 + i, qtde);
      if (pot > 1) {
        const pmt = Math.round((total * i * pot / (pot - 1)) * 100) / 100;
        if (pmt > fatia + 0.02) return pmt;
      }
    }
    if (explicito > 0.009) return explicito;
    return fatia;
  },

  condicoesDoContrato(conds, installments, contract) {
    const rows = (conds || []).map((c, i) => {
      const qtde = Number(c.installmentsNumber || c.numberOfInstallments || c.quantity || c.installments) || 0;
      const total = Number(c.totalValue || c.totalAmount || c.value) || 0;
      const valor = this.valorNominalCondicao(c, qtde, total, contract);
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

  async parcelasCompletas(billId) {
    const alvo = String(billId || "").replace(/^B-/, "").split("-")[0];
    const fetchFn = window.siengeFetchWithRetry;
    if (!alvo || typeof fetchFn !== "function") {
      const svc = window.SiengeApiService;
      if (!alvo || !svc || typeof svc.getBillInstallments !== "function") return [];
      try {
        const inst = await svc.getBillInstallments(alvo);
        const rows = (inst && inst.results) || inst || [];
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        return [];
      }
    }
    const todas = [];
    const limit = 200;
    try {
      for (let offset = 0; offset < 4000; offset += limit) {
        const res = await fetchFn("/accounts-receivable/receivable-bills/" + encodeURIComponent(alvo) + "/installments?limit=" + limit + "&offset=" + offset, 1);
        const rows = (res && res.results) || (Array.isArray(res) ? res : []);
        if (!rows.length) break;
        todas.push.apply(todas, rows);
        const total = res && res.resultSetMetadata && Number(res.resultSetMetadata.count);
        if (rows.length < limit) break;
        if (Number.isFinite(total) && todas.length >= total) break;
      }
    } catch (e) {
      if (todas.length) return todas;
      const svc = window.SiengeApiService;
      if (!svc || typeof svc.getBillInstallments !== "function") return [];
      try {
        const inst = await svc.getBillInstallments(alvo);
        const rows = (inst && inst.results) || inst || [];
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        return [];
      }
    }
    return todas;
  },

  taxaMensalPct(v) {
    if (v == null || v === "") return null;
    let raw = v;
    if (typeof raw === "string") {
      raw = raw.trim().replace("%", "").replace(/\s/g, "");
      if (raw.indexOf(",") >= 0) raw = raw.replace(/\./g, "").replace(",", ".");
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n === 0) return 0;
    if (n <= 0.05) return Math.round(n * 100 * 10000) / 10000;
    if (n <= 20) return Math.round(n * 10000) / 10000;
    return null;
  },

  taxasDeItem(o, profundidade, paiTaxa) {
    if (!o || typeof o !== "object" || (profundidade || 0) > 3) return [];
    const out = [];
    Object.keys(o).forEach((k) => {
      const v = o[k];
      const nome = String(k || "").toLowerCase();
      const contexto = (/juros|interest/.test(nome) || paiTaxa) && !/late|mora|fine|multa|daily|dias|amount|value/.test(nome);
      const pareceTaxa = contexto && (/percent|pct|rate|taxa|percentage/.test(nome) || paiTaxa && /percent|pct|rate|taxa|percentage/.test(nome));
      if (pareceTaxa && (typeof v === "number" || typeof v === "string")) {
        const n = this.taxaMensalPct(v);
        if (n != null) out.push(n);
        return;
      }
      if (v && typeof v === "object") this.taxasDeItem(v, (profundidade || 0) + 1, contexto).forEach((n) => out.push(n));
    });
    return out;
  },

  modaTaxa(lista) {
    const bag = new Map();
    lista.forEach((n) => {
      const k = Number(n).toFixed(4);
      bag.set(k, (bag.get(k) || 0) + 1);
    });
    let best = Number(lista[0]) || 0;
    let qtd = 0;
    bag.forEach((n, k) => {
      if (n > qtd) {
        qtd = n;
        best = Number(k);
      }
    });
    return best;
  },

  jurosDoContrato(contract, conds, installments) {
    const taxas = [];
    [].concat(installments || [], conds || [], contract ? [contract] : []).forEach((o) => {
      this.taxasDeItem(o).forEach((n) => taxas.push(n));
    });
    const positivas = taxas.filter((n) => n > 0.0000001);
    if (!positivas.length) return 0;
    const semMora = positivas.filter((n) => Math.abs(n - 1) > 0.05);
    return this.jurosConsiderado(this.modaTaxa(semMora.length ? semMora : positivas));
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

  async billFinanceiro(customerId, billId) {
    const svc = window.SiengeApiService;
    if (!customerId || !billId || !svc || typeof svc.getCustomerFinancialStatements !== "function") return null;
    let fs = null;
    try { fs = await svc.getCustomerFinancialStatements(customerId); } catch (e) { fs = null; }
    const bills = ((fs && fs.results) || []).flatMap((item) => item.billsReceivable || item.billReceivable || []);
    const alvo = String(billId).replace(/^B-/, "").split("-")[0];
    return bills.find((db) => String(db.billReceivableId || db.receivableBillId || "").replace(/^B-/, "").split("-")[0] === alvo) || null;
  },

  liquidoDe(bill) {
    if (!bill) return 0;
    const lista = Array.isArray(bill.installments) && bill.installments.length
      ? bill.installments
      : [].concat(bill.paidInstallments || [], bill.dueInstallments || []);
    let pago = 0;
    let desconto = 0;
    lista.forEach((inst) => {
      (inst.receipts || []).forEach((rec) => {
        if (typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(rec)) return;
        pago += Number(rec.receiptValue || 0);
        desconto += Number(rec.discountValue || 0);
      });
    });
    return Math.round(Math.max(0, pago - desconto) * 100) / 100;
  },

  valorRecibos(p) {
    const recs = Array.isArray(p && p.receipts) ? p.receipts : [];
    const direta = Number(p && p.receiptValue);
    if (!recs.length && !(direta > 0)) return null;
    let soma = 0;
    let desconto = 0;
    recs.forEach((r) => {
      if (typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(r)) return;
      soma += Number(r.receiptValue || 0);
      desconto += Number(r.discountValue || 0);
    });
    if (!recs.length) soma = direta;
    else soma = Math.max(0, soma - desconto);
    return soma;
  },

  async parcelasDoExtrato(billId) {
    const svc = window.SiengeApiService;
    const alvo = String(billId || "").replace(/^B-/, "").split("-")[0];
    if (!alvo || !svc || typeof svc.getCustomerExtractHistoryByBill !== "function") return [];
    let res = null;
    try { res = await svc.getCustomerExtractHistoryByBill(alvo); } catch (e) { res = null; }
    const rows = Array.isArray(res && res.data) ? res.data : (Array.isArray(res && res.results) ? res.results : []);
    return rows.filter((row) => {
      if (!row) return false;
      const bid = String(row.billReceivableId || row.receivableBillId || "").replace(/^B-/, "").split("-")[0];
      if (bid && bid !== alvo) return false;
      if (typeof documentoExtratoEhCt === "function" && !documentoExtratoEhCt(row)) return false;
      return true;
    }).map((row) => ({
      dueDate: row.dueDate || row.originalDueDate || row.installmentDueDate || "",
      currentBalance: row.currentBalance,
      originalValue: row.originalValue != null ? row.originalValue : (row.originalAmount != null ? row.originalAmount : row.amount),
      receipts: row.receipts || [],
      installmentSituation: row.installmentSituation
    }));
  },

  saldoAtualDe(p) {
    if (!p || p.currentBalance == null || p.currentBalance === "") return null;
    const n = Number(p.currentBalance);
    return Number.isFinite(n) ? n : null;
  },

  hojeIso() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  modaValor(valores) {
    const bag = new Map();
    (valores || []).forEach((v) => {
      if (!(v > 0.009)) return;
      const k = Math.round(v * 100);
      bag.set(k, (bag.get(k) || 0) + 1);
    });
    let best = null;
    bag.forEach((n, k) => { if (!best || n > best.n) best = { k: k, n: n }; });
    return best ? best.k / 100 : 0;
  },

  situacaoParcelas(installments) {
    const hoje = this.hojeIso();
    let pagas = 0;
    let abertas = 0;
    let saldo = 0;
    let pago = 0;
    let presente = 0;
    const abertos = [];
    const vencer = [];
    (installments || []).forEach((p) => {
      const original = Number(p.originalValue != null ? p.originalValue : (p.originalAmount != null ? p.originalAmount : (p.amount || 0))) || 0;
      const saldoAtual = this.saldoAtualDe(p);
      const cb = saldoAtual != null ? saldoAtual : (Number(p.balanceDue) || 0);
      const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
      (p.receipts || []).forEach((rec) => {
        if (typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(rec)) return;
        pagas += 1;
        pago += Number(rec.receiptValue || 0);
      });
      if (!(cb > 0.009)) return;
      abertas += 1;
      saldo += cb;
      const vpFn = typeof window.distPermutaInstVp === "function" ? window.distPermutaInstVp : null;
      const vp = vpFn ? Number(vpFn(p)) : cb;
      presente += Number.isFinite(vp) && vp > 0.009 ? vp : cb;
      const face = original > 0.009 ? original : cb;
      const item = { due: due, valor: face };
      abertos.push(item);
      if (!due || due >= hoje) vencer.push(item);
    });
    abertos.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    vencer.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const prox = vencer[0] || abertos[0] || null;
    const saldoVencer = vencer.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return {
      pagas: pagas,
      abertas: abertas,
      aVencer: vencer.length,
      pago: Math.round(pago * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      saldoVencer: Math.round(saldoVencer * 100) / 100,
      valor: prox ? Math.round(prox.valor * 100) / 100 : 0,
      primeiro: prox ? prox.due : "",
      parcelasVencer: vencer,
      valorPresente: Math.round(presente * 100) / 100
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
      { id: "cessionario", label: "Cessionário", icon: "user-plus" },
      { id: "testemunhas", label: "Testemunhas", icon: "pen-line" }
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
      prox.innerHTML = st.tab === "testemunhas"
        ? (st.gerando ? `<span class="btn-spin"></span> Gerando...` : `<i data-lucide="file-down" style="width:16px;height:16px;"></i> Gerar cessão`)
        : "Avançar";
      prox.disabled = !!st.loading || !!st.gerando || !!st.enviandoClick || (st.tab === "testemunhas" && !!this.pendenciaPdf());
    }
    const click = document.getElementById("cessao-popup-clicksign");
    if (click) {
      const mostra = st.tab === "testemunhas" && !st.loading;
      click.style.display = mostra ? "" : "none";
      click.disabled = !mostra || !!st.gerando || !!st.enviandoClick || !!this.pendenciaPdf();
      click.innerHTML = st.enviandoClick
        ? `<span class="btn-spin"></span> Enviando...`
        : `<i data-lucide="pen-line" style="width:16px;height:16px;"></i> Enviar para ClickSign`;
    }
    const aviso = document.getElementById("cessao-popup-aviso");
    if (aviso) aviso.textContent = st.loading ? "" : (st.tab === "testemunhas" ? this.pendenciaPdf() : this.pendenciaAba(st.tab));
    if (window.lucide) lucide.createIcons();
  },

  corpoHtml() {
    if (CessaoPopupState.tab === "condicoes") return this.condicoesHtml();
    if (CessaoPopupState.tab === "cessionario") return this.cessionarioHtml();
    if (CessaoPopupState.tab === "testemunhas") return this.testemunhasHtml();
    if (CessaoPopupState.tab === "taxa") return this.taxaHtml();
    return this.cedentesHtml();
  },

  cedentesHtml() {
    const st = CessaoPopupState;
    const principal = (st.cedentes || []).find((c) => c.main) || (st.cedentes || [])[0];
    const nota = st.faltaPct
      ? `<p class="cessao-pop-nota">Há comprador secundário sem percentual no Sienge. Informe quanto cada pessoa tem.</p>`
      : `<p class="cessao-pop-nota is-ok">Marque quem cede e quanto do percentual dela passa para o cessionário.</p>`;
    const principalHtml = principal
      ? `<p class="cessao-principal">Cliente principal do contrato: <strong>${this.esc(principal.name || "—")}</strong></p>`
      : "";
    const linhas = (st.cedentes || []).map((row, idx) => `
      <div class="cessao-pop-pessoa">
        <div>
          <strong>${this.esc(row.name)}</strong>
          ${row.main ? '<span class="cessao-badge">Principal</span>' : (st.cedentes.length > 1 ? '<span class="cessao-badge">Secundário</span>' : '')}
          <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">ID ${this.esc(row.id || "—")}</div>
        </div>
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
    return nota + principalHtml + (linhas || "<p>Nenhum comprador encontrado neste contrato.</p>") +
      `<div style="text-align:right;font-weight:700;color:var(--color-primary);">Total cedido: <span id="cessao-pop-total-cedido">${this.fmtPct(this.totalCedido())}%</span></div>`;
  },

  cmpVencimento(a, b) {
    const da = String((a && a.vencimento) || "");
    const db = String((b && b.vencimento) || "");
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  },

  condicoesHtml() {
    const st = CessaoPopupState;
    (st.condicoes || []).sort((a, b) => this.cmpVencimento(a, b));
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
      <div class="cessao-cond-box">
        <div class="cessao-cond-head">CONDIÇÕES DE PAGAMENTO DA COMPRA</div>
        <div class="cessao-cond-scroll">
          <table class="cessao-cond-table">
            <thead><tr>
              <th>Tipo</th><th>Qtde. parcelas</th><th>Valor da parcela</th><th>Total</th><th>1º vencimento</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="btn btn-outline cessao-cond-add" onclick="CessaoPopup.addCond()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Adicionar condição</button>
        <div class="cessao-contrato-dados">
        ${this.campoContrato("Juros ao mês (%)", this.fmtJuros(st.juros))}
        ${this.campoContrato("Indexador", st.indexador || "REAL")}
        ${this.campoContrato("Parcelas já pagas", String(st.qtdPagas || 0))}
        ${this.campoContrato("Parcelas a pagar", String(st.qtdAbertas || 0))}
        ${this.campoContrato("Valor da próxima parcela", this.money(st.valorParcelaAberta), true)}
        ${this.campoContrato("Próximo vencimento", st.primeiroVencAberto ? CessaoApp.fmtDate(st.primeiroVencAberto) : "—", true)}
        ${this.campoContrato("Saldo com o vendedor", this.money(st.saldoAberto))}
        </div>
      </div>`;
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

  cessionarioCheio() {
    return this.totalCedido() > 0 && (this.totalCedido() - this.totalAdquirido()) <= 0.05;
  },

  cessionarioHtml() {
    const st = CessaoPopupState;
    const modoRep = st.buscaModo && st.buscaModo.tipo === "representante";
    const alvo = modoRep ? st.cessionarios[st.buscaModo.idx] : null;
    const cards = (st.cessionarios || []).map((row, idx) => this.cardCessionario(row, idx)).join("");
    const cheio = !modoRep && this.cessionarioCheio();
    const busca = cheio
      ? ""
      : `<div class="cessao-ces-busca">
        <label class="cessao-pop-field">${modoRep ? "Representante" : "Nome do cliente"}
          <input id="cessao-pop-busca" class="form-control" placeholder="Digite para buscar..." value="${this.esc(st.busca)}"
            oninput="CessaoPopup.aoDigitar(this.value)" autocomplete="off">
        </label>
        <div id="cessao-pop-sug" class="cessao-pop-sug" style="display:none;"></div>
      </div>`;
    const nota = modoRep
      ? `<p class="cessao-pop-nota">Selecione o representante de ${this.esc((alvo && alvo.customer && alvo.customer.name) || "o cessionário")}.</p>`
      : (cheio ? `<p class="cessao-pop-nota">O percentual cedido já soma com o cessionário. Ajuste o % adquirido para incluir outra pessoa.</p>` : "");
    return `
      ${nota}
      ${busca}
      <div class="cessao-ces-lista">${cards || `<p class="cessao-ces-vazio">Nenhum cessionário selecionado. Total cedido: ${this.fmtPct(this.totalCedido())}%.</p>`}</div>`;
  },

  testemunhasHtml() {
    const st = CessaoPopupState;
    return `
      <p class="cessao-pop-nota is-ok">Escolha duas pessoas diferentes para assinar como testemunha.</p>
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

  taxaHtml() {
    const st = CessaoPopupState;
    const cls = st.taxaStatus === "paga" ? "is-ok" : (st.taxaStatus && st.taxaStatus !== "buscando" ? "" : "is-ok");
    const msg = st.taxaMsg || "Informe o título da taxa de cessão.";
    return `
      <p class="cessao-pop-nota ${cls}">${this.esc(msg)}</p>
      <div class="cessao-taxa-row">
        <label class="cessao-pop-field">Título da taxa de cessão
          <input id="cessao-taxa-titulo" class="form-control" inputmode="numeric" placeholder="Número do título" value="${this.esc(st.taxaTitulo || "")}"
            oninput="CessaoPopup.aoDigitarTaxa(this.value)"
            onkeydown="CessaoPopup.taxaTecla(event)">
        </label>
        <button type="button" class="btn btn-outline" onclick="CessaoPopup.buscarTaxa()" ${st.taxaStatus === "buscando" ? "disabled" : ""}>Consultar pagamento</button>
      </div>`;
  },

  cardCessionario(row, idx) {
    const c = row.customer || {};
    const pj = this.isPj(c);
    const conj = typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(c) : null;
    const rep = row.representante;
    const civil = c.civilStatus || c.maritalStatus || "";
    const aberto = Number(CessaoPopupState.cesAberto) === idx;
    const bloco = (titulo, pessoa) => {
      if (!pessoa) return "";
      const doc = this.docDe(pessoa);
      const docTipo = String(pessoa.cnpj || pessoa.cpfCnpj || pessoa.cpf || "").replace(/\D/g, "").length > 11 ? "CNPJ " : "CPF ";
      const rg = typeof window.pickCustomerRg === "function" ? window.pickCustomerRg(pessoa) : (pessoa.rg || "");
      return `<div class="cessao-ces-extra">
        <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">${titulo}</div>
        <strong>${this.esc(pessoa.name || "—")}</strong>
        <div style="font-size:0.8rem;color:#334155;margin-top:4px;">
          ${doc ? this.esc(docTipo + doc) : ""}
          ${rg ? " · RG " + this.esc(rg) : ""}
          ${pessoa.profession || pessoa.occupation ? " · " + this.esc(pessoa.profession || pessoa.occupation) : ""}
        </div>
      </div>`;
    };
    return `<div class="cessao-ces-card${aberto ? " is-open" : ""}">
      <div class="cessao-ces-top">
        <button type="button" class="cessao-ces-toggle" onclick="CessaoPopup.toggleCes(${idx})" aria-expanded="${aberto ? "true" : "false"}">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
          <span>
            <span class="cessao-ces-ordem">Cessionário ${idx + 1}</span>
            <strong>${this.esc(c.name || "—")}</strong>
            <span class="cessao-badge">${pj ? "Pessoa jurídica" : "Pessoa física"}</span>
            ${conj && conj.name ? `<span class="cessao-ces-id">Cônjuge: ${this.esc(conj.name)}</span>` : ""}
          </span>
        </button>
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
      ${aberto ? `<dl class="cessao-ces-dados">
        <div><dt>Documento</dt><dd>${this.esc(this.docDe(c) || "não informado")}</dd></div>
        <div><dt>Estado civil</dt><dd>${this.esc(civil || "não informado")}</dd></div>
        <div><dt>Telefone</dt><dd>${this.esc(this.foneDe(c) || "não consta")}</dd></div>
        <div class="is-wide"><dt>Endereço</dt><dd>${this.esc(typeof window.formatLegalCustomerAddress === "function" ? (window.formatLegalCustomerAddress(c) || "Endereço não informado") : "Endereço não informado")}</dd></div>
        <div><dt>E-mail</dt><dd${this.emailDe(c) ? "" : " style=\"color:#b45309;font-weight:700;\""}>${this.esc(this.emailDe(c) || "não consta — obrigatório para o boleto")}</dd></div>
      </dl>
      ${bloco("Representante", rep)}` : ""}
    </div>`;
  },

  ordemAbas() {
    return ["cedentes", "condicoes", "cessionario", "testemunhas"];
  },

  ir(tab) {
    const ordem = this.ordemAbas();
    const destino = ordem.indexOf(tab);
    for (let i = 0; i < destino; i++) {
      if (this.pendenciaAba(ordem[i])) return;
    }
    CessaoPopupState.tab = tab;
    this.pintar();
  },

  voltar() {
    const ordem = this.ordemAbas();
    const i = ordem.indexOf(CessaoPopupState.tab);
    if (i > 0) {
      CessaoPopupState.tab = ordem[i - 1];
      this.pintar();
    }
  },

  proximo() {
    const st = CessaoPopupState;
    if (st.tab === "testemunhas") {
      this.gerarPdf();
      return;
    }
    const erro = this.pendenciaAba(st.tab);
    if (erro) {
      const aviso = document.getElementById("cessao-popup-aviso");
      if (aviso) aviso.textContent = erro;
      if (erro === this.pendenciaEmailCessionarios()) alert(erro);
      return;
    }
    const ordem = this.ordemAbas();
    const i = ordem.indexOf(st.tab);
    if (i >= 0 && ordem[i + 1]) this.ir(ordem[i + 1]);
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
    aviso.textContent = CessaoPopupState.tab === "testemunhas" ? this.pendenciaPdf() : this.pendenciaAba(CessaoPopupState.tab);
    const tot = document.getElementById("cessao-pop-total-cedido");
    if (tot) tot.textContent = this.fmtPct(this.totalCedido()) + "%";
  },

  setCond(id, field, value) {
    const row = (CessaoPopupState.condicoes || []).find((c) => c.id === id);
    if (!row) return;
    row[field] = value;
    if (field === "vencimento") {
      this.pintar();
      return;
    }
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
    const antes = this.cessionarioCheio();
    let n = Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    row.pct = Math.round(n * 100) / 100;
    if (antes !== this.cessionarioCheio()) this.pintar();
    else this.atualizarAviso();
  },

  aoDigitarTaxa(val) {
    CessaoPopupState.taxaTitulo = val;
    if (!CessaoPopupState.taxaStatus) return;
    CessaoPopupState.taxaStatus = "";
    CessaoPopupState.taxaMsg = "";
    const prox = document.getElementById("cessao-popup-proximo");
    if (prox) prox.disabled = true;
    const aviso = document.getElementById("cessao-popup-aviso");
    if (aviso) aviso.textContent = "Informe o título da taxa de cessão.";
  },

  taxaTecla(ev) {
    if (!ev || (ev.key !== "Enter" && ev.key !== "Tab")) return;
    if (ev.key === "Enter") ev.preventDefault();
    CessaoPopupState.taxaTitulo = ev.target ? ev.target.value : CessaoPopupState.taxaTitulo;
    this.buscarTaxa();
  },

  idsDoProcesso() {
    const ids = new Set();
    (CessaoPopupState.cedentes || []).forEach((c) => { if (c.id != null && c.id !== "") ids.add(String(c.id)); });
    (CessaoPopupState.cessionarios || []).forEach((c) => { if (c.customerId != null && c.customerId !== "") ids.add(String(c.customerId)); });
    return ids;
  },

  parcelaDaTaxaPaga(p) {
    if (!p) return false;
    if (Number(p.installmentSituation) === 2 || p.isValidReceipt === true) return true;
    const sit = [p.installmentSituation, p.situation, p.installmentStatus, p.status, p.situationDescription, p.installmentSituationDescription]
      .filter((v) => v != null && v !== "")
      .map((v) => String(v).trim().toUpperCase());
    const pagas = ["2", "PG", "PAGO", "PAGA", "QUITADO", "QUITADA", "PAID", "LIQUIDADO", "LIQUIDADA"];
    if (sit.some((s) => pagas.includes(s))) return true;
    const recs = (p.receipts || []).filter((rec) => !(typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(rec)));
    const recebido = recs.reduce((s, rec) => s + (Number(rec.receiptValue || rec.value || 0) || 0), 0);
    const cb = Number(p.currentBalance != null ? p.currentBalance : (p.balanceDue != null ? p.balanceDue : p.correctedBalance));
    const saldoZerado = Number.isFinite(cb) && cb <= 0.009;
    if (saldoZerado && recebido > 0.009) return true;
    const dataRec = p.receiptDate || p.paymentDate || p.payOffDate || p.lastReceiptDate;
    if (dataRec && saldoZerado) return true;
    const recebidoCampo = Number(p.receivedValue || p.totalReceived || p.receiptNetValue || 0);
    return saldoZerado && recebidoCampo > 0.009;
  },

  textoSemAcento(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  contaEhTaxaCessao(id, nome) {
    const dig = String(id || "").replace(/\D/g, "");
    if (dig === "1020106") return true;
    const t = this.textoSemAcento(nome);
    return t.includes("TAXA") && t.includes("CESS");
  },

  categoriasDe(obj) {
    if (!obj || typeof obj !== "object") return [];
    return []
      .concat(Array.isArray(obj.financialCategories) ? obj.financialCategories : [])
      .concat(Array.isArray(obj.budgetCategories) ? obj.budgetCategories : []);
  },

  codigoDocumento(bill) {
    const bruto = bill && (bill.documentIdentificationId || bill.documentsId || bill.documentId || bill.documentIdentification || "");
    return String(bruto && typeof bruto === "object" ? (bruto.id || bruto.code || "") : bruto).trim().toUpperCase();
  },

  centrosDoTitulo(bill) {
    const cru = []
      .concat((bill && bill.costCenterId) || [])
      .concat((bill && bill.costCentersId) || [])
      .concat((bill && bill.enterpriseId) || []);
    return cru.map((v) => String(v && typeof v === "object" ? (v.id || v.costCenterId || "") : v).replace(/\D/g, "")).filter(Boolean);
  },

  /** Taxa de cessão entra no centro corporativo. O teste 18341 está no 70100, documento TC. */
  centrosDaTaxa() {
    const ids = ["70100"];
    const emp = CessaoPopupState.contract && CessaoPopupState.contract.companyId;
    if (emp != null && String(emp) !== "") {
      const corp = "7" + String(emp).padStart(2, "0") + "00";
      if (!ids.includes(corp)) ids.push(corp);
    }
    return ids;
  },

  pareceTitulo(bill) {
    return !!(bill && typeof bill === "object" && !Array.isArray(bill) && (
      bill.receivableBillId != null || bill.billReceivableId != null || bill.customerId != null || bill.documentIdentificationId || bill.documentsId
    ));
  },

  tituloBate(bill, id) {
    return [bill.receivableBillId, bill.billReceivableId, bill.id, bill.documentNumber, bill.documentIdentificationNumber]
      .some((v) => String(v == null ? "" : v).replace(/\D/g, "") === id);
  },

  async listarTitulosReceber(path) {
    const res = await window.siengeFetchWithRetry(path, 1);
    return (res && res.results) || (Array.isArray(res) ? res : []);
  },

  async acharTituloReceber(id) {
    const fetchFn = window.siengeFetchWithRetry;
    try {
      const bill = await fetchFn("/accounts-receivable/receivable-bills/" + encodeURIComponent(id), 1);
      if (this.pareceTitulo(bill)) return bill;
    } catch (e) {}
    const caminhos = [];
    this.centrosDaTaxa().forEach((cc) => {
      caminhos.push("/accounts-receivable/receivable-bills?documentsId=TC&costCentersId=" + encodeURIComponent(cc) + "&documentNumber=" + encodeURIComponent(id) + "&limit=50");
      caminhos.push("/accounts-receivable/receivable-bills?documentsId=TC&costCenterId=" + encodeURIComponent(cc) + "&documentNumber=" + encodeURIComponent(id) + "&limit=50");
      caminhos.push("/accounts-receivable/receivable-bills?documentsId=TC&costCentersId=" + encodeURIComponent(cc) + "&limit=200");
    });
    this.idsDoProcesso().forEach((cid) => {
      caminhos.push("/accounts-receivable/receivable-bills?customerId=" + encodeURIComponent(cid) + "&documentsId=TC&limit=200");
    });
    for (const path of caminhos) {
      let lista = [];
      try { lista = await this.listarTitulosReceber(path); } catch (e) { continue; }
      const hit = lista.find((b) => b && this.tituloBate(b, id));
      if (!hit) continue;
      hit._documentoTc = true;
      const real = hit.receivableBillId || hit.billReceivableId;
      if (real && String(real).replace(/\D/g, "") !== id) {
        try {
          const cheio = await fetchFn("/accounts-receivable/receivable-bills/" + encodeURIComponent(real), 1);
          if (this.pareceTitulo(cheio)) {
            cheio._documentoTc = true;
            return cheio;
          }
        } catch (e) {}
      }
      return hit;
    }
    return null;
  },

  taxaPeloDfc(bill, inst) {
    const bruto = bill.documentIdentificationId || bill.documentsId || bill.documentId || bill.documentIdentification || "";
    const codigo = this.codigoDocumento(bill);
    const nome = this.textoSemAcento(
      bill.documentIdentificationName || bill.documentName || (bruto && typeof bruto === "object" ? bruto.name : "") || ""
    );
    if (bill._documentoTc || codigo === "TC" || (nome.includes("TAXA") && nome.includes("CESS"))) return codigo === "TC" || bill._documentoTc ? "TC" : "Receita de Taxa de Cessão";
    if (this.centrosDoTitulo(bill).includes("70100") && codigo === "TC") return "TC";
    const itens = this.categoriasDe(bill).concat((inst || []).reduce((acc, p) => acc.concat(this.categoriasDe(p)), []));
    const hit = itens.find((c) => this.contaEhTaxaCessao(
      c && (c.financialCategoryId || c.id || c.accountId),
      c && (c.financialCategoryName || c.name || c.accountName)
    ));
    if (hit) return "Receita de Taxa de Cessão";
    const notas = this.textoSemAcento([bill.notes, bill.historic, bill.history, bill.observation, bill.observations].filter(Boolean).join(" "));
    if (notas.includes("TAXA") && notas.includes("CESS")) return "Receita de Taxa de Cessão";
    return "";
  },

  tituloDaTaxaPago(bill, inst) {
    if (bill && (bill.payOffDate || bill.payoffDate || bill.paymentDate)) return true;
    return inst.length > 0 && inst.every((p) => this.parcelaDaTaxaPaga(p));
  },

  async buscarTaxa() {
    const id = String(CessaoPopupState.taxaTitulo || "").replace(/\D/g, "");
    CessaoPopupState.taxaTitulo = id;
    if (!id) {
      CessaoPopupState.taxaStatus = "";
      CessaoPopupState.taxaMsg = "Informe o número do título da taxa de cessão.";
      this.pintar();
      return;
    }
    CessaoPopupState.taxaStatus = "buscando";
    CessaoPopupState.taxaMsg = "Consultando o título " + id + " no contas a receber…";
    this.pintar();
    const fetchFn = window.siengeFetchWithRetry;
    if (typeof fetchFn !== "function") {
      CessaoPopupState.taxaStatus = "nao";
      CessaoPopupState.taxaMsg = "A consulta ao Sienge não está disponível.";
      this.pintar();
      return;
    }
    try {
      const bill = await this.acharTituloReceber(id);
      if (!bill) throw new Error("ausente");
      const billId = String(bill.receivableBillId || bill.billReceivableId || id).replace(/\D/g, "") || id;
      let inst = [];
      try {
        const res = await fetchFn("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200", 1);
        inst = (res && res.results) || (Array.isArray(res) ? res : []);
      } catch (e) {
        inst = [];
      }
      const pago = this.tituloDaTaxaPago(bill, inst);
      const como = this.taxaPeloDfc(bill, inst);
      const clienteId = String(bill.customerId || (bill.customer && bill.customer.id) || "");
      if (!pago) {
        CessaoPopupState.taxaStatus = "aberta";
        CessaoPopupState.taxaMsg = inst.length
          ? "Título " + id + " ainda tem saldo em aberto. A cessão só gera com a taxa paga."
          : "Encontrei o título " + id + ", mas não consegui confirmar o pagamento.";
      } else if (!como) {
        CessaoPopupState.taxaStatus = "nao";
        CessaoPopupState.taxaMsg = "Título " + id + " está pago, mas não é Receita de Taxa de Cessão (conta 1.02.01.06) nem documento TC.";
      } else if (!this.idsDoProcesso().has(clienteId)) {
        CessaoPopupState.taxaStatus = "nao";
        CessaoPopupState.taxaMsg = "A taxa não é compatível com as pessoas da cessão.";
      } else {
        CessaoPopupState.taxaStatus = "paga";
        CessaoPopupState.taxaMsg = "Título " + id + " é taxa de cessão (" + como + "), está pago e o cliente confere. Pode gerar a cessão.";
      }
    } catch (e) {
      CessaoPopupState.taxaStatus = "nao";
      CessaoPopupState.taxaMsg = "Não encontrei o título " + id + " no contas a receber. Procurei o documento TC no centro de custo 70100.";
    }
    this.pintar();
  },

  removeCessionario(idx) {
    CessaoPopupState.cessionarios.splice(idx, 1);
    if (Number(CessaoPopupState.cesAberto) === idx) CessaoPopupState.cesAberto = -1;
    else if (Number(CessaoPopupState.cesAberto) > idx) CessaoPopupState.cesAberto -= 1;
    if (CessaoPopupState.buscaModo.tipo === "representante") CessaoPopupState.buscaModo = { tipo: "cessionario" };
    this.pintar();
  },

  toggleCes(idx) {
    CessaoPopupState.cesAberto = Number(CessaoPopupState.cesAberto) === idx ? -1 : idx;
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
    if (termo.length < 1) {
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
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")).slice(0, 12);
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
    const lista = hits.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    box.innerHTML = lista.map((c) => {
      const doc = String(c.cpf || c.cnpj || c.cpfCnpj || "").replace(/\D/g, "");
      const masked = doc.length === 14
        ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
        : (doc.length === 11 ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : doc);
      const label = [c.id, c.name, masked].filter(Boolean).join(" - ");
      return `<button type="button" class="cessao-sugestao-item" onclick="CessaoPopup.escolher('${String(c.id).replace(/\D/g, "")}')">${this.esc(label)}</button>`;
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
      if (this.cessionarioCheio()) {
        alert("O percentual cedido já soma com o cessionário. Ajuste o % adquirido para incluir outra pessoa.");
        return;
      }
      const rem = Math.max(0, this.totalCedido() - this.totalAdquirido());
      CessaoPopupState.cessionarios.push({
        customerId: String(id),
        customer: full,
        pct: Math.round(rem * 100) / 100,
        representante: null
      });
      CessaoPopupState.cesAberto = -1;
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
    const juros = this.jurosConsiderado(CessaoPopupState.juros);
    const presente = Number(CessaoPopupState.valorPresente);
    const divida = Number.isFinite(presente) ? presente : (Number(CessaoPopupState.saldoAberto) || 0);
    if (juros <= 0.000001) return "1.3. O contrato não possui juros de parcelamento.";
    if (divida <= 0.009) return "1.3. O contrato está quitado.";
    return "1.3. O contrato possui juros de parcelamento de " + this.fmtJuros(juros) + "% ao mês.";
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
    const lista = (CessaoPopupState.parcelasVencer || []).slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const qtd = lista.length;
    const saldo = lista.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    if (qtd <= 0 || saldo <= 0.009) {
      return "5. O(s) CESSIONÁRIO(S) não possuem parcelas a vencer junto ao(s) PROMITENTE(S) VENDEDOR(ES).";
    }
    const valor = Number(CessaoPopupState.valorParcelaAberta) || (saldo / qtd);
    const primeiro = CessaoApp.fmtDate(lista[0].due);
    const ultimo = CessaoApp.fmtDate(lista[lista.length - 1].due);
    const iguais = lista.every((p) => Math.abs((Number(p.valor) || 0) - valor) < 0.02);
    let detalhe;
    if (iguais) {
      detalhe = "sendo " + qtd + " (" + this.extensoQtd(qtd) + ") parcelas mensais a vencer, no valor de " +
        this.money(valor) + " (" + this.extensoValor(valor) + ") cada, com vencimentos de " + primeiro +
        (ultimo && ultimo !== primeiro ? " a " + ultimo : "");
    } else {
      const itens = lista.map((p) => CessaoApp.fmtDate(p.due) + " no valor de " + this.money(p.valor)).join("; ");
      detalhe = "sendo as seguintes parcelas a vencer: " + itens;
    }
    return "5. Que o(s) CESSIONÁRIO(S) obrigam-se ao pagamento das parcelas a vencer junto ao(s) PROMITENTE(S) VENDEDOR(ES), no valor de " +
      this.money(saldo) + " (" + this.extensoValor(saldo) + "), " + detalhe +
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
    const campo = (nome, papel) => `<div style="height:32px;"></div>
      <div style="border-top:1px solid #111;margin:0 10px 8px;"></div>
      <div style="font-weight:bold;line-height:1.3;">${this.esc(String(nome || "").toUpperCase())}</div>
      <div style="margin-top:2px;">${this.esc(papel)}</div>`;
    const faixa = (campos) => {
      if (!campos.length) return "";
      if (campos.length === 1) {
        return `<tr><td colspan="2" style="padding:20px 22% 0;text-align:center;white-space:normal;vertical-align:bottom;">${campo(campos[0].nome, campos[0].papel)}</td></tr>`;
      }
      return `<tr>${campos.slice(0, 2).map((c) => `<td style="width:50%;padding:20px 14px 0;text-align:center;white-space:normal;vertical-align:bottom;">${campo(c.nome, c.papel)}</td>`).join("")}</tr>`;
    };
    const grupoDe = (customer, papel) => {
      const nome = customer && (customer.name || customer.nome);
      if (!nome) return [];
      const conj = !this.isPj(customer) && typeof window.legalSpouseRecord === "function" ? window.legalSpouseRecord(customer) : null;
      const campos = [{ nome: nome, papel: papel }];
      if (conj && conj.name) campos.push({ nome: conj.name, papel: "Cônjuge" });
      return [campos];
    };
    const cedentes = (st.cedentes || []).filter((c) => c.cede && Number(c.cederPct) > 0);
    const linhasCed = cedentes.flatMap((c) => grupoDe(c.customer || { name: c.name }, "Cedente"));
    const linhasCes = [];
    (st.cessionarios || []).forEach((row) => {
      grupoDe(row.customer, "Cessionário").forEach((g) => linhasCes.push(g));
      if (row.representante && row.representante.name) {
        linhasCes.push([{ nome: row.representante.name, papel: "Representante" }]);
      }
    });
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const w = (id) => users.find((u) => String(u.id) === String(id)) || {};
    const testemunha = (u) => {
      const nome = u.name || u.nome || "________________";
      const rg = u.doc_rg || u.rg || "________________";
      return `<td style="width:50%;padding:18px 16px 0;text-align:center;white-space:normal;">${this.esc(nome)}<br>RG: ${this.esc(rg)}</td>`;
    };
    const data = this.dataHoje();
    return `<div style="font-family:'Times New Roman',serif;white-space:normal;line-height:1.35;">` +
      `<p style="text-align:justify;margin:0 0 8px;">${this.htmlTexto("E assim, por estarem justas e contratadas, assinam o presente em 03 (três) vias de igual teor, na presença das testemunhas abaixo.")}</p>` +
      `<p style="text-align:center;margin:28px 0 8px;">Botucatu, ${this.esc(data)}</p>` +
      `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${linhasCed.map(faixa).join("")}${linhasCes.map(faixa).join("")}` +
      faixa([{ nome: st.empresaNome || "ANUENTE", papel: "Anuente" }]) +
      `<tr><td colspan="2" style="padding-top:24px;text-align:center;font-weight:bold;">Testemunhas</td></tr>` +
      `<tr>${testemunha(w(st.testemunha1))}${testemunha(w(st.testemunha2))}</tr>` +
      `</table></div>`;
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

  baixarBytes(bytes, fileName) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "cessao.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },

  async juntarPdfs(rel, pdfA, pdfB) {
    const { PDFDocument } = await rel._carregarPdfLib();
    const out = await PDFDocument.load(pdfA.output("arraybuffer"));
    const extra = await PDFDocument.load(pdfB.output("arraybuffer"));
    const pages = await out.copyPages(extra, extra.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    return out.save();
  },

  base64De(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = "";
    const passo = 0x8000;
    for (let i = 0; i < u8.length; i += passo) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + passo));
    }
    return btoa(bin);
  },

  signatariosClick() {
    const st = CessaoPopupState;
    const lista = [];
    const add = (nome, email, papel) => {
      const e = String(email || "").trim();
      const n = String(nome || "").trim();
      if (!e || !n || !e.includes("@")) return;
      if (lista.some((x) => x.email.toLowerCase() === e.toLowerCase())) return;
      lista.push({ nome: n, email: e, papel });
    };
    (st.cedentes || []).filter((c) => c.cede && Number(c.cederPct) > 0).forEach((c) => {
      add((c.customer && c.customer.name) || c.name, this.emailDe(c.customer), "Cedente");
    });
    (st.cessionarios || []).forEach((row) => {
      add(row.customer && row.customer.name, this.emailDe(row.customer), "Cessionário");
      if (row.representante) add(row.representante.name, this.emailDe(row.representante), "Representante");
    });
    this.anuentesClick().forEach((a) => {
      if (lista.some((x) => this.foldNome(x.nome) === this.foldNome(a.nome))) return;
      if (a.email && lista.some((x) => x.email.toLowerCase() === a.email.toLowerCase())) return;
      lista.push({ nome: a.nome, email: a.email || "", papel: "Anuente" });
    });
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const w = (id) => users.find((u) => String(u.id) === String(id)) || {};
    [w(st.testemunha1), w(st.testemunha2)].forEach((u) => {
      add(u.name || u.nome, u.email || u.mail, "Testemunha");
    });
    return lista;
  },

  async montarPacotePdf() {
    const rel = window.RelacionamentoApp;
    if (!rel || typeof rel._baixarPaginasPdf !== "function" || typeof rel._paginarDoc !== "function") {
      throw new Error("O gerador de PDF dos documentos não está disponível.");
    }
    const st = CessaoPopupState;
    if (!st.preamble || /NÃO CADASTRADO/i.test(String(st.preamble))) {
      throw new Error("Preâmbulo não cadastrado para o centro de custo deste contrato. Cadastre-o antes de gerar a cessão.");
    }
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
    let avisoAdesao = "";
    let bytes;
    if (assoc.fechado && assoc.nome) {
      const adesao = this.paginasAdesao(rel, { cod, unidade, titulo, pctTxt, nomeAssoc: assoc.nome });
      const pdfAdesao = await rel._baixarPaginasPdf(adesao, fileName, { retornar: true });
      bytes = await this.juntarPdfs(rel, pdfCessao, pdfAdesao);
    } else {
      if (assoc.fechado) avisoAdesao = "Este loteamento é fechado e ainda não tem o nome da associação no centro de custo. A cessão foi gerada sem o termo de adesão.";
      bytes = new Uint8Array(pdfCessao.output("arraybuffer"));
    }
    const auth = await this.carimbarAutenticacao(bytes, fileName);
    return { bytes: auth.bytes, fileName, avisoAdesao, codigo: auth.codigo, avisoAuth: auth.aviso };
  },

  isoDia(data) {
    const z = (n) => String(n).padStart(2, "0");
    return data.getFullYear() + "-" + z(data.getMonth() + 1) + "-" + z(data.getDate());
  },

  diaMais(dias) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return this.isoDia(d);
  },

  fmtDia(iso) {
    const p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  foldNome(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  },

  pareceEmpresa(nome) {
    return /\b(LTDA|EIRELI|SPE|EMPREEND|PARTICIPA|INCORPOR|LOTEAMENT|S\.?A\.?)\b/i.test(String(nome || ""));
  },

  /* Quem assina pela empresa anuente: procurador, sócio ou administrador citados no preâmbulo. */
  quemAssinaPelaEmpresa(texto) {
    const t = String(texto || "").replace(/\s+/g, " ");
    const nomes = [];
    const push = (bruto) => {
      let nome = String(bruto || "").replace(/\s+/g, " ").trim();
      nome = nome.split(/\s+(?:brasileir|portador|inscrit|casad|solteir|divorci|vi[uú]v|empres|advogad|do lar)/i)[0].trim();
      nome = nome.replace(/[,.;:]+$/, "").trim();
      if (this.pareceEmpresa(nome)) return;
      if (nome.split(/\s+/).filter(Boolean).length < 2) return;
      const key = this.foldNome(nome);
      if (!key || nomes.some((n) => this.foldNome(n) === key)) return;
      nomes.push(nome);
    };
    const cargo = /(?:bastante procurador|procurador|s[oó]cio|administrador(?:a)?|representante legal)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][^,]{5,140})/gi;
    let m;
    while ((m = cargo.exec(t))) push(m[1]);
    const junto = /\be\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ\s]{8,80}?),/g;
    while ((m = junto.exec(t))) push(m[1]);
    return nomes.slice(0, 3);
  },

  emailDeUsuario(nome) {
    const alvo = this.foldNome(nome);
    const partes = alvo.split(" ").filter((p) => p.length > 2);
    if (partes.length < 2) return "";
    const users = typeof window.getCrmUsersList === "function" ? window.getCrmUsersList() : [];
    const ativo = (u) => u && String(u.status || "ATIVO").toUpperCase() !== "INATIVO" && String(u.email || "").includes("@");
    const palavras = (u) => this.foldNome(u.name).split(" ").filter((p) => p.length > 2);
    const igual = users.find((u) => ativo(u) && this.foldNome(u.name) === alvo);
    if (igual) return String(igual.email).trim();
    const hit = users.find((u) => {
      if (!ativo(u)) return false;
      const np = palavras(u);
      if (np.length < 2) return false;
      const primeiro = np[0];
      const ultimo = np[np.length - 1];
      return partes.includes(primeiro) && partes.includes(ultimo);
    });
    return hit ? String(hit.email).trim() : "";
  },

  anuentesClick() {
    const st = CessaoPopupState;
    const rec = typeof window.getPreambleRecordForContract === "function"
      ? window.getPreambleRecordForContract(st.unit, st.contract)
      : null;
    const texto = String((rec && rec.text) || st.preamble || "");
    let nomes = this.quemAssinaPelaEmpresa(texto);
    if (!nomes.length && rec && typeof window.parsePreambleResponsibles === "function") {
      nomes = window.parsePreambleResponsibles(rec).filter((n) => !this.pareceEmpresa(n));
    }
    const empresa = String(st.empresaNome || "").trim();
    if (!nomes.length && empresa) return [{ nome: empresa, email: "", papel: "Anuente" }];
    return nomes.map((nome) => ({ nome: nome, email: this.emailDeUsuario(nome), papel: "Anuente" }));
  },

  grupoAssinatura(papel) {
    return /testemunha/i.test(String(papel || "")) ? 2 : 1;
  },

  validarPrazo(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "Informe a data limite da assinatura.";
    const quando = new Date(iso + "T12:00:00-03:00");
    if (Number.isNaN(quando.getTime())) return "A data limite da assinatura é inválida.";
    const agora = Date.now();
    if (quando.getTime() <= agora) return "A data limite precisa ser futura.";
    if (quando.getTime() > agora + 90 * 24 * 60 * 60 * 1000) return "A data máxima é " + this.fmtDia(this.diaMais(89)) + ".";
    return "";
  },

  fecharOrdemClick() {
    const el = document.getElementById("cessao-click-ordem");
    if (el) el.style.display = "none";
  },

  abrirOrdemClick() {
    const el = document.getElementById("cessao-click-ordem");
    const lista = document.getElementById("cessao-ordem-lista");
    const prazo = document.getElementById("cessao-click-prazo");
    const max = document.getElementById("cessao-ordem-max");
    const erro = document.getElementById("cessao-ordem-erro");
    if (!el || !lista || !prazo) return;
    const pessoas = this.signatariosClick();
    const bloco = (grupo, titulo) => {
      const itens = pessoas.filter((s) => this.grupoAssinatura(s.papel) === grupo);
      if (!itens.length) return "";
      return `<p class="cessao-ordem-tit">${titulo}</p><ol>` + itens.map((s) => `<li><b>${this.esc(s.nome)}</b> · ${this.esc(s.papel)}${s.email ? "" : " · sem e-mail no cadastro de usuários"}</li>`).join("") + "</ol>";
    };
    lista.innerHTML = bloco(1, "1º grupo — assinam primeiro") + bloco(2, "2º grupo — somente depois que o 1º grupo concluir");
    const padrao = this.diaMais(30);
    const teto = this.diaMais(89);
    prazo.min = this.diaMais(1);
    prazo.max = teto;
    prazo.value = padrao;
    if (max) max.textContent = "A data máxima para assinatura é " + this.fmtDia(teto) + ". A ClickSign aceita até 90 dias a partir de hoje.";
    if (erro) erro.textContent = "";
    el.style.display = "flex";
  },

  async carregarQrLib() {
    if (window.QRCode && typeof window.QRCode.toDataURL === "function") return window.QRCode;
    if (this._qrLib) return this._qrLib;
    this._qrLib = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.4.4/qrcode.min.js";
      s.onload = () => (window.QRCode && window.QRCode.toDataURL ? resolve(window.QRCode) : reject(new Error("O gerador de QR Code não carregou.")));
      s.onerror = () => reject(new Error("O gerador de QR Code não carregou."));
      document.head.appendChild(s);
    });
    this._qrLib.catch(() => { this._qrLib = null; });
    return this._qrLib;
  },

  async sha256Hex(bytes) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  dadosAutenticacao() {
    const st = CessaoPopupState || {};
    const ces = (st.cessionarios && st.cessionarios[0] && st.cessionarios[0].customer) || {};
    const unidade = [st.unit && st.unit.costCenterId, st.quadraLote].filter((x) => x && x !== "—").join(" - ");
    return {
      tipo: "Cessão de direitos",
      titulo: String(st.titulo || ""),
      unidade,
      cliente: ces.name || (st.customer && st.customer.name) || ""
    };
  },

  async guardarAutenticacao(codigo, hash, arquivo, info) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db) throw new Error("O Firebase não está disponível para guardar a prova do documento.");
    const dados = info || this.dadosAutenticacao();
    await fx.setDoc(fx.doc(db, "documentos_autenticados", codigo), {
      tipo: "cessao",
      tipoNome: dados.tipo,
      codigo,
      hash,
      arquivo: arquivo || "",
      titulo: dados.titulo || "",
      unidade: dados.unidade || "",
      cliente: dados.cliente || "",
      em: new Date().toISOString()
    });
  },

  async carimbarAutenticacao(bytes, arquivo) {
    const codigo = "cs-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Date.now().toString(36));
    try {
      const rel = window.RelacionamentoApp;
      const PDFLib = await rel._carregarPdfLib();
      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const qr = await this.carregarQrLib();
      const info = this.dadosAutenticacao();
      const limpo = (s) => String(s || "").replace(/[|\r\n]/g, " ").trim().slice(0, 80);
      const payload = ["INTEGRA", codigo, limpo(info.tipo), limpo(info.titulo), limpo(info.unidade), limpo(info.cliente)].join("|");
      const dataUrl = await qr.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: "M" });
      const cru = Uint8Array.from(atob(String(dataUrl).split(",")[1] || ""), (c) => c.charCodeAt(0));
      const pdf = await PDFDocument.load(bytes);
      const png = await pdf.embedPng(cru);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
      const page = pdf.addPage([595.28, 841.89]);
      pdf.setSubject("INTEGRA|" + codigo);
      pdf.setKeywords(["INTEGRA", codigo]);
      page.drawText("Autenticacao do documento", { x: 48, y: 760, size: 16, font, color: rgb(0.06, 0.2, 0.13) });
      page.drawText("Codigo " + codigo, { x: 48, y: 732, size: 12, font, color: rgb(0.12, 0.16, 0.2) });
      page.drawText(semAcento(info.tipo), { x: 48, y: 708, size: 12, font, color: rgb(0.12, 0.16, 0.2) });
      page.drawText("Titulo: " + semAcento(info.titulo || "-").slice(0, 70), { x: 48, y: 686, size: 11, font, color: rgb(0.2, 0.25, 0.3) });
      page.drawText("Unidade: " + semAcento(info.unidade || "-").slice(0, 70), { x: 48, y: 668, size: 11, font, color: rgb(0.2, 0.25, 0.3) });
      page.drawText("Cliente: " + semAcento(info.cliente || "-").slice(0, 70), { x: 48, y: 650, size: 11, font, color: rgb(0.2, 0.25, 0.3) });
      page.drawImage(png, { x: 48, y: 460, width: 168, height: 168 });
      const out = new Uint8Array(await pdf.save());
      let aviso = "";
      try {
        const hash = await this.sha256Hex(out);
        await this.guardarAutenticacao(codigo, hash, arquivo, info);
      } catch (e) {
        aviso = "O QR Code foi impresso, mas a prova não ficou salva no Firebase. " + (e && e.message ? e.message : "");
      }
      return { bytes: out, codigo, aviso };
    } catch (e) {
      return {
        bytes,
        codigo: "",
        aviso: "O PDF foi gerado sem o QR Code de autenticação. " + (e && e.message ? e.message : "")
      };
    }
  },

  registrarAssinatura(arquivo, bytes) {
    if (!window.DocAssinaturaApp || typeof DocAssinaturaApp.registrar !== "function") return;
    const st = CessaoPopupState;
    const ces = (st.cessionarios && st.cessionarios[0] && st.cessionarios[0].customer) || {};
    const unidade = [st.unit && st.unit.costCenterId, st.quadraLote].filter((x) => x && x !== "—").join(" - ");
    const cc = String((st.unit && st.unit.costCenterId) || (st.contract && st.contract.enterpriseId) || "").replace(/\D/g, "");
    DocAssinaturaApp.registrar({
      tipo: "cessao",
      cliente: ces.name || (st.customer && st.customer.name) || "",
      titulo: st.titulo || "",
      unidade,
      arquivo: arquivo || "",
      centroId: cc,
      bytes: bytes || null
    });
  },

  async gerarPdf() {
    const erro = this.pendenciaPdf();
    if (erro) {
      alert(erro);
      return;
    }
    CessaoPopupState.gerando = true;
    this.pintar();
    try {
      const pack = await this.montarPacotePdf();
      const avisos = [pack.avisoAdesao, pack.codigo ? "Código de autenticação " + pack.codigo + "." : "", pack.avisoAuth].filter(Boolean);
      if (avisos.length) alert(avisos.join("\n"));
      this.baixarBytes(pack.bytes, pack.fileName);
      this.registrarAssinatura(pack.fileName, pack.bytes);
      this.fechar();
    } catch (e) {
      console.error("[Cessão] PDF", e);
      alert(e && e.message ? e.message : "Não foi possível gerar o PDF da cessão.");
    } finally {
      CessaoPopupState.gerando = false;
      const ov = document.getElementById("cessao-popup");
      if (ov && ov.style.display === "flex") this.pintar();
    }
  },

  async enviarClickSign() {
    const erro = this.pendenciaPdf();
    if (erro) {
      alert(erro);
      return;
    }
    const signatarios = this.signatariosClick();
    if (!signatarios.length) {
      alert("Nenhuma pessoa desta cessão tem e-mail para a ClickSign. O documento não foi enviado.");
      return;
    }
    this.abrirOrdemClick();
  },

  async confirmarEnvioClick() {
    const prazoEl = document.getElementById("cessao-click-prazo");
    const erroEl = document.getElementById("cessao-ordem-erro");
    const prazo = prazoEl ? prazoEl.value : "";
    const invalido = this.validarPrazo(prazo);
    if (invalido) {
      if (erroEl) erroEl.textContent = invalido;
      return;
    }
    const signatarios = this.signatariosClick();
    const anuentes = signatarios.filter((s) => s.papel === "Anuente");
    if (!anuentes.length) {
      if (erroEl) erroEl.textContent = "Falta o anuente: não encontrei no preâmbulo quem assina pela empresa.";
      return;
    }
    const semEmail = anuentes.filter((s) => !String(s.email || "").includes("@"));
    if (semEmail.length) {
      if (erroEl) erroEl.textContent = "Quem assina pela empresa anuente não tem e-mail no cadastro de usuários: " + semEmail.map((s) => s.nome).join(", ") + ".";
      return;
    }
    this.fecharOrdemClick();
    CessaoPopupState.enviandoClick = true;
    this.pintar();
    try {
      const pack = await this.montarPacotePdf();
      const res = await fetch("/api/clicksign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: pack.fileName,
          nome: String(pack.fileName || "Cessão de direitos").replace(/\.pdf$/i, ""),
          contentBase64: this.base64De(pack.bytes),
          signatarios,
          prazo
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || !data.ok) {
        throw new Error((data && data.error) || "A ClickSign não recebeu o documento.");
      }
      const ordemTxt = (data.ordem || []).map((s) => (s.grupo === 2 ? "2º" : "1º") + " · " + s.nome + " · " + s.papel);
      const linhas = [
        "O documento de teste foi criado na ClickSign, em rascunho.",
        "Nenhum e-mail de assinatura foi disparado.",
        "Data limite: " + this.fmtDia(data.prazo || prazo) + ".",
        ordemTxt.length ? "Ordem: " + ordemTxt.join("; ") : "",
        pack.codigo ? "Código de autenticação " + pack.codigo + "." : "",
        pack.avisoAuth || "",
        "",
        "Procure por: " + (data.nome || pack.fileName),
        data.onde || ""
      ].filter((x) => x !== undefined && x !== "");
      if (pack.avisoAdesao) linhas.push("", pack.avisoAdesao);
      this.registrarAssinatura(pack.fileName);
      alert(linhas.join("\n"));
    } catch (e) {
      console.error("[Cessão] ClickSign", e);
      alert(e && e.message ? e.message : "Não foi possível enviar para a ClickSign.");
    } finally {
      CessaoPopupState.enviandoClick = false;
      const ov = document.getElementById("cessao-popup");
      if (ov && ov.style.display === "flex") this.pintar();
    }
  }
};

CessaoApp.abrirPopup = function (ctx) { return CessaoPopup.abrir(ctx); };
window.CessaoPopup = CessaoPopup;
window.CessaoPopupState = CessaoPopupState;

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'relacionamento_cessao') {
    CessaoApp.init();
  }
});
