const fs = require('fs');
const path = require('path');
const { loadPricebook } = require('../estimator-model');
const demoConfig = require('../data/demo-config');

const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=300';
// Documented Sheet export. Do not add gid=0; that returns HTTP 400. Fetch must follow the 307 redirect.
const DOCUMENTED_PRICEBOOK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1QXmjqCzqrBBnRqj6deCe5cR9qcVMWXGxzbxJLhplQGs/export?format=csv';

function readSnapshot() {
  return fs.readFileSync(path.join(__dirname, '..', 'data', 'pricebook.csv'), 'utf8');
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

async function handlePricebook(request, response, options) {
  setCors(response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = await loadPricebook(options);
    response.setHeader('Cache-Control', CACHE_CONTROL);
    return response.status(200).json(body);
  } catch (error) {
    console.error('Price book failed.', error.message);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(500).json({ error: 'The price book is unavailable.' });
  }
}

function handler(request, response) {
  const sheetUrl = process.env.PRICEBOOK_SHEET_CSV_URL || '';
  return handlePricebook(request, response, {
    sheetUrl,
    fetchImpl: (url, options = {}) => fetch(url, { ...options, redirect: 'follow' }),
    snapshotCsv: readSnapshot(),
    config: demoConfig,
    logger: console
  });
}

module.exports = handler;
module.exports.handlePricebook = handlePricebook;
module.exports.CACHE_CONTROL = CACHE_CONTROL;
module.exports.DOCUMENTED_PRICEBOOK_SHEET_URL = DOCUMENTED_PRICEBOOK_SHEET_URL;
module.exports.readSnapshot = readSnapshot;
