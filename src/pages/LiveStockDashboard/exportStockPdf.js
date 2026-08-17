const UNCATEGORIZED = 'Uncategorized';

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
  return val === 0 ? '-' : val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

/**
 * Generates the complete HTML/CSS printable report string
 */
export const generatePrintableHtml = (products, summaryData, date) => {
  const { categories: categoriesMap, noSizeBrandTotals } = buildCategoryPivots(products);
  const categoryNames = [...categoriesMap.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  const godowns = summaryData?.godowns || [];
  const godownTotals = summaryData?.totals || { opening: 0, stockIn: 0, stockOut: 0, closing: 0 };

  // Render Godown Summary Table
  const godownSummaryHtml = `
    <div class="summary-section full-width">
      <div class="section-title">Godown Summary</div>
      <table class="report-table summary-table">
        <thead>
          <tr>
            <th class="text-left" style="width: 30%;">Godown</th>
            <th class="text-left" style="width: 15%;">Type</th>
            <th class="text-right">Opening</th>
            <th class="text-right">Stock In</th>
            <th class="text-right">Stock Out</th>
            <th class="text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          ${godowns
      .map(
        (g) => `
            <tr>
              <td class="font-bold text-left">${g.godownName}</td>
              <td class="text-left">${g.godownType || '-'}</td>
              <td class="text-right">${formatNum(g.opening)}</td>
              <td class="text-right text-success">+${formatNum(g.stockIn)}</td>
              <td class="text-right text-danger">-${formatNum(g.stockOut)}</td>
              <td class="text-right font-bold text-primary">${formatNum(g.closing)}</td>
            </tr>
          `
      )
      .join('')}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td class="font-bold text-left">Total</td>
            <td class="text-left"></td>
            <td class="text-right">${formatNum(godownTotals.opening)}</td>
            <td class="text-right text-success">+${formatNum(godownTotals.stockIn)}</td>
            <td class="text-right text-danger">-${formatNum(godownTotals.stockOut)}</td>
            <td class="text-right font-bold text-primary">${formatNum(godownTotals.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Render Category Tables in Dynamic Stream Layout
  const categoryTablesHtml = categoryNames
    .map((categoryName) => {
      const { types, brands, matrix } = categoriesMap.get(categoryName);
      const sortedTypes = [...types].sort(naturalCompare);
      const sortedBrands = [...brands].sort((a, b) => a.localeCompare(b));

      if (sortedTypes.length === 0 || sortedBrands.length === 0) return '';

      // Determine if Wide Table or Compact Table:
      // Small/Compact Table: <= 4 brand columns (flows side-by-side in 2-column stream)
      // Large/Wide Table: > 4 brand columns (spans full width across both columns)
      const isWideTable = sortedBrands.length > 4;
      const isUltraWide = sortedBrands.length > 12;

      return `
        <div class="category-card ${isWideTable ? 'table-full-span' : 'table-compact-span'}">
          <div class="table-wrapper">
            <table class="report-table category-table ${isUltraWide ? 'ultra-wide' : ''}">
              <thead>
                <tr>
                  <th class="text-left type-col">${categoryName}</th>
                  ${sortedBrands
          .map(
            (brand) => `
                    <th class="text-center brand-col ${isUltraWide ? 'vertical-header' : ''}" title="${brand}">
                      <span>${brand}</span>
                    </th>
                  `
          )
          .join('')}
                </tr>
              </thead>
              <tbody>
                ${sortedTypes
          .map((type) => {
            return `
                    <tr>
                      <td class="text-left font-bold type-col">${type}</td>
                      ${sortedBrands
                .map((brand) => {
                  const val = matrix.get(`${type} ${brand}`) || 0;
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
        padding: 8mm 6mm 8mm 6mm;
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
      font-size: 8px;
      line-height: 1.15;
      color: #1e293b;
      background: #ffffff;
      padding: 8mm 6mm 8mm 6mm;
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
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .report-header .sub-title {
      font-size: 7px;
      color: #94a3b8;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .report-header .meta-info {
      text-align: right;
    }
    .report-header .report-name {
      font-size: 11px;
      font-weight: 700;
    }
    .report-header .as-of-date {
      font-size: 7.5px;
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
    /* Godown Summary is the only thing that uses .full-width without also
       being a category table, and it's meant to flow normally, so it keeps
       break-inside: auto. Category tables (.table-full-span) now avoid
       breaking too — a wide table splitting mid-way with its header
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
      font-size: 9px;
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
      font-size: 8.5px;
      font-weight: 700;
      color: #1e293b;
    }
    .category-meta {
      font-size: 7px;
      color: #64748b;
      font-weight: 600;
    }

    /* ============================================================
       COMPACT DATA TABLES & TYPOGRAPHY
       ============================================================ */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.5px;
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

    .report-table th {
      background: #dbeafe;
      color: #1e293b;
      font-weight: 700;
      padding: 2.5px 3px;
      border: 1px solid #94a3b8;
      font-size: 7px;
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
      font-size: 6.5px;
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

    /* FOOTER */
    .page-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 3px;
      margin-top: 10px;
      font-size: 7px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      column-span: all;
    }
  </style>
</head>
<body>

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

  <!-- Godown Summary (Full Width) -->
  ${godownSummaryHtml}

  <div class="section-title full-width" style="margin-top: 6px;">Product Stock Breakdown by Category</div>

  <!-- Dynamic Multi-Column Stream Container -->
  <div class="stream-container">
    ${categoryTablesHtml}
    ${noSizeCardHtml}
  </div>



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
