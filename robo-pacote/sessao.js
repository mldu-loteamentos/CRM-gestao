const { SIENGE_URL } = require("./config");

const HOST = new URL(SIENGE_URL).hostname;
const DO_SIENGE = new RegExp("(^|\\.)" + HOST.replace(/\./g, "\\.") + "$", "i");

async function botaoEntrarVisivel(page, ms) {
  return page.getByRole("button", { name: "Entrar com Sienge ID" }).isVisible({ timeout: ms }).catch(() => false);
}

async function logado(page) {
  return !/#\/login/i.test(page.url()) && !(await page.getByText("Carregando...").isVisible().catch(() => false));
}

async function esperarTela(page, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await botaoEntrarVisivel(page, 500)) return "login";
    if (await logado(page)) return "ok";
    await page.waitForTimeout(700);
  }
  return "preso";
}

// Sessão vencida do Sienge deixa a tela de login presa em "Carregando..." (o Sienge responde 401).
// Primeiro limpa tudo o que o endereço do Sienge guardou (cookies, armazenamento, banco interno, cache);
// com tudoDoSienge, apaga também os cookies de *.sienge.com.br, inclusive o login do Sienge ID.
async function limparSessaoSienge(ctx, page, tudoDoSienge) {
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Storage.clearDataForOrigin", { origin: "https://" + HOST, storageTypes: "all" });
    await cdp.send("Network.clearBrowserCache").catch(() => {});
    await cdp.detach().catch(() => {});
  } catch (e) {}
  await ctx.clearCookies({ domain: tudoDoSienge ? /(^|\.)sienge\.com\.br$/i : DO_SIENGE });
}

/** Abre a página inicial do Sienge e, se ficar presa, limpa a sessão vencida e recarrega. Devolve "login", "ok" ou "preso". */
async function abrirSienge(ctx, page, log) {
  const aviso = log || (() => {});
  await page.goto(SIENGE_URL, { waitUntil: "domcontentloaded" });
  let estado = await esperarTela(page, 15000);
  for (const tudo of [false, true]) {
    if (estado !== "preso") return estado;
    aviso(tudo ? "Ainda preso; limpando também o login do Sienge ID (vai pedir a senha de novo)" : "A sessão salva do Sienge venceu; limpando para entrar de novo");
    await limparSessaoSienge(ctx, page, tudo);
    await page.goto(SIENGE_URL, { waitUntil: "domcontentloaded" });
    estado = await esperarTela(page, 20000);
  }
  return estado;
}

const visivel = (loc) => loc.first().isVisible().catch(() => false);
const comTexto = (email) => new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * Entra no Sienge com a conta do usuário do Integra (Sienge ID pela Microsoft).
 * Escolhe a conta pelo e-mail e preenche só o e-mail; a senha, se for pedida, a pessoa digita na janela.
 */
async function entrarComo(ctx, page, email, log, ms = 180000) {
  const aviso = log || (() => {});
  const estado = await abrirSienge(ctx, page, aviso);
  if (estado === "preso") throw new Error("O Sienge não abriu a tela de login. Tente de novo em instantes.");
  const alvo = comTexto(email);
  const fim = Date.now() + ms;
  let pediuSenha = false;
  let outraConta = false;
  while (Date.now() < fim) {
    const host = (() => { try { return new URL(page.url()).hostname; } catch (e) { return ""; } })();
    if (host === HOST) {
      if (await botaoEntrarVisivel(page, 300)) {
        aviso("Entrando com Sienge ID");
        await page.getByRole("button", { name: "Entrar com Sienge ID" }).click().catch(() => {});
        await page.waitForTimeout(1500);
        continue;
      }
      if (await logado(page)) return;
    } else if (host === "login.sienge.com.br") {
      const conta = page.getByRole("button", { name: alvo });
      if (await visivel(conta)) {
        aviso("Escolhendo a conta " + email);
        await conta.first().click();
        await page.waitForTimeout(1500);
        continue;
      }
      const prosseguir = page.getByRole("link", { name: "Prosseguir" });
      if (await visivel(prosseguir)) {
        await prosseguir.first().click();
        await page.waitForTimeout(1500);
        continue;
      }
      const campoEmail = page.locator('input[type="email"], input[name*="email" i], input[name*="login" i], input[id*="email" i]');
      if (await visivel(campoEmail) && !(await campoEmail.first().inputValue().catch(() => ""))) {
        await campoEmail.first().fill(email);
        await campoEmail.first().press("Enter");
        await page.waitForTimeout(1500);
        continue;
      }
      const usarOutra = page.getByRole("button", { name: "Usar outra conta" });
      if (!outraConta && (await visivel(usarOutra))) {
        aviso("A conta " + email + " não estava salva; usando outra conta");
        outraConta = true;
        await usarOutra.first().click();
        await page.waitForTimeout(1500);
        continue;
      }
    } else if (/(^|\.)login\.(microsoftonline|live)\.com$/i.test(host)) {
      const mostrado = page.locator("#displayName");
      if (await visivel(mostrado)) {
        const quem = (await mostrado.first().innerText().catch(() => "")).trim();
        if (quem && quem.includes("@") && quem.toLowerCase() !== email.toLowerCase()) {
          throw new Error(`A Microsoft está entrando com outra conta (${quem}). O robô só pode usar a conta de quem está no Integra (${email}).`);
        }
      }
      const tile = page.locator(`[data-test-id="${email}" i]`).or(page.getByRole("button", { name: alvo }));
      if (await visivel(tile)) {
        await tile.first().click();
        await page.waitForTimeout(1500);
        continue;
      }
      const loginfmt = page.locator('input[name="loginfmt"]');
      if (await visivel(loginfmt) && !(await loginfmt.first().inputValue().catch(() => ""))) {
        await loginfmt.first().fill(email);
        await page.locator("#idSIButton9").click();
        await page.waitForTimeout(1500);
        continue;
      }
      if (await visivel(page.locator("#KmsiCheckboxField, #KmsiDescription"))) {
        await page.locator("#idSIButton9").click().catch(() => {});
        await page.waitForTimeout(1500);
        continue;
      }
      if (!pediuSenha && (await visivel(page.locator('input[name="passwd"]')))) {
        pediuSenha = true;
        aviso(`A Microsoft pediu a senha de ${email}: digite na janela do Sienge que abriu`);
        await page.bringToFront().catch(() => {});
      }
    }
    await page.waitForTimeout(700);
  }
  throw new Error(`O login no Sienge com ${email} não terminou em ${Math.round(ms / 60000)} minutos.`);
}

module.exports = { abrirSienge, entrarComo, limparSessaoSienge, botaoEntrarVisivel };
