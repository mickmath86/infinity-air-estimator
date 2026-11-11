const assert = require('node:assert/strict');
const fs = require('fs');
const model = require('./estimator-model.js');
const flow = require('./demo-flow.js');
const demoConfig = require('./data/demo-config.js');
const {
  ghlConfig,
  isGhlConfigured,
  estimateOptions,
  estimateBody,
  createGhlEstimates,
  webhookEstimateFields
} = require('./lib/ghl-estimates.js');
const { createTierEstimates } = require('./api/create-housecall-estimate.js');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Build the payload exactly as the widget does, from the real price-book snapshot.
const items = model.normalizePricebook(model.parseCsv(fs.readFileSync('./data/pricebook.csv', 'utf8')));
const answers = { propertyType: 'residential', projectType: 'replacement', zip: '91761', systemFamily: 'gas-split', homeSize: 'under-1200', systemAge: '10-15', addons: [], brand: 'value' };
const quote = flow.buildProposal(items, demoConfig, answers);
assert.equal(quote.status, 'price');
const hcpLineItems = model.buildHcpOptions(quote.packages);
const payload = {
  quote_status: 'price',
  contact: { firstName: 'Ava', lastName: 'Chen', phone: '5554902486', email: 'Ava@Example.com', address: '123 Main St', city: 'Ontario', state: 'ca', zip: '91761' },
  hcp_line_items: hcpLineItems,
  estimate_options: hcpLineItems.map((option, index) => ({ tier: quote.packages[index].tier, label: quote.packages[index].label, tons: quote.packages[index].tons, ...option }))
};

const options = estimateOptions(payload);
assert.deepEqual(options.map(option => option.tier).sort(), ['bronze', 'gold', 'silver']);
assert.ok(options.every(option => option.total > 0));

// Older payloads without estimate_options still resolve the tier from the option name.
assert.deepEqual(estimateOptions({ hcp_line_items: hcpLineItems }).map(option => option.tier).sort(), ['bronze', 'gold', 'silver']);

const config = ghlConfig({
  GHL_PRIVATE_TOKEN: 'pit-test',
  GHL_LOCATION_ID: 'loc123',
  GHL_USER_ID: 'user123',
  GHL_ESTIMATE_URL_TEMPLATE: 'https://link.example.com/estimate/{id}'
});
assert.equal(isGhlConfigured(config), true);
assert.equal(isGhlConfigured(ghlConfig({})), false);

const now = new Date('2026-11-11T12:00:00Z');
const body = estimateBody(config, { contactId: 'c1', contact: payload.contact, option: options[0], now });
assert.equal(body.altId, 'loc123');
assert.equal(body.altType, 'location');
assert.equal(body.contactDetails.id, 'c1');
assert.equal(body.contactDetails.email, 'ava@example.com');
assert.equal(body.contactDetails.phoneNo, '+15554902486');
assert.equal(body.issueDate, '2026-11-11');
assert.equal(body.expiryDate, '2026-12-11');
assert.deepEqual(body.discount, { type: 'fixed', value: 0 });
assert.equal(body.frequencySettings.enabled, false);
// Line items go to HighLevel in dollars, not cents.
assert.equal(body.items[0].amount, options[0].lineItems[0].unit_price / 100);
assert.equal(body.items[0].qty, 1);

(async () => {
  const calls = [];
  let counter = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/contacts/upsert')) return response(200, { new: true, contact: { id: 'contact-1' } });
    if (url.endsWith('/invoices/estimate')) {
      counter += 1;
      return response(201, { _id: `est-${counter}`, total: calls.at(-1).body.items.reduce((sum, item) => sum + item.amount * item.qty, 0) });
    }
    if (/\/invoices\/estimate\/[^/]+\/send$/.test(url)) return response(201, {});
    return response(404, { message: 'unexpected' });
  };

  const result = await createGhlEstimates(payload, config, { fetchImpl, now });
  assert.equal(result.status, 'created');
  assert.equal(result.contactId, 'contact-1');
  assert.equal(result.estimates.length, 3);
  assert.ok(result.estimates.every(estimate => estimate.sent));
  assert.equal(result.estimates[0].url, 'https://link.example.com/estimate/est-1');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer pit-test');
  assert.equal(calls[0].init.headers.Version, '2021-07-28');
  assert.equal(calls[0].body.phone, '+15554902486');
  // Each estimate is marked sent without HighLevel emailing it separately.
  const sends = calls.filter(call => call.url.endsWith('/send'));
  assert.equal(sends.length, 3);
  assert.ok(sends.every(call => call.body.action === 'send_manually' && call.body.userId === 'user123'));

  const fields = webhookEstimateFields(result);
  for (const tier of ['bronze', 'silver', 'gold']) {
    assert.match(fields[`${tier}_estimate_url`], /^https:\/\/link\.example\.com\/estimate\/est-\d$/);
    assert.match(fields[`${tier}_estimate_total`], /^\$[\d,]+/);
  }
  assert.equal(fields.ghl_estimate_status, 'created');
  assert.equal(fields.ghl_contact_id, 'contact-1');

  // No email: nothing is created, the webhook still fires with a reason.
  const noEmail = await createGhlEstimates({ ...payload, contact: { ...payload.contact, email: '' } }, config, { fetchImpl, now });
  assert.equal(noEmail.status, 'skipped');
  assert.equal(noEmail.reason, 'no-email');

  // Lead-only paths never create estimates.
  const lead = await createGhlEstimates({ ...payload, quote_status: 'lead' }, config, { fetchImpl, now });
  assert.equal(lead.status, 'skipped');

  // Without a user ID the estimates are created but left as drafts.
  const draftCalls = [];
  const draft = await createGhlEstimates(payload, { ...config, userId: '' }, {
    fetchImpl: async (url, init) => { draftCalls.push(url); return fetchImpl(url, init); },
    now
  });
  assert.ok(draft.estimates.every(estimate => !estimate.sent));
  assert.equal(draftCalls.filter(url => url.endsWith('/send')).length, 0);

  // One tier failing keeps the other two and never throws to the lead form.
  let created = 0;
  const failing = async (url, init) => {
    if (url.endsWith('/invoices/estimate')) {
      created += 1;
      if (created === 2) return response(422, { message: ['items.0.amount must be a number'] });
    }
    return fetchImpl(url, init);
  };
  const originalError = console.error;
  console.error = () => {};
  const partial = await createTierEstimates(payload, config, { fetchImpl: failing, now });
  console.error = originalError;
  assert.equal(partial.status, 'partial');
  assert.equal(partial.estimates.length, 2);
  assert.equal(partial.contactId, 'contact-1');

  const notConfigured = await createTierEstimates(payload, ghlConfig({}));
  assert.equal(notConfigured.status, 'skipped');
  assert.equal(notConfigured.reason, 'not-configured');

  console.log('GHL estimate tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
