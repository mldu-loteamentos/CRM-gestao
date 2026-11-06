/* Lembrete do cartão de ponto, só para israel@mouraleite.com.br.
   Sexta: checar pendências. Dia 15 (ou o próximo dia útil): validar o fechamento. */
const AlertaPonto = {
  EMAIL: "israel@mouraleite.com.br",

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  parse(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0, 0);
  },

  hoje() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return this.iso(d);
  },

  addDias(iso, n) {
    const d = this.parse(iso);
    d.setDate(d.getDate() + (Number(n) || 0));
    return this.iso(d);
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  },

  ehFeriado(iso) {
    if (window.EscalaHomeOffice && typeof window.EscalaHomeOffice.ehFeriado === "function") {
      return window.EscalaHomeOffice.ehFeriado(iso);
    }
    return false;
  },

  ehDiaUtil(iso) {
    const dia = this.parse(iso).getDay();
    if (dia === 0 || dia === 6) return false;
    return !this.ehFeriado(iso);
  },

  usuario() {
    let u = window.AppState && window.AppState.currentUser;
    if (!u) {
      try { u = JSON.parse(localStorage.getItem("crm_logged_user") || "null"); } catch (e) { u = null; }
    }
    const imp = typeof window.crmImpersonacaoAtual === "function" ? window.crmImpersonacaoAtual() : null;
    return imp || u || null;
  },

  ehIsrael() {
    const u = this.contaReal();
    return !!(u && String(u.email || "").toLowerCase() === this.EMAIL);
  },

  /* Sexta desta semana, ou a sexta que já passou se hoje for sábado ou os dias seguintes até a próxima. */
  sextaDoCiclo(hoje) {
    const dia = this.parse(hoje).getDay();
    const desde = dia >= 5 ? dia - 5 : dia + 2;
    return this.addDias(hoje, -desde);
  },

  diaFechamento(ano, mes) {
    let d = ano + "-" + String(mes).padStart(2, "0") + "-15";
    let guarda = 0;
    while (!this.ehDiaUtil(d) && guarda < 14) {
      d = this.addDias(d, 1);
      guarda += 1;
    }
    return d;
  },

  /* O fechamento deste mês, depois que o dia 15 (ou o próximo dia útil) chegou. */
  fechamentoAberto(hoje) {
    const p = String(hoje).split("-");
    const dia = this.diaFechamento(Number(p[0]), Number(p[1]));
    return hoje >= dia ? dia : "";
  },

  periodoDoFechamento(dia) {
    const p = String(dia).split("-");
    let ano = Number(p[0]);
    let mes = Number(p[1]);
    if (Number(p[2]) < 15) {
      mes -= 1;
      if (mes < 1) { mes = 12; ano -= 1; }
    }
    const prevMes = mes === 1 ? 12 : mes - 1;
    const prevAno = mes === 1 ? ano - 1 : ano;
    const ini = prevAno + "-" + String(prevMes).padStart(2, "0") + "-15";
    const fim = ano + "-" + String(mes).padStart(2, "0") + "-14";
    return { ini: ini, fim: fim };
  },

  _visto: {},

  contaReal() {
    const u = window.AppState && window.AppState.currentUser;
    if (u && u.email) return u;
    try { return JSON.parse(localStorage.getItem("crm_logged_user") || "null"); } catch (e) { return null; }
  },

  chave(tipo, dia) {
    return "crm_ponto_" + tipo + "_" + this.EMAIL + "_" + dia;
  },

  jaCiente(tipo, dia) {
    if (!dia) return false;
    if (this._visto[tipo + ":" + dia]) return true;
    const k = this.chave(tipo, dia);
    try { if (localStorage.getItem(k) === "ciente") return true; } catch (e) {}
    try { if (sessionStorage.getItem(k) === "ciente") return true; } catch (e) {}
    return false;
  },

  marcar(tipo, dia) {
    if (!dia) return;
    this._visto[tipo + ":" + dia] = true;
    const k = this.chave(tipo, dia);
    const gravar = (store) => {
      try {
        store.setItem(k, "ciente");
        return store.getItem(k) === "ciente";
      } catch (e) {
        return false;
      }
    };
    if (!gravar(localStorage)) {
      if (typeof window.ensureCrmStorageRoom === "function") {
        try { window.ensureCrmStorageRoom(); } catch (e) {}
      }
      const native = window._nativeLocalStorageSetItem;
      if (typeof native === "function") {
        try { native.call(localStorage, k, "ciente"); } catch (e) {}
      } else {
        gravar(localStorage);
      }
    }
    gravar(sessionStorage);
  },

  avisosDe(hoje) {
    const sexta = this.sextaDoCiclo(hoje);
    const mes = this.fechamentoAberto(hoje);
    return {
      sexta: sexta && !this.jaCiente("sexta", sexta) ? sexta : "",
      mes: mes && !this.jaCiente("mes", mes) ? mes : ""
    };
  },

  verificar() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this.ehIsrael()) {
      const avisos = this.avisosDe(this.hoje());
      if ((avisos.sexta || avisos.mes) && !document.getElementById("alerta-ponto")) this.abrir(avisos);
    }
    this.agendar();
  },

  agendar() {
    if (!this.ehIsrael()) return;
    const prox = new Date();
    prox.setDate(prox.getDate() + 1);
    prox.setHours(8, 0, 0, 0);
    this._timer = setTimeout(() => this.verificar(), Math.max(1000, prox.getTime() - Date.now()));
  },

  abrir(avisos) {
    const partes = [];
    if (avisos.sexta) partes.push("Cheque as pendências no cartão de ponto do time.");
    if (avisos.mes) {
      const per = this.periodoDoFechamento(avisos.mes);
      partes.push("Valide o ponto do time. O mês fechou de " + this.dataBr(per.ini) + " até " + this.dataBr(per.fim) + ".");
    }
    if (!partes.length) return;
    const titulo = avisos.mes && !avisos.sexta
      ? "Validar o ponto do time"
      : (avisos.sexta && !avisos.mes ? "Pendências no cartão de ponto" : "Ponto do time");
    const overlay = document.createElement("div");
    overlay.id = "alerta-ponto";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-labelledby", "alerta-ponto-titulo");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483003;display:flex;align-items:center;justify-content:center;background:rgba(12,41,29,0.55);padding:16px;";
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;width:100%;max-width:480px;box-shadow:0 18px 40px rgba(0,0,0,0.22);border:1px solid rgba(16,84,54,0.12);padding:22px 22px 18px;font-family:inherit;">
      <div id="alerta-ponto-titulo" style="font-size:0.95rem;font-weight:800;color:#105436;margin-bottom:10px;">${titulo}</div>
      ${partes.map((t) => `<p style="margin:0 0 10px;font-size:0.92rem;color:#1e293b;line-height:1.45;">${t}</p>`).join("")}
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button type="button" id="alerta-ponto-ciente" style="padding:8px 16px;border-radius:8px;border:0;background:#105436;color:#fff;font-weight:800;cursor:pointer;">Ciente</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#alerta-ponto-ciente").addEventListener("click", () => {
      if (avisos.sexta) this.marcar("sexta", avisos.sexta);
      if (avisos.mes) this.marcar("mes", avisos.mes);
      overlay.remove();
    });
  }
};

window.AlertaPonto = AlertaPonto;

document.addEventListener("DOMContentLoaded", function () {
  let tentativas = 0;
  const tentar = function () {
    tentativas += 1;
    const u = window.AppState && window.AppState.currentUser;
    if (!u) {
      if (tentativas < 20) setTimeout(tentar, 1000);
      return;
    }
    if (window.AlertaPonto) window.AlertaPonto.verificar();
  };
  setTimeout(tentar, 2600);
});
