// MÓDULO: CONFIGURAÇÕES > TAGS DE ANEXOS

const ConfigTagsApp = {
  currentTags: [],
  _loading: false,

  waitFirebase(maxMs = 8000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (window.firebaseDb && window.firebaseCollections) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 120);
      };
      tick();
    });
  },

  showStatus(html) {
    const root = document.getElementById("config-tags-root");
    if (!root) return;
    root.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: #64748b;">${html}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  async loadTags() {
    if (this._loading) return;
    this._loading = true;
    this.showStatus(`
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <i data-lucide="loader" class="spin" style="width:18px;height:18px;"></i>
        Carregando tags de anexos...
      </div>
    `);

    try {
      const ready = await this.waitFirebase();
      if (!ready) throw new Error("Firebase não inicializado. Recarregue a página (Ctrl+F5).");

      const col = window.firebaseCollections.collection(window.firebaseDb, "tags");
      const querySnapshot = await window.firebaseCollections.getDocs(col);
      const tags = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        tags.push({
          id: docSnap.id,
          name: String(data.name || data.nome || data.tag || "").trim(),
          destino: data.destino || "Unidade",
          status: data.status || "Ativa",
          is_default: !!data.is_default,
          ...data
        });
      });
      tags.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
      this.renderTagsList(tags);
    } catch (e) {
      console.error("Erro ao buscar tags:", e);
      this.showStatus(`
        <div style="max-width:480px;margin:0 auto;text-align:left;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 18px;color:#991b1b;">
          <div style="font-weight:700;margin-bottom:6px;">Não foi possível carregar as tags</div>
          <div style="font-size:0.85rem;margin-bottom:14px;">${String(e && e.message ? e.message : e)}</div>
          <button class="btn btn-primary" onclick="ConfigTagsApp.loadTags()" style="margin-right:8px;">Tentar novamente</button>
          <button class="btn btn-outline" onclick="ConfigTagsApp.renderTagsList([])">Abrir tela vazia</button>
        </div>
      `);
    } finally {
      this._loading = false;
    }
  },

  renderTagsList(tags) {
    const root = document.getElementById("config-tags-root");
    if (!root) return;

    this.currentTags = Array.isArray(tags) ? tags : [];
    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const renderTable = (tagList, title, isOpen = true) => {
      const trs = tagList.map((t) => {
        const idArg = JSON.stringify(String(t.id));
        return `
          <tr>
            <td><strong style="font-size: 0.85rem;">${esc(t.name || "(sem nome)")}</strong></td>
            <td>${t.destino === "Cliente" ? '<span class="badge badge-primary">Cliente</span>' : '<span class="badge badge-secondary">Unidade</span>'}</td>
            <td>${t.status === "Ativa" ? '<span class="badge badge-success">ATIVA</span>' : '<span class="badge badge-danger">INATIVA</span>'}</td>
            <td>
               <button class="btn btn-outline btn-sm" onclick='ConfigTagsApp.showTagModal(${idArg})' style="padding: 4px 10px; font-size: 0.75rem;">
                 <i data-lucide="edit-3" style="width: 14px;"></i> Editar
               </button>
               <button class="btn btn-outline btn-sm btn-danger" onclick='ConfigTagsApp.deleteTag(${idArg})' style="padding: 4px 10px; font-size: 0.75rem; color: #dc3545; border-color: #dc3545; margin-left: 5px;">
                 <i data-lucide="trash-2" style="width: 14px;"></i> Excluir
               </button>
            </td>
          </tr>
        `;
      }).join("");

      return `
        <details class="tags-details-block" ${isOpen ? "open" : ""} style="margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: white;">
          <summary style="padding: 15px 20px; font-size: 1.1rem; font-weight: bold; color: var(--color-bg-dark); cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; background: #f9fafa; border-bottom: 1px solid #eee;">
            <span>${esc(title)} <span style="font-size: 0.8rem; font-weight: normal; color: #777; margin-left: 10px;">(${tagList.length})</span></span>
            <i data-lucide="chevron-down" class="details-icon" style="width: 20px;"></i>
          </summary>
          <div style="padding: 0; max-height: 65vh; overflow-y: auto;">
            <table class="empresas-table">
              <thead>
                <tr>
                  <th>Nome da TAG</th>
                  <th>Destino</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${trs.length > 0 ? trs : '<tr><td colspan="4" style="text-align:center; padding: 30px; color: var(--color-text-muted);">Nenhuma TAG encontrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </details>
      `;
    };

    const tagsCliente = this.currentTags.filter((t) => t.destino === "Cliente");
    const tagsUnidade = this.currentTags.filter((t) => t.destino !== "Cliente");

    root.innerHTML = `
      <style>
        .empresas-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.95rem;
        }
        .empresas-table thead th {
          position: sticky;
          top: 0;
          background-color: #1b8253;
          color: #ffffff;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          z-index: 10;
          white-space: nowrap;
        }
        .empresas-table tbody tr {
          border-bottom: 1px solid #e0e5e0;
        }
        .empresas-table tbody tr:nth-child(even) {
          background-color: #f4f6f4;
        }
        .empresas-table tbody tr:hover {
          background-color: #eef2ef;
        }
        .empresas-table td {
          padding: 10px 12px;
          vertical-align: middle;
        }
        .tags-details-block summary::marker {
          display: none;
        }
        .tags-details-block[open] summary .details-icon {
          transform: rotate(180deg);
        }
        .tags-details-block summary .details-icon {
          transition: transform 0.2s ease;
        }
      </style>
      <div style="padding: 20px; max-width: 960px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
          <p style="color: #555; font-size: 0.9rem; margin: 0; max-width: 700px; line-height: 1.5;">
            <i data-lucide="info" style="width: 16px; margin-right: 4px; vertical-align: text-bottom; color: var(--color-primary);"></i>
            Utilize esta tela para criar e gerenciar as tags que classificam os documentos a serem salvos no cadastro do cliente ou cadastro da unidade.
          </p>
          <button class="btn btn-primary" onclick="ConfigTagsApp.showTagModal()"><i data-lucide="plus"></i> Criar TAG</button>
        </div>

        ${renderTable(tagsCliente, "Tags de Clientes", true)}
        ${renderTable(tagsUnidade, "Tags de Unidades", true)}
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  showTagModal(id = null) {
    const tag = id ? this.currentTags.find((t) => String(t.id) === String(id)) : null;

    const existingModal = document.getElementById("tag-modal-overlay");
    if (existingModal) existingModal.remove();

    const title = tag ? "Editar TAG" : "Nova TAG";
    const nameVal = tag ? (tag.name || "") : "";
    const destinoVal = tag ? (tag.destino || "Unidade") : "Unidade";
    const statusVal = tag ? (tag.status || "Ativa") : "Ativa";
    const idLiteral = tag ? JSON.stringify(String(tag.id)) : "null";

    const modalHTML = `
      <div id="tag-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(2px);">
        <div class="card" style="width: 400px; max-width: 90%; background: #ffffff; border: none; border-top: 4px solid var(--color-bg-dark); box-shadow: 0 10px 30px rgba(0,0,0,0.15); border-radius: 8px;">
          <div class="card-body" style="padding: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h3 style="margin: 0; color: var(--color-bg-dark); font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="tag" style="color: var(--color-bg-dark); width: 20px;"></i> ${title}
              </h3>
              <button class="btn btn-outline" style="border:none; padding: 5px; color: var(--color-text-muted);" onclick="document.getElementById('tag-modal-overlay').remove()">
                <i data-lucide="x" style="width: 20px;"></i>
              </button>
            </div>

            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Nome da TAG</label>
              <input type="text" id="modal-tag-name" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px; text-transform: uppercase;" value="${String(nameVal).replace(/"/g, "&quot;")}">
            </div>

            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Destino</label>
              <select id="modal-tag-destino" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px;">
                <option value="Unidade" ${destinoVal === "Unidade" ? "selected" : ""}>Unidade</option>
                <option value="Cliente" ${destinoVal === "Cliente" ? "selected" : ""}>Cliente</option>
              </select>
            </div>

            <div style="margin-bottom: 25px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Status</label>
              <select id="modal-tag-status" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px;">
                <option value="Ativa" ${statusVal === "Ativa" ? "selected" : ""}>Ativa</option>
                <option value="Inativa" ${statusVal === "Inativa" ? "selected" : ""}>Inativa</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button class="btn btn-primary" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #1b8253 0%, #115736 100%); border: none; color: #fff; font-weight: 600; font-size: 1rem; border-radius: 6px; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick='ConfigTagsApp.saveTag(${idLiteral})'>
                <i data-lucide="save" style="width: 18px;"></i> Salvar TAG
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    if (window.lucide) lucide.createIcons();
  },

  async saveTag(id) {
    const nome = document.getElementById("modal-tag-name").value.trim().toUpperCase();
    const destino = document.getElementById("modal-tag-destino").value;
    const status = document.getElementById("modal-tag-status").value;

    if (!nome) {
      alert("O nome da TAG é obrigatório!");
      return;
    }

    const email = (typeof AppState !== "undefined" && AppState.currentUser && AppState.currentUser.email)
      ? AppState.currentUser.email
      : ((typeof window.listCrmAdministrators === "function" && window.listCrmAdministrators()[0] && window.listCrmAdministrators()[0].email)
        || "");

    try {
      const ready = await this.waitFirebase(3000);
      if (!ready) throw new Error("Firebase não inicializado.");

      const tagData = { name: nome, destino, status, created_by: email };

      if (id) {
        const docRef = window.firebaseCollections.doc(window.firebaseDb, "tags", String(id));
        await window.firebaseCollections.updateDoc(docRef, tagData);
      } else {
        await window.firebaseCollections.addDoc(
          window.firebaseCollections.collection(window.firebaseDb, "tags"),
          tagData
        );
      }

      const overlay = document.getElementById("tag-modal-overlay");
      if (overlay) overlay.remove();
      this.loadTags();
    } catch (e) {
      alert("Erro ao salvar TAG: " + e.message);
    }
  },

  async deleteTag(id) {
    if (!confirm("Tem certeza que deseja excluir esta TAG? Esta ação não pode ser desfeita.")) return;
    try {
      const ready = await this.waitFirebase(3000);
      if (!ready) throw new Error("Firebase não inicializado.");
      const docRef = window.firebaseCollections.doc(window.firebaseDb, "tags", String(id));
      await window.firebaseCollections.deleteDoc(docRef);
      this.loadTags();
    } catch (e) {
      alert("Erro ao excluir TAG: " + e.message);
    }
  }
};

window.ConfigTagsApp = ConfigTagsApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "config-tags") ConfigTagsApp.loadTags();
});
