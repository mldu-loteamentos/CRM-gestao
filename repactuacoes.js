// Lógica para a aba de Repactuações
// Indexador 0 / REAL em parcela = acordo (não repactua). O contrato pode ter outro indexador (ex.: 7, 8, 9).
try { window.lastRepactuacaoBillId = null; } catch (e) {}

function isRealIndexer(id, name) {
    const sid = id == null || id === "" ? "" : String(id).trim();
    const n = String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
    if (sid === "0" || n === "0") return true;
    if (n === "REAL" || n === "0 - REAL" || n.endsWith(" - REAL")) return true;
    if (/^0\s*[-–]\s*REAL$/.test(n)) return true;
    return false;
}

function readIndexerRef(obj) {
    if (!obj) return { id: null, name: "" };
    const nested = obj.indexer && typeof obj.indexer === "object" ? obj.indexer : null;
    const condition = obj.condition && typeof obj.condition === "object" ? obj.condition : null;
    let id = null;
    const tryId = (v) => {
        if (v == null || v === "") return;
        if (id != null && id !== "") return;
        id = v;
    };
    tryId(obj.indexerId);
    tryId(obj.idIndexer);
    tryId(obj.indexadorId);
    tryId(obj.correctionIndexerId);
    tryId(obj.monetaryCorrectionIndexerId);
    tryId(obj.mainIndexerId);
    tryId(obj.indexerCode);
    tryId(nested && nested.id);
    tryId(nested && nested.indexerId);
    tryId(condition && condition.indexerId);
    tryId(condition && condition.idIndexer);
    if (obj.indexer != null && typeof obj.indexer !== "object") tryId(obj.indexer);
    if (obj.indexador != null && typeof obj.indexador !== "object") tryId(obj.indexador);

    // Extrato Sienge: coluna "Id" = indexador (0–99). installmentId é a parcela; não confundir.
    if ((id == null || id === "") && obj.id != null && obj.id !== "") {
        const n = Number(obj.id);
        const idStr = String(obj.id).trim();
        const looksIndexer = Number.isFinite(n) && n >= 0 && n <= 99 && idStr === String(n);
        if (looksIndexer) {
            if (obj.installmentId == null || obj.installmentId === "") {
                if (obj.installmentNumber != null) id = obj.id;
            } else if (String(obj.installmentId) !== idStr) {
                id = obj.id;
            }
        }
    }

    let name = obj.indexerName || obj.indexerDescription || obj.correctionIndexerName
        || (typeof obj.indexer === "string" ? obj.indexer : "")
        || (nested && (nested.description || nested.name))
        || (condition && (condition.indexerName || condition.indexerDescription))
        || "";
    if (typeof name === "object") name = name.name || name.description || "";

    // "7 - IGPM" / "8-IPCA"
    if ((id == null || id === "") && name) {
        const m = String(name).match(/^\s*(\d{1,2})\s*[-–]/);
        if (m) id = m[1];
    }

    return { id: id == null || id === "" ? null : id, name: name || "" };
}

function collectIndexerRefs(target, obj) {
    const ref = readIndexerRef(obj);
    if (ref.id != null || ref.name) target.push(ref);
}

/** Percorre arrays de parcelas do remade (originais + geradas). */
function collectIndexerRefsDeep(target, obj, depth) {
    if (!obj || depth > 4) return;
    collectIndexerRefs(target, obj);
    const keys = [
        "remadeInstallments", "originalInstallments", "oldInstallments",
        "generatedInstallments", "installments", "conditions", "paymentConditions"
    ];
    keys.forEach((k) => {
        const arr = obj[k];
        if (!Array.isArray(arr)) return;
        arr.forEach((row) => collectIndexerRefsDeep(target, row, depth + 1));
    });
}

function pickContractIndexer(refs) {
    const buckets = new Map();
    (refs || []).forEach(ref => {
        if (!ref || (ref.id == null && !ref.name)) return;
        const key = String(ref.id != null ? ref.id : ref.name).trim();
        if (!key) return;
        const prev = buckets.get(key) || { id: ref.id, name: ref.name || "", n: 0 };
        prev.n += 1;
        if (!prev.name && ref.name) prev.name = ref.name;
        if ((prev.id == null || isRealIndexer(prev.id, prev.name)) && ref.id != null && !isRealIndexer(ref.id, ref.name)) {
            prev.id = ref.id;
            if (ref.name) prev.name = ref.name;
        }
        buckets.set(key, prev);
    });
    const all = [...buckets.values()];
    const adjusting = all.filter(x => !isRealIndexer(x.id, x.name));
    if (adjusting.length) {
        adjusting.sort((a, b) => b.n - a.n);
        return {
            chosen: adjusting[0],
            realCount: all.filter(x => isRealIndexer(x.id, x.name)).reduce((s, x) => s + x.n, 0),
            adjustCount: adjusting.reduce((s, x) => s + x.n, 0)
        };
    }
    const real = all.find(x => isRealIndexer(x.id, x.name));
    return { chosen: real || { id: 0, name: "REAL" }, realCount: all.reduce((s, x) => s + x.n, 0), adjustCount: 0 };
}

function parseInstDueDate(dueDate) {
    if (!dueDate) return null;
    const s = String(dueDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s.includes("T") ? s : s + "T12:00:00Z");
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
        const d = new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parcela do mês imediatamente anterior ao aniversário (ex.: dezembro)
 * e a do mês do reajuste (ex.: janeiro). Se houver várias no mês,
 * escolhe o par cujo % mais se aproxima do BCB.
 */
function pickBeforeAfterForAdjust(installments, adjustDateStart, expectedPct) {
    const MS_DAY = 86400000;
    const sorted = (installments || [])
        .map((i) => ({ ...i, _due: parseInstDueDate(i.dueDate) }))
        .filter((i) => i._due && Number(i.value) > 0.009)
        .sort((a, b) => {
            const dt = a._due.getTime() - b._due.getTime();
            if (dt !== 0) return dt;
            return Number(a.number || a.id || 0) - Number(b.number || b.id || 0);
        });

    // Deduplica por número de parcela: preferir não-acordo e valor de face maior
    const byNum = new Map();
    sorted.forEach((i) => {
        const key = String(i.number != null ? i.number : (i.id + '@' + i._due.toISOString().slice(0, 10)));
        const prev = byNum.get(key);
        if (!prev) {
            byNum.set(key, i);
            return;
        }
        if (prev.acordoSemRepactuacao && !i.acordoSemRepactuacao) {
            byNum.set(key, i);
            return;
        }
        if (!prev.acordoSemRepactuacao && i.acordoSemRepactuacao) return;
        if (Number(i.value) > Number(prev.value)) byNum.set(key, i);
    });
    const uniq = [...byNum.values()].sort((a, b) => a._due.getTime() - b._due.getTime());
    if (!uniq.length) return { beforeInst: null, afterInst: null };

    const adjustY = adjustDateStart.getUTCFullYear();
    const adjustM = adjustDateStart.getUTCMonth(); // 0=jan
    const beforeY = adjustM === 0 ? adjustY - 1 : adjustY;
    const beforeM = adjustM === 0 ? 11 : adjustM - 1;

    const inMonth = (inst, y, m) => inst._due.getUTCFullYear() === y && inst._due.getUTCMonth() === m;

    const scorePair = (before, after) => {
        if (!before || !after || !(before.value > 0)) return Infinity;
        const applied = (after.value / before.value - 1) * 100;
        const diff = Math.abs(applied - Number(expectedPct || 0));
        const gapDays = Math.abs(after._due.getTime() - before._due.getTime()) / MS_DAY;
        // Preferir % perto do BCB e intervalo ~1 mês (25–40 dias)
        const monthPenalty = (gapDays >= 25 && gapDays <= 40) ? 0 : Math.abs(gapDays - 30);
        return diff * 1000 + monthPenalty;
    };

    const pickCalendarPair = (preferNonAcordo) => {
        const beforeMonthList = uniq.filter((i) => {
            if (!inMonth(i, beforeY, beforeM)) return false;
            if (preferNonAcordo && i.acordoSemRepactuacao) return false;
            return true;
        });
        const afterMonthList = uniq.filter((i) => {
            if (!inMonth(i, adjustY, adjustM)) return false;
            if (preferNonAcordo && i.acordoSemRepactuacao) return false;
            return true;
        });
        if (!beforeMonthList.length || !afterMonthList.length) return null;

        let best = { beforeInst: null, afterInst: null, score: Infinity };
        beforeMonthList.forEach((b) => {
            afterMonthList.forEach((a) => {
                const sameCond = !b.conditionType || !a.conditionType
                    || String(b.conditionType).toUpperCase() === String(a.conditionType).toUpperCase();
                const acordoPenalty = (b.acordoSemRepactuacao || a.acordoSemRepactuacao) ? 25 : 0;
                const s = scorePair(b, a) + (sameCond ? 0 : 50) + acordoPenalty;
                if (s < best.score) best = { beforeInst: b, afterInst: a, score: s };
            });
        });
        return (best.beforeInst && best.afterInst) ? best : null;
    };

    // 1) Preferência: mês anterior (ex. dezembro) × mês do aniversário (ex. janeiro)
    const calendarPair = pickCalendarPair(true) || pickCalendarPair(false);
    if (calendarPair) return calendarPair;

    // 2) Fallback: última parcela antes do aniversário + melhor candidata nos 60 dias seguintes
    const adjustTs = adjustDateStart.getTime();
    const beforeList = uniq.filter((i) => i._due.getTime() < adjustTs);
    const beforeInst = beforeList.length ? beforeList[beforeList.length - 1] : null;
    if (!beforeInst || !(beforeInst.value > 0)) {
        return { beforeInst: null, afterInst: null };
    }

    const beforeKey = String(beforeInst.number != null ? beforeInst.number : beforeInst.id);
    const windowEnd = adjustTs + 60 * MS_DAY;
    let afterCandidates = uniq.filter((i) => {
        const t = i._due.getTime();
        if (t < adjustTs || t > windowEnd) return false;
        const key = String(i.number != null ? i.number : i.id);
        return key !== beforeKey;
    });
    if (!afterCandidates.length) {
        afterCandidates = uniq.filter((i) => {
            if (i._due.getTime() < adjustTs) return false;
            return String(i.number != null ? i.number : i.id) !== beforeKey;
        }).slice(0, 8);
    }

    let afterInst = null;
    let bestScore = Infinity;
    afterCandidates.forEach((cand) => {
        const score = scorePair(beforeInst, cand);
        if (score < bestScore) {
            bestScore = score;
            afterInst = cand;
        }
    });

    return { beforeInst, afterInst };
}

/** Valor de face da parcela (não usar saldo — parcelas pagas vêm com balance 0). */
function readInstallmentFaceValue(inst) {
    if (!inst) return 0;
    const candidates = [
        inst.originalValue,
        inst.installmentValue,
        inst.principalValue,
        inst.value,
        inst.currentValue,
        inst.correctedValueWithoutAdditions,
        // Só fallback de saldo se ainda houver valor aberto
        (Number(inst.currentBalance) > 0.009 ? inst.currentBalance : null),
        (Number(inst.currentBalanceWithAddition) > 0.009 ? inst.currentBalanceWithAddition : null)
    ];
    for (const c of candidates) {
        const n = parseFloat(c);
        if (Number.isFinite(n) && n > 0.009) return n;
    }
    // Último recurso: recebimento quitado
    if (Array.isArray(inst.receipts) && inst.receipts.length) {
        const r0 = inst.receipts[0];
        const rv = parseFloat(r0.originalValue || r0.value || r0.receiptValue || 0);
        if (rv > 0.009) return rv;
    }
    const rv = parseFloat(inst.receiptValue || 0);
    return rv > 0.009 ? rv : 0;
}

function pushInstallmentRow(allInstallments, inst, itemIdx) {
    if (!inst || !inst.dueDate) return;
    const numRaw = inst.installmentNumber != null ? inst.installmentNumber
        : (inst.number != null ? inst.number : inst.installmentId);
    const num = numRaw != null && numRaw !== "" ? Number(numRaw) : null;
    if ((num == null || Number.isNaN(num)) && inst.id == null && !inst.document) return;
    const instIdx = readIndexerRef(inst);
    const resolvedId = instIdx.id != null ? instIdx.id : (itemIdx && itemIdx.id);
    const resolvedName = instIdx.name || (itemIdx && itemIdx.name) || "";
    const val = readInstallmentFaceValue(inst);
    if (!(val > 0.009)) return;
    const isAcordo = isRealIndexer(resolvedId, resolvedName);
    allInstallments.push({
        id: (num != null && !Number.isNaN(num)) ? num : (inst.id || inst.document || inst.installmentId),
        number: (num != null && !Number.isNaN(num)) ? num : null,
        dueDate: inst.dueDate,
        value: val,
        annualCorrection: inst.annualCorrection,
        indexerName: resolvedName,
        indexerId: resolvedId,
        conditionType: inst.conditionType || inst.paymentConditionType || inst.installmentType || "",
        acordoSemRepactuacao: isAcordo
    });
}

async function loadRepactuacoes(isBackground = false) {
    const loadingEl = document.getElementById("repactuacoes-loading");
    const resultsEl = document.getElementById("repactuacoes-results");
    
    if (!loadingEl || !resultsEl) return;
    
    try {
        let billId = window.AppState?.selectedSaleId;
        let companyId = (window.AppState && AppState.currentCompanyId)
            || (window.sale && (window.sale.companyId || (window.sale.company && window.sale.company.id)))
            || (window.dbContract && window.dbContract.companyId)
            || null;
        
        // Se for undefined ou vazio, vamos tentar buscar do DOM que o usuário está vendo
        if (!billId || billId === 'undefined' || billId === 'null') {
            const billIdSpan = document.querySelector("#det-bill-id span");
            if (billIdSpan) {
                billId = billIdSpan.innerText.trim();
            }
        }
        
        // Fallback: ficha do cliente listada
        if (!billId || billId === 'undefined') {
            const customerId = window.AppState?.selectedCustomerId;
            if (customerId && window.clientList) {
                const client = window.clientList.find(c => String(c.customerId) === String(customerId));
                if (client && client.billIds && client.billIds.length > 0) {
                    billId = client.billIds[0];
                }
            }
        }
        
        // Fallback: AppState antigo
        if (!billId && window.AppState && window.AppState.currentCustomer) {
            if (window.AppState.currentCustomer.billIds && window.AppState.currentCustomer.billIds.length > 0) {
                billId = window.AppState.currentCustomer.billIds[0];
            }
            if (window.AppState.currentCustomer.companyId) {
                companyId = window.AppState.currentCustomer.companyId;
            }
        }
        
        // Fallback: DOM antigo
        if (!billId) {
            const domBillEl = document.getElementById("det-bill-id");
            if (domBillEl && domBillEl.textContent && domBillEl.textContent.trim() !== "Carregando...") {
                billId = domBillEl.textContent.trim();
            }
        }
        
        // Fallback: Variáveis globais em app.js
        if (!billId && typeof window.billIdToMatch !== 'undefined') billId = window.billIdToMatch;
        if (!billId && typeof window.dbContract !== 'undefined' && window.dbContract) billId = window.dbContract.billReceivableId;
        if (!billId && typeof window.sale !== 'undefined' && window.sale) billId = window.sale.receivableBillId || window.sale.id;
        
        if (!billId || billId === 'undefined') {
            // Se chamado do isBackground na inicialização, não dê erro, apenas pare.
            if (isBackground) return;
            throw new Error("Não foi possível identificar o ID do contrato.");
        }
        
        const cleanBillId = String(billId).replace(/^B-/, '');
        const cacheKey = cleanBillId + "|idx-v3";
        
        // CACHE LOGIC
        if (window.lastRepactuacaoBillId === cacheKey && resultsEl.innerHTML.trim() !== "") {
            // Se já carregou ou está carregando para esse billId, não faz nada
            return;
        }
        window.lastRepactuacaoBillId = cacheKey;
        
        loadingEl.style.display = "block";
        resultsEl.style.display = "none";
        loadingEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 50px 20px; color: #64748b;">
                <style>
                    @keyframes pulse-search { 0% { transform: scale(0.85); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(0.85); opacity: 0.5; } }
                </style>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: pulse-search 1.5s ease-in-out infinite; color: #10b981; margin-bottom: 15px;">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span style="font-size: 1rem; font-weight: 600; color: #334155;">Buscando histórico de reajustes...</span>
                <span style="font-size: 0.8rem; color: #94a3b8; margin-top: 5px;">Isso pode levar alguns segundos dependendo do tamanho do contrato.</span>
            </div>
        `;
        
        // Extrair o Centro de Custo (Ex: "10100 - 05-16")
        let extractedCc = null;
        if (typeof window.sale !== 'undefined' && window.sale) {
             const units = window.sale.units || window.sale.unitId || "";
             const match = String(units).match(/^(\d+)/);
             if (match) extractedCc = match[1];
        }
        if (!extractedCc) {
             const domBlockLot = document.getElementById("det-block-lot");
             if (domBlockLot && domBlockLot.textContent && domBlockLot.textContent.trim() !== "Carregando...") {
                  const match = domBlockLot.textContent.trim().match(/^(\d+)/);
                  if (match) extractedCc = match[1];
             }
        }
        
        if (extractedCc) {
             // Mapear Centro de Custo para companyId (caminho inverso)
             const ccPools = [];
             if (typeof MOCK_COST_CENTERS !== "undefined") ccPools.push(MOCK_COST_CENTERS);
             if (window.AppState && AppState.costCenters) ccPools.push(AppState.costCenters);
             if (window.AppState && AppState.enterprises) ccPools.push(AppState.enterprises);
             ccPools.forEach(function(list) {
                 if (companyId) return;
                 const ccObj = (list || []).find(c => String(c.id) === String(extractedCc) || String(c.costCenterId) === String(extractedCc));
                 if (ccObj) companyId = ccObj.companyId || (ccObj.company && ccObj.company.id) || companyId;
             });
             if (!companyId) {
                 if (['10100', '10200', '10300', '20100', '20200'].includes(extractedCc)) companyId = 2;
                 else if (['10400', '10500', '10600', '10700', '10800', '10900', '13700', '13800', '13900', '14000', '14100', '14200', '14300'].includes(extractedCc)) companyId = 1;
                 else if (extractedCc === '60100') companyId = 6;
                 else if (/^14\d{3}$/.test(extractedCc)) companyId = 1;
             }
             console.log(`[Repactuações] Centro de custo: ${extractedCc} -> Resolvido para Empresa ID: ${companyId}`);
        } else if (!companyId) {
             if (typeof window.dbContract !== 'undefined' && window.dbContract && window.dbContract.companyId) {
                 companyId = window.dbContract.companyId;
             } else if (typeof window.sale !== 'undefined' && window.sale && window.sale.companyId) {
                 companyId = window.sale.companyId;
             } else if (typeof window.sale !== 'undefined' && window.sale && window.sale.company) {
                  companyId = window.sale.company.id || companyId;
             }
        }

        let data = [];
        
        if (typeof getApiMode === 'function' && getApiMode() === "simulado") {
            // Mock data for simulated mode
            await new Promise(resolve => setTimeout(resolve, 800));
            data = [
                { correctionDate: "2025-01-01", accumulatedPercentage: 5.46, indexerDescription: "IPCA" },
                { correctionDate: "2024-01-01", accumulatedPercentage: 4.83, indexerDescription: "IPCA" },
                { correctionDate: "2023-01-01", accumulatedPercentage: 5.79, indexerDescription: "IGPM" }
            ];
            renderRepactuacoes(data, null);
        } else {
            // Chamada Real via siengeFetchWithRetry (mesmo padrão do app.js)
            const startDueDate = "2010-01-01";
            const endDueDate = "2050-01-01";
            
            const extractQs = (cid, includeRemade, histFlags) => {
                const remade = includeRemade ? "true" : "false";
                const canceled = histFlags && histFlags.canceled ? "true" : "false";
                const revoked = histFlags && histFlags.revoked ? "true" : "false";
                let q = `/bulk-data/v1/customer-extract-history?startDueDate=${startDueDate}&endDueDate=${endDueDate}&billReceivableId=${cleanBillId}&documentsId=CT&includeRemadeInstallments=${remade}&includeCanceledInstallments=${canceled}&includeRevokedInstallments=${revoked}&includeRenegotiatedDischarge=false`;
                if (cid) q += `&companyId=${cid}`;
                return q;
            };
            const runExtract = async (endpoint) => {
                console.log("[Repactuações] Iniciando fetch para:", endpoint);
                if (typeof siengeFetchWithRetry === 'function') return siengeFetchWithRetry(endpoint);
                let baseUrl = (typeof SIENGE_CONFIG !== "undefined") ? SIENGE_CONFIG.baseUrl : `${window.location.origin}/sienge-proxy`;
                const authHeader = (typeof getBasicAuthHeader === 'function') ? getBasicAuthHeader() : '';
                const response = await fetch(`${baseUrl}${endpoint}`, {
                    headers: authHeader ? { 'Authorization': authHeader } : {}
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            };
            const extractItems = (payload) => {
                if (!payload) return [];
                if (payload.data) return payload.data;
                if (payload.results) return payload.results;
                return Array.isArray(payload) ? payload : [];
            };
            let json;
            let jsonOriginal = null;
            let jsonHistoric = null;
            try {
                const startTime = performance.now();
                // Remadeadas (acordos) + originais + históricas (baixadas/canceladas após remade):
                // remade=true sozinho esconde o indexador do CT (ex.: 7, 8, 9)
                const [jsonRemade, jsonOrig, jsonHist] = await Promise.all([
                    runExtract(extractQs(companyId, true)),
                    runExtract(extractQs(companyId, false)).catch(() => null),
                    runExtract(extractQs(companyId, false, { canceled: true, revoked: true })).catch(() => null)
                ]);
                json = jsonRemade;
                jsonOriginal = jsonOrig;
                jsonHistoric = jsonHist;
                let preview = extractItems(json);
                if (!preview.length && companyId) {
                    json = await runExtract(extractQs(null, true));
                    preview = extractItems(json);
                    try { jsonOriginal = await runExtract(extractQs(null, false)); } catch (e) { /* ignore */ }
                    try { jsonHistoric = await runExtract(extractQs(null, false, { canceled: true, revoked: true })); } catch (e) { /* ignore */ }
                }
                if (!preview.length && String(companyId) !== "1") {
                    json = await runExtract(extractQs(1, true));
                    try { jsonOriginal = await runExtract(extractQs(1, false)); } catch (e) { /* ignore */ }
                    try { jsonHistoric = await runExtract(extractQs(1, false, { canceled: true, revoked: true })); } catch (e) { /* ignore */ }
                }
                console.log(`[Repactuações] Fetch concluído em ${Math.round(performance.now() - startTime)}ms`);
            } catch(fetchErr) {
                console.error("[Repactuações] Erro no fetch:", fetchErr);
                throw new Error(`Falha ao buscar dados da API Sienge: ${fetchErr.message}`);
            }
            
            let items = extractItems(json);
            const itemsOriginal = extractItems(jsonOriginal);
            const itemsHistoric = extractItems(jsonHistoric);
            console.log(`[Repactuações] Recebeu ${items.length} remade + ${itemsOriginal.length} originais + ${itemsHistoric.length} históricas`);
            // Novo código seguindo a regra de negócio exata (BCB e Retroatividade)
            let emissionDate = null;
            let indexerId = null;
            let indexerNameBackup = "Índice Contratual";
            let allInstallments = [];
            let indexerRefs = [];
            let acordoParcelCount = 0;

            const ingestExtractItems = (list) => {
                (list || []).forEach(item => {
                    let em = item.emissionDate || item.issueDate || item.contractDate || item.saleDate;
                    if (!emissionDate && em) emissionDate = String(em).split('T')[0];

                    const itemIdx = readIndexerRef(item);
                    collectIndexerRefs(indexerRefs, item);

                    const installments = item.installments || [];
                    for (const inst of installments) {
                        collectIndexerRefs(indexerRefs, inst);
                        const beforeLen = allInstallments.length;
                        pushInstallmentRow(allInstallments, inst, itemIdx);
                        if (allInstallments.length > beforeLen && allInstallments[allInstallments.length - 1].acordoSemRepactuacao) {
                            acordoParcelCount += 1;
                        }
                    }
                });
            };

            ingestExtractItems(items);
            // Originais sem remade: costumam trazer o indexador contratual (7, 8, 9…)
            if (itemsOriginal && itemsOriginal.length) ingestExtractItems(itemsOriginal);
            // Parcelas baixadas/canceladas após acordo ainda carregam o indexador do CT
            if (itemsHistoric && itemsHistoric.length) ingestExtractItems(itemsHistoric);

            // Sempre enriquecer com parcelas do título + remade API (não só quando adjustCount=0)
            let picked = pickContractIndexer(indexerRefs);
            try {
                const enrichTasks = [];
                enrichTasks.push((async () => {
                    let billInsts = [];
                    if (window.SiengeApiService && typeof SiengeApiService.getBillInstallments === "function") {
                        billInsts = await SiengeApiService.getBillInstallments(cleanBillId) || [];
                    } else if (typeof siengeFetchWithRetry === "function") {
                        const bj = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${cleanBillId}/installments`);
                        billInsts = (bj && (bj.results || bj.data)) || (Array.isArray(bj) ? bj : []);
                    }
                    (Array.isArray(billInsts) ? billInsts : []).forEach(inst => {
                        collectIndexerRefs(indexerRefs, inst);
                        pushInstallmentRow(allInstallments, inst, null);
                    });
                    console.log(`[Repactuações] Parcelas do título: ${billInsts.length} (pool=${allInstallments.length})`);
                })());
                enrichTasks.push((async () => {
                    if (!window.SiengeApiService || typeof SiengeApiService.getRemadeInstallments !== "function") return;
                    const remade = await SiengeApiService.getRemadeInstallments(cleanBillId) || [];
                    (Array.isArray(remade) ? remade : []).forEach(row => {
                        // Importante: não usar só row.installments (geradas = REAL).
                        // remadeInstallments / originalInstallments guardam o indexador do CT (ex.: 8).
                        collectIndexerRefsDeep(indexerRefs, row, 0);
                        const nestedLists = [
                            row.originalInstallments,
                            row.remadeInstallments,
                            row.oldInstallments,
                            row.installments
                        ];
                        nestedLists.forEach((list) => {
                            if (!Array.isArray(list)) return;
                            list.forEach((inst) => pushInstallmentRow(allInstallments, inst, null));
                        });
                    });
                    console.log(`[Repactuações] Remade API: ${Array.isArray(remade) ? remade.length : 0} (pool=${allInstallments.length})`);
                })());
                enrichTasks.push((async () => {
                    if (typeof siengeFetchWithRetry !== "function") return;
                    try {
                        const bill = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${cleanBillId}`);
                        if (bill) {
                            collectIndexerRefsDeep(indexerRefs, bill, 0);
                            if (bill.sale) collectIndexerRefsDeep(indexerRefs, bill.sale, 0);
                            if (bill.contract) collectIndexerRefsDeep(indexerRefs, bill.contract, 0);
                        }
                    } catch (e) { /* ignore */ }
                })());
                await Promise.all(enrichTasks);
                picked = pickContractIndexer(indexerRefs);
            } catch (billErr) {
                console.warn("[Repactuações] Enrichment de indexador falhou:", billErr);
                picked = pickContractIndexer(indexerRefs);
            }

            // Fallback: parcelas já carregadas na ficha (extrato / dbContract) — valores + indexador
            if (window.AppState && Array.isArray(AppState.currentContractInstallments)) {
                AppState.currentContractInstallments.forEach(inst => {
                    collectIndexerRefs(indexerRefs, inst);
                    pushInstallmentRow(allInstallments, inst, null);
                });
            }
            if (window.dbContract && Array.isArray(dbContract.installments)) {
                dbContract.installments.forEach(inst => {
                    collectIndexerRefs(indexerRefs, inst);
                    pushInstallmentRow(allInstallments, inst, null);
                });
            }
            if (window.dbContract) collectIndexerRefs(indexerRefs, dbContract);
            if (window.sale) collectIndexerRefs(indexerRefs, window.sale);
            picked = pickContractIndexer(indexerRefs);
            console.log(`[Repactuações] Pool de parcelas p/ Antes-Depois: ${allInstallments.length}`);

            console.log(`[Repactuações] Indexador escolhido:`, picked);

            if (picked.chosen) {
                indexerId = picked.chosen.id;
                indexerNameBackup = picked.chosen.name || indexerNameBackup;
            }

            if (!emissionDate && typeof window.sale !== 'undefined' && window.sale) {
                 const saleDateRaw = window.sale.saleDate || window.sale.contractDate || window.sale.issueDate
                    || window.sale.accountingDate || window.sale.emissionDate;
                 if (saleDateRaw) emissionDate = String(saleDateRaw).split('T')[0];
            }
            if (!emissionDate && window.dbContract) {
                const raw = dbContract.saleDate || dbContract.contractDate || dbContract.issueDate || dbContract.emissionDate;
                if (raw) emissionDate = String(raw).split('T')[0];
            }

            allInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            // Sem data de venda: usa a parcela contratual mais antiga (não acordo)
            if (!emissionDate && allInstallments.length) {
                const base = allInstallments.find(i => !i.acordoSemRepactuacao) || allInstallments[0];
                if (base && base.dueDate) emissionDate = String(base.dueDate).split('T')[0];
            }
            // Último recurso — evita quebrar a tela (marca no log)
            if (!emissionDate) {
                console.warn("[Repactuações] Sem data de venda — usando 2020-01-01");
                emissionDate = "2020-01-01";
            }
            
            // Só assume contrato sem reajuste se nenhuma parcela tiver indexador de correção
            if (picked.adjustCount === 0 && (indexerId == null || indexerId === "" || isRealIndexer(indexerId, indexerNameBackup))) {
                indexerId = indexerId != null && indexerId !== "" ? indexerId : 0;
                if (!indexerNameBackup || indexerNameBackup === "Índice Contratual") indexerNameBackup = "REAL";
            }

            // 2. Buscar informações do indexador no Sienge (para pegar revenueRetroactivity)
            let indexerDetails = null;
            let baseUrl = (typeof SIENGE_CONFIG !== "undefined") ? SIENGE_CONFIG.baseUrl : `${window.location.origin}/sienge-proxy`;
            const authHeader = (typeof getBasicAuthHeader === 'function') ? getBasicAuthHeader() : '';
            
            if (typeof IndexadoresState !== 'undefined' && IndexadoresState.allSiengeIndexers) {
                indexerDetails = IndexadoresState.allSiengeIndexers.find(i => String(i.id) === String(indexerId));
            }

            if (!indexerDetails) {
                const idxResponse = await fetch(`${baseUrl}/indexers?limit=100`, {
                    headers: authHeader ? { 'Authorization': authHeader } : {}
                });
                if (idxResponse.ok) {
                    const idxJson = await idxResponse.json();
                    const allIndexers = idxJson.results || [];
                    indexerDetails = allIndexers.find(i => String(i.id) === String(indexerId));
                    if (typeof IndexadoresState !== 'undefined') {
                        IndexadoresState.allSiengeIndexers = allIndexers;
                    }
                }
            }

            if ((!indexerDetails || isRealIndexer(indexerDetails.id, indexerDetails.name)) && picked.adjustCount > 0 && picked.chosen && !isRealIndexer(picked.chosen.id, picked.chosen.name)) {
                const altId = picked.chosen.id;
                const pool = (typeof IndexadoresState !== "undefined" && IndexadoresState.allSiengeIndexers) ? IndexadoresState.allSiengeIndexers : [];
                indexerDetails = pool.find(i => String(i.id) === String(altId)) || indexerDetails;
                indexerId = altId;
            }

            if (!indexerDetails) {
                throw new Error("Não foi possível encontrar os detalhes do indexador usado no contrato (ID: " + indexerId + ")");
            }

            const indexerName = indexerDetails.name;
            const retro = indexerDetails.revenueRetroactivity || 0;

            // 3. Calcular Mês Base
            const emDate = new Date(emissionDate);
            if (isNaN(emDate.getTime())) throw new Error("Data de venda inválida");
            
            const emYear = emDate.getUTCFullYear();
            const emMonth = emDate.getUTCMonth(); // 0-11
            
            // Data base para BCB: Mês da venda + retroatividade (ex: 7 (Agosto) - 2 = 5 (Junho))
            let baseMonth = emMonth + retro;
            let baseYearOffset = 0;
            while (baseMonth < 0) {
                baseMonth += 12;
                baseYearOffset -= 1;
            }
            while (baseMonth > 11) {
                baseMonth -= 12;
                baseYearOffset += 1;
            }

            // 4. Buscar histórico do BCB para o Indexador
            const bcbSeriesMapping = {
                'IPCA': 433,
                'IGPM': 189,
                'IGP-M': 189,
                'IPC-DI': 191,
                'IPCDI': 191,
                'INCC': 7456,
                'INCC-M': 7456,
                'INCC-DI': 192
            };
            let bcbCode = null;
            const nameUpper = indexerName.toUpperCase();
            
            if (nameUpper === 'REAL' && picked.adjustCount === 0) {
                const meta = {
                    emissionDate: emissionDate,
                    indexerName: indexerName,
                    indexerId: indexerId,
                    revenueRetroactivity: retro,
                    acordoParcelCount: acordoParcelCount,
                    adjustParcelCount: 0
                };
                renderRepactuacoes([], meta);
                loadingEl.style.display = "none";
                resultsEl.style.display = "block";
                return;
            }
            
            for (const key in bcbSeriesMapping) {
                if (nameUpper === key || nameUpper.includes(key)) {
                    bcbCode = bcbSeriesMapping[key];
                    break;
                }
            }

            if (!bcbCode) {
                throw new Error("Indexador " + indexerName + " não mapeado para consulta no Banco Central.");
            }

            let bcbData = null;
            if (typeof IndexadoresState !== 'undefined' && IndexadoresState.bcbData && IndexadoresState.bcbData[indexerName]) {
                bcbData = IndexadoresState.bcbData[indexerName];
            } else {
                const bcbRes = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${bcbCode}/dados?formato=json`);
                if (bcbRes.ok) {
                    bcbData = await bcbRes.json();
                    if (typeof IndexadoresState !== 'undefined') {
                        if (!IndexadoresState.bcbData) IndexadoresState.bcbData = {};
                        IndexadoresState.bcbData[indexerName] = bcbData;
                    }
                }
            }

            if (!bcbData || bcbData.length === 0) {
                throw new Error("Não foi possível carregar o histórico do Banco Central para " + indexerName);
            }

            let monthlyRates = {}; 
            bcbData.forEach(d => {
                const parts = d.data.split('/');
                if (parts.length === 3) {
                    monthlyRates[`${parts[2]}-${parts[1]}`] = parseFloat(d.valor);
                }
            });

            const currentDate = new Date();
            const currentY = currentDate.getUTCFullYear();
            const currentM = currentDate.getUTCMonth();
            let correctionMap = {};
            let upcomingReadjustment = null;

            // Para cada ano após a venda
            for (let y = emYear + 1; y <= currentY + 1; y++) {
                const targetBaseYear = y + baseYearOffset;
                const targetBaseMonth = baseMonth + 1; // 1-12

                // Se a data do reajuste ainda não chegou, entra na projeção (upcoming)
                if (y > currentY || (y === currentY && emMonth >= currentM)) {
                    if (!upcomingReadjustment) {
                        let monthsData = [];
                        let last3Rates = [];
                        
                        for (let i = 0; i < 12; i++) {
                            let m = targetBaseMonth - i;
                            let yCalc = targetBaseYear;
                            while (m <= 0) {
                                m += 12;
                                yCalc -= 1;
                            }
                            const k = `${yCalc}-${String(m).padStart(2, '0')}`;
                            const rate = monthlyRates[k] !== undefined ? monthlyRates[k] : 0;
                            
                            monthsData.push({ monthYear: k, rate: rate });
                        }
                        
                        monthsData.reverse(); // Ordem cronológica

                        let currentAccumulated = 1;
                        for (let i = 0; i < 12; i++) {
                            if (monthsData[i].rate !== 0) {
                                currentAccumulated *= (1 + (monthsData[i].rate / 100));
                            }
                            monthsData[i].accumulated = (currentAccumulated - 1) * 100;
                            
                            if (i >= 9 && monthsData[i].rate !== 0) {
                                last3Rates.push(monthsData[i].rate);
                            }
                        }

                        const avg3 = last3Rates.length > 0 ? last3Rates.reduce((a,b)=>a+b, 0) / last3Rates.length : 0;

                        upcomingReadjustment = {
                            adjustMonth: String(emMonth + 1).padStart(2, '0') + '/' + y,
                            baseMonth: String(targetBaseMonth).padStart(2, '0') + '/' + targetBaseYear,
                            totalAccumulated: (currentAccumulated - 1) * 100,
                            monthsData: monthsData,
                            avg3: avg3
                        };
                    }
                    continue;
                }
                
                let accMultiplier = 1;
                let hasFullData = true;
                
                // Acumulado de 12 meses finalizando no targetBaseMonth
                for (let i = 0; i < 12; i++) {
                    let m = targetBaseMonth - i;
                    let yCalc = targetBaseYear;
                    while (m <= 0) {
                        m += 12;
                        yCalc -= 1;
                    }
                    const k = `${yCalc}-${String(m).padStart(2, '0')}`;
                    if (monthlyRates[k] !== undefined) {
                        accMultiplier *= (1 + (monthlyRates[k] / 100));
                    } else {
                        hasFullData = false;
                        break;
                    }
                }

                if (hasFullData) {
                    const adjustDate = `${y}-${String(emMonth + 1).padStart(2, '0')}-01`;
                    const pct = (accMultiplier - 1) * 100;

                    let beforeInst = null;
                    let afterInst = null;

                    // Antes/Depois: usar todas as parcelas com valor de face.
                    // Parcelas de acordo (REAL) não definem o indexador do CT, mas ainda
                    // entram no comparativo calendário (ex.: dez → jan no aniversário).
                    const nonAcordo = allInstallments.filter(i => !i.acordoSemRepactuacao);
                    const adjustableInst = nonAcordo.filter(i => !isRealIndexer(i.indexerId, i.indexerName));
                    let validInstallments = adjustableInst.length ? adjustableInst : nonAcordo;
                    if (!validInstallments.length) validInstallments = allInstallments;

                    const adjustDateStart = new Date(Date.UTC(y, emMonth, 1));
                    let pair = pickBeforeAfterForAdjust(validInstallments, adjustDateStart, pct);
                    // Se o pool "limpo" não achou dez/jan, tenta o histórico completo do título
                    if ((!pair.beforeInst || !pair.afterInst) && validInstallments !== allInstallments) {
                        pair = pickBeforeAfterForAdjust(allInstallments, adjustDateStart, pct);
                    }
                    beforeInst = pair.beforeInst;
                    afterInst = pair.afterInst;

                    let appliedPct = null;
                    let isValidated = false;
                    let noDeflation = false;
                    
                    if (beforeInst && afterInst && beforeInst.value > 0) {
                        appliedPct = (afterInst.value / beforeInst.value - 1) * 100;
                        // Regra contratual: acumulado negativo não deflaciona — parcela mantém o valor (0%).
                        if (pct < -0.0001 && Math.abs(appliedPct) < 0.05) {
                            isValidated = true;
                            noDeflation = true;
                        } else if (Math.abs(appliedPct - pct) < 0.05) {
                            isValidated = true; // Margem de erro de arredondamento
                        }
                    }
                    
                    correctionMap[adjustDate] = {
                        correctionDate: adjustDate,
                        bcbPercentage: pct,
                        appliedPercentage: appliedPct,
                        isValidated: isValidated,
                        noDeflation: noDeflation,
                        valueBefore: beforeInst ? beforeInst.value : null,
                        valueAfter: afterInst ? afterInst.value : null,
                        idBefore: beforeInst ? (beforeInst.number != null ? beforeInst.number : beforeInst.id) : null,
                        idAfter: afterInst ? (afterInst.number != null ? afterInst.number : afterInst.id) : null,
                        indexerDescription: indexerName,
                        baseDateDesc: `${String(targetBaseMonth).padStart(2,'0')}/${targetBaseYear}`
                    };
                }
            }
            
            // Ordenar decrescente e pegar as últimas 5 repactuações
            const sortedDates = Object.keys(correctionMap).sort((a, b) => new Date(b) - new Date(a));
            const ultimas5 = sortedDates.slice(0, 5);
            data = ultimas5.map(d => correctionMap[d]);

            const meta = {
                emissionDate: emDate.toLocaleDateString('pt-BR', {timeZone: 'UTC'}),
                emissionMonthName: emDate.toLocaleDateString('pt-BR', {month:'long', timeZone: 'UTC'}),
                indexerId: indexerId,
                indexerName: indexerName,
                retro: retro,
                baseMonthName: new Date(Date.UTC(emYear, emMonth + retro, 1)).toLocaleDateString('pt-BR', {month:'long', timeZone: 'UTC'}),
                upcoming: upcomingReadjustment,
                acordoParcelCount: acordoParcelCount,
                adjustParcelCount: picked.adjustCount
            };
            
            renderRepactuacoes(data, meta);
        }
        
        loadingEl.style.display = "none";
        resultsEl.style.display = "block";
        
    } catch (err) {
        console.error("Erro ao carregar repactuações:", err);
        loadingEl.style.display = "none";
        resultsEl.style.display = "block";
        resultsEl.innerHTML = `<div style="padding: 20px; background: #fee2e2; color: #991b1b; border-radius: 8px; border: 1px solid #fca5a5;">
            <i data-lucide="alert-circle" style="width: 16px; margin-right: 6px; vertical-align: middle;"></i>
            <strong>Erro:</strong> ${err.message}
        </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function renderRepactuacoes(historico, meta) {
    const resultsEl = document.getElementById("repactuacoes-results");
    
    if (!meta || !historico) {
        resultsEl.innerHTML = `<div style="padding: 20px; color: #64748b; text-align: center; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <i data-lucide="info" style="width: 20px; height: 20px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;"></i>
            Não foi possível carregar as informações do contrato ou indexador.
        </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let explanationHtml = "";
    const hasAdjusting = Number(meta.adjustParcelCount) > 0;
    const isReal = !hasAdjusting && (String(meta.indexerId) === "0" || String(meta.indexerName || "").toUpperCase() === "REAL");
    const acordoN = Number(meta.acordoParcelCount) || 0;
    
    if (isReal) {
        explanationHtml = `
            <div style="flex: 1; padding-left: 20px; border-left: 1px solid #cbd5e1; font-size: 0.85rem; color: #475569; line-height: 1.4;">
                <i data-lucide="alert-circle" style="width: 14px; margin-right: 4px; vertical-align: middle; color: #eab308;"></i>
                Este contrato não possui reajuste anual configurado (Indexador: <strong>REAL</strong>). As parcelas permanecem fixas conforme a emissão.
            </div>
        `;
    } else {
        const acordoNote = acordoN
            ? ` ${acordoN} parcela(s) de acordo estão com indexador <strong>0 / REAL</strong> e não entram na repactuação.`
            : "";
        explanationHtml = `
            <div style="flex: 1; padding-left: 20px; border-left: 1px solid #cbd5e1; font-size: 0.85rem; color: #475569; line-height: 1.4;">
                <i data-lucide="info" style="width: 14px; margin-right: 4px; vertical-align: middle; color: #10b981;"></i>
                A data base do indexador <strong>${meta.indexerName}</strong> é <strong>${meta.retro} meses</strong> da data da venda, ou seja, reajustará em <strong>${meta.emissionMonthName}</strong> (mês da venda), mas com o <strong>${meta.indexerName}</strong> acumulado de 12 meses até <strong>${meta.baseMonthName}</strong>.${acordoNote}
            </div>
        `;
    }

    let html = `
    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <div style="display: flex; gap: 30px; align-items: center;">
            <div style="text-align: center;">
                <span style="color: #64748b; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Data da Venda</span><br>
                <strong style="color: #0f172a; font-size: 1.1rem;">${meta.emissionDate}</strong>
            </div>
            <div style="text-align: center;">
                <span style="color: #64748b; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Indexador</span><br>
                <strong style="color: #0f172a; font-size: 1.1rem; background: #e2e8f0; padding: 3px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
                    ${meta.indexerId} - ${meta.indexerName}
                    <i data-lucide="help-circle" style="width: 15px; height: 15px; color: #0ea5e9; cursor: pointer;" title="Como funciona o cálculo?" onclick="alert('O que é o ${meta.indexerName} e como é calculado?\\n\\nO ${meta.indexerName} é o índice que mede a variação de preços (inflação) no período. No aniversário do contrato, a parcela é reajustada para repor essa perda do poder de compra.\\n\\nCálculo: Acumulamos o percentual da inflação de cada um dos últimos 12 meses da data base. Ex: se o acumulado deu 5%, uma parcela de R$ 1.000 passará a ser R$ 1.050.')"></i>
                </strong>
            </div>
            ${explanationHtml}
        </div>
    </div>
    `;

    if (!isReal && meta.upcoming) {
        const isComplete = meta.upcoming.monthsData[11].rate !== 0; // O último mês cronológico
        let textExplicativo = "";
        if (isComplete) {
            textExplicativo = `Estamos em <strong>${new Date().toLocaleDateString('pt-BR', {month:'long'})}</strong>. Este contrato será repactuado em <strong>${new Date(meta.upcoming.adjustMonth.split('/')[1], meta.upcoming.adjustMonth.split('/')[0]-1).toLocaleDateString('pt-BR', {month:'long'})}</strong>, mas como a data base é <strong>${new Date(meta.upcoming.baseMonth.split('/')[1], meta.upcoming.baseMonth.split('/')[0]-1).toLocaleDateString('pt-BR', {month:'long'})}</strong>, o índice do período já está fechado. Veja a formação do acumulado abaixo:`;
        } else {
            textExplicativo = `Estamos em <strong>${new Date().toLocaleDateString('pt-BR', {month:'long'})}</strong> e o contrato será repactuado em <strong>${new Date(meta.upcoming.adjustMonth.split('/')[1], meta.upcoming.adjustMonth.split('/')[0]-1).toLocaleDateString('pt-BR', {month:'long'})}</strong>. O índice acumulado <strong>ainda está em apuração</strong>, pois falta o fechamento oficial de um ou mais meses da data base. O valor abaixo é apenas uma projeção parcial.`;
        }

        const barBg = isComplete ? '#dcfce7' : '#fef3c7';
        const barBorder = isComplete ? '#bbf7d0' : '#fde68a';
        const barTextColor = isComplete ? '#166534' : '#92400e';
        const barStrongColor = isComplete ? '#14532d' : '#78350f';
        const projTextColor = isComplete ? '#15803d' : '#d97706';
        const projectionLabel = isComplete ? 'Projeção do Reajuste' : 'Projeção Parcial';

        html += `
        <div style="margin-bottom: 25px; border: 1px solid ${barBorder}; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: ${barBg}; color: ${barTextColor}; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 1.05rem; color: ${barStrongColor};">Próxima Repactuação: ${meta.upcoming.adjustMonth}</strong><br>
                    <span style="font-size: 0.8rem; color: ${barTextColor};">Mês Base para Cálculo: ${meta.upcoming.baseMonth}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.8rem; color: ${barTextColor};">${projectionLabel}</span><br>
                    <strong style="font-size: 1.3rem; color: ${projTextColor};">${meta.upcoming.totalAccumulated.toFixed(4).replace('.', ',')}%</strong>
                </div>
            </div>
            
            <div style="padding: 15px; background: white;">
                <p style="margin-top: 0; font-size: 0.85rem; color: #475569; margin-bottom: 15px; line-height: 1.4; padding: 10px; background: ${isComplete ? '#f0fdf4' : '#fffbeb'}; border-left: 3px solid ${isComplete ? '#22c55e' : '#f59e0b'}; border-radius: 4px;">
                    ${textExplicativo}
                </p>
                
                <table style="width: 60%; min-width: 400px; border-collapse: collapse; font-size: 0.8rem; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 6px; text-align: left; color: #166534; font-weight: 700;">MÊS/ANO</th>
                            <th style="padding: 6px; text-align: center; color: #166534; font-weight: 700;">TAXA MENSAL</th>
                            <th style="padding: 6px; text-align: right; background: #fff7ed; color: #c2410c; font-weight: 700;">ACUM. 12 MESES (%)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        const reversedMonths = [...meta.upcoming.monthsData].reverse();
        reversedMonths.forEach((m, idx) => {
            const parts = m.monthYear.split('-');
            const mName = new Date(parts[0], parseInt(parts[1])-1, 1).toLocaleDateString('pt-BR', {month:'short'}).toLowerCase();
            const dateStr = `${mName}/${parts[0]}`;
            let rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            let extraStyle = '';
            let valColor = '#334155';
            let acumBg = '#fff7ed';
            if (m.rate === 0) {
                rowBg = '#fffbeb';
                extraStyle = 'animation: pulse-bg 1.5s infinite; border-left: 3px solid #f59e0b;';
                valColor = '#d97706';
                acumBg = '#fef3c7';
            }
            
            html += `
                        <tr style="border-bottom: 1px solid #f1f5f9; background: ${rowBg}; ${extraStyle}">
                            <td style="padding: 5px 10px; color: #475569;">${dateStr}</td>
                            <td style="padding: 5px 10px; text-align: center; font-weight: 600; color: ${valColor};">${m.rate === 0 ? 'Indisponível' : m.rate.toFixed(4).replace('.', ',') + '%'}</td>
                            <td style="padding: 5px 10px; text-align: right; background: ${acumBg}; font-weight: bold; color: #c2410c;">${m.rate === 0 ? 'Indisponível' : m.accumulated.toFixed(4).replace('.', ',') + '%'}</td>
                        </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
                <style>@keyframes pulse-bg { 0% { background-color: #fffbeb; } 50% { background-color: #fef3c7; } 100% { background-color: #fffbeb; } }</style>
            </div>
        </div>
        `;
    }

    if (isReal) {
        resultsEl.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (!historico || historico.length === 0) {
        html += `<div style="padding: 20px; color: #64748b; text-align: center; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <i data-lucide="check-square" style="width: 20px; height: 20px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; color: #94a3b8;"></i>
            Nenhuma repactuação histórica consolidada encontrada (ou o contrato ainda não completou 1 ano).
        </div>`;
        resultsEl.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }
    
    html += `
    <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Histórico de Reajustes Aplicados</h4>
    <table class="custom-table" style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
        <thead>
            <tr>
                <th style="background: #f1f5f9; padding: 8px; border-bottom: 2px solid var(--color-primary); text-align: left; color: #475569; font-weight: 600;">Data Repact.</th>
                <th style="background: #f1f5f9; padding: 8px; border-bottom: 2px solid var(--color-primary); text-align: center; color: #475569; font-weight: 600;">Antes / Depois</th>
                <th style="background: #f1f5f9; padding: 8px; border-bottom: 2px solid var(--color-primary); text-align: center; color: #475569; font-weight: 600;">% BCB Oficial</th>
                <th style="background: #f1f5f9; padding: 8px; border-bottom: 2px solid var(--color-primary); text-align: center; color: #15803d; font-weight: 700;">% APLICADO</th>
                <th style="background: #f1f5f9; padding: 8px; border-bottom: 2px solid var(--color-primary); text-align: center; color: #475569; font-weight: 600;">Status</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    historico.forEach((item, idx) => {
        const dataFormatada = new Date(item.correctionDate + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
        
        let parcelasHtml = `<span style="color: #94a3b8; font-style: italic; font-size: 0.7rem;">Indisponível</span>`;
        if (item.valueBefore !== null && item.valueAfter !== null) {
            const formatMoney = val => val.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            parcelasHtml = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.2;">
                    <span style="font-size: 0.7rem; color: #64748b; font-weight: 600;">Parc. ${item.idBefore} ➔ ${item.idAfter}</span>
                    <span style="white-space: nowrap;"><strike style="color: #ef4444; font-size: 0.75rem;">R$ ${formatMoney(item.valueBefore)}</strike> &nbsp;<strong style="color: #10b981; font-size: 0.85rem;">R$ ${formatMoney(item.valueAfter)}</strong></span>
                </div>
            `;
        }

        const bcbPct = `<span style="color: #475569;">${item.bcbPercentage.toFixed(4).replace('.', ',')}%</span>`;
        const appliedPct = item.appliedPercentage !== null ? `<strong style="color: #15803d; font-size: 0.9rem;">${item.appliedPercentage.toFixed(4).replace('.', ',')}%</strong>` : '<span style="color: #94a3b8;">-</span>';
        
        let statusHtml = '<span style="color: #94a3b8; font-size: 0.75rem;">N/A</span>';
        if (item.appliedPercentage !== null) {
            if (item.isValidated) {
                const label = item.noDeflation
                    ? 'VALIDADO · sem deflação'
                    : 'VALIDADO';
                statusHtml = `<span style="background: #dcfce7; color: #166534; padding: 3px 6px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; white-space: nowrap;"><i data-lucide="check-circle" style="width: 10px; height: 10px; margin-right: 2px; vertical-align: -1px;"></i> ${label}</span>`;
            } else {
                statusHtml = `<span style="background: #fee2e2; color: #991b1b; padding: 3px 6px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; white-space: nowrap;"><i data-lucide="alert-triangle" style="width: 10px; height: 10px; margin-right: 2px; vertical-align: -1px;"></i> DIVERGENTE</span>`;
            }
        }

        const rowBg = idx % 2 === 0 ? '#fff' : '#f8fafc';
        
        html += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${rowBg};">
                <td style="padding: 10px 8px; color: #334155; font-weight: 600; line-height: 1.2;">
                    ${dataFormatada}<br>
                    <span style="font-size: 0.65rem; color: #64748b; font-weight: normal;">Base BCB: ${item.baseDateDesc}</span>
                </td>
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle;">
                    ${parcelasHtml}
                </td>
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle;">
                    ${bcbPct}
                </td>
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle; background: #f0fdf4;">
                    ${appliedPct}
                </td>
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle;">
                    ${statusHtml}
                </td>
            </tr>
        `;
    });
    
    html += `
        </tbody>
    </table>
    <div style="margin-top: 15px; font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
        <i data-lucide="info" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle; color: #0ea5e9;"></i>
        A margem de aceitação entre o BCB oficial e o % aplicado nas parcelas (arredondamento) é de 0,05%.
        Quando o acumulado do período é <strong>negativo</strong>, a regra do contrato é <strong>não deflacionar</strong> — parcela mantém o valor (% aplicado = 0%) e isso também é considerado validado.
    </div>
    `;
    
    resultsEl.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
