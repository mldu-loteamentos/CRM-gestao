const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, query, where, getDocs, limit } = require('firebase/firestore');

// Configuração Sienge
const SIENGE_DOMAIN = "mouraleite";
const SIENGE_USER = "mouraleite-contas-a-pagar";
const SIENGE_PASS = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj";
const SIENGE_AUTH = "Basic " + Buffer.from(`${SIENGE_USER}:${SIENGE_PASS}`).toString('base64');
const SIENGE_API_BASE = `https://api.sienge.com.br/${SIENGE_DOMAIN}/public/api/v1`;

// Configuração Firebase (usando a mesma chave pública do frontend)
const firebaseConfig = {
  apiKey: "AIzaSyBlBCaXn4y3sJDENW0GXw3ck_D2h3qknHc",
  authDomain: "crm-gestao-mldu.firebaseapp.com",
  projectId: "crm-gestao-mldu",
  storageBucket: "crm-gestao-mldu.firebasestorage.app",
  messagingSenderId: "1040392341069",
  appId: "1:1040392341069:web:6acf1beb34af663cfffe04"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper para formatar data (YYYY-MM-DD)
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Verifica se a data é o Carnaval da Moura Leite ou segunda feira
function getStartAndEndDates() {
    const today = new Date();
    const endDate = formatDate(today);
    let startDateObj = new Date(today);

    const dayOfWeek = startDateObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    if (dayOfWeek === 1) {
        // Segunda-feira: busca desde sábado (2 dias antes)
        startDateObj.setDate(startDateObj.getDate() - 2);
    } else if (dayOfWeek === 3) {
        // Quarta-feira: Para garantir que o carnaval (Segunda/Terça) seja coberto
        startDateObj.setDate(startDateObj.getDate() - 4); 
    } else if (dayOfWeek === 0) {
        startDateObj.setDate(startDateObj.getDate() - 1);
    } else {
        // Outros dias da semana, pega também o dia anterior por segurança com feriados de 1 dia
        startDateObj.setDate(startDateObj.getDate() - 1); 
    }

    const startDate = formatDate(startDateObj);
    return { startDate, endDate };
}

async function fetchFromSienge(endpoint) {
    const url = `${SIENGE_API_BASE}${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': SIENGE_AUTH
        }
    });
    if (!response.ok) {
        throw new Error(`Erro na API do Sienge (${response.status}): ${await response.text()}`);
    }
    return response.json();
}

module.exports = async function handler(req, res) {
    try {
        const { startDate, endDate } = getStartAndEndDates();
        const PAGE_LIMIT = 200;

        let clientesNovosAdicionados = 0;
        let clientesAtualizados = 0;

        // 1. PROCESSAR NOVOS CLIENTES (createdAfter / createdBefore)
        let offset = 0;
        let achouClienteExistente = false;

        console.log(`[SYNC] Iniciando busca de NOVOS clientes criados entre ${startDate} e ${endDate}...`);

        while (!achouClienteExistente) {
            const endpoint = `/customers?createdAfter=${startDate}&createdBefore=${endDate}&limit=${PAGE_LIMIT}&offset=${offset}`;
            const data = await fetchFromSienge(endpoint);
            const results = data.results || [];

            if (results.length === 0) break;

            for (const customer of results) {
                const docRef = doc(db, 'sienge_customers', String(customer.id));
                const docSnap = await getDocs(query(collection(db, 'sienge_customers'), where('id', '==', customer.id), limit(1)));
                
                if (!docSnap.empty) {
                    console.log(`[SYNC] Cliente ${customer.id} já existe na base. Parando paginação de novos cadastros.`);
                    achouClienteExistente = true;
                    break;
                }

                await setDoc(docRef, customer);
                clientesNovosAdicionados++;
            }

            offset += PAGE_LIMIT;
            
            if (!data.resultSetMetadata || offset >= data.resultSetMetadata.count) {
                break;
            }
        }

        // 2. PROCESSAR ATUALIZAÇÕES (modifiedAfter / modifiedBefore)
        offset = 0;
        console.log(`[SYNC] Iniciando busca de ATUALIZAÇÕES de clientes entre ${startDate} e ${endDate}...`);

        while (true) {
            const endpoint = `/customers?modifiedAfter=${startDate}&modifiedBefore=${endDate}&limit=${PAGE_LIMIT}&offset=${offset}`;
            const data = await fetchFromSienge(endpoint);
            const results = data.results || [];

            if (results.length === 0) break;

            for (const customer of results) {
                const docRef = doc(db, 'sienge_customers', String(customer.id));
                await setDoc(docRef, customer, { merge: true });
                clientesAtualizados++;
            }

            offset += PAGE_LIMIT;
            
            if (!data.resultSetMetadata || offset >= data.resultSetMetadata.count) {
                break;
            }
        }

        const msg = `Sincronização concluída. Novos: ${clientesNovosAdicionados}. Atualizados: ${clientesAtualizados}. Datas: ${startDate} a ${endDate}.`;
        console.log(`[SYNC] ${msg}`);
        
        return res.status(200).json({
            success: true,
            message: msg,
            novos: clientesNovosAdicionados,
            atualizados: clientesAtualizados,
            periodo: { startDate, endDate }
        });

    } catch (error) {
        console.error('[SYNC ERROR]', error);
        return res.status(500).json({ error: error.message });
    }
};
