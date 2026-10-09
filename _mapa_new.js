window.extractSaleBrokerId = function(sale) {
    if (!sale) return "";
    const list = sale.brokers || sale.salesContractBrokers || [];
    if (!Array.isArray(list) || !list.length) return "";
    const main = list.find(b => b && (b.main === true || b.main === "S")) || list[0];
    const id = main && (main.id != null ? main.id : (main.brokerId != null ? main.brokerId : main.creditorId));
    return id != null && id !== "" ? String(id) : "";
};

/** Corretor do contrato = credor no Sienge (GET /creditors/{id}). */
window.resolveBrokerCreditorNames = async function(ids) {
    if (!window._brokerNameCache) {
        try { window._brokerNameCache = JSON.parse(localStorage.getItem("crm_broker_names_v1") || "{}") || {}; }
        catch (e) { window._brokerNameCache = {}; }
    }
    const cache = window._brokerNameCache;
    const todo = [...new Set((ids || []).filter(Boolean).map(String))].filter(id => !cache[id]);
    let cursor = 0;
    const worker = async () => {
        while (cursor < todo.length) {
            const id = todo[cursor++];
            try {
                const c = await siengeFetchWithRetry(`/creditors/${encodeURIComponent(id)}`);
                const name = String((c && (c.name || c.tradeName || c.fantasyName)) || "").trim();
                if (name) cache[id] = name;
            } catch (e) {
                console.warn("Mapa 0% pago: corretor/credor não encontrado", id, e);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
    try { localStorage.setItem("crm_broker_names_v1", JSON.stringify(cache)); } catch (e) {}
    return cache;
};

window.gerarMapaZeropaidPDF = async function() {
    const zeroList = (window.zeroPaidList && window.zeroPaidList.length) ? window.zeroPaidList : [];
    const zeroKeys = new Set(zeroList.map(c => `${c.customerId}-${c.saleId}`));
    const opFilter = window.activeZeroOperatorFilter
        || (typeof activeZeroOperatorFilter !== "undefined" ? activeZeroOperatorFilter : "TODOS");
    const normOp = (v) => (typeof window.normalizeOperatorName === "function")
        ? window.normalizeOperatorName(v)
        : String(v || "").toUpperCase();
    const webroList = (window.rawClientList || []).filter(c => {
        if (!c || zeroKeys.has(`${c.customerId}-${c.saleId}`) || c.isZeroPaid) return false;
        const subj = typeof window.clientIsSubjudice === "function"
            ? window.clientIsSubjudice(c)
            : (c.subjudice === "S" || c.subjudice === true);
        if (subj) return false;
        if (typeof window.clientHasPagamentoEntradaWebro !== "function" || !window.clientHasPagamentoEntradaWebro(c)) return false;
        if (opFilter && opFilter !== "TODOS" && normOp(c.assignedOperator) !== normOp(opFilter)) return false;
        return true;
    });
    if (!zeroList.length && !webroList.length) {
        alert("Não há clientes 0% pago nem pagando entrada Webro para gerar o mapa.");
        return;
    }

    const btn = document.getElementById("btn-gerar-mapa-zeropaid");
    const oldHtml = btn ? btn.innerHTML : "";
    const restoreBtn = () => {
        if (!btn) return;
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    };
    if (btn) {
        const lockedWidth = Math.max(btn.offsetWidth, 188);
        btn.style.minWidth = lockedWidth + "px";
        btn.style.width = lockedWidth + "px";
        btn.innerHTML = `<span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;flex-shrink:0;"></span>`;
        btn.disabled = true;
    }

    const yieldUI = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 40)));
    await yieldUI();

    let container = null;
    try {
        const all = zeroList.concat(webroList);
        const mergeSaleIntoClient = (c, saleObj) => {
            if (!saleObj) return;
            if (!c.saleDate && (saleObj.saleDate || saleObj.contractDate)) c.saleDate = saleObj.saleDate || saleObj.contractDate;
            const bid = window.extractSaleBrokerId(saleObj);
            if (bid) c.brokerId = bid;
            const bn = window.extractSaleBrokerName(saleObj);
            if (bn) c.brokerName = bn;
        };
        all.forEach(c => mergeSaleIntoClient(c, window.matchZeroPaidSale(c)));

        const needFetch = all.filter(c => c && c.customerId && (!c.saleDate || (!c.brokerId && !c.brokerName)));
        const fetchIds = [...new Set(needFetch.map(c => c.customerId))];
        if (fetchIds.length && typeof SiengeApiService !== "undefined" && typeof SiengeApiService.getSales === "function") {
            const batchSize = 6;
            for (let i = 0; i < fetchIds.length; i += batchSize) {
                const batch = fetchIds.slice(i, i + batchSize);
                await Promise.all(batch.map(async (custId) => {
                    try {
                        const sales = await SiengeApiService.getSales(custId);
                        if (!window.AppState.sales) window.AppState.sales = [];
                        sales.forEach(s => {
                            const idx = window.AppState.sales.findIndex(xs => String(xs.id) === String(s.id));
                            if (idx >= 0) window.AppState.sales[idx] = s;
                            else window.AppState.sales.push(s);
                        });
                        needFetch.filter(c => String(c.customerId) === String(custId)).forEach(c => {
                            mergeSaleIntoClient(c, window.matchZeroPaidSale(c, sales) || sales[0]);
                        });
                    } catch (err) {
                        console.warn("Mapa 0% pago: falha ao buscar contrato", custId, err);
                    }
                }));
                await yieldUI();
            }
        }

        const brokerIds = all.map(c => c.brokerId).filter(Boolean);
        const brokerNames = brokerIds.length ? await window.resolveBrokerCreditorNames(brokerIds) : {};
        all.forEach(c => {
            if (c.brokerId && brokerNames[c.brokerId]) c.brokerName = brokerNames[c.brokerId];
        });

        const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[ch]));
        const fmtInt = (val) => Math.round(Number(val) || 0).toLocaleString("pt-BR");
        const clientValue = (c) => (c.overdueValue || 0) + (c.overdueCharges || 0);
        const titleCount = (c) => (c.billIds && c.billIds.length) ? c.billIds.length : 1;
        const empLabel = (ccId) => {
            const id = typeof getPrimaryCostCenter === "function" ? getPrimaryCostCenter(ccId) : String(ccId || "N/D");
            const rawName = (typeof getCostCenterName === "function" ? getCostCenterName(ccId) : "") || "";
            const clean = String(rawName).replace(/^(?:C\.C\.\s*)?(?:\d+\s*-\s*)+/i, "").trim();
            return String(clean || rawName || "N/D").toUpperCase();
        };
        const parseSale = (c) => {
            if (!c || !c.saleDate) return null;
            const d = parseSafeDate(c.saleDate);
            if (!d || isNaN(d.getTime()) || d.getTime() < 24 * 3600 * 1000) return null;
            return d;
        };

        const now = new Date();
        const pad2 = n => String(n).padStart(2, "0");
        const monthKeys = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthKeys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
        }
        const recencyDefs = [
            { label: "Até 30 dias", max: 30 },
            { label: "31 a 90 dias", max: 90 },
            { label: "91 a 180 dias", max: 180 },
            { label: "6 a 12 meses", max: 365 },
            { label: "Mais de 1 ano", max: Infinity },
            { label: "Sem data de venda", max: null }
        ];

        const stats = (list) => {
            const s = { value: 0, titles: 0, clients: new Set(), delaySum: 0, delayN: 0, ageSum: 0, ageN: 0,
                months: Object.fromEntries(monthKeys.map(k => [k, 0])), older: 0, noDate: 0, recency: recencyDefs.map(() => 0) };
            list.forEach(c => {
                s.value += clientValue(c);
                s.titles += titleCount(c);
                s.clients.add(String(c.customerId));
                if (c.maxDaysDelay > 0) { s.delaySum += c.maxDaysDelay; s.delayN++; }
                const d = parseSale(c);
                if (!d) { s.noDate++; s.recency[5]++; return; }
                const days = Math.max(0, Math.round((now - d) / 86400000));
                s.ageSum += days; s.ageN++;
                const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
                if (s.months[key] != null) s.months[key]++; else s.older++;
                const idx = recencyDefs.findIndex(r => r.max != null && days <= r.max);
                s.recency[idx >= 0 ? idx : 4]++;
            });
            const avgAge = s.ageN ? Math.round(s.ageSum / s.ageN) : 0;
            s.clientsN = s.clients.size;
            s.avgDelay = s.delayN ? Math.round(s.delaySum / s.delayN) : 0;
            s.avgSaleLabel = !s.ageN ? "N/D" : (avgAge < 60 ? `${avgAge} dias` : `${Math.round(avgAge / 30)} meses`);
            return s;
        };
        const sz = stats(zeroList);
        const sw = stats(webroList);

        const C_ZERO = "#334155";
        const C_WEB = "#94a3b8";
        const C_HEAD = "#1e293b";
        const zebra = (i) => i % 2 === 0 ? "#fff" : "#f8fafc";
        const ellipsisTd = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        const dot = (color) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:4px;vertical-align:middle;"></span>`;

        const chartSlots = monthKeys.map(k => ({ label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, z: sz.months[k], w: sw.months[k] }));
        if (sz.older || sw.older) chartSlots.unshift({ label: "Antes", z: sz.older, w: sw.older });
        if (sz.noDate || sw.noDate) chartSlots.push({ label: "S/ data", z: sz.noDate, w: sw.noDate });

        const groupedBarChart = (slots) => {
            const maxVal = Math.max(1, ...slots.map(s => Math.max(s.z, s.w)));
            const W = 640, H = 150, padTop = 16, padBot = 20, padSide = 10;
            const stepX = (W - padSide * 2) / Math.max(slots.length, 1);
            const barW = Math.min(14, Math.max(6, stepX * 0.32));
            let out = "";
            slots.forEach((s, i) => {
                const cx = padSide + stepX * i + stepX / 2;
                [[s.z, C_ZERO, -barW / 2 - 1], [s.w, C_WEB, barW / 2 + 1]].forEach(([v, color, off]) => {
                    const x = cx + off;
                    const h = (v / maxVal) * (H - padTop - padBot);
                    const y = H - padBot - h;
                    out += `<rect x="${x - barW / 2}" y="${y}" width="${barW}" height="${Math.max(h, 1)}" fill="${v ? color : "#e2e8f0"}" rx="2"/>`;
                    if (v) out += `<text x="${x}" y="${y - 3}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#334155">${v}</text>`;
                });
                out += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="7" fill="#64748b">${s.label}</text>`;
            });
            return `<svg width="${W}" height="${H}" style="overflow:visible;display:block;">
                <line x1="0" y1="${H - padBot}" x2="${W}" y2="${H - padBot}" stroke="#e2e8f0" stroke-width="1.5"/>${out}
            </svg>`;
        };

        const th = (label, align, extra) => `<th style="text-align:${align || "left"};padding:4px 6px;font-size:8px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;${extra || ""}">${label}</th>`;
        const totalTd = (v, align) => `<td style="padding:5px 6px;border-top:2px solid #cbd5e1;text-align:${align || "center"};font-weight:800;color:${C_HEAD};">${v}</td>`;

        const recencyTable = `
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px;">
                <colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
                <thead><tr style="background:${C_HEAD};">${th("Quando comprou")}${th("0% pago", "center")}${th("Entrada", "center")}${th("Total", "center")}</tr></thead>
                <tbody>
                    ${recencyDefs.map((r, i) => `<tr style="background:${zebra(i)};">
                        <td style="padding:4px 6px;font-weight:700;color:#334155;">${esc(r.label)}</td>
                        <td style="padding:4px 6px;text-align:center;font-weight:800;color:${C_ZERO};">${sz.recency[i]}</td>
                        <td style="padding:4px 6px;text-align:center;font-weight:700;color:#64748b;">${sw.recency[i]}</td>
                        <td style="padding:4px 6px;text-align:center;font-weight:800;">${sz.recency[i] + sw.recency[i]}</td>
                    </tr>`).join("")}
                    <tr style="background:#f1f5f9;">${totalTd("Total", "left")}${totalTd(zeroList.length)}${totalTd(webroList.length)}${totalTd(zeroList.length + webroList.length)}</tr>
                </tbody>
            </table>`;

        const combine = (keyFn, labelFn) => {
            const map = {};
            const add = (list, side) => list.forEach(c => {
                const k = keyFn(c);
                if (!map[k]) map[k] = { key: k, ...labelFn(c), z: { cl: new Set(), t: 0 }, w: { cl: new Set(), t: 0 } };
                map[k][side].cl.add(String(c.customerId));
                map[k][side].t += titleCount(c);
            });
            add(zeroList, "z");
            add(webroList, "w");
            return Object.values(map).map(r => ({ ...r, zc: r.z.cl.size, zt: r.z.t, wc: r.w.cl.size, wt: r.w.t }))
                .sort((a, b) => (b.zc + b.wc) - (a.zc + a.wc) || (b.zt + b.wt) - (a.zt + a.wt));
        };
        const capRows = (rows, max, otherLabel) => {
            if (rows.length <= max) return rows;
            const rest = rows.slice(max - 1);
            const sum = (k) => rest.reduce((s, r) => s + r[k], 0);
            return rows.slice(0, max - 1).concat([{ id: "", name: `${otherLabel} (${rest.length})`, isOther: true, zc: sum("zc"), zt: sum("zt"), wc: sum("wc"), wt: sum("wt") }]);
        };
        const ccIdOf = (c) => (typeof getPrimaryCostCenter === "function" ? getPrimaryCostCenter(c.costCenterId) : c.costCenterId) || "N/D";
        const empRows = capRows(combine(ccIdOf, c => ({ id: ccIdOf(c), name: empLabel(c.costCenterId) })), 16, "OUTROS EMPREENDIMENTOS");
        const brokerRows = capRows(combine(
            c => c.brokerId ? `id:${c.brokerId}` : (c.brokerName ? `n:${String(c.brokerName).trim().toUpperCase()}` : "sem"),
            c => ({
                id: c.brokerId || "",
                name: c.brokerName ? String(c.brokerName).trim().toUpperCase() : (c.brokerId ? `CREDOR ${c.brokerId}` : "SEM CORRETOR NO CONTRATO"),
                isOther: !c.brokerId && !c.brokerName
            })
        ), 16, "OUTROS CORRETORES");

        const zt = sz.titles, wt = sw.titles;
        const splitTable = (rows, firstCols, firstHeads, emptyMsg) => `
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px;">
                <colgroup>${firstCols}<col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"></colgroup>
                <thead>
                    <tr style="background:${C_HEAD};">${firstHeads.map(h => th(h[0], h[1], "vertical-align:bottom;")).join("")}
                        ${th(`${dot(C_ZERO)}0% pago`, "center", "border-left:1px solid #475569;")}${th("", "center")}
                        ${th(`${dot(C_WEB)}Entrada`, "center", "border-left:1px solid #475569;")}${th("", "center")}</tr>
                    <tr style="background:#334155;">${firstHeads.map(() => th("")).join("")}
                        ${th("Clientes", "center", "border-left:1px solid #475569;")}${th("Títulos", "center")}
                        ${th("Clientes", "center", "border-left:1px solid #475569;")}${th("Títulos", "center")}</tr>
                </thead>
                <tbody>
                    ${rows.map((r, i) => `<tr style="background:${zebra(i)};">
                        ${r.cells}
                        <td style="padding:4px 6px;text-align:center;font-weight:800;color:${C_ZERO};border-left:1px solid #e2e8f0;">${r.zc || "-"}</td>
                        <td style="padding:4px 6px;text-align:center;color:${C_ZERO};">${r.zt || "-"}</td>
                        <td style="padding:4px 6px;text-align:center;font-weight:700;color:#64748b;border-left:1px solid #e2e8f0;">${r.wc || "-"}</td>
                        <td style="padding:4px 6px;text-align:center;color:#64748b;">${r.wt || "-"}</td>
                    </tr>`).join("") || `<tr><td colspan="${firstHeads.length + 4}" style="padding:12px;text-align:center;color:#94a3b8;">${emptyMsg}</td></tr>`}
                    <tr style="background:#f1f5f9;">
                        <td colspan="${firstHeads.length}" style="padding:5px 6px;border-top:2px solid #cbd5e1;font-weight:800;color:${C_HEAD};">Total</td>
                        ${totalTd(sz.clientsN)}${totalTd(zt)}${totalTd(sw.clientsN)}${totalTd(wt)}
                    </tr>
                </tbody>
            </table>`;

        const empTable = splitTable(
            empRows.map(r => ({ ...r, cells: `
                <td style="padding:4px 6px;text-align:center;color:#64748b;">${esc(r.id)}</td>
                <td style="padding:4px 6px;${ellipsisTd}font-weight:700;color:${r.isOther ? "#64748b" : "#1e293b"};" title="${esc(r.name)}">${esc(r.name)}</td>` })),
            `<col style="width:12%"><col style="width:44%">`,
            [["ID", "center"], ["Empreendimento"]],
            "Sem dados"
        );
        const brokerTable = splitTable(
            brokerRows.map(r => ({ ...r, cells: `
                <td style="padding:4px 6px;text-align:center;color:#64748b;">${esc(r.id || "-")}</td>
                <td style="padding:4px 6px;${ellipsisTd}font-weight:700;color:${r.isOther ? "#64748b" : "#1e293b"};" title="${esc(r.name)}">${esc(r.name)}</td>` })),
            `<col style="width:12%"><col style="width:44%">`,
            [["ID credor", "center"], ["Corretor"]],
            "Sem corretores no contrato"
        );

        const kpi = (label, value) => `
            <div style="flex:1;min-width:0;padding:6px 10px;border-left:1px solid #e2e8f0;">
                <div style="font-size:8px;font-weight:700;color:#64748b;letter-spacing:0.4px;text-transform:uppercase;white-space:nowrap;">${label}</div>
                <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px;white-space:nowrap;">${value}</div>
            </div>`;
        const kpiGroup = (color, title, sub, s) => `
            <div style="flex:1;min-width:0;display:flex;align-items:stretch;background:#fff;border:1px solid #e2e8f0;border-top:3px solid ${color};border-radius:8px;">
                <div style="width:150px;flex-shrink:0;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;">
                    <div style="font-size:10px;font-weight:800;color:${C_HEAD};text-transform:uppercase;letter-spacing:0.3px;">${dot(color)}${title}</div>
                    <div style="font-size:8px;color:#64748b;margin-top:2px;">${sub}</div>
                </div>
                ${kpi("Valor em atraso", fmtInt(s.value))}
                ${kpi("Clientes", s.clientsN)}
                ${kpi("Títulos", s.titles)}
                ${kpi("Desde a venda", s.avgSaleLabel)}
            </div>`;
        const quadro = (title, body, extra) => `
            <div style="min-width:0;min-height:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;${extra || ""}">
                <div style="background:${C_HEAD};color:#fff;padding:6px 10px;font-weight:800;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;">${esc(title)}</div>
                <div style="flex:1;min-height:0;padding:6px 8px;overflow:hidden;">${body}</div>
            </div>`;

        const legend = `<div style="display:flex;gap:14px;justify-content:center;font-size:8px;font-weight:700;color:#475569;margin-bottom:2px;">
            <span>${dot(C_ZERO)}0% pago</span><span>${dot(C_WEB)}Pagando entrada (boleto Webro)</span></div>`;
        const saleBand = `
            <div style="display:flex;gap:12px;height:100%;align-items:stretch;">
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;">
                    <div style="font-size:8px;font-weight:800;color:#475569;text-transform:uppercase;text-align:center;">Vendas nos últimos 12 meses</div>
                    ${legend}
                    ${groupedBarChart(chartSlots)}
                </div>
                <div style="width:330px;flex-shrink:0;">${recencyTable}</div>
            </div>`;

        const nowLabel = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        const logoUrl = "https://yt3.googleusercontent.com/rx0DOaXFXLF0HHeZtC_xI7vR23Y7Jxmm7gA6o_emTX6qFNIDo3J91z11ASXDNypT57crV1EPOQ=s900-c-k-c0x00ffffff-no-rj";

        container = document.createElement("div");
        container.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1122px;height:793px;background:#fff;padding:14px 18px;font-family:'Inter','Segoe UI',sans-serif;box-sizing:border-box;display:flex;flex-direction:column;";
        container.id = "mapa-zeropaid-pdf-container";
        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-bottom:8px;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <img src="${logoUrl}" alt="Logo" style="height:32px;object-fit:contain;">
                    <div>
                        <h1 style="margin:0;color:#0f172a;font-size:16px;font-weight:800;">Mapa de início de contrato — 0% pago e entrada Webro</h1>
                        <p style="margin:2px 0 0 0;color:#64748b;font-size:10px;">Posição em: ${nowLabel} · Atraso médio: 0% pago ${sz.avgDelay} dias · entrada Webro ${sw.avgDelay} dias</p>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">
                ${kpiGroup(C_ZERO, "0% pago", "Sem nenhuma receita no contrato", sz)}
                ${kpiGroup(C_WEB, "Pagando entrada", "Entrada em boleto Webro em aberto", sw)}
            </div>
            ${quadro("Quando o cliente comprou o lote", saleBand, "flex-shrink:0;height:196px;margin-bottom:8px;")}
            <div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${quadro("Por empreendimento", empTable)}
                ${quadro("Corretor que fez a venda", brokerTable)}
            </div>
        `;

        document.body.appendChild(container);
        await yieldUI();
        const canvas = await html2canvas(container, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("l", "mm", "a4");
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const props = pdf.getImageProperties(imgData);
        const ratio = props.width / props.height;
        let w = pdfWidth;
        let h = pdfWidth / ratio;
        if (h > pdfHeight) { h = pdfHeight; w = pdfHeight * ratio; }
        pdf.addImage(imgData, "JPEG", (pdfWidth - w) / 2, (pdfHeight - h) / 2, w, h);
        pdf.save("Mapa_Clientes_0_Pago.pdf");
        if (container.parentNode) document.body.removeChild(container);
        restoreBtn();
    } catch (e) {
        console.error("Erro ao gerar mapa 0% pago:", e);
        alert("Ocorreu um erro ao gerar o PDF. Verifique o console.");
        if (container && container.parentNode) document.body.removeChild(container);
        restoreBtn();
    }
};
