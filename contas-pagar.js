// MÓDULO ASSISTENTE DE CONTAS A PAGAR

const ContasPagarState = {
  step: 1, // 1: Upload, 2: Validação, 3: Vínculo, 4: Confirmação, 5: Processando, 6: Concluído
  excelFile: null,
  excelData: [],
  attachments: [], // Array de { id, file, name, size, objectUrl }
  titles: [], // Títulos agrupados.
  selectedTitleIds: [], // IDs dos títulos selecionados via checkbox
  selectedAttachmentIds: [], // IDs dos anexos selecionados na lista direita
  selectedAttachmentId: null, // Mantido por compatibilidade
  isProcessing: false
};

const ContasPagarApp = {
  
  init() {
    this.resetState();
    this.render();
  },

  resetState() {
    ContasPagarState.step = 1;
    ContasPagarState.excelFile = null;
    ContasPagarState.excelData = [];
    ContasPagarState.attachments = [];
    ContasPagarState.titles = [];
    ContasPagarState.selectedTitleIds = [];
    ContasPagarState.selectedAttachmentIds = [];
    ContasPagarState.selectedAttachmentId = null;
    ContasPagarState.isProcessing = false;
  },

  render() {
    const root = document.getElementById('contas-pagar-root');
    if (!root) return;

    let html = `
      <div class="contas-pagar-container" style="padding: 20px; max-width: 1600px; width: 98%; margin: 0 auto;">

        ${this.renderStepper()}
        <div id="cp-content-area" style="margin-top: 20px;">
    `;

    switch (ContasPagarState.step) {
      case 1: html += this.renderStep1(); break;
      case 1.5: html += this.renderStep2(); break; // Validação
      case 2: html += this.renderStep3(); break; // Vínculos
      case 3: html += this.renderStep5(); break; // Processamento
      case 4: html += this.renderStep6(); break; // Relatórios
    }

    html += `
        </div>
      </div>
    `;

    root.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    this.bindEvents();
  },

  renderStepper() {
    let steps = [
      { num: 1, label: "Upload" },
      { num: 2, label: "Vínculos" },
      { num: 3, label: "Processamento" },
      { num: 4, label: "Relatórios" }
    ];

    let html = `<div class="stepper" style="display: flex; justify-content: space-between; margin-bottom: 30px; position: relative;">`;
    
    // Linha de fundo
    html += `<div style="position: absolute; top: 15px; left: 5%; right: 5%; height: 2px; background: #e0e0e0; z-index: 1;"></div>`;

    steps.forEach((s, idx) => {
      const currentMainStep = Math.floor(ContasPagarState.step);
      const isPast = currentMainStep > s.num;
      const isActive = currentMainStep === s.num;
      const color = isPast || isActive ? "var(--color-primary)" : "#ccc";
      const bg = isPast || isActive ? "var(--color-primary)" : "#fff";
      const textColor = isPast || isActive ? "#fff" : "#999";
      const fontWeight = isActive ? "bold" : "normal";

      html += `
        <div style="display: flex; flex-direction: column; align-items: center; z-index: 2; width: 100px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${bg}; border: 2px solid ${color}; color: ${textColor}; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-bottom: 8px;">
            ${isPast ? '<i data-lucide="check" style="width: 16px;"></i>' : s.num}
          </div>
          <span style="font-size: 0.85rem; color: ${isActive ? 'var(--color-text)' : '#999'}; font-weight: ${fontWeight}; text-align: center;">${s.label}</span>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  },

  renderStep1() {
    const hasExcel = !!ContasPagarState.excelFile;
    const totalAnexos = ContasPagarState.attachments.length;

    let excelHtml = '';
    if (hasExcel) {
      const f = ContasPagarState.excelFile;
      excelHtml = `
        <div style="margin-top: 15px; background: #fff; border: 1px solid #ddd; padding: 10px 15px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <i data-lucide="file-spreadsheet" style="color: var(--color-primary); flex-shrink: 0;"></i>
            <div style="overflow: hidden;">
              <div style="font-weight: 500; font-size: 0.95rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${f.name}</div>
              <div style="font-size: 0.8rem; color: #777;">${(f.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" style="border-color: #ff4d4f; color: #ff4d4f; padding: 5px; flex-shrink: 0;" onclick="ContasPagarApp.removeExcel()">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      `;
    }

    let anexosHtml = '';
    if (totalAnexos > 0) {
      anexosHtml = '<div style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto; padding-right: 5px;">';
      ContasPagarState.attachments.forEach(att => {
        const isPdf = att.name.toLowerCase().endsWith('.pdf');
        const isImg = att.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);
        let preview = `<div style="width: 40px; height: 40px; background: #e0e0e0; display:flex; align-items:center; justify-content:center; border-radius: 4px; flex-shrink: 0;"><i data-lucide="file" style="color:#999; width: 20px;"></i></div>`;
        if (isImg) {
          preview = `<img src="${att.objectUrl}" style="width: 40px; height: 40px; object-fit: cover; border: 1px solid #ccc; border-radius: 4px; flex-shrink: 0;">`;
        }
        anexosHtml += `
          <div style="background: #fff; border: 1px solid #ddd; padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
              ${preview}
              <div style="overflow: hidden;">
                <div style="font-weight: 500; font-size: 0.9rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;" title="${att.name}">${att.name}</div>
                <div style="font-size: 0.8rem; color: #777;">${(att.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" style="border-color: #ff4d4f; color: #ff4d4f; padding: 5px; flex-shrink: 0;" onclick="ContasPagarApp.removeAttachment('${att.id}')">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
        `;
      });
      anexosHtml += '</div>';
    }

    return `
      <div class="card">
        <div class="card-body" style="padding-top: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
            
            <!-- Upload Excel -->
            <div class="form-group" style="display: flex; flex-direction: column;">
              <label style="margin-bottom: 10px; font-weight: 600;">Planilha de Contas a Pagar (Excel .xlsx)</label>
              <div id="cp-dropzone-excel" class="dropzone" style="border: 2px dashed ${hasExcel ? 'var(--color-primary)' : '#ccc'}; padding: 30px; height: 220px; text-align: center; border-radius: 8px; cursor: pointer; background: ${hasExcel ? '#eaf8f0' : '#fafafa'}; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;">
                <i data-lucide="file-spreadsheet" style="width: 48px; height: 48px; color: ${hasExcel ? 'var(--color-primary)' : '#999'}; margin-bottom: 15px;"></i>
                <p style="font-size: 0.95rem; color: #666; margin-bottom: 20px;">Clique ou arraste a planilha modelo aqui</p>
                <button class="btn btn-outline" style="background: white;" onclick="event.stopPropagation(); ContasPagarApp.downloadTemplate()">
                  <i data-lucide="download" style="width: 16px;"></i> Baixar Modelo
                </button>
                <input type="file" id="cp-input-excel" accept=".xlsx, .xls" style="display: none;">
              </div>
              ${excelHtml}
            </div>

            <!-- Upload Anexos -->
            <div class="form-group" style="display: flex; flex-direction: column;">
              <label style="margin-bottom: 10px; font-weight: 600;">Anexos Comprobatórios (PDF, PNG, JPG)</label>
              <div id="cp-dropzone-anexos" class="dropzone" style="border: 2px dashed ${totalAnexos > 0 ? 'var(--color-primary)' : '#ccc'}; padding: 30px; height: 220px; text-align: center; border-radius: 8px; cursor: pointer; background: ${totalAnexos > 0 ? '#eaf8f0' : '#fafafa'}; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;">
                <i data-lucide="files" style="width: 48px; height: 48px; color: ${totalAnexos > 0 ? 'var(--color-primary)' : '#999'}; margin-bottom: 15px;"></i>
                <p style="font-size: 0.95rem; color: #666;">Clique ou arraste arquivos aqui</p>
                <input type="file" id="cp-input-anexos" multiple accept=".pdf, .png, .jpg, .jpeg" style="display: none;">
              </div>
              ${anexosHtml}
            </div>

          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button class="btn btn-primary" onclick="ContasPagarApp.processStep1()" ${!hasExcel || totalAnexos === 0 ? 'disabled' : ''}>
              Avançar para Vínculos <i data-lucide="arrow-right" style="width:16px;"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderStep2() {
    return `
      <div class="card">
        <div class="card-body" style="padding-top: 20px;">
          <div id="cp-validation-status" style="text-align: center; padding: 40px;">
            <div class="spinner"></div>
            <p style="margin-top: 15px;">Lendo planilha e consultando CNPJs no Sienge...</p>
          </div>
          <div id="cp-validation-results" style="display: none;"></div>
        </div>
      </div>
    `;
  },

  downloadTemplate() {
    const headers = [
      'Código da empresa (Obrigatório)', 
      'Código do credor (Obrigatório)', 
      'Código do documento (Obrigatório)', 
      'Número do documento (Obrigatório)', 
      'Data de emissão (Obrigatório)', 
      'Data de vencimento (Obrigatório)', 
      'Data de competência (Obrigatório)', 
      'Valor do título bruto (Obrigatório)', 
      'Quantidade de parcelas (Obrigatório)', 
      'Código do indexador (Obrigatório)', 
      'Data base (Obrigatório)',
      'Código do centro de custo (Obrigatório)', 
      'Código do plano financeiro (Obrigatório)', 
      'Percentual apropriado do centro de custo (Obrigatório)',
      'Código do departamento (Obrigatório)', 
      'Percentual apropriado no departamento (Obrigatório)',
      'Valor desconto (Opcional)', 
      'Observação do título (Opcional)',
      'Código do imposto (Opcional)', 
      'Código do IBGE do município (Opcional)', 
      'Percentual do imposto (Opcional)', 
      'Valor do imposto (Opcional)', 
      'Valor de incidência (Opcional)', 
      'Percentual de incidência (Opcional)',
      'Código da obra (Opcional)', 
      'Código da unidade construtiva (Opcional)', 
      'Código do item de orçamento (Opcional)', 
      'Percentual apropriado a obra (Opcional)',
      'Código da unidade (Opcional)', 
      'Percentual da unidade (Opcional)', 
      'Unidade principal (Opcional)'
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    
    XLSX.utils.sheet_add_aoa(ws, [
      [2, 14308, '1', '123', '2026-05-27', '2026-12-31', '2026-05-27', 1500.50, 1, 0, '2026-05-27', 14703, '410101', 100, 9, 100, 0, 'Teste API']
    ], {origin: "A2"});

    const wscols = headers.map(h => ({wch: Math.max(h.length, 15)}));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Modelo_Contas_a_Pagar");
    XLSX.writeFile(wb, "Modelo_Importacao_Contas_Pagar.xlsx");
  },

  renderStep3() {
    const titles = ContasPagarState.titles;
    const attachments = ContasPagarState.attachments;
    const selectedTitleIds = ContasPagarState.selectedTitleIds || [];
    const selectedAttIds = ContasPagarState.selectedAttachmentIds || [];
    
    const allSelected = titles.length > 0 && selectedTitleIds.length === titles.length;

    let html = `
      <div class="card" style="min-height: 800px; display: flex; flex-direction: column;">
        <div class="card-body" style="flex: 1; display: flex; flex-direction: column; padding-top: 20px;">
          
          <div style="display: flex; flex: 1; min-height: 0;">
            
            <!-- LADO ESQUERDO: TÍTULOS -->
            <div style="flex: 0 0 72%; display: flex; flex-direction: column; height: 100%; padding-right: 25px;">
              <p style="margin: 0 0 15px 0; font-size: 0.95rem; color: #555; font-weight: 500;">
                <i data-lucide="info" style="width: 16px; height: 16px; margin-right: 5px; vertical-align: text-bottom;"></i>
                Selecione títulos e anexos para vinculá-los em lote, ou <strong>arraste e solte</strong> os anexos diretamente na área de anexos do título.
              </p>
              <h4 style="margin-bottom: 15px; font-size: 1.2rem; color: #333;">Títulos a Pagar</h4>
              <div style="border: 2px solid var(--color-border); border-radius: 8px; flex: 1; overflow-y: auto; background: #fff; max-height: 650px;">
                <table class="table" style="width: 100%; margin: 0; border-collapse: collapse;">
                  <thead style="position: sticky; top: 0; background: #f9f9f9; z-index: 10;">
                    <tr style="border-bottom: 2px solid #e0e0e0;">
                      <th style="padding: 18px 12px; width: 40px; text-align: center;" title="Vincular em lote: Selecione vários títulos e, ao arrastar um anexo para qualquer um deles, todos receberão o mesmo anexo.">
                        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="ContasPagarApp.toggleAllTitles(this.checked)" style="transform: scale(1.2); cursor: pointer;" title="Vincular em lote: Selecione vários títulos e, ao arrastar um anexo para qualquer um deles, todos receberão o mesmo anexo.">
                      </th>
                      <th style="padding: 18px 8px; width: 5%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DOC</th>
                      <th style="padding: 18px 8px; width: 10%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">Nº DOC</th>
                      <th style="padding: 18px 8px; width: 25%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">CREDOR</th>
                      <th style="padding: 18px 8px; width: 30%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">PLANO FINANCEIRO</th>
                      <th style="padding: 18px 8px; width: 12%; text-align: right; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VALOR</th>
                      <th style="padding: 18px 8px; width: 12%; text-align: center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VENCIMENTO</th>
                      <th style="padding: 18px 8px; text-align: center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">EXCLUIR</th>
                    </tr>
                  </thead>
                  <tbody>
    `;

    const attOptions = attachments.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    titles.forEach(t => {
      const isChecked = selectedTitleIds.includes(t.id);
      
      let tagsHtml = t.attachments.map(attId => {
        const att = attachments.find(a => a.id === attId);
        return `<div style="background: var(--color-primary); color: white; display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; margin-top: 5px; margin-right: 4px;">
                  <span style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${att ? att.name : 'Arquivo'}">${att ? att.name : 'Arquivo'}</span>
                  <i data-lucide="x" style="width: 12px; cursor: pointer;" onclick="event.stopPropagation(); ContasPagarApp.unlinkAttachment('${t.id}', '${attId}')"></i>
                </div>`;
      }).join('');

      html += `
                    <tr style="border-bottom: 2px solid #ddd; background: ${isChecked ? '#f0f9f6' : '#fff'}; transition: background 0.2s;" 
                        ondragover="event.preventDefault();" 
                        ondrop="event.preventDefault(); const attId = event.dataTransfer.getData('text/plain'); if(attId) { ContasPagarApp.linkInlineAttachment('${t.id}', attId); }">
                      <td style="padding: 16px 12px; text-align: center;">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="ContasPagarApp.toggleTitleSelection('${t.id}', this.checked)" style="transform: scale(1.2); cursor: pointer;">
                      </td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentIdentificationId || ''}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentNumber || ''}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;" title="ID: ${t.creditorId}">${t.creditorName || t.creditorId}
                        ${t.bankInfo ? `<i data-lucide="info" style="width: 14px; height: 14px; color: var(--color-primary); cursor: pointer; margin-left: 5px; vertical-align: middle;" onclick="event.stopPropagation(); ContasPagarApp.showBankInfoModal('${t.id}')" title="Ver Dados Bancários"></i>` : ''}
                      </td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.paymentCategoryLabel || '(vazio)'}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: right; white-space: nowrap;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(t.netValue || t.totalValue || 0))}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: center;">${this.formatFriendlyDate(t.dueDate)}</td>
                      <td style="padding: 16px 12px; text-align: center;"><button type="button" class="btn btn-outline" style="min-width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="event.stopPropagation(); ContasPagarApp.removeTitle('${t.id}')" title="Excluir Título"><i data-lucide="trash-2" style="width: 16px; color: #ff4d4f;"></i></button></td>
                    </tr>
                    <tr style="background: #fafbfc; border-bottom: 1px solid #e8e8e8;"
                        ondragover="event.preventDefault(); this.style.background='#eef2ff'" 
                        ondragleave="this.style.background='#fafbfc'" 
                        ondrop="event.preventDefault(); this.style.background='#fafbfc'; const attId = event.dataTransfer.getData('text/plain'); if(attId) { ContasPagarApp.linkInlineAttachment('${t.id}', attId); }">
                      <td colspan="8" style="padding: 14px 12px;">
                        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
                          <div style="flex: 1; min-width: 0;">
                            <strong style="font-size: 0.9rem; color: #333;">Anexos vinculados:</strong>
                            <div style="display: flex; flex-wrap: wrap; min-height: 42px; align-items: center; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 8px 12px; gap: 6px; margin-top: 8px; background: #f8fafc; transition: all 0.2s;">${tagsHtml || '<span style="color:#94a3b8; font-size:0.85rem; font-style:italic; pointer-events:none;">Arraste e solte o anexo aqui</span>'}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
      `;
    });

    html += `
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- SEPARADOR -->
            <div style="width: 2px; background: #e0e0e0; border-radius: 1px;"></div>
            
            <!-- LADO DIREITO: ANEXOS -->
            <div style="flex: 1; display: flex; flex-direction: column; height: 100%; padding-left: 25px; min-width: 0;">
              <p style="margin: 0 0 15px 0; font-size: 0.95rem; color: #555; font-weight: 500;">
                <i data-lucide="info" style="width: 16px; height: 16px; margin-right: 5px; vertical-align: text-bottom;"></i>
                Clique no card do anexo para selecionar.
              </p>
              <h4 style="margin-bottom: 10px; font-size: 1.2rem; color: #333;">Anexos Importados (${attachments.length})</h4>
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 15px; width: 100%;">
                <button type="button" class="btn btn-outline" style="flex: 1; justify-content: center; height: 36px; padding: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; border-color: #fca5a5; color: #dc2626; background: #fff;" 
                        onclick="event.preventDefault(); ContasPagarApp.unlinkMultiple()" 
                        ${selectedTitleIds.length === 0 ? 'disabled' : ''}
                        title="${selectedTitleIds.length > 0 ? `Desvincular anexos de ${selectedTitleIds.length} título(s)` : 'Selecione títulos para desvincular anexos'}">
                  <i data-lucide="unlink" style="width: 14px;"></i> Desvincular
                </button>
                <button type="button" class="btn btn-primary" style="flex: 1; justify-content: center; height: 36px; padding: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;" 
                        onclick="event.preventDefault(); ContasPagarApp.linkMultiple()" 
                        ${selectedAttIds.length === 0 || selectedTitleIds.length === 0 ? 'disabled' : ''}
                        title="${selectedAttIds.length > 0 && selectedTitleIds.length > 0 ? `Vincular ${selectedAttIds.length} anexo(s) a ${selectedTitleIds.length} título(s)` : 'Selecione títulos e anexos para vincular em lote'}">
                  <i data-lucide="link" style="width: 14px;"></i> Vincular
                </button>
                <button class="btn btn-outline" style="flex: 1; justify-content: center; height: 36px; padding: 0;" onclick="ContasPagarApp.removeAllAttachments()">Excluir todos</button>
              </div>
              <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); flex: 1; overflow-y: auto; max-height: 500px; display: flex; flex-direction: column; gap: 15px;">
    `;

    attachments.forEach(att => {
      const isSelectedAtt = selectedAttIds.includes(att.id);
      const isPdf = att.name.toLowerCase().endsWith('.pdf');
      const isImg = att.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);
      
      let icon = isPdf ? 'file-text' : isImg ? 'image' : 'file';

      html += `
                <div draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${att.id}')" style="background: #fff; border: 2px solid ${isSelectedAtt ? 'var(--color-primary)' : '#ddd'}; padding: 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: grab; transition: all 0.2s;" onclick="ContasPagarApp.toggleAttachmentSelection('${att.id}')">
                  <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                    <div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <i data-lucide="${icon}" style="color: #666; width: 24px; height: 24px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                      <strong style="font-size: 0.95rem; margin-bottom: 2px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${isSelectedAtt ? 'var(--color-primary)' : '#333'};" title="${att.name}">${att.name}</strong>
                      <div style="font-size: 0.8rem; color: #888;">${(att.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button type="button" class="btn btn-outline" style="min-width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="event.stopPropagation(); window.open('${att.objectUrl}', '_blank');" title="Visualizar Anexo">
                      <i data-lucide="eye" style="width: 16px;"></i>
                    </button>
                    <button type="button" class="btn btn-outline" style="min-width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="event.stopPropagation(); ContasPagarApp.removeAttachment('${att.id}');" title="Excluir Anexo">
                      <i data-lucide="trash-2" style="width: 16px; color: #ff4d4f;"></i>
                    </button>
                  </div>
                </div>
      `;
    });

    html += `
              </div>
            </div>
          </div>
          


          <div style="display: flex; justify-content: space-between; margin-top: 25px; border-top: 1px solid var(--color-border); padding-top: 20px;">
            <button class="btn btn-outline" onclick="ContasPagarState.step=1; ContasPagarApp.render()">Voltar para Upload</button>
            <button class="btn btn-primary" onclick="ContasPagarApp.validateStep3()">
              Iniciar Processamento <i data-lucide="play" style="width:16px; margin-left: 5px;"></i>
            </button>
          </div>
        </div>
      </div>
      
      <!-- MODAL DE DADOS BANCÁRIOS -->
      <div id="cp-bank-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
        <div class="card" style="width: 400px; max-width: 90%; position: relative; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div class="card-body" style="padding: 20px;">
            <h3 style="margin-bottom: 15px;">Dados Bancários do Credor</h3>
            <div id="cp-bank-modal-content" style="font-size: 0.9rem; line-height: 1.5; color: #444;"></div>
            <div style="text-align: right; margin-top: 20px;">
              <button class="btn btn-primary" onclick="document.getElementById('cp-bank-modal').style.display='none'">Fechar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return html;
  },

  showBankInfoModal(titleId) {
    const title = ContasPagarState.titles.find(t => t.id === titleId);
    if (!title || !title.bankInfo) return;
    
    const b = title.bankInfo;
    const content = `
      <p><strong>Credor:</strong> ${title.creditorName}</p>
      <p><strong>Forma Padrão:</strong> ${b.paymentForm || 'Não informada'}</p>
      <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
      <p><strong>Banco:</strong> ${b.bank || ''} - ${b.nameOfBank || ''}</p>
      <p><strong>Agência:</strong> ${b.agency || ''}</p>
      <p><strong>Conta:</strong> ${b.accountNumber || ''}-${b.checkDigit || ''} (${b.accountType || ''})</p>
      <p><strong>Favorecido:</strong> ${b.nameOfRecipient || ''}</p>
      <p><strong>Documento:</strong> ${b.cnpj || b.cpf || 'Não informado'}</p>
    `;
    
    document.getElementById('cp-bank-modal-content').innerHTML = content;
    document.getElementById('cp-bank-modal').style.display = 'flex';
  },

  linkInlineAttachment(titleId, attId) {
    const title = ContasPagarState.titles.find(t => t.id === titleId);
    if (!title) return;
    
    const selectedIds = ContasPagarState.selectedTitleIds || [];
    const isSelected = selectedIds.includes(titleId);
    
    if (isSelected && selectedIds.length > 1) {
      // Aplica o anexo a todos os títulos selecionados
      ContasPagarState.titles.forEach(t => {
        if (selectedIds.includes(t.id)) {
          if (!t.attachments) t.attachments = [];
          if (!t.attachments.includes(attId)) {
            t.attachments.push(attId);
          }
        }
      });
    } else {
      // Aplica apenas a este título
      if (!title.attachments) title.attachments = [];
      if (!title.attachments.includes(attId)) {
        title.attachments.push(attId);
      }
    }
    
    this.render();
  },

  linkMultiple() {
    const attIds = ContasPagarState.selectedAttachmentIds || [];
    const titleIds = ContasPagarState.selectedTitleIds || [];
    
    if (attIds.length === 0 || titleIds.length === 0) return;

    ContasPagarState.titles.forEach(t => {
      if (titleIds.includes(t.id)) {
        if (!t.attachments) t.attachments = [];
        attIds.forEach(attId => {
          if (!t.attachments.includes(attId)) {
            t.attachments.push(attId);
          }
        });
      }
    });

    ContasPagarState.selectedTitleIds = [];
    ContasPagarState.selectedAttachmentIds = [];

    this.render();
  },

  unlinkMultiple() {
    const attIds = ContasPagarState.selectedAttachmentIds || [];
    const titleIds = ContasPagarState.selectedTitleIds || [];
    
    if (titleIds.length === 0) return;

    ContasPagarState.titles.forEach(t => {
      if (titleIds.includes(t.id)) {
        if (attIds.length > 0) {
          // Se anexos específicos foram selecionados, remove apenas eles
          if (t.attachments) {
            t.attachments = t.attachments.filter(id => !attIds.includes(id));
          }
        } else {
          // Se nenhum anexo foi selecionado na direita, desvincula TODOS os anexos dos títulos selecionados
          t.attachments = [];
        }
      }
    });

    ContasPagarState.selectedTitleIds = [];
    ContasPagarState.selectedAttachmentIds = [];

    this.render();
  },

  toggleAllTitles(checked) {
    ContasPagarState.selectedTitleIds = checked ? ContasPagarState.titles.map(t => t.id) : [];
    this.render();
  },

  toggleTitleSelection(titleId, checked) {
    const selected = new Set(ContasPagarState.selectedTitleIds || []);
    if (checked) {
      selected.add(titleId);
    } else {
      selected.delete(titleId);
    }
    ContasPagarState.selectedTitleIds = Array.from(selected);
    this.render();
  },

  toggleAttachmentSelection(attId) {
    const selected = new Set(ContasPagarState.selectedAttachmentIds || []);
    if (selected.has(attId)) {
      selected.delete(attId);
    } else {
      selected.add(attId);
    }
    ContasPagarState.selectedAttachmentIds = Array.from(selected);
    this.render();
  },

  removeTitle(titleId) {
    ContasPagarState.titles = ContasPagarState.titles.filter(t => t.id !== titleId);
    ContasPagarState.selectedTitleIds = (ContasPagarState.selectedTitleIds || []).filter(id => id !== titleId);
    
    const valRow = document.getElementById(`cp-val-row-${titleId}`);
    if (valRow) valRow.remove();
    
    const alertSuccess = document.getElementById('cp-val-success-alert');
    if (alertSuccess) {
      alertSuccess.innerHTML = `<i data-lucide="check-circle" style="width: 16px;"></i> ${ContasPagarState.titles.length} título(s) validados e prontos para vínculo.`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    if (ContasPagarState.titles.length === 0) {
      const continueBtn = document.getElementById('cp-validation-popup-continue');
      if (continueBtn) continueBtn.disabled = true;
    }
    
    this.render();
  },

  removeAllAttachments() {
    ContasPagarState.attachments = [];
    ContasPagarState.selectedAttachmentIds = [];
    ContasPagarState.titles.forEach(t => { t.attachments = []; });
    this.render();
  },

  unlinkAttachment(titleId, attId) {
    const title = ContasPagarState.titles.find(t => t.id === titleId);
    if (title) {
      title.attachments = title.attachments.filter(id => id !== attId);
      this.render();
    }
  },

  validateStep3() {
    const withoutAttachments = ContasPagarState.titles.filter(t => t.attachments.length === 0);
    if (withoutAttachments.length > 0) {
      const proceed = confirm(`Existem ${withoutAttachments.length} título(s) sem anexo vinculado. Deseja prosseguir mesmo assim? (Alguns ERPs exigem anexo obrigatório).`);
      if (!proceed) return;
    }
    this.startProcessing();
  },

  renderStep4() {
  },

  renderStep5() {
    const titles = ContasPagarState.titles || [];
    return `
      <div class="card">
        <div class="card-body" style="padding: 20px;">
          <h3 id="cp-processing-title" style="margin-bottom: 20px; text-align: center;">Iniciando integração...</h3>
          <div class="progress-bar-bg" style="width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; margin-bottom: 20px;">
            <div id="cp-processing-bar" style="width: 0%; height: 100%; background: var(--color-primary); transition: width 0.3s;"></div>
          </div>
          <p id="cp-processing-status" style="font-weight: 500; text-align: center; margin-bottom: 20px;">0 de ${titles.length} concluídos</p>

          <div style="width: 100%; text-align: left; background: #fff; border: 2px solid var(--color-border); border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
            <div style="overflow-x: auto;">
              <table class="table" style="width: 100%; min-width: 1200px; margin: 0; border-collapse: collapse;">
                <thead style="background: #f9f9f9; border-bottom: 2px solid #e0e0e0;">
                  <tr>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DOC</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">Nº DOC</th>
                    <th style="padding: 18px 12px; width: 20%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">CREDOR</th>
                    <th style="padding: 18px 12px; width: 20%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">PLANO FINANCEIRO</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DEPARTAMENTO</th>
                    <th style="padding: 18px 12px; text-align: right; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VALOR</th>
                    <th style="padding: 18px 12px; text-align: center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VENCIMENTO</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap; width: 250px;">PROGRESSO</th>
                  </tr>
                </thead>
                <tbody>
                  ${titles.map(t => {
                    const depId = t.costCenters && t.costCenters[0] && t.costCenters[0].departmentId ? t.costCenters[0].departmentId : null;
                    const depName = depId && ContasPagarState.departmentNames[depId] ? ContasPagarState.departmentNames[depId] : depId;
                    const dep = depId ? depName : '-';
                    const valFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(t.netValue || t.totalValue || 0));

                    return `
                    <tr style="border-bottom: 1px solid #e8e8e8;">
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentIdentificationId || ''}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentNumber || ''}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;" title="ID: ${t.creditorId}">${t.creditorName || t.creditorId}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.paymentCategoryLabel || ''}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${dep}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: right; white-space: nowrap;">${valFormatado}</td>
                      <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: center;">${this.formatFriendlyDate(t.dueDate)}</td>
                      <td style="padding: 16px 12px;">
                        <div style="width: 100%;">
                          <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 999px; overflow: hidden; margin-bottom: 4px;">
                            <div id="cp-progress-bar-${t.id}" style="width: 0%; height: 100%; background: var(--color-primary); transition: width 0.3s;"></div>
                          </div>
                          <div id="cp-progress-text-${t.id}" style="font-size: 0.75rem; color: #666; text-align: right; font-weight: 500;">Aguardando...</div>
                        </div>
                      </td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    `;
  },

  renderStep6() {
    const titles = ContasPagarState.titles;
    const successCount = titles.filter(t => t.siengeId).length;
    const errorCount = titles.filter(t => !t.siengeId).length;
    
    let html = `
      <div class="card" style="min-height: 800px; display: flex; flex-direction: column;">
        <div class="card-body" style="flex: 1; padding: 50px 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">

          <h3 style="margin-bottom: 20px; font-size: 1.5rem; color: #333; font-weight: 600; text-align: left; width: 100%;">Relatório de Títulos Gerados</h3>
          <div style="width: 100%; text-align: left; background: #fff; border: 2px solid var(--color-border); border-radius: 8px; overflow: hidden; margin-bottom: 40px;">
            <div style="overflow-x: auto;">
              <table class="table" style="width: 100%; min-width: 1200px; margin: 0; border-collapse: collapse;">
                <thead style="background: #f9f9f9; border-bottom: 2px solid #e0e0e0;">
                  <tr>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DOC</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">Nº DOC</th>
                    <th style="padding: 18px 12px; width: 20%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">CREDOR</th>
                    <th style="padding: 18px 12px; width: 20%; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">PLANO FINANCEIRO</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DEPARTAMENTO</th>
                    <th style="padding: 18px 12px; text-align: right; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VALOR</th>
                    <th style="padding: 18px 12px; text-align: center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VENCIMENTO</th>
                    <th style="padding: 18px 12px; text-align: center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">STATUS</th>
                    <th style="padding: 18px 12px; text-align: left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">TÍTULO DO CONTAS A PAGAR</th>
                  </tr>
                </thead>
                <tbody>
    `;

    titles.forEach(t => {
      const isSuccess = !!t.siengeId;
      const statusColor = isSuccess ? '#1e8e3e' : '#dc2626';
      const statusBg = isSuccess ? '#eaf8f0' : '#fee2e2';
      const statusIcon = isSuccess ? 'check-circle' : 'alert-circle';
      const statusText = isSuccess ? 'Sucesso' : 'Erro';
      const msg = isSuccess ? t.siengeId : (t.errorMessage || 'Falha desconhecida');

      const depId = t.costCenters && t.costCenters[0] && t.costCenters[0].departmentId ? t.costCenters[0].departmentId : null;
      const depName = depId && ContasPagarState.departmentNames[depId] ? ContasPagarState.departmentNames[depId] : depId;
      const dep = depId ? depName : '-';
      const valFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(t.netValue || t.totalValue || 0));

      html += `
                <tr style="border-bottom: 1px solid #e8e8e8; background: ${isSuccess ? '#fff' : '#fffcfc'};">
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentIdentificationId || ''}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.documentNumber || ''}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;" title="ID: ${t.creditorId}">${t.creditorName || t.creditorId}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${t.paymentCategoryLabel || ''}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555;">${dep}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: right; white-space: nowrap;">${valFormatado}</td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: #555; text-align: center;">${this.formatFriendlyDate(t.dueDate)}</td>
                  <td style="padding: 16px 12px; text-align: center;">
                    <span style="display: inline-flex; align-items: center; gap: 5px; background: ${statusBg}; color: ${statusColor}; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">
                      <i data-lucide="${statusIcon}" style="width: 14px; height: 14px;"></i> ${statusText}
                    </span>
                  </td>
                  <td style="padding: 16px 12px; font-size: 0.85rem; color: ${isSuccess ? '#555' : '#dc2626'}; max-width: 250px;">
                    ${msg}
                  </td>
                </tr>`;
    });

    html += `
                </tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; justify-content: center; gap: 20px;">
            <button class="btn btn-outline" style="padding: 12px 24px; font-size: 1rem; display: flex; align-items: center; gap: 8px;" onclick="ContasPagarApp.generateReportPDF()">
              <i data-lucide="file-text" style="width: 20px;"></i> Baixar Relatório PDF
            </button>
            <button class="btn btn-primary" style="padding: 12px 24px; font-size: 1rem; display: flex; align-items: center; gap: 8px;" onclick="ContasPagarApp.init()">
              <i data-lucide="refresh-cw" style="width: 20px;"></i> Iniciar Novo Lote
            </button>
          </div>
        </div>
      </div>
    `;
    return html;
  },

  generateReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Relatório de Importação - Contas a Pagar", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total de Títulos Processados: ${ContasPagarState.titles.length}`, 14, 34);

    const tableData = ContasPagarState.titles.map(t => [
      t.documentNumber,
      t.creditorId,
      `R$ ${t.totalValue.toFixed(2).replace('.', ',')}`,
      t.siengeId ? 'Sucesso' : 'Erro',
      t.siengeId || t.errorMessage || '-'
    ]);

    doc.autoTable({
      startY: 40,
      head: [['Nº Doc', 'Credor ID', 'Valor Total', 'Status', 'Sienge ID / Erro']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [4, 73, 53] }, // Cor verde Moura Leite
      styles: { fontSize: 8 }
    });

    doc.save(`Relatorio_Contas_Pagar_${new Date().getTime()}.pdf`);
  },

  async startProcessing() {
    ContasPagarState.step = 3;
    this.render();
    
    // Pequeno delay para a interface renderizar
    await new Promise(r => setTimeout(r, 500));
    
    const titleEl = document.getElementById('cp-processing-title');
    const barEl = document.getElementById('cp-processing-bar');
    const statusEl = document.getElementById('cp-processing-status');
    const logBox = document.getElementById('cp-log-box');
    
    if (!titleEl || !barEl || !statusEl) {
      console.warn("Elementos de progresso não encontrados. Execução em segundo plano.");
    }

    const addLog = (msg) => {
      if (logBox) {
        const p = document.createElement('div');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(p);
        logBox.scrollTop = logBox.scrollHeight;
      }
      console.log(msg);
    };

    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
    const proxyUrl = `http://${host}:${port}/sienge-proxy`;

    const titles = ContasPagarState.titles;
    const total = titles.length;

    if (titleEl) titleEl.textContent = "Criando Títulos a Pagar...";

    for (let i = 0; i < total; i++) {
      const t = titles[i];
      
      const pBar = document.getElementById(`cp-progress-bar-${t.id}`);
      const pText = document.getElementById(`cp-progress-text-${t.id}`);
      
      if (pBar) { pBar.style.width = '30%'; pBar.style.background = '#f59e0b'; } // Laranja de 'em andamento'
      if (pText) pText.textContent = 'Criando título no Sienge...';

      addLog(`Iniciando Título Nº ${t.documentNumber}...`);
      
      try {
        // 1. Criar o Bill usando o payload exato solicitado
        const budgetCategories = [];
        const departmentsCost = [];
        const buildingsCost = [];
        const units = [];
        const taxes = [];

        t.costCenters.forEach(cc => {
          const perc = cc.percCC ? parseFloat(cc.percCC) : parseFloat((cc.value / t.totalValue) * 100).toFixed(4);
          
          if (cc.cc && cc.account) {
            budgetCategories.push({ costCenterId: parseInt(cc.cc), paymentCategoriesId: String(cc.account).replace(/\./g, ''), percentage: parseFloat(perc) });
          }
          if (cc.departmentId) {
            const pDep = cc.percDep ? parseFloat(cc.percDep) : parseFloat(perc);
            departmentsCost.push({ departmentId: parseInt(cc.departmentId), percentage: parseFloat(pDep) });
          }
          if (cc.buildingId) {
            const pBuild = cc.percBuild ? parseFloat(cc.percBuild) : parseFloat(perc);
            buildingsCost.push({ buildingId: parseInt(cc.buildingId), buildingUnitId: parseInt(cc.buildingUnitId) || 0, costEstimationSheetId: String(cc.costSheetId || ''), percentage: parseFloat(pBuild) });
          }
          if (cc.unitId) {
            const pUnit = cc.percUnit ? parseFloat(cc.percUnit) : parseFloat(perc);
            units.push({ unitId: String(cc.unitId), costCenterId: parseInt(cc.cc), percentage: parseFloat(pUnit), principal: cc.unitPrincipal || "S" });
          }
          if (cc.taxId) {
            taxes.push({ taxId: parseInt(cc.taxId), ibgeCityId: String(cc.ibgeCityId || ''), rate: parseFloat(cc.taxRate || 0), amount: parseFloat(cc.taxAmount) || 0, taxableBaseAmount: parseFloat(cc.taxBase || t.totalValue), taxRateMarker: parseFloat(cc.taxRateMarker || 100), usesIncomeTaxTable: false });
          }
        });

        const billPayload = {
          debtorId: parseInt(t.enterpriseId),
          creditorId: parseInt(t.creditorId),
          documentIdentificationId: String(t.documentIdentificationId),
          documentNumber: String(t.documentNumber),
          issueDate: String(t.issueDate).includes('T') ? t.issueDate.split('T')[0] : t.issueDate,
          installmentsNumber: parseInt(t.installmentsNumber) || 1,
          baseDate: String(t.baseDate).includes('T') ? t.baseDate.split('T')[0] : t.baseDate,
          dueDate: String(t.dueDate).includes('T') ? t.dueDate.split('T')[0] : t.dueDate,
          billDate: String(t.billDate).includes('T') ? t.billDate.split('T')[0] : t.billDate,
          totalInvoiceAmount: parseFloat(t.totalValue),
          notes: t.notes || "Gerado via CRM",
          discount: parseFloat(t.discount) || 0,
          indexId: parseInt(t.indexId) || 0,
          budgetCategories: budgetCategories,
          taxes: taxes,
          departmentsCost: departmentsCost,
          buildingsCost: buildingsCost,
          units: units
        };

        addLog(`> POST /payable-bills Payload: ${JSON.stringify(billPayload)}`);
        
        // Pegar as credenciais do Sienge do arquivo sienge-api.js
        let authHeader = "";
        if (window.SIENGE_CONFIG) {
           authHeader = "Basic " + btoa(window.SIENGE_CONFIG.user + ":" + window.SIENGE_CONFIG.pass);
        }

        // Simulação do Request (substituir por fetch real)
        let req;
        let isRateLimit = false;
        
        for (let attempt = 0; attempt < 5; attempt++) {
          if (attempt > 0 && pText) pText.textContent = `Retentando título (${attempt}/5)...`;
          
          req = await fetch(`${proxyUrl}/bills`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': authHeader
            },
            body: JSON.stringify(billPayload)
          });
          
          isRateLimit = req.status === 429;
          if (!req.ok && !isRateLimit) {
            const clone = req.clone();
            try {
              const text = await clone.text();
              if (text.toLowerCase().includes('rate limit')) {
                isRateLimit = true;
              }
            } catch(e) {}
          }
          
          if (isRateLimit) {
            if (pText) pText.textContent = `Aguardando liberação do Sienge (${attempt + 1}/5)...`;
            addLog(`> API Rate limit excedido. Aguardando ${(attempt + 1) * 3}s antes de tentar novamente...`);
            await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          } else {
            break;
          }
        }
        
        let billId = "SIM_ID_" + Date.now();
        let okTitle = false;
        if (req && req.status >= 200 && req.status < 300) {
            okTitle = true;
            let myRespText = "";
            try { myRespText = await req.text(); } catch(e) {}
            if (myRespText) {
             try {
               const resJson = JSON.parse(myRespText);
               billId = resJson.id || billId;
             } catch(e) {}
            }
           
           // Tenta ler do header Location se o json não teve ID
           if (String(billId).startsWith("SIM_ID_")) {
             const loc = req.headers.get('location') || req.headers.get('Location');
             if (loc) {
                const parts = loc.split('/');
                const lastPart = parts[parts.length - 1];
                if (!isNaN(parseInt(lastPart))) billId = lastPart;
             }
           }
           
           // Buscar o ID real se não retornou no POST nem no header
           if (String(billId).startsWith("SIM_ID_")) {
             addLog(`> Título criado (sem retorno de ID). Buscando ID gerado no Sienge...`);
             try {
               const issueDateQuery = String(t.issueDate).includes('T') ? t.issueDate.split('T')[0] : t.issueDate;
               const searchUrl = `${proxyUrl}/bills?startDate=${issueDateQuery}&endDate=${issueDateQuery}&debtorId=${parseInt(t.enterpriseId)}&creditorId=${parseInt(t.creditorId)}`;
               const searchReq = await fetch(searchUrl, {
                 method: 'GET',
                 headers: { 'Authorization': authHeader }
               });
               if (searchReq.ok) {
                 const searchData = await searchReq.json();
                 if (searchData && searchData.results && searchData.results.length > 0) {
                   const matchedBill = searchData.results.find(b => String(b.documentNumber) === String(t.documentNumber)) || searchData.results[0];
                   if (matchedBill && matchedBill.id) {
                     billId = matchedBill.id;
                     addLog(`> Título localizado na base! ID Real: ${billId}`);
                   }
                 }
               }
             } catch(errBusca) {
               addLog(`> Erro ao buscar ID do título criado: ${errBusca.message}`);
             }
           }
           
           t.siengeId = billId; // Salva o ID real
           addLog(`> Título Criado com Sucesso! Sienge ID: ${billId}`);
        } else {
           let errText = req.statusText;
           const textErr = await req.text();
           if (textErr) {
             try {
               const errorJson = JSON.parse(textErr);
               errText = errorJson.message || JSON.stringify(errorJson);
             } catch(e) {
               errText = textErr;
             }
           }
           t.errorMessage = errText;
           addLog(`> Erro POST /bills: ${errText}`);
        }
         
         if (pBar) pBar.style.width = '50%';

         // 1.5 Forma de Pagamento (PATCH na parcela)
         if (okTitle && !String(billId).startsWith("SIM_ID_")) {
           let pForm = null;
           if (t.bankInfo) {
             const pf = String(t.bankInfo.paymentForm || '').toUpperCase();
             if (pf.includes('TRANSFERÊNCIA') || pf.includes('TRANSFERENCIA') || pf.includes('TED') || pf.includes('DOC') || pf === 'BANK-TRANSFER') pForm = 'bank-transfer';
             else if (pf.includes('PIX')) pForm = 'pix';
             else if (pf.includes('BOLETO BANCÁRIO') || pf.includes('BOLETO BANCARIO')) pForm = 'boleto-bancario';
             else if (pf.includes('CONCESSIONÁRIA') || pf.includes('CONCESSIONARIA')) pForm = 'boleto-concessionaria';
           }

           if (pForm) {
             if (pText) pText.textContent = 'Preenchendo formas de pagamento...';
             addLog(`> Título gerado! Buscando ID das parcelas para injetar forma de pagamento...`);
             try {
               const instReq = await fetch(`${proxyUrl}/bills/${billId}/installments`, {
                 headers: { 'Authorization': authHeader }
               });
               if (instReq.ok) {
                 const instData = await instReq.json();
                 const installments = instData.results || instData.data || instData || [];
                 if (installments.length > 0) {
                    const installmentId = installments[0].installmentNumber || installments[0].id || 1;
                    
                    if (pForm === 'bank-transfer' && t.bankInfo) {
                      addLog(`> PATCH Transferência na parcela ${installmentId}...`);
                      
                      const isCC = t.bankInfo.accountType === 'Conta corrente' || t.bankInfo.accountType === 'CHECKING' || t.bankInfo.accountType === 'C';
                      const accTypeChar = isCC ? 'C' : 'P';
                      const accTypeLabel = isCC ? 'Conta corrente' : 'Conta poupança';
                      
                      let ag = String(t.bankInfo.agency || '').trim();
                      let agNum = ag;
                      let agDig = "";
                      if (ag.includes('-')) {
                         const parts = ag.split('-');
                         agNum = parts[0];
                         agDig = parts[1];
                      }
                      
                      const bankCode = String(t.bankInfo.bank).padStart(3, '0');
                      const bankStr = t.bankInfo.bankName ? `${bankCode}-${t.bankInfo.bankName}` : bankCode;
                      const agStr = agDig ? `${agNum}-${agDig}` : `${agNum}-`;
                      const accNumStr = String(t.bankInfo.accountNumber);
                      const accDigStr = t.bankInfo.checkDigit ? `-${t.bankInfo.checkDigit}` : '';
                      const favStr = String(t.bankInfo.nameOfRecipient || t.creditorName);

                      const notesText = `Banco: ${bankStr}\nAgência: ${agStr}\n${accTypeLabel}: ${accNumStr}${accDigStr}\nFavorecido: ${favStr}`;

                      const patchPayload = {
                        paymentTypeId: 5,
                        beneficiaryAccountType: accTypeChar,
                        beneficiaryBankCode: bankCode,
                        beneficiaryBankBranchNumber: String(agNum),
                        beneficiaryBankBranchDigit: agDig ? String(agDig) : "",
                        beneficiaryAccountNumber: accNumStr,
                        beneficiaryAccountDigit: t.bankInfo.checkDigit ? String(t.bankInfo.checkDigit) : "",
                        beneficiaryName: favStr,
                        notes: notesText
                      };

                      const pReq = await fetch(`${proxyUrl}/bills/${billId}/installments/${installmentId}/payment-information/bank-transfer`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                        body: JSON.stringify(patchPayload)
                      });
                      if (pReq.ok) {
                        addLog(`> Forma de pagamento atualizada para Transferência.`);
                      } else {
                        let errStr = pReq.statusText;
                        try { 
                          const j = await pReq.json(); 
                          errStr = JSON.stringify(j, null, 2); 
                        } catch(e) {}
                        addLog(`> Erro PATCH Transferência: ${pReq.status} - ${errStr}`);
                      }
                    } else if (pForm === 'pix') {
                        addLog(`> PATCH PIX na parcela ${installmentId}...`);
                        
                        const pixPayload = {
                          paymentTypeId: 17,
                          isUsingCreditorData: "S",
                          notes: "Pagamento via PIX (Chave padrão do Credor)"
                        };
                        
                        const pReq = await fetch(`${proxyUrl}/bills/${billId}/installments/${installmentId}/payment-information/pix`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                          body: JSON.stringify(pixPayload)
                        });
                        
                        if (pReq.ok) {
                          addLog(`> Forma de pagamento atualizada para PIX.`);
                        } else {
                          let errStr = pReq.statusText;
                          try { 
                            const j = await pReq.json(); 
                            errStr = JSON.stringify(j, null, 2); 
                          } catch(e) {}
                          addLog(`> Erro PATCH PIX: ${pReq.status} - ${errStr}`);
                        }
                     }
                     else if (pForm === 'boleto-bancario' || pForm === 'boleto-concessionaria') {
                        addLog(`> Aviso: Forma de pagamento '${pForm}' detectada, mas os dados completos (como código de barras) não constam no retorno padronizado do credor via API neste momento. (PATCH ignorado)`);
                     }
                 } else {
                   addLog(`> Erro: Nenhuma parcela encontrada para o título.`);
                 }
               }
             } catch(e) {
               addLog(`> Erro na rota de parcelas: ${e.message}`);
             }
           }
         }
         
         if (pBar) pBar.style.width = '60%';
         if (pText) pText.textContent = 'Processando anexos...';

        // 2. Upload de Anexos
        if (okTitle && !String(billId).startsWith("SIM_ID_") && t.attachments && t.attachments.length > 0) {
            for (let attId of t.attachments) {
              const att = ContasPagarState.attachments.find(a => a.id === attId);
              if (att) {
                addLog(`>> Enviando anexo: ${att.name}`);
                try {
                  const formData = new FormData();
                  formData.append('file', att.file);
                  
                  const attDesc = encodeURIComponent(att.name.substring(0, 499));
                  const attUrl = `${proxyUrl}/bills/${billId}/attachments?description=${attDesc}`;
                  
                  let attReq;
                  let isAttRateLimit = false;
                  
                  for (let attempt = 0; attempt < 5; attempt++) {
                    attReq = await fetch(attUrl, {
                      method: 'POST',
                      headers: { 'Authorization': authHeader },
                      body: formData
                    });
                    
                    isAttRateLimit = attReq.status === 429;
                    if (!attReq.ok && !isAttRateLimit) {
                      const clone = attReq.clone();
                      try {
                        const text = await clone.text();
                        if (text.toLowerCase().includes('rate limit')) isAttRateLimit = true;
                      } catch(e) {}
                    }
                    
                    if (isAttRateLimit) {
                      if (pText) pText.textContent = `Aguardando Sienge (Anexo ${attempt + 1}/5)...`;
                      addLog(`>> API Rate limit excedido para anexo. Aguardando ${(attempt + 1) * 3}s...`);
                      await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
                    } else {
                      break;
                    }
                  }
                  
                  if (attReq && attReq.ok) {
                    addLog(`>> Anexo "${att.name}" enviado com sucesso.`);
                  } else {
                    let errAtt = attReq.statusText;
                    try {
                       const errorJson = await attReq.json();
                       errAtt = errorJson.message || JSON.stringify(errorJson);
                    } catch(e) {}
                    addLog(`>> Erro ao enviar anexo "${att.name}": ${errAtt}`);
                  }
                } catch(eAtt) {
                  addLog(`>> Erro na requisição do anexo: ${eAtt.message}`);
                }
              }
            }
        } else if (t.attachments && t.attachments.length > 0) {
            addLog(`>> Anexos não enviados pois o ID do título não foi encontrado ou falhou.`);
        }

        if (t.errorMessage) {
           if (pBar) { pBar.style.width = '100%'; pBar.style.background = '#dc2626'; }
           if (pText) { pText.textContent = 'Erro'; pText.style.color = '#dc2626'; }
        } else {
           if (pBar) { pBar.style.width = '100%'; pBar.style.background = '#1e8e3e'; }
           if (pText) { pText.textContent = 'Concluído'; pText.style.color = '#1e8e3e'; }
        }

        addLog(`=== Título ${t.documentNumber} Concluído ===`);

      } catch(e) {
        t.errorMessage = e.message;
        addLog(`> ERRO GERAL NO TÍTULO ${t.documentNumber}: ${e.message}`);
        
        const pBar = document.getElementById(`cp-progress-bar-${t.id}`);
        const pText = document.getElementById(`cp-progress-text-${t.id}`);
        if (pBar) { pBar.style.width = '100%'; pBar.style.background = '#dc2626'; }
        if (pText) { pText.textContent = 'Erro'; pText.style.color = '#dc2626'; }
      }

      // Atualiza progresso
      const percent = Math.round(((i + 1) / total) * 100);
      if (barEl) barEl.style.width = `${percent}%`;
      if (statusEl) statusEl.textContent = `${i + 1} de ${total} concluídos (${percent}%)`;
      
      // Delay entre títulos para respeitar o rate limit do Sienge
      await new Promise(r => setTimeout(r, 1200));
    }

    if (titleEl) titleEl.textContent = "Processamento Finalizado!";
    addLog("Processamento finalizado com sucesso!");
    
    setTimeout(() => {
      ContasPagarState.step = 4;
      this.render();
    }, 1500);
  },

  bindEvents() {
    const dzExcel = document.getElementById('cp-dropzone-excel');
    const inExcel = document.getElementById('cp-input-excel');
    const dzAnexos = document.getElementById('cp-dropzone-anexos');
    const inAnexos = document.getElementById('cp-input-anexos');

    if (dzExcel && inExcel) {
      dzExcel.onclick = () => inExcel.click();
      inExcel.onchange = (e) => {
        if (e.target.files.length) {
          ContasPagarState.excelFile = e.target.files[0];
          this.render();
        }
      };
      // Prevent default drag behaviors
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dzExcel.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
      });
      dzExcel.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
          ContasPagarState.excelFile = file;
          this.render();
        }
      });
    }

    if (dzAnexos && inAnexos) {
      dzAnexos.onclick = () => inAnexos.click();
      inAnexos.onchange = (e) => this.handleAnexosFiles(e.target.files);
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dzAnexos.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
      });
      dzAnexos.addEventListener('drop', (e) => this.handleAnexosFiles(e.dataTransfer.files));
    }
  },

  
  removeExcel() {
    ContasPagarState.excelFile = null;
    this.render();
  },

  removeAttachment(id) {
    ContasPagarState.attachments = ContasPagarState.attachments.filter(a => a.id !== id);
    ContasPagarState.selectedAttachmentIds = (ContasPagarState.selectedAttachmentIds || []).filter(attId => attId !== id);
    ContasPagarState.titles.forEach(t => {
      t.attachments = t.attachments.filter(attId => attId !== id);
    });
    this.render();
  },

  handleAnexosFiles(fileList) {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      ContasPagarState.attachments.push({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name,
        size: file.size,
        objectUrl: URL.createObjectURL(file)
      });
    }
    this.render();
  },

  processStep1() {
    this.openValidationPopup();
    // Iniciar validação do Excel no popup
    setTimeout(() => this.executarValidacaoPlanilha(), 100);
  },

  async executarValidacaoPlanilha() {
    try {
      const data = await this.readExcel(ContasPagarState.excelFile);
      console.log("Excel Lido:", data);
      
      const popupOverlay = document.getElementById('cp-validation-popup-overlay');
      const contentDiv = popupOverlay ? document.getElementById('cp-validation-popup-content') : null;
      const statusDiv = popupOverlay ? document.getElementById('cp-validation-popup-status') : document.getElementById('cp-validation-status');
      const continueBtn = popupOverlay ? document.getElementById('cp-validation-popup-continue') : null;
      const resultsDiv = popupOverlay ? null : document.getElementById('cp-validation-results');
      
      if (!data || data.length === 0) {
        throw new Error("A planilha está vazia.");
      }

      // Validar colunas obrigatórias na primeira linha
      const firstRow = data[0];
      const requiredCols = ['Código da empresa', 'Código do credor', 'Código do documento', 'Número do documento', 'Data de emissão', 'Data de vencimento', 'Data de competência', 'Valor do título bruto', 'Código do centro de custo', 'Código do plano financeiro'];
      const missingCols = requiredCols.filter(col => !(col in firstRow));
      
      if (missingCols.length > 0) {
        throw new Error(`A planilha não contém as colunas obrigatórias: ${missingCols.join(', ')}`);
      }

      // Agrupar por Nº Documento
      const groupedByDoc = {};
      data.forEach((row, index) => {
        const docNum = row['Número do documento'];
        if (!docNum) return;
        
        if (!groupedByDoc[docNum]) {
          groupedByDoc[docNum] = {
            id: 'TITLE-' + Math.random().toString(36).substr(2, 9),
            documentNumber: docNum,
            enterpriseId: row['Código da empresa'],
            creditorId: String(row['Código do credor']).trim(),
            documentIdentificationId: row['Código do documento'],
            issueDate: row['Data de emissão'],
            billDate: row['Data de competência'],
            dueDate: row['Data de vencimento'],
            installmentsNumber: row['Quantidade de parcelas'] || 1,
            notes: row['Observação do título'] || '',
            baseDate: row['Data base'] || row['Data de emissão'],
            indexId: row['Código do indexador'] || 0,
            discount: 0,
            totalDiscount: 0,
            paymentCategoryId: String(row['Código do plano financeiro'] || '').trim(),
            paymentCategoryLabel: String(row['Código do plano financeiro'] || '').trim(),
            costCenters: [],
            totalValue: 0,
            attachments: [],
            errors: []
          };
        }
        
        const valStr = row['Valor do título bruto'];
        const value = parseFloat(valStr) || 0;
        const discStr = row['Valor desconto'];
        const discountValue = parseFloat(discStr) || 0;

        groupedByDoc[docNum].totalValue += value;
        groupedByDoc[docNum].discount = discountValue;
        groupedByDoc[docNum].totalDiscount += discountValue;
        
        groupedByDoc[docNum].costCenters.push({
          cc: row['Código do centro de custo'],
          account: row['Código do plano financeiro'],
          percCC: row['Percentual apropriado do centro de custo'],
          
          departmentId: row['Código do departamento'],
          percDep: row['Percentual apropriado no departamento'],
          
          buildingId: row['Código da obra'],
          buildingUnitId: row['Código da unidade construtiva'],
          costSheetId: row['Código do item de orçamento'],
          percBuild: row['Percentual apropriado a obra'],
          
          unitId: row['Código da unidade'],
          percUnit: row['Percentual da unidade'],
          unitPrincipal: row['Unidade principal'],
          
          taxId: row['Código do imposto'],
          ibgeCityId: row['Código do IBGE do município'],
          taxAmount: row['Valor do imposto'],
          taxRate: row['Percentual do imposto'],
          taxBase: row['Valor de incidência'],
          taxRateMarker: row['Percentual de incidência'],
          
          value: value
        });
      });

      const titles = Object.values(groupedByDoc);

      // Simulação de tempo de processamento visual
      if (statusDiv) {
        statusDiv.innerHTML = '<div class="spinner"></div><p style="margin-top: 15px;">Validando dados...</p>';
      }
      await new Promise(resolve => setTimeout(resolve, 800)); // Pequeno delay visual

      for (let title of titles) {
        if (!title.creditorId) {
          title.errors.push("ID do Credor não informado.");
        } else if (isNaN(parseInt(title.creditorId))) {
          title.errors.push("ID do Credor deve ser numérico.");
        }
      }

            const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
      const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
      
      // Fetch Planos Financeiros (financial-categories)
      const paymentCategoriesRes = await fetch(`http://${host}:${port}/sienge-proxy/financial-categories`, {
        headers: { 'Authorization': getBasicAuthHeader() }
      });

      const paymentCategories = [];
      if (paymentCategoriesRes.ok) {
        const rawPaymentCategories = await paymentCategoriesRes.json();
        const list = rawPaymentCategories.results || rawPaymentCategories;
        if (Array.isArray(list)) {
          paymentCategories.push(...list);
        }
      }
      ContasPagarState.paymentCategoriesMap = paymentCategories.reduce((map, item) => {
        if (item) {
          if (item.id != null) map[String(item.id)] = item;
          if (item.code) map[String(item.code)] = item;
          if (item.syntheticCode) map[String(item.syntheticCode)] = item;
          if (item.analyticCode) map[String(item.analyticCode)] = item;
        }
        return map;
      }, {});

      // Fetch Departamentos
      const departmentNames = {};
      try {
        const depsRes = await fetch(`http://${host}:${port}/sienge-proxy/departments?limit=200&offset=0`, {
          headers: { 'Authorization': getBasicAuthHeader() }
        });
        if (depsRes.ok) {
          const depsData = await depsRes.json();
          const list = depsData.results || depsData.data || depsData;
          if (Array.isArray(list)) {
            list.forEach(d => {
              if (d.departmentId) {
                departmentNames[String(d.departmentId)] = d.departmentName || d.name || String(d.departmentId);
              }
            });
          }
        }
      } catch (e) {
        console.error("Erro ao carregar departamentos", e);
      }

      const uniqueDeps = [...new Set(titles.flatMap(t => t.costCenters.map(cc => String(cc.departmentId).trim())).filter(d => d && d !== 'undefined'))];
      uniqueDeps.forEach(depId => {
        if (!departmentNames[depId]) {
          const mockFallback = { "31": "Tesouraria", "42": "Financeiro", "10": "Vendas" };
          departmentNames[depId] = mockFallback[depId] || depId;
        }
      });
      ContasPagarState.departmentNames = departmentNames;

      const uniqueCreditors = [...new Set(titles.map(t => t.creditorId).filter(Boolean))];
      const creditorNames = {};
      const creditorBanks = {};
      
      await Promise.all(uniqueCreditors.map(async (credId) => {
        try {
          let res = await fetch(`http://${host}:${port}/sienge-proxy/creditors/${credId}`, {
            headers: { 'Authorization': getBasicAuthHeader() }
          });
          
          if (!res.ok) {
             // Fallback: try fetching from list with ID filter
             res = await fetch(`http://${host}:${port}/sienge-proxy/creditors?limit=10&id=${credId}`, {
               headers: { 'Authorization': getBasicAuthHeader() }
             });
          }

          if (res.ok) {
            const data = await res.json();
            let cObj = data;
            if (data.results && data.results.length > 0) {
               cObj = data.results.find(c => String(c.id) === String(credId)) || data.results[0];
            } else if (data.data) {
               cObj = data.data;
            }
            
            creditorNames[credId] = cObj.name || cObj.fantasyName || cObj.corporateName || cObj.companyName || cObj.creditorName || credId;
            console.log(`[Credor ${credId}] Dados recebidos:`, cObj);
          } else {
            console.warn(`[Credor ${credId}] Sienge retornou erro HTTP: ${res.status}`);
            creditorNames[credId] = credId;
          }
        } catch(e) {
          console.error(`[Credor ${credId}] Erro ao buscar:`, e);
          creditorNames[credId] = credId;
        }

        try {
          const bankRes = await fetch(`http://${host}:${port}/sienge-proxy/creditors/${credId}/bank-informations?limit=100&offset=0`, {
            headers: { 'Authorization': getBasicAuthHeader() }
          });
          if (bankRes.ok) {
            const bankData = await bankRes.json();
            const list = bankData.results || bankData.data || bankData;
            if (Array.isArray(list) && list.length > 0) {
               const defaultBank = list.find(b => b.defaultFlag) || list[0];
               creditorBanks[credId] = defaultBank;
            }
          }
        } catch(e) {}
      }));
      
      titles.forEach(t => {
        t.creditorName = creditorNames[t.creditorId] || t.creditorId;
        t.bankInfo = creditorBanks[t.creditorId] || null;
        t.netValue = (Number(t.totalValue) || 0) - (Number(t.totalDiscount) || 0);
        const paymentCategory = ContasPagarState.paymentCategoriesMap && ContasPagarState.paymentCategoriesMap[t.paymentCategoryId];
        if (paymentCategory && paymentCategory.name) {
          t.paymentCategoryLabel = `${t.paymentCategoryId} - ${paymentCategory.name}`;
        } else {
          const mockFallback = { "2.03.02.18": "Despesas Administrativas Diversas", "1.01.01.01": "Receita de Venda de Lotes" };
          const mockName = mockFallback[t.paymentCategoryId];
          if (mockName) {
            t.paymentCategoryLabel = `${t.paymentCategoryId} - ${mockName}`;
          } else {
            t.paymentCategoryLabel = t.paymentCategoryId || '';
          }
        }
      });

      ContasPagarState.titles = titles;

      const hasErrors = titles.some(t => t.errors.length > 0);
      
      if (statusDiv) statusDiv.style.display = 'none';
      if (contentDiv) contentDiv.style.display = 'block';

      if (hasErrors) {
        let errorHtml = `
          <div class="alert alert-danger" style="margin-bottom: 20px;">
            <i data-lucide="alert-triangle"></i> Foram encontrados erros na planilha. Corrija e faça o upload novamente.
          </div>
          <table class="table" style="width: 100%;">
            <thead><tr><th>Nº Doc</th><th>Credor ID</th><th>Erros</th></tr></thead>
            <tbody>
        `;
        titles.filter(t => t.errors.length > 0).forEach(t => {
          errorHtml += `<tr><td>${t.documentNumber}</td><td>${t.creditorId}</td><td style="color:red;">${t.errors.join('<br>')}</td></tr>`;
        });
        errorHtml += `</tbody></table>
          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button class="btn btn-outline" onclick="ContasPagarState.step=1; ContasPagarState.excelFile=null; ContasPagarApp.closeValidationPopup(); ContasPagarApp.render()">Voltar e Subir Outro</button>
          </div>
        `;
        if (contentDiv) {
          contentDiv.innerHTML = errorHtml;
        } else {
          resultsDiv.innerHTML = errorHtml;
        }
        if (continueBtn) continueBtn.disabled = true;

      } else {
        const successHtml = `
          <div id="cp-val-success-alert" class="alert alert-success" style="background: #eaf8f0; color: #1e8e3e; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <i data-lucide="check-circle" style="width: 16px;"></i> ${titles.length} título(s) validados e prontos para vínculo.
          </div>
          <div style="overflow-x: auto;">
            <table class="table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8faf8;">
                  <th style="padding: 12px 8px; text-align:left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">DOC</th>
                  <th style="padding: 12px 8px; text-align:left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">Nº DOC</th>
                  <th style="padding: 12px 8px; text-align:left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">CREDOR</th>
                  <th style="padding: 12px 8px; text-align:left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap; width: 35%;">PLANO FINANCEIRO</th>
                  <th style="padding: 12px 8px; text-align:left; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap; width: 15%;">DEPARTAMENTO</th>
                  <th style="padding: 12px 8px; text-align:right; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VALOR</th>
                  <th style="padding: 12px 8px; text-align:center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">VENCIMENTO</th>
                  <th style="padding: 12px 8px; text-align:center; font-size: 0.75rem; font-weight: 700; color: #333; text-transform: uppercase; white-space: nowrap;">EXCLUIR</th>
                </tr>
              </thead>
              <tbody>${titles.map(t => {
                const depId = t.costCenters && t.costCenters[0] && t.costCenters[0].departmentId ? t.costCenters[0].departmentId : null;
                const depName = depId && ContasPagarState.departmentNames[depId] ? ContasPagarState.departmentNames[depId] : depId;
                const dep = depId ? depName : '-';
                
                const valFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(t.netValue || 0));

                return `
                <tr id="cp-val-row-${t.id}" style="border-bottom: 1px solid #e8e8e8;">
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555;">${t.documentIdentificationId || ''}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555;">${t.documentNumber || ''}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555;" title="ID: ${t.creditorId}">${t.creditorName || t.creditorId}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.paymentCategoryLabel || ''}">${t.paymentCategoryLabel || ''}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${dep}">${dep}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555; text-align:right; white-space: nowrap;">${valFormatado}</td>
                  <td style="padding: 12px 10px; font-size: 0.85rem; color: #555; text-align:center;">${this.formatFriendlyDate(t.dueDate)}</td>
                  <td style="padding: 12px 10px; text-align:center;"><button type="button" class="btn btn-outline" style="min-width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="event.stopPropagation(); ContasPagarApp.removeTitle('${t.id}')" title="Excluir Título"><i data-lucide="trash-2" style="width: 16px; color: #ff4d4f;"></i></button></td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        `;
        if (contentDiv) {
          contentDiv.innerHTML = successHtml;
        } else {
          resultsDiv.innerHTML = successHtml;
        }
        if (continueBtn) continueBtn.disabled = false;
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) {
      const popupOverlay = document.getElementById('cp-validation-popup-overlay');
      if (popupOverlay) {
        const statusDiv = document.getElementById('cp-validation-popup-status');
        const contentDiv = document.getElementById('cp-validation-popup-content');
        const continueBtn = document.getElementById('cp-validation-popup-continue');
        if (statusDiv) {
          statusDiv.innerHTML = `<div class="alert alert-danger"><i data-lucide="alert-circle"></i> ${e.message}</div>`;
        }
        if (contentDiv) {
          contentDiv.innerHTML = `<div style="margin-top: 15px; font-size: 0.95rem; color: #444;">Verifique a planilha e tente novamente.</div>`;
        }
        if (continueBtn) continueBtn.disabled = true;
      } else {
        const statusDiv = document.getElementById('cp-validation-status');
        if (statusDiv) {
          statusDiv.innerHTML = `<div class="alert alert-danger"><i data-lucide="alert-circle"></i> ${e.message}</div>
          <button class="btn btn-outline" style="margin-top:20px;" onclick="ContasPagarState.step=1; ContasPagarApp.render()">Voltar</button>`;
        }
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  },

  readExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          
          // Normalizar chaves para remover " (Obrigatório)" e " (Opcional)" e evitar falha na validação
          const normalizedJson = json.map(row => {
            const newRow = {};
            for (let key in row) {
              let newKey = key.replace(/\s*\(Obrigatório\)/gi, '').replace(/\s*\(Opcional\)/gi, '').trim();
              newRow[newKey] = row[key];
            }
            return newRow;
          });
          
          resolve(normalizedJson);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  },

  openValidationPopup() {
    const overlayId = 'cp-validation-popup-overlay';
    if (document.getElementById(overlayId)) return;

    const html = `
      <div id="${overlayId}" style="position: fixed; inset: 0; background: rgba(0,0,0,0.42); display: flex; align-items: center; justify-content: center; padding: 24px; padding-left: 260px; z-index: 9999;">
        <div style="width: min(1350px, 95%); max-height: 90vh; overflow: auto; background: white; border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,0.18); padding: 24px; position: relative;">
          <button onclick="ContasPagarApp.closeValidationPopup()" style="position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border: none; border-radius: 50%; background: #f4f4f4; cursor: pointer; font-size: 18px; line-height: 1;">×</button>
          <h3 style="margin-top: 0;">Títulos que serão criados no Sienge</h3>
          <p style="margin: 8px 0 18px; color: #444;">Revisão dos títulos antes de avançar para o vínculo de anexos.</p>
          <div id="cp-validation-popup-status" style="padding: 24px; text-align: center; color: #444;">
            <div class="spinner"></div>
            <p style="margin-top: 15px;">Validando os dados da planilha... aguarde.</p>
          </div>
          <div id="cp-validation-popup-content" style="display: none; overflow-x: auto;"></div>
          <div id="cp-validation-popup-actions" style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button class="btn btn-outline" onclick="ContasPagarApp.closeValidationPopup()">Fechar</button>
            <button id="cp-validation-popup-continue" class="btn btn-primary" disabled onclick="ContasPagarState.step=2; ContasPagarApp.closeValidationPopup(); ContasPagarApp.render();">Continuar para Vínculos</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  formatFriendlyDate(value) {
    if (!value) return '';
    const dateString = String(value).trim();
    const parts = dateString.split(/[\-\/]/);
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) {
        return `${String(c).padStart(2, '0')}/${String(b).padStart(2, '0')}/${a}`;
      }
      if (c.length === 4) {
        return `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}/${c}`;
      }
    }
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
        .map(n => String(n).padStart(2, '0')).join('/');
    }
    return dateString;
  },

  closeValidationPopup() {
    const overlay = document.getElementById('cp-validation-popup-overlay');
    if (overlay) overlay.remove();
  }
};

// Global Exposure
window.ContasPagarApp = ContasPagarApp;



