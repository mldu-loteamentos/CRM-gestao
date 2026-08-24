window.gerarMapaJuridicoPDF = function() {
    if (!window._subjudiceList || window._subjudiceList.length === 0) {
        alert("Não há clientes no Sub Judice para gerar o mapa.");
        return;
    }

    if (!window.html2canvas || !window.jspdf) {
        alert("Bibliotecas de PDF não carregadas. Tente recarregar a página.");
        return;
    }

    const modal = document.createElement("div");
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: white; z-index: 10000; overflow: auto; font-family: 'Inter', sans-serif;";
    
    const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    const initialRawStages = (window.ConfigApp && window.ConfigApp.juridicalStages) ? window.ConfigApp.juridicalStages : [
        { name: "Notificação", days: 10 },
        { name: "Aguardando Notificação Retornar", days: 5 },
        { name: "Natureza da Ação", days: 10 },
        { name: "Citação", days: 10 },
        { name: "Aguardando Citação Retornar", days: 5 },
        { name: "Defesa", days: 15 },
        { name: "Impugnação", days: 15 },
        { name: "Provas", days: 15 },
        { name: "Alegações Finais", days: 15 },
        { name: "Sentença", days: 30 },
        { name: "Cumprimento de Sentença", days: 15 },
        { name: "Recurso", days: 30 },
        { name: "Execução de Sentença", days: 30 }
    ];

    const existingNormNames = rawStages.map(s => normalizeText(s.name));
    window._subjudiceList.forEach(client => {
        let pName = client.juridicalStageName || client.phaseName;
        if (!pName || pName.trim() === "" || pName.toUpperCase() === "SEM FASE") return;
        const norm = normalizeText(pName);
        if (!existingNormNames.includes(norm)) {
            existingNormNames.push(norm);
            rawStages.push({ name: pName, days: 0 });
        }
    });

    const stages = [];
    stages.push({ prefix: "0", name: "Sem Fase", days: 0 }); // Fase inicial para os que estão vazios
    
    // Auto-numeração
    let currentMain = 1;
    let currentSub = 1;
    
    rawStages.forEach((stage, index) => {
        const isAguardando = stage.name.toUpperCase().includes("AGUARDANDO");
        if (isAguardando && index > 0) {
            stages.push({ prefix: `${currentMain - 1}.${currentSub}`, name: stage.name, days: stage.days });
            currentSub++;
        } else {
            stages.push({ prefix: `${currentMain}`, name: stage.name, days: stage.days });
            currentMain++;
            currentSub = 1;
        }
    });

    const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    // Distribuição dos clientes
    const distributed = stages.map(s => ({ ...s, clients: 0, totalValue: 0 }));

    let totalDelayGlobal = 0;
    let totalValueGlobal = 0;
    let clientsWithDelayGlobal = 0;
    let totalTitlesGlobal = 0;

    window._subjudiceList.forEach(client => {
        let userStageName = client.juridicalStageName || client.phaseName || "SEM FASE";
        // Ajuste específico para propostas de renegociação
        if (userStageName.toUpperCase().includes("PROPOSTA DE RENEGOCIA") || userStageName.toUpperCase().includes("ACORDO QUEBRADO")) {
            userStageName = "SEM FASE"; 
        }

        let matchedIndex = 0; // Default para "0 - Sem Fase"

        const uNorm = normalizeText(userStageName);
        for (let i = 1; i < stages.length; i++) {
            const sNorm = normalizeText(stages[i].name);
            if (uNorm.includes(sNorm) || sNorm.includes(uNorm) || (uNorm === "execucao" && sNorm.includes("execucao"))) {
                matchedIndex = i;
                break;
            }
        }

        // Se encontrou alguma fase processual no nome que contenha traços (ex: Execução - Reintegração), vamos tentar ser espertos
        if (matchedIndex === 0 && uNorm !== "sem fase" && uNorm !== "") {
            const parts = uNorm.split("-");
            for (let part of parts) {
                const pNorm = part.trim();
                const found = stages.findIndex(s => normalizeText(s.name).includes(pNorm));
                if (found > 0) { matchedIndex = found; break; }
            }
        }

        const valor = parseFloat(client.amountUpdated || client.amountUpdatedTotal || 0);
        distributed[matchedIndex].clients++;
        distributed[matchedIndex].totalValue += isNaN(valor) ? 0 : valor;

        totalValueGlobal += isNaN(valor) ? 0 : valor;
        totalTitlesGlobal += (client.titles || []).length || (client.expiredParcels || 0);

        if (client.delayDays && client.delayDays > 0) {
            totalDelayGlobal += client.delayDays;
            clientsWithDelayGlobal++;
        }
    });

    const agingMedio = clientsWithDelayGlobal > 0 ? Math.round(totalDelayGlobal / clientsWithDelayGlobal) : 0;
    const formatBRL = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const todayStr = new Date().toLocaleDateString('pt-BR');

    let boxesHtml = "";
    distributed.forEach((d, idx) => {
        const isActive = d.clients > 0;
        const color = isActive ? "#10b981" : "#cbd5e1";
        const bgColor = isActive ? "#ecfdf5" : "#f8fafc";
        const textColor = isActive ? "#065f46" : "#64748b";
        const valueColor = isActive ? "#ef4444" : "#94a3b8";

        boxesHtml += `
            <div style="flex: 0 0 auto; width: 140px; border: 2px solid ${isActive ? '#10b981' : '#e2e8f0'}; border-radius: 8px; background: white; margin-right: 15px; position: relative; box-shadow: ${isActive ? '0 4px 6px -1px rgba(16, 185, 129, 0.1)' : 'none'};">
                <div style="position: absolute; top: -15px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; width: 30px; height: 30px; border-radius: 15px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white;">
                    ${d.prefix}
                </div>
                <div style="padding: 20px 10px 10px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: ${textColor}; margin-bottom: 5px;">CLIENTES</div>
                    <div style="font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 10px;">${d.clients}</div>
                    <div style="border-top: 1px dashed #e2e8f0; margin: 10px 0;"></div>
                    <div style="font-size: 10px; font-weight: 700; color: ${textColor}; margin-bottom: 5px;">VALOR (R$)</div>
                    <div style="font-size: 13px; font-weight: 800; color: ${valueColor};">${formatBRL(d.totalValue)}</div>
                </div>
            </div>
            ${idx < distributed.length - 1 ? `<div style="flex: 0 0 auto; margin-right: 15px; color: #cbd5e1; display: flex; align-items: center;">➔</div>` : ''}
        `;
    });

    let legendaHtml = distributed.map(d => `
        <div style="display: flex; align-items: center; background: #f8fafc; padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="background: ${d.clients > 0 ? '#10b981' : '#94a3b8'}; color: white; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; margin-right: 8px;">${d.prefix}</div>
            <div style="font-size: 12px; font-weight: 600; color: #334155;">${d.name} <span style="font-weight: 400; color: #64748b;">(${d.days} dias)</span></div>
        </div>
    `).join("");

    modal.innerHTML = `
        <div id="pdf-content-area" style="width: 1500px; padding: 40px; background: white; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
                <div>
                    <h1 style="font-size: 32px; font-weight: 900; color: #0f172a; margin: 0 0 5px 0;">Sprint Diário Jurídico</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 0;">Mapa de clientes em Sub Judice • ${todayStr}</p>
                </div>
                <div style="display: flex; gap: 20px;">
                    <div style="border: 1px solid #e2e8f0; padding: 15px 25px; border-radius: 8px; text-align: center; min-width: 150px;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 5px;">VALOR EM ATRASO</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0f172a;">R$ ${formatBRL(totalValueGlobal)}</div>
                    </div>
                    <div style="border: 1px solid #e2e8f0; padding: 15px 25px; border-radius: 8px; text-align: center; min-width: 120px;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 5px;">CLIENTES EM ATRASO</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0f172a;">${window._subjudiceList.length}</div>
                    </div>
                    <div style="border: 1px solid #e2e8f0; padding: 15px 25px; border-radius: 8px; text-align: center; min-width: 120px;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 5px;">TÍTULOS VENCIDOS</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0f172a;">${totalTitlesGlobal}</div>
                    </div>
                    <div style="border: 1px solid #e2e8f0; padding: 15px 25px; border-radius: 8px; text-align: center; min-width: 120px;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 5px;">ATRASO MÉDIO</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0f172a;">${agingMedio} dias</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; overflow-x: auto; padding: 30px 10px; margin-bottom: 40px;">
                ${boxesHtml}
            </div>

            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                <h3 style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 15px 0;">Legenda das Etapas</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                    ${legendaHtml}
                </div>
            </div>
        </div>
        <div style="position: fixed; bottom: 30px; right: 30px; display: flex; gap: 10px;">
            <button id="btn-cancel-pdf" style="padding: 12px 24px; border: none; border-radius: 8px; background: #e2e8f0; color: #475569; font-weight: bold; cursor: pointer;">Cancelar</button>
            <button id="btn-gerar-pdf" style="padding: 12px 24px; border: none; border-radius: 8px; background: #166534; color: white; font-weight: bold; cursor: pointer;">Baixar PDF</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("btn-cancel-pdf").onclick = () => {
        document.body.removeChild(modal);
    };

    document.getElementById("btn-gerar-pdf").onclick = async () => {
        const btn = document.getElementById("btn-gerar-pdf");
        btn.innerText = "Gerando...";
        btn.disabled = true;
        
        try {
            const element = document.getElementById("pdf-content-area");
            const canvas = await window.html2canvas(element, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new window.jspdf.jsPDF({
                orientation: 'landscape',
                unit: 'pt',
                format: [canvas.width, canvas.height]
            });
            
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`Mapa_Juridico_${todayStr.replace(/\//g, '-')}.pdf`);
            
            document.body.removeChild(modal);
        } catch (e) {
            console.error("Erro PDF:", e);
            alert("Erro ao gerar PDF.");
            btn.innerText = "Baixar PDF";
            btn.disabled = false;
        }
    };
};
