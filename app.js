// LÃ³gica Central do CRM de CobranÃ§a Moura Leite
// Moura Leite Loteamentos - ERP Sienge & Azure AD Integration

// Interceptador Global de Fetch para rotear o Sienge Proxy e Rotas API para a Vercel/Firebase
(function() {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
      if (key === "crm_moura_notes") {
          window.agendaItemsCache = null;
      }
      originalSetItem.apply(this, arguments);
  };

  let originalSaveNotesToFirebase = null;
  Object.defineProperty(window, 'saveNotesToFirebase', {
      set: function(val) { originalSaveNotesToFirebase = val; },
      get: function() {
          if (!originalSaveNotesToFirebase) return undefined;
          return function() {
              window.agendaItemsCache = null;
              return originalSaveNotesToFirebase.apply(this, arguments);
          };
      },
      configurable: true
  });
})();
(function() {
  const _origFetch = window.fetch;
  window.fetch = async function() {
    var args = Array.prototype.slice.call(arguments);
    if (typeof args[0] === 'string') {
      if (args[0].includes('/sienge-proxy')) {
        args[0] = args[0].replace(/http:\/\/[^:\/]+(:\d+)?\/sienge-proxy/g, '/api/sienge-proxy');
        args[0] = args[0].replace(window.location.origin + '/sienge-proxy', '/api/sienge-proxy');
      }
    }
    return _origFetch.apply(this, args);
  };
})();
// Override lucide.createIcons para evitar que Ã­cones invÃ¡lidos travem o app
if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
  const originalCreateIcons = lucide.createIcons;
  lucide.createIcons = function(options) {
    try {
        const prefixMap = {};
        const nameMap = {};
        const allStages = [...(window.EtapasJudiciaisState || [])].sort((a,b) => (a.order || 0) - (b.order || 0));
        
        let topIndex = 1;
        allStages.filter(s => !s.parentId).forEach(s => {
            const stageName = s.nome || s.name || '';
            if (!stageName) return;
            
            let childIndex = 1;
            const children = allStages.filter(child => child.parentId === s.id);
            if (children.length > 0) {
                children.forEach(child => {
                    const childName = child.nome || child.name || '';
                    if (!childName) return;
                    const childPrefix = $topIndex.;
                    prefixMap[child.id] = childPrefix;
                    nameMap[childName] = { prefix: childPrefix, name: childName, id: child.id, days: child.dias || child.days || 0, order: topIndex + (childIndex/100) };
                    childIndex++;
                });
            } else {
                prefixMap[s.id] = String(topIndex);
                nameMap[stageName] = { prefix: String(topIndex), name: stageName, id: s.id, days: s.dias || s.days || 0, order: topIndex };
            }
            topIndex++;
        });

        nameMap["Sem Fase"] = { prefix: "0", name: "Sem Fase", id: "sem-fase", days: 0, order: 0 };

        const fmtBRL = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const buildTimelineHtml = (title, list, isGeneral = false) => {
            const agg = {};
            Object.values(nameMap).forEach(v => {
                agg[v.prefix] = { ...v, count: 0, value: 0 };
            });
            list.forEach(client => {
                const cid = String(client.customerId);
                const customerNotes = (AppState.judNotes && AppState.judNotes[cid]) ? AppState.judNotes[cid] : [];
                const validJudNotes = customerNotes.filter(n => n.type === "Judicial" && n.fase !== "Nota Interna" && n.status !== "Cancelada");
                let fase = "Sem Fase";
                if (validJudNotes.length > 0) {
                    validJudNotes.sort((a,b) => new Date(b.date) - new Date(a.date));
                    fase = validJudNotes[0].fase;
                }
                const info = nameMap[fase] || nameMap["Sem Fase"];
                const value = (client.overdueValue || 0) + (client.overdueCharges || 0);
                if (agg[info.prefix]) {
                    agg[info.prefix].count += (client.billIds ? client.billIds.length : 1);
                    agg[info.prefix].value += value;
                }
            });
            const sortedAgg = Object.values(agg).sort((a, b) => a.order - b.order);
            
            const titleHtml = <div style="font-size: $( ? '13px' : '11px'); font-weight: 900; color: #0f172a; margin-bottom: 6px; text-transform: uppercase;"></div>;
            
            let timelineCardsHtml = "";
            for (let i = 0; i < sortedAgg.length; i++) {
                const item = sortedAgg[i];
                const isActive = item.count > 0;
                let cardHtml = "";
                if (isActive) {
                    cardHtml = <div style="background: white; border: 1.5px solid #10b981; border-radius: 6px; width: 44px; padding: 10px 2px 4px 2px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative; flex-shrink: 0;">
                        <div style="background: #10b981; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 8px; position: absolute; top: -9px; left: 50%; transform: translateX(-50%); border: 2px solid white;"> + item.prefix + </div>
                        <div style="color: #64748b; font-size: 7px; text-transform: uppercase; font-weight: 700; margin-bottom: 1px;">TÃ­t.</div>
                        <div style="font-size: 11px; font-weight: 900; color: #0f172a;"> + item.count + </div>
                        <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
                        <div style="color: #ef4444; font-size: 8px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 1px;"> + fmtBRL(item.value) + </div>
                    </div>;
                } else {
                    cardHtml = <div style="background: white; border: 1px solid #e2e8f0; border-radius: 4px; width: 18px; padding: 6px 1px 2px 1px; text-align: center; position: relative; flex-shrink: 0; opacity: 0.6;">
                        <div style="background: #94a3b8; color: white; width: 12px; height: 12px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 6px; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); border: 1px solid white;"> + item.prefix + </div>
                        <div style="font-size: 8px; font-weight: 900; color: #94a3b8;">0</div>
                    </div>;
                }
                
                let arrowHtml = "";
                if (i < sortedAgg.length - 1) {
                    arrowHtml = <div style="display: flex; align-items: center; justify-content: center; flex: 1; min-width: 4px;">
                        <div style="width: 100%; height: 1.5px; background: #cbd5e1; position: relative;">
                            <div style="position: absolute; right: -2px; top: -2.5px; width: 0; height: 0; border-top: 3px solid transparent; border-bottom: 3px solid transparent; border-left: 4px solid #cbd5e1;"></div>
                        </div>
                    </div>;
                }
                timelineCardsHtml += cardHtml + arrowHtml;
            }
            
            const timelineHtml = <div style="display: flex; flex-wrap: nowrap; gap: 2px; align-items: center; width: 100%; padding-top: 10px;">
                 + timelineCardsHtml + 
            </div>;
            
            const generalMargin = isGeneral ? '15px' : '10px';
            const generalBorder = isGeneral ? '1px dashed #e2e8f0' : 'none';
            const generalPad = isGeneral ? '10px' : '0';
            
            return {
                html: <div style="margin-bottom:  + generalMargin + ; border-bottom:  + generalBorder + ; padding-bottom:  + generalPad + ;">
                     + titleHtml + 
                     + timelineHtml + 
                </div>,
                agg: sortedAgg
            };
        };

        const generalList = window._subjudiceList;
        
        let totalValue = 0, totalTitles = 0, totalDaysDelay = 0, clientsWithDelay = 0;
        generalList.forEach(client => {
            totalValue += (client.overdueValue || 0) + (client.overdueCharges || 0);
            totalTitles += (client.billIds ? client.billIds.length : 1);
            if (client.maxDaysDelay > 0) {
                totalDaysDelay += client.maxDaysDelay;
                clientsWithDelay++;
            }
        });
        const avgDelay = clientsWithDelay > 0 ? Math.round(totalDaysDelay / clientsWithDelay) : 0;
        const totalClients = new Set(generalList.map(c => c.customerId)).size;

        const companyGroups = {};
        generalList.forEach(c => {
            const compId = String(c.companyId);
            if (!companyGroups[compId]) companyGroups[compId] = [];
            companyGroups[compId].push(c);
        });

        const sortedCompanies = Object.keys(companyGroups).sort((a,b) => {
            const nameA = window.getCompanyName ? window.getCompanyName(a) : "Empresa " + a;
            const nameB = window.getCompanyName ? window.getCompanyName(b) : "Empresa " + b;
            return nameA.localeCompare(nameB);
        });

        const generalResult = buildTimelineHtml("VisÃ£o Geral", generalList, true);
        let timelinesHtml = generalResult.html;
        
        sortedCompanies.forEach(compId => {
            const compName = window.getCompanyName ? window.getCompanyName(compId) : "Empresa " + compId;
            timelinesHtml += buildTimelineHtml(compName, companyGroups[compId], false).html;
        });

        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.top = "-9999px";
        container.style.left = "-9999px";
        container.style.width = "1122px"; 
        container.style.minHeight = "793px"; 
        container.style.backgroundColor = "#ffffff"; 
        container.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";
        container.style.padding = "20px 30px";
        container.style.boxSizing = "border-box";
        container.id = "mapa-juridico-pdf-container";

        let legendCardsHtml = "";
        generalResult.agg.forEach(item => {
            const bgStr = item.count > 0 ? '#10b981' : '#94a3b8';
            legendCardsHtml += <div style="display: flex; align-items: center; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 8px; border: 1px solid #e2e8f0;">
                <span style="background:  + bgStr + ; color: white; width: 14px; height: 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 7px; margin-right: 4px;">
                     + item.prefix + 
                </span>
                <span style="font-weight: 700; color: #334155; margin-right: 3px;"> + item.name + </span>
                <span style="color: #64748b; font-size: 7px;">( + item.days +  d)</span>
            </div>;
        });

        container.innerHTML = 
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="https://yt3.googleusercontent.com/rx0DOaXFXLF0HHeZtC_xI7vR23Y7Jxmm7gA6o_emTX6qFNIDo3J91z11ASXDNypT57crV1EPOQ=s900-c-k-c0x00ffffff-no-rj" alt="Logo Moura Leite" style="height: 35px; object-fit: contain;">
                    <div>
                        <h1 style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 800;">Mapa JurÃ­dico</h1>
                        <p style="margin: 2px 0 0 0; color: #64748b; font-size: 10px;">PosiÃ§Ã£o:  + new Date().toLocaleDateString('pt-BR') +  Ã s  + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) + </p>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex: 1; margin-left: 30px;">
                    <div style="background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; flex: 1; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="color: #64748b; font-size: 8px; text-transform: uppercase; font-weight: 700;">Valor em Atraso</div>
                            <div style="color: #0f172a; font-size: 14px; font-weight: 900;"> + fmtBRL(totalValue) + </div>
                        </div>
                        <div style="background: #fee2e2; color: #ef4444; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        </div>
                    </div>
                    <div style="background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; flex: 1; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="color: #64748b; font-size: 8px; text-transform: uppercase; font-weight: 700;">Clientes</div>
                            <div style="color: #0f172a; font-size: 14px; font-weight: 900;"> + totalClients + </div>
                        </div>
                        <div style="background: #ffedd5; color: #f97316; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </div>
                    </div>
                    <div style="background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; flex: 1; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="color: #64748b; font-size: 8px; text-transform: uppercase; font-weight: 700;">TÃ­tulos</div>
                            <div style="color: #0f172a; font-size: 14px; font-weight: 900;"> + totalTitles + </div>
                        </div>
                        <div style="background: #dcfce7; color: #22c55e; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                    </div>
                    <div style="background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; flex: 1; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="color: #64748b; font-size: 8px; text-transform: uppercase; font-weight: 700;">Atraso MÃ©dio</div>
                            <div style="color: #0f172a; font-size: 14px; font-weight: 900;"> + avgDelay +  dias</div>
                        </div>
                        <div style="background: #dbeafe; color: #3b82f6; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; width: 100%;">
                 + timelinesHtml + 
            </div>

            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-top: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                     + legendCardsHtml + 
                </div>
            </div>
        ;        document.body.appendChild(container);

        html2canvas(container, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: "#ffffff" 
        }).then(canvas => {
            const imgData = canvas.toDataURL("image/png");
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF("l", "mm", "a4");
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgProps = pdf.getImageProperties(imgData);
            const ratio = imgProps.width / imgProps.height;
            let finalWidth = pdfWidth;
            let finalHeight = pdfWidth / ratio;
            
            if (finalHeight > pdfHeight) {
                finalHeight = pdfHeight;
                finalWidth = pdfHeight * ratio;
            }

            pdf.addImage(imgData, "PNG", 0, 0, finalWidth, finalHeight);
            pdf.save("Mapa_Juridico_SubJudice.pdf");
            
            document.body.removeChild(container);
            if (btn) {
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        }).catch(err => {
            console.error("Erro ao gerar mapa jurÃ­dico:", err);
            alert("Ocorreu um erro ao gerar o PDF. Verifique o console.");
            document.body.removeChild(container);
            if (btn) {
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        });

    } catch (e) {
        console.error(e);
        if (btn) {
            btn.innerHTML = oldHtml;
            btn.disabled = false;
        }
    }
};
