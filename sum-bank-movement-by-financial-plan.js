#!/usr/bin/env node
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const DEFAULT_API_URL = 'https://api.sienge.com.br/mouraleite/public/api/bulk-data/v1/bank-movement?startDate=2025-01-01&endDate=2026-05-30&selectionType=M';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    url: DEFAULT_API_URL,
    file: null,
    groupBy: 'financialCategoryId',
    includeName: true,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      result.file = args[++i];
    } else if (arg === '--url' || arg === '-u') {
      result.url = args[++i];
    } else if (arg === '--group-by' || arg === '-g') {
      result.groupBy = args[++i];
    } else if (arg === '--no-name') {
      result.includeName = false;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return result;
}

function printHelp() {
  console.log(`Usage: node sum-bank-movement-by-financial-plan.js [options]

Options:
  --file, -f <path>          Read JSON from a local file instead of calling the API
  --url, -u <url>            URL to fetch (default is the provided Bulk Data endpoint)
  --group-by, -g <field>     Group by this field (default: financialCategoryId)
  --no-name                  Do not append financialCategoryName to the label
  --verbose, -v              Print more debug details
  --help, -h                 Show this message

Default endpoint:
  ${DEFAULT_API_URL}
`);
}

function loadJsonFromFile(filePath) {
  const resolved = path.resolve(filePath);
  const content = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(content);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    };

    if (parsedUrl.username || parsedUrl.password) {
      options.headers.Authorization = 'Basic ' + Buffer.from(`${parsedUrl.username}:${parsedUrl.password}`).toString('base64');
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Falha ao analisar JSON da resposta: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

function normalizeAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/[\.]/g, '').replace(/,/g, '.');
    const num = Number(normalized);
    return Number.isNaN(num) ? 0 : num;
  }
  return Number(value) || 0;
}

function recordLabel(record, groupBy, includeName) {
  const id = record[groupBy] != null ? String(record[groupBy]) : 'UNKNOWN';
  if (!includeName) return id;
  const nameKey = groupBy === 'financialCategoryId'
    ? 'financialCategoryName'
    : groupBy === 'financialCategoryName'
      ? 'financialCategoryName'
      : 'financialCategoryName';
  const name = record[nameKey] || '';
  return name ? `${id} — ${name}` : id;
}

function aggregateRecords(records, groupBy, includeName) {
  const totals = new Map();
  let overallTotal = 0;

  for (const item of records) {
    const category = Array.isArray(item.financialCategories) && item.financialCategories.length > 0
      ? item.financialCategories[0]
      : item;

    const label = recordLabel(category, groupBy, includeName);
    const amount = normalizeAmount(item.bankMovementAmount);
    overallTotal += amount;
    const current = totals.get(label) || 0;
    totals.set(label, current + amount);
  }

  return { totals, overallTotal };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function main() {
  const options = parseArgs();
  let payload;

  if (options.file) {
    payload = loadJsonFromFile(options.file);
  } else {
    console.log(`Buscando dados de: ${options.url}`);
    payload = await fetchJson(options.url);
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('O JSON deve conter um objeto com a propriedade "data" como array.');
  }

  const { totals, overallTotal } = aggregateRecords(payload.data, options.groupBy, options.includeName);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\nTotal geral: ${formatCurrency(overallTotal)}`);
  console.log('\nSoma por plano financeiro:');
  for (const [label, amount] of sorted) {
    console.log(`- ${label}: ${formatCurrency(amount)}`);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message || err);
  process.exit(1);
});
