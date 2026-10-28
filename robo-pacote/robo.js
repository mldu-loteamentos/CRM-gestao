const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const cfg = require("./config");
const passos = require("./passos-lote");
const sessao = require("./sessao");

fs.mkdirSync(cfg.LOGS_DIR, { recursive: true });

function lerToken() {
  try {
    const t = fs.readFileSync(cfg.TOKEN_FILE, "utf8").trim();
    if (t.length >= 16) return t;
  } catch (e) {}
  const novo = crypto.randomBytes(12).toString("hex");
  fs.writeFileSync(cfg.TOKEN_FILE, novo);
  return novo;
}
const TOKEN = lerToken();

const dois = (n) => String(n).padStart(2, "0");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};

function registrar(evento) {
  const linha = JSON.stringify({ quando: new Date().toISOString(), ...evento });
  fs.appendFileSync(path.join(cfg.LOGS_DIR, `robo-${hojeIso()}.log`), linha + "\n");
}

let ocupado = null;
let janela = null;
let andamento = { total: 0, atual: "", msg: "", feitos: [] };

function agendarFecharJanela(ms) {
  if (janela && janela.timer) clearTimeout(janela.timer);
  if (!janela) return;
  janela.timer = setTimeout(async () => {
    if (ocupado) return agendarFecharJanela(ms);
    const ctx = janela && janela.ctx;
    janela = null;
    if (ctx) await ctx.close().catch(() => {});
    console.log("  Sessão do Sienge encerrada.");
  }, ms || 20000);
}

async function abrirJanela(email) {
  if (janela && janela.email === email && janela.ctx) {
    const pages = janela.ctx.pages();
    if (pages && pages.length) {
      if (janela.timer) clearTimeout(janela.timer);
      janela.page = pages[0];
      janela.pronta = true;
      return janela;
    }
  }
  if (janela && janela.ctx) {
    if (janela.timer) clearTimeout(janela.timer);
    await janela.ctx.close().catch(() => {});
    janela = null;
  }
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(cfg.perfilDoUsuario(email), {
      channel: cfg.CANAL,
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    });
  } catch (e) {
    throw new Error("Não consegui abrir o navegador do robô. Feche as janelas do Sienge abertas pelo robô e tente de novo.");
  }
  janela = { ctx, page: ctx.pages()[0] || (await ctx.newPage()), email, pronta: false };
  return janela;
}

async function executar(tipo, dados, usuario, email) {
  const loteId = String((dados.lote && dados.lote.id) || dados.id || "");
  const log = [];
  const passo = (msg) => {
    log.push(msg);
    console.log(`  [${loteId}] ${msg}`);
  };
  if (!passos.PRONTO) {
    const erro = "O passo a passo do lote no Sienge ainda não foi gravado.";
    registrar({ tipo, loteId, usuario, email, ok: false, erro });
    return { ok: false, erro, log };
  }
  ocupado = { tipo, loteId, email, desde: new Date().toISOString() };
  console.log(`\n${tipo === "gerar" ? "Gerando" : "Aprovando"} lote ${loteId} (pedido por ${usuario} · ${email})`);
  try {
    const j = await abrirJanela(email);
    const opcoes = { sessaoPronta: !!j.pronta };
    const r = tipo === "gerar"
      ? await passos.gerarLote(j.ctx, j.page, email, dados.lote, passo, opcoes)
      : await passos.aprovarLote(j.ctx, j.page, email, dados, passo, opcoes);
    j.pronta = true;
    const numeroSienge = String((r && r.numeroSienge) || dados.numeroSienge || "");
    const arquivo = String((r && r.arquivo) || "");
    registrar({ tipo, loteId, usuario, email, ok: true, numeroSienge, arquivo, log });
    console.log(`  OK${numeroSienge ? " · lote Sienge nº " + numeroSienge : ""}${arquivo ? " · arquivo " + arquivo : ""}`);
    return { ok: true, numeroSienge, arquivo, log };
  } catch (e) {
    let print = "";
    try {
      const page = janela && janela.page;
      if (page) {
        print = path.join(cfg.LOGS_DIR, `erro-${loteId.replace(/[^\w-]/g, "")}-${Date.now()}.png`);
        await page.screenshot({ path: print, fullPage: true });
      }
    } catch (x) {
      print = "";
    }
    registrar({ tipo, loteId, usuario, email, ok: false, erro: e.message, log, print });
    console.log("  ERRO: " + e.message);
    return { ok: false, erro: e.message, log };
  } finally {
    ocupado = null;
    agendarFecharJanela(60000);
  }
}

/** Vários lotes na mesma janela do Sienge. A sessão só fecha depois do último. */
async function executarFila(lotes, usuario, email) {
  const logGeral = (msg) => console.log("  [fila] " + msg);
  ocupado = { tipo: "fila", loteId: String(lotes.length) + " lotes", email, desde: new Date().toISOString() };
  andamento = { total: lotes.length, atual: "", msg: `Preparando ${lotes.length} lote(s) no Sienge…`, feitos: [] };
  console.log(`\nFila de ${lotes.length} lote(s) (pedido por ${usuario} · ${email})`);
  const resultados = [];
  try {
    const j = await abrirJanela(email);
    logGeral(`Entrando no Sienge como ${email}`);
    await sessao.entrarComo(j.ctx, j.page, email, logGeral);
    j.pronta = true;
    const opcoes = { sessaoPronta: true };
    const publicar = (item) => {
      andamento.feitos = andamento.feitos.filter((x) => x.id !== item.id).concat([item]);
    };
    const falhaDe = async (loteId, numero, etapa, erro, log) => {
      let print = "";
      try {
        print = path.join(cfg.LOGS_DIR, `erro-${loteId.replace(/[^\w-]/g, "")}-${Date.now()}.png`);
        await j.page.screenshot({ path: print, fullPage: true });
      } catch (x) {
        print = "";
      }
      registrar({ tipo: "fila", loteId, usuario, email, ok: false, numeroSienge: numero, erro, log, print });
      console.log("  ERRO: " + erro);
      const falha = { id: loteId, ok: false, numeroSienge: numero, etapa, erro, log };
      resultados.push(falha);
      publicar(falha);
      andamento.atual = "";
    };
    const criados = [];
    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      const loteId = String(lote.id || "");
      const log = [];
      const passo = (msg) => {
        log.push(msg);
        console.log(`  [${i + 1}/${lotes.length} ${loteId}] ${msg}`);
      };
      let numero = "";
      try {
        andamento.atual = loteId;
        andamento.msg = `Gerando lote ${i + 1} de ${lotes.length} no Sienge…`;
        passo(`Lote ${i + 1} de ${lotes.length}`);
        const gerado = await passos.gerarLote(j.ctx, j.page, email, lote, passo, opcoes);
        numero = String((gerado && gerado.numeroSienge) || "");
        publicar({ id: loteId, ok: false, numeroSienge: numero, etapa: "gerado", log });
        criados.push({ lote, loteId, numero, log });
      } catch (e) {
        await falhaDe(loteId, numero, "gerar", e.message, log);
      }
    }
    for (let i = 0; i < criados.length; i++) {
      const item = criados[i];
      const loteId = item.loteId;
      const numero = item.numero;
      const log = item.log;
      const passo = (msg) => {
        log.push(msg);
        console.log(`  [autorizar ${i + 1}/${criados.length} ${loteId}] ${msg}`);
      };
      try {
        andamento.atual = loteId;
        andamento.msg = `Autorizando o lote nº ${numero}…`;
        const aprovado = await passos.aprovarLote(j.ctx, j.page, email, { lote: item.lote, numeroSienge: numero }, passo, opcoes);
        const arquivo = String((aprovado && aprovado.arquivo) || "");
        registrar({ tipo: "fila", loteId, usuario, email, ok: true, numeroSienge: numero, arquivo, log });
        const feito = { id: loteId, ok: true, numeroSienge: numero, arquivo, log };
        resultados.push(feito);
        publicar(feito);
        andamento.atual = "";
      } catch (e) {
        await falhaDe(loteId, numero, "aprovar", e.message, log);
      }
    }
    const ok = resultados.length > 0 && resultados.every((r) => r.ok);
    console.log(ok ? "  Fila concluída." : "  Fila encerrada com falha em algum lote.");
    return { ok, resultados };
  } catch (e) {
    registrar({ tipo: "fila", loteId: "fila", usuario, email, ok: false, erro: e.message });
    console.log("  ERRO: " + e.message);
    return { ok: false, erro: e.message, resultados };
  } finally {
    ocupado = null;
    agendarFecharJanela(8000);
  }
}

function loteValido(l) {
  if (!l || typeof l !== "object") return "Lote não informado.";
  if (!/^[\w-]{4,80}$/.test(String(l.id || ""))) return "Identificação do lote inválida.";
  if (!Array.isArray(l.itens) || !l.itens.length || l.itens.length > 500) return "Lote sem títulos.";
  if (!l.conta || typeof l.conta !== "object") return "Lote sem conta de pagamento.";
  const ruim = l.itens.find((i) => !/^\d+$/.test(String(i.titulo || "")) || !(Number(i.valor) > 0));
  if (ruim) return `Título inválido no lote: ${ruim.titulo || "?"}.`;
  return "";
}

function origemOk(origem) {
  return !origem || cfg.ORIGENS.some((re) => re.test(origem));
}

function responder(res, status, corpo, origem) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origem && origemOk(origem)) {
    h["Access-Control-Allow-Origin"] = origem;
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Robo-Token";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Private-Network"] = "true";
    h["Access-Control-Max-Age"] = "600";
  }
  res.writeHead(status, h);
  res.end(corpo == null ? "" : JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on("data", (c) => {
      tam += c.length;
      if (tam > 8 * 1024 * 1024) {
        reject(new Error("Pedido grande demais."));
        req.destroy();
      } else partes.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString("utf8") || "{}"));
      } catch (e) {
        reject(new Error("Pedido inválido."));
      }
    });
    req.on("error", reject);
  });
}

function tokenOk(req) {
  const t = String(req.headers["x-robo-token"] || "");
  return t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || "";
  if (!origemOk(origem)) return responder(res, 403, { ok: false, erro: "Origem não autorizada." });
  if (req.method === "OPTIONS") return responder(res, 204, null, origem);
  const url = new URL(req.url, `http://${cfg.HOST}`);

  if (req.method === "GET" && url.pathname === "/status") {
    return responder(res, 200, { online: true, pronto: !!passos.PRONTO, fila: true, ocupado, pareado: tokenOk(req) }, origem);
  }
  if (req.method === "GET" && url.pathname === "/andamento") {
    if (!tokenOk(req)) return responder(res, 401, { ok: false, erro: "Código do robô inválido." }, origem);
    return responder(res, 200, andamento, origem);
  }
  if (req.method === "GET" && url.pathname === "/parear") {
    if (!origem || !cfg.ORIGENS_PAREAMENTO.some((re) => re.test(origem))) {
      return responder(res, 403, { ok: false, erro: "Pareamento automático só pelo endereço oficial do Integra." }, origem);
    }
    registrar({ tipo: "parear", origem });
    return responder(res, 200, { ok: true, token: TOKEN }, origem);
  }
  if (req.method !== "POST" || !["/lotes/gerar", "/lotes/aprovar", "/lotes/fila"].includes(url.pathname)) {
    return responder(res, 404, { ok: false, erro: "Caminho desconhecido." }, origem);
  }
  if (!tokenOk(req)) return responder(res, 401, { ok: false, erro: "Código do robô inválido." }, origem);
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    return responder(res, 415, { ok: false, erro: "Pedido inválido." }, origem);
  }
  if (ocupado) {
    return responder(res, 409, { ok: false, erro: `O robô está ocupado com o lote ${ocupado.loteId}. Tente de novo em instantes.` }, origem);
  }
  let corpo;
  try {
    corpo = await lerCorpo(req);
  } catch (e) {
    return responder(res, 400, { ok: false, erro: e.message }, origem);
  }
  const usuario = String(corpo.usuario || "").slice(0, 120) || "não informado";
  const email = String(corpo.usuarioEmail || "").trim().toLowerCase();
  if (!cfg.EMAIL_OK.test(email)) {
    return responder(res, 400, { ok: false, erro: "Entre no Integra com sua conta Microsoft da Moura Leite: o robô usa o mesmo usuário no Sienge." }, origem);
  }
  if (url.pathname === "/lotes/fila") {
    const lotes = Array.isArray(corpo.lotes) ? corpo.lotes : [];
    if (!lotes.length || lotes.length > 40) return responder(res, 400, { ok: false, erro: "Informe de 1 a 40 lotes." }, origem);
    const ruim = lotes.map(loteValido).find(Boolean);
    if (ruim) return responder(res, 400, { ok: false, erro: ruim }, origem);
    return responder(res, 200, await executarFila(lotes, usuario, email), origem);
  }
  const erroLote = loteValido(corpo.lote);
  if (erroLote) return responder(res, 400, { ok: false, erro: erroLote }, origem);
  if (url.pathname === "/lotes/gerar") {
    return responder(res, 200, await executar("gerar", { lote: corpo.lote }, usuario, email), origem);
  }
  const numeroSienge = String(corpo.numeroSienge || "").trim();
  if (!/^\d+$/.test(numeroSienge)) return responder(res, 400, { ok: false, erro: "Número do lote no Sienge não informado." }, origem);
  return responder(res, 200, await executar("aprovar", { lote: corpo.lote, numeroSienge, aprovadoPor: usuario }, usuario, email), origem);
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\nO robô já está ligado neste computador (porta ${cfg.PORTA} em uso).`);
    process.exit(cfg.SAIDA_JA_ABERTO);
  }
  console.error("\nErro no robô:", e.message);
  process.exit(1);
});

server.listen(cfg.PORTA, cfg.HOST, () => {
  console.log("");
  console.log(`ROBÔ DO SIENGE LIGADO (${new Date().toLocaleString("pt-BR")})`);
  console.log("O Integra (crm-gestao.vercel.app) pega o código do robô sozinho.");
  console.log(`Se algum dia pedir, o código é: ${TOKEN}`);
  console.log(passos.PRONTO
    ? "Pronto para gerar e aprovar lotes pedidos pelo Integra neste computador."
    : "Atenção: o passo a passo no Sienge ainda não foi gravado; os pedidos serão recusados.");
  console.log("O Sienge abre sempre com o usuário logado no Integra. Na primeira vez de cada pessoa,");
  console.log("a Microsoft pode pedir a senha: digite na janela do Sienge que o robô abrir.");
  console.log("");
});
