module.exports = async function handler(req, res) {
  const SIENGE_HOST = 'api.sienge.com.br';
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    const targetPath = '/mouraleite/builder/api/v1' + req.url.replace('/api/sienge-builder-proxy', '');
    
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
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-methods');
    responseHeaders.delete('access-control-allow-headers');
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    res.status(response.status);
    responseHeaders.forEach((value, key) => res.setHeader(key, value));
    res.send(buffer);
    
  } catch (error) {
    console.error('Erro no upload proxy Sienge:', error);
    res.status(500).json({ error: 'Falha ao conectar', details: error.message });
  }
}
