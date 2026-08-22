const UNCATEGORIZED = 'Uncategorized';

// Fixed display order for the report's category tables. Any category whose
// name matches an entry here (case-insensitively) is pinned to the top, in
// this exact order; categories not listed here fall back to alphabetical
// order after them, with "Uncategorized" always last regardless.
const CATEGORY_ORDER = [
  'China',
  'NT 200g',
  'NT 180g',
  'NT 160g',
  'NT 150g',
  'NT 140g',
  'BLK 200g',
  'CLR/FC',
  'D Cut',
  'Chutney',
  'Lock Bag',
  'Milky',
  'PP Woven',
  'Ld',
  'Blue',
  'NT 800g',
  'Garbage',
  'Sutli',
];
const CATEGORY_ORDER_INDEX = new Map(CATEGORY_ORDER.map((name, i) => [name.toLowerCase(), i]));

// The 3 factory godowns shown in the "Factory Stock List" section, matched
// against product.godowns[].godownName (case-insensitively). These are 3 of
// several "Own"-type godowns (which also include e.g. "Godown" and "LP"), so
// matching by name rather than godownType is what actually scopes it to just
// these 3 — spelling must match the real godowns table exactly: "Darba" and
// "Dusera" (not "Darbha"/"Dussera").
const FACTORY_GODOWNS = ['Darba', 'DP', 'Dusera'];

const naturalCompare = (a, b) => {
  const numsA = String(a).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  const numsB = String(b).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  const len = Math.max(numsA.length, numsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (numsA[i] ?? 0) - (numsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(a).localeCompare(String(b));
};

const formatNum = (n) => {
  const val = Number(n) || 0;
  return val === 0 ? '-' : val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Products with NEITHER a Category NOR a Size (Product Type) are too sparse
// for the Type x Brand matrix — grouping them by "type" would just fall back
// to one row per product name. Those are pulled out into a flat Brand -> qty
// total instead, rendered as a compact 2-row Brand Name / Current Stock table.
const buildCategoryPivots = (products) => {
  const categories = new Map();
  const noSizeBrandTotals = new Map();

  for (const p of products) {
    const category = p.category?.trim();
    const type = p.productType?.trim();
    const brand = p.brandName?.trim() || 'Unbranded';
    const qty = p.totals?.current || 0;

    if (!category && !type) {
      noSizeBrandTotals.set(brand, (noSizeBrandTotals.get(brand) || 0) + qty);
      continue;
    }

    const categoryKey = category || UNCATEGORIZED;
    const typeKey = type || p.productName;

    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, { types: new Set(), brands: new Set(), matrix: new Map() });
    }
    const bucket = categories.get(categoryKey);
    bucket.types.add(typeKey);
    bucket.brands.add(brand);
    const key = `${typeKey} ${brand}`;
    bucket.matrix.set(key, (bucket.matrix.get(key) || 0) + qty);
  }

  return { categories, noSizeBrandTotals };
};

// Renders the "no Category / no Size" card: a vertical Brand Name / Current
// Stock list — no header row — split into two side-by-side columns of
// roughly equal length instead of one row of brand headers with one row of
// values (which got unreadable once there were more than a handful of brands).
const buildBrandStockCard = (brandTotals) => {
  const sortedBrands = [...brandTotals.keys()].sort((a, b) => a.localeCompare(b));
  if (sortedBrands.length === 0) return '';

  const mid = Math.ceil(sortedBrands.length / 2);
  const halves = [sortedBrands.slice(0, mid), sortedBrands.slice(mid)];

  const buildHalf = (brands) => {
    if (brands.length === 0) return '';
    return `
      <table class="report-table category-table no-size-table">
        <tbody>
          ${brands
      .map((brand) => {
        const val = brandTotals.get(brand) || 0;
        return `
              <tr>
                <td class="text-left font-medium no-size-brand" title="${brand}">${brand}</td>
                <td class="text-right ${val > 0 ? 'font-medium' : 'text-muted'}">${formatNum(val)}</td>
              </tr>
            `;
      })
      .join('')}
        </tbody>
      </table>
    `;
  };

  return `
    <div class="category-card table-full-span">
      <div class="no-size-split">
        <div class="no-size-col">${buildHalf(halves[0])}</div>
        ${halves[1].length > 0 ? `<div class="no-size-col">${buildHalf(halves[1])}</div>` : ''}
      </div>
    </div>
  `;
};

// For each of the 3 FACTORY_GODOWNS, collects every product with non-zero
// current stock at that specific godown, sorted by product name. Products
// not stocked at a given factory are left out of that factory's list rather
// than padding it out with "-" rows.
const buildFactoryStockLists = (products) => {
  return FACTORY_GODOWNS.map((factoryName) => {
    const rows = [];
    for (const p of products) {
      const g = p.godowns?.find((gd) => gd.godownName?.trim().toLowerCase() === factoryName.toLowerCase());
      const qty = g?.current || 0;
      if (qty !== 0) rows.push({ productName: p.productName, qty });
    }
    rows.sort((a, b) => a.productName.localeCompare(b.productName));
    return { factoryName, rows };
  });
};

// Renders the "Factory Stock List" section: one vertical Product Name / Qty
// list per factory, placed side by side — 3 factories x (Product Name + Qty)
// = 6 columns across the page.
const buildFactoryStockCard = (factoryLists) => {
  if (!factoryLists.some((f) => f.rows.length > 0)) return '';

  const buildColumn = ({ factoryName, rows }) => `
    <div class="factory-col">
      <table class="report-table category-table factory-table">
        <thead>
          <tr><th colspan="2" class="text-center">${factoryName}</th></tr>
          <tr>
            <th class="text-left">Product Name</th>
            <th class="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${rows
      .map(
        (r) => `
            <tr>
              <td class="text-left font-medium factory-product">${r.productName}</td>
              <td class="text-right font-medium">${formatNum(r.qty)}</td>
            </tr>
          `
      )
      .join('')}
        </tbody>
      </table>
    </div>
  `;

  return `
    <div class="summary-section full-width">
      <div class="section-title">Factory Stock List</div>
      <div class="factory-split">
        ${factoryLists.map(buildColumn).join('')}
      </div>
    </div>
  `;
};

/**
 * Generates the complete HTML/CSS printable report string
 */
export const generatePrintableHtml = (products, summaryData, date) => {
  const { categories: categoriesMap, noSizeBrandTotals } = buildCategoryPivots(products);
  const categoryNames = [...categoriesMap.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;

    const idxA = CATEGORY_ORDER_INDEX.get(a.toLowerCase());
    const idxB = CATEGORY_ORDER_INDEX.get(b.toLowerCase());

    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;

    return a.localeCompare(b);
  });

  const factoryStockHtml = buildFactoryStockCard(buildFactoryStockLists(products));

  // Render Category Tables in Dynamic Stream Layout
  const categoryTablesHtml = categoryNames
    .map((categoryName) => {
      const { types, brands, matrix } = categoriesMap.get(categoryName);
      const sortedTypes = [...types].sort(naturalCompare);
      const sortedBrands = [...brands].sort((a, b) => a.localeCompare(b));

      if (sortedTypes.length === 0 || sortedBrands.length === 0) return '';

      // Uncategorized is transposed relative to every other category: rows
      // are Brand Name and columns are Product Type, instead of the usual
      // rows-are-Type / columns-are-Brand layout.
      const isUncategorized = categoryName === UNCATEGORIZED;
      const rowItems = isUncategorized ? sortedBrands : sortedTypes;
      const colItems = isUncategorized ? sortedTypes : sortedBrands;
      const cellValue = (row, col) => matrix.get(isUncategorized ? `${col} ${row}` : `${row} ${col}`) || 0;

      // Determine if Wide Table or Compact Table:
      // Small/Compact Table: <= 4 columns (flows side-by-side in 2-column stream)
      // Large/Wide Table: > 4 columns (spans full width across both columns)
      const isWideTable = colItems.length > 4;
      const isUltraWide = colItems.length > 12;

      return `
        <div class="category-card ${isWideTable ? 'table-full-span' : 'table-compact-span'}">
          <div class="table-wrapper">
            <table class="report-table category-table ${isUltraWide ? 'ultra-wide' : ''}">
              <thead>
                <tr>
                  <th class="text-left type-col">${categoryName}</th>
                  ${colItems
          .map(
            (col) => `
                    <th class="text-center brand-col ${isUltraWide ? 'vertical-header' : ''}" title="${col}">
                      <span>${col}</span>
                    </th>
                  `
          )
          .join('')}
                </tr>
              </thead>
              <tbody>
                ${rowItems
          .map((row) => {
            return `
                    <tr>
                      <td class="text-left font-bold type-col">${row}</td>
                      ${colItems
                .map((col) => {
                  const val = cellValue(row, col);
                  return `<td class="text-center ${val > 0 ? 'font-medium' : 'text-muted'}">${formatNum(val)}</td>`;
                })
                .join('')}
                    </tr>
                  `;
          })
          .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join('');

  const noSizeCardHtml = buildBrandStockCard(noSizeBrandTotals);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Live Stock Report - ${date}</title>
  <style>
    /* ============================================================
       PRINT LAYOUT & ENGINE COMPATIBILITY RULES
       ============================================================ */
    @page {
      size: A4 portrait;
      margin: 0mm; /* Eliminates browser default headers & footers (URL, title, date) */
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        padding: 0mm 6mm 0mm 6mm;
      }
      .page-footer {
        position: fixed;
        bottom: 4mm;
        left: 6mm;
        right: 6mm;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10px;
      line-height: 1.15;
      color: #1e293b;
      background: #ffffff;
      padding: 0mm 6mm 0mm 6mm;
    }

    /* HEADER BANNER */
    .report-header {
      background: #1e293b;
      color: #ffffff;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 4px;
      margin-bottom: 8px;
      column-span: all;
    }
    .report-header h1 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .report-header .sub-title {
      font-size: 9px;
      color: #94a3b8;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .report-header .meta-info {
      text-align: right;
    }
    .report-header .report-name {
      font-size: 13px;
      font-weight: 700;
    }
    .report-header .as-of-date {
      font-size: 9.5px;
      color: #cbd5e1;
    }

    /* ============================================================
       DYNAMIC STREAM MULTI-COLUMN CONTAINER
       ============================================================ */
    /* Single column in portrait — A4's ~190mm usable width can't fit two
       side-by-side pivot tables legibly the way landscape's ~285mm could. */
    .stream-container {
      column-count: 1;
      column-gap: 8px;
      column-fill: auto;
      width: 100%;
    }

    /* FULL-WIDTH SPANNING SECTIONS */
    /* .full-width is meant to flow normally (used by the section title),
       so it keeps break-inside: auto. Category tables (.table-full-span)
       avoid breaking — a wide table splitting mid-way with its header
       repeating on the next page left a lone dangling row on either side of
       the break, which read as broken/duplicated rather than one table. */
    .full-width {
      column-span: all;
      width: 100% !important;
      margin-bottom: 8px;
      break-inside: auto;
      page-break-inside: auto;
    }
    .table-full-span {
      column-span: all;
      width: 100% !important;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* COMPACT SIDE-BY-SIDE SPANNING SECTIONS */
    .table-compact-span {
      width: 100%;
      display: inline-block;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* SECTION HEADERS */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 3px;
      border-left: 3px solid #2563eb;
      padding-left: 5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* CATEGORY CARDS */
    .category-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      overflow: hidden;
    }
    .category-header {
      background: #f1f5f9;
      padding: 3px 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
    }
    .category-name {
      font-size: 10.5px;
      font-weight: 700;
      color: #1e293b;
    }
    .category-meta {
      font-size: 9px;
      color: #64748b;
      font-weight: 600;
    }

    /* ============================================================
       COMPACT DATA TABLES & TYPOGRAPHY
       ============================================================ */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }

    /* Belt-and-braces: some print engines only reliably honor break-inside
       on the table element itself, not just the wrapping .category-card /
       .table-*-span div — set it here too so a category table can't split
       mid-way even if the wrapper's hint gets ignored. */
    .category-table {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    thead {
      display: table-header-group; /* Repeats table header across pages */
      break-inside: avoid;
    }

    tfoot {
      display: table-footer-group;
      break-inside: avoid;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* ============================================================
       PAGE-GAP FRAME
       ============================================================ */
    /* body's own top/bottom padding only ever lands on the very first and
       very last printed page — a print engine doesn't repeat an element's
       padding at every page break, so page 2+ started flush against the
       paper edge with none of the breathing room the left/right padding
       gives every page. Wrapping the whole report in a table and using
       thead/tfoot as spacer rows reuses the table-header/footer-group
       repeat-on-every-page behavior above to get that same gap on every
       page, not just the first/last. */
    .page-frame {
      width: 100%;
      border-collapse: collapse;
    }
    .page-frame > thead > tr > td,
    .page-frame > tfoot > tr > td {
      height: 8mm;
      padding: 0;
      border: none;
    }
    /* The single row holding all real content must be allowed to break
       across pages — override the generic tr break-inside: avoid rule
       above, which would otherwise force the entire report onto one page. */
    .page-frame > tbody > tr {
      break-inside: auto;
      page-break-inside: auto;
    }
    .page-frame > tbody > tr > td {
      padding: 0;
      border: none;
    }

    .report-table th {
      background: #dbeafe;
      color: #1e293b;
      font-weight: 700;
      padding: 2.5px 3px;
      border: 1px solid #94a3b8;
      font-size: 10px;
      white-space: normal;
      word-break: break-word;
      line-height: 1.1;
    }

    .report-table td {
      padding: 2px 3px;
      border: 1px solid #cbd5e1;
      color: #334155;
      font-variant-numeric: tabular-nums;
    }

    .report-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .report-table tfoot td,
    .report-table tr.total-row td {
      background: #e2e8f0;
      color: #0f172a;
      font-weight: 700;
      border-top: 1.5px solid #64748b;
      border-bottom: 1.5px solid #64748b;
    }

    /* ALIGNMENT & UTILITIES */
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-medium { font-weight: 600; color: #0f172a; }
    .text-muted { color: #cbd5e1; }
    .text-primary { color: #1d4ed8; }
    .text-success { color: #15803d; }
    .text-danger { color: #b91c1c; }

    /* COLUMN WIDTH CONTROLS */
    .type-col {
      min-width: 48px;
      max-width: 90px;
      white-space: normal;
    }
    .total-col {
      width: 28px;
      min-width: 24px;
    }
    .brand-col {
      min-width: 20px;
    }

    /* ULTRA WIDE TABLES (12+ BRANDS) ROTATED/ANGLED HEADERS */
    .ultra-wide th.brand-col {
      font-size: 9.5px;
      padding: 3px 1px;
      max-width: 24px;
    }

    /* "NO CATEGORY / NO SIZE" CARD — two side-by-side vertical Brand/Qty lists */
    .no-size-split {
      display: flex;
      gap: 8px;
    }
    .no-size-col {
      flex: 1;
      min-width: 0;
    }
    .no-size-table {
      table-layout: fixed;
    }
    .no-size-brand {
      max-width: none;
      white-space: normal;
      word-break: break-word;
    }

    /* "FACTORY STOCK LIST" CARD — 3 side-by-side vertical Product/Qty lists,
       one per factory godown (Darbha, DP, Dussera) */
    .factory-split {
      display: flex;
      gap: 8px;
    }
    .factory-col {
      flex: 1;
      min-width: 0;
    }
    .factory-table {
      table-layout: fixed;
    }
    .factory-product {
      max-width: none;
      white-space: normal;
      word-break: break-word;
    }

    /* FOOTER */
    .page-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 3px;
      margin-top: 10px;
      font-size: 9px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      column-span: all;
    }
  </style>
</head>
<body>

  <!-- Wraps the entire report in a table so thead/tfoot spacer rows repeat
       an 8mm gap at the top and bottom of EVERY printed page (see the
       PAGE-GAP FRAME rules above) — not just the first page's top and the
       last page's bottom, which is all body's own padding can reach. -->
  <table class="page-frame">
    <thead><tr><td></td></tr></thead>
    <tfoot><tr><td></td></tr></tfoot>
    <tbody>
      <tr>
        <td>

          <!-- Report Header Banner -->
          <div class="report-header">
            <div>
              <h1>VPR SYSTEMS</h1>
              <div class="sub-title">Enterprise Inventory Suite</div>
            </div>
            <div class="meta-info">
              <div class="report-name">LIVE STOCK REPORT</div>
              <div class="as-of-date">As of ${date}</div>
            </div>
          </div>

          <div class="section-title full-width" style="margin-top: 6px;">Product Stock Breakdown by Category</div>

          <!-- Dynamic Multi-Column Stream Container -->
          <div class="stream-container">
            ${categoryTablesHtml}
            ${noSizeCardHtml}
          </div>

          <!-- Factory Stock List (Full Width, shown last) -->
          ${factoryStockHtml}

        </td>
      </tr>
    </tbody>
  </table>

</body>
</html>
  `;
};

/**
 * Triggers clean native browser print-to-PDF via a hidden iframe
 */
export const exportStockPdf = async (products, summaryData, date) => {
  const htmlContent = generatePrintableHtml(products, summaryData, date);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('Unable to create print document');
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Wait for rendering to settle then trigger browser print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Print error:', err);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 350);
};
