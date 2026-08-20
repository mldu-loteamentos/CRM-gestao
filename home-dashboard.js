const HomeDashboard = {
  // Mascotes disponíveis
  pets: [
    { 
      id: '3d_eve', 
      is3DModel: true, 
      glbUrl: 'assets/pets/IA.eL.glb', 
      icon: '🤖', 
      name: 'IA.EL' 
    },
    { 
      id: '3d_pikachu', 
      is3DModel: true, 
      glbUrl: 'assets/pets/Pikachu.glb', 
      icon: '⚡', 
      name: 'Pikachu' 
    },
    { 
      id: '3d_yoshi', 
      is3DModel: true, 
      glbUrl: 'assets/pets/yoshi.glb', 
      icon: '🦖', 
      name: 'Yoshi' 
    }
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

  selectedPetId: localStorage.getItem('crm_home_pet') || '3d_robot',
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
    
    // Ordenar Top 10 Maiores Valores
    const topValores = [...myClients].sort((a, b) => b.overdueValue - a.overdueValue).slice(0, 10);
    const idValores = new Set(topValores.map(c => c.id));
    
    // Ordenar Top 10 Maiores Dias (ignorar os que estão no top valores)
    const topDias = [...myClients]
        .sort((a, b) => b.maxDaysDelay - a.maxDaysDelay)
        .filter(c => !idValores.has(c.id))
        .slice(0, 10);
        
    // Mas precisamos saber quais do topValores TAMBÉM estão no topo de dias (para a bolinha de info)
    const allDiasSorted = [...myClients].sort((a, b) => b.maxDaysDelay - a.maxDaysDelay);
    const top20DiasIds = new Set(allDiasSorted.slice(0, 20).map(c => c.id));

    const tbodyValores = document.getElementById('home-op-tbody-valores');
    if (topValores.length === 0) {
        tbodyValores.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum cliente em atraso na sua fila! 🎉</td></tr>';
    } else {
        tbodyValores.innerHTML = topValores.map(c => {
            const hasHighDelay = top20DiasIds.has(c.id);
            const warningIcon = hasHighDelay ? `<i data-lucide="alert-triangle" style="width: 14px; color: #f59e0b; margin-left: 5px;" title="Também possui um alto tempo de atraso (${c.maxDaysDelay} dias)"></i>` : '';
            return `
            <tr>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">${c.title}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.85rem;">${c.name} ${warningIcon}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444; font-weight: 600;">R$ ${c.overdueValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>
            `;
        }).join('');
    }

    const tbodyDias = document.getElementById('home-op-tbody-dias');
    if (topDias.length === 0) {
        tbodyDias.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum outro cliente.</td></tr>';
    } else {
        tbodyDias.innerHTML = topDias.map(c => {
            return `
            <tr>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">${c.title}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 0.85rem;">${c.name}</td>
              <td style="padding: 8px 15px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #f59e0b; font-weight: 600;">${c.maxDaysDelay} dias</td>
            </tr>
            `;
        }).join('');
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

  speak(includeFeedback = false, isClick = false) {
    const box = document.getElementById('home-pet-speech');
    const textEl = document.getElementById('home-pet-speech-text');
    const petEl = document.getElementById('home-pet-emoji')?.querySelector('img');
    const modelViewer = document.getElementById('my-3d-assistant');
    
    let msg = "Olá! Estou por aqui se precisar.";

    if (isClick) {
       if (modelViewer) {
           const anims = modelViewer.availableAnimations;
           if (anims && anims.length > 0) {
               const randAnim = anims[Math.floor(Math.random() * anims.length)];
               modelViewer.setAttribute('animation-name', randAnim);
               msg = `Animação atual: "${randAnim}". Animações que encontrei no arquivo: ${anims.join(', ')}`;
               setTimeout(() => {
                   modelViewer.setAttribute('animation-name', anims[0]);
               }, 3000);
           } else {
               // Fallback CSS Animations for static 3D models
               const cssAnims = ['petSpin 1s', 'petBounce 1s', 'petFlip 1s', 'petWiggle 1s'];
               const randAnim = cssAnims[Math.floor(Math.random() * cssAnims.length)];
               modelViewer.style.animation = 'none';
               void modelViewer.offsetWidth;
               modelViewer.style.animation = randAnim;
               // Removed the msg so it defaults to standard quotes later
           }
       } else if (petEl) {
           const animations = ['petSpin 1s', 'petBounce 1s', 'petFlip 1s', 'petWiggle 1s'];
           const randAnim = animations[Math.floor(Math.random() * animations.length)];
           petEl.style.animation = 'none';
           void petEl.offsetWidth;
           petEl.style.animation = randAnim;
       }
    }
    
    if (!box || !textEl) return;

    const msgs = [
        // Saúde e Bem-Estar
        "Lembre-se de beber água! Manter-se hidratado ajuda no foco. 💧",
        "Respire fundo... Inspire em 4 segundos, segure por 4, solte em 4. Ajuda muito em ligações difíceis! 🧘",
        "Dê uma espreguiçada rápida! Sua postura agradece. 🙆‍♂️",
        "Olhe um pouco para longe da tela para descansar a vista. 👀",
        
        // Boa Comunicação e Educação
        "Um 'bom dia' sincero e um sorriso na voz mudam o tom de qualquer ligação. 😊",
        "O segredo para um bom acordo é ouvir o cliente antes de propor a solução. 🚀",
        "Seja sempre educado, mesmo quando o cliente estiver estressado. A calma contagia! 🕊️",
        "Chamar o cliente pelo nome demonstra respeito e gera conexão. 🤝",
        
        // Dicas de Negociação de Dívidas
        "Uma cobrança feita com empatia tem mais chances de sucesso. 💙",
        "Tente entender o motivo do atraso. Muitas vezes é apenas um imprevisto! 💡",
        "Ofereça alternativas reais. O objetivo é ajudar o cliente a voltar a ficar em dia! 📊",
        "Destaque os benefícios de estar com o nome limpo e com as parcelas em dia. ✨",
        
        // Organização
        "Não se esqueça de registrar todos os detalhes da conversa nas ocorrências! 📝",
        "Dica: Tente ligar para os clientes com maiores valores ou mais dias de atraso primeiro!",
        "Lembre-se de conferir sua agenda de lembretes para não perder nenhum retorno. 📅",
        "Organize suas abas e deixe as informações do cliente prontas antes de ligar. 🗂️",
        
        // Inspiração
        "Estou de olho nos seus resultados! Vamos bater essa meta! 🎯",
        "Cada ligação é uma nova oportunidade. Acredite no seu potencial! 🌟",
        "Você está fazendo um ótimo trabalho. Continue assim! 💪"
    ];

    if (msg === "Olá! Estou por aqui se precisar.") {
        msg = msgs[Math.floor(Math.random() * msgs.length)];
    }

    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour < 12) greeting = 'Bom dia';
    else if (hour < 18) greeting = 'Boa tarde';

    if (includeFeedback && window.rawClientList) {
       const myClients = this.getMyClients();
       const qtd = myClients.length;
       const totalVal = myClients.reduce((acc, c) => acc + (Number(c.overdueValue) || 0), 0);
       
       if (qtd === 0) {
           msg = `${greeting}! Sua carteira está impecável hoje, zero inadimplência! 🎉`;
       } else {
           msg = `${greeting}! Você tem ${qtd} clientes na sua fila hoje totalizando R$ ${totalVal.toLocaleString('pt-BR',{minimumFractionDigits:2})}. Vamos com tudo fechar essas negociações! 💪`;
       }
    }
    
    textEl.textContent = msg;
    box.style.display = 'block';
    
    // Fechar depois de 8 segundos
    setTimeout(() => {
       box.style.display = 'none';
    }, 8000);
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
   localStorage.setItem('crm_home_pet', id);
   HomeDashboard.updatePetIcon();
   document.getElementById('home-pet-selector-modal').style.display = 'none';
   HomeDashboard.speak(false, true);
};
window.homePetSpeak = (includeFeedback) => HomeDashboard.speak(includeFeedback, true);
