(() => {
  if (typeof module !== 'undefined' && module.exports) {
    const model = require('./estimator-model.js');
    module.exports = {
      buildHcpLineItems: model.buildHcpLineItems,
      buildHcpLineItemPackages: model.buildHcpLineItemPackages,
      buildHcpOptions: model.buildHcpOptions
    };
    return;
  }

  const widgetScript = document.currentScript;
  const widgetSrc = widgetScript && widgetScript.src;

  function endpointFromScript(pathname) {
    try {
      if (widgetSrc && /^https?:/.test(widgetSrc)) return new URL(pathname, widgetSrc).href;
    } catch (error) { /* use the relative path below */ }
    return pathname;
  }

  const configAttr = {
    webhookUrl: widgetScript?.dataset.webhookUrl || '',
    housecallEndpoint: widgetScript?.dataset.housecallEndpoint || endpointFromScript('/api/create-housecall-estimate'),
    pricebookEndpoint: widgetScript?.dataset.pricebookEndpoint || endpointFromScript('/api/pricebook'),
    googleMapsKey: widgetScript?.dataset.googleMapsKey || '',
    preview: widgetScript?.dataset.preview === 'true',
    phone: widgetScript?.dataset.phone || '(909) 975-2391',
    source: widgetScript?.dataset.source || window.location.href
  };

  const mount = document.querySelector(widgetScript?.dataset.target || '#infinity-air-estimator');
  if (!mount) return;
  const root = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount;
  const state = { step: 0, answers: { addons: [] }, items: [], config: null };
  let googleMapsPromise;
  let model;
  let flow;

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap');
    :host{--navy:#0F2440;--deep:#0A1A30;--orange:#F5821F;--orange-dark:#D96D0E;--cyan:#5BC6E8;--ink:#16283E;--muted:#5C7590;--line:#D7DFE8;display:block;font-family:Barlow,Arial,sans-serif;color:var(--ink);font-size:16px}
    *{box-sizing:border-box}.shell{max-width:980px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(6,18,34,.18);overflow:hidden;border:1px solid #e3eaf0}.top{background:var(--navy);padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px}.logo{height:54px;width:auto;display:block}.trust{color:#c7d6e6;font-size:13px;text-align:right;line-height:1.45}.trust strong{color:#fff;display:block}.progress{height:5px;background:#dfe7ee}.progress span{display:block;height:100%;background:var(--orange);transition:width .3s ease}.body{padding:44px 48px 48px;min-height:510px}.eyebrow{color:var(--orange);font-weight:700;text-transform:uppercase;letter-spacing:1.8px;font-size:13px;margin-bottom:9px}h2,h3{font-family:'Barlow Condensed',Arial,sans-serif;color:var(--navy);text-transform:uppercase;letter-spacing:.3px}h2{font-size:38px;line-height:1.05;margin:0 0 9px}h3{font-size:28px;margin:8px 0 12px}.subtitle{color:var(--muted);font-size:16px;margin:0 0 28px}.options{display:grid;grid-template-columns:1fr 1fr;gap:13px}.option{appearance:none;width:100%;font:inherit;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:18px 44px 18px 18px;cursor:pointer;position:relative;color:var(--ink);transition:.15s}.option:hover,.option:focus{border-color:var(--cyan);box-shadow:0 5px 16px rgba(15,36,64,.09);outline:none;transform:translateY(-1px)}.option.selected{border-color:var(--orange);background:#fff8f2}.option strong{display:block;color:var(--navy);font-size:17px;margin-bottom:4px}.option small{display:block;color:var(--muted);font-size:13.5px;line-height:1.35}.option.coming-soon{background:#f6f8fb;color:#6d7f93}.option.coming-soon strong{color:#6d7f93}.badge{display:inline-block;margin-top:8px;background:#e7edf4;color:#5c7590;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-radius:999px;padding:4px 8px}.features{margin:8px 0 0;padding-left:18px}.features li{margin:4px 0;color:var(--ink)}.arrow{position:absolute;right:17px;top:18px;color:var(--orange);font-size:22px}.nav{display:flex;justify-content:space-between;align-items:center;margin-top:30px}.back{border:0;background:none;color:var(--muted);font:600 15px Barlow,Arial;cursor:pointer;padding:10px 0}.back:hover{color:var(--navy)}.ton-block{margin:0 0 22px}.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:13px;align-items:stretch}.tier{border:1.5px solid var(--line);border-radius:12px;padding:18px;background:#fff;display:flex;flex-direction:column;gap:8px;height:100%}.tier-bronze{border-color:#A56B3C;background:#FBF6F1}.tier-silver{border-color:#B7C0C8;background:#F4F6F8}.tier-gold{border-color:#C6A15B;background:#FFF8EC}.tier-kicker{font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;letter-spacing:.4px;text-transform:uppercase;line-height:1}.tier-bronze .tier-kicker,.tier-bronze .money{color:#7A4E24}.tier-silver .tier-kicker,.tier-silver .money{color:#5C6770}.tier-gold .tier-kicker,.tier-gold .money{color:#8A6110}.series{margin:0;font-weight:700;color:var(--navy)}.benefit,.addon-lines{margin:0;color:var(--muted);font-size:13.5px;line-height:1.45}.price-row{display:flex;justify-content:space-between;gap:12px;font-size:14px}.price-row.total{border-top:1px solid var(--line);padding-top:8px;font-weight:700;color:var(--navy);margin-top:auto}.addon-lines{padding-left:16px}.result{background:linear-gradient(135deg,var(--deep),var(--navy));border-radius:12px;padding:28px;color:#fff;margin:0 0 22px}.result p{color:#c7d6e6;margin:0;line-height:1.5}.notice{font-size:12.5px;color:var(--muted);line-height:1.45;margin:12px 0 24px}.option.premium{background:linear-gradient(180deg,#0F2440 0%,#17365f 100%);border-color:#C6A15B;color:#fff;box-shadow:0 12px 28px rgba(15,36,64,.28)}.option.premium strong{color:#fff;font-size:20px}.option.premium small,.option.premium .features li{color:#d5e2ef}.option.premium .arrow{color:#e7c56a}.option.premium:hover,.option.premium:focus{border-color:#e7c56a;box-shadow:0 14px 30px rgba(15,36,64,.32)}.option.premium .badge{background:#e7c56a;color:#1a1408}.premium-kicker{display:inline-block;margin:0 0 6px;background:#e7c56a;color:#1a1408;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:4px 8px}.qty{display:flex;align-items:center;gap:10px;margin-top:10px}.qty button{width:36px;height:36px;border-radius:8px;border:1.5px solid var(--line);background:#fff;color:var(--navy);font:700 20px Barlow,Arial;cursor:pointer;padding:0}.qty button:hover{border-color:var(--orange)}.qty strong{min-width:1.5ch;font-size:18px;color:var(--navy)}.disclaimer{margin:16px 0 8px;padding:14px 16px;border:2px solid #8A6110;background:#FFF8EC;border-radius:10px}.disclaimer strong{display:block;color:var(--navy);font-size:14px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}.disclaimer p{margin:0;color:#3d4f63;font-size:14.5px;line-height:1.5}.price-row{align-items:baseline}.price-row>span{white-space:nowrap}.price-row .money{text-align:right}.tier-note{margin:0 0 12px;color:#7A4E24;font-size:14px;line-height:1.45}.lead{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field label{font-weight:600;color:var(--navy);font-size:14px}.field input,.field textarea{width:100%;font:15px Barlow,Arial;border:1.5px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ink);outline:none}.field input:focus,.field textarea:focus{border-color:var(--cyan)}.field textarea{min-height:82px;resize:vertical}.submit{grid-column:1/-1;border:0;border-radius:9px;padding:15px 22px;background:var(--orange);color:#fff;font:700 16px Barlow,Arial;cursor:pointer;box-shadow:0 5px 16px rgba(245,130,31,.32)}.submit:hover{background:var(--orange-dark)}.submit:disabled{opacity:.65;cursor:wait}.error{grid-column:1/-1;color:#b42318;font-size:14px}.call{display:block;text-align:center;text-decoration:none}.cat{grid-column:1/-1;margin:8px 0 0;color:var(--navy);font-weight:700}@media(max-width:650px){.top{padding:16px 18px}.logo{height:43px}.trust{display:none}.body{padding:30px 20px 34px;min-height:0}h2{font-size:32px}.options,.lead,.tiers{grid-template-columns:1fr}.field.full,.submit{grid-column:auto}}h3.ton-heading{text-transform:none;font-family:Barlow,Arial,sans-serif;font-size:18px;font-weight:600;letter-spacing:0;line-height:1.35;margin:0 0 12px}.product-name{margin:0;font-weight:700;color:var(--navy);font-size:16px;line-height:1.35}.error{background:#fef3f2;border:1px solid #fecdca;border-radius:8px;padding:10px 12px;line-height:1.45}.cat{margin:18px 0 0}.cat-label{font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;letter-spacing:.3px;text-transform:uppercase;line-height:1}.cat-note{margin:6px 0 0;color:var(--muted);font-size:14.5px;line-height:1.45;font-weight:400;max-width:68ch}.addon-desc{display:block;color:var(--ink);font-size:13.5px;line-height:1.4;margin-top:2px}.addon-price{display:block;margin-top:6px;font-weight:600;color:var(--navy)}
  `;

  const leadCopy = {
    commercial: 'Commercial estimates are coming soon. Share your phone and email and Ryan will follow up. There is no price on this path.',
    repair: 'A repair needs an on-site visit, so this form does not build an estimate. Ryan will contact you.',
    'american-standard': 'American Standard is the Premium Line. It is call for quote until that equipment can be priced. Share how to reach you and Infinity Air will follow up.',
    'mini-split': 'The price book does not list Bronze, Silver, and Gold mini-split tiers. Ryan will quote the rooms you selected.',
    'unpriced-system': 'This system does not have Bronze, Silver, and Gold rows in the price book yet. Ryan will follow up.',
    'no-ton': 'The size guide did not land on a tonnage in the price book. Ryan will follow up.',
    'no-priced-tier': 'The matching price-book rows do not have a usable price. Ryan will quote this selection.',
    incomplete: 'Ryan will follow up.'
  };

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(file, widgetSrc || window.location.href).href;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Estimator files failed to load.'));
      document.head.appendChild(script);
    });
  }

  async function loadLibraries() {
    if (!window.InfinityAirEstimatorModel) await loadScript('estimator-model.js');
    if (!window.InfinityAirDemoFlow) await loadScript('demo-flow.js');
    if (!window.InfinityAirEstimatorModel || !window.InfinityAirDemoFlow) throw new Error('Estimator files failed to load.');
    model = window.InfinityAirEstimatorModel;
    flow = window.InfinityAirDemoFlow;
  }

  function visible() { return flow.visibleQuestions(state.items, state.config, state.answers); }
  function proposal() { return flow.buildProposal(state.items, state.config, state.answers); }
  function header(progress) {
    return `<div class="top"><img class="logo" src="https://infinityairservices.com/wp-content/themes/infinity-air-child/assets/img/logo.png" alt="Infinity Air Heating and Cooling"><div class="trust"><strong>Free estimates · Honest pricing</strong>Licensed, bonded & insured · C-20 #1134070</div></div><div class="progress"><span style="width:${progress}%"></span></div>`;
  }
  function shell(progress, body) { root.innerHTML = `<style>${styles}</style><div class="shell">${header(progress)}<main class="body">${body}</main></div>`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function priceText(price) { return price > 0 ? model.money(price) : 'Call for quote'; }

  function advance(key, value) {
    state.answers = flow.answersAfterChange(state.items, state.config, state.answers, key, value);
    const next = visible();
    state.step = next.findIndex(item => item.key === key) + 1;
    render();
  }

  function render() {
    const list = visible();
    if (state.step >= list.length) return renderFinish();
    const question = list[state.step];
    if (question.kind === 'zip') return renderZip(list, question);
    if (question.kind === 'addons') return renderAddons(list, question);
    renderCards(list, question);
  }

  function disclaimerMarkup() {
    const text = (state.config && state.config.quoteDisclaimer) || 'This is not a binding quote and it is not a contract. Infinity Air confirms the final price in writing after an on-site visit.';
    return `<aside class="disclaimer"><strong>Not a binding quote</strong><p>${escapeHtml(text)}</p></aside>`;
  }

  function sizeDescription(option) {
    const range = state.config.squareFootageRanges.find(entry => entry.id === option[0]);
    if (!range || !state.answers.zip) return option[2] || '';
    const sizing = flow.recommendedTons(state.items, state.config, { ...state.answers, homeSize: option[0] });
    if (!sizing.tons.length) return option[2] || '';
    return `Shows the ${sizing.tons[0]} ton option`;
  }

  function renderCards(list, question) {
    const subtitle = question.subtitle;
    const options = question.options(state.answers).map(option => {
      const meta = option[3] || {};
      const description = question.key === 'homeSize' ? sizeDescription(option) : (option[2] || '');
      const features = (meta.features || []).map(feature => `<li>${escapeHtml(feature)}</li>`).join('');
      const className = ['option', state.answers[question.key] === option[0] ? 'selected' : '', meta.muted ? 'coming-soon' : '', meta.premium ? 'premium' : ''].filter(Boolean).join(' ');
      const kicker = meta.kicker ? `<span class="premium-kicker">${escapeHtml(meta.kicker)}</span>` : '';
      return `<button class="${className}" data-value="${escapeHtml(option[0])}">${kicker}<strong>${escapeHtml(option[1])}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ''}${features ? `<ul class="features">${features}</ul>` : ''}${meta.badge ? `<span class="badge">${escapeHtml(meta.badge)}</span>` : ''}<span class="arrow">›</span></button>`;
    }).join('');
    shell((state.step / list.length) * 100, `
      <div class="eyebrow">${escapeHtml(question.eyebrow)} · Step ${state.step + 1} of ${list.length}</div>
      <h2>${escapeHtml(question.title)}</h2>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
      <div class="options">${options}</div>
      <div class="nav">${state.step ? '<button class="back" type="button">← Back</button>' : '<span></span>'}</div>`);
    root.querySelectorAll('.option').forEach(element => element.addEventListener('click', () => advance(question.key, element.dataset.value)));
    root.querySelector('.back')?.addEventListener('click', () => { state.step -= 1; render(); });
  }

  function renderZip(list, question) {
    shell((state.step / list.length) * 100, `
      <div class="eyebrow">${escapeHtml(question.eyebrow)} · Step ${state.step + 1} of ${list.length}</div>
      <h2>${escapeHtml(question.title)}</h2>
      <p class="subtitle">${escapeHtml(question.subtitle)}</p>
      <form class="lead">
        <div class="field full"><label for="ia-zip-code">ZIP code</label><input id="ia-zip-code" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="10" placeholder="91761" value="${escapeHtml(state.answers.zip || '')}" required></div>
        <div class="error" hidden></div>
        <button class="submit" type="submit">Continue</button>
      </form>
      <div class="nav">${state.step ? '<button class="back" type="button">← Back</button>' : '<span></span>'}</div>`);
    root.querySelector('.back')?.addEventListener('click', () => { state.step -= 1; render(); });
    root.querySelector('.lead').addEventListener('submit', event => {
      event.preventDefault();
      const zip = String(new FormData(event.currentTarget).get('zip') || '').replace(/\D/g, '').slice(0, 5);
      const error = event.currentTarget.querySelector('.error');
      if (zip.length !== 5) {
        error.textContent = 'Enter a 5-digit ZIP code.';
        error.hidden = false;
        return;
      }
      advance('zip', zip);
    });
  }

  function renderAddons(list, question) {
    state.answers.addons = flow.applicableAddonIds(state.items, state.config, state.answers);
    const selected = new Set(state.answers.addons);
    const visibleItems = question.items(state.answers).filter(item => item.quantityAddon || flow.addonAppliesToAnswers(item, state.items, state.config, state.answers));
    const runs = flow.ductRunCount(state.answers, state.config);
    let category = '';
    const cards = visibleItems.map(item => {
      const copy = flow.addonCopy(item, state.config);
      const heading = item.category !== category
        ? `<div class="cat"><div class="cat-label">${escapeHtml(copy.categoryLabel)}</div>${copy.categoryNote ? `<p class="cat-note">${escapeHtml(copy.categoryNote)}</p>` : ''}</div>`
        : '';
      category = item.category;
      if (item.quantityAddon) {
        const selectedClass = runs > 0 ? 'selected' : '';
        const extended = runs > 0 ? ` · ${runs} ${runs === 1 ? 'run' : 'runs'} · ${model.money(item.price * runs)}` : '';
        return `${heading}<div class="option ${selectedClass}"><strong>${escapeHtml(item.name)}</strong><small class="addon-desc">${escapeHtml(copy.description)}</small><small class="addon-price">${escapeHtml(model.money(item.price))} per run${escapeHtml(extended)}</small><div class="qty"><button type="button" data-qty="-1" aria-label="Fewer duct runs">−</button><strong>${runs}</strong><button type="button" data-qty="1" aria-label="More duct runs">+</button></div></div>`;
      }
      const priceLabel = item.priceFrom && item.price > 0 ? `from ${model.money(item.price)}` : priceText(item.price);
      return `${heading}<button class="option ${selected.has(item.uuid) ? 'selected' : ''}" type="button" data-value="${escapeHtml(item.uuid)}"><strong>${escapeHtml(flow.customerText(item.name))}</strong><small class="addon-desc">${escapeHtml(copy.description)}</small><small class="addon-price">${escapeHtml(priceLabel)}</small></button>`;
    }).join('');
    shell((state.step / list.length) * 100, `
      <div class="eyebrow">${escapeHtml(question.eyebrow)} · Step ${state.step + 1} of ${list.length}</div>
      <h2>${escapeHtml(question.title)}</h2>
      <p class="subtitle">${escapeHtml(question.subtitle)}</p>
      <div class="options">${cards}</div>
      <button class="submit" type="button" style="margin-top:18px">Continue</button>
      <div class="nav"><button class="back" type="button">← Back</button></div>`);
    root.querySelectorAll('.option[data-value]').forEach(element => element.addEventListener('click', () => {
      const id = element.dataset.value;
      const current = new Set(state.answers.addons || []);
      if (current.has(id)) current.delete(id); else current.add(id);
      state.answers.addons = [...current];
      renderAddons(list, question);
    }));
    root.querySelectorAll('[data-qty]').forEach(element => element.addEventListener('click', () => {
      const max = (state.config.ductworkPerRun && state.config.ductworkPerRun.maxRuns) || 20;
      const next = Math.max(0, Math.min(max, runs + Number(element.dataset.qty)));
      state.answers.ductRuns = next;
      renderAddons(list, question);
    }));
    root.querySelector('.submit').addEventListener('click', () => advance('addons', state.answers.addons || []));
    root.querySelector('.back').addEventListener('click', () => { state.step -= 1; render(); });
  }

  function tierCard(tier) {
    const addonList = tier.addons.map(addon => `<li>${escapeHtml(addon.displayName || addon.name)}: ${escapeHtml(addon.lineLabel || priceText(addon.price))}</li>`).join('');
    const addonRow = tier.addonsSubtotal
      ? `<div class="price-row"><span>Add-ons</span><strong class="money">${escapeHtml(tier.addonsSubtotal.label || priceText(tier.addonsSubtotal.amount))}</strong></div>${addonList ? `<ul class="addon-lines">${addonList}</ul>` : ''}`
      : '';
    return `<article class="tier tier-${escapeHtml(tier.tier)}"><div class="tier-kicker">${escapeHtml(tier.label)}</div>${tier.systemName ? `<p class="product-name">${escapeHtml(tier.systemName)}</p>` : ''}<p class="series">${escapeHtml(tier.series)}</p><p class="benefit">${escapeHtml(tier.benefit)}</p><div class="price-row"><span>System</span><strong class="money">${escapeHtml(priceText(tier.systemPrice))}</strong></div>${addonRow}<div class="price-row total"><span>Total</span><strong class="money">${escapeHtml(tier.totalLabel || priceText(tier.total))}</strong></div></article>`;
  }

  function leadFields(buttonLabel, { emailRequired = false } = {}) {
    return `<form class="lead">
      <div class="field"><label for="ia-first-name">First name *</label><input id="ia-first-name" name="firstName" autocomplete="given-name" required></div>
      <div class="field"><label for="ia-last-name">Last name *</label><input id="ia-last-name" name="lastName" autocomplete="family-name" required></div>
      <div class="field"><label for="ia-phone">Phone *</label><input id="ia-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(909) 555-1234" maxlength="14" required></div>
      <div class="field"><label for="ia-email">Email${emailRequired ? ' *' : ''}</label><input id="ia-email" name="email" type="email" autocomplete="email"${emailRequired ? ' required' : ''}></div>
      <div class="field full"><label for="ia-address">Street address</label><input id="ia-address" name="address" autocomplete="address-line1"></div>
      <div class="field"><label for="ia-city">City</label><input id="ia-city" name="city" autocomplete="address-level2"></div>
      <div class="field"><label for="ia-state">State</label><input id="ia-state" name="state" autocomplete="address-level1" maxlength="2" placeholder="CA"></div>
      <div class="field"><label for="ia-zip">ZIP code</label><input id="ia-zip" name="zip" autocomplete="postal-code" inputmode="numeric" value="${escapeHtml(state.answers.zip || '')}"></div>
      <div class="field full"><label for="ia-notes">Anything else we should know?</label><textarea id="ia-notes" name="notes" maxlength="500"></textarea></div>
      <div class="error" role="alert" hidden></div>
      <button class="submit" type="submit">${escapeHtml(buttonLabel)}</button>
    </form>`;
  }

  function wireLeadForm() {
    root.querySelector('.back')?.addEventListener('click', () => { state.step = Math.max(0, visible().length - 1); render(); });
    root.querySelector('.lead').addEventListener('submit', submitLead);
    root.querySelector('#ia-phone').addEventListener('input', event => { event.target.value = formatUsPhoneForDisplay(event.target.value); });
    initAddressAutocomplete();
  }

  function pricedResultsMarkup(quote) {
    const tiers = quote.groups.map(group => `<section class="ton-block"><h3 class="ton-heading">${escapeHtml(flow.tonHeading(group.tons))}</h3>${group.priceOrderNote ? `<p class="tier-note">${escapeHtml(group.priceOrderNote)}</p>` : ''}<div class="tiers">${group.tiers.map(tierCard).join('')}</div></section>`).join('');
    return `${tiers}
      ${disclaimerMarkup()}`;
  }

  function renderPricedResults(firstName, preview, emailedTo, debugNote) {
    const quote = proposal();
    const emailNote = emailedTo ? `<p class="notice">We also emailed your Bronze, Silver, and Gold estimates to ${escapeHtml(emailedTo)}.</p>` : '';
    shell(100, `
      <div class="eyebrow">Request received</div>
      <h2>Thank you, ${escapeHtml(firstName)}.</h2>
      <p class="subtitle">${preview ? 'Preview only. Nothing was sent to Infinity Air. These are the options for the answers you entered.' : 'Ryan has your options. Prices come from the current price book. Labor is included. Call for an official quote before work begins.'}</p>
      ${emailNote}
      ${debugNote ? `<p class="notice">${escapeHtml(debugNote)}</p>` : ''}
      ${pricedResultsMarkup(quote)}
      <a class="submit call" href="tel:+19099752391">Call ${escapeHtml(configAttr.phone)}</a>
      <div class="nav"><button class="back" type="button">← Change answers</button></div>`);
    root.querySelector('.back').addEventListener('click', () => { state.step = Math.max(0, visible().length - 1); render(); });
  }

  function renderFinish() {
    const quote = proposal();
    for (const warning of quote.warnings || []) console.warn('Infinity Air price book conflict', warning);
    const priced = quote.groups && quote.groups.length;
    if (priced) {
      shell(100, `
        <div class="eyebrow">Your details</div>
        <h2>Where should we send your options?</h2>
        <p class="subtitle">Tell us how to reach you. Bronze, Silver, and Gold prices are shown after this is sent.</p>
        ${disclaimerMarkup()}
        ${leadFields('Send and see my options', { emailRequired: true })}
        <div class="nav"><button class="back" type="button">← Change answers</button></div>`);
      wireLeadForm();
      return;
    }
    const message = leadCopy[quote.reason] || leadCopy.incomplete;
    const repairIcon = quote.reason === 'repair' ? '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" focusable="false" style="display:inline-block;vertical-align:-5px;margin-right:8px"><path fill="#F5821F" d="M12 2.2 1.2 21h21.6L12 2.2zm1.1 14.3h-2.2v-2.2h2.2v2.2zm0-4h-2.2V8.5h2.2v4z"/></svg>' : '';
    shell(100, `
      <div class="eyebrow">Contact Ryan</div>
      <h2>How should Ryan reach you?</h2>
      <p class="subtitle">${escapeHtml(message)}</p>
      <div class="result"><p>${repairIcon}${escapeHtml(message)}</p></div>
      <p class="notice">Call Ryan at ${escapeHtml(configAttr.phone)} or send your details below.</p>
      <h2 style="font-size:32px;margin-top:8px">Your details</h2>
      ${leadFields('Contact Ryan')}
      <div class="nav"><button class="back" type="button">← Change answers</button></div>`);
    wireLeadForm();
  }

  function loadGoogleMaps() {
    if (!configAttr.googleMapsKey || /^(YOUR|PASTE_)/.test(configAttr.googleMapsKey)) return Promise.resolve(null);
    if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
    if (googleMapsPromise) return googleMapsPromise;
    googleMapsPromise = new Promise((resolve, reject) => {
      const callback = `infinityAirMapsReady${Date.now()}`;
      window[callback] = () => { delete window[callback]; resolve(window.google); };
      const mapsScript = document.createElement('script');
      mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(configAttr.googleMapsKey)}&v=weekly&loading=async&callback=${callback}`;
      mapsScript.async = true;
      mapsScript.onerror = () => { delete window[callback]; reject(new Error('Google Maps failed to load.')); };
      document.head.appendChild(mapsScript);
    });
    return googleMapsPromise;
  }

  async function initAddressAutocomplete() {
    const input = root.querySelector('#ia-address');
    if (!input || !configAttr.googleMapsKey || /^(YOUR|PASTE_)/.test(configAttr.googleMapsKey)) return;
    try {
      const google = await loadGoogleMaps();
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      const autocomplete = new PlaceAutocompleteElement({ includedRegionCodes: ['us'] });
      autocomplete.style.width = '100%';
      input.hidden = true;
      input.before(autocomplete);
      autocomplete.addEventListener('gmp-select', async event => {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ['addressComponents'] });
        const components = place.addressComponents || [];
        const get = type => components.find(component => component.types.includes(type));
        input.value = [get('street_number')?.longText, get('route')?.longText].filter(Boolean).join(' ');
        root.querySelector('#ia-city').value = get('locality')?.longText || get('sublocality_level_1')?.longText || '';
        root.querySelector('#ia-state').value = get('administrative_area_level_1')?.shortText || '';
        root.querySelector('#ia-zip').value = get('postal_code')?.longText || '';
      });
    } catch (error) {
      console.warn('Infinity Air address autocomplete:', error.message);
    }
  }

  function phoneDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
  }
  function formatUsPhoneForDisplay(value) {
    const digits = phoneDigits(value);
    if (digits.length < 4) return digits ? `(${digits}` : '';
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('.submit');
    const error = form.querySelector('.error');
    const data = Object.fromEntries(new FormData(form));
    const phone = phoneDigits(data.phone);
    if (phone.length !== 10) {
      error.textContent = 'Enter a valid 10-digit U.S. phone number.';
      error.hidden = false;
      form.elements.phone.focus();
      return;
    }
    data.phone = phone;
    state.answers = flow.pruneAddonAnswers(state.items, state.config, state.answers);
    const quote = proposal();
    const hcpLineItems = quote.status === 'price' ? model.buildHcpOptions(quote.packages) : [];
    const payload = {
      event: 'estimator.completed',
      submittedAt: new Date().toISOString(),
      source: configAttr.source,
      contact: data,
      answers: state.answers,
      quote_status: quote.status === 'price' ? 'price' : 'lead',
      pricebook_source: state.source,
      pricebook_fetched_at: state.fetchedAt,
      estimate: {
        currency: 'USD',
        label: quote.groups && quote.groups.length ? 'Price book options' : 'Call for quote',
        tons: quote.tons || [],
        groups: (quote.groups || []).map(group => ({
          tons: group.tons,
          tiers: group.tiers.map(tier => ({
            tier: tier.tier,
            label: tier.label,
            series: tier.series,
            systemPrice: tier.systemPrice,
            total: tier.total,
            callForQuote: tier.callForQuote
          }))
        }))
      },
      hcp_line_items: hcpLineItems,
      hcp_line_items_json: JSON.stringify(hcpLineItems),
      // One HighLevel estimate per tier: the system and priced add-ons, with the tier attached.
      // Unlike hcp_line_items this keeps a tier that has call-for-quote add-ons.
      estimate_options: (quote.estimatePackages || []).length
        ? model.buildHcpOptions(quote.estimatePackages).map((option, index) => ({
          tier: quote.estimatePackages[index].tier,
          label: quote.estimatePackages[index].label,
          tons: quote.estimatePackages[index].tons,
          callForQuote: quote.estimatePackages[index].callForQuote,
          ...option
        }))
        : [],
      selection_summary: flow.selectionSummary(state.items, state.config, state.answers, quote)
    };
    error.hidden = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      let preview = configAttr.preview;
      let emailedTo = '';
      let debugNote = '';
      if (!configAttr.preview) {
        const endpoint = configAttr.housecallEndpoint || configAttr.webhookUrl;
        if (!endpoint) throw new Error('No submission endpoint is configured.');
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Submission service returned ${response.status}.`);
        preview = Boolean(body.preview);
        if (['created', 'partial'].includes(body.ghlEstimateStatus)) emailedTo = data.email;
        // Add ?debug to the page URL to see what happened with the HighLevel estimates.
        if (/[?&]debug\b/.test(window.location.search)) {
          debugNote = `HighLevel estimates: ${body.ghlEstimateStatus || 'no status returned'}${body.ghlEstimateReason ? ` (${body.ghlEstimateReason})` : ''}${body.ghlEstimateError ? `. ${body.ghlEstimateError}` : ''}${(body.ghlEstimates || []).length ? `. Created ${body.ghlEstimates.map(e => e.tier).join(', ')}.` : ''}`;
        }
      }
      if (quote.groups && quote.groups.length) renderPricedResults(data.firstName, preview, emailedTo, debugNote);
      else {
        const name = escapeHtml(data.firstName);
        shell(100, `<div class="eyebrow">Request received</div><h2>Thank you, ${name}.</h2><p class="subtitle">${preview ? 'Preview only. Nothing was sent to Infinity Air.' : 'Ryan has your request.'}</p><a class="submit call" href="tel:+19099752391">Call ${escapeHtml(configAttr.phone)}</a>`);
      }
      mount.dispatchEvent(new CustomEvent('infinity-air:completed', { detail: payload }));
    } catch (err) {
      error.textContent = `We could not send your information. ${err.message} You can try again, or call ${configAttr.phone}.`;
      error.hidden = false;
      button.disabled = false;
      button.textContent = quote.groups && quote.groups.length ? 'Send and see my options' : 'Contact Ryan';
    }
  }

  async function start() {
    shell(8, '<p class="subtitle">Loading the price book…</p>');
    try {
      await loadLibraries();
      const response = await fetch(configAttr.pricebookEndpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Price book returned ${response.status}.`);
      const body = await response.json();
      state.items = (body.items || []).map(item => {
        const copy = { ...item };
        delete copy.cost;
        if (!(copy.price > 0)) copy.price = null;
        return copy;
      });
      state.config = body.config;
      state.source = body.source || '';
      state.fetchedAt = body.fetchedAt || '';
      if (!state.items.length || !state.config) throw new Error('The price book did not include equipment data.');
      render();
    } catch (error) {
      console.warn('Infinity Air estimator:', error.message);
      shell(0, `<h2>We could not load the estimator.</h2><p class="subtitle">Please call us at ${escapeHtml(configAttr.phone)} and we will help right away.</p>`);
    }
  }

  start();
})();
