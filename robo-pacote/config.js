const path = require("path");

const PERFIS_DIR = path.join(__dirname, "perfis");

module.exports = {
  SIENGE_URL: "https://mouraleite.sienge.com.br/sienge/8/index.html",
  // Sessão do Sienge fica só nesta máquina (login feito pelo usuário, nunca senha no código).
  PERFIL_DIR: path.join(__dirname, "perfil-sienge"),
  PERFIS_DIR,
  GRAVACOES_DIR: path.join(__dirname, "gravacoes"),
  LOGS_DIR: path.join(__dirname, "logs"),
  TOKEN_FILE: path.join(__dirname, "robo-token.txt"),
  CANAL: "msedge",
  // Só escuta nesta máquina; o Integra aberto no navegador deste computador é quem chama.
  HOST: "127.0.0.1",
  PORTA: 7788,
  ORIGENS: [
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  ],
  // Só o endereço oficial do Integra recebe o código do robô sem digitar; o navegador não deixa outro site fingir esta origem.
  ORIGENS_PAREAMENTO: [
    /^https:\/\/crm-gestao\.vercel\.app$/i,
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  ],
  // Código de saída quando já existe um robô ligado (o serviço automático não tenta de novo).
  SAIDA_JA_ABERTO: 3,
  // Mesmos domínios aceitos no login do Integra.
  EMAIL_OK: /^[a-z0-9._%+-]+@mouraleite\.com(\.br)?$/i,
  // Cada usuário do Integra tem o próprio navegador do robô: o Sienge sempre roda com o login dele.
  perfilDoUsuario(email) {
    return path.join(PERFIS_DIR, String(email).toLowerCase().replace(/[^a-z0-9._-]/g, "_"));
  },
};
