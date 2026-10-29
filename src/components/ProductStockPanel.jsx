import { useState, useEffect, useMemo } from 'react';
import { getAllProductStock } from '../services/masterService';
import { ImsButton } from './ProductImsModal';

const fmtStock = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Live godown stock for every product, loaded while `isOpen` is true (a
// form/modal being open). Returns { [product_id]: { [godown_id]: qty } }.
export const useGodownStock = (isOpen) => {
  const [stockByProduct, setStockByProduct] = useState({});
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getAllProductStock()
      .then(rows => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach(s => {
          if (!map[s.product_id]) map[s.product_id] = {};
          map[s.product_id][s.godown_id] = (map[s.product_id][s.godown_id] || 0) + (Number(s.current_stock) || 0);
        });
        setStockByProduct(map);
      })
      .catch(() => { if (!cancelled) setStockByProduct({}); });
    return () => { cancelled = true; };
  }, [isOpen]);
  return stockByProduct;
};

/**
 * Full-width stock panel shown under a product row in Create Order / Create
 * Indent: total stock across own godowns, a status badge, and the stock in
 * each own godown holding any.
 * - `requiredQty` (Create Order): the badge says whether stock covers it.
 *   Omitted (Create Indent), the badge just says In stock / Out of stock.
 * - `onShowIms` adds an IMS button that opens the product's IMS details.
 */
const ProductStockPanel = ({ product, stockByProduct, godowns = [], requiredQty, onShowIms }) => {
  const ownGodowns = useMemo(() => godowns
    .filter(g => g.is_active && (g.godown_type || 'Own') === 'Own')
    .sort((a, b) => a.name.localeCompare(b.name)), [godowns]);

  if (!product) return null;
  const perGodown = stockByProduct[product.product_id] || {};
  const unit = (product.unit || '').toUpperCase();
  const total = ownGodowns.reduce((sum, g) => sum + (perGodown[g.godown_id] || 0), 0);
  const withStock = ownGodowns
    .filter(g => (perGodown[g.godown_id] || 0) !== 0)
    .sort((a, b) => perGodown[b.godown_id] - perGodown[a.godown_id]);

  const status = total <= 0
    ? { text: 'Out of stock', panel: 'bg-red-50 border-red-200', value: 'text-red-600', badge: 'bg-red-100 text-red-700' }
    : requiredQty != null && requiredQty > total
      ? { text: `Short by ${fmtStock(requiredQty - total)} ${unit}`, panel: 'bg-amber-50 border-amber-200', value: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' }
      : { text: requiredQty > 0 ? 'Enough stock for this order' : 'In stock', panel: 'bg-emerald-50 border-emerald-200', value: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' };

  return (
    <div className={`col-span-full rounded-lg border px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${status.panel}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Current Stock</span>
        <span className={`text-base font-bold tabular-nums ${status.value}`}>{fmtStock(total)} {unit}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.badge}`}>{status.text}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {withStock.length === 0 ? (
          <span className="text-sm text-red-600">No stock in any godown</span>
        ) : withStock.map(g => (
          <span key={g.godown_id}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-sm bg-white ${perGodown[g.godown_id] < 0 ? 'border-red-200 text-red-600' : 'border-slate-200 text-slate-700'}`}>
            <span className="font-medium">{g.name}</span>
            <span className="font-bold tabular-nums">{fmtStock(perGodown[g.godown_id])}</span>
          </span>
        ))}
      </div>
      {onShowIms && (
        <div className="ml-auto">
          <ImsButton onClick={onShowIms} />
        </div>
      )}
    </div>
  );
};

export default ProductStockPanel;
