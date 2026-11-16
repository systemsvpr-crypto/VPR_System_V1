import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, Save, Check, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { updateHisabRow } from '@/services/transporterService';
import Pagination from '@/components/ui/pagination';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract kg value from mux string, e.g. "25 Kg" → 25, "32" → 32 */
const parseMux = (mux) => {
  const match = (mux || '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

/** Compute weight in KG from bag count and mux string */
const computeWeightKg = (bags, mux) => {
  const muxKg = parseMux(mux);
  if (!muxKg || !bags) return 0;
  return Math.round(bags * muxKg * 100) / 100;
};

/** Find matching freight rate — transporter + city (case-insensitive) */
const findFreightRate = (rates, transporter_id, vendorCity) => {
  if (!transporter_id || !vendorCity) return null;
  const cityNorm = (vendorCity || '').trim().toLowerCase();
  return rates.find(r =>
    r.transporter_id === transporter_id &&
    (r.city || '').trim().toLowerCase() === cityNorm
  ) || null;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yy'); } catch { return d; }
};

const fmtAmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

// ─── Row component ────────────────────────────────────────────────────────────

const HisabRow = ({ delivery, freightRates, onSaved, openAawak }) => {
  const item = delivery.purchase_indent_items || {};
  const product = item.products || {};
  const vendor = item.item_vendor || {};
  const vendorCity = vendor.location || '';
  const vendorName = vendor.name || '';
  const transporter_id = delivery.transporter_id;
  const transporterName = delivery.transporters?.name || '—';
  const vehicleNo = delivery.vehicle_number || delivery.transporters?.vehicle_number || '';
  const indentNo = item.purchase_indents?.indent_number || '';
  const liftNo = delivery.lifting_number || '';

  const bags = delivery.received_quantity || 0;
  const weightKg = computeWeightKg(bags, product.mux);

  // Initial state from DB (or defaults)
  const [gstType, setGstType] = useState(delivery.freight_rate_type || 'without_gst');
  const [freightRate, setFreightRate] = useState(
    delivery.freight_rate != null ? String(delivery.freight_rate) : ''
  );
  const [paymentStatus, setPaymentStatus] = useState(delivery.freight_payment_status || 'not_paid');
  const [remarks, setRemarks] = useState(delivery.remarks || '');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Find auto-rate from Freight Sheet
  const matchedRate = findFreightRate(freightRates, transporter_id, vendorCity);
  const autoRate = matchedRate
    ? (gstType === 'with_gst' ? matchedRate.rate_with_gst : matchedRate.rate_without_gst)
    : null;
  const rateAlert = !matchedRate && vendorCity;

  // Effective rate for amount calculation
  const effectiveRate = freightRate !== '' ? parseFloat(freightRate) : (autoRate || 0);
  const freightAmount = weightKg && effectiveRate ? Math.round(weightKg * effectiveRate * 100) / 100 : 0;

  const handleGstToggle = (type) => {
    setGstType(type);
    setIsDirty(true);
  };

  const handleRateChange = (val) => {
    setFreightRate(val);
    setIsDirty(true);
  };

  const handlePaymentChange = async (status) => {
    setPaymentStatus(status);
    setIsSaving(true);
    try {
      const rateToSave = freightRate !== '' ? parseFloat(freightRate) : (autoRate || null);
      await updateHisabRow(delivery.delivery_id, {
        freight_rate: rateToSave,
        freight_rate_type: gstType,
        freight_amount: rateToSave && weightKg ? Math.round(weightKg * rateToSave * 100) / 100 : null,
        freight_payment_status: status,
        remarks: remarks,
      });
      toast.success(status === 'paid' ? 'Marked as Paid & moved to History' : 'Moved to Pending');
      setIsDirty(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update payment status');
      setPaymentStatus(delivery.freight_payment_status || 'not_paid');
    }
    setIsSaving(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rateToSave = freightRate !== '' ? parseFloat(freightRate) : (autoRate || null);
      await updateHisabRow(delivery.delivery_id, {
        freight_rate: rateToSave,
        freight_rate_type: gstType,
        freight_amount: rateToSave && weightKg ? Math.round(weightKg * rateToSave * 100) / 100 : null,
        freight_payment_status: paymentStatus,
        remarks: remarks,
      });
      toast.success('Saved');
      setIsDirty(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    }
    setIsSaving(false);
  };

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs
      ${paymentStatus === 'paid' ? 'bg-slate-50/30 opacity-75' : ''}`}>

      {/* 1. Date & Lift No. */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="font-semibold text-slate-800 text-xs">
          {fmtDate(delivery.delivery_date || delivery.receiving_date)}
        </div>
        {liftNo ? (
          <button
            type="button"
            onClick={() => openAawak?.('all', liftNo)}
            className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[10px] border border-blue-200 transition-colors"
            title="Open lift in Aawak Details"
          >
            {liftNo}
            <ExternalLink size={9} />
          </button>
        ) : (
          <span className="text-slate-300 text-[10px]">—</span>
        )}
      </td>

      {/* 2. Transporter & Vehicle */}
      <td className="px-3 py-2.5">
        <div className="font-semibold text-slate-800 text-xs truncate max-w-[150px]" title={transporterName}>
          {transporterName}
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          {vehicleNo || <span className="text-slate-300 font-sans">—</span>}
        </div>
      </td>

      {/* 3. LR No. & Indent */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="font-bold text-slate-900 text-xs">
          {delivery.lr_number ? `LR: ${delivery.lr_number}` : '—'}
        </div>
        {indentNo && (
          <div className="text-[10px] text-slate-400">
            {indentNo}
          </div>
        )}
      </td>

      {/* 4. Vendor & Location */}
      <td className="px-3 py-2.5">
        <div className="font-semibold text-slate-800 text-xs">
          {vendorCity || <span className="text-slate-300">—</span>}
        </div>
        <div className="text-[11px] text-slate-500 truncate max-w-[130px]" title={vendorName}>
          {vendorName || <span className="text-slate-300">—</span>}
        </div>
      </td>

      {/* 5. Product & Mux */}
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800 text-xs truncate max-w-[160px]" title={product.name}>
          {product.name || <span className="text-slate-300">—</span>}
        </div>
        <div className="text-[10px] text-slate-400">
          {product.mux ? `MUX: ${product.mux}` : <span className="text-slate-300">no mux</span>}
        </div>
      </td>

      {/* 6. Lot Size (Bags) */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="font-bold text-slate-800 text-xs">{bags}</span>
        <span className="text-[10px] text-slate-400 font-normal ml-1">bag</span>
      </td>

      {/* 7. Weight (KG) */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {weightKg > 0 ? (
          <>
            <span className="font-bold text-slate-800 text-xs">{weightKg.toLocaleString('en-IN')}</span>
            <span className="text-[10px] text-slate-400 font-normal ml-1">kg</span>
          </>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* 8. Freight Rate + GST toggle */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1 min-w-[155px]">
          {/* GST Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md w-fit">
            {['without_gst', 'with_gst'].map(type => (
              <button key={type}
                onClick={() => handleGstToggle(type)}
                className={`px-2 py-0.5 text-[10px] rounded transition-all font-medium
                  ${gstType === type ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
                {type === 'with_gst' ? 'With GST' : 'W/o GST'}
              </button>
            ))}
          </div>
          {/* Rate input */}
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={freightRate !== '' ? freightRate : (autoRate != null ? autoRate : '')}
              onChange={e => handleRateChange(e.target.value)}
              placeholder={autoRate != null ? `Auto: ${autoRate}` : 'Enter rate...'}
              className={`w-full h-7 px-2 pr-6 text-xs border rounded-md outline-none
                focus:ring-1 focus:ring-primary/40
                ${rateAlert && freightRate === '' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
          </div>
          {/* Alert */}
          {rateAlert && (
            <div className="flex items-center gap-1 text-amber-600 text-[10px]">
              <AlertTriangle size={10} />
              <span>No rate in Freight Sheet</span>
            </div>
          )}
        </div>
      </td>

      {/* 9. Amount */}
      <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
        {freightAmount > 0 ? fmtAmt(freightAmount) : '—'}
      </td>

      {/* 10. Payment Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md w-fit">
          {[['not_paid', 'Not Paid'], ['paid', 'Paid']].map(([val, label]) => (
            <button key={val}
              onClick={() => handlePaymentChange(val)}
              className={`px-2 py-0.5 text-[10px] rounded transition-all font-medium
                ${paymentStatus === val
                  ? val === 'paid' ? 'bg-green-500 text-white shadow-xs' : 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </td>

      {/* 11. Remarks */}
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={remarks}
          onChange={e => { setRemarks(e.target.value); setIsDirty(true); }}
          placeholder="Add remarks..."
          className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-primary/40 min-w-[110px]"
        />
      </td>

      {/* 12. Save */}
      <td className="px-3 py-2.5 text-center">
        {isDirty ? (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-xs rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all font-medium shadow-xs"
          >
            <Save size={11} />
            {isSaving ? '...' : 'Save'}
          </button>
        ) : (
          <span className="text-slate-300" title="Saved"><Check size={14} className="mx-auto" /></span>
        )}
      </td>
    </tr>
  );
};

// ─── Main HisabSheet Component ────────────────────────────────────────────────

const HisabSheet = ({ deliveries, freightRates, subTab, onRowSaved, openAawak, resetKey }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Reset to first page when subTab (Pending / History) or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [subTab, resetKey]);

  // Filter: only transport deliveries with valid indent
  // subTab: 'pending' → not_paid, 'history' → paid
  const filtered = useMemo(() => {
    return (deliveries || []).filter(d => {
      if (!d.transporter_id) return false;
      if (d.purchase_indent_items?.purchase_indents?.is_void === true) return false;
      const status = d.freight_payment_status || 'not_paid';
      return subTab === 'history' ? status === 'paid' : status !== 'paid';
    });
  }, [deliveries, subTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, filtered.length);

  // Keep currentPage valid if items are removed (e.g. marked as paid)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedDeliveries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  // Quick summary totals for the current subTab
  const summary = useMemo(() => {
    let bags = 0;
    let weight = 0;
    let amount = 0;
    filtered.forEach(d => {
      const b = Number(d.received_quantity) || 0;
      bags += b;
      const p = d.purchase_indent_items?.products || {};
      const w = computeWeightKg(b, p.mux);
      weight += w;
      const matched = findFreightRate(freightRates, d.transporter_id, d.purchase_indent_items?.item_vendor?.location);
      const autoR = matched ? (d.freight_rate_type === 'with_gst' ? matched.rate_with_gst : matched.rate_without_gst) : null;
      const rate = d.freight_rate != null ? Number(d.freight_rate) : (autoR || 0);
      if (rate && w) {
        amount += (w * rate);
      }
    });
    return { bags, weight: Math.round(weight), amount: Math.round(amount * 100) / 100 };
  }, [filtered, freightRates]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 shrink-0">
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200/80 shadow-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Entries</div>
          <div className="text-base font-bold text-slate-800 tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200/80 shadow-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Bags</div>
          <div className="text-base font-bold text-slate-800 tabular-nums">{summary.bags.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200/80 shadow-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Weight</div>
          <div className="text-base font-bold text-slate-800 tabular-nums">{summary.weight.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">kg</span></div>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200/80 shadow-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {subTab === 'history' ? 'Total Paid Freight' : 'Total Pending Freight'}
          </div>
          <div className={`text-base font-bold tabular-nums ${subTab === 'history' ? 'text-emerald-600' : 'text-primary'}`}>
            ₹{summary.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          {subTab === 'history'
            ? 'No paid entries matching filters. Mark entries as Paid in the Pending tab.'
            : 'No pending freight entries matching selected filters.'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                  {[
                    { label: 'Date & Lift No.', align: 'left' },
                    { label: 'Transporter & Vehicle', align: 'left' },
                    { label: 'LR No. & Indent', align: 'left' },
                    { label: 'Vendor & City', align: 'left' },
                    { label: 'Product & MUX', align: 'left' },
                    { label: 'Lot Size', align: 'right' },
                    { label: 'Weight (KG)', align: 'right' },
                    { label: 'Freight Rate (₹/KG)', align: 'left' },
                    { label: 'Amount (₹)', align: 'right' },
                    { label: 'Payment Status', align: 'left' },
                    { label: 'Remarks', align: 'left' },
                    { label: 'Action', align: 'center' },
                  ].map((col, i) => (
                    <th key={i} className={`px-3 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap
                      ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDeliveries.map(delivery => (
                  <HisabRow
                    key={delivery.delivery_id}
                    delivery={delivery}
                    freightRates={freightRates}
                    onSaved={onRowSaved}
                    openAawak={openAawak}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-white px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-slate-200 rounded px-2 py-1 text-xs bg-white text-slate-700 font-medium outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {[25, 50, 100, 200].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>records per page</span>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={setCurrentPage}
              className="!p-0 w-full md:w-auto flex-1 md:justify-end gap-3 sm:gap-6"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default HisabSheet;
