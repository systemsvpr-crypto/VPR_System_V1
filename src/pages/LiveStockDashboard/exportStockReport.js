import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFB9C4D0' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const UNCATEGORIZED = 'Uncategorized';

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

// Stacks every named category's pivot table into a single sheet, one block after another.
const addCombinedCategoriesSheet = (workbook, categories, date) => {
  const sheet = workbook.addWorksheet('Categories', { views: [{ state: 'frozen', xSplit: 1, ySplit: 0 }] });
  const categoryNames = [...categories.keys()]
    .filter((name) => name !== UNCATEGORIZED)
    .sort((a, b) => a.localeCompare(b));

  if (categoryNames.length === 0) {
    sheet.getCell(1, 1).value = 'No categorized products found.';
    sheet.getCell(1, 1).font = { italic: true, color: { argb: 'FF94A3B8' } };
    return;
  }

  let row = 1;
  for (const categoryName of categoryNames) {
    const end = writePivotBlock(sheet, row, categoryName, date, categories.get(categoryName));
    if (end !== null) row = end + 1; // blank gap row between category blocks
  }
};

// Both blocks return `null` when they have nothing to show — if neither has
// data, the sheet is left completely blank rather than showing a "no
// products" placeholder; if only one has data, it starts right at row 1
// instead of leaving a leading gap for the other, empty one.
const addUncategorizedSheet = (workbook, categories, noSizeBrandTotals, date) => {
  const sheet = workbook.addWorksheet('Uncategorized', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  const pivotEnd = writePivotBlock(sheet, 1, UNCATEGORIZED, date, categories.get(UNCATEGORIZED) || EMPTY_BUCKET);
  const nextRow = pivotEnd !== null ? pivotEnd + 1 : 1;
  writeBrandStockBlock(sheet, nextRow, date, noSizeBrandTotals);
};

const addDetailSheet = (workbook, products) => {
  const sheet = workbook.addWorksheet('All Products', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Product Type', key: 'type', width: 14 },
    { header: 'Brand Name', key: 'brand', width: 20 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Opening', key: 'opening', width: 12 },
    { header: 'Stock In', key: 'stockIn', width: 12 },
    { header: 'Stock Out', key: 'stockOut', width: 12 },
    { header: 'Closing', key: 'closing', width: 12 },
    { header: 'Current Stock', key: 'current', width: 14 },
    { header: 'Godown-wise Stock', key: 'godownWise', width: 40 },
  ];
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 20;

  for (const p of products) {
    const row = sheet.addRow({
      product: p.productName,
      category: p.category || '—',
      type: p.productType || '—',
      brand: p.brandName || '—',
      unit: p.unit,
      opening: p.totals.opening,
      stockIn: p.totals.stockIn,
      stockOut: p.totals.stockOut,
      closing: p.totals.closing,
      current: p.totals.current,
      godownWise: p.godowns.filter((g) => g.current !== 0).map((g) => `${g.godownName}: ${g.current}`).join(', ') || 'No stock',
    });
    row.eachCell((cell) => {
      cell.border = BORDER_ALL;
      cell.alignment = { vertical: 'middle' };
    });
  }
};

export const exportStockReport = async (products, date) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VPR Systems';

  const { categories, noSizeBrandTotals } = buildCategoryPivots(products);

  addCombinedCategoriesSheet(workbook, categories, date);
  addUncategorizedSheet(workbook, categories, noSizeBrandTotals, date);
  addDetailSheet(workbook, products);

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
