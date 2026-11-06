const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { handlePricebook, CACHE_CONTROL, DOCUMENTED_PRICEBOOK_SHEET_URL, readSnapshot } = require('./api/pricebook');
const { loadPricebook, parseCsv, normalizePricebook, publicItem, parsePrice } = require('./estimator-model');
const config = require('./data/demo-config.js');

const silent = { warn() {}, log() {} };
const snapshotCsv = readSnapshot();
const fixedNow = () => new Date('2026-10-30T20:00:00.000Z');

function sheetCsv(marker) {
  const rows = ['category,uuid,name,description,price,cost'];
  for (let index = 1; index <= 12; index += 1) {
    rows.push(`Booking,sheet-${index},${index === 1 ? marker : `Service ${index}`},Visit,${80 + index},42.50`);
  }
  return rows.join('\n');
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

(async () => {
  assert.equal(DOCUMENTED_PRICEBOOK_SHEET_URL, 'https://docs.google.com/spreadsheets/d/1QXmjqCzqrBBnRqj6deCe5cR9qcVMWXGxzbxJLhplQGs/export?format=csv');
  assert.equal(DOCUMENTED_PRICEBOOK_SHEET_URL.includes('gid='), false);

  const marker = 'Sheet Only Marker Visit';
  const sheetUrl = DOCUMENTED_PRICEBOOK_SHEET_URL;
  let fetchOptions;
  const fromSheet = await loadPricebook({
    sheetUrl,
    fetchImpl: async (url, options) => {
      fetchOptions = options;
      assert.equal(url, sheetUrl);
      return response(200, sheetCsv(marker));
    },
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.deepEqual(fetchOptions, { redirect: 'follow' });
  assert.equal(fromSheet.source, 'sheet');
  assert.equal(fromSheet.fetchedAt, '2026-10-30T20:00:00.000Z');
  assert.equal(fromSheet.config.valueLineLabel, 'AC Pro (Value Line)');
  assert.equal(parsePrice('$5,100.00'), 5100);
  assert.equal(parsePrice('$4,050.00'), 4050);
  assert.equal(parsePrice('$5,200.00'), 5200);
  assert.equal(parsePrice('$700.00'), 700);
  assert.ok(fromSheet.items.some(item => item.name === marker));
  assert.equal(fromSheet.items.some(item => item.name === 'Bill Lewis Special'), false);
  assert.equal(JSON.stringify(fromSheet).includes('42.5'), false);
  assert.equal(JSON.stringify(fromSheet).includes('"cost"'), false);
  assert.ok(fromSheet.items.every(item => !Object.prototype.hasOwnProperty.call(item, 'cost')));

  const failedSheet = await loadPricebook({
    sheetUrl,
    fetchImpl: async () => { throw new Error('network down'); },
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.equal(failedSheet.source, 'snapshot');
  assert.ok(failedSheet.items.some(item => item.name === 'A/C Service Call'));
  assert.equal(failedSheet.items.some(item => item.name === marker), false);
  assert.equal(failedSheet.items.some(item => item.price === 0), false);
  assert.ok(failedSheet.items.some(item => item.price === null));

  const shortSheet = await loadPricebook({
    sheetUrl,
    fetchImpl: async () => response(200, 'category,uuid,name,description,price\nBooking,one,Only row,Visit,79'),
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.equal(shortSheet.source, 'snapshot');

  const htmlSheet = await loadPricebook({
    sheetUrl,
    fetchImpl: async () => response(200, '<html>Sign in</html>'),
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.equal(htmlSheet.source, 'snapshot');

  let called = false;
  const missingUrl = await loadPricebook({
    sheetUrl: '',
    fetchImpl: async () => { called = true; return response(200, sheetCsv(marker)); },
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.equal(called, false);
  assert.equal(missingUrl.source, 'snapshot');

  const localItems = normalizePricebook(parseCsv('category,uuid,name,description,price,cost\nAC Pro Gas Split Systems ,olit_1,Bronze 2 Ton Split System Gas,Installed,"$8,670.00",$42.50\n'));
  assert.equal(localItems[0].category, 'AC Pro Gas Split Systems');
  assert.equal(localItems[0].price, 8670);
  const published = publicItem(localItems[0]);
  assert.equal(published.cost, undefined);
  assert.equal(JSON.stringify(published).includes('42.5'), false);

  const res = mockRes();
  await handlePricebook({ method: 'GET' }, res, {
    sheetUrl: '',
    fetchImpl: fetch,
    snapshotCsv,
    config,
    now: fixedNow,
    logger: silent
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], CACHE_CONTROL);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
  assert.match(res.headers['cache-control'], /stale-while-revalidate=300/);
  assert.equal(res.body.source, 'snapshot');
  assert.equal(res.body.config.goldGasTierLabel, 'Gold');
  assert.equal(res.body.config.showRyanReviewCallouts, false);
  assert.equal(res.body.config.sizingReviewNote, undefined);
  assert.equal(res.body.config.tierReviewNote, undefined);
  assert.equal(res.body.config.notice, undefined);
  assert.equal(/pending Ryan|FOR RYAN/i.test(JSON.stringify(res.body.config)), false);
  assert.equal(res.body.config.valueLineLabel, 'AC Pro (Value Line)');
  assert.equal(res.body.config.ductworkPerRun.pricePerRun, 450);
  assert.match(res.body.config.quoteDisclaimer, /not a binding quote/i);
  assert.match(res.body.config.quoteDisclaimer, /not a contract/i);
  assert.equal(JSON.stringify(res.body).includes('"cost"'), false);

  const denied = mockRes();
  await handlePricebook({ method: 'POST' }, denied, { logger: silent });
  assert.equal(denied.statusCode, 405);

  const banned = new RegExp(['supa' + 'base.co', 'data-client-' + 'key', 'estimator-' + 'public', 'rtlhld' + 'humcmzgbvkqmnm'].join('|'), 'i');
  function walk(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, files);
      else if (/\.(js|html|json|csv)$/.test(entry.name)) files.push(full);
    }
    return files;
  }
  for (const file of walk(__dirname)) assert.equal(banned.test(fs.readFileSync(file, 'utf8')), false, file);

  console.log('Price book fetch, fallback, and cache tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
