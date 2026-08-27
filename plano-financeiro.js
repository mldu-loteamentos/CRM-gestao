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
    await this.loadCategories();
  },

  dfcTemplateGroups() {
    const n = (id, name, type, parentId, extra = {}) => ({
      id, name, type, parentId, expanded: true,
      accounts: type === 'resultado' ? [] : undefined,
      ...extra
    });
    return [
      n('g_01', '01 RECEITAS', 'total_n1', null),
      n('g_01_01', '01.01 VENDA DE IMOVEIS', 'resultado', 'g_01'),
      n('g_01_02', '01.02 RECEITA DE ALUGUEIS', 'resultado', 'g_01'),
      n('g_01_03', '01.03 RECEITA DE SERVICOS', 'resultado', 'g_01'),
      n('g_01_04', '01.04 RECEITAS NAO OPERACIONAIS', 'resultado', 'g_01'),
      n('g_01_05', '01.05 CANCELAMENTO DE VENDAS', 'resultado', 'g_01', { redutora: true }),
      n('g_02', '02 IMPOSTOS', 'total_n1', null),
      n('g_02_01', '02.01 IMPOSTOS SOBRE VENDAS', 'resultado', 'g_02'),
      n('g_02_02', '02.02 IMPOSTOS TRIMESTRAIS', 'resultado', 'g_02'),
      n('g_03', '03 CUSTOS E DESPESAS', 'total_n1', null),
      n('g_03_01', '03.01 CUSTOS', 'totalizadora', 'g_03'),
      n('g_03_01_01', '03.01.01 TERRENOS / REPASSES', 'resultado', 'g_03_01'),
      n('g_03_01_02', '03.01.02 PROJETOS', 'resultado', 'g_03_01'),
      n('g_03_01_03', '03.01.03 OBRAS', 'resultado', 'g_03_01'),
      n('g_03_01_04', '03.01.04 CUSTO ADM. EMPREENDIMENTOS', 'resultado', 'g_03_01'),
      n('g_03_01_05', '03.01.05 AQUISICAO DE NOVAS AREAS', 'resultado', 'g_03_01'),
      n('g_03_02', '03.02 DESPESAS', 'totalizadora', 'g_03'),
      n('g_03_02_01', '03.02.01 COMERCIAIS', 'resultado', 'g_03_02'),
      n('g_03_02_02', '03.02.02 ADMINISTRATIVAS', 'resultado', 'g_03_02'),
      n('g_03_02_03', '03.02.03 PESSOAL', 'resultado', 'g_03_02'),
      n('g_03_02_04', '03.02.04 RETENCOES', 'resultado', 'g_03_02'),
      n('g_03_02_05', '03.02.05 MANUTENCAO', 'resultado', 'g_03_02'),
      n('g_03_02_06', '03.02.06 CONVENIOS', 'resultado', 'g_03_02'),
      n('g_03_02_07', '03.02.07 NAO OPERACIONAIS', 'resultado', 'g_03_02'),
      n('g_06', '06 GCO - GERACAO DE CAIXA OPERACIONAL', 'formula', null, { formula: 'gco' }),
      n('g_07', '07 RESULTADO FINANCEIRO', 'total_n1', null),
      n('g_07_01', '07.01 RECEITAS FINANCEIRAS', 'resultado', 'g_07'),
      n('g_07_02', '07.02 DESPESAS FINANCEIRAS', 'resultado', 'g_07'),
      n('g_07_03', '07.03 CAPTACOES E AMORTIZACOES', 'resultado', 'g_07'),
      n('g_08', '08 GCO - LIQUIDO DO RESULTADO', 'formula', null, { formula: 'gco_liq' }),
      n('g_09', '09 INVESTIMENTOS E APORTES', 'total_n1', null),
      n('g_09_01', '09.01 DIVIDENDOS', 'resultado', 'g_09'),
      n('g_09_02', '09.02 APORTES', 'resultado', 'g_09'),
      n('g_09_03', '09.03 INVESTIMENTOS / CAPEX', 'resultado', 'g_09'),
      n('g_10', '10 VARIACAO DE CAIXA', 'formula', null, { formula: 'variacao' })
    ];
  },

  ensureDfcDefault() {
    if (!Array.isArray(this.visoes) || !this.visoes.length) {
      try { this.visoes = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]") || []; } catch (e) { this.visoes = []; }
    }
    const template = this.dfcTemplateGroups();
    let visao = (this.visoes || []).find(v => v.id === 'dfc_default');
    if (!visao) {
      this.visoes = this.visoes || [];
      this.visoes.unshift({ id: 'dfc_default', name: 'DFC Padrão', type: 'custom', groups: template });
      this.saveToStorage();
      return;
    }
    visao.groups = visao.groups || [];
    const byId = Object.fromEntries(visao.groups.map(g => [g.id, g]));
    template.forEach(t => {
      if (!byId[t.id]) visao.groups.push({ ...t, accounts: t.accounts ? [] : t.accounts });
      else {
        if (t.redutora) byId[t.id].redutora = true;
        if (t.formula) { byId[t.id].formula = t.formula; byId[t.id].type = 'formula'; }
      }
    });
    if (byId.g_02 && /DEDUC/i.test(byId.g_02.name || '')) byId.g_02.name = '02 IMPOSTOS';
    this.saveToStorage();
  },

  _normTxt(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  },

  suggestGroup(cat) {
    const id = String(cat.id || '');
    const name = this._normTxt(cat.name || cat.description || '');
    const type = this._normTxt(cat.type || cat.tpConta || cat.financialCategoryType || '');
    if (/TOTAL/.test(type)) return null;
    if (/CANCELAMENTO DE VEND/.test(name)) return 'g_01_05';
    if (/VENDA DE LOTE|VENDA DE IMOV|JUROS ATIVOS|MULTAS?\/?ENCARGOS|DESCONTO DE JUROS/.test(name)) return 'g_01_01';
    if (/ALUGUE/.test(name)) return 'g_01_02';
    if (/RECEITA DE SERVIC|ADM(INISTRACAO)? DE EMPREENDIMENTO/.test(name) && /RECEITA|SERVIC/.test(name)) return 'g_01_03';
    if (/NAO OPERACIONAL/.test(name) && /RECEITA/.test(name)) return 'g_01_04';
    if (/ADIANTAMENTO DE VEND/.test(name)) return 'g_01_04';
    if (/PIS|COFINS|ISS\b|IRRF|IMPOSTO SOBRE VEND/.test(name)) return 'g_02_01';
    if (/CSLL|IRPJ|TRIMEST/.test(name) || (/IMPOSTO/.test(name) && /FINANC/.test(name))) return 'g_02_02';
    if (/REPASSE|TERREN/.test(name)) return 'g_03_01_01';
    if (/PROJETO|APROVAC/.test(name)) return 'g_03_01_02';
    if (/\bOBRA|CONSTRUC/.test(name)) return 'g_03_01_03';
    if (/CUSTO ADM|CUSTO ADIM/.test(name)) return 'g_03_01_04';
    if (/AQUISICAO DE NOVA/.test(name)) return 'g_03_01_05';
    if (/MARKETING|CORRETAG|COMISS|COMERCIAIS|DESPESAS COM VEND/.test(name)) return 'g_03_02_01';
    if (/RETENC/.test(name)) return 'g_03_02_04';
    if (/MANUTENC/.test(name)) return 'g_03_02_05';
    if (/CONVENIO/.test(name)) return 'g_03_02_06';
    if (/DONATIV/.test(name) || (/NAO OPERACIONAL/.test(name) && /DESPESA/.test(name))) return 'g_03_02_07';
    if (/PESSOAL|SALARIO|ENCARGO|FGTS|\bINSS\b/.test(name)) return 'g_03_02_03';
    if (/ADMINISTRAT|AGUA|ESGOTO|ENERGIA|ALUGUEL|ESCRITORIO|SOFTWARE|INTERNET|TELEFONE/.test(name)) return 'g_03_02_02';
    if (/RECEITA FINANCEIRA|APLICACAO|RENDIMENTO/.test(name)) return 'g_07_01';
    if (/DESPESA FINANCEIRA|TARIFA BANC|JUROS PASSIV|FUNDO DE INVEST/.test(name)) return 'g_07_02';
    if (/CAPTACAO|AMORTIZ/.test(name)) return 'g_07_03';
    if (/DIVIDEND/.test(name)) return 'g_09_01';
    if (/\bAPORTE|ADIANTAMENTO/.test(name)) return 'g_09_02';
    if (/CAPEX|INVESTIMENTO/.test(name)) return 'g_09_03';
    if (/^1010|^1\.01\.01/.test(id)) return 'g_01_01';
    if (/^1020|^1\.01\.02/.test(id)) return 'g_01_03';
    return null;
  },

  autoAllocateUnassigned(silent) {
    const v = this.visoes.find(x => x.id === 'dfc_default') || this.getVisao();
    if (!v) return;
    const assigned = new Set();
    (v.groups || []).forEach(g => (g.accounts || []).forEach(a => assigned.add(String(a))));
    let added = 0;
    (this.categories || []).forEach(c => {
      const cid = String(c.id || '');
      if (!cid || assigned.has(cid)) return;
      const nodeId = this.suggestGroup(c);
      if (!nodeId) return;
      const g = v.groups.find(x => x.id === nodeId);
      if (!g || g.type !== 'resultado') return;
      g.accounts = g.accounts || [];
      g.accounts.push(cid);
      assigned.add(cid);
      added++;
    });
    (v.groups || []).forEach(g => {
      if (g.accounts) g.accounts.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    });
    this.saveToStorage();
    if (!silent) {
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
            <h2 style="margin:0; color:#fff; font-size:1.2rem; font-weight:600;">Gestão de Planos Financeiros e Visões</h2>
          </div>
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
                <input type="text" id="pf-search" placeholder="Buscar..." oninput="PlanoFinanceiroApp.onSearch()" style="flex:1;padding:7px;border:1px solid #ccc;border-radius:4px;">
                <button onclick="PlanoFinanceiroApp.loadCategories()" title="Recarregar do Sienge" style="padding:7px 15px;background:#fef08a;border:1px solid #fde047;border-radius:4px;color:#854d0e;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.82rem;font-weight:700;transition:all 0.2s;">
                  <i data-lucide="refresh-cw" style="width:14px;height:14px;" id="pf-refresh-icon"></i>Atualizar
                </button>
                <select id="pf-type-filter" onchange="PlanoFinanceiroApp.onSearch()" style="padding:7px 10px;border:1px solid #ccc;border-radius:4px;outline:none;">
                  <option value="">Todas as Contas</option>
                  <option value="T">Totalizadoras</option>
                  <option value="R">Resultado</option>
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
      
      const idSet = new Set(this.categories.map(c => String(c.id || '')));
      this.categories.forEach(c => {
        const strId = String(c.id || '');
        let depth = 0;
        for (let i = 1; i < strId.length; i++) {
          if (idSet.has(strId.substring(0, i))) depth++;
        }
        c._depth = depth;
      });
      
      const allCount = document.getElementById('pf-all-count');
      if (allCount) allCount.textContent = this.categories.length;

      const visao = this.visoes.find(v => v.id === 'dfc_default');
      const hasMapped = visao && (visao.groups || []).some(g => g.accounts && g.accounts.length);
      if (!hasMapped) this.autoAllocateUnassigned(true);

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
      filtered = filtered.filter(cat => {
        const strId = String(cat.id || '');
        for (let i = 1; i < strId.length; i++) {
          if (this.collapsedIds.has(strId.substring(0, i))) return false;
        }
        return true;
      });
    }

    const idList = this.categories.map(c => String(c.id));

    tbody.innerHTML = filtered.map((cat, idx) => {
      const strId = String(cat.id);
      const isInactive = cat.flAtiva === 'N';
      let descTags = isInactive ? `<span style="background:#e5e7eb;color:#4b5563;font-size:0.65rem;padding:2px 6px;border-radius:4px;margin-left:5px;">INATIVA</span>` : '';
      const myTax = this.taxConfig[strId];
      if (myTax) descTags += `<span style="margin-left:5px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-size:0.65rem;padding:2px 6px;border-radius:4px;font-weight:700;">[ Fiscal: ${myTax} ]</span>`;

      const typeStr = String(cat.tpConta).toLowerCase();
      const isTotalizadora = typeStr === 't' || typeStr.includes('total');
      const depth = typeFilter ? 0 : (cat._depth || 0);

      const hasChildren = idList.some(childId => childId.startsWith(strId) && childId !== strId);
      const isCollapsed = this.collapsedIds.has(strId);
      let toggleBtn = '<span style="display:inline-block;width:20px;"></span>';
      
      if (!typeFilter && hasChildren) {
        toggleBtn = `<button onclick="PlanoFinanceiroApp.toggleAccordion('${strId}')" style="background:none;border:none;cursor:pointer;padding:0 5px;font-size:0.7rem;color:#64748b;font-family:monospace;width:20px;">${isCollapsed ? '▶' : '▼'}</button>`;
      }

      const rowStyle = isInactive 
        ? `background:#f3f4f6; color:#9ca3af; text-decoration:line-through; opacity:0.7; border-bottom:1px solid #f0f0f0;` 
        : isTotalizadora 
          ? `background:#f8fafc; font-weight:700; color:#1e293b; border-bottom:1px solid #e2e8f0;`
          : `background:#fff; transition:background 0.1s; border-bottom:1px solid #f0f0f0;`;

      return `
        <tr style="${rowStyle}">
          <td style="padding:7px 14px;font-family:monospace;font-size:0.8rem;white-space:nowrap;display:flex;align-items:center;">
             ${toggleBtn}
             <span style="color:${isTotalizadora ? '#105436' : 'inherit'}">${strId}</span>
          </td>
          <td style="padding:7px 14px;font-size:0.82rem;padding-left:${14 + (depth * 15)}px;">${cat.name} ${descTags}</td>
          <td style="padding:7px 14px;font-size:0.8rem;">${cat.tpConta}</td>
          <td style="padding:7px 14px;text-align:center;">
             <button onclick="PlanoFinanceiroApp.openTaxModal('${strId}')" style="background:none;border:none;cursor:pointer;color:#64748b;"><i data-lucide="settings" style="width:14px;"></i></button>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
    this._updateVisaoBar();
  },

  toggleAccordion(id) {
    if (this.collapsedIds.has(id)) this.collapsedIds.delete(id);
    else this.collapsedIds.add(id);
    this.renderTable();
  },

  openTaxModal(id) {
    const currentBase = this.taxConfig[id] || '';
    const modalHtml = `
      <div id="pf-tax-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#fff;border-radius:12px;width:400px;padding:20px;">
          <h3 style="margin:0 0 15px 0;">Base Fiscal para: ${id}</h3>
          <select id="pf-tax-select" style="width:100%;padding:8px;margin-bottom:15px;">
            <option value="">Nenhuma</option>
            ${this.taxBases.map(b => `<option value="${b}" ${currentBase===b?'selected':''}>${b}</option>`).join('')}
          </select>
          <div style="text-align:right;">
            <button onclick="document.getElementById('pf-tax-overlay').remove()">Cancelar</button>
            <button onclick="PlanoFinanceiroApp.saveTaxConfig('${id}')">Salvar</button>
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
  saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.visoes)); },

  renderBoard() {
    const v = this.getVisao();
    if (!v) return;

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
      const roots = v.groups.filter(g => !g.parentId);
      treeContainer.innerHTML = roots.map(r => this.renderNodeHtml(r, v.groups, 0)).join('');
    }

    this._updateVisaoBar();
    if (window.lucide) lucide.createIcons();
  },

  renderNodeHtml(node, allGroups, level) {
    const children = allGroups.filter(g => g.parentId === node.id);
    const marginLeft = level * 20;
    const isExpanded = node.expanded !== false;
    const expandIcon = isExpanded ? 'chevron-down' : 'chevron-right';

    // Cores por tipo
    let bg = '#fff', borderLeft = '#cbd5e1', icon = 'folder';
    if (node.type === 'total_n1') { bg = '#f8fafc'; borderLeft = '#0f766e'; icon = 'layers'; }
    if (node.type === 'totalizadora') { bg = '#fff'; borderLeft = '#3b82f6'; icon = 'folder-open'; }
    if (node.type === 'resultado') { bg = '#fff'; borderLeft = '#eab308'; icon = 'file-text'; }
    if (node.type === 'formula') { bg = '#ecfdf5'; borderLeft = '#105436'; icon = 'calculator'; }

    const dropEvents = node.type === 'resultado' ? `ondragover="PlanoFinanceiroApp.onDragOver(event)" ondrop="PlanoFinanceiroApp.onDropGroup(event, '${node.id}')"` : '';

    let html = `
      <div style="margin-left:${marginLeft}px; margin-bottom:5px;">
        <div style="background:${bg}; border:1px solid #e2e8f0; border-left:4px solid ${borderLeft}; border-radius:6px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 2px rgba(0,0,0,0.02);" ${dropEvents}>
          
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            ${(children.length > 0 || node.type !== 'resultado') ? `<button onclick="PlanoFinanceiroApp.toggleNode('${node.id}')" style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;"><i data-lucide="${expandIcon}" style="width:14px;height:14px;"></i></button>` : '<span style="width:14px;"></span>'}
            
            <i data-lucide="${icon}" style="width:14px;height:14px;color:${borderLeft};"></i>
            <span style="font-weight:${node.type==='total_n1'?'700':'600'}; font-size:0.85rem; color:#1e293b; cursor:pointer;" onclick="PlanoFinanceiroApp.editNodeName('${node.id}')">${node.name}</span>
          </div>
          
          <div style="display:flex; align-items:center; gap:5px;">
            ${(node.type !== 'resultado' && node.type !== 'formula') ? `<button onclick="PlanoFinanceiroApp.addNode('${node.id}')" title="Adicionar Sub-nível" style="background:none;border:none;color:#10b981;cursor:pointer;padding:2px;"><i data-lucide="plus-circle" style="width:14px;height:14px;"></i></button>` : ''}
            <button onclick="PlanoFinanceiroApp.deleteNode('${node.id}')" title="Excluir" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:2px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
          </div>
        </div>
    `;

    if (isExpanded) {
      if (children.length > 0) {
        html += children.map(c => this.renderNodeHtml(c, allGroups, level + 1)).join('');
      }

      if (node.type === 'resultado' && node.accounts && node.accounts.length > 0) {
        html += `<div style="margin-left:${marginLeft + 28}px; margin-top:5px; margin-bottom:10px; display:flex; flex-direction:column; gap:4px; padding-left:10px; border-left:2px solid #e2e8f0;">`;
        node.accounts.forEach(accId => {
          const c = this.categories.find(cat => String(cat.id) === String(accId));
          const name = c ? c.name : 'Conta não encontrada';
          html += `
            <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
              <div><strong style="color:#0f172a;">${accId}</strong> <span style="color:#64748b;">${name}</span></div>
              <button onclick="PlanoFinanceiroApp.removeAccountFromGroup('${node.id}', '${accId}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;line-height:1;">&times;</button>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  },

  toggleNode(id) {
    const v = this.getVisao();
    const node = v.groups.find(g => g.id === id);
    if(node) { node.expanded = !node.expanded; this.saveToStorage(); this.renderBoard(); }
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

    let type = 'total_n1';
    if(parentId) {
      const parent = v.groups.find(g => g.id === parentId);
      if (!parent || parent.type === 'formula') return;
      if(parent.type === 'total_n1') type = 'totalizadora';
      else if(parent.type === 'totalizadora') type = 'resultado';
    }

    const typeLabels = { 'total_n1':'Total Nível 1', 'totalizadora':'Totalizadora', 'resultado':'Resultado (Dropzone)' };
    const n = prompt(`Nome do novo nó (${typeLabels[type]}):`);
    if(!n || !n.trim()) return;

    v.groups.push({
      id: 'n_' + Date.now(),
      name: n.trim(),
      type: type,
      parentId: parentId,
      accounts: type === 'resultado' ? [] : undefined,
      expanded: true
    });
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

  onDragStart(e, accId) {
    this.draggedAccountId = String(accId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', accId);
  },

  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  },

  onDropUnassigned(e) {
    e.preventDefault();
    if (!this.draggedAccountId || !this.selectedVisaoId) return;
    const v = this.getVisao();
    if (!v) return;
    
    v.groups.forEach(g => {
      if(g.accounts) g.accounts = g.accounts.filter(a => String(a) !== this.draggedAccountId);
    });
    
    this.saveToStorage();
    this.renderBoard();
  },

  onDropGroup(e, groupId) {
    e.preventDefault();
    // Stop propagation so it doesn't trigger parent dropzones if any
    e.stopPropagation();

    if (!this.draggedAccountId || !this.selectedVisaoId) return;
    const v = this.getVisao();
    if (!v) return;
    
    // Remove from anywhere else
    v.groups.forEach(g => {
      if(g.accounts) g.accounts = g.accounts.filter(a => String(a) !== this.draggedAccountId);
    });
    
    const group = v.groups.find(g => g.id === groupId);
    if (group && group.type === 'resultado') {
      if(!group.accounts) group.accounts = [];
      group.accounts.push(this.draggedAccountId);
      group.accounts.sort((a,b) => a.localeCompare(b));
    }
    
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
