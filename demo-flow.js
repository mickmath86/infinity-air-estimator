(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InfinityAirDemoFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TIER_ORDER = ['bronze', 'silver', 'gold'];
  const FAMILY_ORDER = ['gas-split', 'heat-pump-split', 'heat-pump-package', 'mini-split'];
  const FAMILY_COPY = {
    'gas-split': ['Gas furnace + AC split', 'Gas heat with a split air conditioner.'],
    'heat-pump-split': ['Heat pump split', 'All-electric heating and cooling, indoors and outdoors.'],
    'heat-pump-package': ['Package unit', 'Heating and cooling in one cabinet, often on a roof or a slab.'],
    'mini-split': ['Ductless mini-split', 'Sized by the rooms it serves. The book has no Bronze, Silver, and Gold tiers for this, so Ryan quotes it.']
  };

  function lib() {
    if (typeof module === 'object' && module.exports) return require('./estimator-model.js');
    return globalThis.InfinityAirEstimatorModel;
  }

  function customerText(value) {
    return String(value || '')
      .replace(/\bAC\s*Pro\b/gi, ' ')
      .replace(/\bwith\s+Core\s+FAU\b/gi, ' ')
      .replace(/\bR-?\d{2,4}[a-z]?\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .trim();
  }

  function tonHeading(tons) {
    return `${tons}-ton system, sized from the top of your home's square-footage range and rounded up to a whole ton. Tons measure cooling capacity, not weight.`;
  }

  function seriesNames(text) {
    const byLetter = new Map();
    const pattern = /\b([A-Za-z]{1,3})[\s-]*series(?:\s+inverter)?/gi;
    const source = String(text || '');
    let match = pattern.exec(source);
    while (match) {
      const name = match[1].toUpperCase();
      if (name !== 'AC') {
        const label = /inverter/i.test(match[0]) ? `${name} series inverter` : `${name} series`;
        const current = byLetter.get(name);
        if (!current || (label.includes('inverter') && !current.includes('inverter'))) byLetter.set(name, label);
      }
      match = pattern.exec(source);
    }
    return [...byLetter.values()];
  }

  function climateForZip(zip, config) {
    const code = String(zip || '').replace(/\D/g, '').slice(0, 5);
    if ((config.coastalZips || []).includes(code)) {
      return { id: 'coastal', zip: code, sqftPerTon: config.coastalSqftPerTon, listed: true };
    }
    return {
      id: 'inland',
      zip: code,
      sqftPerTon: config.inlandSqftPerTon,
      listed: (config.inlandZips || []).includes(code)
    };
  }

  function tonnageChoicesForSqft(sqft, sqftPerTon) {
    const feet = Number(sqft);
    const ratio = Number(sqftPerTon);
    if (!(feet > 0) || !(ratio > 0)) return [];
    const raw = feet / ratio;
    const up = Math.ceil(raw - 1e-9);
    const down = Math.floor(raw + 1e-9);
    if (up < 1) return [];
    if (down >= 1 && down !== up) return [down, up];
    return [up];
  }

  function roundedUpTon(sqft, sqftPerTon) {
    const feet = Number(sqft);
    const ratio = Number(sqftPerTon);
    if (!(feet > 0) || !(ratio > 0)) return null;
    const ton = Math.ceil(feet / ratio - 1e-9);
    return ton >= 1 ? ton : null;
  }

  function tonnageChoicesForRange(low, high, sqftPerTon) {
    // One ton, from the top of the range. `low` stays in the signature so a range can be passed through unchanged.
    void low;
    const ton = roundedUpTon(high, sqftPerTon);
    return ton ? [ton] : [];
  }

  function roundUpToOfferedTon(ton, available) {
    const offered = [...new Set((available || []).filter(value => Number.isInteger(value) && value >= 1))].sort((left, right) => left - right);
    if (!Number.isInteger(ton) || ton < 1) return [];
    if (!offered.length) return [ton];
    if (offered.includes(ton)) return [ton];
    const nextUp = offered.find(value => value >= ton);
    return [nextUp == null ? offered[offered.length - 1] : nextUp];
  }

  function availableWholeTons(items, family, brand) {
    const tons = new Set();
    for (const item of items) {
      if (!item.tierCandidate || item.family !== family || item.brand !== brand || !item.tonnage) continue;
      const start = Math.ceil(item.tonnage.min - 1e-9);
      const end = Math.floor(item.tonnage.max + 1e-9);
      for (let ton = start; ton <= end; ton += 1) if (ton >= 1) tons.add(ton);
    }
    return [...tons].sort((left, right) => left - right);
  }

  function clampTons(tons, available) {
    const offered = [...new Set(available.filter(ton => Number.isInteger(ton) && ton >= 1))].sort((left, right) => left - right);
    if (!offered.length) return [];
    const snapped = tons.map(ton => {
      if (offered.includes(ton)) return ton;
      const bounded = Math.min(offered[offered.length - 1], Math.max(offered[0], ton));
      if (offered.includes(bounded)) return bounded;
      return offered.reduce((best, candidate) => {
        const score = Math.abs(candidate - bounded);
        const bestScore = Math.abs(best - bounded);
        if (score < bestScore || (score === bestScore && candidate < best)) return candidate;
        return best;
      }, offered[0]);
    });
    return [...new Set(snapped)].sort((left, right) => left - right);
  }

  function catalogBrand(family, choice) {
    if (choice === 'american-standard') return 'american-standard';
    return family === 'heat-pump-package' ? 'packaged' : 'ac-pro';
  }

  function isTieredFamily(family) {
    return ['gas-split', 'heat-pump-split', 'heat-pump-package'].includes(family);
  }

  function systemFamilies(items) {
    const ids = new Set();
    for (const item of items) {
      if (item.commercial || !item.family) continue;
      if (item.tierCandidate) ids.add(item.family);
      else if (item.family === 'mini-split' && !item.serviceVisit && !item.componentOnly) ids.add(item.family);
    }
    return FAMILY_ORDER.filter(id => ids.has(id));
  }

  function addonItems(items, config) {
    const pool = (items || []).filter(item => lib().isCustomerAddonCandidate(item, config));
    return lib().standardizeDuplicateOptions(pool).items;
  }

  function ductworkOffer(config) {
    const spec = config && config.ductworkPerRun;
    const unitPrice = spec ? Number(spec.pricePerRun) : 0;
    if (!spec || !(unitPrice > 0)) return null;
    return {
      uuid: spec.id || 'ductwork-per-run',
      category: 'Ducting',
      name: spec.name || 'Ductwork',
      description: spec.description || 'Extra duct runs. Each run is priced separately.',
      price: unitPrice,
      unitPrice,
      quantityAddon: true,
      synthetic: true,
      tonnage: null,
      priceFrom: false
    };
  }

  function ductRunCount(answers, config) {
    const spec = config && config.ductworkPerRun;
    const max = spec && spec.maxRuns > 0 ? Math.floor(spec.maxRuns) : 20;
    const value = Number(answers && answers.ductRuns);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(max, Math.floor(value));
  }

  function offersDuctworkRuns(config, answers) {
    if (!ductworkOffer(config)) return false;
    if (!answers || answers.projectType !== 'replacement') return false;
    if (answers.systemFamily === 'mini-split') return false;
    return true;
  }

  function ductworkSelection(config, answers) {
    if (!offersDuctworkRuns(config, answers)) return null;
    const quantity = ductRunCount(answers, config);
    if (quantity < 1) return null;
    const offer = ductworkOffer(config);
    return { ...offer, quantity, unitPrice: offer.unitPrice, price: offer.unitPrice * quantity };
  }

  function addonStepItems(items, config, answers) {
    const book = addonItems(items, config);
    if (!offersDuctworkRuns(config, answers)) return book;
    return [ductworkOffer(config)].concat(book);
  }

  function mixedTotalLabel(amount, callForQuote, fromPrice) {
    const money = lib().money;
    const known = amount > 0 ? amount : 0;
    if (callForQuote && known > 0) return `at least ${money(known)} plus call for quote`;
    if (callForQuote || !(known > 0)) return 'Call for quote';
    if (fromPrice) return `from ${money(known)}`;
    return money(known);
  }

  // Bronze, Silver, Gold stay the tier names. When Silver costs more than the matching Gold,
  // that ton is ordered from the lower price to the higher price so the middle card is not the expensive one.
  function orderTierCards(tiers) {
    const list = (tiers || []).slice();
    const silver = list.find(tier => tier.tier === 'silver');
    const gold = list.find(tier => tier.tier === 'gold');
    const inverted = Boolean(silver && gold && silver.systemPrice > 0 && gold.systemPrice > 0 && silver.systemPrice > gold.systemPrice);
    if (!inverted) return { tiers: list, priceOrderNote: '', silverAboveGold: false };
    const rank = { bronze: 0, silver: 1, gold: 2 };
    const ordered = list.slice().sort((left, right) => {
      const leftPrice = left.systemPrice > 0 ? left.systemPrice : Number.POSITIVE_INFINITY;
      const rightPrice = right.systemPrice > 0 ? right.systemPrice : Number.POSITIVE_INFINITY;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return (rank[left.tier] ?? 9) - (rank[right.tier] ?? 9);
    });
    return {
      tiers: ordered,
      silverAboveGold: true,
      priceOrderNote: 'Shown from the lower price to the higher price. For this size the Silver system costs more than the Gold system, so the cards are not in Bronze, Silver, Gold order.'
    };
  }

  function selectedRange(config, answers) {
    return (config.squareFootageRanges || []).find(range => range.id === answers.homeSize) || null;
  }

  function recommendedTons(items, config, answers) {
    const range = selectedRange(config, answers);
    const climate = climateForZip(answers.zip, config);
    if (!range || !climate.sqftPerTon) return { climate, tons: [] };
    const raw = tonnageChoicesForRange(range.low, range.high, climate.sqftPerTon);
    const family = answers.systemFamily;
    const brand = catalogBrand(family, answers.brand || 'value');
    const available = availableWholeTons(items, family, brand);
    const ton = raw.find(value => Number.isInteger(value));
    if (!ton) return { climate, tons: [] };
    return { climate, tons: available.length ? roundUpToOfferedTon(ton, available) : [ton] };
  }

  function tierLabel(config, tier, family) {
    if (tier === 'gold' && family === 'gas-split') return config.goldGasTierLabel || 'Gold';
    return (config.tierLabels && config.tierLabels[tier]) || tier;
  }

  function describeSystem(item, tier, family, config) {
    const copy = (config.tierCopy && config.tierCopy[tier]) || {};
    const extracted = seriesNames(`${item ? item.name : ''} ${item ? item.description : ''}`);
    const series = customerText(extracted.length ? extracted.join(' · ') : (copy.fallbackSeries || 'System'));
    const benefit = family === 'gas-split' && tier === 'gold' ? (copy.gasBenefit || copy.benefit || '') : (copy.benefit || '');
    return { series, benefit: customerText(benefit) };
  }

  function addonApplies(item, tons) {
    if (!item.tonnage) return true;
    return tons + 1e-9 >= item.tonnage.min && tons - 1e-9 <= item.tonnage.max;
  }

  function moneyOrQuote(price) {
    return price > 0 ? lib().money(price) : 'Call for quote';
  }

  const ADDON_CATEGORY_LABELS = {
    Ducting: 'Ductwork',
    IAQ: 'Indoor air quality',
    'Thermostats and Controls': 'Thermostats'
  };
  const IAQ_CATEGORY_NOTE = 'Indoor air quality means how clean the air inside your home is. These add-ons filter or clean the air that moves through your heating and cooling system.';

  function addonCategoryLabel(config, category) {
    const labels = (config && config.addonCategoryLabels) || {};
    if (labels[category]) return labels[category];
    return ADDON_CATEGORY_LABELS[category] || category;
  }

  function addonCategoryNote(config, category) {
    const notes = (config && config.addonCategoryNotes) || {};
    if (Object.prototype.hasOwnProperty.call(notes, category)) return notes[category] || '';
    return String(category || '').toLowerCase() === 'iaq' ? IAQ_CATEGORY_NOTE : '';
  }

  function addonDescription(item, config) {
    if (item && item.synthetic && item.description) return item.description;
    const byId = (config && config.addonDescriptions) || {};
    if (item && byId[item.uuid]) return byId[item.uuid];
    const name = String(item && item.name || '').toLowerCase();
    const category = String(item && item.category || '');
    for (const rule of (config && config.addonDescriptionFallbacks) || []) {
      if (rule.keyword && name.includes(String(rule.keyword).toLowerCase())) return rule.text;
      if (rule.category && category.toLowerCase() === String(rule.category).toLowerCase()) return rule.text;
    }
    if (category.toLowerCase() === 'iaq') return 'A filter or cleaner for the air that moves through the heating and cooling system.';
    if (category.toLowerCase() === 'ducting') return 'Ductwork or a duct accessory for air moving through the home.';
    if (category.toLowerCase() === 'thermostats and controls') return 'A control for the heating and cooling system.';
    return 'An optional extra for the heating and cooling system.';
  }

  function addonCopy(item, config) {
    return {
      categoryLabel: addonCategoryLabel(config, item && item.category),
      categoryNote: addonCategoryNote(config, item && item.category),
      description: addonDescription(item, config)
    };
  }

  function addonAppliesToAnswers(item, items, config, answers) {
    if (!item || !answers || answers.projectType !== 'replacement') return false;
    if (!item.tonnage) return true;
    const sizing = recommendedTons(items, config, answers);
    if (!sizing.tons.length) return false;
    return sizing.tons.some(tons => addonApplies(item, tons));
  }

  function applicableAddonIds(items, config, answers) {
    const byId = new Map(addonItems(items, config).map(item => [item.uuid, item]));
    return (answers && answers.addons || []).filter(id => addonAppliesToAnswers(byId.get(id), items, config, answers));
  }

  function pruneAddonAnswers(items, config, answers) {
    const next = { ...(answers || {}) };
    next.addons = applicableAddonIds(items, config, next);
    if (offersDuctworkRuns(config, next)) next.ductRuns = ductRunCount(next, config);
    else delete next.ductRuns;
    return next;
  }

  function answersAfterChange(items, config, answers, key, value) {
    const nextAnswers = { ...(answers || {}) };
    const ductRuns = nextAnswers.ductRuns;
    if (Array.isArray(nextAnswers.addons)) nextAnswers.addons = nextAnswers.addons.slice();
    nextAnswers[key] = value;
    const questions = visibleQuestions(items, config, nextAnswers);
    const index = questions.findIndex(item => item.key === key);
    const keep = new Set(questions.slice(0, Math.max(index, 0) + 1).map(item => item.key));
    if (questions.some(item => item.key === 'addons')) keep.add('addons');
    for (const answerKey of Object.keys(nextAnswers)) {
      if (!keep.has(answerKey)) delete nextAnswers[answerKey];
    }
    if (!Array.isArray(nextAnswers.addons)) nextAnswers.addons = [];
    if (!keep.has('addons')) nextAnswers.addons = [];
    else nextAnswers.addons = applicableAddonIds(items, config, nextAnswers);
    if (keep.has('addons') && offersDuctworkRuns(config, nextAnswers)) nextAnswers.ductRuns = ductRunCount({ ductRuns }, config);
    return nextAnswers;
  }

  function questionDefinitions(items, config) {
    const families = systemFamilies(items);
    const addons = addonItems(items, config);
    return [
      {
        key: 'propertyType',
        kind: 'cards',
        summaryLabel: 'Property',
        eyebrow: 'Let’s get started',
        title: 'Is this for a home or a business?',
        subtitle: 'Residential replacements can show price-book options. Commercial estimates are coming soon.',
        options: () => [
          ['residential', 'Residential', 'A house, condo, or other home.', {}],
          ['commercial', 'Commercial', 'Contact Ryan. Commercial pricing is not on this form yet.', { muted: true, badge: 'Coming soon' }]
        ]
      },
      {
        key: 'projectType',
        kind: 'cards',
        summaryLabel: 'Project',
        eyebrow: 'Project',
        title: 'Replacement or repair?',
        subtitle: 'A replacement can show equipment options. A repair needs a visit, so Ryan will follow up.',
        when: answers => answers.propertyType === 'residential',
        options: () => [
          ['replacement', 'Replacement', 'Replace the heating and cooling system.'],
          ['repair', 'Repair', 'The system needs service. An on-site visit is required.']
        ]
      },
      {
        key: 'zip',
        kind: 'zip',
        summaryLabel: 'ZIP code',
        eyebrow: 'Location',
        title: 'What is the home’s ZIP code?',
        subtitle: 'Your ZIP sets a starting size: about 500 sq. ft. per ton near the Orange County coast, and about 400 inland. Infinity Air confirms the size on site.',
        when: answers => answers.propertyType === 'residential' && answers.projectType === 'replacement'
      },
      {
        key: 'systemFamily',
        kind: 'cards',
        summaryLabel: 'Current system',
        eyebrow: 'Current system',
        title: 'What kind of system is in the home?',
        subtitle: 'These are the system types in the current price book.',
        when: answers => answers.projectType === 'replacement' && families.length > 0,
        options: () => families.map(id => [id, ...FAMILY_COPY[id]])
      },
      {
        key: 'homeSize',
        kind: 'cards',
        summaryLabel: 'Home size',
        eyebrow: 'Home size',
        title: 'About how large is the home?',
        subtitle: 'We size from the top of the range, round up to one whole ton, and stay within the sizes in the price book. No half tons.',
        when: answers => answers.projectType === 'replacement' && Boolean(answers.systemFamily),
        options: () => (config.squareFootageRanges || []).map(range => [range.id, range.label, 'Whole-ton options are calculated from this range and the ZIP.'])
      },
      {
        key: 'miniSplitZones',
        kind: 'cards',
        summaryLabel: 'Mini-split rooms',
        eyebrow: 'Rooms',
        title: 'How many rooms or zones need a mini-split?',
        subtitle: 'This is only asked for a ductless system.',
        when: answers => answers.projectType === 'replacement' && answers.systemFamily === 'mini-split',
        options: () => [
          ['1', 'One room', 'A single zone.'],
          ['2', 'Two rooms', 'Two zones.'],
          ['3', 'Three rooms', 'Three zones.'],
          ['4', 'Four or more rooms', 'A larger multi-zone project.']
        ]
      },
      {
        key: 'systemAge',
        kind: 'cards',
        summaryLabel: 'System age',
        eyebrow: 'System age',
        title: 'How old is the equipment?',
        subtitle: 'Age helps Ryan plan the visit. It does not change the price-book total.',
        when: answers => answers.projectType === 'replacement',
        options: () => [
          ['under-5', 'Under 5 years', 'Newer equipment.'],
          ['5-10', '5–10 years', 'Mid-life equipment.'],
          ['11-15', '11–15 years', 'Older equipment.'],
          ['over-15', 'Over 15 years', 'Near the end of a typical service life.'],
          ['unknown', 'Not sure', 'Ryan can confirm on site.']
        ]
      },
      {
        key: 'addons',
        kind: 'addons',
        summaryLabel: 'Add-ons',
        eyebrow: 'Add-ons',
        title: 'Any add-ons or extras?',
        subtitle: 'Choose any that fit this home. Ductwork is priced per run. A blank price becomes Call for quote. When the book lists the same add-on more than once, one starting price is shown.',
        when: answers => answers.projectType === 'replacement' && (addons.length > 0 || offersDuctworkRuns(config, answers)),
        items: answers => addonStepItems(items, config, answers)
      },
      {
        key: 'brand',
        kind: 'brands',
        summaryLabel: 'Equipment preference',
        eyebrow: 'Equipment',
        title: 'Which equipment do you want to compare?',
        subtitle: 'AC Pro (Value Line) can show Bronze, Silver, and Gold from the price book. American Standard is the Premium Line and stays call for quote until it can be priced.',
        when: answers => answers.projectType === 'replacement' && isTieredFamily(answers.systemFamily),
        options: () => [
          ['value', config.valueLineLabel || 'AC Pro (Value Line)', 'Mid-tier equipment with strong efficiency for the price.', { features: config.valueLineFeatures || [] }],
          ['american-standard', 'American Standard', config.americanStandardPricesEnabled ? 'Premium equipment, priced from the price book.' : 'Premium equipment. Call for a quote.', {
            features: config.americanStandardFeatures || [],
            kicker: config.premiumLineLabel || 'Premium Line',
            badge: config.americanStandardPricesEnabled ? (config.premiumLineLabel || 'Premium Line') : 'Call for quote',
            premium: true
          }]
        ]
      }
    ];
  }

  function visibleQuestions(items, config, answers) {
    return questionDefinitions(items, config).filter(question => !question.when || question.when(answers || {}));
  }

  function buildTier(items, config, family, brand, tons, tier, selectedAddons) {
    const model = lib();
    const matched = model.matchTiers(items, { family, brand, tons }).tiers.find(entry => entry.tier === tier) || null;
    const source = matched ? items.find(item => item.uuid === matched.uuid) : null;
    const described = describeSystem(source, tier, family, config);
    const systemPrice = source && source.price > 0 ? source.price : null;
    const applicable = selectedAddons.filter(item => addonApplies(item, tons));
    const lines = applicable.map(item => {
      const quantity = item.quantityAddon ? (item.quantity > 0 ? item.quantity : 0) : 1;
      const unitPrice = item.quantityAddon
        ? (item.unitPrice > 0 ? item.unitPrice : null)
        : (item.price > 0 ? item.price : null);
      const extended = unitPrice > 0 && quantity > 0 ? unitPrice * quantity : null;
      const baseName = customerText(item.name);
      let lineLabel = 'Call for quote';
      if (extended > 0 && item.quantityAddon && quantity > 1) lineLabel = `${quantity} × ${model.money(unitPrice)}`;
      else if (extended > 0 && item.priceFrom) lineLabel = `from ${model.money(extended)}`;
      else if (extended > 0) lineLabel = model.money(extended);
      return {
        uuid: item.uuid,
        name: baseName,
        displayName: item.quantityAddon && quantity > 1 ? `${baseName} (${quantity} runs)` : baseName,
        price: extended,
        unitPrice: unitPrice > 0 ? unitPrice : null,
        quantity: quantity > 0 ? quantity : 1,
        priceFrom: Boolean(item.priceFrom),
        quantityAddon: Boolean(item.quantityAddon),
        lineLabel,
        callForQuote: !(extended > 0)
      };
    });
    const knownAddons = lines.filter(line => line.price > 0).reduce((sum, line) => sum + line.price, 0);
    const addonQuote = lines.some(line => line.callForQuote);
    const addonFrom = lines.some(line => line.priceFrom);
    const addonsSubtotal = lines.length ? {
      amount: knownAddons,
      callForQuote: addonQuote,
      priceFrom: addonFrom,
      label: mixedTotalLabel(knownAddons, addonQuote, addonFrom)
    } : null;
    const knownTotal = (systemPrice > 0 ? systemPrice : 0) + knownAddons;
    const needsQuote = !(systemPrice > 0) || addonQuote;
    const total = !needsQuote && knownTotal > 0 ? knownTotal : null;
    return {
      tier,
      label: tierLabel(config, tier, family),
      series: described.series,
      benefit: described.benefit,
      systemPrice,
      systemName: source ? customerText(source.name) : '',
      systemUuid: source ? source.uuid : '',
      addons: lines,
      addonsSubtotal,
      total,
      knownTotal: knownTotal > 0 ? knownTotal : null,
      totalLabel: mixedTotalLabel(knownTotal, needsQuote, addonFrom && !needsQuote),
      callForQuote: needsQuote,
      warnings: model.matchTiers(items, { family, brand, tons }).warnings.filter(warning => warning.message.includes(tier))
    };
  }

  // Housecall Pro gets a tier only with a firm total. HighLevel estimates (allowCallForQuote)
  // also get a tier whose add-ons include call-for-quote items: the known lines are priced
  // and the estimate terms say the rest is quoted separately.
  function hcpPackages(groups, { allowCallForQuote = false } = {}) {
    const packages = [];
    for (const group of groups) {
      for (const tier of group.tiers) {
        if (!(tier.systemPrice > 0)) continue;
        if (!(tier.total > 0) && !(allowCallForQuote && tier.callForQuote)) continue;
        const lineItems = [{
          name: tier.systemName || tier.series,
          description: [tier.series, tier.benefit].filter(Boolean).join('. '),
          quantity: 1,
          unitPrice: tier.systemPrice,
          priceUnit: 'dollars'
        }];
        for (const addon of tier.addons) {
          if (!(addon.unitPrice > 0) || !(addon.quantity > 0) || addon.callForQuote) continue;
          lineItems.push({
            name: addon.quantityAddon ? 'Ductwork' : addon.name,
            description: addon.priceFrom
              ? 'Starting price. The price book lists more than one row for this item.'
              : (addon.quantityAddon ? 'Priced per duct run.' : 'Price-book add-on'),
            quantity: addon.quantity,
            unitPrice: addon.unitPrice,
            priceUnit: 'dollars'
          });
        }
        packages.push({ name: `${tier.label} ${group.tons} ton`, tier: tier.tier, label: tier.label, tons: group.tons, callForQuote: Boolean(tier.callForQuote), lineItems });
      }
    }
    return packages;
  }

  function buildProposal(items, config, answers) {
    const responses = answers || {};
    if (responses.propertyType === 'commercial') return leadResult('commercial');
    if (responses.projectType === 'repair') return leadResult('repair');
    if (responses.projectType !== 'replacement') return leadResult('incomplete');
    if (responses.brand === 'american-standard' && !config.americanStandardPricesEnabled) return leadResult('american-standard');
    if (!isTieredFamily(responses.systemFamily)) return leadResult(responses.systemFamily === 'mini-split' ? 'mini-split' : 'unpriced-system');
    const brand = catalogBrand(responses.systemFamily, responses.brand || 'value');
    const sizing = recommendedTons(items, config, { ...responses, brand: responses.brand || 'value' });
    if (!sizing.tons.length) return { ...leadResult('no-ton'), climate: sizing.climate };
    const selected = addonItems(items, config).filter(item => (responses.addons || []).includes(item.uuid));
    const ductLine = ductworkSelection(config, responses);
    const selectedWithDuct = ductLine ? selected.concat([ductLine]) : selected;
    const warnings = [];
    const groups = sizing.tons.map(tons => {
      const tiers = TIER_ORDER.map(tier => {
        const card = buildTier(items, config, responses.systemFamily, brand, tons, tier, selectedWithDuct);
        warnings.push(...card.warnings);
        return card;
      });
      const ordered = orderTierCards(tiers);
      return { tons, tiers: ordered.tiers, priceOrderNote: ordered.priceOrderNote, silverAboveGold: ordered.silverAboveGold };
    });
    const packages = hcpPackages(groups);
    return {
      status: packages.length ? 'price' : 'lead',
      reason: packages.length ? 'tiers' : 'no-priced-tier',
      groups,
      packages,
      estimatePackages: hcpPackages(groups, { allowCallForQuote: true }),
      warnings,
      climate: sizing.climate,
      tons: sizing.tons
    };
  }

  function leadResult(reason) {
    return { status: 'lead', reason, groups: [], packages: [], warnings: [], climate: null, tons: [] };
  }

  function optionLabel(question, answers, value) {
    if (!question.options) return value;
    const option = question.options(answers).find(entry => entry[0] === value);
    return option ? option[1] : value;
  }

  function selectionSummary(items, config, answers, proposal) {
    const completed = answers || {};
    const lines = [];
    for (const question of questionDefinitions(items, config)) {
      const value = completed[question.key];
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (question.key === 'addons') {
        const names = applicableAddonIds(items, config, completed)
          .map(id => addonItems(items, config).find(item => item.uuid === id))
          .filter(Boolean)
          .map(item => customerText(item.priceFrom ? `${item.name} from ${lib().money(item.price)}` : item.name));
        const runs = offersDuctworkRuns(config, completed) ? ductRunCount(completed, config) : 0;
        if (runs > 0) {
          const unit = config.ductworkPerRun.pricePerRun;
          names.unshift(`Ductwork: ${runs} ${runs === 1 ? 'run' : 'runs'} at ${lib().money(unit)} per run`);
        }
        if (names.length) lines.push(`Add-ons: ${names.join('; ')}`);
        continue;
      }
      if (question.key === 'brand') {
        lines.push(`Equipment: ${value === 'american-standard' ? 'American Standard (Premium Line)' : (config.valueLineLabel || 'AC Pro (Value Line)')}`);
        continue;
      }
      lines.push(`${question.summaryLabel}: ${question.kind === 'zip' ? value : optionLabel(question, completed, value)}`);
    }
    if (proposal && proposal.climate) {
      lines.push(`Sizing guide: ${proposal.climate.sqftPerTon} sq. ft. per ton (${proposal.climate.id}${proposal.climate.listed ? '' : ', ZIP not on the list'})`);
    }
    if (proposal && proposal.tons && proposal.tons.length) lines.push(`Whole tons offered: ${proposal.tons.join(' and ')}`);
    for (const group of (proposal && proposal.groups) || []) {
      lines.push(`${group.tons} ton options: ${group.tiers.map(tier => `${tier.label} ${tier.totalLabel || (tier.callForQuote ? 'call for quote' : lib().money(tier.total))}`).join('; ')}`);
      if (group.priceOrderNote) lines.push(group.priceOrderNote);
    }
    return lines.join('\n');
  }

  return {
    customerText,
    tonHeading,
    seriesNames,
    climateForZip,
    tonnageChoicesForSqft,
    tonnageChoicesForRange,
    roundUpToOfferedTon,
    availableWholeTons,
    clampTons,
    catalogBrand,
    addonItems,
    addonStepItems,
    ductRunCount,
    ductworkOffer,
    offersDuctworkRuns,
    mixedTotalLabel,
    orderTierCards,
    addonCopy,
    addonAppliesToAnswers,
    applicableAddonIds,
    pruneAddonAnswers,
    answersAfterChange,
    recommendedTons,
    questionDefinitions,
    visibleQuestions,
    buildProposal,
    selectionSummary,
    moneyOrQuote,
    FAMILY_COPY
  };
});
