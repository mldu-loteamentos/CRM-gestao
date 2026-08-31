window.MlEmpresaFilter = {
  adapters: {},

  bind(id, adapter) {
    this.adapters[id] = adapter || null;
  },

  toggleOpen(id) {
    const a = this.adapters[id];
    if (a && typeof a.toggleOpen === "function") a.toggleOpen();
  },

  setQuery(id, q) {
    const a = this.adapters[id];
    if (a && typeof a.setQuery === "function") a.setQuery(q);
  },

  toggleId(id, itemId, on) {
    const a = this.adapters[id];
    if (a && typeof a.toggleId === "function") a.toggleId(itemId, on);
  },

  selectAll(id) {
    const a = this.adapters[id];
    if (a && typeof a.selectAll === "function") a.selectAll();
  },

  selectNone(id) {
    const a = this.adapters[id];
    if (a && typeof a.selectNone === "function") a.selectNone();
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  formatItemLabel(it) {
    if (it && it.label) return String(it.label);
    const id = it && it.id != null ? String(it.id) : "";
    const name = String((it && (it.name || it.legalName)) || "").toUpperCase();
    return id ? `${id} - ${name}` : name;
  },

  buttonLabel(items, selectedIds, emptyMeansAll, countMode) {
    const all = items || [];
    const sel = (selectedIds || []).map(String);
    const n = sel.length;
    if (!all.length) return "Nenhuma empresa";
    if (countMode) {
      if (!n) return emptyMeansAll ? `Todos (${all.length})` : "Selecione empresas";
      if (n === all.length) return `Todos (${all.length})`;
      return `${n} de ${all.length} empresas`;
    }
    if (!n) return emptyMeansAll ? "Todos" : "Selecione empresas";
    if (n === all.length) return "Todos";
    if (n === 1) {
      const it = all.find((x) => String(x.id) === sel[0]);
      return it ? this.formatItemLabel(it) : "1 selecionado";
    }
    return n + " selecionado(s)";
  },

  listHtml(opts) {
    const items = opts.items || [];
    const selected = new Set((opts.selectedIds || []).map(String));
    const q = String(opts.query || "").toLowerCase().trim();
    const filtered = items.filter((it) => {
      if (!q) return true;
      const blob = `${it.id} ${it.label || ""} ${it.name || ""}`.toLowerCase();
      return blob.includes(q);
    });
    if (!filtered.length) {
      return `<div class="ml-emp-filter-empty">Nenhuma empresa com esse nome.</div>`;
    }
    return filtered.map((it) => {
      const itemId = String(it.id);
      const on = selected.has(itemId);
      return `<label class="ml-emp-filter-item">
        <input type="checkbox" ${on ? "checked" : ""} onchange="MlEmpresaFilter.toggleId(${JSON.stringify(opts.id)}, ${JSON.stringify(itemId)}, this.checked)">
        <span>${this.esc(this.formatItemLabel(it))}</span>
      </label>`;
    }).join("");
  },

  html(opts) {
    const id = opts.id;
    const items = opts.items || [];
    const open = !!opts.open;
    const label = opts.label || "Empresas";
    const extra = opts.extraClass ? ` ${opts.extraClass}` : "";
    const btn = this.buttonLabel(items, opts.selectedIds, !!opts.emptyMeansAll, !!opts.countMode);
    return `<div class="ml-emp-filter${extra}${open ? " is-open" : ""}" id="${this.esc(id)}" onmousedown="event.stopPropagation()">
      <div class="ml-emp-filter-label">${this.esc(label)}</div>
      <button type="button" class="ml-emp-filter-btn" onclick="event.preventDefault();event.stopPropagation();${opts.toggleJs || `MlEmpresaFilter.toggleOpen(${JSON.stringify(id)})`}">
        <span>${this.esc(btn)}</span>
        <i data-lucide="chevron-down" style="width:16px;height:16px;flex-shrink:0;pointer-events:none;"></i>
      </button>
      <div class="ml-emp-filter-panel" id="${this.esc(id)}-panel">
        <div class="ml-emp-filter-search">
          <input id="${this.esc(id)}-search" type="text" placeholder="Buscar..." value="${this.esc(opts.query || "")}"
            onclick="event.stopPropagation()"
            oninput="MlEmpresaFilter.setQuery(${JSON.stringify(id)}, this.value)">
        </div>
        <div class="ml-emp-filter-actions">
          <button type="button" class="ml-emp-filter-all" onclick="event.stopPropagation();MlEmpresaFilter.selectAll(${JSON.stringify(id)})">Marcar Todos</button>
          <button type="button" class="ml-emp-filter-none" onclick="event.stopPropagation();MlEmpresaFilter.selectNone(${JSON.stringify(id)})">Desmarcar Todos</button>
        </div>
        <div class="ml-emp-filter-list" id="${this.esc(id)}-list">${this.listHtml(opts)}</div>
      </div>
    </div>`;
  }
};
