const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { SIENGE_URL, PERFIL_DIR, GRAVACOES_DIR, CANAL } = require("./config");

const dois = (n) => String(n).padStart(2, "0");
const d = new Date();
const nome = `lote-${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}.js`;
fs.mkdirSync(GRAVACOES_DIR, { recursive: true });
const saida = path.join(GRAVACOES_DIR, nome);

console.log("");
console.log("GRAVAÇÃO DO PROCESSO NO SIENGE");
console.log("1. Na janela do Sienge, faça o caminho completo: abrir a tela de lote,");
console.log("   escolher a conta, selecionar os títulos, gerar o lote e aprovar.");
console.log("2. Tudo o que você fizer é real no Sienge (use um lote que precisa ser pago mesmo).");
console.log("3. Não digite senha durante a gravação. Se pedir login, feche e rode \"Entrar no Sienge\" antes.");
console.log("4. Ao terminar, feche o navegador. A gravação é salva em:");
console.log("   " + saida);
console.log("");

const args = [
  "playwright", "codegen",
  "--channel", CANAL,
  "--user-data-dir", PERFIL_DIR,
  "--target", "javascript",
  "-o", saida,
  SIENGE_URL,
];
const proc = spawn("npx", args, { cwd: __dirname, stdio: "inherit", shell: true });
proc.on("exit", (code) => {
  if (fs.existsSync(saida)) console.log("\nGravação salva: " + saida);
  else console.log("\nNenhuma gravação foi salva.");
  process.exit(code || 0);
});
