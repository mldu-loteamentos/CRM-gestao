module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const fetchOptions = {
      method: 'GET',
      headers: {}
    };

    if (authHeader) {
      fetchOptions.headers['Authorization'] = authHeader;
    }

    // Pass the session cookie if present
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) {
      fetchOptions.headers['Cookie'] = cookieHeader;
    }

    console.log(`[PROXY DOWNLOAD] Iniciando fetch para: ${url}`);
    
    // Faz a primeira requisição. Pode retornar 302 redirecionando para S3, 
    // ou já pode ser o arquivo final. O Node fetch() segue redirecionamentos por padrão.
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`Erro no servidor de origem: ${response.status} ${response.statusText}`);
    }

    // Lê os bytes do arquivo
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Repassa os headers relevantes
    const responseHeaders = new Headers(response.headers);
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Tenta obter o nome do arquivo se vier no Content-Disposition
    const contentDisposition = responseHeaders.get('content-disposition');
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    } else {
      res.setHeader('Content-Disposition', 'attachment; filename="extrato.pdf"');
    }

    const contentType = responseHeaders.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }

    res.status(200).send(buffer);

  } catch (error) {
    console.error('[PROXY DOWNLOAD] Erro:', error);
    res.status(500).json({ error: 'Falha ao baixar o arquivo', details: error.message });
  }
};
