const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
const results = [];
lines.forEach((l, i) => {
  if (l.toLowerCase().includes('contas a receber')) {
    results.push((i + 1) + ': ' + l.trim());
  }
});
fs.writeFileSync('search_result.txt', results.join('\n'));
