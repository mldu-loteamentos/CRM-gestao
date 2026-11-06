// Roda no servidor a mesma conferência com o Contas a Receber que o botão "Forçar o que falta" roda no navegador.
// Carrega estoque-comercial.js num contexto isolado (sem tela) e chama EstoqueComercialApp.conferirComSienge.
// Assim a regra fica num lugar só: o que mudar na conferência da tela vale também para o batimento automático.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ARQUIVO = path.join(__dirname, "..", "estoque-comercial.js");
let script = null;

function carregarScript() {
  if (!script) script = new vm.Script(fs.readFileSync(ARQUIVO, "utf8"), { filename: "estoque-comercial.js" });
  return script;
}

function semTela() {
  const vazio = () => null;
  return {
    addEventListener() {},
    removeEventListener() {},
    getElementById: vazio,
    querySelector: vazio,
    querySelectorAll: () => []
  };
}

function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

/**
 * @param {object} opts
 * @param {Array} opts.units todas as unidades da posição
 * @param {Array} opts.enterprises centros de custo [{ id, name }] (para o rateio)
 * @param {Function} opts.siengeFetch (path, retries) => JSON. Erro HTTP precisa vir com err.status.
 */
function criarConferencia(opts) {
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    URLSearchParams,
    document: semTela(),
    localStorage: memoria(),
    siengeFetchWithRetry: opts.siengeFetch
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  carregarScript().runInContext(ctx);
  const app = ctx.EstoqueComercialApp;
  // Sem tela e sem gravação própria: quem grava no Firebase é o batimento.
  ["setProgress", "saveCache", "renderTable", "paintEmpSelect", "updateMeta", "setBusy", "paintForcarBotao", "fillUnitSelect"].forEach((m) => {
    app[m] = () => {};
  });
  app.saveFirebaseCc = async () => {};
  app.fbReady = () => false;

  const api = {
    /** Empreendimentos com carteira, na ordem da tela. */
    ids() {
      return app.ccsParaConferir();
    },
    /** Confere um empreendimento. Devolve a linha do relatório; as unidades atualizadas ficam em units(). */
    async conferir(ccId) {
      const c = await app.conferirComSienge(ccId, { pularQuitados: true });
      return c ? app.resumoConferencia(c) : null;
    },
    units() {
      return app.state.units;
    },
    setUnits(list) {
      app.state.units = list || [];
    },
    setEnterprises(list) {
      app.state.enterprises = (list || [])
        .filter((c) => c && app.isObraCc(c.id))
        .map((c) => ({ id: String(c.id), name: c.name || "" }))
        .sort((a, b) => Number(a.id) - Number(b.id));
    }
  };
  api.setUnits(opts.units);
  api.setEnterprises(opts.enterprises);
  return api;
}

module.exports = { criarConferencia };
