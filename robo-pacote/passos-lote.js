// Passo a passo no Sienge, escrito a partir da gravação de Programações de Pagamento
// (gravacoes/inspecao-20261010-0846): filtros > Consultar > marcar as parcelas > Salvar,
// e na Autorização de Pagamento: conta + lote > Consultar > marcar o lote > Salvar.

const { SIENGE_URL } = require("./config");
const sessao = require("./sessao");

const TELA_PROGRAMACAO = SIENGE_URL + "#/common/page/1806";
const TELA_AUTORIZACAO = SIENGE_URL + "#/common/page/1856";
const TELA_ARQUIVO = SIENGE_URL + "#/common/page/1909";

const dois = (n) => String(n).padStart(2, "0");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};
const dataBr = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const moeda = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (txt) => {
  const n = Number(String(txt || "").replace(/[^\d,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const mesmoValor = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

async function quadro(page, teste, ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const f = page.frames().find((x) => teste(x.url()));
    if (f && (await f.evaluate(() => document.readyState === "complete").catch(() => false))) return f;
    await page.waitForTimeout(400);
  }
  return null;
}

// Avisos do Sienge (alert/confirm) são aceitos e guardados para aparecer no log e no erro.
function vigiarAvisos(page) {
  const avisos = [];
  page.on("dialog", (d) => {
    avisos.push(d.message().replace(/\s+/g, " ").trim());
    d.accept().catch(() => {});
  });
  return avisos;
}

// Clica num botão que recarrega o quadro e espera a página nova terminar de carregar.
async function clicarERecarregar(page, frame, seletor, avisos, ms = 60000) {
  const antes = avisos.length;
  await frame.evaluate(() => { window.__roboAntes = 1; });
  await frame.locator(seletor).filter({ visible: true }).first().click();
  const fim = Date.now() + ms;
  let avisoEm = 0;
  while (Date.now() < fim) {
    await page.waitForTimeout(500);
    const pronto = await frame.evaluate(() => !window.__roboAntes && document.readyState === "complete").catch(() => false);
    if (pronto) return;
    if (avisos.length > antes && !avisoEm) avisoEm = Date.now();
    if (avisoEm && Date.now() - avisoEm > 6000) throw new Error("O Sienge avisou: " + avisos.slice(antes).join(" | "));
  }
  throw new Error("O Sienge demorou demais para responder.");
}

// No Sienge o mesmo name aparece na tabela do componente de busca, no campo digitável e numa cópia oculta.
function campoDe(frame, nome) {
  return frame
    .locator(`input[name="${nome}"]:not([type="hidden"]), select[name="${nome}"], textarea[name="${nome}"]`)
    .filter({ visible: true })
    .first();
}

async function valorDe(frame, nome) {
  return campoDe(frame, nome).inputValue({ timeout: 5000 }).catch(() => "");
}

// Data com máscara do Sienge: preenche, sai do campo e confere; se a máscara mexeu, digita de novo.
async function preencherData(frame, nome, iso) {
  const alvo = dataBr(iso);
  const campo = campoDe(frame, nome);
  await campo.fill(alvo);
  await campo.press("Tab");
  if ((await valorDe(frame, nome)) === alvo) return;
  await campo.fill("");
  await campo.pressSequentially(alvo.replace(/\D/g, ""), { delay: 40 });
  await campo.press("Tab");
  if ((await valorDe(frame, nome)) !== alvo) throw new Error(`Não consegui preencher a data ${alvo} no Sienge.`);
}

// Campo de código com busca (empresa, conta): digita o código, sai do campo e espera o Sienge trazer o nome.
async function preencherCodigo(page, frame, nome, nomeDescricao, codigos, oQue) {
  for (const cod of codigos.filter(Boolean)) {
    const campo = campoDe(frame, nome);
    await campo.fill(String(cod));
    await campo.press("Tab");
    const fim = Date.now() + 12000;
    while (Date.now() < fim) {
      await page.waitForTimeout(400);
      const desc = (await valorDe(frame, nomeDescricao)).trim();
      if (desc) return desc;
    }
  }
  throw new Error(`O Sienge não encontrou ${oQue} ${codigos.filter(Boolean).join(" / ")}.`);
}

// Com a sessão já aberta, troca só o hash do Sienge. Recarregar a página inteira derruba o acesso e pede login de novo.
async function irPara(page, endereco, sessaoPronta) {
  const hash = endereco.includes("#") ? endereco.slice(endereco.indexOf("#")) : "";
  const atual = page.url();
  const noSienge = /sienge\.com\.br\/sienge\//i.test(atual);
  if (sessaoPronta && noSienge) {
    if (hash && atual.indexOf(hash) === -1) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(700);
    }
    return;
  }
  await page.goto(endereco, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^entendi$/i }).first().click({ timeout: 4000 }).catch(() => {});
}

async function abrirTela(ctx, page, email, endereco, log, opcoes) {
  const pronta = !!(opcoes && opcoes.sessaoPronta);
  if (!pronta) {
    log(`Entrando no Sienge como ${email}`);
    await sessao.entrarComo(ctx, page, email, log);
  }
  await irPara(page, endereco, pronta);
}

async function botaoLimpar(frame) {
  const porTexto = frame.getByRole("button", { name: /^limpar$/i }).filter({ visible: true });
  if (await porTexto.count().catch(() => 0)) return porTexto.first();
  const porNome = frame.locator('input[name="btLimpar"], input[name="pbLimpar"], button[name="btLimpar"], button[name="pbLimpar"]').filter({ visible: true });
  if (await porNome.count().catch(() => 0)) return porNome.first();
  return null;
}

// Limpa filtros e a grade na mesma tela. Não reabre o Sienge nem a página 1806.
async function limparTela(page, frame) {
  const botao = await botaoLimpar(frame);
  if (!botao) throw new Error("Não achei o botão Limpar em Programações de Pagamento.");
  await frame.evaluate(() => { window.__roboAntes = 1; }).catch(() => {});
  await botao.click();
  const fim = Date.now() + 8000;
  while (Date.now() < fim) {
    await page.waitForTimeout(400);
    const novo = page.frames().find((x) => /gridPagtoEscProgPagamento\.do/.test(x.url()));
    if (!novo) continue;
    const estado = await novo.evaluate(() => {
      const el = [...document.querySelectorAll('input[name="entity.lote.dtVenctoInicial"]')].find((e) => e.type !== "hidden" && (e.offsetWidth || e.offsetHeight));
      return {
        pronto: !window.__roboAntes && document.readyState === "complete",
        venc: el ? String(el.value || "") : ""
      };
    }).catch(() => null);
    if (!estado) continue;
    if (estado.pronto || !String(estado.venc).replace(/\D/g, "")) return novo;
  }
  return page.frames().find((x) => /gridPagtoEscProgPagamento\.do/.test(x.url())) || frame;
}

function contaDoLote(lote) {
  const c = lote.conta || {};
  return [String(c.numero || "").trim(), String(c.id || "").trim()].filter((v, i, a) => v && a.indexOf(v) === i);
}

function empresaDoLote(lote) {
  const emps = [...new Set((lote.itens || []).map((i) => String(i.companyId || "")).filter(Boolean))];
  return { conta: String(lote.empresaConta || (emps.length === 1 ? emps[0] : "")), titulos: emps };
}

module.exports = {
  PRONTO: true,

  // lote: { id, dia, dataBaixa, conta: { id, numero, nome }, empresaConta, total, itens: [{ titulo, parcela, credor, companyId, vencimento, valor }] }
  async gerarLote(ctx, page, email, lote, log, opcoes) {
    const empresa = empresaDoLote(lote);
    if (!empresa.conta) throw new Error("O lote não informa a empresa da conta de pagamento. Gere o lote de novo no Integra.");
    const contas = contaDoLote(lote);
    if (!contas.length) throw new Error("O lote não informa a conta corrente de pagamento.");
    const venc = (lote.itens || []).map((i) => String(i.vencimento || "").slice(0, 10)).filter(Boolean).sort();
    if (!venc.length) throw new Error("O lote não tem vencimento nos títulos.");
    const informada = String(lote.dataBaixa || "").slice(0, 10);
    const baixa = /^\d{4}-\d{2}-\d{2}$/.test(informada)
      ? informada
      : (String(lote.dia || venc[0]).slice(0, 10) < hojeIso() ? hojeIso() : String(lote.dia || venc[0]).slice(0, 10));

    const avisos = vigiarAvisos(page);
    const ehProgramacao = (u) => /gridPagtoEscProgPagamento\.do/.test(u);
    let frame = await quadro(page, ehProgramacao, 1200);
    if (frame) {
      log("Limpando Programações de Pagamento para o próximo lote");
      frame = await limparTela(page, frame);
    } else {
      await abrirTela(ctx, page, email, TELA_PROGRAMACAO, log, opcoes);
      log("Abrindo Programações de Pagamento");
      frame = await quadro(page, ehProgramacao);
      if (!frame) throw new Error("A tela Programações de Pagamento não abriu no Sienge (o usuário tem acesso a ela?).");
      if (opcoes && opcoes.sessaoPronta) {
        log("Limpando Programações de Pagamento");
        frame = await limparTela(page, frame).catch((e) => { log(e.message); return frame; });
      }
    }

    log(`Preenchendo empresa, vencimento, data da baixa ${dataBr(baixa)} e conta`);
    if (empresa.titulos.length === 1) {
      await preencherCodigo(page, frame, "entity.empresa.cdEmpresaView", "entity.empresa.nmEmpresa", empresa.titulos, "a empresa");
    }
    await preencherData(frame, "entity.lote.dtVenctoInicial", venc[0]);
    await preencherData(frame, "entity.lote.dtVenctoFinal", venc[venc.length - 1]);
    await preencherData(frame, "entity.lote.dtPagamento", baixa);
    await preencherCodigo(page, frame, "entity.lote.contaCorrente.empresa.cdEmpresaView", "entity.lote.contaCorrente.empresa.nmEmpresa", [empresa.conta], "a empresa");
    const nomeConta = await preencherCodigo(page, frame, "entity.lote.contaCorrente.contaCorrentePK.nuConta", "entity.lote.contaCorrente.nmConta", contas, "a conta corrente");
    log(`Conta de pagamento: ${await valorDe(frame, "entity.lote.contaCorrente.contaCorrentePK.nuConta")} ${nomeConta}`);

    log("Consultando as parcelas");
    await clicarERecarregar(page, frame, 'input[name="btFiltrar"]', avisos);

    const linhas = await frame.evaluate(() => [...document.querySelectorAll('input[type="checkbox"][name$=".flSelecionar"]')].map((cb) => {
      const tr = cb.closest("tr");
      return {
        nome: cb.name,
        desabilitado: cb.disabled,
        celulas: tr ? [...tr.cells].map((td) => (td.innerText || "").trim().replace(/\s+/g, " ")) : [],
      };
    }));
    const achar = (it) => {
      const parcela = String(it.parcela || "1");
      for (const l of linhas) {
        const c = l.celulas;
        const i = c.findIndex((t, k) => t === String(it.titulo) && c[k + 1] === parcela);
        if (i < 0) continue;
        const iData = c.findIndex((t, k) => k > i + 1 && /^\d{2}\/\d{2}\/\d{4}$/.test(t));
        return { ...l, valor: iData >= 0 ? numero(c[iData + 1]) : NaN };
      }
      return null;
    };
    const faltando = [];
    const divergentes = [];
    const travados = [];
    const marcar = [];
    for (const it of lote.itens) {
      const rotulo = `${it.titulo}/${it.parcela || 1} ${it.credor || ""}`.trim();
      const l = achar(it);
      if (!l) faltando.push(rotulo);
      else if (l.desabilitado) travados.push(rotulo);
      else if (!mesmoValor(l.valor, it.valor)) divergentes.push(`${rotulo}: Integra ${moeda(it.valor)} · Sienge ${Number.isFinite(l.valor) ? moeda(l.valor) : "?"}`);
      else marcar.push(l.nome);
    }
    if (faltando.length || divergentes.length || travados.length) {
      throw new Error([
        "Nenhum lote foi criado no Sienge.",
        faltando.length ? `Não aparecem em Programações de Pagamento (já programados, sem autorização ou fora da data): ${faltando.join("; ")}.` : "",
        travados.length ? `O Sienge não deixa selecionar: ${travados.join("; ")}.` : "",
        divergentes.length ? `Valor diferente: ${divergentes.join("; ")}.` : "",
      ].filter(Boolean).join(" "));
    }

    log(`Marcando ${marcar.length} parcela(s)`);
    await frame.locator('input[name="btDesTodos"]').filter({ visible: true }).first().click();
    for (const nome of marcar) await frame.locator(`input[type="checkbox"][name="${nome}"]`).filter({ visible: true }).first().check();
    const total = numero(await valorDe(frame, "total"));
    if (!mesmoValor(total, lote.total)) {
      throw new Error(`Nenhum lote foi criado no Sienge: o total marcado ficou ${moeda(total)} e o lote do Integra é ${moeda(lote.total)}.`);
    }

    log(`Salvando o lote (${moeda(total)})`);
    const antes = avisos.length;
    await clicarERecarregar(page, frame, 'input[name="btSalvar"]', avisos, 120000);
    const texto = await frame.evaluate(() => document.body.innerText || "");
    const m = texto.match(/lote de pagamento escritural n[úu]mero\s+(\d+)/i);
    if (!m) {
      const msg = (avisos.slice(antes).join(" ") + " " + texto.slice(0, 400)).replace(/\s+/g, " ").trim();
      throw new Error("O Sienge não confirmou a criação do lote. Confira em Programações de Pagamento antes de tentar de novo. " + msg);
    }
    if (avisos.length > antes) log("Avisos do Sienge: " + avisos.slice(antes).join(" | "));
    log(`Gerado lote de pagamento escritural nº ${m[1]}`);
    const frameLimpo = await quadro(page, ehProgramacao, 8000);
    if (frameLimpo) {
      log("Limpando a tela para o próximo lote");
      await limparTela(page, frameLimpo).catch((e) => log(e.message));
    }
    return { numeroSienge: m[1] };
  },

  // dados: { lote, numeroSienge }
  async aprovarLote(ctx, page, email, dados, log, opcoes) {
    const { lote } = dados;
    const nLote = String(dados.numeroSienge || "").trim();
    if (!/^\d+$/.test(nLote)) throw new Error("Número do lote no Sienge inválido.");
    const contas = contaDoLote(lote);
    if (!contas.length) throw new Error("O lote não informa a conta corrente de pagamento.");

    const avisos = vigiarAvisos(page);
    await abrirTela(ctx, page, email, TELA_AUTORIZACAO, log, opcoes);
    log("Abrindo Autorização de Pagamento");
    const ehAutorizacao = (u) => /gridPagtoEscAutorizacao\.do/i.test(u);
    let frame = await quadro(page, ehAutorizacao);
    if (!frame) throw new Error("A tela Autorização de Pagamento não abriu no Sienge (o usuário tem acesso a ela?).");

    await preencherCodigo(page, frame, "entity.contaCorrente.contaCorrentePK.nuConta", "entity.contaCorrente.nmConta", contas, "a conta corrente");
    await campoDe(frame, "entity.pgEscrituralPK.nuLote").fill(nLote);
    log(`Consultando o lote ${nLote}`);
    await clicarERecarregar(page, frame, 'input[name="pbConsultar"]', avisos);

    const lotes = await frame.evaluate(() => [...document.querySelectorAll('span[id$="_caption"]')].map((s) => ({ id: s.id, texto: (s.innerText || "").trim() })));
    const alvo = lotes.map((l) => ({ ...l, partes: l.texto.split("|").map((x) => x.trim()) })).find((l) => l.partes[2] === nLote);
    if (!alvo) throw new Error(`O lote ${nLote} não aparece para autorizar no Sienge (já autorizado, cancelado ou de outra conta).`);
    if (!mesmoValor(numero(alvo.partes[3]), lote.total)) {
      throw new Error(`O lote ${nLote} no Sienge vale ${alvo.partes[3]} e o lote do Integra ${moeda(lote.total)}. Nada foi autorizado.`);
    }
    let jaAutorizado = false;
    if (/^autorizado$/i.test(alvo.partes[5] || "")) {
      log(`O lote ${nLote} já estava autorizado`);
      jaAutorizado = true;
    }
    if (!jaAutorizado) {
    const m = alvo.id.match(/^(.*)_e_(.+)_caption$/);
    if (!m) throw new Error("Não reconheci a lista de lotes da Autorização de Pagamento.");
    log(`Marcando o lote ${nLote}`);
    await frame.locator(`[id="bsTreeChk_${m[1]}_${m[2]}Spanicon"]`).first().click();
    const autorizado = numero(await valorDe(frame, "valorAutorizado"));
    if (!mesmoValor(autorizado, lote.total)) {
      throw new Error(`O valor marcado para autorizar ficou ${moeda(autorizado)} e o lote é ${moeda(lote.total)}. Nada foi autorizado.`);
    }

    log(`Autorizando ${moeda(autorizado)}`);
    const antes = avisos.length;
    await clicarERecarregar(page, frame, 'input[name="pbSalvar"]', avisos, 120000);
    frame = (await quadro(page, (u) => /PagtoEscAutorizacao\.do/i.test(u), 10000)) || frame;
    const texto = await frame.evaluate(() => document.body.innerText || "");
    if (!/atualizados com sucesso/i.test(texto)) {
      throw new Error("O Sienge não confirmou a autorização. Confira em Autorização de Pagamento antes de tentar de novo. " + (avisos.slice(antes).join(" ") + " " + texto.slice(0, 400)).replace(/\s+/g, " ").trim());
    }
    log(`Lote ${nLote} autorizado no Sienge`);
    }
    const arquivo = await gerarArquivoRemessa(ctx, page, email, lote, nLote, log, opcoes);
    return { numeroSienge: nLote, arquivo: arquivo || "" };
  },
};

async function nomeDoCampo(frame, rotulo) {
  return frame.evaluate((alvo) => {
    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const quer = norm(alvo);
    const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const campos = [...document.querySelectorAll("input, select, textarea")].filter((e) => e.name && e.type !== "hidden" && e.type !== "button" && e.type !== "submit" && visivel(e));
    for (const el of campos) {
      const td = el.closest("td");
      const prev = td && td.previousElementSibling;
      const txt = norm(prev && prev.innerText);
      if (txt && (txt === quer || txt.indexOf(quer + " ") === 0 || txt.indexOf(quer + ":") === 0)) return el.name;
    }
    return "";
  }, rotulo);
}

async function descricaoDoCampo(frame, nome) {
  return frame.evaluate((name) => {
    const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const el = [...document.querySelectorAll(`input[name="${name}"], select[name="${name}"]`)].find((e) => e.type !== "hidden" && visivel(e));
    const td = el && el.closest("td");
    let next = td && td.nextElementSibling;
    while (next) {
      const inp = [...next.querySelectorAll("input[name], select[name]")].find((e) => e.name !== name && e.type !== "hidden" && visivel(e));
      if (inp) return inp.name;
      next = next.nextElementSibling;
    }
    return "";
  }, nome);
}

async function preencherRotulo(page, frame, rotulo, codigos, oQue) {
  const nome = await nomeDoCampo(frame, rotulo);
  if (!nome) return false;
  const desc = await descricaoDoCampo(frame, nome);
  if (desc) {
    await preencherCodigo(page, frame, nome, desc, codigos, oQue);
    return true;
  }
  const campo = campoDe(frame, nome);
  await campo.fill(String(codigos[0] || ""));
  await campo.press("Tab");
  return true;
}

async function clicarBotao(page, frame, nomes, textos, avisos) {
  for (const nome of nomes) {
    const n = await frame.locator(`input[name="${nome}"], button[name="${nome}"]`).filter({ visible: true }).count().catch(() => 0);
    if (!n) continue;
    await clicarERecarregar(page, frame, `input[name="${nome}"], button[name="${nome}"]`, avisos, 120000);
    return;
  }
  const seletor = await frame.evaluate((lista) => {
    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const alvos = lista.map(norm);
    const el = [...document.querySelectorAll("input[type=button], input[type=submit], button")].find((e) => {
      if (!visivel(e)) return false;
      const t = norm(e.value || e.innerText);
      return alvos.some((a) => t === a || t.indexOf(a) === 0);
    });
    if (!el) return "";
    if (el.name) return (el.tagName === "BUTTON" ? "button" : "input") + `[name="${el.name}"]`;
    if (el.id) return `#${el.id}`;
    return "";
  }, textos);
  if (!seletor) throw new Error("Não achei o botão " + textos[0] + " em Gerações de Arquivo.");
  await clicarERecarregar(page, frame, seletor, avisos, 120000);
}

// Gerações de Arquivo (ação 1909): o lote já autorizado vira o arquivo de contas a pagar.
async function gerarArquivoRemessa(ctx, page, email, lote, nLote, log, opcoes) {
  const contas = contaDoLote(lote);
  const banco = String((lote.conta && lote.conta.banco) || "").replace(/\D/g, "");
  const avisos = vigiarAvisos(page);
  await abrirTela(ctx, page, email, TELA_ARQUIVO, log, opcoes);
  log("Abrindo Gerações de Arquivo");
  const frame = await quadro(page, (u) => /PagtoEsc/i.test(u) && /Gerac|Arquivo|Remessa/i.test(u), 25000)
    || await quadro(page, (u) => /1909|GeracaoArquivo|geracaoArquivo/i.test(u), 8000);
  if (!frame) throw new Error("A autorização ficou gravada, mas a tela Gerações de Arquivo não abriu (o usuário tem a ação 1909?).");

  if (banco) {
    const temBanco = await preencherRotulo(page, frame, "banco", [banco], "o banco");
    if (temBanco) log(`Banco ${banco}`);
  }
  const temConta = await preencherRotulo(page, frame, "conta", contas, "a conta corrente");
  if (!temConta) {
    await preencherCodigo(page, frame, "entity.contaCorrente.contaCorrentePK.nuConta", "entity.contaCorrente.nmConta", contas, "a conta corrente").catch(() => {
      throw new Error("A autorização ficou gravada, mas não achei a conta corrente em Gerações de Arquivo.");
    });
  }
  const nomeLote = await nomeDoCampo(frame, "lote");
  if (nomeLote) {
    await campoDe(frame, nomeLote).fill(nLote);
    await campoDe(frame, nomeLote).press("Tab");
  } else {
    const campoLote = frame.locator('input[name*="nuLote"], input[name*="NuLote"]').filter({ visible: true }).first();
    if (await campoLote.count()) {
      await campoLote.fill(nLote);
      await campoLote.press("Tab");
    }
  }
  log(`Consultando o lote ${nLote} para gerar o arquivo`);
  await clicarBotao(page, frame, ["pbConsultar", "btConsultar", "btFiltrar"], ["consultar"], avisos);

  const nomeArquivo = await nomeDoCampo(frame, "nome do arquivo") || await nomeDoCampo(frame, "arquivo");
  let nome = nomeArquivo ? String(await valorDe(frame, nomeArquivo) || "").trim() : "";
  if (nomeArquivo && !nome) {
    nome = "CP" + nLote;
    await campoDe(frame, nomeArquivo).fill(nome);
    log(`Nome do arquivo: ${nome}`);
  }
  const textoAntes = await frame.evaluate((n) => {
    const linhas = [...document.querySelectorAll("tr, span[id$='_caption']")].map((e) => e.innerText || "");
    return linhas.some((t) => new RegExp("\\b" + n + "\\b").test(t));
  }, nLote);
  if (!textoAntes) {
    throw new Error(`A autorização ficou gravada, mas o lote ${nLote} não aparece em Gerações de Arquivo. Só entra lote autorizado que ainda não teve arquivo. Confira no Sienge antes de gerar de novo.`);
  }
  const total = numero(await valorDe(frame, "total").catch(() => ""));
  if (Number.isFinite(total) && !mesmoValor(total, lote.total)) {
    throw new Error(`A autorização ficou gravada. O arquivo não foi gerado: o Sienge mostra ${moeda(total)} e o lote do Integra é ${moeda(lote.total)}.`);
  }

  log("Confirmando a geração do arquivo de contas a pagar");
  const antes = avisos.length;
  await clicarBotao(page, frame, ["pbConfirmar", "btConfirmar", "pbSalvar"], ["confirmar", "gerar arquivo"], avisos);
  const texto = await frame.evaluate(() => document.body.innerText || "").catch(() => "");
  const aviso = avisos.slice(antes).join(" ");
  const junto = (aviso + " " + texto).replace(/\s+/g, " ");
  if (/não|nao foi|erro|falha/i.test(aviso) && !/sucesso/i.test(aviso)) {
    throw new Error("A autorização ficou gravada, mas o Sienge não gerou o arquivo. " + junto.slice(0, 400));
  }
  log(`Arquivo de contas a pagar gerado${nome ? " (" + nome + ")" : ""}`);
  return nome;
}
