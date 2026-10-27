// Formatting helpers for WhatsApp template parameters. Pure functions (no
// imports) so they can be exercised directly with Node.
//
// Meta rejects template parameters containing newlines or tabs (error 132018)
// and more than 4 consecutive spaces, so a multi-product list has to travel as
// one single line: each product entry gets a numbered emoji and entries are
// joined with " • ".

// Keycap digit emoji = the digit + U+FE0F + U+20E3 (built from char codes so
// the source stays plain ASCII): 0️⃣ 1️⃣ 2️⃣ … 9️⃣.
const KEYCAP_SUFFIX = String.fromCharCode(0xFE0F, 0x20E3);

// Entry numbers spelled out with keycap digits, so any number works:
// 1 → 1️⃣, 9 → 9️⃣, 10 → 1️⃣0️⃣, 11 → 1️⃣1️⃣, 105 → 1️⃣0️⃣5️⃣.
export const numberLabel = (index) => String(index + 1)
  .split('')
  .map(d => `${d}${KEYCAP_SUFFIX}`)
  .join('');

// Line breaks and tabs become spaces (never deleted outright, so words don't
// run together); runs of spaces collapse to one. Other Unicode (₹, ×, emoji)
// is left untouched. Also catches the Unicode LINE / PARAGRAPH SEPARATOR
// characters (U+2028 / U+2029), built from char codes so the source file never
// holds those raw line-terminator characters.
const LINE_BREAKS = new RegExp(`[\\r\\n\\t${String.fromCharCode(0x2028, 0x2029)}]+`, 'g');

export const toSingleLine = (value) => String(value ?? '')
  .replace(LINE_BREAKS, ' ')
  .replace(/ {2,}/g, ' ')
  .trim();

// Strips numbering an entry may already carry ("1.", "2)", "3️⃣", "1️⃣2️⃣", "🔟")
// so a pre-numbered list isn't numbered twice.
// (keycap = digit + optional U+FE0F + U+20E3, possibly several in a row; "🔟" is U+1F51F)
const KEYCAP = `\\d${String.fromCharCode(0xFE0F)}?${String.fromCharCode(0x20E3)}`;
const LEADING_NUMBER = new RegExp(`^(?:\\d+[.)]|(?:${KEYCAP})+|${String.fromCodePoint(0x1F51F)})\\s*`, 'u');

const numberEntries = (entries, startIndex, separator) => entries
  .map((entry, i) => `${numberLabel(startIndex + i)} ${entry.replace(LEADING_NUMBER, '')}`)
  .join(separator);

// Single-line, numbered product list for one template variable.
// "📦 Product Details: 1️⃣ A - ₹7 | Bags: 7 • 2️⃣ B - ₹5 | Bags: 3"
// Empty / blank entries are dropped; an empty list returns ''.
export const formatNumberedProductList = (entries, { heading = '📦 Product Details:', separator = ' • ', startIndex = 0 } = {}) => {
  const clean = (Array.isArray(entries) ? entries : []).map(toSingleLine).filter(Boolean);
  if (clean.length === 0) return '';
  const body = numberEntries(clean, startIndex, separator);
  return toSingleLine(heading ? `${heading} ${body}` : body);
};

// Same as formatNumberedProductList, but split into as many strings as needed
// to keep each under maxChars (a template's whole body is capped at 1024
// characters by Meta). Numbering continues across the parts, so the vendor can
// read part 2 as "6️⃣ … 7️⃣ …". An entry longer than maxChars on its own still
// goes out, alone, rather than being cut.
export const chunkNumberedProductList = (entries, { maxChars = 650, heading = '📦 Product Details:', separator = ' • ' } = {}) => {
  const clean = (Array.isArray(entries) ? entries : []).map(toSingleLine).filter(Boolean);
  const chunks = [];
  let current = [];
  let start = 0;
  clean.forEach((entry) => {
    const candidate = formatNumberedProductList([...current, entry], { heading, separator, startIndex: start });
    if (current.length > 0 && candidate.length > maxChars) {
      chunks.push(formatNumberedProductList(current, { heading, separator, startIndex: start }));
      start += current.length;
      current = [entry];
    } else {
      current.push(entry);
    }
  });
  if (current.length > 0) chunks.push(formatNumberedProductList(current, { heading, separator, startIndex: start }));
  return chunks;
};

// Purchase "delivered" message: builds the product-details / totals parameters
// for one LR. `group` is that LR's delivered items. When everything fits in
// maxChars it returns the single message exactly as before; otherwise the items
// are split over several messages (each with its own totals) so no parameter
// goes past Meta's length limit.
const round2 = (n) => Math.round(n * 100) / 100;
const SEP = ' 🔹 '; // what sanitizeParam turns the blank line between products into

export const buildDeliveryMessages = (group, { maxChars = 600 } = {}) => {
  const byGroup = group.reduce((acc, curr) => {
    const gKey = curr.groupName || 'Other';
    if (!acc[gKey]) acc[gKey] = [];
    acc[gKey].push(curr);
    return acc;
  }, {});

  // The first product of a group keeps its full name; later ones drop the
  // repeated group prefix ("… 10×13 (30.8 Kg) -57 | 13×16 (30.8 Kg) -22"),
  // as in the sales / vendor-approval messages.
  const itemText = (i, idx, gName) => {
    const r = Number(i.rate || 0);
    const rateStr = r ? (Number.isInteger(r) ? String(r) : r.toFixed(2)) : '0';
    // "5*10" -> "5×10": WhatsApp turns text between two "*" into bold.
    const name = toWhatsappSafeName(i.productName);
    const label = idx > 0 ? stripGroupPrefix(name, toWhatsappSafeName(gName)) : name;
    return `${label} -${i.delQty} -₹${rateStr}`;
  };
  const sums = (items) => ({
    bag: round2(items.reduce((s, i) => s + (Number(i.dispatchQtyBag) || 0), 0)),
    kg: round2(items.reduce((s, i) => s + (Number(i.dispatchQtyKg) || 0), 0)),
    lot: round2(items.reduce((s, i) => s + (Number(i.delQty) || 0), 0)),
  });
  const line = (idx, gName, items) => {
    const t = sums(items);
    return `Product ${idx + 1} :- ${toWhatsappSafeName(gName)} | ${items.map((i, n) => itemText(i, n, gName)).join(' | ')} | Total Bag - ${t.bag} | Total KG - ${t.kg} | Total Lot - ${t.lot}`;
  };
  const totalsStr = (t) => `${t.bag} bag, ${t.kg} KG, ${t.lot} Lot`;

  const entries = Object.entries(byGroup);
  const fullLines = entries.map(([gName, items], idx) => line(idx, gName, items));
  if (fullLines.join(SEP).length <= maxChars) {
    return [{ productDetails: fullLines.join('\n\n'), totalValuesStr: totalsStr(sums(group)) }];
  }

  // Too long: break each product into units that fit, then pack units into messages.
  const units = [];
  entries.forEach(([gName, items], idx) => {
    const whole = line(idx, gName, items);
    if (whole.length <= maxChars) {
      units.push({ text: whole, items });
      return;
    }
    let cur = [];
    items.forEach((item) => {
      if (cur.length > 0 && line(idx, gName, [...cur, item]).length > maxChars) {
        units.push({ text: line(idx, gName, cur), items: cur });
        cur = [item];
      } else {
        cur.push(item);
      }
    });
    if (cur.length > 0) units.push({ text: line(idx, gName, cur), items: cur });
  });

  const messages = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    messages.push({
      productDetails: current.map(u => u.text).join('\n\n'),
      totalValuesStr: totalsStr(sums(current.flatMap(u => u.items))),
    });
    current = [];
  };
  units.forEach((u) => {
    if (current.length > 0 && [...current, u].map(x => x.text).join(SEP).length > maxChars) flush();
    current.push(u);
  });
  flush();
  return messages;
};

// "9*12" → "9×12". WhatsApp renders text between two asterisks as bold, so
// product sizes written with "*" would garble the message.
export const toWhatsappSafeName = (name) => toSingleLine(name).replace(/\*/g, '×');

// Drops a leading product-group name from a product name, ignoring spaces and
// case ("StarDcut" strips "Star Dcut 12×18 (35 Kg)" → "12×18 (35 Kg)"). Returns
// the name unchanged if it doesn't start with the group, or if nothing would
// be left.
export const stripGroupPrefix = (name, groupName) => {
  const full = String(name ?? '');
  const target = String(groupName ?? '').replace(/\s+/g, '').toLowerCase();
  if (!target) return full;
  let seen = '';
  for (let i = 0; i < full.length; i++) {
    if (!/\s/.test(full[i])) seen += full[i].toLowerCase();
    if (seen === target) {
      const rest = full.slice(i + 1).trim();
      return rest || full;
    }
    if (!target.startsWith(seen)) return full;
  }
  return full;
};

// Up to 2 decimals, no trailing zeros (7 → "7", 7.5 → "7.5", 82.25 → "82.25").
export const formatWaNumber = (value) => String(Math.round((Number(value) || 0) * 100) / 100);
