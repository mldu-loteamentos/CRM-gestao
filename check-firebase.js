const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBlBCaXn4y3sJDENW0GXw3ck_D2h3qknHc",
  authDomain: "crm-gestao-mldu.firebaseapp.com",
  projectId: "crm-gestao-mldu",
  storageBucket: "crm-gestao-mldu.firebasestorage.app",
  messagingSenderId: "1040392341069",
  appId: "1:1040392341069:web:6acf1beb34af663cfffe04"
};

const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);

async function checkData() {
  console.log("Verificando dados no Firebase...");
  try {
    const tagsSnapshot = await getDocs(collection(dbFirestore, 'tags'));
    console.log(`Tags: ${tagsSnapshot.size}`);

    const inadiSnapshot = await getDocs(collection(dbFirestore, 'inadimplencia_snapshots'));
    console.log(`Inadimplência Snapshots: ${inadiSnapshot.size}`);

    const kmzSnapshot = await getDocs(collection(dbFirestore, 'kmz_coordinates'));
    console.log(`Coordenadas KMZ: ${kmzSnapshot.size}`);

    const menuSnapshot = await getDocs(collection(dbFirestore, 'menu_items'));
    console.log(`Menu Items: ${menuSnapshot.size}`);

    const usersSnapshot = await getDocs(collection(dbFirestore, 'users'));
    console.log(`Usuários: ${usersSnapshot.size}`);

  } catch (e) {
    console.error("Erro ao acessar Firebase:", e);
  }
  process.exit(0);
}

checkData();
