const https = require('https');
const db = require('./db');
require('dotenv').config();

const SIENGE_CONFIG = {
  user: "mouraleite-contas-a-pagar",
  pass: "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj",
  host: 'api.sienge.com.br'
};

function getBasicAuthHeader() {
  const credentials = `${SIENGE_CONFIG.user}:${SIENGE_CONFIG.pass}`;
  return "Basic " + Buffer.from(credentials).toString('base64');
}

async function fetchCreditors(offset, limit) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SIENGE_CONFIG.host,
      port: 443,
      path: `/mouraleite/public/api/v1/creditors?limit=${limit}&offset=${offset}`,
      method: 'GET',
      headers: {
        'Authorization': getBasicAuthHeader(),
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error("Erro ao parsear JSON: " + e.message));
          }
        } else {
          reject(new Error(`Erro da API: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function syncCreditors() {
  console.log(`[${new Date().toISOString()}] Iniciando sincronizacao de credores...`);
  
  if (!db) {
    console.error("Banco de dados SQLite nao inicializado. Abortando sincronizacao.");
    return;
  }

  let offset = 0;
  const limit = 200;
  let hasMore = true;
  let totalAdicionados = 0;

  const insertStmt = db.prepare(`
    INSERT INTO creditors (id, name, cnpj, raw_data)
    VALUES (?, ?, ?, ?)
  `);

  const checkStmt = db.prepare(`SELECT id FROM creditors WHERE id = ?`);

  while (hasMore) {
    try {
      console.log(`Buscando credores (offset: ${offset}, limit: ${limit})...`);
      const response = await fetchCreditors(offset, limit);
      
      const creditors = response.results || response.resultSet || response.data;
      if (!creditors || creditors.length === 0) {
        hasMore = false;
        break;
      }

      db.transaction(() => {
        for (const c of creditors) {
          const exists = checkStmt.get(c.id);
          if (!exists) {
            const cnpj = c.cnpj || c.cpf || '';
            insertStmt.run(c.id, c.name, cnpj, JSON.stringify(c));
            totalAdicionados++;
          }
        }
      })();

      if (creditors.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (e) {
      console.error("Erro durante a sincronizacao de credores:", e);
      break;
    }
  }
  
  console.log(`[${new Date().toISOString()}] Sincronizacao finalizada. ${totalAdicionados} novos credores adicionados.`);
}

module.exports = syncCreditors;

// Permite execucao manual se chamado diretamente
if (require.main === module) {
  syncCreditors();
}
