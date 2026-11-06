const assert = require('node:assert/strict');
const fs = require('fs');
const model = require('./estimator-model.js');
const flow = require('./demo-flow.js');
const config = require('./data/demo-config.js');

const items = model.normalizePricebook(model.parseCsv(fs.readFileSync('./data/pricebook.csv', 'utf8')));

function keys(answers) {
  return flow.visibleQuestions(items, config, answers).map(question => question.key);
}
function priceOf(name) {
  const matches = items.filter(item => item.name === name && item.price > 0);
  assert.equal(matches.length, 1, name);
  return matches[0].price;
}
function proposal(answers) {
  return flow.buildProposal(items, config, answers);
}
function cardText(tier) {
  return [tier.label, tier.series, tier.benefit, tier.systemName].join(' ');
}

assert.deepEqual(flow.tonnageChoicesForSqft(1400, 400), [3, 4]);
assert.deepEqual(flow.tonnageChoicesForSqft(1600, 400), [4]);
assert.deepEqual(flow.tonnageChoicesForSqft(1600, 500), [3, 4]);
assert.deepEqual(flow.tonnageChoicesForSqft(2000, 500), [4]);
assert.deepEqual(flow.tonnageChoicesForSqft(2000, 400), [5]);
assert.deepEqual(flow.tonnageChoicesForSqft(2500, 500), [5]);
assert.deepEqual(flow.tonnageChoicesForRange(1600, 2000, 500), [4]);
assert.deepEqual(flow.tonnageChoicesForRange(1600, 2000, 400), [5]);
assert.deepEqual(flow.tonnageChoicesForRange(2000, 2500, 500), [5]);
assert.deepEqual(flow.tonnageChoicesForRange(1200, 1600, 500), [4]);
assert.deepEqual(flow.tonnageChoicesForRange(2000, 2500, 400), [7]);
assert.deepEqual(flow.tonnageChoicesForRange(800, 3600, 400), [9]);
assert.ok(flow.tonnageChoicesForRange(800, 3600, 400).every(ton => Number.isInteger(ton)));
assert.equal(flow.tonnageChoicesForRange(800, 3600, 400).length, 1);
assert.deepEqual(flow.roundUpToOfferedTon(7, [2, 3, 4, 5]), [5]);
assert.deepEqual(flow.roundUpToOfferedTon(4, [3, 5]), [5]);
assert.deepEqual(flow.roundUpToOfferedTon(2, [3, 4, 5]), [3]);
assert.deepEqual(flow.roundUpToOfferedTon(4, [2, 3, 4, 5]), [4]);
assert.equal(flow.climateForZip('92648', config).sqftPerTon, 500);
assert.equal(flow.climateForZip('91761', config).id, 'inland');
assert.equal(flow.climateForZip('92501', config).listed, true);
assert.equal(flow.climateForZip('00000', config).listed, false);
assert.equal(flow.climateForZip('00000', config).sqftPerTon, 400);
assert.deepEqual(flow.clampTons([3, 4], [3, 5]), [3]);
assert.deepEqual(flow.clampTons([6, 7], [2, 3, 4, 5]), [5]);

assert.deepEqual(keys({}), ['propertyType']);
assert.deepEqual(keys({ propertyType: 'commercial' }), ['propertyType']);
assert.deepEqual(keys({ propertyType: 'residential' }), ['propertyType', 'projectType']);
assert.equal(proposal({ propertyType: 'commercial' }).reason, 'commercial');
assert.equal(proposal({ propertyType: 'residential', projectType: 'repair' }).reason, 'repair');
assert.equal(proposal({ propertyType: 'residential', projectType: 'repair' }).packages.length, 0);

const replacement = { propertyType: 'residential', projectType: 'replacement', zip: '91761' };
assert.ok(keys(replacement).includes('systemFamily'));
const systems = flow.visibleQuestions(items, config, replacement).find(question => question.key === 'systemFamily').options().map(option => option[0]);
assert.deepEqual(systems, ['gas-split', 'heat-pump-split', 'heat-pump-package', 'mini-split']);
const withSystem = { ...replacement, systemFamily: 'heat-pump-split' };
assert.ok(!keys(withSystem).includes('miniSplitZones'));
assert.ok(keys({ ...withSystem, systemFamily: 'mini-split' }).includes('miniSplitZones'));
assert.ok(!keys({ ...withSystem, systemFamily: 'mini-split', homeSize: '1200-1600', miniSplitZones: '2', systemAge: '5-10' }).includes('brand'));

const valueAnswers = { ...withSystem, homeSize: '1200-1600', systemAge: '5-10', addons: [], brand: 'value' };
assert.ok(keys(valueAnswers).includes('brand'));
const brandOptions = flow.visibleQuestions(items, config, valueAnswers).find(question => question.key === 'brand').options();
assert.equal(brandOptions[0][1], 'AC Pro (Value Line)');
assert.equal(brandOptions[1][1], 'American Standard');
assert.equal(brandOptions[1][3].premium, true);
assert.equal(brandOptions[1][3].kicker, 'Premium Line');
assert.equal(brandOptions[1][3].badge, 'Call for quote');
const fourTonProposal = proposal(valueAnswers);
assert.deepEqual(fourTonProposal.tons, [4]);
assert.equal(fourTonProposal.groups.length, 1);
const threeTonProposal = proposal({ ...valueAnswers, homeSize: 'under-1200' });
assert.deepEqual(threeTonProposal.tons, [3]);
assert.equal(threeTonProposal.groups.length, 1);
for (const group of [...fourTonProposal.groups, ...threeTonProposal.groups]) {
  assert.deepEqual(group.tiers.map(tier => tier.tier), ['bronze', 'silver', 'gold']);
  for (const tier of group.tiers) {
    assert.equal(/AC\s*Pro/i.test(cardText(tier)), false);
    assert.match(tier.label, /Bronze|Silver|Gold/);
  }
}
const three = threeTonProposal.groups[0];
const four = fourTonProposal.groups[0];
assert.equal(three.tiers[0].series, 'M series');
assert.equal(three.tiers[0].systemName, 'Bronze 3 Ton Heat Pump Split System');
assert.equal(/FAU|R-454|AC\s*Pro/i.test(three.tiers[0].systemName), false);
assert.match(three.tiers[0].benefit, /lower monthly bills/i);
assert.equal(/one-year|14 SEER2/i.test(three.tiers[0].benefit), false);
assert.equal(three.tiers[0].systemPrice, priceOf('Bronze 3 Ton Heat Pump Split System with Core FAU R-454b'));
assert.equal(flow.tonHeading(5), '5-ton system, sized from the top of your home\'s square-footage range and rounded up to a whole ton. Tons measure cooling capacity, not weight.');
assert.equal(flow.tonHeading(3), '3-ton system, sized from the top of your home\'s square-footage range and rounded up to a whole ton. Tons measure cooling capacity, not weight.');
assert.equal(config.showRyanReviewCallouts, false);
assert.equal(config.tierReviewNote, undefined);
assert.equal(config.sizingReviewNote, undefined);
assert.equal(config.notice, undefined);
assert.equal(config.ductworkPerRun.pricePerRun, 450);
assert.match(config.quoteDisclaimer, /not a binding quote/i);
assert.match(config.quoteDisclaimer, /not a contract/i);
const widgetSource = fs.readFileSync('./infinity-air-estimator.js', 'utf8');
assert.equal(/ryan-review|REVIEW: FOR RYAN|pending Ryan/.test(widgetSource), false);
assert.match(widgetSource, /Not a binding quote/);
assert.match(widgetSource, /totalLabel/);
assert.match(widgetSource, /data-qty/);
assert.equal(three.tiers[1].series, 'Z series inverter');
assert.equal(three.tiers[1].systemPrice, priceOf('Silver 3 Ton Heat Pump Split System R454B'));
assert.match(three.tiers[2].series, /XB series/);
assert.equal(three.tiers[2].systemPrice, priceOf('Gold 3 Ton Heat Pump Split System R32'));
assert.equal(four.tiers[0].systemPrice, priceOf('Bronze 4 Ton Heat Pump Split System with Core FAU R-454b'));
assert.notEqual(three.tiers[0].systemPrice, four.tiers[0].systemPrice);

const gas = proposal({ ...valueAnswers, systemFamily: 'gas-split', homeSize: '1700-2200' });
assert.equal(gas.reason, 'no-ton');
const gasSized = proposal({ ...valueAnswers, systemFamily: 'gas-split', homeSize: '1600-2000' });
assert.ok(gasSized.groups.length);
const gasGold = gasSized.groups.flatMap(group => group.tiers).find(tier => tier.tier === 'gold');
assert.equal(gasGold.label, config.goldGasTierLabel);
assert.match(gasGold.benefit, /dual fuel/i);
assert.equal(/AC\s*Pro/i.test(cardText(gasGold)), false);
assert.match(gasGold.series, /Z series/);

const exact = proposal({ ...valueAnswers, homeSize: 'under-1200' });
assert.ok(exact.tons.every(ton => Number.isInteger(ton)));
assert.equal(exact.tons.includes(2.5), false);

const duct = flow.addonItems(items, config).find(item => /3 ton duct/i.test(item.name));
assert.equal(duct.price, 3500);
assert.equal(duct.priceFrom, true);
assert.equal(duct.duplicateCount, 2);
const thermostat = items.find(item => item.name === 'Honeywell ElitePRO S1200 Smart Thermostat');
const nest = items.find(item => item.name === 'Nest Thermostat');
const threeWithAddons = proposal({ ...valueAnswers, homeSize: 'under-1200', addons: [duct.uuid, thermostat.uuid] });
const threeBronze = threeWithAddons.groups[0].tiers[0];
assert.equal(threeBronze.total, threeBronze.systemPrice + duct.price + thermostat.price);
const fourWithStaleDuct = proposal({ ...valueAnswers, addons: [duct.uuid, thermostat.uuid] });
const fourBronze = fourWithStaleDuct.groups[0].tiers[0];
assert.equal(fourBronze.addons.some(addon => addon.uuid === duct.uuid), false);
assert.equal(fourBronze.addons.some(addon => addon.uuid === thermostat.uuid), true);
assert.equal(fourBronze.total, fourBronze.systemPrice + thermostat.price);
const hcp = model.buildHcpOptions(threeWithAddons.packages);
const threePackage = hcp.find(option => option.name === 'Bronze 3 ton');
assert.ok(threePackage.line_items.some(line => line.name === duct.name && line.unit_price === Math.round(duct.price * 100)));
const fourHcp = model.buildHcpOptions(fourWithStaleDuct.packages);
assert.equal(fourHcp.find(option => option.name === 'Bronze 4 ton').line_items.some(line => line.name === duct.name), false);
assert.equal(fourHcp.some(option => option.name.includes('3 ton')), false);

// Regression: a duct chosen for one size must not survive a later size, ZIP, or system change,
// and it must not appear in the summary or the Housecall payload when it does not fit.
const sizedForThree = { ...valueAnswers, homeSize: 'under-1200', addons: [duct.uuid, thermostat.uuid] };
const afterSize = flow.answersAfterChange(items, config, sizedForThree, 'homeSize', '1200-1600');
assert.equal(afterSize.homeSize, '1200-1600');
assert.deepEqual(afterSize.addons, [thermostat.uuid]);
const afterSizeQuote = proposal(afterSize);
const afterSizeSummary = flow.selectionSummary(items, config, afterSize, afterSizeQuote);
assert.equal(afterSizeSummary.includes('3 Ton Duct'), false);
assert.match(afterSizeSummary, /ElitePRO S1200/);
assert.ok(afterSizeQuote.packages.every(option => option.lineItems.every(line => !line.name.includes('3 Ton Duct'))));
const staleSummary = flow.selectionSummary(items, config, { ...valueAnswers, addons: [duct.uuid, thermostat.uuid] }, fourWithStaleDuct);
assert.equal(staleSummary.includes('Add-ons:'), true);
assert.equal(staleSummary.includes('3 Ton Duct'), false);
assert.match(staleSummary, /ElitePRO S1200/);
const afterZip = flow.answersAfterChange(items, config, sizedForThree, 'zip', '92648');
assert.equal(afterZip.zip, '92648');
assert.equal(afterZip.homeSize, undefined);
assert.deepEqual(afterZip.addons, [thermostat.uuid]);
const afterFamily = flow.answersAfterChange(items, config, sizedForThree, 'systemFamily', 'gas-split');
assert.equal(afterFamily.systemFamily, 'gas-split');
assert.equal(afterFamily.addons.includes(duct.uuid), false);
assert.ok(afterFamily.addons.includes(thermostat.uuid));
const afterRepair = flow.answersAfterChange(items, config, sizedForThree, 'projectType', 'repair');
assert.deepEqual(afterRepair.addons, []);
const repairSummary = flow.selectionSummary(items, config, { ...sizedForThree, projectType: 'repair' }, proposal({ ...sizedForThree, projectType: 'repair' }));
assert.equal(repairSummary.includes('Add-ons:'), false);

const quotedAddon = proposal({ ...valueAnswers, addons: [nest.uuid] });
const quotedTier = quotedAddon.groups[0].tiers[0];
assert.equal(quotedTier.systemPrice > 0, true);
assert.equal(quotedTier.addons[0].callForQuote, true);
assert.equal(quotedTier.callForQuote, true);
assert.equal(quotedTier.total, null);
assert.equal(quotedTier.totalLabel, `at least ${model.money(quotedTier.systemPrice)} plus call for quote`);

const zeroTier = proposal({ ...valueAnswers, systemFamily: 'heat-pump-package', homeSize: '2000-2500' });
const silver = zeroTier.groups.flatMap(group => group.tiers).find(tier => tier.tier === 'silver' && tier.callForQuote);
assert.ok(silver);
assert.equal(silver.systemPrice, null);
assert.equal(silver.total, null);
assert.equal(silver.totalLabel, 'Call for quote');

const standard = proposal({ ...valueAnswers, brand: 'american-standard' });
assert.equal(standard.reason, 'american-standard');
assert.equal(standard.groups.length, 0);
const valueSummary = flow.selectionSummary(items, config, valueAnswers, fourTonProposal);
assert.match(valueSummary, /AC Pro \(Value Line\)/);
assert.equal(/AC\s*Pro/i.test(valueSummary.replace('AC Pro (Value Line)', '')), false);
assert.equal(/pending Ryan|FOR RYAN|first pass/i.test(valueSummary), false);
assert.equal(valueSummary.includes('Whole tons offered: 4'), true);
assert.equal(flow.selectionSummary(items, config, valueAnswers, fourTonProposal).includes('3 and 4'), false);

const iaqNote = 'Indoor air quality means how clean the air inside your home is. These add-ons filter or clean the air that moves through your heating and cooling system.';
for (const item of flow.addonItems(items, config)) {
  const copy = flow.addonCopy(item, config);
  assert.equal(copy.description, config.addonDescriptions[item.uuid], item.name);
  assert.equal(/\$|\bSEER\b|ENERGY STAR|\d+\s*%/i.test(copy.description), false, copy.description);
  assert.ok(copy.description.length > 20 && copy.description.length < 160, copy.description);
  assert.equal(copy.categoryLabel === item.category && item.category === 'IAQ', false);
}
const iaqItem = items.find(item => item.category === 'IAQ');
assert.equal(flow.addonCopy(iaqItem, config).categoryLabel, 'Indoor air quality');
assert.equal(flow.addonCopy(iaqItem, config).categoryNote, iaqNote);
assert.equal(flow.addonCopy(duct, config).categoryLabel, 'Ductwork');
const editable = {
  ...config,
  addonDescriptions: { ...config.addonDescriptions, [duct.uuid]: 'Custom duct note for Ryan.' },
  addonCategoryLabels: { ...config.addonCategoryLabels, Ducting: 'Air ducts' }
};
assert.equal(flow.addonCopy(duct, editable).description, 'Custom duct note for Ryan.');
assert.equal(flow.addonCopy(duct, editable).categoryLabel, 'Air ducts');
const bare = { ...config, addonDescriptions: {}, addonCategoryLabels: {}, addonCategoryNotes: {} };
assert.match(flow.addonCopy({ uuid: 'missing', name: 'Whole-home air purifier', category: 'IAQ' }, bare).description, /purifier/i);
assert.equal(flow.addonCopy({ uuid: 'missing', name: 'Whole-home air purifier', category: 'IAQ' }, bare).categoryLabel, 'Indoor air quality');
assert.equal(flow.addonCopy({ uuid: 'missing', name: 'Whole-home air purifier', category: 'IAQ' }, bare).categoryNote, iaqNote);
assert.match(flow.addonCopy({ uuid: 'missing', name: 'Custom duct booster', category: 'Ducting' }, bare).description, /duct/i);
assert.equal(flow.addonCopy({ uuid: 'missing', name: 'Mystery extra', category: 'IAQ' }, bare).description, config.addonDescriptionFallbacks.find(rule => rule.category === 'IAQ').text);

assert.equal(flow.addonItems(items, config).some(item => /zonefirst|\bdamper\b|\bzone\b/i.test(item.name)), false);
assert.equal(flow.addonItems(items, config).some(item => /duct clean|coil cleaning/i.test(item.name)), false);
const repairs = flow.addonItems(items, config).filter(item => /duct repair/i.test(item.name));
assert.equal(repairs.length, 1);
assert.equal(repairs[0].price, 500);
assert.equal(repairs[0].priceFrom, true);
const fiveTonDucts = flow.addonItems(items, config).filter(item => /5 ton duct/i.test(item.name));
assert.equal(fiveTonDucts.length, 1);
assert.equal(fiveTonDucts[0].price, 4050);
assert.equal(fiveTonDucts[0].priceFrom, true);
const threeTonDucts = flow.addonItems(items, config).filter(item => /3 ton duct/i.test(item.name));
assert.equal(threeTonDucts.length, 1);
const quality = model.dataQuality(items, config);
assert.ok(quality.addonDuplicateResolutions.some(group => group.price === 500 && group.priceFrom && group.names.some(name => name.trim() === 'Duct Repair')));
assert.ok(quality.addonDuplicateResolutions.some(group => group.names.includes('5 Ton Ducting System') && group.price === 4050 && group.priceFrom));
assert.ok(quality.addonDuplicateResolutions.some(group => group.names.includes('3 Ton Duct System') && group.names.includes('3 Ton Ducting System') && group.price === 3500));
assert.equal(quality.silverAboveGold.length, 0);
const qualityReport = model.formatQualityReport(quality, 'snapshot');
assert.match(qualityReport, /lowest price above zero/);
assert.match(qualityReport, /from \$X/);
assert.match(qualityReport, /Silver priced above the matching Gold[\s\S]*\n {2}None/);

const repairQuote = proposal({ ...valueAnswers, addons: [repairs[0].uuid] });
const repairTier = repairQuote.groups[0].tiers[0];
assert.equal(repairTier.addons[0].lineLabel, `from ${model.money(500)}`);
assert.equal(repairTier.total, repairTier.systemPrice + 500);
assert.match(repairTier.totalLabel, /^from /);
const repairPackage = model.buildHcpOptions(repairQuote.packages).find(option => option.name === 'Bronze 4 ton');
assert.ok(repairPackage.line_items.some(line => line.unit_price === 50000 && /Starting price/.test(line.description)));

const cleaningItems = items.concat([{
  uuid: 'clean-test',
  category: 'Maintenance',
  name: 'Whole-Home Duct Cleaning',
  description: 'Clean the supply and return ducts.',
  price: 650,
  commercial: false,
  tonnage: null
}]);
const cleaning = flow.addonItems(cleaningItems, config).find(item => item.uuid === 'clean-test');
assert.ok(cleaning);
assert.equal(cleaning.price, 650);
const cleaningQuote = flow.buildProposal(cleaningItems, config, { ...valueAnswers, homeSize: 'under-1200', addons: ['clean-test'] });
const cleaningTier = cleaningQuote.groups[0].tiers[0];
assert.equal(cleaningTier.addons.some(addon => addon.uuid === 'clean-test'), true);
assert.equal(cleaningTier.total, cleaningTier.systemPrice + 650);

const withRuns = proposal({ ...valueAnswers, homeSize: 'under-1200', ductRuns: 2, addons: [] });
const runBronze = withRuns.groups[0].tiers[0];
assert.equal(runBronze.total, runBronze.systemPrice + 900);
assert.equal(runBronze.addons[0].quantity, 2);
assert.equal(runBronze.addons[0].unitPrice, 450);
assert.match(runBronze.addons[0].lineLabel, /2 ×/);
const runPackage = model.buildHcpOptions(withRuns.packages).find(option => option.name === 'Bronze 3 ton');
const runLine = runPackage.line_items.find(line => line.name === 'Ductwork');
assert.equal(runLine.quantity, 2);
assert.equal(runLine.unit_price, 45000);
assert.equal(flow.ductRunCount({ ductRuns: 99 }, config), 20);
const keptRuns = flow.answersAfterChange(items, config, { ...sizedForThree, ductRuns: 4 }, 'homeSize', '1200-1600');
assert.equal(keptRuns.ductRuns, 4);
assert.equal(keptRuns.addons.includes(duct.uuid), false);
const droppedRuns = flow.answersAfterChange(items, config, { ...sizedForThree, ductRuns: 4 }, 'systemFamily', 'mini-split');
assert.equal(droppedRuns.ductRuns, undefined);
const addonStep = flow.visibleQuestions(items, config, valueAnswers).find(question => question.key === 'addons');
assert.ok(addonStep.items(valueAnswers).some(item => item.quantityAddon && item.price === 450));
const miniAddonStep = flow.visibleQuestions(items, config, { ...replacement, systemFamily: 'mini-split', homeSize: '1200-1600' }).find(question => question.key === 'addons');
if (miniAddonStep) assert.equal(miniAddonStep.items({ ...replacement, systemFamily: 'mini-split', homeSize: '1200-1600' }).some(item => item.quantityAddon), false);

const mixedQuote = proposal({ ...valueAnswers, homeSize: 'under-1200', ductRuns: 2, addons: [nest.uuid] });
const mixedTier = mixedQuote.groups[0].tiers[0];
assert.equal(mixedTier.total, null);
assert.equal(mixedTier.totalLabel, `at least ${model.money(mixedTier.systemPrice + 900)} plus call for quote`);
assert.equal(mixedQuote.packages.length, 0);

function invertedEquipment(tier, price) {
  return {
    uuid: `inv-${tier}`,
    category: 'AC Pro Heat Pump Split Systems',
    name: `${tier} 3 Ton Heat Pump Split System`,
    description: '',
    price,
    family: 'heat-pump-split',
    brand: 'ac-pro',
    tier,
    tonnage: { min: 3, max: 3 },
    tierCandidate: true,
    commercial: false,
    componentOnly: false,
    serviceVisit: false
  };
}
const invertedItems = [invertedEquipment('bronze', 5000), invertedEquipment('silver', 9000), invertedEquipment('gold', 7000)];
const invertedQuote = flow.buildProposal(invertedItems, config, { ...valueAnswers, homeSize: 'under-1200', addons: [] });
assert.deepEqual(invertedQuote.groups[0].tiers.map(tier => tier.tier), ['bronze', 'gold', 'silver']);
assert.match(invertedQuote.groups[0].priceOrderNote, /Silver system costs more than the Gold/);
const invertedQuality = model.dataQuality(invertedItems, config);
assert.equal(invertedQuality.silverAboveGold.length, 1);
assert.equal(invertedQuality.silverAboveGold[0].silver.price, 9000);
assert.equal(invertedQuality.silverAboveGold[0].gold.price, 7000);
assert.match(model.formatQualityReport(invertedQuality, 'synthetic'), /Silver 9000/);

const results = {
  inland1200to1600Tons: fourTonProposal.tons,
  bronze3: { series: three.tiers[0].series, price: three.tiers[0].systemPrice },
  silver3: { series: three.tiers[1].series, price: three.tiers[1].systemPrice },
  gold3: { series: three.tiers[2].series, price: three.tiers[2].systemPrice },
  threeTonWithAddons: threeBronze.total,
  fourTonWithoutThreeTonDuct: fourBronze.total,
  gasGoldLabel: gasGold.label,
  packageSilverCallForQuote: Boolean(silver)
};
console.log(JSON.stringify(results, null, 2));
console.log('Questionnaire and sizing tests passed.');
