/* Uma única função da Vercel. As rotas antigas (/api/sienge-proxy, /api/scod-proxy, …)
   chegam aqui pelo rewrite e o código fica em api/_lib, que a Vercel não conta. */
const rotas = {
  "sienge-proxy": require("../_lib/sienge-proxy"),
  "sienge-builder-proxy": require("../_lib/sienge-builder-proxy"),
  "sync-customers": require("../_lib/sync-customers"),
  "cvcrm-proxy": require("../_lib/cvcrm-proxy"),
  "scod-proxy": require("../_lib/scod-proxy"),
  "clicksign": require("../_lib/clicksign"),
  "proxy-download": require("../_lib/proxy-download"),
  "bcb-sgs": require("../_lib/bcb-sgs"),
  "cnpj": require("../_lib/bcb-sgs"),
  "controle-comissao": require("../_lib/controle-comissao"),
  "participacoes": require("../_lib/participacoes"),
  "morning-warmup": require("../_lib/morning-warmup"),
  "caucao-batimento": require("../_lib/morning-warmup"),
  "estoque-batimento": require("../_lib/estoque-batimento")
};

module.exports.config = {
  api: { bodyParser: false }
};

function partes(req) {
  const slug = req.query && req.query.path;
  if (Array.isArray(slug)) return slug.map(String).filter(Boolean);
  if (slug) return [String(slug)];
  return [];
}

function busca(url) {
  const raw = String(url || "");
  const q = raw.indexOf("?");
  if (q < 0) return "";
  const itens = raw.slice(q + 1).split("&").filter((p) => {
    const key = decodeURIComponent((p.split("=")[0] || "").replace(/\+/g, " "));
    return key !== "path";
  });
  return itens.length ? "?" + itens.join("&") : "";
}

module.exports = async function handler(req, res) {
  const pedacos = partes(req);
  const nome = pedacos[0] || "";
  const fn = rotas[nome];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Rota não encontrada." }));
    return;
  }
  const resto = pedacos.slice(1).join("/");
  req.url = "/api/" + nome + (resto ? "/" + resto : "") + busca(req.url);
  return fn(req, res);
};
