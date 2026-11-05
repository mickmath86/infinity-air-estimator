const fs = require('fs');
const path = require('path');
const { parseCsv, normalizePricebook, dataQuality, formatQualityReport } = require('../estimator-model');

async function readSource(source) {
  if (!source) {
    const file = path.join(__dirname, '..', 'data', 'pricebook.csv');
    return { label: file, text: fs.readFileSync(file, 'utf8') };
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Price book URL returned ${response.status}.`);
    return { label: source, text: await response.text() };
  }
  const file = path.resolve(source);
  return { label: file, text: fs.readFileSync(file, 'utf8') };
}

async function main() {
  const source = process.argv[2] || '';
  const loaded = await readSource(source);
  const items = normalizePricebook(parseCsv(loaded.text));
  const report = formatQualityReport(dataQuality(items), loaded.label);
  console.log(report);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
