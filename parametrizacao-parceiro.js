// Parametrização de Parceiro — várias obras, matriz DFC e credor (título a pagar)

const ParametrizacaoParceiroApp = {
  STORAGE_KEY: "crm_parcerias_v1",
  items: [],
  selectedId: null,
  selectedObraCode: "",
  detailTab: "geral",
  categories: [],
  ccSearch: "",
  loadingCats: false,
  creditorQuery: "",
  credorPapel: "empreendedor",
  creditorHits: [],
  creditorSearching: false,
  _creditorTimer: null,
  _creditorIndex: null,
  _bankLoading: false,
  expanded: null,
  socioAberto: "",
  vinculoUi: null,

  obraFromCc(id) {
    const digits = String(id || "").replace(/\D/g, "");
    if (digits.length >= 3) return digits.slice(0, -2);
    return digits || "";
  },

  allCostCenters() {
    return (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) ||
      (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) || [];
  },

  empresaDoCentro(cc) {
    if (!cc) return "";
    const id = cc.idCompany != null && cc.idCompany !== "" ? cc.idCompany : cc.companyId;
    return id == null || id === "" ? "" : String(id);
  },

  catalogoCentros() {
    const vistos = new Map();
    const add = (cc) => {
      if (!cc || cc.id == null || cc.id === "") return;
      const id = String(cc.id).replace(/\D/g, "") || String(cc.id);
      const prev = vistos.get(id);
      if (!prev || (!this.empresaDoCentro(prev) && this.empresaDoCentro(cc))) vistos.set(id, cc);
    };
    this.allCostCenters().forEach(add);
    if (window.CentrosCustoState) (CentrosCustoState.costCenters || []).forEach(add);
    return vistos;
  },

  checarCentroDaEmpresa(ccId, companyId) {
    const id = String(ccId || "").replace(/\D/g, "");
    const emp = String(companyId || "");
    if (!id) return { ok: false, msg: "Informe um centro de custo." };
    const cc = this.catalogoCentros().get(id);
    if (!cc || this.empresaDoCentro(cc) !== emp) {
      const dono = cc ? this.empresaDoCentro(cc) : "";
      const onde = dono ? ` Ele pertence à empresa ${dono}.` : ` Ele não pertence à empresa ${emp}.`;
      return { ok: false, msg: `Centro de custo ${id} não é permitido.${onde}` };
    }
    return { ok: true, cc };
  },

  costCentersOfObra(obra, companyId) {
    const prefix = String(obra || "");
    if (!prefix) return [];
    return [...this.catalogoCentros().values()].filter(cc => {
      if (companyId && this.empresaDoCentro(cc) !== String(companyId)) return false;
      return this.obraFromCc(cc.id) === prefix;
    });
  },

  mapaCustomCc() {
    const mem = window.CentrosCustoState && CentrosCustoState.customFields;
    if (mem && Object.keys(mem).length) return mem;
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  customCc(id) {
    const map = this.mapaCustomCc();
    return map[id] || map[String(id)] || {};
  },

  ehCcParceiro(cc) {
    if (!cc) return false;
    if (window.CentrosCustoApp && typeof CentrosCustoApp.isParceiro === "function") return CentrosCustoApp.isParceiro(cc);
    if (String(this.customCc(cc.id).tipo_cc || "") === "Corporativo") return false;
    return /parce(ir|ri)/i.test(String(cc.name || ""));
  },

  centrosDaObra(obra) {
    const prefix = String(obra || "");
    if (!prefix) return [];
    const vistos = new Set();
    const lista = [];
    const add = (cc) => {
      if (!cc || cc.id == null) return;
      const id = String(cc.id);
      if (this.obraFromCc(id) !== prefix || vistos.has(id)) return;
      vistos.add(id);
      lista.push(cc);
    };
    this.allCostCenters().forEach(add);
    if (window.CentrosCustoState) (CentrosCustoState.costCenters || []).forEach(add);
    return lista;
  },

  /** % Terrenista gravado no centro de custo do parceiro da mesma obra. */
  rateioParceiroDoCc(ccId) {
    const digits = String(ccId || "").replace(/\D/g, "");
    if (digits.length < 5) return null;
    const lista = this.centrosDaObra(this.obraFromCc(digits));
    if (!lista.length) return null;
    const typed = lista.find((cc) => String(cc.id).replace(/\D/g, "") === digits);
    let parceiro = typed && this.ehCcParceiro(typed) ? typed : lista.find((cc) => this.ehCcParceiro(cc));
    if (!parceiro && typed && window.CentrosCustoApp && typeof CentrosCustoApp.parDoRateio === "function") {
      const par = CentrosCustoApp.parDoRateio(typed);
      if (par && par.papel === "ml" && par.outro) parceiro = par.outro;
    }
    if (!parceiro) {
      parceiro = lista.find((cc) => Number(this.customCc(cc.id).perc_terrenista) > 0 && !String(cc.id).endsWith("00"));
    }
    if (!parceiro) return null;
    let pct = Number(this.customCc(parceiro.id).perc_terrenista);
    if (!(pct > 0)) {
      const base = lista.find((cc) => !this.ehCcParceiro(cc));
      const ml = base ? Number(this.customCc(base.id).perc_ml) || 0 : 0;
      if (ml > 0 && ml < 100) pct = Number((100 - ml).toFixed(2));
    }
    return Number.isFinite(pct) && pct > 0 ? Number(pct.toFixed(2)) : null;
  },

  percentualTravado(obra) {
    if (!obra) return null;
    const amostra = (obra.costCenters && obra.costCenters[0] && obra.costCenters[0].id) || (String(obra.code || "") + "00");
    return this.rateioParceiroDoCc(amostra);
  },

  travarCampoRateio(el, pct) {
    if (!el) return;
    if (pct == null) {
      el.readOnly = false;
      el.type = "number";
      el.style.background = "#fff";
      el.style.cursor = "";
      el.title = "";
      return;
    }
    el.type = "text";
    el.value = String(pct);
    el.readOnly = true;
    el.style.background = "#f1f5f9";
    el.style.cursor = "default";
    el.title = "Percentual cadastrado no centro de custo. Não pode ser alterado aqui.";
  },

  digitosCentro(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 5);
  },

  aoDigitarCentroObra(el) {
    if (!el) return;
    const digits = this.digitosCentro(el.value);
    if (el.value !== digits) el.value = digits;
    this.preencherRateioParceiro(digits);
  },

  preencherRateioParceiro(raw) {
    const el = document.getElementById("pp-add-obra-share");
    if (!el) return;
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length < 5) {
      this.travarCampoRateio(el, null);
      el.value = "";
      return;
    }
    const pct = this.rateioParceiroDoCc(digits);
    this.travarCampoRateio(el, pct);
    if (pct == null) el.value = "";
  },

  companies() {
    return (window.AppState && AppState.companies) || [];
  },

  nomeEmpresa(id) {
    const c = this.companies().find(x => String(x.id) === String(id));
    return (c && (c.name || c.tradeName)) || ("Empresa " + id);
  },

  corrigirEmpresaEllenco(p) {
    const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const nome = fold(p && p.partnerName);
    if (nome.indexOf("ELLENCO") < 0 || nome.indexOf("MLDU") < 0) return false;
    if (String(p.companyId) === "12") {
      const oficial = this.nomeEmpresa("12");
      if (oficial !== "Empresa 12" && p.companyName !== oficial) {
        p.companyName = oficial;
        return true;
      }
      return false;
    }
    if (String(p.companyId) !== "1") return false;
    p.companyId = "12";
    p.companyName = this.nomeEmpresa("12");
    return true;
  },

  cobrancaInternaIds() {
    if (typeof getConfiguredInternalCompanyIds === "function") {
      return getConfiguredInternalCompanyIds().map(String);
    }
    try {
      const custom = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
      return Object.entries(custom)
        .filter(([, c]) => c && (c.cobranca_interna === 1 || c.cobranca_interna === true || c.cobranca_interna === "1"))
        .map(([id, c]) => String(c.company_id ?? c.id ?? id));
    } catch (e) {
      return [];
    }
  },

  eligibleCompanies() {
    const ids = new Set(this.cobrancaInternaIds());
    return this.companies()
      .filter(c => ids.has(String(c.id)))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  empresasEditaveis(p) {
    const lista = this.eligibleCompanies().slice();
    const id = String((p && p.companyId) || "");
    if (id && !lista.some(c => String(c.id) === id)) {
      const atual = this.companies().find(c => String(c.id) === id);
      lista.unshift(atual || { id: id, name: (p && p.companyName) || ("Empresa " + id) });
    }
    return lista;
  },

  papelDoCentro(cc) {
    const gravado = String(cc && cc.papel || "");
    if (gravado === "terrenista" || gravado === "empreendedor" || gravado === "obra") return gravado;
    if (this.ehCcParceiro(cc) || Number(this.customCc(cc && cc.id).perc_terrenista) > 0) return "terrenista";
    return "obra";
  },

  setCcPapel(ccId, papel) {
    const obra = this.currentObra();
    if (!obra) return;
    const cc = (obra.costCenters || []).find((c) => String(c.id) === String(ccId));
    if (!cc) return;
    cc.papel = papel === "terrenista" || papel === "empreendedor" ? papel : "obra";
    this.persist();
  },

  isSociedade(p) {
    return this.kindOf(p) === "sociedade";
  },

  isMista(p) {
    return this.kindOf(p) === "mista";
  },

  kindOf(p) {
    const k = String((p && p.kind) || "parceria");
    return k === "sociedade" || k === "mista" ? k : "parceria";
  },

  kindLabel(p) {
    if (this.isMista(p)) return "Mista";
    if (this.isSociedade(p)) return "Sociedade";
    return "Parceria";
  },

  temSocios(p) {
    return this.isSociedade(p) || this.isMista(p);
  },

  variosCredores(p) {
    return this.temSocios(p) || this.kindOf(p) === "parceria";
  },

  rotuloCredor(p, plural) {
    const socio = this.isSociedade(p) || this.isMista(p);
    if (plural) return socio ? "Sócios" : "Parceiros";
    return socio ? "sócio" : "parceiro";
  },

  papelSocio(s) {
    return s && s.papel === "terrenista" ? "terrenista" : "empreendedor";
  },

  sociosPorPapel(p, papel) {
    const alvo = papel === "terrenista" ? "terrenista" : "empreendedor";
    return (p && p.socios || []).filter((s) => s && s.id && this.papelSocio(s) === alvo);
  },

  /* Despesa bancária não entra no rateio do terrenista. A liquidação da tarifa do boleto rateia pelo centro de custo; a responsabilidade continua inteira do empreendedor. */
  ehDespesaBancaria(accId, nome) {
    const id = String(accId || "").replace(/\D/g, "");
    if (id === "2050105" || id.indexOf("2050105") === 0) return true;
    const n = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return /DESPESAS BANCARIAS/.test(n) || /TARIFA DE BOLETO/.test(n) || /TARIFA BANCARIA/.test(n);
  },

  pctTerrenista(p) {
    const obra = (p && p.obras && p.obras[0]) || null;
    const travado = obra ? this.percentualTravado(obra) : null;
    const n = travado != null ? travado : Number(obra && obra.defaultPartnerShare);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },

  efetivoEmpreendedor(p, sharePct) {
    const fatia = Number(sharePct);
    const terr = this.pctTerrenista(p);
    if (!(fatia > 0) || !(terr >= 0) || terr >= 100) return 0;
    return Math.round((100 - terr) * fatia / 100 * 1000) / 1000;
  },

  ehAracari(p) {
    if (!p || String(p.companyId) !== "6" || !this.isMista(p)) return false;
    const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const nome = fold(p.partnerName) + " " + fold(p.companyName);
    return nome.indexOf("ARACARI") >= 0;
  },

  /* 50% / 25% / 25% da fatia de 56% do centro 14201. O efetivo no negócio é 28% / 14% / 14%. */
  ARACARI_EMPREENDEDORES: [
    {
      id: "7",
      name: "MOURA LEITE DESENVOLVIMENTO E URBANIZACAO LTDA",
      cpfCnpj: "01.066.134/0001-78",
      sharePct: 50,
      papel: "empreendedor",
      ccTitulo: "70603",
      ccTituloNome: "MOURA LEITE DESENVOLVIMENTO E URBANIZAÇÃO LTDA",
      planoId: "20707",
      planoNome: "Distribuição Lucro - Remessa para Controladora",
      docTipo: "DIST",
      docNome: "DISTRIBUIÇÃO DE LUCRO"
    },
    {
      id: "235",
      name: "SOMA DESENVOLVIMENTO IMOBILIARIO LTDA",
      cpfCnpj: "18.424.091/0001-58",
      sharePct: 25,
      papel: "empreendedor",
      ccTitulo: "70601",
      ccTituloNome: "SOMA DESENVOLVIMENTO IMOBILIARIO LTDA",
      planoId: "20701",
      planoNome: "Distribuição Lucro",
      docTipo: "DIST",
      docNome: "DISTRIBUIÇÃO DE LUCRO"
    },
    {
      id: "1388",
      name: "PRF PARTICIPACOES IMOBILIARIAS LTDA",
      cpfCnpj: "19.812.125/0001-44",
      sharePct: 25,
      papel: "empreendedor",
      ccTitulo: "70602",
      ccTituloNome: "PR&F PARTICIPAÇÕES IMOBILIÁRIAS LTDA",
      planoId: "20701",
      planoNome: "Distribuição Lucro",
      docTipo: "DIST",
      docNome: "DISTRIBUIÇÃO DE LUCRO"
    }
  ],

  aplicarSociosAracari(p) {
    if (!p || p.sociosSeed === "aracari-empreendedores-v1") return false;
    if (!this.ehAracari(p)) return false;
    p.socios = Array.isArray(p.socios) ? p.socios : [];
    this.ARACARI_EMPREENDEDORES.forEach((src) => {
      const row = this.blankSocio(src);
      const i = p.socios.findIndex((s) => String(s.id) === String(src.id));
      if (i >= 0) {
        const prev = p.socios[i];
        row.bankInfo = prev.bankInfo || null;
        row.bankList = prev.bankList || [];
        row.bankId = prev.bankId || row.bankId;
        row.bankLoaded = !!prev.bankLoaded;
        p.socios[i] = row;
      } else {
        p.socios.push(row);
      }
    });
    if (!p.contaTerrenista) p.contaTerrenista = "99382-5";
    if (!p.contaDistribuicao) p.contaDistribuicao = "99397-3";
    p.sociosSeed = "aracari-empreendedores-v1";
    return true;
  },

  isoDeData(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  },

  /* O resultado é da competência. O pagamento do terrenista, e a transferência de cada empreendedor, caem no mês seguinte. */
  dataPagamentoMista(p, year, month) {
    const cred = (p && p.creditor) || {};
    const y = Number(year);
    const m = Number(month);
    if (!y || !m) return "";
    const close = new Date(y, m, 0);
    if (cred.paymentDayMode === "businessDays") {
      const n = parseInt(cred.paymentBusinessDays, 10);
      if (!(n >= 1)) return "";
      return this.isoDeData(this.addBusinessDaysAfter(close, n));
    }
    const day = parseInt(cred.paymentDay, 10);
    if (!(day >= 1)) return "";
    let mm = m + 1;
    let yy = y;
    if (mm > 12) { mm = 1; yy += 1; }
    const last = new Date(yy, mm, 0).getDate();
    const d = Math.min(day, last);
    return yy + "-" + String(mm).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  },

  dinheiro(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /* valorTerrenista é o que o terrenista tem a receber (a parte dele, já com o % da parceria). */
  distribuicaoEmpreendedores(p, valorTerrenista, impostos, despesas) {
    const terr = this.pctTerrenista(p);
    const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const linhas = this.sociosPorPapel(p, "empreendedor")
      .map((s) => {
        const share = Number(s.sharePct) || 0;
        const efetivo = this.efetivoEmpreendedor(p, share);
        const bruto = terr > 0 ? cents(Number(valorTerrenista) * efetivo / terr) : 0;
        return { socio: s, share, efetivo, bruto };
      })
      .filter((row) => row.share > 0)
      .sort((a, b) => b.share - a.share || String(a.socio.name || "").localeCompare(String(b.socio.name || ""), "pt-BR"));
    let restoImp = cents(impostos);
    let restoDesp = cents(despesas);
    linhas.forEach((row, i) => {
      const ultima = i === linhas.length - 1;
      const imp = ultima ? restoImp : cents(Number(impostos) * row.share / 100);
      const desp = ultima ? restoDesp : cents(Number(despesas) * row.share / 100);
      restoImp = cents(restoImp - imp);
      restoDesp = cents(restoDesp - desp);
      row.impostos = imp;
      row.despesas = desp;
      row.liquido = cents(row.bruto - imp - desp);
    });
    return { terrPct: terr, fatiaEmp: Math.round((100 - terr) * 1000) / 1000, linhas };
  },

  textoObservacaoDistribuicao(mesNome, ano, bruto, impostos, despesas, liquido) {
    return "Distribuição de Lucro " + mesNome + " " + ano
      + " - TOTAL REPASSE R$ " + this.dinheiro(bruto)
      + " - R$ " + this.dinheiro(impostos) + " (PIS/COFINS/IR)"
      + " - R$ " + this.dinheiro(despesas) + " despesas operacionais"
      + " = R$ " + this.dinheiro(liquido);
  },

  /* Credor do Sienge → centro de custo da empresa 13. */
  CENTROS_SOCIOS_13: {
    "1806": ["71301", "ELLENCO & MOURA LEITE BOITUVA EMPREENDIMENTO IMOBILIÁRIO SPE LTDA"],
    "2043": ["71302", "MARIO VERCELLINO NETO"],
    "2046": ["71303", "NORBERTO VERCELLINO"],
    "2044": ["71304", "FERNANDO VERCELLINO"],
    "2045": ["71305", "MARIA REGINA VERCELLINO"],
    "2047": ["71306", "VERA LUCIA VERCELLINO"],
    "2048": ["71307", "NATASHA MOREIRA MORAES VERCELLINO"],
    "2049": ["71308", "VITOR SOARES VERCELLINO"],
    "2052": ["71309", "LUIS GUSTAVO VERCELLINO RODRIGUES"],
    "2051": ["71310", "EDGAR TADEU VERCELLINO RODRIGUES"],
    "2050": ["71311", "DANIEL FILIPE VERCELLINO RODRIGUES"],
    "2054": ["71312", "CARLOS EDUARDO VERCELLINO RODRIGUES"],
    "2055": ["71313", "MAISA MAGORDO RODRIGUES"],
    "2053": ["71314", "PEDRO ADEMIR PRESTES"]
  },

  vincularCentrosEmpresa13(p) {
    if (!p || String(p.companyId) !== "13" || !this.isSociedade(p)) return false;
    let mudou = false;
    (p.socios || []).forEach((s) => {
      if (!s || s.ccTitulo) return;
      const par = this.CENTROS_SOCIOS_13[String(s.id)];
      if (!par) return;
      s.ccTitulo = par[0];
      s.ccTituloNome = par[1];
      mudou = true;
    });
    return mudou;
  },

  VERCELLINO_SOCIOS: [
    { id: "1806", name: "ELLENCO & MOURA LEITE BOITUVA EMPREENDIMENTO IMOBILIÁRIO SPE LTDA", sharePct: 55.498 },
    { id: "2044", name: "FERNANDO VERCELLINO", sharePct: 6.179 },
    { id: "2045", name: "MARIA REGINA VERCELLINO", sharePct: 6.179 },
    { id: "2043", name: "MARIO VERCELLINO NETO", sharePct: 6.179 },
    { id: "2046", name: "NORBERTO VERCELLINO", sharePct: 6.179 },
    { id: "2047", name: "VERA LUCIA VERCELLINO", sharePct: 6.179 },
    { id: "2048", name: "NATASHA MOREIRA MORAES VERCELLINO", sharePct: 3.089 },
    { id: "2049", name: "VITOR SOARES VERCELLINO", sharePct: 3.089 },
    { id: "2050", name: "DANIEL FILIPE VERCELLINO RODRIGUES", sharePct: 1.545 },
    { id: "2051", name: "EDGAR TADEU VERCELLINO RODRIGUES", sharePct: 1.545 },
    { id: "2052", name: "LUIS GUSTAVO VERCELLINO RODRIGUES", sharePct: 1.545 },
    { id: "2053", name: "PEDRO ADEMIR PRESTES", sharePct: 1.25 },
    { id: "2054", name: "CARLOS EDUARDO VERCELLINO RODRIGUES", sharePct: 0.772 },
    { id: "2055", name: "MAISA MAGORDO VERCELLINOS", sharePct: 0.772 }
  ],

  blankSocio(src) {
    const s = src || {};
    const pct = s.sharePct == null || s.sharePct === "" ? "" : Number(s.sharePct);
    const planos = this.normalizarPlanos(s);
    const primeiro = planos.find((pl) => pl.id) || planos[0] || { id: "", nome: "" };
    return {
      id: String(s.id || ""),
      name: String(s.name || ""),
      cpfCnpj: String(s.cpfCnpj || ""),
      sharePct: pct === "" || !Number.isFinite(pct) ? "" : pct,
      bankInfo: s.bankInfo || null,
      bankList: Array.isArray(s.bankList) ? s.bankList : [],
      bankId: s.bankId || (s.bankInfo && s.bankInfo.id != null ? s.bankInfo.id : ""),
      bankLoaded: !!s.bankLoaded,
      ccTitulo: String(s.ccTitulo || ""),
      ccTituloNome: String(s.ccTituloNome || ""),
      planoId: String(primeiro.id || ""),
      planoNome: String(primeiro.nome || ""),
      planos,
      docTipo: String(s.docTipo || ""),
      docNome: String(s.docNome || ""),
      papel: s.papel === "terrenista" ? "terrenista" : (s.papel === "empreendedor" ? "empreendedor" : "")
    };
  },

  normalizarPlanos(s) {
    const bruto = Array.isArray(s && s.planos) ? s.planos : [];
    const lista = bruto.map((pl) => {
      const brutoPct = pl && pl.pct;
      const n = brutoPct === "" || brutoPct == null ? "" : Number(String(brutoPct).replace(",", "."));
      return {
        id: String((pl && (pl.id || pl.planoId)) || ""),
        nome: String((pl && (pl.nome || pl.planoNome)) || ""),
        pct: n === "" || !Number.isFinite(n) ? "" : Math.max(0, Math.min(100, n))
      };
    });
    if (lista.length) return lista;
    if (s && s.planoId) return [{ id: String(s.planoId), nome: String(s.planoNome || ""), pct: "" }];
    return [{ id: "", nome: "", pct: "" }];
  },

  sincronizarPlanoPrincipal(row) {
    if (!row) return;
    const primeiro = (row.planos || []).find((pl) => pl && pl.id) || { id: "", nome: "" };
    row.planoId = String(primeiro.id || "");
    row.planoNome = String(primeiro.nome || "");
  },

  resumoPlanosSocio(p, s) {
    if (!this.isSociedade(p)) return s && s.planoId ? " · " + this.esc(s.planoId) : "";
    const ids = this.normalizarPlanos(s).filter((pl) => pl.id);
    if (ids.length > 1) return " · " + ids.length + " planos";
    return ids[0] ? " · " + this.esc(ids[0].id) : "";
  },

  chipsSocioHtml(p, s) {
    const chips = [];
    if (this.isSociedade(p) || this.isMista(p)) {
      chips.push(s.ccTitulo
        ? `<span class="pp-chip">CC ${this.esc(s.ccTitulo)}</span>`
        : `<span class="pp-chip is-falta">Sem centro</span>`);
    }
    const planos = this.normalizarPlanos(s).filter((pl) => pl.id);
    if (!planos.length) chips.push(`<span class="pp-chip is-falta">Sem plano</span>`);
    else if (!this.isSociedade(p)) chips.push(`<span class="pp-chip">${this.esc(planos[0].id)}</span>`);
    else planos.forEach((pl) => {
      const pct = pl.pct === "" || pl.pct == null ? "" : " · " + this.fmtPctCurto(pl.pct) + "%";
      chips.push(`<span class="pp-chip">${this.esc(pl.id)}${pct}</span>`);
    });
    chips.push(s.docTipo
      ? `<span class="pp-chip">${this.esc(s.docTipo)}</span>`
      : `<span class="pp-chip is-falta">Sem documento</span>`);
    return chips.join("");
  },

  /* Um plano sem percentual fica com 100% da participação. Com vários, cada percentual vale sobre a participação do sócio. */
  titulosDoSocio(s) {
    const parte = Number(s && s.sharePct);
    const socioPct = Number.isFinite(parte) ? parte : 0;
    const planos = this.normalizarPlanos(s).filter((pl) => pl.id);
    if (!planos.length) return [];
    const informado = planos.some((pl) => pl.pct !== "" && pl.pct != null);
    const unico = planos.length === 1;
    return planos.map((pl) => {
      const pctPlano = informado ? (Number(pl.pct) || 0) : (unico ? 100 : 0);
      const efetivo = Math.round(socioPct * pctPlano / 100 * 1000) / 1000;
      return {
        planoId: pl.id,
        planoNome: pl.nome,
        pctPlano,
        pctSocio: socioPct,
        efetivo,
        ccId: String((s && s.ccTitulo) || ""),
        ccNome: String((s && s.ccTituloNome) || "")
      };
    });
  },

  totalSociosPct(p) {
    return (p && p.socios || []).reduce((sum, s) => sum + (Number(s.sharePct) || 0), 0);
  },

  /* Um parceiro usa o percentual da obra. Dois ou mais dividem essa fatia. Sociedade continua com o percentual do sócio. */
  pedeFatiaCredor(p) {
    if (!p || this.isSociedade(p) || this.isMista(p)) return false;
    return (p.socios || []).filter((s) => s && s.id).length >= 2;
  },

  pctObra(obra) {
    if (!obra) return 0;
    const travado = this.percentualTravado(obra);
    if (travado != null) return travado;
    return Number(obra.defaultPartnerShare) || 0;
  },

  fatiasDoSocio(p, sharePct) {
    const parte = Number(sharePct);
    if (!(parte > 0)) return [];
    return (p.obras || []).filter((o) => o && o.code).map((o) => {
      const base = this.pctObra(o);
      const efetivo = Math.round(base * parte / 100 * 1000) / 1000;
      return { code: String(o.code), base, efetivo };
    });
  },

  fmtPctCurto(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  },

  sociosOrdenados(lista) {
    const pct = (s) => {
      const n = Number(s && s.sharePct);
      return Number.isFinite(n) ? n : 0;
    };
    return (lista || []).slice().sort((a, b) => {
      const diff = pct(b) - pct(a);
      if (diff) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
    });
  },

  fmtPct(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  },

  ehVercellino(p) {
    const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const nome = fold(p && p.partnerName);
    const emp = fold(p && p.companyName);
    return nome === "VERCELLINO" || (emp.includes("VERCELLINO") && nome.includes("VERCELLINO"));
  },

  aplicarSociosVercellino(p) {
    if (!p || p.sociosSeed === "vercellino-v1") return false;
    if (!this.ehVercellino(p) || !this.temSocios(p)) return false;
    const prev = p.creditor || {};
    p.socios = this.VERCELLINO_SOCIOS.map((s) => {
      const row = this.blankSocio(s);
      if (String(prev.id) === String(s.id)) {
        row.cpfCnpj = prev.cpfCnpj || row.cpfCnpj;
        row.bankInfo = prev.bankInfo || null;
        row.bankList = prev.bankList || [];
        row.bankId = prev.bankId || row.bankId;
        row.bankLoaded = !!prev.bankLoaded;
      }
      return row;
    });
    p.sociosSeed = "vercellino-v1";
    return true;
  },

  /** Grupos DFC que não entram no rateio de parceria (nem os nós internos). */
  PARCERIA_HIDDEN_DFC_ITEMS: [2, 6, 7, 8, 10, 11, 12],

  dfcItemNumber(node) {
    const s = String((node && (node.code || node.codigo || node.name || node.nome)) || "").trim();
    const m = s.match(/^(\d{1,2})\b/);
    return m ? parseInt(m[1], 10) : null;
  },

  isDfcHiddenForParceria(p, node) {
    if (this.isSociedade(p) || !node) return false;
    const n = this.dfcItemNumber(node);
    return n != null && this.PARCERIA_HIDDEN_DFC_ITEMS.includes(n);
  },

  normalizeItem(p) {
    if (!p) return p;
    p.kind = this.kindOf(p);
    if (!Array.isArray(p.obras)) p.obras = [];
    if (!p.obras.length && (p.obraCode || (p.costCenters && p.costCenters.length))) {
      p.obras = [{
        code: String(p.obraCode || ""),
        defaultPartnerShare: Number(p.defaultPartnerShare) || 0,
        costCenters: p.costCenters || [],
        accountShares: p.accountShares || {},
        naNodes: p.naNodes || {},
        naAccounts: p.naAccounts || {},
        inAccounts: p.inAccounts || {}
      }];
    }
    p.obras.forEach(o => {
      o.code = String(o.code || "");
      o.defaultPartnerShare = Number(o.defaultPartnerShare);
      if (!Number.isFinite(o.defaultPartnerShare)) o.defaultPartnerShare = Number(p.defaultPartnerShare) || 0;
      o.costCenters = o.costCenters || [];
      o.accountShares = o.accountShares || {};
      o.naNodes = o.naNodes || {};
      o.naAccounts = o.naAccounts || {};
      o.inAccounts = o.inAccounts || {};
    });
    p.creditor = p.creditor || { id: "", name: "", cpfCnpj: "", sharePct: "", paymentDay: "", paymentDayMode: "monthDay", paymentBusinessDays: "", bankInfo: null };
    p.creditor.paymentDay = p.creditor.paymentDay == null ? "" : p.creditor.paymentDay;
    p.creditor.paymentDayMode = p.creditor.paymentDayMode === "businessDays" ? "businessDays" : "monthDay";
    if (p.creditor.paymentBusinessDays == null) p.creditor.paymentBusinessDays = "";
    p.creditor.bankList = p.creditor.bankList || [];
    const tinhaSocios = Array.isArray(p.socios);
    p.socios = tinhaSocios ? p.socios.map(s => this.blankSocio(s)) : [];
    if (this.temSocios(p) && !tinhaSocios && p.creditor.id) p.socios.push(this.blankSocio(p.creditor));
    if (this.kindOf(p) === "parceria" && p.creditor && p.creditor.id && !(p.socios || []).some(s => s.id)) {
      p.socios.push(this.blankSocio(p.creditor));
    }
    p.obraCode = p.obras.map(o => o.code).filter(Boolean).join(", ");
    const first = p.obras[0];
    p.defaultPartnerShare = first ? first.defaultPartnerShare : (Number(p.defaultPartnerShare) || 0);
    p.costCenters = (p.obras || []).flatMap(o => o.costCenters || []);
    return p;
  },

  obrasOf(p) {
    return (p && p.obras) || [];
  },

  current() {
    const p = this.items.find(x => x.id === this.selectedId) || null;
    return p ? this.normalizeItem(p) : null;
  },

  currentObra(p) {
    const part = p || this.current();
    if (!part) return null;
    const obras = this.obrasOf(part);
    return obras.find(o => String(o.code) === String(this.selectedObraCode)) || obras[0] || null;
  },

  selectObra(code) {
    this.selectedObraCode = String(code || "");
    this.ccSearch = "";
    this.render();
  },

  setDetailTab(tab) {
    this.detailTab = tab || "geral";
    this.fecharVinculo();
    this.render();
    if (this.detailTab === "credor") {
      this.ensureCreditorBank();
      this.garantirDocumentos();
    }
  },

  centrosOrdenados(lista) {
    return (lista || []).slice().sort((a, b) => {
      const na = Number(String(a && a.id || "").replace(/\D/g, "")) || 0;
      const nb = Number(String(b && b.id || "").replace(/\D/g, "")) || 0;
      if (na !== nb) return na - nb;
      return String(a.id || "").localeCompare(String(b.id || ""), "pt-BR", { numeric: true });
    });
  },

  salvarCentros() {
    this.persist();
    this.ccSearch = "";
    this.setDetailTab("obras");
  },

  partnerPct(part, key) {
    if (this.isSociedade(part)) return 0;
    const obra = this.currentObra(part);
    if (!obra) return 0;
    return this.partnerPctForObra(part, obra, key);
  },

  /** Localiza a obra da parametrização pelo centro de custo. */
  obraForCostCenter(part, costCenterId) {
    const p = this.normalizeItem(part);
    if (!p) return null;
    const cid = String(costCenterId || "");
    return (p.obras || []).find(o => (o.costCenters || []).some(c => String(c.id) === cid)) || null;
  },

  /** % do parceiro numa obra específica (sem depender da obra selecionada na UI). */
  partnerPctForObra(part, obra, key) {
    if (this.isSociedade(part) || !obra) return 0;
    if (this.isNAForObra(part, obra, key)) return 0;
    if (obra.accountShares && Object.prototype.hasOwnProperty.call(obra.accountShares, key)) {
      const n = Number(obra.accountShares[key]);
      return Number.isFinite(n) ? n : Number(obra.defaultPartnerShare) || 0;
    }
    return Number(obra.defaultPartnerShare) || 0;
  },

  marcada(mapa, sid) {
    if (!mapa) return false;
    const nk = this.normKey(sid);
    if (Object.prototype.hasOwnProperty.call(mapa, sid)) return !!mapa[sid];
    if (nk && Object.prototype.hasOwnProperty.call(mapa, nk)) return !!mapa[nk];
    return Object.keys(mapa).some(k => nk && this.normKey(k) === nk && mapa[k]);
  },

  isAccountNAForObra(part, obra, accId) {
    if (!obra) return false;
    const sid = String(accId || "");
    const parent = this.accountParentId(sid) || this.accountParentIdLoose(sid);
    const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
    const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
    if (ancestorNA) return !this.marcada(obra.inAccounts, sid);
    return this.marcada(obra.naAccounts, sid);
  },

  isNAForObra(part, obra, key, ancestors) {
    if (!obra) return false;
    const groups = this.dfcGroups();
    const nk = this.normKey(key);
    const isAcc = groups.some(g => (g.accounts || []).some(a => String(a) === String(key) || this.normKey(a) === nk));
    if (isAcc) return this.isAccountNAForObra(part, obra, key);
    if (obra.naNodes && obra.naNodes[key]) return true;
    if ((ancestors || []).some(a => obra.naNodes && obra.naNodes[a])) return true;
    return this.nodeAncestors(key).some(a => obra.naNodes && obra.naNodes[a]);
  },

  accountParentIdLoose(accId) {
    const nk = this.normKey(accId);
    const g = this.dfcGroups().find(g => (g.accounts || []).some(a => String(a) === String(accId) || this.normKey(a) === nk));
    return g ? g.id : null;
  },

  normKey(id) {
    return String(id || "").replace(/\D/g, "");
  },

  /** Conta entra na prestação com o parceiro? */
  accountEntersPartnership(part, obra, accId) {
    if (!part || !obra) return true;
    return !this.isAccountNAForObra(part, obra, accId);
  },

  /** Fator a aplicar no valor (1 = 100%). Sociedade = conta integral; parceria = % do parceiro. */
  partnershipAmountFactor(part, obra, accId, nome) {
    if (!part || !obra) return 1;
    if (this.isMista(part) && this.ehDespesaBancaria(accId, nome || this.catName(accId))) return 0;
    if (!this.accountEntersPartnership(part, obra, accId)) return 0;
    if (this.isSociedade(part)) return 1;
    return (Number(this.partnerPctForObra(part, obra, accId)) || 0) / 100;
  },

  dfcDefaultGroups() {
    if (typeof PlanoFinanceiroApp !== "undefined" && typeof PlanoFinanceiroApp.dfcTemplateGroups === "function") {
      return PlanoFinanceiroApp.dfcTemplateGroups();
    }
    return [];
  },

  dfcVisao() {
    if (typeof PlanoFinanceiroApp !== "undefined") {
      if (!Array.isArray(PlanoFinanceiroApp.visoes) || !PlanoFinanceiroApp.visoes.length) {
        try {
          PlanoFinanceiroApp.visoes = JSON.parse(localStorage.getItem(PlanoFinanceiroApp.STORAGE_KEY || "crm_plano_visoes_v2") || "[]") || [];
        } catch (e) {
          PlanoFinanceiroApp.visoes = [];
        }
      }
      if (typeof PlanoFinanceiroApp.ensureDfcDefault === "function") PlanoFinanceiroApp.ensureDfcDefault();
      const dfc = (PlanoFinanceiroApp.visoes || []).find(v => v.id === "dfc_default");
      if (dfc && Array.isArray(dfc.groups) && dfc.groups.length) {
        return { name: dfc.name || "DFC Padrão", groups: dfc.groups, ignoredAccounts: dfc.ignoredAccounts || [] };
      }
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    const visao = visoes.find(v => v.id === "dfc_default") || visoes.find(v => /dfc/i.test(v.name || "")) || visoes[0];
    const groups = visao && Array.isArray(visao.groups) && visao.groups.length ? visao.groups : this.dfcDefaultGroups();
    return { name: (visao && visao.name) || "DFC Padrão", groups, ignoredAccounts: (visao && visao.ignoredAccounts) || [] };
  },

  catName(id) {
    const c = (this.categories || []).find(x => String(x.id || x._id) === String(id));
    return (c && (c._name || c.name || c.description)) || "";
  },

  dfcGroups() {
    return this.dfcVisao().groups || [];
  },

  accountParentId(accId) {
    const g = this.dfcGroups().find(g => (g.accounts || []).map(String).includes(String(accId)));
    return g ? g.id : null;
  },

  nodeAncestors(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    let cur = groups.find(g => g.id === nodeId);
    while (cur && cur.parentId) {
      ids.push(cur.parentId);
      cur = groups.find(g => g.id === cur.parentId);
    }
    return ids;
  },

  subtreeAccountIds(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    const walk = (id) => {
      const n = groups.find(g => g.id === id);
      if (!n) return;
      (n.accounts || []).forEach(a => ids.push(String(a)));
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    walk(nodeId);
    return ids;
  },

  subtreeNodeIds(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    const walk = (id) => {
      ids.push(id);
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    walk(nodeId);
    return ids;
  },

  hasAncestorNA(part, nodeId) {
    const obra = this.currentObra(part);
    if (!obra) return false;
    return this.nodeAncestors(nodeId).some(a => obra.naNodes && obra.naNodes[a]);
  },

  isAccountNA(part, accId) {
    const obra = this.currentObra(part);
    if (!obra) return false;
    const parent = this.accountParentId(accId);
    const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
    const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
    if (ancestorNA) return !(obra.inAccounts && obra.inAccounts[accId]);
    return !!(obra.naAccounts && obra.naAccounts[accId]);
  },

  isNA(part, key, ancestors) {
    const groups = this.dfcGroups();
    const isAcc = groups.some(g => (g.accounts || []).map(String).includes(String(key)));
    if (isAcc) return this.isAccountNA(part, key);
    const obra = this.currentObra(part);
    if (!obra) return false;
    if (obra.naNodes && obra.naNodes[key]) return true;
    if ((ancestors || []).some(a => obra.naNodes && obra.naNodes[a])) return true;
    return this.hasAncestorNA(part, key);
  },

  groupAccountStats(part, nodeId) {
    const accs = this.subtreeAccountIds(nodeId);
    const inCount = accs.filter(id => !this.isAccountNA(part, id)).length;
    return {
      total: accs.length,
      inCount,
      allIn: accs.length > 0 && inCount === accs.length,
      allOut: accs.length === 0 ? this.isNA(part, nodeId) : inCount === 0,
      partial: accs.length > 0 && inCount > 0 && inCount < accs.length
    };
  },

  toggleNA(key, isAccount) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.naNodes = obra.naNodes || {};
    obra.naAccounts = obra.naAccounts || {};
    obra.inAccounts = obra.inAccounts || {};
    if (isAccount) {
      if (this.isAccountNA(p, key)) {
        const parent = this.accountParentId(key);
        const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
        const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
        if (ancestorNA) obra.inAccounts[key] = true;
        delete obra.naAccounts[key];
      } else {
        const parent = this.accountParentId(key);
        const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
        const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
        if (ancestorNA) delete obra.inAccounts[key];
        else {
          obra.naAccounts[key] = true;
          delete obra.inAccounts[key];
        }
      }
    } else if (obra.naNodes[key]) {
      this.setSubtreeNA(key, false);
      return;
    } else if (this.hasAncestorNA(p, key)) {
      this.includeSubtree(key);
      return;
    } else {
      this.setSubtreeNA(key, true);
      return;
    }
    this.persist();
    this.renderKeepScroll();
  },

  setSubtreeNA(nodeId, out) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.naNodes = obra.naNodes || {};
    obra.naAccounts = obra.naAccounts || {};
    obra.inAccounts = obra.inAccounts || {};
    const accs = this.subtreeAccountIds(nodeId);
    const nodes = this.subtreeNodeIds(nodeId);
    if (out) {
      obra.naNodes[nodeId] = true;
      nodes.forEach(id => { if (id !== nodeId) delete obra.naNodes[id]; });
      accs.forEach(id => {
        delete obra.inAccounts[id];
        delete obra.naAccounts[id];
      });
    } else {
      nodes.forEach(id => delete obra.naNodes[id]);
      accs.forEach(id => {
        delete obra.inAccounts[id];
        delete obra.naAccounts[id];
      });
    }
    this.persist();
    this.renderKeepScroll();
  },

  includeSubtree(nodeId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.inAccounts = obra.inAccounts || {};
    obra.naAccounts = obra.naAccounts || {};
    this.subtreeAccountIds(nodeId).forEach(id => {
      obra.inAccounts[id] = true;
      delete obra.naAccounts[id];
    });
    this.persist();
    this.renderKeepScroll();
  },

  excludeSubtreeExceptions(nodeId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.inAccounts = obra.inAccounts || {};
    this.subtreeAccountIds(nodeId).forEach(id => delete obra.inAccounts[id]);
    this.persist();
    this.renderKeepScroll();
  },

  toggleExpand(id, scope) {
    this.closeNodeFoldMenu();
    this.expanded = this.expanded || new Set();
    const visao = this.dfcVisao();
    const groups = (visao && visao.groups) || [];
    const node = groups.find(g => String(g.id) === String(id));
    const sid = String(id);
    const nextOpen = !this.expanded.has(sid);
    const apply = (nid) => {
      if (nextOpen) this.expanded.add(String(nid));
      else this.expanded.delete(String(nid));
    };
    if (scope === "level" && node) {
      groups
        .filter(g => String(g.parentId || "") === String(node.parentId || ""))
        .forEach(g => apply(g.id));
    } else {
      apply(id);
    }
    this.renderKeepScroll();
  },

  closeNodeFoldMenu() {
    const el = document.getElementById("pp-node-fold-menu");
    if (el) el.remove();
    if (this._foldMenuCloser) {
      document.removeEventListener("click", this._foldMenuCloser);
      this._foldMenuCloser = null;
    }
  },

  openNodeFoldMenu(event, id) {
    event.preventDefault();
    event.stopPropagation();
    this.closeNodeFoldMenu();
    this.expanded = this.expanded || new Set();
    const expanded = this.expanded.has(String(id));
    const menu = document.createElement("div");
    menu.id = "pp-node-fold-menu";
    menu.style.cssText = "position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,0.12);min-width:200px;padding:6px;";
    const r = event.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + "px";
    menu.style.left = r.left + "px";
    menu.innerHTML = `
      <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${id}', 'this')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? "Recolher apenas este" : "Expandir apenas este"}</button>
      <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${id}', 'level')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? "Recolher o nível inteiro" : "Expandir o nível inteiro"}</button>
    `;
    document.body.appendChild(menu);
    this._foldMenuCloser = () => this.closeNodeFoldMenu();
    setTimeout(() => document.addEventListener("click", this._foldMenuCloser), 0);
  },

  proxyUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? `http://localhost:${port}` : "";
    let p = String(path || "");
    if (!p.startsWith("/")) p = "/" + p;
    if (p.startsWith("/sienge-proxy")) p = "/api" + p;
    return origin + p;
  },

  async init() {
    await this.loadItems();
    this.render();
    this.loadCategories();
  },

  async loadItems() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]") || []; } catch (e) { local = []; }
    this.items = Array.isArray(local) ? local : [];
    if (window.firebaseDb && window.firebaseCollections) {
      try {
        const { doc, getDoc } = window.firebaseCollections;
        const snap = await getDoc(doc(window.firebaseDb, "config", "partner_parametrizations"));
        if (snap.exists()) {
          const raw = snap.data().list;
          const cloud = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(cloud) && cloud.length) this.items = cloud;
        }
      } catch (e) {
        console.warn("[Parcerias] Firestore indisponível, usando cache local.", e);
      }
    }
    this.items.forEach(p => this.normalizeItem(p));
    let semeou = false;
    this.items.forEach(p => { if (this.aplicarSociosVercellino(p)) semeou = true; });
    this.items.forEach(p => { if (this.aplicarSociosAracari(p)) semeou = true; });
    this.items.forEach(p => { if (this.corrigirEmpresaEllenco(p)) semeou = true; });
    this.items.forEach(p => { if (this.vincularCentrosEmpresa13(p)) semeou = true; });
    if (semeou) this.persist();
    if (this.items.length && !this.selectedId) this.selectedId = this.items[0].id;
    const cur = this.current();
    if (cur && !this.selectedObraCode && cur.obras[0]) this.selectedObraCode = cur.obras[0].code;
  },

  persist() {
    this.items.forEach(p => this.normalizeItem(p));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
    if (window.firebaseDb && window.firebaseCollections) {
      const { doc, setDoc } = window.firebaseCollections;
      setDoc(doc(window.firebaseDb, "config", "partner_parametrizations"), {
        list: JSON.stringify(this.items),
        updatedAt: Date.now()
      }, { merge: true }).catch(err => console.warn("[Parcerias] Falha ao sincronizar", err));
    }
  },

  async loadCategories() {
    this.loadingCats = true;
    this.render();
    try {
      if (window.SiengeApiService && typeof SiengeApiService.getPaymentCategories === "function") {
        this.categories = await SiengeApiService.getPaymentCategories() || [];
      }
    } catch (e) {
      console.warn("[Parcerias] Plano financeiro:", e);
      this.categories = [];
    }
    this.categories.forEach(c => {
      c._id = String(c.id || "");
      c._name = c.name || c.description || c.financialCategoryName || "";
      c._type = String(c.type || c.financialCategoryType || "");
    });
    const idSet = new Set(this.categories.map(c => c._id));
    this.categories.forEach(c => {
      let depth = 0;
      for (let i = 1; i < c._id.length; i++) {
        if (idSet.has(c._id.substring(0, i))) depth++;
      }
      c._depth = depth;
      const tipo = String(c._type || "").toLowerCase();
      c._isTotal = tipo === "t" || /total|sintet/i.test(tipo);
    });
    this.categories.sort((a, b) => a._id.localeCompare(b._id, "pt-BR", { numeric: true }));
    this.loadingCats = false;
    this.render();
  },

  startNew() {
    this.selectedId = "__new__";
    this.ccSearch = "";
    this.render();
  },

  seedCostCenters(obra, companyId, ccId) {
    const siblings = this.costCentersOfObra(obra, companyId);
    const lista = siblings.slice();
    const check = this.checarCentroDaEmpresa(ccId, companyId);
    if (check.ok && !lista.some(cc => String(cc.id) === String(check.cc.id))) lista.push(check.cc);
    return lista.map(cc => ({
      id: String(cc.id),
      name: cc.name || String(cc.id),
      inAccount: true
    }));
  },

  makeObra(code, share, costCenters) {
    return {
      code: String(code || ""),
      defaultPartnerShare: Number(share) || 0,
      costCenters: costCenters || [],
      accountShares: {},
      naNodes: {},
      naAccounts: {},
      inAccounts: {}
    };
  },

  createFromForm() {
    const companyId = document.getElementById("pp-new-company").value;
    const partnerName = (document.getElementById("pp-new-partner").value || "").trim();
    const kindEl = document.querySelector('input[name="pp-new-kind"]:checked');
    const kind = kindEl && (kindEl.value === "sociedade" || kindEl.value === "mista") ? kindEl.value : "parceria";
    if (!companyId || !partnerName) {
      alert("Informe a empresa e o nome do parceiro ou sócio.");
      return;
    }
    const company = this.companies().find(c => String(c.id) === String(companyId));
    const existing = this.items.find(p =>
      String(p.companyId) === String(companyId) &&
      String(p.partnerName || "").trim().toLowerCase() === partnerName.toLowerCase()
    );
    if (existing) {
      this.normalizeItem(existing);
      existing.kind = kind;
      this.selectedId = existing.id;
      this.selectedObraCode = (existing.obras[0] && existing.obras[0].code) || "";
      this.persist();
      this.render();
      return;
    }
    const item = {
      id: "par_" + Date.now(),
      companyId: String(companyId),
      companyName: company ? company.name : `Empresa ${companyId}`,
      partnerName,
      kind,
      obras: [],
      creditor: { id: "", name: "", cpfCnpj: "", sharePct: "" },
      createdAt: new Date().toISOString()
    };
    this.normalizeItem(item);
    this.items.push(item);
    this.selectedId = item.id;
    this.selectedObraCode = "";
    this.persist();
    this.render();
  },

  addObraFromForm() {
    const p = this.current();
    if (!p) return;
    const ccId = this.digitosCentro(document.getElementById("pp-add-obra-cc") && document.getElementById("pp-add-obra-cc").value);
    const shareEl = document.getElementById("pp-add-obra-share");
    const doCentro = this.isSociedade(p) ? null : this.rateioParceiroDoCc(ccId);
    const share = this.isSociedade(p) ? 0 : (doCentro != null ? doCentro : Number((shareEl || {}).value));
    if (ccId.length !== 5) {
      alert("Informe o centro de custo com 5 números.");
      return;
    }
    if (!this.isSociedade(p) && (!Number.isFinite(share) || share < 0 || share > 100)) {
      alert("O rateio da obra deve estar entre 0 e 100%.");
      return;
    }
    const permitido = this.checarCentroDaEmpresa(ccId, p.companyId);
    if (!permitido.ok) {
      alert(permitido.msg);
      return;
    }
    const obra = this.obraFromCc(ccId);
    if (p.obras.some(o => String(o.code) === String(obra))) {
      alert(`A obra ${obra} já está nesta parceria.`);
      this.selectedObraCode = obra;
      this.render();
      return;
    }
    const seed = this.seedCostCenters(obra, p.companyId, ccId);
    p.obras.push(this.makeObra(obra, share, seed));
    this.selectedObraCode = obra;
    this.detailTab = "centros";
    this.persist();
    this.render();
  },

  copiarLigacoes(src, dest) {
    dest.naNodes = JSON.parse(JSON.stringify(src.naNodes || {}));
    dest.naAccounts = JSON.parse(JSON.stringify(src.naAccounts || {}));
    dest.inAccounts = JSON.parse(JSON.stringify(src.inAccounts || {}));
    dest.accountShares = {};
  },

  /** Obras de outros parceiros, para copiar o perfil de contas ligadas e desligadas. */
  fontesRateio() {
    const atual = this.current();
    const out = [];
    (this.items || []).forEach((raw) => {
      const p = this.normalizeItem(raw);
      if (!p || this.isSociedade(p) || (atual && p.id === atual.id)) return;
      (p.obras || []).forEach((o) => {
        if (!o || o.code == null || o.code === "") return;
        out.push({ id: p.id, code: String(o.code), nome: p.partnerName || "Parceiro", obra: o });
      });
    });
    return out.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR") || String(a.code).localeCompare(String(b.code), "pt-BR", { numeric: true }));
  },

  importarRateio() {
    const p = this.current();
    const dest = this.currentObra(p);
    const sel = document.getElementById("pp-import-rateio");
    const valor = sel ? String(sel.value || "") : "";
    if (!p || !dest) return;
    if (!valor) {
      alert("Escolha a obra de outro parceiro para importar o rateio.");
      return;
    }
    const sep = valor.indexOf("|");
    const id = valor.slice(0, sep);
    const code = valor.slice(sep + 1);
    const fonte = this.fontesRateio().find((f) => f.id === id && f.code === code);
    if (!fonte || !fonte.obra) {
      alert("Não encontrei essa obra para importar.");
      return;
    }
    const msg = `Importar o que está ligado e desligado da obra ${fonte.code} de ${fonte.nome} para a obra ${dest.code}?\n\nO percentual desta obra continua o da aba Obras.`;
    const ok = typeof window.mouraConfirm === "function" ? window.mouraConfirm(msg) : Promise.resolve(confirm(msg));
    Promise.resolve(ok).then((sim) => {
      if (!sim) return;
      this.copiarLigacoes(fonte.obra, dest);
      this.persist();
      this.render();
    });
  },

  importarRateioHtml() {
    const fontes = this.fontesRateio();
    if (!fontes.length) return "";
    const opts = fontes.map((f) => `<option value="${this.esc(f.id)}|${this.esc(f.code)}">${this.esc(f.nome)} · obra ${this.esc(f.code)}</option>`).join("");
    return `<select id="pp-import-rateio" class="form-control" style="height:36px;max-width:320px;font-size:0.78rem;border-radius:8px;" title="Escolha a obra de outro parceiro. O botão ao lado copia para esta obra o que está ligado ou desligado lá. O percentual desta obra não muda.">
      <option value="">Importar de outro parceiro</option>${opts}
    </select>
    <button type="button" class="btn btn-outline" onclick="ParametrizacaoParceiroApp.importarRateio()" title="Copia para esta obra o que está ligado ou desligado na obra escolhida ao lado. O percentual desta obra continua o da aba Obras." style="height:36px;font-size:0.78rem;white-space:nowrap;">Importar rateio</button>`;
  },

  /** Copia só grupos e contas ligados ou desligados. O percentual de cada obra fica o da aba Obras. */
  replicarLigacoes() {
    const p = this.current();
    const src = this.currentObra(p);
    if (!p || !src) return;
    const destinos = (p.obras || []).filter(o => String(o.code) !== String(src.code));
    if (!destinos.length) {
      alert("Não há outra obra deste parceiro para receber a configuração.");
      return;
    }
    const lista = destinos.map(o => `obra ${o.code} (${o.defaultPartnerShare}%)`).join(", ");
    const msg = `Replicar o que está ligado e desligado da obra ${src.code} para ${lista}?\n\nO percentual de cada obra continua o que está na aba Obras.`;
    const ok = typeof window.mouraConfirm === "function" ? window.mouraConfirm(msg) : Promise.resolve(confirm(msg));
    Promise.resolve(ok).then((sim) => {
      if (!sim) return;
      destinos.forEach((dest) => this.copiarLigacoes(src, dest));
      this.persist();
      this.render();
    });
  },

  removeObra(code) {
    const p = this.current();
    if (!p) return;
    if (p.obras.length <= 1) {
      alert("A parceria precisa de ao menos uma obra. Exclua a parceria se quiser remover tudo.");
      return;
    }
    if (!confirm(`Remover a obra ${code} desta parceria?`)) return;
    p.obras = p.obras.filter(o => String(o.code) !== String(code));
    this.selectedObraCode = p.obras[0].code;
    this.persist();
    this.render();
  },

  select(id) {
    this.selectedId = id;
    this.ccSearch = "";
    const p = this.current();
    this.selectedObraCode = p && p.obras[0] ? p.obras[0].code : "";
    this.creditorQuery = "";
    this.creditorHits = [];
    this.detailTab = "geral";
    this.socioAberto = "";
    this.render();
  },

  toggleSocio(id) {
    const sid = String(id || "");
    this.socioAberto = this.socioAberto === sid ? "" : sid;
    this.fecharVinculo();
    this.renderKeepScroll();
  },

  updateField(field, value) {
    const p = this.current();
    if (!p) return;
    if (field === "partnerName") p.partnerName = value;
    if (field === "kind") p.kind = value === "sociedade" || value === "mista" ? value : "parceria";
    this.persist();
    this.render();
  },

  updateCompany(companyId) {
    const p = this.current();
    if (!p) return;
    const id = String(companyId || "");
    if (!id || id === String(p.companyId)) return;
    const company = this.companies().find(c => String(c.id) === id)
      || this.empresasEditaveis(p).find(c => String(c.id) === id);
    if (!company) {
      this.render();
      return;
    }
    const nome = String(p.partnerName || "").trim().toLowerCase();
    const dup = this.items.find(x =>
      x !== p &&
      String(x.companyId) === id &&
      String(x.partnerName || "").trim().toLowerCase() === nome
    );
    if (dup) {
      alert("Esta empresa já tem uma prestação de contas com o mesmo parceiro.");
      this.render();
      return;
    }
    p.companyId = id;
    p.companyName = company.name || company.tradeName || ("Empresa " + id);
    this.persist();
    this.render();
  },

  updateObraShare(value) {
    const obra = this.currentObra();
    if (!obra || this.percentualTravado(obra) != null) return;
    const n = Number(value);
    obra.defaultPartnerShare = Number.isFinite(n) ? n : 0;
    this.persist();
    this.renderListOnly();
    const p = this.current();
    document.querySelectorAll("[data-pp-placeholder]").forEach(el => {
      el.setAttribute("placeholder", String(obra.defaultPartnerShare));
    });
    if (p) this.render();
  },

  clearCreditor() {
    const p = this.current();
    if (!p) return;
    p.creditor = { id: "", name: "", cpfCnpj: "", paymentDay: "", paymentDayMode: "monthDay", paymentBusinessDays: "", bankInfo: null, bankList: [] };
    this.creditorQuery = "";
    this.creditorHits = [];
    this.persist();
    this.render();
  },

  setSocioPct(id, value) {
    const p = this.current();
    if (!p) return;
    const row = (p.socios || []).find(s => String(s.id) === String(id));
    if (!row) return;
    const raw = String(value == null ? "" : value).trim().replace(",", ".");
    if (raw === "") row.sharePct = "";
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      row.sharePct = Math.max(0, Math.min(100, n));
    }
    this.persist();
    this.renderKeepScroll();
  },

  centrosDaEmpresa(companyId) {
    const emp = String(companyId || "");
    return this.centrosOrdenados([...this.catalogoCentros().values()].filter((cc) => this.empresaDoCentro(cc) === emp));
  },

  codigoConta(c) {
    return String((c && (c._id || c.id)) || "").replace(/\./g, "").trim();
  },

  /* R / resultado / analítica. T, totalizadora e sintética ficam de fora. Sem tipo, vale a conta que não agrupa outra. */
  ehContaResultado(c) {
    const t = String((c && (c._type || c.tpConta || c.type || c.financialCategoryType)) || "").toLowerCase();
    if (t === "t" || t.includes("total") || t.includes("sintet")) return false;
    if (t === "r" || t.includes("result") || t.includes("analit")) return true;
    return !t;
  },

  planosSaida() {
    const cats = (this.categories || []).filter((c) => this.codigoConta(c));
    const ids = cats.map((c) => this.codigoConta(c));
    return cats.filter((c) => {
      const id = this.codigoConta(c);
      if (!id.startsWith("2")) return false;
      if (!this.ehContaResultado(c)) return false;
      const t = String(c._type || c.tpConta || c.type || c.financialCategoryType || "").trim();
      if (t) return true;
      return !ids.some((outro) => outro !== id && outro.startsWith(id));
    });
  },

  documentosTitulo() {
    const app = window.DocumentosSiengeApp;
    const lista = (app && app.items) || [];
    return lista.filter((d) => d && d.id && d.ativo !== false && d.pagamento !== false);
  },

  async garantirDocumentos() {
    const app = window.DocumentosSiengeApp;
    if (!app || typeof app.garantirLista !== "function" || this._docsPedido) return;
    if ((app.items || []).length) return;
    this._docsPedido = true;
    try {
      await app.garantirLista();
    } catch (e) {}
    this._docsPedido = false;
    if (this.detailTab === "credor" && document.getElementById("parametrizacao-parceiro-root")) this.renderKeepScroll();
  },

  setSocioVinculo(id, campo, valor) {
    const p = this.current();
    if (!p) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    const v = String(valor || "");
    if (campo === "cc") {
      if (!v) {
        row.ccTitulo = "";
        row.ccTituloNome = "";
      } else {
        const cc = this.centrosDaEmpresa(p.companyId).find((c) => String(c.id) === v);
        const conhecido = this.CENTROS_SOCIOS_13[String(row.id)];
        if (cc) {
          row.ccTitulo = String(cc.id);
          row.ccTituloNome = String(cc.name || cc.nome || "");
        } else if (conhecido && conhecido[0] === v) {
          row.ccTitulo = conhecido[0];
          row.ccTituloNome = conhecido[1];
        } else if (String(row.ccTitulo) === v) {
          /* o nome já está no sócio */
        } else {
          this.renderKeepScroll();
          return;
        }
      }
    } else if (campo === "plano") {
      if (!v) {
        row.planoId = "";
        row.planoNome = "";
      } else {
        const cat = this.planosSaida().find((c) => String(c._id) === v);
        if (!cat) {
          this.renderKeepScroll();
          return;
        }
        row.planoId = String(cat._id);
        row.planoNome = String(cat._name || "");
      }
      const pct0 = row.planos && row.planos[0] ? row.planos[0].pct : "";
      row.planos = [{ id: row.planoId, nome: row.planoNome, pct: pct0 }];
    } else if (campo === "doc") {
      if (!v) {
        row.docTipo = "";
        row.docNome = "";
      } else {
        const d = this.documentosTitulo().find((x) => String(x.id) === v);
        if (!d) {
          this.renderKeepScroll();
          return;
        }
        row.docTipo = String(d.id);
        row.docNome = String(d.nome || d.id);
      }
    } else return;
    this.persist();
    this.renderKeepScroll();
  },

  /* Cada centro do parceiro (13301, 13401) paga no centro da obra (13300, 13400). A conta é a do próprio 13301 ou 13401. */
  paresRepasse(p) {
    const pares = [];
    const vistos = new Set();
    this.obrasOf(p).forEach((o) => {
      const prefix = String(o.code || "").replace(/\D/g, "");
      if (!prefix) return;
      const lista = this.centrosDaObra(prefix).filter((cc) => !p.companyId || this.empresaDoCentro(cc) === String(p.companyId));
      const base = lista.find((cc) => String(cc.id).replace(/\D/g, "") === prefix + "00" && !this.ehCcParceiro(cc))
        || { id: prefix + "00", name: "" };
      lista.forEach((cc) => {
        const id = String(cc.id).replace(/\D/g, "");
        if (!id || id === prefix + "00" || vistos.has(id)) return;
        const conta = this.customCc(cc.id).conta_parceria;
        const temConta = !!(conta && (conta.id || conta.numero));
        if (!this.ehCcParceiro(cc) && !/01$/.test(id) && !temConta) return;
        vistos.add(id);
        pares.push({ base: base, parc: cc });
      });
    });
    return pares;
  },

  textoRepasse(p) {
    const pares = this.paresRepasse(p);
    const regra = "Na parceria o centro de custo não é informado no credor. ";
    if (!pares.length) {
      return regra + "A variação do centro do parceiro é paga no centro da obra, na conta cadastrada nesse centro do parceiro: 13301 no 13300, 13401 no 13400.";
    }
    return regra + pares.map((x) => {
      const de = x.parc ? String(x.parc.id) : "";
      const para = x.base ? String(x.base.id) : "";
      return "A variação do " + de + " é paga no " + para + ", na conta cadastrada no " + de;
    }).join(". ") + ".";
  },

  fecharVinculo() {
    this.vinculoUi = { socioId: String(this.socioAberto || ""), ccOpen: false, ccQuery: "", planoOpen: false, planoQuery: "", docOpen: false, docQuery: "", planos: {} };
  },

  uiPlano(idx) {
    const ui = this.uiVinculo();
    ui.planos = ui.planos || {};
    const chave = String(idx);
    if (!ui.planos[chave]) ui.planos[chave] = { open: false, query: "" };
    return ui.planos[chave];
  },

  fecharPlanosUi() {
    const ui = this.uiVinculo();
    ui.ccOpen = false;
    ui.ccQuery = "";
    ui.planoOpen = false;
    ui.planoQuery = "";
    ui.docOpen = false;
    ui.docQuery = "";
    ui.planos = {};
  },

  adicionarPlanoSocio(id) {
    const p = this.current();
    if (!p || !this.isSociedade(p)) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    row.planos = this.normalizarPlanos(row);
    row.planos.push({ id: "", nome: "", pct: "" });
    this.sincronizarPlanoPrincipal(row);
    this.persist();
    this.renderKeepScroll();
  },

  removerPlanoSocio(id, idx) {
    const p = this.current();
    if (!p || !this.isSociedade(p)) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    const planos = this.normalizarPlanos(row);
    const i = Number(idx);
    if (planos.length < 2 || !planos[i]) return;
    planos.splice(i, 1);
    row.planos = planos;
    this.sincronizarPlanoPrincipal(row);
    this.fecharPlanosUi();
    this.persist();
    this.renderKeepScroll();
  },

  setPlanoPct(id, idx, value) {
    const p = this.current();
    if (!p || !this.isSociedade(p)) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    const planos = this.normalizarPlanos(row);
    const i = Number(idx);
    if (!planos[i]) return;
    const raw = String(value == null ? "" : value).trim().replace(",", ".");
    if (raw === "") planos[i].pct = "";
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      planos[i].pct = Math.max(0, Math.min(100, n));
    }
    row.planos = planos;
    this.sincronizarPlanoPrincipal(row);
    this.persist();
    this.renderKeepScroll();
  },

  setPlanoSocio(id, idx, valor) {
    const p = this.current();
    if (!p || !this.isSociedade(p)) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    const planos = this.normalizarPlanos(row);
    const i = Number(idx);
    if (!planos[i]) return;
    const v = String(valor || "");
    if (!v) {
      planos[i].id = "";
      planos[i].nome = "";
    } else {
      const cat = this.planosSaida().find((c) => String(c._id) === v);
      if (!cat) {
        this.renderKeepScroll();
        return;
      }
      if (planos.some((pl, j) => j !== i && pl.id === String(cat._id))) {
        this.renderKeepScroll();
        return;
      }
      planos[i].id = String(cat._id);
      planos[i].nome = String(cat._name || "");
    }
    row.planos = planos;
    this.sincronizarPlanoPrincipal(row);
    this.persist();
    this.renderKeepScroll();
  },

  uiVinculo() {
    const sid = String(this.socioAberto || "");
    if (!this.vinculoUi || this.vinculoUi.socioId !== sid) this.fecharVinculo();
    return this.vinculoUi;
  },

  itensPlano(s, plano, ocupados) {
    const items = this.planosSaida().map((c) => ({ id: String(c._id), name: String(c._name || "") }));
    const id = String((plano && plano.id) || (s && s.planoId) || "");
    const nome = String((plano && plano.nome) || (s && s.planoNome) || "");
    if (id && !items.some((i) => i.id === id)) items.push({ id, name: nome });
    const usados = ocupados || new Set();
    return items.filter((i) => i.id === id || !usados.has(i.id));
  },

  itensDocumento(s) {
    const items = this.documentosTitulo().map((d) => ({
      id: String(d.id),
      name: d.nome && String(d.nome) !== String(d.id) ? String(d.nome) : ""
    }));
    const id = String((s && s.docTipo) || "");
    if (id && !items.some((i) => i.id === id)) items.push({ id, name: String((s && s.docNome) || "") });
    return items;
  },

  opcoesVinculo(campo, s) {
    const ui = this.uiVinculo();
    const plano = campo === "plano";
    return {
      id: plano ? "pp-vinculo-plano" : "pp-vinculo-doc",
      label: plano ? "Plano financeiro" : "Tipo de documento",
      items: plano ? this.itensPlano(s) : this.itensDocumento(s),
      selectedIds: plano ? (s && s.planoId ? [String(s.planoId)] : []) : (s && s.docTipo ? [String(s.docTipo)] : []),
      open: plano ? !!ui.planoOpen : !!ui.docOpen,
      query: plano ? (ui.planoQuery || "") : (ui.docQuery || ""),
      single: true,
      emptyMeansAll: false,
      emptyLabel: plano ? "Escolha a conta" : "Escolha o documento",
      extraClass: "pp-vinculo-filtro",
      nouns: plano ? {
        singular: "conta",
        plural: "contas",
        none: this.loadingCats ? "Carregando o plano financeiro…" : "Nenhuma conta de resultado de saída",
        noMatch: "Nenhuma conta com esse nome."
      } : {
        singular: "documento",
        plural: "documentos",
        none: "Nenhum tipo de documento",
        noMatch: "Nenhum documento com esse nome."
      }
    };
  },

  itensCentro(p, s) {
    const items = this.centrosDaEmpresa(p && p.companyId).map((c) => ({
      id: String(c.id),
      name: String(c.name || c.nome || "")
    }));
    const id = String((s && s.ccTitulo) || "");
    if (id && !items.some((i) => i.id === id)) items.unshift({ id, name: String((s && s.ccTituloNome) || "") });
    return items;
  },

  opcoesCentro(p, s) {
    const ui = this.uiVinculo();
    return {
      id: "pp-vinculo-cc",
      label: "Centro de custo",
      items: this.itensCentro(p, s),
      selectedIds: s && s.ccTitulo ? [String(s.ccTitulo)] : [],
      open: !!ui.ccOpen,
      query: ui.ccQuery || "",
      single: true,
      emptyMeansAll: false,
      emptyLabel: "Escolha o centro de custo",
      extraClass: "pp-vinculo-filtro",
      nouns: {
        singular: "centro de custo",
        plural: "centros de custo",
        none: "Nenhum centro de custo desta empresa",
        noMatch: "Nenhum centro com esse nome."
      }
    };
  },

  opcoesPlanoSocio(s, idx) {
    const planos = this.normalizarPlanos(s);
    const plano = planos[idx] || { id: "", nome: "", pct: "" };
    const ui = this.uiPlano(idx);
    const ocupados = new Set(planos.map((pl, i) => i === idx ? "" : pl.id).filter(Boolean));
    return {
      id: "pp-vinculo-plano-" + idx,
      label: "Plano financeiro",
      items: this.itensPlano(s, plano, ocupados),
      selectedIds: plano.id ? [String(plano.id)] : [],
      open: !!ui.open,
      query: ui.query || "",
      single: true,
      emptyMeansAll: false,
      emptyLabel: "Escolha a conta",
      extraClass: "pp-vinculo-filtro",
      nouns: {
        singular: "conta",
        plural: "contas",
        none: this.loadingCats ? "Carregando o plano financeiro…" : "Nenhuma conta de resultado de saída",
        noMatch: "Nenhuma conta com esse nome."
      }
    };
  },

  textoTituloPlano(s, plano) {
    const parte = Number(s && s.sharePct);
    const socioPct = Number.isFinite(parte) ? parte : 0;
    if (!(socioPct > 0)) return "Informe a participação do sócio. O percentual do plano vale sobre ela.";
    const planos = this.normalizarPlanos(s).filter((pl) => pl.id);
    const informado = planos.some((pl) => pl.pct !== "" && pl.pct != null);
    const unico = planos.length <= 1;
    if (!unico && !informado) return "Informe o percentual de cada plano sobre os " + this.fmtPctCurto(socioPct) + "% do sócio.";
    if (informado && (plano.pct === "" || plano.pct == null)) return "Informe o percentual deste plano sobre os " + this.fmtPctCurto(socioPct) + "% do sócio.";
    const pctPlano = plano && plano.pct !== "" && plano.pct != null ? Number(plano.pct) : 100;
    const efetivo = Math.round(socioPct * pctPlano / 100 * 1000) / 1000;
    return this.fmtPctCurto(pctPlano) + "% de " + this.fmtPctCurto(socioPct) + "% = " + this.fmtPctCurto(efetivo) + "% do negócio.";
  },

  planosSocioHtml(p, s) {
    const F = window.MlEmpresaFilter;
    const planos = this.normalizarPlanos(s);
    const soma = planos.reduce((n, pl) => n + (Number(pl.pct) || 0), 0);
    const informado = planos.some((pl) => pl.pct !== "" && pl.pct != null);
    const resto = Math.round((100 - soma) * 1000) / 1000;
    const fecha = informado && Math.abs(resto) < 0.001;
    const avisoSoma = !informado ? "" : (fecha
      ? "Os planos fecham 100% da participação deste sócio."
      : "Os planos somam " + this.fmtPctCurto(soma) + "%. Falta " + this.fmtPctCurto(Math.max(resto, 0)) + "% para fechar a participação.");
    const linhas = planos.map((pl, idx) => {
      const filtro = F ? F.html(this.opcoesPlanoSocio(s, idx)) : "";
      const tirar = planos.length > 1
        ? `<button type="button" onclick="ParametrizacaoParceiroApp.removerPlanoSocio('${this.esc(s.id)}', ${idx})" style="height:36px;border:none;background:transparent;color:#dc2626;cursor:pointer;font-size:0.75rem;font-weight:700;">Tirar</button>`
        : "";
      return `<div class="pp-plano">
        <div class="pp-plano-linha">
          <div id="pp-vinculo-plano-${idx}-slot" class="pp-vinculo-slot">${filtro}</div>
          <label style="display:flex;flex-direction:column;gap:4px;width:110px;font-size:0.68rem;font-weight:700;color:#475569;text-transform:uppercase;">% do plano
            <input type="number" min="0" max="100" step="0.001" value="${pl.pct === "" ? "" : pl.pct}"
              onchange="ParametrizacaoParceiroApp.setPlanoPct('${this.esc(s.id)}', ${idx}, this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;font-weight:800;background:#fff;text-transform:none;">
          </label>
          ${tirar}
        </div>
        <p class="pp-plano-efeito">${this.esc(this.textoTituloPlano(s, pl))}</p>
      </div>`;
    }).join("");
    return `<div>
      ${linhas}
      <button type="button" onclick="ParametrizacaoParceiroApp.adicionarPlanoSocio('${this.esc(s.id)}')" style="margin-top:8px;height:32px;border:1px solid #105436;background:#fff;color:#105436;border-radius:6px;padding:0 12px;font-size:0.75rem;font-weight:800;cursor:pointer;">Adicionar plano</button>
      ${avisoSoma ? `<p style="margin:6px 0 0;font-size:0.75rem;color:${fecha ? "#047857" : "#b45309"};">${this.esc(avisoSoma)}</p>` : ""}
    </div>`;
  },

  vinculoTituloHtml(p, s) {
    const F = window.MlEmpresaFilter;
    const sociedade = this.isSociedade(p);
    const comCentro = sociedade || this.isMista(p);
    const plano = !sociedade && F ? F.html(this.opcoesVinculo("plano", s)) : "";
    const doc = F ? F.html(this.opcoesVinculo("doc", s)) : "";
    const avisoPlano = this.loadingCats ? "Carregando o plano financeiro…" : (this.planosSaida().length ? "" : "Nenhuma conta de resultado de saída carregada.");
    const avisoDoc = this.documentosTitulo().length ? "" : "Os tipos de documento ainda não carregaram.";
    const centro = comCentro && F ? F.html(this.opcoesCentro(p, s)) : "";
    return `<div>
      ${comCentro ? `<div class="pp-vinculo-filtros" style="margin-bottom:10px;"><div id="pp-vinculo-cc-slot" class="pp-vinculo-slot">${centro}</div></div>` : ""}
      ${sociedade ? this.planosSocioHtml(p, s) : `<div class="pp-vinculo-filtros"><div id="pp-vinculo-plano-slot" class="pp-vinculo-slot">${plano}</div></div>`}
      <div class="pp-vinculo-filtros" style="margin-top:10px;">
        <div id="pp-vinculo-doc-slot" class="pp-vinculo-slot">${doc}</div>
      </div>
      ${avisoPlano || avisoDoc ? `<p style="margin:8px 0 0;font-size:0.75rem;color:#b45309;">${this.esc([avisoPlano, avisoDoc].filter(Boolean).join(" "))}</p>` : ""}
    </div>`;
  },

  socioVinculoAberto() {
    const p = this.current();
    if (!p) return null;
    return (p.socios || []).find((x) => String(x.id) === String(this.socioAberto)) || null;
  },

  pintarVinculo(campo, idx) {
    const s = this.socioVinculoAberto();
    const slotId = campo === "cc" ? "pp-vinculo-cc-slot"
      : (campo === "plano"
        ? (idx == null ? "pp-vinculo-plano-slot" : "pp-vinculo-plano-" + idx + "-slot")
        : "pp-vinculo-doc-slot");
    const slot = document.getElementById(slotId);
    if (!slot || !s || !window.MlEmpresaFilter) return;
    const p = this.current();
    const opts = campo === "cc" ? this.opcoesCentro(p, s)
      : (campo === "plano" && idx != null ? this.opcoesPlanoSocio(s, idx) : this.opcoesVinculo(campo, s));
    slot.innerHTML = MlEmpresaFilter.html(opts);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  pintarVinculoLista(campo, idx) {
    const s = this.socioVinculoAberto();
    const id = campo === "cc" ? "pp-vinculo-cc"
      : (campo === "plano" ? (idx == null ? "pp-vinculo-plano" : "pp-vinculo-plano-" + idx) : "pp-vinculo-doc");
    const el = document.getElementById(id + "-list");
    if (!el || !s || !window.MlEmpresaFilter) return;
    const p = this.current();
    const opts = campo === "cc" ? this.opcoesCentro(p, s)
      : (campo === "plano" && idx != null ? this.opcoesPlanoSocio(s, idx) : this.opcoesVinculo(campo, s));
    el.innerHTML = MlEmpresaFilter.listHtml(opts);
  },

  pintarPlanosSocio() {
    const s = this.socioVinculoAberto();
    const p = this.current();
    if (!s || !p || !this.isSociedade(p)) {
      this.pintarVinculo("plano");
      return;
    }
    this.normalizarPlanos(s).forEach((_, idx) => this.pintarVinculo("plano", idx));
  },

  bindVinculoFiltros() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const s = this.socioVinculoAberto();
    const p = this.current();
    const varios = !!(s && p && this.isSociedade(p));
    const comCentro = !!(s && p && (this.isSociedade(p) || this.isMista(p)));
    const campos = varios
      ? [{ campo: "cc", idx: null }].concat(this.normalizarPlanos(s).map((_, idx) => ({ campo: "plano", idx })))
      : [{ campo: "plano", idx: null }];
    if (comCentro && !varios) campos.unshift({ campo: "cc", idx: null });
    campos.push({ campo: "doc", idx: null });
    campos.forEach(({ campo, idx }) => {
      const id = campo === "cc" ? "pp-vinculo-cc"
        : (campo === "plano" ? (idx == null ? "pp-vinculo-plano" : "pp-vinculo-plano-" + idx) : "pp-vinculo-doc");
      if (!document.getElementById(id)) return;
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          const ui = self.uiVinculo();
          const abertoAntes = campo === "cc" ? !!ui.ccOpen : (campo === "doc" ? !!ui.docOpen : (idx == null ? !!ui.planoOpen : !!self.uiPlano(idx).open));
          self.fecharPlanosUi();
          const aberto = !abertoAntes;
          if (campo === "cc") ui.ccOpen = aberto;
          else if (campo === "doc") ui.docOpen = aberto;
          else if (idx == null) ui.planoOpen = aberto;
          else self.uiPlano(idx).open = aberto;
          if (document.getElementById("pp-vinculo-cc-slot")) self.pintarVinculo("cc");
          self.pintarPlanosSocio();
          self.pintarVinculo("doc");
          if (aberto) {
            const q = document.getElementById(id + "-search");
            if (q && q.focus) q.focus();
          }
        },
        close() {
          const ui = self.uiVinculo();
          if (campo === "cc") {
            if (!ui.ccOpen) return;
            ui.ccOpen = false;
            self.pintarVinculo("cc");
            return;
          }
          if (campo === "doc") {
            if (!ui.docOpen) return;
            ui.docOpen = false;
            self.pintarVinculo("doc");
            return;
          }
          if (idx == null) {
            if (!ui.planoOpen) return;
            ui.planoOpen = false;
            self.pintarVinculo("plano");
            return;
          }
          const estado = self.uiPlano(idx);
          if (!estado.open) return;
          estado.open = false;
          self.pintarVinculo("plano", idx);
        },
        setQuery(q) {
          if (campo === "cc") {
            self.uiVinculo().ccQuery = q || "";
            self.pintarVinculoLista("cc");
            return;
          }
          if (campo === "doc") {
            self.uiVinculo().docQuery = q || "";
            self.pintarVinculoLista("doc");
            return;
          }
          if (idx == null) self.uiVinculo().planoQuery = q || "";
          else self.uiPlano(idx).query = q || "";
          self.pintarVinculoLista("plano", idx);
        },
        toggleId(itemId, on) {
          if (!on) return;
          self.fecharPlanosUi();
          if (campo === "plano" && idx != null) self.setPlanoSocio(self.socioAberto, idx, String(itemId || ""));
          else self.setSocioVinculo(self.socioAberto, campo, String(itemId || ""));
        }
      });
    });
  },

  async removeSocio(id) {
    const p = this.current();
    if (!p) return;
    const row = (p.socios || []).find(s => String(s.id) === String(id));
    if (!row) return;
    const msg = "Remover " + (row.name || "este sócio") + " da sociedade?";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    p.socios = (p.socios || []).filter(s => String(s.id) !== String(id));
    this.persist();
    this.render();
  },

  pickCreditorByIndex(i) {
    const c = this.creditorHits[Number(i)];
    if (!c) return;
    this.pickCreditor(c.id, c.name, c.cpfCnpj);
  },

  pickCreditor(id, name, doc) {
    const p = this.current();
    if (!p) return;
    if (this.variosCredores(p)) {
      if ((p.socios || []).some(s => String(s.id) === String(id))) {
        alert("Este " + this.rotuloCredor(p) + " já está na lista.");
        return;
      }
      p.socios = p.socios || [];
      const papel = this.isMista(p) && this.credorPapel === "terrenista" ? "terrenista" : (this.isMista(p) ? "empreendedor" : "");
      p.socios.push(this.blankSocio({ id, name, cpfCnpj: doc, sharePct: "", papel }));
      this.vincularCentrosEmpresa13(p);
      this.socioAberto = String(id);
      this.creditorQuery = "";
      this.creditorHits = [];
      this.persist();
      this.render();
      this.ensureSociosBanks();
      return;
    }
    const prev = p.creditor || {};
    p.creditor = {
      id: String(id || ""),
      name: String(name || ""),
      cpfCnpj: String(doc || ""),
      paymentDay: prev.paymentDay == null ? "" : prev.paymentDay,
      paymentDayMode: prev.paymentDayMode === "businessDays" ? "businessDays" : "monthDay",
      paymentBusinessDays: prev.paymentBusinessDays == null ? "" : prev.paymentBusinessDays,
      bankInfo: null,
      bankList: [],
      bankLoaded: false
    };
    this.creditorQuery = "";
    this.creditorHits = [];
    this.persist();
    this.render();
    this.ensureCreditorBank();
  },

  PAY_MIN_DAY: 8,

  easterGregorian(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { year, month, day };
  },

  holidayKey(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  },

  holidaySet(year) {
    const set = new Set([
      this.holidayKey(year, 1, 1),
      this.holidayKey(year, 4, 21),
      this.holidayKey(year, 5, 1),
      this.holidayKey(year, 9, 7),
      this.holidayKey(year, 10, 12),
      this.holidayKey(year, 11, 2),
      this.holidayKey(year, 11, 15),
      this.holidayKey(year, 11, 20),
      this.holidayKey(year, 12, 25)
    ]);
    const easter = this.easterGregorian(year);
    const add = (delta) => {
      const utc = Date.UTC(easter.year, easter.month - 1, easter.day + delta);
      const dt = new Date(utc);
      return this.holidayKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    };
    set.add(add(-48));
    set.add(add(-47));
    set.add(add(-2));
    set.add(add(60));
    return set;
  },

  isBusinessDayLocal(date) {
    const wd = date.getDay();
    if (wd === 0 || wd === 6) return false;
    const y = date.getFullYear();
    const key = this.holidayKey(y, date.getMonth() + 1, date.getDate());
    return !this.holidaySet(y).has(key) && !this.holidaySet(y - 1).has(key);
  },

  monthClosingDate(ref) {
    const d = ref ? new Date(ref) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 0);
  },

  addBusinessDaysAfter(startDate, n) {
    const count = Number(n) || 0;
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (count <= 0) return d;
    let added = 0;
    let guard = 0;
    while (added < count && guard < 400) {
      d.setDate(d.getDate() + 1);
      if (this.isBusinessDayLocal(d)) added++;
      guard++;
    }
    return d;
  },

  previewBusinessPay(n) {
    const close = this.monthClosingDate();
    const due = this.addBusinessDaysAfter(close, n);
    return { close, due, day: due.getDate() };
  },

  fmtDateBR(d) {
    const pad = x => String(x).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  },

  updatePaymentDayMode(mode) {
    const p = this.current();
    if (!p) return;
    p.creditor = p.creditor || {};
    p.creditor.paymentDayMode = mode === "businessDays" ? "businessDays" : "monthDay";
    this.persist();
    this.render();
  },

  updatePaymentDay(value) {
    const p = this.current();
    if (!p) return;
    p.creditor = p.creditor || {};
    const n = parseInt(String(value).trim(), 10);
    const minDia = this.isMista(p) ? 1 : this.PAY_MIN_DAY;
    if (!Number.isFinite(n)) {
      p.creditor.paymentDay = "";
    } else if (n < minDia) {
      p.creditor.paymentDay = minDia;
    } else if (n > 31) {
      p.creditor.paymentDay = 31;
    } else {
      p.creditor.paymentDay = n;
    }
    this.persist();
    this.render();
  },

  updatePaymentBusinessDays(value) {
    const p = this.current();
    if (!p) return;
    p.creditor = p.creditor || {};
    const n = parseInt(String(value).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      p.creditor.paymentBusinessDays = "";
      this.persist();
      this.render();
      return;
    }
    const prev = this.previewBusinessPay(n);
    p.creditor.paymentBusinessDays = n;
    if (prev.day < this.PAY_MIN_DAY) {
      p.creditor.paymentDayHint = `Cairia no dia ${prev.day} (${this.fmtDateBR(prev.due)}). O mínimo é dia ${this.PAY_MIN_DAY}. Aumente os dias úteis.`;
    } else {
      p.creditor.paymentDayHint = "";
    }
    this.persist();
    this.render();
  },

  isDefaultBank(b) {
    const f = b && b.defaultFlag;
    return f === true || f === "S" || f === "s" || f === "Y" || f === "1" || f === 1;
  },

  accountTypeLabel(t) {
    const s = String(t || "").toUpperCase();
    if (t && typeof t === "object") return t.description || t.name || t.id || "";
    if (s === "C" || s === "CHECKING") return "Conta corrente";
    if (s === "P" || s === "SAVING" || s === "SAVINGS") return "Poupança";
    if (s === "I" || s === "INVESTMENT") return "Investimento";
    return t || "—";
  },

  async fetchCreditorBanks(creditorId) {
    const id = String(creditorId || "").trim();
    if (!id) return [];
    if (typeof SiengeApiService !== "undefined" && typeof SiengeApiService.getCreditorBankInformations === "function") {
      return SiengeApiService.getCreditorBankInformations(id);
    }
    const headers = { Authorization: typeof getBasicAuthHeader === "function" ? getBasicAuthHeader() : "" };
    const res = await fetch(this.proxyUrl(`/sienge-proxy/creditors/${encodeURIComponent(id)}/bank-informations?limit=200&offset=0`), { headers });
    if (!res.ok) return [];
    const json = await res.json();
    const list = json.results || json.data || [];
    return Array.isArray(list) ? list : [];
  },

  async ensureCreditorBank() {
    const p = this.current();
    if (p && this.variosCredores(p)) return this.ensureSociosBanks();
    if (!p || !p.creditor || !p.creditor.id) return;
    if (this._bankLoading) return;
    if (p.creditor.bankLoaded) return;
    this._bankLoading = true;
    this.render();
    try {
      const list = await this.fetchCreditorBanks(p.creditor.id);
      const cur = this.current();
      if (!cur || !cur.creditor || String(cur.creditor.id) !== String(p.creditor.id)) return;
      cur.creditor.bankList = list;
      const chosenId = cur.creditor.bankId;
      const picked = (chosenId && list.find(b => String(b.id) === String(chosenId)))
        || list.find(b => this.isDefaultBank(b))
        || list[0]
        || null;
      cur.creditor.bankInfo = picked;
      cur.creditor.bankId = picked && picked.id != null ? picked.id : "";
      cur.creditor.bankLoaded = true;
      this.persist();
    } catch (e) {
      console.warn("[Parcerias] Dados bancários do credor:", e);
      const cur = this.current();
      if (cur && cur.creditor) cur.creditor.bankLoaded = true;
    } finally {
      this._bankLoading = false;
      this.render();
    }
  },

  refreshCreditorBank() {
    const p = this.current();
    if (p && this.variosCredores(p)) {
      (p.socios || []).forEach(s => { s.bankLoaded = false; });
      this.ensureSociosBanks();
      return;
    }
    if (!p || !p.creditor) return;
    p.creditor.bankLoaded = false;
    this.ensureCreditorBank();
  },

  async ensureSociosBanks() {
    const p = this.current();
    if (!p || !this.variosCredores(p)) return;
    const pending = (p.socios || []).filter(s => s.id && !s.bankLoaded);
    if (!pending.length || this._bankLoading) return;
    this._bankLoading = true;
    this.render();
    try {
      await Promise.all(pending.map(async (s) => {
        let list = [];
        try { list = await this.fetchCreditorBanks(s.id); } catch (e) { list = []; }
        const cur = this.current();
        const row = cur && (cur.socios || []).find(x => String(x.id) === String(s.id));
        if (!row) return;
        row.bankList = list;
        const picked = (row.bankId && list.find(b => String(b.id) === String(row.bankId)))
          || list.find(b => this.isDefaultBank(b))
          || list[0]
          || null;
        row.bankInfo = picked;
        row.bankId = picked && picked.id != null ? picked.id : "";
        row.bankLoaded = true;
      }));
      this.persist();
    } catch (e) {
      console.warn("[Parcerias] Dados bancários dos sócios:", e);
    } finally {
      this._bankLoading = false;
      this.render();
    }
  },

  selectSocioBank(socioId, bankId) {
    const p = this.current();
    if (!p) return;
    const row = (p.socios || []).find(s => String(s.id) === String(socioId));
    if (!row) return;
    const picked = (row.bankList || []).find(b => String(b.id) === String(bankId)) || null;
    row.bankId = picked && picked.id != null ? picked.id : "";
    row.bankInfo = picked;
    this.persist();
    this.render();
  },

  selectCreditorBank(bankId) {
    const p = this.current();
    if (!p || !p.creditor) return;
    const list = p.creditor.bankList || [];
    const picked = list.find(b => String(b.id) === String(bankId)) || null;
    p.creditor.bankId = picked && picked.id != null ? picked.id : "";
    p.creditor.bankInfo = picked;
    this.persist();
    this.render();
  },

  onCreditorSearch(val, papel) {
    this.creditorQuery = val;
    if (papel === "terrenista" || papel === "empreendedor") this.credorPapel = papel;
    clearTimeout(this._creditorTimer);
    this._creditorTimer = setTimeout(() => this.runCreditorSearch(val), 280);
  },

  setSocioPapel(id, papel) {
    const p = this.current();
    if (!p) return;
    const row = (p.socios || []).find((s) => String(s.id) === String(id));
    if (!row) return;
    row.papel = papel === "terrenista" ? "terrenista" : "empreendedor";
    this.persist();
    this.renderKeepScroll();
  },

  setContaMista(campo, valor) {
    const p = this.current();
    if (!p) return;
    if (campo !== "contaTerrenista" && campo !== "contaDistribuicao") return;
    p[campo] = String(valor || "").trim();
    this.persist();
  },

  normSearch(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  },

  mapCreditor(raw, fallbackId) {
    if (!raw) return null;
    let src = raw;
    if (typeof raw.raw_data === "string") {
      try { src = { ...JSON.parse(raw.raw_data), ...raw }; } catch (e) {}
    }
    const id = src.id || src.creditorId || fallbackId || "";
    const name = src.name || src.nome || raw.name || raw.nome || src.fantasyName || src.tradeName
      || src.corporateName || src.companyName || src.creditorName || "";
    const cpfCnpj = src.cpfCnpj || src.cnpj || src.cpf || src.document || raw.cpfCnpj || "";
    if (!id && !name) return null;
    return { id: String(id), name: String(name), cpfCnpj: String(cpfCnpj) };
  },

  creditorMatches(c, qRaw) {
    const q = this.normSearch(qRaw);
    const digits = String(qRaw || "").replace(/\D/g, "");
    if (!q && digits.length < 3) return false;
    const name = this.normSearch(c.name);
    const doc = String(c.cpfCnpj || "").replace(/\D/g, "");
    const id = String(c.id || "");
    const terms = q.split(/\s+/).filter(Boolean);
    const nameOk = terms.length && terms.every(t => name.includes(t));
    const docOk = digits.length >= 3 && doc.includes(digits);
    const idOk = q && id.toLowerCase().includes(q);
    return nameOk || docOk || idOk;
  },

  async loadFirebaseCreditors() {
    if (this._creditorIndex && this._creditorIndex.length) return this._creditorIndex;
    const out = [];
    const seen = new Set();
    const push = (mapped) => {
      if (!mapped || mapped.id === "") return;
      if (seen.has(mapped.id)) return;
      seen.add(mapped.id);
      out.push(mapped);
    };

    if (window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDocs) {
      const { collection, getDocs } = window.firebaseCollections;
      for (const col of ["sienge_creditors", "creditors"]) {
        try {
          const snap = await getDocs(collection(window.firebaseDb, col));
          snap.forEach(d => push(this.mapCreditor(d.data(), d.id)));
          if (out.length) break;
        } catch (e) {}
      }
    }

    if (!out.length) {
      try {
        const headers = { Authorization: typeof getBasicAuthHeader === "function" ? getBasicAuthHeader() : "" };
        let offset = 0;
        const limit = 200;
        for (let page = 0; page < 50; page++) {
          const res = await fetch(this.proxyUrl(`/sienge-proxy/creditors?limit=${limit}&offset=${offset}`), { headers });
          if (!res.ok) break;
          const json = await res.json();
          const rows = json.results || json.resultSet || json.data || [];
          if (!rows.length) break;
          rows.forEach(r => push(this.mapCreditor(r)));
          if (rows.length < limit) break;
          offset += limit;
        }
      } catch (e) {
        console.warn("[Parcerias] Falha ao carregar base de credores:", e);
      }
    }

    this._creditorIndex = out;
    return out;
  },

  async runCreditorSearch(val) {
    const q = String(val || "").trim();
    const digits = q.replace(/\D/g, "");
    const papel = this.credorPapel === "terrenista" ? "terrenista" : "empreendedor";
    const box = document.getElementById(this.isMista(this.current()) ? ("pp-cred-sugg-" + papel) : "pp-cred-sugg");
    if (q.length < 2 && digits.length < 3) {
      this.creditorHits = [];
      if (box) box.innerHTML = "";
      return;
    }
    this.creditorSearching = true;
    const loading = this._creditorIndex && this._creditorIndex.length
      ? "Buscando credor..."
      : "Carregando base de credores...";
    if (box) box.innerHTML = `<div style="padding:8px 10px;font-size:0.78rem;color:#64748b;">${loading}</div>`;
    const index = await this.loadFirebaseCreditors();
    const hits = index.filter(c => this.creditorMatches(c, q)).slice(0, 15);
    this.creditorHits = hits;
    this.creditorSearching = false;
    if (box) box.innerHTML = this.creditorSuggHtml();
  },

  creditorSuggHtml() {
    if (!this.creditorHits.length) {
      return this.creditorQuery
        ? `<div style="padding:8px 10px;font-size:0.78rem;color:#94a3b8;">Nenhum credor encontrado.</div>`
        : "";
    }
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#fff;overflow:hidden;max-height:240px;overflow-y:auto;">
      ${this.creditorHits.map((c, idx) => {
        const name = this.esc(c.name);
        const doc = this.esc(c.cpfCnpj || "");
        const id = this.esc(c.id);
        return `<button type="button" onclick="ParametrizacaoParceiroApp.pickCreditorByIndex(${idx})"
          style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
          <strong>${name}</strong> <span style="color:#94a3b8;">ID ${id}</span>
          <div style="font-size:0.72rem;color:#64748b;">${doc || "sem CPF/CNPJ"}</div>
        </button>`;
      }).join("")}
    </div>`;
  },

  renderListOnly() {
    const list = document.getElementById("pp-list");
    if (list) list.innerHTML = this.listHtml();
    if (window.lucide) lucide.createIcons();
  },

  setCcInAccount(ccId, checked) {
    const obra = this.currentObra();
    if (!obra) return;
    const row = obra.costCenters.find(c => String(c.id) === String(ccId));
    if (row) row.inAccount = !!checked;
    this.persist();
    const qtd = document.getElementById("ppcc-qtd");
    if (qtd) qtd.textContent = obra.costCenters.filter(c => c.inAccount).length;
  },

  addCostCenter(ccId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!p || !obra) return;
    const id = String(ccId).replace(/\D/g, "") || String(ccId);
    if (obra.costCenters.some(c => String(c.id) === id)) return;
    const permitido = this.checarCentroDaEmpresa(id, p.companyId);
    if (!permitido.ok) {
      alert(permitido.msg);
      return;
    }
    const ccObra = this.obraFromCc(id);
    if (ccObra !== String(obra.code)) {
      if (!confirm(`O centro ${id} é da obra ${ccObra || "?"}. Incluir na obra ${obra.code}?`)) return;
    }
    const cc = permitido.cc;
    obra.costCenters.push({ id, name: (cc && cc.name) || id, inAccount: true });
    this.ccSearch = "";
    this.persist();
    this.render();
  },

  async removeCostCenter(ccId) {
    const obra = this.currentObra();
    if (!obra) return;
    const msg = `Tirar o C.C. ${ccId} da obra ${obra.code}?`;
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    obra.costCenters = obra.costCenters.filter(c => String(c.id) !== String(ccId));
    this.persist();
    this.render();
  },

  importObraCenters() {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!p || !obra) return;
    this.costCentersOfObra(obra.code, p.companyId).forEach(cc => {
      if (!obra.costCenters.some(x => String(x.id) === String(cc.id))) {
        obra.costCenters.push({ id: String(cc.id), name: cc.name || String(cc.id), inAccount: true });
      }
    });
    this.persist();
    this.render();
  },

  setAccountShare(accountId, value) {
    const obra = this.currentObra();
    if (!obra) return;
    obra.accountShares = obra.accountShares || {};
    const raw = String(value).trim();
    if (raw === "") {
      delete obra.accountShares[accountId];
    } else {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) return;
      obra.accountShares[accountId] = Math.max(0, Math.min(100, n));
    }
    this.persist();
    const pct = this.partnerPct(this.current(), accountId);
    document.querySelectorAll(`[data-pp-pct="${accountId}"]`).forEach(el => { el.textContent = pct.toFixed(1) + "%"; });
    document.querySelectorAll(`[data-pp-bar="${accountId}"]`).forEach(el => { el.style.width = pct + "%"; });
  },

  applyDefaultToAll() {
    const obra = this.currentObra();
    if (!obra) return;
    obra.accountShares = {};
    this.persist();
    this.render();
  },

  removeCurrent() {
    const p = this.current();
    if (!p) return;
    if (!confirm(`Excluir a parceria de ${p.partnerName}?`)) return;
    this.items = this.items.filter(x => x.id !== p.id);
    this.selectedId = this.items[0] ? this.items[0].id : null;
    this.selectedObraCode = "";
    this.persist();
    this.render();
  },

  list() {
    return this.items;
  },

  listHtml() {
    if (!this.items.length) {
      return `<div style="padding:16px;color:#94a3b8;font-size:0.8rem;">Nenhuma prestação de contas cadastrada.</div>`;
    }
    return this.items.map(raw => {
      const p = this.normalizeItem(raw);
      const active = p.id === this.selectedId;
      const nCc = (p.obras || []).reduce((acc, o) => acc + (o.costCenters || []).filter(c => c.inAccount).length, 0);
      const obras = (p.obras || []).map(o => o.code).filter(Boolean).join(", ") || "—";
      const tipo = this.kindLabel(p);
      const nPessoas = (p.socios || []).filter(s => s.id).length;
      const rateioTxt = [...new Set((p.obras || []).map(o => o.defaultPartnerShare + "%"))].join(" / ") || "sem rateio";
      const nEmp = this.sociosPorPapel(p, "empreendedor").length;
      const nTerr = this.sociosPorPapel(p, "terrenista").length;
      const shares = this.isSociedade(p)
        ? (nPessoas + " sócios · " + this.fmtPct(this.totalSociosPct(p)) + "%")
        : (this.isMista(p)
          ? (nEmp + " empreendedores · " + nTerr + (nTerr === 1 ? " terrenista · " : " terrenistas · ") + rateioTxt)
          : (nPessoas + (nPessoas === 1 ? " parceiro · " : " parceiros · ") + rateioTxt));
      return `<button type="button" class="pp-lista-item${active ? " is-on" : ""}" onclick="ParametrizacaoParceiroApp.select('${p.id}')">
        <span class="pp-lista-nome">${this.esc(p.partnerName)}</span>
        <span class="pp-lista-tipo">${this.esc(tipo)}</span>
        <span class="pp-lista-meta">Obras ${this.esc(obras)} · ${nCc} C.C. · ${this.esc(shares)}</span>
      </button>`;
    }).join("");
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  captureScroll() {
    const ids = ["pp-tree-scroll", "pp-detail-scroll", "pp-list"];
    const pos = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) pos[id] = el.scrollTop;
    });
    const main = document.querySelector(".main-content");
    if (main) pos.main = main.scrollTop;
    pos.win = window.scrollY || document.documentElement.scrollTop || 0;
    return pos;
  },

  restoreScroll(pos) {
    if (!pos) return;
    const apply = () => {
      ["pp-tree-scroll", "pp-detail-scroll", "pp-list"].forEach(id => {
        const el = document.getElementById(id);
        if (el && pos[id] != null) el.scrollTop = pos[id];
      });
      const main = document.querySelector(".main-content");
      if (main && pos.main != null) main.scrollTop = pos.main;
      if (pos.win != null) window.scrollTo(0, pos.win);
    };
    apply();
    requestAnimationFrame(apply);
  },

  renderKeepScroll() {
    this._keepScrollPos = this.captureScroll();
    this.render();
  },

  render() {
    const root = document.getElementById("parametrizacao-parceiro-root");
    if (!root) return;
    const p = this.selectedId === "__new__" ? null : this.current();
    if (p && !this.selectedObraCode && p.obras[0]) this.selectedObraCode = p.obras[0].code;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);font-family:inherit;">
        <div style="display:flex;flex:1;min-height:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <div style="width:260px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;flex-shrink:0;">
            <div style="padding:12px;border-bottom:1px solid #f1f5f9;">
              <button onclick="ParametrizacaoParceiroApp.startNew()" class="btn btn-primary" style="width:100%;height:34px;font-size:0.8rem;">
                <i data-lucide="plus" style="width:14px;"></i> Nova prestação de contas
              </button>
            </div>
            <div id="pp-list" style="flex:1;overflow:auto;padding:10px;">${this.listHtml()}</div>
          </div>
          <div id="pp-detail-scroll" style="flex:1;overflow:auto;padding:16px 18px;min-width:0;">
            ${this.selectedId === "__new__" ? this.newFormHtml() : (p ? this.detailHtml(p) : this.emptyHtml())}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    this.bindVinculoFiltros();
    if (this._keepScrollPos) {
      const pos = this._keepScrollPos;
      this._keepScrollPos = null;
      this.restoreScroll(pos);
    }
  },

  emptyHtml() {
    return `<div class="crm-card" style="padding:40px;text-align:center;color:#64748b;">
      Cadastre uma prestação de contas. Informe se é parceria (rateio por obra), sociedade (sócios) ou mista (os dois).
    </div>`;
  },

  newFormHtml() {
    const companies = this.eligibleCompanies();
    const field = "font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;min-width:0;width:100%;";
    const input = "width:100%;max-width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;";
    return `<div class="crm-card" style="padding:20px;max-width:560px;width:100%;overflow:hidden;box-sizing:border-box;">
      <h3 style="margin:0 0 6px;color:var(--color-primary);">Nova prestação de contas</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:0.82rem;line-height:1.45;">
        Informe a empresa (cobrança interna), o nome e se é <strong>parceria</strong>, <strong>sociedade</strong> ou <strong>mista</strong>.
        Centro de custo e percentual de obra ficam para depois. Com um parceiro, o percentual fica na obra. Com dois ou mais, cada um informa a parte dele nessa fatia.
        Mista junta os dois: sócios com participação e rateio por obra.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0;">
        <label style="${field}">Empresa
          <select id="pp-new-company" style="${input}">
            ${companies.map(c => `<option value="${c.id}">${c.id} — ${this.esc(c.name)}</option>`).join("") || '<option value="">Nenhuma empresa com cobrança interna</option>'}
          </select>
        </label>
        <label style="${field}">Parceiro / sócio
          <input id="pp-new-partner" placeholder="Nome do parceiro ou sócio" style="${input}">
        </label>
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Tipo</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#334155;">
              <input type="radio" name="pp-new-kind" value="parceria" checked> Parceria
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#334155;">
              <input type="radio" name="pp-new-kind" value="sociedade"> Sociedade
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#334155;">
              <input type="radio" name="pp-new-kind" value="mista"> Mista
            </label>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.createFromForm()">Criar prestação de contas</button>
        <button class="btn btn-cancel" onclick="ParametrizacaoParceiroApp.selectedId=ParametrizacaoParceiroApp.items[0]&&ParametrizacaoParceiroApp.items[0].id;ParametrizacaoParceiroApp.render()">Cancelar</button>
      </div>
    </div>`;
  },

  detailHtml(p) {
    const obra = this.currentObra(p);
    const inAccount = ((obra && obra.costCenters) || []).filter(c => c.inAccount);
    const sociedade = this.isSociedade(p);
    const tab = this.detailTab || "geral";
    const nObras = (p.obras || []).length;
    const nCc = (p.obras || []).reduce((acc, o) => acc + (o.costCenters || []).filter(c => c.inAccount).length, 0);
    const nSocios = (p.socios || []).filter(s => s.id).length;
    const credOk = this.variosCredores(p) ? nSocios > 0 : !!(p.creditor && p.creditor.id);
    const btn = (id, label, icon, count) =>
      `<button type="button" role="tab" aria-selected="${tab === id}" class="ml-tab${tab === id ? " is-active" : ""}" onclick="ParametrizacaoParceiroApp.setDetailTab('${id}')"><i data-lucide="${icon}"></i> ${label}${count ? ` <span class="ml-tab-count">${count}</span>` : ""}</button>`;
    let body = "";
    if (tab === "credor") body = this.credorTabHtml(p);
    else if (tab === "obras") body = this.obrasTabHtml(p, obra, sociedade);
    else if (tab === "centros") body = obra ? this.obraDetailHtml(p, obra, inAccount) : this.needObraHtml();
    else if (tab === "rateio") body = (obra || sociedade) ? this.matrixHtml(p) : this.needObraHtml();
    else body = this.geralTabHtml(p, sociedade);
    return `
      <div style="display:flex;flex-direction:column;gap:0;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;">Empresa ${this.esc(p.companyId)}</div>
            <div style="font-size:1.05rem;font-weight:800;color:#0f172a;">${this.esc(p.companyName)}</div>
            <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">${this.esc(p.partnerName)} · ${this.kindLabel(p)}</div>
          </div>
        </div>
        <div class="ml-tabs" role="tablist" style="margin-bottom:16px;">
          ${btn("geral", "Geral", "sliders-horizontal")}
          ${btn("credor", "Credor", "user", this.variosCredores(p) ? (nSocios || "") : (credOk ? "✓" : ""))}
          ${btn("obras", "Obras", "building-2", nObras || "")}
          ${btn("centros", "Centros de custo", "layers", nCc || "")}
          ${btn("rateio", sociedade ? "Sociedade" : "Rateio DFC", sociedade ? "users" : "pie-chart")}
        </div>
        ${body}
      </div>
    `;
  },

  needObraHtml() {
    return `<div class="crm-card" style="padding:28px;text-align:center;color:#64748b;">
      Inclua uma obra na aba <strong>Obras</strong> para configurar centros de custo e rateio.
      <div style="margin-top:12px;"><button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.setDetailTab('obras')">Ir para Obras</button></div>
    </div>`;
  },

  obraChipsHtml(p, sociedade) {
    const obras = p.obras || [];
    if (!obras.length) return `<span style="font-size:0.78rem;color:#94a3b8;">Nenhuma obra ainda. Inclua pelo centro de custo.</span>`;
    return `<div class="ml-tabs pp-obra-tabs" role="tablist">
      ${obras.map(o => {
        const on = String(o.code) === String(this.selectedObraCode);
        const pct = sociedade ? "" : `<span class="ml-tab-count">${this.esc(String(o.defaultPartnerShare).replace(".", ","))}%</span>`;
        return `<button type="button" role="tab" aria-selected="${on ? "true" : "false"}" class="ml-tab${on ? " is-active" : ""}" onclick="ParametrizacaoParceiroApp.selectObra('${this.esc(o.code)}')"><i data-lucide="building-2"></i> Obra ${this.esc(o.code)}${pct}</button>`;
      }).join("")}
    </div>`;
  },

  geralTabHtml(p, sociedade) {
    const empresas = this.empresasEditaveis(p);
    const input = "width:100%;max-width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;background:#fff;";
    return `
      <div class="crm-card" style="padding:16px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">Dados gerais</h3>
            <p style="margin:0;font-size:0.78rem;color:#64748b;">Empresa, nome do parceiro e o tipo da prestação de contas.</p>
          </div>
          <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeCurrent()" style="color:#dc2626;border-color:#fecaca;">Excluir</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;min-width:0;">
          <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;min-width:0;">Empresa
            <select onchange="ParametrizacaoParceiroApp.updateCompany(this.value)" style="${input}">
              ${empresas.map(c => `<option value="${this.esc(c.id)}" ${String(c.id) === String(p.companyId) ? "selected" : ""}>${this.esc(c.id)} — ${this.esc(c.name)}</option>`).join("")}
            </select>
          </label>
          <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;min-width:0;">Parceiro / sócio
            <input value="${this.esc(p.partnerName)}" onchange="ParametrizacaoParceiroApp.updateField('partnerName', this.value)"
              style="width:100%;max-width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;">
          </label>
          <div>
            <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Tipo</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${p.kind === "parceria" ? "#105436" : "#e2e8f0"};background:${p.kind === "parceria" ? "#e8f5ee" : "#fff"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;">
                <input type="radio" name="pp-kind" ${p.kind === "parceria" ? "checked" : ""} onchange="ParametrizacaoParceiroApp.updateField('kind','parceria')"> Parceria
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${p.kind === "sociedade" ? "#105436" : "#e2e8f0"};background:${p.kind === "sociedade" ? "#e8f5ee" : "#fff"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;">
                <input type="radio" name="pp-kind" ${p.kind === "sociedade" ? "checked" : ""} onchange="ParametrizacaoParceiroApp.updateField('kind','sociedade')"> Sociedade
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${p.kind === "mista" ? "#105436" : "#e2e8f0"};background:${p.kind === "mista" ? "#e8f5ee" : "#fff"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;">
                <input type="radio" name="pp-kind" ${p.kind === "mista" ? "checked" : ""} onchange="ParametrizacaoParceiroApp.updateField('kind','mista')"> Mista
              </label>
            </div>
            <p style="margin:8px 0 0;font-size:0.78rem;color:#64748b;line-height:1.4;">
              ${p.kind === "sociedade"
                ? "Sociedade: não aplica rateio por obra. Cada sócio tem um percentual de participação e recebe pela distribuição de lucro."
                : (p.kind === "mista"
                  ? "Mista: há um parceiro terrenista, com rateio por obra, e o empreendedor pode ter sócios. O centro de custo dos sócios empreendedores é cadastrado à parte do centro do terrenista."
                  : "Parceria: pode ter vários parceiros, cada um com o seu percentual, como os sócios. O rateio por obra continua na aba Rateio DFC. O centro de custo não entra no credor: a variação do 13301 é paga no 13300, na conta cadastrada no 13301, e a do 13401 no 13400, na conta do 13401.")}
            </p>
          </div>
        </div>
      </div>
    `;
  },

  sociosCredorHtml(p, opt) {
    opt = opt || {};
    if (this.isMista(p) && !opt.papel) return this.mistaCredorHtml(p);
    const papel = opt.papel === "terrenista" ? "terrenista" : (opt.papel === "empreendedor" ? "empreendedor" : "");
    const pessoa = papel === "empreendedor" ? "empreendedor" : (papel === "terrenista" ? "terrenista" : this.rotuloCredor(p));
    const pessoas = papel === "empreendedor" ? "Empreendedores" : (papel === "terrenista" ? "Terrenistas" : this.rotuloCredor(p, true));
    const cred = p.creditor || {};
    const day = cred.paymentDay == null ? "" : cred.paymentDay;
    const mode = cred.paymentDayMode === "businessDays" ? "businessDays" : "monthDay";
    const biz = cred.paymentBusinessDays == null ? "" : cred.paymentBusinessDays;
    const bizN = parseInt(String(biz), 10);
    const bizPrev = Number.isFinite(bizN) && bizN >= 1 ? this.previewBusinessPay(bizN) : null;
    const bizOk = bizPrev && bizPrev.day >= this.PAY_MIN_DAY;
    const bizHint = !bizPrev
      ? "Contados a partir do último dia do mês de fechamento, pulando sábados, domingos e feriados."
      : (bizOk
        ? `Com fechamento em ${this.fmtDateBR(bizPrev.close)}, o título cai em ${this.fmtDateBR(bizPrev.due)} (dia ${bizPrev.day}).`
        : `Cairia no dia ${bizPrev.day} (${this.fmtDateBR(bizPrev.due)}). O mínimo é dia ${this.PAY_MIN_DAY}. Aumente os dias úteis.`);
    const modeBtn = (id, label) => {
      const on = mode === id;
      return `<button type="button" onclick="ParametrizacaoParceiroApp.updatePaymentDayMode('${id}')"
        style="border:1px solid ${on ? "#105436" : "#e2e8f0"};background:${on ? "#e8f5ee" : "#fff"};color:${on ? "#105436" : "#334155"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.78rem;font-weight:700;">${label}</button>`;
    };
    let socios = this.sociosOrdenados(p.socios);
    if (papel) socios = socios.filter((s) => this.papelSocio(s) === papel);
    const total = socios.reduce((sum, s) => sum + (Number(s.sharePct) || 0), 0);
    const resto = Math.round((100 - total) * 1000) / 1000;
    const sociedade = this.isSociedade(p);
    const divideFatia = this.pedeFatiaCredor(p);
    const mostraPct = sociedade || divideFatia || papel === "empreendedor" || (papel === "terrenista" && socios.length >= 2);
    const terrPct = papel ? this.pctTerrenista(p) : 0;
    const card = (s) => {
      const aberto = String(this.socioAberto || "") === String(s.id);
      const banks = s.bankList || [];
      const bank = s.bankInfo || null;
      const banksHtml = banks.map((b) => {
        const on = bank && String(b.id) === String(bank.id);
        const acc = `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`;
        return `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid ${on ? "#a7f3d0" : "#e2e8f0"};background:${on ? "#fff" : "#f8fafc"};border-radius:8px;cursor:pointer;margin-top:6px;">
          <input type="radio" name="pp-socio-bank-${this.esc(s.id)}" ${on ? "checked" : ""} onchange="ParametrizacaoParceiroApp.selectSocioBank('${this.esc(s.id)}','${this.esc(String(b.id))}')" style="margin-top:3px;">
          <span style="font-size:0.78rem;line-height:1.4;color:#334155;">
            <strong>${this.esc(b.bank || "")} ${this.esc(b.nameOfBank || "")}</strong>
            ${this.isDefaultBank(b) ? `<span style="margin-left:6px;font-size:0.65rem;font-weight:800;color:#105436;background:#d1fae5;padding:1px 6px;border-radius:99px;">Padrão Sienge</span>` : ""}
            <span style="display:block;color:#64748b;">Ag. ${this.esc(b.agency || "—")} · Conta ${this.esc(acc)} · ${this.esc(this.accountTypeLabel(b.accountType))}</span>
            <span style="display:block;color:#64748b;">Favorecido: ${this.esc(b.nameOfRecipient || s.name || "—")} · Doc.: ${this.esc(b.cpf || b.cnpj || s.cpfCnpj || "—")}</span>
          </span>
        </label>`;
      }).join("");
      const fatias = divideFatia ? this.fatiasDoSocio(p, s.sharePct) : [];
      const fatiaTxt = fatias.length
        ? fatias.map((f) => "obra " + f.code + ": " + this.fmtPctCurto(s.sharePct) + "% de " + this.fmtPctCurto(f.base) + "% = " + this.fmtPctCurto(f.efetivo) + "%").join(" · ")
        : (divideFatia ? "Esta parte vale sobre o percentual já configurado em cada obra." : "");
      const rotuloPct = sociedade ? "% de participação" : (papel === "empreendedor" ? "% dos empreendedores" : (papel === "terrenista" ? "% dos terrenistas" : "% da fatia"));
      const campoPct = !mostraPct ? "" : `<label style="display:flex;flex-direction:column;gap:4px;width:170px;font-size:0.68rem;font-weight:700;color:#475569;text-transform:uppercase;">${rotuloPct}
              <input type="number" min="0" max="100" step="0.001" value="${s.sharePct === "" ? "" : s.sharePct}"
                onchange="ParametrizacaoParceiroApp.setSocioPct('${this.esc(s.id)}', this.value)"
                style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;font-weight:800;background:#fff;text-transform:none;">
            </label>`;
      const efetivoEmp = papel === "empreendedor" ? this.efetivoEmpreendedor(p, s.sharePct) : 0;
      const introPct = papel === "empreendedor"
        ? "Parte deste empreendedor na fatia de " + this.fmtPctCurto(100 - terrPct) + "% da parceria. " + this.fmtPctCurto(s.sharePct) + "% dessa fatia são " + this.fmtPctCurto(efetivoEmp) + "% do negócio."
        : (papel === "terrenista"
          ? "Quando há mais de um terrenista, este percentual divide os " + this.fmtPctCurto(terrPct) + "% da parceria. Com um só, ele recebe a fatia inteira."
          : (sociedade
            ? "Parte deste sócio no negócio. A soma de todos fecha 100%."
            : (fatiaTxt || "Parte deste parceiro na fatia já configurada em cada obra.")));
      const introTitulo = sociedade
        ? "Cada plano gera um título neste centro de custo. O percentual do plano vale sobre a participação: 70% e 30% de quem tem 50% são 35% e 15%."
        : (papel === "empreendedor"
          ? "O título de distribuição deste empreendedor sai no centro de custo, no plano e no documento daqui. O texto leva o valor apurado, o PIS/COFINS/IR e as despesas operacionais da parte dele."
          : (papel === "terrenista"
            ? "O pagamento do terrenista sai da conta de origem, no dia configurado acima."
            : (this.isMista(p)
              ? "O título deste sócio empreendedor sai no centro de custo escolhido aqui. O centro do parceiro terrenista é o da obra."
              : this.textoRepasse(p))));
      const pctLegenda = papel === "empreendedor"
        ? ("efetivo " + this.fmtPctCurto(efetivoEmp) + "%")
        : (divideFatia ? (fatias.length === 1 ? "efetivo " + this.fmtPctCurto(fatias[0].efetivo) + "%" : "da fatia") : "participação");
      const pctResumo = !mostraPct ? "" : `<span class="pp-pessoa-pct">${s.sharePct === "" || s.sharePct == null ? "—" : this.esc(this.fmtPct(s.sharePct)) + "%"}<small>${this.esc(pctLegenda)}</small></span>`;
      return `<div class="pp-pessoa${aberto ? " is-open" : ""}">
        <button type="button" class="pp-pessoa-h" onclick="ParametrizacaoParceiroApp.toggleSocio('${this.esc(s.id)}')">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" class="pp-pessoa-seta"></i>
          <span class="pp-pessoa-quem">
            <span class="pp-pessoa-nome">${this.esc(s.name)}</span>
            <span class="pp-pessoa-doc">ID ${this.esc(s.id)}${s.cpfCnpj ? " · " + this.esc(s.cpfCnpj) : ""}</span>
          </span>
          <span class="pp-pessoa-chips">${this.chipsSocioHtml(p, s)}</span>
          ${pctResumo}
        </button>
        ${aberto ? `<div class="pp-pessoa-corpo">
          ${mostraPct ? `<section class="pp-bloco">
            <h4>${sociedade ? "Participação" : (papel === "empreendedor" ? "Parte na fatia dos empreendedores" : (papel === "terrenista" ? "Parte na fatia dos terrenistas" : "Parte na fatia da obra"))}</h4>
            <p>${this.esc(introPct)}</p>
            ${campoPct}
          </section>` : ""}
          <section class="pp-bloco">
            <h4>Título a pagar</h4>
            <p>${this.esc(introTitulo)}</p>
            ${this.vinculoTituloHtml(p, s)}
          </section>
          <section class="pp-bloco">
            <h4>Conta bancária</h4>
            <p>Conta do cadastro deste credor no Sienge, usada no pagamento.</p>
            ${this._bankLoading && !s.bankLoaded ? `<div style="font-size:0.75rem;color:#64748b;">Buscando dados bancários no Sienge…</div>` : ""}
            ${!this._bankLoading && s.bankLoaded && !banks.length ? `<div style="font-size:0.75rem;color:#b45309;">Nenhuma conta bancária neste credor no Sienge.</div>` : ""}
            ${banksHtml}
          </section>
          <div class="pp-pessoa-rodape">
            ${papel ? `<button type="button" class="pp-pessoa-remover" onclick="ParametrizacaoParceiroApp.setSocioPapel('${this.esc(s.id)}','${papel === "empreendedor" ? "terrenista" : "empreendedor"}')">${papel === "empreendedor" ? "Mover para terrenistas" : "Mover para empreendedores"}</button>` : ""}
            <button type="button" class="pp-pessoa-remover" onclick="ParametrizacaoParceiroApp.removeSocio('${this.esc(s.id)}')">Remover ${this.esc(pessoa)}</button>
          </div>
        </div>` : ""}
      </div>`;
    };
    return `
      <div class="crm-card" style="padding:16px;">
        <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">${papel === "empreendedor" ? "Credores empreendedores" : (papel === "terrenista" ? "Credores terrenistas" : pessoas + " (credores)")}</h3>
        <p style="margin:0 0 12px;font-size:0.78rem;color:#64748b;">${papel === "empreendedor"
          ? "Cada um informa a parte dele na fatia dos empreendedores. As despesas bancárias ficam 100% com eles, mesmo quando a tarifa do boleto é rateada pelo centro de custo."
          : (papel === "terrenista"
            ? "Quem recebe o rateio da obra. Com um terrenista, o percentual é o da obra. Com mais de um, divida essa fatia aqui."
            : (divideFatia
              ? `Clique no ${pessoa} para informar a parte dele na fatia da obra, o plano e o documento.`
              : (sociedade
                ? `Clique no ${pessoa} para ver a participação, o centro de custo, os planos e a conta.`
                : `Clique no ${pessoa} para ver o plano financeiro e o tipo de documento. O percentual fica na obra. O centro de custo não é informado neste credor.`)))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;min-width:120px;">
            <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">${pessoas}</div>
            <strong style="color:#0f172a;">${socios.length}</strong>
          </div>
          ${mostraPct ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;min-width:140px;">
            <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">${papel || divideFatia ? "Fatia" : "Participação"}</div>
            <strong id="pp-socios-total${papel ? "-" + papel : ""}" style="color:#105436;">${this.fmtPct(total)}%</strong>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;min-width:140px;">
            <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;">${divideFatia ? "Restante da fatia" : "Restante"}</div>
            <strong id="pp-socios-resto${papel ? "-" + papel : ""}" style="color:${Math.abs(resto) < 0.001 ? "#105436" : "#b45309"};">${this.fmtPct(resto)}%</strong>
          </div>` : ""}
        </div>
        ${opt.semDia ? "" : `<div style="margin-bottom:14px;">
          <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:8px;">${papel === "terrenista" ? "Dia do pagamento do terrenista. A transferência de cada empreendedor sai neste mesmo dia." : ("Dia do pagamento dos " + pessoas.toLowerCase())}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            ${modeBtn("monthDay", "Dia do mês")}
            ${modeBtn("businessDays", "Dias úteis após o fechamento")}
          </div>
          ${mode === "monthDay" ? `
            <label style="display:flex;flex-direction:column;gap:4px;max-width:220px;font-size:0.75rem;font-weight:700;color:#475569;">Dia${papel === "terrenista" ? "" : " (mínimo " + this.PAY_MIN_DAY + ")"}
              <input type="number" min="${papel === "terrenista" ? 1 : this.PAY_MIN_DAY}" max="31" placeholder="${papel === "terrenista" ? "1 a 31" : this.PAY_MIN_DAY + " a 31"}" value="${this.esc(day)}"
                onchange="ParametrizacaoParceiroApp.updatePaymentDay(this.value)"
                style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
            </label>
          ` : `
            <label style="display:flex;flex-direction:column;gap:4px;max-width:280px;font-size:0.75rem;font-weight:700;color:#475569;">Dias úteis após o fechamento
              <input type="number" min="1" max="31" placeholder="Ex.: 6" value="${this.esc(biz)}"
                onchange="ParametrizacaoParceiroApp.updatePaymentBusinessDays(this.value)"
                style="height:36px;border:1px solid ${bizPrev && !bizOk ? "#fca5a5" : "#e2e8f0"};border-radius:6px;padding:0 10px;">
              <span style="font-weight:500;color:${bizPrev && !bizOk ? "#b91c1c" : "#94a3b8"};">${this.esc(bizHint)}</span>
            </label>
          `}
        </div>`}
        <label style="display:block;font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Adicionar ${pessoa}</label>
        <input placeholder="Buscar credor por nome, CPF ou CNPJ" value="${papel ? (this.credorPapel === papel ? this.esc(this.creditorQuery) : "") : this.esc(this.creditorQuery)}"
          oninput="ParametrizacaoParceiroApp.onCreditorSearch(this.value, '${papel}')"
          style="width:100%;max-width:520px;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
        <div id="${papel ? "pp-cred-sugg-" + papel : "pp-cred-sugg"}">${!papel || this.credorPapel === papel ? this.creditorSuggHtml() : ""}</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px;">
          ${socios.map(card).join("") || `<p style="color:#94a3b8;margin:0;">Nenhum ${pessoa} adicionado ainda.</p>`}
        </div>
      </div>
    `;
  },

  mistaCredorHtml(p) {
    const terr = this.pctTerrenista(p);
    const origem = p.contaTerrenista || "";
    const destino = p.contaDistribuicao || "";
    return `
      <div class="crm-card" style="padding:16px;margin-bottom:12px;">
        <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">Contas da prestação mista</h3>
        <p style="margin:0 0 12px;font-size:0.78rem;color:#64748b;line-height:1.45;">O terrenista tem ${this.esc(this.fmtPctCurto(terr))}% da parceria e é pago na conta de origem. No mesmo dia, cada empreendedor é transferido, separado, para a conta de distribuição. Nessa conta ficam o imposto e as despesas administrativas dos 30 dias seguintes, na proporção de cada sócio.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
          <label style="font-size:0.72rem;font-weight:700;color:#475569;">Conta do terrenista
            <input value="${this.esc(origem)}" onchange="ParametrizacaoParceiroApp.setContaMista('contaTerrenista', this.value)"
              style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;display:block;margin-top:4px;">
          </label>
          <label style="font-size:0.72rem;font-weight:700;color:#475569;">Conta da distribuição
            <input value="${this.esc(destino)}" onchange="ParametrizacaoParceiroApp.setContaMista('contaDistribuicao', this.value)"
              style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;display:block;margin-top:4px;">
          </label>
        </div>
      </div>
      ${this.sociosCredorHtml(p, { papel: "empreendedor", semDia: true })}
      <div style="height:12px;"></div>
      ${this.sociosCredorHtml(p, { papel: "terrenista", semDia: false })}
    `;
  },

  credorTabHtml(p) {
    if (this.variosCredores(p)) return this.sociosCredorHtml(p);
    const cred = p.creditor || {};
    const banks = cred.bankList || [];
    const bank = cred.bankInfo || null;
    const day = cred.paymentDay == null ? "" : cred.paymentDay;
    const mode = cred.paymentDayMode === "businessDays" ? "businessDays" : "monthDay";
    const biz = cred.paymentBusinessDays == null ? "" : cred.paymentBusinessDays;
    const bizN = parseInt(String(biz), 10);
    const bizPrev = Number.isFinite(bizN) && bizN >= 1 ? this.previewBusinessPay(bizN) : null;
    const bizOk = bizPrev && bizPrev.day >= this.PAY_MIN_DAY;
    const bizHint = !bizPrev
      ? "Contados a partir do último dia do mês de fechamento, pulando sábados, domingos e feriados."
      : (bizOk
        ? `Com fechamento em ${this.fmtDateBR(bizPrev.close)}, o título cai em ${this.fmtDateBR(bizPrev.due)} (dia ${bizPrev.day}).`
        : `Cairia no dia ${bizPrev.day} (${this.fmtDateBR(bizPrev.due)}). O mínimo é dia ${this.PAY_MIN_DAY}. Aumente os dias úteis.`);
    const modeBtn = (id, label) => {
      const on = mode === id;
      return `<button type="button" onclick="ParametrizacaoParceiroApp.updatePaymentDayMode('${id}')"
        style="border:1px solid ${on ? "#105436" : "#e2e8f0"};background:${on ? "#e8f5ee" : "#fff"};color:${on ? "#105436" : "#334155"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.78rem;font-weight:700;">${label}</button>`;
    };
    const bankRow = (b) => {
      const on = bank && String(b.id) === String(bank.id);
      const acc = `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`;
      return `<label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid ${on ? "#a7f3d0" : "#e2e8f0"};background:${on ? "#ecfdf5" : "#fff"};border-radius:8px;cursor:pointer;margin-bottom:8px;">
        <input type="radio" name="pp-cred-bank" ${on ? "checked" : ""} onchange="ParametrizacaoParceiroApp.selectCreditorBank('${this.esc(String(b.id))}')" style="margin-top:3px;">
        <span style="font-size:0.8rem;line-height:1.4;color:#334155;">
          <strong>${this.esc(b.bank || "")} ${this.esc(b.nameOfBank || "")}</strong>
          ${this.isDefaultBank(b) ? `<span style="margin-left:6px;font-size:0.65rem;font-weight:800;color:#105436;background:#d1fae5;padding:1px 6px;border-radius:99px;">Padrão Sienge</span>` : ""}
          <span style="display:block;color:#64748b;">Ag. ${this.esc(b.agency || "—")} · Conta ${this.esc(acc)} · ${this.esc(this.accountTypeLabel(b.accountType))}</span>
          <span style="display:block;color:#64748b;">Forma: ${this.esc(b.paymentForm || "—")} · Favorecido: ${this.esc(b.nameOfRecipient || cred.name || "—")}</span>
          <span style="display:block;color:#64748b;">Doc.: ${this.esc(b.cpf || b.cnpj || cred.cpfCnpj || "—")}</span>
        </span>
      </label>`;
    };
    return `
      <div class="crm-card" style="padding:16px;">
        <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">Credor (título a pagar)</h3>
        <p style="margin:0 0 12px;font-size:0.78rem;color:#64748b;">Busque o credor por nome, CPF ou CNPJ, como na consulta de clientes. Os dados bancários vêm do cadastro do Sienge (mesmo GET do assistente de contas a pagar).</p>
        ${cred.id ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 12px;">
            <div>
              <div style="font-weight:800;color:#065f46;">${this.esc(cred.name)}</div>
              <div style="font-size:0.75rem;color:#047857;">ID ${this.esc(cred.id)} · ${this.esc(cred.cpfCnpj || "sem documento")}</div>
            </div>
            <button type="button" onclick="ParametrizacaoParceiroApp.clearCreditor()" style="border:none;background:transparent;color:#dc2626;cursor:pointer;font-size:0.78rem;">Trocar</button>
          </div>
          <div style="margin-top:14px;">
            <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:8px;">Dia do pagamento</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
              ${modeBtn("monthDay", "Dia do mês")}
              ${modeBtn("businessDays", "Dias úteis após o fechamento")}
            </div>
            ${mode === "monthDay" ? `
              <label style="display:flex;flex-direction:column;gap:4px;max-width:220px;font-size:0.75rem;font-weight:700;color:#475569;">Dia (mínimo ${this.PAY_MIN_DAY})
                <input type="number" min="${this.PAY_MIN_DAY}" max="31" placeholder="${this.PAY_MIN_DAY} a 31" value="${this.esc(day)}"
                  onchange="ParametrizacaoParceiroApp.updatePaymentDay(this.value)"
                  style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
                <span style="font-weight:500;color:#94a3b8;">Dia do mês em que o título a pagar será gerado. Sempre a partir do dia ${this.PAY_MIN_DAY}.</span>
              </label>
            ` : `
              <label style="display:flex;flex-direction:column;gap:4px;max-width:280px;font-size:0.75rem;font-weight:700;color:#475569;">Dias úteis após o fechamento
                <input type="number" min="1" max="31" placeholder="Ex.: 6" value="${this.esc(biz)}"
                  onchange="ParametrizacaoParceiroApp.updatePaymentBusinessDays(this.value)"
                  style="height:36px;border:1px solid ${bizPrev && !bizOk ? "#fca5a5" : "#e2e8f0"};border-radius:6px;padding:0 10px;">
                <span style="font-weight:500;color:${bizPrev && !bizOk ? "#b91c1c" : "#94a3b8"};">${this.esc(bizHint)}</span>
              </label>
            `}
          </div>
          <div style="margin-top:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <h4 style="margin:0;font-size:0.85rem;color:#0f172a;">Dados bancários do credor</h4>
              <button type="button" class="btn btn-outline" onclick="ParametrizacaoParceiroApp.refreshCreditorBank()" style="height:28px;font-size:0.72rem;">Atualizar do Sienge</button>
            </div>
            ${this._bankLoading ? `<div style="font-size:0.78rem;color:#64748b;">Buscando GET /creditors/${this.esc(cred.id)}/bank-informations…</div>` : ""}
            ${!this._bankLoading && !banks.length && cred.bankLoaded ? `<div style="font-size:0.78rem;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;">Nenhuma conta bancária cadastrada neste credor no Sienge.</div>` : ""}
            ${banks.map(bankRow).join("")}
          </div>
        ` : `
          <input placeholder="Buscar credor por nome, CPF ou CNPJ" value="${this.esc(this.creditorQuery)}"
            oninput="ParametrizacaoParceiroApp.onCreditorSearch(this.value)"
            style="width:100%;max-width:520px;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
          <div id="pp-cred-sugg">${this.creditorSuggHtml()}</div>
        `}
      </div>
    `;
  },

  obrasTabHtml(p, obra, sociedade) {
    return `
      <div class="crm-card" style="padding:16px;overflow:hidden;">
        <h3 style="margin:0 0 8px;font-size:0.95rem;color:var(--color-primary);">Obras deste terrenista</h3>
        ${this.obraChipsHtml(p, sociedade)}
        <div style="display:grid;grid-template-columns:${sociedade ? "minmax(0,1fr) 148px" : "minmax(0,1fr) 220px 148px"};gap:8px 10px;align-items:end;">
          <label style="font-size:0.72rem;font-weight:700;color:#475569;">Adicionar obra (C.C.)
            <input id="pp-add-obra-cc" inputmode="numeric" maxlength="5" oninput="ParametrizacaoParceiroApp.aoDigitarCentroObra(this)" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;display:block;margin-top:4px;">
          </label>
          ${sociedade ? "" : `<label style="font-size:0.72rem;font-weight:700;color:#475569;">Rateio do parceiro desta obra (%)
            <input id="pp-add-obra-share" type="number" min="0" max="100" step="0.01" value="" placeholder="Vem do centro de custo" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;display:block;margin-top:4px;background:#f8fafc;">
          </label>`}
          <button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.addObraFromForm()" style="height:34px;width:148px;font-size:0.78rem;white-space:nowrap;">Incluir obra</button>
          ${sociedade || p.obras.length <= 1 ? "" : `<button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeObra('${this.esc(obra && obra.code)}')" style="grid-column:3;height:34px;width:148px;font-size:0.78rem;color:#dc2626;">Remover obra</button>`}
        </div>
        ${sociedade && p.obras.length > 1 ? `<div style="margin-top:10px;"><button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeObra('${this.esc(obra && obra.code)}')" style="height:34px;font-size:0.78rem;color:#dc2626;">Remover obra</button></div>` : ""}
      </div>
    `;
  },

  obraDetailHtml(p, obra, inAccount) {
    const sociedade = this.isSociedade(p);
    const travado = sociedade ? null : this.percentualTravado(obra);
    if (travado != null && Number(obra.defaultPartnerShare) !== travado) {
      obra.defaultPartnerShare = travado;
      this.persist();
    }
    const centros = this.centrosOrdenados(obra.costCenters || []);
    const total = centros.length;
    const mista = this.isMista(p);
    const papelSel = (cc) => {
      const atual = this.papelDoCentro(cc);
      const opt = (valor, rotulo) => `<option value="${valor}"${atual === valor ? " selected" : ""}>${rotulo}</option>`;
      return `<select class="ppcc-papel" onchange="ParametrizacaoParceiroApp.setCcPapel('${cc.id}', this.value)">
        ${opt("obra", "Obra")}
        ${opt("empreendedor", "Sócios empreendedores")}
        ${opt("terrenista", "Parceiro terrenista")}
      </select>`;
    };
    const rateio = sociedade ? "" : travado != null
      ? `<div class="ppcc-kpi" title="Percentual cadastrado no centro de custo. Não pode ser alterado aqui.">
          <span class="ppcc-kpi-rot">Rateio da obra</span>
          <span class="ppcc-kpi-val">${this.esc(String(obra.defaultPartnerShare).replace(".", ","))}%<i data-lucide="lock" class="ppcc-kpi-ico"></i></span>
        </div>`
      : `<label class="ppcc-kpi">
          <span class="ppcc-kpi-rot">Rateio da obra (%)</span>
          <input class="ppcc-kpi-input" type="number" min="0" max="100" step="0.01" value="${obra.defaultPartnerShare}" onchange="ParametrizacaoParceiroApp.updateObraShare(this.value)">
        </label>`;
    const linhas = centros.map(cc => `<tr>
        <td class="ppcc-id">${this.esc(cc.id)}</td>
        <td class="ppcc-nome" title="${this.esc(cc.name)}">${this.esc(cc.name)}</td>
        ${mista ? `<td>${papelSel(cc)}</td>` : ""}
        <td class="is-center">
          <label class="moura-switch" title="Entra na conta">
            <input type="checkbox" ${cc.inAccount ? "checked" : ""} onchange="ParametrizacaoParceiroApp.setCcInAccount('${cc.id}', this.checked)">
            <span class="moura-switch-track" aria-hidden="true"></span>
          </label>
        </td>
        <td class="is-right">
          <button type="button" class="tvig-ico is-danger" title="Excluir" onclick="ParametrizacaoParceiroApp.removeCostCenter('${cc.id}')">
            <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
          </button>
        </td>
      </tr>`).join("") || `<tr><td colspan="${mista ? 5 : 4}" class="ppcc-vazio">Nenhum centro de custo nesta obra.</td></tr>`;
    return `
      <div class="crm-card ppcc">
        <div class="ppcc-obras">${this.obraChipsHtml(p, sociedade)}</div>
        <div class="ppcc-head">
          <div>
            <div class="ppcc-titulo">Obra ${this.esc(obra.code)}</div>
            <div class="ppcc-sub">${sociedade ? "Os centros entram na conta da SPE, sem rateio." : (mista ? "Marque o centro dos sócios empreendedores e o do parceiro terrenista. Os dois entram na prestação." : "Centros de custo que entram na prestação de contas desta obra.")}</div>
          </div>
          <div class="ppcc-kpis">
            <div class="ppcc-kpi">
              <span class="ppcc-kpi-rot">Entram na conta</span>
              <span class="ppcc-kpi-val"><span id="ppcc-qtd">${inAccount.length}</span><small> de ${total}</small></span>
            </div>
            ${rateio}
          </div>
        </div>
        <div class="cc-toolbar ppcc-toolbar">
          <div class="ppcc-busca">
            <i data-lucide="search" class="ppcc-busca-ico"></i>
            <input placeholder="Adicionar C.C. por código ou nome" value="${this.esc(this.ccSearch)}"
              oninput="ParametrizacaoParceiroApp.ccSearch=this.value;const b=document.getElementById('pp-cc-sugg');if(b)b.innerHTML=ParametrizacaoParceiroApp.ccSuggHtml();">
            <div id="pp-cc-sugg" class="ppcc-sugg">${this.ccSuggHtml()}</div>
          </div>
          <div class="cc-toolbar-actions">
            <button type="button" class="ppcc-trazer" onclick="ParametrizacaoParceiroApp.importObraCenters()" title="Busca no cadastro os outros centros de custo desta mesma obra, como o de parceria, e inclui na lista os que ainda não estão aqui.">
              <i data-lucide="list-plus" style="width:15px;height:15px;"></i>Trazer outros C.C. da obra
            </button>
          </div>
        </div>
        <div class="cc-scroll ppcc-scroll">
          <table class="cc-table ppcc-table">
            <colgroup><col style="width:96px"><col>${mista ? `<col style="width:210px">` : ""}<col style="width:130px"><col style="width:64px"></colgroup>
            <thead><tr><th>C.C.</th><th>Nome</th>${mista ? `<th>Quem</th>` : ""}<th class="is-center">Entra na conta</th><th class="is-right">Ações</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <div class="ppcc-rodape">
          <span>Desligue o C.C. para tirá-lo da conta sem perder o cadastro.</span>
          <button type="button" class="btn btn-primary" onclick="ParametrizacaoParceiroApp.salvarCentros()" title="Grava os centros desta obra e volta para a aba Obras">Salvar</button>
        </div>
      </div>
    `;
  },

  ccSuggHtml() {
    const p = this.current();
    const q = (this.ccSearch || "").toLowerCase().trim();
    if (!q || !p) return "";
    const sugg = [...this.catalogoCentros().values()].filter(cc =>
      this.empresaDoCentro(cc) === String(p.companyId) &&
      (String(cc.id).includes(q) || String(cc.name || "").toLowerCase().includes(q))
    ).slice(0, 10);
    if (!sugg.length) return "";
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#fff;overflow:hidden;">
      ${sugg.map(cc => `<button onclick="ParametrizacaoParceiroApp.addCostCenter('${cc.id}')"
        style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
        <strong>${cc.id}</strong> — ${this.esc(cc.name || "")} <span style="color:#94a3b8;">obra ${this.obraFromCc(cc.id)}</span>
      </button>`).join("")}
    </div>`;
  },

  rateioControlsHtml(p, key, isAccount, ancestorNA, naSelf, partial) {
    if (this.isSociedade(p)) return "";
    const obra = this.currentObra(p);
    const iconBtn = (title, onclick, lucideName, color) =>
      `<button type="button" title="${title}" onclick="event.stopPropagation();${onclick}"
        style="width:26px;height:26px;border:none;background:transparent;color:${color};cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;">
        <i data-lucide="${lucideName}" style="width:14px;height:14px;"></i>
      </button>`;
    const pill = (text, extra) =>
      `<span style="font-size:0.65rem;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;padding:3px 8px;border-radius:99px;">${text}${extra || ""}</span>`;

    if (isAccount) {
      if (this.isAccountNA(p, key)) {
        return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          ${pill("Fora")}
          ${iconBtn("Incluir no rateio", `ParametrizacaoParceiroApp.toggleNA('${key}', true)`, "undo-2", "#105436")}
        </div>`;
      }
    } else if (partial) {
      const stats = this.groupAccountStats(p, key);
      return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
        ${pill("Parcial", ` · ${stats.inCount}/${stats.total}`)}
        ${iconBtn("Incluir todas as contas deste grupo", `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "check", "#105436")}
        ${iconBtn("Deixar todas fora", naSelf
          ? `ParametrizacaoParceiroApp.excludeSubtreeExceptions('${key}')`
          : `ParametrizacaoParceiroApp.setSubtreeNA('${key}', true)`, "ban", "#94a3b8")}
        ${naSelf ? iconBtn("Incluir o grupo inteiro de novo", `ParametrizacaoParceiroApp.setSubtreeNA('${key}', false)`, "undo-2", "#105436") : ""}
      </div>`;
    } else if (naSelf || ancestorNA) {
      const stats = this.groupAccountStats(p, key);
      if (stats.allIn && stats.total) {
        const pct = this.partnerPct(p, key);
        return `<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${pill("Exceção")}
          <span style="font-size:0.72rem;font-weight:800;color:#105436;min-width:42px;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
          ${iconBtn("Deixar o grupo fora", `ParametrizacaoParceiroApp.excludeSubtreeExceptions('${key}')`, "ban", "#94a3b8")}
        </div>`;
      }
      return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
        ${pill(naSelf ? "Fora" : "Fora (herda)")}
        ${iconBtn(naSelf ? "Incluir o grupo no rateio" : "Incluir todas as contas deste grupo", naSelf
          ? `ParametrizacaoParceiroApp.setSubtreeNA('${key}', false)`
          : `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "undo-2", "#105436")}
        ${naSelf ? iconBtn("Incluir contas uma a uma (mantém o grupo fora)", `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "check", "#105436") : ""}
      </div>`;
    }

    const custom = obra && obra.accountShares && Object.prototype.hasOwnProperty.call(obra.accountShares, key);
    const pct = this.partnerPct(p, key);
    const def = obra ? obra.defaultPartnerShare : 0;
    return `<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <div style="width:72px;height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;" title="Parceiro ${pct.toFixed(0)}% · Moura Leite ${(100 - pct).toFixed(0)}%">
        <div data-pp-bar="${this.esc(key)}" style="width:${pct}%;height:100%;background:#105436;"></div>
      </div>
      <input type="number" min="0" max="100" step="0.01" value="${custom ? pct : ""}" placeholder="${def}" data-pp-placeholder
        title="Percentual do parceiro nesta obra. Vazio herda o padrão (${def}%)."
        onclick="event.stopPropagation()"
        onchange="ParametrizacaoParceiroApp.setAccountShare('${key}', this.value)"
        style="width:58px;height:26px;border:1px solid ${custom ? "#105436" : "#e2e8f0"};border-radius:6px;text-align:right;padding:0 6px;font-size:0.75rem;font-weight:700;">
      <span data-pp-pct="${this.esc(key)}" style="font-size:0.72rem;font-weight:800;color:#105436;min-width:42px;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
      <button type="button" title="Fora da parceria" onclick="event.stopPropagation();ParametrizacaoParceiroApp.${isAccount ? `toggleNA('${key}', true)` : `setSubtreeNA('${key}', true)`}"
        style="width:26px;height:26px;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;"
        onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='#94a3b8';this.style.background='transparent'">
        <i data-lucide="ban" style="width:14px;height:14px;"></i>
      </button>
    </div>`;
  },

  matrixHtml(p) {
    if (this.isSociedade(p)) {
      return `<div class="crm-card" style="padding:18px;background:#f8fafc;">
        <h3 style="margin:0 0 6px;font-size:0.95rem;color:var(--color-primary);">Sem rateio — sociedade</h3>
        <p style="margin:0;font-size:0.82rem;color:#64748b;line-height:1.45;">
          Nesta SPE não se aplica percentual por centro de custo. O resultado da operação é dos sócios e segue distribuição de lucro.
        </p>
      </div>`;
    }
    const visao = this.dfcVisao();
    const groups = visao.groups || [];
    const obra = this.currentObra(p);
    this.expanded = this.expanded || new Set();
    const roots = groups.filter(g => !g.parentId && !this.isDfcHiddenForParceria(p, g));
    const body = roots.map(n => this.dfcNodeRows(p, n, groups, 0, [])).join("");
    const def = obra ? obra.defaultPartnerShare : 0;
    return `
      <div>
        ${this.obraChipsHtml(p, false)}
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:360px;">
        <div style="padding:12px 15px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
          <span style="font-weight:700;font-size:0.9rem;color:#1e293b;display:inline-flex;align-items:center;gap:6px;">
            <i data-lucide="folder-tree" style="width:16px;height:16px;"></i>
            Rateio DFC — obra ${this.esc(obra && obra.code)} · ${this.esc(visao.name)}
          </span>
          <div style="font-size:0.72rem;color:#64748b;margin-top:4px;line-height:1.4;">
            Contas 1.xxx entram como receita e 2.xxx como despesa. Campo em branco herda ${def}%.
            Desmarcar um grupo tira as contas; dá para incluir de volta uma a uma ou o grupo inteiro.
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;">
            <button type="button" class="btn btn-outline" title="Apaga o percentual digitado em cada conta. Todas voltam a usar o percentual padrão desta obra." onclick="ParametrizacaoParceiroApp.applyDefaultToAll()" style="height:36px;font-size:0.78rem;white-space:nowrap;">Usar padrão em todas</button>
            <button type="button" class="btn btn-primary" title="Copia as contas ligadas e desligadas desta obra para as outras obras deste parceiro. O percentual de cada obra não muda." onclick="ParametrizacaoParceiroApp.replicarLigacoes()" style="height:36px;font-size:0.78rem;white-space:nowrap;">Replicar nas outras obras</button>
            ${this.importarRateioHtml()}
          </div>
        </div>
        <div id="pp-tree-scroll" style="flex:1;overflow:auto;padding:15px;background:#fff;">
          ${body || `<div style="text-align:center;color:#94a3b8;padding:28px;font-size:0.85rem;">DFC Padrão sem nós. Configure em Plano Financeiro e Visões.</div>`}
        </div>
      </div>
      </div>
    `;
  },

  dfcNodeRows(p, node, groups, level, ancestors) {
    const children = groups.filter(g => g.parentId === node.id && !this.isDfcHiddenForParceria(p, g));
    const accounts = node.accounts || [];
    const hasKids = children.length > 0 || accounts.length > 0;
    const expanded = this.expanded.has(String(node.id));
    const naSelf = !!(this.currentObra(p) && this.currentObra(p).naNodes && this.currentObra(p).naNodes[node.id]);
    const ancestorNA = ancestors.some(a => this.currentObra(p) && this.currentObra(p).naNodes && this.currentObra(p).naNodes[a]);
    const stats = this.groupAccountStats(p, node.id);
    const partial = stats.partial;
    const na = (ancestorNA || naSelf) && !partial && !stats.allIn;

    let bg = "#fff", borderLeft = "#cbd5e1", icon = "folder";
    if (node.type === "total_n1" || level === 0) { bg = "#f8fafc"; borderLeft = "#0f766e"; icon = "layers"; }
    if (node.type === "totalizadora") { bg = "#fff"; borderLeft = "#3b82f6"; icon = "folder-open"; }
    if (node.type === "resultado") { bg = "#fff"; borderLeft = "#eab308"; icon = "file-text"; }
    if (na) { bg = "#f8fafc"; borderLeft = "#cbd5e1"; }

    const chevron = hasKids
      ? `<div style="display:flex;align-items:center;gap:0;position:relative;">
           <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${node.id}', 'this')" title="Recolher / expandir este"
             style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;">
             <i data-lucide="${expanded ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>
           </button>
           <button type="button" onclick="ParametrizacaoParceiroApp.openNodeFoldMenu(event, '${node.id}')" title="Recolher este ou o nível inteiro"
             style="background:none;border:none;cursor:pointer;padding:0 2px;color:#94a3b8;display:flex;align-items:center;">
             <i data-lucide="chevrons-up-down" style="width:12px;height:12px;"></i>
           </button>
         </div>`
      : `<span style="width:14px;"></span>`;

    let html = `
      <div style="margin-left:${level * 20}px;margin-bottom:5px;opacity:${na ? 0.72 : 1};">
        <div style="background:${bg};border:1px solid #e2e8f0;border-left:4px solid ${borderLeft};border-radius:6px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
            ${chevron}
            <i data-lucide="${icon}" style="width:14px;height:14px;color:${borderLeft};flex-shrink:0;"></i>
            <span style="font-weight:${node.type === "total_n1" || level === 0 ? "700" : "600"};font-size:0.85rem;color:#1e293b;">${this.esc(node.name)}</span>
          </div>
          ${this.rateioControlsHtml(p, node.id, false, ancestorNA, naSelf, partial)}
        </div>
    `;

    if (expanded) {
      children.forEach(ch => { html += this.dfcNodeRows(p, ch, groups, level + 1, ancestors.concat(node.id)); });
      if (accounts.length) {
        html += `<div style="margin-left:28px;margin-top:5px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px;padding-left:10px;border-left:2px solid #e2e8f0;">`;
        accounts.forEach(accId => {
          const naAcc = this.isAccountNA(p, accId);
          html += `
            <div style="background:#fff;border:1px solid #cbd5e1;padding:4px 8px;border-radius:4px;font-size:0.75rem;display:flex;justify-content:space-between;align-items:center;gap:8px;opacity:${naAcc ? 0.72 : 1};">
              <div style="min-width:0;"><strong style="color:#0f172a;">${this.esc(accId)}</strong> <span style="color:#64748b;">${this.esc(this.catName(accId))}</span></div>
              ${this.rateioControlsHtml(p, accId, true, false, naAcc, false)}
            </div>`;
        });
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }
};

window.ParametrizacaoParceiroApp = ParametrizacaoParceiroApp;
window.obraFromCostCenter = (id) => ParametrizacaoParceiroApp.obraFromCc(id);
