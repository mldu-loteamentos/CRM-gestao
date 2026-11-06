/**
 * Segurança · Usuários online
 * Cada navegador logado grava um sinal a cada minuto.
 * A tela considera online quem deu sinal nos últimos 3 minutos.
 * Advogados no mesmo login gravam um documento por navegador, para um não apagar o outro.
 */
const UsuariosOnline = {
  COLLECTION: "usuarios_online",
  BEAT_MS: 60000,
  ONLINE_MS: 3 * 60000,
  IDLE_MS: 5 * 60000,
  RECENT_MS: 24 * 3600000,
  lastUse: 0,
  user: null,
  tab: "",
  timer: null,
  rows: [],
  loaded: false,
  error: "",
  unsub: null,
  clock: null,
  aba: "agora",
  acessoEmail: "",
  acessoOpen: false,
  acessoQ: "",
  recorte: "",
  sortAcesso: { campo: "ultimo", dir: 1 },
  cadastro: null,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fb() {
    const db = window.firebaseDb;
    const f = window.firebaseCollections;
    return db && f && f.setDoc && f.doc ? { db, f } : null;
  },

  docId(email) {
    return String(email || "").trim().toLowerCase().replace(/\//g, "_");
  },

  sessionId() {
    let id = "";
    try { id = sessionStorage.getItem("crm_presence_sid") || ""; } catch (e) {}
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem("crm_presence_sid", id); } catch (e) {}
    }
    return id;
  },

  presenceId(user) {
    const email = this.docId(user && user.email);
    const compartilhado = window.crmAcessoAdvogadoCompartilhado && window.crmAcessoAdvogadoCompartilhado(user);
    if (!email || !compartilhado) return email;
    return email + "__" + this.sessionId();
  },

  storeKey(name) {
    return "crm_presence_" + name + ":" + this.presenceId(this.user);
  },

  sessionStamp() {
    const now = Date.now();
    let since = 0;
    let last = 0;
    try {
      since = Number(localStorage.getItem(this.storeKey("since"))) || 0;
      last = Number(localStorage.getItem(this.storeKey("beat"))) || 0;
    } catch (e) {}
    let anterior = null;
    if (!since || !last || now - last > this.ONLINE_MS) {
      if (since && last) anterior = { since: since, last: last };
      since = now;
    }
    try {
      localStorage.setItem(this.storeKey("since"), String(since));
      localStorage.setItem(this.storeKey("beat"), String(now));
    } catch (e) {}
    return { since: since, anterior: anterior };
  },

  async sessoesGravadas(ref) {
    const fb = this.fb();
    if (!fb || !fb.f.getDoc) return [];
    try {
      const snap = await fb.f.getDoc(ref);
      const data = snap && snap.exists && snap.exists() ? (snap.data() || {}) : {};
      return Array.isArray(data.sessoes) ? data.sessoes : [];
    } catch (e) {
      return null;
    }
  },

  montarSessoes(remotas, stamp, encerrar) {
    const map = new Map();
    (remotas || []).forEach((s) => {
      if (s && s.since) map.set(Number(s.since), Object.assign({}, s));
    });
    if (stamp.anterior) {
      const prev = map.get(stamp.anterior.since) || { since: stamp.anterior.since, agent: this.agent() };
      prev.last = Math.max(Number(prev.last) || 0, stamp.anterior.last);
      if (!prev.end) prev.end = stamp.anterior.last;
      map.set(prev.since, prev);
    }
    const agora = Date.now();
    const cur = map.get(stamp.since) || { since: stamp.since, agent: this.agent() };
    cur.last = agora;
    if (!cur.agent) cur.agent = this.agent();
    if (encerrar) {
      cur.end = agora;
      cur.saiu = true;
    } else if (!cur.saiu) {
      delete cur.end;
    }
    map.set(cur.since, cur);
    return Array.from(map.values()).sort((a, b) => a.since - b.since).slice(-80);
  },

  agent() {
    const ua = navigator.userAgent || "";
    const browser = /Edg\//.test(ua) ? "Edge" : (/OPR\//.test(ua) ? "Opera" : (/Firefox\//.test(ua) ? "Firefox" : (/Chrome\//.test(ua) ? "Chrome" : (/Safari\//.test(ua) ? "Safari" : "Navegador"))));
    const os = /Windows/.test(ua) ? "Windows" : (/Android/.test(ua) ? "Android" : (/iPhone|iPad/.test(ua) ? "iOS" : (/Mac OS/.test(ua) ? "macOS" : (/Linux/.test(ua) ? "Linux" : ""))));
    return os ? browser + " · " + os : browser;
  },

  tabLabel(id) {
    if (!id) return "";
    const link = document.querySelector('[data-tab="' + id + '"] > a');
    const text = link ? String(link.getAttribute("title") || link.textContent || "").replace(/\s+/g, " ").trim() : "";
    return text || id;
  },

  async beat() {
    const fb = this.fb();
    const u = this.user;
    if (!fb || !u || !u.email) return;
    const stamp = this.sessionStamp();
    const pessoa = u.atuando || {};
    const emailPessoa = String(pessoa.email || u.email || "").toLowerCase();
    const conta = String(u._emailConta || u.email || "").toLowerCase();
    const ref = fb.f.doc(fb.db, this.COLLECTION, this.presenceId(u));
    const remotas = await this.sessoesGravadas(ref);
    const payload = {
      email: emailPessoa,
      name: pessoa.name || u.name || "",
      contaEmail: conta,
      contaName: u._nomeConta || "",
      profile: u.profile_name || "",
      since: stamp.since,
      lastSeen: Date.now(),
      lastSeenAt: fb.f.serverTimestamp ? fb.f.serverTimestamp() : null,
      tab: this.tab || "",
      tabLabel: this.tabLabel(this.tab),
      agent: this.agent(),
      lastUse: this.lastUse || Date.now(),
      online: true
    };
    if (remotas) payload.sessoes = this.montarSessoes(remotas, stamp, false);
    try {
      await fb.f.setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn("[usuarios-online] sinal não gravado:", e);
    }
  },

  markUse() {
    this.lastUse = Date.now();
  },

  bindUse() {
    if (this._useBound) return;
    this._useBound = true;
    const mark = () => { this.lastUse = Date.now(); };
    ["click", "keydown", "scroll", "touchstart", "wheel"].forEach((ev) => {
      document.addEventListener(ev, mark, { capture: true, passive: true });
    });
  },

  start(user) {
    if (!user || !user.email) return;
    this.user = user;
    this.bindUse();
    if (!this.lastUse) this.markUse();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.beat(), this.BEAT_MS);
    this.beat();
  },

  async stop() {
    const fb = this.fb();
    const u = this.user;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!u || !u.email) return;
    let since = 0;
    try { since = Number(localStorage.getItem(this.storeKey("since"))) || 0; } catch (e) {}
    try {
      localStorage.removeItem(this.storeKey("since"));
      localStorage.removeItem(this.storeKey("beat"));
    } catch (e) {}
    if (!fb) return;
    const ref = fb.f.doc(fb.db, this.COLLECTION, this.presenceId(u));
    const payload = { online: false, logoutAt: Date.now() };
    if (since) {
      const remotas = await this.sessoesGravadas(ref);
      if (remotas) payload.sessoes = this.montarSessoes(remotas, { since: since, anterior: null }, true);
    }
    try {
      await fb.f.setDoc(ref, payload, { merge: true });
    } catch (e) {}
  },

  seenAt(row) {
    const ts = row && row.lastSeenAt;
    if (ts && typeof ts.toMillis === "function") return ts.toMillis();
    return Number(row && row.lastSeen) || 0;
  },

  isOnline(row, now) {
    return row.online !== false && now - this.seenAt(row) <= this.ONLINE_MS;
  },

  duration(ms) {
    const min = Math.floor(Math.max(0, ms) / 60000);
    if (min < 1) return "menos de 1 min";
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    if (d) return d + " d" + (h ? " " + h + " h" : "");
    if (h) return h + " h" + (m ? " " + m + " min" : "");
    return m + " min";
  },

  ago(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    if (s < 60) return "agora";
    return "há " + this.duration(ms);
  },

  usoDe(row, now) {
    const ts = Number(row && row.lastUse) || 0;
    if (!ts) return { texto: "—", ocioso: false };
    const passou = now - ts;
    const ocioso = passou >= this.IDLE_MS;
    return {
      texto: ocioso ? "sem uso há " + this.duration(passou) : this.ago(passou),
      ocioso
    };
  },

  when(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    const today = new Date();
    const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return "hoje, " + hm;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + ", " + hm;
  },

  initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || "?").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
  },

  listen() {
    const fb = this.fb();
    if (!fb || !fb.f.onSnapshot || !fb.f.collection) {
      this.error = "Firebase indisponível. Atualize a página.";
      this.render();
      return;
    }
    if (this.unsub) return;
    this.unsub = fb.f.onSnapshot(fb.f.collection(fb.db, this.COLLECTION), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
      this.rows = rows;
      this.loaded = true;
      this.error = "";
      this.render();
    }, (err) => {
      console.warn("[usuarios-online] leitura:", err);
      this.error = "Não foi possível ler os usuários online no Firebase.";
      this.loaded = true;
      this.render();
    });
    if (!this.clock) this.clock = setInterval(() => { if (this.aba !== "acessos") this.render(); }, 30000);
  },

  unlisten() {
    if (this.unsub) {
      try { this.unsub(); } catch (e) {}
    }
    this.unsub = null;
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  },

  setAba(id) {
    this.aba = id === "acessos" ? "acessos" : "agora";
    if (this.aba === "acessos") {
      this.garantirUsuarios().then(() => this.render());
      return;
    }
    this.render();
  },

  async garantirUsuarios() {
    if (Array.isArray(this.cadastro) && this.cadastro.length) return;
    if (typeof window.syncCrmUsersFromFirebase === "function") {
      try {
        const raw = await window.syncCrmUsersFromFirebase();
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length) {
          this.cadastro = parsed;
          return;
        }
      } catch (e) {}
    }
    try { this.cadastro = JSON.parse(localStorage.getItem("crm_users") || "[]"); } catch (e) { this.cadastro = []; }
    if (!Array.isArray(this.cadastro)) this.cadastro = [];
  },

  ativos() {
    const lista = Array.isArray(this.cadastro) ? this.cadastro : [];
    return lista.filter((u) => u && u.email && String(u.status || "").toUpperCase() === "ATIVO");
  },

  nomePerfil(id) {
    const chave = String(id || "");
    const profiles = (window.ConfigUsersApp && ConfigUsersApp.profiles) || [];
    const p = profiles.find((x) => x && (String(x.id) === chave || String(x.name) === chave));
    return (p && p.name) || chave || "—";
  },

  emailLinha(row) {
    return String((row && (row.email || row.id)) || "").split("__")[0].trim().toLowerCase();
  },

  sessoesDe(email) {
    const alvo = String(email || "").toLowerCase();
    const lista = [];
    this.rows.forEach((row) => {
      if (this.emailLinha(row) !== alvo) return;
      const gravadas = Array.isArray(row.sessoes) ? row.sessoes : [];
      gravadas.forEach((s) => {
        if (!s || !s.since) return;
        lista.push({
          since: Number(s.since) || 0,
          last: Number(s.last) || Number(s.end) || Number(s.since) || 0,
          end: s.end ? Number(s.end) : 0,
          saiu: !!s.saiu,
          agent: s.agent || row.agent || ""
        });
      });
      if (!gravadas.length && (row.since || row.lastSeen)) {
        lista.push({
          since: Number(row.since) || Number(row.lastSeen) || 0,
          last: Number(row.lastSeen) || Number(row.since) || 0,
          end: row.online === false ? (Number(row.logoutAt) || Number(row.lastSeen) || 0) : 0,
          saiu: row.online === false && !!row.logoutAt,
          agent: row.agent || "",
          legado: true
        });
      }
    });
    const vistas = new Set();
    return lista.filter((s) => {
      if (!s.since || vistas.has(s.since)) return false;
      vistas.add(s.since);
      return true;
    }).sort((a, b) => b.since - a.since);
  },

  linhasAcesso(now) {
    const porEmail = new Map();
    this.rows.forEach((row) => {
      const email = this.emailLinha(row);
      if (!email) return;
      const atual = porEmail.get(email) || { ultimo: 0, online: false };
      const visto = this.seenAt(row);
      if (visto > atual.ultimo) atual.ultimo = visto;
      if (this.isOnline(row, now)) atual.online = true;
      porEmail.set(email, atual);
    });
    return this.ativos().map((u) => {
      const email = String(u.email || "").trim().toLowerCase();
      const sinal = porEmail.get(email) || { ultimo: 0, online: false };
      const sessoes = this.sessoesDe(email);
      const ultimoSessao = sessoes.reduce((m, s) => Math.max(m, s.last || s.since || 0), 0);
      return {
        email: email,
        nome: String(u.name || email).trim(),
        perfil: this.nomePerfil(u.profile_name),
        ultimo: Math.max(sinal.ultimo || 0, ultimoSessao || 0),
        online: !!sinal.online,
        sessoes: sessoes
      };
    });
  },

  ordenar(campo) {
    if (this.sortAcesso.campo === campo) this.sortAcesso.dir = -this.sortAcesso.dir;
    else this.sortAcesso = { campo: campo, dir: 1 };
    this.render();
  },

  escolher(email) {
    const id = String(email || "").toLowerCase();
    this.acessoEmail = this.acessoEmail === id ? "" : id;
    this.acessoOpen = false;
    this.render();
  },

  recorteAcesso(id) {
    const alvo = id === "nunca" || id === "parado" ? id : "";
    this.recorte = this.recorte === alvo ? "" : alvo;
    this.acessoEmail = "";
    this.acessoOpen = false;
    this.render();
  },

  filtroAcessoOpts() {
    const items = this.linhasAcesso(Date.now())
      .sort((a, b) => {
        const an = a.ultimo ? 1 : 0;
        const bn = b.ultimo ? 1 : 0;
        if (an !== bn) return an - bn;
        return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
      })
      .map((u) => ({
        id: u.email,
        label: String(u.nome || u.email).toUpperCase(),
        group: u.ultimo ? "Já acessaram" : "Nunca acessaram",
        groupClass: u.ultimo ? "" : "is-nunca"
      }));
    return {
      id: "uo-acesso-user",
      label: "Usuário",
      items: items,
      selectedIds: this.acessoEmail ? [this.acessoEmail] : [],
      open: this.acessoOpen,
      query: this.acessoQ,
      single: true,
      emptyMeansAll: false,
      emptyLabel: "Selecione",
      keepOrder: true,
      extraClass: "ml-emp-filter--corte",
      nouns: { singular: "usuário", plural: "usuários", none: "Nenhum usuário", noMatch: "Nenhum usuário com esse nome." }
    };
  },

  bindFiltroAcesso() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("uo-acesso-user", {
      toggleOpen() {
        self.acessoOpen = !self.acessoOpen;
        self.render();
      },
      close() {
        self.acessoOpen = false;
        self.render();
      },
      setQuery(q) {
        self.acessoQ = q;
        const list = document.getElementById("uo-acesso-user-list");
        if (!list) return;
        list.innerHTML = MlEmpresaFilter.listHtml(self.filtroAcessoOpts());
      },
      toggleId(itemId, on) {
        self.acessoEmail = on ? String(itemId || "").toLowerCase() : "";
        self.acessoOpen = true;
        self.render();
      }
    });
  },

  abasHtml() {
    const tabs = [
      { id: "agora", label: "Agora", icon: "users" },
      { id: "acessos", label: "Acessos", icon: "history" }
    ];
    return `<div class="ml-tabs" role="tablist" style="margin-bottom:16px;">
      ${tabs.map((t) => `
        <button type="button" role="tab" aria-selected="${this.aba === t.id}"
          class="ml-tab ${this.aba === t.id ? "is-active" : ""}"
          onclick="UsuariosOnline.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>
      `).join("")}
    </div>`;
  },

  render() {
    const root = document.getElementById("usuarios-online-root");
    if (!root) return;
    if (this.aba === "acessos") {
      this.renderAcessos(root);
      return;
    }
    this.renderAgora(root);
  },

  renderAgora(root) {
    const now = Date.now();
    const me = this.presenceId(this.user);
    const online = this.rows.filter((r) => this.isOnline(r, now))
      .sort((a, b) => (Number(a.since) || now) - (Number(b.since) || now));
    const ociosos = online.filter((r) => this.usoDe(r, now).ocioso).length;
    const recent = this.rows.filter((r) => !this.isOnline(r, now) && now - this.seenAt(r) <= this.RECENT_MS)
      .sort((a, b) => this.seenAt(b) - this.seenAt(a));
    const longest = online.length ? now - (Number(online[0].since) || now) : 0;

    const th = (label, right) => `<th style="padding:9px 12px;text-align:${right ? "right" : "left"};font-weight:700;white-space:nowrap;">${label}</th>`;
    const userCell = (r, live) => `
      <td style="padding:9px 12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${live ? "#105436" : "#cbd5e1"};color:#fff;font-size:0.72rem;font-weight:800;flex:0 0 32px;">
            ${this.esc(this.initials(r.name || r.email))}
            ${live ? '<span style="position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff;"></span>' : ""}
          </span>
          <span style="min-width:0;">
            <span style="display:block;font-weight:800;color:#0f172a;">${this.esc(r.name || r.email)}${r.id === me ? ' <span style="font-size:0.66rem;font-weight:800;color:#105436;background:#d1fae5;border-radius:999px;padding:1px 7px;margin-left:4px;">você</span>' : ""}</span>
            <span style="display:block;font-size:0.72rem;color:#64748b;">${this.esc(r.email || r.id)}</span>
            ${r.contaEmail && String(r.contaEmail).toLowerCase() !== String(r.email || "").toLowerCase() ? `<span style="display:block;font-size:0.68rem;color:#92400e;">Entrou pela conta de ${this.esc(r.contaName || r.contaEmail)}</span>` : ""}
          </span>
        </div>
      </td>`;

    const usoCell = (r) => {
      const uso = this.usoDe(r, now);
      const cor = uso.ocioso ? "#b45309" : "#64748b";
      return `<td style="padding:9px 12px;text-align:right;color:${cor};font-weight:${uso.ocioso ? 800 : 500};white-space:nowrap;">${this.esc(uso.texto)}</td>`;
    };
    const onlineRows = online.map((r) => `<tr style="border-top:1px solid #eef2f6;">
        ${userCell(r, true)}
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.profile || "—")}</td>
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.tabLabel || r.tab || "—")}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:#105436;white-space:nowrap;">${this.duration(now - (Number(r.since) || now))}</td>
        <td style="padding:9px 12px;text-align:right;color:#334155;white-space:nowrap;">${this.when(Number(r.since))}</td>
        ${usoCell(r)}
        <td style="padding:9px 12px;color:#64748b;white-space:nowrap;">${this.esc(r.agent || "—")}</td>
      </tr>`).join("");

    const recentRows = recent.map((r) => `<tr style="border-top:1px solid #eef2f6;">
        ${userCell(r, false)}
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.profile || "—")}</td>
        <td style="padding:9px 12px;text-align:right;color:#334155;white-space:nowrap;">${this.ago(now - this.seenAt(r))}</td>
        ${usoCell(r)}
        <td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">${r.online === false ? "Saiu pelo botão Sair" : "Fechou o navegador"}</td>
      </tr>`).join("");

    const card = (label, value, color) => `
      <div class="crm-card" style="padding:14px 16px;">
        <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div>
        <div style="font-size:1.6rem;font-weight:800;color:${color};">${value}</div>
      </div>`;

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        ${this.abasHtml()}
        <p style="margin:0 0 14px;font-size:0.82rem;color:#64748b;max-width:760px;">
          Quem está com a página aberta entra na lista. Sem aviso do navegador por 3 minutos, a pessoa sai.
          Último uso é o último clique, tecla ou rolagem. Sem isso por 5 minutos, a linha fica como sem uso.
        </p>

        ${this.error ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#991b1b;background:#fef2f2;">${this.esc(this.error)}</div>` : ""}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;">
          ${card("Online agora", this.loaded ? online.length : "…", "#105436")}
          ${card("Há mais tempo online", online.length ? this.esc(this.duration(longest)) : "—", "#0f172a")}
          ${card("Na tela, sem uso", this.loaded ? ociosos : "…", "#b45309")}
          ${card("Saíram nas últimas 24 h", this.loaded ? recent.length : "…", "#64748b")}
        </div>

        <div class="crm-card" style="padding:0;overflow:hidden;margin-bottom:12px;">
          <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">Logados agora</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#64748b;">
                ${th("Usuário")}${th("Perfil")}${th("Tela atual")}${th("Online há", true)}${th("Desde", true)}${th("Último uso", true)}${th("Navegador")}
              </tr></thead>
              <tbody>${onlineRows || `<tr><td colspan="7" style="padding:18px;color:#94a3b8;text-align:center;">${this.loaded ? "Ninguém online agora." : "Carregando…"}</td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="crm-card" style="padding:0;overflow:hidden;">
          <div style="padding:10px 14px;font-weight:800;color:#64748b;border-bottom:1px solid #e2e8f0;">Saíram nas últimas 24 horas</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#64748b;">
                ${th("Usuário")}${th("Perfil")}${th("Visto por último", true)}${th("Último uso", true)}${th("Como saiu", true)}
              </tr></thead>
              <tbody>${recentRows || `<tr><td colspan="5" style="padding:18px;color:#94a3b8;text-align:center;">${this.loaded ? "Ninguém saiu nas últimas 24 horas." : "Carregando…"}</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  renderAcessos(root) {
    const now = Date.now();
    const trinta = 30 * 86400000;
    const linhas = this.linhasAcesso(now);
    const dir = this.sortAcesso.dir;
    const campo = this.sortAcesso.campo;
    const ordenadas = linhas.slice().sort((a, b) => {
      let va;
      let vb;
      if (campo === "nome") { va = a.nome; vb = b.nome; }
      else if (campo === "perfil") { va = a.perfil; vb = b.perfil; }
      else if (campo === "sessoes") { va = a.sessoes.length; vb = b.sessoes.length; }
      else { va = a.ultimo || 0; vb = b.ultimo || 0; }
      if (typeof va === "string") return va.localeCompare(vb, "pt", { sensitivity: "base" }) * dir;
      return (va - vb) * dir;
    });
    const nuncaLista = linhas.filter((u) => !u.ultimo).sort((a, b) => a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" }));
    const paradosLista = linhas.filter((u) => u.ultimo && now - u.ultimo > trinta);
    let base = ordenadas;
    if (this.recorte === "nunca") base = ordenadas.filter((u) => !u.ultimo);
    else if (this.recorte === "parado") base = ordenadas.filter((u) => u.ultimo && now - u.ultimo > trinta);
    const visiveis = this.acessoEmail ? base.filter((u) => u.email === this.acessoEmail) : base;
    const th = (campoId, label, right) => `<th onclick="UsuariosOnline.ordenar('${campoId}')" style="cursor:pointer;user-select:none;padding:9px 12px;text-align:${right ? "right" : "left"};font-weight:700;white-space:nowrap;color:#105436;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html(this.filtroAcessoOpts()) : "";
    const card = (id, label, value, color) => {
      const on = id ? this.recorte === id : !this.recorte;
      return `<button type="button" class="crm-card" onclick="UsuariosOnline.recorteAcesso('${id}')" style="padding:14px 16px;text-align:left;cursor:pointer;font:inherit;width:100%;border:${on && id ? "2px solid " + color : "1px solid rgba(16, 84, 54, 0.05)"};box-shadow:${on && id ? "inset 0 0 0 1px " + color : "var(--shadow-sm)"};">
        <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div>
        <div style="font-size:1.6rem;font-weight:800;color:${color};">${value}</div>
      </button>`;
    };
    const chips = nuncaLista.map((u) => {
      const on = u.email === this.acessoEmail;
      return `<button type="button" data-email="${this.esc(u.email)}" onclick="UsuariosOnline.escolher(this.getAttribute('data-email'))" style="border:1px solid #fdba74;background:${on ? "#ffedd5" : "#fff"};color:#9a3412;font-weight:800;font-size:0.75rem;border-radius:999px;padding:4px 10px;cursor:pointer;">${this.esc(u.nome)}</button>`;
    }).join("");
    const situacao = (u) => {
      if (u.online) return { texto: "Online agora", cor: "#105436" };
      if (!u.ultimo) return { texto: "Nunca acessou", cor: "#b45309" };
      return { texto: this.ago(now - u.ultimo), cor: now - u.ultimo > trinta ? "#b45309" : "#334155" };
    };
    const rows = visiveis.map((u) => {
      const sit = situacao(u);
      const sel = u.email === this.acessoEmail;
      const fundo = sel ? "#f0fdf4" : (!u.ultimo ? "#fffbeb" : "transparent");
      return `<tr data-email="${this.esc(u.email)}" onclick="UsuariosOnline.escolher(this.getAttribute('data-email'))" style="border-top:1px solid #eef2f6;cursor:pointer;background:${fundo};">
        <td style="padding:9px 12px;">
          <span style="display:block;font-weight:800;color:#0f172a;">${this.esc(u.nome)}</span>
          <span style="display:block;font-size:0.72rem;color:#64748b;">${this.esc(u.email)}</span>
        </td>
        <td style="padding:9px 12px;color:#334155;">${this.esc(u.perfil)}</td>
        <td style="padding:9px 12px;text-align:right;white-space:nowrap;color:#334155;">${u.ultimo ? this.when(u.ultimo) : "—"}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:700;color:#0f172a;">${u.sessoes.length}</td>
        <td style="padding:9px 12px;text-align:right;white-space:nowrap;font-weight:800;color:${sit.cor};">${this.esc(sit.texto)}</td>
      </tr>`;
    }).join("");
    const escolhido = linhas.find((u) => u.email === this.acessoEmail);
    const sessoes = escolhido ? escolhido.sessoes : [];
    const sessRows = sessoes.map((s) => {
      const fim = s.end || 0;
      const aberta = !fim && escolhido.online && (now - (s.last || s.since)) <= this.ONLINE_MS;
      const ate = fim || s.last || s.since;
      return `<tr style="border-top:1px solid #eef2f6;">
        <td style="padding:9px 12px;white-space:nowrap;">${this.when(s.since)}</td>
        <td style="padding:9px 12px;white-space:nowrap;">${this.when(s.last || s.since)}</td>
        <td style="padding:9px 12px;white-space:nowrap;color:${aberta ? "#105436" : "#334155"};font-weight:${aberta ? 800 : 500};">${aberta ? "Ainda na tela" : (s.saiu ? "Saiu, " + this.when(fim) : this.when(ate))}</td>
        <td style="padding:9px 12px;text-align:right;white-space:nowrap;">${this.duration((aberta ? now : ate) - s.since)}</td>
        <td style="padding:9px 12px;color:#64748b;white-space:nowrap;">${this.esc(s.agent || "—")}</td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        ${this.abasHtml()}
        <p style="margin:0 0 14px;font-size:0.82rem;color:#64748b;max-width:760px;">
          Cadastros ativos e o momento em que cada pessoa entrou no Integra. Quem nunca abriu o sistema desde que o sinal passou a ser gravado aparece como nunca acessou.
          Cada entrada nova fica na lista da pessoa. O que já existia antes desta aba aparece como o último sinal.
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;">
          ${card("", "Com acesso", linhas.length, "#0f172a")}
          ${card("nunca", "Nunca acessaram", nuncaLista.length, "#b45309")}
          ${card("parado", "Sem entrar há 30 dias", paradosLista.length, "#64748b")}
        </div>
        ${nuncaLista.length ? `<div style="margin:-2px 0 14px;">
          <div style="font-size:0.72rem;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:6px;">Quem nunca acessou</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
        </div>` : ""}
        <div style="max-width:360px;margin-bottom:14px;">${filtro}</div>
        <div class="crm-card" style="padding:0;overflow:hidden;margin-bottom:12px;">
          <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">${this.recorte === "nunca" ? "Nunca acessaram" : (this.recorte === "parado" ? "Sem entrar há 30 dias" : "Quem tem acesso")}</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;">
                ${th("nome", "Usuário")}${th("perfil", "Perfil")}${th("ultimo", "Último acesso", true)}${th("sessoes", "Entradas", true)}<th style="padding:9px 12px;text-align:right;font-weight:700;white-space:nowrap;color:#64748b;">Situação</th>
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="5" style="padding:18px;color:#94a3b8;text-align:center;">${!this.cadastro ? "Carregando…" : (this.recorte === "nunca" ? "Todo mundo que tem acesso já entrou." : (this.recorte === "parado" ? "Ninguém está há 30 dias sem entrar." : "Nenhum usuário ativo."))}</td></tr>`}</tbody>
            </table>
          </div>
        </div>
        ${escolhido ? `
        <div class="crm-card" style="padding:0;overflow:hidden;">
          <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">Entradas de ${this.esc(escolhido.nome)}</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#64748b;">
                <th style="padding:9px 12px;text-align:left;">Entrou</th>
                <th style="padding:9px 12px;text-align:left;">Último sinal</th>
                <th style="padding:9px 12px;text-align:left;">Encerrou</th>
                <th style="padding:9px 12px;text-align:right;">Tempo na tela</th>
                <th style="padding:9px 12px;text-align:left;">Navegador</th>
              </tr></thead>
              <tbody>${sessRows || `<tr><td colspan="5" style="padding:18px;color:#94a3b8;text-align:center;">Nenhuma entrada gravada.</td></tr>`}</tbody>
            </table>
          </div>
        </div>` : ""}
      </div>`;
    this.bindFiltroAcesso();
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  init() {
    this.render();
    this.listen();
  }
};

window.UsuariosOnline = UsuariosOnline;

document.addEventListener("tabChanged", (e) => {
  const id = e && e.detail;
  if (typeof id !== "string") return;
  if (id !== "usuarios-online") UsuariosOnline.unlisten();
  if (id === UsuariosOnline.tab) return;
  UsuariosOnline.tab = id;
  if (!UsuariosOnline.user) return;
  UsuariosOnline.markUse();
  clearTimeout(UsuariosOnline._tabBeat);
  UsuariosOnline._tabBeat = setTimeout(() => {
    UsuariosOnline._tabBeat = null;
    UsuariosOnline.beat();
  }, 700);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && UsuariosOnline.user) UsuariosOnline.beat();
});

(function wrapLogout() {
  const auth = window.MouraAuth;
  if (!auth || auth._presenceWrapped || typeof auth.logout !== "function") return;
  const original = auth.logout;
  auth.logout = async function(opts) {
    try {
      await Promise.race([UsuariosOnline.stop(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    } catch (e) {}
    return original.call(this, opts);
  };
  auth._presenceWrapped = true;
})();
