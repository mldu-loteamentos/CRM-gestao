const RelacionamentoState = {
  activeTab: null,
  cliente: null,
  contrato: null
};

const RelacionamentoApp = {
  init() {
    this.renderCessao();
    this.renderAditamento();
    this.renderPermuta();
    this.renderTermos();
    this.renderHistorico();
  },

  renderBuscaCliente(contextId) {
    return `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <h3 style="margin: 0; color: var(--color-primary);"><i data-lucide="search"></i> Buscar Cliente ou Contrato</h3>
        </div>
        <div class="card-body">
          <div style="display: flex; gap: 15px;">
            <div style="flex: 1;">
              <label style="font-weight: 500; font-size: 0.9rem; color: var(--color-text-muted);">CPF/CNPJ, Nome ou Contrato</label>
              <input type="text" id="relacionamento-busca-${contextId}" class="form-control" placeholder="Digite para buscar..." onkeydown="if(event.key === 'Enter') RelacionamentoApp.buscarCliente('${contextId}')">
            </div>
            <div style="align-self: flex-end;">
              <button class="btn btn-primary" onclick="RelacionamentoApp.buscarCliente('${contextId}')"><i data-lucide="search" style="width:16px;"></i> Buscar</button>
            </div>
          </div>
          <div id="relacionamento-resultado-${contextId}" style="margin-top: 20px;"></div>
        </div>
      </div>
    `;
  },

  async buscarCliente(contextId) {
    const term = document.getElementById(`relacionamento-busca-${contextId}`).value;
    if (!term) return;
    
    const resEl = document.getElementById(`relacionamento-resultado-${contextId}`);
    resEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--color-text-muted);"><i data-lucide="loader" class="lucide-spin" style="width:24px; height:24px; margin-bottom: 10px;"></i><br>Buscando <strong>${term}</strong> no Sienge...</div>`;
    lucide.createIcons();

    // Simulação de busca
    setTimeout(() => {
      resEl.innerHTML = `
        <div style="padding: 15px; border: 1px solid var(--color-border); border-radius: 6px; background: #fafafa;">
          <h4 style="margin: 0 0 10px 0; color: var(--color-text-dark);">JOÃO DA SILVA SA</h4>
          <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.9rem;">
            <div><i data-lucide="file-text" style="width:14px;"></i> Contrato: <strong>159458</strong></div>
            <div><i data-lucide="check-circle" style="width:14px; color: var(--color-success);"></i> Status: <strong style="color: var(--color-success);">ATIVO</strong></div>
            <div><i data-lucide="alert-circle" style="width:14px; color: var(--color-danger);"></i> Inadimplência: <strong>Não</strong></div>
          </div>
          <button class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary);" onclick="RelacionamentoApp.selecionarContrato('${contextId}', '159458')">Selecionar Contrato</button>
        </div>
      `;
      lucide.createIcons();
    }, 1000);
  },

  selecionarContrato(contextId, contratoId) {
    const rootForm = document.getElementById(`relacionamento-form-${contextId}`);
    if (rootForm) {
      rootForm.style.display = 'block';
      rootForm.scrollIntoView({ behavior: 'smooth' });
    }
  },

  renderCessao() {
    const root = document.getElementById('relacionamento-cessao-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-text" style="color: var(--color-primary);"></i> Cessão de Direitos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Transfira a titularidade do contrato para um novo cliente (Cessionário).</p>
      </div>
      ${this.renderBuscaCliente('cessao')}
      
      <div id="relacionamento-form-cessao" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-header">
          <h3 style="margin: 0;"><i data-lucide="user-plus"></i> Dados do Cessionário (Novo Titular)</h3>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <label style="font-weight:500;">Nome Completo</label>
              <input type="text" class="form-control" placeholder="Nome do novo titular">
            </div>
            <div>
              <label style="font-weight:500;">CPF/CNPJ</label>
              <input type="text" class="form-control" placeholder="000.000.000-00">
            </div>
            <div style="grid-column: span 2;">
              <label style="font-weight:500;">Motivo da Cessão</label>
              <textarea class="form-control" rows="3" placeholder="Descreva o motivo..."></textarea>
            </div>
          </div>
        </div>
        <div class="card-footer" style="display: flex; justify-content: flex-end; padding: 20px;">
          <button class="btn btn-primary" onclick="alert('Cessão validada e registrada com sucesso!')"><i data-lucide="check"></i> Validar e Registrar Cessão</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderAditamento() {
    const root = document.getElementById('relacionamento-aditamento-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-plus" style="color: var(--color-primary);"></i> Aditamento Contratual</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Altere cláusulas, prazos ou valores do contrato atual.</p>
      </div>
      ${this.renderBuscaCliente('aditamento')}
      
      <div id="relacionamento-form-aditamento" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="file-edit" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Formulário de Aditamento</h3>
          <p class="text-muted">O contrato selecionado está habilitado para aditamento.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderPermuta() {
    const root = document.getElementById('relacionamento-permuta-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="refresh-ccw" style="color: var(--color-primary);"></i> Permuta</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Troca de unidade do cliente.</p>
      </div>
      ${this.renderBuscaCliente('permuta')}
      
      <div id="relacionamento-form-permuta" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="home" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Selecionar Nova Unidade</h3>
          <p class="text-muted">Aguardando seleção da unidade de destino.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderTermos() {
    const root = document.getElementById('relacionamento-termos-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-signature" style="color: var(--color-primary);"></i> Emissão de Termos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Gere os termos em PDF e envie ao Sienge.</p>
      </div>
      ${this.renderBuscaCliente('termos')}
    `;
    lucide.createIcons();
  },

  renderHistorico() {
    const root = document.getElementById('relacionamento-historico-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="history" style="color: var(--color-primary);"></i> Histórico de Interações</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Veja todo o relacionamento com o cliente.</p>
      </div>
      ${this.renderBuscaCliente('historico')}
    `;
    lucide.createIcons();
  },

  _siengeProxyBase() {
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
    return `http://${host}:${port}/sienge-proxy`;
  },

  async _siengeGet(path) {
    const authHeader = window.getBasicAuthHeader ? getBasicAuthHeader() : "";
    const res = await fetch(this._siengeProxyBase() + path, { headers: { Authorization: authHeader } });
    if (!res.ok) throw new Error("Falha na consulta Sienge (HTTP " + res.status + ").");
    return res.json();
  },

  _escSetResultsHtml(html) {
    const el = document.getElementById("esc-search-results");
    if (el) el.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  limparEscritura() {
    RelacionamentoState.escritura = null;
    RelacionamentoState.escrituraMatches = [];
    const card = document.getElementById("esc-doc-card");
    if (card) card.style.display = "none";
    this._escSetResultsHtml("");
    ["esc-filter-titulo", "esc-filter-contrato", "esc-filter-nome", "esc-cidade-cartorio", "esc-localizacao", "esc-bancos"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const dd = document.getElementById("esc-nome-dropdown");
    if (dd) dd.style.display = "none";
  },

  sugerirNomeEscritura(query) {
    window.SelectedDynamicCustomerId = null;
    window.SelectedDynamicCustomerName = null;
    const dd = document.getElementById("esc-nome-dropdown");
    if (!dd) return;
    const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const qNorm = normalizeStr(query);
    if (!qNorm || !window.GlobalCustomerCache || !window.GlobalCustomerCache.data) {
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const terms = qNorm.split(" ").filter((t) => t);
    const matches = window.GlobalCustomerCache.data.filter((c) => {
      const cName = normalizeStr(c.name);
      return terms.every((term) => cName.includes(term));
    }).slice(0, 12);
    if (!matches.length) {
      dd.style.display = "none";
      return;
    }
    dd.innerHTML = "";
    matches.forEach((c) => {
      const item = document.createElement("div");
      item.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #f3f4f6;";
      item.textContent = (c.id ? c.id + " - " : "") + (c.name || "");
      item.onmouseover = () => { item.style.background = "#f0fdf4"; };
      item.onmouseout = () => { item.style.background = "#fff"; };
      item.onmousedown = (ev) => {
        ev.preventDefault();
        const input = document.getElementById("esc-filter-nome");
        if (input) input.value = c.name || "";
        window.SelectedDynamicCustomerId = c.id;
        window.SelectedDynamicCustomerName = c.name;
        dd.style.display = "none";
      };
      dd.appendChild(item);
    });
    dd.style.display = "block";
  },

  async buscarEscritura() {
    const titulo = (document.getElementById("esc-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (document.getElementById("esc-filter-contrato")?.value || "").trim();
    const nome = (document.getElementById("esc-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) {
      alert("Informe o título, o contrato ou o nome do cliente.");
      return;
    }
    this._escSetResultsHtml(`<div style="padding:24px;text-align:center;color:var(--color-text-muted);">
      <div class="loading-spinner" style="width:28px;height:28px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
      Consultando contrato na Sienge...
    </div>`);
    document.getElementById("esc-doc-card").style.display = "none";
    RelacionamentoState.escritura = null;

    try {
      let customerId = null;
      let hintBill = null;
      let hintContract = null;

      if (titulo) {
        hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(titulo));
        const bType = String(hintBill.documentId || "").trim().toUpperCase();
        if (bType && bType !== "CT" && bType !== "CTCV") {
          throw new Error("O título " + titulo + " não é do tipo CT.");
        }
        customerId = hintBill.customerId;
      } else if (contrato) {
        const data = await this._siengeGet("/sales-contracts?number=" + encodeURIComponent(contrato));
        const list = data.results || [];
        if (!list.length) throw new Error("Contrato não encontrado: " + contrato);
        hintContract = list[0];
        customerId = hintContract.customerId
          || hintContract.customer?.id
          || hintContract.salesContractCustomers?.[0]?.id
          || hintContract.salesContractCustomers?.[0]?.customerId;
        if (!customerId && hintContract.receivableBillId) {
          hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + hintContract.receivableBillId);
          customerId = hintBill.customerId;
        }
        if (!customerId) throw new Error("Não foi possível identificar o cliente deste contrato.");
      } else {
        customerId = window.SelectedDynamicCustomerId;
        if (!customerId && window.GlobalCustomerCache && window.GlobalCustomerCache.data) {
          const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
          const terms = normalizeStr(nome).split(" ").filter((t) => t);
          const match = window.GlobalCustomerCache.data.find((c) => {
            const cName = normalizeStr(c.name);
            return terms.every((term) => cName.includes(term));
          });
          if (match) customerId = match.id;
        }
        if (!customerId) throw new Error("Cliente não encontrado. Selecione um nome da lista ou use título/contrato.");
      }

      const sales = (window.SiengeApiService && typeof SiengeApiService.getSales === "function")
        ? await SiengeApiService.getSales(customerId)
        : [];
      let matches = Array.isArray(sales) ? sales.slice() : [];
      if (titulo) {
        const filtered = matches.filter((s) => String(s.receivableBillId) === String(titulo) || String(s.id) === String(titulo));
        if (filtered.length) matches = filtered;
      }
      if (contrato) {
        const filtered = matches.filter((s) => String(s.id) === String(contrato) || String(s.contractNumber) === String(contrato) || String(s.number) === String(contrato));
        if (filtered.length) matches = filtered;
      }
      if (!matches.length && hintBill) {
        matches = [{
          id: hintBill.documentNumber || hintBill.id,
          customerId,
          receivableBillId: hintBill.id || titulo,
          enterpriseId: hintBill.enterpriseCode || hintBill.enterpriseId,
          unitId: "U-" + (hintBill.enterpriseCode || hintBill.enterpriseId || "0") + "-" + String(hintBill.unityName || hintBill.unitName || "ND").replace(/\s+/g, ""),
          saleDate: hintBill.issueDate || hintBill.emissionDate,
          contractValue: hintBill.receivableBillValue || hintBill.value,
          status: "Ativo",
          customers: []
        }];
      }
      if (!matches.length) throw new Error("Nenhum contrato encontrado para este cliente.");

      RelacionamentoState.escrituraMatches = matches;
      if (matches.length === 1) {
        await this.selecionarEscritura(0);
        return;
      }
      const rows = matches.map((s, idx) => {
        const quadraLote = String(s.unitId || "").split("-").slice(2).join("-") || "—";
        const valor = Number(s.contractValue || s.updatedContractValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return `<tr>
          <td>${s.receivableBillId || "—"}</td>
          <td>${s.id || "—"}</td>
          <td>${quadraLote}</td>
          <td>${s.status || "—"}</td>
          <td>${valor}</td>
          <td><button type="button" class="btn btn-outline" onclick="RelacionamentoApp.selecionarEscritura(${idx})">Selecionar</button></td>
        </tr>`;
      }).join("");
      this._escSetResultsHtml(`
        <p style="font-size:0.9rem;color:#475569;margin:0 0 8px;">Vários contratos encontrados. Escolha um:</p>
        <div class="table-responsive"><table class="data-table">
          <thead><tr><th>Título</th><th>Contrato</th><th>Unidade</th><th>Status</th><th>Valor</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`);
    } catch (err) {
      console.error(err);
      this._escSetResultsHtml(`<div style="padding:12px;color:#b91c1c;">${err.message || "Erro ao buscar."}</div>`);
    }
  },

  async selecionarEscritura(idx) {
    const sale = (RelacionamentoState.escrituraMatches || [])[idx];
    if (!sale) return;
    this._escSetResultsHtml(`<div style="padding:16px;text-align:center;color:var(--color-text-muted);">Carregando dados do lote e do contrato...</div>`);
    try {
      const customerId = sale.customerId;
      let customer = {};
      if (window.SiengeApiService && SiengeApiService.getCustomer) {
        customer = await SiengeApiService.getCustomer(customerId);
      }
      if (typeof window.enrichCustomerForLegalDocs === "function") {
        customer = await window.enrichCustomerForLegalDocs(customer);
      }
      const unitParts = String(sale.unitId || "").split("-");
      const unitName = unitParts.slice(2).join("-");
      const enterpriseId = sale.enterpriseId || sale.costCenterId || unitParts[1];
      let unit = (typeof AppState !== "undefined" && AppState.units && AppState.units[sale.unitId]) || null;
      if (!unit && window.SiengeApiService && SiengeApiService.getUnit) {
        unit = await SiengeApiService.getUnit(sale.unitId).catch(() => null);
      }
      unit = unit || { id: sale.unitId, block: "N/D", lot: "N/D", area: 0 };
      let unitDetails = null;
      if (window.SiengeApiService && SiengeApiService.getUnitDetails && enterpriseId && unitName) {
        const det = await SiengeApiService.getUnitDetails(enterpriseId, unitName).catch(() => null);
        if (det && det.results && det.results.length) unitDetails = det.results[0];
      }
      let bill = null;
      if (sale.receivableBillId) {
        try {
          bill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(sale.receivableBillId));
        } catch (e) { bill = null; }
      }
      const block = unit.block && unit.block !== "N/D" ? unit.block : (unitName.split("-")[0] || "");
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : (unitName.split("-").slice(1).join("-") || unitName);
      const empName = window.resolveLoteamentoName ? window.resolveLoteamentoName(unit, sale) : "";
      const cidadeLote = window.resolveCidadeLoteamento ? window.resolveCidadeLoteamento(unit, sale) : "";
      const areaNum = unitDetails?.privateArea || unitDetails?.Privatearea || unit.area || "";
      const areaStr = areaNum === "" || areaNum == null
        ? ""
        : (String(areaNum).match(/m/) ? String(areaNum) : Number(areaNum).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²");
      const localizacao = [
        "Lote nº " + (lot || "____") + " da quadra " + (block || "____") + " do loteamento " + (empName || "____") + ",",
        "situado no município de " + (cidadeLote || "____") + ",",
        areaStr ? ("com área de " + areaStr + ".") : ""
      ].filter(Boolean).join(" ");
      const cidadeCartorio = cidadeLote
        ? (String(cidadeLote).includes("/") ? cidadeLote : cidadeLote + "/SP")
        : "";
      RelacionamentoState.escritura = { customer, sale, unit, unitDetails, bill, empName, cidadeLote };
      document.getElementById("esc-cidade-cartorio").value = cidadeCartorio;
      document.getElementById("esc-localizacao").value = localizacao;
      document.getElementById("esc-bancos").value = "";
      const titulo = sale.receivableBillId || bill?.id || "—";
      const valor = Number(sale.contractValue || sale.updatedContractValue || bill?.receivableBillValue || 0);
      const valorFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      document.getElementById("esc-contrato-resumo").innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.9rem;">
          <div><span style="color:#64748b;">Cliente</span><br><strong>${customer.name || "—"}</strong></div>
          <div><span style="color:#64748b;">Título</span><br><strong>${titulo}</strong></div>
          <div><span style="color:#64748b;">Contrato</span><br><strong>${sale.id || "—"}</strong></div>
          <div><span style="color:#64748b;">Unidade</span><br><strong>${block && lot ? (block + " - " + lot) : (unitName || "—")}</strong></div>
          <div><span style="color:#64748b;">Valor</span><br><strong>${valorFmt}</strong></div>
        </div>`;
      document.getElementById("esc-doc-card").style.display = "block";
      this._escSetResultsHtml("");
    } catch (err) {
      console.error(err);
      this._escSetResultsHtml(`<div style="padding:12px;color:#b91c1c;">${err.message || "Não foi possível carregar o contrato."}</div>`);
    }
  },

  async gerarEscrituraPdf() {
    const ctx = RelacionamentoState.escritura;
    if (!ctx || !ctx.sale) {
      alert("Busque e selecione um contrato antes de gerar o documento.");
      return;
    }
    try {
      let t = {};
      try { t = JSON.parse(localStorage.getItem("crm_docpadrao_escritura") || "{}"); } catch (e) {}
      const titleEl = document.getElementById("doc-escritura-title");
      const corpoEl = document.getElementById("doc-escritura-corpo");
      const docTitle = (titleEl && titleEl.value) || t["doc-escritura-title"] || "AUTORIZAÇÃO PARA LAVRATURA DE ESCRITURA";
      let corpo = (corpoEl && corpoEl.value) || t["doc-escritura-corpo"] || "";
      if (!corpo) {
        alert("O modelo de autorização não está preenchido. Salve-o em Configurações → Documentos padrões.");
        return;
      }
      const { customer, sale, unit, unitDetails, bill, empName, cidadeLote } = ctx;
      const block = unit.block && unit.block !== "N/D" ? unit.block : "";
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : "";
      const unitName = String(sale.unitId || "").split("-").slice(2).join("-");
      const quadraLote = (block && lot) ? (block + " - " + lot) : (unitName || "____");
      const unitNumericId = unitDetails?.id || (unit.id && !String(unit.id).startsWith("U-") ? unit.id : "");
      const titulo = sale.receivableBillId || bill?.id || "____";
      const matriculaRaw = unitDetails?.legalRegistrationNumber || unitDetails?.legalregistrationnumber || "";
      const matriculaNum = String(matriculaRaw || "").replace(/\D/g, "");
      const matricula = matriculaNum
        ? Number(matriculaNum).toLocaleString("pt-BR")
        : (matriculaRaw || "____");
      const areaNum = unitDetails?.privateArea || unitDetails?.Privatearea || unit.area || "";
      const areaLabel = areaNum === "" || areaNum == null ? "____" : (String(areaNum).match(/m/) ? String(areaNum) : (Number(areaNum).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²"));
      const areaExt = areaNum && !isNaN(Number(areaNum))
        ? ((typeof numeroPorExtenso === "function" ? numeroPorExtenso(areaNum) : String(areaNum)) + " metros quadrados")
        : "____";
      const valor = Number(sale.contractValue || sale.updatedContractValue || bill?.receivableBillValue || 0);
      const valorFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const valorExt = typeof valorPorExtensoBRL === "function" ? valorPorExtensoBRL(valor) : "";
      const custs = sale.customers || sale.salesContractCustomers || [];
      const mine = custs.find((c) => String(c.id || c.customerId) === String(customer.id)) || custs.find((c) => c.main) || null;
      const pct = mine && (mine.percentage != null || mine.participationPercentage != null)
        ? Number(mine.percentage != null ? mine.percentage : mine.participationPercentage)
        : (custs.length <= 1 ? 100 : null);
      const pctLabel = pct != null && !isNaN(pct) ? " (" + pct + "%)" : "";
      const cidadeCartorio = (document.getElementById("esc-cidade-cartorio")?.value || "").trim() || ((cidadeLote || "____") + (String(cidadeLote || "").includes("/") ? "" : "/SP"));
      const localizacao = (document.getElementById("esc-localizacao")?.value || "").trim() || "____";
      const bancos = (document.getElementById("esc-bancos")?.value || "").trim() || "conforme extrato anexo";
      const dateExt = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      const saleDateRaw = sale.saleDate || sale.contractDate || bill?.issueDate;
      let saleDateStr = "____";
      if (saleDateRaw) {
        const iso = String(saleDateRaw).slice(0, 10);
        saleDateStr = /^\d{4}-\d{2}-\d{2}/.test(iso)
          ? iso.split("-").reverse().join("/")
          : new Date(String(saleDateRaw).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
      }
      let preambleText = "";
      if (typeof window.getPreambleForContract === "function") {
        preambleText = window.getPreambleForContract(unit, sale) || "";
      }
      const legalBase = window.buildLegalDocVarMap(customer, sale, unit, {
        preambleText,
        empName,
        cidadeLote,
        saleDateStr,
        dateExt,
        map: {
          CIDADE_CARTORIO: cidadeCartorio,
          QUADRA_LOTE: quadraLote,
          LOCALIZACAO: localizacao,
          MATRICULA: matricula,
          AREA_LOTE: areaLabel,
          AREA_LOTE_EXTENSO: areaExt,
          VALOR_CONTRATO: valorFmt,
          VALOR_CONTRATO_EXTENSO: valorExt,
          PERCENTUAL_CLIENTE: pctLabel,
          DADOS_BANCARIOS: bancos,
          NUM_CONTRATO: sale.id || "____",
          NUMERO_CONTRATO: sale.id || "____",
          TITULO: titulo,
          UNIDADE: unitNumericId || quadraLote
        }
      });
      const markup = typeof window.formatDocPadraoMarkup === "function" ? window.formatDocPadraoMarkup(corpo) : corpo;
      const fillVars = typeof window.applyDistratoTemplateVars === "function"
        ? window.applyDistratoTemplateVars
        : function (text, map) {
            let s = String(text || "");
            Object.keys(map || {}).forEach((key) => {
              s = s.replace(new RegExp("\\{\\{" + key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\}\\}", "g"), map[key] == null ? "" : String(map[key]));
            });
            return s;
          };
      const filled = fillVars(markup, legalBase);
      const headerUnidade = [unitNumericId, "Quadra-Lote: " + quadraLote].filter(Boolean).join(" - ");
      const docHtml = `
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:10pt;color:#334155;margin-bottom:4px;">${headerUnidade}</div>
          <div style="font-size:10pt;color:#334155;margin-bottom:10px;">Título ${titulo}</div>
          <h2 style="color:#105436;font-size:13pt;font-weight:bold;margin:0;">${docTitle}</h2>
        </div>
        <div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:1.5;text-align:justify;white-space:pre-wrap;">${filled}</div>
        <div style="border:1.5px solid #105436;padding:12px 14px;margin-top:2rem;font-size:10pt;">
          <p style="margin:0 0 10px;font-weight:bold;">ATENÇÃO: Senhor tabelião, após a lavratura da escritura, favor preencher:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;">
            <div>Livro nº ________________________</div>
            <div>Folha nº ________________________</div>
            <div>Matrícula nº ____________________</div>
            <div>Data ____ / ____ / ________</div>
          </div>
        </div>`;
      document.getElementById("pdf-modal-title").textContent = "Autorização para lavratura de escritura";
      document.getElementById("pdf-document-content").innerHTML = docHtml;
      document.getElementById("pdf-view-overlay").classList.add("active");
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error("Erro ao gerar autorização de escritura", err);
      alert("Não foi possível gerar a autorização. Verifique o modelo em Documentos padrões e tente de novo.");
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    RelacionamentoApp.init();
  }, 500);
});
