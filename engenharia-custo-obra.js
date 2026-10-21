/* Custo obra — painel da obra 13900.
   Consultas (somente leitura):
   GET /building-cost-estimations/{buildingId}/sheets
   GET /bulk-data/v1/building-cost-estimation-items
   GET /building-cost-estimations/{buildingId}/sheets/{buildingUnitId}/items
   GET /bulk-data/v1/building/resources
   GET /building-projects/progress-logs
   GET /building-projects/{buildingId}/progress-logs/{measurementNumber}
   GET /building-projects/{buildingId}/progress-logs/{measurementNumber}/items/{buildingUnitId}
*/
(function() {
  const OBRA_PADRAO = "13900";
  const CAT = {
    EQUIPMENT: "Equipamento",
    LABOR: "Mão de obra",
    INCREMENTAL_COST_ITEM: "Item de incidência",
    MATERIAL: "Material",
    TRANSPORT_ITEM: "Transporte",
    OTHER: "Outros",
    OFFICE_SUPPLY: "Material de escritório",
    FUELS_AND_LUBRICANTS: "Combustíveis e lubrificantes",
    MAINTENANCE_MATERIAL: "Material de manutenção"
  };

  function hojeIso() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function brl(v) {
    return num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function pct(v) {
    return num(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "—";
  }

  function catNome(c) {
    const k = String(c || "").trim();
    return CAT[k] || k || "—";
  }

  function listaDe(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.results)) return res.results;
    if (Array.isArray(res.data)) return res.data;
    return [];
  }

  function idUnidade(sheet) {
    if (!sheet) return "";
    const id = sheet.buildingUnitId != null ? sheet.buildingUnitId : (sheet.id != null ? sheet.id : sheet.building_unit_id);
    return id == null ? "" : String(id);
  }

  function nomeUnidade(sheet) {
    if (!sheet) return "Unidade";
    return String(sheet.description || sheet.buildingUnitName || sheet.name || ("Unidade " + idUnidade(sheet)));
  }

  function primeiroNumero(raw, chaves) {
    if (!raw) return 0;
    for (let i = 0; i < chaves.length; i++) {
      if (raw[chaves[i]] != null && raw[chaves[i]] !== "") return num(raw[chaves[i]]);
    }
    return 0;
  }

  function somaDesembolso(raw) {
    if (!raw) return 0;
    const direto = primeiroNumero(raw, ["disbursementAmount", "totalDisbursement", "disbursedAmount"]);
    if (direto) return direto;
    const arr = raw.disbursements || raw.disbursment;
    if (!Array.isArray(arr)) return 0;
    return arr.reduce(function(acc, d) {
      return acc + num(d && (d.amount != null ? d.amount : (d.value != null ? d.value : (d.totalPrice != null ? d.totalPrice : d.cost))));
    }, 0);
  }

  function normItem(raw, unitId) {
    const qty = num(raw && (raw.quantity != null ? raw.quantity : raw.budgetQuantity));
    const unitPrice = num(raw && raw.unitPrice);
    const total = num(raw && (raw.totalPrice != null ? raw.totalPrice : raw.baseTotalPrice)) || (qty * unitPrice);
    const percent = primeiroNumero(raw, ["percentComplete", "measuredPercentage", "percentage", "accumulatedPercentage"]);
    const previsto = primeiroNumero(raw, ["scheduledPercentComplete", "scheduledPercentage"]);
    const medida = primeiroNumero(raw, ["measuredQuantity", "quantityMeasured"]);
    return {
      id: String((raw && (raw.id || raw.workItemId)) || ""),
      workItemId: String((raw && raw.workItemId) || ""),
      wbsCode: String((raw && (raw.wbsCode || raw.code)) || ""),
      description: String((raw && (raw.description || raw.workItemDescription)) || ""),
      unitOfMeasure: String((raw && (raw.unitOfMeasure || raw.unit)) || ""),
      quantity: qty,
      unitPrice: unitPrice,
      totalPrice: total,
      pricesByCategory: Array.isArray(raw && raw.pricesByCategory) ? raw.pricesByCategory : [],
      percentComplete: percent,
      scheduledPercentComplete: previsto,
      measuredQuantity: medida,
      desembolsado: somaDesembolso(raw),
      unitId: String(unitId || (raw && raw.buildingUnitId) || "")
    };
  }

  function valorMedidoItem(item) {
    if (!item) return 0;
    if (num(item.measuredQuantity) > 0 && num(item.unitPrice) > 0) return num(item.measuredQuantity) * num(item.unitPrice);
    return num(item.totalPrice) * num(item.percentComplete) / 100;
  }

  function valorPrevistoItem(item) {
    if (!item) return 0;
    return num(item.totalPrice) * num(item.scheduledPercentComplete) / 100;
  }

  function normInsumo(raw) {
    return {
      id: String((raw && (raw.buildingResourceId || raw.id)) || ""),
      code: String((raw && raw.resourceCode) || ""),
      description: String((raw && (raw.description || raw.detailDescription)) || ""),
      unit: String((raw && raw.unitOfMeasure) || ""),
      unitPrice: num(raw && raw.unitPrice),
      category: String((raw && (raw.category || raw.priceCategory)) || ""),
      group: String((raw && raw.resourceGroup) || ""),
      detail: String((raw && raw.detailDescription) || ""),
      trademark: String((raw && raw.trademarkDescription) || ""),
      active: !(raw && raw.isActive === false),
      min: raw && raw.minimumStock != null ? num(raw.minimumStock) : null,
      max: raw && raw.maximumStock != null ? num(raw.maximumStock) : null,
      restante: num(raw && raw.remainingDisbursement)
    };
  }

  function normMedicao(raw) {
    return {
      number: num(raw && (raw.measurementNumber != null ? raw.measurementNumber : (raw.number != null ? raw.number : raw.id))),
      date: String((raw && (raw.date || raw.measurementDate)) || "").slice(0, 10),
      consistent: !(raw && raw.consistent === false),
      responsible: String((raw && (raw.responsibleName || raw.responsibleId)) || ""),
      notes: String((raw && (raw.notes || raw.observation)) || "")
    };
  }

  function simular() {
    const folhas = [
      { id: 1, description: "Infraestrutura", status: "UNLOCKED" },
      { id: 2, description: "Edificações", status: "UNLOCKED" },
      { id: 3, description: "Urbanização", status: "LOCKED" }
    ];
    const base = [
      { unitId: "1", id: "101", wbsCode: "1.01", description: "Escavação e carga", unit: "m³", qty: 1200, price: 48.5, cat: "LABOR", avanco: [10, 22, 35] },
      { unitId: "1", id: "102", wbsCode: "1.02", description: "Concreto magro", unit: "m³", qty: 80, price: 420, cat: "MATERIAL", avanco: [18, 40, 55] },
      { unitId: "1", id: "103", wbsCode: "1.03", description: "Forma de madeira", unit: "m²", qty: 600, price: 85, cat: "MATERIAL", avanco: [8, 25, 40] },
      { unitId: "2", id: "201", wbsCode: "2.01", description: "Alvenaria de vedação", unit: "m²", qty: 2400, price: 95, cat: "LABOR", avanco: [6, 20, 38] },
      { unitId: "2", id: "202", wbsCode: "2.02", description: "Estrutura de concreto", unit: "m³", qty: 180, price: 1850, cat: "MATERIAL", avanco: [12, 30, 46] },
      { unitId: "2", id: "203", wbsCode: "2.03", description: "Cobertura", unit: "m²", qty: 900, price: 210, cat: "MATERIAL", avanco: [0, 15, 28] },
      { unitId: "3", id: "301", wbsCode: "3.01", description: "Pavimentação", unit: "m²", qty: 3500, price: 72, cat: "EQUIPMENT", avanco: [4, 12, 22] },
      { unitId: "3", id: "302", wbsCode: "3.02", description: "Drenagem", unit: "m", qty: 800, price: 160, cat: "MATERIAL", avanco: [5, 18, 30] }
    ];
    const itens = {};
    const itensMedicao = {};
    [1, 2, 3].forEach(function(n) { itensMedicao[n] = {}; });
    base.forEach(function(row) {
      const total = Math.round(row.qty * row.price * 100) / 100;
      const avanco = row.avanco[row.avanco.length - 1];
      const item = {
        id: row.id,
        wbsCode: row.wbsCode,
        workItemId: Number(row.id),
        description: row.description,
        unitOfMeasure: row.unit,
        quantity: row.qty,
        unitPrice: row.price,
        totalPrice: total,
        pricesByCategory: [{ category: row.cat, unitPrice: row.price, totalPrice: total }],
        buildingUnitId: row.unitId,
        percentComplete: avanco,
        scheduledPercentComplete: Math.min(100, avanco + 12),
        measuredQuantity: Math.round(row.qty * avanco) / 100
      };
      if (!itens[row.unitId]) itens[row.unitId] = [];
      itens[row.unitId].push(normItem(item, row.unitId));
      row.avanco.forEach(function(p, idx) {
        const med = idx + 1;
        if (!itensMedicao[med][row.unitId]) itensMedicao[med][row.unitId] = [];
        itensMedicao[med][row.unitId].push(normItem(Object.assign({}, item, { percentComplete: p }), row.unitId));
      });
    });
    const insumos = [
      { buildingResourceId: 101, resourceCode: "CIM-01", description: "Cimento CP-II", unitOfMeasure: "sc", unitPrice: 32.5, category: "MATERIAL", resourceGroup: "Cimento", detailDescription: "Saco 50 kg", trademarkDescription: "Nacional", isActive: true, minimumStock: 200, maximumStock: 800, remainingDisbursement: 18400 },
      { buildingResourceId: 102, resourceCode: "ACO-50", description: "Aço CA-50", unitOfMeasure: "kg", unitPrice: 7.8, category: "MATERIAL", resourceGroup: "Aço", detailDescription: "Barra 12 mm", trademarkDescription: "Gerdau", isActive: true, minimumStock: 2000, maximumStock: 12000, remainingDisbursement: 42600 },
      { buildingResourceId: 103, resourceCode: "ARE-01", description: "Areia média", unitOfMeasure: "m³", unitPrice: 95, category: "MATERIAL", resourceGroup: "Agregados", detailDescription: "Lavada", trademarkDescription: "", isActive: true, minimumStock: 40, maximumStock: 180, remainingDisbursement: 7600 },
      { buildingResourceId: 204, resourceCode: "MO-PED", description: "Pedreiro", unitOfMeasure: "h", unitPrice: 28, category: "LABOR", resourceGroup: "Mão de obra", detailDescription: "Hora produtiva", trademarkDescription: "", isActive: true, minimumStock: null, maximumStock: null, remainingDisbursement: 61200 },
      { buildingResourceId: 305, resourceCode: "EQ-BET", description: "Betoneira 400 L", unitOfMeasure: "un", unitPrice: 185, category: "EQUIPMENT", resourceGroup: "Equipamentos", detailDescription: "Locação diária", trademarkDescription: "", isActive: true, minimumStock: 1, maximumStock: 4, remainingDisbursement: 5400 },
      { buildingResourceId: 118, resourceCode: "TIN-01", description: "Tinta látex", unitOfMeasure: "l", unitPrice: 24.9, category: "MATERIAL", resourceGroup: "Acabamento", detailDescription: "Branco fosco", trademarkDescription: "", isActive: true, minimumStock: 80, maximumStock: 300, remainingDisbursement: 9800 }
    ].map(normInsumo);
    const medicoes = [
      { measurementNumber: 1, date: "2026-08-15", consistent: true, responsibleName: "Equipe de obra" },
      { measurementNumber: 2, date: "2026-09-15", consistent: true, responsibleName: "Equipe de obra" },
      { measurementNumber: 3, date: "2026-10-15", consistent: true, responsibleName: "Equipe de obra" }
    ].map(normMedicao);
    return { folhas: folhas, itens: itens, insumos: insumos, medicoes: medicoes, itensMedicao: itensMedicao };
  }

  const App = {
    obraId: OBRA_PADRAO,
    inicio: "2026-01-01",
    fim: hojeIso(),
    aba: "resumo",
    fonte: "simulacao",
    aviso: "",
    carregando: false,
    etapa: "",
    progresso: 8,
    folhas: [],
    itens: {},
    unidadeSel: "",
    insumos: [],
    medicoes: [],
    medicaoSel: 0,
    itensMedicao: {},
    medidoPorNumero: {},
    erros: {},
    busca: { itens: "", insumos: "" },
    ordem: {
      planilhas: { campo: "id", dir: 1 },
      itens: { campo: "wbsCode", dir: 1 },
      insumos: { campo: "code", dir: 1 },
      medicoes: { campo: "number", dir: 1 },
      meditens: { campo: "wbsCode", dir: 1 }
    },
    _foco: "",

    init: function() {
      if (!this.folhas.length) this.aplicarSimulacao("Simulação da obra " + this.obraId + ". Os números seguem o formato das consultas de orçamento, insumos e medições.");
      this.render();
    },

    aplicarSimulacao: function(aviso) {
      const pacote = simular();
      this.fonte = "simulacao";
      this.aviso = aviso || "";
      this.erros = {};
      this.folhas = pacote.folhas;
      this.itens = pacote.itens;
      this.insumos = pacote.insumos;
      this.medicoes = pacote.medicoes;
      this.itensMedicao = pacote.itensMedicao;
      this.medidoPorNumero = {};
      pacote.medicoes.forEach((m) => {
        const itens = [];
        Object.keys(pacote.itensMedicao[m.number] || {}).forEach((uid) => {
          (pacote.itensMedicao[m.number][uid] || []).forEach((item) => itens.push(item));
        });
        this.medidoPorNumero[String(m.number)] = itens.reduce((acc, item) => acc + valorMedidoItem(item), 0);
      });
      this.unidadeSel = idUnidade(pacote.folhas[0]);
      this.medicaoSel = pacote.medicoes.length ? pacote.medicoes[pacote.medicoes.length - 1].number : 0;
    },

    setAba: function(id) {
      this.aba = id;
      this._foco = "";
      this.render();
    },

    ordenar: function(tabela, campo) {
      const atual = this.ordem[tabela] || { campo: campo, dir: 1 };
      this.ordem[tabela] = { campo: campo, dir: atual.campo === campo ? -atual.dir : 1 };
      this.render();
    },

    filtrar: function(qual, valor) {
      this.busca[qual] = String(valor || "");
      this._foco = qual;
      this.render();
    },

    escolherUnidade: function(id) {
      this.unidadeSel = String(id);
      this.aba = "planilhas";
      this.render();
      if (this.fonte === "sienge" && !this.itens[this.unidadeSel]) this.carregarItensUnidade(this.unidadeSel);
    },

    escolherMedicao: function(n) {
      this.medicaoSel = num(n);
      this.aba = "medicoes";
      this.render();
      if (this.fonte === "sienge") this.carregarItensMedicao(this.medicaoSel);
    },

    lerFiltros: function() {
      const obra = document.getElementById("cob-obra");
      const ini = document.getElementById("cob-inicio");
      const fim = document.getElementById("cob-fim");
      if (obra && String(obra.value || "").trim()) this.obraId = String(obra.value).replace(/\D/g, "") || OBRA_PADRAO;
      if (ini && ini.value) this.inicio = ini.value;
      if (fim && fim.value) this.fim = fim.value;
    },

    consultar: async function() {
      this.lerFiltros();
      const modo = typeof window.getSiengeApiMode === "function" ? window.getSiengeApiMode() : "";
      if (modo === "simulado" || typeof siengeFetchWithRetry !== "function") {
        this.aplicarSimulacao("O Sienge está em modo simulado. O painel continua com a simulação da obra " + this.obraId + ".");
        this.render();
        return;
      }
      this.carregando = true;
      this.etapa = "Lendo as planilhas do orçamento…";
      this.progresso = 18;
      this.render();
      const id = encodeURIComponent(this.obraId);
      const erros = {};
      try {
        const folhas = await this.paginas("/building-cost-estimations/" + id + "/sheets");
        this.folhas = folhas;
        this.unidadeSel = idUnidade(folhas[0]);
        this.etapa = "Lendo os itens do orçamento…";
        this.progresso = 40;
        this.render();
        try {
          const qItens = "/bulk-data/v1/building-cost-estimation-items?buildingId=" + id
            + "&dataDate=" + encodeURIComponent(this.fim)
            + "&includeDisbursments=true";
          const resItens = await siengeFetchWithRetry(qItens, 2);
          this.aplicarItens(this.ingerirItens(listaDe(resItens)));
        } catch (eItens) {
          const mapa = {};
          for (let i = 0; i < folhas.length; i++) {
            const uid = idUnidade(folhas[i]);
            if (!uid) continue;
            const itens = await this.paginas("/building-cost-estimations/" + id + "/sheets/" + encodeURIComponent(uid) + "/items");
            mapa[uid] = itens.map(function(row) { return normItem(row, uid); });
          }
          this.itens = mapa;
          erros.itens = (eItens && eItens.message) || "Os itens em massa não voltaram. As planilhas foram lidas uma a uma, sem o avanço acumulado.";
        }
        this.etapa = "Lendo os insumos da obra…";
        this.progresso = 62;
        this.render();
        try {
          const q = "/bulk-data/v1/building/resources?buildingId=" + id
            + "&startDate=" + encodeURIComponent(this.inicio)
            + "&endDate=" + encodeURIComponent(this.fim);
          const resIns = await siengeFetchWithRetry(q, 2);
          this.insumos = listaDe(resIns).map(normInsumo);
        } catch (eIns) {
          this.insumos = [];
          erros.insumos = (eIns && eIns.message) || "Os insumos não voltaram.";
        }
        this.etapa = "Lendo as medições…";
        this.progresso = 80;
        this.render();
        try {
          const logs = await this.paginas("/building-projects/progress-logs?buildingId=" + id);
          this.medicoes = logs.map(normMedicao).filter(function(m) { return m.number > 0; });
          this.medicaoSel = this.medicoes.length ? this.medicoes[this.medicoes.length - 1].number : 0;
          this.itensMedicao = {};
          if (this.medicaoSel) await this.carregarItensMedicao(this.medicaoSel, true);
        } catch (eMed) {
          this.medicoes = [];
          erros.medicoes = (eMed && eMed.message) || "As medições não voltaram.";
        }
        this.fonte = "sienge";
        this.erros = erros;
        this.aviso = "Dados lidos no Sienge para a obra " + this.obraId + ".";
      } catch (e) {
        this.aplicarSimulacao("A consulta do orçamento não retornou. O painel segue com a simulação da obra " + this.obraId + ".");
        this.erros = { geral: (e && e.message) || "Falha na consulta." };
      }
      this.carregando = false;
      this.etapa = "";
      this.progresso = 100;
      this.render();
    },

    paginas: async function(base) {
      if (typeof siengeFetchAllPages === "function") {
        const rows = await siengeFetchAllPages(base, 200);
        return Array.isArray(rows) ? rows : listaDe(rows);
      }
      const sep = base.indexOf("?") >= 0 ? "&" : "?";
      const res = await siengeFetchWithRetry(base + sep + "limit=200&offset=0", 2);
      return listaDe(res);
    },

    ingerirItens: function(rows) {
      const lista = Array.isArray(rows) ? rows : [];
      let versao = null;
      lista.forEach(function(raw) {
        if (!raw || raw.versionNumber == null || raw.versionNumber === "") return;
        const n = num(raw.versionNumber);
        if (versao == null || n > versao) versao = n;
      });
      const atuais = versao == null ? lista : lista.filter(function(raw) { return num(raw && raw.versionNumber) === versao; });
      const mapa = {};
      const nomes = {};
      atuais.forEach(function(raw) {
        const uid = String((raw && raw.buildingUnitId) || "");
        if (!uid) return;
        if (!mapa[uid]) mapa[uid] = [];
        mapa[uid].push(normItem(raw, uid));
        if (raw.buildingUnitName) nomes[uid] = String(raw.buildingUnitName);
      });
      const todos = [];
      Object.keys(mapa).forEach(function(uid) {
        (mapa[uid] || []).forEach(function(item) { todos.push(item); });
      });
      let topo = 0;
      todos.forEach(function(item) {
        topo = Math.max(topo, num(item.percentComplete), num(item.scheduledPercentComplete));
      });
      if (topo > 0 && topo <= 1) {
        todos.forEach(function(item) {
          item.percentComplete = num(item.percentComplete) * 100;
          item.scheduledPercentComplete = num(item.scheduledPercentComplete) * 100;
        });
      }
      return { mapa: mapa, nomes: nomes, versao: versao };
    },

    aplicarItens: function(pacote) {
      const self = this;
      this.itens = pacote.mapa || {};
      Object.keys(pacote.nomes || {}).forEach(function(uid) {
        const ja = self.folhas.some(function(f) { return idUnidade(f) === uid; });
        if (!ja) self.folhas.push({ id: uid, description: pacote.nomes[uid], status: "" });
      });
      if (!this.unidadeSel) this.unidadeSel = idUnidade(this.folhas[0]);
    },

    orcamentoDe: function(item) {
      const uid = String((item && item.unitId) || "");
      const lista = this.itens[uid] || [];
      return lista.find(function(orc) {
        if (item.id && (orc.id === String(item.id) || orc.workItemId === String(item.id))) return true;
        if (item.workItemId && (orc.workItemId === String(item.workItemId) || orc.id === String(item.workItemId))) return true;
        return !!(item.wbsCode && orc.wbsCode === item.wbsCode);
      }) || null;
    },

    completarItemMedicao: function(item) {
      const orc = this.orcamentoDe(item);
      if (!orc) return item;
      if (!num(item.totalPrice)) item.totalPrice = orc.totalPrice;
      if (!num(item.unitPrice)) item.unitPrice = orc.unitPrice;
      if (!num(item.quantity)) item.quantity = orc.quantity;
      if (!item.description) item.description = orc.description;
      if (!item.wbsCode) item.wbsCode = orc.wbsCode;
      if (!item.unitOfMeasure) item.unitOfMeasure = orc.unitOfMeasure;
      return item;
    },

    carregarItensUnidade: async function(uid) {
      if (!uid || this.itens[uid]) return;
      try {
        const rows = await this.paginas("/building-cost-estimations/" + encodeURIComponent(this.obraId) + "/sheets/" + encodeURIComponent(uid) + "/items");
        this.itens[uid] = rows.map(function(row) { return normItem(row, uid); });
      } catch (e) {
        this.erros.planilhas = (e && e.message) || "Os itens da planilha não voltaram.";
        this.itens[uid] = [];
      }
      this.render();
    },

    carregarItensMedicao: async function(numero, silencioso) {
      const n = num(numero);
      if (!n) return;
      const chave = String(n);
      if (this.itensMedicao[chave] && !silencioso) return;
      if (!silencioso) {
        this.carregando = true;
        this.etapa = "Lendo os itens da medição…";
        this.progresso = 55;
        this.render();
      }
      try {
        await siengeFetchWithRetry("/building-projects/" + encodeURIComponent(this.obraId) + "/progress-logs/" + encodeURIComponent(n), 1);
      } catch (e) {}
      const mapa = {};
      const unidades = this.folhas.map(idUnidade).filter(Boolean);
      const self = this;
      for (let i = 0; i < unidades.length; i++) {
        const uid = unidades[i];
        try {
          const rows = await this.paginas("/building-projects/" + encodeURIComponent(this.obraId) + "/progress-logs/" + encodeURIComponent(n) + "/items/" + encodeURIComponent(uid));
          mapa[uid] = rows.map(function(row) { return self.completarItemMedicao(normItem(row, uid)); });
        } catch (e) {
          mapa[uid] = [];
        }
      }
      const lote = [];
      Object.keys(mapa).forEach(function(uid) { (mapa[uid] || []).forEach(function(item) { lote.push(item); }); });
      let topo = 0;
      lote.forEach(function(item) { topo = Math.max(topo, num(item.percentComplete)); });
      if (topo > 0 && topo <= 1) lote.forEach(function(item) { item.percentComplete = num(item.percentComplete) * 100; });
      this.itensMedicao[chave] = mapa;
      this.medidoPorNumero[chave] = lote.reduce(function(acc, item) { return acc + valorMedidoItem(item); }, 0);
      if (!silencioso) {
        this.carregando = false;
        this.etapa = "";
        this.render();
      }
    },

    nomeDaUnidade: function(uid) {
      const folha = this.folhas.find(function(f) { return idUnidade(f) === String(uid); });
      return folha ? nomeUnidade(folha) : ("Unidade " + uid);
    },

    itensDaUnidade: function(uid) {
      return this.itens[String(uid)] || [];
    },

    itensDaMedicao: function(numero) {
      const mapa = this.itensMedicao[String(numero)] || this.itensMedicao[num(numero)] || {};
      const lista = [];
      Object.keys(mapa).forEach(function(uid) {
        (mapa[uid] || []).forEach(function(item) { lista.push(item); });
      });
      return lista;
    },

    ultimaNumero: function() {
      let n = 0;
      this.medicoes.forEach(function(m) { if (m && m.number > n) n = m.number; });
      return n;
    },

    totais: function() {
      let orcado = 0;
      let medido = 0;
      let previsto = 0;
      let desembolsado = 0;
      const porUnidade = {};
      const self = this;
      const ultima = this.ultimaNumero();
      this.folhas.forEach(function(f) {
        const uid = idUnidade(f);
        const itens = self.itensDaUnidade(uid);
        const soma = itens.reduce(function(acc, item) { return acc + num(item.totalPrice); }, 0);
        const med = itens.reduce(function(acc, item) { return acc + valorMedidoItem(item); }, 0);
        const prev = itens.reduce(function(acc, item) { return acc + valorPrevistoItem(item); }, 0);
        const des = itens.reduce(function(acc, item) { return acc + num(item.desembolsado); }, 0);
        porUnidade[uid] = { orcado: soma, medido: med, previsto: prev };
        orcado += soma;
        medido += med;
        previsto += prev;
        desembolsado += des;
      });
      const fisico = orcado > 0 ? (medido / orcado) * 100 : 0;
      const previstoPct = orcado > 0 ? (previsto / orcado) * 100 : 0;
      return {
        orcado: orcado, medido: medido, previsto: previsto, desembolsado: desembolsado,
        fisico: fisico, previstoPct: previstoPct, saldo: orcado - medido,
        porUnidade: porUnidade, insumos: this.insumos.length, folhas: this.folhas.length, ultima: ultima
      };
    },

    comparar: function(a, b, campo) {
      const va = a && a[campo];
      const vb = b && b[campo];
      const na = Number(va);
      const nb = Number(vb);
      if (String(va) !== "" && String(vb) !== "" && Number.isFinite(na) && Number.isFinite(nb) && String(va).match(/^-?\d+(\.\d+)?$/)) {
        return na - nb;
      }
      return String(va || "").localeCompare(String(vb || ""), "pt-BR", { numeric: true });
    },

    ordenarLista: function(lista, tabela) {
      const ord = this.ordem[tabela] || { campo: "", dir: 1 };
      const self = this;
      return lista.slice().sort(function(a, b) { return self.comparar(a, b, ord.campo) * (ord.dir || 1); });
    },

    th: function(tabela, campo, rotulo) {
      return '<th onclick="CustoObraApp.ordenar(\'' + tabela + '\',\'' + campo + '\')" style="cursor:pointer;user-select:none;">'
        + esc(rotulo) + ' <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>';
    },

    abasHtml: function() {
      const tabs = [
        { id: "resumo", label: "Resumo", icon: "layout-dashboard" },
        { id: "planilhas", label: "Planilhas", icon: "table", count: this.folhas.length },
        { id: "insumos", label: "Insumos", icon: "boxes", count: this.insumos.length },
        { id: "medicoes", label: "Medições", icon: "ruler", count: this.medicoes.length }
      ];
      const atual = this.aba;
      return '<div class="ml-tabs cob-tabs" role="tablist">' + tabs.map(function(t) {
        const ativo = atual === t.id;
        const count = t.count != null ? '<span class="ml-tab-count">' + t.count + "</span>" : "";
        return '<button type="button" role="tab" aria-selected="' + ativo + '" class="ml-tab' + (ativo ? " is-active" : "") + '" onclick="CustoObraApp.setAba(\'' + t.id + '\')"><i data-lucide="' + t.icon + '"></i> ' + t.label + count + "</button>";
      }).join("") + "</div>";
    },

    render: function() {
      const root = document.getElementById("engenharia-custo-obra-root");
      if (!root) return;
      const t = this.totais();
      const bannerCls = this.fonte === "sienge" ? "cob-banner is-sienge" : "cob-banner";
      const erroGeral = (this.erros && this.erros.geral ? '<p class="cob-erro">' + esc(this.erros.geral) + "</p>" : "")
        + (this.erros && this.erros.itens ? '<p class="cob-erro">' + esc(this.erros.itens) + "</p>" : "");
      root.innerHTML = ''
        + '<div class="cob-page">'
        + '<p class="cob-nota">Controle da obra ' + esc(this.obraId) + '. O orçado, o medido e o previsto vêm dos itens de todas as planilhas. O valor de cada medição é calculado ao abrir a linha. A gravação de avanço físico não entra neste painel.</p>'
        + '<div class="cob-toolbar">'
        + '<label class="cob-field">Obra<input id="cob-obra" inputmode="numeric" value="' + esc(this.obraId) + '"></label>'
        + '<label class="cob-field">Insumos de<input id="cob-inicio" type="date" value="' + esc(this.inicio) + '"></label>'
        + '<label class="cob-field">até<input id="cob-fim" type="date" value="' + esc(this.fim) + '"></label>'
        + '<button type="button" class="btn btn-primary" onclick="CustoObraApp.consultar()">Consultar Sienge</button>'
        + "</div>"
        + (this.aviso ? '<div class="' + bannerCls + '">' + esc(this.aviso) + "</div>" : "")
        + erroGeral
        + this.abasHtml()
        + '<div class="cob-corpo">' + (this.carregando ? this.carregandoHtml() : this.corpo(t)) + "</div>"
        + "</div>";
      const foco = this._foco;
      if (foco) {
        const el = document.getElementById(foco === "itens" ? "cob-busca-itens" : "cob-busca-insumos");
        if (el) {
          el.focus();
          const p = el.value.length;
          if (typeof el.setSelectionRange === "function") el.setSelectionRange(p, p);
        }
      }
      try { if (window.lucide) window.lucide.createIcons({ root: root }); } catch (e) {}
    },

    carregandoHtml: function() {
      return '<div class="ml-load" style="padding:36px 0;">'
        + '<div class="loading-spinner" aria-hidden="true"></div>'
        + '<div class="loading-status-text">' + esc(this.etapa || "Carregando…") + "</div>"
        + '<div class="ml-load-track"><div class="loading-progress-bar" style="width:' + Math.max(8, Math.min(100, this.progresso || 8)) + '%"></div></div>'
        + "</div>";
    },

    corpo: function(t) {
      if (this.aba === "planilhas") return this.htmlPlanilhas(t);
      if (this.aba === "insumos") return this.htmlInsumos();
      if (this.aba === "medicoes") return this.htmlMedicoes(t);
      return this.htmlResumo(t);
    },

    htmlResumo: function(t) {
      const med = this.medicoes.find(function(m) { return m.number === t.ultima; }) || null;
      const linhas = this.folhas.map(function(f) {
        const uid = idUnidade(f);
        const bloco = t.porUnidade[uid] || { orcado: 0, medido: 0, previsto: 0 };
        const cheio = bloco.orcado > 0 ? Math.max(0, Math.min(100, Math.round((bloco.medido / bloco.orcado) * 100))) : 0;
        return "<tr><td>" + esc(nomeUnidade(f)) + "</td><td>" + brl(bloco.orcado) + "</td><td>" + brl(bloco.medido) + "</td><td>" + brl(bloco.previsto) + "</td><td>" + pct(cheio) + "</td>"
          + '<td><div class="cob-barra" title="Medido sobre o orçado desta planilha"><span style="width:' + cheio + '%"></span></div></td></tr>';
      }).join("");
      return '<div class="cob-kpis">'
        + this.kpi("Orçamento", brl(t.orcado))
        + this.kpi("Medido", brl(t.medido))
        + this.kpi("Previsto", brl(t.previsto))
        + this.kpi("Saldo a medir", brl(t.saldo))
        + (t.desembolsado > 0.5 ? this.kpi("Desembolsado", brl(t.desembolsado)) : "")
        + this.kpi("Avanço físico", pct(t.fisico))
        + this.kpi("Avanço previsto", pct(t.previstoPct))
        + this.kpi("Planilhas", String(t.folhas))
        + this.kpi("Insumos", String(t.insumos))
        + this.kpi("Última medição", med ? (med.number + " · " + dataBr(med.date)) : "—")
        + "</div>"
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr><th>Planilha</th><th>Orçado</th><th>Medido</th><th>Previsto</th><th>Avanço</th><th>Faixa</th></tr></thead><tbody>'
        + (linhas || '<tr><td colspan="6" class="cob-vazio">Nenhuma planilha nesta obra.</td></tr>')
        + "</tbody></table></div>";
    },

    kpi: function(rotulo, valor) {
      return '<div class="cob-kpi"><span>' + esc(rotulo) + "</span><strong>" + esc(valor) + "</strong></div>";
    },

    htmlPlanilhas: function() {
      const self = this;
      const folhas = this.ordenarLista(this.folhas.map(function(f) {
        const uid = idUnidade(f);
        return {
          id: uid,
          nome: nomeUnidade(f),
          status: String(f.status || ""),
          itens: (self.itens[uid] || []).length,
          total: (self.itens[uid] || []).reduce(function(acc, item) { return acc + num(item.totalPrice); }, 0),
          medido: (self.itens[uid] || []).reduce(function(acc, item) { return acc + valorMedidoItem(item); }, 0),
          previsto: (self.itens[uid] || []).reduce(function(acc, item) { return acc + valorPrevistoItem(item); }, 0)
        };
      }), "planilhas");
      const linhas = folhas.map(function(f) {
        const sel = f.id === self.unidadeSel ? " is-sel" : "";
        const bloqueada = f.status === "LOCKED";
        return '<tr class="' + sel + '" onclick="CustoObraApp.escolherUnidade(\'' + esc(f.id) + '\')"><td>' + esc(f.id) + "</td><td>" + esc(f.nome) + "</td><td>"
          + (bloqueada ? '<span class="cob-pill is-lock">Bloqueada</span>' : (f.status ? '<span class="cob-pill is-ok">Liberada</span>' : "—"))
          + "</td><td>" + f.itens + "</td><td>" + brl(f.total) + "</td><td>" + brl(f.medido) + "</td><td>" + brl(f.previsto) + "</td></tr>";
      }).join("");
      const itens = this.ordenarLista(this.itensDaUnidade(this.unidadeSel).filter((function(q) {
        return function(item) {
          if (!q) return true;
          return (item.wbsCode + " " + item.description).toLowerCase().indexOf(q) >= 0;
        };
      })(this.busca.itens.trim().toLowerCase())), "itens");
      const corpoItens = itens.map(function(item) {
        const cats = (item.pricesByCategory || []).map(function(c) { return catNome(c.category); }).join(", ");
        return "<tr><td>" + esc(item.wbsCode) + "</td><td>" + esc(item.description) + "</td><td>" + esc(item.unitOfMeasure) + "</td><td>"
          + num(item.quantity).toLocaleString("pt-BR") + "</td><td>" + num(item.measuredQuantity).toLocaleString("pt-BR") + "</td><td>" + brl(item.unitPrice) + "</td><td>" + brl(item.totalPrice) + "</td><td>"
          + pct(item.percentComplete) + "</td><td>" + brl(valorMedidoItem(item)) + "</td><td>" + esc(cats || "—") + "</td></tr>";
      }).join("");
      const erro = this.erros && this.erros.planilhas ? '<p class="cob-erro">' + esc(this.erros.planilhas) + "</p>" : "";
      return erro
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr>'
        + this.th("planilhas", "id", "Unidade")
        + this.th("planilhas", "nome", "Planilha")
        + this.th("planilhas", "status", "Situação")
        + this.th("planilhas", "itens", "Itens")
        + this.th("planilhas", "total", "Orçado")
        + this.th("planilhas", "medido", "Medido")
        + this.th("planilhas", "previsto", "Previsto")
        + "</tr></thead><tbody>" + (linhas || '<tr><td colspan="7" class="cob-vazio">Nenhuma planilha.</td></tr>') + "</tbody></table></div>"
        + '<div class="cob-sub">'
        + "<p class=\"cob-nota\">Itens da planilha " + esc(this.nomeDaUnidade(this.unidadeSel)) + ".</p>"
        + '<input id="cob-busca-itens" class="cob-busca" placeholder="Buscar item" value="' + esc(this.busca.itens) + '" oninput="CustoObraApp.filtrar(\'itens\', this.value)">'
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr>'
        + this.th("itens", "wbsCode", "EAP")
        + this.th("itens", "description", "Item")
        + this.th("itens", "unitOfMeasure", "Un.")
        + this.th("itens", "quantity", "Qtd.")
        + this.th("itens", "measuredQuantity", "Qtd. medida")
        + this.th("itens", "unitPrice", "Preço")
        + this.th("itens", "totalPrice", "Orçado")
        + this.th("itens", "percentComplete", "Avanço")
        + "<th>Medido</th><th>Categoria</th>"
        + "</tr></thead><tbody>" + (corpoItens || '<tr><td colspan="10" class="cob-vazio">Nenhum item nesta planilha.</td></tr>') + "</tbody></table></div></div>";
    },

    htmlInsumos: function() {
      const q = this.busca.insumos.trim().toLowerCase();
      const lista = this.ordenarLista(this.insumos.filter(function(item) {
        if (!q) return true;
        return (item.code + " " + item.description + " " + item.group).toLowerCase().indexOf(q) >= 0;
      }), "insumos");
      const linhas = lista.map(function(item) {
        return "<tr><td>" + esc(item.code || item.id) + "</td><td>" + esc(item.description) + "</td><td>" + esc(item.unit) + "</td><td>"
          + brl(item.unitPrice) + "</td><td>" + esc(catNome(item.category)) + "</td><td>" + esc(item.group || "—") + "</td><td>"
          + esc(item.detail || "—") + "</td><td>" + (item.active ? "Ativo" : "Inativo") + "</td><td>" + brl(item.restante) + "</td></tr>";
      }).join("");
      const erro = this.erros && this.erros.insumos ? '<p class="cob-erro">' + esc(this.erros.insumos) + "</p>" : "";
      return erro
        + '<p class="cob-nota">Insumos da obra no período de ' + esc(dataBr(this.inicio)) + " a " + esc(dataBr(this.fim)) + ". Transporte e item de incidência não vêm nesta consulta.</p>"
        + '<input id="cob-busca-insumos" class="cob-busca" placeholder="Buscar insumo" value="' + esc(this.busca.insumos) + '" oninput="CustoObraApp.filtrar(\'insumos\', this.value)">'
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr>'
        + this.th("insumos", "code", "Código")
        + this.th("insumos", "description", "Insumo")
        + this.th("insumos", "unit", "Un.")
        + this.th("insumos", "unitPrice", "Preço")
        + this.th("insumos", "category", "Categoria")
        + this.th("insumos", "group", "Grupo")
        + this.th("insumos", "detail", "Detalhe")
        + this.th("insumos", "active", "Situação")
        + this.th("insumos", "restante", "Saldo a desembolsar")
        + "</tr></thead><tbody>" + (linhas || '<tr><td colspan="9" class="cob-vazio">Nenhum insumo no período.</td></tr>') + "</tbody></table></div>";
    },

    htmlMedicoes: function() {
      const self = this;
      const lista = this.ordenarLista(this.medicoes.map(function(m) {
        const chave = String(m.number);
        const carregou = Object.prototype.hasOwnProperty.call(self.medidoPorNumero, chave);
        return {
          number: m.number,
          date: m.date,
          responsible: m.responsible,
          consistent: m.consistent ? "Consistente" : "Inconsistente",
          medido: carregou ? self.medidoPorNumero[chave] : null
        };
      }), "medicoes");
      const linhas = lista.map(function(m) {
        const sel = m.number === self.medicaoSel ? " is-sel" : "";
        const valor = m.medido == null ? "—" : brl(m.medido);
        return '<tr class="' + sel + '" onclick="CustoObraApp.escolherMedicao(' + m.number + ')"><td>' + m.number + "</td><td>" + dataBr(m.date) + "</td><td>"
          + esc(m.responsible || "—") + "</td><td>" + esc(m.consistent) + "</td><td>" + valor + "</td></tr>";
      }).join("");
      const itens = this.ordenarLista(this.itensDaMedicao(this.medicaoSel), "meditens");
      const corpo = itens.map(function(item) {
        return "<tr><td>" + esc(self.nomeDaUnidade(item.unitId)) + "</td><td>" + esc(item.wbsCode) + "</td><td>" + esc(item.description) + "</td><td>"
          + pct(item.percentComplete) + "</td><td>" + brl(item.totalPrice) + "</td><td>" + brl(valorMedidoItem(item)) + "</td></tr>";
      }).join("");
      const erro = this.erros && this.erros.medicoes ? '<p class="cob-erro">' + esc(this.erros.medicoes) + "</p>" : "";
      return erro
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr>'
        + this.th("medicoes", "number", "Medição")
        + this.th("medicoes", "date", "Data")
        + this.th("medicoes", "responsible", "Responsável")
        + this.th("medicoes", "consistent", "Situação")
        + this.th("medicoes", "medido", "Valor medido")
        + "</tr></thead><tbody>" + (linhas || '<tr><td colspan="5" class="cob-vazio">Nenhuma medição.</td></tr>') + "</tbody></table></div>"
        + '<div class="cob-sub"><p class="cob-nota">Itens da medição ' + esc(this.medicaoSel || "—") + ". O valor usa o avanço desta medição sobre o preço do orçamento. As outras linhas ficam em branco até serem abertas.</p>"
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr>'
        + this.th("meditens", "unitId", "Planilha")
        + this.th("meditens", "wbsCode", "EAP")
        + this.th("meditens", "description", "Item")
        + this.th("meditens", "percentComplete", "Avanço")
        + this.th("meditens", "totalPrice", "Orçado")
        + "<th>Medido</th></tr></thead><tbody>"
        + (corpo || '<tr><td colspan="6" class="cob-vazio">Esta medição não tem itens carregados.</td></tr>')
        + "</tbody></table></div></div>";
    }
  };

  window.CustoObraApp = App;

  document.addEventListener("tabChanged", function(e) {
    if (e && e.detail === "engenharia-custo-obra") App.init();
  });
})();
