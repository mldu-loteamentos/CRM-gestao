const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'server.js' && f !== 'migrate-to-firebase.js' && !f.startsWith('firebase'));

files.forEach(file => {
  let content = fs.readFileSync(path.join(dir, file), 'utf8');
  let original = content;

  // Substituir baseUrl e proxy URLs do Sienge
  content = content.replace(/http:\/\/\$\{host\}:\$\{port\}\/sienge-proxy/g, '/api/sienge-proxy');
  content = content.replace(/http:\/\/localhost:3000\/sienge-proxy/g, '/api/sienge-proxy');
  content = content.replace(/\$\{window\.location\.origin\}\/sienge-proxy/g, '/api/sienge-proxy');
  content = content.replace(/\`http:\/\/\$\{window\.location\.hostname \|\| 'localhost'\}:3000\/sienge-proxy\`/g, "'/api/sienge-proxy'");

  if (content !== original) {
    fs.writeFileSync(path.join(dir, file), content, 'utf8');
    console.log(`Updated Sienge URLs in ${file}`);
  }
});
