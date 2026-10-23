const fs = require("fs");
const vm = require("vm");
const code = fs.readFileSync("empresas.js", "utf8");
let html = "";
const sandbox = {
  console,
  window: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  document: {
    getElementById(id) {
      if (id === "empresas-content") return { innerHTML: "", set innerHTML(v) { html = v; } };
      if (id === "empresas-scroll") return { scrollTop: 0, isConnected: true };
      return null;
    },
    querySelector() { return null; },
    addEventListener() {}
  }
};
sandbox.requestAnimationFrame = function (fn) { fn(); };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code + "\n;globalThis.EmpresasApp = EmpresasApp; globalThis.EmpresasState = EmpresasState;", sandbox);
const app = sandbox.EmpresasApp;
const state = sandbox.EmpresasState;
state.loading = false;
state.companies = [{ id: 1, name: "MOURA LEITE", cnpj: "01" }, { id: 6, name: "ARACARI", cnpj: "26" }];
state.customFields = {
  1: { company_id: 1, nome_usual: "MLDU", percentual_mldu: 100, percentual_liquido_mldu: 80 },
  6: { company_id: 6, nome_usual: "ARAÇARI SPE", percentual_mldu: 50, spe_socios: 1 }
};
app.render();
if (!html.includes("% Consolidação") || !html.includes("% Líquido MLDU") || html.includes("% MLDU")) {
  console.log("HEADER FAIL");
  process.exit(1);
}
const i1 = html.indexOf("% Consolidação");
const i2 = html.indexOf("% Líquido MLDU");
if (!(i1 > 0 && i2 > i1)) {
  console.log("ORDER FAIL", i1, i2);
  process.exit(1);
}
if (!html.includes('data-field="percentual_liquido_mldu"') || !html.includes(">80<") && !html.includes('value="80"')) {
  console.log("VALUE FAIL");
  console.log(html.includes('value="80"'), html.includes("80"));
  process.exit(1);
}
const locked = html.split('data-company-id="6"')[1] || "";
if (!locked.includes("disabled") || !locked.includes('data-field="percentual_liquido_mldu"')) {
  console.log("LOCK FAIL");
  process.exit(1);
}
app.saveInline(1, "percentual_liquido_mldu", "27,75");
if (Number(state.customFields[1].percentual_liquido_mldu) !== 27.75) {
  console.log("SAVE FAIL", state.customFields[1].percentual_liquido_mldu);
  process.exit(1);
}
if (Number(state.customFields[1].percentual_mldu) !== 100) {
  console.log("CONS FAIL", state.customFields[1].percentual_mldu);
  process.exit(1);
}
console.log("ok");
