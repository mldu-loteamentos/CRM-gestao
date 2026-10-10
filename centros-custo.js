const CentrosCustoState = {
  costCenters: [],
  companies: [],
  customFields: {},
  loading: false,
  selectedFilterIds: [], // IDs of cost centers to show (empty = show all)
  somenteParceiros: false,
  contasPorEmpresa: {},
  tiposCc: [
    'Loteamento Aberto', 'Loteamento Fechado', 'Incorporação', 'Frota',
    'Corporativo', 'Diretoria', 'Sócios', 'Contrapartida'
  ]
};
window.CentrosCustoState = CentrosCustoState;

const CentrosCustoApp = {
  async loadData(forceRefresh = false) {
    CentrosCustoState.loading = true;
    this.render();

    try {
      const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
      const port = 3000;
      
      const localCustom = localStorage.getItem('crm_centros_custo_custom');
      if (localCustom) {
        try {
          CentrosCustoState.customFields = (typeof window.parseCentrosCustoCustomMap === "function")
            ? window.parseCentrosCustoCustomMap(localCustom)
            : (JSON.parse(localCustom) || {});
        } catch(e) { console.error("Erro ao ler customFields", e); }
      }

      const localTipos = localStorage.getItem('crm_centros_custo_tipos');
      if (localTipos) {
        try {
          CentrosCustoState.tiposCc = JSON.parse(localTipos);
        } catch(e) {}
      }
      if (!CentrosCustoState.tiposCc.includes('Incorporação')) {
        CentrosCustoState.tiposCc.splice(2, 0, 'Incorporação');
        localStorage.setItem('crm_centros_custo_tipos', JSON.stringify(CentrosCustoState.tiposCc));
      }

      // Fetch Cost Centers
      let ccList = await SiengeApiService.getCostCenters(forceRefresh);
      ccList.sort((a, b) => a.id - b.id);
      CentrosCustoState.costCenters = ccList;
      
      let customFieldsChanged = false;
      ccList.forEach(cc => {
          const idStr = String(cc.id);
          if (!CentrosCustoState.customFields[cc.id]) {
              CentrosCustoState.customFields[cc.id] = { cc_id: cc.id };
          }
          
          const custom = CentrosCustoState.customFields[cc.id];
          
          if (!custom.tipo_cc) {
              if (idStr.startsWith('1')) {
                  custom.tipo_cc = 'Loteamento Aberto';
                  custom.imposto_pago_empresa = true;
                  custom.perc_ml = 100;
                  custom.perc_terrenista = 0;
                  customFieldsChanged = true;
              } else if (idStr.startsWith('6') || idStr.startsWith('7') || idStr.startsWith('9')) {
                  custom.tipo_cc = 'Corporativo';
                  custom.perc_ml = 100;
                  customFieldsChanged = true;
              }
          }
      });
      
      if (customFieldsChanged) {
          this.gravarLocal(JSON.stringify(CentrosCustoState.customFields));
      }
      
      // Load companies
      CentrosCustoState.companies = await SiengeApiService.getCompanies();
      await this.carregarContasParceria({ enviarLocais: true });

    } catch (e) {
      console.error(e);
      alert("Erro ao carregar centros de custo: " + e.message);
    } finally {
      CentrosCustoState.loading = false;
      this.render();
    }
  },

  addFilter(id) {
    if (!CentrosCustoState.selectedFilterIds.includes(id)) {
        CentrosCustoState.selectedFilterIds.push(id);
        this.render();
    }
  },

  removeFilter(id) {
    CentrosCustoState.selectedFilterIds = CentrosCustoState.selectedFilterIds.filter(fid => fid !== id);
    this.render();
  },

  /** Rateio Moura Leite + Terrenista fecha em 100%: o campo digitado completa o outro. */
  completarRateio(id, origem) {
    const el = document.getElementById(`edit-perc-${origem}-${id}`);
    const outro = document.getElementById(`edit-perc-${origem === 'ml' ? 'terrenista' : 'ml'}-${id}`);
    if (!el || !outro) return;
    const txt = String(el.value || '').trim();
    if (txt === '') return;
    let v = parseFloat(txt);
    if (!Number.isFinite(v)) return;
    if (v > 100) { v = 100; el.value = '100'; }
    if (v < 0) { v = 0; el.value = '0'; }
    outro.value = String(Number((100 - v).toFixed(2)));
  },

  async saveCustom(id) {
    const key = String(id);
    const percMl = parseFloat(document.getElementById(`edit-perc-ml-${id}`).value) || 0;
    const percTerr = parseFloat(document.getElementById(`edit-perc-terrenista-${id}`).value) || 0;
    const par = this.parDoRateio(CentrosCustoState.costCenters.find(c => String(c.id) === key));
    if (par) {
      const v = par.papel === 'ml' ? percMl : percTerr;
      if (v < 0 || v > 100) {
        alert(`O percentual ${par.papel === 'ml' ? 'da Moura Leite' : 'do terrenista'} precisa ficar entre 0% e 100%.`);
        return;
      }
    } else if ((percMl || percTerr) && Math.abs(percMl + percTerr - 100) > 0.009) {
      alert(`O rateio precisa totalizar 100%. Hoje está em ${Number((percMl + percTerr).toFixed(2)).toLocaleString('pt-BR')}% (Moura Leite ${percMl.toLocaleString('pt-BR')}% + Terrenista ${percTerr.toLocaleString('pt-BR')}%).`);
      return;
    }
    const custom = Object.assign(
      {},
      CentrosCustoState.customFields[id] || CentrosCustoState.customFields[key] || { cc_id: key }
    );
    
    custom.valor_vgv = parseFloat(document.getElementById(`edit-vgv-${id}`).value) || 0;
    custom.perc_ml = percMl;
    custom.perc_terrenista = percTerr;
    if (par) {
      const parKey = String(par.outro.id);
      const outro = Object.assign({}, this.customOf(parKey), { cc_id: parKey, updatedAt: Date.now() });
      const v = par.papel === 'ml' ? percMl : percTerr;
      if (par.papel === 'ml') {
        custom.perc_terrenista = 0;
        outro.perc_ml = 0;
        if (v > 0) outro.perc_terrenista = Number((100 - v).toFixed(2));
      } else {
        custom.perc_ml = 0;
        outro.perc_terrenista = 0;
        if (v > 0) outro.perc_ml = Number((100 - v).toFixed(2));
      }
      CentrosCustoState.customFields[parKey] = outro;
      CentrosCustoState.customFields[par.outro.id] = outro;
    }
    const tipoCcEl = document.getElementById(`edit-tipo-cc-${id}`);
    if (tipoCcEl) custom.tipo_cc = tipoCcEl.value;

    const impostoPagoEl = document.getElementById(`edit-imposto-pago-${id}`);
    if (impostoPagoEl) custom.imposto_pago_empresa = impostoPagoEl.checked;

    const suspensivaAtivaEl = document.getElementById(`edit-suspensiva-ativa-${id}`);
    if (suspensivaAtivaEl) custom.clausula_suspensiva_ativa = suspensivaAtivaEl.checked;

    const suspensivaDiasEl = document.getElementById(`edit-suspensiva-dias-${id}`);
    if (suspensivaDiasEl) {
      const wasDisabled = !!suspensivaDiasEl.disabled;
      if (wasDisabled) suspensivaDiasEl.disabled = false;
      const n = parseInt(String(suspensivaDiasEl.value || "").trim(), 10);
      custom.clausula_suspensiva_dias = (Number.isFinite(n) && n > 0) ? n : 30;
      if (wasDisabled) suspensivaDiasEl.disabled = true;
    }
    const contaEl = document.getElementById(`edit-conta-parceria-${id}`);
    let contaNova;
    // Só mexe na conta quando o usuário trocou a seleção; salvar outros campos não apaga a conta.
    if (contaEl && contaEl.dataset.loaded === "1" && contaEl.value !== (contaEl.dataset.inicial || "")) {
      const cc = CentrosCustoState.costCenters.find(c => String(c.id) === key);
      const contas = CentrosCustoState.contasPorEmpresa[String(cc && (cc.idCompany || cc.companyId))] || [];
      const picked = contas.find(a => a.key === contaEl.value);
      contaNova = picked ? { id: picked.id, numero: picked.numero, nome: picked.nome, banco: picked.banco, agencia: picked.agencia } : null;
      custom.conta_parceria = contaNova;
      custom.conta_parceria_at = Date.now();
    }
    custom.updatedAt = Date.now();
    custom.cc_id = key;

    const isIncorp = String(custom.tipo_cc || '') === 'Incorporação';
    const lotesPropriosEl = document.getElementById(`edit-incorp-lotes-proprios-${id}`);
    custom.incorporacao_lotes_proprios = isIncorp && !!(lotesPropriosEl && lotesPropriosEl.checked);
    const lotesTipoEl = document.querySelector(`input[name="edit-incorp-lotes-tipo-${id}"]:checked`);
    custom.incorporacao_lotes_tipo = (isIncorp && custom.incorporacao_lotes_proprios && lotesTipoEl)
      ? lotesTipoEl.value
      : '';
    if (isIncorp && custom.incorporacao_lotes_proprios) {
      const checks = document.querySelectorAll(`.edit-incorp-excecao-${id}:checked`);
      custom.incorporacao_lotes_excecao = Array.from(checks).map((chk) => ({
        id: chk.getAttribute('data-unit-id') || '',
        name: chk.getAttribute('data-unit-name') || chk.value || ''
      })).filter((x) => x.name);
    } else {
      custom.incorporacao_lotes_excecao = [];
    }

    CentrosCustoState.customFields[key] = custom;
    CentrosCustoState.customFields[id] = custom;
    this.gravarLocal(JSON.stringify(CentrosCustoState.customFields));

    if (contaNova !== undefined) {
      let gravouNuvem = false;
      try {
        custom.conta_parceria_at = await this.gravarContaParceria(key, contaNova);
        gravouNuvem = true;
      } catch (e) {
        console.error("[CentrosCusto] gravar conta de parceria", e);
        alert("Não consegui gravar a conta de parceria no Firebase (" + (e.message || e) + "). Tente salvar de novo.");
      }
      if (gravouNuvem) {
        CentrosCustoState.customFields[key] = custom;
        this.gravarLocal(JSON.stringify(CentrosCustoState.customFields));
      }
    }
    this.closeModal();
    this._ultimoSalvo = key;
    this.render();
    this.refreshCobrancaViews();
    if (typeof window.persistCentrosCustoCustomToFirebase === "function") {
      window.persistCentrosCustoCustomToFirebase().catch((e) => {
        console.warn("[CentrosCusto] persist nuvem:", e);
      });
    } else if (window.forceUploadLocalConfig) {
      window.forceUploadLocalConfig(true).catch(() => {});
    }
  },

  refreshCobrancaViews() {
    try {
      if (window.AppState) window.AppState.dashboardRendered = false;
      const zeroPane = document.getElementById("tab-zeropaid");
      const zeroVisible = zeroPane && (zeroPane.classList.contains("active") || (zeroPane.style && String(zeroPane.style.display).indexOf("block") >= 0));
      if (zeroVisible && typeof loadZeroPaidTab === "function") loadZeroPaidTab();
      if (typeof loadDashboardData === "function" && document.getElementById("tab-dashboard")) {
        const dash = document.getElementById("tab-dashboard");
        const dashVisible = dash && (dash.classList.contains("active") || (dash.style && String(dash.style.display).indexOf("block") >= 0));
        if (dashVisible) loadDashboardData();
      }
    } catch (e) {}
  },

  customOf(id) {
    const map = CentrosCustoState.customFields || {};
    return map[id] || map[String(id)] || {};
  },

  /** CC Corporativo não segue a regra de parceria, mesmo com "parceiro/parceria" no nome. */
  isCorporativo(cc) {
    return !!cc && String(this.customOf(cc.id).tipo_cc || "") === "Corporativo";
  },

  isParceiro(cc) {
    return /parce(ir|ri)/i.test(String((cc && cc.name) || "")) && !this.isCorporativo(cc);
  },

  escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  /**
   * Obra com CC exclusivo da Moura Leite (14000) e CC exclusivo do parceiro (14001):
   * o % Moura Leite fica no CC da obra, o % Terrenista no de parceria, e os dois somam 100%.
   * Só forma par dentro da mesma empresa: obra que virou SPE mantém o CC antigo (ex.: 14200 na empresa 1) fora do par.
   */
  parDoRateio(cc) {
    if (!cc) return null;
    const id = String(cc.id);
    const obra = id.slice(0, -2);
    if (!obra) return null;
    const empresa = (c) => String((c && (c.idCompany || c.companyId)) || "");
    const mesmos = (CentrosCustoState.costCenters || []).filter(c => String(c.id).slice(0, -2) === obra && String(c.id) !== id && empresa(c) === empresa(cc));
    const baseDe = (lista) => lista.find(c => String(c.id) === obra + "00" && !this.isParceiro(c)) || lista.find(c => !this.isParceiro(c));
    if (this.isParceiro(cc)) {
      const base = baseDe(mesmos);
      return base ? { papel: "parceiro", outro: base } : null;
    }
    const parc = mesmos.find(c => this.isParceiro(c));
    const base = baseDe(mesmos.concat([cc]).sort((a, b) => Number(a.id) - Number(b.id)));
    return parc && base && String(base.id) === id ? { papel: "ml", outro: parc } : null;
  },

  contaLabel(c) {
    if (!c) return "";
    return [c.banco ? "Banco " + c.banco : "", c.agencia ? "Ag. " + c.agencia : "", c.numero ? "C/C " + c.numero : "", c.nome || ""]
      .filter(Boolean).join(" · ");
  },

  /* Caches que o próprio Integra refaz; a fila do dia (crm_daily_queue_cache_v5) não entra. */
  CACHES_DESCARTAVEIS: [
    "crm_geocache", "crm_estoque_posicao_v1", "crm_obra_vgv_cache", "crm_plano_reembolsaveis_cache", "crm_broker_names_v1",
    "crm_daily_queue_cache_v4", "crm_daily_queue_cache_v3", "crm_daily_queue_cache_v2"
  ],

  /* Cópia local dos campos do CC. Com o armazenamento do navegador cheio, apaga caches refazíveis e tenta de novo. */
  gravarLocal(json) {
    const gravar = () => {
      const orig = window._originalSetItem;
      if (typeof orig === "function") orig.call(localStorage, "crm_centros_custo_custom", json);
      else localStorage.setItem("crm_centros_custo_custom", json);
    };
    try {
      gravar();
      return true;
    } catch (e) {
      if (!/quota|exceeded/i.test(String((e && (e.name + " " + e.message)) || e))) {
        console.warn("[CentrosCusto] cópia local", e);
        return false;
      }
    }
    for (const k of this.CACHES_DESCARTAVEIS) {
      try { localStorage.removeItem(k); } catch (e) {}
      try {
        gravar();
        return true;
      } catch (e) {}
    }
    console.warn("[CentrosCusto] armazenamento do navegador cheio; os campos do CC ficam só na nuvem");
    return false;
  },

  /* Conta de parceria: um documento por centro de custo em cc_conta_parceria (fonte da verdade). */
  CONTA_COLLECTION: "cc_conta_parceria",

  usuarioAtual() {
    try {
      const u = window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser();
      return (u && (u.name || u.email)) || "";
    } catch (e) {
      return "";
    }
  },

  async gravarContaParceria(ccId, conta) {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) throw new Error("Firebase indisponível.");
    const limpa = conta ? JSON.parse(JSON.stringify({
      id: conta.id || "", numero: conta.numero || "", nome: conta.nome || "", banco: conta.banco || "", agencia: conta.agencia || ""
    })) : null;
    const at = Date.now();
    await fc.setDoc(fc.doc(window.firebaseDb, this.CONTA_COLLECTION, String(ccId)), {
      cc_id: String(ccId), conta: limpa, updatedAt: at, updatedBy: this.usuarioAtual()
    });
    return at;
  },

  /** Lê as contas do Firebase e aplica no mapa local; envia para o Firebase as que só existem neste navegador. */
  async carregarContasParceria(opts) {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.getDocs) return {};
    let remoto = {};
    try {
      const snap = await fc.getDocs(fc.collection(window.firebaseDb, this.CONTA_COLLECTION));
      snap.forEach((d) => { remoto[d.id] = d.data() || {}; });
    } catch (e) {
      console.warn("[CentrosCusto] contas de parceria no Firebase:", e);
      return {};
    }
    const parse = window.parseCentrosCustoCustomMap || ((r) => { try { return JSON.parse(r || "{}") || {}; } catch (e) { return {}; } });
    const map = parse(localStorage.getItem("crm_centros_custo_custom") || "{}");
    const mem = CentrosCustoState.customFields || {};
    let mudou = false;
    const aplicar = (alvo, id, r) => {
      const rec = alvo[id] || (alvo[id] = { cc_id: id });
      if (Number(r.updatedAt || 0) < Number(rec.conta_parceria_at || 0)) return false;
      const antes = JSON.stringify(rec.conta_parceria || null);
      rec.conta_parceria = r.conta || null;
      rec.conta_parceria_at = Number(r.updatedAt) || Date.now();
      return antes !== JSON.stringify(rec.conta_parceria);
    };
    Object.keys(remoto).forEach((id) => {
      if (aplicar(map, id, remoto[id])) mudou = true;
      if (mem !== map) aplicar(mem, id, remoto[id]);
    });
    if (mudou) this.gravarLocal(JSON.stringify(map));
    if (opts && opts.enviarLocais) {
      const pendentes = Object.keys(map).filter((id) => {
        const c = map[id] && map[id].conta_parceria;
        return c && (c.id || c.numero) && !remoto[id];
      });
      for (const id of pendentes) {
        try {
          const at = await this.gravarContaParceria(id, map[id].conta_parceria);
          remoto[id] = { conta: map[id].conta_parceria, updatedAt: at };
        } catch (e) {
          console.warn("[CentrosCusto] envio da conta de parceria", id, e);
          break;
        }
      }
    }
    window._contasParceriaRemotas = remoto;
    return remoto;
  },

  async contasDaEmpresa(companyId) {
    const cid = String(companyId || "");
    if (!cid) return [];
    if (CentrosCustoState.contasPorEmpresa[cid]) return CentrosCustoState.contasPorEmpresa[cid];
    let list = [];
    try {
      const res = await SiengeApiService.getCheckingAccounts(cid);
      list = (res && res.results) || [];
    } catch (e) {
      console.warn("[CentrosCusto] contas correntes:", e);
    }
    const out = list.map(a => {
      const numero = String(a.accountNumber || a.number || a.checkingAccountNumber || "").trim();
      const id = a.id != null ? String(a.id) : (a.checkingAccountId != null ? String(a.checkingAccountId) : "");
      const bank = a.bank && typeof a.bank === "object" ? a.bank : {};
      return {
        key: id || numero,
        id,
        numero,
        nome: String(a.accountName || a.name || a.description || "").trim(),
        banco: String(a.bankNumber || a.bankCode || bank.id || bank.code || bank.number || a.bankId || "").trim(),
        agencia: String(a.agencyNumber || a.agency || a.bankBranch || bank.agency || "").trim()
      };
    }).filter(a => a.key);
    out.sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
    CentrosCustoState.contasPorEmpresa[cid] = out;
    return out;
  },

  async loadContaParceriaSelect(id) {
    const sel = document.getElementById(`edit-conta-parceria-${id}`);
    if (!sel) return;
    const cc = CentrosCustoState.costCenters.find(c => String(c.id) === String(id));
    const companyId = cc && (cc.idCompany || cc.companyId);
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDoc) {
      try {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, this.CONTA_COLLECTION, String(id)));
        if (snap.exists()) {
          const r = snap.data() || {};
          const rec = CentrosCustoState.customFields[String(id)] || (CentrosCustoState.customFields[String(id)] = { cc_id: String(id) });
          if (Number(r.updatedAt || 0) >= Number(rec.conta_parceria_at || 0)) {
            rec.conta_parceria = r.conta || null;
            rec.conta_parceria_at = Number(r.updatedAt) || 0;
          }
        }
      } catch (e) {
        console.warn("[CentrosCusto] conta de parceria", id, e);
      }
    }
    const atual = (this.customOf(id).conta_parceria) || null;
    const contas = await this.contasDaEmpresa(companyId);
    const atualKey = atual ? (atual.id || atual.numero) : "";
    sel.dataset.inicial = atualKey;
    const extra = atual && !contas.some(a => a.key === atualKey)
      ? `<option value="${atualKey}" selected>${this.contaLabel(atual)} (não encontrada no Sienge)</option>`
      : "";
    sel.innerHTML = `<option value="">Nenhuma (paga pela conta padrão da empresa)</option>${extra}` +
      contas.map(a => `<option value="${a.key}" ${a.key === atualKey ? "selected" : ""}>${this.contaLabel(a)}</option>`).join("");
    if (!contas.length) {
      sel.insertAdjacentHTML("beforeend", `<option value="" disabled>Nenhuma conta corrente ativa encontrada na empresa ${companyId || "?"}</option>`);
    }
    sel.disabled = false;
    sel.dataset.loaded = "1";
  },

  syncIncorporacaoUi(id) {
    const tipoEl = document.getElementById(`edit-tipo-cc-${id}`);
    const panel = document.getElementById(`edit-incorp-panel-${id}`);
    if (!panel) return;
    const isIncorp = tipoEl && String(tipoEl.value) === 'Incorporação';
    panel.style.display = isIncorp ? 'block' : 'none';
    if (isIncorp) this.syncIncorporacaoLotesSub(id);
  },

  syncIncorporacaoLotesSub(id) {
    const onEl = document.getElementById(`edit-incorp-lotes-proprios-${id}`);
    const sub = document.getElementById(`edit-incorp-lotes-sub-${id}`);
    if (!sub) return;
    const on = !!(onEl && onEl.checked);
    sub.style.display = on ? 'block' : 'none';
    if (on) this.loadIncorporacaoUnitsList(id);
  },

  normalizeUnitKey(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  },

  async loadIncorporacaoUnitsList(id) {
    const listEl = document.getElementById(`edit-incorp-lotes-list-${id}`);
    const statusEl = document.getElementById(`edit-incorp-lotes-status-${id}`);
    if (!listEl) return;
    const custom = CentrosCustoState.customFields[id] || {};
    const selected = new Set(
      (Array.isArray(custom.incorporacao_lotes_excecao) ? custom.incorporacao_lotes_excecao : [])
        .map((x) => this.normalizeUnitKey(typeof x === 'string' ? x : (x && x.name)))
        .filter(Boolean)
    );
    if (listEl.dataset.loaded === String(id) && listEl.querySelectorAll('label').length) {
      return;
    }
    if (statusEl) statusEl.textContent = 'Carregando lotes do empreendimento...';
    listEl.innerHTML = `<div style="padding:12px;color:#64748b;font-size:0.8rem;">Buscando unidades no Sienge...</div>`;
    try {
      let units = [];
      if (window.EstoqueComercialApp && Array.isArray(EstoqueComercialApp.state && EstoqueComercialApp.state.units)) {
        units = EstoqueComercialApp.state.units
          .filter((u) => String(u.enterpriseId) === String(id))
          .map((u) => ({ id: u.id || u.unitId || '', name: u.name || u.unitName || '' }));
      }
      if (!units.length && typeof siengeFetchWithRetry === 'function') {
        const collected = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const path = `/units?limit=200&offset=${offset}&enterpriseId=${encodeURIComponent(id)}&additionalData=NONE`;
          const data = await siengeFetchWithRetry(path);
          const results = (data && data.results) || [];
          results.forEach((u) => collected.push({
            id: u.id != null ? String(u.id) : '',
            name: u.name || u.commercialName || `Unidade ${u.id || ''}`
          }));
          if (results.length < 200) hasMore = false;
          else offset += results.length;
          if (offset > 5000) break;
        }
        units = collected;
      }
      units = units
        .filter((u) => u && u.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
      if (!units.length) {
        listEl.innerHTML = `<div style="padding:12px;color:#9a3412;font-size:0.8rem;">Nenhum lote encontrado para este empreendimento.</div>`;
        if (statusEl) statusEl.textContent = 'Sem lotes';
        return;
      }
      listEl.dataset.loaded = String(id);
      listEl.innerHTML = units.map((u) => {
        const key = this.normalizeUnitKey(u.name);
        const checked = selected.has(key) ? 'checked' : '';
        const safeName = String(u.name).replace(/"/g, '&quot;');
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:0.8rem;cursor:pointer;">
            <input type="checkbox" class="edit-incorp-excecao-${id}" data-unit-id="${u.id}" data-unit-name="${safeName}" value="${safeName}" ${checked} style="width:15px;height:15px;accent-color:#105436;">
            <span>${u.name}</span>
          </label>`;
      }).join('');
      if (statusEl) statusEl.textContent = `${units.length} lote(s) · marque os que estão fora da incorporação (ainda notificam)`;
    } catch (e) {
      console.error('Erro ao carregar lotes Incorporação:', e);
      listEl.innerHTML = `<div style="padding:12px;color:#b91c1c;font-size:0.8rem;">Falha ao carregar lotes. Tente novamente.</div>`;
      if (statusEl) statusEl.textContent = 'Erro ao carregar';
    }
  },

  filterIncorporacaoLotes(id, q) {
    const listEl = document.getElementById(`edit-incorp-lotes-list-${id}`);
    if (!listEl) return;
    const needle = this.normalizeUnitKey(q);
    listEl.querySelectorAll('label').forEach((lab) => {
      const txt = this.normalizeUnitKey(lab.textContent);
      lab.style.display = (!needle || txt.includes(needle)) ? 'flex' : 'none';
    });
  },

  openEditModal(id) {
    const cc = CentrosCustoState.costCenters.find(c => c.id === id);
    if (!cc) return;
    
    const custom = CentrosCustoState.customFields[id]
      || CentrosCustoState.customFields[String(id)]
      || {};
    const vgv = custom.valor_vgv || 0;
    const perc_ml = custom.perc_ml || 0;
    const perc_terrenista = custom.perc_terrenista || 0;
    const tipo_cc = custom.tipo_cc || '';
    const imposto_pago = custom.imposto_pago_empresa === true;
    const suspensiva_ativa = custom.clausula_suspensiva_ativa === true;
    const storedDias = Number(custom.clausula_suspensiva_dias);
    const suspensiva_dias = (Number.isFinite(storedDias) && storedDias > 0)
      ? storedDias
      : ((typeof window.clausulaSuspensivaDias === "function") ? window.clausulaSuspensivaDias(custom) : 30);
    const incorpLotesProprios = custom.incorporacao_lotes_proprios === true;
    const incorpLotesTipo = custom.incorporacao_lotes_tipo || 'abertos';
    const showIncorp = tipo_cc === 'Incorporação';
    const parceiro = this.isParceiro(cc);
    const par = this.parDoRateio(cc);
    const parCustom = par ? this.customOf(par.outro.id) : {};
    const fmtPct = (n) => String(Number((Number(n) || 0).toFixed(2)));
    let valorMl = perc_ml || '';
    let valorTerr = perc_terrenista || '';
    if (par && par.papel === 'ml') {
      const terrPar = Number(parCustom.perc_terrenista) || 0;
      valorTerr = perc_ml > 0 ? fmtPct(100 - perc_ml) : (terrPar ? fmtPct(terrPar) : '');
      if (!perc_ml && terrPar > 0 && terrPar < 100) valorMl = fmtPct(100 - terrPar);
    } else if (par && par.papel === 'parceiro') {
      const mlPar = Number(parCustom.perc_ml) || 0;
      valorMl = perc_terrenista > 0 ? fmtPct(100 - perc_terrenista) : (mlPar ? fmtPct(mlPar) : '');
      if (!perc_terrenista && mlPar > 0 && mlPar < 100) valorTerr = fmtPct(100 - mlPar);
    }
    const parRotulo = par ? `${par.outro.id} – ${par.outro.name || ''}` : '';

    const modalHtml = `
      <div id="cc-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center;">
        <div style="background: white; border-radius: 8px; width: 720px; max-width: 95%; max-height: 92vh; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--color-primary);">Editar Centro de Custo: ${cc.id} - ${cc.name}</h3>
            <button onclick="CentrosCustoApp.closeModal()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #999;">&times;</button>
          </div>
          <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div>
                <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Valor VGV (R$)</label>
                <input type="number" id="edit-vgv-${id}" class="form-control" step="0.01" value="${vgv}">
                ${(() => {
                  const obra = window.SiengeApiService && SiengeApiService.obraVgvCache ? SiengeApiService.obraVgvCache(id) : null;
                  return obra && obra.vgv > 0
                    ? `<small style="display:block;margin-top:4px;color:#105436;font-weight:600;">VGV na obra (Sienge): ${obra.vgv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — este é o valor usado.</small>`
                    : `<small style="display:block;margin-top:4px;color:#64748b;">A obra no Sienge não tem VGV; vale o valor digitado aqui.</small>`;
                })()}
              </div>
              <div>
                <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Tipo de Centro de Custo</label>
                <div style="display: flex; gap: 8px;">
                  <select id="edit-tipo-cc-${id}" class="form-control" style="flex: 1;" onchange="CentrosCustoApp.syncIncorporacaoUi(${id})">
                    <option value="">Selecione...</option>
                    ${CentrosCustoState.tiposCc.map(t => `<option value="${t}" ${tipo_cc === t ? 'selected' : ''}>${t}</option>`).join('')}
                  </select>
                  <button class="btn btn-outline" style="padding: 0 10px;" onclick="CentrosCustoApp.openManageTiposModal(${id})" title="Gerenciar Tipos">
                    <i data-lucide="settings" style="width: 16px;"></i>
                  </button>
                </div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Percentual Moura Leite (%)</label>
                  <input type="number" id="edit-perc-ml-${id}" class="form-control" step="0.01" min="0" max="100" value="${valorMl}" ${par && par.papel === 'parceiro' ? 'disabled' : ''} oninput="CentrosCustoApp.completarRateio(${id}, 'ml')">
                  ${par && par.papel === 'parceiro' ? `<small style="display:block;margin-top:4px;color:#64748b;">Fica no CC ${this.escHtml(parRotulo)}.</small>` : ''}
                </div>
                <div>
                  <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Percentual Terrenista (%)</label>
                  <input type="number" id="edit-perc-terrenista-${id}" class="form-control" step="0.01" min="0" max="100" value="${valorTerr}" ${par && par.papel === 'ml' ? 'disabled' : ''} oninput="CentrosCustoApp.completarRateio(${id}, 'terrenista')">
                  ${par && par.papel === 'ml' ? `<small style="display:block;margin-top:4px;color:#64748b;">Fica no CC ${this.escHtml(parRotulo)}.</small>` : ''}
                </div>
            </div>
            ${par ? `<p style="margin:-8px 0 0;padding:8px 12px;border-radius:6px;background:#f0fdf4;color:#14532d;font-size:0.8rem;line-height:1.4;">
              Centro de custo exclusivo ${par.papel === 'ml' ? 'da Moura Leite' : 'do parceiro'}: ele é 100% ${par.papel === 'ml' ? 'da Moura Leite' : 'do terrenista'}.
              O percentual aqui é a participação ${par.papel === 'ml' ? 'da Moura Leite' : 'do terrenista'} na obra. A outra parte fica no CC ${this.escHtml(parRotulo)} e é atualizada junto ao salvar, para a obra fechar 100%.
            </p>` : ''}
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="edit-imposto-pago-${id}" ${imposto_pago ? 'checked' : ''} style="width: 16px; height: 16px;">
                <label for="edit-imposto-pago-${id}" style="font-weight: bold; font-size: 0.85rem; cursor: pointer;">Imposto pago pela empresa?</label>
            </div>

            <div id="edit-incorp-panel-${id}" style="display:${showIncorp ? 'block' : 'none'}; padding:14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
              <h4 style="margin:0 0 6px 0; color:#14532d; font-size:0.9rem;">Incorporação</h4>
              <p style="margin:0 0 12px 0; font-size:0.75rem; color:#166534; line-height:1.4;">
                Empreendimentos de incorporação não notificam prefeitura/associação sobre troca de compromissário,
                exceto vendas, distratos e cessões dos lotes marcados abaixo como fora da incorporação.
              </p>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <input type="checkbox" id="edit-incorp-lotes-proprios-${id}" ${incorpLotesProprios ? 'checked' : ''} style="width:16px;height:16px;accent-color:#105436;" onchange="CentrosCustoApp.syncIncorporacaoLotesSub(${id})">
                <label for="edit-incorp-lotes-proprios-${id}" style="font-weight:700; font-size:0.85rem; cursor:pointer; color:#14532d;">Há lotes próprios neste empreendimento?</label>
              </div>
              <div id="edit-incorp-lotes-sub-${id}" style="display:${incorpLotesProprios ? 'block' : 'none'};">
                <div style="margin-bottom:12px;">
                  <div style="font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:6px;">Esses lotes próprios são:</div>
                  <div style="display:flex; gap:16px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                      <input type="radio" name="edit-incorp-lotes-tipo-${id}" value="abertos" ${incorpLotesTipo !== 'fechados' ? 'checked' : ''} style="accent-color:#105436;"> Abertos
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                      <input type="radio" name="edit-incorp-lotes-tipo-${id}" value="fechados" ${incorpLotesTipo === 'fechados' ? 'checked' : ''} style="accent-color:#105436;"> Fechados
                    </label>
                  </div>
                </div>
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Lotes fora da incorporação (exceções que notificam)</label>
                    <span id="edit-incorp-lotes-status-${id}" style="font-size:0.72rem; color:#64748b;"></span>
                  </div>
                  <input type="text" class="form-control" placeholder="Filtrar lote..." style="margin-bottom:8px; font-size:0.85rem;" oninput="CentrosCustoApp.filterIncorporacaoLotes(${id}, this.value)">
                  <div id="edit-incorp-lotes-list-${id}" style="max-height:220px; overflow:auto; background:#fff; border:1px solid #bbf7d0; border-radius:6px;">
                    <div style="padding:12px;color:#64748b;font-size:0.8rem;">Ative “lotes próprios” para carregar a lista.</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style="padding:14px; background:${parceiro ? '#fffbeb' : '#f8fafc'}; border:1px solid ${parceiro ? '#fde68a' : '#e2e8f0'}; border-radius:8px;">
              <h4 style="margin:0 0 6px 0; color:#334155; font-size:0.9rem;">Conta de parceria (pagamento)</h4>
              <p style="margin:0 0 10px 0; font-size:0.75rem; color:#64748b; line-height:1.4;">
                ${parceiro
                  ? 'Este centro de custo é de <strong>parceiro</strong>. Os títulos a pagar dele saem por esta conta em Contas a Pagar → Gerar Pagamento.'
                  : 'Se informada, os títulos a pagar deste centro de custo saem por esta conta em Contas a Pagar → Gerar Pagamento.'}
              </p>
              <select id="edit-conta-parceria-${id}" class="form-control" disabled>
                <option value="">Carregando contas correntes da empresa ${cc.idCompany || cc.companyId || ''}...</option>
              </select>
            </div>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 5px 0;">
            <h4 style="margin: 0; color: #334155; font-size: 0.95rem;">Automações de Cobrança</h4>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="edit-suspensiva-ativa-${id}" ${suspensiva_ativa ? 'checked' : ''} style="width: 16px; height: 16px;" onchange="document.getElementById('edit-suspensiva-dias-${id}').disabled = !this.checked">
                    <label for="edit-suspensiva-ativa-${id}" style="font-weight: bold; font-size: 0.85rem; cursor: pointer; color: #b91c1c;">Habilitar Termo de Cláusula Suspensiva (Sinal)</label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="edit-suspensiva-dias-${id}" style="font-size: 0.85rem; color: #64748b;">Dias pós-vencimento:</label>
                    <input type="number" id="edit-suspensiva-dias-${id}" class="form-control" style="width: 70px; padding: 4px;" value="${suspensiva_dias}" ${!suspensiva_ativa ? 'disabled' : ''}>
                </div>
            </div>
            <p style="margin:0;font-size:0.75rem;color:#64748b;line-height:1.4;">Vale somente para parcela <strong>SI (sinal)</strong> em atraso. Mensalidades e demais tipos seguem a régua normal (NEX 0% inclusive).</p>
          </div>
          <div style="padding: 16px 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
            <button class="btn btn-cancel" onclick="CentrosCustoApp.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="CentrosCustoApp.saveCustom(${id})"><i data-lucide="save" style="width: 14px;"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;
    
    let container = document.getElementById('cc-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cc-modal-container';
        document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
    if (window.lucide) window.lucide.createIcons();
    this.syncIncorporacaoUi(id);
    this.loadContaParceriaSelect(id);
  },

  closeModal() {
    const container = document.getElementById('cc-modal-container');
    if (container) container.innerHTML = '';
  },

  openManageTiposModal(currentCcId) {
    const modalHtml = `
      <div id="tipos-cc-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center;">
        <div style="background: white; border-radius: 8px; width: 400px; max-width: 95%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--color-primary);">Tipos de Centro de Custo</h3>
            <button onclick="CentrosCustoApp.closeManageTiposModal(${currentCcId})" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #999;">&times;</button>
          </div>
          <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px;">
            <div style="display: flex; gap: 8px;">
               <input type="text" id="novo-tipo-cc" class="form-control" placeholder="Novo tipo..." style="flex: 1;">
               <button class="btn btn-primary" onclick="CentrosCustoApp.addTipoCc(${currentCcId})"><i data-lucide="plus" style="width: 16px;"></i></button>
            </div>
            <div id="lista-tipos-cc" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
               ${CentrosCustoState.tiposCc.map((t, idx) => `
                 <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <span style="font-size: 0.9rem;">${t}</span>
                    <button class="btn btn-sm btn-outline" style="color: #ef4444; border-color: #fca5a5; padding: 2px 6px;" onclick="CentrosCustoApp.removeTipoCc(${idx}, ${currentCcId})"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                 </div>
               `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    let container = document.getElementById('tipos-cc-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tipos-cc-modal-container';
        document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
    if (window.lucide) window.lucide.createIcons();
  },

  closeManageTiposModal(currentCcId) {
    const container = document.getElementById('tipos-cc-modal-container');
    if (container) container.innerHTML = '';
    if (currentCcId) {
       const select = document.getElementById(`edit-tipo-cc-${currentCcId}`);
       if (select) {
          const val = select.value;
          select.innerHTML = '<option value="">Selecione...</option>' + 
             CentrosCustoState.tiposCc.map(t => `<option value="${t}" ${val === t ? 'selected' : ''}>${t}</option>`).join('');
          CentrosCustoApp.syncIncorporacaoUi(currentCcId);
       }
    }
  },

  addTipoCc(currentCcId) {
     const input = document.getElementById('novo-tipo-cc');
     if(!input) return;
     const val = input.value.trim();
     if (val && !CentrosCustoState.tiposCc.includes(val)) {
        CentrosCustoState.tiposCc.push(val);
        localStorage.setItem('crm_centros_custo_tipos', JSON.stringify(CentrosCustoState.tiposCc));
        CentrosCustoApp.openManageTiposModal(currentCcId);
     }
  },

  removeTipoCc(idx, currentCcId) {
     if (confirm('Tem certeza que deseja remover este tipo?')) {
        CentrosCustoState.tiposCc.splice(idx, 1);
        localStorage.setItem('crm_centros_custo_tipos', JSON.stringify(CentrosCustoState.tiposCc));
        CentrosCustoApp.openManageTiposModal(currentCcId);
     }
  },

  render() {
    const contentDiv = document.getElementById('centros-custo-content');
    if (!contentDiv) return;
    const rolagemAnterior = contentDiv.querySelector('.cc-scroll');
    if (rolagemAnterior) this._topoLista = rolagemAnterior.scrollTop;

    if (CentrosCustoState.loading) {
      contentDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando centros de custo...</p>
        </div>
      `;
      return;
    }

    let filteredCCs = CentrosCustoState.costCenters;
    if (CentrosCustoState.selectedFilterIds.length > 0) {
        filteredCCs = filteredCCs.filter(c => CentrosCustoState.selectedFilterIds.includes(c.id));
    }
    if (CentrosCustoState.somenteParceiros) {
        filteredCCs = filteredCCs.filter(c => this.isParceiro(c) || this.customOf(c.id).conta_parceria);
    }
    
    // Sort by CC ID ASC
    filteredCCs.sort((a, b) => a.id - b.id);

    let unselectedOptions = CentrosCustoState.costCenters.filter(c => !CentrosCustoState.selectedFilterIds.includes(c.id));

    let filterPills = CentrosCustoState.selectedFilterIds.map(fid => {
        const cc = CentrosCustoState.costCenters.find(c => c.id === fid);
        const name = cc ? cc.name : fid;
        return `<div style="background: #e0e0e0; border-radius: 16px; padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #555;">
            ${fid} - ${name}
            <span style="cursor: pointer; background: #999; color: white; border-radius: 50%; width: 16px; height: 16px; display: inline-flex; justify-content: center; align-items: center; font-size: 10px;" onclick="CentrosCustoApp.removeFilter(${fid})">&times;</span>
        </div>`;
    }).join('');

    let optionsHtml = unselectedOptions.map(c => `<option value="${c.id} - ${c.name}"></option>`).join('');

    let html = `
      <style>
        .empresas-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
        .empresas-table thead th { position: sticky; top: 0; background-color: #1b8253; color: #ffffff; padding: 12px; text-align: left; font-weight: 600; z-index: 10; white-space: nowrap; }
        .empresas-table tbody tr { border-bottom: 1px solid #e0e5e0; }
        .empresas-table tbody tr:nth-child(even) { background-color: #f4f6f4; }
        .empresas-table tbody tr:hover { background-color: #eef2ef; }
        .empresas-table.cc-table tbody tr { transition: background-color .12s ease, box-shadow .12s ease; }
        .empresas-table.cc-table tbody tr:hover { background-color: #d9f2e3; box-shadow: inset 4px 0 0 #105436; }
        .empresas-table.cc-table tbody tr:hover td { color: #0f3d27; }
        .empresas-table.cc-table tbody tr.cc-row-salvo { animation: ccRowSalvo 2.4s ease-out; }
        @keyframes ccRowSalvo { 0%, 40% { background-color: #bbf7d0; } 100% { background-color: transparent; } }
        .empresas-table td { padding: 10px 12px; vertical-align: middle; }
        .cc-filter-container { border: 1px solid #ccc; border-radius: 6px; padding: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: white; min-height: 42px; margin-bottom: 20px;}
        .cc-filter-select { border: none; outline: none; background: transparent; font-size: 0.85rem; flex-grow: 1; min-width: 200px; color: #777;}
      </style>

      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 16px; margin-bottom: 15px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; font-weight:600; color:#334155; cursor:pointer;">
          <input type="checkbox" ${CentrosCustoState.somenteParceiros ? 'checked' : ''} onchange="CentrosCustoState.somenteParceiros=this.checked;CentrosCustoApp.render()" style="width:16px;height:16px;accent-color:#105436;">
          Somente parceiros
        </label>
        <button class="btn btn-primary" style="display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; font-weight: 600; border-radius: 6px; cursor: pointer; border: none;" onclick="CentrosCustoApp.loadData(true)">
          <i data-lucide="refresh-cw" style="width: 16px;"></i> Atualizar
        </button>
      </div>

      <div class="cc-filter-container">
        ${filterPills}
        <input list="cc-datalist" class="cc-filter-select" placeholder="Pesquisar centro de custo ou empresa..." onchange="
          const val = this.value; 
          const match = CentrosCustoState.costCenters.find(c => (c.id + ' - ' + c.name) === val || c.id == val);
          if (match) { CentrosCustoApp.addFilter(match.id); this.value=''; }
        ">
        <datalist id="cc-datalist">
            ${optionsHtml}
        </datalist>
      </div>

      <div class="card" style="overflow: hidden; border-radius: 8px;">
        <div class="cc-scroll" style="max-height: 65vh; overflow-y: auto;">
          <table class="empresas-table cc-table">
            <thead>
              <tr>
                <th style="width: 80px;">ID Empresa</th>
                <th style="width: 80px;">ID CC</th>
                <th style="min-width: 250px;">Centro de Custo</th>
                <th style="width: 150px;">Tipo</th>
                <th style="width: 120px; text-align: right;">Valor VGV</th>
                <th style="width: 150px; text-align: center;">ID Preâmbulo</th>
                <th style="width: 120px; text-align: center;">% Moura Leite</th>
                <th style="width: 120px; text-align: center;">% Terrenista</th>
                <th style="min-width: 180px;">Conta parceria</th>
                <th style="width: 100px; text-align: center;">Ações</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (filteredCCs.length === 0) {
      html += `<tr><td colspan="10" style="text-align: center; padding: 30px;">Nenhum centro de custo para exibir.</td></tr>`;
    }

    const preamblesList = (AppState && AppState.preamblesList) ? AppState.preamblesList : [];
    
    // Sort by CC ID ascending
    filteredCCs.sort((a, b) => a.id - b.id);

    filteredCCs.forEach(cc => {
      const custom = this.customOf(cc.id);
      const vgv = this.vgvCellHtml(cc.id);
      
      const foundPreamble = preamblesList.find(p => p.centrosCustoIds && p.centrosCustoIds.includes(cc.id));
      const preambulo = foundPreamble ? foundPreamble.id : '-';
      
      const percMl = custom.perc_ml ? custom.perc_ml + '%' : '-';
      const percTerr = custom.perc_terrenista ? custom.perc_terrenista + '%' : '-';
      const tipoCc = custom.tipo_cc || '-';
      const exCount = (tipoCc === 'Incorporação' && Array.isArray(custom.incorporacao_lotes_excecao))
        ? custom.incorporacao_lotes_excecao.length
        : 0;
      const tipoBadge = tipoCc === 'Incorporação'
        ? `<span style="background:#ecfdf5;border:1px solid #86efac;padding:2px 6px;border-radius:4px;font-size:0.8rem;color:#166534;">${tipoCc}${exCount ? ` · ${exCount} exc.` : ''}</span>`
        : `<span style="background: #f0f2f5; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #555;">${tipoCc}</span>`;

      html += `
        <tr id="cc-row-${cc.id}">
          <td>${cc.idCompany || cc.companyId || '-'}</td>
          <td><strong>${cc.id}</strong></td>
          <td>${cc.name}</td>
          <td>${tipoBadge}</td>
          <td id="cc-vgv-${cc.id}" style="text-align: right; font-weight: 500; color: #1b8253;">${vgv}</td>
          <td style="text-align: center;">${preambulo}</td>
          <td style="text-align: center;">${percMl}</td>
          <td style="text-align: center;">${percTerr}</td>
          <td style="font-size:0.8rem;">${custom.conta_parceria
            ? `<span style="color:#105436;font-weight:600;">${this.contaLabel(custom.conta_parceria)}</span>`
            : (this.isParceiro(cc) ? `<span style="color:#b91c1c;font-weight:700;">Parceiro sem conta</span>` : '-')}</td>
          <td style="text-align: center;">
             <button class="btn btn-outline btn-sm" onclick="CentrosCustoApp.openEditModal(${cc.id})" style="padding: 4px 10px; font-size: 0.75rem;">
                <i data-lucide="edit-3" style="width: 14px;"></i> Editar
             </button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentDiv.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    const rolagem = contentDiv.querySelector('.cc-scroll');
    if (rolagem && this._topoLista) rolagem.scrollTop = this._topoLista;
    if (this._ultimoSalvo != null) {
      const linha = document.getElementById(`cc-row-${this._ultimoSalvo}`);
      if (linha) linha.classList.add('cc-row-salvo');
      this._ultimoSalvo = null;
    }
    this.preencherVgvObra(filteredCCs);
  },

  /* VGV vem do cadastro da obra no Sienge; o valor digitado aqui só vale quando a obra não tem VGV. */
  vgvDe(id) {
    const obra = window.SiengeApiService && SiengeApiService.obraVgvCache ? SiengeApiService.obraVgvCache(id) : null;
    if (obra && obra.vgv > 0) return { valor: obra.vgv, fonte: 'obra' };
    const manual = parseFloat(this.customOf(id).valor_vgv) || 0;
    if (manual > 0) return { valor: manual, fonte: 'manual' };
    return { valor: 0, fonte: obra ? 'sem' : 'pendente' };
  },

  vgvCellHtml(id) {
    const v = this.vgvDe(id);
    if (!(v.valor > 0)) return '-';
    const txt = v.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return v.fonte === 'obra'
      ? `<span title="VGV do cadastro da obra no Sienge">${txt}</span>`
      : `<span title="Digitado no centro de custo (a obra não tem VGV)" style="color:#64748b;">${txt}</span>`;
  },

  async preencherVgvObra(list) {
    if (!window.SiengeApiService || typeof SiengeApiService.getEnterpriseVgv !== 'function') return;
    const fila = (list || []).map(cc => String(cc.id)).filter(id => !SiengeApiService.obraVgvCache(id));
    const gen = (this._vgvGen = (this._vgvGen || 0) + 1);
    const worker = async () => {
      while (fila.length && gen === this._vgvGen) {
        const id = fila.shift();
        try {
          await SiengeApiService.getEnterpriseVgv(id);
        } catch (e) {
          continue;
        }
        const cell = document.getElementById(`cc-vgv-${id}`);
        if (cell) cell.innerHTML = this.vgvCellHtml(id);
      }
    };
    await Promise.all([worker(), worker()]);
  }
};

function initCentrosCustoModule() {
  const root = document.getElementById('centros-custo-root');
  if (!root) return;

  root.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <div id="centros-custo-content">
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando dados dos centros de custo...</p>
        </div>
      </div>
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();
  
  if (CentrosCustoState.costCenters.length > 0) {
    CentrosCustoApp.render();
  } else {
    CentrosCustoApp.loadData();
  }
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'centros-custo') {
    initCentrosCustoModule();
  }
});

window.CentrosCustoApp = CentrosCustoApp;
window.carregarContasParceriaFirebase = (opts) => CentrosCustoApp.carregarContasParceria(opts);
