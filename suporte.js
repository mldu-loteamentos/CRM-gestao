(function () {
  const COLLECTION = "suporte_chamados";
  const MAX_IMAGES = 8;
  const MAX_BYTES = 6 * 1024 * 1024;

  const MODULOS = [
    { id: "home", label: "Home" },
    { id: "engenharia", label: "Engenharia" },
    { id: "vistoria", label: "Vistoria" },
    { id: "compras", label: "Compras" },
    { id: "financeiro_cr", label: "Financeiro — Contas a Receber" },
    { id: "financeiro_cp", label: "Financeiro — Contas a Pagar" },
    { id: "caixa_banco", label: "Financeiro — Caixa e Banco" },
    { id: "repactuacao", label: "Repactuação" },
    { id: "fiscal", label: "Fiscal / Contábil" },
    { id: "participacoes", label: "Participações" },
    { id: "societario", label: "Societário" },
    { id: "comercial", label: "Comercial" },
    { id: "marketing", label: "Marketing" },
    { id: "relacionamento", label: "Relacionamento" },
    { id: "compromissario", label: "Compromissário" },
    { id: "seguranca", label: "Segurança" },
    { id: "configuracoes", label: "Configurações" },
    { id: "outro", label: "Outro / Geral" }
  ];

  const TAB_TO_MODULO = {
    "construcao-home": "home",
    "construcao-engenharia": "engenharia",
    vistoria: "vistoria",
    "construcao-compras": "compras",
    dashboard: "financeiro_cr",
    agenda: "financeiro_cr",
    zeropaid: "financeiro_cr",
    subjudice: "financeiro_cr",
    wesend: "financeiro_cr",
    configuracoes: "financeiro_cr",
    "contas-pagar": "financeiro_cp",
    "prestacao-contas": "financeiro_cp",
    "parametrizacao-parceiro": "financeiro_cp",
    "fluxo-caixa": "caixa_banco",
    "fluxo-caixa-diario": "caixa_banco",
    "resultado-caixa": "caixa_banco",
    investimento: "caixa_banco",
    "repactuacao-lote": "repactuacao",
    "construcao-fiscal": "fiscal",
    csll: "fiscal",
    participacoes: "participacoes",
    "estrutura-societaria": "societario",
    "dashboard-comercial": "comercial",
    "estoque-comercial": "comercial",
    anexos: "comercial",
    "marketing-eventos": "marketing",
    "marketing-budget": "marketing",
    relacionamento_gestao: "relacionamento",
    relacionamento_autorizacao: "relacionamento",
    compromissario_prefeitura: "compromissario",
    compromissario_associacoes: "compromissario",
    auditoria: "seguranca",
    acessos: "seguranca"
  };

  const STATUS_LABEL = {
    pendente: "Pendente",
    aguardando_usuario: "Aguardando você",
    em_atendimento: "Em atendimento",
    atendido: "Atendido"
  };

  const TIPO_LABEL = {
    problema: "Problema",
    melhoria: "Melhoria",
    interno: "Interno"
  };

  let draftFiles = [];
  let adminFilter = "pendentes";
  let adminListCache = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentUser() {
    return (window.AppState && AppState.currentUser) || {};
  }

  function userKey(u) {
    u = u || currentUser();
    return String(u.email || u.id || u.name || "").trim().toLowerCase();
  }

  function isAdmin() {
    if (typeof window.isCrmSuperAdmin === "function" && window.isCrmSuperAdmin()) return true;
    if (typeof window.hasCrmPerm === "function") {
      return window.hasCrmPerm("mod_suporte") || window.hasCrmPerm("sub_suporte_geral_chamados_acessar");
    }
    return false;
  }

  function moduloLabel(id) {
    const found = MODULOS.find(m => m.id === id);
    return found ? found.label : (id || "—");
  }

  function suggestModulo() {
    const tab = window.activeAppTab || "";
    if (TAB_TO_MODULO[tab]) return TAB_TO_MODULO[tab];
    if (String(tab).startsWith("construcao-")) return "engenharia";
    if (String(tab).startsWith("config") || String(tab).startsWith("preamble") || tab === "parametrizacoes") return "configuracoes";
    return "outro";
  }

  function fb() {
    const db = window.firebaseDb;
    const c = window.firebaseCollections;
    if (!db || !c) throw new Error("Firebase não inicializado. Recarregue a página.");
    return { db, c };
  }

  async function compressImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) return file;
    if (file.size <= 1.4 * 1024 * 1024) return file;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const max = 1600;
    let w = img.width;
    let h = img.height;
    if (w > max || h > max) {
      const r = Math.min(max / w, max / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  async function uploadImages(files, ticketId) {
    const { c } = fb();
    let uploadBytesFunc = c.uploadBytes;
    let getDownloadURLFunc = c.getDownloadURL;
    let refFunc = c.ref;
    if (!uploadBytesFunc || !window.firebaseStorage) {
      throw new Error("Storage do Firebase não disponível.");
    }
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const raw = files[i];
      const file = await compressImage(raw);
      const safe = String(file.name || "print").replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `suporte/${ticketId}/${Date.now()}_${i}_${safe}`;
      const storageRef = refFunc(window.firebaseStorage, path);
      await uploadBytesFunc(storageRef, file);
      const url = await getDownloadURLFunc(storageRef);
      out.push({ url, name: raw.name || safe });
    }
    return out;
  }

  function statusBadge(status) {
    const cls = status === "atendido" ? "ok" : status === "aguardando_usuario" ? "wait" : "pend";
    return `<span class="suporte-badge ${cls}">${esc(STATUS_LABEL[status] || status)}</span>`;
  }

  function fmtDate(v) {
    if (!v) return "—";
    try {
      const d = v.toDate ? v.toDate() : new Date(v);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch (e) {
      return "—";
    }
  }

  function ensureShell() {
    if (document.getElementById("suporte-overlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "suporte-overlay";
    wrap.className = "suporte-overlay";
    wrap.style.display = "none";
    wrap.innerHTML = `<div class="suporte-modal" id="suporte-modal-box" role="dialog" aria-modal="true"></div>`;
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
  }

  function closeModal() {
    const ov = document.getElementById("suporte-overlay");
    if (ov) ov.style.display = "none";
    draftFiles = [];
  }

  function openModal() {
    ensureShell();
    document.getElementById("suporte-overlay").style.display = "flex";
    if (window.lucide) lucide.createIcons();
  }

  function toggleMenu(force) {
    const menu = document.getElementById("suporte-menu");
    if (!menu) return;
    const show = force === true || (force !== false && menu.style.display !== "block");
    menu.style.display = show ? "block" : "none";
  }

  function moduloOptionsHtml(selected) {
    return MODULOS.map(m =>
      `<option value="${esc(m.id)}"${m.id === selected ? " selected" : ""}>${esc(m.label)}</option>`
    ).join("");
  }

  function renderPreviews() {
    const box = document.getElementById("suporte-preview-list");
    if (!box) return;
    if (!draftFiles.length) {
      box.innerHTML = `<span class="suporte-hint">Nenhuma imagem selecionada.</span>`;
      return;
    }
    box.innerHTML = draftFiles.map((f, i) => {
      const url = URL.createObjectURL(f);
      return `<div class="suporte-thumb">
        <img src="${url}" alt="">
        <button type="button" class="suporte-thumb-x" data-i="${i}" title="Remover">×</button>
      </div>`;
    }).join("");
    box.querySelectorAll(".suporte-thumb-x").forEach(btn => {
      btn.addEventListener("click", () => {
        draftFiles.splice(Number(btn.getAttribute("data-i")), 1);
        renderPreviews();
      });
    });
  }

  function bindFileInput() {
    const input = document.getElementById("suporte-files");
    if (!input) return;
    input.addEventListener("change", () => {
      const added = Array.from(input.files || []);
      added.forEach(f => {
        if (!String(f.type || "").startsWith("image/")) return;
        if (f.size > MAX_BYTES) {
          alert("A imagem \"" + f.name + "\" passa de 6 MB.");
          return;
        }
        if (draftFiles.length >= MAX_IMAGES) return;
        draftFiles.push(f);
      });
      input.value = "";
      renderPreviews();
    });
  }

  function formHtml(opts) {
    const title = opts.tipo === "melhoria" ? "Sugerir uma melhoria"
      : opts.tipo === "interno" ? "Novo chamado interno"
      : "Relatar um problema";
    const imgReq = opts.tipo !== "interno";
    return `
      <div class="suporte-modal-head">
        <h2><i data-lucide="life-buoy"></i> ${esc(title)}</h2>
        <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
      </div>
      <div class="suporte-modal-body">
        <div class="form-group">
          <label>Módulo *</label>
          <select id="suporte-modulo" class="form-control">${moduloOptionsHtml(suggestModulo())}</select>
        </div>
        <div class="form-group">
          <label>Print da tela ${imgReq ? "*" : "(opcional)"}</label>
          <input type="file" id="suporte-files" class="form-control" accept="image/*" multiple>
          <div id="suporte-preview-list" class="suporte-preview-list"></div>
          <small class="suporte-hint">Envie uma ou mais imagens (até ${MAX_IMAGES}). ${imgReq ? "Obrigatório." : ""}</small>
        </div>
        <div class="form-group">
          <label>${opts.tipo === "melhoria" ? "Descreva a melhoria *" : "Descreva o problema *"}</label>
          <textarea id="suporte-desc" class="form-control" rows="5" placeholder="Conte o que aconteceu, o que esperava e como reproduzir."></textarea>
        </div>
      </div>
      <div class="suporte-modal-foot">
        <button type="button" class="btn btn-cancel" id="suporte-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="suporte-submit">Enviar</button>
      </div>`;
  }

  function openForm(tipo) {
    ensureShell();
    draftFiles = [];
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = formHtml({ tipo });
    box.dataset.mode = "form";
    box.dataset.tipo = tipo;
    openModal();
    bindFileInput();
    renderPreviews();
    document.getElementById("suporte-close-x").onclick = closeModal;
    document.getElementById("suporte-cancel").onclick = closeModal;
    document.getElementById("suporte-submit").onclick = () => submitTicket(tipo);
  }

  async function submitTicket(tipo) {
    const modulo = (document.getElementById("suporte-modulo") || {}).value;
    const descricao = String((document.getElementById("suporte-desc") || {}).value || "").trim();
    if (!modulo) {
      alert("Escolha o módulo.");
      return;
    }
    if (!descricao) {
      alert("Preencha a descrição.");
      return;
    }
    if (tipo !== "interno" && !draftFiles.length) {
      alert("Envie pelo menos um print da tela.");
      return;
    }
    const btn = document.getElementById("suporte-submit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    try {
      const { db, c } = fb();
      const u = currentUser();
      const now = new Date().toISOString();
      const payload = {
        tipo,
        modulo,
        descricao,
        imagens: [],
        status: "pendente",
        userId: userKey(u),
        userName: u.name || "",
        userEmail: String(u.email || "").toLowerCase(),
        createdByAdmin: tipo === "interno",
        mensagens: [],
        createdAt: now,
        updatedAt: now
      };
      const refDoc = await c.addDoc(c.collection(db, COLLECTION), payload);
      let imagens = [];
      if (draftFiles.length) {
        imagens = await uploadImages(draftFiles, refDoc.id);
        await c.updateDoc(c.doc(db, COLLECTION, refDoc.id), { imagens, updatedAt: new Date().toISOString() });
      }
      closeModal();
      alert("Chamado enviado. Você pode acompanhar em “Acompanhar meus chamados”.");
      if (window.activeAppTab === "suporte") renderAdmin();
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o chamado: " + (err.message || err));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar";
      }
    }
  }

  function ticketFromSnap(d) {
    const data = d.data ? d.data() : d;
    return Object.assign({ id: d.id }, data);
  }

  async function listAll() {
    const { db, c } = fb();
    const snap = await c.getDocs(c.collection(db, COLLECTION));
    const list = [];
    snap.forEach(docu => list.push(ticketFromSnap(docu)));
    list.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return list;
  }

  async function listMine() {
    const all = await listAll();
    const key = userKey();
    return all.filter(t => String(t.userId || "").toLowerCase() === key || String(t.userEmail || "").toLowerCase() === key);
  }

  function listHtml(tickets, emptyMsg) {
    if (!tickets.length) return `<p class="suporte-empty">${esc(emptyMsg)}</p>`;
    return `<div class="suporte-list">${tickets.map(t => `
      <button type="button" class="suporte-card" data-id="${esc(t.id)}">
        <div class="suporte-card-top">
          <strong>${esc(TIPO_LABEL[t.tipo] || t.tipo)} · ${esc(moduloLabel(t.modulo))}</strong>
          ${statusBadge(t.status)}
        </div>
        <p>${esc((t.descricao || "").slice(0, 160))}${(t.descricao || "").length > 160 ? "…" : ""}</p>
        <small>${esc(t.userName || t.userEmail || "")} · ${esc(fmtDate(t.updatedAt || t.createdAt))}</small>
      </button>`).join("")}</div>`;
  }

  async function openMine() {
    ensureShell();
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = `
      <div class="suporte-modal-head">
        <h2><i data-lucide="ticket"></i> Meus chamados</h2>
        <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
      </div>
      <div class="suporte-modal-body" id="suporte-mine-body"><p class="suporte-hint">Carregando…</p></div>
      <div class="suporte-modal-foot">
        <button type="button" class="btn btn-cancel" id="suporte-cancel">Fechar</button>
      </div>`;
    openModal();
    document.getElementById("suporte-close-x").onclick = closeModal;
    document.getElementById("suporte-cancel").onclick = closeModal;
    try {
      const tickets = await listMine();
      const body = document.getElementById("suporte-mine-body");
      body.innerHTML = listHtml(tickets, "Você ainda não abriu chamados.");
      body.querySelectorAll(".suporte-card").forEach(el => {
        el.addEventListener("click", () => openDetail(el.getAttribute("data-id"), { mine: true }));
      });
    } catch (err) {
      document.getElementById("suporte-mine-body").innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
    }
    if (window.lucide) lucide.createIcons();
  }

  function threadHtml(t) {
    const msgs = Array.isArray(t.mensagens) ? t.mensagens : [];
    const imgs = Array.isArray(t.imagens) ? t.imagens : [];
    return `
      <div class="suporte-detail-meta">
        ${statusBadge(t.status)}
        <span>${esc(TIPO_LABEL[t.tipo] || t.tipo)}</span>
        <span>${esc(moduloLabel(t.modulo))}</span>
        <span>${esc(t.userName || t.userEmail || "")}</span>
        <span>${esc(fmtDate(t.createdAt))}</span>
      </div>
      <p class="suporte-desc">${esc(t.descricao)}</p>
      ${imgs.length ? `<div class="suporte-preview-list">${imgs.map(im =>
        `<a class="suporte-thumb" href="${esc(im.url)}" target="_blank" rel="noopener"><img src="${esc(im.url)}" alt="${esc(im.name || "")}"></a>`
      ).join("")}</div>` : ""}
      <div class="suporte-thread">
        ${msgs.length ? msgs.map(m => `
          <div class="suporte-msg ${m.papel === "admin" ? "admin" : "user"}">
            <strong>${esc(m.autorNome || m.papel)} · ${esc(fmtDate(m.at))}</strong>
            <p>${esc(m.texto)}</p>
          </div>`).join("") : `<p class="suporte-hint">Ainda não há respostas.</p>`}
      </div>`;
  }

  async function loadTicket(id) {
    const { db, c } = fb();
    const snap = await c.getDoc(c.doc(db, COLLECTION, id));
    if (!snap.exists()) throw new Error("Chamado não encontrado.");
    return Object.assign({ id: snap.id }, snap.data());
  }

  async function openDetail(id, ctx) {
    ensureShell();
    const box = document.getElementById("suporte-modal-box");
    box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-hint">Carregando…</p></div>`;
    openModal();
    try {
      const t = await loadTicket(id);
      const mine = !!(ctx && ctx.mine);
      const adminView = !!(ctx && ctx.admin) || (isAdmin() && !mine);
      const canReplyUser = mine || userKey() === String(t.userId || "").toLowerCase() || userKey() === String(t.userEmail || "").toLowerCase();
      box.innerHTML = `
        <div class="suporte-modal-head">
          <h2><i data-lucide="message-square"></i> Chamado</h2>
          <button type="button" class="modal-close" id="suporte-close-x"><i data-lucide="x"></i></button>
        </div>
        <div class="suporte-modal-body" id="suporte-detail-body">${threadHtml(t)}</div>
        <div class="suporte-modal-foot suporte-reply-foot">
          <textarea id="suporte-reply" class="form-control" rows="3" placeholder="${adminView ? "Resposta ou pedido de mais informações" : "Sua resposta"}"></textarea>
          <div class="suporte-reply-actions">
            ${adminView ? `
              <button type="button" class="btn btn-cancel" id="suporte-back-admin">Voltar</button>
              <button type="button" class="btn btn-outline" id="suporte-ask-info">Solicitar mais informações</button>
              <button type="button" class="btn btn-primary" id="suporte-mark-done">Marcar como atendido</button>
              <button type="button" class="btn btn-primary" id="suporte-send-admin">Enviar resposta</button>
            ` : `
              <button type="button" class="btn btn-cancel" id="suporte-back-mine">Voltar</button>
              ${canReplyUser && t.status !== "atendido" ? `<button type="button" class="btn btn-primary" id="suporte-send-user">Responder</button>` : ""}
            `}
          </div>
        </div>`;
      document.getElementById("suporte-close-x").onclick = closeModal;
      const backAdmin = document.getElementById("suporte-back-admin");
      if (backAdmin) backAdmin.onclick = () => { closeModal(); };
      const backMine = document.getElementById("suporte-back-mine");
      if (backMine) backMine.onclick = () => openMine();
      const sendUser = document.getElementById("suporte-send-user");
      if (sendUser) sendUser.onclick = () => replyTicket(id, { asAdmin: false, status: "pendente" });
      const sendAdmin = document.getElementById("suporte-send-admin");
      if (sendAdmin) sendAdmin.onclick = () => replyTicket(id, { asAdmin: true, status: "em_atendimento" });
      const ask = document.getElementById("suporte-ask-info");
      if (ask) ask.onclick = () => replyTicket(id, { asAdmin: true, status: "aguardando_usuario", requireText: true });
      const done = document.getElementById("suporte-mark-done");
      if (done) done.onclick = () => replyTicket(id, { asAdmin: true, status: "atendido", allowEmpty: true });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      box.innerHTML = `<div class="suporte-modal-body"><p class="suporte-empty">${esc(err.message)}</p></div>
        <div class="suporte-modal-foot"><button type="button" class="btn btn-cancel" onclick="document.getElementById('suporte-overlay').style.display='none'">Fechar</button></div>`;
    }
  }

  async function replyTicket(id, opts) {
    const text = String((document.getElementById("suporte-reply") || {}).value || "").trim();
    if (!opts.allowEmpty && !text) {
      alert(opts.requireText ? "Escreva o que precisa do usuário." : "Escreva a mensagem.");
      return;
    }
    try {
      const t = await loadTicket(id);
      const u = currentUser();
      const mensagens = Array.isArray(t.mensagens) ? t.mensagens.slice() : [];
      if (text) {
        mensagens.push({
          autorNome: u.name || (opts.asAdmin ? "Administrador" : "Usuário"),
          autorEmail: String(u.email || "").toLowerCase(),
          papel: opts.asAdmin ? "admin" : "usuario",
          texto: text,
          at: new Date().toISOString()
        });
      }
      const { db, c } = fb();
      await c.updateDoc(c.doc(db, COLLECTION, id), {
        mensagens,
        status: opts.status || t.status,
        updatedAt: new Date().toISOString()
      });
      if (opts.asAdmin) {
        closeModal();
        if (window.activeAppTab === "suporte") renderAdmin();
        alert("Atualizado.");
      } else {
        await openDetail(id, { mine: true });
      }
    } catch (err) {
      alert("Não foi possível responder: " + (err.message || err));
    }
  }

  function pendingStatuses() {
    return { pendente: true, aguardando_usuario: true, em_atendimento: true };
  }

  function filterAdmin(list, filtro) {
    if (filtro === "pendentes") return list.filter(t => pendingStatuses()[t.status]);
    if (filtro === "atendidos") return list.filter(t => t.status === "atendido");
    return list;
  }

  async function renderAdmin() {
    const root = document.getElementById("suporte-admin-root");
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = `<p class="suporte-empty">Sem permissão para o módulo de suporte.</p>`;
      return;
    }
    root.innerHTML = `<p class="suporte-hint">Carregando chamados…</p>`;
    try {
      adminListCache = await listAll();
    } catch (err) {
      root.innerHTML = `<p class="suporte-empty">${esc(err.message)}</p>`;
      return;
    }
    const pend = adminListCache.filter(t => pendingStatuses()[t.status]).length;
    const done = adminListCache.filter(t => t.status === "atendido").length;
    const shown = filterAdmin(adminListCache, adminFilter);
    root.innerHTML = `
      <div class="suporte-admin-bar">
        <div class="suporte-kpis">
          <div class="est-kpi"><span>Pendentes</span><strong>${pend}</strong></div>
          <div class="est-kpi"><span>Atendidos</span><strong>${done}</strong></div>
          <div class="est-kpi"><span>Total</span><strong>${adminListCache.length}</strong></div>
        </div>
        <div class="suporte-admin-actions">
          <button type="button" class="btn btn-primary" id="suporte-admin-new">Novo chamado interno</button>
        </div>
      </div>
      <div class="suporte-filters">
        <button type="button" class="suporte-chip${adminFilter === "pendentes" ? " active" : ""}" data-f="pendentes">Pendentes</button>
        <button type="button" class="suporte-chip${adminFilter === "atendidos" ? " active" : ""}" data-f="atendidos">Atendidos</button>
        <button type="button" class="suporte-chip${adminFilter === "todos" ? " active" : ""}" data-f="todos">Todos</button>
      </div>
      ${listHtml(shown, "Nenhum chamado neste filtro.")}`;
    root.querySelectorAll(".suporte-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        adminFilter = btn.getAttribute("data-f");
        renderAdmin();
      });
    });
    const neu = document.getElementById("suporte-admin-new");
    if (neu) neu.onclick = () => openForm("interno");
    root.querySelectorAll(".suporte-card").forEach(el => {
      el.addEventListener("click", () => openDetail(el.getAttribute("data-id"), { admin: true }));
    });
  }

  function onMenuClick(action) {
    toggleMenu(false);
    if (action === "problema") openForm("problema");
    else if (action === "melhoria") openForm("melhoria");
    else if (action === "meus") openMine();
  }

  function initWidget() {
    const btn = document.getElementById("suporte-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    document.getElementById("suporte-menu").querySelectorAll("button[data-action]").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onMenuClick(b.getAttribute("data-action"));
      });
    });
    document.addEventListener("click", () => toggleMenu(false));
    if (window.lucide) lucide.createIcons();
  }

  document.addEventListener("tabChanged", (e) => {
    if (e.detail === "suporte") renderAdmin();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
  window.SuporteApp = { renderAdmin, openForm, isAdmin, openMine };
})();
