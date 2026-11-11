// Creates one HighLevel estimate per Bronze, Silver, and Gold option and returns the links,
// so a single GHL workflow email can present all three. HighLevel's own Send Estimate
// workflow action only works from a fixed template, so the priced line items are pushed here.
const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const TIER_KEYS = ['bronze', 'silver', 'gold'];
const MAX_ESTIMATE_NAME = 40;
const { quoteDisclaimer } = require('../data/demo-config');
const CALL_FOR_QUOTE_NOTE = 'This estimate does not include the call-for-quote items you selected. Infinity Air will price those separately.';

function ghlConfig(env = process.env) {
  return {
    token: env.GHL_PRIVATE_TOKEN || '',
    locationId: env.GHL_LOCATION_ID || '',
    userId: env.GHL_USER_ID || '',
    version: env.GHL_API_VERSION || '2021-07-28',
    estimateUrlTemplate: env.GHL_ESTIMATE_URL_TEMPLATE || '',
    estimateNamePrefix: env.GHL_ESTIMATE_NAME_PREFIX || 'Infinity Air',
    expiryDays: Number(env.GHL_ESTIMATE_EXPIRY_DAYS) > 0 ? Number(env.GHL_ESTIMATE_EXPIRY_DAYS) : 30,
    business: {
      name: env.GHL_BUSINESS_NAME || 'Infinity Air Heating and Cooling',
      phoneNo: env.GHL_BUSINESS_PHONE || '+1-909-975-2391',
      ...(env.GHL_BUSINESS_LOGO_URL && { logoUrl: env.GHL_BUSINESS_LOGO_URL }),
      ...(env.GHL_BUSINESS_WEBSITE && { website: env.GHL_BUSINESS_WEBSITE })
    },
    // Same not-a-binding-quote text the customer saw on the quiz results.
    termsNotes: env.GHL_ESTIMATE_TERMS || quoteDisclaimer || ''
  };
}

function isGhlConfigured(config) {
  return Boolean(config && config.token && config.locationId);
}

function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

function e164(phone) {
  const value = digits(phone);
  return value.length === 10 ? `+1${value}` : value ? `+${value}` : '';
}

function truncate(value, max) {
  const text = String(value).trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createGhlClient(config, fetchImpl = fetch) {
  async function request(path, options = {}, operation = 'HighLevel request') {
    const response = await fetchImpl(`${GHL_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Version: config.version,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(body.message) ? body.message.join('; ') : (body.message || body.error);
      const error = new Error(typeof detail === 'string' && detail ? detail : `HighLevel returned ${response.status}.`);
      error.status = response.status;
      error.operation = operation;
      throw error;
    }
    return body;
  }
  return { request };
}

// Each option comes from the widget's `estimate_options` (tier, label, tons, name, line_items in cents).
// Older payloads only carry `hcp_line_items`; the tier is then read from the option name.
function estimateOptions(payload) {
  const source = Array.isArray(payload?.estimate_options) && payload.estimate_options.length
    ? payload.estimate_options
    : (payload?.quote_status === 'price' ? (payload?.hcp_line_items || []) : []);
  return source
    .map(option => {
      const name = String(option?.name || '').trim();
      const tier = String(option?.tier || TIER_KEYS.find(key => name.toLowerCase().startsWith(key)) || '').toLowerCase();
      const lineItems = (Array.isArray(option?.line_items) ? option.line_items : []).filter(item =>
        String(item?.name || '').trim() && Number.isFinite(item.quantity) && item.quantity > 0 && Number.isInteger(item.unit_price) && item.unit_price >= 0);
      const total = lineItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) / 100;
      return { tier, label: option?.label || name, tons: option?.tons ?? null, name, lineItems, total, callForQuote: Boolean(option?.callForQuote) };
    })
    .filter(option => option.name && option.lineItems.length && option.total > 0);
}

function contactBody(config, contact) {
  const body = {
    locationId: config.locationId,
    firstName: String(contact.firstName || '').trim(),
    lastName: String(contact.lastName || '').trim(),
    phone: e164(contact.phone),
    source: 'Kickbord Estimator Tool',
    tags: ['estimator-quote']
  };
  if (contact.email) body.email = String(contact.email).trim().toLowerCase();
  if (contact.address) body.address1 = String(contact.address).trim();
  if (contact.city) body.city = String(contact.city).trim();
  if (contact.state) body.state = String(contact.state).trim().toUpperCase();
  if (contact.zip) body.postalCode = String(contact.zip).trim();
  body.country = 'US';
  return body;
}

async function upsertGhlContact(client, config, contact) {
  const result = await client.request('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify(contactBody(config, contact))
  }, 'HighLevel contact upsert');
  const id = result?.contact?.id || result?.contact?._id;
  if (!id) throw Object.assign(new Error('HighLevel did not return a contact ID.'), { operation: 'HighLevel contact upsert' });
  return id;
}

function estimateBody(config, { contactId, contact, option, now }) {
  // HighLevel rejects estimate names over 40 characters (HTTP 422).
  const name = truncate(`${config.estimateNamePrefix} – ${option.name}`, MAX_ESTIMATE_NAME);
  const address = {
    ...(contact.address && { addressLine1: String(contact.address).trim() }),
    ...(contact.city && { city: String(contact.city).trim() }),
    ...(contact.state && { state: String(contact.state).trim().toUpperCase() }),
    ...(contact.zip && { postalCode: String(contact.zip).trim() }),
    countryCode: 'US'
  };
  const body = {
    altId: config.locationId,
    altType: 'location',
    name,
    title: 'ESTIMATE',
    currency: 'USD',
    liveMode: true,
    businessDetails: config.business,
    contactDetails: {
      id: contactId,
      name: `${String(contact.firstName || '').trim()} ${String(contact.lastName || '').trim()}`.trim(),
      phoneNo: e164(contact.phone),
      email: String(contact.email || '').trim().toLowerCase(),
      address
    },
    items: option.lineItems.map(item => ({
      name: item.name,
      description: item.description || '',
      currency: 'USD',
      amount: item.unit_price / 100,
      qty: item.quantity,
      type: 'one_time'
    })),
    discount: { type: 'fixed', value: 0 },
    frequencySettings: { enabled: false, schedule: {} },
    issueDate: isoDate(now),
    expiryDate: isoDate(addDays(now, config.expiryDays)),
    meta: { source: 'infinity-air-estimator', tier: option.tier, tons: option.tons }
  };
  if (config.userId) body.userId = config.userId;
  const terms = [config.termsNotes, option.callForQuote ? CALL_FOR_QUOTE_NOTE : '']
    .filter(Boolean)
    .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  if (terms) body.termsNotes = terms;
  return body;
}

function estimateUrl(config, id) {
  if (!config.estimateUrlTemplate || !id) return null;
  return config.estimateUrlTemplate.replace('{id}', encodeURIComponent(id));
}

// Creates the estimates and marks each one sent without HighLevel emailing it on its own
// (`send_manually`). The single combined email comes from the GHL webhook workflow.
async function createGhlEstimates(payload, config, { fetchImpl = fetch, now = new Date() } = {}) {
  const contact = payload?.contact || {};
  const options = estimateOptions(payload);
  if (!options.length) return { status: 'skipped', reason: 'no-priced-options', contactId: null, estimates: [] };
  if (!String(contact.email || '').trim()) return { status: 'skipped', reason: 'no-email', contactId: null, estimates: [] };

  const client = createGhlClient(config, fetchImpl);
  const contactId = await upsertGhlContact(client, config, contact);
  const settled = await Promise.allSettled(options.map(option => createOne(client, config, { contactId, contact, option, now })));
  const estimates = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
  const failure = settled.find(item => item.status === 'rejected');
  if (failure) {
    failure.reason.partial = { contactId, estimates };
    throw failure.reason;
  }
  return { status: 'created', reason: null, contactId, estimates };
}

async function createOne(client, config, { contactId, contact, option, now }) {
  const created = await client.request('/invoices/estimate', {
    method: 'POST',
    body: JSON.stringify(estimateBody(config, { contactId, contact, option, now }))
  }, `HighLevel ${option.tier || 'option'} estimate creation`);
  const id = created?._id || created?.id;
  if (!id) throw Object.assign(new Error('HighLevel did not return an estimate ID.'), { operation: 'HighLevel estimate creation' });
  let sent = false;
  if (config.userId) {
    await client.request(`/invoices/estimate/${encodeURIComponent(id)}/send`, {
      method: 'POST',
      body: JSON.stringify({ altId: config.locationId, altType: 'location', action: 'send_manually', liveMode: true, userId: config.userId })
    }, `HighLevel ${option.tier || 'option'} estimate send`);
    sent = true;
  }
  return {
    tier: option.tier,
    label: option.label,
    tons: option.tons,
    name: option.name,
    total: Number(created.total ?? option.total),
    id,
    url: estimateUrl(config, id),
    sent
  };
}

function money(value) {
  return Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '';
}

// Flat fields are easier to drop into a GHL email than an array:
// {{inboundWebhookRequest.bronze_estimate_url}}, {{inboundWebhookRequest.silver_estimate_total}}, ...
function webhookEstimateFields(result) {
  const fields = {
    ghl_estimate_status: result.status,
    ghl_estimate_reason: result.reason || '',
    ghl_contact_id: result.contactId || '',
    ghl_estimates: result.estimates || []
  };
  for (const key of TIER_KEYS) {
    const estimate = (result.estimates || []).find(item => item.tier === key);
    fields[`${key}_estimate_id`] = estimate?.id || '';
    fields[`${key}_estimate_url`] = estimate?.url || '';
    fields[`${key}_estimate_name`] = estimate?.name || '';
    fields[`${key}_estimate_total`] = estimate ? money(estimate.total) : '';
  }
  return fields;
}

module.exports = {
  GHL_BASE_URL,
  ghlConfig,
  isGhlConfigured,
  estimateOptions,
  contactBody,
  estimateBody,
  estimateUrl,
  createGhlEstimates,
  webhookEstimateFields
};
