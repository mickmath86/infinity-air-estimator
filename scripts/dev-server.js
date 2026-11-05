const fs = require('fs');
const http = require('http');
const path = require('path');
const pricebook = require('../api/pricebook');
const housecall = require('../api/create-housecall-estimate');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function adapter(res) {
  return {
    setHeader(key, value) { res.setHeader(key, value); return this; },
    status(code) { res.statusCode = code; return this; },
    json(body) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    },
    end(body) { res.end(body); }
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/pricebook') return pricebook(req, adapter(res));
  if (url.pathname === '/api/create-housecall-estimate') {
    const response = adapter(res);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return response.status(204).end();
    if (!process.env.HOUSECALL_PRO_API_KEY || !process.env.GHL_WEBHOOK_URL) {
      return response.status(201).json({ ok: true, preview: true, customerId: null, estimateId: null });
    }
    req.body = await readBody(req);
    return housecall(req, response);
  }

  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Infinity Air estimator at http://localhost:${port}`);
  if (!process.env.PRICEBOOK_SHEET_CSV_URL) console.log('PRICEBOOK_SHEET_CSV_URL is not set. The price book API will serve data/pricebook.csv.');
  if (!process.env.HOUSECALL_PRO_API_KEY || !process.env.GHL_WEBHOOK_URL) console.log('Housecall Pro or GHL is not configured. Form submits stay on this computer and are marked preview.');
});
