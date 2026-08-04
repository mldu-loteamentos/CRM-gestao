const RelacionamentoState = {
  activeTab: null,
  cliente: null,
  contrato: null
};

const RelacionamentoApp = {
  init() {
    this.renderCessao();
    this.renderAditamento();
    this.renderPermuta();
    this.renderTermos();
    this.renderHistorico();
  },

  renderBuscaCliente(contextId) {
    return `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <h3 style="margin: 0; color: var(--color-primary);"><i data-lucide="search"></i> Buscar Cliente ou Contrato</h3>
        </div>
        <div class="card-body">
          <div style="display: flex; gap: 15px;">
            <div style="flex: 1;">
              <label style="font-weight: 500; font-size: 0.9rem; color: var(--color-text-muted);">CPF/CNPJ, Nome ou Contrato</label>
              <input type="text" id="relacionamento-busca-${contextId}" class="form-control" placeholder="Digite para buscar..." onkeydown="if(event.key === 'Enter') RelacionamentoApp.buscarCliente('${contextId}')">
            </div>
            <div style="align-self: flex-end;">
              <button class="btn btn-primary" onclick="RelacionamentoApp.buscarCliente('${contextId}')"><i data-lucide="search" style="width:16px;"></i> Buscar</button>
            </div>
          </div>
          <div id="relacionamento-resultado-${contextId}" style="margin-top: 20px;"></div>
        </div>
      </div>
    `;
  },

  async buscarCliente(contextId) {
    const term = document.getElementById(`relacionamento-busca-${contextId}`).value;
    if (!term) return;
    
    const resEl = document.getElementById(`relacionamento-resultado-${contextId}`);
    resEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--color-text-muted);"><i data-lucide="loader" class="lucide-spin" style="width:24px; height:24px; margin-bottom: 10px;"></i><br>Buscando <strong>${term}</strong> no Sienge...</div>`;
    lucide.createIcons();

    // Simulação de busca
    setTimeout(() => {
      resEl.innerHTML = `
        <div style="padding: 15px; border: 1px solid var(--color-border); border-radius: 6px; background: #fafafa;">
          <h4 style="margin: 0 0 10px 0; color: var(--color-text-dark);">JOÃO DA SILVA SA</h4>
          <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.9rem;">
            <div><i data-lucide="file-text" style="width:14px;"></i> Contrato: <strong>159458</strong></div>
            <div><i data-lucide="check-circle" style="width:14px; color: var(--color-success);"></i> Status: <strong style="color: var(--color-success);">ATIVO</strong></div>
            <div><i data-lucide="alert-circle" style="width:14px; color: var(--color-danger);"></i> Inadimplência: <strong>Não</strong></div>
          </div>
          <button class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary);" onclick="RelacionamentoApp.selecionarContrato('${contextId}', '159458')">Selecionar Contrato</button>
        </div>
      `;
      lucide.createIcons();
    }, 1000);
  },

  selecionarContrato(contextId, contratoId) {
    const rootForm = document.getElementById(`relacionamento-form-${contextId}`);
    if (rootForm) {
      rootForm.style.display = 'block';
      rootForm.scrollIntoView({ behavior: 'smooth' });
    }
  },

  renderCessao() {
    const root = document.getElementById('relacionamento-cessao-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-text" style="color: var(--color-primary);"></i> Cessão de Direitos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Transfira a titularidade do contrato para um novo cliente (Cessionário).</p>
      </div>
      ${this.renderBuscaCliente('cessao')}
      
      <div id="relacionamento-form-cessao" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-header">
          <h3 style="margin: 0;"><i data-lucide="user-plus"></i> Dados do Cessionário (Novo Titular)</h3>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <label style="font-weight:500;">Nome Completo</label>
              <input type="text" class="form-control" placeholder="Nome do novo titular">
            </div>
            <div>
              <label style="font-weight:500;">CPF/CNPJ</label>
              <input type="text" class="form-control" placeholder="000.000.000-00">
            </div>
            <div style="grid-column: span 2;">
              <label style="font-weight:500;">Motivo da Cessão</label>
              <textarea class="form-control" rows="3" placeholder="Descreva o motivo..."></textarea>
            </div>
          </div>
        </div>
        <div class="card-footer" style="display: flex; justify-content: flex-end; padding: 20px;">
          <button class="btn btn-primary" onclick="alert('Cessão validada e registrada com sucesso!')"><i data-lucide="check"></i> Validar e Registrar Cessão</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderAditamento() {
    const root = document.getElementById('relacionamento-aditamento-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-plus" style="color: var(--color-primary);"></i> Aditamento Contratual</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Altere cláusulas, prazos ou valores do contrato atual.</p>
      </div>
      ${this.renderBuscaCliente('aditamento')}
      
      <div id="relacionamento-form-aditamento" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="file-edit" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Formulário de Aditamento</h3>
          <p class="text-muted">O contrato selecionado está habilitado para aditamento.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderPermuta() {
    const root = document.getElementById('relacionamento-permuta-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="refresh-ccw" style="color: var(--color-primary);"></i> Permuta</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Troca de unidade do cliente.</p>
      </div>
      ${this.renderBuscaCliente('permuta')}
      
      <div id="relacionamento-form-permuta" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="home" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Selecionar Nova Unidade</h3>
          <p class="text-muted">Aguardando seleção da unidade de destino.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderTermos() {
    const root = document.getElementById('relacionamento-termos-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-signature" style="color: var(--color-primary);"></i> Emissão de Termos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Gere os termos em PDF e envie ao Sienge.</p>
      </div>
      ${this.renderBuscaCliente('termos')}
    `;
    lucide.createIcons();
  },

  renderHistorico() {
    const root = document.getElementById('relacionamento-historico-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="history" style="color: var(--color-primary);"></i> Histórico de Interações</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Veja todo o relacionamento com o cliente.</p>
      </div>
      ${this.renderBuscaCliente('historico')}
    `;
    lucide.createIcons();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    RelacionamentoApp.init();
  }, 500);
});
