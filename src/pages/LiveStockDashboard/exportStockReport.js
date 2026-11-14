import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFB9C4D0' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

/**
 * Generates the Excel Stock Report with 7 columns:
 * Date | Product Name | Opening Stock | Stock In | Stock Out | Closing Stock | Current Stock (Godowns)
 * One row per product with a grand summary total row at the bottom.
 */
const addStockSheet = (workbook, products, date) => {
  const sheet = workbook.addWorksheet('Product Wise Stock Report', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  // 1. Setup Column Headers
  const headerRow = sheet.getRow(1);
  headerRow.values = [
    'Date',
    'Product Name',
    'Opening Stock',
    'Stock In',
    'Stock Out',
    'Closing Stock',
    'Current Stock (Godowns)',
  ];

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 24;

  // 2. Sort Products Alphabetically
  const sorted = [...(products || [])].sort((a, b) =>
    (a.productName || '').localeCompare(b.productName || '')
  );

  let rowNum = 2;
  let totalOpening = 0;
  let totalStockIn = 0;
  let totalStockOut = 0;
  let totalClosing = 0;
  let totalCurrent = 0;

  // 3. Populate Product Rows
  for (const p of sorted) {
    const opening = Number(p.totals?.opening || 0);
    const stockIn = Number(p.totals?.stockIn || 0);
    const stockOut = Number(p.totals?.stockOut || 0);
    const closing = Number(p.totals?.closing || 0);
    const current = Number(p.totals?.current || 0);

    totalOpening += opening;
    totalStockIn += stockIn;
    totalStockOut += stockOut;
    totalClosing += closing;
    totalCurrent += current;

    // Active godowns holding stock for this product
    const activeGodowns = (p.godowns || [])
      .filter((g) => (g.current || 0) !== 0)
      .sort((a, b) => (b.current || 0) - (a.current || 0))
      .map((g) => `${g.godownName}: ${Number(g.current).toLocaleString('en-IN')}`);
    const godownStr = activeGodowns.length > 0 ? activeGodowns.join(', ') : '—';

    const row = sheet.getRow(rowNum);
    row.values = [date, p.productName || '—', opening, stockIn, stockOut, closing, godownStr];

    // Alignments
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };

    // Number formats & fonts
    [3, 4, 5, 6].forEach((colIdx) => {
      const cell = row.getCell(colIdx);
      cell.numFmt = '#,##0.##';
    });

    row.getCell(3).font = opening === 0 ? { color: { argb: 'FF9CA3AF' } } : { color: { argb: 'FF374151' } };
    row.getCell(4).font = stockIn === 0 ? { color: { argb: 'FF9CA3AF' } } : { color: { argb: 'FF16A34A' } };
    row.getCell(5).font = stockOut === 0 ? { color: { argb: 'FF9CA3AF' } } : { color: { argb: 'FFDC2626' } };
    row.getCell(6).font = closing === 0 ? { color: { argb: 'FF9CA3AF' } } : { bold: true, color: { argb: 'FF1E40AF' } };

    row.eachCell((cell) => {
      cell.border = BORDER_ALL;
    });

    rowNum += 1;
  }

  // 4. Add Grand Total Row at Bottom
  const totalRow = sheet.getRow(rowNum);
  totalRow.values = [
    '',
    'Total',
    totalOpening,
    totalStockIn,
    totalStockOut,
    totalClosing,
    `Total: ${totalCurrent.toLocaleString('en-IN')}`,
  ];

  totalRow.getCell(2).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };

  [3, 4, 5, 6].forEach((colIdx) => {
    const cell = totalRow.getCell(colIdx);
    cell.numFmt = '#,##0.##';
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });

  totalRow.getCell(7).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };

  totalRow.eachCell((cell) => {
    cell.border = BORDER_ALL;
    cell.fill = HEADER_FILL;
  });
  totalRow.height = 22;

  // 5. Column Widths
  sheet.getColumn(1).width = 14; // Date
  sheet.getColumn(2).width = 42; // Product Name
  sheet.getColumn(3).width = 16; // Opening Stock
  sheet.getColumn(4).width = 14; // Stock In
  sheet.getColumn(5).width = 14; // Stock Out
  sheet.getColumn(6).width = 16; // Closing Stock
  sheet.getColumn(7).width = 34; // Current Stock (Godowns)
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
  link.download = `Product_Wise_Stock_Report_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
