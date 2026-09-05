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
  downloadedFilesIds: new Set(),
  /** Espelho de lotes: só clicáveis com contrato ativo; enviado por contractId (permite reenvio após distrato). */
  mapaUnidades: false,
  mapaLoading: false,
  mapaMeta: {}, // unitId -> { active, contractId, contractNumber, sentTags: string[], enterpriseId?, enterpriseName?, unitName? }
  mapaEnvios: {}, // key `${contractId}_${TAG}` -> record
  tituloReceber: null, // { id, number, balance, statusLabel }
  periodoMode: false,
  periodoStart: '',
  periodoEnd: '',
  periodoOpen: false,
  periodoMapa: [], // [{ enterpriseId, enterpriseName, units: [{id,name,...}] }]
  periodoSkippedIncorp: 0,
  unidadesLoading: false,
  periodoLoadPhase: '',
  tagMemory: [] // fingerprints aprendidos
};

function anexosTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function anexosStoredToIso(stored) {
  if (!stored) return "";
  const t = String(stored).trim();
  if (/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(t)) return t.replace(/\./g, "-");
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function anexosStoredToBr(stored) {
  const iso = anexosStoredToIso(stored);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function anexosIsoToStored(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10).replace(/-/g, ".");
}

function anexosBrToIso(br) {
  const digits = String(br || "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const iso = `${y}-${m}-${d}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (isNaN(dt.getTime()) || dt.getDate() !== Number(d) || (dt.getMonth() + 1) !== Number(m) || dt.getFullYear() !== Number(y)) {
    return "";
  }
  if (iso > anexosTodayIso()) return "";
  return iso;
}

function anexosApplyBrDateMask(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function anexosDateFieldHtml({ textId, pickerId, stored, size = "normal" }) {
  const iso = anexosStoredToIso(stored);
  const br = anexosStoredToBr(stored);
  const max = anexosTodayIso();
  const h = size === "sm" ? "34px" : "40px";
  const font = size === "sm" ? "0.85rem" : "0.9rem";
  return `
    <div class="anexos-date-field" style="display:flex; align-items:stretch; gap:6px; width:100%; position:relative; height:${h};">
      <input type="text" id="${textId}" class="form-control anexos-ctrl" inputmode="numeric" autocomplete="off"
        placeholder="dd/mm/aaaa" maxlength="10" value="${br}"
        style="flex:1; min-width:0; height:${h}; font-size:${font}; letter-spacing:0.02em; box-sizing:border-box;"
        oninput="AnexosApp.onDateTextInput('${textId}', '${pickerId}', this)"
        onblur="AnexosApp.onDateTextBlur('${textId}', '${pickerId}', this)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      <button type="button" class="btn btn-outline anexos-ctrl" title="Abrir calendário" aria-label="Abrir calendário"
        style="height:${h}; width:${h}; padding:0; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; box-sizing:border-box;"
        onclick="AnexosApp.openDatePicker('${pickerId}')">
        <i data-lucide="calendar" style="width:16px;height:16px;"></i>
      </button>
      <button type="button" class="btn btn-outline anexos-ctrl" title="Usar data de hoje" aria-label="Hoje"
        style="height:${h}; padding:0 12px; font-size:0.75rem; font-weight:700; flex-shrink:0; white-space:nowrap; box-sizing:border-box;"
        onclick="AnexosApp.setDateToday('${textId}', '${pickerId}')">Hoje</button>
      <input type="date" id="${pickerId}" max="${max}" value="${iso}"
        style="position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; border:0;"
        onchange="AnexosApp.onDatePicked('${textId}', '${pickerId}', this)">
    </div>
  `;
}

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

function anexosAssignClientTarget(file, opts) {
  if (!file) return;
  const autoDefault = !!(opts && opts.autoDefault);
  const mainTag = AnexosState.tagsAtivas.find(t => t.name === file.tags[0]);
  if (!mainTag || mainTag.destino !== 'Cliente') {
    file.targetCustomerIds = [];
    file.targetCustomerId = '';
    return;
  }
  if ((!file.targetCustomerIds || !file.targetCustomerIds.length) && file.targetCustomerId) {
    file.targetCustomerIds = [String(file.targetCustomerId)];
  }
  file.targetCustomerIds = Array.isArray(file.targetCustomerIds)
    ? file.targetCustomerIds.map(String).filter(Boolean)
    : [];
  const people = anexosContractPeople();
  if (autoDefault && !file.targetCustomerIds.length && people.length) {
    if (people.length === 1) {
      file.targetCustomerIds = [people[0].id];
    } else {
      const main = people.find(p => p.role === 'Principal') || people[0];
      file.targetCustomerIds = main ? [main.id] : [];
    }
  }
  // Remove IDs que não estão mais no contrato
  if (people.length) {
    const allowed = new Set(people.map(p => String(p.id)));
    file.targetCustomerIds = file.targetCustomerIds.filter(id => allowed.has(String(id)));
  }
  file.targetCustomerId = file.targetCustomerIds[0] || '';
}

function anexosNormAttachmentKey(att) {
  const id = String(att.attachmentid || att.attachmentId || att.id || '').trim();
  let name = String(att.fileName || att.name || '').toLowerCase().trim();
  let desc = String(att.description || '').toLowerCase().trim();
  desc = desc
    .replace(/^\(cliente\s*\d+\)\s*/i, '')
    .replace(/^\(unidade[^)]*\)\s*/i, '')
    .trim();
  const size = Number(att.size || att.fileSize || att.length || 0) || 0;
  // Nome gerado pelo CRM: "17701 F-247 - TAG 31.08.2024.pdf" → chave pela tag+data
  const crmMatch = (desc || name).match(/-\s*([a-z0-9á-ú /()-]+?)\s+(\d{2}[./]\d{2}[./]\d{4})/i)
    || (desc || name).match(/(\d{2,4}[./]\d{2}[./]\d{2,4})\s*-\s*(.+)$/i);
  let semantic = '';
  if (crmMatch) {
    const a = String(crmMatch[1] || '').replace(/\s+/g, ' ').trim();
    const b = String(crmMatch[2] || '').replace(/\s+/g, ' ').trim().replace(/\//g, '.');
    semantic = `${a}|${b}`.toLowerCase();
  }
  const isSiengeAutoName = /^\d{14}_[a-z0-9]+\.[a-z0-9]+$/i.test(name);
  return { id, name, desc, semantic, size, isSiengeAutoName, isCustomerAttachment: !!att.isCustomerAttachment, isUnitAttachment: !!att.isUnitAttachment };
}

/** Evita listar o mesmo documento 2x (contrato + ficha cliente/unidade). */
function anexosDedupeAttachments(list) {
  const seenId = new Set();
  const seenName = new Set();
  const seenDesc = new Set();
  const seenSemantic = new Set();
  const seenSizeDesc = new Set();
  const out = [];
  const sorted = [...(list || [])].sort((a, b) => {
    const rank = (x) => (x.isCustomerAttachment || x.isUnitAttachment) ? 0 : 1;
    return rank(a) - rank(b);
  });
  const hasCrmSource = sorted.some(a => a.isCustomerAttachment || a.isUnitAttachment);
  for (const att of sorted) {
    const k = anexosNormAttachmentKey(att);
    // Se já temos anexos na ficha, ignora nomes automáticos do contrato (timestamp_hash)
    if (hasCrmSource && !k.isCustomerAttachment && !k.isUnitAttachment && k.isSiengeAutoName) {
      continue;
    }
    if (k.id && seenId.has(k.id)) continue;
    if (k.name && k.name.length > 3 && seenName.has(k.name)) continue;
    if (k.desc && k.desc.length > 5 && seenDesc.has(k.desc)) continue;
    if (k.semantic && seenSemantic.has(k.semantic)) continue;
    if (k.size > 0 && k.desc && seenSizeDesc.has(`${k.size}|${k.desc}`)) continue;
    if (k.id) seenId.add(k.id);
    if (k.name) seenName.add(k.name);
    if (k.desc) seenDesc.add(k.desc);
    if (k.semantic) seenSemantic.add(k.semantic);
    if (k.size > 0 && k.desc) seenSizeDesc.add(`${k.size}|${k.desc}`);
    out.push(att);
  }
  return out;
}

function anexosGuessTagFromDescription(desc) {
  let raw = String(desc || '')
    .replace(/^\(Cliente\s*\d+\)\s*/i, '')
    .replace(/^\(Unidade[^)]*\)\s*/i, '')
    .trim();
  if (!raw) return '';
  // "17701 F 265 - ANÁLISE DE CRÉDITO CLIENTE.pdf" ou "31.08.2024 - TAG"
  const m = raw.match(/^\d{4,5}\s+[A-Z0-9][-\s]?\d{0,4}\s*-\s*(.+)$/i)
    || raw.match(/\d{1,4}[./]\d{1,2}[./]\d{2,4}\s*-\s*(.+)$/i)
    || raw.match(/-\s*([A-ZÁÉÍÓÚÃÕÇ0-9][A-ZÁÉÍÓÚÃÕÇ0-9 /()-]{1,80})$/i);
  if (!m) return '';
  let tag = String(m[1] || '').trim().toUpperCase().replace(/\s+/g, ' ');
  tag = tag.replace(/\.(PDF|JPG|JPEG|PNG)$/i, '').trim();
  if (!tag || tag === 'DOC' || tag === 'ARQUIVO' || tag === 'SEM_TAG') return '';
  return tag;
}

/** Encaixa sugestão OCR/nome na TAG ativa do cadastro (com aliases). */
function anexosResolveActiveTag(suggested) {
  const s = String(suggested || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s || s === 'DOC') return '';
  const tags = (AnexosState.tagsAtivas || []).map(t => String(t.name || '').trim()).filter(Boolean);
  if (!tags.length) return s;

  const norm = (x) => String(x || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  const sn = norm(s);

  const aliases = {
    'COMPROVANTE DE RESIDENCIA': ['COMPROVANTE DE ENDERECO', 'COMP ENDERECO', 'COMPROVANTE RESIDENCIA'],
    'COMPROVANTE DE ENDERECO': ['COMPROVANTE DE RESIDENCIA', 'COMP ENDERECO'],
    'ANALISE DE CREDITO': ['ANALISE DE CREDITO CLIENTE', 'ANALISE CREDITO'],
    'CERTIDAO DE CASAMENTO': ['CERTIDAO CASAMENTO'],
    'CERTIDAO DE NASCIMENTO': ['CERTIDAO NASCIMENTO'],
    'CESSAO DE DIREITOS': ['CESSAO', 'TERMO DE CESSAO']
  };

  let hit = tags.find(t => norm(t) === sn);
  if (hit) return hit;

  for (const t of tags) {
    const tn = norm(t);
    const al = aliases[tn] || [];
    if (al.some(a => sn === a || sn.includes(a) || a.includes(sn))) return t;
    if (sn.includes(tn) || tn.includes(sn)) return t;
  }
  // Só tags da lista ativa — nunca inventar DOC/avulso
  return '';
}

function anexosAttId(att) {
  return String((att && (att.attachmentid || att.attachmentId || att.id)) || '').trim();
}

/**
 * Anexos da ficha do cliente: só entram se forem pessoais (sem lote)
 * ou se a descrição citar o empreendimento/unidade atuais.
 * Evita puxar docs de outros lotes do mesmo cliente.
 */
function anexosAttachmentBelongsToUnit(att, ctx) {
  const text = `${att.fileName || ''} ${att.description || ''} ${att.name || ''}`.toUpperCase();
  const unitName = String((ctx && ctx.unitName) || '').toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const enterpriseId = String((ctx && ctx.enterpriseId) || '').trim();
  const unitCompact = unitName.replace(/\s+/g, '');

  // Padrão CRM: "17701 F 265 - TAG ..."
  const unitRefs = text.match(/\b\d{4,5}\s+[A-Z0-9]\s*\d{1,4}\b/g)
    || text.match(/\b\d{4,5}\s+[A-Z]-?\d{1,4}\b/g)
    || [];
  if (unitRefs.length) {
    const ok = unitRefs.some((ref) => {
      const r = ref.replace(/\s+/g, '').replace(/-/g, '');
      const want = `${enterpriseId}${unitCompact}`.replace(/-/g, '');
      const want2 = unitCompact.replace(/-/g, '');
      return (want && r.includes(want2) && (!enterpriseId || r.startsWith(enterpriseId))) || r.includes(want2);
    });
    if (!ok) return false;
    return true;
  }

  if (unitName && text.includes(unitCompact)) return true;
  if (enterpriseId && unitName && text.includes(enterpriseId) && text.includes(unitName.split(/\s/)[0])) return true;

  // Documento pessoal (RG, CPF, etc.) sem referência a outro lote → ok
  if (/RG|CPF|CNH|CERTID[AÃ]O|COMPROVANTE DE ENDERE|ANALISE DE CREDITO|AN[AÁ]LISE DE CR[EÉ]DITO|PROCURAC|CASAMENTO|NASCIMENTO/.test(text)) {
    return true;
  }

  // Sem indicação de lote: incluir (doc genérico da ficha)
  if (!/\b\d{4,5}\b/.test(text) || !/[A-Z]-?\d{2,4}/.test(text)) return true;

  return false;
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

function anexosContractIsActive(c) {
  const sit = String((c && (c.situation || c.status)) || '').toUpperCase();
  return sit !== 'CANCELED' && sit !== 'CANCELADO' && sit !== 'DISTRATADO' && sit !== '3';
}

function anexosParseUnitName(name) {
  const s = String(name || '').trim();
  const parts = s.split(/[-/]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { block: parts[0], lot: parts.slice(1).join('-'), label: s };
  }
  return { block: '—', lot: s || '—', label: s || '—' };
}

function anexosEnvioKey(contractId, tag) {
  return `${String(contractId || '').trim()}_${String(tag || '').trim().toUpperCase()}`;
}

async function anexosLoadMapaEnvios(enterpriseId) {
  const cc = String(enterpriseId || '').trim();
  if (!cc || !window.firebaseCollections || !window.firebaseDb) return {};
  try {
    const { doc, getDoc } = window.firebaseCollections;
    const snap = await getDoc(doc(window.firebaseDb, 'anexos_mapa', cc));
    if (!snap.exists()) return {};
    const data = snap.data() || {};
    return data.byKey && typeof data.byKey === 'object' ? data.byKey : {};
  } catch (e) {
    console.warn('[Anexos] leitura anexos_mapa', e);
    return {};
  }
}

async function anexosSaveMapaEnvio(record) {
  const cc = String((record && record.enterpriseId) || '').trim();
  const contractId = String((record && record.contractId) || '').trim();
  const tag = String((record && record.tag) || '').trim().toUpperCase();
  if (!cc || !contractId || !tag || !window.firebaseCollections || !window.firebaseDb) return false;
  const key = anexosEnvioKey(contractId, tag);
  try {
    const { doc, getDoc, setDoc } = window.firebaseCollections;
    const ref = doc(window.firebaseDb, 'anexos_mapa', cc);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? (snap.data() || {}) : {};
    const byKey = { ...(prev.byKey || {}), [key]: { ...record, tag, key, sentAt: record.sentAt || new Date().toISOString() } };
    await setDoc(ref, {
      enterpriseId: cc,
      byKey,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    AnexosState.mapaEnvios = byKey;
    return true;
  } catch (e) {
    console.warn('[Anexos] gravação anexos_mapa', e);
    return false;
  }
}

async function anexosLoadTagMemory() {
  if (!window.firebaseCollections || !window.firebaseDb) return [];
  try {
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, 'anexos_tag_memory'));
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));
    AnexosState.tagMemory = rows;
    return rows;
  } catch (e) {
    console.warn('[Anexos] tag memory', e);
    return AnexosState.tagMemory || [];
  }
}

async function anexosSaveTagMemory(entry) {
  if (!entry || !window.firebaseCollections || !window.firebaseDb) return;
  try {
    const { doc, setDoc } = window.firebaseCollections;
    const id = entry.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = { ...entry, id, updatedAt: new Date().toISOString() };
    await setDoc(doc(window.firebaseDb, 'anexos_tag_memory', id), payload, { merge: true });
    const list = AnexosState.tagMemory || [];
    const ix = list.findIndex((x) => x.id === id);
    if (ix >= 0) list[ix] = payload;
    else list.push(payload);
    AnexosState.tagMemory = list;
  } catch (e) {
    console.warn('[Anexos] save tag memory', e);
  }
}

function anexosFingerprintFromImageDataUrl(dataUrl, ocrText) {
  const phrases = String(ocrText || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 40);
  let colors = [];
  let aspect = 0;
  try {
    const img = document.createElement('img');
    // sync path only works if already loaded; we compute aspect from data url size later via canvas in caller
    aspect = 0;
  } catch (e) {}
  return {
    phrases,
    phraseKey: phrases.slice(0, 12).join(' '),
    colors,
    aspect,
    sample: String(dataUrl || '').slice(0, 120)
  };
}

async function anexosFingerprintFromCanvas(canvas, ocrText) {
  const phrases = String(ocrText || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 40);
  const aspect = canvas && canvas.width && canvas.height ? Number((canvas.width / canvas.height).toFixed(3)) : 0;
  const colors = [];
  try {
    const ctx = canvas.getContext('2d');
    const w = Math.min(canvas.width, 80);
    const h = Math.min(canvas.height, 80);
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const data = tmp.getContext('2d').getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
    if (n) colors.push(`rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`);
  } catch (e) {}
  return { phrases, phraseKey: phrases.slice(0, 12).join(' '), colors, aspect };
}

function anexosMatchTagMemory(fp) {
  const mem = AnexosState.tagMemory || [];
  if (!fp || !mem.length) return '';
  const key = String(fp.phraseKey || '');
  let best = null;
  let bestScore = 0;
  mem.forEach((m) => {
    if (!m.tag) return;
    let score = 0;
    const mk = String(m.phraseKey || '');
    if (key && mk) {
      const a = new Set(key.split(' '));
      const b = mk.split(' ');
      const hit = b.filter((w) => a.has(w)).length;
      score += hit * 2;
    }
    if (m.rejected) score -= 6;
    if (m.confirmed) score += 3;
    if (Number(m.hits) > 0) score += Math.min(3, Number(m.hits));
    if (fp.aspect && m.aspect && Math.abs(Number(fp.aspect) - Number(m.aspect)) < 0.15) score += 2;
    if (fp.colors && m.colors && fp.colors[0] && m.colors[0] && fp.colors[0] === m.colors[0]) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  });
  if (best && bestScore >= 4) return anexosResolveActiveTag(best.tag);
  return '';
}

function anexosMarkAutoTagged(fileObj, tag) {
  if (!fileObj || !tag) return;
  fileObj.autoTagged = true;
  fileObj.autoTag = tag;
  fileObj.tagFeedback = 'pending';
}

function anexosFileNeedsTagConfirm(f) {
  return !!(f && f.autoTagged && f.tagFeedback === 'pending' && f.tags && f.tags[0] && String(f.tags[0]) === String(f.autoTag));
}

function anexosFmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function anexosMapaLoadingHtml(label) {
  return '<div class="anexos-mapa-empty anexos-mapa-loading">'
    + '<div class="loading-spinner anexos-mapa-spinner" aria-hidden="true"></div>'
    + '<span id="anexos-mapa-load-text">' + anexosEsc(label) + '</span>'
    + '</div>';
}

function anexosLoadPhaseLabel() {
  return AnexosState.periodoLoadPhase === 'anexos' ? 'Analisando anexos' : 'Buscando vendas';
}

function anexosSetLoadPhase(phase) {
  AnexosState.periodoLoadPhase = phase;
  const el = document.getElementById('anexos-mapa-load-text');
  if (el) el.textContent = anexosLoadPhaseLabel();
}

function anexosBuscarBtnHtml(loading, idleText) {
  return '<span class="anexos-buscar-slot">'
    + '<span class="anexos-buscar-idle"><i data-lucide="search" style="width:16px;height:16px;"></i> ' + idleText + '</span>'
    + '<span class="anexos-buscar-busy">Buscando<span class="anexos-dots"></span></span>'
    + '</span>';
}

function anexosBuildMapaHtml() {
  if (AnexosState.periodoMode || AnexosState.periodoOpen) {
    if (AnexosState.mapaLoading) return anexosMapaLoadingHtml(anexosLoadPhaseLabel());
    if (AnexosState.periodoMode) return anexosBuildPeriodoMapaHtml();
    return '<div class="anexos-mapa-empty">Informe o período e clique em Buscar vendas.</div>';
  }
  const units = AnexosState.unidades || [];
  if (AnexosState.mapaLoading || AnexosState.unidadesLoading) {
    return anexosMapaLoadingHtml(AnexosState.unidadesLoading ? 'Buscando vendas' : 'Analisando anexos');
  }
  if (!units.length) {
    return '<div class="anexos-mapa-empty">Busque o empreendimento para carregar o espelho de lotes.</div>';
  }
  const groups = {};
  units.forEach((u) => {
    const parsed = anexosParseUnitName(u.name);
    if (!groups[parsed.block]) groups[parsed.block] = [];
    groups[parsed.block].push({ u, parsed });
  });
  const blocks = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  let html = '<div class="anexos-mapa-legend">'
    + '<span class="anexos-mapa-pill is-pendente">Com contrato · pendente</span>'
    + '<span class="anexos-mapa-pill is-enviado">Enviado (contrato atual)</span>'
    + '<span class="anexos-mapa-pill is-off">Sem contrato ativo</span>'
    + '<span class="anexos-mapa-pill is-sel">Selecionado</span>'
    + '</div>';
  html += '<div class="anexos-mapa-wrap">';
  blocks.forEach((block) => {
    html += `<div class="anexos-mapa-quadra"><div class="anexos-mapa-quadra-title">Quadra ${anexosEsc(block)}</div><div class="anexos-mapa-grid">`;
    groups[block]
      .sort((a, b) => String(a.parsed.lot).localeCompare(String(b.parsed.lot), undefined, { numeric: true }))
      .forEach(({ u, parsed }) => {
        const meta = AnexosState.mapaMeta[String(u.id)] || {};
        const selected = String(AnexosState.selectedUnidade) === String(u.id);
        const active = !!meta.active;
        const sent = active && Array.isArray(meta.sentTags) && meta.sentTags.length > 0;
        let cls = 'anexos-mapa-tile';
        let title = u.name || '';
        if (!active) {
          cls += ' is-off';
          title += ' — sem contrato ativo';
        } else if (sent) {
          cls += ' is-enviado';
          title += ` — enviado (CV ${meta.contractNumber || meta.contractId})`;
        } else {
          cls += ' is-pendente';
          title += ` — pendente (CV ${meta.contractNumber || meta.contractId})`;
        }
        if (selected) cls += ' is-sel';
        const disabled = active ? '' : 'disabled';
        const onclick = active ? `AnexosApp.selecionarUnidade('${String(u.id).replace(/'/g, '')}')` : '';
        const statusLabel = !active ? 'Indisponível' : (sent ? 'Enviado' : 'Pendente');
        html += `<button type="button" class="${cls}" title="${anexosEsc(title)}" ${disabled} onclick="${onclick}">`
          + `<span class="anexos-mapa-lot">${anexosEsc(parsed.lot)}</span>`
          + `<span class="anexos-mapa-name">${anexosEsc(parsed.label)}</span>`
          + `<span class="anexos-mapa-status">${statusLabel}</span>`
          + `</button>`;
      });
    html += '</div></div>';
  });
  html += '</div>';
  const clickable = units.filter((u) => (AnexosState.mapaMeta[String(u.id)] || {}).active).length;
  const enviados = units.filter((u) => {
    const m = AnexosState.mapaMeta[String(u.id)] || {};
    return m.active && m.sentTags && m.sentTags.length;
  }).length;
  html += `<div class="anexos-mapa-foot">${clickable} lotes com contrato ativo · ${enviados} com envio no contrato atual · clique para taguear</div>`;
  return html;
}

function anexosBuildPeriodoMapaHtml() {
  const groups = AnexosState.periodoMapa || [];
  if (!groups.length) {
    const skippedEmpty = Number(AnexosState.periodoSkippedIncorp) || 0;
    return `<div class="anexos-mapa-empty">Nenhuma venda pendente de anexo no período.${skippedEmpty ? ` ${skippedEmpty} lote(s) de incorporação foram ocultados (só lotes próprios entram).` : ''}</div>`;
  }
  let html = '<div class="anexos-mapa-legend">'
    + '<span class="anexos-mapa-pill is-pendente">Pendente de envio</span>'
    + '<span class="anexos-mapa-pill is-enviado">Já enviado</span>'
    + '<span class="anexos-mapa-pill is-sel">Selecionado</span>'
    + '</div>';
  html += '<div class="anexos-mapa-wrap">';
  groups.forEach((emp) => {
    html += `<div class="anexos-mapa-quadra"><div class="anexos-mapa-quadra-title">${anexosEsc(emp.enterpriseId)} — ${anexosEsc(emp.enterpriseName || '')}</div><div class="anexos-mapa-grid">`;
    (emp.units || []).forEach((u) => {
      const meta = AnexosState.mapaMeta[String(u.id)] || {};
      const selected = String(AnexosState.selectedUnidade) === String(u.id) && String(AnexosState.cc) === String(emp.enterpriseId);
      const sent = Array.isArray(meta.sentTags) && meta.sentTags.length > 0;
      let cls = 'anexos-mapa-tile ' + (sent ? 'is-enviado' : 'is-pendente');
      if (selected) cls += ' is-sel';
      const parsed = anexosParseUnitName(u.name);
      html += `<button type="button" class="${cls}" title="${anexosEsc(u.name)}" onclick="AnexosApp.selecionarUnidadePeriodo('${String(emp.enterpriseId).replace(/'/g, '')}','${String(u.id).replace(/'/g, '')}')">`
        + `<span class="anexos-mapa-lot">${anexosEsc(parsed.lot)}</span>`
        + `<span class="anexos-mapa-name">${anexosEsc(parsed.label)}</span>`
        + `<span class="anexos-mapa-status">${sent ? 'Enviado' : 'Pendente'}</span>`
        + `</button>`;
    });
    html += '</div></div>';
  });
  html += '</div>';
  const total = groups.reduce((n, g) => n + (g.units || []).length, 0);
  const skipped = Number(AnexosState.periodoSkippedIncorp) || 0;
  html += `<div class="anexos-mapa-foot">${groups.length} empreendimento(s) · ${total} unidade(s) no período${skipped ? ` · ${skipped} lote(s) de incorporação ocultados` : ''}</div>`;
  return html;
}

function anexosEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Usado pelo Compromissário: baixa CONTRATO/DISTRATO da unidade no Sienge. */
async function anexosFetchTermoBlobForContract(contract) {
  if (!contract) return null;
  const op = String(contract._operationType || 'Venda').toUpperCase();
  const wantTag = op === 'DISTRATO' ? 'DISTRATO' : 'CONTRATO';
  const unit = (contract.salesContractUnits && contract.salesContractUnits[0]) || {};
  const unitId = unit.id || unit.unitId || contract.unitId;
  const enterpriseId = String(contract.enterpriseId || '').trim();
  const contractId = String(contract.id || '').trim();
  const auth = typeof getBasicAuthHeader === 'function' ? getBasicAuthHeader() : '';

  // 1) Ledger do assistente (metadados); o arquivo ainda vem do Sienge
  let preferredName = '';
  if (enterpriseId && contractId) {
    const envios = await anexosLoadMapaEnvios(enterpriseId);
    const rec = envios[anexosEnvioKey(contractId, wantTag)];
    if (rec && rec.fileName) preferredName = String(rec.fileName);
  }

  if (!unitId) return null;
  const listRes = await fetch(anexosApiUrl(`/sienge-proxy/units/${unitId}/attachments`), {
    headers: { Authorization: auth, Accept: 'application/json' }
  });
  if (!listRes.ok) return null;
  const listData = await listRes.json();
  const rows = listData.results || listData || [];
  if (!Array.isArray(rows) || !rows.length) return null;

  const tagOf = (a) => {
    const desc = String(a.description || a.name || a.fileName || '').toUpperCase();
    if (desc.includes('DISTRATO')) return 'DISTRATO';
    if (desc.includes('CONTRATO')) return 'CONTRATO';
    return '';
  };
  let candidates = rows.filter((a) => tagOf(a) === wantTag);
  if (!candidates.length) {
    candidates = rows.filter((a) => String(a.description || a.name || '').toUpperCase().includes(wantTag));
  }
  if (!candidates.length) return null;

  if (preferredName) {
    const hit = candidates.find((a) => String(a.name || a.fileName || '').includes(preferredName.replace(/\.[^.]+$/, '')));
    if (hit) candidates = [hit, ...candidates.filter((x) => x !== hit)];
  }
  candidates.sort((a, b) => String(b.uploadDate || b.createdAt || b.description || '').localeCompare(String(a.uploadDate || a.createdAt || a.description || '')));
  const att = candidates[0];
  const attId = att.attachmentid || att.attachmentId || att.id;
  if (!attId) return null;
  const fileRes = await fetch(anexosApiUrl(`/sienge-proxy/units/${unitId}/attachments/${attId}/file`), {
    headers: { Authorization: auth }
  });
  if (!fileRes.ok) return null;
  const blob = await fileRes.blob();
  const fileName = preferredName || att.name || att.fileName || `${wantTag}-${contractId}.pdf`;
  return new File([blob], fileName, { type: blob.type || 'application/pdf' });
}

window.anexosFetchTermoBlobForContract = anexosFetchTermoBlobForContract;
window.anexosLoadMapaEnvios = anexosLoadMapaEnvios;

// --- RENDERIZAÇÃO DA INTERFACE ---

function renderAnexosModule() {
  const targetId = window.anexosTargetId || 'anexos-root';
  const root = document.getElementById(targetId);
  if (!root) return;

  const isModal = targetId === 'anexos-cliente-root';

  const ccDisplay = AnexosState.cc
    ? (AnexosState.ccName ? `${AnexosState.cc} - ${AnexosState.ccName}` : AnexosState.cc)
    : '';

  root.innerHTML = `
    <div class="anexos-container">
      ${isModal ? '' : `
      <div class="anexos-id-card">
        <div class="anexos-id-toolbar">
          <div class="anexos-contexto-group" role="radiogroup" aria-label="Destino do documento">
            <label class="anexos-contexto-opt">
              <input type="radio" name="anexos-contexto" value="Unidade" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Unidade' ? 'checked' : ''}> Só Unidade
            </label>
            <label class="anexos-contexto-opt">
              <input type="radio" name="anexos-contexto" value="Cliente" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Cliente' ? 'checked' : ''}> Só Cliente
            </label>
            <label class="anexos-contexto-opt">
              <input type="radio" name="anexos-contexto" value="Ambos" onchange="AnexosApp.setContexto(this.value)" ${AnexosState.contexto === 'Ambos' ? 'checked' : ''}> Ambos
            </label>
          </div>
          <div class="anexos-toolbar-actions">
            ${AnexosState.contexto !== 'Cliente' ? `
            <button type="button" class="btn btn-outline anexos-ctrl anexos-btn-periodo" onclick="AnexosApp.togglePeriodoPanel()">
              <i data-lucide="calendar-range" style="width:16px;"></i> Vendas do período
            </button>` : ''}
            <button type="button" class="btn btn-secondary anexos-ctrl" onclick="AnexosApp.resetAndRender()" style="background:#f97316;border:none;color:#fff;font-weight:600;padding:0 14px;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="refresh-cw" style="width: 16px;"></i> Limpar Campos
            </button>
          </div>
        </div>

        ${AnexosState.periodoOpen && AnexosState.contexto !== 'Cliente' ? `
        <div class="anexos-periodo-bar">
          <label>Início <input type="date" id="anexos-periodo-ini" value="${AnexosState.periodoStart || ''}" onchange="AnexosState.periodoStart=this.value"></label>
          <label>Fim <input type="date" id="anexos-periodo-fim" value="${AnexosState.periodoEnd || ''}" onchange="AnexosState.periodoEnd=this.value"></label>
          <button type="button" class="btn btn-primary anexos-ctrl anexos-buscar-btn ${AnexosState.mapaLoading ? 'is-loading' : ''}" onclick="AnexosApp.buscarVendasPeriodo()" ${AnexosState.mapaLoading ? 'disabled' : ''}>
            ${anexosBuscarBtnHtml(AnexosState.mapaLoading, 'Buscar vendas')}
          </button>
          <button type="button" class="btn btn-outline anexos-ctrl" onclick="AnexosApp.fecharPeriodoMode()">Fechar período</button>
          <span class="anexos-periodo-hint">Não precisa escolher empreendimento/unidade — o espelho lista o que falta enviar. Incorporação fica de fora, exceto lotes próprios.</span>
        </div>` : ''}

        <div class="anexos-filters-grid ${AnexosState.contexto === 'Cliente' ? 'is-cliente' : 'is-unidade'} ${AnexosState.periodoOpen ? 'is-periodo-locked' : ''}">
          ${AnexosState.contexto !== 'Cliente' ? `
            <div class="form-group anexos-field" style="margin:0;">
              <label>Centro de Custo (Empreendimento)</label>
              <div class="anexos-cc-combo">
                <input type="text" id="anexos-cc" class="form-control anexos-ctrl" placeholder="${AnexosState.periodoOpen ? 'Clique no lote do mapa abaixo…' : 'Digite ID, nome ou escolha na lista...'}"
                  value="${String(ccDisplay).replace(/"/g, '&quot;')}"
                  ${AnexosState.periodoOpen ? 'disabled' : ''}
                  onfocus="AnexosApp.openCostCenterList()"
                  oninput="AnexosApp.handleCostCenterAutocomplete(this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();AnexosApp.buscarUnidades();}"
                  autocomplete="off">
                <button type="button" class="btn btn-outline anexos-ctrl anexos-cc-chevron" title="Abrir lista" onclick="AnexosApp.toggleCostCenterList()" ${AnexosState.periodoOpen ? 'disabled' : ''}>
                  <i data-lucide="chevron-down" style="width:16px;height:16px;"></i>
                </button>
                <button type="button" class="btn btn-primary anexos-ctrl anexos-buscar-btn anexos-buscar-btn-cc ${AnexosState.unidadesLoading ? 'is-loading' : ''}" id="anexos-btn-buscar-cc" onclick="AnexosApp.buscarUnidades()" ${AnexosState.periodoOpen || AnexosState.unidadesLoading ? 'disabled' : ''}>
                  ${anexosBuscarBtnHtml(AnexosState.unidadesLoading, 'Buscar')}
                </button>
                <div id="anexos-cc-suggestions" class="anexos-cc-suggestions" style="display:none;"></div>
              </div>
            </div>
            <div class="form-group anexos-field" style="margin:0;">
              <label>Selecione a Unidade</label>
              <select id="anexos-unidade" class="form-control anexos-ctrl" onchange="AnexosApp.selecionarUnidade(this.value)" ${AnexosState.periodoOpen || !AnexosState.unidades.length ? 'disabled' : ''}>
                <option value="">${AnexosState.periodoOpen ? 'Clique no lote do mapa abaixo…' : 'Selecione uma unidade...'}</option>
                ${AnexosState.unidades.map(u => `<option value="${u.id}" ${AnexosState.selectedUnidade == u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
              </select>
              <div id="anexos-unidade-loading" style="display:none;font-size:12px;color:var(--color-primary);margin-top:4px;">Carregando unidades...</div>
            </div>
            <div class="form-group anexos-field" style="margin:0;">
              <label>Data Global do Documento</label>
              ${anexosDateFieldHtml({ textId: "anexos-data", pickerId: "anexos-data-picker", stored: AnexosState.dataDocumento })}
            </div>
          ` : `
            <div class="form-group anexos-field" style="margin:0;">
              <label>ID Cliente ou CPF/CNPJ</label>
              <input type="text" id="anexos-idcliente" class="form-control anexos-ctrl" placeholder="ID ou CPF/CNPJ" value="${AnexosState.idCliente}" onchange="AnexosState.idCliente = this.value; renderAnexosModule();">
            </div>
            <div class="form-group anexos-field" style="margin:0;">
              <label>Data Global do Documento</label>
              ${anexosDateFieldHtml({ textId: "anexos-data", pickerId: "anexos-data-picker", stored: AnexosState.dataDocumento })}
            </div>
          `}
        </div>

        ${AnexosState.contexto !== 'Cliente' && !AnexosState.periodoOpen ? `
        <label class="anexos-mapa-flag">
          <input type="checkbox" ${AnexosState.mapaUnidades ? 'checked' : ''} onchange="AnexosApp.setMapaUnidades(this.checked)">
          Mapa de unidades (espelho)
        </label>` : ''}

        ${(AnexosState.activeContract || AnexosState.ccName) ? `
        <div class="anexos-contract-info">
          <div class="anexos-contract-meta">
            <span class="anexos-contract-label">Informações do contrato</span>
            <div class="anexos-contract-line">
              ${AnexosState.activeContract || AnexosState.idCliente ? `
                <span><i data-lucide="user" style="width:15px;height:15px;color:var(--color-primary);"></i>
                  ${AnexosState.idCliente ? AnexosState.idCliente + ' - ' : ''}${AnexosState.activeContract ? AnexosState.activeContract.customerName : 'Cliente'}
                </span>` : ''}
              ${AnexosState.ccName ? `<span><i data-lucide="map-pin" style="width:15px;height:15px;color:var(--color-primary);"></i> ${AnexosState.ccName}</span>` : ''}
              ${AnexosState.activeContract ? `<span><i data-lucide="file-text" style="width:15px;height:15px;color:var(--color-primary);"></i> ${AnexosState.activeContract.contractNumber}</span>` : ''}
              ${AnexosState.activeContract && AnexosState.activeContract.contractDate ? `<span><i data-lucide="calendar" style="width:15px;height:15px;color:var(--color-primary);"></i> ${AnexosState.activeContract.contractDate}</span>` : ''}
              ${AnexosState.tituloReceber && AnexosState.tituloReceber.number && AnexosState.tituloReceber.number !== '—'
                ? `<span><i data-lucide="receipt" style="width:15px;height:15px;color:var(--color-primary);"></i> ${anexosEsc(AnexosState.tituloReceber.number)}</span>`
                : (AnexosState.activeContract ? `<span><span class="loading-spinner anexos-btn-spinner" aria-hidden="true"></span> Título…</span>` : '')}
            </div>
          </div>
          <div class="anexos-contract-side">
            ${AnexosState.activeContract ? (
              AnexosState.contractAttachments.length > 0
                ? (AnexosState.importedContracts.has(AnexosState.activeContract.id)
                  ? `<span class="anexos-imported-badge"><i data-lucide="check-circle" style="width:16px;"></i> ${AnexosState.contractAttachments.length} Anexos Importados</span>`
                  : `<button type="button" class="btn btn-outline anexos-ctrl" style="padding:0 14px;font-weight:600;border-color:var(--color-primary);color:var(--color-primary);display:inline-flex;align-items:center;gap:6px;" onclick="AnexosApp.importarAnexosDoContrato()"><i data-lucide="download" style="width:16px;"></i> Baixar ${AnexosState.contractAttachments.length} Anexos</button>`)
                : `<span style="color:var(--color-text-muted);font-size:0.9rem;">Nenhum anexo no contrato</span>`
            ) : ''}
          </div>
        </div>` : ''}

        ${(AnexosState.mapaUnidades || AnexosState.periodoMode || AnexosState.periodoOpen) && AnexosState.contexto !== 'Cliente' ? `
        <div class="anexos-mapa-panel" id="anexos-mapa-panel">
          <div class="anexos-mapa-head">
            <strong>${AnexosState.periodoMode || AnexosState.periodoOpen ? 'Vendas do período — espelho' : 'Mapa de unidades'}</strong>
            <span>${AnexosState.periodoMode || AnexosState.periodoOpen
              ? 'Empreendimentos e unidades com venda no período que precisam envio de anexos. Incorporação não entra, exceto lotes próprios.'
              : 'Só lotes com contrato ativo. Após distrato + nova venda, o lote volta a ficar disponível para novo envio.'}</span>
          </div>
          ${anexosBuildMapaHtml()}
        </div>` : ''}
      </div>
      `}
        
      <!-- ETAPA 3: Upload e Revisão -->
      <div class="card anexos-upload-card" style="margin-bottom: 20px; transition: opacity 0.3s ease;">
        <div class="card-body">
          <div id="anexos-dropzone" class="dropzone anexos-dropzone">
            <i data-lucide="upload-cloud" style="width: 48px; height: 48px; color: var(--color-primary); margin-bottom: 10px;"></i>
            <h4>Arraste os arquivos aqui ou clique para selecionar</h4>
            <p style="color: var(--color-text-muted); font-size: 0.9rem;">Aceito: PDF, JPG, PNG (Max 70MB). Identificação automática de OCR ativa.</p>
            <input type="file" id="anexos-file-input" multiple accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
          </div>
          
          <div id="anexos-preparados-section" style="display: ${AnexosState.files.length > 0 ? 'block' : 'none'};">
            <div class="anexos-files-head">
              <h4 style="margin: 0;">Arquivos ${isModal ? 'Encontrados' : 'Preparados'} (${AnexosState.files.length})</h4>
              ${isModal ? '' : `<button class="btn btn-outline" onclick="AnexosApp.solicitarTag()"><i data-lucide="tag" style="width:16px"></i> Solicitar Nova TAG</button>`}
            </div>
            <div id="anexos-files-list" class="anexos-files-list">
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
  anexosLoadTagMemory();
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
    AnexosState.mapaUnidades = false;
    AnexosState.mapaLoading = false;
    AnexosState.mapaMeta = {};
    AnexosState.mapaEnvios = {};
    AnexosState.tituloReceber = null;
    AnexosState.periodoMode = false;
    AnexosState.periodoOpen = false;
    AnexosState.periodoMapa = [];
    AnexosState.periodoSkippedIncorp = 0;
    AnexosState.unidadesLoading = false;
    AnexosState.periodoLoadPhase = '';
    renderAnexosModule();
  },

  togglePeriodoPanel() {
    AnexosState.periodoOpen = !AnexosState.periodoOpen;
    if (AnexosState.periodoOpen && !AnexosState.periodoStart) {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      AnexosState.periodoStart = `${y}-${m}-01`;
      AnexosState.periodoEnd = anexosTodayIso();
    }
    renderAnexosModule();
  },

  fecharPeriodoMode() {
    AnexosState.periodoMode = false;
    AnexosState.periodoOpen = false;
    AnexosState.periodoMapa = [];
    AnexosState.periodoSkippedIncorp = 0;
    AnexosState.periodoLoadPhase = '';
    renderAnexosModule();
  },

  async buscarVendasPeriodo() {
    const ini = AnexosState.periodoStart || ((document.getElementById('anexos-periodo-ini') || {}).value || '');
    const fim = AnexosState.periodoEnd || ((document.getElementById('anexos-periodo-fim') || {}).value || '');
    if (!ini || !fim) {
      alert('Informe início e fim do período.');
      return;
    }
    AnexosState.periodoStart = ini;
    AnexosState.periodoEnd = fim;
    AnexosState.periodoMode = true;
    AnexosState.mapaUnidades = false;
    AnexosState.mapaLoading = true;
    AnexosState.periodoLoadPhase = 'vendas';
    AnexosState.periodoMapa = [];
    AnexosState.periodoSkippedIncorp = 0;
    renderAnexosModule();
    try {
      await anexosLoadTagMemory();
      const byEmp = {};
      let offset = 0;
      let hasMore = true;
      let skippedIncorp = 0;
      while (hasMore) {
        const url = anexosApiUrl(`/sienge-proxy/sales-contracts?limit=200&offset=${offset}&situation=2&initialIssueDate=${encodeURIComponent(ini)}&finalIssueDate=${encodeURIComponent(fim)}`);
        const res = await fetch(url, { headers: { Authorization: getBasicAuthHeader() } });
        if (!res.ok) break;
        const data = await res.json();
        const results = data.results || [];
        for (const c of results) {
          if (!anexosContractIsActive(c)) continue;
          const enterpriseId = String(c.enterpriseId || '').trim();
          if (!enterpriseId) continue;
          const units = c.salesContractUnits || c.units || [];
          const eligibleUnits = units.filter((su) => {
            const uid = String(su.id || su.unitId || '');
            const ok = typeof window.incorporacaoUnitUsesNormalFlow === 'function'
              ? window.incorporacaoUnitUsesNormalFlow(enterpriseId, su.name || '', uid)
              : true;
            if (!ok) skippedIncorp++;
            return ok;
          });
          if (!eligibleUnits.length) continue;
          if (!byEmp[enterpriseId]) {
            byEmp[enterpriseId] = {
              enterpriseId,
              enterpriseName: c.enterpriseName || '',
              units: [],
              _seen: new Set()
            };
          }
          if (AnexosState.periodoLoadPhase !== 'anexos') anexosSetLoadPhase('anexos');
          const envios = AnexosState._periodoEnviosCache && AnexosState._periodoEnviosCache[enterpriseId]
            ? AnexosState._periodoEnviosCache[enterpriseId]
            : await anexosLoadMapaEnvios(enterpriseId);
          if (!AnexosState._periodoEnviosCache) AnexosState._periodoEnviosCache = {};
          AnexosState._periodoEnviosCache[enterpriseId] = envios;

          eligibleUnits.forEach((su) => {
            const uid = String(su.id || su.unitId || '');
            if (!uid || byEmp[enterpriseId]._seen.has(uid)) return;
            byEmp[enterpriseId]._seen.add(uid);
            const key = anexosEnvioKey(c.id, 'CONTRATO');
            const sent = !!(envios[key]);
            AnexosState.mapaMeta[uid] = {
              active: true,
              contractId: c.id,
              contractNumber: c.contractNumber || c.number || c.id,
              sentTags: sent ? ['CONTRATO'] : [],
              enterpriseId,
              enterpriseName: c.enterpriseName || '',
              unitName: su.name || ''
            };
            // Só lista pendentes no espelho do período
            if (!sent) {
              byEmp[enterpriseId].units.push({ id: uid, name: su.name || uid, contractId: c.id });
            }
          });
        }
        if (results.length < 200) hasMore = false;
        else offset += results.length;
      }
      AnexosState.periodoSkippedIncorp = skippedIncorp;
      AnexosState.periodoMapa = Object.values(byEmp)
        .filter((e) => e.units.length)
        .map(({ _seen, ...rest }) => rest)
        .sort((a, b) => Number(a.enterpriseId) - Number(b.enterpriseId));
    } catch (e) {
      console.error('[Anexos] vendas período', e);
      alert('Falha ao buscar vendas do período: ' + (e.message || e));
    } finally {
      AnexosState.mapaLoading = false;
      AnexosState.periodoLoadPhase = '';
      renderAnexosModule();
    }
  },

  async selecionarUnidadePeriodo(enterpriseId, unitId) {
    AnexosState.cc = String(enterpriseId || '').trim();
    const emp = (AnexosState.periodoMapa || []).find((e) => String(e.enterpriseId) === String(enterpriseId));
    AnexosState.ccName = emp ? emp.enterpriseName : AnexosState.ccName;
    // Garante unidade na lista local
    if (!(AnexosState.unidades || []).some((u) => String(u.id) === String(unitId))) {
      const hit = emp && (emp.units || []).find((u) => String(u.id) === String(unitId));
      AnexosState.unidades = [{ id: unitId, name: (hit && hit.name) || String(unitId), enterpriseId }];
    }
    await this.selecionarUnidade(unitId);
  },

  setMapaUnidades(on) {
    AnexosState.mapaUnidades = !!on;
    renderAnexosModule();
    if (AnexosState.mapaUnidades && AnexosState.cc && AnexosState.unidades.length) {
      this.enrichMapaMeta();
    }
  },

  applyMapaMetaFromEnvios() {
    const envios = AnexosState.mapaEnvios || {};
    Object.keys(AnexosState.mapaMeta || {}).forEach((uid) => {
      const meta = AnexosState.mapaMeta[uid];
      if (!meta || !meta.contractId) {
        if (meta) meta.sentTags = [];
        return;
      }
      const tags = [];
      Object.keys(envios).forEach((key) => {
        const rec = envios[key];
        if (!rec) return;
        if (String(rec.contractId) === String(meta.contractId)) {
          tags.push(String(rec.tag || '').toUpperCase());
        }
      });
      meta.sentTags = [...new Set(tags.filter(Boolean))];
    });
  },

  async enrichMapaMeta() {
    const cc = String(AnexosState.cc || '').trim();
    if (!cc || !AnexosState.unidades.length) return;
    AnexosState.mapaLoading = true;
    renderAnexosModule();
    try {
      const byUnit = {};
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const url = anexosApiUrl(`/sienge-proxy/sales-contracts?limit=200&offset=${offset}&enterpriseId=${encodeURIComponent(cc)}`);
        const res = await fetch(url, { headers: { Authorization: getBasicAuthHeader() } });
        if (!res.ok) break;
        const data = await res.json();
        const results = data.results || [];
        results.forEach((c) => {
          const active = anexosContractIsActive(c);
          const dateKey = String(c.contractDate || c.issueDate || c.saleDate || '');
          const units = c.salesContractUnits || c.units || [];
          units.forEach((su) => {
            const uid = String(su.id || su.unitId || '');
            if (!uid) return;
            const prev = byUnit[uid];
            const info = {
              active,
              contractId: c.id,
              contractNumber: c.contractNumber || c.number || c.id,
              dateKey,
              unitName: su.name || ''
            };
            if (!prev) {
              byUnit[uid] = info;
              return;
            }
            // Preferir contrato ativo; entre ativos, o mais recente
            if (active && !prev.active) byUnit[uid] = info;
            else if (active === prev.active && dateKey > prev.dateKey) byUnit[uid] = info;
          });
        });
        if (results.length < 200) hasMore = false;
        else offset += results.length;
      }

      const meta = {};
      AnexosState.unidades.forEach((u) => {
        const hit = byUnit[String(u.id)];
        meta[String(u.id)] = hit
          ? { active: !!hit.active, contractId: hit.contractId, contractNumber: hit.contractNumber, sentTags: [] }
          : { active: false, contractId: null, contractNumber: null, sentTags: [] };
      });
      AnexosState.mapaMeta = meta;
      AnexosState.mapaEnvios = await anexosLoadMapaEnvios(cc);
      this.applyMapaMetaFromEnvios();

      // Detecta CONTRATO já na unidade (Sienge) e grava no ledger — marca Enviado
      await this.syncEnviadoFromSiengeAttachments(cc);

      // Implantação do espelho: 17701 já teve documentos enviados → seed Enviado
      if (String(cc) === '17701') {
        await this.seedEnviadoEmpreendimento(cc, 'CONTRATO');
      }
      this.applyMapaMetaFromEnvios();
    } catch (e) {
      console.error('[Anexos] enrichMapaMeta', e);
    } finally {
      AnexosState.mapaLoading = false;
      renderAnexosModule();
    }
  },

  async syncEnviadoFromSiengeAttachments(enterpriseId) {
    const auth = typeof getBasicAuthHeader === 'function' ? getBasicAuthHeader() : '';
    const activeIds = Object.keys(AnexosState.mapaMeta || {}).filter((uid) => {
      const m = AnexosState.mapaMeta[uid];
      return m && m.active && m.contractId && !(m.sentTags && m.sentTags.includes('CONTRATO'));
    });
    const concurrency = 4;
    let i = 0;
    const run = async () => {
      while (i < activeIds.length) {
        const idx = i++;
        const uid = activeIds[idx];
        const meta = AnexosState.mapaMeta[uid];
        if (!meta) continue;
        try {
          const res = await fetch(anexosApiUrl(`/sienge-proxy/units/${uid}/attachments`), {
            headers: { Authorization: auth, Accept: 'application/json' }
          });
          if (!res.ok) continue;
          const data = await res.json();
          const rows = data.results || data || [];
          const hasContrato = (Array.isArray(rows) ? rows : []).some((a) => {
            const t = `${a.description || ''} ${a.name || ''} ${a.fileName || ''}`.toUpperCase();
            return t.includes('CONTRATO') && !t.includes('DISTRATO');
          });
          if (!hasContrato) continue;
          await anexosSaveMapaEnvio({
            enterpriseId,
            unitId: uid,
            unitName: meta.unitName || '',
            contractId: meta.contractId,
            contractNumber: meta.contractNumber,
            tag: 'CONTRATO',
            destination: 'Unidade',
            description: 'detectado-sienge',
            fileName: '',
            sentAt: new Date().toISOString(),
            source: 'sienge_sync'
          });
        } catch (e) { /* ignore unit */ }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => run()));
  },

  async seedEnviadoEmpreendimento(enterpriseId, tag) {
    const t = String(tag || 'CONTRATO').toUpperCase();
    const seededKey = `anexos_seed_enviado_${enterpriseId}_${t}`;
    try {
      if (localStorage.getItem(seededKey) === '1') {
        // ainda reaplica meta a partir do ledger
        return;
      }
    } catch (e) {}
    const entries = Object.keys(AnexosState.mapaMeta || {});
    for (const uid of entries) {
      const meta = AnexosState.mapaMeta[uid];
      if (!meta || !meta.active || !meta.contractId) continue;
      const key = anexosEnvioKey(meta.contractId, t);
      if (AnexosState.mapaEnvios[key]) continue;
      await anexosSaveMapaEnvio({
        enterpriseId,
        unitId: uid,
        unitName: meta.unitName || '',
        contractId: meta.contractId,
        contractNumber: meta.contractNumber,
        tag: t,
        destination: 'Unidade',
        description: 'seed-implantacao-espelho',
        fileName: '',
        sentAt: new Date().toISOString(),
        source: 'seed_17701'
      });
    }
    try { localStorage.setItem(seededKey, '1'); } catch (e) {}
  },

  async loadTituloReceber(contract) {
    AnexosState.tituloReceber = null;
    if (!contract || !contract.customerId) {
      renderAnexosModule();
      return;
    }
    try {
      let bills = [];
      if (window.SiengeApiService && typeof SiengeApiService.getReceivableBills === 'function') {
        const res = await SiengeApiService.getReceivableBills(contract.customerId);
        bills = (res && res.results) || res || [];
      } else {
        const res = await fetch(anexosApiUrl(`/sienge-proxy/accounts-receivable/receivable-bills?customerId=${encodeURIComponent(contract.customerId)}&limit=100&offset=0`), {
          headers: { Authorization: getBasicAuthHeader() }
        });
        if (res.ok) {
          const data = await res.json();
          bills = data.results || [];
        }
      }
      if (!Array.isArray(bills)) bills = [];
      const unitId = String(contract.unitId || '');
      const unitName = String(contract.unitName || '').toUpperCase().replace(/\s+/g, '');
      const contractId = String(contract.id || '');
      let bill = bills.find((b) => String(b.salesContractId || b.contractId || '') === contractId)
        || bills.find((b) => {
          const u = b.units || b.salesContractUnits || [];
          return u.some((x) => String(x.id || x.unitId) === unitId);
        })
        || bills.find((b) => {
          const blob = `${b.unitName || ''} ${b.notes || ''} ${b.documentNumber || ''}`.toUpperCase().replace(/\s+/g, '');
          return unitName && blob.includes(unitName);
        })
        || bills[0];
      if (!bill) {
        AnexosState.tituloReceber = { id: '', number: '—', balance: null, statusLabel: 'Sem título' };
      } else {
        const bal = bill.balanceAmount ?? bill.outstandingBalance ?? bill.totalBalance ?? bill.value ?? bill.originalAmount;
        const sit = String(bill.situation || bill.status || bill.billStatus || '').toUpperCase();
        AnexosState.tituloReceber = {
          id: bill.id,
          number: bill.documentNumber || bill.number || bill.id,
          balance: bal,
          statusLabel: sit || 'Ativo'
        };
      }
    } catch (e) {
      console.warn('[Anexos] título a receber', e);
      AnexosState.tituloReceber = { id: '', number: '—', balance: null, statusLabel: 'Indisponível' };
    }
    renderAnexosModule();
  },

  filterEnterprisesForAnexos(list) {
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
      return EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(list);
    }
    return list || [];
  },

  async loadEnterprisesInBackground() {
    if (AnexosState.enterprisesLoaded) return;
    try {
      const svc = window.SiengeApiService;
      if (!svc) return;
      const raw = typeof svc.getCostCenters === "function"
        ? await svc.getCostCenters()
        : (typeof svc.getEnterprises === "function" ? await svc.getEnterprises() : []);
      AnexosState.enterprises = AnexosApp.filterEnterprisesForAnexos(raw);
      AnexosState.enterprisesLoaded = true;
    } catch(e) {
      console.error("Erro ao carregar empreendimentos:", e);
    }
  },

  handleCostCenterAutocomplete(val) {
    AnexosState.cc = String(val || '').split(' - ')[0].trim();
    AnexosApp.renderCostCenterSuggestions(val, false);
  },

  openCostCenterList() {
    AnexosApp.loadEnterprisesInBackground().then(() => {
      const input = document.getElementById('anexos-cc');
      AnexosApp.renderCostCenterSuggestions(input ? input.value : '', true);
    });
  },

  toggleCostCenterList() {
    const box = document.getElementById('anexos-cc-suggestions');
    if (!box) return;
    if (box.style.display === 'block') {
      box.style.display = 'none';
      return;
    }
    AnexosApp.openCostCenterList();
  },

  renderCostCenterSuggestions(val, showAll) {
    const suggestionsDiv = document.getElementById('anexos-cc-suggestions');
    if (!suggestionsDiv) return;
    if (!AnexosState.enterprises) AnexosState.enterprises = [];

    const term = String(val || '').toLowerCase().trim();
    let filtered = AnexosApp.filterEnterprisesForAnexos(AnexosState.enterprises).slice();
    if (!showAll) {
      if (!term || term.length < 1) {
        suggestionsDiv.style.display = 'none';
        return;
      }
    }
    if (term) {
      filtered = filtered.filter(e => {
        const name = String(e.name || '').toLowerCase();
        const id = String(e.id || '');
        return name.includes(term) || id.includes(term) || `${id} - ${name}`.toLowerCase().includes(term);
      });
    }
    filtered = filtered
      .sort((a, b) => Number(a.id) - Number(b.id))
      .slice(0, showAll && !term ? 80 : 20);

    if (!filtered.length) {
      suggestionsDiv.innerHTML = `<div style="padding:12px;color:#64748b;font-size:0.85rem;">Nenhum empreendimento encontrado</div>`;
      suggestionsDiv.style.display = 'block';
      return;
    }

    suggestionsDiv.innerHTML = filtered.map(e => {
      const safeName = String(e.name || '').replace(/'/g, "\\'");
      return `
      <div class="suggestion-item" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;"
           onmousedown="event.preventDefault(); AnexosApp.selectCostCenter('${e.id}', '${safeName}')">
        <div style="background: #eef8f2; color: var(--color-primary); padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; flex-shrink:0;">${e.id}</div>
        <div style="font-weight: 500; font-size: 0.9rem;">${e.name}</div>
      </div>`;
    }).join('');
    suggestionsDiv.style.display = 'block';
  },

  selectCostCenter(id, name) {
    AnexosState.cc = String(id);
    AnexosState.ccName = name;
    const input = document.getElementById('anexos-cc');
    if (input) input.value = `${id} - ${name}`;
    const suggestionsDiv = document.getElementById('anexos-cc-suggestions');
    if (suggestionsDiv) suggestionsDiv.style.display = 'none';
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

    if (!window.anexosCcClickAwayBound) {
      window.anexosCcClickAwayBound = true;
      document.addEventListener('click', (e) => {
        const combo = e.target && e.target.closest && e.target.closest('.anexos-cc-combo');
        const box = document.getElementById('anexos-cc-suggestions');
        if (!combo && box) box.style.display = 'none';
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
    const textEl = document.getElementById("anexos-data");
    const pickerEl = document.getElementById("anexos-data-picker");
    const iso = (pickerEl && pickerEl.value) || anexosBrToIso(textEl && textEl.value);
    AnexosState.dataDocumento = iso ? anexosIsoToStored(iso) : "";
    if (AnexosState.files.length) this.renderFilesList();
    else this.checkCanSend();
  },

  commitDateFields(textId, pickerId, iso) {
    const textEl = document.getElementById(textId);
    const pickerEl = document.getElementById(pickerId);
    const safeIso = iso || "";
    if (textEl) {
      textEl.value = safeIso ? anexosStoredToBr(safeIso) : "";
      textEl.style.borderColor = "";
    }
    if (pickerEl) pickerEl.value = safeIso;

    if (textId === "anexos-data") {
      AnexosState.dataDocumento = safeIso ? anexosIsoToStored(safeIso) : "";
      if (AnexosState.files.length) this.renderFilesList();
      else this.checkCanSend();
      return;
    }

    const m = String(textId || "").match(/^anexo-file-date-(.+)$/);
    if (m) {
      const file = AnexosState.files.find((f) => String(f.id) === String(m[1]));
      if (file) {
        file.dateOverride = safeIso ? anexosIsoToStored(safeIso) : "";
        this.renderFilesList();
      }
    }
  },

  onDateTextInput(textId, pickerId, el) {
    if (!el) return;
    const masked = anexosApplyBrDateMask(el.value);
    el.value = masked;
    if (masked.length === 10) {
      const iso = anexosBrToIso(masked);
      if (iso) {
        el.style.borderColor = "#86efac";
        this.commitDateFields(textId, pickerId, iso);
      } else {
        el.style.borderColor = "#fca5a5";
      }
    } else {
      el.style.borderColor = "";
    }
  },

  onDateTextBlur(textId, pickerId, el) {
    if (!el) return;
    const raw = String(el.value || "").trim();
    if (!raw) {
      this.commitDateFields(textId, pickerId, "");
      return;
    }
    const iso = anexosBrToIso(raw);
    if (!iso) {
      el.style.borderColor = "#fca5a5";
      alert("Data inválida. Use dd/mm/aaaa (não pode ser futura).");
      el.focus();
      return;
    }
    this.commitDateFields(textId, pickerId, iso);
  },

  onDatePicked(textId, pickerId, el) {
    const iso = el && el.value ? el.value : "";
    if (iso && iso > anexosTodayIso()) {
      alert("A data não pode ser futura.");
      if (el) el.value = anexosTodayIso();
      this.commitDateFields(textId, pickerId, anexosTodayIso());
      return;
    }
    this.commitDateFields(textId, pickerId, iso);
  },

  openDatePicker(pickerId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    try {
      if (typeof picker.showPicker === "function") picker.showPicker();
      else picker.click();
    } catch (e) {
      picker.focus();
      picker.click();
    }
  },

  setDateToday(textId, pickerId) {
    this.commitDateFields(textId, pickerId, anexosTodayIso());
  },

  setContexto(val) {
    AnexosState.contexto = val;
    renderAnexosModule();
  },

  async selecionarUnidade(unitId) {
    const prevUnit = AnexosState.selectedUnidade;
    AnexosState.selectedUnidade = unitId;
    AnexosState.activeContract = null;
    AnexosState.contractAttachments = [];
    // Troca de lote: limpa arquivos preparados (o nome na tela usa o lote atual e mascarava conteúdo antigo)
    if (String(prevUnit || '') !== String(unitId || '')) {
      AnexosState.files = [];
      AnexosState.importedContracts.clear();
      AnexosState.downloadedFilesIds.clear();
    }
    if (!unitId) {
      AnexosState.files = [];
      AnexosState.importedContracts.clear();
      AnexosState.tituloReceber = null;
      renderAnexosModule();
      return;
    }
    renderAnexosModule();

    try {
      const ccInput = document.getElementById('anexos-cc');
      const ccRaw = AnexosState.cc || (ccInput ? ccInput.value : '');
      const enterpriseId = String(ccRaw || '').split(' - ')[0].trim();
      if (!enterpriseId) return;

      const matchUnit = AnexosState.unidades ? AnexosState.unidades.find(u => String(u.id) === String(unitId)) : null;
      const nomeUnidade = matchUnit ? String(matchUnit.name || '') : '';

      // Sempre filtrar por empreendimento + unidade (unitId sozinho devolve contrato errado no Sienge)
      let scUrl = anexosApiUrl(`/sienge-proxy/sales-contracts?limit=100&offset=0&enterpriseId=${encodeURIComponent(enterpriseId)}&unitId=${encodeURIComponent(unitId)}`);
      let scRes = await fetch(scUrl, { headers: { 'Authorization': getBasicAuthHeader() } });
      let scData = scRes.ok ? await scRes.json() : { results: [] };
      let activeContracts = (scData.results || []).filter(c => {
        const sit = String(c.situation || c.status || '').toUpperCase();
        return sit !== 'CANCELED' && sit !== 'CANCELADO' && sit !== 'DISTRATADO';
      });

      // Confirma que a unidade do contrato bate com a selecionada
      const unitMatches = (c) => {
        const units = c.salesContractUnits || c.units || [];
        if (!units.length) return true;
        return units.some(u => {
          if (u.id != null && String(u.id) === String(unitId)) return true;
          if (nomeUnidade && u.name && String(u.name).replace(/\s+/g, '').toUpperCase() === nomeUnidade.replace(/\s+/g, '').toUpperCase()) return true;
          return false;
        });
      };
      activeContracts = activeContracts.filter(unitMatches);

      if (!activeContracts.length && (scData.results || []).length) {
        activeContracts = (scData.results || []).filter(unitMatches);
      }

      if (activeContracts.length === 0) {
        AnexosState.activeContract = null;
        AnexosState.contractAttachments = [];
        renderAnexosModule();
        console.warn('[Anexos] Nenhum contrato para enterpriseId=', enterpriseId, 'unitId=', unitId);
        return;
      }

      // Preferir contrato ativo (não quitado/distratado) mais recente
      activeContracts.sort((a, b) => String(b.contractDate || b.issueDate || '').localeCompare(String(a.contractDate || a.issueDate || '')));
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
        customers: mainC.salesContractCustomers || [],
        unitId: unitId,
        enterpriseId: enterpriseId,
        unitName: nomeUnidade,
        receivableBillId: mainC.receivableBillId || mainC.billReceivableId || null
      };
      AnexosState.tituloReceber = null;
      await anexosHydrateContractPeople();
      this.loadTituloReceber(AnexosState.activeContract);

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
      const attRes = await fetch(anexosApiUrl(`/sienge-proxy/sales-contracts/${mainC.id}/attachments`), {
        headers: { 'Authorization': getBasicAuthHeader() }
      });
      if (attRes.ok) {
        const attData = await attRes.json();
        allAttachments = allAttachments.concat((attData.results || []).map(a => ({
          ...a,
          _sourceContractId: mainC.id
        })));
      }

      let historicCustomers = [];
      try {
        const numContrato = mainC.contractNumber || mainC.number || mainC.id;
        if (enterpriseId && nomeUnidade && numContrato) {
          const histRes = await fetch(anexosApiUrl(`/api/sienge/historico-cessao?unidade=${encodeURIComponent(nomeUnidade)}&empreendimento=${encodeURIComponent(enterpriseId)}&contrato=${encodeURIComponent(numContrato)}`));
          if (histRes.ok) historicCustomers = await histRes.json();
        }
      } catch(err) {
        console.error("Erro ao buscar histórico de cessões via puppeteer:", err);
      }

      const customersToFetch = new Set();
      if (mainCust.customerId || mainCust.id) customersToFetch.add(mainCust.customerId || mainCust.id);
      historicCustomers.forEach(hc => customersToFetch.add(hc.customerId));

      for (const custId of customersToFetch) {
        try {
          const cAttRes = await fetch(anexosApiUrl(`/sienge-proxy/customers/${custId}/attachments`), {
            headers: { 'Authorization': getBasicAuthHeader() }
          });
          if (cAttRes.ok) {
             const cAttData = await cAttRes.json();
             const custResults = (cAttData.results || [])
               .filter(a => anexosAttachmentBelongsToUnit(a, { enterpriseId, unitName: nomeUnidade, unitId }))
               .map(a => ({
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

      if (unitId) {
        try {
          const uAttRes = await fetch(anexosApiUrl(`/sienge-proxy/units/${unitId}/attachments`), {
            headers: { 'Authorization': getBasicAuthHeader() }
          });
          if (uAttRes.ok) {
            const uAttData = await uAttRes.json();
            const unitResults = (uAttData.results || []).map(a => ({
              ...a,
              isUnitAttachment: true,
              unitId,
              description: a.description ? `(Unidade) ${a.description}` : `(Unidade) Arquivo`
            }));
            allAttachments = allAttachments.concat(unitResults);
          }
        } catch (e) {
          console.error(`Erro buscando anexos da unidade ${unitId}:`, e);
        }
      }

      AnexosState.contractAttachments = anexosDedupeAttachments(allAttachments);
      renderAnexosModule();
      if (AnexosState.contractAttachments.length) {
        this.importarAnexosDoContrato({ auto: true });
      }
    } catch (e) {
      console.error('Erro ao buscar contrato vigente:', e);
    }
  },

  /**
   * Lê a 1ª página (PDF) ou a imagem e classifica a TAG via /api/ocr/classify.
   * Retorna o nome da tag ativa (ou string vazia se DOC/falha).
   */
  async runOcrOnFileObj(fileObj) {
    if (!fileObj || !fileObj.file || !(fileObj.file.size > 0)) return '';
    const ext = String(fileObj.ext || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) return '';

    if (!(AnexosState.tagMemory || []).length) {
      await anexosLoadTagMemory();
    }

    let ocrImageB64 = fileObj.base64;
    if (!ocrImageB64) {
      ocrImageB64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(fileObj.file);
      });
      fileObj.base64 = ocrImageB64;
    }

    let fingerprintCanvas = null;
    if (ext === 'pdf' && window['pdfjs-dist/build/pdf']) {
      fileObj.status = 'Convertendo PDF para OCR...';
      this.renderFilesList();
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      const pdfUrl = URL.createObjectURL(fileObj.file);
      try {
        const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const page = await pdfDoc.getPage(1);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        ocrImageB64 = canvas.toDataURL('image/jpeg', 0.8);
        fingerprintCanvas = canvas;
      } finally {
        URL.revokeObjectURL(pdfUrl);
      }
    } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
      try {
        fingerprintCanvas = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c);
          };
          img.onerror = reject;
          img.src = ocrImageB64;
        });
      } catch (e) {}
    }

    fileObj.status = 'Lendo documento (OCR)...';
    this.renderFilesList();

    const tagNames = (AnexosState.tagsAtivas || []).map((t) => t.name).filter(Boolean);
    const res = await fetch(anexosApiUrl('/api/ocr/classify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_data: ocrImageB64, tags: tagNames })
    });
    const ocrData = await res.json().catch(() => ({}));
    const rawTag = String(ocrData.tag || '').trim();
    const ocrText = String(ocrData.text || ocrData.raw || '');
    const fp = fingerprintCanvas
      ? await anexosFingerprintFromCanvas(fingerprintCanvas, ocrText || rawTag)
      : anexosFingerprintFromImageDataUrl(ocrImageB64, ocrText || rawTag);
    fileObj._fingerprint = fp;

    const fromMemory = anexosMatchTagMemory(fp);
    if (fromMemory) return fromMemory;

    const resolved = anexosResolveActiveTag(rawTag);
    if (!resolved || resolved.toUpperCase() === 'DOC') {
      // Memória para aprendizado futuro (sem tag ainda)
      fileObj._pendingMemory = { ...fp, tag: '', pending: true };
      return '';
    }
    return resolved;
  },

  async applyTagFromOcrOrName(fileObj, nameHint) {
    const fromName = anexosResolveActiveTag(nameHint || anexosGuessTagFromDescription(fileObj.originalName || ''));
    const knownActive = fromName && (AnexosState.tagsAtivas || []).some(t => String(t.name).toUpperCase() === fromName.toUpperCase());

    // Nome já casa com TAG ativa → usa (rápido). Senão lê o documento.
    if (knownActive) {
      fileObj.tags = [fromName];
      fileObj.status = 'Pronto';
      anexosMarkAutoTagged(fileObj, fromName);
      anexosAssignClientTarget(fileObj, { autoDefault: true });
      return fromName;
    }

    try {
      const ocrTag = await this.runOcrOnFileObj(fileObj);
      if (ocrTag) {
        fileObj.tags = [ocrTag];
        fileObj.status = 'Pronto';
        anexosMarkAutoTagged(fileObj, ocrTag);
        anexosAssignClientTarget(fileObj, { autoDefault: true });
        return ocrTag;
      }
    } catch (err) {
      console.error('Erro no OCR:', err);
    }

    // Sem identificação: deixa Revisar e grava rascunho de memória
    if (fileObj._pendingMemory) {
      anexosSaveTagMemory({ ...fileObj._pendingMemory, originalName: fileObj.originalName || '' });
    }
    fileObj.tags = [];
    fileObj.status = 'Revisar';
    return '';
  },

  importarAnexosDoContrato(opts) {
    if (!AnexosState.activeContract || AnexosState.contractAttachments.length === 0) return;
    const auto = !!(opts && opts.auto);
    
    const isModal = window.anexosTargetId === 'anexos-cliente-root';

    // Se não for modal, mantemos o bloqueio original
    if (!isModal && AnexosState.importedContracts.has(AnexosState.activeContract.id)) {
      if (!auto) alert("Os anexos deste contrato já foram importados nesta sessão.");
      return;
    }

    const attachmentsToImport = AnexosState.contractAttachments.filter(att => {
        const attId = anexosAttId(att);
        return attId && !AnexosState.files.some(f => String(f.downloadedId) === attId);
    });

    if (attachmentsToImport.length === 0) {
        if (isModal && !auto) alert("Todos os anexos deste contrato já estão na lista.");
        return;
    }

    const novos = attachmentsToImport.map(att => {
      const fName = att.fileName || att.description || 'Anexo Sienge.pdf';
      const extMatch = fName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
      const guessedTag = anexosResolveActiveTag(anexosGuessTagFromDescription(att.description || fName));
      
      const fileObj = {
        id: 'imported_' + Math.random().toString(36).substr(2, 9),
        originalName: fName,
        file: { name: fName, size: 0, type: ext === 'pdf' ? 'application/pdf' : 'image/jpeg' },
        base64: null,
        ext: ext,
        size: 0,
        tagOriginal: guessedTag || '',
        tags: guessedTag ? [guessedTag] : [],
        status: 'Baixando arquivo...',
        uploadProgress: 0,
        previewUrl: null,
        dateOverride: '',
        downloadedId: anexosAttId(att)
      };

      // Inicia download assíncrono para obter o blob do arquivo pelo proxy
      setTimeout(async () => {
        try {
          const attId = anexosAttId(att);
          const contractId = att._sourceContractId || (AnexosState.activeContract && AnexosState.activeContract.id);
          let url = anexosApiUrl(`/sienge-proxy/sales-contracts/${contractId}/attachments/${attId}`);
          if (att.isCustomerAttachment) {
             url = anexosApiUrl(`/sienge-proxy/customers/${att.customerId}/attachments/${attId}`);
          } else if (att.isUnitAttachment) {
             url = anexosApiUrl(`/sienge-proxy/units/${att.unitId || AnexosState.selectedUnidade}/attachments/${attId}`);
          }
          fileObj._downloadUnitId = AnexosState.selectedUnidade;
          fileObj._downloadContractId = contractId;
          const res = await fetch(url, { headers: { 'Authorization': getBasicAuthHeader() } });
          if (String(fileObj._downloadUnitId) !== String(AnexosState.selectedUnidade)) {
            AnexosState.files = AnexosState.files.filter(f => f.id !== fileObj.id);
            AnexosApp.renderFilesList();
            return;
          }
          if (res.ok) {
            const blob = await res.blob();
            fileObj.size = blob.size;
            fileObj.file = new File([blob], fName, { type: blob.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') });
            
            if (['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
              fileObj.previewUrl = URL.createObjectURL(blob);
            }
            fileObj.status = 'Identificando TAG...';
            AnexosApp.renderFilesList();

            await AnexosApp.applyTagFromOcrOrName(fileObj, guessedTag || fName);
            AnexosApp.renderFilesList();
            AnexosApp.checkCanSend();
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
    let cc = ccInput ? ccInput.value.trim() : AnexosState.cc;
    // Aceita "17701", "17701 - NOME" ou só o nome (resolve pelo cadastro)
    if (cc.includes(' - ')) cc = cc.split(' - ')[0].trim();
    if (!/^\d+$/.test(cc) && AnexosState.enterprises && AnexosState.enterprises.length) {
      const term = String(ccInput ? ccInput.value : cc).toLowerCase().trim();
      const hit = AnexosState.enterprises.find(e =>
        String(e.id) === cc ||
        String(e.name || '').toLowerCase() === term ||
        String(e.name || '').toLowerCase().includes(term)
      );
      if (hit) {
        cc = String(hit.id);
        AnexosState.ccName = hit.name;
        if (ccInput) ccInput.value = `${hit.id} - ${hit.name}`;
      }
    }
    if (!cc) {
      alert("Por favor, informe o Centro de Custo.");
      return;
    }
    AnexosState.cc = cc;
    AnexosState.unidadesLoading = true;
    const suggestionsDiv = document.getElementById('anexos-cc-suggestions');
    if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    renderAnexosModule();
    
    try {
      if (window.SiengeApiService) {
        const ccData = await window.SiengeApiService.getCostCenter(cc);
        if (ccData && ccData.name) {
          AnexosState.ccName = ccData.name;
          if (ccInput) ccInput.value = `${cc} - ${ccData.name}`;
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
      AnexosState.mapaMeta = {};
      if (window.EstoqueComercialApp && typeof EstoqueComercialApp.markCcUnits === "function") {
        EstoqueComercialApp.markCcUnits(cc, allUnits.length > 0);
      }
      if (!allUnits.length) {
        AnexosState.enterprises = (AnexosState.enterprises || []).filter((e) => String(e.id) !== String(cc));
      }
      if (AnexosState.mapaUnidades) {
        await this.enrichMapaMeta();
        return;
      }
      
    } catch (e) {
      console.error("Erro ao buscar unidades:", e);
      alert("Falha ao buscar unidades. O CC está correto?");
    } finally {
      AnexosState.unidadesLoading = false;
      const loadEl = document.getElementById('anexos-unidade-loading');
      if (loadEl) loadEl.style.display = 'none';
      if (!AnexosState.mapaLoading) renderAnexosModule();
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
        
        if (['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
          fileObj.previewUrl = URL.createObjectURL(file);
        }

        try {
          await AnexosApp.applyTagFromOcrOrName(fileObj, file.name);
        } catch (err) {
          console.error("Erro no OCR:", err);
          fileObj.tags = [];
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
        <div class="anexos-file-row">
          ${previewHtml}
          
          <div class="anexos-file-row-main">
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
              ${anexosFileNeedsTagConfirm(f) ? `
              <div class="anexos-tag-quiz">
                <span class="anexos-auto-tag-badge"><i data-lucide="sparkles" style="width:13px;height:13px;"></i> Tagueado automaticamente</span>
                <span class="anexos-tag-quiz-q">Acertei a tag?</span>
                <div class="anexos-tag-quiz-actions">
                  <button type="button" class="btn btn-primary anexos-tag-quiz-yes" onclick="AnexosApp.confirmAutoTag('${f.id}', true)">Sim</button>
                  <button type="button" class="btn btn-secondary anexos-tag-quiz-no" onclick="AnexosApp.confirmAutoTag('${f.id}', false)">Não</button>
                </div>
              </div>
              ` : (f.autoTagged && f.tagFeedback === 'yes' ? `
              <div class="anexos-tag-quiz anexos-tag-quiz--ok">
                <span class="anexos-auto-tag-badge anexos-auto-tag-badge--ok"><i data-lucide="check-circle" style="width:13px;height:13px;"></i> Tagueado automaticamente</span>
              </div>
              ` : '')}
              ${(() => {
                let mainTag = AnexosState.tagsAtivas.find(t => t.name === f.tags[0]);
                let isClienteDest = mainTag && mainTag.destino === 'Cliente';
                if (!isClienteDest) return '';
                anexosAssignClientTarget(f);
                const people = anexosContractPeople();
                const selected = new Set((f.targetCustomerIds || []).map(String));
                const hasSel = selected.size > 0;
                if (!people.length) {
                  return `
                  <div style="display:flex;align-items:center;gap:8px;background:#fef2f2;padding:6px 8px;border-radius:4px;border:1px solid #fecaca;width:100%;font-size:0.78rem;color:#991b1b;">
                    <i data-lucide="user-x" style="width:14px;"></i>
                    Nenhum cliente no contrato para vincular este documento.
                  </div>`;
                }
                const checks = people.map(p => {
                  const checked = selected.has(String(p.id)) ? 'checked' : '';
                  return `<label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;cursor:pointer;padding:2px 0;color:var(--color-text);">
                    <input type="checkbox" ${checked} onchange="AnexosApp.toggleTargetCustomer('${f.id}', '${p.id}', this.checked)" style="width:14px;height:14px;accent-color:var(--color-primary);">
                    <span><strong>${p.name}</strong> <span style="color:var(--color-text-muted);">(${p.role}) · ID ${p.id}</span></span>
                  </label>`;
                }).join('');
                return `
                  <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.02); padding: 8px; border-radius: 4px; border: 1px solid ${hasSel ? 'var(--color-border)' : 'var(--color-danger)'}; width: 100%;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                      <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:600;color:${hasSel ? 'var(--color-text)' : 'var(--color-danger)'};">
                        <i data-lucide="users" style="width:14px;color:${hasSel ? 'var(--color-primary)' : 'var(--color-danger)'};"></i>
                        Clientes que receberão o anexo ${hasSel ? `(${selected.size})` : '(obrigatório)'}
                      </div>
                      <div style="display:flex;gap:8px;">
                        <button type="button" class="btn btn-outline" style="padding:2px 8px;font-size:0.7rem;height:auto;" onclick="AnexosApp.setAllTargetCustomers('${f.id}', true)">Marcar todos</button>
                        <button type="button" class="btn btn-outline" style="padding:2px 8px;font-size:0.7rem;height:auto;" onclick="AnexosApp.setAllTargetCustomers('${f.id}', false)">Desmarcar</button>
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:2px;max-height:140px;overflow-y:auto;">
                      ${checks}
                    </div>
                  </div>
                `;
              })()}
            </div>
          </div>
          
          <div class="anexos-file-row-side">
            <span class="badge ${badgeClass}" style="white-space: nowrap; display: inline-block;">${f.status}</span>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
              ${isModal ? '' : `
              <div class="anexos-file-date">
                <label style="font-size: 0.8rem; color: var(--color-text-muted); margin: 0; white-space: nowrap; align-self:flex-start;">Data Documento</label>
                ${anexosDateFieldHtml({
                  textId: `anexo-file-date-${f.id}`,
                  pickerId: `anexo-file-picker-${f.id}`,
                  stored: f.dateOverride || AnexosState.dataDocumento,
                  size: "sm"
                })}
              </div>
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

  confirmAutoTag(fileId, ok) {
    const file = AnexosState.files.find(f => f.id === fileId);
    if (!file || file.tagFeedback !== 'pending') return;

    const fp = file._fingerprint || file._pendingMemory || {};
    if (ok) {
      file.tagFeedback = 'yes';
      anexosSaveTagMemory({
        ...fp,
        tag: file.autoTag || (file.tags && file.tags[0]) || '',
        pending: false,
        confirmed: true,
        rejected: false,
        hits: Number(fp.hits || 0) + 1,
        originalName: file.originalName || '',
        learnedAt: new Date().toISOString()
      });
    } else {
      file.tagFeedback = 'no';
      file.autoTagged = false;
      file.tags = [];
      this.evalFileStatus(file);
      anexosSaveTagMemory({
        ...fp,
        tag: file.autoTag || '',
        pending: false,
        confirmed: false,
        rejected: true,
        originalName: file.originalName || '',
        learnedAt: new Date().toISOString()
      });
    }
    this.renderFilesList();
  },

  addTag(fileId, tag) {
    if (!tag) return;
    const resolved = anexosResolveActiveTag(tag) || tag;
    if (!(AnexosState.tagsAtivas || []).some((t) => String(t.name) === String(resolved))) {
      alert('Escolha uma TAG da lista ativa.');
      return;
    }
    const file = AnexosState.files.find(f => f.id === fileId);
    if (!file) return;

    if (!file.tags.includes(resolved)) {
      file.tags = [resolved];
      if (file.autoTagged && file.tagFeedback === 'pending' && String(resolved) !== String(file.autoTag || '')) {
        file.tagFeedback = 'changed';
      }
      anexosAssignClientTarget(file, { autoDefault: true });
      this.evalFileStatus(file);
      this.renderFilesList();
    }
    // Aprende fingerprint → tag para o próximo documento parecido
    const fp = file._fingerprint || file._pendingMemory;
    if (fp) {
      anexosSaveTagMemory({
        ...fp,
        tag: resolved,
        pending: false,
        originalName: file.originalName || '',
        learnedAt: new Date().toISOString()
      });
    }
  },

  removeTag(fileId, tag) {
    const file = AnexosState.files.find(f => f.id === fileId);
    if (!file) return;

    file.tags = file.tags.filter(t => t !== tag);
    if (file.tagFeedback === 'pending') file.tagFeedback = 'changed';
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
      file.targetCustomerIds = customerId ? [String(customerId)] : [];
      this.renderFilesList();
    }
  },

  toggleTargetCustomer(id, customerId, checked) {
    const file = AnexosState.files.find(f => f.id === id);
    if (!file) return;
    const cid = String(customerId);
    let ids = Array.isArray(file.targetCustomerIds) ? file.targetCustomerIds.map(String) : [];
    if (checked) {
      if (!ids.includes(cid)) ids.push(cid);
    } else {
      ids = ids.filter(x => x !== cid);
    }
    file.targetCustomerIds = ids;
    file.targetCustomerId = ids[0] || '';
    this.renderFilesList();
  },

  setAllTargetCustomers(id, markAll) {
    const file = AnexosState.files.find(f => f.id === id);
    if (!file) return;
    if (markAll) {
      file.targetCustomerIds = anexosContractPeople().map(p => String(p.id));
    } else {
      file.targetCustomerIds = [];
    }
    file.targetCustomerId = file.targetCustomerIds[0] || '';
    this.renderFilesList();
  },

  setFileDate(id, val) {
    const file = AnexosState.files.find(f => f.id === id);
    if (file) {
      const iso = anexosStoredToIso(val) || (String(val || "").includes("/") ? anexosBrToIso(val) : "");
      file.dateOverride = iso ? anexosIsoToStored(iso) : (val ? String(val).replace(/-/g, ".") : "");
      this.checkCanSend();
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
        
        if (isClienteDest) {
          anexosAssignClientTarget(f);
          const ids = (f.targetCustomerIds && f.targetCustomerIds.length)
            ? f.targetCustomerIds
            : (f.targetCustomerId ? [f.targetCustomerId] : []);
          if (!ids.length) hasMissingTarget = true;
          ids.forEach(cid => {
            const uniqueKey = `${f.tags.join('-')}__${cid}`;
            if (seenKeys.has(uniqueKey)) hasDuplicates = true;
            seenKeys.add(uniqueKey);
          });
        } else {
          let uniqueKey = `${f.tags.join('-')}__unidade`;
          if (seenKeys.has(uniqueKey)) hasDuplicates = true;
          seenKeys.add(uniqueKey);
        }
      }
    });

    const needsTagConfirm = !isModal && AnexosState.files.some(anexosFileNeedsTagConfirm);

    const canSend = AnexosState.files.length > 0 && 
                    !hasDuplicates && 
                    !hasMissingTarget &&
                    !needsTagConfirm &&
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
          hint.innerText = 'Selecione ao menos um cliente alvo para os documentos de Pessoa/Cliente';
        } else if (hasDuplicates) {
          hint.innerText = 'Erro: Você não pode usar a mesma TAG para a mesma pessoa/unidade.';
        } else if (needsTagConfirm) {
          hint.innerText = 'Confirme se a tag automática está correta (Acertei a tag?)';
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
    if (!isModal && AnexosState.files.some(anexosFileNeedsTagConfirm)) {
      alert('Confirme se a tag automática está correta antes de enviar para o Sienge.');
      return;
    }

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
    // No mapa: mantém empreendimento/lotes para seguir tagueando o próximo
    if (AnexosState.mapaUnidades && AnexosState.cc && AnexosState.unidades.length) {
      AnexosState.files = [];
      AnexosState.isUploading = false;
      AnexosState.importedContracts.clear();
      AnexosState.downloadedFilesIds.clear();
      this.applyMapaMetaFromEnvios();
      renderAnexosModule();
      return;
    }
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

    // Expande arquivos de Cliente em um envio por ID selecionado
    const uploadJobs = [];
    filesToSend.forEach(fileObj => {
      const mainTag = AnexosState.tagsAtivas.find(t => t.name === fileObj.tags[0]);
      const destinoAPI = mainTag ? mainTag.destino : 'Unidade';
      if (destinoAPI === 'Cliente') {
        anexosAssignClientTarget(fileObj);
        const ids = (fileObj.targetCustomerIds && fileObj.targetCustomerIds.length)
          ? fileObj.targetCustomerIds.map(String)
          : (fileObj.targetCustomerId ? [String(fileObj.targetCustomerId)] : []);
        if (!ids.length) {
          fileObj.sentOk = false;
          fileObj.status = 'Erro: selecione ao menos um cliente';
          return;
        }
        ids.forEach(cid => uploadJobs.push({ fileObj, destinoAPI, targetCustId: cid }));
      } else {
        uploadJobs.push({ fileObj, destinoAPI, targetCustId: null });
      }
    });
    
    // Não usamos mais finalCustomerId global. Cada arquivo de Cliente usa seus targetCustomerIds.
    const needsCustomerAPI = uploadJobs.some(j => j.destinoAPI === 'Cliente');

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

    const totalFiles = uploadJobs.length || filesToSend.length;
    let sentFiles = 0;
    const sentFileIds = new Set();
    const failedFileIds = new Set();

    for (let i = 0; i < uploadJobs.length; i++) {
      if (!AnexosState.isUploading) break; // Cancelado
      
      const { fileObj, destinoAPI } = uploadJobs[i];
      let targetCustId = uploadJobs[i].targetCustId || finalCustomerId;

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
      
      const idClienteStr = targetCustId
        ? `[${targetCustId}]`
        : (AnexosState.idCliente ? `[${AnexosState.idCliente}]` : '');
      const prefix = destinoAPI === 'Cliente' ? idClienteStr : `${cc} ${unitName}`;
      const extFinal = fileObj.ext === 'jpeg' ? 'jpg' : fileObj.ext;
      const nomeFinalArquivo = anexosSafeFileName(`${prefix} - ${tagLabel}${duplicateSuffix}${dataSuffix}.${extFinal}`);
      const descricaoSienge = `${dataFormatada} - ${String(tagLabel).replace(/[\\/]+/g, ' ')}`.replace(/\s+/g, ' ').trim();
      
      let apiUrl = '';
      
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
           let dlUrl = anexosApiUrl(`/sienge-proxy/sales-contracts/${AnexosState.activeContract.id}/attachments/${fileObj.downloadedId}/file`);
           const srcAtt = (AnexosState.contractAttachments || []).find(a =>
             String(a.attachmentid || a.attachmentId || a.id) === String(fileObj.downloadedId)
           );
           if (srcAtt && srcAtt.isCustomerAttachment) {
             dlUrl = anexosApiUrl(`/sienge-proxy/customers/${srcAtt.customerId}/attachments/${fileObj.downloadedId}/file`);
           } else if (srcAtt && srcAtt.isUnitAttachment) {
             dlUrl = anexosApiUrl(`/sienge-proxy/units/${srcAtt.unitId || AnexosState.selectedUnidade}/attachments/${fileObj.downloadedId}/file`);
           }
           const dRes = await fetch(dlUrl, {
             headers: { 'Authorization': getBasicAuthHeader() }
           });
           if (dRes.ok) {
             fileBlob = await dRes.blob();
           } else {
             throw new Error("Falha ao baixar arquivo importado do contrato.");
           }
        }

        document.getElementById('upload-status-text').innerText = destinoAPI === 'Cliente'
          ? `Enviando para cliente ${targetCustId}...`
          : "Enviando arquivo...";
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

        // Ledger por contractId: permite reenvio após distrato (novo CV)
        if (destinoAPI !== 'Cliente' && AnexosState.activeContract && AnexosState.activeContract.id) {
          const tagU = String(tagLabel || '').toUpperCase().split('-')[0].trim();
          await anexosSaveMapaEnvio({
            enterpriseId: cc,
            unitId: AnexosState.selectedUnidade,
            unitName: unitNameStr,
            contractId: AnexosState.activeContract.id,
            contractNumber: AnexosState.activeContract.contractNumber,
            tag: tagU || tagLabel,
            destination: 'Unidade',
            description: descricaoSienge,
            fileName: nomeFinalArquivo,
            sentAt: new Date().toISOString(),
            sentBy: (window.AppState && AppState.user && (AppState.user.email || AppState.user.name)) || ''
          });
          const uid = String(AnexosState.selectedUnidade);
          if (AnexosState.mapaMeta[uid]) {
            const prev = AnexosState.mapaMeta[uid].sentTags || [];
            AnexosState.mapaMeta[uid].sentTags = [...new Set([...prev, String(tagU || tagLabel).toUpperCase()])];
          }
        }

      } catch (err) {
        failedFileIds.add(fileObj.id);
        fileObj.status = 'Erro: ' + err.message;
        const summaryEl = document.getElementById('upload-summary');
        if (summaryEl) {
          summaryEl.innerHTML += `<div style="color: var(--color-danger); margin-bottom: 4px; font-weight: 500;">✗ Falha (${destinoAPI === 'Cliente' ? 'cliente ' + targetCustId : 'unidade'}): ${err.message}</div>`;
        }
      }

      // Atualizar progresso geral
      const overallPercent = Math.round((sentFiles / Math.max(totalFiles, 1)) * 100);
      document.getElementById('upload-progress-bar').style.width = `${overallPercent}%`;
      document.getElementById('upload-status-text').innerText = `${sentFiles} de ${totalFiles} envios concluídos (${overallPercent}%)`;
      
      // Só remove o arquivo da tela quando todos os destinos dele tiverem rodado sem falha
      const remainingForFile = uploadJobs.slice(i + 1).some(j => j.fileObj.id === fileObj.id);
      if (!remainingForFile && !failedFileIds.has(fileObj.id)) {
        fileObj.sentOk = true;
        fileObj.status = 'Enviado';
        sentFileIds.add(fileObj.id);
        AnexosState.files = AnexosState.files.filter(f => f.id !== fileObj.id);
        this.renderFilesList();
      }

      // Delay entre uploads
      if (i < uploadJobs.length - 1) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    if (AnexosState.isUploading) {
      document.getElementById('upload-status-text').innerText = failedFileIds.size
        ? `Upload finalizado com ${failedFileIds.size} arquivo(s) em erro.`
        : "Upload Concluído! Todos os arquivos foram enviados.";
      document.getElementById('upload-progress-bar').style.background = failedFileIds.size
        ? "linear-gradient(90deg, #b45309 0%, #f59e0b 100%)"
        : "linear-gradient(90deg, #1e8e3e 0%, #34a853 100%)";
      
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

window.AnexosApp = AnexosApp;
window.AnexosState = AnexosState;

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
