/**
 * Generates and downloads a sample CSV template for UltimateIMS product planning bulk import.
 *
 * Columns:
 * - Product Name: Exact product name (case-insensitive match)
 * - Lead Time (Days): Integer (reorder cycle days)
 * - Safety Factor (Days): Integer (buffer days)
 * - Reorder Qty: Number (planning reference, not saved to DB)
 * - Reorder Unit: BAG or KG (planning reference, not saved to DB)
 */
export function downloadImsTemplate(sampleProducts = []) {
  const headers = ['Product Name', 'Lead Time (Days)', 'Safety Factor (Days)', 'Reorder Qty', 'Reorder Unit'];

  let sampleRows = [];
  if (Array.isArray(sampleProducts) && sampleProducts.length > 0) {
    sampleRows = sampleProducts.slice(0, 5).map((p) => {
      const name = (p.productName || p.name || '').replace(/"/g, '""');
      const lead = p.leadTime ?? p.lead_time ?? 7;
      const safety = p.safetyFactor ?? p.safety_factor ?? 2;
      const unit = p.unit || 'BAG';
      return [`"${name}"`, lead, safety, 500, `"${unit}"`];
    });
  } else {
    sampleRows = [
      ['"100 No BLK 200g 10*13 (30 Kg)"', 7, 3, 500, '"BAG"'],
      ['"51 Mic Ld 8*11 (30 Kg)"', 5, 2, 300, '"BAG"'],
    ];
  }

  const csvContent = [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'ims_planning_import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
