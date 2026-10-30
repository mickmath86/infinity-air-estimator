(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InfinityAirDemoConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // UNCONFIRMED first pass for Ryan Villa. Edit the ZIP lists and the two
  // sq-ft-per-ton numbers. Prices do not live in this file.
  // Coastal = Orange County near the beach, 500 sq. ft. per ton.
  // Inland = Riverside / San Bernardino (and the default for any ZIP not listed), 400 sq. ft. per ton.
  // A home that falls between two whole tons is offered both sizes. No half tons.
  return {
    unconfirmed: true,
    showRyanReviewCallouts: true,
    sizingReviewNote: 'The 500 sq ft per ton near the Orange County coast / 400 sq ft per ton inland rule and the ZIP list are a first pass pending Ryan\'s confirmation.',
    notice: 'UNCONFIRMED sizing guide for Ryan Villa. Coastal Orange County beach ZIPs use 500 sq. ft. per ton. Inland Riverside and San Bernardino ZIPs use 400 sq. ft. per ton. Any ZIP not listed uses the inland guide. The 500 sq ft per ton near the Orange County coast / 400 sq ft per ton inland rule and the ZIP list are a first pass pending Ryan\'s confirmation.',
    coastalSqftPerTon: 500,
    inlandSqftPerTon: 400,
    coastalZips: [
      '90740', '90742',
      '92624', '92625', '92629',
      '92646', '92647', '92648', '92649',
      '92651', '92652',
      '92657', '92660', '92661', '92662', '92663',
      '92672', '92673', '92674'
    ],
    inlandZips: [
      '91701', '91708', '91709', '91710', '91730', '91737', '91739',
      '91752', '91761', '91762', '91763', '91764', '91784', '91785', '91786',
      '92220', '92223',
      '92307', '92308', '92316', '92324', '92331', '92335', '92336', '92337',
      '92345', '92346', '92354', '92373', '92374', '92376', '92377', '92392',
      '92394', '92395', '92399',
      '92401', '92404', '92405', '92407', '92408', '92410', '92411',
      '92501', '92503', '92504', '92505', '92506', '92507', '92508', '92509',
      '92530', '92532', '92543', '92544', '92545', '92551', '92553', '92555',
      '92557', '92562', '92563', '92570', '92571', '92584', '92586',
      '92590', '92591', '92592',
      '92860', '92879', '92880', '92881', '92882', '92883'
    ],
    squareFootageRanges: [
      { id: 'under-1200', label: 'Under 1,200 sq. ft.', low: 800, high: 1200 },
      { id: '1200-1600', label: '1,200–1,600 sq. ft.', low: 1200, high: 1600 },
      { id: '1600-2000', label: '1,600–2,000 sq. ft.', low: 1600, high: 2000 },
      { id: '2000-2500', label: '2,000–2,500 sq. ft.', low: 2000, high: 2500 },
      { id: '2500-3000', label: '2,500–3,000 sq. ft.', low: 2500, high: 3000 },
      { id: 'over-3000', label: 'Over 3,000 sq. ft.', low: 3000, high: 3600 }
    ],
    // Customer-facing name for the mid-tier equipment. Do not put the house brand on tier cards.
    valueLineLabel: 'Value line',
    valueLineFeatures: [
      'A practical system that still feels like a real upgrade',
      'Equipment that both heats and cools the home',
      'Built to use less electricity than an older unit, so monthly bills can be lower'
    ],
    americanStandardFeatures: [
      'A premium brand in the Trane family',
      'Built for a long service life',
      'Made so routine upkeep is simpler',
      'The higher-end choice when you want the finest comfort we offer'
    ],
    // Flip to true after Ryan is an authorized dealer (expected January) to price this line from the book.
    americanStandardPricesEnabled: false,
    tierLabels: { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' },
    // Price-book wording today is the tier word Gold. Change this one string if the gas tier should say Dual fuel.
    goldGasTierLabel: 'Gold',
    tierCopy: {
      bronze: {
        fallbackSeries: 'M series',
        benefit: 'A dependable system for everyday comfort, built to keep working season after season. It uses less electricity than a worn-out unit. SEER2 is an efficiency rating: a higher rating means lower monthly bills. Infinity Air installs it, and labor is included in this price.'
      },
      silver: {
        fallbackSeries: 'Inverter',
        benefit: 'A variable-speed system that holds a steadier temperature instead of only blasting on and off. That steadier run is more comfortable and wastes less energy. SEER2 is an efficiency rating: a higher rating means lower monthly bills. Infinity Air installs it, and labor is included in this price.'
      },
      gold: {
        fallbackSeries: 'Inverter',
        benefit: 'Our quietest option. It adjusts its speed to hold a precise temperature and uses less energy while it runs, instead of cycling hard on and off. SEER2 is an efficiency rating: a higher rating means lower monthly bills. Infinity Air installs it, and labor is included in this price.',
        gasBenefit: 'A dual fuel system: a heat pump handles mild days, and a gas furnace takes over when it gets cold, so you get efficient cooling and dependable heat. It runs in stages rather than only at full power, which feels steadier in the home. Infinity Air installs it, and labor is included in this price.'
      }
    },
    tierReviewNote: 'Ryan: exact efficiency ratings and warranty lengths differ by model in the price book. Sample rows mention about 13.8–16 SEER2 and a 10-year parts warranty on a bronze model, about 17.7 SEER2 on a silver model, and about 19 SEER2 with a 2-year labor warranty on a gold heat pump. Customer cards stay general until you confirm one wording for every size.',
    addonCategories: ['Ducting', 'IAQ', 'Thermostats and Controls']
  };
});
