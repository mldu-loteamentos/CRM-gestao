const fs = require('fs');
const content = fs.readFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/app.js', 'utf8');
const lines = content.split('\n');

const searchTerms = ['delete', 'Excluir', 'share', 'compartilhar', 'saveOccurrence', 'salvou uma ocorrencia', 'Histórico de Tratativas', 'AppState.notes'];

let results = [];
lines.forEach((line, i) => {
    for (const term of searchTerms) {
        if (line.includes(term)) {
            results.push(`${i + 1}: ${line.trim()}`);
            break;
        }
    }
});

fs.writeFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/search_results.txt', results.join('\n'));
