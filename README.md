# Infinity Air HVAC estimator

Embeddable estimator for Infinity Air Heating and Cooling. Plain JavaScript, no framework and no build step. The page and the two serverless functions deploy on Vercel.

Prices come from the Housecall Pro price book. The live copy is a Google Sheet. `data/pricebook.csv` is only the fallback snapshot.

## Demo walkthrough

Open the demo with `node scripts/dev-server.js` and visit `http://localhost:3000`. On Vercel, `index.html` is the same demo. Address autocomplete stays off until `data-google-maps-key` is a real browser key. The placeholder `YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY` is left in place on purpose.

`questionnaire-preview.html` is the same flow and does not submit a lead (`data-preview="true"`).

Screens, in order:

1. **Property.** Residential is the main choice. Commercial is grayed out, labeled Coming soon, and still opens a Contact Ryan form. No price.
2. **Replacement or repair.** Repair goes straight to Contact Ryan. An on-site visit is required, so there is no estimate. Replacement continues.
3. **ZIP code.** Coastal Orange County beach ZIPs use 500 sq. ft. per ton. Inland Riverside and San Bernardino ZIPs, and any ZIP not on the list, use 400 sq. ft. per ton. The customer sees that as a starting size. Internal review callouts are not shown. `showRyanReviewCallouts` in `data/demo-config.js` is `false`, and the page does not render a review note.
4. **Current system.** Gas furnace + AC split, heat pump split, package unit, or ductless mini-split, from the categories that are actually in the price book.
5. **Home size.** Square-footage ranges. Each answer shows one ton, taken from the top of the range and rounded up to the next whole ton. Half tons are never offered. If that ton is not in the price book, the next larger size the book offers is used. If the home is larger than every size in the book, the largest offered ton is used.
6. **Mini-split rooms.** Only when the current system is a ductless mini-split. One, two, three, or four or more rooms.
7. **System age.** Recorded for Ryan. It does not change the price.
8. **Add-ons.** Multi-select rows from the price-book categories Ducting, IAQ, and Thermostats and Controls, plus a duct-cleaning row from any category when its name matches `ductCleaningKeywords`. Zone-control and damper rows (ZoneFirst and anything whose name matches `hiddenAddonKeywords`, including a standalone “zone”) are left out. Only rows that fit the chosen ton are shown. Ductwork is an extra quantity row, priced per run from `ductworkPerRun.pricePerRun` in `data/demo-config.js` ($450 until that price moves to the sheet). It is not offered for a ductless mini-split. A chosen add-on is priced onto each Bronze, Silver, and Gold card. A zero or blank price is Call for quote, never $0. Going back and changing ZIP, system type, or home size drops an add-on that no longer fits, including from the summary and the Housecall Pro payload. The duct-run count is kept when the add-on step is still in the flow, and cleared when the project leaves replacement or becomes a mini-split. Card descriptions and the IAQ heading live in `data/demo-config.js` (`addonDescriptions`, keyed by price-book item id, with keyword and category fallbacks). If the price book has no duct-cleaning row, that add-on is simply absent.
9. **Equipment preference.** Two cards. The value line label is `valueLineLabel` in `data/demo-config.js`: **AC Pro (Value Line)**. American Standard is the **Premium Line**. Its card uses a dark navy and gold treatment and a Premium Line kicker. It stays call for quote until `americanStandardPricesEnabled` is set to `true`. The value line is the mid-tier book used for Bronze, Silver, and Gold. Tier cards still do not print the AC Pro name on the system itself.
10. **Contact, then the proposal.** The customer-info form comes first, with the not-a-binding-quote disclaimer. Bronze, Silver, and Gold cards are shown only after the lead is sent. A failed submit stays on the form, shows an error, and can be tried again. The same `/api/create-housecall-estimate` request creates the Housecall Pro estimate and sends the GHL webhook. The value line then shows one color-coded set for that ton, with a series name (for example M series or Z series inverter), the system price, the add-on subtotal, and the total. Cards stay in Bronze, Silver, Gold order unless the Silver system costs more than the matching Gold system. In that case that ton is ordered from the lower price to the higher price, and a note says why. Gas Gold keeps the tier label `Gold` until `goldGasTierLabel` is edited. A firm total is the sum of the shown prices. If any selected line is call for quote and there is a known dollar amount, the total reads **at least $X plus call for quote**. If nothing has a price, the total is Call for quote. A Housecall option is created only when the tier has a firm total, so a call-for-quote tier is described in the note instead of sent as a priced option. The disclaimer on the results is `quoteDisclaimer` in `data/demo-config.js`. Commercial, repair, mini-split, and American Standard stop on the contact form and still capture the lead. There is no price to reveal on those paths.

## Price book

Set this on the Vercel project (Production and Preview) as `PRICEBOOK_SHEET_CSV_URL`:

```text
https://docs.google.com/spreadsheets/d/1QXmjqCzqrBBnRqj6deCe5cR9qcVMWXGxzbxJLhplQGs/export?format=csv
```

Do not add `gid=0`. That export returns HTTP 400. The function follows the sheet’s redirect. The sheet is shared as anyone with the link, viewer, which is what makes this URL readable without a Google login.

`api/pricebook.js` parses that CSV, drops the cost column, and returns JSON. Sheet prices may include a dollar sign and thousands separators (`$5,100.00`). `parsePrice` strips `$`, commas, and spaces before reading the number. The response is cached with `s-maxage=300` and `stale-while-revalidate=300`, so a Sheet edit shows up in about five minutes and the sheet is not fetched for every visitor. The JSON includes `source` (`sheet` or `snapshot`) and `fetchedAt`. Customers do not see those fields.

If the variable is missing, the fetch fails, the body is not a CSV, or there are fewer than 10 data rows, the function serves `data/pricebook.csv` and logs a warning. Quotes still load.

To refresh the snapshot, export the price book from Housecall Pro (or download the sheet as CSV) and replace `data/pricebook.csv`. The header row must stay `industry,industry_uuid,category,uuid,name,description,price,cost,taxable,unit_of_measure,task_code,online_booking_enabled`. Redeploy so the fallback file ships. Day-to-day price edits belong in the Sheet, not in a redeploy.

Sizing, the value-line label, the American Standard price flag, and the Gold gas tier label are the repo settings in `data/demo-config.js`. They are not in the price book. Changing them needs a deploy.

## Add-ons in the book

The add-on question uses these categories:

- **Ducting** — duct repair, ton-sized duct systems, and return air. Zone-control and damper rows are not offered.
- **IAQ** — air purifier and filter cabinets.
- **Thermostats and Controls** — Nest and Honeywell controls. The heading on the form says Thermostats. The IAQ heading says Indoor air quality and includes a short definition.
- **Duct cleaning** — any row whose name contains “duct cleaning” or “duct clean”, in whatever category the book uses. If that row is not in the book yet, the choice is omitted.
- **Ductwork per run** — not read from the sheet. The price is `ductworkPerRun.pricePerRun` ($450) in `data/demo-config.js`, with a quantity stepper. Put the price on the sheet later by editing that setting when the row exists.

Card copy is in `data/demo-config.js`. Each price-book item id can have its own sentence. If an id is missing, the first matching keyword or category fallback is used. The sentences do not include prices or ratings.

### Duplicate add-on rows

The customer sees one option per item. The match key is the category plus the name, with spacing and letter case ignored, and with “ducting” treated as “duct” so “3 Ton Duct System” and “3 Ton Ducting System” are one item. Duct-cleaning names are matched across categories.

The shown price is the lowest price above zero. A $0 or blank duplicate does not lower it. When the positive prices differ, the card says **from $X** and the tier total says **from $X** as well. The Housecall line uses that starting price and says the book lists more than one row. `scripts/data-quality-report.js` prints every duplicate and which row is shown.

Examples from the snapshot: Duct Repair is shown from $500 (the $700 row is hidden). 5 Ton Ducting System is shown from $4,050 (the $5,200 row is hidden). 3 ton ductwork is shown from $3,500 (the $4,000 “3 Ton Duct System” row is hidden).

### Silver priced above Gold

`scripts/data-quality-report.js` compares the Silver and Gold rows the questionnaire would pick, for each family, brand, and whole ton. When Silver costs more than Gold, the report flags it. The cards for that ton are ordered from the lower price to the higher price, with a note, so Silver is not presented as the middle step. Tier names stay Bronze, Silver, and Gold. The current snapshot has no Silver-above-Gold pair. A synthetic pair is covered in `test-questionnaire.js`.

Other sheet gaps:

- Several add-on rows are $0 (Nest thermostat, iWave purifier, 4 ton duct system). Those cards say Call for quote. The zone-control rows are also $0, and they are hidden rather than shown as call for quote.
- Permits and HERS fees sit under Custom Services and Air Conditioning, not in an add-on category, so they are not on the add-on step.
- Pro T701, Honeywell FocusPRO, and Sensi Touch ll are filed under Air Conditioning in the price book, so they do not appear on the add-on step. Move those rows to Thermostats and Controls in Housecall Pro when they should be offered here.

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

The dev server uses the snapshot when `PRICEBOOK_SHEET_CSV_URL` is unset. Without the Housecall Pro and GHL variables it accepts the lead form locally and marks the response as a preview. The tier cards appear after that preview submit.

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
