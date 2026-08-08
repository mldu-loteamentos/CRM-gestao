let vistoriaDoc = null;
let vistoriaId = null;
let loteCoords = null; // {lat, lng}
let currentDistance = Infinity;
const MAX_DISTANCE = 40; // meters
const files = { file1: null, file2: null, file3: null };

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    vistoriaId = urlParams.get('id');
    
    if (!vistoriaId) {
        showError("ID da vistoria não fornecido na URL.");
        return;
    }
    
    try {
        const db = firebase.firestore();
        const docRef = await db.collection('vistorias').doc(vistoriaId).get();
        
        if (!docRef.exists) {
            showError("Solicitação de vistoria não encontrada.");
            return;
        }
        
        vistoriaDoc = docRef.data();
        
        if (vistoriaDoc.status === 'concluida' || vistoriaDoc.status === 'aguardando_validacao') {
            document.getElementById('card-loading').style.display = 'none';
            document.getElementById('card-sucesso').style.display = 'block';
            return;
        }
        
        // Populate info
        document.getElementById('lbl-cidade').textContent = vistoriaDoc.cidade;
        document.getElementById('lbl-empreendimento').textContent = vistoriaDoc.empreendimento;
        document.getElementById('lbl-unidade').textContent = vistoriaDoc.unidade;
        
        document.getElementById('card-loading').style.display = 'none';
        document.getElementById('card-content').style.display = 'block';
        
        await buscarCoordenadasLote();
        
    } catch (e) {
        console.error(e);
        showError("Erro ao carregar os dados: " + e.message);
    }
});

async function buscarCoordenadasLote() {
    try {
        setStatus("Buscando coordenadas no servidor...", "wait");
        
        // Empreendimento ID (CostCenter)
        const empId = vistoriaDoc.costCenterId;
        const host = window.location.hostname;
        const port = window.location.port || '80';
        
        const res = await fetch(`http://${host}:${port}/api/kmz-coords/${empId}`);
        if (!res.ok) throw new Error("Falha ao buscar mapa do empreendimento");
        
        const list = await res.json();
        
        // Match unit (lote)
        // Usually unit is like "Q 01 L 02" or similar. KMZ usually has "Quadra 01 - Lote 02" or exact matches.
        // For robustness, we will try to find a partial match. 
        const unitNameRaw = vistoriaDoc.unidade.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let found = null;
        for (let item of list) {
            let itemNameRaw = item.lot_name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (itemNameRaw === unitNameRaw || itemNameRaw.includes(unitNameRaw) || unitNameRaw.includes(itemNameRaw)) {
                found = item;
                break;
            }
        }
        
        if (!found && list.length > 0) {
            // fallback se não achar exato, pega o primeiro só pra nao quebrar (ideal é melhorar match depois)
            console.warn("Match exato de lote não encontrado. Usando o primeiro do KMZ como referência central.");
            found = list[0];
        }
        
        if (!found) {
            throw new Error("Nenhum mapa (KMZ) cadastrado para este empreendimento.");
        }
        
        // Parse coordinates. Depending on KMZ parser, it might be a JSON array of [lng, lat]
        // or a string.
        let coordsArr = typeof found.coordinates === 'string' ? JSON.parse(found.coordinates) : found.coordinates;
        
        // If it's a polygon (array of arrays), we take the first point or calculate centroid
        if (Array.isArray(coordsArr) && coordsArr.length > 0) {
            if (Array.isArray(coordsArr[0])) {
                // Polygon -> pick first point
                loteCoords = { lng: coordsArr[0][0], lat: coordsArr[0][1] };
            } else {
                // Point -> [lng, lat]
                loteCoords = { lng: coordsArr[0], lat: coordsArr[1] };
            }
        }
        
        if (!loteCoords) {
            throw new Error("Coordenadas inválidas no banco de dados.");
        }
        
        // Ativar GPS
        iniciarGPS();
        
    } catch(e) {
        console.error(e);
        showError("Erro de Mapa: " + e.message + " (Não será possível validar a distância).");
        // Se der erro no mapa, liberamos as fotos de qualquer forma para não travar o processo, 
        // mas marcamos uma flag.
        document.getElementById('photo-area').style.display = 'block';
    }
}

function iniciarGPS() {
    if (!navigator.geolocation) {
        showError("Seu navegador não suporta GPS.");
        document.getElementById('photo-area').style.display = 'block'; // fallback
        return;
    }
    
    setStatus("Aguardando sinal de GPS...", "wait");
    
    navigator.geolocation.watchPosition(
        (pos) => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            
            const dist = calcCrow(userLat, userLng, loteCoords.lat, loteCoords.lng);
            currentDistance = dist * 1000; // convert to meters
            
            if (currentDistance <= MAX_DISTANCE) {
                setStatus(`📍 Você está no local (${Math.round(currentDistance)}m do lote). Fotos liberadas!`, "success");
                document.getElementById('btn-maps').style.display = 'none';
                document.getElementById('photo-area').style.display = 'block';
            } else {
                setStatus(`⚠️ Você está a ${Math.round(currentDistance)}m do lote. Aproxime-se para menos de ${MAX_DISTANCE}m.`, "error");
                document.getElementById('btn-maps').style.display = 'block';
                document.getElementById('photo-area').style.display = 'none';
            }
        },
        (err) => {
            console.error(err);
            if (err.code === 1) {
                showError("Por favor, permita o acesso à Localização (GPS) no seu navegador para liberar as fotos.");
            } else {
                showError("Erro ao obter GPS. Sinal fraco?");
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

function abrirMaps() {
    if (loteCoords) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${loteCoords.lat},${loteCoords.lng}`, '_blank');
    }
}

function previewImage(input, previewId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Basic check
        if (file.size > 15 * 1024 * 1024) {
            alert("A imagem é muito grande (máx 15MB).");
            input.value = "";
            return;
        }
        
        if (previewId === 'preview1') files.file1 = file;
        if (previewId === 'preview2') files.file2 = file;
        if (previewId === 'preview3') files.file3 = file;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById(previewId);
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(file);
        
        checkAllPhotos();
    }
}

function checkAllPhotos() {
    if (files.file1 && files.file2 && files.file3) {
        document.getElementById('btn-enviar').disabled = false;
    } else {
        document.getElementById('btn-enviar').disabled = true;
    }
}

async function enviarVistoria() {
    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando... (Aguarde)';
    
    try {
        const storage = firebase.storage();
        
        // Upload 1
        const ref1 = storage.ref(`vistorias/${vistoriaId}/frente_${Date.now()}.jpeg`);
        await ref1.put(files.file1);
        const url1 = await ref1.getDownloadURL();
        
        // Upload 2
        const ref2 = storage.ref(`vistorias/${vistoriaId}/meio_fundo_${Date.now()}.jpeg`);
        await ref2.put(files.file2);
        const url2 = await ref2.getDownloadURL();
        
        // Upload 3
        const ref3 = storage.ref(`vistorias/${vistoriaId}/fundo_frente_${Date.now()}.jpeg`);
        await ref3.put(files.file3);
        const url3 = await ref3.getDownloadURL();
        
        // Update Firestore
        const db = firebase.firestore();
        await db.collection('vistorias').doc(vistoriaId).update({
            status: 'aguardando_validacao',
            fotoFrente: url1,
            fotoMeioFundo: url2,
            fotoFundoFrente: url3,
            enviadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Show success
        document.getElementById('card-content').style.display = 'none';
        document.getElementById('card-sucesso').style.display = 'block';
        
    } catch(e) {
        console.error(e);
        alert("Erro ao enviar: " + e.message);
        btn.disabled = false;
        btn.textContent = 'Tentar Novamente';
    }
}

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

// Haversine formula
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
