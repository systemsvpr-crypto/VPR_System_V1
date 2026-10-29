import { useState, useEffect } from 'react';
import { Boxes, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@/components/ui/modal';
import { fetchImsRows, sumImsStats, getMaxLevel, getStockLevel, STOCK_LEVEL_STYLES } from '@/lib/imsData';

const formatNum = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatDate = (d) => { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}`; };

const Stat = ({ label, value, unit, hint, className = 'text-slate-900' }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`text-lg font-bold tabular-nums leading-tight mt-0.5 ${className}`}>
      {value}{unit && value !== '—' ? <span className="text-xs font-semibold text-slate-400 ml-1">{unit}</span> : null}
    </div>
    {hint && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{hint}</div>}
  </div>
);

const Section = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
    {children}
  </div>
);

// Zero shows as a light dash so the real figures stand out.
const Cell = ({ value, className = '' }) => (
  <td className={`px-3 py-2.5 text-center tabular-nums ${value ? className : 'text-slate-300'}`}>
    {value ? formatNum(value) : '—'}
  </td>
);

// Small "IMS" button that opens ProductImsModal for one product — used in
// the Sales and Purchase tables. `compact` is the card-view size.
export const ImsButton = ({ onClick, compact = false }) => (
  <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
    title="View Ultimate IMS details"
    className={`inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 text-primary font-semibold hover:bg-primary/10 transition-colors whitespace-nowrap ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
    <Boxes size={compact ? 11 : 13} /> IMS
  </button>
);

// Ultimate IMS figures for one product — same numbers as the Ultimate IMS
// page (see lib/imsData), opened from Sales → Dispatch Planning / Dispatch
// Completed. `product` = { productId, productName } or null when closed.
const ProductImsModal = ({ product, onClose }) => {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!product?.productId) return;
    let cancelled = false;
    setRow(null);
    setLoading(true);
    fetchImsRows()
      .then(({ rows }) => {
        if (!cancelled) setRow(rows.find(r => String(r.productId) === String(product.productId)) || null);
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load IMS details'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [product?.productId]);

  const totals = row ? sumImsStats(row.stats) : null;
  const maxLevel = row ? getMaxLevel(row.leadTime, row.safetyFactor, totals.avgDispatch) : null;
  const stockLevel = totals ? getStockLevel(totals.currentStock, maxLevel) : 'neutral';
  const unit = row?.unit && row.unit !== '—' ? String(row.unit).toUpperCase() : '';

  // Godowns with any stock or purchase pipeline; "Unassigned" holds indent
  // qty whose godown isn't picked yet (shown last).
  const godownRows = row
    ? row.stats
      .filter(g => g.currentStock !== 0 || g.pendingApprovalQty > 0 || g.approvedQty > 0 || g.inTransitQty > 0 || g.orderPendingQty > 0 || g.dispatchedQty > 0)
      .sort((a, b) => (a.godownId === 'unassigned') - (b.godownId === 'unassigned') || b.currentStock - a.currentStock)
    : [];

  return (
    <Modal open={!!product} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-4xl">
        <ModalHeader>
          <div className="flex items-center gap-3 pr-12">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Boxes size={20} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-800 truncate">{row?.productName || product?.productName}</h2>
              <p className="text-xs text-slate-500">Ultimate IMS details{unit ? ` · Unit: ${unit}` : ''}</p>
            </div>
          </div>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
              Loading IMS details...
            </div>
          ) : !row ? (
            <div className="py-12 text-center text-sm text-slate-400">No IMS data found for this product.</div>
          ) : (
            <div className="flex flex-col gap-5">
              <Section title="Stock">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Stat label="Current Stock" value={formatNum(totals.currentStock)} unit={unit}
                    className={stockLevel === 'critical' ? 'text-red-600' : stockLevel === 'low' ? 'text-amber-600' : stockLevel === 'healthy' ? 'text-emerald-600' : 'text-slate-900'}
                    hint={stockLevel === 'neutral' ? 'In your own godowns' : STOCK_LEVEL_STYLES[stockLevel].label} />
                  <Stat label="Total Dispatched" value={formatNum(totals.dispatchedQty)} unit={unit}
                    hint={totals.firstDispatchDate ? `Completed dispatches since ${formatDate(totals.firstDispatchDate)}` : 'No completed dispatch yet'} />
                  <Stat label="AVG Daily Consumption" value={totals.avgDispatch != null ? formatNum(totals.avgDispatch) : '0'} unit={unit ? `${unit} / day` : '/ day'}
                    hint="Total dispatched ÷ days since first dispatch" />
                </div>
              </Section>

              <Section title="Reorder Level">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Stat label="Lead Time" value={row.leadTime !== '' ? formatNum(row.leadTime) : '—'} unit="days" hint="Days a purchase takes to arrive" />
                  <Stat label="Safety Factor" value={row.safetyFactor !== '' ? formatNum(row.safetyFactor) : '—'} hint="Extra buffer multiplier" />
                  <Stat label="Max Level" value={maxLevel != null ? formatNum(maxLevel) : '—'} unit={unit} className="text-emerald-600"
                    hint={maxLevel == null
                      ? 'Set Lead Time & Safety Factor in Ultimate IMS'
                      : totals.currentStock < maxLevel
                        ? `Stock is ${formatNum(maxLevel - totals.currentStock)} ${unit} below Max Level`
                        : 'Stock is at or above Max Level'} />
                </div>
              </Section>

              <Section title="Purchase Pipeline">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Order Pending" value={formatNum(totals.orderPendingQty)} unit={unit} className="text-red-600" hint="Indent raised, not planned yet" />
                  <Stat label="Approval Pending" value={formatNum(totals.pendingApprovalQty)} unit={unit} className="text-orange-500" hint="Waiting in Vendor Approval" />
                  <Stat label="Approved" value={formatNum(totals.approvedQty)} unit={unit} className="text-emerald-600" hint="Approved, not yet lifted" />
                  <Stat label="In Transit" value={formatNum(totals.inTransitQty)} unit={unit} className="text-violet-600" hint="Lifted, on the way / at transporter" />
                </div>
              </Section>

              <Section title="Godown-wise">
                {godownRows.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center border border-slate-200 rounded-lg">No stock or purchase pipeline for this product.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-auto max-h-[40vh]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px]">
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-700 uppercase tracking-wider">Current Stock</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-red-600 uppercase tracking-wider">Order Pending</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-orange-500 uppercase tracking-wider">Approval Pending</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-emerald-600 uppercase tracking-wider">Approved</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-violet-600 uppercase tracking-wider">In Transit</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Dispatched</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {godownRows.map(g => (
                          <tr key={g.godownId} className="hover:bg-slate-50">
                            <td className={`px-4 py-2.5 font-medium ${g.godownId === 'unassigned' ? 'text-slate-400 italic' : g.godownType !== 'Own' ? 'text-amber-600' : 'text-slate-700'}`}>
                              {g.godownId === 'unassigned' ? 'Godown not picked yet' : g.godownName}
                            </td>
                            <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${g.currentStock < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatNum(g.currentStock)}</td>
                            <Cell value={g.orderPendingQty} className="text-red-600" />
                            <Cell value={g.pendingApprovalQty} className="text-orange-500" />
                            <Cell value={g.approvedQty} className="text-emerald-600" />
                            <Cell value={g.inTransitQty} className="text-violet-600" />
                            <Cell value={g.dispatchedQty} className="text-slate-600" />
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                          <td className="px-4 py-2.5 text-slate-800">Total</td>
                          <td className="px-3 py-2.5 text-center font-bold tabular-nums text-slate-900">{formatNum(totals.currentStock)}</td>
                          <Cell value={totals.orderPendingQty} className="text-red-600" />
                          <Cell value={totals.pendingApprovalQty} className="text-orange-500" />
                          <Cell value={totals.approvedQty} className="text-emerald-600" />
                          <Cell value={totals.inTransitQty} className="text-violet-600" />
                          <Cell value={totals.dispatchedQty} className="text-slate-700" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {unit && <p className="text-[11px] text-slate-400 mt-1.5">All quantities in {unit}.</p>}
              </Section>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ProductImsModal;
