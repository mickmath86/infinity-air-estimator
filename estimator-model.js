(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InfinityAirEstimatorModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_DATA_ROWS = 10;
  const TIER_ORDER = ['bronze', 'silver', 'gold'];
  const FAMILY_ORDER = ['heat-pump-split', 'gas-split', 'heat-pump-package', 'mini-split'];
  const TIERED_FAMILIES = ['heat-pump-split', 'gas-split', 'heat-pump-package'];
  const FAMILY_COPY = {
    'heat-pump-split': ['Heat pump split system', 'All-electric heating and cooling, with equipment indoors and outdoors.'],
    'gas-split': ['Gas furnace and air conditioner', 'Gas heat with a split air conditioner. Gold options are dual fuel.'],
    'heat-pump-package': ['Heat pump package unit', 'Heating and cooling in one packaged unit.'],
    'mini-split': ['Ductless mini-split', 'The price book has no Bronze, Silver, or Gold mini-split tier. The team will follow up with a price.']
  };
  const BRAND_LABELS = {
    'ac-pro': 'AC Pro',
    'american-standard': 'American Standard',
    packaged: 'Package equipment',
    standard: 'Standard'
  };

  function parseCsv(input) {
    const text = String(input || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else quoted = false;
        } else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (char !== '\r') field += char;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(cells => cells.some(cell => String(cell).trim()));
  }

  function parsePrice(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const normalized = text.replace(/[$,\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function parseTonnage(name) {
    const text = String(name || '').replace(/,/g, ' ');
    let match = text.match(/(\d+)\s*-\s*(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (match) return { min: Number(match[1]), max: Number(match[2]) + Number(match[3]) / Number(match[4]) };
    match = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*ton\b/i);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
    match = text.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)\s*ton\b/i);
    if (match) {
      const tons = Number(match[1]) + Number(match[2]) / Number(match[3]);
      return { min: tons, max: tons };
    }
    match = text.match(/(\d+(?:\.\d+)?)\s*ton\b/i);
    if (match) return { min: Number(match[1]), max: Number(match[1]) };
    match = text.match(/\b(?:bronze|silver|gold)\s+(\d+(?:\.\d+)?)\b/i);
    if (match) return { min: Number(match[1]), max: Number(match[1]) };
    match = text.match(/(\d+(?:\.\d+)?)\s*btu\b/i);
    if (match) {
      const tons = Number(match[1]) / 12000;
      return tons > 0 ? { min: tons, max: tons } : null;
    }
    match = text.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
    if (match) {
      const tons = Number(match[1]) / 12;
      return tons > 0 ? { min: tons, max: tons } : null;
    }
    return null;
  }

  function detectTier(name) {
    const match = String(name || '').match(/\b(bronze|silver|gold)(?=\b|\d)/i);
    return match ? match[1].toLowerCase() : null;
  }

  function detectBrand(category, name, family) {
    const cat = category.toLowerCase();
    const itemName = name.toLowerCase();
    if (cat.includes('american standard') || itemName.includes('american standard')) return 'american-standard';
    if (cat.includes('ac pro') || itemName.includes('ac pro')) return 'ac-pro';
    if (family === 'heat-pump-package') return 'packaged';
    if (!family) return null;
    const prefix = cat.split(/heat pump|gas split|mini|package/)[0].replace(/[^a-z0-9]+/g, ' ').trim();
    if (prefix && !/^(air conditioning|heater|furnace|other|custom|booking|ducting|maintenance|exhaust|iaq|thermostats and controls)$/.test(prefix)) {
      return slug(prefix);
    }
    return family ? 'standard' : null;
  }

  function classify(category, name) {
    const cat = category.toLowerCase();
    const blob = `${cat} ${name.toLowerCase()}`;
    const commercial = cat.includes('commercial');
    if (commercial) return { commercial: true, family: 'commercial', brand: null };
    let family = null;
    if (/mini[-\s]?split/.test(blob)) family = 'mini-split';
    else if ((/gas split|split system gas/.test(blob) || (/dual fuel/.test(blob) && /split/.test(blob))) && !/heat pump split/.test(cat)) family = 'gas-split';
    else if (/heat pump/.test(blob) && /split/.test(blob)) family = 'heat-pump-split';
    else if (/heat pump/.test(blob) && /package/.test(blob)) family = 'heat-pump-package';
    return { commercial: false, family, brand: detectBrand(category, name, family) };
  }

  function isComponentOnly(name) {
    const text = name.toLowerCase();
    if (/condenser and evaporator|\bevaporator coil\b|x-series condenser/.test(text)) return true;
    if (/\bcondenser\b/.test(text) && !/split system|package unit/.test(text)) return true;
    return false;
  }

  function isServiceVisit(item) {
    if (!(item.price > 0) || item.commercial || item.tierCandidate) return false;
    const name = item.name.toLowerCase();
    const category = item.category.toLowerCase();
    if (/capacitor|motor|transformer|contactor|txv|circuitboard|circuit board|\bcoil\b|compressor|thermostat|fuse|relay|refrigerant|r-410|schrader|disconnect|blower|filter|drain|valve|whip|hard start|coating|permit|hers|exhaust|damper|zone|curb|media|purifier|dehumidifier|tankless|grill|\bduct\b|evaporator|condenser/.test(name)) return false;
    if (/\bcommercial\b/.test(name)) return false;
    if (!/service call|diagnostic|tune-?up|tune up|\brepair\b|preventative maintenance|preventive maintenance|no cooling|not enough cooling|\bno heat\b|not enough heat/.test(name)) return false;
    if (category === 'maintenance') return false;
    if (!['booking', 'air conditioning', 'heater / furnace', 'hcpa', 'custom services'].includes(category)) return false;
    if (category === 'custom services' && !/\brepair\b/.test(name)) return false;
    if (category === 'hcpa' && !/service call/.test(name)) return false;
    return true;
  }

  function normalizePricebook(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(cell => cell.trim().toLowerCase());
    const column = name => header.indexOf(name);
    const indexes = {
      category: column('category'),
      uuid: column('uuid'),
      name: column('name'),
      description: column('description'),
      price: column('price'),
      taskCode: column('task_code')
    };
    if (indexes.name < 0 || indexes.price < 0) throw new Error('Price book is missing name or price columns.');
    return rows.slice(1).map((row, index) => {
      const read = key => indexes[key] < 0 ? '' : String(row[indexes[key]] ?? '');
      const name = cleanText(read('name'));
      if (!name) return null;
      const category = cleanText(read('category'));
      const description = String(read('description') || '').trim();
      const price = parsePrice(read('price'));
      const identity = classify(category, name);
      const tier = detectTier(name);
      const tonnage = parseTonnage(name);
      const componentOnly = isComponentOnly(name);
      const item = {
        uuid: cleanText(read('uuid')) || `row-${index + 2}`,
        category,
        name,
        description,
        price,
        taskCode: cleanText(read('taskCode')),
        family: identity.family,
        brand: identity.brand,
        tier,
        tonnage,
        componentOnly,
        commercial: identity.commercial,
        tierCandidate: false,
        serviceVisit: false
      };
      item.tierCandidate = Boolean(
        !item.commercial && !componentOnly && tier && tonnage && TIERED_FAMILIES.includes(identity.family)
      );
      item.serviceVisit = isServiceVisit(item);
      return item;
    }).filter(Boolean);
  }

  function pricedItems(items) {
    return items.filter(item => item.price > 0);
  }

  function publicItem(item) {
    return {
      uuid: item.uuid,
      category: item.category,
      name: item.name,
      description: item.description,
      price: item.price > 0 ? item.price : null,
      taskCode: item.taskCode,
      family: item.family,
      brand: item.brand,
      tier: item.tier,
      tonnage: item.tonnage,
      componentOnly: item.componentOnly,
      commercial: item.commercial,
      serviceVisit: item.serviceVisit,
      tierCandidate: item.tierCandidate
    };
  }

  function rangesOverlap(left, right) {
    return left.min <= right.max + 1e-9 && right.min <= left.max + 1e-9;
  }

  function tonsFit(tons, tonnage) {
    return tons >= tonnage.min - 1e-9 && tons <= tonnage.max + 1e-9;
  }

  function tierWordCount(name) {
    return (String(name).match(/\b(bronze|silver|gold)(?=\b|\d)/gi) || []).length;
  }

  function preferenceScore(item, family) {
    const width = item.tonnage.max - item.tonnage.min;
    let score = 1000 - width * 100;
    if (tierWordCount(item.name) > 1) score -= 50;
    if (!(item.price > 0)) score -= 500;
    const dualFuel = /dual fuel/i.test(item.name);
    if (family === 'gas-split' && item.tier === 'gold') score += dualFuel ? 80 : 0;
    if (family === 'gas-split' && item.tier !== 'gold') score += dualFuel ? -80 : 40;
    if (/split system|package unit/i.test(item.name)) score += 10;
    return score;
  }

  function chooseItem(candidates, family) {
    return [...candidates].sort((left, right) => {
      const score = preferenceScore(right, family) - preferenceScore(left, family);
      if (score) return score;
      return String(left.uuid).localeCompare(String(right.uuid));
    })[0] || null;
  }

  function isDualFuel(item) {
    return item.family === 'gas-split' && (item.tier === 'gold' || /dual fuel/i.test(item.name));
  }

  function presentTier(item) {
    const dualFuel = isDualFuel(item);
    return {
      tier: item.tier,
      tierLabel: item.tier.charAt(0).toUpperCase() + item.tier.slice(1),
      dualFuel,
      badge: dualFuel ? 'Dual fuel' : '',
      honestLabel: dualFuel ? 'Dual fuel: heat pump with gas furnace backup.' : '',
      name: item.name,
      description: item.description,
      price: item.price,
      uuid: item.uuid,
      category: item.category
    };
  }

  function matchTiers(items, selection) {
    const warnings = [];
    const tiers = TIER_ORDER.map(tier => {
      const candidates = items.filter(item =>
        item.tierCandidate &&
        item.family === selection.family &&
        item.brand === selection.brand &&
        item.tier === tier &&
        item.tonnage &&
        tonsFit(selection.tons, item.tonnage)
      );
      if (!candidates.length) return null;
      const chosen = chooseItem(candidates, selection.family);
      if (candidates.length > 1) {
        warnings.push({
          message: `More than one ${tier} ${selection.family} item matches ${selection.tons} tons for ${selection.brand}.`,
          chosen: { uuid: chosen.uuid, name: chosen.name, price: chosen.price },
          alternatives: candidates
            .filter(item => item.uuid !== chosen.uuid)
            .map(item => ({ uuid: item.uuid, name: item.name, price: item.price }))
        });
      }
      return presentTier(chosen);
    }).filter(Boolean);
    return { tiers, warnings };
  }

  function brandLabel(id) {
    if (BRAND_LABELS[id]) return BRAND_LABELS[id];
    return String(id || 'Equipment').split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function familyCopy(id) {
    if (FAMILY_COPY[id]) return FAMILY_COPY[id];
    const label = brandLabel(id);
    return [label, 'Priced from the current price book.'];
  }

  function serviceItems(items) {
    return items
      .filter(item => item.serviceVisit && item.price > 0)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
  }

  function dedupedServices(items) {
    const byName = new Map();
    for (const item of serviceItems(items)) {
      const key = `${item.category.toLowerCase()}|${item.name.toLowerCase()}`;
      const current = byName.get(key);
      if (!current || item.uuid.localeCompare(current.uuid) < 0) byName.set(key, item);
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
  }

  function installFamilies(items) {
    const ids = new Set();
    for (const item of items) {
      if (!(item.price > 0) || item.commercial || !item.family || item.family === 'commercial') continue;
      if (item.tierCandidate) ids.add(item.family);
      else if (item.family === 'mini-split' && !item.serviceVisit && !item.componentOnly) ids.add(item.family);
    }
    const ordered = FAMILY_ORDER.filter(id => ids.has(id));
    const extras = [...ids].filter(id => !FAMILY_ORDER.includes(id)).sort();
    return ordered.concat(extras);
  }

  function brandsFor(items, family) {
    return [...new Set(items.filter(item => item.tierCandidate && item.family === family).map(item => item.brand || 'standard'))].sort();
  }

  function resolvedBrand(items, answers) {
    if (answers.brand) return answers.brand;
    const brands = brandsFor(items, answers.systemFamily);
    return brands.length === 1 ? brands[0] : null;
  }

  function isTieredFamily(family) {
    return TIERED_FAMILIES.includes(family);
  }

  function sizesFor(items, sizeMap, family, brand) {
    if (!sizeMap || !Array.isArray(sizeMap.mappings) || !brand) return [];
    return sizeMap.mappings.filter(mapping => matchTiers(items, { family, brand, tons: Number(mapping.tons) }).tiers.length > 0);
  }

  function questionDefinitions(items, sizeMap) {
    const families = installFamilies(items);
    const services = dedupedServices(items);
    const projectOptions = [];
    if (families.length) projectOptions.push(['replacement', 'Replace or install a system', 'See the Bronze, Silver, and Gold options the price book lists for your home.']);
    if (services.length) projectOptions.push(['repair', 'Repair, diagnostic, or tune-up', 'A flat service price from the price book.']);
    projectOptions.push(['other', 'Something else', 'Ductwork, parts, or another project. The team will follow up with a price.']);

    return [
      {
        key: 'propertyType',
        summaryLabel: 'Property',
        eyebrow: 'Let’s get started',
        title: 'Is this for a home or a business?',
        subtitle: 'Residential replacements can show price-book options. Commercial projects are quoted by the team.',
        options: () => [
          ['residential', 'Residential', 'A house, condo, or other home.'],
          ['commercial', 'Commercial', 'An office, retail space, or other business. We will follow up with a quote.']
        ]
      },
      {
        key: 'projectType',
        summaryLabel: 'Project',
        eyebrow: 'Project',
        title: 'What do you need help with?',
        subtitle: 'These choices follow the services and systems in the current price book.',
        when: answers => answers.propertyType === 'residential' && projectOptions.length > 1,
        options: () => projectOptions
      },
      {
        key: 'systemFamily',
        summaryLabel: 'System',
        eyebrow: 'System',
        title: 'What kind of system should we price?',
        subtitle: 'Only systems with rows in the price book are listed.',
        when: answers => answers.propertyType === 'residential' && answers.projectType === 'replacement' && families.length > 1,
        options: () => families.map(id => [id, ...familyCopy(id)])
      },
      {
        key: 'brand',
        summaryLabel: 'Brand',
        eyebrow: 'Equipment line',
        title: 'Which equipment line do you want?',
        subtitle: 'Each line is a group of price-book items. We will only show tiers that exist for your home size.',
        when: answers => answers.projectType === 'replacement' && isTieredFamily(answers.systemFamily || onlyFamily(families, answers)) && brandsFor(items, answers.systemFamily || onlyFamily(families, answers)).length > 1,
        options: answers => brandsFor(items, answers.systemFamily || onlyFamily(families, answers)).map(id => [id, brandLabel(id), 'Prices come from this line in the price book.'])
      },
      {
        key: 'homeSize',
        summaryLabel: 'Home size',
        eyebrow: 'Home size',
        title: 'Approximately how large is the home?',
        subtitle: 'Square footage is a starting point for equipment size, not a load calculation. Infinity Air confirms capacity on site. The size guide is maintained separately from the price book.',
        when: answers => {
          const family = answers.systemFamily || onlyFamily(families, answers);
          const brand = resolvedBrand(items, { ...answers, systemFamily: family });
          return answers.projectType === 'replacement' && isTieredFamily(family) && sizesFor(items, sizeMap, family, brand).length > 0;
        },
        options: answers => {
          const family = answers.systemFamily || onlyFamily(families, answers);
          const brand = resolvedBrand(items, { ...answers, systemFamily: family });
          return sizesFor(items, sizeMap, family, brand).map(mapping => [mapping.id, mapping.label, mapping.description || `Starting point: about ${formatTons(mapping.tons)}.`]);
        }
      },
      {
        key: 'serviceItem',
        summaryLabel: 'Service',
        eyebrow: 'Service',
        title: 'Which visit do you need?',
        subtitle: 'Each price is the matching price-book item, not an estimate range.',
        when: answers => answers.projectType === 'repair' && services.length > 1,
        options: () => services.map(item => [item.uuid, item.name, excerpt(item.description) || 'Priced from the price book.'])
      }
    ];
  }

  function onlyFamily(families, answers) {
    if (answers.systemFamily) return answers.systemFamily;
    return families.length === 1 ? families[0] : '';
  }

  function visibleQuestions(items, sizeMap, answers) {
    return questionDefinitions(items, sizeMap).filter(question => !question.when || question.when(answers || {}));
  }

  function excerpt(text, limit = 140) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, limit - 1).replace(/\s+\S*$/, '')}…`;
  }

  function applyDefaults(items, sizeMap, answers) {
    const completed = { ...(answers || {}) };
    const families = installFamilies(items);
    if (completed.projectType === 'replacement' && !completed.systemFamily && families.length === 1) completed.systemFamily = families[0];
    if (completed.projectType === 'replacement' && !completed.brand) {
      const brand = resolvedBrand(items, completed);
      if (brand) completed.brand = brand;
    }
    if (completed.projectType === 'repair' && !completed.serviceItem) {
      const services = dedupedServices(items);
      if (services.length === 1) completed.serviceItem = services[0].uuid;
    }
    return completed;
  }

  function selectedMapping(sizeMap, answers) {
    if (!sizeMap || !answers.homeSize) return null;
    return sizeMap.mappings.find(mapping => mapping.id === answers.homeSize) || null;
  }

  function formatTons(tons) {
    const value = Number(tons);
    const text = Number.isInteger(value) ? String(value) : String(value);
    return `${text} ton${value === 1 ? '' : 's'}`;
  }

  function money(value) {
    const cents = Math.round(Number(value) * 100);
    const hasCents = cents % 100 !== 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0
    }).format(value);
  }

  function lead(reason) {
    return { status: 'lead', reason, tiers: [], service: null, tons: null, sizeLabel: '', warnings: [], packages: [] };
  }

  function resolveQuote(items, sizeMap, answers) {
    const responses = applyDefaults(items, sizeMap, answers || {});
    if (responses.propertyType === 'commercial') return lead('commercial');
    if (responses.projectType === 'other' || !responses.propertyType) return lead(responses.projectType === 'other' ? 'other' : 'incomplete');
    if (responses.projectType === 'repair') {
      const services = dedupedServices(items);
      const service = services.find(item => item.uuid === responses.serviceItem) || (services.length === 1 ? services[0] : null);
      if (!service || !(service.price > 0)) return lead('no-service-price');
      return {
        status: 'price',
        reason: 'service',
        tiers: [],
        service: { name: service.name, description: service.description, price: service.price, uuid: service.uuid, category: service.category },
        tons: null,
        sizeLabel: '',
        warnings: [],
        packages: [{
          name: service.name,
          lineItems: [{ name: service.name, description: service.description, quantity: 1, unitPrice: service.price, priceUnit: 'dollars' }]
        }]
      };
    }
    if (responses.projectType !== 'replacement') return lead('unpriced');
    const families = installFamilies(items);
    const family = responses.systemFamily || (families.length === 1 ? families[0] : '');
    if (!isTieredFamily(family)) return lead(family === 'mini-split' ? 'mini-split' : 'unpriced-system');
    const brand = resolvedBrand(items, { ...responses, systemFamily: family });
    const mapping = selectedMapping(sizeMap, responses);
    if (!brand || !mapping || !Number.isFinite(Number(mapping.tons))) return lead('no-size');
    const matched = matchTiers(items, { family, brand, tons: Number(mapping.tons) });
    if (!matched.tiers.length) return { ...lead('no-tier'), tons: Number(mapping.tons), sizeLabel: mapping.label, warnings: matched.warnings };
    return {
      status: 'price',
      reason: 'tiers',
      tiers: matched.tiers,
      service: null,
      tons: Number(mapping.tons),
      sizeLabel: mapping.label,
      warnings: matched.warnings,
      packages: matched.tiers.map(tier => ({
        name: tier.dualFuel ? `${tier.tierLabel} dual fuel` : tier.tierLabel,
        lineItems: [{
          name: tier.name,
          description: [tier.honestLabel, tier.description].filter(Boolean).join('\n\n'),
          quantity: 1,
          unitPrice: tier.price,
          priceUnit: 'dollars'
        }]
      }))
    };
  }

  function selectionSummary(items, sizeMap, answers, quote) {
    const completed = applyDefaults(items, sizeMap, answers || {});
    const lines = [];
    if (completed.propertyType === 'residential') lines.push('Property: Residential');
    if (completed.propertyType === 'commercial') lines.push('Property: Commercial');
    if (completed.projectType === 'replacement') lines.push('Project: Replace or install a system');
    if (completed.projectType === 'repair') lines.push('Project: Repair, diagnostic, or tune-up');
    if (completed.projectType === 'other') lines.push('Project: Something else');
    if (completed.systemFamily) lines.push(`System: ${familyCopy(completed.systemFamily)[0]}`);
    if (completed.brand && completed.brand !== 'packaged') lines.push(`Brand: ${brandLabel(completed.brand)}`);
    const mapping = selectedMapping(sizeMap, completed);
    if (mapping) lines.push(`Home size: ${mapping.label}`);
    if (completed.serviceItem) {
      const service = dedupedServices(items).find(item => item.uuid === completed.serviceItem);
      if (service) lines.push(`Service: ${service.name}`);
    }
    if (quote && quote.tons) lines.push(`Matched capacity: ${formatTons(quote.tons)} (size guide, confirmed on site)`);
    if (quote && quote.tiers && quote.tiers.length) {
      lines.push(`Options: ${quote.tiers.map(tier => `${tier.tierLabel}${tier.dualFuel ? ' dual fuel' : ''} ${money(tier.price)}`).join('; ')}`);
    }
    if (quote && quote.service) lines.push(`Service price: ${money(quote.service.price)}`);
    return lines.join('\n');
  }

  function duplicateNameGroups(items) {
    const groups = new Map();
    for (const item of items) {
      const key = `${item.category.toLowerCase()}|${item.name.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()].filter(group => group.length > 1).map(group => ({
      category: group[0].category,
      name: group[0].name,
      differentPrices: new Set(group.map(item => item.price)).size > 1,
      items: group.map(item => ({ uuid: item.uuid, price: item.price }))
    }));
  }

  function tierConflicts(items) {
    const groups = new Map();
    for (const item of items.filter(entry => entry.tierCandidate && entry.tonnage)) {
      const key = `${item.family}|${item.brand}|${item.tier}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const conflicts = [];
    for (const group of groups.values()) {
      const used = new Set();
      for (let index = 0; index < group.length; index++) {
        if (used.has(index)) continue;
        const cluster = new Set([index]);
        let changed = true;
        while (changed) {
          changed = false;
          for (let other = 0; other < group.length; other++) {
            if (cluster.has(other)) continue;
            const overlaps = [...cluster].some(member => rangesOverlap(group[member].tonnage, group[other].tonnage));
            if (overlaps) { cluster.add(other); changed = true; }
          }
        }
        for (const member of cluster) used.add(member);
        if (cluster.size < 2) continue;
        const clustered = [...cluster].map(member => group[member]);
        conflicts.push({
          family: group[0].family,
          brand: group[0].brand,
          tier: group[0].tier,
          differentPrices: new Set(clustered.map(item => item.price)).size > 1,
          items: clustered.map(item => ({
            uuid: item.uuid,
            name: item.name,
            price: item.price,
            tonnage: item.tonnage
          }))
        });
      }
    }
    return conflicts;
  }

  function dataQuality(items) {
    const zeroPrice = items.filter(item => !(item.price > 0)).map(item => ({
      uuid: item.uuid,
      category: item.category,
      name: item.name,
      price: item.price
    }));
    const unmapped = items.filter(item => item.price > 0 && !item.tierCandidate && !item.serviceVisit).map(item => ({
      uuid: item.uuid,
      category: item.category,
      name: item.name,
      price: item.price,
      reason: item.commercial ? 'commercial' : item.componentOnly ? 'component' : item.family ? 'no-bronze-silver-gold-tier' : 'not-a-questionnaire-item'
    }));
    return {
      rows: items.length,
      priced: items.filter(item => item.price > 0).length,
      zeroPrice,
      duplicateNames: duplicateNameGroups(items),
      tierConflicts: tierConflicts(items),
      unmapped
    };
  }

  function formatQualityReport(quality, sourceLabel) {
    const lines = [
      'Infinity Air price book data quality',
      `Source: ${sourceLabel}`,
      `Rows: ${quality.rows}`,
      `Priced rows (shown to customers): ${quality.priced}`,
      `Zero or blank price (call for quote, never shown as $0): ${quality.zeroPrice.length}`,
      `Duplicate names: ${quality.duplicateNames.length}`,
      `Overlapping Bronze/Silver/Gold matches: ${quality.tierConflicts.length}`,
      `Unmapped priced rows: ${quality.unmapped.length}`,
      ''
    ];
    lines.push('Zero or blank price');
    if (!quality.zeroPrice.length) lines.push('  None');
    for (const item of quality.zeroPrice) lines.push(`  ${item.price === null ? 'blank' : item.price}  ${item.category}  |  ${item.name}  |  ${item.uuid}`);
    lines.push('', 'Duplicate names');
    if (!quality.duplicateNames.length) lines.push('  None');
    for (const group of quality.duplicateNames) {
      lines.push(`  ${group.differentPrices ? 'DIFFERENT PRICES' : 'same price'}  ${group.category}  |  ${group.name}`);
      for (const item of group.items) lines.push(`    ${item.price}  ${item.uuid}`);
    }
    lines.push('', 'Overlapping tier matches');
    if (!quality.tierConflicts.length) lines.push('  None');
    for (const conflict of quality.tierConflicts) {
      lines.push(`  ${conflict.differentPrices ? 'DIFFERENT PRICES' : 'same price'}  ${conflict.brand}  ${conflict.tier}  ${conflict.family}`);
      for (const item of conflict.items) lines.push(`    ${item.price}  ${item.tonnage.min}-${item.tonnage.max} ton  ${item.name}  |  ${item.uuid}`);
    }
    lines.push('', 'Unmapped priced rows');
    if (!quality.unmapped.length) lines.push('  None');
    for (const item of quality.unmapped) lines.push(`  ${item.reason}  ${item.price}  ${item.category}  |  ${item.name}  |  ${item.uuid}`);
    lines.push('', 'Home size is not in this price book. Tons come from data/demo-config.js (coastal 500 sq. ft. per ton, inland 400). That ZIP list is unconfirmed.');
    return lines.join('\n');
  }

  function usableCsv(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!clean || clean.startsWith('<') || clean.startsWith('{') || clean.startsWith('[')) {
      throw new Error('Price book response was not a CSV.');
    }
    const rows = parseCsv(clean);
    const header = (rows[0] || []).map(cell => cell.trim().toLowerCase());
    for (const name of ['category', 'name', 'price']) {
      if (!header.includes(name)) throw new Error(`Price book CSV is missing the ${name} column.`);
    }
    const dataRows = rows.slice(1).filter(row => row.some(cell => String(cell || '').trim()));
    if (dataRows.length < MIN_DATA_ROWS) throw new Error(`Price book CSV has ${dataRows.length} data rows.`);
    return clean;
  }

  function spreadsheetIdFromUrl(url) {
    const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{15,})/);
    if (!match || match[1] === 'e') return null;
    return match[1];
  }

  function parseSizeMapCsv(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!clean || clean.startsWith('<') || clean.startsWith('{') || clean.includes('setResponse')) return null;
    const rows = parseCsv(clean);
    const header = (rows[0] || []).map(cell => cell.trim().toLowerCase());
    const idIndex = header.indexOf('id');
    const labelIndex = header.indexOf('label');
    const tonsIndex = header.indexOf('tons');
    const descriptionIndex = header.indexOf('description');
    if (idIndex < 0 || labelIndex < 0 || tonsIndex < 0) return null;
    const mappings = [];
    for (const row of rows.slice(1)) {
      const id = cleanText(row[idIndex]);
      const label = cleanText(row[labelIndex]);
      const tons = Number(String(row[tonsIndex] || '').trim());
      const description = descriptionIndex < 0 ? '' : cleanText(row[descriptionIndex]);
      if (!id || !label || !Number.isFinite(tons) || tons <= 0 || tons > 20) continue;
      mappings.push({ id, label, description, tons });
    }
    return mappings.length ? mappings : null;
  }

  function publicSizeMap(sizeMap) {
    return {
      source: sizeMap.source,
      notice: sizeMap.notice,
      mappings: sizeMap.mappings.map(mapping => ({
        id: mapping.id,
        label: mapping.label,
        description: mapping.description || '',
        tons: Number(mapping.tons)
      }))
    };
  }

  async function loadSizeMap({ sheetUrl, fetchImpl, fallback, logger }) {
    const repoMap = {
      source: 'repo',
      notice: fallback.notice || '',
      mappings: fallback.mappings || []
    };
    const spreadsheetId = spreadsheetIdFromUrl(sheetUrl);
    if (!spreadsheetId || typeof fetchImpl !== 'function') return repoMap;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=SizeMap`;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`SizeMap returned ${response.status}.`);
      const mappings = parseSizeMapCsv(await response.text());
      if (!mappings) throw new Error('SizeMap tab was missing or invalid.');
      return { source: 'sheet', notice: 'Home size guide loaded from the SizeMap tab.', mappings };
    } catch (error) {
      logger.warn(`SizeMap tab unavailable (${error.message}). Using the repo sizing guide.`);
      return repoMap;
    }
  }

  async function loadPricebook({ sheetUrl, fetchImpl, snapshotCsv, config = null, now = () => new Date(), logger = console }) {
    let csv = snapshotCsv;
    let source = 'snapshot';
    if (!sheetUrl) logger.warn('PRICEBOOK_SHEET_CSV_URL is not set. Serving the price book snapshot.');
    else {
      try {
        const response = await fetchImpl(sheetUrl, { redirect: 'follow' });
        if (!response || !response.ok) throw new Error(`Price book sheet returned ${response ? response.status : 'no response'}.`);
        csv = usableCsv(await response.text());
        source = 'sheet';
      } catch (error) {
        logger.warn(`Price book sheet unavailable (${error.message}). Serving the price book snapshot.`);
        csv = snapshotCsv;
        source = 'snapshot';
      }
    }
    let items = normalizePricebook(parseCsv(csv));
    if (source === 'sheet' && items.filter(item => String(item.name || '').trim()).length < MIN_DATA_ROWS) {
      logger.warn('Price book sheet did not contain enough named rows. Serving the price book snapshot.');
      source = 'snapshot';
      items = normalizePricebook(parseCsv(snapshotCsv));
    }
    const quality = dataQuality(items);
    if (quality.zeroPrice.length || quality.duplicateNames.length || quality.tierConflicts.length) {
      logger.warn(`Price book data quality from ${source}: ${quality.zeroPrice.length} zero-price rows are call-for-quote only, ${quality.duplicateNames.length} duplicate names, ${quality.tierConflicts.length} overlapping tiers.`);
    }
    const fetchedAt = now().toISOString();
    logger.log(`Price book served from ${source} at ${fetchedAt} (${pricedItems(items).length} priced rows, ${items.length - pricedItems(items).length} unpriced rows kept for call-for-quote).`);
    return {
      source,
      fetchedAt,
      items: items.map(publicItem),
      config
    };
  }

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

  function buildHcpOptions(options) {
    if (!Array.isArray(options) || !options.length) throw new TypeError('At least one estimate option is required.');
    return options.map(option => {
      const name = typeof option.name === 'string' ? option.name.trim() : '';
      if (!name) throw new TypeError('Line-item package name is required.');
      return { name, line_items: buildHcpLineItems(option.lineItems || option.items) };
    });
  }

  return {
    MIN_DATA_ROWS,
    parseCsv,
    parsePrice,
    parseTonnage,
    normalizePricebook,
    pricedItems,
    publicItem,
    preferenceScore,
    chooseItem,
    matchTiers,
    questionDefinitions,
    visibleQuestions,
    applyDefaults,
    resolveQuote,
    selectionSummary,
    dataQuality,
    formatQualityReport,
    usableCsv,
    spreadsheetIdFromUrl,
    parseSizeMapCsv,
    loadPricebook,
    money,
    formatTons,
    buildHcpLineItems,
    buildHcpLineItemPackages,
    buildHcpOptions
  };
});
