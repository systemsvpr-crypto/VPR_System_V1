/**
 * Generates and downloads a dynamic CSV template for Pricing Tab bulk import.
 * The rank columns are generated dynamically from active ranks in the database.
 *
 * Columns:
 * - Group Name: Name of the pricing group (upsert: updates if exists, creates if new)
 * - [Rank Name] Rate (₹): Rate for each rank (e.g. "A Rate (₹)", "B Rate (₹)")
 */
export function downloadPricingTemplate(ranks = [], existingGroups = []) {
  const activeRanks = (ranks || []).filter((r) => r.is_active !== false);
  const rankColNames = activeRanks.map((r) => `${r.rank_name} Rate (₹)`);
  const headers = ['Group Name', ...rankColNames];

  let sampleRows = [];
  if (Array.isArray(existingGroups) && existingGroups.length > 0) {
    sampleRows = existingGroups.slice(0, 4).map((g, idx) => {
      const name = (g.group_name || '').replace(/"/g, '""');
      const rates = activeRanks.map((r, rIdx) => {
        const existing = g.rank_rates?.[r.rank_name] ?? (
          r.rank_name === 'A' ? g.a_rate :
          r.rank_name === 'B' ? g.b_rate :
          r.rank_name === 'C' ? g.c_rate : null
        );
        if (existing !== null && existing !== undefined && existing !== '') {
          return existing;
        }
        return (7.5 - rIdx * 0.5 + idx * 0.25).toFixed(2);
      });
      return [`"${name}"`, ...rates];
    });
  } else {
    sampleRows = [
      ['"Halal Premium"', ...activeRanks.map((_, i) => (8.5 - i * 0.5).toFixed(2))],
      ['"Halal Economy"', ...activeRanks.map((_, i) => (7.0 - i * 0.5).toFixed(2))],
      ['"Local Brand"', ...activeRanks.map((_, i) => (6.5 - i * 0.5).toFixed(2))],
    ];
  }

  const csvContent = [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'pricing_import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
