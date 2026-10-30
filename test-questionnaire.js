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
assert.deepEqual(flow.tonnageChoicesForRange(1600, 2000, 500), [3, 4]);
assert.deepEqual(flow.tonnageChoicesForRange(1600, 2000, 400), [4, 5]);
assert.deepEqual(flow.tonnageChoicesForRange(2000, 2500, 500), [4, 5]);
assert.ok(flow.tonnageChoicesForRange(800, 3600, 400).every(ton => Number.isInteger(ton)));
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
const bothSizes = proposal(valueAnswers);
assert.deepEqual(bothSizes.tons, [3, 4]);
assert.equal(bothSizes.groups.length, 2);
for (const group of bothSizes.groups) {
  assert.deepEqual(group.tiers.map(tier => tier.tier), ['bronze', 'silver', 'gold']);
  for (const tier of group.tiers) {
    assert.equal(/AC\s*Pro/i.test(cardText(tier)), false);
    assert.match(tier.label, /Bronze|Silver|Gold/);
  }
}
const three = bothSizes.groups.find(group => group.tons === 3);
const four = bothSizes.groups.find(group => group.tons === 4);
assert.equal(three.tiers[0].series, 'M series');
assert.equal(three.tiers[0].systemPrice, priceOf('Bronze 3 Ton Heat Pump Split System with Core FAU R-454b'));
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
const withAddons = proposal({ ...valueAnswers, addons: [duct.uuid, thermostat.uuid] });
const threeBronze = withAddons.groups.find(group => group.tons === 3).tiers[0];
const fourBronze = withAddons.groups.find(group => group.tons === 4).tiers[0];
assert.equal(threeBronze.total, threeBronze.systemPrice + duct.price + thermostat.price);
assert.equal(fourBronze.addons.some(addon => addon.uuid === duct.uuid), false);
assert.equal(fourBronze.total, fourBronze.systemPrice + thermostat.price);
const hcp = model.buildHcpOptions(withAddons.packages);
const threePackage = hcp.find(option => option.name === 'Bronze 3 ton');
assert.ok(threePackage.line_items.some(line => line.name === duct.name && line.unit_price === Math.round(duct.price * 100)));
assert.equal(hcp.find(option => option.name === 'Bronze 4 ton').line_items.some(line => line.name === duct.name), false);

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
assert.equal(/AC\s*Pro/i.test(flow.selectionSummary(items, config, valueAnswers, bothSizes)), false);

const results = {
  inland1200to1600Tons: bothSizes.tons,
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
