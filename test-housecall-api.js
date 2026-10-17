const assert = require('node:assert/strict');
const {
  completeAddress,
  createHousecallEstimate,
  errorMessage,
  matchingCustomer,
  sendGhlWebhook,
  validatePayload
} = require('./api/create-housecall-estimate.js');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function payload(overrides = {}) {
  return {
    source: 'estimator-test',
    contact: {
      firstName: 'Ava',
      lastName: 'Chen',
      phone: '5554902486',
      email: 'ava@example.com',
      address: '123 Main St',
      city: 'Ontario',
      state: 'ca',
      zip: '91761',
      notes: 'Call before arrival.'
    },
    hcp_line_items: [{
      name: 'Heat Pump Installation Package',
      line_items: [{ name: 'HVAC replacement estimate', description: 'Estimate details', quantity: 1, unit_price: 1250000 }]
    }],
    ...overrides
  };
}

assert.deepEqual(completeAddress(payload().contact), {
  type: 'service', street: '123 Main St', city: 'Ontario', state: 'CA', zip: '91761', country: 'US'
});
assert.equal(completeAddress({ address: '123 Main St', city: '', state: 'CA', zip: '91761' }), null);
assert.equal(errorMessage({ mobile_number: ['is invalid'] }, 'fallback'), '{"mobile_number":["is invalid"]}');
assert.equal(errorMessage(null, 'fallback'), 'fallback');
assert.equal(matchingCustomer([{ id: 'cus_phone', mobile_number: '(555) 490-2486' }], payload().contact).id, 'cus_phone');
assert.equal(matchingCustomer([{ id: 'cus_email', email: 'AVA@EXAMPLE.COM' }], payload().contact).id, 'cus_email');
assert.throws(() => validatePayload(payload({ contact: { firstName: 'Ava', lastName: 'Chen', phone: '123' } })), /10-digit/);
assert.throws(() => validatePayload(payload({ hcp_line_items: [] })), /estimate option/);

(async () => {
  let ghlRequest;
  await sendGhlWebhook(payload(), 'https://example.test/webhook', async (url, options) => {
    ghlRequest = { url, options };
    return response(200, { ok: true });
  });
  assert.equal(ghlRequest.url, 'https://example.test/webhook');
  assert.deepEqual(JSON.parse(ghlRequest.options.body), payload());
  await assert.rejects(
    sendGhlWebhook(payload(), 'https://example.test/webhook', async () => response(500, {})),
    error => error.operation === 'GHL webhook' && error.status === 500
  );

  const existingCalls = [];
  const existingFetch = async (url, options = {}) => {
    existingCalls.push({ url, options });
    if (url.includes('/customers?q=')) return response(200, { customers: [{
      id: 'cus_existing',
      first_name: 'Ava',
      last_name: 'Chen',
      mobile_number: '5554902486',
      addresses: [{ id: 'adr_existing', street: '123 Main St', city: 'Ontario', state: 'CA', zip: '91761' }]
    }] });
    if (url.endsWith('/estimates')) return response(201, { id: 'est_existing' });
    throw new Error(`Unexpected request: ${url}`);
  };
  const existing = await createHousecallEstimate(payload(), 'test-key', existingFetch);
  assert.deepEqual(existing, { customerId: 'cus_existing', estimateId: 'est_existing' });
  assert.equal(existingCalls.length, 2);
  assert.equal(existingCalls[0].options.headers.Authorization, 'Token test-key');
  const existingEstimate = JSON.parse(existingCalls[1].options.body);
  assert.equal(existingEstimate.customer_id, 'cus_existing');
  assert.equal(existingEstimate.address_id, 'adr_existing');
  assert.deepEqual(existingEstimate.options, payload().hcp_line_items);

  const newCalls = [];
  const newFetch = async (url, options = {}) => {
    newCalls.push({ url, options });
    if (url.includes('/customers?q=')) return response(200, { customers: [] });
    if (url.endsWith('/customers')) return response(201, {
      id: 'cus_new',
      addresses: [{ id: 'adr_new', street: '123 Main St', city: 'Ontario', state: 'CA', zip: '91761' }]
    });
    if (url.endsWith('/estimates')) return response(201, { id: 'est_new' });
    throw new Error(`Unexpected request: ${url}`);
  };
  const created = await createHousecallEstimate(payload(), 'test-key', newFetch);
  assert.deepEqual(created, { customerId: 'cus_new', estimateId: 'est_new' });
  assert.equal(newCalls.length, 4);
  const customerRequest = JSON.parse(newCalls[2].options.body);
  assert.equal(customerRequest.mobile_number, '5554902486');
  assert.equal(customerRequest.addresses[0].country, 'US');
  assert.equal(JSON.parse(newCalls[3].options.body).address_id, 'adr_new');

  console.log('Housecall Pro API tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
