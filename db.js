const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'antigravity.db');
let db;

try {
  db = new Database(dbPath, { verbose: console.log });
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
} catch (err) {
  console.error('\n❌ ERRO CRÍTICO ao inicializar banco de dados SQLite');
  console.error('   Caminho tentado:', dbPath);
  console.error('   Mensagem de erro:', err.message);
  console.error('\n⚠️  SOLUÇÃO:');
  console.error('   1. Verifique se a pasta do projeto tem permissão de ESCRITA');
  console.error('   2. Se o arquivo antigravity.db existe, delete-o e reinicie o servidor');
  console.error('   3. No Windows, clique com botão direito na pasta > Propriedades > Segurança > Modificar permissões');
  console.error('   4. Se usar C:\\Program Files\\, mude o projeto para C:\\Users\\...\\Documents\\ ou similar\n');
  db = null; // Retorna null para que o servidor possa lidar com a ausência
}

// Initialize schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_permissions (
      profile_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      PRIMARY KEY (profile_id, permission_key),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      profile_id INTEGER,
      check_construction INTEGER DEFAULT 0,
      construction_cities TEXT,
      construction_companies TEXT,
      status TEXT DEFAULT 'Pendente ativação', -- 'Pendente ativação', 'Ativo', 'Inativo'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_default INTEGER DEFAULT 0, -- 1 = true, 0 = false
      status TEXT DEFAULT 'Ativa', -- 'Ativa', 'Inativa'
      created_by TEXT,
      destino TEXT DEFAULT 'Unidade',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tag_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag_name TEXT NOT NULL,
      reason TEXT,
      type TEXT DEFAULT 'Unidade',
      requested_by_email TEXT,
      token TEXT UNIQUE,
      status TEXT DEFAULT 'Pendente', -- 'Pendente', 'Aprovada', 'Rejeitada'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT,
      unit_id TEXT,
      enterprise_id TEXT,
      file_name TEXT,
      description TEXT,
      sienge_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_custom_fields (
      company_id INTEGER PRIMARY KEY,
      nome_usual TEXT,
      percentual_mldu REAL,
      consolidacao_padrao INTEGER DEFAULT 0,
      gerida_grupo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kmz_coordinates (
      empreendimento_id TEXT NOT NULL,
      lot_name TEXT NOT NULL,
      coordinates TEXT NOT NULL,
      PRIMARY KEY (empreendimento_id, lot_name)
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      parent_key TEXT,
      icon TEXT,
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inadimplencia_snapshots (
      date TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'
      is_month_close INTEGER,         -- 0 ou 1
      is_week_start INTEGER,          -- 0 ou 1
      is_week_end INTEGER,            -- 0 ou 1
      total_count INTEGER,
      total_value REAL,
      avg_ticket REAL,
      subjudice_count INTEGER,
      subjudice_value REAL,
      new_count INTEGER,
      recovered_count INTEGER,
      data_json TEXT,                 -- JSON completo (por empresa, CC, aging)
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS creditors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      cnpj TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_data TEXT
    );
  `);
  // Adicionar coluna caso a tabela já exista (migração)
  try {
    db.exec(`ALTER TABLE tags ADD COLUMN destino TEXT DEFAULT 'Unidade'`);
  } catch(e) {
    // A coluna provavelmente já existe
  }

  // Verifica se colunas de construção existem na tabela users (migração)
  try {
    const columns = db.prepare("PRAGMA table_info(users)").all();
    const hasCheckConstruction = columns.some(c => c.name === 'check_construction');
    if (!hasCheckConstruction) {
      db.exec("ALTER TABLE users ADD COLUMN check_construction INTEGER DEFAULT 0;");
      db.exec("ALTER TABLE users ADD COLUMN construction_cities TEXT;");
      db.exec("ALTER TABLE users ADD COLUMN construction_companies TEXT;");
      console.log("Colunas de construção adicionadas à tabela users.");
    }
  } catch(e) {
    console.error("Erro ao verificar/adicionar colunas de construção em users:", e.message);
  }
}

// Seed initial data
function seedData() {
  // Menu items
  const menuInsert = db.prepare(`
    INSERT OR IGNORE INTO menu_items (key, label, parent_key, icon, order_index)
    VALUES (?, ?, ?, ?, ?)
  `);

  const initialMenu = [
    ['dashboard', 'Fila de Cobrança', null, 'list-todo', 10],
    ['relacionamento', 'Relacionamento', null, 'users', 15],
    ['relacionamento_cessao', 'Cessão de Direitos', 'relacionamento', 'file-text', 10],
    ['relacionamento_aditamento', 'Aditamento Contratual', 'relacionamento', 'file-plus', 20],
    ['relacionamento_permuta', 'Permuta', 'relacionamento', 'refresh-ccw', 30],
    ['relacionamento_termos', 'Emissão de Termos', 'relacionamento', 'file-signature', 40],
    ['relacionamento_historico', 'Histórico de Interações', 'relacionamento', 'history', 50],
    ['agenda', 'Agenda do Operador', null, 'calendar', 20],
    ['zeropaid', 'Clientes 0% Pago', null, 'percent', 30],
    ['subjudice', 'Sub Judice', null, 'scale', 40],
    ['wesend', 'Notificações', null, 'mail', 50],
    ['preambles', 'Preâmbulos & Configurações', null, 'settings', 60],
    ['anexos', 'Assistente de Anexos', null, 'paperclip', 70],
    ['contas.pagar', 'Contas a Pagar', null, 'landmark', 75],
    ['config', 'Configurações', null, 'settings-2', 80],
    ['config.tags', 'Tags de Anexos', 'config', null, 10],
    ['config.usuarios', 'Usuários e Perfis', 'config', null, 20]
  ];

  initialMenu.forEach(item => menuInsert.run(...item));

  // Default Tags
  const tagInsert = db.prepare(`
    INSERT OR IGNORE INTO tags (name, is_default, status, created_by, destino)
    VALUES (?, 1, 'Ativa', 'System', ?)
  `);

  const tagsCliente = ['RG', 'CNH', 'CPF', 'COMPROVANTE DE RESIDÊNCIA', 'CERTIDÃO DE NASCIMENTO', 'CERTIDÃO DE CASAMENTO'];
  const tagsUnidade = ['TCD', 'CONTRATO', 'DISTRATO', 'ADITAMENTO', 'CESSÃO DE DIREITOS', 'CND', 'DOC'];

  tagsCliente.forEach(tag => tagInsert.run(tag, 'Cliente'));
  tagsUnidade.forEach(tag => tagInsert.run(tag, 'Unidade'));

  // Admin Profile
  const profileInsert = db.prepare(`INSERT OR IGNORE INTO profiles (name) VALUES (?)`);
  const profileResult = profileInsert.run('Administrador');
  
  // If the profile was just inserted, assign all permissions
  if (profileResult.changes > 0) {
    const adminId = profileResult.lastInsertRowid;
    const permInsert = db.prepare(`INSERT INTO profile_permissions (profile_id, permission_key) VALUES (?, ?)`);
    initialMenu.forEach(item => permInsert.run(adminId, item[0]));
    
    // Also add Israel as admin user
    const userInsert = db.prepare(`
      INSERT OR IGNORE INTO users (name, email, profile_id, status)
      VALUES (?, ?, ?, 'Ativo')
    `);
    userInsert.run('Israel Moura', 'israel@mouraleite.com.br', adminId);
  }
}

// Run init
if (db) {
  try {
    db.transaction(() => {
      initSchema();
      seedData();
    })();
    console.log('✅ Banco de dados SQLite inicializado com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao inicializar banco de dados:', err);
    db = null; // Marca como inoperante se houver erro
  }
} else {
  console.error('\n⚠️  O servidor continuará em execução, mas recursos do banco de dados não estarão disponíveis.');
}

module.exports = db;

