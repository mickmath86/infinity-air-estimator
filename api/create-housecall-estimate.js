const HCP_BASE_URL = 'https://api.housecallpro.com';

function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function completeAddress(contact) {
  const address = {
    type: 'service',
    street: String(contact.address || '').trim(),
    city: String(contact.city || '').trim(),
    state: String(contact.state || '').trim().toUpperCase(),
    zip: String(contact.zip || '').trim(),
    country: 'US'
  };
  return address.street && address.city && address.state && address.zip ? address : null;
}

function matchingCustomer(customers, contact) {
  const phone = digits(contact.phone);
  const email = normalizeEmail(contact.email);
  return customers.find(customer =>
    (phone && [customer.mobile_number, customer.home_number, customer.work_number].some(value => digits(value) === phone)) ||
    (email && normalizeEmail(customer.email) === email)
  );
}

function matchingAddress(addresses = [], address) {
  if (!address) return null;
  return addresses.find(candidate =>
    String(candidate.street || '').trim().toLowerCase() === address.street.toLowerCase() &&
    String(candidate.city || '').trim().toLowerCase() === address.city.toLowerCase() &&
    String(candidate.state || '').trim().toUpperCase() === address.state &&
    String(candidate.zip || '').trim() === address.zip
  );
}

function validatePayload(payload) {
  const contact = payload?.contact;
  if (!contact || !String(contact.firstName || '').trim() || !String(contact.lastName || '').trim()) {
    throw new TypeError('First and last name are required.');
  }
  if (digits(contact.phone).length !== 10) throw new TypeError('A valid 10-digit phone number is required.');
  if (!Array.isArray(payload.hcp_line_items) || !payload.hcp_line_items.length) {
    throw new TypeError('At least one estimate option is required.');
  }
  for (const option of payload.hcp_line_items) {
    if (!String(option?.name || '').trim() || !Array.isArray(option.line_items) || !option.line_items.length) {
      throw new TypeError('Each estimate option requires a name and line items.');
    }
    for (const item of option.line_items) {
      if (!String(item?.name || '').trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isInteger(item.unit_price) || item.unit_price < 0) {
        throw new TypeError('Estimate line item data is invalid.');
      }
    }
  }
  return contact;
}

function errorMessage(value, fallback) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return fallback;
}

function createHcpClient(apiKey, fetchImpl = fetch) {
  async function request(path, options = {}, operation = 'Housecall Pro request') {
    const response = await fetchImpl(`${HCP_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(errorMessage(body.message || body.error, `Housecall Pro returned ${response.status}.`));
      error.status = response.status;
      error.operation = operation;
      throw error;
    }
    return body;
  }

  return { request };
}

async function findCustomer(client, contact) {
  const queries = [contact.phone, contact.email].filter(Boolean);
  for (const query of queries) {
    const result = await client.request(`/customers?q=${encodeURIComponent(query)}&page_size=50`, {}, 'customer lookup');
    const customer = matchingCustomer(result.customers || [], contact);
    if (customer) return customer;
  }
  return null;
}

async function createCustomer(client, contact, address) {
  const body = {
    first_name: String(contact.firstName).trim(),
    last_name: String(contact.lastName).trim(),
    mobile_number: digits(contact.phone)
  };
  if (contact.email) body.email = normalizeEmail(contact.email);
  if (contact.notes) body.notes = String(contact.notes).trim();
  if (address) body.addresses = [address];
  return client.request('/customers', { method: 'POST', body: JSON.stringify(body) }, 'customer creation');
}

async function ensureAddress(client, customer, address) {
  if (!address) return null;
  const existing = matchingAddress(customer.addresses, address);
  if (existing) return existing;
  return client.request(`/customers/${encodeURIComponent(customer.id)}/addresses`, {
    method: 'POST',
    body: JSON.stringify(address)
  }, 'address creation');
}

async function createHousecallEstimate(payload, apiKey, fetchImpl = fetch) {
  const contact = validatePayload(payload);
  const client = createHcpClient(apiKey, fetchImpl);
  const address = completeAddress(contact);
  let customer = await findCustomer(client, contact);
  if (!customer) customer = await createCustomer(client, contact, address);
  if (!customer?.id) throw new Error('Housecall Pro did not return a customer ID.');

  let serviceAddress = matchingAddress(customer.addresses, address);
  if (!serviceAddress && address) serviceAddress = await ensureAddress(client, customer, address);

  const estimateBody = {
    customer_id: customer.id,
    options: payload.hcp_line_items
  };
  if (serviceAddress?.id) estimateBody.address_id = serviceAddress.id;
  if (contact.notes) estimateBody.note = String(contact.notes).trim();

  const estimate = await client.request('/estimates', {
    method: 'POST',
    body: JSON.stringify(estimateBody)
  }, 'estimate creation');
  if (!estimate?.id) throw new Error('Housecall Pro did not return an estimate ID.');
  return { customerId: customer.id, estimateId: estimate.id };
}

async function sendGhlWebhook(payload, webhookUrl, fetchImpl = fetch) {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = new Error(`GHL webhook returned ${response.status}.`);
    error.status = response.status;
    error.operation = 'GHL webhook';
    throw error;
  }
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function handler(request, response) {
  setCors(response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.HOUSECALL_PRO_API_KEY) return response.status(500).json({ error: 'Housecall Pro is not configured.' });
  if (!process.env.GHL_WEBHOOK_URL) return response.status(500).json({ error: 'GHL is not configured.' });

  try {
    const payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    validatePayload(payload);
    await sendGhlWebhook(payload, process.env.GHL_WEBHOOK_URL);
    const result = await createHousecallEstimate(payload, process.env.HOUSECALL_PRO_API_KEY);
    return response.status(201).json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof SyntaxError || error instanceof TypeError ? 400 : 502;
    if (status === 502) console.error('Estimator integration failed.', { operation: error.operation, status: error.status, message: error.message });
    return response.status(status).json({
      error: status === 400 ? error.message : `Unable to complete the ${error.operation || 'CRM integration'}.`,
      ...(error.operation && { operation: error.operation }),
      ...(error.status && { providerStatus: error.status })
    });
  }
}

module.exports = handler;
module.exports.createHousecallEstimate = createHousecallEstimate;
module.exports.completeAddress = completeAddress;
module.exports.errorMessage = errorMessage;
module.exports.matchingCustomer = matchingCustomer;
module.exports.sendGhlWebhook = sendGhlWebhook;
module.exports.validatePayload = validatePayload;
