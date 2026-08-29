// MÓDULO: CONFIGURAÇÕES > APOIO > PLANO FINANCEIRO
// Integração com API Sienge + Visões Personalizadas + Drag&Drop DFC (70/30)

const PlanoFinanceiroApp = {
  categories: [],
  visoes: [],
  selectedVisaoId: null,
  selectedCompanyId: null,
  loading: false,
  STORAGE_KEY: 'crm_plano_visoes_v2', // Changed key to force reset to new structure
  draggedAccountId: null,

  // Novos estados para sanfona e impostos
  collapsedIds: new Set(),
  taxConfig: {}, // mapeia id -> nome da base
  taxBases: [
    'Base para Vendas de Lote',
    'Base para Receita de Serviços',
    'Base para Aplicações Financeiras',
    'Base de Dedução'
  ],

  // ─── Inicialização ───────────────────────────────────────────────────────────
  async init() {
    const root = document.getElementById('plano-financeiro-root');
    if (!root) return;

    try { this.visoes = JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch (e) { this.visoes = []; }
    this.ensureDfcDefault();

    try { this.taxConfig = JSON.parse(localStorage.getItem('crm_plano_impostos')) || {}; } catch(e) {}
    try { 
      const custom = JSON.parse(localStorage.getItem('crm_impostos_custom')); 
      if (custom && Array.isArray(custom)) this.taxBases = custom;
    } catch(e) {}

    if (AppState.companies && AppState.companies.length > 0 && !this.selectedCompanyId) {
      this.selectedCompanyId = String(AppState.companies[0].id);
    }

    this.renderShell(root);
    await this.syncVisoesWithCloud();
    await this.loadCategories();
  },

  DFC_TEMPLATE_VER: 3,
  ACCOUNTS_MAP_VER: 1,

  dfcTemplateGroups() {
    const n = (id, name, type, parentId, extra = {}) => ({
      id, name, type, parentId, expanded: true,
      accounts: type === 'resultado' ? [] : undefined,
      ...extra
    });
    return [
      n('g_01', '01 RECEITAS', 'total_n1', null),
      n('g_01_01', '01.01 VENDA DE IMOVEIS', 'resultado', 'g_01'),
      n('g_01_02', '01.02 RECEITA DE SERVICOS', 'resultado', 'g_01'),
      n('g_01_03', '01.03 RECEITAS NAO OPERACIONAIS', 'resultado', 'g_01'),
      n('g_01_04', '01.04 CANCELAMENTOS DE VENDAS', 'resultado', 'g_01', { redutora: true }),
      n('g_02', '02 IMPOSTOS', 'total_n1', null),
      n('g_02_01', '02.01 IMPOSTOS SOBRE VENDAS', 'resultado', 'g_02'),
      n('g_02_02', '02.02 IMPOSTOS TRIMESTRAIS', 'resultado', 'g_02'),
      n('g_03', '03 CUSTOS E DESPESAS', 'formula', null, { formula: 'custos_desp' }),
      n('g_04', '04 CUSTOS', 'total_n1', null),
      n('g_04_01', '04.01 REPASSES TERRENISTAS', 'resultado', 'g_04'),
      n('g_04_02', '04.02 PROJETOS E APROVACOES', 'resultado', 'g_04'),
      n('g_04_03', '04.03 OBRAS', 'resultado', 'g_04'),
      n('g_04_04', '04.04 CUSTO ADM DE EMPREENDIMENTOS', 'resultado', 'g_04'),
      n('g_04_05', '04.05 AQUISICAO DE NOVAS AREAS', 'resultado', 'g_04'),
      n('g_05', '05 DESPESAS', 'total_n1', null),
      n('g_05_01', '05.01 DESPESAS COMERCIAIS', 'resultado', 'g_05'),
      n('g_05_02', '05.02 MARKETING', 'resultado', 'g_05'),
      n('g_05_03', '05.03 ADMINISTRATIVAS', 'resultado', 'g_05'),
      n('g_05_04', '05.04 PESSOAL', 'resultado', 'g_05'),
      n('g_05_05', '05.05 DESPESAS COM ESTOQUE', 'resultado', 'g_05'),
      n('g_05_06', '05.06 DESPESAS NAO OPERACIONAIS', 'resultado', 'g_05'),
      n('g_05_07', '05.07 DONATIVOS E CONTRIBUICOES', 'resultado', 'g_05'),
      n('g_05_08', '05.08 ADIANTAMENTO A FORNECEDORES', 'resultado', 'g_05'),
      n('g_05_09', '05.09 RETENCOES', 'resultado', 'g_05'),
      n('g_05_10', '05.10 OUTROS MOVIMENTOS', 'resultado', 'g_05'),
      n('g_05_11', '05.11 DESPESAS COM MANUTENCAO', 'resultado', 'g_05'),
      n('g_06', '06 GCO - GERACAO DE CAIXA OPERACIONAL', 'formula', null, { formula: 'gco' }),
      n('g_07', '07 CAPEX', 'resultado', null),
      n('g_08', '08 FCF - FLUXO DE CAIXA LIVRE', 'formula', null, { formula: 'fcf' }),
      n('g_09', '09 RESULTADO FINANCEIRO', 'total_n1', null),
      n('g_09_01', '09.01 RECEITAS FINANCEIRAS', 'resultado', 'g_09'),
      n('g_09_02', '09.02 DESPESAS FINANCEIRAS', 'resultado', 'g_09'),
      n('g_09_03', '09.03 FUNDO DE INVESTIMENTO', 'resultado', 'g_09'),
      n('g_09_05', '09.05 AMORTIZACOES', 'resultado', 'g_09'),
      n('g_10', '10 GCO - LIQUIDO DO RESULTADO', 'formula', null, { formula: 'gco_liq' }),
      n('g_11', '11 DIVIDENDOS E APORTES', 'total_n1', null),
      n('g_11_01', '11.01 (-) DIVIDENDOS', 'resultado', 'g_11', { redutora: true }),
      n('g_11_02', '11.02 (+) DIVIDENDOS', 'resultado', 'g_11'),
      n('g_11_03', '11.03 APORTES', 'resultado', 'g_11'),
      n('g_12', '12 VARIACAO DE CAIXA', 'formula', null, { formula: 'variacao' })
    ];
  },

  dfcAccountRemap() {
    return {
      g_01_01: 'g_01_01',
      g_01_02: 'g_01_03',
      g_01_03: 'g_01_02',
      g_01_04: 'g_01_03',
      g_01_05: 'g_01_04',
      g_02_01: 'g_02_01',
      g_02_02: 'g_02_02',
      g_03_01_01: 'g_04_01',
      g_03_01_02: 'g_04_02',
      g_03_01_03: 'g_04_03',
      g_03_01_04: 'g_04_04',
      g_03_01_05: 'g_04_05',
      g_03_02_01: 'g_05_01',
      g_03_02_02: 'g_05_03',
      g_03_02_03: 'g_05_04',
      g_03_02_04: 'g_05_09',
      g_03_02_05: 'g_05_11',
      g_03_02_06: 'g_05_07',
      g_03_02_07: 'g_05_06',
      g_07: 'g_07',
      g_07_01: 'g_09_01',
      g_07_02: 'g_09_02',
      g_07_03: 'g_09_05',
      g_09_01: 'g_11_01',
      g_09_02: 'g_11_03',
      g_09_03: 'g_07'
    };
  },

  applyDfcTemplate(visao) {
    const template = this.dfcTemplateGroups();
    const remap = this.dfcAccountRemap();
    const merged = {};
    (visao.groups || []).forEach(g => {
      const accounts = (g.accounts || []).map(String);
      if (!accounts.length) return;
      const newId = remap[g.id] || g.id;
      merged[newId] = (merged[newId] || []).concat(accounts);
    });
    visao.groups = template.map(t => {
      const node = { ...t };
      if (t.type === 'resultado') {
        node.accounts = [...new Set(merged[t.id] || [])];
      }
      return node;
    });
    visao.name = 'DFC Padrão';
    visao.templateVer = this.DFC_TEMPLATE_VER;
  },

  ensureDfcDefault() {
    if (!Array.isArray(this.visoes) || !this.visoes.length) {
      try { this.visoes = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]") || []; } catch (e) { this.visoes = []; }
    }
    const template = this.dfcTemplateGroups();
    let visao = (this.visoes || []).find(v => v.id === 'dfc_default');
    if (!visao) {
      this.visoes = this.visoes || [];
      this.visoes.unshift({ id: 'dfc_default', name: 'DFC Padrão', type: 'custom', templateVer: this.DFC_TEMPLATE_VER, groups: template });
      this.saveToStorage({ silent: true });
      return;
    }
    if (visao.templateVer !== this.DFC_TEMPLATE_VER) {
      this.applyDfcTemplate(visao);
      this.saveToStorage({ silent: true });
    }
  },

  _normTxt(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  },

  _idMatchesPrefix(id, prefix) {
    const a = String(id || '').trim();
    const p = String(prefix || '').trim();
    if (!a || !p) return false;
    if (a === p || a.startsWith(p + '.')) return true;
    const an = a.replace(/\D/g, '');
    const pn = p.replace(/\D/g, '');
    return !!(pn && an && (an === pn || (an.startsWith(pn) && pn.length >= 4)));
  },

  dfcCodePrefixes() {
    return [
      ['2.02.04.04.03', 'g_04_03'],
      ['2.02.04.04.01', 'g_04_03'],
      ['2.02.04.04', 'g_04_03'],
      ['2.02.02.03.03', 'g_04_03'],
      ['2.02.02.02.01', 'g_04_03'],
      ['2.02.02.01.01', 'g_04_03'],
      ['2.02.02', 'g_04_03'],
      ['2.02.05.01', 'g_04_04'],
      ['2.02.05', 'g_04_04'],
      ['2.02.04.01', 'g_04_01'],
      ['2.02.01.01', 'g_04_02'],
      ['2.02.01', 'g_04_02'],
      ['2.01.01.02', 'g_04_02'],
      ['2.03.05.01', 'g_04_04'],
      ['1.01.01.01', 'g_01_01'],
      ['1.01.01', 'g_01_01'],
      ['1.02.01.08', 'g_01_02'],
      ['1.02.01.07', 'g_01_02'],
      ['1.02.01.06', 'g_01_02'],
      ['1.02.01.05', 'g_01_02'],
      ['1.02.01.04', 'g_01_02'],
      ['1.02.01.02', 'g_01_02'],
      ['1.02.01.01', 'g_01_02'],
      ['1.02.01', 'g_01_02'],
      ['1.04.01.10', 'g_11_01'],
      ['1.04.01.08', 'g_01_03'],
      ['1.04.01.07', 'g_01_03'],
      ['1.04.01.06', 'g_01_03'],
      ['1.04.01.05', 'g_01_03'],
      ['1.04.01.04', 'g_01_03'],
      ['1.04.01.03', 'g_01_03'],
      ['1.04.01.02', 'g_01_03'],
      ['1.04.01.01', 'g_01_03'],
      ['1.04.01', 'g_01_03'],
      ['2.08.01.04', 'g_01_04'],
      ['2.08.01.01', 'g_01_04'],
      ['2.08.01', 'g_01_04'],
      ['2.04.01.99', 'g_05_03'],
      ['2.04.01.30', 'g_05_03'],
      ['2.04.01.08', 'g_05_03'],
      ['2.04.01.04', 'g_02_02'],
      ['2.04.01.03', 'g_02_02'],
      ['2.04.01.02', 'g_02_01'],
      ['2.04.01.01', 'g_02_01'],
      ['2.05.01.11', 'g_09_02'],
      ['2.05.01.10', 'g_04_01'],
      ['2.05.01.09', 'g_09_05'],
      ['2.05.01.08', 'g_09_05'],
      ['2.05.01.06', 'g_09_02'],
      ['2.05.01.05', 'g_05_03'],
      ['2.05.01.04', 'g_09_02'],
      ['2.05.01.03', 'g_01_01'],
      ['2.05.01.02', 'g_09_02'],
      ['2.05.01.01', 'g_09_02'],
      ['2.06.01.05', 'g_09_02'],
      ['2.03.07.03', 'g_05_05'],
      ['2.03.07.02', 'g_05_05'],
      ['2.03.07.01', 'g_05_05'],
      ['2.03.07', 'g_05_05'],
      ['2.03.02', 'g_05_03'],
      ['2.03.04', 'g_05_03'],
      ['2.03.06', 'g_05_03'],
      ['2.03.03', 'g_05_03'],
      ['2.03.05', 'g_05_03'],
      ['2.09.03', 'g_05_09'],
      ['2.09.01', 'g_05_09'],
      ['2.11.03', 'g_04_01'],
      ['2.11.00', 'g_04_01'],
      ['2.11.01', 'g_05_08'],
      ['2.07.07', 'g_11_01'],
      ['2.07.06', 'g_11_01'],
      ['2.07.05', 'g_11_01'],
      ['2.07.04', 'g_11_01'],
      ['2.07.01', 'g_11_01'],
      ['2.07', 'g_11_01'],
      ['2.01.08', 'g_04_01'],
      ['2.01.07', 'g_11_01'],
      ['2.01.05', 'g_11_01'],
      ['2.01.04', 'g_11_01'],
      ['2.01.01.23', 'g_11_01']
    ];
  },

  lookupDfcByCode(id) {
    const prefixes = this.dfcCodePrefixes().slice().sort((a, b) => b[0].length - a[0].length);
    for (let i = 0; i < prefixes.length; i++) {
      if (this._idMatchesPrefix(id, prefixes[i][0])) return prefixes[i][1];
    }
    return null;
  },

  suggestGroup(cat) {
    const id = String(cat.id || '');
    const name = this._normTxt(cat.name || cat.description || '');
    const type = this._normTxt(cat.type || cat.tpConta || cat.financialCategoryType || '');
    if (/TOTAL/.test(type)) return null;

    if (/DISTRATO/.test(name)) return 'g_01_04';
    if (/DESCONTO.?S OBTID/.test(name)) return 'g_05_03';
    if (/RENDIMENTO.*APLICAC|APLICACAO FINANCEIRA/.test(name)) return 'g_09_01';
    if (/ASSISTENCIA TECNICA POS|POS.?OBRA/.test(name)) return 'g_05_11';
    if (/ADIANTAMENTO A FORNEC/.test(name)) return 'g_05_08';
    if (/ADIANTAMENTO A PARCEIRO/.test(name)) return 'g_04_01';
    if (/DISTRIBUICAO (DE )?LUCRO.*REPASSE|REPASSE.*LUCRO/.test(name)) return 'g_04_01';
    if (/\bPLR\b|DISTRIBUICAO (DE )?LUCRO|ESTORNO DE DIVIDEND/.test(name)) return 'g_11_01';
    if (/RETENCAO|RECOLHIMENTO/.test(name) && /TERCEIRO/.test(name)) return 'g_05_09';
    if (/RECOLHIMENTO DE IMPOSTOS RETIDOS/.test(name)) return 'g_05_09';
    if (/RETENCAO DE (COFINS|PIS|INSS|\bIR\b|ISS)/.test(name)) return 'g_01_02';
    if (/RECEITA DE VENDA DE LOTE|VENDA DE LOTE/.test(name)) return 'g_01_01';
    if (/JUROS ATIVOS|DESCONTO DE JUROS CONTRAT/.test(name)) return 'g_01_01';
    if (/RECEITA DE (ADMINISTRACAO|SERVICOS TECNICOS|TAXA DE CESSAO|LOCAC|COMISSAO)/.test(name)) return 'g_01_02';
    if (/VENDA DE (AREA|EQUIPAMENTO|SUCATA|VEICULO)/.test(name)) return 'g_01_03';
    if (/RECEBIMENTO EM DUPLIC|DEPOSITOS NAO IDENT|REEMBOLSO/.test(name)) return 'g_01_03';
    if (/^PIS$|^COFINS$/.test(name)) return 'g_02_01';
    if (/^IRPJ$|^CSLL$/.test(name)) return 'g_02_02';
    if (/DESPESA DE ADMINISTRACAO DE EMPREEND/.test(name)) return 'g_04_04';
    if (/^REPASSE$|\bMUTUO\b/.test(name)) return 'g_04_01';
    if (/AQUISICAO DE TERRENO|PROJETOS DIVERSOS/.test(name)) return 'g_04_02';
    if (/\(OBRA\)|MATERIAIS APLICADOS|SERVICOS DE TERCEIROS \(OBRA\)|CONCESSIONARIA/.test(name)) return 'g_04_03';
    if (/IPTU|\bITR\b|TAXA ASSOCIATIVA DE LOTE|DESPESAS COM ESTOQUE|DESPESAS COM LOTE/.test(name)) return 'g_05_05';
    if (/OUTROS IMPOSTOS\/TAXAS|EMOLUMENTO|^ISS$/.test(name)) return 'g_05_03';
    if (/DESPESAS BANCARIAS/.test(name)) return 'g_05_03';
    if (/^JUROS$|^MULTAS$|^IOF$|IR SOBRE APLICAC/.test(name)) return 'g_09_02';
    if (/INVESTIMENTOS E APLICACOES/.test(name)) return 'g_09_02';
    if (/OUTRAS DESPESAS FINANCEIRAS/.test(name)) return 'g_09_05';

    const byCode = this.lookupDfcByCode(id);
    if (byCode) return byCode;

    if (/CANCELAMENTO DE VEND/.test(name)) return 'g_01_04';
    if (/VENDA DE IMOV/.test(name)) return 'g_01_01';
    if (/RECEITA DE SERVIC/.test(name)) return 'g_01_02';
    if (/ALUGUE/.test(name) && /RECEITA/.test(name)) return 'g_01_02';
    if (/NAO OPERACIONAL/.test(name) && /RECEITA/.test(name)) return 'g_01_03';
    if (/REPASSE|TERRENISTA/.test(name)) return 'g_04_01';
    if (/PROJETO|APROVAC/.test(name)) return 'g_04_02';
    if (/\bOBRA/.test(name) && /DESPESA|CUSTO|MATERIAL|SERVICO/.test(name)) return 'g_04_03';
    if (/AQUISICAO DE NOVA/.test(name)) return 'g_04_05';
    if (/CORRETAG|COMISSAO|COMERCIAIS|DESPESAS COM VEND/.test(name) && !/RECEITA/.test(name)) return 'g_05_01';
    if (/DONATIV|CONVENIO|CONTRIBUICOES/.test(name) && !/DISTRIBUICAO/.test(name)) return 'g_05_07';
    if (/RETENC/.test(name)) return 'g_05_09';
    if (/MANUTENC/.test(name) && /EMPREEND|POS/.test(name)) return 'g_05_11';
    if (/NAO OPERACIONAL/.test(name) && /DESPESA/.test(name)) return 'g_05_06';
    if (/PESSOAL|SALARIO|ENCARGO|\bFGTS\b|VALE TRANSP|VALE ALIMENT|ASSISTENCIA MEDICA|RESCISO/.test(name) && !/TERCEIRO/.test(name)) return 'g_05_04';
    if (/ADMINISTRAT|AGUA|ESGOTO|ENERGIA|ALUGUEL|ESCRITORIO|SOFTWARE|INTERNET|TELEFONE|CONSULTOR|JURIDICO|CONTABIL/.test(name)) return 'g_05_03';
    if (/RECEITA FINANCEIRA/.test(name)) return 'g_09_01';
    if (/FUNDO DE INVEST/.test(name)) return 'g_09_03';
    if (/DESPESA FINANCEIRA|TARIFA BANC|JUROS PASSIV/.test(name)) return 'g_09_02';
    if (/AMORTIZ/.test(name)) return 'g_09_05';
    if (/DIVIDEND/.test(name) && /\+|RECEB|ENTRADA/.test(name)) return 'g_11_02';
    if (/DIVIDEND/.test(name)) return 'g_11_01';
    if (/\bAPORTE/.test(name)) return 'g_11_03';
    if (/CAPEX/.test(name)) return 'g_07';
    return null;
  },

  remapDfcAccounts() {
    const v = this.visoes.find(x => x.id === 'dfc_default');
    if (!v || !this.categories || !this.categories.length) return 0;
    (v.groups || []).forEach(g => {
      if (g.type === 'resultado') g.accounts = [];
    });
    let added = 0;
    (this.categories || []).forEach(c => {
      const cid = String(c.id || '');
      if (!cid) return;
      const nodeId = this.suggestGroup(c);
      if (!nodeId) return;
      const g = v.groups.find(x => x.id === nodeId);
      if (!g || g.type !== 'resultado') return;
      g.accounts = g.accounts || [];
      if (!g.accounts.includes(cid)) {
        g.accounts.push(cid);
        added++;
      }
    });
    (v.groups || []).forEach(g => {
      if (g.accounts) g.accounts.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    });
    v.accountsMapVer = this.ACCOUNTS_MAP_VER;
    this.saveToStorage({ silent: true });
    return added;
  },

  autoAllocateUnassigned(silent) {
    const v = this.visoes.find(x => x.id === 'dfc_default') || this.getVisao();
    if (!v) return;
    const added = this.remapDfcAccounts();
    if (!silent) {
      this.saveToStorage();
      alert(added ? `${added} conta(s) encaixada(s) nos nós do DFC Padrão. Revise o que restar em "Sienge Disponíveis".` : 'Nenhuma conta nova para alocar automaticamente. Arraste as restantes para o nó certo.');
      this.renderBoard();
    }
  },

  // ─── Render Estrutura Principal ───────────────────────────────────────────
  renderShell(root) {
    root.innerHTML = `
      <div style="display:flex; flex-direction:column; height:calc(100vh - 85px); gap:0; font-family: inherit;">
        <!-- MOURA LEITE HEADER -->
        <div style="background:#105436; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i data-lucide="layout-list" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0; color:#fff; font-size:1.2rem; font-weight:600;">Gestão de Planos Financeiros e Visões</h2>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:0.75rem;">Mapeamento compartilhado com a equipe. O DFC com valores fica em Fluxo de Caixa.</p>
            </div>
          </div>
          <button type="button" onclick="switchTab('fluxo-caixa','Fluxo de Caixa')" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:8px;padding:8px 12px;font-size:0.78rem;font-weight:600;cursor:pointer;">Ver Fluxo de Caixa</button>
        </div>
        <!-- CORPO SPLIT -->
        <div style="display:flex;flex:1;overflow:hidden;background:#f8fafc;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;min-height:0;">
          <!-- PAINEL ESQUERDO: Visões -->
          <div style="width:250px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;">
            <div style="padding:14px 12px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <h3 style="margin:0;font-size:0.78rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:5px;">
                  <i data-lucide="layers" style="width:12px;height:12px;"></i>Visões
                </h3>
                <button onclick="PlanoFinanceiroApp.novaVisao()"
                  style="background:#105436;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:0.72rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                  <i data-lucide="plus" style="width:11px;height:11px;"></i>Nova
                </button>
              </div>
              <div id="pf-visao-all" onclick="PlanoFinanceiroApp.selectVisao(null)"
                style="padding:7px 9px;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:600;display:flex;align-items:center;gap:7px;transition:all 0.15s;background:#e8f5ee;border:1.5px solid #105436;color:#105436;">
                <i data-lucide="list" style="width:12px;height:12px;"></i>Todas as Contas
                <span style="margin-left:auto;font-size:0.68rem;background:#105436;color:#fff;border-radius:8px;padding:1px 6px;" id="pf-all-count">0</span>
              </div>
            </div>
            <div id="pf-visoes-list" style="flex:1;overflow-y:auto;padding:8px 10px;"></div>
          </div>

          <!-- PAINEL DIREITO -->
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
            <!-- Barra de ação de visão ativa -->
            <div id="pf-visao-bar" style="display:none;padding:9px 18px;background:#fffbeb;border-bottom:1px solid #fde68a;flex-shrink:0;align-items:center;justify-content:space-between;gap:10px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <i data-lucide="eye" style="width:14px;height:14px;color:#92400e;"></i>
                <span id="pf-visao-bar-name" style="font-weight:700;color:#92400e;font-size:0.83rem;"></span>
              </div>
              <div style="display:flex;gap:6px;">
                <button onclick="PlanoFinanceiroApp.duplicarVisao()"
                  style="padding:5px 10px;background:#fff;color:#d97706;border:1px solid #fcd34d;border-radius:6px;font-size:0.78rem;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Duplicar esta visão">
                  <i data-lucide="copy" style="width:12px;"></i>Duplicar
                </button>
                <button id="pf-btn-excluir" onclick="PlanoFinanceiroApp.excluirVisao()"
                  style="padding:5px 10px;background:transparent;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:0.78rem;cursor:pointer;display:flex;align-items:center;gap:4px;">
                  <i data-lucide="trash-2" style="width:12px;"></i>Excluir
                </button>
              </div>
            </div>

            <!-- Tabela Sienge Default (Visível apenas se selectedVisaoId == null ou type != custom) -->
            <div id="pf-table-wrapper" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
              <div style="padding:10px 18px;border-bottom:1px solid #e8eaed;background:#fff;flex-shrink:0;display:flex;align-items:center;gap:10px;">
                <input type="text" id="pf-search" placeholder="Buscar..." oninput="PlanoFinanceiroApp.onSearch()" style="flex:1;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;">
                <button type="button" onclick="PlanoFinanceiroApp.expandAllAccounts()" title="Expandir todos os níveis" style="padding:7px 10px;background:#fff;border:1px solid #105436;border-radius:6px;color:#105436;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.75rem;font-weight:700;white-space:nowrap;">
                  <i data-lucide="chevrons-down" style="width:14px;height:14px;"></i>Expandir todos
                </button>
                <button type="button" onclick="PlanoFinanceiroApp.collapseAllAccounts()" title="Recolher todos os níveis" style="padding:7px 10px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;color:#475569;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.75rem;font-weight:700;white-space:nowrap;">
                  <i data-lucide="chevrons-up" style="width:14px;height:14px;"></i>Recolher todos
                </button>
                <button onclick="PlanoFinanceiroApp.loadCategories()" title="Recarregar do Sienge" style="padding:7px 15px;background:#fef08a;border:1px solid #fde047;border-radius:6px;color:#854d0e;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.82rem;font-weight:700;transition:all 0.2s;">
                  <i data-lucide="refresh-cw" style="width:14px;height:14px;" id="pf-refresh-icon"></i>Atualizar
                </button>
                <select id="pf-type-filter" onchange="PlanoFinanceiroApp.onSearch()" style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;outline:none;">
                  <option value="">Todas as Contas</option>
                  <option value="T">Sintéticas (T)</option>
                  <option value="R">Analíticas (R)</option>
                </select>
              </div>
              <div style="flex:1;overflow:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;" id="pf-table">
                  <thead>
                    <tr style="background:#f1f5f9;position:sticky;top:0;z-index:1;">
                      <th style="padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;width:120px;">Conta</th>
                      <th style="padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;">Descrição</th>
                      <th style="padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;width:120px;">Tipo</th>
                      <th style="padding:10px 14px;text-align:center;border-bottom:2px solid #e2e8f0;width:80px;">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="pf-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Board DFC (70/30) -->
            <div id="pf-board-wrapper" style="flex:1;overflow:hidden;display:none;background:#f1f5f9;min-height:0;">
              <!-- Left Panel: Hierarchy/Structure -->
              <div style="flex:8;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
                <div style="padding:10px 15px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
                  <span style="font-weight:700;font-size:0.9rem;color:#1e293b;"><i data-lucide="folder-tree" style="width:16px;height:16px;vertical-align:middle;margin-right:5px;"></i>Estrutura da Visão</span>
                  <div style="display:flex;gap:5px;">
                     <button onclick="PlanoFinanceiroApp.expandAllNodes(true)" title="Expandir todos os nós" style="padding:4px 10px;background:#fff;color:#105436;border:1px solid #105436;border-radius:4px;font-size:0.75rem;cursor:pointer;">Expandir todos</button>
                     <button onclick="PlanoFinanceiroApp.expandAllNodes(false)" title="Recolher todos os nós" style="padding:4px 10px;background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:4px;font-size:0.75rem;cursor:pointer;">Recolher todos</button>
                     <button onclick="PlanoFinanceiroApp.autoAllocateUnassigned()" title="Encaixa contas Sienge nos nós por nome/código" style="padding:4px 10px;background:#fff;color:#105436;border:1px solid #105436;border-radius:4px;font-size:0.75rem;cursor:pointer;">Alocar contas</button>
                     <button onclick="PlanoFinanceiroApp.addNode(null)" style="padding:4px 10px;background:#105436;color:#fff;border:none;border-radius:4px;font-size:0.75rem;cursor:pointer;">+ Nó Raiz</button>
                  </div>
                </div>
                <div id="pf-dfc-tree" style="flex:1;overflow-y:auto;padding:15px;background:#fff;"></div>
              </div>

              <!-- Right Panel: Unassigned accounts -->
              <div style="flex:2;background:#f8fafc;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
                <div style="padding:10px 15px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                  <span style="font-weight:700;font-size:0.85rem;color:#374151;">Sienge Disponíveis</span>
                  <span id="pf-board-unassigned-count" style="font-size:0.7rem;background:#e2e8f0;color:#475569;padding:2px 8px;border-radius:10px;">0</span>
                </div>
                <div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#fff;">
                  <input type="text" id="pf-search-board" placeholder="Filtrar contas..." oninput="PlanoFinanceiroApp.renderBoard()" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:0.8rem;box-sizing:border-box;">
                </div>
                <div id="pf-board-unassigned" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;" ondragover="PlanoFinanceiroApp.onDragOver(event)" ondrop="PlanoFinanceiroApp.onDropUnassigned(event)"></div>
              </div>
            </div>

          </div>
        </div>
      </div>
      <div id="pf-modal-container"></div>
    `;
    if (window.lucide) lucide.createIcons();
    this.renderVisoesList();
  },

  _renderCompanyOptions() {
    const companies = AppState.companies || [];
    return companies.map(c => `<option value="${c.id}" ${String(this.selectedCompanyId) === String(c.id) ? 'selected' : ''}>${c.id} — ${c.name}</option>`).join('') || '<option value="">Nenhuma empresa</option>';
  },

  async loadCategories() {
    if (this.loading) return;
    this.loading = true;
    const icon = document.getElementById('pf-refresh-icon');
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';

    try {
      this.categories = await SiengeApiService.getPaymentCategories();
      this.categories.forEach(c => {
        c.name = c.name || c.description || c.financialCategoryName || '';
        c.tpConta = c.tpConta || c.type || c.financialCategoryType || '';
      });
      this.categories.sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'pt-BR', { numeric: true }));
      this.buildAccountTreeMeta();
      
      const allCount = document.getElementById('pf-all-count');
      if (allCount) allCount.textContent = this.categories.length;

      this.renderTable();
    } catch (e) {
      console.error('[PlanoFinanceiro] Erro:', e);
    } finally {
      this.loading = false;
      if (icon) icon.style.animation = '';
    }
  },

  selectVisao(id) { 
    this.selectedVisaoId = id; 
    this.renderVisoesList(); 
    this.renderTable(); 
  },
  
  renderVisoesList() {
    const list = document.getElementById('pf-visoes-list');
    const allItem = document.getElementById('pf-visao-all');
    if (!list) return;

    if (allItem) {
      const isAll = !this.selectedVisaoId;
      allItem.style.background = isAll ? '#e8f5ee' : '#f9fafb';
      allItem.style.border = isAll ? '1.5px solid #105436' : '1.5px solid #e5e7eb';
      allItem.style.color = isAll ? '#105436' : '#6b7280';
    }

    list.innerHTML = this.visoes.map(v => {
      const isActive = v.id === this.selectedVisaoId;
      return `
        <div onclick="PlanoFinanceiroApp.selectVisao('${v.id}')"
          style="padding:8px 9px;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px;background:${isActive ? '#e8f5ee' : '#f9fafb'};border:1.5px solid ${isActive ? '#105436' : '#e5e7eb'};color:${isActive ? '#105436' : '#374151'};">
          <span style="overflow:hidden;text-overflow:ellipsis;">${v.name}</span>
          <button onclick="PlanoFinanceiroApp.editarNomeVisao('${v.id}', event)" style="background:transparent;border:none;cursor:pointer;color:inherit;padding:2px;display:${v.id === 'dfc_default' ? 'none' : 'flex'};" title="Editar Nome"><i data-lucide="edit-2" style="width:12px;height:12px;"></i></button>
        </div>`;
    }).join('');
  },

  _updateVisaoBar() {
    const bar = document.getElementById('pf-visao-bar');
    const barName = document.getElementById('pf-visao-bar-name');
    const btnExcluir = document.getElementById('pf-btn-excluir');
    if (!bar) return;
    if (this.selectedVisaoId) {
      const v = this.visoes.find(v => v.id === this.selectedVisaoId);
      if (v) { 
        bar.style.display = 'flex'; 
        if(barName) barName.textContent = v.name; 
        if(btnExcluir) {
          btnExcluir.style.display = (v.id === 'dfc_default') ? 'none' : 'flex';
        }
      }
    } else { bar.style.display = 'none'; }
  },

  novaVisao() {
    const name = prompt('Nome da nova Visão DFC:');
    if (!name || !name.trim()) return;
    const id = 'visao_' + Date.now();
    this.visoes.push({ id, name: name.trim(), type: 'custom', groups: [] });
    this.saveToStorage(); this.selectVisao(id);
  },

  duplicarVisao() {
    if (!this.selectedVisaoId) return;
    const v = this.visoes.find(vis => vis.id === this.selectedVisaoId);
    if (!v) return;

    const n = prompt('Nome da nova Visão DFC:', v.name + ' (Cópia)');
    if (!n || !n.trim()) return;

    // Clonagem profunda dos grupos
    const newGroups = JSON.parse(JSON.stringify(v.groups));
    
    // Remapear IDs para evitar conflito com a original e manter a hierarquia local correta
    const idMap = {};
    newGroups.forEach(g => {
      const newId = 'g_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      idMap[g.id] = newId;
      g.id = newId;
    });
    
    newGroups.forEach(g => {
      if (g.parentId && idMap[g.parentId]) {
        g.parentId = idMap[g.parentId];
      }
    });

    const newId = 'visao_' + Date.now();
    this.visoes.push({
      id: newId,
      name: n.trim(),
      type: 'custom',
      groups: newGroups
    });
    this.saveToStorage();
    this.selectVisao(newId);
  },

  excluirVisao() {
    if (!this.selectedVisaoId) return;
    if (confirm('Tem certeza que deseja excluir esta visão?')) {
      this.visoes = this.visoes.filter(v => v.id !== this.selectedVisaoId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.visoes));
      this.selectVisao(null);
    }
  },

  editarNomeVisao(id, event) {
    if (event) event.stopPropagation();
    const v = this.visoes.find(x => x.id === id);
    if (!v) return;
    const novoNome = prompt('Novo nome para a visão:', v.name);
    if (novoNome && novoNome.trim() !== '') {
      v.name = novoNome.trim();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.visoes));
      this.renderVisoesList();
      if (this.selectedVisaoId === id) this._updateVisaoBar();
      if (window.lucide) lucide.createIcons();
    }
  },

  // ─── Renderização Padrão / Tabela Base ────────────────────────────────────
  renderTable() {
    const v = this.selectedVisaoId ? this.visoes.find(vis => vis.id === this.selectedVisaoId) : null;
    if (v && v.type === 'custom') {
      document.getElementById('pf-table-wrapper').style.display = 'none';
      document.getElementById('pf-board-wrapper').style.display = 'flex';
      this.renderBoard();
    } else {
      document.getElementById('pf-table-wrapper').style.display = 'flex';
      document.getElementById('pf-board-wrapper').style.display = 'none';
      this._renderSiengeTable();
    }
  },

  onSearch() {
    this.renderTable();
  },

  _filtered(searchTerm) {
    const typeFilter = (document.getElementById('pf-type-filter') || {}).value || '';
    
    const matched = this.categories.filter(c => {
      const q = (searchTerm || '').toLowerCase();
      const matchText = !q || String(c.id || '').toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q);
      
      let typeStr = String(c.tpConta || '').toLowerCase();
      let matchType = true;
      if (typeFilter === 'T') matchType = typeStr === 't' || typeStr.includes('total');
      else if (typeFilter === 'R') matchType = typeStr === 'r' || typeStr.includes('resultado');
      
      return matchText && matchType;
    });

    if (typeFilter) return matched;

    const keepIds = new Set(matched.map(c => String(c.id)));
    const allIds = new Set(this.categories.map(c => String(c.id)));
    
    matched.forEach(c => {
      const strId = String(c.id);
      for (let i = 1; i < strId.length; i++) {
        const prefix = strId.substring(0, i);
        if (allIds.has(prefix)) keepIds.add(prefix);
      }
    });

    return this.categories.filter(c => keepIds.has(String(c.id)));
  },

  _renderSiengeTable() {
    const searchTerm = (document.getElementById('pf-search') || {}).value || '';
    const tbody = document.getElementById('pf-tbody');
    if (!tbody) return;

    let filtered = this._filtered(searchTerm);
    const typeFilter = (document.getElementById('pf-type-filter') || {}).value || '';

    if (!typeFilter) {
      filtered = filtered.filter(cat => !this.isAccountHiddenByCollapse(cat));
    }

    tbody.innerHTML = filtered.map((cat, idx) => {
      const strId = String(cat.id);
      const isInactive = cat.flAtiva === 'N';
      let descTags = isInactive ? `<span style="background:#e5e7eb;color:#4b5563;font-size:0.65rem;padding:2px 6px;border-radius:4px;margin-left:5px;">INATIVA</span>` : '';
      const myTax = this.taxConfig[strId];
      if (myTax) descTags += `<span style="margin-left:5px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-size:0.65rem;padding:2px 6px;border-radius:4px;font-weight:700;">[ Fiscal: ${myTax} ]</span>`;

      const typeInfo = this.accountTypeLabel(cat);
      const isTotalizadora = typeInfo.synthetic;
      const depth = typeFilter ? 0 : (cat._depth || 0);
      const hasChildren = !!cat._hasChildren;
      const isCollapsed = this.collapsedIds.has(strId);
      let toggleBtn = '<span style="display:inline-block;width:22px;"></span>';
      if (!typeFilter && hasChildren) {
        toggleBtn = `<span style="display:inline-flex;align-items:center;gap:0;">
          <button type="button" onclick="PlanoFinanceiroApp.toggleAccordion('${strId}', 'this')" title="${isCollapsed ? 'Expandir este nível' : 'Recolher este'}" style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;">
            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" style="width:14px;height:14px;"></i>
          </button>
          <button type="button" onclick="PlanoFinanceiroApp.openAccountFoldMenu(event, '${strId}')" title="Expandir / recolher este, o nível ou todos" style="background:none;border:none;cursor:pointer;padding:0 2px;color:#94a3b8;display:flex;align-items:center;">
            <i data-lucide="chevrons-up-down" style="width:12px;height:12px;"></i>
          </button>
        </span>`;
      }

      const zebra = idx % 2 === 0 ? '#fff' : '#f8fafc';
      const rowStyle = isInactive 
        ? `background:#f3f4f6; color:#9ca3af; text-decoration:line-through; opacity:0.7; border-bottom:1px solid #eef2f7;` 
        : isTotalizadora 
          ? `background:${depth === 0 ? '#eef6f2' : '#f8fafc'}; font-weight:700; color:#1e293b; border-bottom:1px solid #e2e8f0;`
          : `background:${zebra}; border-bottom:1px solid #f1f5f9;`;

      return `
        <tr style="${rowStyle}">
          <td style="padding:8px 14px;font-family:ui-monospace,Consolas,monospace;font-size:0.8rem;white-space:nowrap;vertical-align:middle;">
             <span style="display:inline-flex;align-items:center;gap:4px;">
               ${toggleBtn}
               <span style="color:${isTotalizadora ? '#105436' : '#334155'};font-weight:${isTotalizadora ? 800 : 600};">${strId}</span>
             </span>
          </td>
          <td style="padding:8px 14px;font-size:0.82rem;padding-left:${16 + (depth * 18)}px;font-weight:${isTotalizadora ? 700 : 500};text-transform:${isTotalizadora ? 'uppercase' : 'none'};">${this.esc(cat.name)} ${descTags}</td>
          <td style="padding:8px 14px;font-size:0.78rem;color:#475569;">${typeInfo.label}</td>
          <td style="padding:8px 14px;text-align:center;">
             <button onclick="PlanoFinanceiroApp.openTaxModal('${strId}')" title="Base fiscal" style="background:none;border:none;cursor:pointer;color:#64748b;"><i data-lucide="settings" style="width:14px;"></i></button>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
    this._updateVisaoBar();
  },

  toggleAccordion(id, scope) {
    this.closeAccountFoldMenu();
    const sid = String(id);
    const nextCollapsed = !this.collapsedIds.has(sid);
    if (scope === 'level') {
      const cat = this.categories.find(c => String(c.id) === sid);
      const parent = cat ? cat._parentId : null;
      this.categories.filter(c => c._hasChildren && String(c._parentId || '') === String(parent || '')).forEach(c => {
        if (nextCollapsed) this.collapsedIds.add(String(c.id));
        else this.collapsedIds.delete(String(c.id));
      });
    } else if (scope === 'all') {
      if (nextCollapsed) this.collapseAllAccounts();
      else this.expandAllAccounts();
      return;
    } else {
      if (this.collapsedIds.has(sid)) this.collapsedIds.delete(sid);
      else this.collapsedIds.add(sid);
    }
    this.renderTable();
  },

  expandAllAccounts() {
    this.closeAccountFoldMenu();
    this.collapsedIds = new Set();
    this.renderTable();
  },

  collapseAllAccounts() {
    this.closeAccountFoldMenu();
    this.collapsedIds = new Set(this.categories.filter(c => c._hasChildren).map(c => String(c.id)));
    this.renderTable();
  },

  expandAllNodes(expand) {
    this.closeNodeFoldMenu();
    const v = this.getVisao();
    if (!v || !Array.isArray(v.groups)) return;
    v.groups.forEach(g => { g.expanded = !!expand; });
    this.saveToStorage({ silent: true });
    this.renderBoard();
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  accountTypeLabel(cat) {
    const t = String(cat.tpConta || cat.type || '').toLowerCase();
    const synthetic = t === 't' || t.includes('total') || t.includes('sintet');
    const analytic = t === 'r' || t.includes('result') || t.includes('analit');
    if (synthetic) return { synthetic: true, label: 'T · Sintética' };
    if (analytic) return { synthetic: false, label: 'R · Analítica' };
    return { synthetic: false, label: cat.tpConta || '—' };
  },

  buildAccountTreeMeta() {
    const ids = this.categories.map(c => String(c.id || '')).filter(Boolean);
    const idSet = new Set(ids);
    const parentOf = (id) => {
      const s = String(id || '');
      if (!s) return null;
      if (s.includes('.')) {
        const parts = s.split('.').filter(Boolean);
        while (parts.length > 1) {
          parts.pop();
          const cand = parts.join('.');
          if (idSet.has(cand)) return cand;
        }
        return null;
      }
      let best = null;
      idSet.forEach(other => {
        if (other === s || other.length >= s.length) return;
        if (s.startsWith(other) && (!best || other.length > best.length)) best = other;
      });
      return best;
    };
    this.categories.forEach(c => {
      c._parentId = parentOf(c.id);
    });
    this.categories.forEach(c => {
      const id = String(c.id);
      c._hasChildren = this.categories.some(x => String(x._parentId) === id);
      let depth = 0;
      let p = c._parentId;
      const seen = new Set();
      while (p && !seen.has(p)) {
        seen.add(p);
        depth++;
        const parent = this.categories.find(x => String(x.id) === p);
        p = parent ? parent._parentId : null;
      }
      c._depth = depth;
    });
  },

  isAccountHiddenByCollapse(cat) {
    let p = cat._parentId;
    const seen = new Set();
    while (p && !seen.has(p)) {
      if (this.collapsedIds.has(p)) return true;
      seen.add(p);
      const parent = this.categories.find(x => String(x.id) === p);
      p = parent ? parent._parentId : null;
    }
    return false;
  },

  closeAccountFoldMenu() {
    const el = document.getElementById('pf-account-fold-menu');
    if (el) el.remove();
    if (this._accFoldCloser) {
      document.removeEventListener('click', this._accFoldCloser);
      this._accFoldCloser = null;
    }
  },

  openAccountFoldMenu(event, id) {
    event.preventDefault();
    event.stopPropagation();
    this.closeAccountFoldMenu();
    const sid = String(id);
    const collapsed = this.collapsedIds.has(sid);
    const menu = document.createElement('div');
    menu.id = 'pf-account-fold-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,0.14);min-width:230px;padding:6px;overflow:hidden;';
    const r = event.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    const item = (label, fn) => `<button type="button" onclick="${fn}" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;font-weight:600;">${label}</button>`;
    menu.innerHTML = `
      ${item(collapsed ? 'Expandir apenas este' : 'Recolher apenas este', `PlanoFinanceiroApp.toggleAccordion('${sid}', 'this')`)}
      ${item(collapsed ? 'Expandir o nível inteiro' : 'Recolher o nível inteiro', `PlanoFinanceiroApp.toggleAccordion('${sid}', 'level')`)}
      <div style="height:1px;background:#e2e8f0;margin:4px 0;"></div>
      ${item('Expandir todos', "PlanoFinanceiroApp.expandAllAccounts()")}
      ${item('Recolher todos', "PlanoFinanceiroApp.collapseAllAccounts()")}
    `;
    document.body.appendChild(menu);
    this._accFoldCloser = () => this.closeAccountFoldMenu();
    setTimeout(() => document.addEventListener('click', this._accFoldCloser), 0);
  },

  openTaxModal(id) {
    const currentBase = this.taxConfig[id] || '';
    const cat = this.categories.find(c => String(c.id) === String(id));
    const nome = cat ? (cat.name || '') : '';
    const modalHtml = `
      <div id="pf-tax-overlay" style="position:fixed;inset:0;background:rgba(12,41,29,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">
        <div style="background:#fff;border-radius:12px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,0.22);border:1px solid rgba(16,84,54,0.12);">
          <div style="background:#105436;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="color:#fff;font-size:0.95rem;font-weight:800;">Base fiscal</div>
              <div style="color:rgba(255,255,255,0.82);font-size:0.75rem;margin-top:2px;">Conta ${this.esc(id)}${nome ? ' · ' + this.esc(nome) : ''}</div>
            </div>
            <button type="button" onclick="document.getElementById('pf-tax-overlay').remove()" style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.3);color:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1.1rem;line-height:1;">×</button>
          </div>
          <div style="padding:18px;">
            <label style="display:block;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Base de cálculo</label>
            <select id="pf-tax-select" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;color:#0f172a;background:#fff;box-sizing:border-box;">
              <option value="">Nenhuma</option>
              ${this.taxBases.map(b => `<option value="${this.esc(b)}" ${currentBase===b?'selected':''}>${this.esc(b)}</option>`).join('')}
            </select>
            <p style="margin:10px 0 0;font-size:0.75rem;color:#64748b;line-height:1.4;">A base escolhida fica vinculada a esta conta do plano e é usada nos cálculos fiscais.</p>
          </div>
          <div style="padding:0 18px 16px;display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" onclick="document.getElementById('pf-tax-overlay').remove()" style="padding:8px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:700;cursor:pointer;">Cancelar</button>
            <button type="button" onclick="PlanoFinanceiroApp.saveTaxConfig('${id}')" style="padding:8px 16px;border-radius:8px;border:0;background:#105436;color:#fff;font-weight:800;cursor:pointer;">Salvar</button>
          </div>
        </div>
      </div>
    `;
    const container = document.getElementById('pf-modal-container');
    if (container) container.innerHTML = modalHtml;
  },

  saveTaxConfig(id) {
    const val = document.getElementById('pf-tax-select').value;
    if (val) this.taxConfig[id] = val; else delete this.taxConfig[id];
    localStorage.setItem('crm_plano_impostos', JSON.stringify(this.taxConfig));
    document.getElementById('pf-tax-overlay').remove();
    this.renderTable();
  },

  // ─── DFC Drag&Drop & Estrutura Hierárquica ─────────────────────────────────
  
  getVisao() { return this.visoes.find(vis => vis.id === this.selectedVisaoId); },
  saveToStorage(opts) {
    if (!opts || !opts.silent) {
      const now = Date.now();
      (this.visoes || []).forEach(v => { v.updatedAt = now; });
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.visoes));
  },

  async syncVisoesWithCloud() {
    try {
      if (!window.firebaseDb || !window.firebaseCollections) return;
      const { doc, getDoc, setDoc } = window.firebaseCollections;
      const docRef = doc(window.firebaseDb, "config", "global");
      const snap = await getDoc(docRef);
      const cloud = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists) ? (snap.data() || {}) : {};
      const local = localStorage.getItem(this.STORAGE_KEY) || "[]";
      const merged = (typeof window.mergePlanoVisoes === "function")
        ? window.mergePlanoVisoes(local, cloud.crm_plano_visoes_v2)
        : (cloud.crm_plano_visoes_v2 || local);
      if (merged && merged !== local) {
        try { this.visoes = JSON.parse(merged) || this.visoes; } catch (e) {}
        this.ensureDfcDefault();
        this.saveToStorage({ silent: true });
        this.renderVisoesList();
        if (this.selectedVisaoId) this.renderBoard();
        else this.renderTable();
      }
      if (merged && merged !== cloud.crm_plano_visoes_v2) {
        await setDoc(docRef, { crm_plano_visoes_v2: merged }, { merge: true });
      }
    } catch (e) {
      console.warn("[Plano Financeiro] Sync visões:", e);
    }
  },

  renderBoard() {
    const v = this.getVisao();
    if (!v) return;
    this.alignMisplacedN1Children(v);

    // 1. Descobrir contas Sienge já atribuídas
    const assignedIds = new Set();
    v.groups.forEach(g => {
      if (g.accounts) g.accounts.forEach(a => assignedIds.add(String(a)));
    });

    if (!v.ignoredAccounts) v.ignoredAccounts = [];
    const ignoredIds = new Set(v.ignoredAccounts);

    // 2. Render Unassigned
    const unassignedContainer = document.getElementById('pf-board-unassigned');
    const searchTerm = (document.getElementById('pf-search-board') || {}).value || '';
    const q = searchTerm.toLowerCase();

    // Filtra resultado/analiticas apenas e não atribuidas e não ignoradas
    let unassigned = this.categories.filter(c => String(c.tpConta).toLowerCase() === 'r' && !assignedIds.has(String(c.id)) && !ignoredIds.has(String(c.id)));
    if (q) unassigned = unassigned.filter(c => String(c.id).includes(q) || String(c.name).toLowerCase().includes(q));

    const totalUnassignedUnignored = this.categories.filter(c => String(c.tpConta).toLowerCase() === 'r' && !assignedIds.has(String(c.id)) && !ignoredIds.has(String(c.id))).length;

    const uCount = document.getElementById('pf-board-unassigned-count');
    if(uCount) uCount.textContent = totalUnassignedUnignored;

    if (unassignedContainer) {
      let html = '';
      if (totalUnassignedUnignored > 0 && !q) {
         html += `
           <div style="background:#fefce8;border:1px solid #fef08a;color:#a16207;padding:8px 10px;border-radius:6px;font-size:0.75rem;display:flex;align-items:center;gap:6px;margin-bottom:10px;font-weight:600;">
             <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> Existem ${totalUnassignedUnignored} contas não vinculadas.
           </div>
         `;
      }
      
      if (v.ignoredAccounts && v.ignoredAccounts.length > 0 && !q) {
         html += `
           <div style="margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid #cbd5e1;">
             <div style="font-size:0.75rem;color:#dc2626;font-weight:600;margin-bottom:8px;">Contas Desconsideradas (${v.ignoredAccounts.length})</div>
             ${v.ignoredAccounts.map(id => {
               const c = this.categories.find(x => String(x.id) === String(id));
               const name = c ? c.name : 'Desconhecida';
               return `
                 <div style="background:#fef2f2;border:1px solid #fca5a5;padding:6px 8px;border-radius:6px;font-size:0.7rem;color:#b91c1c;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                   <span>${id} - <span style="font-weight:normal;">${name.substring(0, 20)}...</span></span>
                   <button onclick="PlanoFinanceiroApp.restoreAccount('${id}')" title="Restaurar" style="background:none;border:none;color:#dc2626;cursor:pointer;"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i></button>
                 </div>
               `;
             }).join('')}
           </div>
         `;
      }
      
      html += unassigned.map(c => `
        <div draggable="true" ondragstart="PlanoFinanceiroApp.onDragStart(event, '${c.id}')"
             style="background:#fff;border:1px solid #cbd5e1;padding:8px 10px;border-radius:6px;font-size:0.75rem;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,0.05);display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:8px;"
             onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#cbd5e1'">
          <div style="display:flex;flex-direction:column;gap:3px;overflow:hidden;">
            <strong style="color:#0f172a;font-family:monospace;">${c.id}</strong>
            <span style="color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${c.name}">${c.name}</span>
          </div>
          <button onclick="PlanoFinanceiroApp.ignoreAccount('${c.id}')" title="Desconsiderar esta conta" style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:4px;"><i data-lucide="eye-off" style="width:14px;height:14px;"></i></button>
        </div>
      `).join('');
      
      unassignedContainer.innerHTML = html;
    }

    // 3. Render Tree
    const treeContainer = document.getElementById('pf-dfc-tree');
    if (treeContainer) {
      const roots = v.groups.filter(g => !g.parentId).sort((a, b) => this.compareNodeNames(a.name, b.name));
      treeContainer.innerHTML = roots.map(r => this.renderNodeHtml(r, v.groups, 0)).join('');
    }

    this._updateVisaoBar();
    if (window.lucide) lucide.createIcons();
  },

  compareNodeNames(a, b) {
    const na = String(a || '').match(/\d+/g) || [];
    const nb = String(b || '').match(/\d+/g) || [];
    const len = Math.max(na.length, nb.length);
    for (let i = 0; i < len; i++) {
      const va = parseInt(na[i] || '0', 10);
      const vb = parseInt(nb[i] || '0', 10);
      if (va !== vb) return va - vb;
    }
    return String(a || '').localeCompare(String(b || ''), 'pt-BR');
  },

  inferChildType(parent, siblings) {
    if (!parent) return 'total_n1';
    if (parent.type === 'formula') return null;
    if (parent.type === 'resultado') return null;
    if (parent.type === 'totalizadora') return 'resultado';
    if (parent.type === 'total_n1') {
      const nRes = (siblings || []).filter(s => s.type === 'resultado').length;
      const nTot = (siblings || []).filter(s => s.type === 'totalizadora').length;
      if (nRes >= nTot) return 'resultado';
      return nTot > 0 ? 'totalizadora' : 'resultado';
    }
    return 'resultado';
  },

  alignMisplacedN1Children(v) {
    if (!v || !Array.isArray(v.groups)) return;
    let changed = false;
    v.groups.forEach(g => {
      if (!g.parentId) return;
      const parent = v.groups.find(p => p.id === g.parentId);
      if (!parent || parent.type !== 'total_n1') return;
      const hasKids = v.groups.some(c => c.parentId === g.id);
      const siblings = v.groups.filter(x => x.parentId === g.parentId);
      const nRes = siblings.filter(x => x.type === 'resultado').length;
      if (g.type === 'totalizadora' && !hasKids && nRes > 0) {
        g.type = 'resultado';
        if (!Array.isArray(g.accounts)) g.accounts = [];
        changed = true;
      }
    });
    if (changed) this.saveToStorage({ silent: true });
  },

  renderNodeHtml(node, allGroups, level) {
    const children = allGroups.filter(g => g.parentId === node.id).sort((a, b) => this.compareNodeNames(a.name, b.name));
    const marginLeft = level * 20;
    const isExpanded = node.expanded !== false;
    const expandIcon = isExpanded ? 'chevron-down' : 'chevron-right';
    const hasContent = children.length > 0 || (node.accounts && node.accounts.length > 0);

    let bg = '#fff', borderLeft = '#cbd5e1', icon = 'folder';
    if (node.type === 'total_n1') { bg = '#f8fafc'; borderLeft = '#0f766e'; icon = 'layers'; }
    if (node.type === 'totalizadora') { bg = '#fff'; borderLeft = '#3b82f6'; icon = 'folder-open'; }
    if (node.type === 'resultado') { bg = '#fff'; borderLeft = '#eab308'; icon = 'file-text'; }
    if (node.type === 'formula') { bg = '#ecfdf5'; borderLeft = '#105436'; icon = 'calculator'; }

    const dropEvents = node.type === 'resultado' ? `ondragover="PlanoFinanceiroApp.onDragOver(event)" ondragleave="PlanoFinanceiroApp.onDragLeave(event)" ondrop="PlanoFinanceiroApp.onDropGroup(event, '${node.id}')"` : '';
    const canAddChild = node.type !== 'resultado' && node.type !== 'formula';

    let html = `
      <div style="margin-left:${marginLeft}px; margin-bottom:5px;">
        <div style="background:${bg}; border:1px solid #e2e8f0; border-left:4px solid ${borderLeft}; border-radius:6px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 2px rgba(0,0,0,0.02);" ${dropEvents}>
          
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <div style="display:flex;align-items:center;gap:0;position:relative;">
              <button type="button" onclick="PlanoFinanceiroApp.toggleNode('${node.id}', 'this')" title="Recolher / expandir este"
                style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;opacity:${hasContent ? 1 : 0.35};">
                <i data-lucide="${expandIcon}" style="width:14px;height:14px;"></i>
              </button>
              <button type="button" onclick="PlanoFinanceiroApp.openNodeFoldMenu(event, '${node.id}')" title="Recolher este ou o nível inteiro"
                style="background:none;border:none;cursor:pointer;padding:0 2px;color:#94a3b8;display:flex;align-items:center;">
                <i data-lucide="chevrons-up-down" style="width:12px;height:12px;"></i>
              </button>
            </div>
            
            <i data-lucide="${icon}" style="width:14px;height:14px;color:${borderLeft};"></i>
            <span style="font-weight:${node.type==='total_n1'?'700':'600'}; font-size:0.85rem; color:#1e293b; cursor:pointer;" onclick="PlanoFinanceiroApp.editNodeName('${node.id}')">${node.name}</span>
          </div>
          
          <div style="display:flex; align-items:center; gap:5px;">
            ${canAddChild ? `<button onclick="PlanoFinanceiroApp.addNode('${node.id}')" title="Adicionar Sub-nível" style="background:none;border:none;color:#10b981;cursor:pointer;padding:2px;"><i data-lucide="plus-circle" style="width:14px;height:14px;"></i></button>` : ''}
            <button onclick="PlanoFinanceiroApp.deleteNode('${node.id}')" title="Excluir" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:2px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
          </div>
        </div>
    `;

    if (isExpanded) {
      if (children.length > 0) {
        html += children.map(c => this.renderNodeHtml(c, allGroups, level + 1)).join('');
      }

      if (node.type === 'resultado' && node.accounts && node.accounts.length > 0) {
        html += `<div style="margin-left:${marginLeft + 28}px; margin-top:5px; margin-bottom:10px; display:flex; flex-direction:column; gap:4px; padding-left:10px; border-left:2px solid #e2e8f0;" ondragover="PlanoFinanceiroApp.onDragOver(event)" ondrop="PlanoFinanceiroApp.onDropGroup(event, '${node.id}')">`;
        node.accounts.forEach(accId => {
          const c = this.categories.find(cat => String(cat.id) === String(accId));
          const name = c ? c.name : 'Conta não encontrada';
          html += `
            <div draggable="true" ondragstart="PlanoFinanceiroApp.onDragStart(event, '${accId}', '${node.id}')" ondragend="PlanoFinanceiroApp.onDragEnd()"
                 title="Arraste para outro grupo amarelo"
                 style="background:#f8fafc; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
              <div style="pointer-events:none;"><strong style="color:#0f172a;">${accId}</strong> <span style="color:#64748b;">${name}</span></div>
              <button onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); PlanoFinanceiroApp.removeAccountFromGroup('${node.id}', '${accId}')" title="Remover deste grupo" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;line-height:1;">&times;</button>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  },

  toggleNode(id, scope) {
    this.closeNodeFoldMenu();
    const v = this.getVisao();
    const node = v.groups.find(g => g.id === id);
    if (!node) return;
    const next = !(node.expanded !== false);
    if (scope === 'level') {
      v.groups.filter(g => String(g.parentId || '') === String(node.parentId || '')).forEach(g => { g.expanded = next; });
    } else {
      node.expanded = next;
    }
    this.saveToStorage();
    this.renderBoard();
  },

  closeNodeFoldMenu() {
    const el = document.getElementById('pf-node-fold-menu');
    if (el) el.remove();
    if (this._foldMenuCloser) {
      document.removeEventListener('click', this._foldMenuCloser);
      this._foldMenuCloser = null;
    }
  },

  openNodeFoldMenu(event, id) {
    event.preventDefault();
    event.stopPropagation();
    this.closeNodeFoldMenu();
    const v = this.getVisao();
    const node = v.groups.find(g => g.id === id);
    if (!node) return;
    const expanded = node.expanded !== false;
    const menu = document.createElement('div');
    menu.id = 'pf-node-fold-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,0.12);min-width:200px;padding:6px;';
    const r = event.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    menu.innerHTML = `
      <button type="button" onclick="PlanoFinanceiroApp.toggleNode('${id}', 'this')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? 'Recolher apenas este' : 'Expandir apenas este'}</button>
      <button type="button" onclick="PlanoFinanceiroApp.toggleNode('${id}', 'level')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? 'Recolher o nível inteiro' : 'Expandir o nível inteiro'}</button>
      <div style="height:1px;background:#e2e8f0;margin:4px 0;"></div>
      <button type="button" onclick="PlanoFinanceiroApp.expandAllNodes(true)" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">Expandir todos</button>
      <button type="button" onclick="PlanoFinanceiroApp.expandAllNodes(false)" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">Recolher todos</button>
    `;
    document.body.appendChild(menu);
    this._foldMenuCloser = () => this.closeNodeFoldMenu();
    setTimeout(() => document.addEventListener('click', this._foldMenuCloser), 0);
  },

  editNodeName(id) {
    const v = this.getVisao();
    const node = v.groups.find(g => g.id === id);
    const n = prompt('Novo nome:', node.name);
    if(n && n.trim()){ node.name = n.trim(); this.saveToStorage(); this.renderBoard(); }
  },

  addNode(parentId) {
    const v = this.getVisao();
    if(!v) return;

    const parent = parentId ? v.groups.find(g => g.id === parentId) : null;
    const siblings = v.groups.filter(g => String(g.parentId || '') === String(parentId || ''));
    const type = parentId ? this.inferChildType(parent, siblings) : 'total_n1';
    if (!type) return;

    const typeLabels = { 'total_n1':'Total Nível 1', 'totalizadora':'Totalizadora', 'resultado':'Resultado (contas Sienge)' };
    const n = prompt(`Nome do novo nó (${typeLabels[type]}):`);
    if(!n || !n.trim()) return;

    const newNode = {
      id: 'n_' + Date.now(),
      name: n.trim(),
      type: type,
      parentId: parentId || null,
      accounts: type === 'resultado' ? [] : undefined,
      expanded: true
    };
    const insertAt = v.groups.findIndex(g => String(g.parentId || '') === String(parentId || '') && this.compareNodeNames(newNode.name, g.name) < 0);
    const lastSib = [...v.groups].map((g, i) => ({ g, i })).filter(x => String(x.g.parentId || '') === String(parentId || '')).pop();
    if (insertAt >= 0) v.groups.splice(insertAt, 0, newNode);
    else if (lastSib) v.groups.splice(lastSib.i + 1, 0, newNode);
    else v.groups.push(newNode);
    this.saveToStorage();
    this.renderBoard();
  },

  deleteNode(id) {
    const v = this.getVisao();
    if(!v) return;
    
    // Check if it has children or accounts
    const hasChildren = v.groups.some(g => g.parentId === id);
    const node = v.groups.find(g => g.id === id);
    const hasAccounts = node && node.accounts && node.accounts.length > 0;

    if(hasChildren || hasAccounts) {
      if(!confirm('Este nó possui filhos ou contas. Deseja realmente excluir tudo abaixo dele?')) return;
    }

    // Recursive delete
    const idsToDelete = new Set([id]);
    let added = true;
    while(added) {
      added = true;
      added = false;
      v.groups.forEach(g => {
        if(idsToDelete.has(g.parentId) && !idsToDelete.has(g.id)) {
          idsToDelete.add(g.id);
          added = true;
        }
      });
    }

    v.groups = v.groups.filter(g => !idsToDelete.has(g.id));
    this.saveToStorage();
    this.renderBoard();
  },

  removeAccountFromGroup(groupId, accId) {
    const v = this.getVisao();
    const g = v.groups.find(gr => gr.id === groupId);
    if(g && g.accounts) {
      g.accounts = g.accounts.filter(a => String(a) !== String(accId));
      this.saveToStorage();
      this.renderBoard();
    }
  },

  ignoreAccount(id) {
    const v = this.getVisao();
    if(!v) return;
    if(!v.ignoredAccounts) v.ignoredAccounts = [];
    v.ignoredAccounts.push(String(id));
    this.saveToStorage();
    this.renderBoard();
  },

  restoreAccount(id) {
    const v = this.getVisao();
    if(!v || !v.ignoredAccounts) return;
    v.ignoredAccounts = v.ignoredAccounts.filter(x => x !== String(id));
    this.saveToStorage();
    this.renderBoard();
  },

  onDragStart(e, accId, fromGroupId) {
    this.draggedAccountId = String(accId);
    this.draggedFromGroupId = fromGroupId ? String(fromGroupId) : null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', accId);
    if (e.currentTarget && e.currentTarget.style) e.currentTarget.style.opacity = '0.45';
  },

  onDragEnd() {
    this.clearDropHighlights();
    this.draggedAccountId = this.draggedAccountId || null;
  },

  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const el = e.currentTarget;
    if (el && el.style) {
      el.style.outline = '2px solid #105436';
      el.style.outlineOffset = '1px';
      el.style.backgroundColor = '#ecfdf5';
    }
  },

  onDragLeave(e) {
    const el = e.currentTarget;
    if (el && el.style) {
      el.style.outline = '';
      el.style.backgroundColor = '';
    }
  },

  clearDropHighlights() {
    document.querySelectorAll('#pf-dfc-tree [style*="outline"]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.backgroundColor = '';
      el.style.opacity = '';
    });
  },

  onDropUnassigned(e) {
    e.preventDefault();
    this.clearDropHighlights();
    if (!this.draggedAccountId || !this.selectedVisaoId) return;
    const v = this.getVisao();
    if (!v) return;
    
    v.groups.forEach(g => {
      if(g.accounts) g.accounts = g.accounts.filter(a => String(a) !== this.draggedAccountId);
    });
    
    this.draggedAccountId = null;
    this.draggedFromGroupId = null;
    this.saveToStorage();
    this.renderBoard();
  },

  onDropGroup(e, groupId) {
    e.preventDefault();
    e.stopPropagation();
    this.clearDropHighlights();

    if (!this.draggedAccountId || !this.selectedVisaoId) return;
    const v = this.getVisao();
    if (!v) return;
    if (this.draggedFromGroupId && String(this.draggedFromGroupId) === String(groupId)) {
      this.draggedAccountId = null;
      return;
    }
    
    v.groups.forEach(g => {
      if(g.accounts) g.accounts = g.accounts.filter(a => String(a) !== this.draggedAccountId);
    });
    
    const group = v.groups.find(g => g.id === groupId);
    if (group && group.type === 'resultado') {
      if(!group.accounts) group.accounts = [];
      group.accounts.push(this.draggedAccountId);
      group.accounts.sort((a,b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
      group.expanded = true;
    }
    
    this.draggedAccountId = null;
    this.draggedFromGroupId = null;
    this.saveToStorage();
    this.renderBoard();
  }
};

function initPlanoFinanceiroModule() {
  PlanoFinanceiroApp.init();
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'plano-financeiro') {
    initPlanoFinanceiroModule();
  }
});
