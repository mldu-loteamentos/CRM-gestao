const fs = require('fs');
const content = fs.readFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/app.js', 'utf8');

// Extrai handleDynamicCustomerSearch
const handleMatch = content.match(/window\.handleDynamicCustomerSearch\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\w|\n\/\/)/);
if (handleMatch) {
    fs.writeFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/scratch/handle_func.txt', handleMatch[0]);
}

const syncMatch = content.match(/window\.startCustomerBackgroundSync\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{[\s\S]*?(?=\nwindow\.handleAgendaAutocomplete)/);
if (syncMatch) {
    fs.writeFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/scratch/sync_func.txt', syncMatch[0]);
}

console.log('Extração concluída.');
