let currentVistoriaId = null;
let currentVistoriaDoc = null;
let loteCoords = null; // {lat, lng}
let currentDistance = Infinity;
const MAX_DISTANCE = 20; // meters
const files = { file1: null, file2: null, file3: null };

// Lista de lotes carregados
let loadedVistorias = [];
let watchId = null;

// Aguardar o firebaseDb estar disponível
async function waitForFirebase() {
    let retries = 20;
    while (!window.firebaseDb && retries > 0) {
        await new Promise(r => setTimeout(r, 100));
        retries--;
    }
    if (!window.firebaseDb) throw new Error("Falha ao inicializar o Firebase. Verifique sua conexão.");
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await waitForFirebase();
        
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        const idsParam = urlParams.get('ids');
        
        let idsToLoad = [];
        if (idsParam) {
            idsToLoad = idsParam.split(',').map(id => id.trim()).filter(id => id);
        } else if (idParam) {
            idsToLoad = [idParam];
        }
        
        if (idsToLoad.length === 0) {
            showError("ID(s) da vistoria não fornecido(s) na URL.");
            return;
        }
        
        const { getDoc, doc } = window.firebaseCollections;
        
        // Carregar todas as vistorias
        loadedVistorias = [];
        for (const vId of idsToLoad) {
            const docRef = doc(window.firebaseDb, 'vistorias', vId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                loadedVistorias.push({ id: vId, ...snap.data() });
            }
        }
        
        if (loadedVistorias.length === 0) {
            showError("Nenhuma vistoria encontrada.");
            return;
        }
        
        document.getElementById('card-loading').style.display = 'none';
        
        // Se houver mais de um, mostrar a lista
        if (loadedVistorias.length > 1) {
            renderizarLista();
        } else {
            // Se houver apenas 1, abrir direto
            abrirVistoria(loadedVistorias[0].id);
        }
        
        // Botão voltar
        document.getElementById('btn-voltar').addEventListener('click', () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            document.getElementById('card-content').style.display = 'none';
            document.getElementById('card-list').style.display = 'block';
        });
        
        document.getElementById('btn-voltar-sucesso').addEventListener('click', () => {
            document.getElementById('card-sucesso').style.display = 'none';
            // Atualizar status localmente e voltar para a lista
            if (currentVistoriaDoc) {
                currentVistoriaDoc.status = 'aguardando_validacao';
            }
            renderizarLista();
        });
        
    } catch (e) {
        console.error(e);
        showError("Erro ao carregar os dados: " + e.message);
    }
});

function renderizarLista() {
    const container = document.getElementById('lots-list-container');
    container.innerHTML = '';
    
    // Ordenar para agrupar visualmente
    loadedVistorias.sort((a, b) => (a.cidade || "").localeCompare(b.cidade || "") || (a.empreendimento || "").localeCompare(b.empreendimento || ""));
    
    loadedVistorias.forEach(v => {
        const item = document.createElement('div');
        item.style.padding = "15px";
        item.style.marginBottom = "10px";
        item.style.borderRadius = "8px";
        item.style.border = "1px solid #e2e8f0";
        item.style.cursor = "pointer";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        
        let statusBadge = '';
        if (v.status === 'concluida' || v.status === 'aguardando_validacao') {
            item.style.background = "#f1f5f9";
            item.style.opacity = "0.7";
            statusBadge = `<span style="background: #22c55e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Enviado</span>`;
        } else {
            item.style.background = "#ffffff";
            statusBadge = `<span style="background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Pendente</span>`;
        }
        
        item.innerHTML = `
            <div>
                <div style="font-weight: bold; margin-bottom: 4px;">${v.cidade || '-'} - ${v.empreendimento || '-'}</div>
                <div style="color: #64748b; font-size: 0.9rem;">Unidade: ${v.unidade || '-'}</div>
            </div>
            <div>${statusBadge}</div>
        `;
        
        item.addEventListener('click', () => {
            if (v.status === 'concluida' || v.status === 'aguardando_validacao') {
                alert("Esta vistoria já foi enviada!");
                return;
            }
            abrirVistoria(v.id);
        });
        
        container.appendChild(item);
    });
    
    document.getElementById('card-list').style.display = 'block';
}

async function abrirVistoria(id) {
    currentVistoriaId = id;
    currentVistoriaDoc = loadedVistorias.find(v => v.id === id);
    
    if (!currentVistoriaDoc) return;
    
    document.getElementById('card-list').style.display = 'none';
    document.getElementById('card-content').style.display = 'block';
    
    // Configura botões de voltar
    if (loadedVistorias.length > 1) {
        document.getElementById('btn-voltar').style.display = 'block';
        document.getElementById('btn-voltar-sucesso').style.display = 'inline-block';
        document.getElementById('msg-fechar').style.display = 'none';
    } else {
        document.getElementById('btn-voltar').style.display = 'none';
        document.getElementById('btn-voltar-sucesso').style.display = 'none';
        document.getElementById('msg-fechar').style.display = 'block';
    }
    
    if (currentVistoriaDoc.status === 'concluida' || currentVistoriaDoc.status === 'aguardando_validacao') {
        document.getElementById('card-content').style.display = 'none';
        document.getElementById('card-sucesso').style.display = 'block';
        return;
    }
    
    document.getElementById('lbl-cidade').textContent = currentVistoriaDoc.cidade || '-';
    document.getElementById('lbl-empreendimento').textContent = currentVistoriaDoc.empreendimento || '-';
    if (document.getElementById('lbl-unidade')) {
        document.getElementById('lbl-unidade').textContent = currentVistoriaDoc.unidade || '-';
    }
    
    if (currentVistoriaDoc.createdAt) {
        let createdAtDate = currentVistoriaDoc.createdAt;
        if (createdAtDate.toDate) createdAtDate = createdAtDate.toDate();
        else if (typeof createdAtDate === 'string') createdAtDate = new Date(createdAtDate);
        
        const diffTime = Math.abs(new Date() - createdAtDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        document.getElementById('lbl-dias-solicitado').textContent = `Vistoria solicitada há ${diffDays} dia(s)`;
    }
    
    document.getElementById('form-area').style.display = 'block';
    
    // Resetar formulário
    document.getElementById('q-agua').value = '';
    document.getElementById('q-energia').value = '';
    document.getElementById('q-entulho').value = '';
    document.getElementById('q-acesso').value = '';
    document.getElementById('q-estagio').value = '';
    if(document.getElementById('q-obs')) document.getElementById('q-obs').value = '';
    
    // Resetar fotos
    files.file1 = null; files.file2 = null; files.file3 = null;
    document.getElementById('input-foto1').value = ""; document.getElementById('preview1').style.display = 'none';
    document.getElementById('input-foto2').value = ""; document.getElementById('preview2').style.display = 'none';
    document.getElementById('input-foto3').value = ""; document.getElementById('preview3').style.display = 'none';
    document.getElementById('btn-enviar').disabled = true;
    
    await buscarCoordenadasLote();
}

async function buscarCoordenadasLote() {
    try {
        setStatus("Buscando coordenadas...", "wait");
        
        const empId = currentVistoriaDoc.costCenterId;
        if (!empId) throw new Error("Sem Centro de Custo vinculado");

        const { doc, getDoc } = window.firebaseCollections;
        const kmzRef = doc(window.firebaseDb, 'kmz_coordinates', String(empId));
        
        let foundLiveCoords = null;
        try {
            const docSnap = await getDoc(kmzRef);
            if (docSnap.exists()) {
                const list = docSnap.data().placemarks || [];
                const unitNameRaw = String(currentVistoriaDoc.unidade).toLowerCase().replace(/[^a-z0-9]/g, '');
                
                let found = null;
                for (let item of list) {
                    let itemNameRaw = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (itemNameRaw === unitNameRaw || itemNameRaw.includes(unitNameRaw) || unitNameRaw.includes(itemNameRaw)) {
                        found = item;
                        break;
                    }
                }
                
                if (!found && list.length > 0) {
                    found = list[0];
                    alert(`Atenção: O lote "${currentVistoriaDoc.unidade}" não foi encontrado dentro do arquivo KMZ! O sistema vai usar a coordenada do primeiro item que achou no arquivo: "${found.name}".`);
                }
                
                if (found) {
                    const coordsStr = found.coords.trim().split(' ')[0];
                    const coordsArr = coordsStr.split(',');
                    if (coordsArr && coordsArr.length >= 2) {
                        foundLiveCoords = { lng: parseFloat(coordsArr[0]), lat: parseFloat(coordsArr[1]) };
                    }
                }
            }
        } catch(e) {
            console.warn("Falha ao buscar KMZ em tempo real. Tentando cache local.", e);
        }

        if (foundLiveCoords) {
            loteCoords = foundLiveCoords;
            console.log("Usando KMZ ao vivo:", loteCoords);
            window._debugCoordSource = "KMZ (Live)";
        } else if (currentVistoriaDoc.loteCoords && currentVistoriaDoc.loteCoords.lat && currentVistoriaDoc.loteCoords.lng) {
            loteCoords = currentVistoriaDoc.loteCoords;
            console.log("Usando coordenadas salvas em cache no documento da vistoria.");
            window._debugCoordSource = "Cache (Antigo)";
        } else {
            throw new Error("Lote não encontrado no arquivo KMZ nem no cache da vistoria.");
        }
        
        // --- DEBUG INFO ---
    try {
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debug-coord-div';
        debugDiv.style.fontSize = '10px';
        debugDiv.style.color = '#888';
        debugDiv.style.marginTop = '10px';
        debugDiv.style.textAlign = 'center';
        debugDiv.innerHTML = `DEBUG: ID:${currentVistoriaDoc.costCenterId || 'null'} | Fonte: ${window._debugCoordSource || 'N/A'}<br>Lote: ${loteCoords.lat.toFixed(5)}, ${loteCoords.lng.toFixed(5)}`;
        document.getElementById('card-content').appendChild(debugDiv);
    } catch(e){}
    // ------------------

        iniciarGPS();
        
    } catch(e) {
        console.error(e);
        showError("Erro de Mapa: " + e.message + " (Não será possível validar a distância).");
        document.getElementById('photo-area').style.display = 'block';
    }
}

function iniciarGPS() {
    if (!navigator.geolocation) {
        showError("Seu navegador não suporta GPS.");
        document.getElementById('photo-area').style.display = 'block';
        return;
    }
    
    setStatus("Aguardando sinal de GPS...", "wait");
    
    if (watchId) navigator.geolocation.clearWatch(watchId);
    
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            
            const dist = calcCrow(userLat, userLng, loteCoords.lat, loteCoords.lng);
            currentDistance = Math.round(dist * 1000);
            
            try {
                const dbg = document.getElementById('debug-coord-div');
                if(dbg) {
                    dbg.innerHTML = `DEBUG: ID:${currentVistoriaDoc.costCenterId || 'null'} | Fonte: ${window._debugCoordSource || 'N/A'}<br>Lote: ${loteCoords.lat.toFixed(5)}, ${loteCoords.lng.toFixed(5)}<br>User: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}<br>Dist: ${currentDistance}m`;
                }
            } catch(e){}
            
            // Salvar GPS atual globalmente para a marca d'água
            window.currentVistoriaGps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            
            if (currentDistance <= 20) {
                setStatus(`📍 Você está no local (${Math.round(currentDistance)}m do lote). Perguntas e Fotos liberadas!`, "success");
                document.getElementById('btn-maps').style.display = 'none';
                document.getElementById('photo-area').style.display = 'block';
                document.getElementById('q-agua').disabled = false;
                document.getElementById('q-energia').disabled = false;
                document.getElementById('q-entulho').disabled = false;
                document.getElementById('q-acesso').disabled = false;
                document.getElementById('q-estagio').disabled = false;
                if(document.getElementById('q-obs')) document.getElementById('q-obs').disabled = false;
            } else {
                let distFormatStr = currentDistance > 999 
                    ? (currentDistance / 1000).toFixed(1).replace('.', ',') + 'km' 
                    : Math.round(currentDistance) + 'm';
                setStatus(`⚠️ Você está a ${distFormatStr} do lote. Aproxime-se para menos de 20m para liberar as respostas.`, "error");
                document.getElementById('btn-maps').style.display = 'block';
                document.getElementById('photo-area').style.display = 'none';
                document.getElementById('q-agua').disabled = true;
                document.getElementById('q-energia').disabled = true;
                document.getElementById('q-entulho').disabled = true;
                document.getElementById('q-acesso').disabled = true;
                document.getElementById('q-estagio').disabled = true;
                if(document.getElementById('q-obs')) document.getElementById('q-obs').disabled = true;
            }
        },
        (err) => {
            console.error(err);
            if (err.code === 1) {
                showError("Por favor, permita o acesso à Localização (GPS) no seu navegador.");
            } else {
                showError("Erro ao obter GPS. Sinal fraco?");
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

// Escopo global para HTML attributes (onclick/onchange)
window.abrirMaps = function() {
    if (loteCoords) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${loteCoords.lat},${loteCoords.lng}`, '_blank');
    }
};

window.previewImage = function(input, previewId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        if (file.size > 15 * 1024 * 1024) {
            alert("A imagem é muito grande (máx 15MB).");
            input.value = "";
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgObj = new Image();
            imgObj.onload = function() {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                // Manter resolução original
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                ctx.drawImage(imgObj, 0, 0);
                
                // Configurar texto de marca d'água
                const dateStr = new Date().toLocaleString("pt-BR");
                const locationStr = window.currentVistoriaGps ? 
                    `Lat: ${window.currentVistoriaGps.lat.toFixed(6)}, Lng: ${window.currentVistoriaGps.lng.toFixed(6)}` : 
                    "Localização Indisponível";
                
                const watermarkText = `${dateStr} | ${locationStr}`;
                
                const fontSize = Math.max(14, Math.floor(canvas.width / 40));
                ctx.font = `${fontSize}px Arial`;
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                
                const textWidth = ctx.measureText(watermarkText).width;
                const padding = fontSize * 0.5;
                const x = canvas.width - textWidth - (padding * 2) - 10;
                const y = canvas.height - fontSize - (padding * 2) - 10;
                
                // Fundo semi-transparente
                ctx.fillRect(x, y, textWidth + (padding * 2), fontSize + (padding * 2));
                
                // Texto branco
                ctx.fillStyle = "white";
                ctx.textBaseline = "top";
                ctx.fillText(watermarkText, x + padding, y + padding);
                
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name, { type: 'image/jpeg' });
                    if (previewId === 'preview1') files.file1 = newFile;
                    if (previewId === 'preview2') files.file2 = newFile;
                    if (previewId === 'preview3') files.file3 = newFile;
                    
                    const imgPreview = document.getElementById(previewId);
                    imgPreview.src = URL.createObjectURL(newFile);
                    imgPreview.style.display = 'block';
                    window.verificarFormulario();
                }, 'image/jpeg', 0.85);
            };
            imgObj.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
};

window.verificarFormulario = function() {
    const qAgua = document.getElementById('q-agua').value;
    const qEnergia = document.getElementById('q-energia').value;
    const qEntulho = document.getElementById('q-entulho').value;
    const qAcesso = document.getElementById('q-acesso').value;
    const qEstagio = document.getElementById('q-estagio').value;
    
    // Verifica obrigatoriedade de fotos 2 e 3
    let fotosOpcionais = false;
    if (qAcesso === 'nao' || qEstagio === 'casa_pronta_sem_acabamento' || qEstagio === 'casa_pronta_com_morador' || qEstagio === 'apenas_muro') {
        fotosOpcionais = true;
    }
    
    // Atualizar UI das fotos
    const block2 = document.getElementById('block-foto2');
    const block3 = document.getElementById('block-foto3');
    const btnMais = document.getElementById('btn-mais-fotos');
    
    if (fotosOpcionais) {
        if (!window.fotosReveladas) {
            block2.style.display = 'none';
            block3.style.display = 'none';
            btnMais.style.display = 'inline-block';
            // Se as escondeu, pode limpar as fotos se o usuario tinha selecionado
            // Mas não vamos limpar para não perder se ele só mudou o select sem querer
        } else {
            block2.style.display = 'block';
            block3.style.display = 'block';
            btnMais.style.display = 'none';
        }
    } else {
        block2.style.display = 'block';
        block3.style.display = 'block';
        btnMais.style.display = 'none';
        window.fotosReveladas = false;
    }
    
    // Validação de preenchimento
    const formCompleto = (qAgua && qEnergia && qEntulho && qAcesso && qEstagio);
    
    // Validação de fotos
    let fotosCompletas = false;
    if (fotosOpcionais) {
        fotosCompletas = !!files.file1; // Apenas a 1 é obrigatória
    } else {
        fotosCompletas = (files.file1 && files.file2 && files.file3);
    }
    
    if (formCompleto && fotosCompletas) {
        document.getElementById('btn-enviar').disabled = false;
    } else {
        document.getElementById('btn-enviar').disabled = true;
    }
};

window.revelarMaisFotos = function() {
    window.fotosReveladas = true;
    document.getElementById('block-foto2').style.display = 'block';
    document.getElementById('block-foto3').style.display = 'block';
    document.getElementById('btn-mais-fotos').style.display = 'none';
    window.verificarFormulario();
};

window.enviarVistoria = async function() {
    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando... (Aguarde)';
    
    try {
        const { ref, uploadBytes, getDownloadURL, doc, updateDoc, serverTimestamp } = window.firebaseCollections;
        
        let url1 = null, url2 = null, url3 = null;

        const uploadWithTimeout = (ref, file, timeoutMs = 15000) => {
            return Promise.race([
                uploadBytes(ref, file),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Tempo limite de upload excedido (CORS ou Falha de Rede).")), timeoutMs))
            ]);
        };

        // Upload 1
        if (files.file1) {
            const ref1 = ref(window.firebaseStorage, `vistorias/${currentVistoriaId}/frente_${Date.now()}.jpeg`);
            await uploadWithTimeout(ref1, files.file1);
            url1 = await getDownloadURL(ref1);
        }
        
        // Upload 2
        if (files.file2) {
            const ref2 = ref(window.firebaseStorage, `vistorias/${currentVistoriaId}/meio_fundo_${Date.now()}.jpeg`);
            await uploadWithTimeout(ref2, files.file2);
            url2 = await getDownloadURL(ref2);
        }
        
        // Upload 3
        if (files.file3) {
            const ref3 = ref(window.firebaseStorage, `vistorias/${currentVistoriaId}/fundo_frente_${Date.now()}.jpeg`);
            await uploadWithTimeout(ref3, files.file3);
            url3 = await getDownloadURL(ref3);
        }
        
        const respostas = {
            possuiAgua: document.getElementById('q-agua').value,
            possuiEnergia: document.getElementById('q-energia').value,
            possuiEntulho: document.getElementById('q-entulho').value,
            permiteAcesso: document.getElementById('q-acesso').value,
            estagioObra: document.getElementById('q-estagio').value,
            observacoes: document.getElementById('q-obs') ? document.getElementById('q-obs').value : ""
        };
        
        // Update Firestore
        const docRef = doc(window.firebaseDb, 'vistorias', currentVistoriaId);
        await updateDoc(docRef, {
            status: 'aguardando_validacao',
            respostasFormulario: respostas,
            fotoFrente: url1,
            fotoMeioFundo: url2,
            fotoFundoFrente: url3,
            enviadoEm: serverTimestamp()
        });
        
        if (watchId) navigator.geolocation.clearWatch(watchId);
        
        document.getElementById('card-content').style.display = 'none';
        document.getElementById('card-sucesso').style.display = 'block';
        
    } catch(e) {
        console.error(e);
        alert("Erro ao enviar: " + e.message);
        btn.disabled = false;
        btn.textContent = 'Tentar Novamente';
    }
};

function setStatus(msg, type) {
    const el = document.getElementById('status-container');
    el.style.display = 'block';
    el.textContent = msg;
    el.className = 'status-box';
    if (type === 'error') el.classList.add('status-error');
    if (type === 'success') el.classList.add('status-success');
}

function showError(msg) {
    document.getElementById('card-loading').style.display = 'none';
    const content = document.getElementById('card-content');
    content.style.display = 'block';
    setStatus(msg, "error");
}

function calcCrow(lat1, lon1, lat2, lon2) {
    var R = 6371; // km
    var dLat = toRad(lat2-lat1);
    var dLon = toRad(lon2-lon1);
    var lat1 = toRad(lat1);
    var lat2 = toRad(lat2);

    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c;
    return d;
}
function toRad(Value) {
    return Value * Math.PI / 180;
}
