(() => {
  function buildHcpLineItems(items) {
    if (!Array.isArray(items) || !items.length) throw new TypeError('At least one line item is required.');
    const lineItems = items
      .filter(item => !['subtotal', 'grand_total'].includes(item.kind))
      .map(item => {
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const description = typeof item.description === 'string' ? item.description : '';
        const quantity = Number(item.quantity);
        if (!name) throw new TypeError('Line item name is required.');
        if (!Number.isFinite(quantity) || quantity <= 0) throw new TypeError(`Invalid quantity for ${name}.`);
        if (!Number.isFinite(item.unitPrice)) throw new TypeError(`Invalid unit price for ${name}.`);
        const unitPrice = item.priceUnit === 'cents' ? item.unitPrice : Math.round(item.unitPrice * 100);
        if (!Number.isInteger(unitPrice) || unitPrice < 0) throw new TypeError(`Invalid unit price for ${name}.`);
        return { name, description, quantity, unit_price: unitPrice };
      });
    if (!lineItems.length) throw new TypeError('At least one priced line item is required.');
    return lineItems;
  }

  function buildHcpLineItemPackages(packageName, items) {
    const name = typeof packageName === 'string' ? packageName.trim() : '';
    if (!name) throw new TypeError('Line-item package name is required.');
    return [{ name, line_items: buildHcpLineItems(items) }];
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildHcpLineItems, buildHcpLineItemPackages };
    return;
  }

  const script = document.currentScript;
  const config = {
    webhookUrl: script?.dataset.webhookUrl || '',
    housecallEndpoint: script?.dataset.housecallEndpoint || '',
    googleMapsKey: script?.dataset.googleMapsKey || '',
    clientKey: script?.dataset.clientKey || '',
    api: script?.dataset.api || 'https://rtlhldhumcmzgbvkqmnm.supabase.co/functions/v1/estimator-public',
    phone: script?.dataset.phone || '(909) 975-2391',
    title: script?.dataset.title || 'Get Your HVAC Estimate',
    source: script?.dataset.source || window.location.href
  };

  const mount = document.querySelector(script?.dataset.target || '#infinity-air-estimator');
  if (!mount) return;

  const root = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount;
  const state = { step: 0, answers: {}, estimate: null };
  let googleMapsPromise;
  // Questions come from the client's database record (identified by data-client-key), not from this file.
  let questions = [];
  let settings = {};
  function matchesWhen(when, answers) {
    return Object.entries(when || {}).every(([key, allowed]) => Array.isArray(allowed) ? allowed.includes(answers[key]) : answers[key] === allowed);
  }
  function effectiveBrand(answers) {
    return answers.brand === 'no-preference' ? settings.default_brand : answers.brand;
  }
  function buildQuestions(rows) {
    return rows.map(row => ({
      key: row.key,
      eyebrow: row.eyebrow || '',
      title: row.title,
      subtitle: row.subtitle || '',
      when: answers => matchesWhen(row.show_when, answers),
      dynamicOptions: answers => row.options
        .filter(option => matchesWhen(option.show_when, answers))
        .map(option => {
          const byKey = Object.entries(option.label_by || {}).find(([key, map]) => map && map[key === 'brand' ? effectiveBrand(answers) : answers[key]]);
          const label = byKey ? byKey[1][byKey[0] === 'brand' ? effectiveBrand(answers) : answers[byKey[0]]] : option.label;
          return [option.value, label, option.description || ''];
        })
    }));
  }
  async function api(action, extra) {
    const response = await fetch(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, public_key: config.clientKey, ...extra }) });
    if (!response.ok) throw new Error(`Estimator service returned ${response.status}.`);
    return response.json();
  }

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap');
    :host{--navy:#0F2440;--deep:#0A1A30;--orange:#F5821F;--orange-dark:#D96D0E;--cyan:#5BC6E8;--ink:#16283E;--muted:#5C7590;--line:#D7DFE8;--pale:#F4F7FA;display:block;font-family:Barlow,Arial,sans-serif;color:var(--ink);font-size:16px}
    *{box-sizing:border-box}.shell{max-width:980px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(6,18,34,.18);overflow:hidden;border:1px solid #e3eaf0}.top{background:var(--navy);padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px}.logo{height:54px;width:auto;display:block}.trust{color:#c7d6e6;font-size:13px;text-align:right;line-height:1.45}.trust strong{color:#fff;display:block}.progress{height:5px;background:#dfe7ee}.progress span{display:block;height:100%;background:var(--orange);transition:width .3s ease}.body{padding:44px 48px 48px;min-height:510px}.eyebrow{color:var(--orange);font-weight:700;text-transform:uppercase;letter-spacing:1.8px;font-size:13px;margin-bottom:9px}h2{font-family:'Barlow Condensed',Arial,sans-serif;color:var(--navy);text-transform:uppercase;font-size:38px;line-height:1.05;margin:0 0 9px;letter-spacing:.3px}.subtitle{color:var(--muted);font-size:16px;margin:0 0 28px}.options{display:grid;grid-template-columns:1fr 1fr;gap:13px}.option{appearance:none;width:100%;font:inherit;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:18px 44px 18px 18px;cursor:pointer;position:relative;color:var(--ink);transition:.15s}.option:hover,.option:focus{border-color:var(--cyan);box-shadow:0 5px 16px rgba(15,36,64,.09);outline:none;transform:translateY(-1px)}.option.selected{border-color:var(--orange);background:#fff8f2}.option strong{display:block;color:var(--navy);font-size:17px;margin-bottom:4px}.option small{display:block;color:var(--muted);font-size:13.5px;line-height:1.35}.arrow{position:absolute;right:17px;top:50%;transform:translateY(-50%);color:var(--orange);font-size:22px}.nav{display:flex;justify-content:space-between;align-items:center;margin-top:30px}.back{border:0;background:none;color:var(--muted);font:600 15px Barlow,Arial;cursor:pointer;padding:10px 0}.back:hover{color:var(--navy)}.result{background:linear-gradient(135deg,var(--deep),var(--navy));border-radius:12px;padding:28px;color:#fff;margin:22px 0}.result-label{color:var(--cyan);text-transform:uppercase;letter-spacing:1.5px;font-size:12px;font-weight:700}.price{font:700 48px/1 'Barlow Condensed',Arial;margin:8px 0}.result p{color:#c7d6e6;margin:0;line-height:1.5}.notice{font-size:12.5px;color:var(--muted);line-height:1.45;margin:12px 0 24px}.lead{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field label{font-weight:600;color:var(--navy);font-size:14px}.field input,.field textarea{width:100%;font:15px Barlow,Arial;border:1.5px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ink);outline:none}.field input:focus,.field textarea:focus{border-color:var(--cyan)}.field textarea{min-height:82px;resize:vertical}.submit{grid-column:1/-1;border:0;border-radius:9px;padding:15px 22px;background:var(--orange);color:#fff;font:700 16px Barlow,Arial;cursor:pointer;box-shadow:0 5px 16px rgba(245,130,31,.32)}.submit:hover{background:var(--orange-dark)}.submit:disabled{opacity:.65;cursor:wait}.error{grid-column:1/-1;color:#b42318;font-size:14px}.success{text-align:center;padding:55px 20px}.check{width:62px;height:62px;margin:0 auto 18px;border-radius:50%;background:#eaf8ee;color:#16823b;display:grid;place-items:center;font-size:30px;font-weight:700}.success a{display:inline-block;margin-top:18px;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px}@media(max-width:650px){.top{padding:16px 18px}.logo{height:43px}.trust{display:none}.body{padding:30px 20px 34px;min-height:0}h2{font-size:32px}.options,.lead{grid-template-columns:1fr}.field.full,.submit{grid-column:auto}.price{font-size:40px}}
  `;

  function visibleQuestions() { return questions.filter(q => !q.when || q.when(state.answers)); }
  function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value); }
  async function calculate() {
    const quote = await api('quote', { answers: state.answers });
    state.quote = quote;
    state.estimate = quote.status === 'price'
      ? { low: quote.low, high: quote.high, label: 'Your estimated range', currency: 'USD' }
      : null;
  }
  function getAnswerLabel(key, value) {
    const question = questions.find(item => item.key === key);
    const options = question?.dynamicOptions ? question.dynamicOptions(state.answers) : question?.options;
    return options?.find(option => option[0] === value)?.[1] || value;
  }
  function createEstimateLineItemPackages() {
    const projectNames = {
      replacement: 'HVAC replacement estimate',
      repair: 'HVAC repair estimate',
      maintenance: 'HVAC maintenance estimate',
      'air-quality': 'Ductwork and air quality estimate'
    };
    const replacementPackageNames = {
      complete: 'Complete HVAC Installation Package',
      'heat-pump': 'Heat Pump Installation Package',
      'ac-only': 'Air Conditioner Installation Package',
      'furnace-only': 'Furnace Installation Package',
      'mini-split': 'Ductless Mini-Split Installation Package'
    };
    const packageNames = {
      replacement: replacementPackageNames[state.answers.systemType] || 'HVAC Replacement Package',
      repair: 'HVAC Repair Estimate Package',
      maintenance: 'HVAC Maintenance Estimate Package',
      'air-quality': 'Ductwork and Air Quality Estimate Package'
    };
    const fieldNames = {
      projectType: 'Service', propertyType: 'Property type', systemType: 'System type', homeSize: 'Home size',
      efficiency: 'Level', brand: 'Brand', miniSplitRooms: 'Rooms', has220: '220V outlet at outdoor unit', repairIssue: 'System issue', systemAge: 'System age', serviceDetail: 'Service detail', urgency: 'Timing'
    };
    const selections = Object.entries(state.answers)
      .map(([key, value]) => `${fieldNames[key] || key}: ${getAnswerLabel(key, value)}`)
      .join('\n');
    return buildHcpLineItemPackages(packageNames[state.answers.projectType] || 'HVAC Service Estimate Package', [{
      name: projectNames[state.answers.projectType] || 'HVAC service estimate',
      description: `Preliminary estimate based on these selections:\n${selections}`,
      quantity: 1,
      unitPrice: (state.estimate.low + state.estimate.high) / 2,
      priceUnit: 'dollars'
    }]);
  }
  function header(progress) {
    return `<div class="top"><img class="logo" src="https://infinityairservices.com/wp-content/themes/infinity-air-child/assets/img/logo.png" alt="Infinity Air Heating and Cooling"><div class="trust"><strong>Free estimates · Honest pricing</strong>Licensed, bonded & insured · C-20 #1134070</div></div><div class="progress"><span style="width:${progress}%"></span></div>`;
  }
  function renderQuestion() {
    const list = visibleQuestions();
    if (state.step >= list.length) return renderResult();
    const q = list[state.step];
    const options = q.dynamicOptions ? q.dynamicOptions(state.answers) : q.options;
    const cards = options.map(([value,title,desc]) => `<button class="option ${state.answers[q.key] === value ? 'selected' : ''}" data-value="${value}"><strong>${title}</strong><small>${desc}</small><span class="arrow">›</span></button>`).join('');
    root.innerHTML = `<style>${styles}</style><div class="shell">${header((state.step / list.length) * 100)}<main class="body"><div class="eyebrow">${q.eyebrow} · Step ${state.step + 1} of ${list.length}</div><h2>${q.title}</h2><p class="subtitle">${q.subtitle}</p><div class="options">${cards}</div><div class="nav">${state.step ? '<button class="back">← Back</button>' : '<span></span>'}</div></main></div>`;
    root.querySelectorAll('.option').forEach(el => el.addEventListener('click', () => { state.answers[q.key] = el.dataset.value; state.step += 1; renderQuestion(); }));
    root.querySelector('.back')?.addEventListener('click', () => { state.step -= 1; renderQuestion(); });
  }
  function loadGoogleMaps() {
    if (!config.googleMapsKey || /^(YOUR|PASTE_)/.test(config.googleMapsKey)) return Promise.resolve(null);
    if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
    if (googleMapsPromise) return googleMapsPromise;
    googleMapsPromise = new Promise((resolve, reject) => {
      const callback = `infinityAirMapsReady${Date.now()}`;
      window[callback] = () => { delete window[callback]; resolve(window.google); };
      const mapsScript = document.createElement('script');
      mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsKey)}&v=weekly&loading=async&callback=${callback}`;
      mapsScript.async = true;
      mapsScript.onerror = () => { delete window[callback]; reject(new Error('Google Maps failed to load.')); };
      document.head.appendChild(mapsScript);
    });
    return googleMapsPromise;
  }
  async function initAddressAutocomplete() {
    const input = root.querySelector('#ia-address');
    if (!input || !config.googleMapsKey || /^(YOUR|PASTE_)/.test(config.googleMapsKey)) return;
    try {
      const google = await loadGoogleMaps();
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      const autocomplete = new PlaceAutocompleteElement({ includedRegionCodes:['us'] });
      autocomplete.style.width = '100%';
      input.hidden = true;
      input.before(autocomplete);
      autocomplete.addEventListener('gmp-select', async event => {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields:['addressComponents'] });
        const components = place.addressComponents || [];
        const get = type => components.find(component => component.types.includes(type));
        const number = get('street_number')?.longText || '';
        const route = get('route')?.longText || '';
        input.value = [number, route].filter(Boolean).join(' ');
        root.querySelector('#ia-city').value = get('locality')?.longText || get('sublocality_level_1')?.longText || '';
        root.querySelector('#ia-state').value = get('administrative_area_level_1')?.shortText || '';
        root.querySelector('#ia-zip').value = get('postal_code')?.longText || '';
      });
    } catch (error) {
      console.warn('Infinity Air address autocomplete:', error.message);
    }
  }
  async function renderResult() {
    root.innerHTML = `<style>${styles}</style><div class="shell">${header(100)}<main class="body"><p class="subtitle">Preparing your estimate…</p></main></div>`;
    try { await calculate(); } catch (err) { state.quote = { status: 'unavailable', message: '' }; state.estimate = null; }
    root.innerHTML = `<style>${styles}</style><div class="shell">${header(100)}<main class="body"><div class="eyebrow">Your estimate is ready</div><h2>Where should we send your estimate?</h2><p class="subtitle">Enter your details below and we will show your personalized project range.</p><form class="lead"><div class="field"><label for="ia-first-name">First name *</label><input id="ia-first-name" name="firstName" autocomplete="given-name" required></div><div class="field"><label for="ia-last-name">Last name *</label><input id="ia-last-name" name="lastName" autocomplete="family-name" required></div><div class="field"><label for="ia-phone">Phone *</label><input id="ia-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(909) 555-1234" maxlength="14" required></div><div class="field"><label for="ia-email">Email</label><input id="ia-email" name="email" type="email" autocomplete="email"></div><div class="field full"><label for="ia-address">Street address</label><input id="ia-address" name="address" autocomplete="address-line1"></div><div class="field"><label for="ia-city">City</label><input id="ia-city" name="city" autocomplete="address-level2"></div><div class="field"><label for="ia-state">State</label><input id="ia-state" name="state" autocomplete="address-level1" maxlength="2" placeholder="CA"></div><div class="field"><label for="ia-zip">ZIP code</label><input id="ia-zip" name="zip" autocomplete="postal-code" inputmode="numeric"></div><div class="field full"><label for="ia-notes">Anything else we should know?</label><textarea id="ia-notes" name="notes" maxlength="500"></textarea></div><div class="error" hidden></div><button class="submit" type="submit">See My Estimate</button></form><div class="nav"><button class="back" type="button">← Change answers</button></div></main></div>`;
    root.querySelector('.back').addEventListener('click', () => { state.step = Math.max(0, visibleQuestions().length - 1); renderQuestion(); });
    root.querySelector('.lead').addEventListener('submit', submitLead);
    root.querySelector('#ia-phone').addEventListener('input', event => {
      event.target.value = formatUsPhoneForDisplay(event.target.value);
    });
    initAddressAutocomplete();
  }
  function phoneDigits(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
  }
  function formatUsPhoneForDisplay(value) {
    const digits = phoneDigits(value);
    if (digits.length < 4) return digits ? `(${digits}` : '';
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  function normalizeUsPhone(value) {
    const digits = phoneDigits(value);
    return digits.length === 10 ? digits : null;
  }
  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('.submit'), error = form.querySelector('.error');
    const data = Object.fromEntries(new FormData(form));
    const phone = normalizeUsPhone(data.phone);
    if (!phone) {
      error.textContent = 'Enter a valid 10-digit U.S. phone number.'; error.hidden = false; form.elements.phone.focus();
      return;
    }
    data.phone = phone;
    const priced = state.quote?.status === 'price' && state.estimate;
    const hcpLineItemPackages = priced ? createEstimateLineItemPackages() : [];
    const payload = {
      event: 'estimator.completed',
      submittedAt: new Date().toISOString(),
      source: config.source,
      contact: data,
      answers: state.answers,
      client_key: config.clientKey,
      quote_status: state.quote?.status || 'unavailable',
      pricing_version: state.quote?.pricing_version ?? null,
      estimate: state.estimate,
      hcp_line_items: hcpLineItemPackages,
      hcp_line_items_json: JSON.stringify(hcpLineItemPackages)
    };
    error.hidden = true; button.disabled = true; button.textContent = 'Sending…';
    try {
      const endpoint = config.housecallEndpoint || config.webhookUrl;
      if (!endpoint) throw new Error('No submission endpoint is configured.');
      const response = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Submission service returned ${response.status}.`);
      const e = state.estimate, q = state.quote || {};
      const disclaimer = escapeHtml(q.disclaimer || 'This is a planning estimate, not a binding quote.');
      const body = e
        ? `<p class="subtitle">Based on the details you shared, here’s a realistic range.</p><div class="result"><div class="result-label">${escapeHtml(e.label)}</div><div class="price">${money(e.low)}–${money(e.high)}</div>${(q.notes || []).length ? `<p>${q.notes.map(escapeHtml).join('<br>')}</p>` : ''}${q.valid_days ? `<p>Good for ${Number(q.valid_days)} days.</p>` : ''}</div>${q.financing ? `<p class="notice">${escapeHtml(q.financing)}</p>` : ''}`
        : `<div class="result"><p>${escapeHtml(q.message || 'Thanks. We received your details and will contact you shortly with your price.')}</p></div>`;
      root.innerHTML = `<style>${styles}</style><div class="shell">${header(100)}<main class="body"><div class="eyebrow">${e ? 'Your personalized estimate' : 'We received your request'}</div><h2>Thank you, ${escapeHtml(data.firstName)}.</h2>${body}<p class="notice">${disclaimer}</p><a class="submit" href="tel:+19099752391" style="display:block;text-align:center;text-decoration:none">Call ${config.phone}</a></main></div>`;
      mount.dispatchEvent(new CustomEvent('infinity-air:completed', { detail: payload }));
    } catch (err) {
      error.textContent = `${err.message} Please call ${config.phone} or try again.`; error.hidden = false; button.disabled = false; button.textContent = 'See My Estimate';
    }
  }
  function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
  (async () => {
    root.innerHTML = `<style>${styles}</style><div class="shell">${header(0)}<main class="body"><p class="subtitle">Loading…</p></main></div>`;
    try {
      if (!config.clientKey) throw new Error('Missing data-client-key.');
      const loaded = await api('config');
      settings = loaded.settings || {};
      questions = buildQuestions(loaded.questions || []);
      if (!questions.length) throw new Error('No questions configured.');
      renderQuestion();
    } catch (err) {
      console.warn('Infinity Air estimator:', err.message);
      root.innerHTML = `<style>${styles}</style><div class="shell">${header(0)}<main class="body"><h2>We could not load the estimator.</h2><p class="subtitle">Please call us at ${config.phone} and we will help right away.</p></main></div>`;
    }
  })();
})();
