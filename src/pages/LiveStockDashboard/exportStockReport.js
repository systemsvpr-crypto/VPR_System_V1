import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFB9C4D0' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const UNCATEGORIZED = 'Uncategorized';

// The 3 factory godowns shown in the "Factory Stock List" block — matched
// against product.godowns[].godownName (case-insensitively). These are 3 of
// several "Own"-type godowns (which also include e.g. "Godown" and "LP"), so
// matching by name rather than godownType is what actually scopes it to just
// these 3 — spelling must match the real godowns table exactly: "Darba" and
// "Dusera" (not "Darbha"/"Dussera").
const FACTORY_GODOWNS = ['Darba', 'DP', 'Dusera'];

// Sorts sizes like "4X8", "5X10", "11X22" in numeric order instead of alphabetic.
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

// Groups products (matched by product_id from the products table) into
// Category -> { Product Type (rows) x Brand Name (columns) -> current stock qty }
//
// Products with NEITHER a Category NOR a Size (Product Type) are too sparse
// for that matrix — grouping them by "type" would just fall back to one row
// per product name. Those are pulled out into a flat Brand -> qty total
// instead, rendered as a compact 2-row Brand Name / Current Stock table.
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

const EMPTY_BUCKET = { types: new Set(), brands: new Set(), matrix: new Map() };

// Swaps rows/columns of a { types, brands, matrix } bucket — used to make the
// Uncategorized block match the PDF's transposed layout: rows = Brand Name,
// columns = Product Type (every other category keeps rows = Type, columns =
// Brand, as usual). Rebuilt from the original type x brand sets rather than
// splitting the matrix's " "-joined keys back apart, since either half of a
// key can itself contain spaces.
const transposeBucket = ({ types, brands, matrix }) => {
  const transposedMatrix = new Map();
  for (const type of types) {
    for (const brand of brands) {
      const value = matrix.get(`${type} ${brand}`) || 0;
      if (value !== 0) transposedMatrix.set(`${brand} ${type}`, value);
    }
  }
  return { types: brands, brands: types, matrix: transposedMatrix };
};

// For each of the 3 FACTORY_GODOWNS, collects every product with non-zero
// current stock at that specific godown, sorted by product name. Products
// not stocked at a given factory are left out of that factory's list rather
// than padding it out with "-" rows. Mirrors buildFactoryStockLists in
// exportStockPdf.js.
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

// Writes one category's pivot table into `sheet` starting at `startRow`.
// Returns the row number right after the block (before any gap the caller
// adds), or `null` if there was nothing to show — the caller should then
// leave the sheet blank rather than write a "no products" placeholder.
const writePivotBlock = (sheet, startRow, categoryName, date, { types, brands, matrix }) => {
  const sortedTypes = [...types].sort(naturalCompare);
  const sortedBrands = [...brands].sort((a, b) => a.localeCompare(b));

  if (sortedTypes.length === 0 || sortedBrands.length === 0) {
    return null;
  }

  const titleRow = sheet.getRow(startRow);
  titleRow.getCell(1).value = `${categoryName} — Live Stock (as of ${date})`;
  sheet.mergeCells(startRow, 1, startRow, Math.max(sortedBrands.length + 2, 2));
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1F2937' } };
  titleRow.height = 24;

  const headerRow = sheet.getRow(startRow + 1);
  headerRow.values = [categoryName, ...sortedBrands, 'Total'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 20;

  const colTotals = new Array(sortedBrands.length).fill(0);
  let rowNum = startRow + 2;

  for (const type of sortedTypes) {
    const qtys = sortedBrands.map((brand, i) => {
      const qty = matrix.get(`${type} ${brand}`) || 0;
      colTotals[i] += qty;
      return qty;
    });
    const rowTotal = qtys.reduce((a, b) => a + b, 0);

    const row = sheet.getRow(rowNum);
    row.values = [type, ...qtys, rowTotal];
    row.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(1).border = BORDER_ALL;

    qtys.forEach((qty, i) => {
      const cell = row.getCell(i + 2);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_ALL;
      cell.font = qty === 0
        ? { color: { argb: 'FFB0B7C3' } }
        : { bold: true, color: { argb: 'FF111827' } };
    });

    const totalCell = row.getCell(sortedBrands.length + 2);
    totalCell.font = { bold: true, color: { argb: 'FF1D4ED8' } };
    totalCell.alignment = { vertical: 'middle', horizontal: 'center' };
    totalCell.border = BORDER_ALL;
    totalCell.fill = TOTAL_FILL;

    rowNum += 1;
  }

  const grandTotal = colTotals.reduce((a, b) => a + b, 0);
  const totalRow = sheet.getRow(rowNum);
  totalRow.values = ['Total', ...colTotals, grandTotal];
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = TOTAL_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  rowNum += 1;

  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width || 0, 16);
  sortedBrands.forEach((brand, i) => {
    const col = sheet.getColumn(i + 2);
    col.width = Math.max(col.width || 12, brand.length + 2);
  });
  const totalCol = sheet.getColumn(sortedBrands.length + 2);
  totalCol.width = Math.max(totalCol.width || 0, 12);

  return rowNum;
};

// Writes the compact "no Category / no Size" block: just 2 rows — Brand Name
// across the top and Current Stock beneath it — instead of the Type x Brand
// matrix, since there's no Size to pivot by. Returns `null` (writing nothing)
// when there's no such data, rather than a "no products" placeholder.
const writeBrandStockBlock = (sheet, startRow, date, brandTotals) => {
  const sortedBrands = [...brandTotals.keys()].sort((a, b) => a.localeCompare(b));

  if (sortedBrands.length === 0) {
    return null;
  }

  const titleRow = sheet.getRow(startRow);
  titleRow.getCell(1).value = `No Category / No Size — Live Stock (as of ${date})`;
  sheet.mergeCells(startRow, 1, startRow, Math.max(sortedBrands.length + 1, 2));
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1F2937' } };
  titleRow.height = 24;

  const brandRow = sheet.getRow(startRow + 1);
  brandRow.values = ['Brand Name', ...sortedBrands];
  brandRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  brandRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  brandRow.height = 20;

  const stockRow = sheet.getRow(startRow + 2);
  stockRow.values = ['Current Stock', ...sortedBrands.map((brand) => brandTotals.get(brand) || 0)];
  stockRow.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } };
  stockRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  stockRow.getCell(1).border = BORDER_ALL;
  sortedBrands.forEach((brand, i) => {
    const cell = stockRow.getCell(i + 2);
    const qty = brandTotals.get(brand) || 0;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_ALL;
    cell.font = qty === 0
      ? { color: { argb: 'FFB0B7C3' } }
      : { bold: true, color: { argb: 'FF111827' } };
  });

  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width || 0, 16);
  sortedBrands.forEach((brand, i) => {
    const col = sheet.getColumn(i + 2);
    col.width = Math.max(col.width || 12, brand.length + 2);
  });

  return startRow + 3;
};

// Writes the "Factory Stock List" block: one Product Name / Qty pair of
// columns per factory (Darba, DP, Dusera), placed side by side with a blank
// gap column between each pair — mirrors the PDF's 6-column side-by-side
// layout. Returns `null` (writing nothing) when none of the 3 factories have
// any stock.
const FACTORY_COL_STARTS = [1, 4, 7]; // columns 1-2, 4-5, 7-8; 3 and 6 are gap columns

const writeFactoryStockBlock = (sheet, startRow, date, factoryLists) => {
  if (!factoryLists.some((f) => f.rows.length > 0)) {
    return null;
  }

  const lastCol = FACTORY_COL_STARTS[FACTORY_COL_STARTS.length - 1] + 1;

  const titleRow = sheet.getRow(startRow);
  titleRow.getCell(1).value = `Factory Stock List — Live Stock (as of ${date})`;
  sheet.mergeCells(startRow, 1, startRow, lastCol);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1F2937' } };
  titleRow.height = 24;

  const factoryHeaderRow = sheet.getRow(startRow + 1);
  const subHeaderRow = sheet.getRow(startRow + 2);

  factoryLists.forEach(({ factoryName }, i) => {
    const col = FACTORY_COL_STARTS[i];
    sheet.mergeCells(startRow + 1, col, startRow + 1, col + 1);
    [col, col + 1].forEach((c) => {
      const cell = factoryHeaderRow.getCell(c);
      cell.font = { bold: true, color: { argb: 'FF1F2937' } };
      cell.fill = HEADER_FILL;
      cell.border = BORDER_ALL;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    factoryHeaderRow.getCell(col).value = factoryName;

    subHeaderRow.getCell(col).value = 'Product Name';
    subHeaderRow.getCell(col + 1).value = 'Qty';
    [col, col + 1].forEach((c) => {
      const cell = subHeaderRow.getCell(c);
      cell.font = { bold: true, color: { argb: 'FF1F2937' } };
      cell.fill = HEADER_FILL;
      cell.border = BORDER_ALL;
      cell.alignment = { vertical: 'middle', horizontal: c === col ? 'left' : 'center' };
    });
  });
  factoryHeaderRow.height = 20;
  subHeaderRow.height = 20;

  const maxRows = Math.max(0, ...factoryLists.map((f) => f.rows.length));
  const dataStartRow = startRow + 3;

  for (let i = 0; i < maxRows; i++) {
    const row = sheet.getRow(dataStartRow + i);
    factoryLists.forEach(({ rows }, idx) => {
      const entry = rows[i];
      if (!entry) return;
      const col = FACTORY_COL_STARTS[idx];

      const nameCell = row.getCell(col);
      nameCell.value = entry.productName;
      nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
      nameCell.border = BORDER_ALL;

      const qtyCell = row.getCell(col + 1);
      qtyCell.value = entry.qty;
      qtyCell.alignment = { vertical: 'middle', horizontal: 'center' };
      qtyCell.border = BORDER_ALL;
      qtyCell.font = { bold: true, color: { argb: 'FF111827' } };
    });
  }

  FACTORY_COL_STARTS.forEach((col) => {
    const nameCol = sheet.getColumn(col);
    nameCol.width = Math.max(nameCol.width || 0, 30);
    const qtyCol = sheet.getColumn(col + 1);
    qtyCol.width = Math.max(qtyCol.width || 0, 10);
  });

  return dataStartRow + maxRows;
};

// Builds the whole report as ONE sheet, stacking blocks top to bottom in the
// same order and layout as the PDF export: every named category's pivot
// table, then Uncategorized (transposed — rows = Brand, columns = Type),
// then the No Category/No Size brand card, then Factory Stock List last.
const addCombinedReportSheet = (workbook, products, date) => {
  const sheet = workbook.addWorksheet('Live Stock Report', { views: [{ state: 'frozen', xSplit: 1, ySplit: 0 }] });

  const { categories, noSizeBrandTotals } = buildCategoryPivots(products);
  const factoryLists = buildFactoryStockLists(products);

  let row = 1;

  const categoryNames = [...categories.keys()]
    .filter((name) => name !== UNCATEGORIZED)
    .sort((a, b) => a.localeCompare(b));

  for (const categoryName of categoryNames) {
    const end = writePivotBlock(sheet, row, categoryName, date, categories.get(categoryName));
    if (end !== null) row = end + 1; // blank gap row between category blocks
  }

  const uncategorizedBucket = transposeBucket(categories.get(UNCATEGORIZED) || EMPTY_BUCKET);
  const uncategorizedEnd = writePivotBlock(sheet, row, UNCATEGORIZED, date, uncategorizedBucket);
  if (uncategorizedEnd !== null) row = uncategorizedEnd + 1;

  const noSizeEnd = writeBrandStockBlock(sheet, row, date, noSizeBrandTotals);
  if (noSizeEnd !== null) row = noSizeEnd + 1; // blank gap row before Factory Stock List

  writeFactoryStockBlock(sheet, row, date, factoryLists);
};

export const exportStockReport = async (products, date) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VPR Systems';

  addCombinedReportSheet(workbook, products, date);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Live_Stock_Report_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
