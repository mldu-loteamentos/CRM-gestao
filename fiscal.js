// Controlador do Módulo Fiscal

const FiscalState = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  loading: false,
  results: [],
  totalRevenue: 0,
  totalPis: 0,
  totalCofins: 0,
  totalRetention: 0
};

const FiscalApp = {
  async loadData() {
    FiscalState.loading = true;
    this.render();

    try {
      // Determinar o período
      const startStr = `${FiscalState.year}-${String(FiscalState.month).padStart(2, '0')}-01`;
      const lastDay = new Date(FiscalState.year, FiscalState.month, 0).getDate();
      const endStr = `${FiscalState.year}-${String(FiscalState.month).padStart(2, '0')}-${lastDay}`;

      // Carregar Movimentos Bancários
      let movements = [];
      try {
        movements = await SiengeApiService.getBankMovements(startStr, endStr);
      } catch (e) {
        console.warn("Erro ao buscar bank-movements, pode estar vazio ou timeout:", e);
      }

      // Se usarmos dados mockados (caso a API falhe e tenha mock na data.js)
      if (movements.length === 0 && window.MOCK_DATA && window.MOCK_DATA.BANK_MOVEMENTS) {
        movements = window.MOCK_DATA.BANK_MOVEMENTS.filter(m => m.bankMovementDate && m.bankMovementDate.startsWith(startStr.substring(0, 7)));
      }

      // Carregar empresas geridas pelo grupo
      let managedCompanyIds = new Set();
      const localCustom = localStorage.getItem('crm_empresas_custom');
      if (localCustom) {
        const customData = JSON.parse(localCustom);
        Object.values(customData).forEach(item => {
          if (item.gerida_pelo_grupo === 1 || item.gerida_pelo_grupo === true) {
            managedCompanyIds.add(Number(item.company_id));
          }
        });
      }

      // Carregar parametrizações de impostos (PIS/COFINS)
      let taxConfig = {};
      try { taxConfig = JSON.parse(localStorage.getItem('crm_plano_impostos')) || {}; } catch(e) {}
      const hasTaxConfig = Object.keys(taxConfig).length > 0;

      // Somar Receitas (Movimentos de Entrada) por Empresa E Centro de Custo
      const companyRevenues = {};

      if (movements && movements.length > 0) {
        movements.forEach(mov => {
          const cid = Number(mov.companyId);
          const amount = Number(mov.bankMovementAmount) || 0;
          
          if (amount > 0 && managedCompanyIds.has(cid)) {
            const fc = mov.financialCategories && mov.financialCategories.length > 0 ? mov.financialCategories[0] : null;
            const categoryId = fc ? fc.financialCategoryId : null;
            const ccId = fc && fc.costCenterId ? fc.costCenterId : 'ND';
            const ccName = fc && fc.costCenterName ? fc.costCenterName : 'Sem Centro de Custo Vinculado';

            let isRevenue = false;
            let isDeduction = false;

            if (categoryId && hasTaxConfig) {
               const baseName = taxConfig[categoryId];
               if (baseName === 'Base para Vendas de Lote' || baseName === 'Base para Receita de Serviços' || baseName === 'Base para Aplicações Financeiras') {
                 isRevenue = true;
               } else if (baseName === 'Base de Dedução') {
                 isDeduction = true;
               }
            }

            // Se tem parametrização, só processa o que foi mapeado
            if (hasTaxConfig && !isRevenue && !isDeduction) {
              return; // Ignora esse movimento
            }

            const finalAmount = (hasTaxConfig && isDeduction) ? -Math.abs(amount) : amount;

            if (!companyRevenues[cid]) {
              companyRevenues[cid] = {
                id: cid,
                name: mov.companyName || `Empresa ${cid}`,
                revenue: 0,
                costCenters: {}
              };
            }
            
            companyRevenues[cid].revenue += finalAmount;

            if (!companyRevenues[cid].costCenters[ccId]) {
              companyRevenues[cid].costCenters[ccId] = {
                id: ccId,
                name: ccName,
                revenue: 0
              };
            }
            companyRevenues[cid].costCenters[ccId].revenue += finalAmount;
          }
        });
      }

      // Calcular Impostos
      FiscalState.results = [];
      FiscalState.totalRevenue = 0;
      FiscalState.totalPis = 0;
      FiscalState.totalCofins = 0;
      FiscalState.totalRetention = 0;

      Object.values(companyRevenues).forEach(comp => {
        const pis = comp.revenue * 0.0065; // 0,65%
        const cofins = comp.revenue * 0.03; // 3,00%
        
        const ccList = Object.values(comp.costCenters).map(cc => {
          return {
            ...cc,
            pis: cc.revenue * 0.0065,
            cofins: cc.revenue * 0.03
          };
        });
        
        FiscalState.results.push({
          id: comp.id,
          name: comp.name,
          revenue: comp.revenue,
          pis: pis,
          cofins: cofins,
          total: pis + cofins,
          costCenters: ccList
        });

        FiscalState.totalRevenue += comp.revenue;
        FiscalState.totalPis += pis;
        FiscalState.totalCofins += cofins;
        FiscalState.totalRetention += (pis + cofins);
      });

      // Ordenar por ID
      FiscalState.results.sort((a, b) => a.id - b.id);

    } catch (err) {
      console.error(err);
      alert("Erro ao calcular impostos: " + err.message);
    } finally {
      FiscalState.loading = false;
      this.render();
    }
  },

  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  },

  async sendToSienge(companyId, type) {
    const comp = FiscalState.results.find(c => c.id === companyId);
    if (!comp) return;

    const fileInputId = `file-${type}-${companyId}`;
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    if (!file) {
      if (!confirm(`Você não anexou a guia de pagamento para o título de ${type.toUpperCase()}. Deseja criar o título sem anexo?`)) {
        return;
      }
    }

    const btn = document.getElementById(`btn-${type}-${companyId}`);
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div> Enviando...`;
    btn.disabled = true;

    try {
      // Regra do Corporativo MLD: 7 + ID(2 digitos) + 00
      const corporativoId = Number(`7${String(comp.id).padStart(2, '0')}00`);
      
      const issueDate = new Date().toISOString().split('T')[0];
      const monthStr = String(FiscalState.month).padStart(2, '0');
      const yearStr = FiscalState.year;
      
      // Vencimento dia 25 do mês seguinte ao selecionado
      let dueMonth = FiscalState.month + 1;
      let dueYear = FiscalState.year;
      if (dueMonth > 12) {
        dueMonth = 1;
        dueYear++;
      }
      const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-25`;
      const baseDate = `${FiscalState.year}-${monthStr}-01`;

      let documentId = "";
      let docNumber = "";
      let amount = 0;
      let planId = 0;
      let obs = "";

      // IMPORTANTE: Aqui estamos enviando os Planos Financeiros (2.04.01.01 e 2.04.01.02)
      // Como a API exige um ID numérico, em produção deve-se descobrir o ID desse código.
      // Neste MVP, tentaremos enviar o ID simulado ou depender de um mapeamento real.
      // Vou preencher com um ID genérico 2 caso esteja no ambiente simulado, mas a lógica 
      // ideal no Sienge seria obter o ID do plano via GET /financial-categories?code=2.04.01.01
      
      if (type === 'pis') {
        documentId = "PIS";
        docNumber = `PIS ML ${monthStr}/${yearStr}`;
        amount = comp.pis;
        obs = `Recolhimento mensal de PIS - ${monthStr}/${yearStr}`;
        // Código Sienge: 2.04.01.01
        planId = 2; // Substituir pelo ID numérico real do Sienge
      } else {
        documentId = "COFI";
        docNumber = `COFINS ML ${monthStr}/${yearStr}`;
        amount = comp.cofins;
        obs = `Recolhimento mensal de COFINS - ${monthStr}/${yearStr}`;
        // Código Sienge: 2.04.01.02
        planId = 3; // Substituir pelo ID numérico real do Sienge
      }

      const billPayload = {
        debtorId: comp.id,
        creditorId: 229, // SECRETARIA DA RECEITA FEDERAL
        documentIdentificationId: documentId,
        documentNumber: docNumber,
        issueDate: issueDate,
        installmentsNumber: 1,
        baseDate: baseDate,
        dueDate: dueDate,
        billDate: baseDate,
        totalInvoiceAmount: parseFloat(amount.toFixed(2)),
        notes: obs,
        discount: 0,
        indexId: 0,
        budgetCategories: [
          {
            financialCategoryId: planId,
            costCenterId: corporativoId,
            rate: 100
          }
        ],
        departmentsCost: [
          {
            id: 37, // Controladoria
            rate: 100
          }
        ],
        taxes: [],
        buildingsCost: [],
        units: []
      };

      // Simulação do envio (Se estiver usando proxy local do sistema Arklok CRM)
      const host = window.location.hostname || 'localhost';
      const port = 3001;
      const proxyUrl = `http://${host}:${port}/sienge-proxy/bills`;
      
      let authHeader = "";
      if (window.SIENGE_CONFIG) {
        authHeader = "Basic " + btoa(window.SIENGE_CONFIG.user + ":" + window.SIENGE_CONFIG.pass);
      }

      const req = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(billPayload)
      });

      let billId = `SIMULADO_${Math.floor(Math.random()*1000)}`;
      
      if (req.ok) {
        const textResp = await req.text();
        if (textResp) {
          try {
            const resJson = JSON.parse(textResp);
            billId = resJson.id || billId;
          } catch(e) {}
        }
        
        // Se a requisição deu certo e tem anexo, vamos fazer o UPLOAD do anexo
        if (file && !billId.startsWith('SIMULADO_')) {
          try {
            const attUrl = `http://${host}:${port}/sienge-proxy/bills/${billId}/attachments?description=Guia_${type.toUpperCase()}`;
            const formData = new FormData();
            formData.append('file', file);
            
            await fetch(attUrl, {
              method: 'POST',
              headers: { 'Authorization': authHeader },
              body: formData
            });
            console.log("Anexo enviado com sucesso!");
          } catch (errAtt) {
            console.error("Falha ao enviar anexo", errAtt);
            alert("O título foi criado, mas houve uma falha ao enviar o anexo da guia.");
          }
        }
        
        btn.innerHTML = `<i data-lucide="check"></i> Gerado: #${billId}`;
        btn.classList.remove('btn-primary');
        btn.style.backgroundColor = '#10b981';
        btn.style.color = 'white';
        btn.style.borderColor = '#10b981';
      } else {
        const errText = await req.text();
        throw new Error(errText);
      }

    } catch (err) {
      console.error(err);
      alert(`Erro ao criar o título no Sienge: ${err.message}`);
      btn.innerHTML = `Erro! Tentar nov.`;
      btn.disabled = false;
    } finally {
      if (window.lucide) lucide.createIcons();
    }
  },

  render() {
    const root = document.getElementById('fiscal-root');
    if (!root) return;

    if (FiscalState.loading) {
      root.innerHTML = `
        <div style="text-align: center; padding: 60px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p style="font-size: 1.1rem;">Buscando movimentos bancários e calculando retenções...</p>
        </div>
      `;
      return;
    }

    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    let monthOptions = months.map((m, i) => `<option value="${i+1}" ${FiscalState.month === i+1 ? 'selected' : ''}>${m}</option>`).join('');
    
    // Gerar anos
    const currentYear = new Date().getFullYear();
    let yearOptions = '';
    for(let y = 2024; y <= currentYear + 1; y++) {
      yearOptions += `<option value="${y}" ${FiscalState.year === y ? 'selected' : ''}>${y}</option>`;
    }

    let html = `
      <style>
        .fiscal-details > summary {
          list-style: none;
          cursor: pointer;
        }
        .fiscal-details > summary::-webkit-details-marker {
          display: none;
        }
        .fiscal-row {
          border-bottom: 1px solid #e5e7eb;
          transition: background-color 0.2s;
        }
        .fiscal-row:hover {
          background-color: #f9fafb;
        }
        .cc-row {
          background-color: #fafafa;
          border-bottom: 1px dashed #e5e7eb;
        }
        .cc-row td {
          padding: 8px 16px;
          color: #4b5563;
          font-size: 0.85rem;
        }
        .sienge-upload-box {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: white;
          border: 1px dashed #d1d5db;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #6b7280;
        }
        .sienge-upload-box input[type="file"] {
          max-width: 140px;
          font-size: 0.7rem;
        }
      </style>

      <div style="padding: 20px; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <div>
            <p style="color: var(--color-text-muted); margin: 0; font-size: 0.95rem;">
              Baseado nas receitas bancárias das empresas geridas pelo grupo
            </p>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="background: white; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="calendar" style="width: 16px; color: #6b7280;"></i>
              <select id="fiscal-month" style="border: none; outline: none; background: transparent; font-weight: 500; font-size: 0.95rem; cursor: pointer; color: #374151;">
                ${monthOptions}
              </select>
              <span style="color: #d1d5db;">/</span>
              <select id="fiscal-year" style="border: none; outline: none; background: transparent; font-weight: 500; font-size: 0.95rem; cursor: pointer; color: #374151;">
                ${yearOptions}
              </select>
            </div>
            
            <button class="btn btn-outline" onclick="switchTab('plano-financeiro')" style="display: flex; align-items: center; gap: 8px; padding: 0 16px; height: 38px;">
              <i data-lucide="settings-2" style="width: 16px;"></i> Parametrizar Planos (Receitas/Deduções)
            </button>

            <button class="btn btn-primary" onclick="
              FiscalState.month = parseInt(document.getElementById('fiscal-month').value);
              FiscalState.year = parseInt(document.getElementById('fiscal-year').value);
              FiscalApp.loadData();
            " style="display: flex; align-items: center; gap: 8px; padding: 0 16px; height: 38px;">
              <i data-lucide="search" style="width: 16px;"></i> Calcular
            </button>
          </div>
        </div>

        <!-- Dashboard Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
          <div class="card" style="padding: 16px; border-left: 4px solid #10b981; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #6b7280; font-weight: 600; text-transform: uppercase;">Receitas Totais</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #1f2937; margin-top: 8px;">${this.formatCurrency(FiscalState.totalRevenue)}</div>
          </div>
          <div class="card" style="padding: 16px; border-left: 4px solid #f59e0b; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #6b7280; font-weight: 600; text-transform: uppercase;">PIS (0,65%)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #1f2937; margin-top: 8px;">${this.formatCurrency(FiscalState.totalPis)}</div>
          </div>
          <div class="card" style="padding: 16px; border-left: 4px solid #f97316; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #6b7280; font-weight: 600; text-transform: uppercase;">COFINS (3,00%)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #1f2937; margin-top: 8px;">${this.formatCurrency(FiscalState.totalCofins)}</div>
          </div>
          <div class="card" style="padding: 16px; border-left: 4px solid #ef4444; display: flex; flex-direction: column; justify-content: space-between; background-color: #fef2f2;">
            <div style="font-size: 0.85rem; color: #b91c1c; font-weight: 600; text-transform: uppercase;">Total de Retenções</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #991b1b; margin-top: 8px;">${this.formatCurrency(FiscalState.totalRetention)}</div>
          </div>
        </div>

        <div class="card" style="overflow: hidden; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem; table-layout: fixed;">
            <thead>
              <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; width: 40px;"></th>
                <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151;">Empresa / Centro de Custo</th>
                <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #374151; width: 140px;">Base de Cálculo</th>
                <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #374151; width: 140px;">PIS (0,65%)</th>
                <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #374151; width: 140px;">COFINS (3,00%)</th>
                <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #374151; width: 340px;">Ação (Sienge)</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (FiscalState.results.length === 0) {
      html += `
        <tr>
          <td colspan="6" style="padding: 40px; text-align: center; color: #6b7280;">
            <i data-lucide="inbox" style="width: 32px; height: 32px; color: #d1d5db; margin-bottom: 8px; opacity: 0.7;"></i><br>
            Nenhuma receita encontrada para as empresas <b>geridas pelo grupo</b> no período de ${String(FiscalState.month).padStart(2, '0')}/${FiscalState.year}.
          </td>
        </tr>
      `;
    } else {
      FiscalState.results.forEach(comp => {
        
        let ccRowsHtml = '';
        comp.costCenters.forEach(cc => {
          ccRowsHtml += `
            <tr class="cc-row">
              <td style="width: 40px;"></td>
              <td style="padding-left: 24px;"><i data-lucide="corner-down-right" style="width: 12px; height: 12px; margin-right: 4px; color: #9ca3af; display: inline-block;"></i> ${cc.id} - ${cc.name}</td>
              <td style="text-align: right; width: 140px;">${this.formatCurrency(cc.revenue)}</td>
              <td style="text-align: right; width: 140px;">${this.formatCurrency(cc.pis)}</td>
              <td style="text-align: right; width: 140px;">${this.formatCurrency(cc.cofins)}</td>
              <td style="width: 340px;"></td>
            </tr>
          `;
        });

        html += `
          <tr class="fiscal-row">
            <td colspan="6" style="padding: 0;">
              <details class="fiscal-details">
                <summary style="display: flex; width: 100%; align-items: center;">
                  <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                    <tr>
                      <td style="padding: 12px 16px; width: 40px; text-align: center;">
                        <i data-lucide="chevron-down" style="width: 18px; color: #6b7280;"></i>
                      </td>
                      <td style="padding: 12px 16px; font-weight: 600; color: #1f2937;">
                        <span style="color: #6b7280; font-size: 0.8rem; margin-right: 6px;">#${comp.id}</span>
                        ${comp.name}
                      </td>
                      <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #10b981; width: 140px;">
                        ${this.formatCurrency(comp.revenue)}
                      </td>
                      <td style="padding: 12px 16px; text-align: right; color: #d97706; width: 140px;">
                        ${this.formatCurrency(comp.pis)}
                      </td>
                      <td style="padding: 12px 16px; text-align: right; color: #ea580c; width: 140px;">
                        ${this.formatCurrency(comp.cofins)}
                      </td>
                      <td style="padding: 12px 16px; text-align: right; width: 340px;" onclick="event.preventDefault();">
                        <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                          
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="sienge-upload-box">
                              <i data-lucide="paperclip" style="width:12px;"></i>
                              <input type="file" id="file-pis-${comp.id}" accept=".pdf,.png,.jpg" title="Anexar Guia PIS">
                            </div>
                            <button id="btn-pis-${comp.id}" class="btn btn-primary" style="font-size: 0.75rem; padding: 6px 12px; width: 140px; text-align: center; justify-content: center;" onclick="FiscalApp.sendToSienge(${comp.id}, 'pis')">
                              Criar Título PIS
                            </button>
                          </div>

                          <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="sienge-upload-box">
                              <i data-lucide="paperclip" style="width:12px;"></i>
                              <input type="file" id="file-cofins-${comp.id}" accept=".pdf,.png,.jpg" title="Anexar Guia COFINS">
                            </div>
                            <button id="btn-cofins-${comp.id}" class="btn btn-primary" style="font-size: 0.75rem; padding: 6px 12px; width: 140px; text-align: center; justify-content: center;" onclick="FiscalApp.sendToSienge(${comp.id}, 'cofins')">
                              Criar Título COFINS
                            </button>
                          </div>

                        </div>
                      </td>
                    </tr>
                  </table>
                </summary>
                <div style="background: #fff;">
                  <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                    <tbody>
                      ${ccRowsHtml}
                    </tbody>
                  </table>
                </div>
              </details>
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    root.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    
    // Add event listeners para as sanfonas rotacionarem o icone
    document.querySelectorAll('.fiscal-details').forEach(details => {
      details.addEventListener('toggle', (e) => {
        const icon = e.target.querySelector('summary i[data-lucide="chevron-down"]');
        if (icon) {
          icon.style.transform = e.target.open ? 'rotate(180deg)' : 'rotate(0deg)';
          icon.style.transition = 'transform 0.2s';
        }
      });
    });
  }
};

function initFiscalModule() {
  const root = document.getElementById('fiscal-root');
  if (!root) return;
  FiscalApp.loadData();
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'construcao-fiscal') {
    initFiscalModule();
  }
});
