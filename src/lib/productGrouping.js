// A product's "Grouping" is its Brand Name + Category combined (e.g.
// brand_name "150g" + category "Chutney" -> "150g Chutney") — used by the
// Products page's Grouping column and its filter dropdown, so both always
// read from the exact same definition and can never drift apart.
export const getProductGrouping = (product) => {
  const parts = [product?.brand_name, product?.category]
    .map(v => (v || '').trim())
    .filter(Boolean);
  return parts.join(' ');
};
