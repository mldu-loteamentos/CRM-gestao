/* Validação da forma de pagamento programada nos títulos a pagar do Sienge.
   Boleto bancário: código de barras (44) e linha digitável (47) com dígitos verificadores, valor e vencimento.
   Boleto de concessionária/arrecadação: código (44) e linha (48) iniciados por 8, com DV módulo 10 ou 11.
   Também aponta instrução de desconto (data limite de desconto, desconto no título ou na observação). */
window.BoletoCheck = {
  digits(v) {
    return String(v == null ? "" : v).replace(/\D/g, "");
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "—";
  },

  hoje() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  mod10(num) {
    let soma = 0;
    let peso = 2;
    for (let i = num.length - 1; i >= 0; i--) {
      let p = Number(num[i]) * peso;
      if (p > 9) p = Math.floor(p / 10) + (p % 10);
      soma += p;
      peso = peso === 2 ? 1 : 2;
    }
    return (10 - (soma % 10)) % 10;
  },

  somaMod11(num) {
    let soma = 0;
    let peso = 2;
    for (let i = num.length - 1; i >= 0; i--) {
      soma += Number(num[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    return soma;
  },

  dvBancario(cod43) {
    const dv = 11 - (this.somaMod11(cod43) % 11);
    return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
  },

  dvArrecadacao(num, modulo) {
    if (modulo === 10) return this.mod10(num);
    const r = this.somaMod11(num) % 11;
    if (r === 0 || r === 1) return 0;
    if (r === 10) return 1;
    return 11 - r;
  },

  /** Fator de vencimento → data mais próxima da referência (o fator recomeça em 1000 a cada 9000 dias desde 22/02/2025). */
  dataDoFator(fator, ref) {
    const f = Number(fator);
    if (!f) return "";
    const base = Date.UTC(1997, 9, 7);
    const alvo = ref ? Date.parse(String(ref).slice(0, 10) + "T00:00:00Z") : Date.now();
    const candidatos = [f];
    for (let ciclo = 0; ciclo < 3; ciclo++) candidatos.push(10000 + ciclo * 9000 + (f - 1000));
    let melhor = null;
    candidatos.forEach((dias) => {
      const t = base + dias * 86400000;
      if (!melhor || Math.abs(t - alvo) < Math.abs(melhor - alvo)) melhor = t;
    });
    return new Date(melhor).toISOString().slice(0, 10);
  },

  linhaBancariaParaCodigo(l) {
    return l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
  },

  formatarLinha(l) {
    if (l.length === 47) return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
    if (l.length === 48) return [0, 12, 24, 36].map((i) => `${l.slice(i, i + 11)}-${l[i + 11]}`).join(" ");
    return l;
  },

  /** Lê os campos do Sienge (payment-information) e devolve código, linha e problemas de formato. */
  ler(payment) {
    const d = (payment && payment.data) || {};
    const kind = payment && payment.kind;
    const pick = (...ks) => {
      for (const k of ks) { const v = this.digits(d[k]); if (v) return v; }
      return "";
    };
    if (kind === "boleto-concessionaria" || kind === "boleto-tax") {
      return {
        tipo: "arrecadacao",
        codigo: pick("boletoConcessionariaBarCodeNumber", "taxBarCodeNumber", "barCode", "barCodeNumber"),
        linha: pick("boletoConcessionariaManualBarCodeNumber", "taxManualBarCodeNumber", "digitableNumber", "digitableLine")
      };
    }
    return {
      tipo: "bancario",
      codigo: pick("boletoBancarioBarCodeNumber", "barCode", "barCodeNumber"),
      linha: pick("boletoBancarioManualBarCodeNumber", "digitableNumber", "digitableLine")
    };
  },

  ehBoleto(payment) {
    return !!payment && /^boleto-/.test(String(payment.kind || ""));
  },

  /**
   * ctx: { valor, vencimento, descontoTitulo }
   * Retorna { nivel: "ok"|"erro"|"aviso"|"info"|"sem", forma, resumo, erros[], avisos[], infos[], desconto, linhaFmt, valorBoleto, vencBoleto }.
   */
  validar(payment, ctx) {
    ctx = ctx || {};
    const out = { nivel: "ok", forma: "", resumo: "", erros: [], avisos: [], infos: [], desconto: false, linhaFmt: "", valorBoleto: null, vencBoleto: "" };
    if (!payment || !payment.kind) {
      out.nivel = "sem";
      out.forma = "Sem forma";
      out.resumo = "Forma de pagamento não informada no título";
      out.avisos.push("O título não tem forma de pagamento programada no Sienge.");
      return out;
    }
    const d = payment.data || {};
    if (!this.ehBoleto(payment)) {
      out.nivel = "info";
      out.forma = payment.kind === "pix" ? "PIX" : (payment.kind === "bank-transfer" ? "Transferência" : String(payment.kind));
      out.resumo = out.forma;
      return out;
    }
    const r = this.ler(payment);
    out.forma = r.tipo === "arrecadacao" ? "Boleto de concessionária" : "Boleto";
    let codigo = r.codigo;
    if (!codigo && !r.linha) {
      out.erros.push("Boleto sem código de barras e sem linha digitável.");
    } else if (r.tipo === "bancario") {
      if (r.linha) {
        if (r.linha.length !== 47) out.erros.push(`Linha digitável com ${r.linha.length} dígitos (o boleto bancário tem 47).`);
        else {
          const campos = [[0, 9], [10, 20], [21, 31]];
          campos.forEach(([ini, fim], i) => {
            if (this.mod10(r.linha.slice(ini, fim)) !== Number(r.linha[fim])) out.erros.push(`Dígito verificador do campo ${i + 1} da linha digitável não confere.`);
          });
          const daLinha = this.linhaBancariaParaCodigo(r.linha);
          if (codigo && codigo.length === 44 && codigo !== daLinha) out.erros.push("Linha digitável e código de barras não são do mesmo boleto.");
          if (!codigo) codigo = daLinha;
          out.linhaFmt = this.formatarLinha(r.linha);
        }
      }
      if (codigo) {
        if (codigo.length !== 44) out.erros.push(`Código de barras com ${codigo.length} dígitos (o correto são 44).`);
        else {
          if (this.dvBancario(codigo.slice(0, 4) + codigo.slice(5)) !== Number(codigo[4])) out.erros.push("Dígito verificador geral do código de barras não confere.");
          if (codigo[3] !== "9") out.avisos.push("Moeda do boleto diferente de real.");
          const fator = codigo.slice(5, 9);
          out.valorBoleto = Number(codigo.slice(9, 19)) / 100;
          out.vencBoleto = this.dataDoFator(fator, ctx.vencimento);
          if (!out.linhaFmt) {
            const c = codigo;
            const l = c.slice(0, 4) + c.slice(19, 24);
            const l2 = c.slice(24, 34);
            const l3 = c.slice(34, 44);
            out.linhaFmt = this.formatarLinha(l + this.mod10(l) + l2 + this.mod10(l2) + l3 + this.mod10(l3) + c[4] + c.slice(5, 19));
          }
        }
      }
    } else {
      if (r.linha) {
        if (r.linha.length !== 48) out.erros.push(`Linha digitável com ${r.linha.length} dígitos (o boleto de concessionária tem 48).`);
        else {
          const mod = ["6", "7"].includes(r.linha[2]) ? 10 : 11;
          for (let i = 0; i < 4; i++) {
            const bloco = r.linha.slice(i * 12, i * 12 + 11);
            if (this.dvArrecadacao(bloco, mod) !== Number(r.linha[i * 12 + 11])) out.erros.push(`Dígito verificador do bloco ${i + 1} da linha digitável não confere.`);
          }
          const daLinha = [0, 12, 24, 36].map((i) => r.linha.slice(i, i + 11)).join("");
          if (codigo && codigo.length === 44 && codigo !== daLinha) out.erros.push("Linha digitável e código de barras não são do mesmo boleto.");
          if (!codigo) codigo = daLinha;
          out.linhaFmt = this.formatarLinha(r.linha);
        }
      }
      if (codigo) {
        if (codigo.length !== 44 || codigo[0] !== "8") out.erros.push("Código de barras de concessionária inválido (deve ter 44 dígitos e começar com 8).");
        else {
          const ref = codigo[2];
          const mod = ["6", "7"].includes(ref) ? 10 : 11;
          if (this.dvArrecadacao(codigo.slice(0, 3) + codigo.slice(4), mod) !== Number(codigo[3])) out.erros.push("Dígito verificador geral do código de barras não confere.");
          if (ref === "6" || ref === "8") out.valorBoleto = Number(codigo.slice(4, 15)) / 100;
          else out.infos.push("O código traz valor de referência, não o valor a pagar.");
        }
      }
    }
    const valor = Number(ctx.valor);
    if (out.valorBoleto != null && Number.isFinite(valor) && valor > 0) {
      if (out.valorBoleto === 0) out.avisos.push("Boleto sem valor no código de barras: o valor será digitado na hora do pagamento.");
      else if (Math.abs(out.valorBoleto - valor) > 0.01) {
        const dif = out.valorBoleto - valor;
        out.erros.push(`Valor do boleto ${this.money(out.valorBoleto)} diferente do valor a pagar ${this.money(valor)} (${dif > 0 ? "+" : "−"}${this.money(Math.abs(dif))}).`);
      }
    }
    if (out.vencBoleto && ctx.vencimento && out.vencBoleto !== String(ctx.vencimento).slice(0, 10)) {
      out.avisos.push(`Vencimento no boleto ${this.dataBr(out.vencBoleto)} diferente do vencimento do título ${this.dataBr(ctx.vencimento)}.`);
    }
    const limite = String(d.discountDueDate || "").slice(0, 10);
    if (limite) {
      out.desconto = true;
      if (limite < this.hoje()) out.avisos.push(`Instrução de desconto até ${this.dataBr(limite)}: o prazo do desconto já passou.`);
      else out.infos.push(`Instrução de desconto: pagar até ${this.dataBr(limite)} para ter o desconto.`);
    }
    if (Number(ctx.descontoTitulo) > 0) {
      out.desconto = true;
      out.infos.push(`Título com desconto de ${this.money(ctx.descontoTitulo)} no Sienge.`);
    }
    if (/descont|abatim/i.test(String(d.notes || ""))) {
      out.desconto = true;
      out.infos.push("A observação do pagamento menciona desconto.");
    }
    if (out.erros.length) out.nivel = "erro";
    else if (out.avisos.length) out.nivel = "aviso";
    out.resumo = out.erros[0] || out.avisos[0] || (out.desconto ? `${out.forma} conferido · com desconto` : `${out.forma} conferido`);
    return out;
  },

  /** Selo curto para tabelas. */
  seloHtml(v) {
    if (!v) return `<span class="bchk bchk-wait">Conferindo…</span>`;
    const cls = { ok: "bchk-ok", erro: "bchk-erro", aviso: "bchk-aviso", info: "bchk-info", sem: "bchk-aviso" }[v.nivel] || "bchk-info";
    const txt = v.nivel === "ok" ? `${v.forma} ✓` : (v.nivel === "erro" ? `${v.forma}: erro` : (v.nivel === "sem" ? "Sem forma" : (v.nivel === "aviso" ? `${v.forma}: atenção` : v.forma)));
    const dica = [].concat(v.erros, v.avisos, v.infos).join("\n") || v.resumo;
    return `<span class="bchk ${cls}" title="${this.esc(dica)}">${this.esc(txt)}</span>${v.desconto ? ` <span class="bchk bchk-desc" title="${this.esc(v.infos.concat(v.avisos).filter((x) => /descont/i.test(x)).join("\n"))}">Desconto</span>` : ""}`;
  },

  /** Bloco completo para o resumo do título. */
  html(payment, ctx) {
    const v = this.validar(payment, ctx);
    const d = (payment && payment.data) || {};
    const lista = (itens, cor, ic) => itens.map((t) => `<p style="margin:4px 0 0;color:${cor};">${ic} ${this.esc(t)}</p>`).join("");
    const cab = v.nivel === "ok"
      ? `<p style="margin:6px 0 0;color:#105436;font-weight:700;">✓ Código de barras conferido: dígitos, valor${v.vencBoleto ? " e vencimento" : ""} batem com o título.</p>`
      : "";
    return `<p><strong>Forma:</strong> ${this.esc(v.forma)}</p>
      ${v.linhaFmt ? `<p><strong>Linha digitável:</strong> <span style="font-family:monospace;font-size:0.82rem;">${this.esc(v.linhaFmt)}</span></p>` : ""}
      ${v.valorBoleto != null ? `<p><strong>Valor no boleto:</strong> ${this.money(v.valorBoleto)}${v.vencBoleto ? ` · <strong>Vencimento no boleto:</strong> ${this.dataBr(v.vencBoleto)}` : ""}</p>` : ""}
      ${d.notes ? `<p><strong>Observação:</strong> ${this.esc(d.notes)}</p>` : ""}
      ${cab}
      ${lista(v.erros, "#b91c1c", "✗")}
      ${lista(v.avisos, "#c2410c", "!")}
      ${lista(v.infos, "#0f766e", "ℹ")}`;
  }
};
