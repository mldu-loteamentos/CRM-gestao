// MÓDULO ASSISTENTE DE ANEXOS

const AnexosState = {
  contexto: 'Ambos', // 'Unidade', 'Cliente', 'Ambos'
  cc: '',
  unidades: [],
  selectedUnidade: null,
  idCliente: '',
  dataDocumento: '',
  files: [], // Array de { id, file, base64, size, tagOriginal, tags: [], status: 'Processando'|'Pronto'|'Revisar'|'Erro', uploadProgress: 0, previewUrl, dateOverride: '', downloadedId: '' }
  tagsAtivas: [], // Agora guardaremos o objeto inteiro {name, destino}
  isUploading: false,
  activeContract: null, // Guardará { id, customerName }
  contractAttachments: [],
  importedContracts: new Set(),
  downloadedFilesIds: new Set()
};

function anexosApiUrl(path) {
  const host = window.location.hostname;
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1';
  const port = (window.location.port === '5500' || !window.location.port) ? '3000' : window.location.port;
  const origin = isLocal ? `http://localhost:${port}` : '';
  let p = String(path || '');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.startsWith('/sienge-proxy')) p = '/api' + p;
  return origin + p;
}

function anexosPersonId(p) {
  if (!p) return '';
  if (p.customerId !== undefined && p.customerId !== null && p.customerId !== '') return String(p.customerId);
  if (p.id !== undefined && p.id !== null && p.id !== '') return String(p.id);
  return '';
}

function anexosNormName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function anexosLookupCustomerName(id) {
  if (!id) return '';
  const sid = String(id);
  const fromObj = (c) => {
    if (!c) return '';
    return String(c.name || c.nome || c.customerName || '').trim();
  };
  const st = window.AppState;
  if (st && st.customers) {
    const hit = st.customers[sid] || st.customers[id] || st.customers[Number(sid)];
    const n = fromObj(hit);
    if (n) return n;
  }
  if (st && Array.isArray(st.allCustomers)) {
    const hit = st.allCustomers.find(c => String(c.id) === sid);
    const n = fromObj(hit);
    if (n) return n;
  }
  return '';
}

function anexosPersonLabel(id, fallback) {
  return anexosLookupCustomerName(id) || String(fallback || '').trim() || (id ? `Cliente ${id}` : '');
}

async function anexosHydrateContractPeople() {
  const ac = AnexosState.activeContract;
  if (!ac) return;
  const ids = new Set();
  (Array.isArray(ac.customers) ? ac.customers : []).forEach(cust => {
    const id = anexosPersonId(cust);
    if (id) ids.add(id);
    const spouseObj = cust && cust.spouse && typeof cust.spouse === 'object' ? cust.spouse : null;
    if (spouseObj) {
      const sid = anexosPersonId(spouseObj);
      if (sid) ids.add(sid);
    }
  });
  if (ac.customerId) ids.add(String(ac.customerId));
  const svc = window.SiengeApiService;
  if (!svc || typeof svc.getCustomer !== 'function' || !ids.size) return;
  window.AppState = window.AppState || {};
  AppState.customers = AppState.customers || {};
  await Promise.all([...ids].map(async (id) => {
    if (anexosLookupCustomerName(id)) return;
    try {
      const c = await svc.getCustomer(id);
      if (c) AppState.customers[id] = c;
    } catch (e) {}
  }));
  const cadName = anexosLookupCustomerName(ac.customerId);
  if (cadName) ac.customerName = cadName;
}

function anexosContractPeople() {
  const ac = AnexosState.activeContract;
  const raw = (ac && Array.isArray(ac.customers)) ? ac.customers : [];
  const out = [];
  const push = (id, name, role) => {
    if (!id) return;
    const label = anexosPersonLabel(id, name);
    if (!label) return;
    out.push({ id: String(id), name: label, role });
  };
  raw.forEach(cust => {
    const spouseObj = cust && cust.spouse && typeof cust.spouse === 'object' ? cust.spouse : null;
    const isMain = cust.main === true || cust.main === 'true';
    const isSpouseFlag = cust.spouse === true || cust.spouse === 'true';
    const role = isMain ? 'Principal' : (isSpouseFlag ? 'Cônjuge' : 'Secundário / Rep.');
    const pid = anexosPersonId(cust);
    let rawName = cust.name || cust.customerName || '';
    const nestedSpouseName = spouseObj ? (spouseObj.name || spouseObj.customerName || spouseObj.spouseName) : '';
    if (nestedSpouseName && anexosNormName(rawName) === anexosNormName(nestedSpouseName)) rawName = '';
    push(pid, rawName, role);
    if (spouseObj) {
      const sid = anexosPersonId(spouseObj);
      if (sid && sid !== pid) {
        push(sid, nestedSpouseName, 'Cônjuge');
      }
    }
  });
  const byId = new Map();
  out.forEach(p => {
    const prev = byId.get(p.id);
    if (!prev || p.role === 'Principal') byId.set(p.id, p);
  });
  const people = [...byId.values()].sort((a, b) => {
    const rank = (r) => (r === 'Principal' ? 0 : r === 'Cônjuge' ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });
  if (!people.length && ac && ac.customerId) {
    people.push({ id: String(ac.customerId), name: anexosPersonLabel(ac.customerId, ac.customerName), role: 'Principal' });
  }
  return people;
}

function anexosAssignClientTarget(file) {
  if (!file) return;
  const mainTag = AnexosState.tagsAtivas.find(t => t.name === file.tags[0]);
  if (!mainTag || mainTag.destino !== 'Cliente') return;
  const people = anexosContractPeople();
  if (people.length === 1) file.targetCustomerId = people[0].id;
}

function anexosSafeFileName(name) {
  let s = String(name || 'arquivo');
  s = s.replace(/[\\/:*?"<>|]+/g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\.+/, '');
  if (!s) s = 'arquivo';
  return s.slice(0, 180);
}

function anexosLatin1Bytes(str) {
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c > 255) {
      const a = str[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      c = a.charCodeAt(0);
      if (!(c <= 255)) c = 95;
    }
    u8[i] = c;
  }
  return u8;
}

async function anexosMultipartBody(fileBlob, filename) {
  const safeName = anexosSafeFileName(filename).replace(/"/g, "'");
  const mime = (fileBlob && fileBlob.type) || 'application/octet-stream';
  const boundary = '----CrmAnexos' + Date.now().toString(16);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const fileBuf = new Uint8Array(await (fileBlob instanceof Blob ? fileBlob.arrayBuffer() : new Blob([fileBlob]).arrayBuffer()));
  const headB = anexosLatin1Bytes(head);
  const tailB = anexosLatin1Bytes(tail);
  const body = new Uint8Array(headB.length + fileBuf.length + tailB.length);
  body.set(headB, 0);
  body.set(fileBuf, headB.length);
  body.set(tailB, headB.length + fileBuf.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}`, fileName: safeName };
}

// --- RENDERIZAÇÃO DA INTERFACE ---

function renderAnexosModule() {
  const targetId = window.anexosTargetId || 'anexos-root';
  const root = document.getElementById(targetId);
  if (!root) return;

  const isModal = targetId === 'anexos-cliente-root';

  root.innerHTML = `
    <div class="anexos-container" style="padding: 20px; max-width: 1200px; margin: 0 auto;">
      <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 20px; display: ${isModal ? 'none' : 'flex'};">
        <button class="btn btn-secondary" onclick="AnexosApp.resetAndRender()"><i data-lucide="refresh-cw" style="width: 16px;"></i> Limpar Campos</button>
      </div>
      
      ${isModal ? '' : `
      <!-- ETAPA 1 e 2: Identificação e Data -->
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--color-border); margin-bottom: 25px;">
          <h4 style="margin: 0;">1. Identificação do Documento</h4>
          <div style="display: flex; gap: 15px; font-weight: 500; font-size: 0.95rem;">
            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <input type="radio" name="anexos-contexto" value="Unidade" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Unidade' ? 'checked' : ''}> Só Unidade
            </label>
            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <input type="radio" name="anexos-contexto" value="Cliente" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Cliente' ? 'checked' : ''}> Só Cliente
            </label>
            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <input type="radio" name="anexos-contexto" value="Ambos" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Ambos' ? 'checked' : ''}> Ambos
            </label>
          </div>
        </div>
        <div class="card-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px 25px; align-items: start;">
             ${AnexosState.contexto !== 'Cliente' ? `
            <div class="form-group" style="margin-bottom: 0;">
              <label>Centro de Custo (Empreendimento)</label>
              <div style="display: flex; gap: 10px; position: relative;">
                <input type="text" id="anexos-cc" class="form-control" placeholder="Buscar por Nome ou ID..." value="${AnexosState.cc}" style="flex: 1; min-width: 0;" oninput="AnexosApp.handleCostCenterAutocomplete(this.value)" autocomplete="off">
                <button class="btn btn-primary" onclick="AnexosApp.buscarUnidades()" style="white-space: nowrap; flex-shrink: 0;"><i data-lucide="search" style="width:16px"></i> Buscar</button>
                <div id="anexos-cc-suggestions" class="suggestions-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 80px; background: white; border: 1px solid #e2e8f0; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000; max-height: 200px; overflow-y: auto;"></div>
              </div>
            </div>

            <div style="display: flex; gap: 15px; margin-bottom: 0;">
              <div class="form-group" style="flex: 1; margin-bottom: 0; position: relative;">
                <label>Selecione a Unidade</label>
                <select id="anexos-unidade" class="form-control" onchange="AnexosApp.selecionarUnidade(this.value)" ${AnexosState.unidades.length ? '' : 'disabled'}>
                  <option value="">Selecione uma unidade...</option>
                  ${AnexosState.unidades.map(u => `<option value="${u.id}" ${AnexosState.selectedUnidade == u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
                </select>
                <div id="anexos-unidade-loading" style="display: none; font-size: 12px; color: var(--color-primary); margin-top: 5px; position: absolute; bottom: -20px; left: 0;">Carregando unidades...</div>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>Data Global do Documento</label>
                <input type="date" id="anexos-data" class="form-control" max="${new Date().toISOString().split('T')[0]}" onchange="AnexosApp.setData()" value="${AnexosState.dataDocumento ? AnexosState.dataDocumento.replace(/\./g, '-') : ''}">
              </div>
            </div>
            ` : `
            <div style="display: flex; gap: 15px; margin-bottom: 0;">
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>Data Global do Documento</label>
                <input type="date" id="anexos-data" class="form-control" max="${new Date().toISOString().split('T')[0]}" onchange="AnexosApp.setData()" value="${AnexosState.dataDocumento ? AnexosState.dataDocumento.replace(/\./g, '-') : ''}">
              </div>
              <div style="flex: 1;"></div>
            </div>
            `}

            ${AnexosState.contexto === 'Cliente' ? `
            <div class="form-group" style="margin-bottom: 0;">
              <label>ID Cliente ou CPF/CNPJ</label>
              <input type="text" id="anexos-idcliente" class="form-control" placeholder="ID ou CPF/CNPJ" value="${AnexosState.idCliente}" onchange="AnexosState.idCliente = this.value; renderAnexosModule();">
            </div>
            ` : ''}

        </div>
        </div>
      `}
        
      <!-- ETAPA 1.5: Informações Encontradas -->
        <div style="margin-bottom: 25px; min-height: 110px; display: flex; flex-direction: column; justify-content: center;">
          ${AnexosState.activeContract || AnexosState.ccName ? `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; padding: 10px 0;">
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <span style="font-size: 0.8rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">INFORMAÇÕES DO CONTRATO</span>
                <div style="font-size: 1.05rem; color: var(--color-text); font-weight: 500; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                  ${AnexosState.activeContract || AnexosState.idCliente ? `
                    <span style="font-weight: 600;">
                      <i data-lucide="user" style="width: 16px; height: 16px; color: var(--color-primary); margin-right: 4px; vertical-align: text-bottom;"></i>
                      ${AnexosState.idCliente ? AnexosState.idCliente + ' - ' : ''}${AnexosState.activeContract ? AnexosState.activeContract.customerName : 'Cliente'}
                    </span>
                    <span style="color: var(--color-text-muted);">|</span>
                  ` : ''}
                  
                  ${AnexosState.ccName ? `
                    <span>
                      <i data-lucide="map-pin" style="width: 16px; height: 16px; color: var(--color-primary); margin-right: 4px; vertical-align: text-bottom;"></i>
                      ${AnexosState.ccName}
                    </span>
                  ` : ''}
                  
                  ${AnexosState.activeContract ? `
                    <span style="color: var(--color-text-muted);">|</span>
                    <span>
                      <i data-lucide="file-text" style="width: 16px; height: 16px; color: var(--color-primary); margin-right: 4px; vertical-align: text-bottom;"></i>
                      ${AnexosState.activeContract.contractNumber}
                    </span>
                  ` : ''}
                  
                  ${AnexosState.activeContract && AnexosState.activeContract.contractDate ? `
                    <span style="color: var(--color-text-muted);">|</span>
                    <span>
                      <i data-lucide="calendar" style="width: 16px; height: 16px; color: var(--color-primary); margin-right: 4px; vertical-align: text-bottom;"></i>
                      ${AnexosState.activeContract.contractDate}
                    </span>
                  ` : ''}
                </div>
              </div>

              <div>
                ${AnexosState.activeContract ? `
                  ${AnexosState.contractAttachments.length > 0 ? 
                    (AnexosState.importedContracts.has(AnexosState.activeContract.id) ? 
                      `<span style="color: var(--color-success); font-weight: 500; font-size: 0.95rem; padding: 8px 16px; background: #eef8f2; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #c3e6cb;"><i data-lucide="check-circle" style="width:18px;"></i> ${AnexosState.contractAttachments.length} Anexos Importados</span>`
                      : `<button class="btn btn-outline" style="padding: 8px 16px; font-weight: 500; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 8px; border-color: var(--color-primary); color: var(--color-primary);" onclick="AnexosApp.importarAnexosDoContrato()"><i data-lucide="download" style="width:18px;"></i> Baixar ${AnexosState.contractAttachments.length} Anexos</button>`)
                    : `<span style="color: var(--color-text-muted); font-size: 0.95rem; padding: 10px;">Nenhum anexo no contrato</span>`
                  }
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        </div>

      <!-- ETAPA 3: Upload e Revisão -->
      <div class="card" style="margin-bottom: 20px; transition: opacity 0.3s ease;">
        <div class="card-body">
          <div id="anexos-dropzone" class="dropzone" style="border: 2px dashed var(--color-primary); padding: 40px; text-align: center; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; margin-bottom: 20px; max-width: 800px; margin-left: auto; margin-right: auto;">
            <i data-lucide="upload-cloud" style="width: 48px; height: 48px; color: var(--color-primary); margin-bottom: 10px;"></i>
            <h4>Arraste os arquivos aqui ou clique para selecionar</h4>
            <p style="color: var(--color-text-muted); font-size: 0.9rem;">Aceito: PDF, JPG, PNG (Max 70MB). Identificação automática de OCR ativa.</p>
            <input type="file" id="anexos-file-input" multiple accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
          </div>
          
          <div id="anexos-preparados-section" style="display: ${AnexosState.files.length > 0 ? 'block' : 'none'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--color-border); padding-bottom: 15px; max-width: 800px; margin-left: auto; margin-right: auto;">
              <h4 style="margin: 0;">Arquivos ${isModal ? 'Encontrados' : 'Preparados'} (${AnexosState.files.length})</h4>
              ${isModal ? '' : `<button class="btn btn-outline" onclick="AnexosApp.solicitarTag()"><i data-lucide="tag" style="width:16px"></i> Solicitar Nova TAG</button>`}
            </div>
            <div id="anexos-files-list" style="display: flex; flex-direction: column; margin-bottom: 20px; max-width: 800px; margin-left: auto; margin-right: auto;">
              <!-- Renderizado dinamicamente -->
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 15px; border-top: 1px solid var(--color-border);">
              <button class="btn btn-outline" style="color: var(--color-danger); border-color: var(--color-danger);" onclick="AnexosApp.removerTodos()"><i data-lucide="trash-2" style="width:16px"></i> Remover Todos</button>
              <div style="display: flex; flex-direction: column; align-items: flex-end;">
                <style>
                  #anexos-btn-enviar {
                    font-size: 1.1rem; 
                    padding: 12px 40px; 
                    background: linear-gradient(135deg, #153123 0%, #204a35 100%); 
                    color: white; 
                    border: none; 
                    border-radius: 8px; 
                    box-shadow: 0 4px 15px rgba(21, 49, 35, 0.3); 
                    transition: all 0.3s ease; 
                    display: flex; 
                    align-items: center; 
                    gap: 10px; 
                    font-weight: 600;
                    cursor: pointer;
                  }
                  #anexos-btn-enviar:hover:not([disabled]) {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(21, 49, 35, 0.4);
                  }
                  #anexos-btn-enviar:active:not([disabled]) {
                    transform: translateY(1px);
                  }
                  #anexos-btn-enviar[disabled] {
                    opacity: 0.5;
                    cursor: not-allowed;
                    filter: grayscale(100%);
                  }
                </style>
                <button id="anexos-btn-enviar" onclick="AnexosApp.confirmarEnvio()">
                  <i data-lucide="${isModal ? 'save' : 'send'}" style="width:20px"></i> ${isModal ? 'Enviar para Jurídico' : 'Enviar ' + AnexosState.files.length + ' para o Sienge'}
                </button>
                <small id="anexos-btn-enviar-hint" style="color: var(--color-warning); margin-top: 8px; display: none; font-weight: 500;">Altere as tags de "DOC" para habilitar o envio</small>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal Upload -->
    <div id="anexos-upload-modal" class="modal-overlay" style="display: none;">
      <div class="modal-box" style="text-align: center; max-width: 500px;">
        <h3>Enviando para o Sienge</h3>
        <p id="upload-status-text" style="margin: 20px 0; font-size: 1.1rem;">Iniciando upload...</p>
        
        <div style="background: var(--color-background); border-radius: 10px; height: 25px; width: 100%; overflow: hidden; margin-bottom: 10px; border: 1px solid #ddd; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
          <div id="upload-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #153123 0%, #204a35 100%); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 10px 0 0 10px;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; color: var(--color-text-muted); font-size: 0.95rem; margin-bottom: 20px; font-weight: 500;">
          <span id="upload-arquivo-atual"></span>
          <span id="upload-tempo-restante">--</span>
        </div>

        <div id="upload-summary" style="margin-bottom: 20px; text-align: left; max-height: 150px; overflow-y: auto; font-size: 0.9rem; color: var(--color-text);"></div>

        <button id="btn-cancelar-upload" class="btn btn-danger" onclick="AnexosApp.cancelarUpload()">Cancelar Envio</button>
        <button id="btn-fechar-upload" class="btn btn-primary" style="display: none;" onclick="AnexosApp.fecharUploadModal()">Fechar</button>
      </div>
    </div>
  `;

  AnexosApp.bindEvents();
  lucide.createIcons();
  AnexosApp.loadTagsAtivas();
  AnexosApp.loadEnterprisesInBackground();
}

// --- LOGICA DE NEGOCIO ---

const AnexosDB = {
  dbName: 'CRM_AnexosDB',
  storeName: 'customerAttachments',
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'customerId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async save(customerId, files) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ customerId: String(customerId), files: files });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async load(customerId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(String(customerId));
      request.onsuccess = () => {
        resolve(request.result ? request.result.files : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
};

const AnexosApp = {
  
  resetAndRender() {
    AnexosState.contexto = 'Ambos';
    AnexosState.cc = '';
    AnexosState.ccNome = '';
    AnexosState.ccName = '';
    AnexosState.activeContract = null;
    AnexosState.contractAttachments = [];
    AnexosState.unidades = [];
    AnexosState.selectedUnidade = null;
    AnexosState.idCliente = '';
    AnexosState.dataDocumento = '';
    AnexosState.files = [];
    AnexosState.isUploading = false;
    AnexosState.importedContracts.clear();
    AnexosState.downloadedFilesIds.clear();
    renderAnexosModule();
  },

  async loadEnterprisesInBackground() {
    if (AnexosState.enterprisesLoaded) return;
    try {
      if (window.SiengeApiService && window.SiengeApiService.getEnterprises) {
        AnexosState.enterprises = await window.SiengeApiService.getEnterprises();
        AnexosState.enterprisesLoaded = true;
      }
    } catch(e) {
      console.error("Erro ao carregar empreendimentos:", e);
    }
  },

  handleCostCenterAutocomplete(val) {
    AnexosState.cc = val;
    const suggestionsDiv = document.getElementById('anexos-cc-suggestions');
    if (!val || val.length < 2) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    if (!AnexosState.enterprises) AnexosState.enterprises = [];
    
    const term = val.toLowerCase().trim();
    const filtered = AnexosState.enterprises.filter(e => {
      const name = String(e.name || "").toLowerCase();
      const id = String(e.id || "");
      // Busca ID ou Nome
      return name.includes(term) || id.includes(term);
    }).slice(0, 10);
    
    if (filtered.length === 0) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    suggestionsDiv.innerHTML = filtered.map(e => `
      <div class="suggestion-item" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px;"
           onclick="AnexosApp.selectCostCenter('${e.id}', '${e.name}')">
        <div style="background: #eef8f2; color: var(--color-primary); padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">${e.id}</div>
        <div style="font-weight: 500; font-size: 0.9rem;">${e.name}</div>
      </div>
    `).join('');
    
    suggestionsDiv.style.display = 'block';
  },

  selectCostCenter(id, name) {
    AnexosState.cc = id;
    AnexosState.ccName = name;
    document.getElementById('anexos-cc').value = id;
    document.getElementById('anexos-cc-suggestions').style.display = 'none';
    AnexosApp.buscarUnidades();
  },

  bindEvents() {
    const dropzone = document.getElementById('anexos-dropzone');
    const fileInput = document.getElementById('anexos-file-input');

    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput.click());
      
      dropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'var(--color-background-alt)';
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'var(--color-background-alt)';
      });
      
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'transparent';
      });
      
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'transparent';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          AnexosApp.handleFiles(Array.from(e.dataTransfer.files));
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          AnexosApp.handleFiles(Array.from(e.target.files));
        }
        // Limpar o input para permitir selecionar o mesmo arquivo novamente
        e.target.value = '';
      });
    }

        // Prevenir que o navegador abra o PDF caso o usurio erre o alvo do drag and drop
    
    // Criar overlay global de drag and drop e registrar listeners globais APENAS UMA VEZ
    if (!window.anexosGlobalDragBound) {
      window.anexosGlobalDragBound = true;
      
      if (!document.getElementById('global-drag-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'global-drag-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(27, 130, 83, 0.95); color:white; display:none; justify-content:center; align-items:center; z-index:99999; flex-direction:column; border: 8px dashed rgba(255,255,255,0.4); pointer-events:none; transition: all 0.2s ease;';
        overlay.innerHTML = '<i data-lucide="upload-cloud" style="width: 120px; height: 120px; margin-bottom: 30px; color: #fff;"></i><h1 style="font-size: 3rem; margin:0;">Solte seus anexos aqui</h1><p style="font-size: 1.2rem; opacity: 0.8; margin-top: 10px;">Os arquivos sero vinculados  unidade selecionada.</p>';
        document.body.appendChild(overlay);
      }

      let dragCounter = 0;

      window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const tab = document.getElementById('tab-anexos');
        if (tab && tab.style.display !== 'none') {
          dragCounter++;
          const overlay = document.getElementById('global-drag-overlay');
          if (overlay) overlay.style.display = 'flex';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }, false);

      window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        const tab = document.getElementById('tab-anexos');
        if (tab && tab.style.display !== 'none') {
          dragCounter--;
          if (dragCounter <= 0) {
            dragCounter = 0;
            const overlay = document.getElementById('global-drag-overlay');
            if (overlay) overlay.style.display = 'none';
          }
        }
      }, false);

      window.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }, false);

      window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        const overlay = document.getElementById('global-drag-overlay');
        if (overlay) overlay.style.display = 'none';
        
        const tab = document.getElementById('tab-anexos');
        if (tab && tab.style.display !== 'none') {
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            AnexosApp.handleFiles(Array.from(e.dataTransfer.files));
          }
        }
      }, false);

      window.addEventListener('paste', (e) => {
        const tab = document.getElementById('tab-anexos');
        if (tab && tab.style.display !== 'none') {
          if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            AnexosApp.handleFiles(Array.from(e.clipboardData.files));
          }
        }
      });
    }
  },

  setData() {
    const val = document.getElementById('anexos-data').value;
    AnexosState.dataDocumento = val ? val.replace(/-/g, '.') : '';
    renderAnexosModule();
  },

  setContexto(val) {
    AnexosState.contexto = val;
    renderAnexosModule();
  },

  async selecionarUnidade(unitId) {
    AnexosState.selectedUnidade = unitId;
    AnexosState.activeContract = null;
    AnexosState.contractAttachments = [];
    renderAnexosModule();

    if (!unitId) return;

    try {
      // Find active contract
      const ccInput = document.getElementById('anexos-cc');
      const ccStr = AnexosState.cc || (ccInput ? ccInput.value : '');
      if (!ccStr) return;
      // To get contract for unit, we can use the backend proxy directly
      
      const scRes = await fetch(anexosApiUrl(`/sienge-proxy/sales-contracts?unitId=${unitId}`), {
        headers: { 'Authorization': getBasicAuthHeader() }
      });
      if (scRes.ok) {
        const scData = await scRes.json();
        let activeContracts = (scData.results || []).filter(c => c.status !== 'CANCELED');
        if (activeContracts.length === 0 && scData.results && scData.results.length > 0) {
            activeContracts = [scData.results[0]];
        }
        if (activeContracts.length > 0) {
          const mainC = activeContracts[0];
          const mainCust = mainC.salesContractCustomers?.find(cust => cust.main === true) || mainC.salesContractCustomers?.[0] || {};
          let fmtDate = '';
          if (mainC.contractDate || mainC.saleDate) {
            const rawD = mainC.contractDate || mainC.saleDate;
            const parts = rawD.split('-');
            if (parts.length === 3) fmtDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            else fmtDate = rawD;
          }

          AnexosState.activeContract = {
            id: mainC.id,
            contractNumber: mainC.contractNumber || mainC.number || mainC.id,
            customerName: mainCust.name || mainCust.customerName || mainC.customerName || 'Cliente',
            contractDate: fmtDate,
            customerId: mainCust.customerId || mainCust.id,
            customers: mainC.salesContractCustomers || []
          };
          await anexosHydrateContractPeople();

          if (AnexosState.contexto === 'Ambos' && !AnexosState.idCliente) {
            let doc = mainCust.cpf || mainCust.cnpj || mainCust.cpfCnpj;
            if (!doc && (mainCust.id || mainCust.customerId) && window.SiengeApiService) {
              try {
                const cData = await window.SiengeApiService.getCustomer(mainCust.id || mainCust.customerId);
                if (cData) doc = cData.cpfCnpj || cData.cpf || cData.cnpj;
              } catch(e) {}
            }
            if (doc) {
              const cleanDoc = String(doc).replace(/\D/g, '');
              if (cleanDoc.length === 11) AnexosState.idCliente = cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
              else if (cleanDoc.length === 14) AnexosState.idCliente = cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
              else AnexosState.idCliente = doc;
            }
          }

          renderAnexosModule();

          let allAttachments = [];
          // Fetch attachments do contrato atual
          const attRes = await fetch(anexosApiUrl(`/sienge-proxy/sales-contracts/${mainC.id}/attachments`), {
            headers: { 'Authorization': getBasicAuthHeader() }
          });
          if (attRes.ok) {
            const attData = await attRes.json();
            allAttachments = allAttachments.concat(attData.results || []);
          }

          // Fetch Histórico de Cessão para pegar antigos compradores (Puppeteer)
          let historicCustomers = [];
          try {
            const matchUnit = AnexosState.unidades ? AnexosState.unidades.find(u => u.id == unitId) : null;
            const nomeUnidade = matchUnit ? matchUnit.name : "";
            const numContrato = mainC.contractNumber || mainC.number || mainC.id;
            
            if (ccStr && nomeUnidade && numContrato) {
                const histRes = await fetch(anexosApiUrl(`/api/sienge/historico-cessao?unidade=${encodeURIComponent(nomeUnidade)}&empreendimento=${encodeURIComponent(ccStr)}&contrato=${encodeURIComponent(numContrato)}`));
                if (histRes.ok) {
                   historicCustomers = await histRes.json();
                }
            }
          } catch(err) {
            console.error("Erro ao buscar histórico de cessões via puppeteer:", err);
          }

          // Adicionar clientes antigos + cliente atual à lista de busca
          const customersToFetch = new Set();
          if (mainCust.customerId || mainCust.id) customersToFetch.add(mainCust.customerId || mainCust.id);
          historicCustomers.forEach(hc => customersToFetch.add(hc.customerId));

          // Fetch attachments das fichas dos clientes
          for (const custId of customersToFetch) {
            try {
              const cAttRes = await fetch(anexosApiUrl(`/sienge-proxy/customers/${custId}/attachments`), {
                headers: { 'Authorization': getBasicAuthHeader() }
              });
              if (cAttRes.ok) {
                 const cAttData = await cAttRes.json();
                 const custResults = (cAttData.results || []).map(a => ({ 
                    ...a, 
                    isCustomerAttachment: true, 
                    customerId: custId,
                    description: a.description ? `(Cliente ${custId}) ${a.description}` : `(Cliente ${custId}) Arquivo`
                 }));
                 allAttachments = allAttachments.concat(custResults);
              }
            } catch(e) {
               console.error(`Erro buscando anexos do cliente ${custId}:`, e);
            }
          }

          AnexosState.contractAttachments = allAttachments;
          renderAnexosModule();
        }
      }
    } catch (e) {
      console.error('Erro ao buscar contrato vigente:', e);
    }
  },

  importarAnexosDoContrato() {
    if (!AnexosState.activeContract || AnexosState.contractAttachments.length === 0) return;
    
    const isModal = window.anexosTargetId === 'anexos-cliente-root';

    // Se não for modal, mantemos o bloqueio original
    if (!isModal && AnexosState.importedContracts.has(AnexosState.activeContract.id)) {
      alert("Os anexos deste contrato já foram importados nesta sessão.");
      return;
    }

    const attachmentsToImport = AnexosState.contractAttachments.filter(att => {
        return !AnexosState.files.some(f => f.downloadedId === att.id);
    });

    if (attachmentsToImport.length === 0) {
        if (isModal) alert("Todos os anexos deste contrato já estão na lista.");
        return;
    }

    const novos = attachmentsToImport.map(att => {
      const fName = att.fileName || att.description || 'Anexo Sienge.pdf';
      const extMatch = fName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
      
      const fileObj = {
        id: 'imported_' + Math.random().toString(36).substr(2, 9),
        originalName: fName,
        file: { name: fName, size: 0, type: ext === 'pdf' ? 'application/pdf' : 'image/jpeg' },
        base64: null,
        ext: ext,
        size: 0,
        tagOriginal: att.description ? att.description.split(' ')[0] : 'DOC',
        tags: [],
        status: 'Baixando arquivo...',
        uploadProgress: 0,
        previewUrl: null,
        dateOverride: '',
        downloadedId: att.attachmentid || att.attachmentId || att.id
      };

      // Inicia download assíncrono para obter o blob do arquivo pelo proxy
      setTimeout(async () => {
        try {
          const attId = att.attachmentid || att.attachmentId || att.id;
          let url = anexosApiUrl(`/sienge-proxy/sales-contracts/${AnexosState.activeContract.id}/attachments/${attId}`);
          if (att.isCustomerAttachment) {
             url = anexosApiUrl(`/sienge-proxy/customers/${att.customerId}/attachments/${attId}`);
          }
          const res = await fetch(url, { headers: { 'Authorization': getBasicAuthHeader() } });
          if (res.ok) {
            const blob = await res.blob();
            fileObj.size = blob.size;
            fileObj.file = new File([blob], fName, { type: blob.type });
            
            const reader = new FileReader();
            reader.onload = (e) => {
              fileObj.base64 = e.target.result;
              if (['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
                fileObj.previewUrl = URL.createObjectURL(blob);
              }
              fileObj.status = 'Revisar';
              AnexosApp.renderFilesList();
            };
            reader.readAsDataURL(blob);
          } else {
            const errText = await res.text();
            fileObj.status = `Erro: ${res.status} ${errText.substring(0, 30)}`;
            AnexosApp.renderFilesList();
          }
        } catch(e) {
          fileObj.status = `Exceção: ${e.message.substring(0, 30)}`;
          AnexosApp.renderFilesList();
        }
      }, 10);

      return fileObj;
    });

    AnexosState.files = [...AnexosState.files, ...novos];
    AnexosState.importedContracts.add(AnexosState.activeContract.id);
    renderAnexosModule();
  },

  async loadTagsAtivas() {
    try {
      if (!window.firebaseCollections || !window.firebaseDb) {
        throw new Error("Firebase não está inicializado.");
      }
      const q = window.firebaseCollections.query(
        window.firebaseCollections.collection(window.firebaseDb, 'tags')
      );
      const querySnapshot = await window.firebaseCollections.getDocs(q);
      const tags = [];
      querySnapshot.forEach(doc => {
        tags.push({ id: doc.id, ...doc.data() });
      });
      // Filter active tags only
      AnexosState.tagsAtivas = tags.filter(t => t.status === 'Ativa');
      AnexosState.tagsAtivas.sort((a, b) => a.name.localeCompare(b.name));
      
      this.renderFilesList();
    } catch (e) {
      console.error("Erro ao buscar tags do Firebase:", e);
      AnexosState.tagsAtivas = [
        { name: "RG", destino: "Unidade", status: "Ativa" },
        { name: "CPF", destino: "Unidade", status: "Ativa" },
        { name: "CNH", destino: "Unidade", status: "Ativa" },
        { name: "CONTRATO", destino: "Unidade", status: "Ativa" },
        { name: "DISTRATO", destino: "Unidade", status: "Ativa" },
        { name: "COMPROVANTE DE RESIDÊNCIA", destino: "Unidade", status: "Ativa" },
        { name: "ADITAMENTO", destino: "Unidade", status: "Ativa" },
        { name: "CESSÃO DE DIREITOS", destino: "Unidade", status: "Ativa" }
      ];
      this.renderFilesList();
    }
  },

  async buscarUnidades() {
    const ccInput = document.getElementById('anexos-cc');
    const cc = ccInput ? ccInput.value.trim() : AnexosState.cc;
    if (!cc) {
      alert("Por favor, informe o Centro de Custo.");
      return;
    }
    AnexosState.cc = cc;
    
    try {
      if (window.SiengeApiService) {
        const ccData = await window.SiengeApiService.getCostCenter(cc);
        if (ccData && ccData.name) {
          AnexosState.ccName = ccData.name;
          renderAnexosModule();
        }
      }
    } catch(e) {}

    const loader = document.getElementById('anexos-unidade-loading');
    if (loader) loader.style.display = 'block';
    
    let allUnits = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    try {
      // Loop de paginação
      while (hasMore) {
        const url = `/api/sienge-proxy/units?limit=${limit}&offset=${offset}&enterpriseId=${cc}&additionalData=NONE`;
        const res = await fetch(url, { headers: { 'Authorization': getBasicAuthHeader() } });
        if (!res.ok) throw new Error("Falha Sienge HTTP " + res.status);
        
        const data = await res.json();
        const results = data.results || [];
        allUnits = allUnits.concat(results);
        
        if (results.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      // Filtrar unidades com status T = Transferido apenas se não estiver na Ficha do Cliente
      if (AnexosState.contexto !== 'Cliente') {
          allUnits = allUnits.filter(u => u.commercialStock !== 'T');
      }

      // Ordenar unidades em ordem crescente pelo nome (A a Z)
      allUnits.sort((a, b) => {
        if (!a.name) return 1;
        if (!b.name) return -1;
        return a.name.toString().localeCompare(b.name.toString(), undefined, { numeric: true, sensitivity: 'base' });
      });

      AnexosState.unidades = allUnits;
      
    } catch (e) {
      console.error("Erro ao buscar unidades:", e);
      alert("Falha ao buscar unidades. O CC está correto?");
    } finally {
      document.getElementById('anexos-unidade-loading').style.display = 'none';
      renderAnexosModule();
    }
  },

  async handleFiles(filesArray) {
    const isModal = window.anexosTargetId === 'anexos-cliente-root';

    if (!isModal) {
      if (AnexosState.contexto !== 'Cliente' && !AnexosState.selectedUnidade) {
        alert("Selecione a Unidade antes de adicionar anexos.");
        return;
      }
      if (AnexosState.contexto === 'Cliente' && !AnexosState.idCliente) {
        alert("Preencha o ID ou CPF/CNPJ do Cliente antes de adicionar anexos.");
        return;
      }
    }

    const validFiles = filesArray.filter(f => {
      if (f.size > 70 * 1024 * 1024) {
        alert(`O Sienge não permite arquivos maiores que 70MB. O arquivo ${f.name} foi recusado.`);
        return false;
      }
      return true;
    });

    for (const file of validFiles) {
      const fileId = Date.now() + Math.random().toString().substr(2, 5);
      const ext = file.name.split('.').pop().toLowerCase();
      
      const fileObj = {
        id: fileId,
        originalName: file.name,
        ext: ext,
        size: file.size,
        file: file,
        base64: null,
        tags: [],
        status: 'Processando OCR...'
      };
      
      AnexosState.files.push(fileObj);
      this.renderFilesList();
      
      // Converte para Base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const b64 = e.target.result;
        fileObj.base64 = b64;
        
        // Criar preview url (para exibir na UI)
        if (['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
          fileObj.previewUrl = URL.createObjectURL(file);
        }

        // Chamar OCR
        try {
          let ocrImageB64 = b64; // Default para JPG/PNG

          // Se for PDF, extrai a primeira página como imagem usando PDF.js
          if (ext === 'pdf' && window['pdfjs-dist/build/pdf']) {
            fileObj.status = 'Convertendo PDF para OCR...';
            this.renderFilesList();
            
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            const pdfUrl = URL.createObjectURL(file);
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            const pdfDoc = await loadingTask.promise;
            const page = await pdfDoc.getPage(1);
            
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            ocrImageB64 = canvas.toDataURL('image/jpeg', 0.8); // Converte primeira página para JPG base64
            URL.revokeObjectURL(pdfUrl);
            
            fileObj.status = 'Analisando documento...';
            this.renderFilesList();
          }

          const res = await fetch(anexosApiUrl('/api/ocr/classify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_data: ocrImageB64 })
          });
          const ocrData = await res.json();
          const detectedTag = ocrData.tag || 'DOC';
          
          fileObj.tags = [detectedTag];
          fileObj.status = detectedTag === 'DOC' ? 'Revisar' : 'Pronto';
          anexosAssignClientTarget(fileObj);
          
        } catch (err) {
          console.error("Erro no OCR:", err);
          fileObj.tags = ['DOC'];
          fileObj.status = 'Revisar';
        }

        this.renderFilesList();
        this.checkCanSend();
      };
      reader.readAsDataURL(file);
    }
  },

  renderFilesList() {
    const listEl = document.getElementById('anexos-files-list');
    if (!listEl) return;
    
    const isModal = window.anexosTargetId === 'anexos-cliente-root';
    const preparadosSection = document.getElementById('anexos-preparados-section');

    if (AnexosState.files.length === 0) {
      if (preparadosSection) preparadosSection.style.display = 'none';
      return;
    }

    if (preparadosSection) {
      preparadosSection.style.display = 'block';
      const headerTitle = preparadosSection.querySelector('h4');
      if (headerTitle) headerTitle.innerText = `Arquivos ${isModal ? 'Encontrados' : 'Preparados'} (${AnexosState.files.length})`;
    }

    listEl.innerHTML = AnexosState.files.map((f, index) => {
      
      let badgeClass = "badge-secondary";
      if (f.status === 'Pronto') badgeClass = "badge-success";
      if (f.status === 'Revisar') badgeClass = "badge-warning";
      if (f.status.includes('Erro')) badgeClass = "badge-danger";

      let previewHtml = `<div style="width: 160px; height: 160px; background: #f0f0f0; display:flex; align-items:center; justify-content:center; border-radius: 6px;"><i data-lucide="file" style="width:28px;height:28px;color:#999"></i></div>`;
      if (f.previewUrl && ['jpg', 'jpeg', 'png'].includes(f.ext)) {
        previewHtml = `<a href="${f.previewUrl}" target="_blank" title="Clique para ampliar"><img src="${f.previewUrl}" style="width: 160px; height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; cursor: pointer;"></a>`;
      } else if (f.ext === 'pdf') {
        previewHtml = `<a href="${f.previewUrl}" target="_blank" title="Clique para visualizar o PDF" style="display: block; width: 160px; height: 160px; border-radius: 6px; overflow: hidden; border: 1px solid #ddd; position: relative;">
          <embed src="${f.previewUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" style="width: 160px; height: 160px; pointer-events: none;">
          <div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0); cursor:pointer;"></div>
        </a>`;
      }

      const tagLabel = f.tags.join('-') || 'SEM_TAG';
      let duplicateSuffix = '';
      const duplicatesBefore = AnexosState.files.slice(0, index).filter(x => x.tags.join('-') === tagLabel).length;
      if (duplicatesBefore > 0) duplicateSuffix = `(${duplicatesBefore})`;
      
      const ccStr = AnexosState.cc || document.getElementById('anexos-cc')?.value || '';
      const unitSelect = document.getElementById('anexos-unidade');
      const unitNameStr = unitSelect && unitSelect.selectedIndex >= 0 ? unitSelect.options[unitSelect.selectedIndex].text.replace(/-/g, ' ') : '';
      
      const idStr = AnexosState.idCliente ? `[${AnexosState.idCliente}]` : '';
      const prefix = AnexosState.contexto === 'Cliente' ? idStr : `${ccStr} ${unitNameStr}`;
      
      let dataFormatadaView = f.dateOverride || AnexosState.dataDocumento;
      let dataSuffixView = '';
      if (dataFormatadaView && dataFormatadaView.includes('.')) {
        const parts = dataFormatadaView.split('.');
        if (parts.length === 3) dataSuffixView = ` ${parts[2]}.${parts[1]}.${parts[0]}`;
      } else if (dataFormatadaView && dataFormatadaView.includes('-')) {
        const parts = dataFormatadaView.split('-');
        if (parts.length === 3) dataSuffixView = ` ${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      const extVisual = f.ext === 'jpeg' ? 'jpg' : f.ext;
      
      const nomeFinal = `${prefix} - ${tagLabel}${duplicateSuffix}${dataSuffixView}.${extVisual}`;
      
      const chipsHtml = f.tags.map(t => 
        `<span style="display: inline-flex; align-items: center; gap: 5px; background: #e2e8f0; color: #334155; padding: 3px 10px; border-radius: 16px; font-size: 0.8rem; font-weight: 500;">
          ${t}
          <span onclick="AnexosApp.removeTag('${f.id}', '${t}')" style="cursor: pointer; font-size: 1.1rem; line-height: 1; opacity: 0.6; margin-left: 2px; padding: 0 2px; border-radius: 50%; background: #cbd5e1; color: #475569;" title="Remover tag">&times;</span>
        </span>`
      ).join('');

      const allowedDestino = AnexosState.contexto === 'Ambos' ? null : AnexosState.contexto;
      const availableOpts = AnexosState.tagsAtivas
        .filter(t => !f.tags.includes(t.name) && (!allowedDestino || t.destino === allowedDestino))
        .map(t => `<option value="${t.name}">${t.name}</option>`)
        .join('');

      return `
        <div style="display: flex; gap: 20px; padding-bottom: 20px; margin-bottom: 5px; align-items: center; border-bottom: 1px dashed #ccc; flex-wrap: wrap;">
          ${previewHtml}
          
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; min-width: 250px;">
            <div>
              <strong style="font-size: 1.05rem; color: var(--color-text); word-break: break-all;">${nomeFinal}</strong>
              <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 2px;">
                <span title="Nome original do arquivo importado">Original: ${f.originalName || f.file.name}</span> &bull; 
                <span>Tamanho: ${(f.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
            
            <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 5px;">
              <div class="form-control" style="display: inline-flex; align-items: center; padding: 4px 6px; gap: 5px; flex-wrap: wrap; height: auto; min-height: 38px; width: 100%;">
                ${chipsHtml}
                ${f.tags.length === 0 ? `
                  ${AnexosState.tagsAtivas.length === 0 ? `
                    <div style="color: #d32f2f; font-size: 0.8rem; padding: 4px 8px; background: #ffebee; border-radius: 4px; border: 1px solid #ffcdd2;">
                      ⚠️ TAGs não disponíveis (verifique conexão com servidor)
                    </div>
                  ` : `
                    <select id="anexo-tag-add-${f.id}" style="border: 1px dashed #ccc; outline: none; background: #f9f9f9; font-size: 0.8rem; padding: 2px 4px; flex-grow: 0; min-width: 100px; color: var(--color-text-muted); border-radius: 4px; cursor: pointer; height: 26px; margin-left: 2px;" onchange="AnexosApp.addTag('${f.id}', this.value); this.value='';">
                      <option value="">Selecionar TAG...</option>
                      ${availableOpts}
                    </select>
                  `}
                ` : ''}
              </div>
              ${(() => {
                let mainTag = AnexosState.tagsAtivas.find(t => t.name === f.tags[0]);
                let isClienteDest = mainTag && mainTag.destino === 'Cliente';
                if (!isClienteDest) return '';
                anexosAssignClientTarget(f);
                const people = anexosContractPeople();
                let optionsHtml = people.length === 1
                  ? ''
                  : '<option value="">Selecione a pessoa alvo do documento...</option>';
                people.forEach(p => {
                  const sel = String(f.targetCustomerId) === String(p.id) ? 'selected' : '';
                  optionsHtml += `<option value="${p.id}" ${sel}>${p.name} (${p.role}) - ID: ${p.id}</option>`;
                });
                const borderOk = f.targetCustomerId ? 'var(--color-border)' : 'var(--color-danger)';
                const colorOk = f.targetCustomerId ? 'var(--color-text)' : 'var(--color-danger)';
                return `
                  <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.02); padding: 4px 8px; border-radius: 4px; border: 1px solid ${borderOk}; width: 100%;">
                    <i data-lucide="user" style="width:14px; color:${f.targetCustomerId ? 'var(--color-primary)' : 'var(--color-danger)'};"></i>
                    <select class="form-control" style="padding: 2px 4px; font-size: 0.8rem; flex: 1; border: none; background: transparent; outline: none; color: ${colorOk}; font-weight: ${f.targetCustomerId ? 'normal' : '500'}; cursor: pointer;" onchange="AnexosApp.setTargetCustomer('${f.id}', this.value)">
                      ${optionsHtml}
                    </select>
                  </div>
                `;
              })()}
            </div>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 15px; min-width: 150px;">
            <span class="badge ${badgeClass}" style="white-space: nowrap; display: inline-block;">${f.status}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${isModal ? '' : `
              <label style="font-size: 0.8rem; color: var(--color-text-muted); margin: 0; white-space: nowrap;">Data Documento:</label>
              <input type="date" class="form-control" style="padding: 4px 8px; font-size: 0.85rem; width: 145px;" max="${new Date().toISOString().split('T')[0]}" value="${f.dateOverride ? f.dateOverride.replace(/\./g, '-') : (AnexosState.dataDocumento ? AnexosState.dataDocumento.replace(/\./g, '-') : '')}" onchange="AnexosApp.setFileDate('${f.id}', this.value)">
              `}
              ${f.status === 'Processando' ? '' : `
                <button class="btn btn-outline" style="border: none; color: var(--color-danger); padding: 5px; margin-left: 2px;" onclick="AnexosApp.removerFile('${f.id}')" title="Remover">
                  <i data-lucide="trash-2" style="width:18px;"></i>
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
    this.checkCanSend();
  },

  addTag(fileId, tag) {
    if (!tag) return;
    const file = AnexosState.files.find(f => f.id === fileId);
    if (!file) return;

    if (!file.tags.includes(tag)) {
      file.tags = [tag];
      anexosAssignClientTarget(file);
      this.evalFileStatus(file);
      this.renderFilesList();
    }
  },

  removeTag(fileId, tag) {
    const file = AnexosState.files.find(f => f.id === fileId);
    if (!file) return;

    file.tags = file.tags.filter(t => t !== tag);
    this.evalFileStatus(file);
    this.renderFilesList();
  },

  evalFileStatus(file) {
    if (file.tags.length === 0 || file.tags.includes('DOC')) {
      file.status = 'Revisar';
    } else {
      file.status = 'Pronto';
    }
  },

  removerFile(id) {
    AnexosState.files = AnexosState.files.filter(f => f.id !== id);
    this.renderFilesList();
  },

  setTargetCustomer(id, customerId) {
    const file = AnexosState.files.find(f => f.id === id);
    if (file) {
      file.targetCustomerId = customerId ? String(customerId) : '';
      this.renderFilesList();
    }
  },

  setFileDate(id, val) {
    const file = AnexosState.files.find(f => f.id === id);
    if (file) {
      file.dateOverride = val.replace(/-/g, '.');
    }
  },

  removerTodos() {
    if (confirm("Todos os anexos serão removidos apenas dessa tela. Caso você já tenha feito upload no Sienge, a exclusão deverá ser feita diretamente na unidade no sistema. Deseja remover todos?")) {
      AnexosState.files = [];
      AnexosState.importedContracts.clear();
      AnexosState.downloadedFilesIds.clear();
      renderAnexosModule();
    }
  },

  solicitarTag() {
    const modalHtml = `
      <div id="modal-solicitar-tag" class="modal-overlay active">
        <div class="modal-box" style="max-width: 450px;">
          <h3>Solicitar Nova TAG</h3>
          <div class="form-group" style="margin-top: 15px;">
            <label>Nome da TAG (Use maiúsculas)</label>
            <input type="text" id="req-tag-name" class="form-control" placeholder="Ex: ESCRITURA">
          </div>
          <div class="form-group">
            <label>Onde essa TAG será usada?</label>
            <div style="display: flex; gap: 20px; margin-top: 8px;">
              <label style="font-weight:normal; display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="radio" name="req-tag-type" value="Unidade" checked> Documentos da Unidade
              </label>
              <label style="font-weight:normal; display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="radio" name="req-tag-type" value="Cliente"> Documentos do Cliente
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>Motivo</label>
            <textarea id="req-tag-reason" class="form-control" rows="3" placeholder="Por que precisamos dessa tag?"></textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
            <button class="btn btn-cancel" onclick="document.getElementById('modal-solicitar-tag').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="AnexosApp.enviarSolicitacaoTag()">Enviar Solicitação</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  async enviarSolicitacaoTag() {
    const nome = document.getElementById('req-tag-name').value.trim().toUpperCase();
    const motivo = document.getElementById('req-tag-reason').value.trim();
    const typeEl = document.querySelector('input[name="req-tag-type"]:checked');
    const type = typeEl ? typeEl.value : 'Unidade';

    if (!nome || !motivo) return alert("Preencha todos os campos.");

    const email = (AppState.currentUser && AppState.currentUser.email) ? AppState.currentUser.email : 'operador@mouraleite.com.br';

    try {
      const res = await fetch(anexosApiUrl('/api/tags/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: nome, reason: motivo, type: type, requested_by_email: email })
      });
      if (res.ok) {
        alert("Solicitação enviada com sucesso para israel@mouraleite.com.br.");
        document.getElementById('modal-solicitar-tag').remove();
      } else {
        alert("Falha ao enviar solicitação.");
      }
    } catch (e) {
      alert("Erro de conexão.");
    }
  },

  checkCanSend() {
    const btn = document.getElementById('anexos-btn-enviar');
    const hint = document.getElementById('anexos-btn-enviar-hint');
    if (!btn) return;
    
    const isModal = window.anexosTargetId === 'anexos-cliente-root';
    
    // Verifica duplicidades
    const seenKeys = new Set();
    let hasDuplicates = false;
    let hasMissingTarget = false;
    
    AnexosState.files.forEach(f => {
      if (f.status === 'Pronto' || f.status === 'Enviado' || isModal) {
        let mainTag = AnexosState.tagsAtivas.find(t => t.name === f.tags[0]);
        let isClienteDest = mainTag && mainTag.destino === 'Cliente';
        
        if (isClienteDest && !f.targetCustomerId) {
          hasMissingTarget = true;
        }
        
        let targetKey = isClienteDest ? f.targetCustomerId : 'unidade';
        let uniqueKey = `${f.tags.join('-')}__${targetKey}`;
        
        if (seenKeys.has(uniqueKey)) {
          hasDuplicates = true;
        }
        seenKeys.add(uniqueKey);
      }
    });

    const canSend = AnexosState.files.length > 0 && 
                    !hasDuplicates && 
                    !hasMissingTarget &&
                    AnexosState.files.every(f => {
                      if (isModal) return true; // Permite salvar localmente em qualquer estado
                      const hasDate = f.dateOverride || AnexosState.dataDocumento;
                      const isReady = f.status === 'Pronto' || (f.status === 'Enviado' && f.sentOk);
                      return hasDate && isReady;
                    });
    
    if (canSend) {
      btn.removeAttribute('disabled');
      btn.innerHTML = `<i data-lucide="${isModal ? 'save' : 'send'}" style="width:20px"></i> ${isModal ? 'Enviar para Jurídico' : 'Enviar ' + AnexosState.files.filter(f => f.status === 'Pronto').length + ' para o Sienge'}`;
      if (hint) hint.style.display = 'none';
      lucide.createIcons();
    } else {
      btn.setAttribute('disabled', 'true');
      btn.innerHTML = `<i data-lucide="${isModal ? 'save' : 'send'}" style="width:20px"></i> ${isModal ? 'Enviar para Jurídico' : 'Enviar para o Sienge'}`;
      
      const missingDates = AnexosState.files.some(f => !(f.dateOverride || AnexosState.dataDocumento));
      if (hint && AnexosState.files.length > 0) {
        if (missingDates && !isModal) {
          hint.innerText = 'Preencha a data em todos os arquivos para enviar';
        } else if (hasMissingTarget) {
          hint.innerText = 'Selecione a pessoa alvo para todos os documentos de Cliente';
        } else if (hasDuplicates) {
          hint.innerText = 'Erro: Você não pode usar a mesma TAG para a mesma pessoa/unidade.';
        } else if (!isModal) {
          hint.innerText = 'Altere as tags de "DOC" para habilitar o envio';
        }
        if (hint.innerText) hint.style.display = 'block';
      } else if (hint) {
        hint.style.display = 'none';
      }
      lucide.createIcons();
    }
  },

  confirmarEnvio() {
    const isModal = window.anexosTargetId === 'anexos-cliente-root';
    const filesToSend = isModal ? AnexosState.files : [...AnexosState.files.filter(f => f.status === 'Pronto' && !f.sentOk)];
    if (filesToSend.length === 0) return;

    if (isModal) {
      AnexosDB.save(AnexosState.idCliente, filesToSend).then(() => {
        alert("Anexos salvos localmente com sucesso!");
        if (window.closeAnexosClienteModal) window.closeAnexosClienteModal();
      }).catch(err => {
        console.error("Erro ao salvar no IndexedDB:", err);
        alert("Erro ao salvar anexos localmente.");
      });
      return;
    }

    let selectedUnitName = '';
    const unitSelect = document.getElementById('anexos-unidade');
    if (unitSelect && unitSelect.selectedIndex >= 0) {
        selectedUnitName = unitSelect.options[unitSelect.selectedIndex].text;
    } else if (AnexosState.selectedUnidade) {
        const matchUnit = AnexosState.unidades.find(u => u.id == AnexosState.selectedUnidade);
        if (matchUnit) selectedUnitName = matchUnit.name;
    }
    const idCliente = AnexosState.idCliente;
    
    let msg = `Você irá enviar ${filesToSend.length} anexos.`;
    if (AnexosState.contexto === 'Unidade') msg += `\nDestino: Unidade ${selectedUnitName}`;
    else if (AnexosState.contexto === 'Cliente') msg += `\nDestino: Cliente ${idCliente}`;
    else msg += `\nOs destinos (Unidade ou Cliente) serão definidos automaticamente pelas TAGs selecionadas.`;

    if (confirm(msg + `\nDeseja continuar?`)) {
      this.iniciarUploadSequencial();
    }
  },

  cancelarUpload() {
    if (confirm("Deseja cancelar o envio e limpar os dados preenchidos?")) {
      AnexosState.isUploading = false;
      const modal = document.getElementById('anexos-upload-modal');
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
      AnexosApp.resetAndRender();
    }
  },

  fecharUploadModal() {
    const modal = document.getElementById('anexos-upload-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
    AnexosApp.resetAndRender();
  },

  async iniciarUploadSequencial() {
    AnexosState.isUploading = true;
    const modal = document.getElementById('anexos-upload-modal');
    
    // Reset UI modal elements
    const summaryEl = document.getElementById('upload-summary');
    if (summaryEl) summaryEl.innerHTML = '';
    const btnCancel = document.getElementById('btn-cancelar-upload');
    const btnClose = document.getElementById('btn-fechar-upload');
    if (btnCancel) btnCancel.style.display = 'inline-block';
    if (btnClose) btnClose.style.display = 'none';

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    
    const unitId = AnexosState.selectedUnidade;
    const cc = AnexosState.cc;

    const filesToSend = [...AnexosState.files.filter(f => f.status === 'Pronto' && !f.sentOk)];
    
    // Não usamos mais finalCustomerId global. Cada arquivo de Cliente usa seu targetCustomerId.
    const needsCustomerAPI = filesToSend.some(f => {
      const mainTag = AnexosState.tagsAtivas.find(t => t.name === f.tags[0]);
      return mainTag && mainTag.destino === 'Cliente';
    });

    let finalCustomerId = AnexosState.activeContract ? AnexosState.activeContract.customerId : null;
    if (needsCustomerAPI && !finalCustomerId && AnexosState.idCliente) {
      const docClean = AnexosState.idCliente.replace(/\D/g, '');
      if (docClean.length >= 11) {
        document.getElementById('upload-status-text').innerText = "Resolvendo CPF/CNPJ do cliente...";
        try {
          const cRes = await fetch(anexosApiUrl(`/sienge-proxy/customers?cpfCnpj=${docClean}`), {
            headers: { 'Authorization': typeof getBasicAuthHeader !== 'undefined' ? getBasicAuthHeader() : '' }
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            if (cData.results && cData.results.length > 0) {
              finalCustomerId = cData.results[0].id;
            } else {
              alert("Erro: Cliente não encontrado no Sienge com este CPF/CNPJ.");
              this.cancelarUpload();
              return;
            }
          }
        } catch (e) {
          console.error("Erro ao resolver cliente", e);
        }
      } else {
        finalCustomerId = docClean;
      }
    }

    const totalFiles = filesToSend.length;
    let sentFiles = 0;

    for (let i = 0; i < filesToSend.length; i++) {
      if (!AnexosState.isUploading) break; // Cancelado
      
      const fileObj = filesToSend[i];

      document.getElementById('upload-arquivo-atual').innerText = `Enviando arquivo ${sentFiles + 1} de ${totalFiles}`;
      if (sentFiles === 0) {
        document.getElementById('upload-status-text').innerText = "Processando o primeiro documento...";
        document.getElementById('upload-progress-bar').style.width = '0%';
      }

      // Montar nomes
      const tagLabel = fileObj.tags.join('-') || 'DOC';
      let duplicateSuffix = '';
      const originalIndex = AnexosState.files.findIndex(f => f.id === fileObj.id);
      const duplicatesBefore = AnexosState.files.slice(0, originalIndex).filter(x => x.tags.join('-') === tagLabel).length;
      if (duplicatesBefore > 0) duplicateSuffix = `(${duplicatesBefore})`;
      
      let unitNameStr = '';
      const unitSelect = document.getElementById('anexos-unidade');
      if (unitSelect && unitSelect.options.length > 0 && unitSelect.selectedIndex >= 0) {
          unitNameStr = unitSelect.options[unitSelect.selectedIndex].text;
      } else if (AnexosState.selectedUnidade) {
          const matchUnit = AnexosState.unidades.find(u => u.id == AnexosState.selectedUnidade);
          if (matchUnit) unitNameStr = matchUnit.name;
      }
      const unitName = unitNameStr.replace(/-/g, ' ');
      
      // Determinar data a ser usada (Específica do arquivo ou Global)
      let dataFormatada = fileObj.dateOverride || AnexosState.dataDocumento;
      if (dataFormatada && dataFormatada.includes('-')) {
        dataFormatada = dataFormatada.split('-').join('.');
      }

      let dataSuffix = '';
      if (dataFormatada && dataFormatada.includes('.')) {
        const parts = dataFormatada.split('.');
        if (parts.length === 3) dataSuffix = ` ${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      
      const idClienteStr = AnexosState.idCliente ? `[${AnexosState.idCliente}]` : '';
      const prefix = AnexosState.contexto === 'Cliente' ? idClienteStr : `${cc} ${unitName}`;
      const extFinal = fileObj.ext === 'jpeg' ? 'jpg' : fileObj.ext;
      const nomeFinalArquivo = anexosSafeFileName(`${prefix} - ${tagLabel}${duplicateSuffix}${dataSuffix}.${extFinal}`);
      const descricaoSienge = `${dataFormatada} - ${String(tagLabel).replace(/[\\/]+/g, ' ')}`.replace(/\s+/g, ' ').trim();
      
      // Identificar Destino da API baseada na primeira TAG do arquivo
      const mainTag = AnexosState.tagsAtivas.find(t => t.name === fileObj.tags[0]);
      const destinoAPI = mainTag ? mainTag.destino : 'Unidade';
      let apiUrl = '';
      
      let targetCustId = fileObj.targetCustomerId || finalCustomerId;
      
      if (destinoAPI === 'Cliente' && targetCustId) {
        apiUrl = anexosApiUrl(`/sienge-proxy/customers/${targetCustId}/attachments?description=${encodeURIComponent(descricaoSienge)}`);
      } else {
        apiUrl = anexosApiUrl(`/sienge-proxy/units/${AnexosState.selectedUnidade}/attachments?description=${encodeURIComponent(descricaoSienge)}`);
      }

      try {
        // Se o arquivo foi importado do contrato, buscar o binário real antes de enviar
        let fileBlob = fileObj.file;
        if (fileObj.downloadedId && (!fileBlob || !fileBlob.size)) {
           document.getElementById('upload-status-text').innerText = "Baixando arquivo do contrato...";
           const dRes = await fetch(anexosApiUrl(`/sienge-proxy/sales-contracts/${AnexosState.activeContract.id}/attachments/${fileObj.downloadedId}/file`), {
             headers: { 'Authorization': getBasicAuthHeader() }
           });
           if (dRes.ok) {
             fileBlob = await dRes.blob();
           } else {
             throw new Error("Falha ao baixar arquivo importado do contrato.");
           }
        }

        document.getElementById('upload-status-text').innerText = "Enviando arquivo...";
        const multipart = await anexosMultipartBody(fileBlob, nomeFinalArquivo);
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', apiUrl);
          xhr.setRequestHeader('Authorization', getBasicAuthHeader());
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.setRequestHeader('Content-Type', multipart.contentType);
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              document.getElementById('upload-progress-bar').style.width = `${percent}%`;
              document.getElementById('upload-status-text').innerText = `Enviando para o Sienge, falta pouco... ${percent}%`;
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              fileObj.sentOk = true;
              fileObj.status = 'Enviado';
              sentFiles++;
              const summaryEl = document.getElementById('upload-summary');
              if (destinoAPI === 'Cliente') {
                 let custName = 'Cliente';
                 const matchedCust = anexosContractPeople().find(c => String(c.id) === String(targetCustId));
                 if (matchedCust) custName = matchedCust.name;
                 const summaryMsg = `✅ Enviado p/ Cliente: <strong>${custName} (ID: ${targetCustId})</strong>`;
                 if (summaryEl) summaryEl.innerHTML += `<div style="color: var(--color-success); margin-bottom: 4px; font-weight: 500;">${summaryMsg}</div>`;
                 console.log(`[SUCESSO] Anexo '${multipart.fileName}' enviado para o Cliente ID: ${targetCustId}`);
                 AnexosState.lastUploadedCustomerId = targetCustId;
              } else {
                 const summaryMsg = `✓ Enviado p/ Unidade: <strong>${unitName.trim()}</strong>`;
                 if (summaryEl) summaryEl.innerHTML += `<div style="color: var(--color-success); margin-bottom: 4px; font-weight: 500;">${summaryMsg}</div>`;
              }
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Erro de Rede"));
          xhr.send(multipart.body);
        });

      } catch (err) {
        fileObj.sentOk = false;
        fileObj.status = 'Erro: ' + err.message;
      }

      // Atualizar progresso geral
      const overallPercent = Math.round((sentFiles / totalFiles) * 100);
      document.getElementById('upload-progress-bar').style.width = `${overallPercent}%`;
      document.getElementById('upload-status-text').innerText = `${sentFiles} de ${totalFiles} arquivos enviados com sucesso! (${overallPercent}%)`;
      
      if (fileObj.status === 'Enviado') {
        // Remover o arquivo da tela
        AnexosState.files = AnexosState.files.filter(f => f.id !== fileObj.id);
        this.renderFilesList();
      }

      // Delay 2000ms entre uploads
      if (i < filesToSend.length - 1) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    if (AnexosState.isUploading) {
      document.getElementById('upload-status-text').innerText = "Upload Concluído! Todos os arquivos foram enviados.";
      document.getElementById('upload-progress-bar').style.background = "linear-gradient(90deg, #1e8e3e 0%, #34a853 100%)";
      
      const btnCancel = document.getElementById('btn-cancelar-upload');
      const btnClose = document.getElementById('btn-fechar-upload');
      if (btnCancel) btnCancel.style.display = 'none';
      if (btnClose) btnClose.style.display = 'inline-block';
    }
  },

  async renderAnexosJuridicoTab() {
    const listEl = document.getElementById('anexos-juridico-list');
    if (!listEl) return;
    
    // Mostra estado de carregamento
    listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-text-muted);">Carregando documentos...</div>';
    
    const customerId = typeof AppState !== 'undefined' ? AppState.selectedCustomerId : null;
    if (!customerId) {
      listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-text-muted);">Selecione um cliente para ver os documentos.</div>';
      return;
    }
    
    try {
      const files = await AnexosDB.load(customerId);
      
      if (!files || files.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 30px; border: 1px dashed var(--color-border); border-radius: 8px;">
            <i data-lucide="inbox" style="width: 32px; height: 32px; color: var(--color-text-muted); margin-bottom: 10px;"></i>
            <div style="color: var(--color-text-muted);">Nenhum documento arquivado</div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      
      let html = '';
      files.forEach(f => {
        // Criar URL de visualização/download
        let url = f.previewUrl;
        if (!url && f.file) {
          try { url = URL.createObjectURL(f.file); } catch(e) {}
        }
        
        const ext = f.ext || (f.originalName || '').split('.').pop();
        const tagLabel = typeof getTagName === 'function' ? getTagName(f.tags[0]) : f.tags[0];
        
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border: 1px solid var(--color-border); border-radius: 8px; background: white;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="width: 40px; height: 40px; border-radius: 8px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: var(--color-primary);">
                <i data-lucide="file-text" style="width: 20px;"></i>
              </div>
              <div>
                <strong style="font-size: 1rem; color: var(--color-text); display: block; margin-bottom: 4px;">${tagLabel} - ${f.originalName || f.file?.name}</strong>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); display: flex; gap: 10px; align-items: center;">
                  <span style="background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-weight: 500;">Tag: ${f.tags.join(', ')}</span>
                  <span>Tamanho: ${(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            </div>
            
            <div>
              ${url ? `
                <a href="${url}" download="${tagLabel} - ${f.originalName || f.file?.name}" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary); padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
                  <i data-lucide="download" style="width: 16px;"></i> Baixar Arquivo
                </a>
              ` : '<span style="color: var(--color-text-muted); font-size: 0.85rem;">Indisponível</span>'}
            </div>
          </div>
        `;
      });
      
      listEl.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
      
    } catch (e) {
      console.error('Erro ao carregar anexos jurídicos', e);
      listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-danger);">Erro ao carregar os documentos.</div>';
    }
  }
};

window.anexosUploadCustomerAttachment = async function(customerId, file, tagLabel) {
  const id = String(customerId || "").trim();
  if (!id) throw new Error("Cliente sem ID.");
  if (!file) throw new Error("Arquivo não informado.");
  const tag = String(tagLabel || "DADOS BANCARIOS PARA DISTRATO").replace(/[\\/]+/g, " ").trim();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dataIsoDot = `${y}.${m}.${d}`;
  const dataSuffix = ` ${d}.${m}.${y}`;
  const extRaw = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : (file.type === "application/pdf" ? "pdf" : "jpg");
  const extFinal = String(extRaw || "jpg").toLowerCase() === "jpeg" ? "jpg" : String(extRaw || "jpg").toLowerCase();
  const nomeFinalArquivo = anexosSafeFileName(`[${id}] - ${tag}${dataSuffix}.${extFinal}`);
  const descricaoSienge = `${dataIsoDot} - ${tag}`.replace(/\s+/g, " ").trim();
  const apiUrl = anexosApiUrl(`/sienge-proxy/customers/${id}/attachments?description=${encodeURIComponent(descricaoSienge)}`);
  const multipart = await anexosMultipartBody(file, nomeFinalArquivo);
  const auth = (typeof getBasicAuthHeader === "function") ? getBasicAuthHeader() : "";
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": multipart.contentType
    },
    body: multipart.body
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return true;
};

// Travar saida da página se tiver uploads pendentes
window.addEventListener('beforeunload', (e) => {
  if (AnexosState.files.length > 0) {
    e.preventDefault();
    e.returnValue = 'Você tem anexos não enviados. Se sair, eles serão perdidos. Deseja continuar?';
  }
});
