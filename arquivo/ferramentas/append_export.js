const fs = require('fs');
const content = fs.readFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/app.js', 'utf8');

const exportFunc = `
window.exportAgendaToExcel = function() {
    const tableBody = document.getElementById("agenda-selected-day-body");
    if (!tableBody || tableBody.querySelectorAll('tr').length === 0 || tableBody.innerHTML.includes('Nenhum compromisso')) {
        alert("Não há dados na agenda para exportar.");
        return;
    }

    const rows = Array.from(tableBody.querySelectorAll("tr"));
    
    // Header
    let csvContent = "\\uFEFF"; // BOM
    csvContent += "Status;Cliente/Unidade;Lembrete/Resumo;R$ Atualizado;Ultimo Contato;Registro\\n";

    rows.forEach(row => {
        const cols = Array.from(row.querySelectorAll("td"));
        if (cols.length < 6) return; // skip padding/empty rows
        
        let status = cols[0].textContent.trim();
        if (cols[0].querySelector('.lucide-clock')) status = 'Pendente';
        else if (cols[0].querySelector('.lucide-check-circle')) status = 'Resolvido';
        else if (cols[0].querySelector('.lucide-x-circle')) status = 'Cancelado';

        const clienteUnidade = cols[1].textContent.replace(/\\s+/g, ' ').trim().replace(/;/g, ',');
        const lembreteResumo = cols[2].textContent.replace(/\\s+/g, ' ').trim().replace(/;/g, ',');
        const valorRaw = cols[3].textContent.replace(/\\s+/g, ' ').trim();
        const valor = valorRaw.replace('R$', '').trim().replace(/;/g, '');
        const ultimoContato = cols[4].textContent.replace(/\\s+/g, ' ').trim().replace(/;/g, ',');
        const registro = cols[5].textContent.replace(/\\s+/g, ' ').trim().replace(/;/g, ',');

        csvContent += \`"\${status}";"\${clienteUnidade}";"\${lembreteResumo}";"\${valor}";"\${ultimoContato}";"\${registro}"\\n\`;
    });

    const dateStr = document.getElementById("selected-agenda-date-str")?.textContent || "agenda";
    const opSelect = document.getElementById("agenda-operator-select");
    let opStr = opSelect ? opSelect.value : "Todos";
    opStr = opStr === "Todos" ? "Todos_Operadores" : opStr.replace(/\\s+/g, '_');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", \`Agenda_\${opStr}_\${dateStr.replace(/\\//g, '-')}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
`;

fs.writeFileSync('c:/Users/Arklok/Desktop/pasta/CRM-gestao/Projeto cobrança/app.js', content + exportFunc);
