const fs = require('fs');
const content = fs.readFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/app.js', 'utf8');
const lines = content.split('\n');
const results = [];
lines.forEach((line, i) => {
    if (line.includes('AppState.currentUser =')) {
        results.push((i + 1) + ': ' + line.trim());
    }
});
fs.writeFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/search_results.txt', results.join('\n'));
