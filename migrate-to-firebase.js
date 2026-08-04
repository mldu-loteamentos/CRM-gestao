const Database = require('better-sqlite3');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, setDoc, doc } = require('firebase/firestore');

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

const dbSqlite = new Database('antigravity.db');

async function migrate() {
  console.log("Iniciando migração de SQLite para Firebase Firestore...");

  // Migrar Tags
  try {
    const tags = dbSqlite.prepare('SELECT * FROM tags').all();
    for (const tag of tags) {
      await setDoc(doc(dbFirestore, 'tags', tag.id.toString()), {
        name: tag.name,
        destino: tag.destino,
        status: tag.status,
        created_by: tag.created_by,
        is_default: tag.is_default
      });
    }
    console.log(`✅ Migradas ${tags.length} Tags`);
  } catch (e) { console.error("Erro nas tags:", e.message); }

  // Migrar Snapshots de Inadimplência
  try {
    const snapshots = dbSqlite.prepare('SELECT * FROM inadimplencia_snapshots').all();
    for (const snap of snapshots) {
      await setDoc(doc(dbFirestore, 'inadimplencia_snapshots', snap.date), snap);
    }
    console.log(`✅ Migrados ${snapshots.length} Snapshots de Inadimplência`);
  } catch (e) { console.error("Erro nos snapshots:", e.message); }

  // Migrar KMZ Coordinates
  try {
    const coords = dbSqlite.prepare('SELECT * FROM kmz_coordinates').all();
    for (const c of coords) {
      await addDoc(collection(dbFirestore, 'kmz_coordinates'), c);
    }
    console.log(`✅ Migradas ${coords.length} Coordenadas KMZ`);
  } catch (e) { console.error("Erro nos KMZs:", e.message); }

  // Migrar Menus
  try {
    const menus = dbSqlite.prepare('SELECT * FROM menu_items').all();
    for (const m of menus) {
      await setDoc(doc(dbFirestore, 'menu_items', m.id.toString()), m);
    }
    console.log(`✅ Migrados ${menus.length} Itens de Menu`);
  } catch (e) { console.error("Erro nos Menus:", e.message); }

  // Migrar Usuários
  try {
    const users = dbSqlite.prepare('SELECT * FROM users').all();
    for (const u of users) {
      await setDoc(doc(dbFirestore, 'users', u.id.toString()), u);
    }
    console.log(`✅ Migrados ${users.length} Usuários`);
  } catch (e) { console.error("Erro nos Usuários:", e.message); }

  console.log("Migração concluída com sucesso!");
  process.exit(0);
}

migrate();
