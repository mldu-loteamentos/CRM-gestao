module.exports = async function handler(req, res) {
  const SIENGE_HOST = 'api.sienge.com.br';
  const SIENGE_PATH_PREFIX = '/mouraleite/public/api/v1';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
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
    proxyHeaders.host = SIENGE_HOST;

    const options = {
      method: req.method,
      headers: proxyHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = req.body;
      if (typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
      }
    }

    const response = await fetch(`https://${SIENGE_HOST}${targetPath}`, options);
    
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const redirectUrl = response.headers.get('location');
      const s3Response = await fetch(redirectUrl);
      
      const responseHeaders = new Headers(s3Response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');
      responseHeaders.delete('transfer-encoding');
      
      res.status(s3Response.status);
      responseHeaders.forEach((value, key) => res.setHeader(key, value));
      
      if (s3Response.body) {
        const { Readable } = require('stream');
        return Readable.fromWeb(s3Response.body).pipe(res);
      } else {
        return res.end();
      }
    } else {
      // HANDLE NORMAL 2xx, 4xx, 5xx RESPONSES
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');
      responseHeaders.delete('transfer-encoding');
      responseHeaders.delete('www-authenticate'); // Previne popup de senha no navegador
      
      res.status(response.status);
      responseHeaders.forEach((value, key) => res.setHeader(key, value));
      
      if (response.body) {
        const { Readable } = require('stream');
        return Readable.fromWeb(response.body).pipe(res);
      } else {
        return res.end();
      }
    }

  } catch (error) {
    console.error('Erro no proxy de conexão Sienge:', error);
    res.status(500).json({ error: 'Falha ao conectar ao servidor Sienge', details: error.message });
  }
}
