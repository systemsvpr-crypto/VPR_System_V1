// Single shared rule for quantities across the whole system: up to two
// decimal places (e.g. 9.99, 2.23, 3.63) is valid; anything finer is
// rejected rather than silently rounded away, since the ledger should only
// ever hold what was actually entered.
const QTY_PRECISION_TOLERANCE = 1e-6;

export const roundQty = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const hasValidQtyPrecision = (value) => {
  const qty = Number(value);
  if (!Number.isFinite(qty)) return false;
  return Math.abs(roundQty(qty) - qty) < QTY_PRECISION_TOLERANCE;
};

// Sanitizes free-typed quantity input: digits plus at most one decimal
// point, e.g. while the user is still typing "12.50" or "1.".
export const sanitizeQtyInput = (raw) => {
  let v = String(raw ?? '').replace(/[^\d.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  return v;
};

// Formats a quantity for display: shows up to two decimal places only when
// the value actually has them (9 -> "9", 9.5 -> "9.5", 9.99 -> "9.99") —
// never rounds it away like toFixed(0) would.
export const formatQty = (value) =>
  (Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
