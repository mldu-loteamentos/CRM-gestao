const OrcamentoModuloApp = {
  telas: {
    "orcamento-novo": {
      root: "orcamento-novo-root",
      texto: "Monte o orçamento do ano por empresa, centro de custo e conta do DFC.",
      vazio: "Nenhum orçamento foi aberto ainda."
    },
    "orcamento-forecast": {
      root: "orcamento-forecast-root",
      texto: "Revise os meses que ainda não aconteceram. O forecast entra no lugar desses meses do orçamento.",
      vazio: "Nenhum forecast foi aberto ainda."
    },
    "orcamento-acompanhamento": {
      root: "orcamento-acompanhamento-root",
      texto: "Acompanhe o orçado, o forecast e o realizado por empresa e por grupo do DFC.",
      vazio: "Ainda não há orçamento nem forecast para acompanhar."
    }
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  init(tabId) {
    const tela = this.telas[tabId];
    if (!tela) return;
    const root = document.getElementById(tela.root);
    if (!root) return;
    root.innerHTML = `
      <p style="margin:0 0 12px;color:#475569;font-size:0.9rem;line-height:1.45;">${this.esc(tela.texto)}</p>
      <div class="crm-card" style="padding:28px;color:#64748b;">${this.esc(tela.vazio)}</div>`;
  }
};

window.OrcamentoModuloApp = OrcamentoModuloApp;
