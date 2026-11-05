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
assert.equal(flow.visibleQuestions(items, config, valueAnswers).find(question => question.key === 'brand').options()[0][1], 'Value line');
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
assert.match(config.tierReviewNote, /Ryan:/);
assert.equal(config.showRyanReviewCallouts, true);
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

const duct = items.find(item => item.name === '3 Ton Duct System');
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

const zeroTier = proposal({ ...valueAnswers, systemFamily: 'heat-pump-package', homeSize: '2000-2500' });
const silver = zeroTier.groups.flatMap(group => group.tiers).find(tier => tier.tier === 'silver' && tier.callForQuote);
assert.ok(silver);
assert.equal(silver.systemPrice, null);
assert.equal(silver.total, null);

const standard = proposal({ ...valueAnswers, brand: 'american-standard' });
assert.equal(standard.reason, 'american-standard');
assert.equal(standard.groups.length, 0);
assert.equal(/AC\s*Pro/i.test(flow.selectionSummary(items, config, valueAnswers, fourTonProposal)), false);
assert.equal(flow.selectionSummary(items, config, valueAnswers, fourTonProposal).includes('Whole tons offered: 4'), true);
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
