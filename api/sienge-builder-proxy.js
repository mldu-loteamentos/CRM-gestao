const https = require('https');

// Desabilitar o bodyParser da Vercel para suportar envio de binários (multipart/form-data)
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = function handler(req, res) {
  const SIENGE_HOST = 'api.sienge.com.br';
  const SIENGE_BUILDER_PATH_PREFIX = '/mouraleite/builder/api/v1';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const targetPath = SIENGE_BUILDER_PATH_PREFIX + req.url.replace('/api/sienge-builder-proxy', '');

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
    // Tratar redirecionamento (caso aplicável na API Builder)
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      const redirectUrl = proxyRes.headers.location;
      https.get(redirectUrl, (s3Res) => {
        const headers = { ...s3Res.headers };
        headers['access-control-allow-origin'] = '*';
        delete headers['Access-Control-Allow-Origin'];
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
    
    delete headers['Access-Control-Allow-Origin'];
    delete headers['Access-Control-Allow-Methods'];
    delete headers['Access-Control-Allow-Headers'];
    delete headers['www-authenticate'];

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Erro no upload proxy Sienge Builder Vercel:', err);
    res.status(500).json({ error: 'Falha ao conectar', details: err.message });
  });

  // Repassar stream do arquivo
  req.pipe(proxyReq);
};
