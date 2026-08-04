const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Diretório onde o Puppeteer salvará os cookies e sessão do Edge/Chrome
// Assim o operador faz o login com a Microsoft uma vez e fica salvo.
const USER_DATA_DIR = path.join(__dirname, 'sienge-browser-data');

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;

  // Lança o navegador visível (headless: false) para que, se não estiver logado,
  // o usuário veja a tela de login da Microsoft. Depois de logar a primeira vez,
  // o headless pode ser mudado para true ou 'new' se preferir rodar escondido.
  // Como estamos testando, manteremos false ou 'new' dependendo do ambiente.
  browserInstance = await puppeteer.launch({
    headless: false, // <-- Coloque true para rodar em background invisível
    userDataDir: USER_DATA_DIR,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

async function getCessaoHistory(unidade, empreendimento, targetContract) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    // 1. Gera o parâmetro em Base64 para a Unidade
    // Exemplo: entity.unidadePK.nuUnidade=C-05&entity.unidadePK.cdEmpreend=251
    const rawParam = `entity.unidadePK.nuUnidade=${unidade}&entity.unidadePK.cdEmpreend=${empreendimento}`;
    const base64Param = Buffer.from(rawParam).toString('base64');
    
    // URL do Histórico da Unidade
    const url = `https://mouraleite.sienge.com.br/sienge/8/index.html#/common/page/598/${base64Param}`;
    
    console.log(`[Scraper] Acessando Histórico: ${url}`);
    
    // Acessa a página
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Aguarda o carregamento da tabela de histórico
    // Na interface do Sienge, as tabelas geralmente usam classes padrão do framework interno.
    // Vamos esperar por algum texto indicativo ou div de tabela.
    await page.waitForSelector('table', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.includes('Histórico da Unidade'), { timeout: 10000 }).catch(() => {});
    
    // Pequena pausa adicional para carregamento do AJAX
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Extrai os dados da tabela
    const historico = await page.evaluate(() => {
      // Como o Sienge renderiza tabelas, vamos buscar as linhas (tr)
      // Precisamos mapear as colunas baseadas no cabeçalho ou posições visuais.
      // Segundo o print, temos: Data, Situação comercial, Situação legal, Situação da obra, Quantidade indexada, Usuário, Contrato, Cliente
      
      const rows = Array.from(document.querySelectorAll('table tr'));
      const data = [];
      
      // Procura índices de colunas
      let idxSitComercial = -1;
      let idxContrato = -1;
      let idxCliente = -1;

      // Localiza os headers na primeira/segunda linha
      rows.forEach(row => {
        const headers = Array.from(row.querySelectorAll('th, td.header-class, td[role="columnheader"]'));
        if (headers.length > 5 && idxSitComercial === -1) {
          headers.forEach((th, i) => {
            const text = th.innerText.toLowerCase().trim();
            if (text.includes('situação comercial')) idxSitComercial = i;
            if (text.includes('contrato')) idxContrato = i;
            if (text.includes('cliente')) idxCliente = i;
          });
        }
      });

      // Se não achar via header exato, assume as posições do print (0 a 7)
      // Print posições prováveis: 0=Data, 1=Sit.Com, 2=Sit.Leg, 3=Sit.Obra, 4=Qtd, 5=User, 6=Contrato, 7=Cliente
      if (idxSitComercial === -1) idxSitComercial = 1;
      if (idxContrato === -1) idxContrato = 6;
      if (idxCliente === -1) idxCliente = 7;

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length > idxCliente) {
          const situacao = cells[idxSitComercial].innerText.trim();
          const contrato = cells[idxContrato].innerText.trim();
          const cliente = cells[idxCliente].innerText.trim();
          
          if (situacao && cliente) {
             data.push({ situacao, contrato, cliente });
          }
        }
      }
      
      return data;
    });
    
    console.log(`[Scraper] Linhas extraídas:`, historico.length);

    // 3. Filtra apenas os clientes do contrato em questão
    const uniqueCustomers = new Set();
    const customerList = [];

    for (const item of historico) {
      if (item.situacao.toLowerCase().includes('vendid') && item.contrato === targetContract) {
         // O texto do cliente vem como: "14198 - VANESSA DO CARMO RAMOS RODRIGUES"
         // Vamos extrair o ID (antes do hífen)
         const match = item.cliente.match(/^(\d+)\s*-/);
         const customerId = match ? parseInt(match[1], 10) : null;
         
         if (customerId && !uniqueCustomers.has(customerId)) {
           uniqueCustomers.add(customerId);
           customerList.push({
             customerId,
             nome: item.cliente
           });
         }
      }
    }

    console.log(`[Scraper] Encontrados ${customerList.length} clientes para o contrato ${targetContract}`);
    
    await page.close();
    return customerList;

  } catch (error) {
    console.error(`[Scraper] Erro:`, error);
    if (!page.isClosed()) await page.close();
    throw error;
  }
}

module.exports = {
  getCessaoHistory
};
