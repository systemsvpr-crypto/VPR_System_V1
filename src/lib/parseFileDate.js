import * as XLSX from 'xlsx';

// True only for a real calendar date — catches things like day/month range
// checks alone would miss (e.g. "31/02/2024": Feb never has 31 days).
const isRealDate = (year, month, day) => {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
};

// Converts a genuine Excel serial date number to YYYY-MM-DD, or '' if it
// isn't one. Never falls through to string parsing on failure — an Excel
// serial (e.g. 45647) fed into the native Date parser as a bare number
// string gets read as a literal YEAR ("Jan 1, year 45647"), which is
// exactly the "year showing wrong" corruption this whole module exists to
// prevent, so a failed numeric parse must stay a failure, not a guess.
const parseSerial = (num) => {
  try {
    const dateObj = XLSX.SSF.parse_date_code(num);
    if (dateObj) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, '0');
      const d = String(dateObj.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (err) {}
  return '';
};

// Shared by every bulk-upload flow (Sales orders, Purchase indents, Bulk
// Dispatch) that reads a Date column from an uploaded Excel/CSV file.
// Handles the real shapes a spreadsheet date arrives in:
//   - a genuine Excel date cell -> a serial number, via XLSX.SSF (which
//     already accounts for Excel's 1900 leap-year bug) rather than manual
//     epoch arithmetic, which is easy to get subtly wrong.
//   - already-ISO text ("2025-09-01")
//   - typed D/M/YYYY or D-M-YYYY text, 2- or 4-digit year, matching this
//     app's own dd/MM/yyyy convention everywhere else (DatePicker, tables)
//   - typed YYYY/M/D or YYYY-M-D (year-first, occasionally seen in exports)
// Falls back to the native Date parser for anything else, but reads its
// LOCAL date parts rather than going through toISOString() — routing a
// non-ISO string through toISOString() silently shifts the date back a day
// in any timezone ahead of UTC (e.g. India), which is exactly the kind of
// bug that made past-year (2024/2025) uploads come out wrong here.
// Returns '' for anything it can't confidently parse — callers must NOT
// paper over that with a default (like "today"), since that silently turns
// a real, present date value into a wrong one instead of surfacing it.
export const parseFileDate = (val) => {
  if (val === null || val === undefined || val === '') return '';

  if (typeof val === 'number') return parseSerial(val);

  const str = String(val).trim();
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // A cell can hold an Excel serial date as plain TEXT rather than a real
  // numeric type — e.g. when the source file is a CSV (no cell types at
  // all) or the column got text-formatted. A bare 5-6 digit number here is
  // that serial (any realistic business date from ~1927 onward), not a
  // day/month/year string — route it the same way as the numeric branch
  // above, never through the native Date parser, which would read "45647"
  // as the literal year 45647 instead of Dec 21, 2024. A bare 4-digit
  // number (e.g. "2024") is left to the fallback below, which reads it as
  // a plain year instead — the far more likely intent at that length.
  if (/^\d{5,6}(\.\d+)?$/.test(str)) return parseSerial(Number(str));

  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) year = (year <= 68 ? 2000 : 1900) + year;
    if (isRealDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const ymd = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (isRealDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
};
