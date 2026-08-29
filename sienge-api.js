// Módulo de integração com as APIs GET do Sienge ERP
// Moura Leite Loteamentos - CRM de Cobrança

const SIENGE_CONFIG = {
  domain: "mouraleite",
  user: "mouraleite-contas-a-pagar",
  pass: "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj",
  baseUrl: (() => {
    if (window.location.protocol === "file:") {
      return "/api/sienge-proxy";
    }
    if (window.location.port === "3000") {
      return "/api/sienge-proxy";
    }
    const isLocalHost = window.location.hostname === "localhost" || 
                        window.location.hostname === "127.0.0.1" || 
                        window.location.hostname.startsWith("192.168.") || 
                        window.location.hostname.startsWith("10.");
    if (isLocalHost && window.location.port !== "3000") {
      return "/api/sienge-proxy";
    }
    return "/api/sienge-proxy";
  })()
};

// Empresas permitidas por padrão. Quando estiver parametrizado em "Cobrança Interna",
// a lista passa a seguir o que estiver no crm_empresas_custom; a empresa 1 não pode continuar
// sendo bloqueada por um fallback rígido de [2].
const ALLOWED_COMPANY_IDS = [1, 2];

function getConfiguredInternalCompanyIds() {
  try {
    const localCustom = localStorage.getItem('crm_empresas_custom');
    if (!localCustom) return [...ALLOWED_COMPANY_IDS];

    const customData = JSON.parse(localCustom);
    const isCompanyInternal = (company) => {
      if (!company || typeof company !== 'object') return false;
      const value = company.cobranca_interna;
      return value === 1 || value === true || value === '1' || value === 'true';
    };

    const internalIds = Object.entries(customData)
      .filter(([id, c]) => isCompanyInternal(c))
      .map(([id, c]) => Number(c.company_id ?? c.id ?? id))
      .filter(Number.isFinite);

    if (internalIds.length > 0) {
      return [...new Set(internalIds)];
    }
  } catch (e) {
    console.warn('[Sienge] Erro ao ler crm_empresas_custom para empresas internas:', e);
  }

  return [...ALLOWED_COMPANY_IDS];
}

function getBasicAuthHeader() {
  const credentials = `${SIENGE_CONFIG.user}:${SIENGE_CONFIG.pass}`;
  return "Basic " + btoa(credentials);
}

let s_apiMode = "real";

function setApiMode(mode) {
  // Always use "real" mode
  s_apiMode = "real";
  localStorage.setItem("crm_sienge_api_mode", "real");
}

function getApiMode() {
  return s_apiMode;
}

// -----------------------------------------------
// AUDITORIA DO SISTEMA (Segurança)
// -----------------------------------------------
const AuditService = {
  getLogs: function() {
    try {
      const logs = localStorage.getItem('crm_audit_logs');
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
      return [];
    }
  },
  
  logAction: function(module, endpoint, method, payload) {
    try {
      const logs = this.getLogs();
      const userName = document.getElementById('login-name')?.value || localStorage.getItem('crm_user_name') || 'Desconhecido';
      
      const newLog = {
        id: Date.now() + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        user: userName,
        module: module,
        endpoint: endpoint,
        method: method,
        payload: payload
      };
      
      // Keep only last 500 logs to prevent localStorage quota issues
      logs.unshift(newLog);
      if (logs.length > 500) logs.pop();
      
      localStorage.setItem('crm_audit_logs', JSON.stringify(logs));
    } catch (e) {
      console.error("Erro ao salvar log de auditoria", e);
    }
  },
  
  inferModuleFromUrl: function(url) {
    url = url.toLowerCase();
    if (url.includes('/sales-contracts') || url.includes('/sales-contracts-renegotiations')) return 'Comercial';
    if (url.includes('/payable-bills') || url.includes('/creditors')) return 'Compras/Contas a Pagar';
    if (url.includes('/receivable-bills') || url.includes('/overdue-receivable-bill')) return 'Financeiro';
    if (url.includes('/units') || url.includes('/enterprises')) return 'Engenharia';
    if (url.includes('/tags') || url.includes('/ocr')) return 'GED / Anexos';
    if (url.includes('/relacionamento')) return 'Relacionamento';
    return 'Sistema';
  }
};

// Cache Local via IndexedDB para evitar dependência total do Firebase e limites de Quota
const IdbDefaultersCache = {
    dbName: 'CrmDefaultersDB',
    storeName: 'DefaultersCache',
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore(this.storeName);
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = e => reject(e.target.error);
        });
    },
    async get(key) {
        try {
            const db = await this.openDB();
            if (!db.objectStoreNames.contains(this.storeName)) return null;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch(e) { return null; }
    },
    async set(key, val) {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const req = tx.objectStore(this.storeName).put(val, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch(e) {}
    }
};

// Monkey Patch global fetch to intercept mutating requests
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0].url;
  const options = args[1] || {};
  const method = (options.method || 'GET').toUpperCase();
  
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') && 
      (url.includes('sienge-proxy') || url.includes('/api/') || url.includes('sienge'))) {
      
      let payload = null;
      if (options.body && typeof options.body === 'string') {
          try { payload = JSON.parse(options.body); } catch(e) {}
      } else if (options.body && options.body instanceof FormData) {
          payload = "FormData (Arquivo/Multimídia)";
      }
      
      const moduleName = AuditService.inferModuleFromUrl(url);
      AuditService.logAction(moduleName, url, method, payload);
  }
  
  return await originalFetch.apply(this, args);
};

// -----------------------------------------------
// Fetch base com CORS handling
// -----------------------------------------------
async function siengeFetch(endpoint) {
  if (s_apiMode === "simulado") {
    throw new Error("Chamada de API em Modo Simulado. Use os métodos simulados.");
  }

  let baseUrl = SIENGE_CONFIG.baseUrl;
  if (endpoint.startsWith("/bulk-data/")) {
    if (baseUrl.endsWith("/v1")) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 3);
    }
  }
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": getBasicAuthHeader(),
      "Accept": "application/json",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const err = new Error(`Erro na requisição Sienge ERP: ${response.status} - ${response.statusText}`);
    err.status = response.status;
    err.retryAfter = response.headers.get("Retry-After");
    throw err;
  }

  const text = await response.text();
  if (!text || !String(text).trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Resposta inválida da API Sienge.");
  }
}

// -----------------------------------------------
// Fetch com retry automático em caso de HTTP 429
// -----------------------------------------------
function isSiengeRateLimitError(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  const m = String(err.message || "");
  return m.includes("429") || /rate limit/i.test(m);
}

function siengeRateLimitWaitMs(attempt, retryAfter) {
  const fromHeader = parseInt(retryAfter, 10);
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.min(Math.max(fromHeader * 1000, 2000), 45000);
  }
  return Math.min(4000 * Math.pow(2, attempt), 30000);
}

async function siengeFetchWithRetry(endpoint, retries = 6) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await siengeFetch(endpoint);
    } catch (err) {
      lastError = err;
      if (isSiengeRateLimitError(err) && attempt < retries - 1) {
        const waitMs = siengeRateLimitWaitMs(attempt, err.retryAfter);
        console.warn(`[Sienge] HTTP 429 — aguardando ${waitMs / 1000}s (tentativa ${attempt + 2}/${retries})...`);
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// -----------------------------------------------
// POST base com CORS handling
// -----------------------------------------------
async function siengePost(endpoint, payload, retries = 8, onRetry) {
  if (s_apiMode === "simulado") {
    throw new Error("Chamada de API em Modo Simulado. Use os métodos simulados.");
  }

  let baseUrl = SIENGE_CONFIG.baseUrl;
  if (endpoint.startsWith("/bulk-data/")) {
    if (baseUrl.endsWith("/v1")) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 3);
    }
  }

  const url = `${baseUrl}${endpoint}`;
  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": getBasicAuthHeader(),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errBody = "";
        try { errBody = await response.text(); } catch (e) {}
        const err = new Error(`Erro na requisição Sienge ERP: ${response.status} - ${response.statusText} | ${errBody}`);
        err.status = response.status;
        err.retryAfter = response.headers.get("Retry-After");
        throw err;
      }

      const text = await response.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (err) {
        return { success: true, message: text };
      }
    } catch (err) {
      lastError = err;
      if (isSiengeRateLimitError(err) && attempt < retries - 1) {
        const waitMs = siengeRateLimitWaitMs(attempt, err.retryAfter);
        console.warn(`[Sienge] HTTP 429 POST — aguardando ${waitMs / 1000}s (tentativa ${attempt + 2}/${retries})...`);
        if (typeof onRetry === "function") onRetry(attempt + 2, waitMs, retries);
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// -----------------------------------------------
// Paginação automática sequencial (300ms entre páginas)
// -----------------------------------------------
async function siengeFetchAllPages(baseEndpoint, pageSize = 200) {
  const allResults = [];
  let offset = 0;
  let totalCount = null;
  const sep = baseEndpoint.includes("?") ? "&" : "?";

  do {
    const res = await siengeFetchWithRetry(`${baseEndpoint}${sep}limit=${pageSize}&offset=${offset}`);
    const results = res.results || [];
    if (totalCount === null) {
      totalCount = res.resultSetMetadata?.count ?? results.length;
    }
    allResults.push(...results);
    offset += pageSize;
    if (offset < totalCount) {
      await new Promise(r => setTimeout(r, 600)); // throttle entre páginas
    }
  } while (offset < totalCount);

  return allResults;
}

// Helper local de simulação de antecipação
function runLocalPrepaymentSimulation(saleId, installmentsToPay) {
  const baseDiscountRate = 0.005;
  let totalAmount = 0;
  let totalDiscount = 0;
  installmentsToPay.forEach((inst, index) => {
    const discount = inst.value * (baseDiscountRate * (index + 1));
    totalAmount += inst.value;
    totalDiscount += discount;
  });
  return {
    saleId,
    originalValue: totalAmount,
    discountApplied: totalDiscount,
    finalValue: totalAmount - totalDiscount,
    dueDateSimulated: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  };
}

// -----------------------------------------------
// Interface de Acesso aos Serviços
// -----------------------------------------------
const SiengeApiService = {

  // 1. Empresas
  async getCompanies(forceRefresh = false) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.COMPANIES;
    }
    const cacheKey = 'crm_companies_data';
    const cacheAtKey = 'crm_companies_sync_at';
    let cachedData = [];
    let lastSync = 0;
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) cachedData = JSON.parse(cachedRaw);
      lastSync = Number(localStorage.getItem(cacheAtKey) || 0);
    } catch (e) {}

    const now = new Date();
    const targetSync = new Date();
    targetSync.setHours(8, 0, 0, 0);
    if (now < targetSync) targetSync.setDate(targetSync.getDate() - 1);
    const useCache = !forceRefresh && cachedData.length > 0 && lastSync >= targetSync.getTime();
    if (useCache) {
      if (window.EmpresasApp && typeof EmpresasApp.afterCompaniesFetched === "function") {
        EmpresasApp.afterCompaniesFetched(cachedData, false);
      }
      return cachedData;
    }

    try {
      const list = await siengeFetchWithRetry("/companies?limit=200", 2);
      const array = list && list.results ? list.results : list;
      if (array && array.length > 0) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(array));
          localStorage.setItem(cacheAtKey, String(Date.now()));
        } catch (e) {}
        if (window.EmpresasApp && typeof EmpresasApp.afterCompaniesFetched === "function") {
          EmpresasApp.afterCompaniesFetched(array, true);
        }
        return array;
      }
      if (window.EmpresasApp && typeof EmpresasApp.afterCompaniesFetched === "function" && cachedData.length) {
        EmpresasApp.afterCompaniesFetched(cachedData, false);
      }
      return cachedData;
    } catch (e) {
      console.warn("[Sienge] Erro ao buscar empresas (provável limite de API), usando cache local:", e);
      if (window.EmpresasApp && typeof EmpresasApp.afterCompaniesFetched === "function" && cachedData.length) {
        EmpresasApp.afterCompaniesFetched(cachedData, false);
      }
      return cachedData;
    }
  },

  // 1.5. Centros de Custo (Paginado)
  async getCostCenters(forceRefresh = false) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.COST_CENTERS;
    }
    
    const cacheKey = 'crm_cost_centers_data';
    const cacheDateKey = 'crm_cost_centers_date';
    const todayStr = new Date().toISOString().split('T')[0];
    
    let cachedData = null;
    try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) cachedData = JSON.parse(cachedRaw);
    } catch(e) {}

    const lastFetch = localStorage.getItem(cacheDateKey);
    
    if (!forceRefresh && cachedData && cachedData.length > 0) {
        if (lastFetch !== todayStr) {
            this._updateCostCentersBackground(cacheKey, cacheDateKey, todayStr);
        }
        return cachedData;
    }

    try {
      const data = await siengeFetchAllPages("/cost-centers");
      if (data && data.length > 0) {
          try {
              localStorage.setItem(cacheKey, JSON.stringify(data));
              localStorage.setItem(cacheDateKey, todayStr);
          } catch(e) {
              console.warn("Could not save cost centers to localStorage");
          }
      }
      return data;
    } catch(e) {
      console.warn("[Sienge] Erro ao buscar centros de custo, usando fallback (mock/cache):", e);
      if (cachedData && cachedData.length > 0) return cachedData;
      return (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) ? window.MOCK_DATA.COST_CENTERS : [];
    }
  },

  async _updateCostCentersBackground(cacheKey, cacheDateKey, todayStr) {
      try {
          console.log("[Sienge] Atualizando centros de custo em background...");
          const data = await siengeFetchAllPages("/cost-centers");
          if (data && data.length > 0) {
              try {
                  localStorage.setItem(cacheKey, JSON.stringify(data));
                  localStorage.setItem(cacheDateKey, todayStr);
                  console.log("[Sienge] Centros de custo atualizados com sucesso no cache.");
              } catch(e) {}
          }
      } catch (e) {
          console.error("[Sienge] Erro ao atualizar centros de custo em background:", e);
      }
  },

  // 1.5b. Empreendimentos (Paginado)
  async getEnterprises() {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.COST_CENTERS || []; // MOCK fallback
    }
    try {
      return await siengeFetchAllPages("/enterprises");
    } catch(e) {
      console.error("[Sienge] Erro ao buscar empreendimentos:", e);
      return [];
    }
  },

  // 1.6. Movimentos Bancários (Fiscal / Prestação de Contas)
  // selectionType M = data de movimento (caixa), P = data de pagamento/vencimento
  async getBankMovements(startDate, endDate, opts = {}) {
    const selectionType = opts.selectionType || "M";
    if (s_apiMode === "simulado") {
      const all = window.MOCK_DATA && window.MOCK_DATA.BANK_MOVEMENTS ? window.MOCK_DATA.BANK_MOVEMENTS : [];
      return all.filter(m => {
        const d = String(m.bankMovementDate || "").slice(0, 10);
        if (d && (d < startDate || d > endDate)) return false;
        if (opts.companyId && String(m.companyId) !== String(opts.companyId)) return false;
        if (opts.costCentersId) {
          const wanted = String(opts.costCentersId).split(",").map(s => s.trim()).filter(Boolean);
          if (wanted.length) {
            const cats = m.financialCategories || [];
            const hit = cats.some(fc => wanted.includes(String(fc.costCenterId))) || wanted.includes(String(m.costCenterId || ""));
            if (!hit) return false;
          }
        }
        return true;
      });
    }
    let url = `/bulk-data/v1/bank-movement?startDate=${startDate}&endDate=${endDate}&selectionType=${encodeURIComponent(selectionType)}`;
    if (opts.companyId) url += `&companyId=${encodeURIComponent(opts.companyId)}`;
    if (opts.costCentersId) {
      const ids = Array.isArray(opts.costCentersId) ? opts.costCentersId.join(",") : String(opts.costCentersId);
      url += `&costCentersId=${ids}`;
    }
    const res = await siengeFetchWithRetry(url);
    if (res && Array.isArray(res.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  },

  _progressListeners: [],
  _lastProgressState: null,
  // 2. FILA DE COBRANÇA — Retorna apenas bills brutos inadimplentes
  //    SEM buscar installments, SEM buscar clientes
  async getDefaulters(companyId = null, onProgress = null, forceRefresh = false) {
    if (s_apiMode === "simulado") {
      let bills = window.MOCK_DATA.DEFAULTERS_RECEIVABLE_BILLS;
      if (companyId) bills = bills.filter(b => b.companyId === Number(companyId));
      return bills;
    }

    if (onProgress) {
        this._progressListeners.push(onProgress);
        if (this._defaultersPromise && this._lastProgressState) {
            onProgress(...this._lastProgressState);
        }
    }

    if (!companyId) {
      if (!this._progressListeners) this._progressListeners = [];
      if (onProgress) {
        this._progressListeners.push(onProgress);
        if (this._lastProgressState) {
          onProgress(...this._lastProgressState);
        }
      }
      if (this._defaultersPromise && !forceRefresh) {
        return this._defaultersPromise;
      }
      this._lastProgressState = null;
      this._defaultersPromise = (async () => {
        const t0 = performance.now();

        // 1) VERIFICAÇÃO DO CACHE DIÁRIO (INDEXEDDB E FIRESTORE)
        if (!forceRefresh) {
           const todayStr = new Date().toISOString().split('T')[0];
           
           // A) Tentar ler do IndexedDB (Cache Local, rápido e sem limite de quota)
           try {
               const localCache = await IdbDefaultersCache.get(`defaulters_${todayStr}`);
               if (localCache && localCache.data) {
                   console.log(`%c[Sienge] ✅ Base carregada do IndexedDB local — ${localCache.data.length} títulos`, 'color:#10b981;font-size:13px;font-weight:bold;');
                   if (localCache.paidMap) {
                       window.advFilters = window.advFilters || {};
                       try {
                           window.advFilters.paidMap = new Map(JSON.parse(localCache.paidMap));
                           console.log(`%c[Sienge] ✅ Último Pagamento restaurado do IndexedDB.`, 'color:#10b981;font-weight:bold;');
                       } catch(e) {}
                   }
                   window._siengeLastFetchTime = { elapsed: "0.1", count: localCache.data.length, at: localCache.timestampStr || new Date().toLocaleTimeString('pt-BR'), cached: true };
                   return localCache.data;
               }
           } catch (e) {
               console.log('%c[Sienge] ℹ️ Erro ao ler cache do IndexedDB:', e);
           }

           // B) Se não tem no IndexedDB, tenta o Firebase (útil para o primeiro acesso do dia no PC)
           if (window.firebaseDb && window.firebaseCollections) {
               try {
                 console.log(`%c[Sienge] ⏱ Verificando cache diário no Firestore...`, 'color:#f59e0b;font-weight:bold;');
                 const metaRef = window.firebaseCollections.doc(window.firebaseDb, "sienge_defaulters_history", todayStr);
                 const metaSnap = await window.firebaseCollections.getDoc(metaRef);
                 
                 if (metaSnap.exists()) {
                   const meta = metaSnap.data();
                   console.log(`%c[Sienge] ✅ Cache de hoje encontrado! Montando base...`, 'color:#10b981;font-weight:bold;');
                   let result = [];
                   const chunkPromises = [];
                   for (let i = 0; i < meta.chunks; i++) {
                     const chunkRef = window.firebaseCollections.doc(window.firebaseDb, "sienge_defaulters_history", `${todayStr}_chunk_${i}`);
                     chunkPromises.push(window.firebaseCollections.getDoc(chunkRef));
                   }
                   
                   const chunkSnaps = await Promise.all(chunkPromises);
                   chunkSnaps.forEach(snap => {
                     if (snap.exists()) {
                       result.push(...JSON.parse(snap.data().data));
                     }
                   });
                   
                   if (meta.paidMap) {
                     window.advFilters = window.advFilters || {};
                     try {
                         window.advFilters.paidMap = new Map(JSON.parse(meta.paidMap));
                         console.log(`%c[Sienge] ✅ Último Pagamento restaurado do cache.`, 'color:#10b981;font-weight:bold;');
                     } catch(e) {}
                   }

                   const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
                   console.log(`%c[Sienge] ✅ Base carregada do Firestore em ${elapsed}s — ${result.length} títulos`, 'color:#10b981;font-size:13px;font-weight:bold;');
                   window._siengeLastFetchTime = { elapsed, count: result.length, at: meta.timestampStr || new Date().toLocaleTimeString('pt-BR'), cached: true };
                   
                   // Salva no IndexedDB para as próximas vezes serem instantâneas!
                   IdbDefaultersCache.set(`defaulters_${todayStr}`, {
                       data: result,
                       paidMap: meta.paidMap,
                       timestampStr: meta.timestampStr
                   }).catch(() => {});

                   return result;
                 } else {
                   console.log('%c[Sienge] ℹ️ Cache do Firestore desatualizado ou inexistente.', 'color:#f59e0b;');
                 }
               } catch (e) {
                 console.log('%c[Sienge] ℹ️ Erro ao ler cache do Firestore (Possível limite de cota atingido):', e);
               }
           }
        }

        console.log('%c[Sienge] ⏱ Iniciando busca completa de inadimplentes na API...', 'color:#f59e0b;font-weight:bold;');
        try {
          const broadcastProgress = (cId, cc, idx, total, cName, wData) => {
             this._lastProgressState = [cId, cc, idx, total, cName, wData];
             if (this._progressListeners) {
               this._progressListeners.forEach(listener => listener(cId, cc, idx, total, cName, wData));
             }
          };
          const result = await this._getDefaultersInternal(null, broadcastProgress);
          const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
          console.log(
            `%c[Sienge] ✅ Busca concluída em ${elapsed}s — ${result.length} títulos inadimplentes`,
            'color:#10b981;font-size:13px;font-weight:bold;'
          );
          
          const timestampStr = new Date().toLocaleTimeString('pt-BR');
          window._siengeLastFetchTime = { elapsed, count: result.length, at: timestampStr, cached: false };
          
          if (window.firebaseDb && window.firebaseCollections) {
              const todayStr = new Date().toISOString().split('T')[0];
              const CHUNK_SIZE = 100;
              const numChunks = Math.ceil(result.length / CHUNK_SIZE);
              
              (async () => {
                try {
                  console.log(`%c[Firebase] Salvando cache diário no Firestore em ${numChunks} blocos...`, 'color:#3b82f6;');
                  const promises = [];
                  for (let i = 0; i < numChunks; i++) {
                    const chunkData = result.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                    const docRef = window.firebaseCollections.doc(window.firebaseDb, "sienge_defaulters_history", `${todayStr}_chunk_${i}`);
                    promises.push(window.firebaseCollections.setDoc(docRef, { data: JSON.stringify(chunkData) }));
                  }
                  await Promise.all(promises);
                  
                  let paidMapStr = null;
                  if (window.advFilters && window.advFilters.paidMap) {
                      try { paidMapStr = JSON.stringify(Array.from(window.advFilters.paidMap.entries())); } catch(e){}
                  }
                  
                  const metaRef = window.firebaseCollections.doc(window.firebaseDb, "sienge_defaulters_history", todayStr);
                  await window.firebaseCollections.setDoc(metaRef, { 
                      date: todayStr, 
                      chunks: numChunks, 
                      timestampStr: timestampStr,
                      paidMap: paidMapStr,
                      createdAt: window.firebaseCollections.serverTimestamp ? window.firebaseCollections.serverTimestamp() : new Date().toISOString()
                  });
                  console.log(`%c[Firebase] Cache diário (${todayStr}) salvo com sucesso no Firestore!`, 'color:#3b82f6;font-weight:bold;');
                } catch (e) {
                  console.error("[Firebase] Erro ao salvar cache no Firestore (limite de cota atingido):", e);
                }
              })();
              
              // SALVA NO INDEXEDDB LOCALMENTE TAMBÉM
              (async () => {
                try {
                   let paidMapStr = null;
                   if (window.advFilters && window.advFilters.paidMap) {
                       try { paidMapStr = JSON.stringify(Array.from(window.advFilters.paidMap.entries())); } catch(e){}
                   }
                   await IdbDefaultersCache.set(`defaulters_${todayStr}`, {
                       data: result,
                       paidMap: paidMapStr,
                       timestampStr: timestampStr
                   });
                   console.log(`%c[IndexedDB] Cache diário salvo localmente com sucesso!`, 'color:#3b82f6;font-weight:bold;');
                } catch(e) {
                   console.error("[IndexedDB] Erro ao salvar cache local:", e);
                }
              })();

              
              this.saveDefaultersSnapshot(result).catch(console.error);
              if (this.syncSubjudiceHistory) this.syncSubjudiceHistory(result).catch(console.error);
          } else {
             this.saveDefaultersSnapshot(result).catch(console.error);
             if (this.syncSubjudiceHistory) this.syncSubjudiceHistory(result).catch(console.error);
          }

          return result;
        } finally {
          this._defaultersPromise = null;
          this._progressListeners = [];
          this._lastProgressState = null;
        }
      })();
      return this._defaultersPromise;
    }
    return await this._getDefaultersInternal(companyId, onProgress);
  },

  async updateCachePaidMap(paidMapStr) {
    if (s_apiMode === "simulado" || !window.firebaseDb || !window.firebaseCollections) return;
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const metaRef = window.firebaseCollections.doc(window.firebaseDb, "sienge_defaulters_history", todayStr);
        // Only update if it exists
        const metaSnap = await window.firebaseCollections.getDoc(metaRef);
        if (metaSnap.exists()) {
            await window.firebaseCollections.updateDoc(metaRef, { paidMap: paidMapStr });
            console.log('%c[Firebase] PaidMap atualizado no cache diário.', 'color:#3b82f6;');
        }
    } catch(e) {
        console.error("[Firebase] Erro ao atualizar PaidMap no cache:", e);
    }
  },


  async _getDefaultersInternal(companyId, onProgress) {
    const isCompanyInternal = (company) => {
      if (!company || typeof company !== 'object') return false;
      const value = company.cobranca_interna;
      return value === 1 || value === true || value === "1" || value === "true";
    };

    let targetCompanies = getConfiguredInternalCompanyIds();
    let customData = null;
    if (companyId) {
      targetCompanies = [companyId];
    } else {
      try {
        const localCustom = localStorage.getItem('crm_empresas_custom');
        if (localCustom) {
          customData = JSON.parse(localCustom);
          const internalIds = Object.entries(customData)
            .filter(([id, c]) => isCompanyInternal(c))
            .map(([id, c]) => Number(c.company_id ?? c.id ?? id))
            .filter(Number.isFinite);
          if (internalIds.length > 0) {
            targetCompanies = [...new Set(internalIds)];
          }
        }
      } catch(e) {
        console.error("Erro ao ler customData de empresas", e);
      }
    }

    console.log(`[Sienge] Iniciando busca de inadimplentes para as empresas: ${targetCompanies.join(', ')}`);

    let firstCompanyName = "Moura Leite Desenvolvimento e Urbanização";
    if (targetCompanies.length > 0 && customData && customData[targetCompanies[0]]) {
        firstCompanyName = customData[targetCompanies[0]].nome || customData[targetCompanies[0]].nome_usual || firstCompanyName;
    }
    if (onProgress) onProgress(null, null, 0, targetCompanies.length, firstCompanyName);

    const today = new Date().toISOString().split('T')[0];
    const allNormalized = [];

    // Carregar os centros de custo para aplicar o filtro por enterpriseId
    let allCcs = [];
    try {
      allCcs = await this.getCostCenters();
    } catch (e) {
      console.warn("Erro ao carregar centros de custo para otimização da API:", e);
    }

    let companyTimes = {};
    try { companyTimes = JSON.parse(localStorage.getItem('siengeCompanyTimes') || '{}'); } catch(e){}
    
    let totalWeight = 0;
    targetCompanies.forEach(id => totalWeight += (companyTimes[id] || 7000));
    let currentWeightAccum = 0;

    let _companyIndex = 0;
    for (const cId of targetCompanies) {
      const cStartTime = Date.now();
      _companyIndex++;
      
      const thisWeight = companyTimes[cId] || 7000;
      let pctBefore = totalWeight > 0 ? (currentWeightAccum / totalWeight) * 100 : 0;
      let pctAfter = totalWeight > 0 ? ((currentWeightAccum + thisWeight) / totalWeight) * 100 : 0;
      
      let cName = customData && customData[cId] ? (customData[cId].nome_usual || customData[cId].nome || `Empresa ${cId}`) : `Empresa ${cId}`;
      if (onProgress) onProgress(cId, null, _companyIndex, targetCompanies.length, cName, { pctBefore, pctAfter, expectedDuration: thisWeight });

      // Para a empresa 1, a consulta precisa complementar também pelo Centro de Custo,
      // porque algumas unidades e lotes são carregadas por empreendimento e não aparecem
      // apenas pela empresa. Mantemos a regra de lotes ativos para as demais empresas.
      const companyCcsRaw = allCcs
        .filter(cc => Number(cc.companyId) === Number(cId))
        .map(cc => String(cc.id || cc.costCenterId || '').trim())
        .filter(Boolean);

      const companyCcs = companyCcsRaw.filter(id => {
        const isActivePrefix = id.startsWith('1') || id.startsWith('2') || id.startsWith('3');
        return Number(cId) === 1 ? true : isActivePrefix;
      });

      console.log(`[Sienge] Empresa ${cId} — ${companyCcs.length} centros de custo elegíveis: ${companyCcs.join(', ')}`);

      // Divisão em lotes menores (2 CCs) para evitar requests muito longos e timeout na Vercel (60s limit)
      const BATCH_SIZE = 2;
      const ccBatches = [];
      if (companyCcs.length === 0) {
        ccBatches.push([]); // Lote vazio caso não haja CCs filtrados
      } else {
        for (let i = 0; i < companyCcs.length; i += BATCH_SIZE) {
          ccBatches.push(companyCcs.slice(i, i + BATCH_SIZE));
        }
      }

      console.log(`[Sienge] Buscando títulos inadimplentes via Bulk Data da empresa ${cId} em ${ccBatches.length} lote(s)...`);
      
      let rawArray = [];
      let rawUnderJudgment = [];

      for (let i = 0; i < ccBatches.length; i++) {
        const batch = ccBatches[i];
        const extraParams = batch.length > 0 ? `&enterpriseId=${batch.join(',')}` : '';

        const buildQuery = (billTypeParams) =>
          `?companyId=${cId}` +
          `&dueDateLimit=${today}` +
          `&documentsId=CT` +
          `&correctionDate=${today}` +
          billTypeParams +
          `&normalActivities=false` +
          `&inBillingActivities=false` +
          `&defaultersActivities=true` +
          `&underJudgmentActivities=true` +
          `&includeResidueInstallment=true` +
          `&includePartiallyPaidInstallments=true` +
          `&showOnlyDefaulters=false` +
          `&includeUnderJudgment=true` +
          `&showSentToSPCSerasa=true` +
          `&positionDate=${today}` +
          extraParams;

        const qAll   = buildQuery(`&normalReceivableBills=true&inBillingReceivableBills=true&defaultersReceivableBills=true&underJudgmentReceivableBills=true`);
        const qJudge = buildQuery(`&normalReceivableBills=false&inBillingReceivableBills=false&defaultersReceivableBills=false&underJudgmentReceivableBills=true`);

        if (ccBatches.length > 1) {
          console.log(`[Sienge] Empresa ${cId} — Processando lote ${i + 1}/${ccBatches.length} (CCs: ${batch.join(', ')})`);
        }

        try {
          const resAll   = await siengeFetchWithRetry(`/bulk-data/v1/defaulters-receivable-bills${qAll}`);
          await new Promise(r => setTimeout(r, 1000));
          const resJudge = await siengeFetchWithRetry(`/bulk-data/v1/defaulters-receivable-bills${qJudge}`);

          rawArray.push(...(resAll.data || []));
          rawUnderJudgment.push(...(resJudge.data || []));
        } catch (err) {
          console.error(`[Sienge] Erro na API Bulk Data da empresa ${cId} (Lote ${i + 1}):`, err);
        }
      }

      try {
        const underJudgmentIds = new Set(rawUnderJudgment.map(b => String(b.receivableBillId || b.id)));

        const normalizedArray = rawArray.map(bill => {
          let value = 0, interest = 0, fine = 0, daysDelay = 0;
          const installments = bill.defaulterInstallments || [];
          installments.forEach(inst => {
            if (inst.correctedValueWithAdditions !== undefined) {
              value += inst.correctedValueWithAdditions;
            } else {
              value    += inst.correctedValueWithoutAdditions !== undefined ? inst.correctedValueWithoutAdditions : (inst.value || 0);
              interest += inst.interest || 0;
              fine     += inst.fine || 0;
            }
            const delay = inst.daysOfDelay !== undefined ? inst.daysOfDelay : (inst.daysDelay || 0);
            if (delay > daysDelay) daysDelay = delay;
          });

          return {
            id:          bill.receivableBillId || String(bill.id),
            saleId:      bill.receivableBillId ? Number(bill.receivableBillId) : (bill.saleId || 100),
            realSaleId:  bill.saleId,
            customerId:  bill.clientId ? Number(bill.clientId) : (bill.customerId || 0),
            clientName:  bill.clientName || `Cliente #${bill.clientId}`,
            companyId:   bill.companyId,
            costCentersId: bill.costCentersId || [],
            costCenterId:  bill.costCenterId || (bill.costCentersId?.length > 0 ? bill.costCentersId[0] : null),
            units:       bill.units || 'N/D',
            value, interest, fine, daysDelay,
            slipStatus:  'Vencido',
            subjudice:   underJudgmentIds.has(String(bill.receivableBillId || bill.id)) ? 'S' : 'N',
            defaulterInstallments:      installments,
            defaulterJudicialActivities: bill.defaulterJudicialActivities || [],
            totalInstallmentsCount: (bill.defaulterInstallments ? bill.defaulterInstallments.length : 0) +
                                    (bill.normalInstallments ? bill.normalInstallments.length : 0) +
                                    (bill.inBillingInstallments ? bill.inBillingInstallments.length : 0) +
                                    (bill.underJudgmentInstallments ? bill.underJudgmentInstallments.length : 0)
          };
        });

        console.log(`[Sienge] Retornou ${normalizedArray.length} títulos inadimplentes da empresa ${cId}`);
        allNormalized.push(...normalizedArray.filter(b => b.daysDelay > 0));

      } catch (err) {
        console.error(`[Sienge] Erro na API Bulk Data da empresa ${cId}:`, err);
      }
      
      const cElapsed = Date.now() - cStartTime;
      companyTimes[cId] = cElapsed;
      localStorage.setItem('siengeCompanyTimes', JSON.stringify(companyTimes));
      currentWeightAccum += thisWeight;
    }

    return allNormalized;
  },

  // 3. Parcelas de um título (chamado apenas ao abrir Detalhes)
  async getBillInstallments(receivableBillId) {
    if (s_apiMode === "simulado") return [];
    const res = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${receivableBillId}/installments`);
    return res.results || res || [];
  },

  // 4. Dados do Cliente (chamado apenas ao abrir Detalhes)
  async getCustomer(id) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.CUSTOMERS[id] || null;
    }
    const c = await siengeFetchWithRetry(`/customers/${id}`);
    const addressStr = c.addresses?.[0]
      ? `${c.addresses[0].street || ''}, ${c.addresses[0].number || ''}, ${c.addresses[0].neighborhood || ''}, ${c.addresses[0].cityName || ''} - ${c.addresses[0].stateName || ''}`
      : "N/D";
    return {
      id: c.id,
      name: c.name,
      cpfCnpj: c.cnpj || c.cpf || "000.000.000-00",
      email: c.email || c.emails?.[0]?.email || "N/D",
      phone: c.phones?.[0]?.number || c.phones?.[0]?.phoneNumber || "N/D",
      phones: c.phones || [],
      addresses: c.addresses || [],
      civilStatus: c.civilStatus || "N/D",
      profession: c.profession || "N/D",
      sex: c.sex || "N/D",
      birthDate: c.birthDate || "1980-01-01",
      subtypes: c.subTypes || c.subtypes || [],
      address: addressStr
    };
  },

  // 5. Contratos de Venda (chamado apenas ao abrir Detalhes ou por customerId específico)
  async getSales(customerId = null) {
    if (s_apiMode === "simulado") {
      let sales = window.MOCK_DATA.SALES;
      if (customerId) sales = sales.filter(s => s.customerId === Number(customerId));
      return sales;
    }

    // No modo Real, sem customerId, usa cache
    if (!customerId) {
      if (typeof window !== 'undefined' && window.AppState && window.AppState.sales && window.AppState.sales.length > 0) {
        return window.AppState.sales;
      }
      return [];
    }

    try {
      const res = await siengeFetchWithRetry(`/sales-contracts?customerId=${customerId}`);
      const rawResults = res.results || [];

      const mapped = rawResults.map(c => {
        const mainCustomer = c.salesContractCustomers?.find(cust => cust.main === true) || c.salesContractCustomers?.[0] || {};
        const mainUnit = c.salesContractUnits?.find(u => u.main === true) || c.salesContractUnits?.[0] || {};
        const unitId = `U-${c.enterpriseId}-${mainUnit.name ? mainUnit.name.replace(/\s+/g, '') : 'ND'}`;

        if (typeof window !== 'undefined' && window.AppState) {
          window.AppState.units = window.AppState.units || {};
          if (!window.AppState.units[unitId]) {
            const unitName = mainUnit.name || "";
            const nameParts = unitName.split("-");
            window.AppState.units[unitId] = {
              id: unitId,
              costCenterId: String(c.enterpriseId),
              block: nameParts.length > 1 ? nameParts[0] : "N/D",
              lot: nameParts.length > 1 ? nameParts.slice(1).join("-") : (unitName || "N/D"),
              area: 250,
              status: c.outstandingBalance === 0 ? "Quitado" : "Vendido"
            };
          }
        }

        const brokers = c.brokers || c.salesContractBrokers || [];
        const mainBroker = (Array.isArray(brokers) && brokers.length)
          ? (brokers.find(b => b.main === true || b.main === "S") || brokers[0])
          : null;
        const brokerName = (mainBroker && (mainBroker.name || mainBroker.brokerName || mainBroker.personName || mainBroker.fantasyName))
          || c.salespersonName || c.salesmanName || c.brokerName || "";

        return {
          id: c.id,
          customerId: mainCustomer.id || customerId,
          companyId: c.companyId,
          unitId: unitId,
          saleDate: c.contractDate,
          contractValue: c.totalSellingValue || c.value,
          updatedContractValue: c.value,
          interestRate: (c.interestPercentage || 1) / 100,
          subjudice: c.subjudice ? "S" : "N",
          percPaid: c.value > 0 ? (c.totalSellingValue - c.outstandingBalance) / c.value : 0,
          lastPaymentDate: c.lastUpdateDate,
          status: c.situation === "Distratado" ? "Distratado" : c.outstandingBalance === 0 ? "Quitado" : "Ativo",
          receivableBillId: c.receivableBillId,
          enterpriseId: c.enterpriseId,
          customers: c.salesContractCustomers || [],
          brokers,
          brokerName: String(brokerName || "").trim()
        };
      });

      return mapped;
    } catch (error) {
      console.error("Erro ao obter vendas/contratos:", error);
      return [];
    }
  },

  // 6. Títulos pagos de um cliente específico (chamado ao abrir Detalhes)
  async getPaidBills(companyId = null, customerId = null) {
    if (s_apiMode === "simulado") {
      let bills = window.MOCK_DATA.PAID_RECEIVABLE_BILLS;
      if (companyId) bills = bills.filter(b => b.companyId === Number(companyId));
      return bills;
    }
    if (!customerId) return [];

    try {
      let queryParam = `?customerId=${customerId}`;
      if (companyId) queryParam += `&companyId=${companyId}`;
      const billsRes = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills${queryParam}`);
      const paidBills = (billsRes.results || []).filter(b => b.payOffDate !== null);

      return paidBills.map(bill => ({
        id: `B-${bill.receivableBillId}`,
        saleId: bill.receivableBillId,
        customerId: bill.customerId,
        companyId: bill.companyId,
        paymentDate: bill.payOffDate,
        value: bill.receivableBillValue,
        totalPaid: bill.receivableBillValue,
        slipStatus: "Pago"
      }));
    } catch (error) {
      console.error("Erro ao obter títulos pagos:", error);
      return [];
    }
  },

  // 7. Unidade física
  async getUnit(unitId) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.UNITS[unitId] || { id: unitId, block: "N/D", lot: "N/D", area: 0, status: "N/D" };
    }
    try {
      if (!isNaN(unitId)) {
        const u = await siengeFetchWithRetry(`/units/${unitId}`);
        const nameParts = (u.name || "").split("-");
        return { id: u.id, costCenterId: String(u.enterpriseId), block: nameParts[0] || "N/D", lot: nameParts[1] || "N/D", area: u.totalArea || 0, status: u.contractId ? "Vendido" : "Disponível" };
      }
      const parts = String(unitId).split("-");
      const nameToSearch = parts.slice(2).join("-");
      const enterpriseId = parts[1];
      const queryParam = enterpriseId ? `?enterpriseId=${enterpriseId}` : "";
      const unitsRes = await siengeFetchWithRetry(`/units${queryParam}`);
      const found = unitsRes.results.find(u => u.name === nameToSearch || u.name.replace(/\s+/g, '') === nameToSearch);
      if (found) {
        const nameParts = (found.name || "").split("-");
        return { id: found.id, costCenterId: String(found.enterpriseId), block: nameParts[0] || "N/D", lot: nameParts[1] || "N/D", area: found.totalArea || 0, status: found.contractId ? "Vendido" : "Disponível" };
      }
    } catch (e) { /* silencioso */ }
    return { id: unitId, block: "N/D", lot: "N/D", area: 0, status: "N/D" };
  },

  async getUnitRaw(unitId) {
    if (s_apiMode === "simulado") return null;
    try {
      if (isNaN(unitId) && String(unitId).includes("-")) {
        const u = await this.getUnit(unitId);
        if (u && u.id && !isNaN(u.id)) {
          return await siengeFetchWithRetry(`/units/${u.id}`);
        }
        return null;
      }
      return await siengeFetchWithRetry(`/units/${unitId}`);
    } catch (e) {
      console.error("Erro getUnitRaw:", e);
      return null;
    }
  },

  async findUnitByName(enterpriseId, name) {
    if (s_apiMode === "simulado") return null;
    try {
      const res = await siengeFetchWithRetry(`/units?limit=10&offset=0&enterpriseId=${enterpriseId}&name=${encodeURIComponent(name)}&additionalData=NONE`);
      if (res && res.results && res.results.length > 0) {
        return res.results[0];
      }
      return null;
    } catch (e) {
      console.error("Erro findUnitByName:", e);
      return null;
    }
  },

  async getContractRaw(contractId) {
    if (s_apiMode === "simulado") return null;
    try {
      return await siengeFetchWithRetry(`/sales-contracts/${contractId}`);
    } catch (e) {
      console.error("Erro getContractRaw:", e);
      return null;
    }
  },

  // 9. Centro de Custo
  async getCostCenter(costCenterId) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.COST_CENTERS.find(cc => String(cc.id) === String(costCenterId)) || { id: costCenterId, name: `Centro de Custo ${costCenterId}` };
    }
    try {
      // Tentar a rota de empreendimentos primeiro, já que o usuário pediu "Empreendimento"
      const ent = await siengeFetchWithRetry(`/enterprises/${costCenterId}`);
      if (ent && ent.name) return { id: ent.id, name: ent.name };
    } catch (e1) {
      // Fallback para costcenters caso não seja um enterprise válido
      try {
        const cc = await siengeFetchWithRetry(`/cost-centers/${costCenterId}`);
        return { id: cc.id, name: cc.name || `Centro de Custo ${costCenterId}` };
      } catch (e2) {
        return { id: costCenterId, name: `Centro de Custo ${costCenterId}` };
      }
    }
    return { id: costCenterId, name: `Centro de Custo ${costCenterId}` };
  },

  // 10. Acordos anteriores (chamado ao abrir Detalhes)
  async getRemadeInstallments(billReceivableId) {
    if (s_apiMode === "simulado") return window.MOCK_DATA.REMADE_INSTALLMENTS[billReceivableId] || [];
    try {
      // Endpoint oficial passado pelo usuário
      const res = await siengeFetchWithRetry(`/remade-installments?billReceivableId=${billReceivableId}`);
      return res.results || res.data || res || [];
    } catch (e) {
      return [];
    }
  },

  // 9. Histórico de notificações
  async getNotificationHistory(saleId) {
    if (s_apiMode === "simulado") return window.MOCK_DATA.COLLECTIONS_NOTIFICATION_HISTORY[saleId] || [];
    return [];
  },

  // 10. Simulação de antecipação
  async simulatePrepayment(saleId, installmentsToPay) {
    if (s_apiMode === "simulado") return runLocalPrepaymentSimulation(saleId, installmentsToPay);
    try {
      return await siengeFetchWithRetry(`/prepayment-slip-register/simulate?saleId=${saleId}&installments=${JSON.stringify(installmentsToPay)}`);
    } catch (e) {
      return runLocalPrepaymentSimulation(saleId, installmentsToPay);
    }
  },

    async loadAllCustomersInBackground() {
    if (s_apiMode === "simulado") return;
    if (window.AppState && window.AppState.allCustomersLoaded) return;
    
    try {
      if (!window.AppState) window.AppState = {};
      window.AppState.allCustomers = [];
      let offset = 0;
      const limit = 200;
      let hasMore = true;
      
      while (hasMore) {
        const res = await siengeFetchWithRetry(`/customers?offset=${offset}&limit=${limit}`);
        if (res && res.results && res.results.length > 0) {
          window.AppState.allCustomers.push(...res.results);
          if (res.results.length < limit) {
             hasMore = false;
          } else {
             offset += limit;
             await new Promise(r => setTimeout(r, 500)); // Delay para evitar rate limit
          }
        } else {
          hasMore = false;
        }
      }
      window.AppState.allCustomersLoaded = true;
      console.log(`[Sienge] Carregados ${window.AppState.allCustomers.length} clientes em segundo plano.`);
    } catch (e) {
      console.error("[Sienge] Erro ao carregar clientes em segundo plano:", e);
    }
  },

  // 11. Busca cliente por ID
  async getCustomer(customerId) {
    if (s_apiMode === "simulado") {
      return window.MOCK_DATA.CUSTOMERS[customerId] || null;
    }
    try {
      const res = await siengeFetchWithRetry(`/customers/${customerId}`);
      if (res) {
        res.cpfCnpj = res.cpfCnpj || res.cpf || res.cnpj || "";
      }
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter cliente por ID:", e);
      return null;
    }
  },

  // 11b. Pesquisa de clientes (por Nome ou CPF/CNPJ)
  async searchCustomers(query) {
    if (s_apiMode === "simulado") {
      const q = String(query).toLowerCase();
      return Object.values(window.MOCK_DATA.CUSTOMERS).filter(c => 
        String(c.name).toLowerCase().includes(q) || String(c.cpfCnpj).includes(q)
      );
    }
    
    const q = String(query).toLowerCase().trim();
    const cleanVal = q.replace(/[-.\/]/g, "");
    
    // Usa memria se disponvel
    if (window.AppState && window.AppState.allCustomersLoaded && window.AppState.allCustomers) {
       return window.AppState.allCustomers.filter(c => {
         const name = String(c.name || "").toLowerCase();
         const cpf = String(c.cpf || "").replace(/[-.\/]/g, "");
         const cnpj = String(c.cnpj || "").replace(/[-.\/]/g, "");
         return name.includes(q) || cpf.includes(cleanVal) || cnpj.includes(cleanVal);
       });
    }

    try {
      const isNumber = /^\d+$/.test(cleanVal);
      const param = isNumber ? `cpfCnpj=${cleanVal}` : `name=${encodeURIComponent(query)}`;
      const res = await siengeFetchWithRetry(`/customers?${param}&limit=50`);
      return res.results || res || [];
    } catch (e) {
      console.error("[Sienge] Erro na pesquisa de clientes:", e);
      return [];
    }
  },

  // 12. Detalhes da Unidade Física com Filtros
  async getUnitDetails(enterpriseId, name) {
    if (s_apiMode === "simulado") {
      const mockUnitKey = Object.keys(window.MOCK_DATA.UNITS).find(k => k.includes(enterpriseId) && k.includes(name));
      const u = window.MOCK_DATA.UNITS[mockUnitKey] || { id: `U-${enterpriseId}-${name}`, block: "Q01", lot: "L01", area: 250 };
      return {
        results: [{
          id: u.id,
          realEstateRegistration: "12.345.678-9",
          legalregistrationnumber: "REG-9553-AVARE",
          Privatearea: u.area || 250,
          privateArea: u.area || 250,
          contractnumber: "CT-7758",
          contractNumber: "CT-7758"
        }]
      };
    }
    try {
      const res = await siengeFetchWithRetry(`/units?limit=200&offset=0&enterpriseId=${enterpriseId}&name=${encodeURIComponent(name)}&additionalData=NONE`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter detalhes da unidade:", e);
      return { results: [] };
    }
  },

  // 13. Extrato Histórico do Cliente (Bulk Data)
  async getCustomerExtractHistory(customerId) {
    if (s_apiMode === "simulado") {
      const sales = window.MOCK_DATA.SALES.filter(s => s.customerId === Number(customerId));
      const unpaid = window.MOCK_DATA.DEFAULTERS_RECEIVABLE_BILLS.filter(b => b.customerId === Number(customerId));
      const paid = window.MOCK_DATA.PAID_RECEIVABLE_BILLS.filter(b => b.customerId === Number(customerId));
      
      const data = [];
      
      // Mapear parcelas não pagas
      unpaid.forEach(u => {
        const sale = sales.find(s => s.id === u.saleId) || {};
        data.push({
          billReceivableId: u.saleId,
          costCenterId: u.costCenterId || "20100",
          costCenterDescription: "Residencial Bella Vista",
          emissionDate: sale.saleDate || "2020-01-01",
          lastRenegotiationDate: "2025-05-12",
          correctionDate: "2026-04-20",
          document: u.id.split("-").slice(0, 2).join(" "),
          revokedBillReceivableDate: sale.status === "Distratado" ? "2026-01-10" : null,
          unitName: sale.unitId ? sale.unitId.split("-").slice(2).join("-") : "Q01-L01",
          installmentId: u.installmentNum || 1,
          dueDate: u.dueDate,
          indexerId: "IGPM",
          currentBalance: u.value,
          currentBalanceWithAddition: u.totalValue,
          calculationDate: "2026-05-24",
          generatedBillet: true,
          days: u.daysDelay,
          installmentSituation: 1,
          receipts: []
        });
      });

      // Mapear parcelas pagas
      paid.forEach(p => {
        const sale = sales.find(s => s.id === p.saleId) || {};
        data.push({
          billReceivableId: p.saleId,
          costCenterId: p.costCenterId || "20100",
          costCenterDescription: "Residencial Bella Vista",
          emissionDate: sale.saleDate || "2020-01-01",
          lastRenegotiationDate: null,
          correctionDate: null,
          document: p.id.split("-").slice(0, 2).join(" "),
          revokedBillReceivableDate: sale.status === "Distratado" ? "2026-01-10" : null,
          unitName: sale.unitId ? sale.unitId.split("-").slice(2).join("-") : "Q01-L01",
          installmentId: p.installmentNum || 1,
          dueDate: p.dueDate,
          indexerId: "IGPM",
          currentBalance: null,
          currentBalanceWithAddition: null,
          calculationDate: "2026-05-24",
          generatedBillet: false,
          days: 0,
          installmentSituation: 2,
          receipts: [{
            date: p.paymentDate,
            value: p.value,
            extra: p.interestPaid,
            Discount: p.discount,
            netReceipt: p.totalPaid,
            type: "Baixa normal"
          }]
        });
      });

      return { data };
    }
    try {
      const endYear = new Date().getFullYear() + 24;
      const endDueDate = `${endYear}-01-01`;
      const res = await siengeFetchWithRetry(`/bulk-data/v1/customer-extract-history?startDueDate=1996-01-01&endDueDate=${endDueDate}&customerId=${customerId}&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=true&includeRevokedInstallments=true&includeRenegotiatedDischarge=false`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter extrato histórico do cliente:", e);
      return { data: [] };
    }
  },

  // 14. Extrato por BillReceivableId
  async getCustomerExtractHistoryByBill(billReceivableId) {
    if (s_apiMode === "simulado") {
      return { data: [] }; // Mock if needed
    }
    try {
      const endYear = new Date().getFullYear() + 24;
      const endDueDate = `${endYear}-01-01`;
      const res = await siengeFetchWithRetry(`/bulk-data/v1/customer-extract-history?startDueDate=1996-01-01&endDueDate=${endDueDate}&billReceivableId=${billReceivableId}&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=true&includeRevokedInstallments=true&includeRenegotiatedDischarge=false`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter extrato histórico por bill:", e);
      return { data: [] };
    }
  },

  // 15. Saldo Devedor Detalhado do Cliente (Bulk Data) — VP por parcela
  async getCustomerDebtBalance(billReceivableId, opts = {}) {
    const billId = billReceivableId || opts.billReceivableId;
    const companyId = opts.companyId;
    const startDueDate = opts.startDueDate || "2000-01-01";
    const endDueDate = opts.endDueDate || "2045-12-31";
    if (s_apiMode === "simulado") {
      const base = Number(billId) || 1000;
      return {
        data: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
          billReceivableId: Number(billId),
          installmentId: n,
          installmentNumber: n,
          dueDate: `2026-${String(n).padStart(2, "0")}-10`,
          originalValue: 12000 + n * 150,
          currentBalance: 12000 + n * 150,
          presentValue: 11800 + n * 140
        }))
      };
    }
    if (!billId) return { data: [] };
    try {
      let url = `/bulk-data/v1/customer-debt-balance?startDueDate=${encodeURIComponent(startDueDate)}&endDueDate=${encodeURIComponent(endDueDate)}&billReceivableId=${encodeURIComponent(billId)}&calculatePresentValue=true&includeAdministrativeRateAmount=false&includeInsuranceAmount=false&correctAnnualInstallment=false&includeReceiptsByAdvanceRebate=false&includeConditionalDiscountValid=false&calculateAdditionsUserInformation=false&calculateAdditionsValue=true`;
      if (companyId != null && companyId !== "") url += `&companyId=${encodeURIComponent(companyId)}`;
      const res = await siengeFetchWithRetry(url);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter saldo devedor do cliente:", e);
      return { data: [] };
    }
  },

  // 15. Saldo Devedor Atual Total por CPF
  async getTotalCurrentDebitBalance(cpfCnpj, receivableBillsIds = "") {
    if (s_apiMode === "simulado") {
      return {
        presentValue: 35000.00,
        totalBalance: 42000.00,
        discountApplied: 7000.00
      };
    }
    try {
      const cleanDoc = String(cpfCnpj || "").replace(/\D/g, "");
      const docParam = cleanDoc.length === 14 ? `cnpj=${cleanDoc}` : `cpf=${cleanDoc}`;
      let url = `/total-current-debit-balance?${docParam}`;
      if (receivableBillsIds && receivableBillsIds !== "undefined" && receivableBillsIds !== "null") {
          url += `&receivableBillsIds=${receivableBillsIds}`;
      }
      const res = await siengeFetchWithRetry(url);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter saldo devedor atual por CPF:", e);
      return { presentValue: 0, totalBalance: 0, discountApplied: 0 };
    }
  },

  // 16b. Gerar Informe de Rendimentos (IR) em PDF
  async getCustomerIncomeTaxReportPdf(customerId, companyId, year) {
    if (s_apiMode === "simulado") {
      return { results: [{ value: "https://mouraleite.sienge.com.br/sienge/visualizar-relatorio?arquivo=MOCK_IR_1234&formato=pdf" }] };
    }
    if (!customerId || !companyId || !year) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/customer-income-tax/report/pdf?customerId=${customerId}&companyId=${companyId}&year=${year}&documentsIn=CT&receiptTypeNotIn=`);
      // Sometimes Sienge returns a single object { value: "..." } wrapped in an array, or just an object.
      // We will return the raw response, but adjust if it's an array without results wrapper.
      if (Array.isArray(res)) {
        return { results: res };
      }
      if (res.value) {
        return { results: [res] };
      }
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter Informe de Rendimentos PDF:", e);
      return { results: [] };
    }
  },

  // 16. Gerar Extrato em PDF
  async getCustomerFinancialStatementsPdf(customerId, billReceivableId) {
    if (s_apiMode === "simulado") {
      return { results: [{ value: "https://mouraleite.sienge.com.br/sienge/visualizar-relatorio?arquivo=13074965419836066933&formato=pdf" }] };
    }
    if (!customerId || !billReceivableId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/customer-financial-statements/pdf?customerId=${customerId}&billReceivableId=${billReceivableId}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter Extrato PDF:", e);
      return { results: [] };
    }
  },

  // 17. Contas a Receber (Contratos/Lotes) do Cliente
  async getReceivableBills(customerId) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!customerId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills?customerId=${customerId}&limit=100&offset=0`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter contas a receber (receivable bills) do cliente:", e);
      return { results: [] };
    }
  },


  // 18. Extrato Financeiro do Cliente (customer-financial-statements)
  async getCustomerFinancialStatements(customerId) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!customerId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/customer-financial-statements?customerId=${customerId}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter customer-financial-statements:", e);
    }
  },

  // 19. Extrato Financeiro em PDF (customer-financial-statements/pdf)
  async getCustomerFinancialStatementsPdf(customerId, billReceivableId) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!customerId || !billReceivableId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/customer-financial-statements/pdf?customerId=${customerId}&billReceivableId=${billReceivableId}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter customer-financial-statements/pdf:", e);
      return { results: [] };
    }
  },

  // 20b. Dados bancários do credor (mesmo endpoint do assistente de contas a pagar)
  async getCreditorBankInformations(creditorId) {
    const id = String(creditorId || "").trim();
    if (!id) return [];
    if (s_apiMode === "simulado") return [];
    try {
      const list = await siengeFetchAllPages(`/creditors/${encodeURIComponent(id)}/bank-informations`, 100);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error("[Sienge] Erro ao obter dados bancários do credor:", e);
      return [];
    }
  },
  async getPaymentSlipNotification(billReceivableId, installmentId) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!billReceivableId || !installmentId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/payment-slip-notification?billReceivableId=${billReceivableId}&installmentId=${installmentId}`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter payment-slip-notification:", e);
      return { results: [] };
    }
  },

  // Cadastro de contas (Caixa e bancos / Contas correntes).
  // accountType.id: B Bancária, I Investimento, M Mútuo, C CAIXA, Q Cheque, E Estoque.
  async getCheckingAccounts(companyId, opts = {}) {
    if (s_apiMode === "simulado") {
      const all = (window.MOCK_DATA && window.MOCK_DATA.CHECKING_ACCOUNTS) || [{ accountNumber: "6538-2", accountName: "Conta Simulada", accountType: "CHECKING", companyId: 1 }];
      if (!companyId) return { results: all };
      return { results: all.filter(a => String(a.companyId) === String(companyId)) };
    }
    try {
      const params = [];
      if (companyId) params.push(`companyId=${companyId}`);
      if (!opts.allStatuses) params.push("accountStatus=ENABLED");
      const q = `/checking-accounts${params.length ? "?" + params.join("&") : ""}`;
      const list = await siengeFetchAllPages(q, 100);
      return { results: list };
    } catch (e) {
      console.error("[Sienge] Erro ao obter contas correntes:", e);
      return { results: [] };
    }
  },

  async getAccountBalances(balanceDate, opts = {}) {
    const date = String(balanceDate || "").slice(0, 10);
    const showLast = opts.showLast === false ? "N" : "S";
    if (s_apiMode === "simulado") {
      const all = (window.MOCK_DATA && window.MOCK_DATA.ACCOUNT_BALANCES) || [];
      return all
        .filter(b => !date || String(b.balanceDate || "").slice(0, 10) <= date)
        .map(b => ({ ...b }));
    }
    if (!date) return [];
    try {
      const ep = `/accounts-balances?balanceDate=${encodeURIComponent(date)}&showLastBalanceIfNotExistBalance=${showLast}`;
      const withCo = opts.companyId ? `${ep}&companyId=${encodeURIComponent(opts.companyId)}` : ep;
      const list = await siengeFetchAllPages(withCo, 300);
      if (list && list.length) return list;
      const res = await siengeFetchWithRetry(`${withCo}&limit=300&offset=0`);
      return (res && (res.results || res.data)) || [];
    } catch (e) {
      console.error("[Sienge] Erro ao obter saldos de contas:", e);
      return [];
    }
  },

  // 22. Listar Contas Correntes Disponíveis pelo Centro de Custo (aba Disponível)
  parseCostCenterAvailableResponse(res) {
    if (!res) return { idCompany: null, list: [] };
    if (typeof res === "string") {
      try { res = JSON.parse(res); } catch (e) { return { idCompany: null, list: [] }; }
    }
    const bags = [];
    const pushBag = (arr) => { if (Array.isArray(arr)) bags.push(...arr); };
    pushBag(res.availables);
    pushBag(res.availableCheckingAccounts);
    pushBag(res.checkingAccounts);
    pushBag(res.accounts);
    if (Array.isArray(res.results)) pushBag(res.results);
    else if (res.results && typeof res.results === "object") {
      pushBag(res.results.availables);
      pushBag(res.results.checkingAccounts);
    }
    if (Array.isArray(res.data)) pushBag(res.data);
    else if (res.data && typeof res.data === "object") pushBag(res.data.availables);

    const seen = new Set();
    const list = [];
    bags.forEach(acc => {
      if (acc == null) return;
      if (typeof acc === "string" || typeof acc === "number") {
        const accountNumber = String(acc).trim();
        if (!accountNumber) return;
        if (seen.has(accountNumber)) return;
        seen.add(accountNumber);
        list.push({ accountNumber, accountName: "Conta corrente", checkingAccountId: null, companyId: res.idCompany || res.companyId || null });
        return;
      }
      if (typeof acc !== "object") return;
      const nested = acc.checkingAccounts || acc.availables;
      const rows = Array.isArray(nested) && nested.length ? nested : [acc];
      rows.forEach(row => {
        if (row == null) return;
        if (typeof row === "string" || typeof row === "number") {
          const accountNumber = String(row).trim();
          if (!accountNumber || seen.has(accountNumber)) return;
          seen.add(accountNumber);
          list.push({ accountNumber, accountName: "Conta corrente", checkingAccountId: null, companyId: res.idCompany || res.companyId || null });
          return;
        }
        if (typeof row !== "object") return;
        const selected = row.selected;
        if (selected === false || selected === "N" || selected === "n" || selected === 0 || selected === "false") return;
        const accountNumber = String(row.accountNumber || row.number || row.account || row.account_number || "").trim();
        const idCandidates = [row.checkingAccountId, row.idCheckingAccount, row.accountId, row.idAccount, row.bankAccountId];
        let checkingAccountId = null;
        for (let i = 0; i < idCandidates.length; i++) {
          const rawId = idCandidates[i];
          if (rawId == null || rawId === "") continue;
          const s = String(rawId).trim();
          if (/^\d+$/.test(s)) { checkingAccountId = Number(s); break; }
        }
        if (!accountNumber && !checkingAccountId) return;
        const key = String(checkingAccountId || accountNumber);
        if (seen.has(key)) return;
        seen.add(key);
        list.push({
          ...row,
          accountNumber,
          accountName: row.accountName || row.name || row.description || "Conta corrente",
          checkingAccountId,
          companyId: row.companyId || row.idCompany || res.idCompany || res.companyId || null
        });
      });
    });
    return {
      idCompany: res.idCompany || res.companyId || null,
      list
    };
  },

  async getCostCenterAvailableAccounts(costCenterId) {
    const ids = [];
    const addId = (v) => {
      const m = String(v || "").match(/(\d{3,})/);
      const id = m ? m[1] : (v != null && v !== "" && v !== "N/D" && v !== "undefined" ? String(v).trim() : "");
      if (id && id !== "N/D" && !ids.includes(id)) ids.push(id);
    };
    addId(costCenterId);
    if (typeof window !== "undefined" && window.AppState) {
      addId(window.AppState.currentCostCenterId);
      const sale = (window.AppState.sales || []).find(s =>
        String(s.id) === String(window.AppState.selectedSaleId) ||
        String(s.receivableBillId) === String(window.AppState.selectedSaleId)
      );
      if (sale) {
        addId(sale.costCenterId);
        addId(sale.enterpriseId);
      }
      const bills = [
        ...(window.AppState.defaultersBills || []),
        ...(window.AppState.subjudiceBills || []),
        ...(window.AppState.zeroPaidBills || [])
      ];
      const bill = bills.find(b =>
        String(b.receivableBillId || b.billId) === String(window.AppState.currentReceivableBillId) ||
        String(b.receivableBillId) === String(window.AppState.selectedSaleId)
      );
      if (bill) addId(bill.costCenterId || (bill.costCentersId && bill.costCentersId[0]));
    }
    if (typeof document !== "undefined") {
      const ctx = document.getElementById("ctx-empreend-val");
      if (ctx && ctx.textContent) addId(ctx.textContent);
      const lot = document.getElementById("det-block-lot-span");
      if (lot && lot.textContent) addId(lot.textContent);
    }

    if (s_apiMode === "simulado") {
      return { idCompany: 1, availables: [{ checkingAccountId: 1, accountNumber: "99363-5", accountName: "C/C (MLDU) - ITAU" }], results: [{ checkingAccountId: 1, accountNumber: "99363-5", accountName: "C/C (MLDU) - ITAU" }] };
    }
    if (!ids.length) return { results: [], availables: [] };

    let lastRes = null;
    for (const id of ids) {
      try {
        const res = await siengeFetchWithRetry(`/cost-centers/${id}/available`, 2);
        lastRes = res;
        const parsed = this.parseCostCenterAvailableResponse(res);
        if (parsed.list.length) {
          console.log("[Sienge] Contas do disponível do CC", id, parsed.list.map(a => a.accountNumber));
          return { ...(res || {}), idCompany: parsed.idCompany, availables: parsed.list, results: parsed.list };
        }
      } catch (e) {
        console.warn("[Sienge] Disponível do CC", id, e && e.message);
      }
    }
    const empty = this.parseCostCenterAvailableResponse(lastRes);
    return { ...(lastRes || {}), idCompany: empty.idCompany, availables: [], results: [] };
  },

  // 22. Criar Boleto (POST overdue-receivable-bill)
  async createOverdueBill(payload, onRetry) {
    if (s_apiMode === "simulado") {
      return { success: true, message: "Modo Simulado: Boleto gerado com sucesso!" };
    }
    return await siengePost('/overdue-receivable-bill', payload, 8, typeof onRetry === "function" ? onRetry : undefined);
  },

  // 23. Anexos do Cliente
  async getCustomerAttachments(customerId) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!customerId) return { results: [] };
    try {
      const res = await siengeFetchWithRetry(`/customers/${customerId}/attachments?limit=100&offset=0`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter anexos do cliente:", e);
      return { results: [] };
    }
  },

  // 24. Extrato de Débitos (para validar cônjuge)
  async getCurrentDebitBalance(cpf) {
    if (s_apiMode === "simulado") {
      return { results: [] };
    }
    if (!cpf) return { results: [] };
    try {
      // Remove mscara do CPF se houver
      const cleanCpf = cpf.replace(/\D/g, '');
      const res = await siengeFetchWithRetry(`/current-debit-balance?cpf=${cleanCpf}&dueDateStart=1996-01-01&dueDateEnd=2050-01-01`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter saldo devedor por CPF:", e);
      return { results: [] };
    }
  },

  // 25. Indexadores
  async getIndexers() {
    if (s_apiMode === "simulado") {
      return { results: [
        { id: 1, name: "IGPM" },
        { id: 2, name: "INCC" },
        { id: 3, name: "IPCA" }
      ]};
    }
    try {
      const res = await siengeFetchWithRetry(`/indexers?limit=100&offset=0`);
      return res;
    } catch (e) {
      console.error("[Sienge] Erro ao obter indexadores:", e);
      return { results: [] };
    }
  },

  // 26. Plano Financeiro - Categorias de Pagamento
  async getPaymentCategories() {
    if (s_apiMode === "simulado") {
      return [
        { id: '5',     description: 'RECEITA',                                   type: 'Totalizador',   parentId: null },
        { id: '51.01', description: 'VENDA DE IMOVEIS',                          type: 'Resultado',     parentId: '5' },
        { id: '51.02', description: 'RECEITA DE SERVICOS',                       type: 'Resultado',     parentId: '5' },
        { id: '11.00', description: 'RECEITAS NAO OPERACIONAIS',                 type: 'Resultado',     parentId: '5' },
        { id: '51.03', description: 'ADIANTAMENTOS DE VENDAS',                   type: 'Resultado',     parentId: '5' },
        { id: '02',    description: 'IMPOSTOS',                                  type: 'Totalizador',   parentId: null },
        { id: '12.07', description: 'IMPOSTOS SOBRE VENDAS',                     type: 'Resultado',     parentId: '02' },
        { id: '10.00', description: 'IMPOSTOS FINANCEIROS',                      type: 'Resultado',     parentId: '02' },
        { id: '03',    description: 'CUSTOS E DESPESAS',                         type: 'Total nivel 1', parentId: null },
        { id: '5.3',   description: 'CUSTOS',                                    type: 'Totalizador',   parentId: '03' },
        { id: '54.01', description: 'REPASSES TERRENOS',                         type: 'Resultado',     parentId: '5.3' },
        { id: '12',    description: 'PROJETOS E APROVACOES',                     type: 'Resultado',     parentId: '5.3' },
        { id: '04.08', description: 'OBRAS',                                     type: 'Resultado',     parentId: '5.3' },
        { id: '04.04', description: 'CUSTO ADIM. DE EMPREENDIMENTOS',            type: 'Resultado',     parentId: '5.3' },
        { id: '04.06', description: 'AQUISICAO DE NOVAS AREAS',                 type: 'Resultado',     parentId: '5.3' },
        { id: '05',    description: 'DESPESAS',                                  type: 'Totalizador',   parentId: '03' },
        { id: '55.02', description: 'DESPESAS CONVENIOS',                        type: 'Resultado',     parentId: '05' },
        { id: '55.03', description: 'MARKETING',                                 type: 'Resultado',     parentId: '05' },
        { id: '55.04', description: 'ADMINISTRATIVO',                            type: 'Resultado',     parentId: '05' },
        { id: '55.05', description: 'PESSOAL',                                   type: 'Resultado',     parentId: '05' },
        { id: '55.06', description: 'DESPESAS NAO OPERACIONAIS',                 type: 'Resultado',     parentId: '05' },
        { id: '55.01', description: 'DONATIVOS E CONTRIBUICOES',                 type: 'Resultado',     parentId: '05' },
        { id: '55.08', description: 'ADMINISTRACAO E FORNECEDORES',              type: 'Resultado',     parentId: '05' },
        { id: '55.09', description: 'RETENCOES',                                 type: 'Resultado',     parentId: '05' },
        { id: '14.11', description: 'OUTROS INVESTIMENTOS',                      type: 'Resultado',     parentId: '05' },
        { id: '14',    description: 'DESPESAS COM MANUTENCAO DE EMPREEND.',     type: 'Resultado',     parentId: '05' },
        { id: '06',    description: 'GGO - GERACAO DE CAIXA OPERACIONAL',        type: 'Total nivel 1', parentId: null },
        { id: '27',    description: 'CAPEX',                                     type: 'Total nivel 1', parentId: null },
        { id: '08',    description: 'FCO - FLUXO DE CAIXA LIVRE',               type: 'Total nivel 1', parentId: null },
        { id: '09',    description: 'RESULTADO FINANCEIRO',                      type: 'Totalizador',   parentId: null },
        { id: '29.01', description: 'RECEITAS FINANCEIRAS',                      type: 'Resultado',     parentId: '09' },
        { id: '19.02', description: 'DESPESAS FINANCEIRAS',                      type: 'Resultado',     parentId: '09' },
        { id: '19.03', description: 'FUNDO DE INVESTIMENTO',                     type: 'Resultado',     parentId: '09' },
        { id: '29.02', description: 'CAPTACOES',                                 type: 'Resultado',     parentId: '09' },
        { id: '10',    description: 'AMORTIZACOES',                              type: 'Resultado',     parentId: '09' },
        { id: '010',   description: 'GGO - LUCRO DO RESULTADO FINANCEIRO',       type: 'Total nivel 1', parentId: null },
        { id: '11',    description: 'DIVIDENDOS E APORTES',                      type: 'Totalizador',   parentId: null },
        { id: '11.01', description: '(-) DIVIDENDOS',                            type: 'Resultado',     parentId: '11' },
        { id: '11.02', description: '(+) DIVIDENDOS',                            type: 'Resultado',     parentId: '11' },
        { id: '11.03', description: 'APORTES',                                   type: 'Resultado',     parentId: '11' },
        { id: '16',    description: 'VARIACAO DE CAIXA',                         type: 'Total nivel 1', parentId: null },
      ];
    }
    try {
      const res = await siengeFetchWithRetry('/payment-categories');
      return res.results || (Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("[Sienge] Erro ao obter plano financeiro:", e);
      return [];
    }
  },

  // 27. Bulk Data - Income
  async getBulkIncome(startDate, endDate, companyId) {
    if (s_apiMode === "simulado") {
      console.warn("Modo simulado: getBulkIncome retornando array vazio.");
      return { data: [] };
    }
    try {
      // The API endpoint: /bulk-data/v1/income?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&selectionType=P&companyId=X
      let endpoint = `/bulk-data/v1/income?startDate=${startDate}&endDate=${endDate}&selectionType=P`;
      if (companyId) {
         endpoint += `&companyId=${companyId}`;
      }
      
      const res = await siengeFetchWithRetry(endpoint);
      
      if (res && res.data) {
        return { data: res.data };
      }
      
      return { data: [] };
    } catch (e) {
      console.error("[Sienge] Erro ao obter bulk income:", e);
      return { data: [] };
    }
  },

  // 28. Salvar Snapshot Diário de Inadimplência
  async saveDefaultersSnapshot(bills) {
    if (!bills || bills.length === 0) return;
    try {
      console.log("[Sienge] Preparando snapshot diário de inadimplência...");
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      // Regras de negócio
      // O 2º dia útil pode ser calculado com feriados fixos. Para simplificar no MVP, 
      // usaremos uma lógica de encontrar o 2º dia útil baseado nos dias da semana.
      let workDaysCount = 0;
      let secondWorkDay = null;
      for (let day = 1; day <= 31; day++) {
        const d = new Date(today.getFullYear(), today.getMonth(), day);
        if (d.getMonth() !== today.getMonth()) break;
        if (d.getDay() !== 0 && d.getDay() !== 6) { // Ignora fds (dá pra melhorar com feriados)
          workDaysCount++;
          if (workDaysCount === 2) {
            secondWorkDay = d;
            break;
          }
        }
      }
      
      const is_month_close = secondWorkDay && today.getDate() === secondWorkDay.getDate();
      const is_week_start = today.getDay() === 1; // Segunda
      const is_week_end = today.getDay() === 5;   // Sexta
      
      // Agrega os dados
      let totalValue = 0;
      let subjudiceCount = 0;
      let subjudiceValue = 0;
      
      const companyMap = {};
      const operatorMap = {};
      
      bills.forEach(b => {
        totalValue += b.value;
        if (b.subjudice === 'S') {
          subjudiceCount++;
          subjudiceValue += b.value;
        }
        
        // Empresa
        if (!companyMap[b.companyId]) {
          companyMap[b.companyId] = {
            company_id: b.companyId,
            count: 0, value: 0,
            cost_centers: {},
            aging: {
              d0_30: { count: 0, value: 0 },
              d31_60: { count: 0, value: 0 },
              d61_90: { count: 0, value: 0 },
              d91_180: { count: 0, value: 0 },
              d181_365: { count: 0, value: 0 },
              d365p: { count: 0, value: 0 }
            }
          };
        }
        
        const comp = companyMap[b.companyId];
        comp.count++;
        comp.value += b.value;
        
        // CC
        const cc = String(b.costCenterId || 'N/D');
        if (!comp.cost_centers[cc]) {
          comp.cost_centers[cc] = { id: cc, count: 0, value: 0 };
        }
        comp.cost_centers[cc].count++;
        comp.cost_centers[cc].value += b.value;
        
        // Aging
        const delay = Number(b.daysDelay != null ? b.daysDelay : b.maxDaysDelay) || 0;
        let agingKey = '';
        if (delay <= 30) agingKey = 'd0_30';
        else if (delay <= 60) agingKey = 'd31_60';
        else if (delay <= 90) agingKey = 'd61_90';
        else if (delay <= 180) agingKey = 'd91_180';
        else if (delay <= 365) agingKey = 'd181_365';
        else agingKey = 'd365p';
        
        comp.aging[agingKey].count++;
        comp.aging[agingKey].value += b.value;

        const opName = String(b.assignedOperator || 'NÃO ATRIBUÍDO').toUpperCase().trim();
        const billVal = Number(b.value != null ? b.value : b.overdueValue) || 0;
        const nTit = (Array.isArray(b.titles) && b.titles.length)
          ? b.titles.length
          : (Number(b.billCount) || 1);
        if (!operatorMap[opName]) {
          operatorMap[opName] = { name: opName, total_count: 0, total_value: 0, above31_count: 0, above31_value: 0 };
        }
        operatorMap[opName].total_count += nTit;
        operatorMap[opName].total_value += billVal;
        if (delay >= 31) {
          operatorMap[opName].above31_count += nTit;
          operatorMap[opName].above31_value += billVal;
        }
      });
      const uniqueCustomers = new Set(bills.map(b => b.customerId));

      const sjClients = {};
      const sjCenters = {};
      bills.forEach(b => {
        if (b.subjudice !== 'S') return;
        const cid = String(b.customerId || '');
        if (!cid) return;
        if (!sjClients[cid]) {
          sjClients[cid] = {
            id: cid,
            name: b.clientName || b.customerName || '',
            value: 0,
            titles: 0,
            cc: String(b.costCenterId || (b.costCentersId && (Array.isArray(b.costCentersId) ? b.costCentersId[0] : b.costCentersId)) || 'N/D')
          };
        }
        sjClients[cid].value += b.value || 0;
        sjClients[cid].titles += 1;
        const cc = sjClients[cid].cc;
        if (!sjCenters[cc]) sjCenters[cc] = { id: cc, value: 0, titles: 0, clients: 0 };
        sjCenters[cc].value += b.value || 0;
        sjCenters[cc].titles += 1;
      });
      Object.values(sjClients).forEach(c => {
        if (sjCenters[c.cc]) sjCenters[c.cc].clients += 1;
      });
      
      const payload = {
        date: dateStr,
        is_month_close,
        is_week_start,
        is_week_end,
        total_count: bills.length,
        total_customers: uniqueCustomers.size,
        total_value: totalValue,
        avg_ticket: totalValue / bills.length,
        subjudice_count: subjudiceCount,
        subjudice_customers: Object.keys(sjClients).length,
        subjudice_value: subjudiceValue,
        subjudice_detail: {
          clients: Object.values(sjClients),
          cost_centers: Object.values(sjCenters)
        },
        new_count: 0, // calculado no dashboard ao comparar com histórico
        recovered_count: 0, // calculado no dashboard ao comparar com histórico
        data_json: {
          companies: Object.values(companyMap).map(c => ({
            ...c,
            cost_centers: Object.values(c.cost_centers)
          })),
          operators: Object.values(operatorMap)
        }
      };

      if (window.firebaseCollections && window.firebaseDb) {
        try {
          const docRef = window.firebaseCollections.doc(window.firebaseDb, 'inadimplencia_snapshots', dateStr);
          await window.firebaseCollections.setDoc(docRef, payload);
          console.log(`[Firebase] Snapshot de dashboard (${dateStr}) salvo no Firestore com sucesso.`);
        } catch (fbErr) {
          console.error("[Firebase] Erro ao salvar snapshot no Firestore:", fbErr);
        }
      } else {
          console.error("[Firebase] Firebase não inicializado, impossível salvar snapshot.");
      }

    } catch (e) {
      console.error("[Sienge] Exceção ao salvar snapshot:", e);
    }
  },

  // 29. Sincronizar Histórico de Sub Judice no Firebase
  async syncSubjudiceHistory(bills) {
    if (!window.firebaseDb || !window.firebaseCollections) return;
    try {
      console.log("[Firebase] Sincronizando histórico Sub Judice...");
      const { collection, getDocs, doc, setDoc, query, where } = window.firebaseCollections;
      
      const q = query(collection(window.firebaseDb, "sienge_customers"), where("is_subjudice", "==", true));
      const snap = await getDocs(q);
      const currentFirebaseSubjudice = new Map();
      snap.forEach(d => currentFirebaseSubjudice.set(d.id, d.data()));
      
      const siengeSubjudice = new Set();
      bills.forEach(b => {
         if (b.subjudice === 'S') siengeSubjudice.add(String(b.customerId || b.clientId));
      });
      
      const todayStr = new Date().toISOString();
      const batchPromises = [];
      
      for (const cId of siengeSubjudice) {
         if (!currentFirebaseSubjudice.has(cId)) {
             const docRef = doc(window.firebaseDb, "sienge_customers", cId);
             batchPromises.push(setDoc(docRef, {
                 is_subjudice: true,
                 subjudice_entry_date: todayStr,
                 subjudice_exit_date: null
             }, { merge: true }));
         }
      }
      
      for (const [cId, data] of currentFirebaseSubjudice.entries()) {
         if (!siengeSubjudice.has(cId)) {
             const docRef = doc(window.firebaseDb, "sienge_customers", cId);
             batchPromises.push(setDoc(docRef, {
                 is_subjudice: false,
                 subjudice_exit_date: todayStr
             }, { merge: true }));
         }
      }
      
      await Promise.allSettled(batchPromises);
      if (batchPromises.length > 0) {
         console.log(`[Firebase] Sincronizado histórico Sub Judice. ${batchPromises.length} alterações.`);
      }
    } catch (e) {
      console.error("[Firebase] Erro no syncSubjudiceHistory:", e);
    }
  }
};

window.SiengeApiService = SiengeApiService;
window.setSiengeApiMode = setApiMode;
window.getSiengeApiMode = getApiMode;
window.SIENGE_CONFIG = SIENGE_CONFIG;
