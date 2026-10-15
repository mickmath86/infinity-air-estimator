(() => {
  const script = document.currentScript;
  const config = {
    webhookUrl: script?.dataset.webhookUrl || '',
    googleMapsKey: script?.dataset.googleMapsKey || '',
    phone: script?.dataset.phone || '(909) 975-2391',
    title: script?.dataset.title || 'Get Your HVAC Estimate',
    source: script?.dataset.source || window.location.href
  };

  const mount = document.querySelector(script?.dataset.target || '#infinity-air-estimator');
  if (!mount) return;

  const root = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount;
  const state = { step: 0, answers: {}, estimate: null };
  let googleMapsPromise;
  const questions = [
    {
      key: 'projectType',
      eyebrow: 'Let’s get started',
      title: 'What can we help you with?',
      subtitle: 'Choose the option that best describes your project.',
      options: [
        ['replacement', 'Replace or install a system', 'Get a budget range for new HVAC equipment.'],
        ['repair', 'Repair a system', 'Troubleshoot cooling or heating problems.'],
        ['maintenance', 'Maintenance or tune-up', 'Keep your system efficient and reliable.'],
        ['air-quality', 'Ductwork or air quality', 'Improve airflow and indoor comfort.']
      ]
    },
    {
      key: 'propertyType',
      eyebrow: 'Property type',
      title: 'Is this for a home or business?',
      subtitle: 'This helps us tailor the estimate to your property and equipment needs.',
      options: [
        ['residential', 'Residential', 'A house, condominium, or other residential property.'],
        ['commercial', 'Commercial', 'An office, retail space, or other commercial property.']
      ]
    },
    {
      key: 'systemType',
      when: a => a.projectType === 'replacement',
      eyebrow: 'System type',
      title: 'What would you like to install?',
      subtitle: 'Not sure? Choose the closest option and we’ll confirm it on-site.',
      options: [
        ['complete', 'Complete heating & cooling', 'Outdoor AC plus furnace or air handler.'],
        ['heat-pump', 'Heat pump system', 'High-efficiency, all-electric heating and cooling.'],
        ['ac-only', 'Air conditioner only', 'Replace the outdoor cooling equipment.'],
        ['furnace-only', 'Furnace only', 'Replace the home’s heating equipment.'],
        ['mini-split', 'Ductless mini-split', 'Flexible comfort without traditional ductwork.']
      ]
    },
    {
      key: 'homeSize',
      when: a => a.projectType === 'replacement',
      eyebrow: 'Home size',
      title: 'Approximately how large is the space?',
      subtitle: 'Square footage helps us estimate equipment capacity.',
      options: [
        ['under-1200', 'Under 1,200 sq. ft.', 'Smaller home or single-zone project.'],
        ['1200-1800', '1,200–1,800 sq. ft.', 'Typical two- to three-bedroom home.'],
        ['1800-2500', '1,800–2,500 sq. ft.', 'Larger home or multi-level layout.'],
        ['over-2500', 'Over 2,500 sq. ft.', 'Large home; a load calculation is recommended.']
      ]
    },
    {
      key: 'efficiency',
      when: a => a.projectType === 'replacement',
      eyebrow: 'Comfort goals',
      title: 'Which efficiency level fits your priorities?',
      subtitle: 'Higher efficiency can lower utility costs and improve comfort.',
      options: [
        ['standard', 'Reliable & budget-friendly', 'Dependable comfort with standard efficiency.'],
        ['enhanced', 'Balanced performance', 'Better efficiency, comfort, and noise control.'],
        ['premium', 'Maximum efficiency', 'Premium comfort and energy-saving features.']
      ]
    },
    {
      key: 'repairIssue',
      when: a => a.projectType === 'repair',
      eyebrow: 'System issue',
      title: 'What is your system doing?',
      subtitle: 'Choose the main symptom you’re experiencing.',
      options: [
        ['no-cooling', 'Not cooling', 'The system runs but the home stays warm.'],
        ['no-heating', 'Not heating', 'The system runs but the home stays cold.'],
        ['not-running', 'Not running at all', 'The equipment will not start.'],
        ['noise-leak', 'Noise, odor, or leak', 'Something unusual needs inspection.'],
        ['other', 'Something else', 'A technician can diagnose the issue.']
      ]
    },
    {
      key: 'systemAge',
      when: a => a.projectType === 'repair',
      eyebrow: 'System age',
      title: 'How old is the equipment?',
      subtitle: 'Age can affect repair options and part availability.',
      options: [
        ['under-5', 'Under 5 years', 'Newer equipment.'],
        ['5-10', '5–10 years', 'Mid-life equipment.'],
        ['11-15', '11–15 years', 'Older equipment.'],
        ['over-15', 'Over 15 years', 'Near or beyond typical service life.'],
        ['unknown', 'I’m not sure', 'We’ll determine age during the visit.']
      ]
    },
    {
      key: 'serviceDetail',
      when: a => ['maintenance', 'air-quality'].includes(a.projectType),
      eyebrow: 'Project details',
      title: 'What service are you interested in?',
      subtitle: 'Choose the closest match for a preliminary range.',
      dynamicOptions: a => a.projectType === 'maintenance' ? [
        ['single-tuneup', 'One-system tune-up', 'Seasonal inspection and maintenance.'],
        ['two-tuneup', 'Two-system tune-up', 'Maintenance for two HVAC systems.'],
        ['plan', 'Maintenance plan', 'Ongoing preventive service and priority care.']
      ] : [
        ['duct-repair', 'Duct repair or sealing', 'Address leaks, damage, or airflow issues.'],
        ['duct-replace', 'Ductwork replacement', 'Replace aging or poorly designed ductwork.'],
        ['air-quality', 'Indoor air quality', 'Filtration, purification, or humidity options.'],
        ['airflow', 'Comfort or airflow issue', 'Diagnose hot spots and uneven airflow.']
      ]
    },
    {
      key: 'urgency',
      eyebrow: 'Timing',
      title: 'When do you need help?',
      subtitle: 'Emergency service is available 24/7.',
      options: [
        ['emergency', 'As soon as possible', 'My system is down or the issue is urgent.'],
        ['week', 'Within a week', 'I’d like to schedule service soon.'],
        ['month', 'Within a month', 'I’m planning and comparing options.'],
        ['researching', 'Just researching', 'I’m gathering information for later.']
      ]
    }
  ];

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap');
    :host{--navy:#0F2440;--deep:#0A1A30;--orange:#F5821F;--orange-dark:#D96D0E;--cyan:#5BC6E8;--ink:#16283E;--muted:#5C7590;--line:#D7DFE8;--pale:#F4F7FA;display:block;font-family:Barlow,Arial,sans-serif;color:var(--ink);font-size:16px}
    *{box-sizing:border-box}.shell{max-width:980px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(6,18,34,.18);overflow:hidden;border:1px solid #e3eaf0}.top{background:var(--navy);padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px}.logo{height:54px;width:auto;display:block}.trust{color:#c7d6e6;font-size:13px;text-align:right;line-height:1.45}.trust strong{color:#fff;display:block}.progress{height:5px;background:#dfe7ee}.progress span{display:block;height:100%;background:var(--orange);transition:width .3s ease}.body{padding:44px 48px 48px;min-height:510px}.eyebrow{color:var(--orange);font-weight:700;text-transform:uppercase;letter-spacing:1.8px;font-size:13px;margin-bottom:9px}h2{font-family:'Barlow Condensed',Arial,sans-serif;color:var(--navy);text-transform:uppercase;font-size:38px;line-height:1.05;margin:0 0 9px;letter-spacing:.3px}.subtitle{color:var(--muted);font-size:16px;margin:0 0 28px}.options{display:grid;grid-template-columns:1fr 1fr;gap:13px}.option{appearance:none;width:100%;font:inherit;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:18px 44px 18px 18px;cursor:pointer;position:relative;color:var(--ink);transition:.15s}.option:hover,.option:focus{border-color:var(--cyan);box-shadow:0 5px 16px rgba(15,36,64,.09);outline:none;transform:translateY(-1px)}.option.selected{border-color:var(--orange);background:#fff8f2}.option strong{display:block;color:var(--navy);font-size:17px;margin-bottom:4px}.option small{display:block;color:var(--muted);font-size:13.5px;line-height:1.35}.arrow{position:absolute;right:17px;top:50%;transform:translateY(-50%);color:var(--orange);font-size:22px}.nav{display:flex;justify-content:space-between;align-items:center;margin-top:30px}.back{border:0;background:none;color:var(--muted);font:600 15px Barlow,Arial;cursor:pointer;padding:10px 0}.back:hover{color:var(--navy)}.result{background:linear-gradient(135deg,var(--deep),var(--navy));border-radius:12px;padding:28px;color:#fff;margin:22px 0}.result-label{color:var(--cyan);text-transform:uppercase;letter-spacing:1.5px;font-size:12px;font-weight:700}.price{font:700 48px/1 'Barlow Condensed',Arial;margin:8px 0}.result p{color:#c7d6e6;margin:0;line-height:1.5}.notice{font-size:12.5px;color:var(--muted);line-height:1.45;margin:12px 0 24px}.lead{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field label{font-weight:600;color:var(--navy);font-size:14px}.field input,.field textarea{width:100%;font:15px Barlow,Arial;border:1.5px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ink);outline:none}.field input:focus,.field textarea:focus{border-color:var(--cyan)}.field textarea{min-height:82px;resize:vertical}.submit{grid-column:1/-1;border:0;border-radius:9px;padding:15px 22px;background:var(--orange);color:#fff;font:700 16px Barlow,Arial;cursor:pointer;box-shadow:0 5px 16px rgba(245,130,31,.32)}.submit:hover{background:var(--orange-dark)}.submit:disabled{opacity:.65;cursor:wait}.error{grid-column:1/-1;color:#b42318;font-size:14px}.success{text-align:center;padding:55px 20px}.check{width:62px;height:62px;margin:0 auto 18px;border-radius:50%;background:#eaf8ee;color:#16823b;display:grid;place-items:center;font-size:30px;font-weight:700}.success a{display:inline-block;margin-top:18px;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px}@media(max-width:650px){.top{padding:16px 18px}.logo{height:43px}.trust{display:none}.body{padding:30px 20px 34px;min-height:0}h2{font-size:32px}.options,.lead{grid-template-columns:1fr}.field.full,.submit{grid-column:auto}.price{font-size:40px}}
  `;

  function visibleQuestions() { return questions.filter(q => !q.when || q.when(state.answers)); }
  function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value); }
  function calculate() {
    const a = state.answers;
    let low = 0, high = 0, label = 'Preliminary project range';
    if (a.projectType === 'replacement') {
      const systems = { complete:[9500,16500], 'heat-pump':[10500,18500], 'ac-only':[6200,10500], 'furnace-only':[4800,8500], 'mini-split':[5500,14500] };
      const size = { 'under-1200':.88, '1200-1800':1, '1800-2500':1.18, 'over-2500':1.42 }[a.homeSize] || 1;
      const efficiency = { standard:1, enhanced:1.18, premium:1.42 }[a.efficiency] || 1;
      [low, high] = systems[a.systemType] || [7500,15000]; low *= size * efficiency; high *= size * efficiency;
      low = Math.round(low / 100) * 100; high = Math.round(high / 100) * 100;
    } else if (a.projectType === 'repair') {
      const repairs = { 'no-cooling':[180,2200], 'no-heating':[180,1900], 'not-running':[180,2500], 'noise-leak':[180,1800], other:[180,2400] };
      [low, high] = repairs[a.repairIssue] || [180,2400]; label = 'Typical diagnostic & repair range';
    } else if (a.projectType === 'maintenance') {
      const maintenance = { 'single-tuneup':[89,189], 'two-tuneup':[175,349], plan:[180,450] };
      [low, high] = maintenance[a.serviceDetail] || [89,450]; label = 'Typical service range';
    } else {
      const iaq = { 'duct-repair':[450,2800], 'duct-replace':[3500,12000], 'air-quality':[650,3500], airflow:[180,1800] };
      [low, high] = iaq[a.serviceDetail] || [180,12000]; label = 'Preliminary project range';
    }
    state.estimate = { low, high, label, currency: 'USD' };
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
    if (window.google?.maps?.places) return Promise.resolve(window.google);
    if (googleMapsPromise) return googleMapsPromise;
    googleMapsPromise = new Promise((resolve, reject) => {
      const callback = `infinityAirMapsReady${Date.now()}`;
      window[callback] = () => { delete window[callback]; resolve(window.google); };
      const mapsScript = document.createElement('script');
      mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsKey)}&libraries=places&callback=${callback}`;
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
      const autocomplete = new google.maps.places.Autocomplete(input, { types:['address'], componentRestrictions:{ country:'us' }, fields:['address_components'] });
      autocomplete.addListener('place_changed', () => {
        const components = autocomplete.getPlace().address_components || [];
        const get = type => components.find(component => component.types.includes(type));
        const number = get('street_number')?.long_name || '';
        const route = get('route')?.long_name || '';
        input.value = [number, route].filter(Boolean).join(' ');
        root.querySelector('#ia-city').value = get('locality')?.long_name || get('sublocality')?.long_name || '';
        root.querySelector('#ia-state').value = get('administrative_area_level_1')?.short_name || '';
        root.querySelector('#ia-zip').value = get('postal_code')?.long_name || '';
      });
    } catch (error) {
      console.warn('Infinity Air address autocomplete:', error.message);
    }
  }
  function renderResult() {
    calculate();
    root.innerHTML = `<style>${styles}</style><div class="shell">${header(100)}<main class="body"><div class="eyebrow">Your estimate is ready</div><h2>Where should we send your estimate?</h2><p class="subtitle">Enter your details below to view your personalized project range.</p><form class="lead"><div class="field"><label for="ia-first-name">First name *</label><input id="ia-first-name" name="firstName" autocomplete="given-name" required></div><div class="field"><label for="ia-last-name">Last name *</label><input id="ia-last-name" name="lastName" autocomplete="family-name" required></div><div class="field"><label for="ia-phone">Phone *</label><input id="ia-phone" name="phone" type="tel" autocomplete="tel" required></div><div class="field"><label for="ia-email">Email</label><input id="ia-email" name="email" type="email" autocomplete="email"></div><div class="field full"><label for="ia-address">Street address</label><input id="ia-address" name="address" autocomplete="address-line1"></div><div class="field"><label for="ia-city">City</label><input id="ia-city" name="city" autocomplete="address-level2"></div><div class="field"><label for="ia-state">State</label><input id="ia-state" name="state" autocomplete="address-level1" maxlength="2" placeholder="CA"></div><div class="field"><label for="ia-zip">ZIP code</label><input id="ia-zip" name="zip" autocomplete="postal-code" inputmode="numeric"></div><div class="field full"><label for="ia-notes">Anything else we should know?</label><textarea id="ia-notes" name="notes" maxlength="500"></textarea></div><div class="error" hidden></div><button class="submit" type="submit">See My Estimate</button></form><div class="nav"><button class="back" type="button">← Change answers</button></div></main></div>`;
    root.querySelector('.back').addEventListener('click', () => { state.step = Math.max(0, visibleQuestions().length - 1); renderQuestion(); });
    root.querySelector('.lead').addEventListener('submit', submitLead);
    initAddressAutocomplete();
  }
  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('.submit'), error = form.querySelector('.error');
    const data = Object.fromEntries(new FormData(form));
    const payload = { event: 'estimator.completed', submittedAt: new Date().toISOString(), source: config.source, contact: data, answers: state.answers, estimate: state.estimate };
    error.hidden = true; button.disabled = true; button.textContent = 'Sending…';
    try {
      if (!config.webhookUrl) throw new Error('Webhook URL is not configured.');
      const response = await fetch(config.webhookUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
      const e = state.estimate;
      root.innerHTML = `<style>${styles}</style><div class="shell">${header(100)}<main class="body"><div class="eyebrow">Your personalized estimate</div><h2>Thank you, ${escapeHtml(data.firstName)}.</h2><p class="subtitle">Based on the details you shared, here’s a realistic starting range.</p><div class="result"><div class="result-label">${e.label}</div><div class="price">${money(e.low)}–${money(e.high)}</div><p>Final pricing depends on an on-site evaluation, equipment selection, access, permits, and project requirements.</p></div><p class="notice">This is a planning estimate, not a binding quote. Infinity Air will confirm your options and provide upfront pricing before work begins.</p><a class="submit" href="tel:+19099752391" style="display:block;text-align:center;text-decoration:none">Call ${config.phone}</a></main></div>`;
      mount.dispatchEvent(new CustomEvent('infinity-air:completed', { detail: payload }));
    } catch (err) {
      error.textContent = `${err.message} Please call ${config.phone} or try again.`; error.hidden = false; button.disabled = false; button.textContent = 'See My Estimate';
    }
  }
  function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
  renderQuestion();
})();
