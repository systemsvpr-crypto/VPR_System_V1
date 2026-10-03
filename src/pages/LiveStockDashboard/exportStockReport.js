import ExcelJS from 'exceljs';
import { getProductGrouping } from '@/lib/productGrouping';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFB9C4D0' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

// A product's group is its Brand Name + Category (same definition as the
// Products page's Grouping column). Products with neither fall back to their
// own name, so each one is treated as a group of one.
const groupKeyOf = (p) =>
  getProductGrouping({ brand_name: p.brandName, category: p.category }) || `__product__${p.productName}`;

// Drop every group whose products ALL have zero current stock; if even one
// product in a group has stock, keep the whole group (including its zeros).
const filterEmptyGroups = (products) => {
  const groupsWithStock = new Set();
  for (const p of products) {
    if ((p.totals?.current || 0) > 0) groupsWithStock.add(groupKeyOf(p));
  }
  return products.filter((p) => groupsWithStock.has(groupKeyOf(p)));
};

// Godowns holding stock of any product in each group, highest group total
// first — used to fill in the Godown column for a group's zero-stock products.
const buildGroupGodowns = (products) => {
  const totals = new Map();
  for (const p of products) {
    const key = groupKeyOf(p);
    if (!totals.has(key)) totals.set(key, new Map());
    const godownTotals = totals.get(key);
    for (const g of p.godowns || []) {
      if (g.current === 0) continue;
      godownTotals.set(g.godownName, (godownTotals.get(g.godownName) || 0) + g.current);
    }
  }
  const result = new Map();
  for (const [key, godownTotals] of totals) {
    result.set(key, [...godownTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name));
  }
  return result;
};

// Report rows: Date / Product Name / Godown / Current Stock — one row per
// godown that holds non-zero stock of the product (highest first). A product
// with no stock anywhere gets a 0 row for each godown its group's other
// products are stocked in (or "-" if none), so its group stays complete.
// Sorted by product name.
const addStockSheet = (workbook, products, date) => {
  const sheet = workbook.addWorksheet('Live Stock Report', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });

  const headerRow = sheet.getRow(1);
  headerRow.values = ['Date', 'Product Name', 'Godown', 'Current Stock'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 20;

  const sorted = filterEmptyGroups(products).sort((a, b) => a.productName.localeCompare(b.productName));
  const groupGodowns = buildGroupGodowns(sorted);

  let rowNum = 2;
  let totalStock = 0;
  for (const p of sorted) {
    const godownRows = (p.godowns || [])
      .filter((g) => g.current !== 0)
      .sort((a, b) => b.current - a.current)
      .map((g) => [g.godownName, g.current]);
    if (godownRows.length === 0) {
      const siblingGodowns = groupGodowns.get(groupKeyOf(p)) || [];
      if (siblingGodowns.length === 0) godownRows.push(['-', 0]);
      else siblingGodowns.forEach((name) => godownRows.push([name, 0]));
    }

    for (const [godownName, qty] of godownRows) {
      totalStock += qty;

      const row = sheet.getRow(rowNum);
      row.values = [date, p.productName, godownName, qty];
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(4).font = qty === 0
        ? { color: { argb: 'FFB0B7C3' } }
        : { bold: true, color: { argb: 'FF111827' } };
      row.eachCell((cell) => { cell.border = BORDER_ALL; });

      rowNum += 1;
    }
  }

  // Add total row
  const totalRow = sheet.getRow(rowNum);
  totalRow.values = ['', '', 'Total', totalStock];
  totalRow.getCell(3).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(4).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.eachCell((cell) => { cell.border = BORDER_ALL; cell.fill = HEADER_FILL; });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 16;
};

export const exportStockReport = async (products, date) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VPR Systems';

  addStockSheet(workbook, products, date);

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
