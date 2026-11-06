(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InfinityAirDemoConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Coastal = Orange County near the beach, 500 sq. ft. per ton.
  // Inland = Riverside / San Bernardino (and the default for any ZIP not listed), 400 sq. ft. per ton.
  // One whole ton per answer, taken from the top of the square-footage range and rounded up.
  // If that ton is not in the price book, the next larger offered ton is used, or the largest offered ton when the home is bigger than the book. No half tons.
  // Internal review notes are not part of this config. Customers do not see them.
  return {
    showRyanReviewCallouts: false,
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
    // Customer-facing name for the mid-tier equipment. Tier cards still omit this brand from the system name.
    valueLineLabel: 'AC Pro (Value Line)',
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
    // American Standard is the Premium Line. It stays call for quote until the dealer flag is turned on (expected January).
    americanStandardPricesEnabled: false,
    premiumLineLabel: 'Premium Line',
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
    quoteDisclaimer: 'This is not a binding quote and it is not a contract. These figures are planning prices from the current price book so you can compare options. They do not reserve equipment, start the work, or lock in a price. Infinity Air confirms the final price in writing after an on-site visit, once the home, the equipment, permits, and the scope are known. A price that is not in the book is shown as Call for quote. When a call-for-quote item is included, the total shows the known amount and says it is at least that amount plus a call for quote.',
    addonCategories: ['Ducting', 'IAQ', 'Thermostats and Controls'],
    // Zone-control and damper rows stay in the price book but are not offered to customers.
    hiddenAddonKeywords: ['zonefirst', 'zone control', 'zone damper', 'damper'],
    // A duct-cleaning row is offered when its name contains one of these phrases. Missing rows are skipped.
    ductCleaningKeywords: ['duct cleaning', 'duct clean'],
    // Per-run ductwork is not a price-book row yet. Move pricePerRun onto the sheet when that row exists.
    ductworkPerRun: {
      id: 'ductwork-per-run',
      name: 'Ductwork',
      description: 'Extra duct runs for supply or return air. Choose how many runs this home needs. The price is per run.',
      pricePerRun: 450,
      maxRuns: 20
    },
    // Customer-facing category headings. Keys are the price-book category names.
    addonCategoryLabels: {
      Ducting: 'Ductwork',
      IAQ: 'Indoor air quality',
      'Thermostats and Controls': 'Thermostats'
    },
    // Shown under the category heading. IAQ is spelled out so the abbreviation is not the only label.
    addonCategoryNotes: {
      IAQ: 'Indoor air quality means how clean the air inside your home is. These add-ons filter or clean the air that moves through your heating and cooling system.'
    },
    // Short card copy keyed by the price-book item id (uuid column). No prices and no ratings.
    // A missing id uses the first matching addonDescriptionFallbacks rule.
    addonDescriptions: {
      olit_6b38015bc940427797b499305a45d17f: 'New ducts sized for a 2-ton system, including supply runs and a return.',
      olit_ba1fdfffb7314e19aa6b8a5cd6ea5a58: 'New ducts sized for a 3-ton system, with supply runs and a return.',
      olit_a384b20239e54779a448f984a85d0c6d: 'New ducts sized for a 3-ton system, with supply runs and a return.',
      olit_02c58512bac6431db446923499bc8ba9: 'New ducts sized for a 4-ton system.',
      olit_11dc6d19115945429ee001d405de0e9e: 'New ducts sized for a 5-ton system.',
      olit_4d5970245bfe46d1ae7543b732e5ca9b: 'New ducts sized for a 5-ton system.',
      olit_627b2c16c0ac4b42b19f98933ac47786: 'Repair a damaged return duct so air can get back to the system.',
      olit_8b10021929dc467eb253b4868a2c88f0: 'Replace a damaged section of duct so air can move through the system.',
      olit_192e9cd118674adb9f6127ce85cc7e9e: 'An extra return so air can get back to the heating and cooling system.',
      olit_b4c1a2e937f649b7b5b0e4e6d2074c60: 'Controls that send heating and cooling to different areas of the home.',
      olit_1a759a62e3ff4c7e9032a6320b176ebf: 'A damper that opens and closes to control airflow in one duct.',
      olit_d2cce72f616d469e961c0f11ad035139: 'A cabinet that holds a filter on the system.',
      olit_4316891c6fd6473b972cd7f424d22618: 'A thicker filter in a cabinet on the furnace or air handler.',
      olit_e83104e8c3f7439d817dfbf9129ef442: 'An air purifier that mounts in the duct.',
      olit_203b23d0d81b462e967829d24099cd86: 'A dehumidifier connected to a thermostat, for a home that needs drier air.',
      olit_3a534fdac4ed45058cfa0c10084fc3a3: 'A touchscreen thermostat that connects to Wi-Fi.',
      olit_bbc1c1da050b4c19b616d11a8f64c474: 'A Wi-Fi thermostat you can adjust from a phone.'
    },
    addonDescriptionFallbacks: [
      { keyword: 'duct repair', text: 'Repair or replace a damaged section of duct.' },
      { keyword: 'return air', text: 'An extra return so air can get back to the heating and cooling system.' },
      { keyword: 'zone damper', text: 'A damper that opens and closes to control airflow in one duct.' },
      { keyword: 'zone', text: 'Controls that send heating and cooling to different areas of the home.' },
      { keyword: 'duct', text: 'Ductwork that carries heated and cooled air through the home.' },
      { keyword: 'purifier', text: 'An air purifier that mounts in the duct.' },
      { keyword: 'dehumidifier', text: 'A dehumidifier connected to the heating and cooling system.' },
      { keyword: 'filter', text: 'A filter for air that moves through the heating and cooling system.' },
      { keyword: 'media', text: 'A filter for air that moves through the heating and cooling system.' },
      { keyword: 'thermostat', text: 'A thermostat that sets the temperature for heating and cooling.' },
      { category: 'IAQ', text: 'A filter or cleaner for the air that moves through the heating and cooling system.' },
      { category: 'Ducting', text: 'Ductwork or a duct accessory for air moving through the home.' },
      { category: 'Thermostats and Controls', text: 'A control for the heating and cooling system.' }
    ]
  };
});
