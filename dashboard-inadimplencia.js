const DashboardInadimplencia = (function() {
  let snapshots = [];
  let chartInstance = null;

  const filterDraft = {
    companies: [],
    centers: [],
    cities: [],
    operators: []
  };
  const filterApplied = {
    companies: [],
    centers: [],
    cities: [],
    operators: []
  };
  const filterUi = {
    openEmp: false,
    openCc: false,
    openCid: false,
    openOp: false,
    qEmp: "",
    qCc: "",
    qCid: "",
    qOp: ""
  };

  async function carregarDados() {
    try {
      if (window.firebaseCollections && window.firebaseDb) {
        const snapRef = window.firebaseCollections.collection(window.firebaseDb, 'inadimplencia_snapshots');
        const q = window.firebaseCollections.query(snapRef, window.firebaseCollections.orderBy("date", "asc"));
        const fbDocs = await window.firebaseCollections.getDocs(q);
        snapshots = [];
        fbDocs.forEach(d => {
          const data = d.data();
          if (data.total_value > 1000) {
            snapshots.push(data);
          }
        });
      } else {
        console.warn('Firebase não inicializado para carregar snapshots');
      }
    } catch (e) {
      console.error('Falha na requisição dos snapshots do Firebase', e);
    }
  }

  function formatMoney(value) {
    if (value === undefined || value === null) return "R$ 0,00";
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getSnapshotAtual() {
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  function getSnapshotAnterior() {
    return snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  }

  function getSnapshotFechamentoMes() {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].is_month_close) return snapshots[i];
    }
    return null;
  }

  function calcularVariacao(atual, anterior) {
    if (!anterior || anterior === 0) return { val: 0, text: '-', class: '' };
    const pct = ((atual - anterior) / anterior) * 100;
    const sign = pct > 0 ? '+' : '';
    const colorClass = pct > 0 ? 'text-red-600' : (pct < 0 ? 'text-green-600' : 'text-gray-500');
    return { val: pct, text: `${sign}${pct.toFixed(1)}%`, class: colorClass };
  }

  function hasAnyFilter(f) {
    return !!(f.companies.length || f.centers.length || f.cities.length || f.operators.length);
  }

  function getLiveClients() {
    const list = window.rawClientList || window.clientList || [];
    return Array.isArray(list) ? list : [];
  }

  function clientValue(c) {
    return Number(c.overdueValue != null ? c.overdueValue : c.value) || 0;
  }

  function clientTitles(c) {
    if (Array.isArray(c.titles) && c.titles.length) return c.titles.length;
    return Number(c.billCount) || 1;
  }

  function clientDelay(c) {
    return Number(c.maxDaysDelay != null ? c.maxDaysDelay : c.daysDelay) || 0;
  }

  function clientCity(c) {
    if (typeof window.resolveCityRuleId !== 'function') return { city: '', ruleId: '' };
    return window.resolveCityRuleId(c.costCenterId) || { city: '', ruleId: '' };
  }

  function normOp(s) {
    if (typeof window.normalizeOperatorName === 'function') return window.normalizeOperatorName(s);
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, ' ')
      .replace(/\s+/g, ' ')
      .toUpperCase()
      .trim();
  }

  function clientOperator(c) {
    const raw = c && (c.assignedOperator || c.operator || c.operador);
    const s = String(raw || '').trim();
    return s ? s.toUpperCase().trim() : 'NÃO ATRIBUÍDO';
  }

  /** Mesma regra da fila/home: "THAIANE CORDEIRO" casa com "THAIANE" / "THAIANE.CORDEIRO". */
  function operatorMatchesSelection(opName, selectedList) {
    if (!selectedList || !selectedList.length) return true;
    const name = opName || 'NÃO ATRIBUÍDO';
    return selectedList.some(sel => {
      if (typeof window.occurrenceAuthorMatchesOperator === 'function') {
        if (window.occurrenceAuthorMatchesOperator(name, sel)) return true;
        if (window.occurrenceAuthorMatchesOperator(sel, name)) return true;
      }
      return normOp(name) === normOp(sel);
    });
  }

  function clientMatches(c, f) {
    if (f.companies.length && !f.companies.includes(String(c.companyId))) return false;
    if (f.centers.length && !f.centers.includes(String(c.costCenterId))) return false;
    if (f.operators.length && !operatorMatchesSelection(clientOperator(c), f.operators)) return false;
    if (f.cities.length) {
      const r = clientCity(c);
      if (!f.cities.includes(String(r.city || '')) && !f.cities.includes(String(r.ruleId || ''))) return false;
    }
    return true;
  }

  function emptyAging() {
    return {
      d0_30: { count: 0, value: 0 },
      d31_60: { count: 0, value: 0 },
      d61_90: { count: 0, value: 0 },
      d91_180: { count: 0, value: 0 },
      d181_365: { count: 0, value: 0 },
      d365p: { count: 0, value: 0 }
    };
  }

  function agingKeyFromDelay(delay) {
    if (delay <= 30) return 'd0_30';
    if (delay <= 60) return 'd31_60';
    if (delay <= 90) return 'd61_90';
    if (delay <= 180) return 'd91_180';
    if (delay <= 365) return 'd181_365';
    return 'd365p';
  }

  function costCenterName(id) {
    let nome = String(id);
    if (window.MouraAuth && window.MouraAuth.costCenters) {
      const found = window.MouraAuth.costCenters.find(x => String(x.id) === String(id));
      if (found) return `${id} - ${String(found.name).toUpperCase()}`;
    }
    if (window.AppState && window.AppState.cachedCostCenters) {
      const found = window.AppState.cachedCostCenters.find(x => String(x.id) === String(id));
      if (found) return `${id} - ${String(found.name).toUpperCase()}`;
    }
    if (typeof window.getCostCenterName === 'function') {
      const n = window.getCostCenterName(id);
      if (n) {
        const clean = String(n).replace(new RegExp(`^${id}\\s*-\\s*`, 'i'), '').trim();
        return `${id} - ${clean.toUpperCase()}`;
      }
    }
    return nome;
  }

  function companyName(id) {
    if (typeof window.getCompanyName === 'function') {
      const n = window.getCompanyName(id);
      if (n) return `${id} - ${String(n).toUpperCase()}`;
    }
    if (window.AppState && window.AppState.companies) {
      const c = window.AppState.companies.find(x => String(x.id) === String(id));
      if (c) return `${id} - ${String(c.tradeName || c.name || '').toUpperCase()}`;
    }
    return String(id);
  }

  function buildRelationRows() {
    const rows = [];
    const seen = new Set();

    function push(companyId, centerId, city, operator) {
      const c = companyId != null && companyId !== '' ? String(companyId) : '';
      const cc = centerId != null && centerId !== '' ? String(centerId) : '';
      let cityU = city != null && city !== '' ? String(city) : '';
      if (cityU) {
        cityU = cityU.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      }
      const op = operator != null && operator !== '' ? String(operator).toUpperCase().trim() : '';
      if (!c && !cc && !cityU) return;
      const key = c + '|' + cc + '|' + cityU + '|' + op;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ companyId: c, centerId: cc, city: cityU, operator: op });
    }

    getLiveClients().forEach(cli => {
      const r = clientCity(cli);
      push(cli.companyId, cli.costCenterId, r.city, clientOperator(cli));
    });

    const atual = getSnapshotAtual();
    if (atual && atual.data_json) {
      (atual.data_json.companies || []).forEach(comp => {
        const cid = String(comp.company_id != null ? comp.company_id : comp.id || '');
        (comp.cost_centers || []).forEach(cc => {
          const id = String(cc.id);
          let city = '';
          if (typeof window.resolveCityRuleId === 'function') {
            city = (window.resolveCityRuleId(id) || {}).city || '';
          }
          push(cid, id, city, '');
        });
      });
      (atual.data_json.operators || []).forEach(op => {
        const name = String(op.name || '').toUpperCase().trim();
        if (name) push('', '', '', name);
      });
    }

    const ccList = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters))
      || (window.MouraAuth && MouraAuth.costCenters)
      || [];
    (ccList || []).forEach(cc => {
      if (!cc || cc.id == null) return;
      let city = '';
      if (typeof window.resolveCityRuleId === 'function') {
        city = (window.resolveCityRuleId(cc.id, cc.name) || {}).city || '';
      }
      push(cc.companyId, cc.id, city, '');
    });

    return rows;
  }

  function buildFilterOptions() {
    const companies = new Map();
    const centers = new Map();
    const cities = new Map();
    const operators = new Map();
    const relations = buildRelationRows();

    relations.forEach(r => {
      if (r.companyId) companies.set(r.companyId, companyName(r.companyId));
      if (r.centerId) centers.set(r.centerId, costCenterName(r.centerId));
      if (r.city) cities.set(r.city, r.city);
      if (r.operator) operators.set(normOp(r.operator) || r.operator, String(r.operator).toUpperCase().trim());
    });

    // Nomes de cadastro de usuários (THAIANE CORDEIRO) + aliases da fila
    if (typeof window.getDynamicOperators === 'function') {
      (window.getDynamicOperators() || []).forEach(op => {
        const label = String(op || '')
          .replace(/\./g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
        if (!label) return;
        const key = normOp(label);
        if (!key || key === 'NAO ATRIBUIDO') return;
        if (!operators.has(key)) operators.set(key, label);
      });
    }
    getLiveClients().forEach(c => {
      const op = clientOperator(c);
      const key = normOp(op);
      if (!key) return;
      if (!operators.has(key)) operators.set(key, op);
    });

    const toItems = (map) => Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => {
        const na = Number(a.id);
        const nb = Number(b.id);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.label).localeCompare(String(b.label), 'pt-BR');
      });

    // Deduplica operadores por chave normalizada (evita "THAIANE" vs "THAIANE CORDEIRO" sem match)
    const opItems = [];
    const opSeen = new Set();
    Array.from(operators.entries())
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'))
      .forEach(([, label]) => {
        const k = normOp(label);
        if (!k || opSeen.has(k)) return;
        opSeen.add(k);
        opItems.push({ id: label, label });
      });

    return {
      companies: toItems(companies),
      centers: toItems(centers),
      cities: toItems(cities),
      operators: opItems,
      relations
    };
  }

  /** Empresa / CC / Cidade se restringem mutuamente. Operadores só acompanham esses três. */
  function rowsForCascade(relations, draft, ignoreKey) {
    const f = draft || filterDraft;
    return (relations || []).filter(r => {
      if (ignoreKey !== 'companies' && f.companies.length && r.companyId && !f.companies.includes(r.companyId)) return false;
      if (ignoreKey !== 'companies' && f.companies.length && !r.companyId) return false;
      if (ignoreKey !== 'centers' && f.centers.length && r.centerId && !f.centers.includes(r.centerId)) return false;
      if (ignoreKey !== 'centers' && f.centers.length && !r.centerId) return false;
      if (ignoreKey !== 'cities' && f.cities.length && r.city && !f.cities.includes(r.city)) return false;
      if (ignoreKey !== 'cities' && f.cities.length && !r.city) return false;
      return true;
    });
  }

  function itemsFromRows(allItems, rows, field) {
    const allowed = new Set();
    rows.forEach(r => {
      const v = r[field];
      if (v) allowed.add(String(v));
    });
    if (!allowed.size && !(filterDraft.companies.length || filterDraft.centers.length || filterDraft.cities.length)) {
      return allItems.slice();
    }
    return (allItems || []).filter(it => allowed.has(String(it.id)));
  }

  function cascadeFilterOptions(all) {
    const rel = all.relations || [];
    const companies = itemsFromRows(all.companies, rowsForCascade(rel, filterDraft, 'companies'), 'companyId');
    const centers = itemsFromRows(all.centers, rowsForCascade(rel, filterDraft, 'centers'), 'centerId');
    const cities = itemsFromRows(all.cities, rowsForCascade(rel, filterDraft, 'cities'), 'city');

    // Operadores: não usar linhas só de CC (operator vazio). Cruza pela carteira ao vivo + match flexível.
    let operators = (all.operators || []).slice();
    if (filterDraft.companies.length || filterDraft.centers.length || filterDraft.cities.length) {
      const geoF = {
        companies: filterDraft.companies,
        centers: filterDraft.centers,
        cities: filterDraft.cities,
        operators: []
      };
      const liveOps = [];
      getLiveClients().forEach(c => {
        if (!clientMatches(c, geoF)) return;
        liveOps.push(clientOperator(c));
      });
      if (liveOps.length) {
        operators = (all.operators || []).filter(it =>
          liveOps.some(op => operatorMatchesSelection(op, [it.id]))
        );
      }
    }

    return { companies, centers, cities, operators, relations: rel };
  }

  function pruneDraftToVisible(visible) {
    let changed = false;
    const prune = (key, items) => {
      const before = filterDraft[key].slice();
      if (key === 'operators') {
        // Mantém seleção se ainda casa com algum item visível (nome curto vs completo)
        filterDraft[key] = before.filter(sel =>
          (items || []).some(it => operatorMatchesSelection(it.id, [sel]))
        );
      } else {
        const allow = new Set((items || []).map(x => String(x.id)));
        filterDraft[key] = before.filter(id => allow.has(String(id)));
      }
      if (filterDraft[key].length !== before.length) changed = true;
      filterApplied[key] = filterDraft[key].slice();
    };
    prune('companies', visible.companies);
    prune('centers', visible.centers);
    prune('cities', visible.cities);
    prune('operators', visible.operators);
    return changed;
  }

  function aggregateFromLive(clients, f) {
    const filtered = clients.filter(c => clientMatches(c, f) && clientValue(c) >= 0.01);
    const aging = emptyAging();
    const centerMap = {};
    const opMap = {};
    let total_value = 0;
    let total_count = 0;
    let subjudice_count = 0;
    let subjudice_value = 0;
    const customers = new Set();

    filtered.forEach(c => {
      const val = clientValue(c);
      const nTit = clientTitles(c);
      const delay = clientDelay(c);
      total_value += val;
      total_count += nTit;
      if (c.customerId != null) customers.add(String(c.customerId));
      if (c.subjudice === 'S') {
        subjudice_count += nTit;
        subjudice_value += val;
      }
      const ak = agingKeyFromDelay(delay);
      aging[ak].count += nTit;
      aging[ak].value += val;

      const ccId = String(c.costCenterId || 'N/D');
      if (!centerMap[ccId]) centerMap[ccId] = { id: ccId, count: 0, value: 0 };
      centerMap[ccId].count += nTit;
      centerMap[ccId].value += val;

      const opName = clientOperator(c);
      if (!opMap[opName]) opMap[opName] = { name: opName, total_count: 0, total_value: 0, above31_count: 0, above31_value: 0 };
      opMap[opName].total_count += nTit;
      opMap[opName].total_value += val;
      if (delay >= 31) {
        opMap[opName].above31_count += nTit;
        opMap[opName].above31_value += val;
      }
    });

    return {
      total_value,
      total_count,
      total_customers: customers.size,
      avg_ticket: total_count > 0 ? total_value / total_count : 0,
      subjudice_count,
      subjudice_value,
      aging,
      centers: Object.values(centerMap),
      operators: Object.values(opMap),
      source: 'live'
    };
  }

  function ccPassesFilters(ccId, companyId, f) {
    if (f.companies.length && !f.companies.includes(String(companyId))) return false;
    if (f.centers.length && !f.centers.includes(String(ccId))) return false;
    if (f.cities.length) {
      if (typeof window.resolveCityRuleId !== 'function') return false;
      const r = window.resolveCityRuleId(ccId) || {};
      if (!f.cities.includes(String(r.city || '')) && !f.cities.includes(String(r.ruleId || ''))) return false;
    }
    return true;
  }

  function aggregateFromSnapshot(snap, f) {
    if (!snap) {
      return {
        total_value: 0, total_count: 0, avg_ticket: 0,
        subjudice_count: 0, subjudice_value: 0,
        aging: emptyAging(), centers: [], operators: [], source: 'snapshot'
      };
    }

    if (!hasAnyFilter(f)) {
      const aging = emptyAging();
      const centers = [];
      (snap.data_json && snap.data_json.companies || []).forEach(comp => {
        if (comp.aging) {
          Object.keys(aging).forEach(k => {
            if (comp.aging[k]) {
              aging[k].count += comp.aging[k].count || 0;
              aging[k].value += comp.aging[k].value || 0;
            }
          });
        }
        (comp.cost_centers || []).forEach(cc => {
          centers.push({ id: cc.id, count: cc.count, value: cc.value });
        });
      });
      return {
        total_value: snap.total_value || 0,
        total_count: snap.total_count || 0,
        avg_ticket: snap.avg_ticket || 0,
        subjudice_count: snap.subjudice_count || 0,
        subjudice_value: snap.subjudice_value || 0,
        aging,
        centers,
        operators: (snap.data_json && snap.data_json.operators) ? snap.data_json.operators.slice() : [],
        source: 'snapshot'
      };
    }

    const onlyOps = f.operators.length && !f.companies.length && !f.centers.length && !f.cities.length;
    if (onlyOps) {
      const allOps = (snap.data_json && snap.data_json.operators) || [];
      const ops = [];
      f.operators.forEach(sel => {
        const candidates = allOps.filter(o => operatorMatchesSelection(o.name, [sel]));
        if (!candidates.length) return;
        const exact = candidates.find(o => normOp(o.name) === normOp(sel));
        const best = exact || candidates.slice().sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))[0];
        if (best && !ops.some(x => normOp(x.name) === normOp(best.name))) ops.push(best);
      });
      let total_value = 0, total_count = 0;
      ops.forEach(o => {
        total_value += Number(o.total_value) || 0;
        total_count += Number(o.total_count) || 0;
      });
      return {
        total_value,
        total_count,
        avg_ticket: total_count > 0 ? total_value / total_count : 0,
        subjudice_count: 0,
        subjudice_value: 0,
        aging: emptyAging(),
        centers: [],
        operators: ops,
        source: 'snapshot'
      };
    }

    const aging = emptyAging();
    const centers = [];
    let total_value = 0;
    let total_count = 0;
    let subjudice_count = 0;
    let subjudice_value = 0;
    const companies = (snap.data_json && snap.data_json.companies) || [];

    companies.forEach(comp => {
      const companyId = String(comp.company_id != null ? comp.company_id : comp.id || '');
      if (f.companies.length && !f.companies.includes(companyId)) return;

      const ccs = comp.cost_centers || [];
      const matchingCcs = ccs.filter(cc => ccPassesFilters(cc.id, companyId, f));
      if (!matchingCcs.length && (f.centers.length || f.cities.length)) return;

      if (f.centers.length || f.cities.length) {
        matchingCcs.forEach(cc => {
          total_value += Number(cc.value) || 0;
          total_count += Number(cc.count) || 0;
          centers.push({ id: cc.id, count: cc.count, value: cc.value });
        });
        // aging só existe por empresa — proporção aproximada pelo valor dos CCs
        const compVal = Number(comp.value) || 0;
        const matchedVal = matchingCcs.reduce((s, cc) => s + (Number(cc.value) || 0), 0);
        const ratio = compVal > 0 ? matchedVal / compVal : 0;
        if (comp.aging && ratio > 0) {
          Object.keys(aging).forEach(k => {
            if (comp.aging[k]) {
              aging[k].count += Math.round((comp.aging[k].count || 0) * ratio);
              aging[k].value += (comp.aging[k].value || 0) * ratio;
            }
          });
        }
      } else {
        total_value += Number(comp.value) || 0;
        total_count += Number(comp.count) || 0;
        ccs.forEach(cc => centers.push({ id: cc.id, count: cc.count, value: cc.value }));
        if (comp.aging) {
          Object.keys(aging).forEach(k => {
            if (comp.aging[k]) {
              aging[k].count += comp.aging[k].count || 0;
              aging[k].value += comp.aging[k].value || 0;
            }
          });
        }
      }
    });

    let operators = (snap.data_json && snap.data_json.operators) ? snap.data_json.operators.slice() : [];
    if (f.operators.length) {
      operators = operators.filter(o => operatorMatchesSelection(o.name, f.operators));
      if (!f.companies.length && !f.centers.length && !f.cities.length) {
        // already handled above
      } else {
        // combina filtros: mantém ops filtrados, totais já vêm de empresas/CCs
      }
    }

    // Se filtro de operador + empresa/cc: sem cruzamento no snapshot, escala ops pelo ratio do valor
    if (f.operators.length && (f.companies.length || f.centers.length || f.cities.length)) {
      const opVal = operators.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
      if (opVal > 0 && total_value > 0) {
        // mantém o menor entre os dois como aproximação não disponível — usa valor de CC/empresa
      }
    }

    return {
      total_value,
      total_count,
      avg_ticket: total_count > 0 ? total_value / total_count : 0,
      subjudice_count,
      subjudice_value,
      aging,
      centers,
      operators,
      source: 'snapshot'
    };
  }

  function filteredSnapshotValue(snap, f) {
    if (!snap) return 0;
    if (!hasAnyFilter(f)) return Number(snap.total_value) || 0;
    return aggregateFromSnapshot(snap, f).total_value;
  }

  function getCurrentMetrics() {
    const f = filterApplied;
    const live = getLiveClients();
    if (live.length > 0) {
      const liveMetrics = aggregateFromLive(live, f);
      // Carteira ao vivo sem operador preenchido → usa snapshot (onde o operador foi gravado)
      if (f.operators.length && liveMetrics.total_value < 0.01) {
        const snapMetrics = aggregateFromSnapshot(getSnapshotAtual(), f);
        if (snapMetrics.total_value > 0.01) return snapMetrics;
      }
      return liveMetrics;
    }
    return aggregateFromSnapshot(getSnapshotAtual(), f);
  }

  function getCompareMetrics(snap) {
    return aggregateFromSnapshot(snap, filterApplied);
  }

  function bindFilters(options) {
    if (!window.MlEmpresaFilter) return;

    const bindOne = (id, key, openKey, qKey, items) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          filterUi[openKey] = !filterUi[openKey];
          paint({ keepScroll: true });
        },
        setQuery(q) {
          filterUi[qKey] = q || "";
          const box = document.getElementById(id + "-list");
          if (box && window.MlEmpresaFilter) {
            box.innerHTML = MlEmpresaFilter.listHtml({
              id,
              items,
              selectedIds: filterDraft[key],
              query: filterUi[qKey]
            });
          }
        },
        toggleId(itemId, on) {
          const sid = String(itemId);
          const cur = filterDraft[key].slice();
          filterDraft[key] = on
            ? (cur.includes(sid) ? cur : cur.concat(sid))
            : cur.filter(x => x !== sid);
          filterApplied[key] = filterDraft[key].slice();
          filterUi[openKey] = true;
          paint({ keepScroll: true });
        },
        selectAll() {
          filterDraft[key] = items.map(x => String(x.id));
          filterApplied[key] = filterDraft[key].slice();
          filterUi[openKey] = true;
          paint({ keepScroll: true });
        },
        selectNone() {
          filterDraft[key] = [];
          filterApplied[key] = [];
          filterUi[openKey] = true;
          paint({ keepScroll: true });
        }
      });
    };

    bindOne("dash-inad-emp", "companies", "openEmp", "qEmp", options.companies);
    bindOne("dash-inad-cc", "centers", "openCc", "qCc", options.centers);
    bindOne("dash-inad-cid", "cities", "openCid", "qCid", options.cities);
    bindOne("dash-inad-op", "operators", "openOp", "qOp", options.operators);
  }

  function filterDropHtml(id, label, items, selectedIds, open, query) {
    if (!window.MlEmpresaFilter) {
      return `<div style="flex:1;min-width:200px;"><div class="ml-emp-filter-label">${label}</div><span style="color:#94a3b8;font-size:0.8rem;">Filtro indisponível</span></div>`;
    }
    return MlEmpresaFilter.html({
      id,
      label,
      items,
      selectedIds: selectedIds.map(String),
      open: !!open,
      query: query || "",
      emptyMeansAll: true
    });
  }

  function renderFilterBar(options) {
    bindFilters(options);
    return `
      <div style="background:white;border-radius:8px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);padding:18px 20px;margin-bottom:22px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
          <h3 style="margin:0;font-size:1rem;color:#1e293b;display:flex;align-items:center;gap:8px;">
            <i data-lucide="filter" style="width:18px;color:#105436;"></i> Filtros
          </h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" onclick="window.DashboardInadimplencia.aplicarFiltros()">
              <i data-lucide="check" style="width:16px;"></i> Aplicar
            </button>
            <button type="button" class="btn btn-cancel" onclick="window.DashboardInadimplencia.limparFiltros()">
              <i data-lucide="eraser" style="width:16px;"></i> Limpar filtros
            </button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          ${filterDropHtml("dash-inad-emp", "EMPRESAS", options.companies, filterDraft.companies, filterUi.openEmp, filterUi.qEmp)}
          ${filterDropHtml("dash-inad-cc", "EMPREENDIMENTOS", options.centers, filterDraft.centers, filterUi.openCc, filterUi.qCc)}
          ${filterDropHtml("dash-inad-cid", "CIDADES", options.cities, filterDraft.cities, filterUi.openCid, filterUi.qCid)}
          ${filterDropHtml("dash-inad-op", "OPERADORES", options.operators, filterDraft.operators, filterUi.openOp, filterUi.qOp)}
        </div>
      </div>
    `;
  }

  function renderCards(metrics, compareMetrics) {
    if (!metrics) return '';
    const varValor = calcularVariacao(metrics.total_value, compareMetrics ? compareMetrics.total_value : 0);
    const varQtd = calcularVariacao(metrics.total_count, compareMetrics ? compareMetrics.total_count : 0);
    const varTicket = calcularVariacao(metrics.avg_ticket, compareMetrics ? compareMetrics.avg_ticket : 0);

    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 25px;">
        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #f37021; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Valor Total (R$)</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${formatMoney(metrics.total_value)}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varValor.class}">
            ${varValor.text} vs Fechamento Mês
          </div>
        </div>

        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #105436; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Qtd. de Títulos</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${metrics.total_count}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varQtd.class}">
            ${varQtd.text} vs Fechamento Mês
          </div>
        </div>

        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #105436; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Ticket Médio</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${formatMoney(metrics.avg_ticket)}</div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500;" class="${varTicket.class}">
            ${varTicket.text} vs Fechamento Mês
          </div>
        </div>

        <div class="kpi-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #f37021; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9rem; font-weight: 600;">Sub Júdice</h4>
          <div style="font-size: 1.8rem; font-weight: 700; color: #1e293b;">${metrics.subjudice_count} <span style="font-size: 1rem; color: #64748b; font-weight: 500;">títulos</span></div>
          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500; color: #64748b;">
            Total: ${formatMoney(metrics.subjudice_value)}
          </div>
        </div>
      </div>
    `;
  }

  function detectSnapshotOutliers(snaps, values) {
    const flags = values.map(() => false);
    for (let i = 1; i < values.length - 1; i++) {
      const prev = Number(values[i - 1]) || 0;
      const cur = Number(values[i]) || 0;
      const next = Number(values[i + 1]) || 0;
      if (prev <= 0 || next <= 0 || cur <= 0) continue;
      const neighborAvg = (prev + next) / 2;
      // Queda em V: dia bem abaixo dos vizinhos (ex.: 04/09)
      if (cur < neighborAvg * 0.8 && cur < prev * 0.85 && cur < next * 0.85) {
        flags[i] = true;
      }
    }
    return flags;
  }

  function initChart() {
    const ctx = document.getElementById('inadimplencia-chart');
    if (!ctx) return;

    if (chartInstance) {
      try { chartInstance.destroy(); } catch (e) { /* ignore */ }
      chartInstance = null;
    }

    const f = filterApplied;
    const recentSnaps = snapshots.slice(-30);
    const labels = recentSnaps.map(s => {
      const parts = String(s.date || '').split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(s.date || '');
    });
    const rawValues = recentSnaps.map(s => filteredSnapshotValue(s, f));
    const outlierFlags = detectSnapshotOutliers(recentSnaps, rawValues);
    const displayValues = rawValues.map((v, i) => {
      if (!outlierFlags[i]) return v;
      const prev = rawValues[i - 1];
      const next = rawValues[i + 1];
      if (prev > 0 && next > 0) return (prev + next) / 2;
      return v;
    });

    const noteEl = document.getElementById('inadimplencia-chart-note');
    if (noteEl) {
      const bad = [];
      outlierFlags.forEach((flag, i) => {
        if (!flag) return;
        bad.push(`${labels[i]} (gravado ${formatMoney(rawValues[i])}; tendência ~${formatMoney(displayValues[i])})`);
      });
      if (bad.length) {
        noteEl.style.display = 'flex';
        noteEl.innerHTML = `<i data-lucide="alert-triangle" style="width:14px;height:14px;flex-shrink:0;"></i> <span>Possível snapshot parcial: <strong>${bad.join('; ')}</strong>. Linha tracejada usa a média dos dias vizinhos; o ponto vermelho é o valor gravado.</span>`;
        if (window.lucide) window.lucide.createIcons({ root: noteEl });
      } else {
        noteEl.style.display = 'none';
        noteEl.innerHTML = '';
      }
    }

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Tendência (corrige buracos)',
            data: displayValues,
            borderColor: '#f37021',
            backgroundColor: 'rgba(243, 112, 33, 0.12)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderDash: outlierFlags.some(Boolean) ? [6, 4] : [],
            order: 2
          },
          {
            label: 'Valor gravado',
            data: rawValues,
            borderColor: 'transparent',
            backgroundColor: rawValues.map((_, i) => outlierFlags[i] ? '#ef4444' : (recentSnaps[i].is_month_close ? '#105436' : '#f37021')),
            pointBackgroundColor: rawValues.map((_, i) => outlierFlags[i] ? '#ef4444' : (recentSnaps[i].is_month_close ? '#105436' : '#f37021')),
            pointRadius: rawValues.map((_, i) => outlierFlags[i] ? 6 : (recentSnaps[i].is_month_close ? 5 : 3)),
            pointHoverRadius: 7,
            showLine: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const i = context.dataIndex;
                const snap = recentSnaps[i];
                const raw = rawValues[i];
                let label = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(raw);
                if (outlierFlags[i]) label += ' (possível carga parcial)';
                if (snap && snap.is_month_close) label += ' (Fechamento)';
                if (snap && snap.total_count) label += ` · ${snap.total_count} títulos`;
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
              }
            }
          }
        }
      }
    });
  }

  function renderTabelaComparativa(hojeMetrics, fechMetrics) {
    if (!hojeMetrics) return '';

    return `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="calendar-days" style="width: 18px; color: #64748b;"></i> Comparativo de Períodos
          </h3>
        </div>
        <div style="overflow-x: auto;">
          <table class="custom-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem;">Período</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Qtd Títulos</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Valor Total</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Sub Júdice</th>
              </tr>
            </thead>
            <tbody>
              ${fechMetrics ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 20px; font-weight: 600; color: #334155;">Fechamento do Mês</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${fechMetrics.total_count}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${formatMoney(fechMetrics.total_value)}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${fechMetrics.subjudice_count}</td>
              </tr>` : ''}
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 20px; font-weight: 600; color: #334155;">Hoje</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${hojeMetrics.total_count}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${formatMoney(hojeMetrics.total_value)}</td>
                <td style="padding: 12px 20px; text-align: right; color: #334155;">${hojeMetrics.subjudice_count}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAging(metrics) {
    if (!metrics || !metrics.aging) return '';
    const agings = metrics.aging;
    const labels = {
      d0_30: '0 a 30 dias',
      d31_60: '31 a 60 dias',
      d61_90: '61 a 90 dias',
      d91_180: '91 a 180 dias',
      d181_365: '181 a 365 dias',
      d365p: 'Acima de 365 dias'
    };

    let html = `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); height: 100%;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="bar-chart-3" style="width: 18px; color: #64748b;"></i> Faixa de Atraso (Aging)
          </h3>
        </div>
        <div style="padding: 20px;">
    `;

    Object.keys(agings).forEach(k => {
      const val = agings[k].value;
      const pct = metrics.total_value > 0 ? (val / metrics.total_value) * 100 : 0;
      html += `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.85rem; color: #334155;">
            <span>${labels[k]} (${agings[k].count} tít.)</span>
            <span style="font-weight: 600;">${formatMoney(val)} (${pct.toFixed(1)}%)</span>
          </div>
          <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: #f37021; border-radius: 4px;"></div>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    return html;
  }

  function renderCentrosDeCusto(metrics) {
    if (!metrics) return '';
    const ccs = (metrics.centers || []).slice().sort((a, b) => b.value - a.value).slice(0, 15);

    let html = `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); height: 100%;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="building-2" style="width: 18px; color: #64748b;"></i> Maiores Empreendimentos em Inadimplência
          </h3>
        </div>
        <div style="overflow-x: auto; max-height: 420px;">
          <table class="custom-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem;">Centro de Custo</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Qtd Títulos</th>
                <th style="padding: 12px 20px; color: #475569; font-size: 0.85rem; text-align: right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (!ccs.length) {
      html += `<tr><td colspan="3" style="padding:20px;color:#94a3b8;text-align:center;">Nenhum empreendimento no filtro</td></tr>`;
    } else {
      ccs.forEach(cc => {
        const nome = costCenterName(cc.id);
        html += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 20px; color: #334155; font-size: 0.85rem;">${nome}</td>
            <td style="padding: 12px 20px; text-align: right; color: #334155; font-size: 0.85rem;">${cc.count}</td>
            <td style="padding: 12px 20px; text-align: right; color: #334155; font-size: 0.85rem; font-weight: 500;">${formatMoney(cc.value)}</td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div></div>`;
    return html;
  }

  function renderOperadores(metrics) {
    if (!metrics) return '';
    const ops = (metrics.operators || []).slice().sort((a, b) => (b.total_value || 0) - (a.total_value || 0));

    let html = `
      <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); height: 100%;">
        <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="users" style="width: 18px; color: #64748b;"></i> Resumo por Operador
          </h3>
        </div>
        <div style="overflow-x: auto; max-height: 420px;">
          <table class="custom-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 12px 16px; color: #475569; font-size: 0.85rem;">Operador</th>
                <th style="padding: 12px 16px; color: #475569; font-size: 0.85rem; text-align: right;">Títulos</th>
                <th style="padding: 12px 16px; color: #475569; font-size: 0.85rem; text-align: right;">Valor</th>
                <th style="padding: 12px 16px; color: #475569; font-size: 0.85rem; text-align: right;">≥ 31 dias</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (!ops.length) {
      html += `<tr><td colspan="4" style="padding:20px;color:#94a3b8;text-align:center;">Nenhum operador no filtro</td></tr>`;
    } else {
      ops.forEach(op => {
        html += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; color: #334155; font-size: 0.85rem; font-weight: 600;">${op.name || 'N/D'}</td>
            <td style="padding: 12px 16px; text-align: right; color: #334155; font-size: 0.85rem;">${op.total_count || 0}</td>
            <td style="padding: 12px 16px; text-align: right; color: #334155; font-size: 0.85rem; font-weight: 500;">${formatMoney(op.total_value || 0)}</td>
            <td style="padding: 12px 16px; text-align: right; color: #334155; font-size: 0.85rem;">${formatMoney(op.above31_value || 0)}</td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div></div>`;
    return html;
  }

  function aplicarFiltros() {
    filterApplied.companies = filterDraft.companies.slice();
    filterApplied.centers = filterDraft.centers.slice();
    filterApplied.cities = filterDraft.cities.slice();
    filterApplied.operators = filterDraft.operators.slice();
    filterUi.openEmp = filterUi.openCc = filterUi.openCid = filterUi.openOp = false;
    paint();
  }

  function limparFiltros() {
    filterDraft.companies = [];
    filterDraft.centers = [];
    filterDraft.cities = [];
    filterDraft.operators = [];
    filterApplied.companies = [];
    filterApplied.centers = [];
    filterApplied.cities = [];
    filterApplied.operators = [];
    filterUi.openEmp = filterUi.openCc = filterUi.openCid = filterUi.openOp = false;
    filterUi.qEmp = filterUi.qCc = filterUi.qCid = filterUi.qOp = "";
    paint();
  }

  function paint(opts) {
    try {
      const container = document.getElementById('inadimplencia-dashboard-root');
      if (!container) return;

      const scrollY = opts && opts.keepScroll ? window.scrollY : null;

      if (snapshots.length === 0 && getLiveClients().length === 0) {
        container.innerHTML = `
          <div style="padding: 16px 24px 32px;">
            <div style="background: #fff; padding: 40px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
              <i data-lucide="inbox" style="width: 48px; height: 48px; color: #94a3b8; margin-bottom: 15px;"></i>
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">Nenhum histórico disponível</h3>
              <p style="color: #64748b; margin: 0;">O dashboard passará a ter dados após a primeira atualização da Fila de Cobrança.</p>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons({ root: container });
        return;
      }

      const optionsAll = buildFilterOptions();
      let options = cascadeFilterOptions(optionsAll);
      pruneDraftToVisible(options);
      options = cascadeFilterOptions(optionsAll);

      const metrics = getCurrentMetrics();
      const fechSnap = getSnapshotFechamentoMes() || getSnapshotAnterior();
      const fechMetrics = fechSnap ? getCompareMetrics(fechSnap) : null;

      const html = `
        <div style="width: 100%; padding: 16px 24px 32px; box-sizing: border-box;">
          ${renderFilterBar(options)}

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="window.DashboardInadimplencia.gerarRelatorioDiarioPdf()">
              <i data-lucide="file-text" style="width: 16px;"></i> Gerar Sprint Diário (PDF)
            </button>
          </div>

          ${renderCards(metrics, fechMetrics)}

          <div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px;">
            <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <h3 style="margin: 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="trending-up" style="width: 18px; color: #64748b;"></i> Evolução Diária da Inadimplência
              </h3>
            </div>
            <div id="inadimplencia-chart-note" style="display:none;padding:10px 16px;background:#fff7ed;color:#9a3412;font-size:0.82rem;border-bottom:1px solid #ffedd5;align-items:center;gap:6px;"></div>
            <div style="padding: 20px; height: 350px;">
              <canvas id="inadimplencia-chart"></canvas>
            </div>
          </div>

          ${renderTabelaComparativa(metrics, fechMetrics)}

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; align-items: stretch;">
            ${renderAging(metrics)}
            ${renderCentrosDeCusto(metrics)}
            ${renderOperadores(metrics)}
          </div>
        </div>
      `;

      container.innerHTML = html;

      if (window.lucide) {
        window.lucide.createIcons({ root: container });
      }

      setTimeout(() => {
        initChart();
        if (scrollY != null) window.scrollTo(0, scrollY);
      }, 100);
    } catch (err) {
      console.error("Erro ao pintar dashboard de inadimplência:", err);
      alert("ERRO NO DASHBOARD DE INADIMPLÊNCIA:\n\n" + err.message + "\n\nStack:\n" + err.stack);
    }
  }

  async function render() {
    try {
      const container = document.getElementById('inadimplencia-dashboard-root');
      if (!container) return;

      container.innerHTML = `
        <div style="display: flex; justify-content: center; padding: 40px;">
          <div class="loader" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
      `;

      await carregarDados();
      paint();
    } catch (err) {
      console.error("Erro ao renderizar dashboard de inadimplência:", err);
      alert("ERRO NO DASHBOARD DE INADIMPLÊNCIA:\n\n" + err.message + "\n\nStack:\n" + err.stack);
    }
  }

  const originalSwitchTab = window.switchTab;
  if (originalSwitchTab) {
    window.switchTab = function(tabId, title, fromSidebar) {
      originalSwitchTab(tabId, title, fromSidebar);
      if (tabId === 'inadimplencia_dashboard') {
        render();
      }
    };
  } else {
    setTimeout(() => {
      if (window.switchTab) {
        const os = window.switchTab;
        window.switchTab = function(tabId, title, fromSidebar) {
          os(tabId, title, fromSidebar);
          if (tabId === 'inadimplencia_dashboard') render();
        };
      }
    }, 1000);
  }

  async function salvarPosicaoHoje() {
    if (!window.AppState || !window.AppState.inadimplentes || window.AppState.inadimplentes.length === 0) {
      alert("Nenhum dado na fila de cobrança para salvar. Carregue os dados primeiro.");
      return;
    }
    if (confirm("Deseja salvar a posição atual da Fila de Cobrança como o snapshot de hoje?")) {
      try {
        await window.SiengeAPI.saveDefaultersSnapshot(window.AppState.inadimplentes);
        alert("Posição salva com sucesso!");
        await carregarDados();
        paint();
      } catch (e) {
        alert("Erro ao salvar posição: " + e.message);
      }
    }
  }

  function gerarRelatorioDiarioPdf() {
    if (!window.rawClientList || window.rawClientList.length === 0) {
      alert("Nenhum dado na fila de cobrança para gerar o relatório. Carregue os dados primeiro.");
      return;
    }

    const bills = window.rawClientList;
    
    let totalOverdue = 0;
    let totalBills = 0;
    const uniqueClients = new Set();
    let sumMaxDaysDelay = 0;
    const companyData = {};
    const operatorData = {};
    const zeroPaidClients = [];
    
    bills.forEach(b => {
      if ((Number(b.overdueValue) || 0) < 0.01) return;
      totalOverdue += b.overdueValue || 0;
      uniqueClients.add(b.customerId);
      totalBills += (b.titles && b.titles.length > 0) ? b.titles.length : 1;
      sumMaxDaysDelay += (b.maxDaysDelay || 0);

      const delay = b.maxDaysDelay || 0;
      let delayBucket = '';
      if (delay <= 30) delayBucket = 'd30';
      else if (delay <= 60) delayBucket = 'd60';
      else if (delay <= 90) delayBucket = 'd90';
      else if (delay <= 120) delayBucket = 'd120';
      else delayBucket = 'd120p';

      // Empresa
      const compId = String(b.companyId || 'N/D');
      if (!companyData[compId]) {
         let compName = 'N/D';
         if (window.AppState && window.AppState.companies) {
             const cObj = window.AppState.companies.find(c => String(c.id) === compId);
             if (cObj) compName = cObj.tradeName || cObj.name || `EMPRESA ${compId}`;
         }
         if (compName === 'N/D' && typeof window.getCompanyName === 'function') compName = window.getCompanyName(compId);
         companyData[compId] = { id: compId, name: compName.toUpperCase(), totalBills: 0, totalValue: 0, d30_v: 0, d60_v: 0, d90_v: 0, d120_v: 0, d120p_v: 0, subjudice_v: 0 };
      }
      const comp = companyData[compId];
      comp.totalBills += (b.titles && b.titles.length > 0) ? b.titles.length : 1;
      comp.totalValue += (b.overdueValue || 0);
      if (b.subjudice === 'S') comp.subjudice_v += (b.overdueValue || 0);
      else comp[delayBucket + '_v'] += (b.overdueValue || 0);

      // Operador
      let opName = (b.assignedOperator || 'NÃO ATRIBUÍDO').toUpperCase().trim();
      if (!operatorData[opName]) {
          operatorData[opName] = { name: opName, d30_c:0,d30_v:0, d60_c:0,d60_v:0, d90_c:0,d90_v:0, d120_c:0,d120_v:0, d120p_c:0,d120p_v:0, total_c:0,total_v:0, customers:[] };
      }
        const op = operatorData[opName];
        const numTitulos = (b.titles && b.titles.length > 0) ? b.titles.length : 1;
        const bTitle = b.saleId || (b.billIds && b.billIds.length ? b.billIds[0] : '-');
        op.customers.push({ name: b.customerName || 'N/D', title: String(bTitle), value: b.overdueValue || 0, delay: b.maxDaysDelay || 0 });
        op.total_c += numTitulos; op.total_v += (b.overdueValue||0);
        op[delayBucket+'_c'] += numTitulos; op[delayBucket+'_v'] += (b.overdueValue||0);

      if (b.isZeroPaid) zeroPaidClients.push({ name: b.customerName || 'N/D', title: String(bTitle), delay: b.maxDaysDelay || 0, value: b.overdueValue || 0, billCount: Number(b.totalInstallmentsCount || b.billCount || (b.billIds && b.billIds.length) || 1), unitName: b.unitName, costCenterId: b.costCenterId });
    });

    const avgDelay = bills.length > 0 ? Math.round(sumMaxDaysDelay / bills.length) : 0;
    const dateStr = new Date().toLocaleDateString('pt-BR');

    const opSorted = Object.values(operatorData).sort((a,b) => b.total_v - a.total_v);

    const opTotals = { d30_c:0,d30_v:0,d60_c:0,d60_v:0,d90_c:0,d90_v:0,d120_c:0,d120_v:0,d120p_c:0,d120p_v:0,total_c:0,total_v:0 };
    opSorted.forEach(op => { ['d30','d60','d90','d120','d120p','total'].forEach(k => { opTotals[k+'_c'] += op[k+'_c']; opTotals[k+'_v'] += op[k+'_v']; }); });

    const fechSnapReal = snapshots.find(s => s.is_month_close) || snapshots[0];
    const dateSet = new Set();
    let chartSnaps = [];
    if (fechSnapReal) {
        chartSnaps.push(fechSnapReal);
        dateSet.add(fechSnapReal.date);
    }
    const lastSnaps = snapshots.slice(-30);
    lastSnaps.forEach(s => {
        if (!dateSet.has(s.date)) {
            dateSet.add(s.date);
            chartSnaps.push(s);
        } else {
            const idx = chartSnaps.findIndex(cs => cs.date === s.date && !cs.is_month_close);
            if (idx !== -1) chartSnaps[idx] = s;
        }
    });
    if (chartSnaps.length > 8) {
        chartSnaps = [chartSnaps[0], ...chartSnaps.slice(-7)];
    }
    const chartLabels = chartSnaps.map((s, i) => {
        if (i === 0 && s.is_month_close) return 'Fech.';
        if (s.date === snapshots[snapshots.length-1].date) return 'Hoje';
        if (s.date) {
            const parts = s.date.split('-');
            const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
            if (parts.length === 3) return `${parts[2]}/${months[parseInt(parts[1],10)-1]}`;
        }
        return `d-${chartSnaps.length - 1 - i}`;
    });
    const fechSnap = fechSnapReal;
    const hojeSnap = snapshots[snapshots.length-1];

    function fmtK(v) { if(!v) return 'R$ 0'; if(v>=1000000) return 'R$ '+(v/1000000).toFixed(1)+'M'; if(v>=1000) return 'R$ '+(v/1000).toFixed(0)+'K'; return formatMoney(v); }
    function fmtMoneyNoRs(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
    function fmtMoney(v) { return 'R$ ' + fmtMoneyNoRs(v); }
    function fmtInteiro(v) { return Math.floor(v).toLocaleString('pt-BR'); }
    function cellOp(c, v) { if(c===0) return '<span style="color:#cbd5e1;">—</span>'; return `<span style="font-weight:700;">${fmtMoneyNoRs(v)}</span><br><span style="font-size:7.5px;color:#64748b;">${c} tít.</span>`; }
    function cellOpTot(c, v, totC, totalValue, totalTitles) {
      if (c === 0) return '<span style="color:#cbd5e1;">—</span>';
      const pctValue = totalValue > 0 ? Math.round((v / totalValue) * 100) : 0;
      const pctTitles = totalTitles > 0 ? Math.round((c / totalTitles) * 100) : 0;
      return `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; white-space:nowrap;"><span style="font-weight:700; font-size:8px;">${fmtMoneyNoRs(v)} | ${pctValue}%</span><span style="font-size:7px;color:#ea580c;">${c} tít. | ${pctTitles}%</span></div>`;
    }
    
    function dualStackedBarWithArrow(snap1, snap2, label1, label2) {
      if (!snap1 || !snap2) return '';
      
      function getBands(snap) {
          let d30=0, d60=0, d90=0, d120=0, above120=0;
          if (snap && snap.data_json && snap.data_json.companies) {
              snap.data_json.companies.forEach(c => {
                  if (c.aging) {
                      d30 += (c.aging.d0_30 && c.aging.d0_30.value) || 0;
                      d60 += (c.aging.d31_60 && c.aging.d31_60.value) || 0;
                      d90 += (c.aging.d61_90 && c.aging.d61_90.value) || 0;
                      d120 += (c.aging.d91_180 && c.aging.d91_180.value) || 0;
                      above120 += ((c.aging.d181_365 && c.aging.d181_365.value) || 0) + ((c.aging.d365p && c.aging.d365p.value) || 0);
                  }
              });
          }
          if (d30===0 && d60===0 && d90===0) {
              d30 = snap.d30_value || 0;
              d60 = snap.d60_value || 0;
              d90 = snap.d90_value || 0;
              d120 = snap.d120_value || 0;
              above120 = snap.above120_value || 0;
          }
          return { d30, d60, d90, d120, above120 };
      }
      
      const b1Raw = getBands(snap1), b2Raw = getBands(snap2);
      const t1 = snap1.total_value || 1, t2 = snap2.total_value || 1;
      
      // Proporcional fallback para o fechamento se não tivermos histórico de aging
      if (b1Raw.d30 === 0 && b1Raw.d60 === 0 && b1Raw.d90 === 0 && snap1.total_value > 0) {
          const tot2 = b2Raw.d30 + b2Raw.d60 + b2Raw.d90 + b2Raw.d120 + b2Raw.above120 || 1;
          b1Raw.d30 = (b2Raw.d30 / tot2) * snap1.total_value;
          b1Raw.d60 = (b2Raw.d60 / tot2) * snap1.total_value;
          b1Raw.d90 = (b2Raw.d90 / tot2) * snap1.total_value;
          b1Raw.d120 = (b2Raw.d120 / tot2) * snap1.total_value;
          b1Raw.above120 = (b2Raw.above120 / tot2) * snap1.total_value;
      }
      
      const b1 = [
          {v: b1Raw.d30, color:'#22c55e'},
          {v: b1Raw.d60, color:'#eab308'},
          {v: b1Raw.d90, color:'#f97316'},
          {v: b1Raw.d120, color:'#ef4444'},
          {v: b1Raw.above120, color:'#991b1b'}
      ];
      const b2 = [
          {v: b2Raw.d30, color:'#22c55e'},
          {v: b2Raw.d60, color:'#eab308'},
          {v: b2Raw.d90, color:'#f97316'},
          {v: b2Raw.d120, color:'#ef4444'},
          {v: b2Raw.above120, color:'#991b1b'}
      ];
      
      const diff = t2 - t1;
      const pct = t1 ? ((diff / t1) * 100).toFixed(1) : 0;
      const sign = diff > 0 ? '+' : '';
      const diffText = `${sign}${(diff/1000000).toFixed(3).replace('.',',')} | ${sign}${pct}%`;
      
      const W = 320, H = 180, padTop = 50, padBot = 25, padSide = 80;
      const barW = 30;
      const x1 = padSide, x2 = W - padSide;
      
      const arrowY = 15;
      const arrowPath = `M ${x1} ${arrowY+6} L ${x1} ${arrowY} L ${x2} ${arrowY} L ${x2} ${arrowY+6}`;
      const arrowHead = `M ${x2-3.5} ${arrowY+2.5} L ${x2} ${arrowY+6} L ${x2+3.5} ${arrowY+2.5}`;
      const topArrowSvg = `
        <path d="${arrowPath}" fill="none" stroke="#0f1e17" stroke-width="1.5" />
        <path d="${arrowHead}" fill="none" stroke="#0f1e17" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="${W/2 - 45}" y="${arrowY - 10}" width="90" height="16" fill="#fff" />
        <text x="${W/2}" y="${arrowY + 3}" text-anchor="middle" font-size="10" font-weight="800" fill="#0f1e17">${diffText}</text>
      `;
      
      let rects = '';
      let y1 = 0;
      b1.forEach(b => { const h = (b.v/t1)*(H-padTop-padBot); rects += `<rect x="${x1 - barW/2}" y="${H-padBot-y1-h}" width="${barW}" height="${h}" fill="${b.color}"/>`; y1+=h; });
      let y2 = 0;
      b2.forEach(b => { const h = (b.v/t2)*(H-padTop-padBot); rects += `<rect x="${x2 - barW/2}" y="${H-padBot-y2-h}" width="${barW}" height="${h}" fill="${b.color}"/>`; y2+=h; });
      
      return `<svg width="${W}" height="${H}" style="overflow:visible;display:block;margin:0 auto;">
          ${topArrowSvg}
          ${rects}
          <text x="${x1}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="#64748b">${label1}</text>
          <text x="${x2}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="#64748b">${label2}</text>
          <text x="${x1}" y="${H-padBot-y1-5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${(t1/1000000).toFixed(3).replace('.',',')}</text>
          <text x="${x2}" y="${H-padBot-y2-5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${(t2/1000000).toFixed(3).replace('.',',')}</text>
      </svg>`;
    }

    function stackedBarSvg(snap, label) {
      if (!snap) return `<div style="text-align:center;color:#94a3b8;font-size:9px;">${label}<br>Sem dados</div>`;
      const total = snap.total_value || totalOverdue || 1;
      const bands = [{ v:snap.d30_value||0,color:'#3b82f6'},{v:snap.d60_value||0,color:'#22c55e'},{v:snap.d90_value||0,color:'#f59e0b'},{v:snap.d120_value||0,color:'#ef4444'},{v:snap.above120_value||0,color:'#7f1d1d'}];
      const H=140, W=44; let y=0;
      const rects = bands.map(b=>{ const h=(b.v/total)*H; const r=`<rect x="0" y="${H-y-h}" width="${W}" height="${h}" fill="${b.color}"/>`; y+=h; return r; }).join('');
      return `<div style="text-align:center;"><div style="font-size:8.5px;font-weight:700;color:#334155;margin-bottom:3px;">${fmtK(total)}</div><svg width="${W}" height="${H}" style="display:block;margin:0 auto;">${rects}</svg><div style="font-size:8.5px;color:#64748b;margin-top:3px;">${label}</div></div>`;
    }

    function barChartSvg(data, labels, color, isVal=false) {
      if (!data||data.length===0) return '';
      const maxVal = Math.max(...data, 1);
      const W = 320, H = 140, padTop = 45, padBot = 25, padSide = 40;
      const barCount = data.length;
      const stepX = (W - padSide * 2) / (barCount > 1 ? barCount - 1 : 1);
      const barWidth = Math.min(18, stepX * 0.5);
      
      let bars = '';
      let textLabels = '';
      let xLabels = '';
      
      const firstVal = data[0];
      const lastVal = data[data.length - 1];
      const diff = lastVal - firstVal;
      const pct = firstVal ? ((diff / firstVal) * 100).toFixed(1) : 0;
      const sign = diff > 0 ? '+' : '';
      
      const barColor = diff < 0 ? '#4ade80' : '#f87171';
      
      function formatVal(v) {
          if (!isVal) return v;
          return (v / 1000000).toFixed(3).replace('.', ',');
      }
      
      const diffStr = isVal ? formatVal(diff) : diff;
      const diffText = `${sign}${diffStr} | ${sign}${pct}%`;
      
      const arrowY = 15;
      const arrowStartX = padSide;
      const arrowEndX = W - padSide;
      const arrowPath = `M ${arrowStartX} ${arrowY+6} L ${arrowStartX} ${arrowY} L ${arrowEndX} ${arrowY} L ${arrowEndX} ${arrowY+6}`;
      const arrowHead = `M ${arrowEndX-3.5} ${arrowY+2.5} L ${arrowEndX} ${arrowY+6} L ${arrowEndX+3.5} ${arrowY+2.5}`;
      
      const topArrowSvg = `
        <path d="${arrowPath}" fill="none" stroke="#0f1e17" stroke-width="1.5" />
        <path d="${arrowHead}" fill="none" stroke="#0f1e17" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="${W/2 - 40}" y="${arrowY - 10}" width="80" height="16" fill="#fff" />
        <text x="${W/2}" y="${arrowY + 3}" text-anchor="middle" font-size="10" font-weight="800" fill="#0f1e17">${diffText}</text>
      `;

      data.forEach((v, i) => {
          const xCenter = padSide + i * stepX;
          const barH = (v / maxVal) * (H - padTop - padBot);
          const y = H - padBot - barH;
          
          let currentBarColor = '#94a3b8';
          if (labels[i] !== 'Fech.') {
              currentBarColor = (v <= firstVal) ? '#4ade80' : '#f87171';
          }
          
          bars += `<rect x="${xCenter - barWidth/2}" y="${y}" width="${barWidth}" height="${barH}" fill="${currentBarColor}" rx="2" />`;
          
          const valText = formatVal(v);
          textLabels += `<text x="${xCenter}" y="${y - 5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${valText}</text>`;
          
          xLabels += `<text x="${xCenter}" y="${H - 5}" text-anchor="middle" font-size="8.5" fill="#64748b">${labels[i]}</text>`;
      });
      
      const axisLine = `<line x1="${0}" y1="${H - padBot}" x2="${W}" y2="${H - padBot}" stroke="#e2e8f0" stroke-width="1.5" />`;

      return `<svg width="${W}" height="${H}" style="overflow:visible;display:block;margin:0 auto;">
          ${topArrowSvg}
          ${axisLine}
          ${bars}
          ${textLabels}
          ${xLabels}
      </svg>`;
    }

    zeroPaidClients.sort((a,b)=>b.delay-a.delay);
    const zeroPaidTotalValue = zeroPaidClients.reduce((acc,c)=>acc+c.value,0);
    const zeroPaidTotalTitles = zeroPaidClients.length;
    const zeroPaidTop5 = zeroPaidClients.slice(0,5);
    
    const zeroPaidEmp = {};
    zeroPaidClients.forEach(c => {
        let emp = 'Outros';
        if (c.costCenterId && c.costCenterId !== 'N/D') {
            let ccName = '';
            if (window.AppState && window.AppState.cachedCostCenters) {
                const ccObj = window.AppState.cachedCostCenters.find(cc => String(cc.id) === String(c.costCenterId));
                if (ccObj) ccName = ccObj.name || '';
            }
            if (ccName) {
                ccName = ccName.trim().toUpperCase();
                // Se por acaso o nome já vier com o ID, removemos para padronizar
                if (ccName.startsWith(c.costCenterId + ' - ')) {
                    ccName = ccName.substring((c.costCenterId + ' - ').length).trim();
                } else if (ccName.startsWith(c.costCenterId + '-')) {
                    ccName = ccName.substring((c.costCenterId + '-').length).trim();
                }
            }
            emp = ccName ? `${c.costCenterId} - ${ccName}` : c.costCenterId;
        }
        if (!zeroPaidEmp[emp]) zeroPaidEmp[emp] = 0;
        zeroPaidEmp[emp] += 1;
    });
    const zeroPaidEmpListFull = Object.keys(zeroPaidEmp).map(k => ({ name: k, count: zeroPaidEmp[k] })).sort((a,b) => b.count - a.count);
    let zeroPaidEmpList = [];
    if (zeroPaidEmpListFull.length > 5) {
        zeroPaidEmpList = zeroPaidEmpListFull.slice(0, 4);
        const outrosCount = zeroPaidEmpListFull.slice(4).reduce((sum, item) => sum + item.count, 0);
        zeroPaidEmpList.push({ name: 'OUTROS', count: outrosCount });
    } else {
        zeroPaidEmpList = zeroPaidEmpListFull;
    }
    function getAbove31(snap) {
        let v = 0, c = 0;
        if (snap && snap.data_json && snap.data_json.companies) {
            snap.data_json.companies.forEach(comp => {
                if (comp.aging) {
                    ['d31_60', 'd61_90', 'd91_180', 'd181_365', 'd365p'].forEach(k => {
                        if (comp.aging[k]) {
                            v += comp.aging[k].value || 0;
                            c += comp.aging[k].count || 0;
                        }
                    });
                }
            });
        }
        // Se as propriedades sumadas derem zero, tenta usar os campos que já vinham calculados na raiz
        if (v === 0 && snap.above31_value) v = snap.above31_value;
        if (c === 0 && snap.above31_count) c = snap.above31_count;
        
        return { v, c };
    }
    
    const hojeSnapForFallback = chartSnaps[chartSnaps.length - 1];
    const hojeAbove31 = getAbove31(hojeSnapForFallback);

    const chart31v = chartSnaps.map(s => {
        let res = getAbove31(s);
        if (res.v === 0 && s.total_value > 0 && hojeSnapForFallback.total_value > 0) {
            res.v = (hojeAbove31.v / hojeSnapForFallback.total_value) * s.total_value;
            res.c = Math.round((hojeAbove31.c / hojeSnapForFallback.total_count) * s.total_count);
        }
        return res.v;
    });
    const chart31t = chartSnaps.map(s => {
        let res = getAbove31(s);
        if (res.v === 0 && s.total_value > 0 && hojeSnapForFallback.total_value > 0) {
            res.c = Math.round((hojeAbove31.c / hojeSnapForFallback.total_count) * s.total_count);
        }
        return res.c;
    });

    let ontemSnap = null;
    if (snapshots.length > 1) {
        const hojeDateStr = snapshots[snapshots.length-1].date;
        for (let i = snapshots.length - 2; i >= 0; i--) {
            const s = snapshots[i];
            if (s.date === hojeDateStr) continue;
            let isDiaUtil = true;
            if (s.date) {
                const d = new Date(s.date + 'T12:00:00');
                const day = d.getDay();
                if (day === 0 || day === 6) isDiaUtil = false; // Domingo ou Sábado
            }
            if (isDiaUtil) {
                ontemSnap = s;
                break;
            }
        }
        if (!ontemSnap) {
            ontemSnap = snapshots[snapshots.length - 2];
        }
    }

    let diffValueStr = "";
    let diffClientsStr = "";
    let diffBillsStr = "";
    
    if (ontemSnap) {
        const diffVal = totalOverdue - (ontemSnap.total_value || 0);
        if (Math.abs(diffVal) > 1) {
            const diffValFmt = Math.abs(diffVal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            diffValueStr = ` (${diffVal > 0 ? '+' : '-'} ${diffValFmt} do que o último dia útil)`;
        }
        
        let ontemTotCust = ontemSnap.total_customers;
        if (ontemTotCust === undefined && ontemSnap.data_json && ontemSnap.data_json.companies) {
            // Se não tem salvo, não temos como saber o numero exato de clientes unicos facilmente sem recalcular tudo,
            // mas o CRM agora salva total_customers.
        }
        
        if (ontemTotCust !== undefined) {
            const diffCli = uniqueClients.size - ontemTotCust;
            if (diffCli !== 0) {
                diffClientsStr = ` (${diffCli > 0 ? '+' : '-'} ${Math.abs(diffCli)} do que o último dia útil)`;
            }
        }
        
        if (ontemSnap.total_count !== undefined) {
            const diffTit = totalBills - ontemSnap.total_count;
            if (diffTit !== 0) {
                diffBillsStr = ` (${diffTit > 0 ? '+' : '-'} ${Math.abs(diffTit)} do que o último dia útil)`;
            }
        }
    }

    const opSummary = (typeof window.buildSprintOperatorSummaries === "function") ? window.buildSprintOperatorSummaries() : "";
    const teamsText = `📊 *Sprint Diário - ${dateStr}*\n💰 *Valor em Atraso:* ${fmtInteiro(totalOverdue)}${diffValueStr}\n👥 *Clientes em Atraso:* ${uniqueClients.size}${diffClientsStr}\n📄 *Títulos Vencidos:* ${totalBills}${diffBillsStr}\n⏱️ *Atraso Médio:* ${avgDelay} dias` + (opSummary ? `\n\n${opSummary}` : "");
    const teamsLink = `https://teams.microsoft.com/l/chat/19:1d1e6bd7448a479bace24f762a30b425@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D&message=${encodeURIComponent(teamsText)}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sprint Diário - ${dateStr}</title><style>
@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;padding:0;color:#1e293b;font-size:9.5px;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.2}
@media print{.no-print{display:none!important}body{background:white}}
.no-print{text-align:center;padding:10px;background:#0f1e17;display:flex;justify-content:center;gap:15px;}
.no-print button{padding:8px 24px;background:#22c55e;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);transition:opacity 0.2s}
.no-print button:hover{opacity:0.9}
h1{text-align:center;color:#0f1e17;margin:0 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.kpi-strip { display:grid; grid-template-columns: 60px repeat(4, 1fr); gap:10px; margin-bottom:10px; }
.kpi { display:flex; align-items:center; gap:8px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
.kpi-icon-wrapper { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.kpi.danger .kpi-icon-wrapper { background:#fee2e2; color:#ef4444; }
.kpi.warning .kpi-icon-wrapper { background:#fef3c7; color:#f59e0b; }
.kpi.success .kpi-icon-wrapper { background:#dcfce7; color:#10b981; }
.kpi.info .kpi-icon-wrapper { background:#e0f2fe; color:#3b82f6; }
.kpi-content { display:flex; flex-direction:column; gap:2px; }
.kpi-label { font-size:8.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.02em; }
.kpi-value { font-size:16px; font-weight:800; color:#0f1e17; line-height:1; }
.row-2{display:grid;grid-template-columns: 60px repeat(4, 1fr);gap:10px;margin-bottom:10px;align-items:stretch}
.bar-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px}
.bar-title{font-size:9.5px;font-weight:700;color:#334155;margin-bottom:4px}
.bar-delta{font-size:11px;font-weight:800;color:#16a34a;margin-bottom:6px}
.bars-row{display:flex;gap:20px;justify-content:center;align-items:flex-end}
.legend-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;justify-content:center}
.legend-item{display:flex;align-items:center;gap:4px;font-size:8px;color:#64748b}
.legend-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.op-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;padding:4px 6px;font-size:8px;font-weight:700;color:#475569;text-transform:uppercase;border-bottom:2px solid #e2e8f0;text-align:center}
th.L{text-align:left}
td{padding:4px 6px;font-size:8.5px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle}
td.L{text-align:left;font-weight:700;color:#1e293b;white-space:nowrap;}
tr:nth-child(even) td{background:#fafafa}
tr.tot td{background:#fff7ed!important;font-weight:800;color:#c2410c;border-top:2px solid #fed7aa}
.trends-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.trend-panel{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px}
.trend-title{font-size:9px;font-weight:700;color:#334155;text-align:center;margin-bottom:6px}
.summary-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.sbox{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
.stag{display:inline-block;font-size:9px;font-weight:800;color:#fff;padding:2px 10px;border-radius:12px;margin-bottom:6px}
.sstat{font-size:9px;color:#475569;line-height:1.8}
.sstat strong{color:#1e293b}
.sright table{margin:0}
.sright td{padding:3px 6px;font-size:9px;border:none;border-bottom:1px solid #f1f5f9}
.sright td:first-child{text-align:left;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sright td:last-child{text-align:right;color:#dc2626;font-weight:700}
.op-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.op-card{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
.op-head{background:#fff7ed;color:#ea580c;padding:3px;font-size:8px;font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #ea580c;}
.op-card table{width:100%;border-collapse:collapse;margin:0;font-size:6.5px}
.op-card th{padding:2px 4px;border-bottom:1px solid #f1f5f9;color:#64748b;font-weight:700;text-align:left;}
.op-card td{padding:2px 4px;border-bottom:1px solid #f1f5f9;color:#334155}
.op-card td:nth-child(1){font-weight:700;color:#64748b;max-width:35px;overflow:hidden;text-overflow:ellipsis;}
.op-card td:nth-child(2){font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;}
.op-card td:last-child{text-align:right;font-weight:800;color:#1e293b}
</style>
<script>
    function sendToTeams() {
        const txt = \`${teamsText.replace(/`/g, "\\`").replace(/\\/g, "\\\\")}\`;
        navigator.clipboard.writeText(txt).then(() => {
            alert("O texto padrão foi copiado para a área de transferência (Ctrl+C)!\\n\\nSalve o PDF na próxima tela e cole-o na janela do Teams que será aberta a seguir.");
            window.print();
            setTimeout(() => { window.open('${teamsLink}', '_blank'); }, 1000);
        }).catch(e => {
            console.error("Erro ao copiar", e);
            window.print();
            setTimeout(() => { window.open('${teamsLink}', '_blank'); }, 1000);
        });
    }
</script>
</head><body>
<div class="no-print">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="sendToTeams()" style="background:#464eb8;">💬 Enviar por Teams</button>
</div>
<h1>Sprint Diário — Inadimplência &nbsp;·&nbsp; ${dateStr}</h1>
<div class="kpi-strip">
  <div style="display:flex; align-items:center; justify-content:center; padding: 0 5px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;">
    <img src="https://yt3.googleusercontent.com/rx0DOaXFXLF0HHeZtC_xI7vR23Y7Jxmm7gA6o_emTX6qFNIDo3J91z11ASXDNypT57crV1EPOQ=s900-c-k-c0x00ffffff-no-rj" style="width: 45px; height: 45px; object-fit: contain; border-radius: 50%;">
  </div>
  <div class="kpi danger"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div><div class="kpi-content"><span class="kpi-label">Valor em Atraso</span><span class="kpi-value">${fmtInteiro(totalOverdue)}</span></div></div>
  <div class="kpi warning"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div><div class="kpi-content"><span class="kpi-label">Clientes em Atraso</span><span class="kpi-value">${uniqueClients.size}</span></div></div>
  <div class="kpi success"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div><div class="kpi-content"><span class="kpi-label">Títulos Vencidos</span><span class="kpi-value">${totalBills}</span></div></div>
  <div class="kpi info"><div class="kpi-icon-wrapper"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div><div class="kpi-content"><span class="kpi-label">Atraso Médio</span><span class="kpi-value">${avgDelay} dias</span></div></div>
</div>
<div class="row-2">
  <div class="bar-panel" style="display:flex; flex-direction:column; justify-content:space-between; height: 100%; grid-column: 1 / 3;">
    <div style="background: #ea580c; color: white; padding: 8px; font-size: 9px; font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin: -8px -8px 8px -8px; border-top-left-radius: 6px; border-top-right-radius: 6px;">VALOR EM ATRASO (EM MILHÕES)</div>
    <div class="bars-row">${dualStackedBarWithArrow(fechSnap, hojeSnap, 'Fech.', 'Hoje')}</div>
    <div class="legend-row">
      <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>até 30</div>
      <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div>31-60</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>61-90</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>91-120</div>
      <div class="legend-item"><div class="legend-dot" style="background:#991b1b"></div>ac.120</div>
    </div>
  </div>
  <div class="op-wrap" style="grid-column: 3 / 6;">
    <table class="tb" style="width:100%; height:100%; border-collapse:separate; border-spacing:0; margin-top:0;">
    <thead><tr><th class="L" style="padding:8px; background: #ea580c; color: white !important; border-top-left-radius: 5px;">Operador</th><th style="padding:8px; background: #ea580c; color: white !important;">Até 30</th><th style="padding:8px; background: #ea580c; color: white !important;">31 a 60</th><th style="padding:8px; background: #ea580c; color: white !important;">61 a 90</th><th style="padding:8px; background: #ea580c; color: white !important;">91 a 120</th><th style="padding:8px; background: #ea580c; color: white !important;">Acima 120</th><th style="padding:8px; background: #ea580c; color: white !important; border-top-right-radius: 5px;">Total</th></tr></thead>
    <tbody>
      ${opSorted.map((op, idx)=>`<tr style="background:${idx%2===0?'#ffffff':'#ffedd5'}"><td class="L">${op.name !== 'NÃO ATRIBUÍDO' && op.name.split(' ').length > 1 ? op.name.split(' ')[0] + ' ' + op.name.split(' ')[1][0] + '.' : op.name.split(' ')[0]}</td><td>${cellOp(op.d30_c,op.d30_v)}</td><td>${cellOp(op.d60_c,op.d60_v)}</td><td>${cellOp(op.d90_c,op.d90_v)}</td><td>${cellOp(op.d120_c,op.d120_v)}</td><td>${cellOp(op.d120p_c,op.d120p_v)}</td><td><span style="font-weight:800">${fmtMoneyNoRs(op.total_v)}</span><br><span style="font-size:7.5px;color:#64748b">${op.total_c} tít.</span></td></tr>`).join('')}
      <tr class="tot" style="background:#ffedd5; border-top:2px solid #fdba74;"><td class="L" style="color:#ea580c; border-bottom-left-radius: 5px;">Total</td><td>${cellOpTot(opTotals.d30_c,opTotals.d30_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d60_c,opTotals.d60_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d90_c,opTotals.d90_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d120_c,opTotals.d120_v,opTotals.total_c, totalOverdue, totalBills)}</td><td>${cellOpTot(opTotals.d120p_c,opTotals.d120p_v,opTotals.total_c, totalOverdue, totalBills)}</td><td style="border-bottom-right-radius: 5px;"><div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; white-space:nowrap;"><span style="font-weight:800;color:#ea580c; font-size:8px;">${fmtMoneyNoRs(opTotals.total_v)} | ${Math.round((opTotals.total_v / (totalOverdue || 1)) * 100)}%</span><span style="font-size:7px;color:#ea580c">${opTotals.total_c} tít. | ${Math.round((opTotals.total_c / (totalBills || 1)) * 100)}%</span></div></td></tr>
    </tbody>
  </table></div>
</div>
<div style="margin-bottom:12px;">
  <div style="background: linear-gradient(135deg, #f97316 0%, #c2410c 100%); border-radius:8px; padding:12px; color:white; display:flex; flex-direction:column; box-shadow:0 4px 6px rgba(249, 115, 22, 0.2);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">📅 Títulos com 31 dias de atraso ou mais</div>
      <div style="font-size:12px; font-weight:700;">${chart31t[chart31t.length-1] || 0} Títulos <span style="font-size:10px; font-weight:500;">(${(((chart31t[chart31t.length-1] || 0) / (totalBills || 1)) * 100).toFixed(1)}% do total de Títulos)</span></div>
      <div style="font-size:12px; font-weight:800;">Total: ${fmtMoneyNoRs(chart31v[chart31v.length-1] || 0)}</div>
    </div>
    <div style="background:rgba(255,255,255,0.95); border-radius:6px; padding:10px; display:flex; gap:15px; justify-content:space-around;">
      <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
          <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Título</div>
          ${barChartSvg(chart31t, chartLabels, '#c2410c', false)}
      </div>
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; border-left:1px solid #e2e8f0;">
          <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Valores (em milhões)</div>
          ${barChartSvg(chart31v, chartLabels, '#c2410c', true)}
      </div>
    </div>
  </div>
</div>
<div style="margin-bottom:12px;">
  <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border-radius:8px; padding:12px; color:white; display:flex; flex-direction:column; box-shadow:0 4px 6px rgba(239, 68, 68, 0.2);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">💸 0% Pago</div>
      <div style="font-size:12px; font-weight:700;">${zeroPaidTotalTitles} Títulos <span style="font-size:10px; font-weight:500;">(${((zeroPaidTotalTitles / (totalBills || 1)) * 100).toFixed(1)}% do total de Títulos)</span></div>
      <div style="font-size:12px; font-weight:800;">Total: ${fmtMoneyNoRs(zeroPaidTotalValue)}</div>
    </div>
    <div style="background:rgba(255,255,255,0.95); border-radius:6px; padding:10px; display:flex; gap:15px;">
      <div style="flex:1;">
        <table style="width:100%; border-collapse:collapse; font-size:8.5px; color:#1e293b;">
          <thead>
            <tr><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Título</th><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Cliente</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Dias em Atraso</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Parcelas</th></tr>
          </thead>
          <tbody>
            ${zeroPaidTop5.map(c=>`<tr><td class="L" style="padding:4px;">${c.title || '-'}</td><td class="L" style="padding:4px;">${c.name.split(' ').slice(0,3).join(' ')}</td><td style="padding:4px;text-align:center;">${c.delay}</td><td style="padding:4px;text-align:center;">${c.billCount}</td></tr>`).join('')}
            ${zeroPaidTop5.length===0?'<tr><td colspan="4" style="padding:10px 0; color:#94a3b8; text-align:center;">Nenhum título 0% pago</td></tr>':''}
          </tbody>
        </table>
      </div>
      <div style="width:1px; background:#0284c7; opacity: 0.3;"></div>
      <div style="flex:1;">
        <table style="width:100%; border-collapse:collapse; font-size:8.5px; color:#1e293b;">
          <thead>
            <tr><th class="L" style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-weight:700;text-transform:none;">Empreendimento</th><th style="background:transparent;border-bottom:1px solid #e2e8f0;padding:2px 4px;text-align:center;font-weight:700;text-transform:none;">Título</th></tr>
          </thead>
          <tbody>
            ${zeroPaidEmpList.slice(0,6).map(e=>`<tr><td class="L" style="padding:4px;">${e.name}</td><td style="padding:4px;text-align:center;">${e.count}</td></tr>`).join('')}
            ${zeroPaidEmpList.length===0?'<tr><td colspan="2" style="padding:10px 0; color:#94a3b8; text-align:center;">Nenhum empreendimento</td></tr>':''}
          </tbody>

        </table>
      </div>
    </div>
  </div>
</div>
<div style="background: #fff7ed; border-top: 3px solid #ea580c; color: #ea580c; padding: 4px 10px; border-radius: 6px; margin-bottom: 4px; font-weight: 800; font-size: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><i class="fas fa-trophy" style="margin-right: 8px; color: #ea580c;"></i> TOP 5 TÍTULOS COM MAIORES VALORES EM ATRASO POR OPERADOR</div>
<div class="op-grid">
  ${opSorted.filter(op=>op.customers.length>0).map(op=>{
    op.customers.sort((a,b)=>b.value-a.value);
    const top5=op.customers.slice(0,5);
    const totalTop5 = top5.reduce((sum, c) => sum + c.value, 0);
    return `<div class="op-card"><div class="op-head">${op.name.split(' ').slice(0,2).join(' ')}</div><table><thead><tr><th style="text-align:left">TÍTULO</th><th style="text-align:left">CLIENTE</th><th style="text-align:right">VALOR</th></tr></thead><tbody>${top5.map(c=>`<tr><td style="text-align:left">${c.title || '-'}</td><td style="text-align:left">${c.name.split(' ').slice(0,3).join(' ')}</td><td>${fmtMoneyNoRs(c.value)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2" style="text-align:left;font-weight:800;border-top:1px solid #ea580c;color:#ea580c;padding-top:4px;">Total</td><td style="font-weight:800;color:#ea580c;border-top:1px solid #ea580c;padding-top:4px;text-align:right;">${fmtMoneyNoRs(totalTop5)}</td></tr></tfoot></table></div>`;
  }).join('')}
</div>
<div style="background: #fff7ed; border-bottom: 3px solid #ea580c; padding: 4px 10px; border-radius: 6px; margin-top: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); height: 8px;"></div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert("Navegador bloqueou a abertura da nova aba! Por favor, libere os pop-ups.");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  return {
    render,
    salvarPosicaoHoje,
    gerarRelatorioDiarioPdf,
    paint,
    aplicarFiltros,
    limparFiltros
  };
})();
window.DashboardInadimplencia = DashboardInadimplencia;
