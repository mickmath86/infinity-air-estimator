# Infinity Air HVAC estimator

Embeddable estimator for Infinity Air Heating and Cooling. Plain JavaScript, no framework and no build step. The page and the two serverless functions deploy on Vercel.

Prices come from the Housecall Pro price book. The live copy is a Google Sheet. `data/pricebook.csv` is only the fallback snapshot.

## Demo walkthrough

Open the demo with `node scripts/dev-server.js` and visit `http://localhost:3000`. On Vercel, `index.html` is the same demo. Address autocomplete stays off until `data-google-maps-key` is a real browser key. The placeholder `YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY` is left in place on purpose.

`questionnaire-preview.html` is the same flow and does not submit a lead (`data-preview="true"`).

Screens, in order:

1. **Property.** Residential is the main choice. Commercial is grayed out, labeled Coming soon, and still opens a Contact Ryan form. No price.
2. **Replacement or repair.** Repair goes straight to Contact Ryan. An on-site visit is required, so there is no estimate. Replacement continues.
3. **ZIP code.** Coastal Orange County beach ZIPs use 500 sq. ft. per ton. Inland Riverside and San Bernardino ZIPs, and any ZIP not on the list, use 400 sq. ft. per ton. The lists are in `data/demo-config.js` and are not confirmed yet.
4. **Current system.** Gas furnace + AC split, heat pump split, package unit, or ductless mini-split, from the categories that are actually in the price book.
5. **Home size.** Square-footage ranges. Tonnage rounds up to the next whole ton. If the home lands between two whole tons, both sizes are shown (3.5 becomes the 3 ton and the 4 ton options, not a single 4 ton). Half tons are never offered. Tons that are not in the price book for that equipment are clamped to the closest size in the book, and a tie stays with the smaller ton.
6. **Mini-split rooms.** Only when the current system is a ductless mini-split. One, two, three, or four or more rooms.
7. **System age.** Recorded for Ryan. It does not change the price.
8. **Add-ons.** Multi-select rows from the price-book categories Ducting, IAQ, and Thermostats and Controls. A chosen add-on is priced onto each Bronze, Silver, and Gold card for the ton it fits. A zero or blank price is Call for quote, never $0.
9. **Equipment preference.** Two cards: Value line (the label is `valueLineLabel` in `data/demo-config.js`) and American Standard. The value line is the mid-tier book used for Bronze, Silver, and Gold. American Standard is call for quote until `americanStandardPricesEnabled` is set to `true`.
10. **Proposal or contact.** The value line shows a color-coded Bronze, Silver, and Gold card for each whole ton, with a series name (for example M series or Z series inverter), the system price, the add-on subtotal, and the total. The customer-facing cards do not use the house brand name. Gas Gold keeps the tier label `Gold` until `goldGasTierLabel` is edited. Missing prices say Call for quote. The lead form under the cards creates the Housecall Pro estimate and sends the GHL webhook. Commercial, repair, mini-split, and American Standard stop on Contact Ryan and still capture the lead.

## Price book

Set this on the Vercel project (Production and Preview) as `PRICEBOOK_SHEET_CSV_URL`:

```text
https://docs.google.com/spreadsheets/d/1QXmjqCzqrBBnRqj6deCe5cR9qcVMWXGxzbxJLhplQGs/export?format=csv
```

Do not add `gid=0`. That export returns HTTP 400. The function follows the sheet’s redirect. The sheet is shared as anyone with the link, viewer, which is what makes this URL readable without a Google login.

`api/pricebook.js` parses that CSV, drops the cost column, and returns JSON. The response is cached with `s-maxage=300` and `stale-while-revalidate=300`, so a Sheet edit shows up in about five minutes and the sheet is not fetched for every visitor. The JSON includes `source` (`sheet` or `snapshot`) and `fetchedAt`. Customers do not see those fields.

If the variable is missing, the fetch fails, the body is not a CSV, or there are fewer than 10 data rows, the function serves `data/pricebook.csv` and logs a warning. Quotes still load.

To refresh the snapshot, export the price book from Housecall Pro (or download the sheet as CSV) and replace `data/pricebook.csv`. The header row must stay `industry,industry_uuid,category,uuid,name,description,price,cost,taxable,unit_of_measure,task_code,online_booking_enabled`. Redeploy so the fallback file ships. Day-to-day price edits belong in the Sheet, not in a redeploy.

Sizing, the value-line label, the American Standard price flag, and the Gold gas tier label are the repo settings in `data/demo-config.js`. They are not in the price book. Changing them needs a deploy.

## Add-ons in the book

The add-on question uses these categories:

- **Ducting** — duct repair, ton-sized duct systems, return air, and zone controls.
- **IAQ** — air purifier and filter cabinets.
- **Thermostats and Controls** — Nest and Honeywell controls.

Gaps worth cleaning up in the Sheet:

- Several add-on rows are $0 (Nest thermostat, iWave purifier, 4 ton duct system, both zone-control rows). Those cards say Call for quote.
- Duct repair is listed twice ($500 and $700). 5 ton ducting is listed twice ($5,200 and $4,050). Both rows are shown so the price is not guessed.
- Permits and HERS fees sit under Custom Services and Air Conditioning, not in an add-on category, so they are not on the add-on step.
- 3 ton ductwork is also listed twice, at $4,000 and $3,500.

## Housecall Pro and the webhook

`api/create-housecall-estimate.js` still creates the customer and, when the proposal has a real total, one estimate option per priced tier and ton. Each option includes the system line and the priced add-ons that fit that ton. A Call for quote tier is left off the estimate and described in the note. Repair, commercial, mini-split, and American Standard leads create the customer and send the same payload to `GHL_WEBHOOK_URL` without an estimate total.

Required Vercel environment variables:

- `PRICEBOOK_SHEET_CSV_URL` — the export URL above
- `HOUSECALL_PRO_API_KEY`
- `GHL_WEBHOOK_URL`

## Scripts

```bash
node test-questionnaire.js
node test-pricebook.js
node test-hcp-line-items.js
node test-housecall-api.js
node scripts/data-quality-report.js
node scripts/data-quality-report.js data/pricebook.csv
node scripts/data-quality-report.js "https://docs.google.com/spreadsheets/d/1QXmjqCzqrBBnRqj6deCe5cR9qcVMWXGxzbxJLhplQGs/export?format=csv"
node scripts/dev-server.js
```

The dev server uses the snapshot when `PRICEBOOK_SHEET_CSV_URL` is unset. Without the Housecall Pro and GHL variables it accepts the lead form locally and marks the response as a preview so the tier screen can be reviewed.

## Embed

```html
<script src="https://infinity-air-estimator.vercel.app/estimator-model.js"></script>
<script src="https://infinity-air-estimator.vercel.app/demo-flow.js"></script>
<script
  src="https://infinity-air-estimator.vercel.app/infinity-air-estimator.js"
  data-target="#infinity-air-estimator"
  data-pricebook-endpoint="https://infinity-air-estimator.vercel.app/api/pricebook"
  data-housecall-endpoint="https://infinity-air-estimator.vercel.app/api/create-housecall-estimate"
  data-google-maps-key="YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY">
</script>
```

The widget loads the other two files itself if they are omitted. Relative `/api/...` URLs are correct on the estimator’s own host, including a Vercel preview.
