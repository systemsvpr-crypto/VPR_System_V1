import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFB9C4D0' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

// Flat one-row-per-product report: Date / Product Name / Current Stock
// (summed across every godown, same total already shown in the Product-wise
// Breakdown table's "Current Stock" column) — sorted by product name.
const addStockSheet = (workbook, products, date) => {
  const sheet = workbook.addWorksheet('Live Stock Report', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });

  const headerRow = sheet.getRow(1);
  headerRow.values = ['Date', 'Product Name', 'Current Stock'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 20;

  const sorted = [...products].sort((a, b) => a.productName.localeCompare(b.productName));

  let rowNum = 2;
  let totalStock = 0;
  for (const p of sorted) {
    const qty = p.totals?.current || 0;
    totalStock += qty;

    const row = sheet.getRow(rowNum);
    row.values = [date, p.productName, qty];
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).font = qty === 0
      ? { color: { argb: 'FFB0B7C3' } }
      : { bold: true, color: { argb: 'FF111827' } };
    row.eachCell((cell) => { cell.border = BORDER_ALL; });

    rowNum += 1;
  }

  // Add total row
  const totalRow = sheet.getRow(rowNum);
  totalRow.values = ['', 'Total', totalStock];
  totalRow.getCell(2).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(3).font = { bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.eachCell((cell) => { cell.border = BORDER_ALL; cell.fill = HEADER_FILL; });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 16;
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
