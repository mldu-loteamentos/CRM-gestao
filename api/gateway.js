/* Uma única função da Vercel. /api/sienge-proxy, /api/scod-proxy e as demais
   continuam no mesmo endereço; o rewrite manda tudo para cá. O código fica em api/_lib. */
const rotas = {
  "sienge-proxy": require("./_lib/sienge-proxy"),
  "sienge-builder-proxy": require("./_lib/sienge-builder-proxy"),
  "sync-customers": require("./_lib/sync-customers"),
  "cvcrm-proxy": require("./_lib/cvcrm-proxy"),
  "scod-proxy": require("./_lib/scod-proxy"),
  "clicksign": require("./_lib/clicksign"),
  "proxy-download": require("./_lib/proxy-download"),
  "bcb-sgs": require("./_lib/bcb-sgs"),
  "cnpj": require("./_lib/bcb-sgs"),
  "controle-comissao": require("./_lib/controle-comissao"),
  "participacoes": require("./_lib/participacoes"),
  "morning-warmup": require("./_lib/morning-warmup"),
  "caucao-batimento": require("./_lib/morning-warmup"),
  "estoque-batimento": require("./_lib/estoque-batimento")
};

module.exports.config = {
  api: { bodyParser: false }
};

function ler(req) {
  const raw = String(req.url || "");
  const q = raw.indexOf("?");
  const itens = q < 0 ? [] : raw.slice(q + 1).split("&").filter(Boolean);
  let caminho = "";
  const resto = [];
  itens.forEach((item) => {
    const eq = item.indexOf("=");
    const key = decodeURIComponent((eq < 0 ? item : item.slice(0, eq)).replace(/\+/g, " "));
    const val = eq < 0 ? "" : item.slice(eq + 1);
    if (key === "path" && !caminho) caminho = decodeURIComponent(val.replace(/\+/g, " "));
    else resto.push(item);
  });
  if (!caminho && req.query && req.query.path) {
    caminho = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path);
  }
  return { caminho, busca: resto.length ? "?" + resto.join("&") : "" };
}

module.exports = async function handler(req, res) {
  const { caminho, busca } = ler(req);
  const pedacos = String(caminho || "").split("/").filter(Boolean);
  const nome = pedacos[0] || "";
  const fn = rotas[nome];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Rota não encontrada." }));
    return;
  }
  const sub = pedacos.slice(1).join("/");
  req.url = "/api/" + nome + (sub ? "/" + sub : "") + busca;
  return fn(req, res);
};
