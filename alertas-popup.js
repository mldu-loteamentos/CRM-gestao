/* Relação dos pop-ups que o sistema abre sozinho, a partir de regra já gravada no código. */
const AlertasPopupApp = {
  itens: [
    {
      id: "boletos-whatsapp",
      nome: "Lembrete de boletos no WhatsApp",
      quando: "No login, uma vez por mês, enquanto o mês não for marcado como concluído. Pode ser adiado por 15 min, 30 min, 1 h, 2 h, 3 h ou até amanhã.",
      logica: "A lista sai dos clientes com o alerta de WhatsApp ligado. O pop-up pede o envio manual da remessa do mês e some quando alguém marca o mês como concluído.",
      quem: "Quem tem a flag de reenvio de boleto no cadastro de usuário.",
      titulo: "Lembrete de Envio de Boletos (WhatsApp)",
      corpo: `<p>Os seguintes clientes estão com o alerta ativado para envio manual da remessa mensal via WhatsApp:</p>
        <div class="apa-item"><strong>Maria Aparecida Silva</strong><span>Título 18420 · Unidade 12, Quadra B</span></div>
        <p style="color:#64748b;font-size:0.82rem;">Na tela real também aparecem Lembrar Mais Tarde e Marcar como Concluído neste Mês.</p>`
    },
    {
      id: "vistoria",
      nome: "Vistoria aguardando validação",
      quando: "No login e de novo quando uma vistoria entra em aguardando validação. Some ao confirmar a lista ou ao adiar.",
      logica: "Entram vistorias com status aguardando validação cuja obra não está ligada no painel de obras. As já confirmadas neste aviso não voltam.",
      quem: "Operador de cobrança back office. Administrador não recebe.",
      titulo: "Vistorias aguardando validação",
      corpo: `<div class="apa-item"><strong>QD 04 LT 18 · 22190</strong><span>ITU — Terras de Itu</span><span style="color:#7c3aed;font-weight:700;">Aguardando Validação</span></div>`
    },
    {
      id: "nex",
      nome: "Vencimento de NEX",
      quando: "No login, em dia útil, dentro da janela parametrizada de cada vencimento. Pode ser adiado até o limite da regra.",
      logica: "A configuração de NEX define o dia do vencimento, a partir de qual dia útil o aviso abre e até qual dia útil ele pode ser adiado. Sem vencimento nessa janela, o pop-up não abre.",
      quem: "Operador de cobrança back office. Administrador não recebe.",
      titulo: "Gerar NEX",
      corpo: `<p>Hoje é dia útil para gerar as NEX dos vencimentos parametrizados. Confira o prazo e abra Notificações.</p>
        <div class="apa-item"><strong>Vencimento dia 10 · 10/11/2026</strong><span>Pop-up a partir de 05/11/2026</span><span style="color:#105436;font-weight:700;">Adiar no máximo até 12/11/2026</span></div>`
    },
    {
      id: "distrato-mes",
      nome: "Prazo do distrato no mês",
      quando: "No login, no penúltimo e no último dia útil do mês. Uma vez por pessoa e por dia, ao fechar.",
      logica: "No penúltimo dia útil cobra a análise dos distratos do mês. No último dia útil cobra o lançamento. A lista de baixo é o follow-up da própria pessoa: distrato ainda não finalizado no Sienge.",
      quem: "Cobrança, back office de cobrança e relacionamento. Advogado e operador terceirizado não recebem.",
      titulo: "Distratos do mês",
      corpo: `<p>Hoje é o penúltimo dia útil do mês. Falta analisar os distratos que ainda estão em aberto.</p>
        <p style="color:#9a3412;">Você tem 1 distrato no follow-up que ainda não foi finalizado.</p>
        <div class="apa-item"><strong>Cliente exemplo</strong><span>Título 9044</span></div>`
    },
    {
      id: "cnd",
      nome: "Providenciar a CND",
      quando: "No login, quando o prazo da CND já chegou e a certidão ainda não foi enviada. Uma vez por item e por dia, ao fechar.",
      logica: "O prazo é 10 dias corridos depois do distrato. O aviso lista cidade, empreendimento, unidade e matrícula para a pesquisa na prefeitura. A certidão sobe no anexo da unidade.",
      quem: "O responsável gravado naquele item do follow-up de CND.",
      titulo: "Providenciar a CND",
      faixa: true,
      corpo: `<p>Passaram 10 dias corridos do distrato. Providencie a CND do lote.</p>
        <div class="apa-item"><strong>Distrato do lote 08, quadra 2</strong><span>Cidade Itu · Terras de Itu · Unidade QD 02 LT 08 · Matrícula 12345</span></div>
        <p style="color:#64748b;font-size:0.82rem;">Na tela real há o campo para o PDF e o botão Enviar CND.</p>`
    },
    {
      id: "fechamento-pagadoria",
      nome: "Fechamento da pagadoria",
      quando: "No login, no antepenúltimo dia útil do mês. Uma vez por pessoa, ao marcar Ciente.",
      logica: "O período do lote vai do penúltimo dia útil até o último dia corrido do mês, sábado e domingo inclusos, para o pagamento dos parceiros cair no último dia útil.",
      quem: "Analista de Pagadoria I e Analista de Pagadoria II.",
      titulo: "Moura Leite Loteamentos",
      corpo: `<p>Hoje deverão ser feitos os lotes do dia 26/11/2026 ao dia 30/11/2026 para pagar dia 26. Sábado e domingo entram no período, para o fechamento dos parceiros ficar pago até o último dia.</p>
        <p style="color:#64748b;font-size:0.82rem;">Na tela real o botão é Ciente.</p>`
    },
    {
      id: "lotes",
      nome: "Situação dos lotes",
      quando: "Às 15:30. Se a pessoa entra depois disso, abre na hora. Uma vez no dia, ao fechar.",
      logica: "Pede para atualizar os lotes. A busca separa títulos do dia ou vencidos que ainda não foram processados (até 60 dias) e títulos a vencer que saíram do lote porque o banco recusou.",
      quem: "Administrador, Analista de Tesouraria I e Analista de Tesouraria II. Supervisor e Analista III não recebem.",
      titulo: "Situação dos lotes",
      corpo: `<p>Atualize a situação dos lotes para checar se algum pagamento do dia ainda não foi processado ou se algum título saiu de lote por recusa do banco.</p>
        <p><button type="button" class="btn btn-primary" disabled>Buscar atualizações</button></p>
        <p style="margin-top:14px;font-weight:700;">Do dia ou vencidos, ainda sem processamento</p>
        <div class="apa-item"><strong>111200 · ITU PLAZA</strong><span>Vencimento hoje · Em aberto</span></div>
        <p style="margin-top:14px;font-weight:700;">A vencer, fora do lote por recusa do banco</p>
        <div class="apa-item"><strong>110880 · Fornecedor exemplo</strong><span>Vence em 12/11/2026 · sem lote atual</span></div>`
    },
    {
      id: "home-office",
      nome: "Home office de amanhã",
      quando: "No login, no dia anterior ao home office da pessoa. Uma vez para aquela data.",
      logica: "A escala é segunda, quinta e sexta, em rodízio de três semanas. Feriado nesse dia passa para a quarta. Se alguém do time está ausente naquele dia, ninguém fica de home office e o aviso não abre.",
      quem: "Letícia, Michelle ou Lucélia, somente quando o próximo dia da escala é o dela.",
      titulo: "Home office",
      corpo: `<p>Amanhã, quinta-feira 05/11/2026, você fica em home office.</p>
        <p>O almoço é das <strong>12h30–13h42</strong>.</p>`
    },
    {
      id: "ponto-sexta",
      nome: "Pendências no cartão de ponto",
      quando: "Na sexta-feira, no login. Se a pessoa entra depois, abre até a sexta seguinte. Uma vez nesse ciclo, ao marcar Ciente.",
      logica: "Pede para checar as pendências no cartão de ponto do time. Ciente guarda a sexta daquele ciclo e o aviso só volta na sexta seguinte.",
      quem: "israel@mouraleite.com.br.",
      titulo: "Pendências no cartão de ponto",
      corpo: `<p>Cheque as pendências no cartão de ponto do time.</p>
        <p style="color:#64748b;font-size:0.82rem;">Na tela real o botão é Ciente.</p>`
    },
    {
      id: "ponto-fechamento",
      nome: "Validar o ponto do time",
      quando: "No login, no dia 15 de cada mês. Se o dia 15 não for dia útil, no próximo dia útil. Se a pessoa entra depois, abre até o fechamento seguinte. Uma vez nesse ciclo, ao marcar Ciente.",
      logica: "Pede para validar o ponto do time. O período fechado vai do dia 15 do mês anterior até o dia 14 do mês do fechamento. Ciente dispensa até o próximo dia 15, ou o próximo dia útil.",
      quem: "israel@mouraleite.com.br.",
      titulo: "Validar o ponto do time",
      corpo: `<p>Valide o ponto do time. O mês fechou de 15/10/2026 até 14/11/2026.</p>
        <p style="color:#64748b;font-size:0.82rem;">Na tela real o botão é Ciente. Se a sexta cair no mesmo dia, os dois textos vêm no mesmo aviso.</p>`
    },
    {
      id: "esteira",
      nome: "Etapas vencidas na esteira",
      quando: "Na segunda-feira às 08:00. Se a segunda não for dia útil, no próximo dia útil. Se a pessoa entra depois, abre na hora e vale para aquela semana. Uma vez por semana, ao fechar.",
      logica: "Lista só financiamento em aberto cuja etapa atual da esteira está com o prazo estourado.",
      quem: "Administrador e operador de cobrança back office.",
      titulo: "Etapas vencidas na esteira",
      corpo: `<p>Estes financiamentos estão com a etapa atual fora do prazo.</p>
        <div class="apa-item"><strong>Bruna Alves · título 6526</strong><span>Validar minuta · atrasada</span></div>`
    },
    {
      id: "documentos",
      nome: "Documento não concluído no Sienge",
      quando: "No login, em dia útil contado depois da emissão. Nos dias úteis 5 e 6, só para quem gerou. A partir do 7º, nos dias 7, 9, 11 e assim por diante, para o perfil de quem gerou. Cada marco é visto uma vez, ao fechar.",
      logica: "Vale para cessão, aditamento, distrato e os demais documentos que ainda não estão lançados. Fim de semana e feriado não contam. Antes de abrir, o sistema confere de novo se o Sienge já concluiu o documento.",
      quem: "Quem gerou o documento, nos dias úteis 5 e 6. Do 7º dia útil em diante, a cada dois dias úteis, todas as pessoas do mesmo perfil de quem gerou, inclusive ela.",
      titulo: "Documento pendente no Sienge",
      corpo: `<p>O documento Cessão de direitos de ELISABETE FALCI, título 6526, foi emitido em 15/10/2026 e não foi concluído no Sienge ainda.</p>`
    },
    {
      id: "repactuacao",
      nome: "Repactuação no virar do mês",
      quando: "No login, no primeiro e no último dia útil do mês. Uma vez por pessoa e por dia, ao fechar.",
      logica: "No último dia útil pede o cadastro dos indexadores no Sienge e o upload da prévia da competência seguinte. No primeiro dia útil pede para aplicar a repactuação antes de gerar a remessa.",
      quem: "Operador de cobrança back office.",
      titulo: "Último dia útil do mês",
      corpo: `<p>Hoje é o último dia útil para cadastrar os indexadores no Sienge e fazer a prévia da repactuação no IntegrA.</p>
        <p>A competência que será reajustada é <strong>dezembro de 2026</strong>. Tire no Sienge o relatório desse mês e faça o upload em Repactuação.</p>`
    }
  ],

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  abrir() {
    const root = document.getElementById("alertas-popup-root");
    if (!root) return;
    const linhas = this.itens.map((item) => `<tr>
      <td class="apa-nome">${this.esc(item.nome)}</td>
      <td>${this.esc(item.quando)}</td>
      <td>${this.esc(item.logica)}</td>
      <td>${this.esc(item.quem)}</td>
      <td class="apa-acoes">
        <button type="button" class="tvig-ico" title="Visualizar" onclick="AlertasPopupApp.visualizar('${item.id}')">
          <i data-lucide="eye" style="width:15px;height:15px;"></i>
        </button>
      </td>
    </tr>`).join("");
    root.innerHTML = `<p class="apa-lead">Cada linha é um pop-up que abre sozinho quando a regra abaixo se cumpre. Visualizar mostra o aviso como a pessoa recebe, sem gravar ciente e sem disparar a regra.</p>
      <div style="overflow:auto;">
        <table class="apa-tabela">
          <thead>
            <tr>
              <th>Alerta</th>
              <th>Quando abre</th>
              <th>Lógica</th>
              <th>Quem recebe</th>
              <th class="apa-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  visualizar(id) {
    const item = this.itens.find((row) => row.id === id);
    if (!item) return;
    const antigo = document.getElementById("apa-preview");
    if (antigo) antigo.remove();
    const pop = document.createElement("div");
    pop.id = "apa-preview";
    pop.className = "apa-overlay";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-labelledby", "apa-preview-titulo");
    pop.innerHTML = `<div class="apa-preview-wrap">
      <p class="apa-preview-nota">Prévia para: ${this.esc(item.quem)}</p>
      <div class="apa-card">
        <div class="apa-card-head${item.faixa ? " is-faixa" : ""}">
          <h3 id="apa-preview-titulo">${this.esc(item.titulo)}</h3>
          <button type="button" class="btn btn-fechar" id="apa-preview-fechar">Fechar</button>
        </div>
        <div class="apa-card-corpo">${item.corpo}</div>
      </div>
    </div>`;
    document.body.appendChild(pop);
    pop.querySelector("#apa-preview-fechar").addEventListener("click", () => pop.remove());
  }
};

window.AlertasPopupApp = AlertasPopupApp;
