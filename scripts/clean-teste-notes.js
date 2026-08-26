/**
 * Remove apenas ocorrências/notas internas cujo texto é exatamente "TESTE".
 * Não apaga mensagens que só mencionam a palavra no meio de outro texto.
 *
 * Uso:
 *   node scripts/clean-teste-notes.js          # apenas lista
 *   node scripts/clean-teste-notes.js --apply  # aplica no Firebase
 */
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBlBCaXn4y3sJDENW0GXw3ck_D2h3qknHc',
  authDomain: 'crm-gestao-mldu.firebaseapp.com',
  projectId: 'crm-gestao-mldu',
  storageBucket: 'crm-gestao-mldu.firebasestorage.app',
  messagingSenderId: '1040392341069',
  appId: '1:1040392341069:web:6acf1beb34af663cfffe04'
};

const APPLY = process.argv.includes('--apply');
const COLLECTIONS = ['customer_notes_shards'];

function isExactTesteText(text) {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  return normalized === 'TESTE';
}

function occIdentity(n) {
  if (!n) return '';
  if (n.id) return String(n.id);
  return [n.date, n.author, n.canal || '', String(n.text || '').slice(0, 40)].join('|');
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const report = [];
  let totalScanned = 0;
  let totalRemoved = 0;

  for (const colName of COLLECTIONS) {
    const snap = await getDocs(collection(db, colName));
    for (const shardDoc of snap.docs) {
      const data = shardDoc.data() || {};
      const updates = {};
      let shardChanged = false;

      for (const [customerId, notes] of Object.entries(data)) {
        if (!Array.isArray(notes)) continue;
        totalScanned += notes.length;
        const kept = [];
        const removed = [];
        notes.forEach(occ => {
          if (isExactTesteText(occ && occ.text)) {
            removed.push(occ);
          } else {
            kept.push(occ);
          }
        });
        if (!removed.length) continue;
        shardChanged = true;
        updates[customerId] = kept;
        removed.forEach(occ => {
          report.push({
            collection: colName,
            shard: shardDoc.id,
            customerId,
            id: occIdentity(occ),
            author: occ.author || '',
            canal: occ.canal || '',
            date: occ.date || '',
            promiseDate: occ.promiseDate || '',
            text: String(occ.text || '')
          });
        });
        totalRemoved += removed.length;
      }

      if (APPLY && shardChanged) {
        await setDoc(doc(db, colName, shardDoc.id), updates, { merge: true });
      }
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    versionGuard: 'v1.0.424',
    rule: 'texto exatamente igual a TESTE (após trim/maiúsculas)',
    occurrencesScanned: totalScanned,
    matches: report.length,
    totalRemoved,
    items: report
  }, null, 2));

  if (!APPLY && report.length) {
    console.log('\nNada foi apagado. Para aplicar: node scripts/clean-teste-notes.js --apply');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
