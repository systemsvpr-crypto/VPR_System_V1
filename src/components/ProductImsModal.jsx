import { useState, useEffect } from 'react';
import { Boxes, Loader2, Calendar, Truck, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@/components/ui/modal';
import { fetchImsRows, sumImsStats, getMaxLevel, getStockLevel, STOCK_LEVEL_STYLES } from '@/lib/imsData';

const formatNum = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatDate = (d) => {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(d);
};

const Stat = ({ label, value, unit, hint, dateBadge, className = 'text-slate-900' }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex flex-col justify-between">
    <div>
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`text-lg font-bold tabular-nums leading-tight mt-0.5 ${className}`}>
      {value}{unit && value !== '—' ? <span className="text-xs font-semibold text-slate-400 ml-1">{unit}</span> : null}
    </div>
    </div>
    {dateBadge ? (
      <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200/80 rounded px-1.5 py-0.5 leading-tight w-fit">
        {dateBadge}
      </div>
    ) : hint ? (
      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{hint}</div>
    ) : null}
  </div>
);

const Section = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
    {children}
  </div>
);

// Zero shows as a light dash so the real figures stand out.
const Cell = ({ value, subtext, className = '' }) => (
  <td className={`px-3 py-2.5 text-center tabular-nums ${value ? className : 'text-slate-300'}`}>
    <div>{value ? formatNum(value) : '—'}</div>
    {value && subtext ? <div className="text-[10px] font-medium text-slate-500 leading-tight mt-0.5">{subtext}</div> : null}
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
      .filter(g => g.currentStock !== 0 || g.pendingApprovalQty > 0 || g.approvedQty > 0 || g.inTransitQty > 0 || g.atTptQty > 0 || g.orderPendingQty > 0 || g.dispatchedQty > 0)
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Stat label="Order Pending" value={formatNum(totals.orderPendingQty)} unit={unit} className="text-red-600" hint="Indent raised, not planned yet" />
                  <Stat label="Approval Pending" value={formatNum(totals.pendingApprovalQty)} unit={unit} className="text-orange-500" hint="Waiting in Vendor Approval" />
                  <Stat
                    label="Approved"
                    value={formatNum(totals.approvedQty)}
                    unit={unit}
                    className="text-emerald-600"
                    dateBadge={
                      totals.approvedQty > 0 && (totals.earliestExpectedDeliveryDate || row.earliestExpectedDeliveryDate) ? (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <Calendar size={11} className="text-emerald-600 shrink-0" />
                          <span>Exp: {formatDate(totals.earliestExpectedDeliveryDate || row.earliestExpectedDeliveryDate)}</span>
                        </span>
                      ) : null
                    }
                    hint={totals.approvedQty > 0 ? (totals.earliestExpectedDeliveryDate || row.earliestExpectedDeliveryDate ? null : "Approved, not yet lifted") : "Approved, not yet lifted"}
                  />
                  <Stat
                    label="In Transit"
                    value={formatNum(totals.inTransitQty)}
                    unit={unit}
                    className="text-violet-600"
                    dateBadge={
                      totals.inTransitQty > 0 && (totals.earliestExpectedReceivingDate || row.earliestExpectedReceivingDate) ? (
                        <span className="flex items-center gap-1 text-violet-700">
                          <Truck size={11} className="text-violet-600 shrink-0" />
                          <span>Exp: {formatDate(totals.earliestExpectedReceivingDate || row.earliestExpectedReceivingDate)}</span>
                        </span>
                      ) : null
                    }
                    hint={totals.inTransitQty > 0 ? (totals.earliestExpectedReceivingDate || row.earliestExpectedReceivingDate ? null : "Lifted, on the road") : "Lifted, on the road (Aawak Pending)"}
                  />
                  <Stat label="Transporter Godown" value={formatNum(totals.atTptQty)} unit={unit} className="text-amber-600" hint="Waiting at transporter's godown" />
                </div>
              </Section>

              {row.pipelineSchedule && row.pipelineSchedule.length > 0 && (
                <Section title="Incoming Shipments Schedule">
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                    <div className="overflow-auto max-h-[28vh]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Ref / Indent / Lift #</th>
                            <th className="text-center px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Destination Godown</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-700 uppercase tracking-wider">Expected Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {row.pipelineSchedule.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2 whitespace-nowrap">
                                {item.type === 'Approved' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 size={10} /> Approved
                                  </span>
                                ) : item.type === 'In Transit' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                                    <Truck size={10} /> In Transit
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    <Clock size={10} /> Transporter Godown
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                                {item.refNumber}
                                {item.lrNumber && !item.refNumber.includes(item.lrNumber) ? (
                                  <span className="ml-1 text-[10px] font-normal text-slate-400">({item.lrNumber})</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-center font-bold text-slate-800 whitespace-nowrap tabular-nums">
                                {formatNum(item.qty)} {unit}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {item.godownName}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {item.expectedDate ? (
                                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 bg-slate-100/90 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                                    <Calendar size={11} className="text-slate-500 shrink-0" />
                                    <span>{formatDate(item.expectedDate)}</span>
                                    <span className="text-[10px] font-normal text-slate-500">
                                      ({item.type === 'Approved' ? 'Exp. Delivery' : 'Exp. Receiving'})
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Not scheduled</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>
              )}

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
                          <th className="text-center px-3 py-2.5 font-semibold text-amber-600 uppercase tracking-wider">Transporter Godown</th>
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
                            <Cell value={g.approvedQty} subtext={g.earliestExpectedDeliveryDate ? formatDate(g.earliestExpectedDeliveryDate) : null} className="text-emerald-600" />
                            <Cell value={g.inTransitQty} subtext={g.earliestExpectedReceivingDate ? formatDate(g.earliestExpectedReceivingDate) : null} className="text-violet-600" />
                            <Cell value={g.atTptQty} className="text-amber-600" />
                            <Cell value={g.dispatchedQty} className="text-slate-600" />
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                          <td className="px-4 py-2.5 text-slate-800">Total</td>
                          <td className="px-3 py-2.5 text-center font-bold tabular-nums text-slate-900">{formatNum(totals.currentStock)}</td>
                          <Cell value={totals.orderPendingQty} className="text-red-600" />
                          <Cell value={totals.pendingApprovalQty} className="text-orange-500" />
                          <Cell value={totals.approvedQty} subtext={totals.earliestExpectedDeliveryDate ? formatDate(totals.earliestExpectedDeliveryDate) : null} className="text-emerald-600" />
                          <Cell value={totals.inTransitQty} subtext={totals.earliestExpectedReceivingDate ? formatDate(totals.earliestExpectedReceivingDate) : null} className="text-violet-600" />
                          <Cell value={totals.atTptQty} className="text-amber-600" />
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
