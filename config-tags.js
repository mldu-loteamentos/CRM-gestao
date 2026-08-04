// MÓDULO: CONFIGURAÇÕES > TAGS DE ANEXOS

const ConfigTagsApp = {
  
  async loadTags() {
    try {
      const q = window.firebaseCollections.query(window.firebaseCollections.collection(window.firebaseDb, 'tags'));
      const querySnapshot = await window.firebaseCollections.getDocs(q);
      const tags = [];
      querySnapshot.forEach(doc => {
        tags.push({ id: doc.id, ...doc.data() });
      });
      tags.sort((a, b) => a.name.localeCompare(b.name));
      this.renderTagsList(tags);
    } catch (e) {
      console.error("Erro ao buscar tags:", e);
    }
  },

    renderTagsList(tags) {
    const root = document.getElementById('config-tags-root');
    if (!root) return;

    this.currentTags = tags;
    const renderTable = (tagList, title, isOpen = false) => {
      let trs = tagList.map(t => {
        return `
          <tr>
            <td><strong style="font-size: 0.7rem;">${t.name}</strong></td>
            <td>${t.destino === 'Cliente' ? '<span class="badge badge-primary">Cliente</span>' : '<span class="badge badge-secondary">Unidade</span>'}</td>
            <td>${t.status === 'Ativa' ? '<span class="badge badge-success">ATIVA</span>' : '<span class="badge badge-danger">INATIVA</span>'}</td>
            <td>
               <button class="btn btn-outline btn-sm" onclick="ConfigTagsApp.showTagModal(${t.id})" style="padding: 4px 10px; font-size: 0.75rem;">
                 <i data-lucide="edit-3" style="width: 14px;"></i> Editar
               </button>
            </td>
          </tr>
        `;
      }).join('');

      return `
        <details class="tags-details-block" ${isOpen ? 'open' : ''} style="margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: white;">
          <summary style="padding: 15px 20px; font-size: 1.1rem; font-weight: bold; color: var(--color-bg-dark); cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; background: #f9fafa; border-bottom: 1px solid #eee;">
            <span>${title} <span style="font-size: 0.8rem; font-weight: normal; color: #777; margin-left: 10px;">(${tagList.length})</span></span>
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

    const tagsCliente = tags.filter(t => t.destino === 'Cliente');
    const tagsUnidade = tags.filter(t => t.destino === 'Unidade');

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
        
        ${renderTable(tagsCliente, 'Tags de Clientes', false)}
        ${renderTable(tagsUnidade, 'Tags de Unidades', false)}
      </div>
    `;

    lucide.createIcons();
  },

  showTagModal(id = null) {
    let tag = id ? this.currentTags.find(t => t.id === id) : null;
    
    const existingModal = document.getElementById('tag-modal-overlay');
    if (existingModal) existingModal.remove();

    const title = tag ? 'Editar TAG' : 'Nova TAG';
    const nameVal = tag ? tag.name : '';
    const destinoVal = tag ? tag.destino : 'Unidade';
    const statusVal = tag ? tag.status : 'Ativa';
    const isSystem = tag && tag.is_default;

    const modalHTML = `
      <div id="tag-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(2px);">
        <div class="card" style="width: 400px; max-width: 90%; background: #ffffff; border: none; border-top: 4px solid var(--color-bg-dark); box-shadow: 0 10px 30px rgba(0,0,0,0.15); border-radius: 8px;">
          <div class="card-body" style="padding: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h3 style="margin: 0; color: var(--color-bg-dark); font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="tag" style="color: var(--color-bg-dark); width: 20px;"></i> ${title}
              </h3>
              <button class="btn btn-outline" style="border:none; padding: 5px; color: var(--color-text-muted);" onclick="document.getElementById('tag-modal-overlay').remove()" onmouseover="this.style.color='var(--color-danger)'" onmouseout="this.style.color='var(--color-text-muted)'">
                <i data-lucide="x" style="width: 20px;"></i>
              </button>
            </div>
            
            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Nome da TAG</label>
              <input type="text" id="modal-tag-name" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px; text-transform: uppercase;" value="${nameVal}">
            </div>

            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Destino</label>
              <select id="modal-tag-destino" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px;">
                <option value="Unidade" ${destinoVal === 'Unidade' ? 'selected' : ''}>Unidade</option>
                <option value="Cliente" ${destinoVal === 'Cliente' ? 'selected' : ''}>Cliente</option>
              </select>
            </div>

            <div style="margin-bottom: 25px;">
              <label style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: #6d8c7c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Status</label>
              <select id="modal-tag-status" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e5e0; background: #fff; color: var(--color-text); border-radius: 6px;">
                <option value="Ativa" ${statusVal === 'Ativa' ? 'selected' : ''}>Ativa</option>
                <option value="Inativa" ${statusVal === 'Inativa' ? 'selected' : ''}>Inativa</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button class="btn btn-primary" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #1b8253 0%, #115736 100%); border: none; color: #fff; font-weight: 600; font-size: 1rem; border-radius: 6px; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick="ConfigTagsApp.saveTag(${tag ? tag.id : 'null'})">
                <i data-lucide="save" style="width: 18px;"></i> Salvar TAG
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
  },

  async saveTag(id) {
    const nome = document.getElementById('modal-tag-name').value.trim().toUpperCase();
    const destino = document.getElementById('modal-tag-destino').value;
    const status = document.getElementById('modal-tag-status').value;

    if (!nome) {
      alert("O nome da TAG é obrigatório!");
      return;
    }

    const email = (typeof AppState !== 'undefined' && AppState.currentUser && AppState.currentUser.email) ? AppState.currentUser.email : 'admin@mouraleite.com.br';

    try {
      const tagData = { name: nome, destino: destino, status: status, created_by: email };
      
      if (id) {
        const docRef = window.firebaseCollections.doc(window.firebaseDb, 'tags', id.toString());
        await window.firebaseCollections.updateDoc(docRef, tagData);
      } else {
        await window.firebaseCollections.addDoc(window.firebaseCollections.collection(window.firebaseDb, 'tags'), tagData);
      }
      
      document.getElementById('tag-modal-overlay').remove();
      this.loadTags();
    } catch (e) {
      alert("Erro ao salvar TAG: " + e.message);
    }
  }
};

// Inicializador quando a aba é selecionada
document.addEventListener('DOMContentLoaded', () => {
  const originalSwitchTab = window.switchTab;
  window.switchTab = function(tabId) {
    originalSwitchTab(tabId);
    if (tabId === 'config-tags') {
      ConfigTagsApp.loadTags();
    }
    if (tabId === 'anexos') {
      if (typeof renderAnexosModule === 'function') {
        renderAnexosModule();
      }
    }
  };
});




