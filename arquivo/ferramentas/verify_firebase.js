const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getCountFromServer } = require('firebase/firestore');

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

async function checkFirebase() {
    console.log("==================================================");
    console.log("VERIFICANDO A BASE NO FIREBASE...");
    console.log("==================================================");
    
    try {
        // 1. Contar total de clientes
        console.log("Contando total de clientes salvos na nuvem (isso pode demorar uns segundos)...");
        const coll = collection(db, 'sienge_customers');
        const snapshot = await getCountFromServer(coll);
        const total = snapshot.data().count;
        console.log(`\n=> TOTAL DE CLIENTES NO FIREBASE: ${total}`);

        // 2. Verificar cliente ID 1
        console.log("\nBuscando Cliente ID 1 (Romilto)...");
        const doc1 = await getDoc(doc(db, 'sienge_customers', "1"));
        if (doc1.exists()) {
            console.log("✅ ENCONTRADO! Nome: " + doc1.data().name);
        } else {
            console.log("❌ NÃO ENCONTRADO no Firebase.");
        }

        // 3. Verificar cliente ID 15496
        console.log("\nBuscando Cliente ID 15496 (Mauricio Mariano)...");
        const doc15496 = await getDoc(doc(db, 'sienge_customers', "15496"));
        if (doc15496.exists()) {
            console.log("✅ ENCONTRADO! Nome: " + doc15496.data().name);
        } else {
            console.log("❌ NÃO ENCONTRADO no Firebase.");
        }
        
    } catch (e) {
        console.error("Erro ao verificar Firebase:", e);
    }
    
    console.log("\n==================================================");
    console.log("FIM DA VERIFICAÇÃO.");
    console.log("==================================================");
    process.exit(0);
}

checkFirebase();
