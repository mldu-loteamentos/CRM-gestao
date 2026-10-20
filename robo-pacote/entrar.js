const { chromium } = require("playwright");
const cfg = require("./config");
const { abrirSienge } = require("./sessao");

(async () => {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const pasta = cfg.EMAIL_OK.test(email) ? cfg.perfilDoUsuario(email) : cfg.PERFIL_DIR;
  const ctx = await chromium.launchPersistentContext(pasta, {
    channel: cfg.CANAL,
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const estado = await abrirSienge(ctx, page, (m) => console.log(m)).catch((e) => "erro: " + e.message);
  if (estado !== "login" && estado !== "ok") console.log(`O Sienge não abriu a tela de login (${estado}). Aperte F5 no navegador; ele continua aberto.`);

  console.log("");
  console.log("Faça o login no Sienge na janela que abriu.");
  console.log("Quando estiver na tela inicial do Sienge, feche o navegador.");
  console.log("A sessão fica salva nesta máquina para a gravação e para o robô.");
  console.log("");

  await new Promise((resolve) => ctx.on("close", resolve));
})().catch((e) => {
  console.error("Erro ao abrir o Sienge:", e.message);
  process.exit(1);
});
