/* Escala de home office da cobrança interna e do back office.
   Segunda, quinta e sexta. O rodízio de três semanas está ancorado em 28/09/2026.
   Feriado nesse dia passa para a quarta da mesma semana. Férias tiram a pessoa do calendário. */
const EscalaHomeOffice = {
  ANCORA: "2026-09-28",
  ALMOCO_HO: "12h30–13h42",
  OPERADORES: [
    { id: "leticia", nome: "Letícia" },
    { id: "michelle", nome: "Michelle" },
    { id: "lucelia", nome: "Lucélia" }
  ],
  /* Cada semana: [segunda, quinta, sexta]. */
  CICLO: [
    ["leticia", "michelle", "lucelia"],
    ["lucelia", "leticia", "michelle"],
    ["michelle", "lucelia", "leticia"]
  ],
  state: { ferias: { leticia: [], michelle: [], lucelia: [] }, ajustes: {}, pronto: false },

  nome(id) {
    const op = this.OPERADORES.find((o) => o.id === id);
    return op ? op.nome : "";
  },

  chaveNome(texto) {
    const n = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (n.indexOf("leticia") >= 0) return "leticia";
    if (n.indexOf("michelle") >= 0) return "michelle";
    if (n.indexOf("lucelia") >= 0) return "lucelia";
    return "";
  },

  eu() {
    const u = window.AppState && window.AppState.currentUser;
    return this.chaveNome(u && (u.name || u.nome || u.email));
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  parse(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  },

  addDias(iso, n) {
    const d = this.parse(iso);
    d.setDate(d.getDate() + n);
    return this.iso(d);
  },

  hoje() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return this.iso(d);
  },

  diaSemana(iso) {
    return this.parse(iso).getDay();
  },

  segundaDaSemana(iso) {
    const d = this.diaSemana(iso);
    const volta = d === 0 ? 6 : d - 1;
    return this.addDias(iso, -volta);
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  },

  diaBr(iso) {
    return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][this.diaSemana(iso)] || "";
  },

  pascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return this.iso(new Date(ano, mes - 1, dia));
  },

  feriados(ano) {
    const pascoa = this.pascoa(ano);
    const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
    const lista = fixos.map((md) => ano + "-" + md);
    lista.push(this.addDias(pascoa, -48), this.addDias(pascoa, -47), this.addDias(pascoa, -2), this.addDias(pascoa, 60));
    return lista;
  },

  ehFeriado(iso) {
    const ano = Number(String(iso).slice(0, 4));
    return this.feriados(ano).indexOf(iso) >= 0;
  },

  ehFimDeSemana(iso) {
    const d = this.diaSemana(iso);
    return d === 0 || d === 6;
  },

  indiceSemana(segunda) {
    const diff = Math.round((this.parse(segunda) - this.parse(this.ANCORA)) / 86400000);
    return Math.floor(diff / 7);
  },

  emFerias(id, iso) {
    const lista = (this.state.ferias && this.state.ferias[id]) || [];
    return lista.some((f) => f.inicio && f.fim && f.inicio <= iso && iso <= f.fim);
  },

  /* Quem cobre o almoço no escritório quando a outra pessoa está em home office. */
  cobertura(ho) {
    if (ho === "leticia") return { cedo: "lucelia", tarde: "michelle" };
    if (ho === "michelle") return { cedo: "lucelia", tarde: "leticia" };
    if (ho === "lucelia") return { cedo: "michelle", tarde: "leticia" };
    return { cedo: "", tarde: "" };
  },

  /* Dias do rodízio entre duas datas, ainda com quem está de férias. */
  escalaBase(de, ate) {
    const dias = [];
    let segunda = this.segundaDaSemana(de);
    const limite = this.segundaDaSemana(ate);
    while (segunda <= limite) {
      const idx = ((this.indiceSemana(segunda) % 3) + 3) % 3;
      const pessoas = this.CICLO[idx];
      const usados = {};
      const nominais = [0, 3, 4];
      const daSemana = [];
      nominais.forEach((off, i) => {
        let data = this.addDias(segunda, off);
        if (this.ehFeriado(data)) {
          const alt = [2, 1].map((o) => this.addDias(segunda, o)).find((d) => !this.ehFeriado(d) && !usados[d]);
          if (!alt) return;
          data = alt;
        }
        usados[data] = true;
        daSemana.push({ data, ho: pessoas[i] });
      });
      daSemana.sort((a, b) => a.data < b.data ? -1 : 1);
      daSemana.forEach((item) => {
        if (item.data < de || item.data > ate) return;
        dias.push(item);
      });
      segunda = this.addDias(segunda, 7);
    }
    return dias;
  },

  mapa(de, ate) {
    const map = {};
    this.escalaBase(de, ate).forEach((d) => { map[d.data] = d.ho; });
    const aj = this.state.ajustes || {};
    Object.keys(aj).forEach((data) => {
      if (data < de || data > ate) return;
      if (!aj[data]) delete map[data];
      else map[data] = aj[data];
    });
    return map;
  },

  mapaAmplo(extraDe, extraAte) {
    let de = this.hoje();
    let ate = this.addDias(de, 84);
    Object.keys(this.state.ajustes || {}).forEach((d) => {
      if (d < de) de = d;
      if (d > ate) ate = d;
    });
    if (extraDe && extraDe < de) de = extraDe;
    if (extraAte && extraAte > ate) ate = extraAte;
    return this.mapa(de, ate);
  },

  gravarMapa(mapa) {
    const chaves = Object.keys(mapa);
    Object.keys(this.state.ajustes || {}).forEach((k) => chaves.push(k));
    if (!chaves.length) {
      this.state.ajustes = {};
      return;
    }
    chaves.sort();
    const base = {};
    this.escalaBase(chaves[0], chaves[chaves.length - 1]).forEach((d) => { base[d.data] = d.ho; });
    const todas = {};
    Object.keys(base).forEach((k) => { todas[k] = true; });
    Object.keys(mapa).forEach((k) => { todas[k] = true; });
    const out = {};
    Object.keys(todas).forEach((data) => {
      const atual = mapa[data] || "";
      const original = base[data] || "";
      if (atual !== original) out[data] = atual;
    });
    Object.keys(this.state.ajustes || {}).forEach((data) => {
      if (data < chaves[0] || data > chaves[chaves.length - 1]) out[data] = this.state.ajustes[data];
    });
    this.state.ajustes = out;
  },

  diaDe(data, ho) {
    if (!ho || this.emFerias(ho, data)) return null;
    const cob = this.cobertura(ho);
    return {
      data,
      ho,
      cedo: this.emFerias(cob.cedo, data) ? "" : cob.cedo,
      tarde: this.emFerias(cob.tarde, data) ? "" : cob.tarde,
      cedoFerias: this.emFerias(cob.cedo, data),
      tardeFerias: this.emFerias(cob.tarde, data)
    };
  },

  /* Dias de home office entre duas datas, já sem quem está de férias. */
  escala(de, ate) {
    const map = this.mapa(de, ate);
    return Object.keys(map).sort().map((data) => this.diaDe(data, map[data])).filter(Boolean);
  },

  proximoDiaUtil(iso) {
    let d = this.addDias(iso, 1);
    let guarda = 0;
    while ((this.ehFimDeSemana(d) || this.ehFeriado(d)) && guarda < 14) {
      d = this.addDias(d, 1);
      guarda += 1;
    }
    return d;
  },

  diaSeguinte() {
    const amanha = this.proximoDiaUtil(this.hoje());
    return this.escala(amanha, amanha)[0] || null;
  },

  semanaDe(segunda) {
    const sexta = this.addDias(segunda, 4);
    return { inicio: segunda, fim: sexta, dias: this.escala(segunda, sexta) };
  },

  semanaAtual() {
    return this.semanaDe(this.segundaDaSemana(this.hoje()));
  },

  semanaQueVem() {
    return this.semanaDe(this.addDias(this.segundaDaSemana(this.hoje()), 7));
  },

  papelNoDia(id, dia) {
    if (!dia) return "";
    if (dia.ho === id) return "Home office · almoço " + this.ALMOCO_HO;
    if (dia.cedo === id) return "Escritório · 12h00–13h12";
    if (dia.tarde === id) return "Escritório · 13h30–14h42";
    if (this.emFerias(id, dia.data)) return "Férias";
    return "";
  },

  podeEditar() {
    if (typeof window.hasFinCrAction !== "function") return true;
    return !!window.hasFinCrAction("regras_cobranca", "editar");
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  feriasVazia() {
    return { leticia: [], michelle: [], lucelia: [] };
  },

  normalizarFerias(bruto) {
    const base = this.feriasVazia();
    const src = bruto && typeof bruto === "object" ? bruto : {};
    this.OPERADORES.forEach((op) => {
      const lista = Array.isArray(src[op.id]) ? src[op.id] : [];
      base[op.id] = lista.map((f) => ({
        inicio: String((f && f.inicio) || "").slice(0, 10),
        fim: String((f && f.fim) || "").slice(0, 10)
      })).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(f.fim) && f.inicio <= f.fim);
    });
    return base;
  },

  normalizarAjustes(bruto) {
    const out = {};
    if (!bruto || typeof bruto !== "object") return out;
    Object.keys(bruto).forEach((k) => {
      const data = String(k).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
      const ho = bruto[k];
      if (ho === "" || ho == null) {
        out[data] = "";
        return;
      }
      if (this.OPERADORES.some((o) => o.id === ho)) out[data] = ho;
    });
    return out;
  },

  pacote(ferias, ajustes) {
    return { ferias: this.normalizarFerias(ferias), ajustes: this.normalizarAjustes(ajustes) };
  },

  lerLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_escala_home_office") || "null");
      if (!raw) return this.pacote(null, null);
      return this.pacote(raw.ferias, raw.ajustes);
    } catch (e) {
      return this.pacote(null, null);
    }
  },

  async lerRemoto() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.getDoc) return null;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "escala_home_office"));
      const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!existe) return null;
      const data = snap.data() || {};
      return this.pacote(data.ferias, data.ajustes);
    } catch (e) {
      console.warn("[Escala HO] leitura", e);
      return null;
    }
  },

  async carregar() {
    const local = this.lerLocal();
    const remoto = await this.lerRemoto();
    const fonte = remoto || local;
    this.state.ferias = fonte.ferias;
    this.state.ajustes = fonte.ajustes;
    this.state.pronto = true;
    try { localStorage.setItem("crm_escala_home_office", JSON.stringify({ ferias: this.state.ferias, ajustes: this.state.ajustes })); } catch (e) {}
  },

  async salvar() {
    const dados = { ferias: this.state.ferias, ajustes: this.state.ajustes || {} };
    try { localStorage.setItem("crm_escala_home_office", JSON.stringify(dados)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "escala_home_office"), dados, { merge: true });
    } catch (e) {
      console.warn("[Escala HO] gravação", e);
    }
  },

  celula(id, ferias, destacar) {
    if (id) return `<strong class="${id === destacar ? "eho-eu" : ""}">${this.esc(this.nome(id))}</strong>`;
    if (ferias) return `<span class="eho-ferias">Férias</span>`;
    return "—";
  },

  tabela(dias, destacar, clicavel) {
    const pode = !!clicavel && this.podeEditar();
    const linhas = dias.map((d) => {
      const meu = destacar && d.ho === destacar;
      const cls = [meu ? "is-meu" : "", pode ? "eho-clicavel" : ""].filter(Boolean).join(" ");
      const click = pode ? ` onclick="EscalaHomeOffice.abrirTroca('${d.data}')" title="Alterar a data ou quem fica de home office"` : "";
      return `<tr class="${cls}"${click}>
        <td>${this.esc(this.dataBr(d.data))}</td>
        <td>${this.esc(this.diaBr(d.data))}</td>
        <td>${this.celula(d.ho, false, destacar)}</td>
        <td>${this.esc(this.ALMOCO_HO)}</td>
        <td>${this.celula(d.cedo, d.cedoFerias, destacar)}</td>
        <td>${this.celula(d.tarde, d.tardeFerias, destacar)}</td>
      </tr>`;
    }).join("");
    return `<table class="eho-tabela">
      <thead><tr><th>Data</th><th>Dia</th><th>Home office</th><th>Almoço HO</th><th>12h00–13h12</th><th>13h30–14h42</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="6">Nenhum home office neste período.</td></tr>`}</tbody>
    </table>`;
  },

  feriasHtml() {
    const pode = this.podeEditar();
    return this.OPERADORES.map((op) => {
      const periodos = (this.state.ferias[op.id] || []).map((f, i) => `
        <div class="eho-periodo">
          <span>Período ${i + 1}: ${this.esc(this.dataBr(f.inicio))} a ${this.esc(this.dataBr(f.fim))}</span>
          ${pode ? `<button type="button" class="tvig-ico is-danger" title="Remover férias" onclick="EscalaHomeOffice.removerFerias('${op.id}', ${i})"><i data-lucide="trash-2"></i></button>` : ""}
        </div>`).join("");
      return `<article class="eho-op">
        <h4>${this.esc(op.nome)}</h4>
        <div class="eho-datas">
          <label>Início<input type="date" id="eho-ini-${op.id}" ${pode ? "" : "disabled"}></label>
          <label>Fim<input type="date" id="eho-fim-${op.id}" ${pode ? "" : "disabled"}></label>
          <button type="button" class="btn btn-primary btn-sm" ${pode ? "" : "disabled"} onclick="EscalaHomeOffice.adicionarFerias('${op.id}')">Incluir período</button>
        </div>
        <div class="eho-periodos">${periodos || `<span class="eho-vazio">Nenhum período. Dá para incluir mais de um.</span>`}</div>
      </article>`;
    }).join("");
  },

  async render() {
    const root = document.getElementById("content-regra-home-office");
    if (!root) return;
    if (!this.state.pronto) await this.carregar();
    const de = this.hoje();
    const ate = this.addDias(de, 84);
    const dias = this.escala(de, ate);
    const sem = this.semanaQueVem();
    const eu = this.eu();
    root.innerHTML = `
      <p class="eho-intro">A escala vale de hoje em diante, em segunda, quinta e sexta. O feriado desses dias passa para a quarta. Quem está de férias sai do home office e da cobertura de almoço no calendário de todo o time. Cada colaboradora pode ter vários períodos de férias. Clique numa data para mudar o dia ou quem fica de home office.</p>
      <h4 class="eho-sec">Férias</h4>
      <div class="eho-ops">${this.feriasHtml()}</div>
      <p id="eho-status" class="eho-status"></p>
      <h4 class="eho-sec">Próxima semana${eu ? " · " + this.esc(this.nome(eu)) : ""}</h4>
      <p class="eho-intro">${this.esc(this.dataBr(sem.inicio))} a ${this.esc(this.dataBr(sem.fim))}. A linha em verde é o home office de quem está logado. Clique na data para editar.</p>
      ${this.tabela(sem.dias, eu, true)}
      <h4 class="eho-sec">Calendário</h4>
      ${this.tabela(dias, eu, true)}`;
    if (window.lucide) window.lucide.createIcons();
  },

  async adicionarFerias(id) {
    if (!this.podeEditar()) return;
    const ini = document.getElementById("eho-ini-" + id);
    const fim = document.getElementById("eho-fim-" + id);
    const inicio = ini && ini.value;
    const final = fim && fim.value;
    const status = document.getElementById("eho-status");
    if (!inicio || !final || inicio > final) {
      if (status) status.textContent = "Informe o início e o fim das férias.";
      return;
    }
    const lista = this.state.ferias[id] || [];
    if (lista.some((f) => f.inicio === inicio && f.fim === final)) {
      if (status) status.textContent = "Esse período já está lançado. Informe outro intervalo.";
      return;
    }
    this.state.ferias[id] = lista.concat([{ inicio, fim: final }]);
    await this.salvar();
    await this.render();
    const msg = document.getElementById("eho-status");
    if (msg) msg.textContent = "Período de férias de " + this.nome(id) + " incluído. O calendário de todo o time foi atualizado.";
    if (window.HomeDashboard && typeof window.HomeDashboard.renderEscalaHome === "function") window.HomeDashboard.renderEscalaHome();
  },

  async removerFerias(id, indice) {
    if (!this.podeEditar()) return;
    this.state.ferias[id] = (this.state.ferias[id] || []).filter((_, i) => i !== indice);
    await this.salvar();
    await this.render();
    if (window.HomeDashboard && typeof window.HomeDashboard.renderEscalaHome === "function") window.HomeDashboard.renderEscalaHome();
  },

  htmlHome(destacar) {
    const atual = this.semanaAtual();
    const prox = this.semanaQueVem();
    const bloco = (titulo, sem) => `
      <section class="eho-home-sem">
        <h4>${titulo}</h4>
        <p>${this.esc(this.dataBr(sem.inicio))} a ${this.esc(this.dataBr(sem.fim))}</p>
        ${this.tabela(sem.dias, destacar, false)}
      </section>`;
    return `<div class="eho-home">
      <h3>Escala de home office</h3>
      <div class="eho-home-grade">
        ${bloco("Esta semana", atual)}
        ${bloco("Próxima semana", prox)}
      </div>
    </div>`;
  },

  abrirTroca(data) {
    if (!this.podeEditar()) return;
    this.fecharTroca();
    const dia = this.escala(data, data)[0];
    if (!dia) return;
    const ops = this.OPERADORES.map((o) => `<option value="${o.id}"${o.id === dia.ho ? " selected" : ""}>${this.esc(o.nome)}</option>`).join("");
    const pop = document.createElement("div");
    pop.id = "eho-troca";
    pop.className = "eho-troca";
    pop.innerHTML = `
      <div class="eho-troca-card" role="dialog" aria-modal="true" aria-labelledby="eho-troca-titulo">
        <h4 id="eho-troca-titulo">Home office de ${this.esc(this.dataBr(data))}</h4>
        <p>Altere a data ou quem fica de home office. Se a nova data já tiver alguém, as duas trocam de dia.</p>
        <div class="eho-troca-campos">
          <label>Data<input type="date" id="eho-troca-data" value="${this.esc(data)}"></label>
          <label>Quem fica<select id="eho-troca-quem">${ops}</select></label>
        </div>
        <p id="eho-troca-aviso" class="eho-troca-aviso"></p>
        <div class="eho-troca-acoes">
          <button type="button" class="btn btn-cancel" onclick="EscalaHomeOffice.fecharTroca()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="EscalaHomeOffice.salvarTroca('${data}')">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    pop.addEventListener("click", (e) => { if (e.target === pop) this.fecharTroca(); });
  },

  fecharTroca() {
    const pop = document.getElementById("eho-troca");
    if (pop) pop.remove();
  },

  avisoTroca(texto) {
    const el = document.getElementById("eho-troca-aviso");
    if (el) el.textContent = texto;
  },

  async salvarTroca(de) {
    if (!this.podeEditar()) return;
    const paraEl = document.getElementById("eho-troca-data");
    const quemEl = document.getElementById("eho-troca-quem");
    const para = paraEl && paraEl.value;
    const ho = quemEl && quemEl.value;
    if (!para || !ho) {
      this.avisoTroca("Informe a data e quem fica de home office.");
      return;
    }
    if (this.ehFimDeSemana(para)) {
      this.avisoTroca("Escolha um dia de semana.");
      return;
    }
    if (this.emFerias(ho, para)) {
      this.avisoTroca(this.nome(ho) + " está de férias nesse dia.");
      return;
    }
    const mapa = this.mapaAmplo(de < para ? de : para, de > para ? de : para);
    if (para !== de && mapa[para] && mapa[para] !== ho) {
      const outro = mapa[para];
      if (this.emFerias(outro, de)) {
        this.avisoTroca(this.nome(outro) + " está de férias em " + this.dataBr(de) + " e não pode assumir essa data.");
        return;
      }
      mapa[de] = outro;
    } else if (para !== de) {
      delete mapa[de];
    }
    mapa[para] = ho;
    this.gravarMapa(mapa);
    this.fecharTroca();
    await this.salvar();
    await this.render();
    const status = document.getElementById("eho-status");
    if (status) status.textContent = "Escala de " + this.dataBr(para) + " atualizada.";
    if (window.HomeDashboard && typeof window.HomeDashboard.renderEscalaHome === "function") window.HomeDashboard.renderEscalaHome();
  },

  cronogramaSemana(destacar) {
    const sem = this.semanaQueVem();
    return `<h4 class="eho-sec">Próxima semana</h4>
      <p class="eho-intro">${this.esc(this.dataBr(sem.inicio))} a ${this.esc(this.dataBr(sem.fim))}.</p>
      ${this.tabela(sem.dias, destacar)}`;
  },

  abrirAviso(dia, destacar) {
    this.fecharAviso();
    const pop = document.createElement("div");
    pop.id = "eho-pop";
    pop.innerHTML = `
      <div class="eho-pop-card" role="dialog" aria-modal="true" aria-labelledby="eho-pop-titulo">
        <img src="Banner/home-office.png" alt="">
        <div class="eho-pop-corpo">
          <p id="eho-pop-titulo">Amanhã, ${this.esc(this.diaBr(dia.data))} ${this.esc(this.dataBr(dia.data))}, você fica em home office.</p>
          <p>O almoço é das <strong>${this.esc(this.ALMOCO_HO)}</strong>.</p>
          ${this.cronogramaSemana(destacar || dia.ho)}
          <div class="eho-pop-acoes"><button type="button" class="btn btn-fechar" onclick="EscalaHomeOffice.fecharAviso()">Fechar</button></div>
        </div>
      </div>`;
    document.body.appendChild(pop);
  },

  fecharAviso() {
    const pop = document.getElementById("eho-pop");
    if (pop) pop.remove();
  },

  async avisar() {
    if (!this.state.pronto) await this.carregar();
    const eu = this.eu();
    if (!eu) return;
    const dia = this.diaSeguinte();
    if (!dia || dia.ho !== eu) return;
    const chave = "crm_ho_popup_" + this.hoje() + "_" + dia.data;
    try { if (localStorage.getItem(chave) === "1") return; } catch (e) {}
    this.abrirAviso(dia, eu);
    try { localStorage.setItem(chave, "1"); } catch (e) {}
  }
};

window.EscalaHomeOffice = EscalaHomeOffice;
