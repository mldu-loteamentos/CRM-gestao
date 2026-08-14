const https = require('https');

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
