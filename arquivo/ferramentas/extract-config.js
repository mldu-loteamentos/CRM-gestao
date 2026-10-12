const http = require('http');
const fs = require('fs');
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            fs.writeFileSync('config-extraida.json', body);
            console.log("SUCCESS");
            res.end("OK");
            process.exit(0);
        });
    }
});
server.listen(9999, () => { console.log("Aguardando navegador..."); });
