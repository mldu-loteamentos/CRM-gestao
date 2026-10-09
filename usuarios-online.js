/**
 * Segurança · Usuários online
 * Cada navegador logado grava um sinal em usuarios_online/{email} a cada minuto.
 * A tela considera online quem deu sinal nos últimos 3 minutos.
 */
const UsuariosOnline = {
  COLLECTION: "usuarios_online",
  BEAT_MS: 60000,
  ONLINE_MS: 3 * 60000,
  RECENT_MS: 24 * 3600000,
  user: null,
  tab: "",
  timer: null,
  rows: [],
  loaded: false,
  error: "",
  unsub: null,
  clock: null,

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

  storeKey(name) {
    return "crm_presence_" + name + ":" + this.docId(this.user && this.user.email);
  },

  sinceNow() {
    const now = Date.now();
    let since = 0;
    let last = 0;
    try {
      since = Number(localStorage.getItem(this.storeKey("since"))) || 0;
      last = Number(localStorage.getItem(this.storeKey("beat"))) || 0;
    } catch (e) {}
    if (!since || !last || now - last > this.ONLINE_MS) since = now;
    try {
      localStorage.setItem(this.storeKey("since"), String(since));
      localStorage.setItem(this.storeKey("beat"), String(now));
    } catch (e) {}
    return since;
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
    const since = this.sinceNow();
    try {
      await fb.f.setDoc(fb.f.doc(fb.db, this.COLLECTION, this.docId(u.email)), {
        email: String(u.email).toLowerCase(),
        name: u.name || "",
        profile: u.profile_name || "",
        since,
        lastSeen: Date.now(),
        lastSeenAt: fb.f.serverTimestamp ? fb.f.serverTimestamp() : null,
        tab: this.tab || "",
        tabLabel: this.tabLabel(this.tab),
        agent: this.agent(),
        online: true
      }, { merge: true });
    } catch (e) {
      console.warn("[usuarios-online] sinal não gravado:", e);
    }
  },

  start(user) {
    if (!user || !user.email) return;
    this.user = user;
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
    try {
      localStorage.removeItem(this.storeKey("since"));
      localStorage.removeItem(this.storeKey("beat"));
    } catch (e) {}
    if (!fb) return;
    try {
      await fb.f.setDoc(fb.f.doc(fb.db, this.COLLECTION, this.docId(u.email)), {
        online: false,
        logoutAt: Date.now()
      }, { merge: true });
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
    if (!this.clock) this.clock = setInterval(() => this.render(), 30000);
  },

  unlisten() {
    if (this.unsub) {
      try { this.unsub(); } catch (e) {}
    }
    this.unsub = null;
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  },

  render() {
    const root = document.getElementById("usuarios-online-root");
    if (!root) return;
    const now = Date.now();
    const me = this.docId(this.user && this.user.email);
    const online = this.rows.filter((r) => this.isOnline(r, now))
      .sort((a, b) => (Number(a.since) || now) - (Number(b.since) || now));
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
          </span>
        </div>
      </td>`;

    const onlineRows = online.map((r) => `<tr style="border-top:1px solid #eef2f6;">
        ${userCell(r, true)}
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.profile || "—")}</td>
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.tabLabel || r.tab || "—")}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:#105436;white-space:nowrap;">${this.duration(now - (Number(r.since) || now))}</td>
        <td style="padding:9px 12px;text-align:right;color:#334155;white-space:nowrap;">${this.when(Number(r.since))}</td>
        <td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">${this.ago(now - this.seenAt(r))}</td>
        <td style="padding:9px 12px;color:#64748b;white-space:nowrap;">${this.esc(r.agent || "—")}</td>
      </tr>`).join("");

    const recentRows = recent.map((r) => `<tr style="border-top:1px solid #eef2f6;">
        ${userCell(r, false)}
        <td style="padding:9px 12px;color:#334155;">${this.esc(r.profile || "—")}</td>
        <td style="padding:9px 12px;text-align:right;color:#334155;white-space:nowrap;">${this.ago(now - this.seenAt(r))}</td>
        <td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">${r.online === false ? "Saiu pelo botão Sair" : "Fechou o navegador"}</td>
      </tr>`).join("");

    const card = (label, value, color) => `
      <div class="crm-card" style="padding:14px 16px;">
        <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div>
        <div style="font-size:1.6rem;font-weight:800;color:${color};">${value}</div>
      </div>`;

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        <div style="margin-bottom:14px;">
          <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:800;color:#0f172a;">
            <i data-lucide="users" style="width:22px;color:var(--color-primary);"></i>
            Usuários online
          </h2>
          <p style="margin:0;font-size:0.82rem;color:#64748b;max-width:760px;">
            Quem está com o CRM aberto agora e há quanto tempo. Cada navegador envia um sinal por minuto;
            sem sinal por 3 minutos, o usuário sai da lista. Atualiza sozinho.
          </p>
        </div>

        ${this.error ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#991b1b;background:#fef2f2;">${this.esc(this.error)}</div>` : ""}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;">
          ${card("Online agora", this.loaded ? online.length : "…", "#105436")}
          ${card("Há mais tempo online", online.length ? this.esc(this.duration(longest)) : "—", "#0f172a")}
          ${card("Saíram nas últimas 24 h", this.loaded ? recent.length : "…", "#64748b")}
        </div>

        <div class="crm-card" style="padding:0;overflow:hidden;margin-bottom:12px;">
          <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">Logados agora</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#64748b;">
                ${th("Usuário")}${th("Perfil")}${th("Tela atual")}${th("Online há", true)}${th("Desde", true)}${th("Último sinal", true)}${th("Navegador")}
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
                ${th("Usuário")}${th("Perfil")}${th("Visto por último", true)}${th("Como saiu", true)}
              </tr></thead>
              <tbody>${recentRows || `<tr><td colspan="4" style="padding:18px;color:#94a3b8;text-align:center;">${this.loaded ? "Ninguém saiu nas últimas 24 horas." : "Carregando…"}</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;
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
  if (UsuariosOnline.user) UsuariosOnline.beat();
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
