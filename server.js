// Servidor Local e Proxy Seguro para Sienge ERP
// Resolve o erro de CORS (Cross-Origin Resource Sharing) no navegador.
// Executar usando o comando: node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const siengeScraper = require('./siengeScraper');
require('dotenv').config();

// Se o DB falhar ao inicializar, podemos ignorar erro para não travar o proxy original
let db;
try {
  db = require('./db');
} catch (e) {
  console.error('Aviso: SQLite não inicializado.', e);
}

const nodemailer = require('nodemailer');
// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Helpers
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const PORT = 3000;
const SIENGE_HOST = 'api.sienge.com.br';
const SIENGE_PATH_PREFIX = '/mouraleite/public/api/v1';

function encodeLatin1Query(str) {
  let out = '';
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const c = ch.charCodeAt(0);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || ch === '.' || ch === '_' || ch === '-') {
      out += ch;
    } else if (c === 32) {
      out += '%20';
    } else if (c <= 255) {
      out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
    } else {
      const a = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += encodeURIComponent(a || '_');
    }
  }
  return out;
}

function encodeSiengePath(rawPath) {
  const q = String(rawPath || '').indexOf('?');
  if (q < 0) return rawPath;
  const pathname = rawPath.slice(0, q);
  const search = rawPath.slice(q + 1);
  try {
    const params = new URLSearchParams(search);
    if (!params.has('description')) return rawPath;
    const parts = [];
    params.forEach((value, key) => {
      const encVal = key === 'description' ? encodeLatin1Query(value) : encodeURIComponent(value);
      parts.push(encodeURIComponent(key) + '=' + encVal);
    });
    return pathname + '?' + parts.join('&');
  } catch (e) {
    return rawPath;
  }
}

// Mime Types suportados
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.kmz': 'application/vnd.google-earth.kmz',
  '.kml': 'application/vnd.google-earth.kml+xml'
};

const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);

  // 1. ROTA DE PROXY PARA O SIENGE ERP
  if (req.url.startsWith('/sienge-proxy/')) {
    let targetPath;
    if (req.url.startsWith('/sienge-proxy/bulk-data/')) {
      targetPath = '/mouraleite/public/api' + req.url.replace('/sienge-proxy', '');
    } else {
      targetPath = SIENGE_PATH_PREFIX + req.url.replace('/sienge-proxy', '');
    }
    targetPath = encodeSiengePath(targetPath);
    
    const proxyHeaders = { ...req.headers };
    delete proxyHeaders.origin;
    delete proxyHeaders.referer;
    
    const options = {
      hostname: SIENGE_HOST,
      port: 443,
      path: targetPath,
      method: req.method,
      headers: {
        ...proxyHeaders,
        host: SIENGE_HOST,
        // Repassar autorização básica para o Sienge
        'Authorization': req.headers['authorization'] || ''
      }
    };

    // Fazer requisição segura HTTPS para o Sienge
    const proxyReq = https.request(options, (proxyRes) => {
      // Tratar redirecionamento (Sienge retorna 302 para links do S3 no download de anexos)
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirectUrl = proxyRes.headers.location;
        console.log(`[SIENGE REDIRECT] Seguindo redirecionamento para S3/Cloud...`);
        https.get(redirectUrl, (s3Res) => {
          const headers = { ...s3Res.headers };
          headers['access-control-allow-origin'] = '*';
          delete headers['Access-Control-Allow-Origin'];
          res.writeHead(s3Res.statusCode, headers);
          s3Res.pipe(res);
        }).on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Erro ao baixar anexo redirecionado', details: err.message }));
        });
        return;
      }

      // Repassar headers de resposta e habilitar CORS para o navegador local
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type, Authorization';
      headers['access-control-expose-headers'] = 'Location, location, X-Pagination-Total-Count';
      
      // Remove any uppercase versions to avoid Node.js combining them into '*, *'
      delete headers['Access-Control-Allow-Origin'];
      delete headers['Access-Control-Allow-Methods'];
      delete headers['Access-Control-Allow-Headers'];
      delete headers['Access-Control-Expose-Headers'];
      
      res.writeHead(proxyRes.statusCode, headers);
      
      if (proxyRes.statusCode >= 400) {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          console.log(`[SIENGE ERROR] ${proxyRes.statusCode} - ${targetPath}`);
          console.log(`[SIENGE BODY]`, body);
        });
      }
      
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Erro no proxy de conexão Sienge:', err);
      res.writeHead(500, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Falha ao conectar ao servidor Sienge', details: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // 1.5 ROTA DE PROXY PARA UPLOAD SIENGE BUILDER API
  if (req.url.startsWith('/sienge-builder-proxy/')) {
    const targetPath = '/mouraleite/builder/api/v1' + req.url.replace('/sienge-builder-proxy', '');
    
    const options = {
      hostname: SIENGE_HOST,
      port: 443,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: SIENGE_HOST,
        'Authorization': req.headers['authorization'] || ''
      }
    };
    
    // Opcionalmente podemos remover os headers do host original pra não dar conflito
    delete options.headers.host;
    delete options.headers.connection;

    const proxyReq = https.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type, Authorization';
      
      delete headers['Access-Control-Allow-Origin'];
      delete headers['Access-Control-Allow-Methods'];
      delete headers['Access-Control-Allow-Headers'];
      
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Erro no upload proxy Sienge:', err);
      sendJson(res, 500, { error: 'Falha ao conectar', details: err.message });
    });

    req.pipe(proxyReq);
    return;
  }

  // 1.6 ROTAS REST DA API INTERNA DO ANTIGRAVITY
  if (req.url.startsWith('/api/')) {
    // Suporte a preflight requests OPTIONS para a API Interna
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    try {
      const urlParts = req.url.split('?');
      const pathRoute = urlParts[0];

      // --- ROTAS DE TAGS ---
      if (pathRoute === '/api/tags' && req.method === 'GET') {
        if (!db) {
          return sendJson(res, 503, { error: 'Banco de dados não está disponível. Verifique permissões de escrita na pasta do projeto.' });
        }
        try {
          const tags = db.prepare(`SELECT * FROM tags ORDER BY name ASC`).all();
          return sendJson(res, 200, tags);
        } catch (e) {
          console.error('Erro ao buscar tags:', e);
          return sendJson(res, 500, { error: 'Erro ao buscar tags: ' + e.message });
        }
      }
      
      if (pathRoute === '/api/tags' && req.method === 'POST') {
        if (!db) {
          return sendJson(res, 503, { error: 'Banco de dados não está disponível. Verifique permissões de escrita na pasta do projeto.' });
        }
        const body = await getJsonBody(req);
        try {
          const stmt = db.prepare(`INSERT INTO tags (name, created_by, destino) VALUES (?, ?, ?)`);
          const info = stmt.run(body.name, body.created_by || 'System', body.destino || 'Unidade');
          return sendJson(res, 201, { id: info.lastInsertRowid, ...body });
        } catch (e) {
          if (e.message.includes('UNIQUE constraint failed')) {
            return sendJson(res, 400, { error: `Já existe uma TAG cadastrada com o nome "${body.name}".` });
          }
          return sendJson(res, 400, { error: e.message });
        }
      }

      if (pathRoute.startsWith('/api/tags/') && req.method === 'PUT') {
        if (!db) {
          return sendJson(res, 503, { error: 'Banco de dados não está disponível. Verifique permissões de escrita na pasta do projeto.' });
        }
        const id = pathRoute.split('/').pop();
        const body = await getJsonBody(req);
        try {
          const stmt = db.prepare(`UPDATE tags SET name = ?, destino = ?, status = ? WHERE id = ?`);
          stmt.run(body.name, body.destino, body.status, id);
          return sendJson(res, 200, { success: true });
        } catch (e) {
          if (e.message.includes('UNIQUE constraint failed')) {
            return sendJson(res, 400, { error: `Já existe uma TAG cadastrada com o nome "${body.name}".` });
          }
          return sendJson(res, 400, { error: e.message });
        }
      }


      // --- ROTAS DE DASHBOARD DE INADIMPLÊNCIA ---
      if (pathRoute === '/api/inadimplencia-snapshot' && req.method === 'POST') {
        if (!db) return sendJson(res, 503, { error: 'Banco de dados offline' });
        const body = await getJsonBody(req);
        
        try {
          const stmt = db.prepare(`
            INSERT INTO inadimplencia_snapshots (
              date, is_month_close, is_week_start, is_week_end, total_count, total_value,
              avg_ticket, subjudice_count, subjudice_value, new_count, recovered_count, data_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              is_month_close = excluded.is_month_close,
              is_week_start = excluded.is_week_start,
              is_week_end = excluded.is_week_end,
              total_count = excluded.total_count,
              total_value = excluded.total_value,
              avg_ticket = excluded.avg_ticket,
              subjudice_count = excluded.subjudice_count,
              subjudice_value = excluded.subjudice_value,
              new_count = excluded.new_count,
              recovered_count = excluded.recovered_count,
              data_json = excluded.data_json,
              created_at = excluded.created_at
          `);
          stmt.run(
            body.date,
            body.is_month_close ? 1 : 0,
            body.is_week_start ? 1 : 0,
            body.is_week_end ? 1 : 0,
            body.total_count,
            body.total_value,
            body.avg_ticket,
            body.subjudice_count,
            body.subjudice_value,
            body.new_count,
            body.recovered_count,
            body.data_json ? JSON.stringify(body.data_json) : '{}',
            new Date().toISOString()
          );
          return sendJson(res, 200, { success: true, date: body.date });
        } catch(e) {
          console.error('Erro ao salvar snapshot:', e);
          return sendJson(res, 500, { error: e.message });
        }
      }

      if (pathRoute === '/api/inadimplencia-snapshots' && req.method === 'GET') {
        if (!db) return sendJson(res, 503, { error: 'Banco de dados offline' });
        try {
          // Pode receber limit ou filtro de datas depois, por enquanto traz os últimos 90
          const rows = db.prepare(`SELECT * FROM inadimplencia_snapshots ORDER BY date ASC LIMIT 90`).all();
          const snapshots = rows.map(r => ({
            ...r,
            is_month_close: r.is_month_close === 1,
            is_week_start: r.is_week_start === 1,
            is_week_end: r.is_week_end === 1,
            data_json: JSON.parse(r.data_json || '{}')
          }));
          return sendJson(res, 200, snapshots);
        } catch(e) {
          console.error('Erro ao buscar snapshots:', e);
          return sendJson(res, 500, { error: e.message });
        }
      }

      // --- ROTAS DE KMZ ---
      if (pathRoute === '/api/kmz-coords' && req.method === 'POST') {
        const body = await getJsonBody(req);
        const { empreendimento_id, placemarks, kmz_base64 } = body;
        
        if (!empreendimento_id || !Array.isArray(placemarks)) {
          return sendJson(res, 400, { error: 'Dados inválidos' });
        }
        
        const insertStmt = db.prepare(`
          INSERT INTO kmz_coordinates (empreendimento_id, lot_name, coordinates)
          VALUES (?, ?, ?)
          ON CONFLICT(empreendimento_id, lot_name) DO UPDATE SET coordinates=excluded.coordinates
        `);
        
        const deleteStmt = db.prepare(`DELETE FROM kmz_coordinates WHERE empreendimento_id = ?`);
        
        try {
          // Salvar o arquivo físico para a funcionalidade NetworkLink do Google Earth
          if (kmz_base64) {
            const uploadDir = path.join(__dirname, 'uploads', 'kmz');
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }
            const buffer = Buffer.from(kmz_base64, 'base64');
            fs.writeFileSync(path.join(uploadDir, `${empreendimento_id}.kmz`), buffer);
          }

          db.transaction(() => {
            deleteStmt.run(empreendimento_id); // Remove antigos
            for (const p of placemarks) {
              insertStmt.run(empreendimento_id, p.name, p.coords);
            }
          })();
          return sendJson(res, 200, { success: true, message: `${placemarks.length} coordenadas salvas.` });
        } catch (e) {
          return sendJson(res, 500, { error: e.message });
        }
      }
      
      if (pathRoute === '/api/kmz-list' && req.method === 'GET') {
        try {
          const rows = db.prepare(`SELECT empreendimento_id, COUNT(lot_name) as count FROM kmz_coordinates GROUP BY empreendimento_id`).all();
          return sendJson(res, 200, rows);
        } catch(e) {
          return sendJson(res, 500, { error: e.message });
        }
      }

      // --- ROTAS DE MAPAS / PROJETO URBANISTICO ---
      if (pathRoute === '/api/upload-map' && req.method === 'POST') {
        const body = await getJsonBody(req);
        const { empreendimento_id, map_base64 } = body;
        
        if (!empreendimento_id || !map_base64) {
          return sendJson(res, 400, { error: 'Dados inválidos' });
        }
        
        try {
          const uploadDir = path.join(__dirname, 'uploads', 'maps');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const buffer = Buffer.from(map_base64, 'base64');
          fs.writeFileSync(path.join(uploadDir, `${empreendimento_id}.pdf`), buffer);
          
          return sendJson(res, 200, { success: true, message: 'Projeto salvo com sucesso.' });
        } catch (e) {
          return sendJson(res, 500, { error: e.message });
        }
      }
      
      if (pathRoute.startsWith('/api/map-check/') && req.method === 'GET') {
        const empId = pathRoute.split('/').pop();
        const mapPath = path.join(__dirname, 'uploads', 'maps', `${empId}.pdf`);
        if (fs.existsSync(mapPath)) {
          return sendJson(res, 200, { exists: true, url: `/uploads/maps/${empId}.pdf` });
        } else {
          return sendJson(res, 200, { exists: false });
        }
      }

      if (pathRoute === '/api/map-list' && req.method === 'GET') {
        try {
          const uploadDir = path.join(__dirname, 'uploads', 'maps');
          if (!fs.existsSync(uploadDir)) return sendJson(res, 200, []);
          const files = fs.readdirSync(uploadDir);
          const maps = files.filter(f => f.endsWith('.pdf')).map(f => {
            return { empreendimento_id: f.replace('.pdf', '') };
          });
          return sendJson(res, 200, maps);
        } catch(e) {
          return sendJson(res, 500, { error: e.message });
        }
      }

      if (pathRoute.startsWith('/api/map-delete/') && req.method === 'DELETE') {
        const empId = pathRoute.split('/').pop();
        try {
          const filePath = path.join(__dirname, 'uploads', 'maps', `${empId}.pdf`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          return sendJson(res, 200, { success: true });
        } catch(e) {
          return sendJson(res, 500, { error: e.message });
        }
      }

      if (pathRoute.startsWith('/api/kmz-coords/') && req.method === 'DELETE') {
        const empId = pathRoute.split('/').pop();
        try {
          db.prepare(`DELETE FROM kmz_coordinates WHERE empreendimento_id = ?`).run(empId);
          // Opcionalmente apagar o arquivo fisico se quiser
          const kmzPath = path.join(__dirname, 'uploads', 'kmz', `${empId}.kmz`);
          if (fs.existsSync(kmzPath)) fs.unlinkSync(kmzPath);
          return sendJson(res, 200, { success: true });
        } catch(e) {
          return sendJson(res, 500, { error: e.message });
        }
      }
      
      if (pathRoute.startsWith('/api/kmz-coords/') && req.method === 'GET') {
        const empId = pathRoute.split('/').pop();
        const coords = db.prepare(`SELECT lot_name, coordinates FROM kmz_coordinates WHERE empreendimento_id = ?`).all(empId);
        return sendJson(res, 200, coords);
      }

      if (pathRoute.startsWith('/api/kmz-coords/') && req.method === 'DELETE') {
        const empId = pathRoute.split('/').pop();
        try {
          db.prepare(`DELETE FROM kmz_coordinates WHERE empreendimento_id = ?`).run(empId);
          const kmzPath = path.join(__dirname, 'uploads', 'kmz', `${empId}.kmz`);
          if (fs.existsSync(kmzPath)) {
            fs.unlinkSync(kmzPath);
          }
          return sendJson(res, 200, { success: true });
        } catch (e) {
          return sendJson(res, 500, { error: e.message });
        }
      }

      if (pathRoute === '/api/kmz-list' && req.method === 'GET') {
        const uploadDir = path.join(__dirname, 'uploads', 'kmz');
        let kmzList = [];
        if (fs.existsSync(uploadDir)) {
          const files = fs.readdirSync(uploadDir);
          for (const file of files) {
            if (file.endsWith('.kmz')) {
              const empId = file.replace('.kmz', '');
              const stats = fs.statSync(path.join(uploadDir, file));
              kmzList.push({
                empreendimento_id: empId,
                filename: file,
                upload_date: stats.mtime
              });
            }
          }
        }
        return sendJson(res, 200, kmzList);
      }

      if (pathRoute === '/api/tags/request' && req.method === 'POST') {
        const body = await getJsonBody(req);
        const token = Math.random().toString(36).substring(2, 15);
        const type = body.type || 'Unidade';
        const stmt = db.prepare(`INSERT INTO tag_requests (tag_name, reason, type, requested_by_email, token) VALUES (?, ?, ?, ?, ?)`);
        stmt.run(body.tag_name, body.reason, type, body.requested_by_email, token);
        
        // Enviar e-mail para admin
        const approveLink = `http://${req.headers.host}/api/tags/approve/${token}`;
        
        if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_PASS !== 'COLOQUE_SUA_SENHA_AQUI') {
          try {
            await transporter.sendMail({
              from: process.env.SMTP_FROM,
              to: process.env.ADMIN_EMAIL,
              subject: 'Solicitação de Nova TAG de Anexo - CRM',
              html: `
                <h3>Nova TAG Solicitada</h3>
                <p><b>TAG:</b> ${body.tag_name}</p>
                <p><b>Tipo de Uso:</b> Documentos de ${type}</p>
                <p><b>Motivo:</b> ${body.reason}</p>
                <p><b>Solicitante:</b> ${body.requested_by_email}</p>
                <br/>
                <a href="${approveLink}" style="padding: 10px 15px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Aprovar TAG</a>
              `
            });
            console.log(`[EMAIL ENVIADO] Solicitação de tag enviada para ${process.env.ADMIN_EMAIL}`);
          } catch (mailError) {
            console.error('[ERRO EMAIL] Falha ao enviar email:', mailError);
            console.log(`[LINK APROVAÇÃO GERADO]: ${approveLink}`);
          }
        } else {
          console.log(`[SIMULAÇÃO DE EMAIL] Nova Tag Solicitada: ${body.tag_name}`);
          console.log(`[LINK APROVAÇÃO]: ${approveLink}`);
        }
        return sendJson(res, 200, { success: true, message: 'Solicitação enviada' });
      }
      
      if (pathRoute.startsWith('/api/tags/approve/') && req.method === 'GET') {
        const token = pathRoute.split('/').pop();
        const request = db.prepare(`SELECT * FROM tag_requests WHERE token = ?`).get(token);
        if (request && request.status === 'Pendente') {
          db.prepare(`UPDATE tag_requests SET status = 'Aprovada' WHERE id = ?`).run(request.id);
          db.prepare(`INSERT OR IGNORE INTO tags (name, created_by, destino) VALUES (?, ?, ?)`).run(request.tag_name, request.requested_by_email, request.type);
          
          if (process.env.SMTP_USER) {
            await transporter.sendMail({
              from: process.env.SMTP_FROM,
              to: request.requested_by_email,
              subject: 'TAG aprovada - Assistente de Anexos',
              html: `<p>Sua solicitação para a TAG <b>${request.tag_name}</b> foi aprovada e já está disponível no CRM.</p>`
            });
          }
          res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
          return res.end('<h1>TAG Aprovada com sucesso!</h1><p>O usuário será notificado.</p>');
        }
        res.writeHead(400, {'Content-Type': 'text/html; charset=utf-8'});
        return res.end('<h1>Token inválido ou solicitação já processada.</h1>');
      }

      // --- ROTAS DE USUÁRIOS E PERFIS ---
      if (pathRoute === '/api/menu' && req.method === 'GET') {
        const items = db.prepare(`SELECT * FROM menu_items ORDER BY order_index ASC`).all();
        return sendJson(res, 200, items);
      }

      if (pathRoute.startsWith('/api/permissions/') && req.method === 'GET') {
        const email = pathRoute.split('/').pop();
        const user = db.prepare(`
          SELECT u.*, p.name as profile_name 
          FROM users u 
          LEFT JOIN profiles p ON u.profile_id = p.id 
          WHERE u.email = ? AND u.status = 'Ativo'
        `).get(email);
        
        if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado ou inativo' });
        
        const perms = db.prepare(`SELECT permission_key FROM profile_permissions WHERE profile_id = ?`).all(user.profile_id);
        user.permissions = perms.map(p => p.permission_key);
        return sendJson(res, 200, user);
      }

      // --- ROTAS DO MÓDULO RELACIONAMENTO ---
      if (pathRoute === '/api/relacionamento/cessao/validar' && req.method === 'POST') {
        const body = await getJsonBody(req);
        if (body.inadimplente) {
          return sendJson(res, 400, { error: 'Regularize a inadimplência do contrato antes de realizar a cessão.', valid: false });
        }
        if (body.statusContrato !== 'ATIVO' && body.statusContrato !== 'Ativo') {
          return sendJson(res, 400, { error: 'O contrato precisa estar ativo para cessão.', valid: false });
        }
        return sendJson(res, 200, { valid: true });
      }

      if (pathRoute === '/api/relacionamento/cessao' && req.method === 'POST') {
        const body = await getJsonBody(req);
        console.log("Nova Cessão:", body);
        return sendJson(res, 200, { message: 'Cessão de Direitos registrada e Termo gerado.', id: Date.now() });
      }

      if (pathRoute === '/api/relacionamento/aditamento' && req.method === 'POST') {
        const body = await getJsonBody(req);
        if (body.statusContrato !== 'ATIVO' && body.statusContrato !== 'Ativo') {
          return sendJson(res, 400, { error: 'O contrato precisa estar ativo para aditamento.' });
        }
        console.log("Novo Aditamento:", body);
        return sendJson(res, 200, { message: 'Aditamento registrado.', id: Date.now() });
      }

      // --- ROTA SIENGE SCRAPER (CESSÃO) ---
      if (pathRoute === '/api/sienge/historico-cessao' && req.method === 'GET') {
        const queryParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const unidade = queryParams.get('unidade');
        const empreendimento = queryParams.get('empreendimento');
        const contrato = queryParams.get('contrato');

        if (!unidade || !empreendimento || !contrato) {
          return sendJson(res, 400, { error: 'Faltam parâmetros unidade, empreendimento ou contrato' });
        }

        try {
          const historico = await siengeScraper.getCessaoHistory(unidade, empreendimento, contrato);
          return sendJson(res, 200, historico);
        } catch (err) {
          console.error("Erro no scraper Sienge:", err);
          return sendJson(res, 500, { error: 'Erro ao buscar histórico de cessão: ' + err.message });
        }
      }

      if (pathRoute === '/api/relacionamento/permuta' && req.method === 'POST') {
        const body = await getJsonBody(req);
        console.log("Nova Permuta:", body);
        return sendJson(res, 200, { message: 'Permuta registrada com sucesso.', id: Date.now() });
      }

      // --- ROTA GPT-4 VISION OCR ---
      if (pathRoute === '/api/ocr/classify' && req.method === 'POST') {
        const body = await getJsonBody(req);
        
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('COLOQUE_SUA_CHAVE')) {
          // Mock se não houver chave
          console.log('OpenAI Key ausente. Mockando OCR.');
          return sendJson(res, 200, { tag: 'DOC' });
        }

        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { 
                    type: "text", 
                    text: `Analise esta imagem de documento e classifique usando APENAS UMA das seguintes tags exatas: RG, CNH, CPF, TCD, CONTRATO, DISTRATO, COMPROVANTE DE RESIDÊNCIA, ADITAMENTO, CESSÃO DE DIREITOS. 
                    Se não for nenhuma dessas com certeza, retorne exatamente: DOC. 
                    Regra para COMPROVANTE DE RESIDÊNCIA: Conta de energia, água, internet, telefone, fatura de cartão bancário, boleto de condomínio.
                    Regra para TCD: Termo de Confissão de Dívida ou Reparcelamento.
                    Sua resposta deve conter APENAS o nome da tag, sem pontuação, aspas ou texto extra.` 
                  },
                  {
                    type: "image_url",
                    image_url: { url: body.image_data }
                  }
                ]
              }
            ],
            max_tokens: 10
          })
        });
        
        const aiData = await openAiRes.json();
        const tag = (aiData.choices && aiData.choices[0] && aiData.choices[0].message.content) ? aiData.choices[0].message.content.trim() : 'DOC';
        return sendJson(res, 200, { tag: tag });
      }

      // Rota para baixar/visualizar PDF do Sienge com nome customizado
      // --- PARTICIPAÇÕES / PRESTAÇÃO ELLENCO ---
      if (pathRoute === '/api/participacoes/companies' && req.method === 'GET') {
        const part = require('./api/participacoes-fs');
        const data = part.listCompanyFolders(__dirname);
        return sendJson(res, 200, data);
      }
      if (pathRoute === '/api/participacoes/files' && req.method === 'GET') {
        const part = require('./api/participacoes-fs');
        const u = new URL(req.url, 'http://localhost');
        const companyId = u.searchParams.get('companyId');
        if (!companyId) return sendJson(res, 400, { error: 'companyId obrigatório' });
        return sendJson(res, 200, part.listPdfFiles(__dirname, companyId));
      }
      if (pathRoute === '/api/participacoes/file' && req.method === 'GET') {
        const part = require('./api/participacoes-fs');
        const u = new URL(req.url, 'http://localhost');
        try {
          const { full } = part.filePath(__dirname, u.searchParams.get('companyId'), u.searchParams.get('file'));
          const stat = fs.statSync(full);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*',
            'Content-Disposition': 'inline; filename="' + encodeURIComponent(path.basename(full)) + '"'
          });
          fs.createReadStream(full).pipe(res);
        } catch (e) {
          return sendJson(res, 404, { error: e.message });
        }
        return;
      }
      if (pathRoute === '/api/participacoes/upload' && req.method === 'POST') {
        const part = require('./api/participacoes-fs');
        try {
          const mp = await part.parseMultipart(req);
          const companyId = (mp.fields && mp.fields.companyId) || '';
          if (!mp.file || !mp.file.buffer) return sendJson(res, 400, { error: 'Arquivo PDF obrigatório' });
          const saved = part.saveUpload(__dirname, companyId, mp.file.filename, mp.file.buffer);
          return sendJson(res, 200, saved);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }

      if (pathRoute === '/api/bcb-sgs' && req.method === 'GET') {
        const handler = require('./api/bcb-sgs');
        return handler(req, res);
      }

      if (pathRoute === '/api/proxy-download' && req.method === 'GET') {
        const queryParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const targetUrl = queryParams.get('url');
        const filename = queryParams.get('filename') || 'documento.pdf';
        
        if (!targetUrl) return sendJson(res, 400, { error: 'Missing url parameter' });
        
        https.get(targetUrl, (siengeRes) => {
          const headers = { ...siengeRes.headers };
          headers['access-control-allow-origin'] = '*';
          
          // Remove os headers originais para forçar o nosso Content-Disposition
          delete headers['Access-Control-Allow-Origin'];
          delete headers['content-disposition'];
          delete headers['Content-Disposition'];
          
          // Define inline para abrir no navegador, mas com o nome do arquivo correto quando for salvar
          headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(filename)}"`;
          
          res.writeHead(siengeRes.statusCode, headers);
          siengeRes.pipe(res);
        }).on('error', (err) => {
          console.error('Erro proxy download PDF:', err);
          return sendJson(res, 500, { error: err.message });
        });
        return;
      }

      // Rota não encontrada na API
      return sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      console.error('Erro na API:', e);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // Suporte a preflight requests OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // 2. SERVIDOR DE ARQUIVOS ESTÁTICOS
  const pathname = req.url.split('?')[0].split('#')[0];
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  let contentType = MIME_TYPES[ext] || 'text/plain';

  // Impedir navegação para fora do diretório do projeto
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Acesso proibido');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*'
        });
        res.end('<h1>Arquivo não encontrado (404)</h1>');
      } else {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*'
        });
        res.end(`Erro no servidor: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      });
      res.end(content);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n=============================================================`);
    console.error(`❌ ERRO: A porta ${PORT} já está sendo usada por outro processo.`);
    console.error(`=============================================================`);
    console.error(`Verifique se você já possui uma instância do servidor rodando.`);
    console.error(`Para liberar a porta ${PORT} no Windows, feche a outra janela`);
    console.error(`ou execute no PowerShell como Administrador:`);
    console.error(`Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
    console.error(`=============================================================\n`);
    process.exit(1);
  } else {
    console.error('Erro no servidor:', err);
  }
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 MOURA LEITE - CRM DE COBRANÇA INICIADO COM SUCESSO!`);
  console.log(`=============================================================`);
  console.log(`💻 Site local rodando em: http://localhost:${PORT}`);
  console.log(`🔒 Proxy do Sienge ativo redirecionando requisições locais.`);
  console.log(`📝 Para testar as APIs Sienge Reais sem erro de CORS,`);
  console.log(`   abra o link acima no seu navegador.`);
  console.log(`=============================================================\n`);

  // Abre o navegador automaticamente no Windows
  try {
    exec(`start http://localhost:${PORT}`);
  } catch (e) {
    console.error('Erro ao abrir o navegador automaticamente:', e);
  }
});

// Sincronização Diária de Credores às 08:30
const syncCreditors = require('./sync-creditors');

function setupDailyCreditorSync() {
  const TARGET_HOUR = 8;
  const TARGET_MINUTE = 30;

  // Variável para evitar rodar mais de uma vez no mesmo dia caso o servidor seja reiniciado
  let lastSyncDate = null;

  setInterval(() => {
    const now = new Date();
    const isTargetTime = now.getHours() === TARGET_HOUR && now.getMinutes() === TARGET_MINUTE;
    
    // Verifica se é a hora certa e se ainda não rodou hoje
    const todayStr = now.toISOString().split('T')[0];
    if (isTargetTime && lastSyncDate !== todayStr) {
      lastSyncDate = todayStr;
      console.log(`[${now.toISOString()}] Executando sincronização agendada de credores (08:30)...`);
      syncCreditors().catch(err => {
        console.error("Erro na sincronização de credores:", err);
      });
    }
  }, 60000); // Checa a cada minuto
  
  console.log(`⏱️ Agendador de Sincronização de Credores iniciado (Agendado para as ${String(TARGET_HOUR).padStart(2, '0')}:${String(TARGET_MINUTE).padStart(2, '0')}).`);
}

setupDailyCreditorSync();

