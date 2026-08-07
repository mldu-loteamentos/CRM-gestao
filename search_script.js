const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
const results = [];
lines.forEach((line, i) => {
    if (line.includes('updateOperatorTabsUI')) {
        results.push((i + 1) + ': ' + line.trim());
    }
});
fs.writeFileSync('search_results.txt', results.join('\n'));
