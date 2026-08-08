const { initializeApp } = require('firebase/app');
const { getFirestore, doc, writeBatch } = require('firebase/firestore');

// Configuração Sienge
const SIENGE_DOMAIN = "mouraleite";
const SIENGE_USER = "mouraleite-contas-a-pagar";
const SIENGE_PASS = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj";
const SIENGE_AUTH = "Basic " + Buffer.from(`${SIENGE_USER}:${SIENGE_PASS}`).toString('base64');
const SIENGE_API_BASE = `https://api.sienge.com.br/${SIENGE_DOMAIN}/public/api/v1`;

// Configuração Firebase
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

async function runFullSync() {
    console.log("==========================================");
    console.log("INICIANDO DOWNLOAD COMPLETO DE CLIENTES");
    console.log("==========================================");

    const PAGE_LIMIT = 200;
    let offset = 0;
    let totalAdicionados = 0;

    while (true) {
        console.log(`Buscando clientes (offset: ${offset})...`);
        try {
            const endpoint = `/customers?limit=${PAGE_LIMIT}&offset=${offset}`;
            const data = await fetchFromSienge(endpoint);
            const results = data.results || [];

            if (results.length === 0) {
                console.log("Nenhum cliente retornado. Fim da paginação.");
                break;
            }

            const batch = writeBatch(db);
            for (const customer of results) {
                const docRef = doc(db, 'sienge_customers', String(customer.id));
                batch.set(docRef, customer, { merge: true });
                totalAdicionados++;
            }
            await batch.commit();

            console.log(`Salvos ${results.length} clientes. Total acumulado: ${totalAdicionados}`);

            offset += PAGE_LIMIT;
            
            if (!data.resultSetMetadata || offset >= data.resultSetMetadata.count) {
                console.log("Atingiu o limite total informado pelo Sienge.");
                break;
            }
        } catch (error) {
            console.error(`Erro ao processar offset ${offset}:`, error);
            console.log("Aguardando 5 segundos antes de tentar novamente...");
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log("==========================================");
    console.log(`DOWNLOAD COMPLETO FINALIZADO! Total: ${totalAdicionados} clientes.`);
    console.log("==========================================");
    process.exit(0);
}

runFullSync();
