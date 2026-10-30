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
    return String(value || '').replace(/\bAC\s*Pro\b/gi, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
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

  function tonnageChoicesForRange(low, high, sqftPerTon) {
    const tons = new Set();
    for (const sqft of [low, high]) {
      for (const ton of tonnageChoicesForSqft(sqft, sqftPerTon)) tons.add(ton);
    }
    return [...tons].sort((left, right) => left - right);
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
    const categories = new Set((config.addonCategories || []).map(category => category.toLowerCase()));
    return items
      .filter(item => categories.has(String(item.category || '').toLowerCase()) && !item.commercial)
      .slice()
      .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name) || String(left.uuid).localeCompare(String(right.uuid)));
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
    return { climate, tons: available.length ? clampTons(raw, available) : raw.filter(ton => Number.isInteger(ton)) };
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
        subtitle: 'ZIP chooses the sizing guide: 500 sq. ft. per ton near the Orange County coast, 400 inland. The ZIP list is a first pass until Ryan confirms it.',
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
        subtitle: 'Size is rounded up to the next whole ton. If the home could use either of two sizes, both are shown. No half tons.',
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
        subtitle: 'These rows come from the price book. A selected add-on is added to each Bronze, Silver, and Gold option. A blank price becomes Call for quote.',
        when: answers => answers.projectType === 'replacement' && addons.length > 0,
        items: () => addons
      },
      {
        key: 'brand',
        kind: 'brands',
        summaryLabel: 'Equipment preference',
        eyebrow: 'Equipment',
        title: 'Which equipment do you want to compare?',
        subtitle: 'The value line can show Bronze, Silver, and Gold from the price book. American Standard is call for quote until the dealer flag is turned on.',
        when: answers => answers.projectType === 'replacement' && isTieredFamily(answers.systemFamily),
        options: () => [
          ['value', config.valueLineLabel || 'Value line', 'Mid-tier equipment with strong efficiency for the price.', { features: config.valueLineFeatures || [] }],
          ['american-standard', 'American Standard', config.americanStandardPricesEnabled ? 'Premium equipment, priced from the price book.' : 'Premium equipment. Call for quote.', { features: config.americanStandardFeatures || [], badge: config.americanStandardPricesEnabled ? '' : 'Call for quote' }]
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
    const lines = applicable.map(item => ({
      uuid: item.uuid,
      name: customerText(item.name),
      price: item.price > 0 ? item.price : null,
      callForQuote: !(item.price > 0)
    }));
    const knownAddons = lines.filter(line => line.price > 0).reduce((sum, line) => sum + line.price, 0);
    const addonQuote = lines.some(line => line.callForQuote);
    const addonsSubtotal = lines.length ? { amount: knownAddons, callForQuote: addonQuote } : null;
    const total = systemPrice > 0 && !addonQuote ? systemPrice + knownAddons : null;
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
      callForQuote: !(total > 0),
      warnings: model.matchTiers(items, { family, brand, tons }).warnings.filter(warning => warning.message.includes(tier))
    };
  }

  function hcpPackages(groups) {
    const packages = [];
    for (const group of groups) {
      for (const tier of group.tiers) {
        if (!(tier.total > 0) || !(tier.systemPrice > 0)) continue;
        const lineItems = [{
          name: tier.systemName || tier.series,
          description: [tier.series, tier.benefit].filter(Boolean).join('. '),
          quantity: 1,
          unitPrice: tier.systemPrice,
          priceUnit: 'dollars'
        }];
        for (const addon of tier.addons) {
          if (!(addon.price > 0)) continue;
          lineItems.push({ name: addon.name, description: 'Price-book add-on', quantity: 1, unitPrice: addon.price, priceUnit: 'dollars' });
        }
        packages.push({ name: `${tier.label} ${group.tons} ton`, lineItems });
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
    const warnings = [];
    const groups = sizing.tons.map(tons => {
      const tiers = TIER_ORDER.map(tier => {
        const card = buildTier(items, config, responses.systemFamily, brand, tons, tier, selected);
        warnings.push(...card.warnings);
        return card;
      });
      return { tons, tiers };
    });
    const packages = hcpPackages(groups);
    return {
      status: packages.length ? 'price' : 'lead',
      reason: packages.length ? 'tiers' : 'no-priced-tier',
      groups,
      packages,
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
        const names = addonItems(items, config).filter(item => value.includes(item.uuid)).map(item => customerText(item.name));
        if (names.length) lines.push(`Add-ons: ${names.join('; ')}`);
        continue;
      }
      if (question.key === 'brand') {
        lines.push(`Equipment: ${value === 'american-standard' ? 'American Standard' : (config.valueLineLabel || 'Value line')}`);
        continue;
      }
      lines.push(`${question.summaryLabel}: ${question.kind === 'zip' ? value : optionLabel(question, completed, value)}`);
    }
    if (proposal && proposal.climate) {
      lines.push(`Sizing guide: ${proposal.climate.sqftPerTon} sq. ft. per ton (${proposal.climate.id}${proposal.climate.listed ? '' : ', ZIP not on the list'})`);
    }
    if (proposal && proposal.tons && proposal.tons.length) lines.push(`Whole tons offered: ${proposal.tons.join(' and ')}`);
    for (const group of (proposal && proposal.groups) || []) {
      lines.push(`${group.tons} ton options: ${group.tiers.map(tier => `${tier.label} ${tier.callForQuote ? 'call for quote' : lib().money(tier.total)}`).join('; ')}`);
    }
    return lines.join('\n');
  }

  return {
    customerText,
    seriesNames,
    climateForZip,
    tonnageChoicesForSqft,
    tonnageChoicesForRange,
    availableWholeTons,
    clampTons,
    catalogBrand,
    addonItems,
    recommendedTons,
    questionDefinitions,
    visibleQuestions,
    buildProposal,
    selectionSummary,
    moneyOrQuote,
    FAMILY_COPY
  };
});
