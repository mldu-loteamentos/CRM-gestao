const HomeDashboard = {
  // Mascotes disponíveis
  pets: [
    { id: '3d_iael', is3DModel: true, glbUrl: 'assets/pets/IA.eL.glb', icon: '🤖', name: 'IA.EL' },
    { id: '3d_bluy', is3DModel: true, glbUrl: 'assets/pets/Bluy.glb', icon: '🐾', name: 'Bluy' },
    { id: '3d_ledis', is3DModel: true, glbUrl: 'assets/pets/Ledis.glb', icon: '🌟', name: 'Ledis' },
    { id: '3d_lety', is3DModel: true, glbUrl: 'assets/pets/LeTy.glb', icon: '🎀', name: 'LeTy' },
    { id: '3d_mich', is3DModel: true, glbUrl: 'assets/pets/MicH.glb', icon: '✨', name: 'MicH' },
    { id: '3d_nial', is3DModel: true, glbUrl: 'assets/pets/niAL.glb', icon: '🚀', name: 'NiAL' },
    { id: '3d_prince', is3DModel: true, glbUrl: 'assets/pets/PrincE.glb', icon: '👑', name: 'Prince' }
  ],
  
  motivationalQuotes: [
    "Acredite em si próprio e chegará um dia em que os outros não terão outra escolha senão acreditar com você.",
    "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
    "Com fé e dedicação, nenhum obstáculo é grande demais.",
    "Cada novo dia é uma página em branco para escrever uma nova vitória.",
    "A persistência realiza o impossível.",
    "Deus não te daria um fardo maior do que você pode carregar. Força!",
    "Seja a mudança que você deseja ver no mundo.",
    "A excelência não é um ato, mas um hábito.",
    "Grandes batalhas são dadas a grandes guerreiros.",
    "O segredo do sucesso é a constância do propósito."
  ],

  get selectedPetId() {
    let key = 'crm_home_pet';
    try {
      const u = JSON.parse(localStorage.getItem("crm_logged_user"));
      if (u && (u.id || u.email)) key += '_' + (u.id || u.email);
    } catch(e){}
    return localStorage.getItem(key) || '3d_iael';
  },
  
  set selectedPetId(value) {
    let key = 'crm_home_pet';
    try {
      const u = JSON.parse(localStorage.getItem("crm_logged_user"));
      if (u && (u.id || u.email)) key += '_' + (u.id || u.email);
    } catch(e){}
    localStorage.setItem(key, value);
  },
  intervalId: null,
  DEFAULT_PREVIEW_SIENGE: 'LETICIA.OLIVEIRA',

  normalizeOperatorKey(value) {
    return String(value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  isAdminUser(user) {
    const profile = (user?.profile_name || '').toUpperCase();
    const email = (user?.email || '').toLowerCase();
    return profile.includes('ADMIN') || profile.includes('GESTOR') || profile.includes('GERENTE')
      || email === 'israel@mouraleite.com.br' || email === 'admin@mouraleite.com.br';
  },

  getCrmUsers() {
    try {
      return JSON.parse(localStorage.getItem('crm_users') || '[]') || [];
    } catch (e) {
      return [];
    }
  },

  getOperatorUsers() {
    const fromStorage = this.getCrmUsers().filter(u => {
      const profile = (u.profile_name || '').toUpperCase();
      const status = (u.status || '').toUpperCase();
      return profile.includes('OPERADOR') && status !== 'INATIVO';
    });
    if (fromStorage.length) return fromStorage;
    return [
      { name: 'LETICIA PEREIRA DE OLIVEIRA', sienge_user: 'LETICIA.OLIVEIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'MICHELLE FRANCINE VIEIRA', sienge_user: 'MICHELLE.VIEIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'MICHELLE PEREIRA YAMASHIRO', sienge_user: 'MICHELLE.PEREIRA', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'THAIANE CRISTINA', sienge_user: 'THAIANE.CORDEIRO', profile_name: 'OPERADOR COBRANÇA' },
      { name: 'LUCELIA SALVADOR JUSTO', sienge_user: 'LUCELIA JUSTO', profile_name: 'OPERADOR COBRANÇA' }
    ];
  },

  getViewUser() {
    const real = window.AppState?.currentUser;
    if (!this.isAdminUser(real)) return real;

    const operators = this.getOperatorUsers();
    const stored = sessionStorage.getItem('crm_home_preview_op') || this.DEFAULT_PREVIEW_SIENGE;
    const wanted = this.normalizeOperatorKey(stored);
    const preview = operators.find(u =>
      this.normalizeOperatorKey(u.sienge_user) === wanted
      || this.normalizeOperatorKey(u.name) === wanted
      || String(u.id) === String(stored)
    ) || operators.find(u => this.normalizeOperatorKey(u.sienge_user).includes('LETICIA'))
      || operators[0];

    return preview || real;
  },

  getViewOperatorKey() {
    const user = this.getViewUser();
    return this.normalizeOperatorKey(user?.sienge_user || user?.name || '');
  },

  getMyClients() {
    const list = window.rawClientList || [];
    const opKey = this.getViewOperatorKey();
    if (!opKey) return list;
    return list.filter(c => this.normalizeOperatorKey(c.assignedOperator) === opKey);
  },

  renderPreviewBar() {
    const bar = document.getElementById('home-op-preview-bar');
    const select = document.getElementById('home-op-preview-select');
    if (!bar || !select) return;

    const real = window.AppState?.currentUser;
    if (!this.isAdminUser(real)) {
      bar.style.display = 'none';
      return;
    }

    const operators = this.getOperatorUsers();
    const currentKey = this.getViewOperatorKey();
    select.innerHTML = operators.map(u => {
      const key = u.sienge_user || u.name;
      const selected = this.normalizeOperatorKey(key) === currentKey ? 'selected' : '';
      const first = (u.name || key || '').split(' ')[0];
      return `<option value="${key}" ${selected}>${first} — ${u.name}</option>`;
    }).join('');
    bar.style.display = 'flex';
  },
  
  init() {
    const user = window.AppState?.currentUser;
    const isOperador = user?.profile_name?.toUpperCase().includes('OPERADOR') || user?.profile_name?.toUpperCase().includes('ADMIN');
    
    if (isOperador) {
      document.getElementById('home-em-construcao-container').style.display = 'none';
      document.getElementById('home-operador-container').style.display = 'block';
      document.getElementById('home-pet-container').style.display = 'flex';
      
      this.renderPreviewBar();
      this.updateGreeting();
      this.renderPetSelector();
      this.updatePetIcon();
      
      if (!window.rawClientList || window.rawClientList.length === 0) {
         document.getElementById('home-op-load-data-container').style.display = 'block';
         document.getElementById('home-op-grids-container').style.display = 'none';
         document.getElementById('home-op-lembretes-container').style.display = 'none';
      } else {
         document.getElementById('home-op-load-data-container').style.display = 'none';
         document.getElementById('home-op-grids-container').style.display = 'grid';
         document.getElementById('home-op-lembretes-container').style.display = 'block';
         
         this.renderGrids();
         this.renderLembretes();
         
         setTimeout(() => { this.speak(true, false); }, 2000);
      }
      
      // Enviar mensagens motivacionais automaticamente e atualizar a frase do banner
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
          this.speak(false, true); // true para forçar a dancinha/animação
          this.updateGreeting();
      }, 60000); // 1 minuto

    } else {
      document.getElementById('home-em-construcao-container').style.display = 'flex';
      document.getElementById('home-operador-container').style.display = 'none';
      document.getElementById('home-pet-container').style.display = 'none';
      if (this.intervalId) clearInterval(this.intervalId);
    }
  },

  updateGreeting() {
    const user = this.getViewUser();
    const name = user?.name?.split(' ')[0] || '';
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour < 12) greeting = 'Bom dia';
    else if (hour < 18) greeting = 'Boa tarde';
    
    const quote = this.motivationalQuotes[Math.floor(Math.random() * this.motivationalQuotes.length)];
    
    const greetingEl = document.getElementById('home-op-greeting');
    if (greetingEl) {
        greetingEl.textContent = `${greeting}, ${name.toUpperCase()}!`;
    }
    
    const quoteEl = document.getElementById('home-op-motivational');
    if (quoteEl) {
        quoteEl.textContent = `"${quote}"`;
    }
  },

  renderPetSelector() {
    const grid = document.getElementById('home-pet-selector-grid');
    if (!grid) return;
    
    grid.innerHTML = this.pets.map(p => `
      <div class="pet-selector-item" onclick="window.selectHomePet('${p.id}')" title="${p.name}">
        <div style="font-size: 32px; margin-bottom: 8px;">${p.icon}</div>
        <div style="font-size: 0.75rem; color: #475569; font-weight: 600;">${p.name}</div>
      </div>
    `).join('');
  },

  updatePetIcon() {
    const pet = this.pets.find(p => p.id === this.selectedPetId) || this.pets[0];
    const container = document.getElementById('home-pet-emoji');
    if (container) {
        if (pet.is3DModel) {
           // Aumentando o camera-orbit para 300% (afasta bastante a câmera) e reduzindo a caixa para 200x200 para ficar no tamanho ideal
           container.innerHTML = `<model-viewer id="my-3d-assistant" src="${pet.glbUrl}" autoplay auto-rotate rotation-per-second="5deg" animation-name="Idle" camera-controls interaction-prompt="none" disable-zoom disable-pan camera-orbit="0deg 75deg 300%" style="width: 200px; height: 200px; outline: none; --poster-color: transparent; background-color: transparent; margin-bottom: 0px; margin-right: 0px;"></model-viewer>`;
       } else {
           container.innerHTML = `<img src="${pet.url}" alt="${pet.name}" style="width: 120px; height: 120px; object-fit: contain; mix-blend-mode: multiply; display: block; margin-bottom: -15px;">`;
       }
    }
  },

  async loadData() {
    const btn = document.querySelector('#home-op-load-data-container button');
    if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 18px; margin-right: 8px;"></i> Carregando...';
    
    // Isso deve usar a função global de carregar do Dashboard se existir
    try {
      if (typeof window.carregarDados === 'function') {
         await window.carregarDados(); // Essa função preenche rawClientList
      } else {
         alert("Função de carregamento não encontrada.");
      }
    } catch (e) {
      console.error(e);
    }
    
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 18px; margin-right: 8px;"></i> Carregar Minha Fila';
    // Após carregar, re-renderizar
    this.init();
  },

  renderGrids() {
    if (!window.rawClientList) return;
    
    const myClients = this.getMyClients();
    
    const totalDelayedValue = myClients.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
    
    // Ordenar Top 10 Maiores Valores
    const sortedByValue = [...myClients].sort((a, b) => b.overdueValue - a.overdueValue);
    const topValores = sortedByValue.slice(0, 10);
    const idValores = new Set(topValores.map(c => `${c.customerId}-${c.saleId}`));
    
    const othersByValue = sortedByValue.slice(10);
    const sumOthersValue = othersByValue.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
    
    // Ordenar Top 10 Maiores Dias (ignorar os que estão no top valores)
    const topDias = [...myClients]
        .sort((a, b) => b.maxDaysDelay - a.maxDaysDelay)
        .filter(c => !idValores.has(`${c.customerId}-${c.saleId}`))
        .slice(0, 10);
        
    // Mas precisamos saber quais do topValores TAMBÉM estão no topo de dias (para a bolinha de info)
    const allDiasSorted = [...myClients].sort((a, b) => b.maxDaysDelay - a.maxDaysDelay);
    const top20DiasIds = new Set(allDiasSorted.slice(0, 20).map(c => `${c.customerId}-${c.saleId}`));

    const tbodyValores = document.getElementById('home-op-tbody-valores');
    if (topValores.length === 0) {
        tbodyValores.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum cliente em atraso na sua fila! 🎉</td></tr>';
    } else {
        let html = topValores.map(c => {
            const hasHighDelay = top20DiasIds.has(`${c.customerId}-${c.saleId}`);
            const warningIcon = hasHighDelay ? `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: #f59e0b; margin-left: 5px; vertical-align: -2px;"></i>` : '';
            const percent = totalDelayedValue > 0 ? ((c.overdueValue / totalDelayedValue) * 100).toFixed(1) : 0;
            
            const customerNotes = window.AppState?.notes?.[c.customerId] || [];
            const lastContact = customerNotes.length > 0 ? new Date(Math.max(...customerNotes.map(n => new Date(n.date)))).toLocaleDateString('pt-BR') : "Sem Contato";
            const promiseNotes = customerNotes.filter(n => n.promiseDate);
            const lastPromise = promiseNotes.length > 0 ? new Date(Math.max(...promiseNotes.map(n => new Date(n.promiseDate + 'T12:00:00')))).toLocaleDateString('pt-BR') : "Nenhum";
            const extraInfo = hasHighDelay ? `&#10;Atenção: Cliente está no topo de dias em atraso.` : '';
            const tooltip = `Parcelas em atraso: ${c.billCount || 1}&#10;Dias em atraso: ${c.maxDaysDelay} dias&#10;Último contato: ${lastContact}&#10;Próximo retorno: ${lastPromise}${extraInfo}`;
            
            return `
            <tr onclick="window.viewCustomerCard(${c.customerId}, ${c.saleId})" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'" title="${tooltip}">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 0.85rem;">${c.saleId || '-'}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.customerName || ''} ${warningIcon}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percent}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">${c.maxDaysDelay} dias</td>
            </tr>
            `;
        }).join('');
        
        if (sumOthersValue > 0) {
            const percentOthers = totalDelayedValue > 0 ? ((sumOthersValue / totalDelayedValue) * 100).toFixed(1) : 0;
            html += `
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; font-weight: 700;">Outros (${othersByValue.length} clientes)</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${sumOthersValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percentOthers}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">-</td>
            </tr>`;
        }
        
        html += `
        <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1;">
          <td style="padding: 8px 15px; font-weight: 500;">-</td>
          <td style="padding: 8px 15px; color: #1e293b; font-size: 0.85rem; font-weight: 800;">TOTAL GERAL (${myClients.length} clientes)</td>
          <td style="padding: 8px 15px; text-align: right; color: #ef4444; font-weight: 800; font-size: 0.9rem;">${totalDelayedValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
          <td style="padding: 8px 15px; text-align: right; font-weight: 800; color: #1e293b; font-size: 0.9rem;">100%</td>
          <td style="padding: 8px 15px; text-align: right; color: #f59e0b; font-weight: 800; font-size: 0.9rem;">-</td>
        </tr>`;
        
        tbodyValores.innerHTML = html;
    }

    const tbodyDias = document.getElementById('home-op-tbody-dias');
    if (topDias.length === 0) {
        tbodyDias.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum outro cliente.</td></tr>';
    } else {
        const othersDias = [...myClients]
            .sort((a, b) => b.maxDaysDelay - a.maxDaysDelay)
            .filter(c => !idValores.has(`${c.customerId}-${c.saleId}`))
            .slice(10);
            
        const sumOthersDiasValue = othersDias.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
        
        let htmlDias = topDias.map(c => {
            const customerNotes = window.AppState?.notes?.[c.customerId] || [];
            const lastContact = customerNotes.length > 0 ? new Date(Math.max(...customerNotes.map(n => new Date(n.date)))).toLocaleDateString('pt-BR') : "Sem Contato";
            const promiseNotes = customerNotes.filter(n => n.promiseDate);
            const lastPromise = promiseNotes.length > 0 ? new Date(Math.max(...promiseNotes.map(n => new Date(n.promiseDate + 'T12:00:00')))).toLocaleDateString('pt-BR') : "Nenhum";
            const tooltip = `Parcelas em atraso: ${c.billCount || 1}&#10;Dias em atraso: ${c.maxDaysDelay} dias&#10;Último contato: ${lastContact}&#10;Próximo retorno: ${lastPromise}&#10;Valor atrasado: R$ ${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
            
            const percent = totalDelayedValue > 0 ? ((c.overdueValue / totalDelayedValue) * 100).toFixed(1) : 0;
            return `
            <tr onclick="window.viewCustomerCard(${c.customerId}, ${c.saleId})" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'" title="${tooltip}">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 0.85rem;">${c.saleId || '-'}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.customerName || ''}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">${c.maxDaysDelay} dias</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percent}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>
            `;
        }).join('');
        
        if (sumOthersDiasValue > 0) {
            const percentOthersDias = totalDelayedValue > 0 ? ((sumOthersDiasValue / totalDelayedValue) * 100).toFixed(1) : 0;
            htmlDias += `
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.8rem; font-weight: 700;">Outros (${othersDias.length} clientes)</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600; font-size: 0.85rem;">-</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #64748b; font-size: 0.85rem;">${percentOthersDias}%</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.85rem;">${sumOthersDiasValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>`;
        }
        
        const topDiasSumValue = topDias.reduce((sum, c) => sum + (c.overdueValue || 0), 0);
        const totalDiasValue = topDiasSumValue + sumOthersDiasValue;
        const totalDiasPercent = totalDelayedValue > 0 ? ((totalDiasValue / totalDelayedValue) * 100).toFixed(1) : 0;
        
        htmlDias += `
        <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1;">
          <td style="padding: 8px 15px; font-weight: 500;">-</td>
          <td style="padding: 8px 15px; color: #1e293b; font-size: 0.85rem; font-weight: 800;">TOTAL GERAL (${myClients.length} clientes)</td>
          <td style="padding: 8px 15px; text-align: right; color: #f59e0b; font-weight: 800; font-size: 0.9rem;">-</td>
          <td style="padding: 8px 15px; text-align: right; font-weight: 800; color: #1e293b; font-size: 0.9rem;">100%</td>
          <td style="padding: 8px 15px; text-align: right; color: #ef4444; font-weight: 800; font-size: 0.9rem;">${totalDelayedValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
        </tr>`;
        
        tbodyDias.innerHTML = htmlDias;
    }
    
    if(window.lucide) window.lucide.createIcons();
  },

  renderLembretes() {
    const list = document.getElementById('home-op-lembretes-list');
    
    // Obter os lembretes de hoje do operador
    if (typeof window.getAgendaTasksForDate === 'function') {
        const todayStr = new Date().toISOString().split('T')[0];
        const tasks = window.getAgendaTasksForDate(todayStr);
        const viewUser = this.getViewUser();
        const userOp = viewUser?.name?.split(' ')[0] || '';
        const opKey = this.getViewOperatorKey();
        
        const myTasks = tasks.filter(t => {
           if (t.operator && t.operator !== 'NÃO ATRIBUÍDO' && t.operator !== 'OUTROS' && opKey) {
               const taskKey = this.normalizeOperatorKey(t.operator);
               if (taskKey !== opKey && !taskKey.includes(this.normalizeOperatorKey(userOp))) {
                   if (t.sharedWith && t.sharedWith.includes(userOp)) return true;
                   return false;
               }
           }
           return true;
        });

        if (myTasks.length === 0) {
           list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Você não tem lembretes para hoje.</div>';
        } else {
           list.innerHTML = myTasks.map(t => {
               const st = (t.status||'').toLowerCase();
               const isResolved = st === 'resolvido';
               if (isResolved) return ''; // Podemos omitir
               
               return `
               <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--color-primary);">
                 <div>
                   <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t.title}</div>
                   <div style="font-size: 0.8rem; color: #64748b;">${t.clientName}</div>
                   <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Lembrete: ${t.reminder || 'Acompanhar'}</div>
                 </div>
                 <button class="btn btn-outline btn-sm" onclick="window.switchTab('agenda'); setTimeout(()=>window.setAgendaOperator('${userOp}'), 500);" style="padding: 4px 8px; font-size: 0.75rem;">Ver na Agenda</button>
               </div>
               `;
           }).join('');
           
           if(list.innerHTML.trim() === '') {
              list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum lembrete pendente para hoje.</div>';
           }
        }
    } else {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Erro ao carregar lembretes.</div>';
    }
  },

  async speak(includeFeedback = false, isClick = false) {
    const box = document.getElementById('home-pet-speech');
    const textEl = document.getElementById('home-pet-speech-text');
    const modelViewer = document.getElementById('my-3d-assistant');
    const petContainer = document.getElementById('home-pet-container');
    
    if (!box || !textEl) return;
    
    // Mostra loading
    textEl.textContent = "Pensando...";
    box.style.display = 'block';

    if (isClick && petContainer) {
        // Animação de rodopio feliz
        petContainer.animate([
            { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
            { transform: 'translate(50px, -50px) rotate(180deg) scale(1.2)' },
            { transform: 'translate(-50px, -20px) rotate(360deg) scale(1.1)' },
            { transform: 'translate(0px, 0px) rotate(720deg) scale(1)' }
        ], {
            duration: 1000,
            easing: 'ease-in-out'
        });
        
        if (modelViewer && modelViewer.availableAnimations && modelViewer.availableAnimations.length > 0) {
            const randAnim = modelViewer.availableAnimations[Math.floor(Math.random() * modelViewer.availableAnimations.length)];
            modelViewer.setAttribute('animation-name', randAnim);
        }
    }

    const hour = new Date().getHours();
    let timeGreeting = 'Boa noite';
    if (hour < 12) timeGreeting = 'Bom dia';
    else if (hour < 18) timeGreeting = 'Boa tarde';

    const petName = this.pets.find(p => p.id === this.selectedPetId)?.name || 'seu Assistente';
    const dayOfWeek = new Date().getDay();
    
    let baseGreet = `Oii! Eu sou ${petName} e gosto muito de você! 🥰`;
    if (dayOfWeek === 1) { // Segunda-feira
        baseGreet = `Oii! Eu sou ${petName}. Estava morrendo de saudades de você no fim de semana! 🥰 Que bom que voltou!`;
    }

    let weatherMsg = '';
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-22.8833&longitude=-48.4417&daily=precipitation_probability_max&timezone=America%2FSao_Paulo');
        if (res.ok) {
            const data = await res.json();
            const prob = data.daily?.precipitation_probability_max?.[0] || 0;
            if (prob > 50) {
                weatherMsg = `Ah, a previsão indica ${prob}% de chance de chuva hoje em Botucatu. Não esqueça o guarda-chuva e uma blusa! ☔🧥`;
            } else {
                weatherMsg = `O clima hoje em Botucatu parece tranquilo (chance de chuva de ${prob}%). ☀️`;
            }
        }
    } catch(e) {
        console.log("Weather API failed");
    }

    let highestMsg = '';
    if (window.rawClientList) {
        const myClients = this.getMyClients();
        if (myClients.length > 0) {
            let highestClient = myClients[0];
            myClients.forEach(c => {
                if ((Number(c.overdueValue)||0) > (Number(highestClient.overdueValue)||0)) {
                    highestClient = c;
                }
            });
            const valStr = (Number(highestClient.overdueValue)||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
            highestMsg = `Hoje a nossa maior prioridade na fila é o cliente ${highestClient.customerName} (Título ${highestClient.receivableBillId || highestClient.saleId}, R$ ${valStr}). Vamos lá fechar esse acordo! 💪`;
        } else {
            highestMsg = `Sua carteira está impecável hoje, zero inadimplência! 🎉`;
        }
    }

    const waterMsg = "Já bebeu água hoje? Que tal fazer uma pequena pausa para esticar as pernas? 💧🚶‍♀️";
    const motivMsg = this.motivationalQuotes[Math.floor(Math.random() * this.motivationalQuotes.length)];

    let finalMsg = '';
    
    if (isClick) {
        finalMsg = `${baseGreet}\n\n${highestMsg}\n\n${weatherMsg}\n\n${waterMsg}\n\nLembre-se: ${motivMsg}`;
    } else {
        if (includeFeedback && highestMsg) {
            finalMsg = `${timeGreeting}! ${highestMsg}\n\n${motivMsg}`;
        } else {
            finalMsg = `${timeGreeting}! ${waterMsg} ${motivMsg}`;
        }
    }

    textEl.innerHTML = finalMsg.replace(/\n/g, '<br>');
    box.style.display = 'block';
    
    // Fechar depois de 15 segundos se for click (mensagem longa) ou 8s se for automatico
    setTimeout(() => {
       box.style.display = 'none';
    }, isClick ? 15000 : 8000);
  }
};

// Funções globais necessárias para os botões do HTML
window.renderOperadorHomeDashboard = () => HomeDashboard.init();
window.loadOperadorHomeData = () => HomeDashboard.loadData();
window.setHomePreviewOperator = (siengeUser) => {
   sessionStorage.setItem('crm_home_preview_op', siengeUser);
   HomeDashboard.init();
};
window.openPetSelector = () => document.getElementById('home-pet-selector-modal').style.display = 'flex';
window.selectHomePet = (id) => {
   HomeDashboard.selectedPetId = id;
   HomeDashboard.updatePetIcon();
   document.getElementById('home-pet-selector-modal').style.display = 'none';
   HomeDashboard.speak(false, true);
};
window.homePetSpeak = (includeFeedback) => HomeDashboard.speak(includeFeedback, true);
