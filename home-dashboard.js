// home-dashboard.js
// Lógica para o Dashboard da página Home (exclusivo para perfil Operador de Cobrança)

const HomeDashboard = {
  // Mascotes disponíveis
  pets: [
    { id: 'robo', emoji: '🤖', name: 'Zeca' },
    { id: 'cachorro', emoji: '🐶', name: 'Tobby' },
    { id: 'gato', emoji: '🐱', name: 'Mingau' },
    { id: 'coruja', emoji: '🦉', name: 'Sabida' },
    { id: 'raposa', emoji: '🦊', name: 'Foxy' },
    { id: 'coelho', emoji: '🐰', name: 'Pernalonga' },
    { id: 'tigre', emoji: '🐯', name: 'Tigrão' },
    { id: 'urso', emoji: '🐼', name: 'Panda' },
    { id: 'sapo', emoji: '🐸', name: 'Sapo' },
    { id: 'macaco', emoji: '🐵', name: 'Kong' },
    { id: 'clipe', emoji: '📎', name: 'Clippy' }
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

  selectedPetId: localStorage.getItem('crm_home_pet') || 'robo',
  
  init() {
    const user = window.AppState?.currentUser;
    const isOperador = user?.profile_name?.toUpperCase().includes('OPERADOR') || user?.profile_name?.toUpperCase().includes('ADMIN');
    
    if (isOperador) {
      document.getElementById('home-em-construcao-container').style.display = 'none';
      document.getElementById('home-operador-container').style.display = 'block';
      document.getElementById('home-pet-container').style.display = 'flex';
      
      this.updateGreeting();
      this.renderPetSelector();
      this.updatePetIcon();
      
      if (!window.rawClientList || window.rawClientList.length === 0) {
         // Dados não carregados
         document.getElementById('home-op-load-data-container').style.display = 'block';
         document.getElementById('home-op-grids-container').style.display = 'none';
         document.getElementById('home-op-lembretes-container').style.display = 'none';
      } else {
         document.getElementById('home-op-load-data-container').style.display = 'none';
         document.getElementById('home-op-grids-container').style.display = 'grid';
         document.getElementById('home-op-lembretes-container').style.display = 'block';
         
         this.renderGrids();
         this.renderLembretes();
         // Fala inicial com feedback
         setTimeout(() => { this.speak(true); }, 2000);
      }
    } else {
      document.getElementById('home-em-construcao-container').style.display = 'flex';
      document.getElementById('home-operador-container').style.display = 'none';
      document.getElementById('home-pet-container').style.display = 'none';
    }
  },

  updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour < 12) greeting = 'Bom dia';
    else if (hour < 18) greeting = 'Boa tarde';
    
    const user = window.AppState?.currentUser;
    const name = user?.name ? user.name.split(' ')[0] : 'Operador';
    
    document.getElementById('home-op-greeting').textContent = `${greeting}, ${name}!`;
    
    // Set random quote
    const quote = this.motivationalQuotes[Math.floor(Math.random() * this.motivationalQuotes.length)];
    document.getElementById('home-op-motivational').textContent = `"${quote}"`;
  },

  renderPetSelector() {
    const grid = document.getElementById('home-pet-selector-grid');
    if (!grid) return;
    
    grid.innerHTML = this.pets.map(p => `
      <div class="pet-selector-item" onclick="window.selectHomePet('${p.id}')" title="${p.name}">
        ${p.emoji}
      </div>
    `).join('');
  },

  updatePetIcon() {
    const pet = this.pets.find(p => p.id === this.selectedPetId) || this.pets[0];
    const el = document.getElementById('home-pet-emoji');
    if (el) el.textContent = pet.emoji;
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
    
    const opSienge = window.AppState?.currentUser?.sienge_user || '';
    
    // Filtrar clientes da carteira do operador (opcional, ou pega todos atribuídos a ele)
    // Na fila de cobrança os clientes têm .operatorSienge (atribuído)
    let myClients = window.rawClientList;
    
    if (opSienge) {
        myClients = myClients.filter(c => c.operatorSienge === opSienge);
    }
    
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
        const opSienge = window.AppState?.currentUser?.sienge_user || '';
        const userOp = window.AppState?.currentUser?.name?.split(' ')[0] || '';
        
        // Filtra para o operador logado (como na agenda)
        const myTasks = tasks.filter(t => {
           if (t.operator && t.operator !== 'NÃO ATRIBUÍDO' && t.operator !== 'OUTROS' && opSienge) {
               // Verifica se é o operador atual
               if (t.operator !== userOp && !t.operator.includes(userOp.toUpperCase())) {
                   // Verificar shares
                   if (t.sharedWith && t.sharedWith.includes(userOp)) return true;
                   return false; // Não é dele
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

  speak(includeFeedback = false) {
    const box = document.getElementById('home-pet-speech');
    const textEl = document.getElementById('home-pet-speech-text');
    
    if (!box || !textEl) return;
    
    let msg = "Olá! Estou por aqui se precisar.";
    
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour < 12) greeting = 'Bom dia';
    else if (hour < 18) greeting = 'Boa tarde';

    if (includeFeedback && window.rawClientList) {
       // Cálculo simples: quantos títulos em atraso hoje?
       const myClients = window.rawClientList.filter(c => c.operatorSienge === window.AppState?.currentUser?.sienge_user);
       const qtd = myClients.length;
       const totalVal = myClients.reduce((acc, c) => acc + c.overdueValue, 0);
       
       if (qtd === 0) {
           msg = `${greeting}! Sua carteira está impecável hoje, zero inadimplência! 🎉`;
       } else {
           msg = `${greeting}! Você tem ${qtd} clientes na sua fila hoje totalizando R$ ${totalVal.toLocaleString('pt-BR',{minimumFractionDigits:2})}. Vamos com tudo fechar essas negociações! 💪`;
       }
    } else {
       const msgs = [
          "Estou de olho nos seus resultados! 👀",
          "Não se esqueça de registrar os contatos nas ocorrências.",
          "Dica: Tente ligar para os clientes com maiores valores primeiro!",
          "Lembre-se de conferir sua agenda de lembretes.",
          "Uma cobrança feita com empatia tem mais chances de sucesso. 💙"
       ];
       msg = msgs[Math.floor(Math.random() * msgs.length)];
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
window.openPetSelector = () => document.getElementById('home-pet-selector-modal').style.display = 'flex';
window.selectHomePet = (id) => {
   HomeDashboard.selectedPetId = id;
   localStorage.setItem('crm_home_pet', id);
   HomeDashboard.updatePetIcon();
   document.getElementById('home-pet-selector-modal').style.display = 'none';
   HomeDashboard.speak();
};
window.homePetSpeak = (includeFeedback) => HomeDashboard.speak(includeFeedback);
