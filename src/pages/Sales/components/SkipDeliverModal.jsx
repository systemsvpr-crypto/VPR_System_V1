import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Save, Package,
  Truck, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { saveDispatchPlan, completeDispatchWithStockOut, updateOrderItemFields, updateOrderCustomer } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

/* ─── status badge ───────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending: 'bg-slate-100 text-slate-500 border-slate-200',
    'Dispatch Done': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Cancelled: 'bg-red-50 text-red-400 border-red-100',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[status] || map.Pending}`}>
      {status}
    </span>
  );
};

/* ─── quantity summary card ──────────────────────────────── */
const QtyCard = ({ label, value, color, icon: Icon, sub }) => {
  const colors = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', icon: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', icon: 'text-emerald-400' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100', icon: 'text-violet-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', icon: 'text-amber-400' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: 'text-slate-400' },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2 gap-0.5 ${c.bg} ${c.border}`}>
      {Icon && <Icon size={13} className={`${c.icon}`} />}
      <span className={`text-xl font-bold tabular-nums ${c.text}`}>{value}</span>
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      {sub && <span className="text-[9px] text-slate-400">{sub}</span>}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────── */

const SkipDeliverModal = ({ isOpen, onClose, item, customers, products, godowns, user, onSave }) => {
  const [form, setForm] = useState({
    quantity: '',
    dispatch_date: new Date().toISOString().split('T')[0],
    godown_id: '',
    customer_id: '',
    product_id: '',
    unit_price: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const orderedQty = Number(item?.quantity || 0);
  const cancelledQty = Number(item?.cancelled_quantity || 0);
  const effectiveQty = orderedQty - cancelledQty;

  const activePlans = useMemo(() =>
    (item?.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled'),
    [item],
  );

  const alreadyDispatched = activePlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);
  const remaining = effectiveQty - alreadyDispatched;

  const activeGodownOptions = useMemo(() =>
    godowns.filter(g => g.is_active).map(g => ({ value: g.godown_id, label: g.name })),
    [godowns],
  );

  const customerOptions = useMemo(() =>
    (customers || []).map(c => ({ value: c.customer_id, label: c.name })),
    [customers],
  );

  const productOptions = useMemo(() =>
    (products || []).filter(p => p.is_active !== false).map(p => ({ value: p.product_id, label: `${p.name} (${p.unit})` })),
    [products],
  );

  /* ── reset form when modal opens ─────────────────────────- */
  useEffect(() => {
    if (isOpen && item) {
      setForm({
        quantity: '',
        dispatch_date: new Date().toISOString().split('T')[0],
        godown_id: item.godown_id || '',
        customer_id: item.sales_orders?.customer_id || '',
        product_id: item.product_id || '',
        unit_price: String(item.unit_price || ''),
      });
    }
  }, [isOpen, item?.item_id]); // eslint-disable-line

  const fullyDispatched = remaining <= 0;

  /* ── save ───────────────────────────────────────────────── */
  const handleSave = async () => {
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) { toast.error('Enter a valid dispatch quantity.'); return; }
    if (qty > remaining) { toast.error(`Quantity (${qty}) exceeds remaining (${remaining}).`); return; }
    if (!form.godown_id) { toast.error('Please select a godown.'); return; }
    if (!form.dispatch_date) { toast.error('Please select a dispatch date.'); return; }

    setIsSaving(true);
    try {
      // Persist field edits
      if (form.customer_id && form.customer_id !== item.sales_orders?.customer_id) {
        await updateOrderCustomer(item.order_id, form.customer_id);
      }
      const itemUpdates = {};
      if (form.product_id && form.product_id !== item.product_id) {
        itemUpdates.product_id = form.product_id;
      }
      if (form.unit_price !== undefined && Number(form.unit_price) !== Number(item.unit_price)) {
        itemUpdates.unit_price = Number(form.unit_price);
      }
      if (Object.keys(itemUpdates).length > 0) {
        await updateOrderItemFields(item.item_id, itemUpdates);
      }

      // Create dispatch plan
      const effectiveProductId = form.product_id || item.product_id;
      const effectiveUnitPrice = form.unit_price !== undefined && form.unit_price !== '' ? Number(form.unit_price) : Number(item.unit_price);

      const savedPlan = await saveDispatchPlan({
        order_item_id: item.item_id,
        quantity: form.quantity,
        godown_id: form.godown_id,
        unit_price: effectiveUnitPrice,
        dispatch_date: form.dispatch_date,
        created_by: user?.user_id,
      });

      // Complete dispatch immediately
      await completeDispatchWithStockOut({
        plan_id: savedPlan.plan_id,
        product_id: effectiveProductId,
        godown_id: form.godown_id,
        quantity: Number(form.quantity),
        dispatch_date: form.dispatch_date || new Date().toISOString().split('T')[0],
        dispatch_number: savedPlan.dispatch_number,
        created_by: user?.user_id,
      });

      toast.success(`Dispatched ${form.quantity} unit(s) successfully (${savedPlan.dispatch_number})`);
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to complete dispatch.');
    }
    setIsSaving(false);
  };

  if (!item) return null;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-h-[90vh] flex flex-col md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        {/* ── Header ── */}
        <ModalHeader>
          <div className="flex items-center gap-2 w-full pr-10">
            <div className="bg-primary/10 p-1.5 rounded-lg shrink-0">
              <ClipboardList size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-800 leading-tight">Skip Deliver Dispatch</h2>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {item.sales_orders?.order_number} &nbsp;·&nbsp;
                {item.sales_orders?.customers?.name} &nbsp;·&nbsp;
                <span className="font-medium text-slate-700">
                  {item.products?.name} ({item.products?.unit})
                </span>
              </p>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto pr-1.5 custom-scrollbar flex flex-col gap-3 space-y-0">
          {/* ── Quantity summary strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <QtyCard label="Ordered" value={orderedQty} color="blue" icon={Package} />
            <QtyCard label="Dispatched" value={alreadyDispatched} color="violet" icon={Truck}
              sub={activePlans.length > 0 ? `${activePlans.length} plan(s)` : undefined} />
            <QtyCard
              label="Remaining"
              value={remaining}
              color={remaining > 0 ? 'amber' : 'slate'}
              icon={remaining > 0 ? AlertCircle : CheckCircle2}
              sub={cancelledQty > 0 ? `${cancelledQty} cancelled` : undefined}
            />
            <QtyCard label="To Dispatch" value={form.quantity || 0} color="emerald" icon={Truck} />
          </div>

          {cancelledQty > 0 && (
            <p className="text-[11px] text-red-500 -mt-1">
              {cancelledQty} unit(s) cancelled — effective: <strong>{effectiveQty}</strong>
            </p>
          )}

          {/* ── Two-column body ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* ════ LEFT COLUMN ════ */}
            <div className="flex flex-col gap-3">
              {/* Order Info */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Order Info
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
                    <Dropdown value={form.customer_id}
                      onValueChange={(v) => setForm(f => ({ ...f, customer_id: v }))}
                      options={customerOptions}
                      placeholder="Select customer..." searchPlaceholder="Search customers..."
                      align="start" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Product</label>
                    <Dropdown value={form.product_id}
                      onValueChange={(v) => setForm(f => ({ ...f, product_id: v }))}
                      options={productOptions}
                      placeholder="Select product..." searchPlaceholder="Search products..."
                      align="start" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Unit Price</label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      className="w-full h-7 text-xs"
                      value={form.unit_price}
                      onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Dispatch form */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Truck size={13} className="text-slate-400" /> New Dispatch
                  </span>
                  {!fullyDispatched && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      {remaining} remaining
                    </span>
                  )}
                  {fullyDispatched && (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} /> Fully Dispatched
                    </span>
                  )}
                </div>

                {fullyDispatched ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    <CheckCircle2 size={20} className="text-emerald-300 mx-auto mb-1" />
                    All {effectiveQty} unit(s) dispatched.
                  </div>
                ) : (
                  <div className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Qty <span className="text-red-500">*</span>
                        <span className="ml-1 text-slate-400 font-normal">(max {remaining})</span>
                      </label>
                      <Input type="number" step="1" min="1" max={remaining}
                        placeholder={`1 – ${remaining}`}
                        className="h-7 text-xs"
                        value={form.quantity}
                        onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(/\D/g, '') }))} />
                      {form.quantity && Number(form.quantity) > remaining && (
                        <p className="text-xs text-red-500 mt-1">Exceeds remaining ({remaining})</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Date <span className="text-red-500">*</span>
                      </label>
                      <DatePicker value={form.dispatch_date}
                        onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))}
                        name="dispatch_date" placeholder="Select date..." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Godown <span className="text-red-500">*</span>
                      </label>
                      <Dropdown value={form.godown_id}
                        onValueChange={v => setForm(f => ({ ...f, godown_id: v }))}
                        options={activeGodownOptions}
                        placeholder="Select godown..." searchPlaceholder="Search godowns..."
                        align="start" />
                    </div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {activePlans.length > 0 && effectiveQty > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>Progress</span>
                    <span className="font-medium">
                      {Math.round((alreadyDispatched / effectiveQty) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-l-full transition-all duration-500"
                      style={{ width: `${Math.min((alreadyDispatched / effectiveQty) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* ════ RIGHT COLUMN — Existing plans ════ */}
            <div className="rounded-xl border border-slate-200 overflow-hidden self-start">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <ClipboardList size={12} className="text-slate-400" />
                  History
                </span>
                {activePlans.length > 0 && (
                  <span className="text-[10px] font-medium text-slate-400">
                    {activePlans.length} plan{activePlans.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {activePlans.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <ClipboardList size={20} className="text-slate-200 mx-auto mb-1.5" />
                  <p className="text-[11px] text-slate-400">No dispatches yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">DN No.</th>
                        <th className="text-center px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Godown</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activePlans.map(plan => {
                        const godownName = godowns.find(g => g.godown_id === plan.godown_id)?.name || '—';
                        return (
                          <tr key={plan.plan_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-2.5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                              {plan.dispatch_number || '—'}
                            </td>
                            <td className="px-2.5 py-2 text-center font-medium text-slate-700">
                              {plan.quantity}
                              {plan.already_dispatched > 0 && <span className="text-violet-500"> ({plan.already_dispatched} done)</span>}
                            </td>
                            <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">
                              {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd/MM/yy') : '—'}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600 max-w-[100px] truncate" title={godownName}>
                              {godownName}
                            </td>
                            <td className="px-2.5 py-2">
                              <StatusBadge status={plan.dispatch_status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {activePlans.length > 1 && (
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Total</td>
                          <td className="px-2.5 py-1.5 text-center font-bold text-slate-700">
                            {activePlans.reduce((s, p) => s + Number(p.quantity), 0)}
                          </td>
                          <td colSpan={3} className="px-2.5 py-1.5 text-[10px] text-slate-400" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" size="sm" type="button" onClick={onClose}>Close</Button>
          {!fullyDispatched && (
            <Button size="sm" type="button" onClick={handleSave}
              disabled={isSaving || !form.quantity || Number(form.quantity) > remaining}
              className="gap-1.5">
              <Save size={13} />
              {isSaving ? 'Dispatching...' : 'Dispatch Now'}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default SkipDeliverModal;
