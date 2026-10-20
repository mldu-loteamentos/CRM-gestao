const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { PERFIL_DIR, GRAVACOES_DIR, CANAL } = require("./config");
const { abrirSienge } = require("./sessao");

const dois = (n) => String(n).padStart(2, "0");
const d = new Date();
const pasta = path.join(GRAVACOES_DIR, `inspecao-${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}`);
fs.mkdirSync(pasta, { recursive: true });

// Roda dentro de cada frame da página. Não lê senha nem valor de campo oculto.
function lerTela() {
  const txt = (el) => String((el && (el.innerText || el.value || el.getAttribute("title") || el.getAttribute("alt"))) || "").trim().replace(/\s+/g, " ").slice(0, 140);
  const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const rotulo = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return txt(l);
    }
    const td = el.closest("td");
    let prev = td && td.previousElementSibling;
    while (prev && !txt(prev)) prev = prev.previousElementSibling;
    return prev ? txt(prev) : "";
  };
  const campos = [...document.querySelectorAll("input, select, textarea")].slice(0, 400).map((e) => {
    const oculto = e.type === "hidden" || !visivel(e);
    return {
      tag: e.tagName.toLowerCase(),
      type: e.type || "",
      name: e.name || "",
      id: e.id || "",
      rotulo: rotulo(e),
      valor: oculto || e.type === "password" ? "" : String(e.value || "").slice(0, 60),
      marcado: e.type === "checkbox" || e.type === "radio" ? !!e.checked : undefined,
      visivel: !oculto,
      opcoes: e.tagName === "SELECT" ? [...e.options].slice(0, 30).map((o) => o.text.trim()) : undefined,
    };
  }).filter((c) => c.name || c.id || c.visivel);
  const botoes = [...document.querySelectorAll("button, input[type=button], input[type=submit], input[type=image], a, [role=button], img[onclick], span[onclick], div[onclick]")]
    .filter(visivel)
    .slice(0, 400)
    .map((e) => ({
      tag: e.tagName.toLowerCase(),
      id: e.id || "",
      name: e.name || "",
      texto: txt(e),
      onclick: String(e.getAttribute("onclick") || "").slice(0, 200),
      href: String(e.getAttribute("href") || "").replace(/[?&](token|sid|jsessionid)=[^&]*/gi, "").slice(0, 200),
    }))
    .filter((b) => b.texto || b.onclick || (b.href && b.href !== "#"));
  const tabelas = [...document.querySelectorAll("table")].map((t) => {
    const cab = [...t.querySelectorAll("th, thead td")].map(txt).filter(Boolean).slice(0, 40);
    const amostra = [...t.rows].slice(0, 4).map((r) => [...r.cells].slice(0, 20).map(txt));
    return { id: t.id || "", classe: t.className || "", linhas: t.rows.length, cab, amostra };
  }).filter((t) => t.cab.length && t.linhas > 1).slice(0, 25);
  const mensagens = [...document.querySelectorAll(".sucesso, .erro, .alert, .message, .mensagem, [class*=success], [class*=error]")].filter(visivel).map(txt).filter(Boolean).slice(0, 10);
  return { titulo: document.title, campos, botoes, tabelas, mensagens };
}

// Roda em todos os quadros: avisa cada clique e cada campo alterado (só o nome do campo, nunca o que foi digitado).
function vigiarCliques() {
  const descrever = (el) => {
    if (!el || !el.tagName) return {};
    const tag = el.tagName.toLowerCase();
    const digitavel = tag === "textarea" || (tag === "input" && !["button", "submit", "image", "checkbox", "radio", "reset"].includes(el.type));
    return {
      tag,
      type: el.type || "",
      id: el.id || "",
      name: el.name || "",
      texto: digitavel ? "" : String(el.innerText || el.value || el.title || el.alt || "").trim().replace(/\s+/g, " ").slice(0, 80),
      onclick: String(el.getAttribute("onclick") || "").slice(0, 200),
      quadro: window.name || "",
    };
  };
  const alvoDe = (e) => (e.target && e.target.closest && e.target.closest("button, a, input, select, textarea, label, [onclick], [role=button], td, th, img")) || e.target;
  document.addEventListener("click", (e) => {
    if (window.__integraFoto) window.__integraFoto({ acao: "clique", ...descrever(alvoDe(e)) });
  }, true);
  document.addEventListener("change", (e) => {
    if (window.__integraFoto) window.__integraFoto({ acao: "alterou campo", ...descrever(e.target) });
  }, true);
  if (window === window.top) {
    window.__integraAviso = (n) => {
      let el = document.getElementById("__integra-aviso");
      if (!el) {
        el = document.createElement("div");
        el.id = "__integra-aviso";
        el.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#105436;color:#fff;font:600 13px Segoe UI,Arial;padding:10px 14px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;max-width:320px;line-height:1.35";
        (document.body || document.documentElement).appendChild(el);
      }
      el.innerHTML = `Gravando a tela para o robô do Integra · <b>${n}</b> etapa(s) salva(s)<br><span style="font-weight:400">Faça o processo normalmente e feche o navegador ao terminar.</span>`;
    };
    document.addEventListener("DOMContentLoaded", () => window.__integraAviso(window.__integraN || 0));
  }
}

let n = 0;
let ultimaAssinatura = "";

async function fotografar(page, acao) {
  const resultado = { passo: n + 1, acao: acao || null, quando: new Date().toISOString(), url: page.url().split("?")[0], frames: [] };
  for (const f of page.frames()) {
    try {
      const dados = await f.evaluate(lerTela);
      if (!dados.campos.length && !dados.botoes.length && !dados.tabelas.length) continue;
      resultado.frames.push({ nome: f.name() || "", url: f.url().split("?")[0], ...dados });
    } catch (e) {}
  }
  const assinatura = JSON.stringify(resultado.frames.map((f) => [f.url, f.campos.map((c) => [c.name, c.id, c.visivel, c.valor, c.marcado]), f.tabelas.map((t) => [t.id, t.linhas, t.cab]), f.mensagens]));
  if (assinatura === ultimaAssinatura && !(acao && acao.acao === "clique")) return;
  ultimaAssinatura = assinatura;
  n += 1;
  fs.writeFileSync(path.join(pasta, `passo-${dois(n)}.json`), JSON.stringify(resultado, null, 2));
  await page.screenshot({ path: path.join(pasta, `passo-${dois(n)}.png`) }).catch(() => {});
  console.log(`  etapa ${n} salva${acao ? ` · ${acao.acao}: ${acao.texto || acao.name || acao.id || acao.tag || ""}` : ""}`);
  await page.evaluate((x) => { window.__integraN = x; if (window.__integraAviso) window.__integraAviso(x); }, n).catch(() => {});
}

const agendados = new Map();
function agendar(page, acao) {
  const atual = agendados.get(page);
  if (atual) clearTimeout(atual.timer);
  const pendente = { acao: acao || (atual && atual.acao) || null };
  pendente.timer = setTimeout(() => {
    agendados.delete(page);
    fila = fila.then(() => fotografar(page, pendente.acao)).catch(() => {});
  }, 1800);
  agendados.set(page, pendente);
}
let fila = Promise.resolve();

(async () => {
  const ctx = await chromium.launchPersistentContext(PERFIL_DIR, { channel: CANAL, headless: false, viewport: null, args: ["--start-maximized"] });
  await ctx.exposeBinding("__integraFoto", ({ page }, acao) => { if (page && n < 150) agendar(page, acao); });
  await ctx.addInitScript(vigiarCliques);
  const ligar = (p) => p.on("framenavigated", () => { if (n < 150) agendar(p); });
  ctx.pages().forEach(ligar);
  ctx.on("page", ligar);
  const page = ctx.pages()[0] || (await ctx.newPage());
  const estado = await abrirSienge(ctx, page, (m) => console.log("  " + m)).catch((e) => "erro: " + e.message);
  if (estado !== "login" && estado !== "ok") console.log(`  O Sienge não abriu a tela de login (${estado}). Aperte F5 no navegador; ele continua aberto.`);

  console.log("");
  console.log("GRAVANDO A TELA DE PROGRAMAÇÕES DE PAGAMENTO PARA O ROBÔ");
  console.log("Não precisa mexer nesta janela.");
  console.log("No navegador que abriu, entre no Sienge (Entrar com Sienge ID) e abra pelo menu:");
  console.log("  FIN > Contas a Pagar > Pagamento Escritural > Programações de Pagamento");
  console.log("Se a tela ficar em \"Carregando...\", aperte F5.");
  console.log("Depois faça o processo completo, com calma:");
  console.log("  preencher empresa, conta corrente e vencimento > Consultar > marcar as parcelas > gerar o lote");
  console.log("  e, se for aprovar, clicar em Autorizar lote programado e autorizar.");
  console.log("Cada clique é salvo sozinho (o aviso verde no canto mostra quantas etapas já foram salvas).");
  console.log("Se pedir login, entre pelo Sienge ID normalmente; o que você digita não é gravado.");
  console.log("Ao terminar, feche o navegador.");
  console.log("");

  ctx.on("close", async () => {
    await fila.catch(() => {});
    console.log(`\n${n} etapa(s) salvas em ${pasta}`);
    process.exit(0);
  });
})().catch((e) => {
  console.error("Erro ao abrir o Sienge:", e.message);
  if (/user data dir|SingletonLock|already in use|existing browser/i.test(e.message)) {
    console.error("Feche as outras janelas abertas pelo robô (Entrar no Sienge, Gravar processo) e tente de novo.");
  }
  process.exit(1);
});
