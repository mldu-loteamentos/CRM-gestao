const https = require('https');

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

// Desabilitar o bodyParser da Vercel para podermos lidar com streams binários (multipart/form-data)
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = function handler(req, res) {
  const SIENGE_HOST = 'api.sienge.com.br';
  const SIENGE_PATH_PREFIX = '/mouraleite/public/api/v1';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  let targetPath = req.url.replace('/api/sienge-proxy', '');
  
  if (targetPath.startsWith('/bulk-data/')) {
    targetPath = '/mouraleite/public/api' + targetPath;
  } else {
    targetPath = SIENGE_PATH_PREFIX + targetPath;
  }
  targetPath = encodeSiengePath(targetPath);

  const proxyHeaders = { ...req.headers };
  delete proxyHeaders.origin;
  delete proxyHeaders.referer;
  delete proxyHeaders.host;
  delete proxyHeaders.connection;

  const options = {
    hostname: SIENGE_HOST,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      ...proxyHeaders,
      host: SIENGE_HOST
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Tratar redirecionamento (Sienge retorna 302 para links do S3 no download de anexos)
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      const redirectUrl = proxyRes.headers.location;
      https.get(redirectUrl, (s3Res) => {
        const headers = { ...s3Res.headers };
        headers['access-control-allow-origin'] = '*';
        delete headers['Access-Control-Allow-Origin']; // cleanup dupes
        res.writeHead(s3Res.statusCode, headers);
        s3Res.pipe(res);
      }).on('error', (err) => {
          res.status(500).json({ error: 'Erro ao baixar anexo redirecionado', details: err.message });
      });
      return;
    }

    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    headers['access-control-expose-headers'] = 'Location, location, X-Pagination-Total-Count';
    
    // Cleanup uppercase duplicate headers that Node might combine awkwardly
    delete headers['Access-Control-Allow-Origin'];
    delete headers['Access-Control-Allow-Methods'];
    delete headers['Access-Control-Allow-Headers'];
    delete headers['Access-Control-Expose-Headers'];
    delete headers['www-authenticate']; // Evitar popup de senha do navegador

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Erro no proxy de conexão Sienge Vercel:', err);
    res.status(500).json({ error: 'Falha ao conectar ao servidor Sienge', details: err.message });
  });

  // Repassar o body original via stream
  req.pipe(proxyReq);
};
