const assert = require('node:assert/strict');
const { buildHcpLineItems } = require('./infinity-air-estimator.js');

const multiple = buildHcpLineItems([
  { name: 'Equipment', description: 'Heat pump', quantity: 1, unitPrice: 8500, priceUnit: 'dollars' },
  { name: 'Registers', description: 'Supply registers', quantity: 4, unitPrice: 125.5, priceUnit: 'dollars' }
]);
assert.deepEqual(multiple, [
  { name: 'Equipment', description: 'Heat pump', quantity: 1, unit_price: 850000 },
  { name: 'Registers', description: 'Supply registers', quantity: 4, unit_price: 12550 }
]);

const flatRate = buildHcpLineItems([
  { name: 'Tune-up', description: 'Flat-rate seasonal service', quantity: 1, unitPrice: 129, priceUnit: 'dollars' }
]);
assert.equal(flatRate[0].quantity, 1);
assert.equal(flatRate[0].unit_price, 12900);

const decimal = buildHcpLineItems([
  { name: 'Part', description: 'Decimal price', quantity: 1, unitPrice: 19.995, priceUnit: 'dollars' }
]);
assert.equal(decimal[0].unit_price, 2000);

const zeroPriced = buildHcpLineItems([
  { name: 'Warranty', description: 'Included at no charge', quantity: 1, unitPrice: 0, priceUnit: 'dollars' }
]);
assert.equal(zeroPriced[0].unit_price, 0);

const quotedDescription = 'Replace "premium" filter\nIncludes setup and testing.';
const quoted = buildHcpLineItems([
  { name: 'Filter', description: quotedDescription, quantity: 1, unitPrice: 50, priceUnit: 'dollars' }
]);
assert.equal(quoted[0].description, quotedDescription);
assert.equal(JSON.parse(JSON.stringify(quoted))[0].description, quotedDescription);

assert.throws(() => buildHcpLineItems([
  { name: 'Missing price', description: '', quantity: 1 }
]), /Invalid unit price/);
assert.throws(() => buildHcpLineItems([
  { name: 'Invalid price', description: '', quantity: 1, unitPrice: Number.NaN, priceUnit: 'dollars' }
]), /Invalid unit price/);
assert.throws(() => buildHcpLineItems([
  { name: '', description: '', quantity: 1, unitPrice: 10, priceUnit: 'dollars' }
]), /name is required/);
assert.throws(() => buildHcpLineItems([
  { name: 'Invalid quantity', description: '', quantity: 0, unitPrice: 10, priceUnit: 'dollars' }
]), /Invalid quantity/);

const cents = buildHcpLineItems([
  { name: 'Stored in cents', description: 'No second conversion', quantity: 2, unitPrice: 12345, priceUnit: 'cents' }
]);
assert.equal(cents[0].unit_price, 12345);
assert.throws(() => buildHcpLineItems([
  { name: 'Fractional cents', description: '', quantity: 1, unitPrice: 123.45, priceUnit: 'cents' }
]), /Invalid unit price/);

const withoutTotals = buildHcpLineItems([
  { name: 'Service', description: 'Actual priced work', quantity: 1, unitPrice: 250, priceUnit: 'dollars' },
  { kind: 'subtotal', name: 'Subtotal', description: '', quantity: 1, unitPrice: 250, priceUnit: 'dollars' },
  { kind: 'grand_total', name: 'Grand total', description: '', quantity: 1, unitPrice: 250, priceUnit: 'dollars' }
]);
assert.deepEqual(withoutTotals, [
  { name: 'Service', description: 'Actual priced work', quantity: 1, unit_price: 25000 }
]);
assert.throws(() => buildHcpLineItems([
  { kind: 'subtotal', name: 'Subtotal', description: '', quantity: 1, unitPrice: 250, priceUnit: 'dollars' }
]), /priced line item is required/);

console.log('Housecall Pro line-item tests passed.');
