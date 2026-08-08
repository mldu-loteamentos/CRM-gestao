const fs = require('fs');
const lines = fs.readFileSync('app.js', 'utf8').split('\n');
const results = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('GlobalCustomerCache') || lines[i].includes('startCustomerBackgroundSync')) {
    results.push(`${i+1}: ${lines[i].trim()}`);
  }
}
fs.writeFileSync('search_results.txt', results.join('\n'));
console.log('Found ' + results.length + ' matches');
