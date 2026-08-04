// MÓDULO: CONFIGURAÇÕES > USUÁRIOS E PERFIS

const ConfigUsersApp = {
  
  users: [
    { id: 1, name: "ISRAEL DE OLIVEIRA MENDES", email: "israel@mouraleite.com.br", sienge_user: "ISRAEL", phone: "(15) 99811-8246", profile_name: "ADMINISTRADOR", status: "ATIVO", manager_name: "", manager_email: "" },
    { id: 2, name: "LETICIA PEREIRA DE OLIVEIRA", email: "leticia.oliveira@mouraleite.com.br", sienge_user: "LETICIA.OLIVEIRA", phone: "(14) 98822-5570", profile_name: "OPERADOR COBRANÇA", operator_type: "interno", status: "PENDENTE", manager_name: "", manager_email: "" },
    { id: 3, name: "MICHELLE FRANCINE VIEIRA", email: "michelle.vieira@mouraleite.com.br", sienge_user: "MICHELLE.VIEIRA", phone: "(14) 99655-7212", profile_name: "OPERADOR COBRANÇA", operator_type: "interno", status: "PENDENTE", manager_name: "", manager_email: "" },
    { id: 4, name: "MICHELLE PEREIRA YAMASHIRO", email: "michelle.pereira@mouraleite.com.br", sienge_user: "MICHELLE.PEREIRA", phone: "(14) 99144-8775", profile_name: "OPERADOR COBRANÇA", operator_type: "interno", status: "PENDENTE", manager_name: "", manager_email: "" },
    { id: 5, name: "THAIANE CRISTINA", email: "thaiane.oliveira@mouraleite.com.br", sienge_user: "THAIANE.CORDEIRO", phone: "(19) 99453-6608", profile_name: "OPERADOR COBRANÇA", operator_type: "externo", status: "PENDENTE", manager_name: "", manager_email: "" },
    { id: 6, name: "CARLOS EDUARDO COLENCI", email: "caco@colenci.com.br", sienge_user: "CACO", phone: "(14) 99671-2870", profile_name: "OPERADOR COBRANÇA", operator_type: "advogado", status: "PENDENTE", manager_name: "", manager_email: "", adv_companies: [], adv_cities: [], adv_cost_centers: [] }
  ],

  profiles: [], // Será carregado dinamicamente

  modules: [
    {
      name: "Engenharia", icon: "hard-hat", key: "mod_eng",
      submodules: [{ name: "Geral", key: "sub_eng_geral", actions: [{ id: "engenharia", label: "Engenharia" }] }]
    },
    {
      name: "Compras", icon: "shopping-cart", key: "mod_compras",
      submodules: [{ name: "Geral", key: "sub_compras_geral", actions: [{ id: "compras", label: "Compras" }] }]
    },
    {
      name: "Financeiro", icon: "dollar-sign", key: "mod_fin",
      submodules: [
        {
          name: "Contas a Receber", key: "sub_fin_cr",
          actions: [
            { id: "fila_cobranca", label: "Fila de Cobrança" },
            { id: "agenda", label: "Agenda do Operador" },
            { id: "zero_paid", label: "Clientes 0% Pago" },
            { id: "sub_judice", label: "Sub Judice" },
            { id: "notificacoes", label: "Notificações" },
            { id: "regras_negociacao", label: "Regras de Negociação" },
            { id: "regras_cobranca", label: "Regras de Cobrança" }
          ]
        },
        {
          name: "Contas a Pagar", key: "sub_fin_cp",
          actions: [
            { id: "assistente_cp", label: "Assistente de Contas a Pagar" },
            { id: "prestacao_contas", label: "Prestação de Contas" }
          ]
        },
        {
          name: "Caixa e Banco", key: "sub_fin_cb",
          actions: [{ id: "caixa_banco", label: "Caixa e Banco" }]
        }
      ]
    },
    {
      name: "Fiscal / Contábil", icon: "calculator", key: "mod_fiscal",
      submodules: [{ name: "Geral", key: "sub_fiscal_geral", actions: [{ id: "fiscal", label: "Fiscal / Contábil" }] }]
    },
    {
      name: "Comercial", icon: "store", key: "mod_comercial",
      submodules: [{ name: "Geral", key: "sub_com_geral", actions: [{ id: "assistente_anexos", label: "Assistente de Anexos" }] }]
    },
    {
      name: "Marketing", icon: "megaphone", key: "mod_mkt",
      submodules: [{ name: "Geral", key: "sub_mkt_geral", actions: [{ id: "marketing", label: "Marketing" }] }]
    },
    {
      name: "Relacionamento", icon: "users", key: "mod_rel",
      submodules: [{ name: "Geral", key: "sub_rel_geral", actions: [{ id: "relacionamento", label: "Relacionamento" }] }]
    },
    {
      name: "Segurança", icon: "shield", key: "mod_seg",
      submodules: [
        {
          name: "Geral", key: "sub_seg_geral",
          actions: [
            { id: "auditoria", label: "Auditoria do Sistema" },
            { id: "acessos", label: "Acessos" }
          ]
        }
      ]
    },
    {
      name: "Configurações", icon: "settings-2", key: "mod_cfg",
      submodules: [
        {
          name: "Apoio", key: "sub_cfg_apoio",
          actions: [
            { id: "preambulos", label: "Preâmbulos" },
            { id: "tags", label: "Tags de Anexos" },
            { id: "usuarios", label: "Usuários e Perfis" },
            { id: "empresas", label: "Empresas" },
            { id: "centro_custo", label: "Centro de Custo" },
            { id: "plano_financeiro", label: "Plano Financeiro" },
            { id: "doc_padrao", label: "Documentos Padrões" },
            { id: "upload_kmz", label: "Upload de KMZ" },
            { id: "upload_mapa", label: "Projeto Urbanístico" }
          ]
        }
      ]
    }
  ],

  selectedProfile: "admin",

  async loadUsers() {
    const savedUsers = localStorage.getItem('crm_users');
    if (savedUsers) {
       this.users = JSON.parse(savedUsers);
    }

    // Carregar perfis salvos
    const savedProfiles = localStorage.getItem('crm_moura_profiles');
    if (savedProfiles) {
      this.profiles = JSON.parse(savedProfiles);
    } else {
      this.profiles = [
        { id: "admin", name: "ADMINISTRADOR" },
        { id: "operador_cobranca", name: "OPERADOR COBRANÇA" }
      ];
      localStorage.setItem('crm_moura_profiles', JSON.stringify(this.profiles));
    }
    
    // Aqui no futuro poderia fazer um fetch para a API de usuários
    this.render();
  },

  addProfile() {
    const profileName = prompt("Digite o nome do novo perfil (ex: Operador Financeiro):");
    if (profileName && profileName.trim() !== "") {
       const id = profileName.trim().toLowerCase().replace(/\s+/g, '_');
       
       if (this.profiles.find(p => p.id === id)) {
          alert("Este perfil já existe.");
          return;
       }

       this.profiles.push({ id: id, name: profileName.trim().toUpperCase() });
       localStorage.setItem('crm_moura_profiles', JSON.stringify(this.profiles));
       this.selectedProfile = id;
       this.render();
    }
  },

  editProfile(id) {
    if (id === 'admin') return;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    
    const newName = prompt("Editar nome do perfil:", profile.name);
    if (newName && newName.trim() !== "" && newName.trim() !== profile.name) {
       profile.name = newName.trim().toUpperCase();
       localStorage.setItem('crm_moura_profiles', JSON.stringify(this.profiles));
       this.render();
    }
  },

  duplicateProfile(sourceId) {
     if (sourceId === 'admin') {
         alert("Operação bloqueada: Por medidas de segurança, não é permitido copiar o perfil de Administrador.");
         return;
     }

     const sourceProfile = this.profiles.find(p => p.id === sourceId);
     if (!sourceProfile) return;
     
     const profileName = prompt(`Digite o nome do novo perfil (Cópia de ${sourceProfile.name}):`);
     if (profileName && profileName.trim() !== "") {
        const newId = profileName.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (this.profiles.find(p => p.id === newId)) {
           alert("Este perfil já existe.");
           return;
        }

        this.profiles.push({ id: newId, name: profileName.trim().toUpperCase() });
        localStorage.setItem('crm_moura_profiles', JSON.stringify(this.profiles));
        
        // Copiar as permissões
        const savedPermsStr = localStorage.getItem(`crm_perms_${sourceId}`);
        if (savedPermsStr) {
            localStorage.setItem(`crm_perms_${newId}`, savedPermsStr);
        } else if (sourceId === 'admin') {
            let allPerms = {};
            this.modules.forEach(m => {
               allPerms[m.key] = true;
               m.submodules.forEach(sub => {
                  allPerms[sub.key] = true;
                  sub.actions.forEach(act => {
                     allPerms[`${sub.key}_${act.id}_acessar`] = true;
                     allPerms[`${sub.key}_${act.id}_visualizar`] = true;
                     allPerms[`${sub.key}_${act.id}_editar`] = true;
                  });
               });
            });
            localStorage.setItem(`crm_perms_${newId}`, JSON.stringify(allPerms));
        }

        this.selectedProfile = newId;
        this.render();
     }
  },

  deleteProfile(id) {
     if (id === 'admin') {
         alert("Não é possível excluir o perfil de Administrador.");
         return;
     }

     const profile = this.profiles.find(p => p.id === id);
     if (!profile) return;

     const inUse = this.users.some(u => u.profile_name === profile.name);
     if (inUse) {
         alert(`Não é possível excluir o perfil "${profile.name}", pois existem usuários vinculados a ele.`);
         return;
     }

     if (confirm(`Tem certeza que deseja excluir o perfil "${profile.name}"? Esta ação não pode ser desfeita.`)) {
         this.profiles = this.profiles.filter(p => p.id !== id);
         localStorage.setItem('crm_moura_profiles', JSON.stringify(this.profiles));
         localStorage.removeItem(`crm_perms_${id}`);
         
         this.selectedProfile = 'admin';
         this.render();
     }
  },

  // Método movido para dentro do modal de edição

  openUserModal(userId = null) {
      let user = null;
      if (userId) {
         user = this.users.find(u => u.id === userId);
         if (!user) return;
      }
      
      const userProfileOptions = this.profiles.map(p => 
          `<option value="${p.name}" ${user && p.name === user.profile_name ? 'selected' : (!user && p.name === 'OPERADOR COBRANÇA' ? 'selected' : '')}>${p.name}</option>`
      ).join('');

      let companies = [];
      let cities = [];
      
      const currentAppState = typeof AppState !== 'undefined' ? AppState : window.AppState;
      
      if (currentAppState) {
          let allComps = currentAppState.cachedCompanies || currentAppState.companies || [];
          try {
             const localCustom = localStorage.getItem('crm_empresas_custom');
             if (localCustom) {
                 const customData = JSON.parse(localCustom);
                 const internalIds = Object.entries(customData)
                     .filter(([id, c]) => c && (c.cobranca_interna === 1 || c.cobranca_interna === true || c.cobranca_interna === "1"))
                     .map(([id, c]) => Number(id));
                 companies = allComps.filter(c => internalIds.includes(Number(c.id))).map(c => {
                     const custom = customData[c.id] || {};
                     return { ...c, nome_usual: custom.nome_usual || c.name || c.nome };
                 });
             }
          } catch(e) {}
          
          if (currentAppState.rules) {
              const rules = currentAppState.rules;
              Object.keys(rules).forEach(k => {
                  if (k.startsWith('CID_')) {
                      const op = rules[k].operator;
                      const isSemCarteira = Array.isArray(op) ? op.includes("SEM CARTEIRA INADIMPLENTE") : op === "SEM CARTEIRA INADIMPLENTE";
                      if (!isSemCarteira) {
                          cities.push(k.replace('CID_', '').replace(/_/g, ' '));
                      }
                  }
              });
          }
      }
      
      cities.sort();
      companies.sort((a,b) => Number(a.id) - Number(b.id));

      const buildCheckboxList = (items, typeName, selectedValues, extraAttrs = '') => {
          if (!items || items.length === 0) return `<div style="padding: 10px; font-size: 0.85rem; color: #80868b;">Nenhum item encontrado</div>`;
          
          const onSelectAll = typeName === 'companies' 
              ? `onchange="document.querySelectorAll('input[name=\\'umodal-adv-companies\\']').forEach(cb => cb.checked = this.checked); window.updateAdvogadoCities();"` 
              : `onchange="document.querySelectorAll('input[name=\\'umodal-adv-cities\\']').forEach(cb => cb.checked = this.checked);"`;

          let html = `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; color: var(--color-primary); border-bottom: 1px solid #eee; padding-bottom: 6px;">
                         <input type="checkbox" ${onSelectAll}>
                         Selecionar Todos
                      </label>`;
                      
          html += items.map(item => {
              const val = item.value;
              const label = item.label;
              const isChecked = selectedValues && selectedValues.includes(val) ? 'checked' : '';
              return `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.85rem; cursor: pointer; color: #202124;">
                         <input type="checkbox" name="umodal-adv-${typeName}" value="${val}" ${isChecked} ${extraAttrs}>
                         ${label}
                      </label>`;
          }).join('');
          
          return html;
      };

      window.updateAdvogadoCities = () => {
          const selectedCompanyCheckboxes = document.querySelectorAll('input[name="umodal-adv-companies"]:checked');
          const selectedCompanyIds = Array.from(selectedCompanyCheckboxes).map(cb => cb.value);
          let allowedCities = [];
          
          if (selectedCompanyIds.length > 0 && currentAppState && currentAppState.cachedCostCenters) {
              const ccIdToCity = {};
              currentAppState.cachedCostCenters.forEach(cc => {
                  let city = "";
                  if (String(cc.id) === "14201" || (cc.name && cc.name.toUpperCase().includes("ARAÇARI"))) {
                      city = "ARAÇARIGUAMA";
                  } else if (cc.name && cc.name.includes('-')) {
                      city = cc.name.split('-')[0].trim().toUpperCase();
                  }
                  if (city) ccIdToCity[cc.id] = city;
              });

              const clients = window.rawClientList || currentAppState.sales || [];
              clients.forEach(c => {
                  const sComp = String(c.companyId || "");
                  if (selectedCompanyIds.includes(sComp) && c.costCenterId) {
                      const city = ccIdToCity[c.costCenterId];
                      if (city && cities.includes(city) && !allowedCities.includes(city)) {
                          allowedCities.push(city);
                      }
                  }
              });

              allowedCities.sort();
          } else {
              allowedCities = [...cities];
          }
          
          const cityItems = allowedCities.map(c => ({ value: c, label: c }));
          const currentlyChecked = Array.from(document.querySelectorAll('input[name="umodal-adv-cities"]:checked')).map(cb => cb.value);
          const newHtml = buildCheckboxList(cityItems, 'cities', currentlyChecked);
          const container = document.getElementById('adv-cities-container');
          if (container) container.innerHTML = newHtml;
      };

      const companyItems = companies.map(c => ({ value: String(c.id), label: `${c.id} - ${c.nome_usual}` }));
      const cityItems = cities.map(c => ({ value: c, label: c }));

      const advCompaniesHtml = buildCheckboxList(companyItems, 'companies', user ? user.adv_companies : [], 'onchange="window.updateAdvogadoCities()"');
      const advCitiesHtml = buildCheckboxList(cityItems, 'cities', user ? user.adv_cities : []);

      const modalHtml = `
      <div id="user-modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
         <div style="background: #fff; border-radius: 12px; width: 700px; max-width: 95%; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
            <h3 style="margin-top: 0; margin-bottom: 20px; font-size: 1.25rem; color: #202124;">${user ? 'Editar Dados do Usuário' : 'Convidar Novo Usuário'}</h3>
            
            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Nome Completo</label>
                  <input type="text" id="umodal-name" value="${user ? user.name : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">E-mail Corporativo</label>
                  <input type="email" id="umodal-email" value="${user ? user.email : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>
            
            <div style="margin-bottom: 16px; display: flex; gap: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Usuário Sienge</label>
                  <input type="text" id="umodal-sienge" value="${user ? (user.sienge_user||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Celular</label>
                  <input type="text" id="umodal-phone" placeholder="(00) 00000-0000" maxlength="15" oninput="this.value = this.value.replace(/\\D/g, '').replace(/(\\d{2})(\\d)/, '($1) $2').replace(/(\\d{5})(\\d)/, '$1-$2').slice(0, 15);" value="${user ? (user.phone||'') : ''}" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>

            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Cor de Destaque (Fila de Cobrança)</label>
                  <div style="display: flex; gap: 12px; align-items: center;">
                    <input type="color" id="umodal-badge-color" value="${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'}" style="width: 45px; height: 40px; padding: 0; border: 1px solid #e8eaed; border-radius: 4px; cursor: pointer; box-sizing: border-box; outline: none;" onchange="
                      const hex = this.value;
                      const preview = document.getElementById('badge-color-preview');
                      preview.style.backgroundColor = 'color-mix(in srgb, ' + hex + ' 15%, white)';
                      preview.style.color = 'color-mix(in srgb, ' + hex + ' 60%, black)';
                      preview.style.border = '1px solid color-mix(in srgb, ' + hex + ' 30%, white)';
                    ">
                    <div id="badge-color-preview" style="
                      padding: 4px 12px; 
                      border-radius: 12px; 
                      font-size: 0.75rem; 
                      font-weight: 600;
                      background-color: color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 15%, white);
                      color: color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 60%, black);
                      border: 1px solid color-mix(in srgb, ${user && user.badge_color && user.badge_color.startsWith('#') ? user.badge_color : '#3b82f6'} 30%, white);
                    ">
                      Visualização
                    </div>
                  </div>
                  <span style="font-size: 0.75rem; color: #9aa0a6; display: block; margin-top: 6px;">
                    Escolha a cor base. O fundo e a fonte serão ajustados para dar contraste automático.
                  </span>
               </div>
               <div style="flex: 1;"></div>
            </div>

            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Perfil de Acesso</label>
                  <select id="umodal-profile" onchange="document.getElementById('umodal-operator-type-container').style.display = this.value.toUpperCase().includes('OPERADOR') ? 'block' : 'none';" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; cursor: pointer; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
                     ${userProfileOptions}
                  </select>
               </div>
               <div id="umodal-operator-type-container" style="flex: 1; display: ${user && user.profile_name && user.profile_name.toUpperCase().includes('OPERADOR') ? 'block' : (!user ? 'block' : 'none')};">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Tipo de Operador</label>
                  <select id="umodal-operator-type" onchange="document.getElementById('umodal-advogado-config').style.display = this.value === 'advogado' ? 'block' : 'none';" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; cursor: pointer; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
                     <option value="interno" ${user && user.operator_type === 'interno' ? 'selected' : ''}>Interno</option>
                     <option value="externo" ${user && user.operator_type === 'externo' ? 'selected' : ''}>Externo (Terceirizada)</option>
                     <option value="advogado" ${user && user.operator_type === 'advogado' ? 'selected' : ''}>Advogado (Jurídico)</option>
                  </select>
               </div>
            </div>
            
            <div id="umodal-advogado-config" style="margin-bottom: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e8eaed; display: ${user && user.operator_type === 'advogado' ? 'block' : 'none'};">
               <h4 style="margin: 0 0 8px 0; font-size: 0.95rem; color: #202124;">Configurações de Atuação do Advogado</h4>
               <p style="font-size: 0.8rem; color: #5f6368; margin-top: 0; margin-bottom: 12px;">Selecione os locais onde este advogado irá atuar (se o título coincidir com qualquer um dos locais marcados, será atribuído a este advogado).</p>
               
               <div style="display: flex; gap: 16px;">
                   <div style="flex: 1;">
                      <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.8rem;">Empresas (Cobrança Interna)</label>
                      <div style="height: 150px; overflow-y: auto; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; background: #fff;">
                         ${advCompaniesHtml}
                      </div>
                   </div>
                   <div style="flex: 1;">
                      <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.8rem;">Cidades (Com Carteira Inadimplente)</label>
                      <div id="adv-cities-container" style="height: 150px; overflow-y: auto; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; background: #fff;">
                         ${advCitiesHtml}
                      </div>
                   </div>
               </div>
            </div>
            
            <div style="margin-bottom: 16px; display: flex; gap: 16px;">
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Gestor Imediato (Nome)</label>
                  <input type="text" id="umodal-manager-name" placeholder="Ex: Joao Silva" value="${user ? (user.manager_name||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
               <div style="flex: 1;">
                  <label style="display: block; font-weight: 600; color: #5f6368; margin-bottom: 6px; font-size: 0.85rem;">Gestor Imediato (E-mail)</label>
                  <input type="email" id="umodal-manager-email" placeholder="gestor@empresa.com.br" value="${user ? (user.manager_email||'') : ''}" oninput="this.value = this.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');" style="width: 100%; padding: 10px; border: 1px solid #e8eaed; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#105436'" onblur="this.style.borderColor='#e8eaed'">
               </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
               <button onclick="document.getElementById('user-modal-overlay').remove()" style="padding: 10px 16px; border: 1px solid #e8eaed; background: transparent; color: #5f6368; font-weight: 600; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">Cancelar</button>
               <button onclick="ConfigUsersApp.saveUserModal(${user ? user.id : 'null'})" style="padding: 10px 16px; border: none; background: #105436; color: #fff; font-weight: 600; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#0c4028'" onmouseout="this.style.background='#105436'">Salvar Dados</button>
            </div>
         </div>
      </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  saveUserModal(userId) {
      const name = document.getElementById('umodal-name').value.trim();
      const email = document.getElementById('umodal-email').value.trim();
      const sienge = document.getElementById('umodal-sienge').value.trim();
      const phone = document.getElementById('umodal-phone').value.trim();
      const profileName = document.getElementById('umodal-profile').value;
      const managerName = document.getElementById('umodal-manager-name').value.trim();
      const managerEmail = document.getElementById('umodal-manager-email').value.trim();
      const operatorTypeEl = document.getElementById('umodal-operator-type');
      const operatorType = operatorTypeEl ? operatorTypeEl.value : null;
      const badgeColor = document.getElementById('umodal-badge-color') ? document.getElementById('umodal-badge-color').value : null;

      const advCompanies = Array.from(document.querySelectorAll('input[name="umodal-adv-companies"]:checked')).map(el => el.value);
      const advCities = Array.from(document.querySelectorAll('input[name="umodal-adv-cities"]:checked')).map(el => el.value);
      const advCostCenters = Array.from(document.querySelectorAll('input[name="umodal-adv-costcenters"]:checked')).map(el => el.value);

      if (!name || !email) {
          alert("Nome e E-mail são obrigatórios.");
          return;
      }
      
      if (userId) {
          const user = this.users.find(u => u.id === userId);
          if (user) {
              user.name = name;
              user.email = email;
              user.sienge_user = sienge;
              user.phone = phone;
              user.profile_name = profileName;
              user.operator_type = profileName.toUpperCase().includes('OPERADOR') ? operatorType : null;
              user.adv_companies = user.operator_type === 'advogado' ? advCompanies : [];
              user.adv_cities = user.operator_type === 'advogado' ? advCities : [];
              user.adv_cost_centers = user.operator_type === 'advogado' ? advCostCenters : [];
              user.manager_name = managerName;
              user.manager_email = managerEmail;
              user.badge_color = badgeColor;
          }
      } else {
          const newId = this.users.length ? Math.max(...this.users.map(u => u.id)) + 1 : 1;
          this.users.push({
             id: newId,
             name: name,
             email: email,
             sienge_user: sienge,
             phone: phone,
             profile_name: profileName,
             operator_type: profileName.toUpperCase().includes('OPERADOR') ? operatorType : null,
             adv_companies: operatorType === 'advogado' ? advCompanies : [],
             adv_cities: operatorType === 'advogado' ? advCities : [],
             adv_cost_centers: operatorType === 'advogado' ? advCostCenters : [],
             manager_name: managerName,
             manager_email: managerEmail,
             badge_color: badgeColor,
             status: "PENDENTE"
          });
      }
      
      localStorage.setItem('crm_users', JSON.stringify(this.users));
      if (typeof window !== 'undefined') {
          window._cachedCrmUsersBadge = null;
          if (typeof window.updateOperatorTabsUI === 'function') window.updateOperatorTabsUI();
      }
      document.getElementById('user-modal-overlay').remove();
      this.render();
  },

  render() {
    const root = document.getElementById('config-users-root');
    if (!root) return;

    let trs = this.users.map(u => {
      let statusBadge = '';
      if (u.status === 'ATIVO') {
        statusBadge = '<span style="background: #e6f4ea; color: #1e8e3e; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">ATIVO</span>';
      } else if (u.status === 'PENDENTE') {
        statusBadge = '<span style="background: #fef7e0; color: #f29900; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">PENDENTE</span>';
      } else {
        statusBadge = `<span style="background: #fce8e6; color: #d93025; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">${u.status}</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 16px 15px;">
            <div style="font-weight: 700; color: #202124;">${u.name}</div>
            <div style="font-size: 0.85rem; color: #80868b; margin-top: 4px;">${u.email}</div>
          </td>
          <td style="padding: 16px 15px; color: #202124; font-size: 0.9rem;">${u.sienge_user || '-'}</td>
          <td style="padding: 16px 15px; color: #202124; font-size: 0.9rem;">${u.phone || '-'}</td>
          <td style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.85rem;">
             ${u.profile_name}
             ${u.operator_type ? `<div style="font-size: 0.75rem; color: #80868b; font-weight: 500; margin-top: 4px; text-transform: uppercase;">${u.operator_type === 'interno' ? 'Cobrança Interna' : (u.operator_type === 'externo' ? 'Terceirizada' : 'Advogado (Jurídico)')}</div>` : ''}
          </td>
          <td style="padding: 16px 15px;">${statusBadge}</td>
          <td style="padding: 16px 15px;">
             <div style="display: flex; gap: 8px;">
               <button onclick="ConfigUsersApp.openUserModal(${u.id})" class="btn btn-outline" style="padding: 6px; border-radius: 8px; border-color: #5f6368; color: #5f6368;" title="Editar Dados"><i data-lucide="edit" style="width:18px;height:18px;"></i></button>
               ${u.status === 'ATIVO' ? 
                  `<button onclick="ConfigUsersApp.toggleUserStatus(${u.id})" class="btn btn-outline" style="padding: 6px; border-radius: 8px; border-color: #d93025; color: #d93025;" title="Desativar Usuário"><i data-lucide="power-off" style="width:18px;height:18px;"></i></button>`
                  :
                  `<button onclick="ConfigUsersApp.toggleUserStatus(${u.id})" class="btn btn-outline" style="padding: 6px; border-radius: 8px; border-color: #105436; color: #105436;" title="Ativar Usuário"><i data-lucide="power" style="width:18px;height:18px;"></i></button>`
               }
             </div>
          </td>
        </tr>
      `;
    }).join('');

    const optionsHtml = this.profiles.map(p => {
       const isSelected = p.id === this.selectedProfile;
       return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name}</option>`;
    }).join('');
    
    const adminHidden = this.selectedProfile === 'admin' ? 'visibility: hidden;' : '';
    const actionBtns = `
      <div style="display: flex; gap: 6px;">
         <button onclick="ConfigUsersApp.editProfile('${this.selectedProfile}')" style="${adminHidden} padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #5f6368; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Editar Nome">
            <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
         </button>
         
         <button onclick="ConfigUsersApp.duplicateProfile('${this.selectedProfile}')" style="padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #1a73e8; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Duplicar Perfil (Copiar Permissões)">
            <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
         </button>
         
         <button onclick="ConfigUsersApp.deleteProfile('${this.selectedProfile}')" style="${adminHidden} padding: 8px; background: transparent; border: 1px solid #e8eaed; border-radius: 8px; cursor: pointer; color: #d93025; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" title="Excluir Perfil">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
         </button>
      </div>
    `;

    const profileOptions = `
      <select onchange="ConfigUsersApp.selectProfile(this.value)" style="padding: 8px 36px 8px 16px; border: 1px solid #e8eaed; border-radius: 8px; font-weight: 600; color: #202124; background: #fff url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' fill=\\'none\\' stroke=\\'%235f6368\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><polyline points=\\'6 9 12 15 18 9\\'/></svg>') no-repeat right 12px center; appearance: none; font-size: 0.95rem; cursor: pointer; width: 350px; flex-shrink: 0;">
         ${optionsHtml}
      </select>
      ${actionBtns}
    `;

    // Load saved permissions for selected profile
    const savedPermsStr = localStorage.getItem(`crm_perms_${this.selectedProfile}`);
    let savedPerms = savedPermsStr ? JSON.parse(savedPermsStr) : {};
    
    const isAdmin = this.selectedProfile === 'admin';

    // Admin always has all permissions forced
    if (isAdmin) {
      this.modules.forEach(m => {
         savedPerms[m.key] = true;
         m.submodules.forEach(sub => {
            savedPerms[sub.key] = true;
            sub.actions.forEach(act => {
               savedPerms[`${sub.key}_${act.id}_acessar`] = true;
               savedPerms[`${sub.key}_${act.id}_visualizar`] = true;
               savedPerms[`${sub.key}_${act.id}_editar`] = true;
            });
         });
      });
    }

    const modulesHtml = this.modules.map(mod => {
      const isModChecked = savedPerms[mod.key] ? 'checked' : '';
      const modDisabledAttr = isAdmin ? 'disabled' : '';

      const submodulesHtml = mod.submodules.map(sub => {
         const isSubChecked = savedPerms[sub.key] ? 'checked' : '';
         
         // Se não for admin e o pai não tiver marcado, desabilita visualmente e bloqueia
         const subIsBlockedByParent = !isAdmin && !savedPerms[mod.key];
         const subDisabledAttr = (isAdmin || subIsBlockedByParent) ? 'disabled' : '';
         const subOpacity = subIsBlockedByParent ? '0.5' : '1';

         const actionsHtml = sub.actions.map(act => {
            const permKeyAcc = `${sub.key}_${act.id}_acessar`;
            const permKeyVis = `${sub.key}_${act.id}_visualizar`;
            const permKeyEdi = `${sub.key}_${act.id}_editar`;

            const chkAcc = savedPerms[permKeyAcc] ? 'checked' : '';
            const chkVis = savedPerms[permKeyVis] ? 'checked' : '';
            const chkEdi = savedPerms[permKeyEdi] ? 'checked' : '';
            
            const actIsBlockedByParent = !isAdmin && (!savedPerms[mod.key] || !savedPerms[sub.key]);
            const actDisabledAttr = (isAdmin || actIsBlockedByParent) ? 'disabled' : '';
            const actOpacity = actIsBlockedByParent ? '0.5' : '1';

            return `
               <div style="background: #f8f9fa; border: 1px solid #e8eaed; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 280px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); opacity: ${actOpacity};">
                  <div style="font-weight: 600; color: #202124; margin-bottom: 10px; font-size: 0.9rem; border-bottom: 1px solid #e8eaed; padding-bottom: 6px;">${act.label}</div>
                  <div style="display: flex; gap: 12px; font-size: 0.8rem;">
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyAcc}" ${chkAcc} ${actDisabledAttr} style="accent-color: #105436;"> Acessar
                     </label>
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyVis}" ${chkVis} ${actDisabledAttr} style="accent-color: #105436;"> Visualizar
                     </label>
                     <label style="display: flex; align-items: center; gap: 4px; cursor: ${actDisabledAttr ? 'not-allowed' : 'pointer'}; color: #3c4043;">
                        <input type="checkbox" class="profile-perm-checkbox" data-level="action" data-parent-sub="${sub.key}" data-key="${permKeyEdi}" ${chkEdi} ${actDisabledAttr} style="accent-color: #105436;"> Editar
                     </label>
                  </div>
               </div>
            `;
         }).join('');

         return `
            <details style="margin-bottom: 12px; border: 1px solid #e8eaed; border-radius: 8px; background: #fff; overflow: hidden;">
               <summary style="padding: 14px 16px; font-weight: 700; color: #105436; font-size: 0.95rem; cursor: pointer; user-select: none; background: #fdfdfd; display: flex; align-items: center; border-left: 3px solid #105436; outline: none;">
                  <span style="flex: 1; display: flex; align-items: center; gap: 10px;">
                     <input type="checkbox" class="profile-perm-checkbox action-container" data-level="submodule" data-parent-mod="${mod.key}" data-key="${sub.key}" ${isSubChecked} ${subDisabledAttr} style="width: 16px; height: 16px; accent-color: #105436;" onclick="event.stopPropagation(); ConfigUsersApp.toggleChildren(this);">
                     <label style="cursor: ${subDisabledAttr ? 'not-allowed' : 'pointer'}; margin: 0; opacity: ${subOpacity};" onclick="event.preventDefault();">${sub.name}</label>
                  </span>
                  <i data-lucide="chevron-down" style="width: 18px; color: #80868b; transition: transform 0.2s;" class="details-chevron"></i>
               </summary>
               <div style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; background: #fff; border-top: 1px dashed #e8eaed;">
                  ${actionsHtml}
               </div>
            </details>
         `;
      }).join('');

      return `
        <details style="background: #fff; border: 1px solid #e8eaed; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
           <summary style="padding: 18px 24px; font-size: 1.1rem; color: #202124; display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; font-weight: 600; background: #f8f9fa; outline: none;">
             <span style="display: flex; align-items: center; gap: 10px; flex: 1;">
               <input type="checkbox" class="profile-perm-checkbox" data-level="module" data-key="${mod.key}" ${isModChecked} ${modDisabledAttr} style="width: 18px; height: 18px; accent-color: #105436;" onclick="event.stopPropagation(); ConfigUsersApp.toggleChildren(this);">
               <i data-lucide="${mod.icon || 'folder'}" style="width: 20px; color: #105436;"></i>
               <label style="margin: 0; cursor: pointer;" onclick="event.preventDefault();">Módulo ${mod.name}</label>
             </span>
             <i data-lucide="chevron-down" style="width: 20px; color: #80868b; transition: transform 0.2s;" class="details-chevron"></i>
           </summary>
           <div style="padding: 20px 24px; background: #fdfdfd;">
             ${submodulesHtml}
           </div>
        </details>
      `;
    }).join('');

    root.innerHTML = `
      <div style="padding: 30px; max-width: 1100px; margin: 0 auto;">
        
        <!-- SEÇÃO: USUÁRIOS -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="display: flex; align-items: center; gap: 10px; font-size: 1.5rem; margin: 0; color: #202124;">
            <i data-lucide="users" style="width: 24px; height: 24px;"></i> Gerenciar Usuários e Perfis
          </h2>
          <button class="btn btn-primary" style="background-color: #105436; border-color: #105436; font-weight: 600; padding: 10px 20px; border-radius: 8px;" onclick="ConfigUsersApp.openUserModal()">
            <i data-lucide="user-plus" style="width: 18px; margin-right: 6px;"></i> Convidar Usuário
          </button>
        </div>

        <div style="background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; margin-bottom: 40px; border: 1px solid #f0f0f0;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Nome Completo / E-mail</th>
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Usuário Sienge</th>
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Celular</th>
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Perfil de Acesso</th>
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Status</th>
                <th style="padding: 16px 15px; color: #202124; font-weight: 700; font-size: 0.95rem;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${trs}
            </tbody>
          </table>
        </div>

        <!-- SEÇÃO: CONFIGURAÇÃO DE PERFIS -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="display: flex; align-items: center; gap: 10px; font-size: 1.5rem; margin: 0; color: #202124;">
            <i data-lucide="shield-check" style="width: 24px; height: 24px;"></i> Configuração de Perfis
          </h2>
          <button class="btn btn-primary" style="background-color: #105436; border-color: #105436; font-weight: 600; padding: 10px 20px; border-radius: 8px;" onclick="ConfigUsersApp.savePermissions()">
            <i data-lucide="save" style="width: 18px; margin-right: 6px;"></i> Salvar Permissões
          </button>
        </div>

        <div style="display: flex; margin-bottom: 24px; align-items: center;">
           <div style="display: flex; gap: 10px; align-items: center;">
              ${profileOptions}
           </div>
           <button onclick="ConfigUsersApp.addProfile()" style="margin-left: 15%; padding: 8px 16px; border: 1px dashed #105436; background: transparent; color: #105436; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; flex-shrink: 0;"><i data-lucide="plus" style="width: 16px; margin-right: 6px;"></i> Novo Perfil</button>
        </div>

        <div id="permissions-container">
           ${modulesHtml}
        </div>

      </div>
    `;

    lucide.createIcons();
  },

  selectProfile(profileId) {
    this.selectedProfile = profileId;
    this.render();
  },

  toggleChildren(checkbox) {
    const level = checkbox.getAttribute('data-level');
    const key = checkbox.getAttribute('data-key');
    const isChecked = checkbox.checked;

    // Se salvarmos no localStorage na hora da tela piscar, podemos ter problemas,
    // então a função Save fará a varredura das caixas marcadas e também
    // checaremos visualmente pra não ter que recarregar a tela (this.render).
    
    // Salvar as flags no localStorage ANTES do render pra que a tela volte já com a nova lógica desabilitada
    const checkboxes = document.querySelectorAll('.profile-perm-checkbox');
    const perms = {};
    checkboxes.forEach(cb => {
       perms[cb.getAttribute('data-key')] = cb.checked;
    });

    if (level === 'module') {
       // Se desligou o módulo, desliga todos os submódulos e actions daquele módulo
       // e força a atualização no objeto
       this.modules.find(m => m.key === key).submodules.forEach(sub => {
          perms[sub.key] = isChecked;
          sub.actions.forEach(act => {
             perms[`${sub.key}_${act.id}_acessar`] = isChecked;
             perms[`${sub.key}_${act.id}_visualizar`] = isChecked;
             perms[`${sub.key}_${act.id}_editar`] = isChecked;
          });
       });
    } else if (level === 'submodule') {
       // Se ligou o submódulo, garanta que o módulo pai está ligado
       const parentModKey = checkbox.getAttribute('data-parent-mod');
       if (isChecked) {
          perms[parentModKey] = true;
       } else {
          // Se desligou o submódulo, desliga todas as actions dele
          const subKey = key;
          this.modules.forEach(m => {
             m.submodules.forEach(s => {
                if(s.key === subKey) {
                   s.actions.forEach(act => {
                     perms[`${s.key}_${act.id}_acessar`] = false;
                     perms[`${s.key}_${act.id}_visualizar`] = false;
                     perms[`${s.key}_${act.id}_editar`] = false;
                   });
                }
             })
          });
       }
    } else if (level === 'action') {
       // Se ligou uma action, liga o submodulo pai, que por sua vez liga o modulo
       if (isChecked) {
          const parentSubKey = checkbox.getAttribute('data-parent-sub');
          perms[parentSubKey] = true;
          // achar qual module ele pertence pra ligar
          this.modules.forEach(m => {
             if (m.submodules.find(s => s.key === parentSubKey)) {
                perms[m.key] = true;
             }
          });
       }
    }

    localStorage.setItem(`crm_perms_${this.selectedProfile}`, JSON.stringify(perms));
    
    const isAdmin = this.selectedProfile === 'admin';
    if (isAdmin) return; // Se for admin, ignora a lógica de cascata no click pois já é bloqueado
    
    // Atualização visual das checkboxes e labels via DOM para evitar re-render da tela (que fecharia as sanfonas)
    checkboxes.forEach(cb => {
       const lvl = cb.getAttribute('data-level');
       const cbKey = cb.getAttribute('data-key');
       
       // Sincronizar o checked property
       cb.checked = !!perms[cbKey];
       
       if (lvl === 'submodule') {
          const pMod = cb.getAttribute('data-parent-mod');
          const disabled = !perms[pMod];
          cb.disabled = disabled;
          
          // O label está logo ao lado do checkbox
          const label = cb.nextElementSibling;
          if (label && label.tagName === 'LABEL') {
             label.style.cursor = disabled ? 'not-allowed' : 'pointer';
             label.style.opacity = disabled ? '0.5' : '1';
          }
       } else if (lvl === 'action') {
          const pSub = cb.getAttribute('data-parent-sub');
          
          // Precisamos achar qual o módulo pai do submódulo pra saber se desabilita
          const subCb = document.querySelector(`.profile-perm-checkbox[data-level="submodule"][data-key="${pSub}"]`);
          const pMod = subCb ? subCb.getAttribute('data-parent-mod') : null;
          
          const disabled = !perms[pMod] || !perms[pSub];
          cb.disabled = disabled;
          
          const label = cb.closest('label');
          if (label) {
             label.style.cursor = disabled ? 'not-allowed' : 'pointer';
          }
          
          const container = cb.closest('div[style*="background: #f8f9fa"]');
          if (container) {
             container.style.opacity = disabled ? '0.5' : '1';
          }
       }
    });
  },

  savePermissions() {
    const checkboxes = document.querySelectorAll('.profile-perm-checkbox');
    let totalEdit = 0;
    let checkedEdit = 0;
    const perms = {};
    checkboxes.forEach(cb => {
       const key = cb.getAttribute('data-key');
       if (key && key.endsWith('_editar')) {
          totalEdit++;
          if (cb.checked) checkedEdit++;
       }
       perms[key] = cb.checked;
    });

    if (this.selectedProfile !== 'admin' && totalEdit > 0 && checkedEdit === totalEdit) {
       alert("Acesso Negado: Não é permitido criar um perfil com permissão de edição em todas as funcionalidades. Perfil com edição irrestrita é um privilégio exclusivo do Administrador.");
       return;
    }

    localStorage.setItem(`crm_perms_${this.selectedProfile}`, JSON.stringify(perms));
    
    // Animação de sucesso no botão
    const btn = document.querySelector('button[onclick="ConfigUsersApp.savePermissions()"]');
    if (btn) {
       const originalText = btn.innerHTML;
       btn.innerHTML = '<i data-lucide="check" style="width: 18px; margin-right: 6px;"></i> Salvo com Sucesso';
       if (window.lucide) lucide.createIcons();
       setTimeout(() => {
          btn.innerHTML = originalText;
          if (window.lucide) lucide.createIcons();
       }, 2000);
    }
  }
};

// Interceptar também o tab config-users
document.addEventListener('DOMContentLoaded', () => {
  if (window.switchTab) {
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId, tabName) {
      originalSwitchTab(tabId, tabName);
      if (tabId === 'config-users') {
        ConfigUsersApp.loadUsers();
      }
    };
  } else {
    // Caso a função ainda não exista, criar um hook ou esperar
    setTimeout(() => {
      if (window.switchTab) {
        const originalSwitchTab = window.switchTab;
        window.switchTab = function(tabId, tabName) {
          originalSwitchTab(tabId, tabName);
          if (tabId === 'config-users') {
            ConfigUsersApp.loadUsers();
          }
        };
      }
    }, 1000);
  }

  // Estilo global para animação das sanfonas (details chevron)
  const style = document.createElement('style');
  style.innerHTML = `
    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    details[open] > summary .details-chevron { transform: rotate(180deg); }
  `;
  document.head.appendChild(style);
});
