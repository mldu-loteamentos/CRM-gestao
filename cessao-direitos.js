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

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'relacionamento_cessao') {
    CessaoApp.init();
  }
});
