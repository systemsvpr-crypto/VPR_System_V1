import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Edit2, X, Save, Package,
  Truck, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { saveDispatchPlan } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

/* ─── status badge ───────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending: 'bg-slate-100 text-slate-500 border-slate-200',
    Planned: 'bg-blue-50 text-blue-700 border-blue-100',
    'Dispatch Done': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Partially Dispatched': 'bg-amber-50 text-amber-700 border-amber-100',
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
    <div className={`flex flex-col items-center justify-center rounded-xl border px-4 py-3 gap-0.5 ${c.bg} ${c.border}`}>
      {Icon && <Icon size={15} className={`mb-0.5 ${c.icon}`} />}
      <span className={`text-2xl font-bold tabular-nums ${c.text}`}>{value}</span>
      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      {sub && <span className="text-[10px] text-slate-400 mt-0.5">{sub}</span>}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────── */

const EMPTY_FORM = {
  plan_id: null,
  quantity: '',
  dispatch_date: new Date().toISOString().split('T')[0],
  godown_id: '',
};

const PlanDispatchModal = ({ isOpen, onClose, item, godowns, user, onSave }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [unitPrice, setUnitPrice] = useState(''); // shared across all plans for this item
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  /* ── derived quantities ─────────────────────────────────── */
  const orderedQty = Number(item?.quantity || 0);
  const cancelledQty = Number(item?.cancelled_quantity || 0);
  const effectiveQty = orderedQty - cancelledQty;

  const activePlans = useMemo(() =>
    (item?.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled'),
    [item],
  );

  const totalPlanned = activePlans.reduce((s, p) => s + Number(p.quantity), 0);
  const totalDispatched = activePlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);

  const remainingQty = useMemo(() => {
    if (editingPlanId) {
      const otherPlanned = activePlans
        .filter(p => p.plan_id !== editingPlanId)
        .reduce((s, p) => s + Number(p.quantity), 0);
      return effectiveQty - otherPlanned;
    }
    return effectiveQty - totalPlanned;
  }, [effectiveQty, totalPlanned, activePlans, editingPlanId]);

  const activeGodowns = useMemo(() =>
    godowns.filter(g => g.is_active).map(g => ({ value: g.godown_id, label: g.name })),
    [godowns],
  );

  /* ── reset on open ──────────────────────────────────────── */
  useEffect(() => {
    if (isOpen && item) {
      setEditingPlanId(null);
      const latestPrice = activePlans.length > 0
        ? String(activePlans[activePlans.length - 1].unit_price || item.unit_price || '')
        : String(item.unit_price || '');
      setUnitPrice(latestPrice);
      setForm({ ...EMPTY_FORM, godown_id: item.godown_id || '' });
    }
  }, [isOpen, item?.item_id]); // eslint-disable-line

  /* ── edit an existing plan ──────────────────────────────── */
  const startEdit = (plan) => {
    setEditingPlanId(plan.plan_id);
    setUnitPrice(String(plan.unit_price || item?.unit_price || ''));
    setForm({
      plan_id: plan.plan_id,
      quantity: String(plan.quantity),
      dispatch_date: plan.dispatch_date || new Date().toISOString().split('T')[0],
      godown_id: plan.godown_id || '',
    });
    setTimeout(() => {
      document.getElementById('plan-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const cancelEdit = () => {
    setEditingPlanId(null);
    setForm({ ...EMPTY_FORM, godown_id: item?.godown_id || '' });
  };

  /* ── save ───────────────────────────────────────────────── */
  const handleSave = async () => {
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) { toast.error('Enter a valid dispatch quantity.'); return; }
    if (qty > remainingQty) { toast.error(`Quantity (${qty}) exceeds remaining (${remainingQty}).`); return; }
    if (!form.godown_id) { toast.error('Please select a godown.'); return; }
    if (!form.dispatch_date) { toast.error('Please select a dispatch date.'); return; }
    if (!unitPrice || Number(unitPrice) <= 0) { toast.error('Enter a valid unit price.'); return; }

    setIsSaving(true);
    try {
      await saveDispatchPlan({
        plan_id: editingPlanId || undefined,
        order_item_id: item.item_id,
        quantity: form.quantity,
        godown_id: form.godown_id,
        unit_price: unitPrice,
        dispatch_date: form.dispatch_date,
        created_by: user?.user_id,
      });
      toast.success(editingPlanId ? 'Dispatch plan updated.' : 'New dispatch plan saved.');
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save dispatch plan.');
    }
    setIsSaving(false);
  };

  if (!item) return null;

  const fullyPlanned = remainingQty <= 0 && !editingPlanId;

  /* ── order item total value: effectiveQty × unit price ──────────────── */
  const unitPriceNum = Number(unitPrice) || 0;
  const totalValue = effectiveQty * unitPriceNum;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* wider modal so left+right columns sit comfortably */}
      <ModalContent className="max-w-6xl">

        {/* ── Header ── */}
        <ModalHeader>
          <div className="flex items-center gap-3 w-full pr-10">
            <div className="bg-primary/10 p-2 rounded-lg shrink-0">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-800 leading-tight">Plan Dispatch</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {item.sales_orders?.order_number} &nbsp;·&nbsp;
                {item.sales_orders?.customers?.name} &nbsp;·&nbsp;
                <span className="font-medium text-slate-700">
                  {item.products?.name} ({item.products?.unit})
                </span>
              </p>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="flex flex-col gap-5">

          {/* ── Quantity summary strip (full width) ── */}
          <div className="grid grid-cols-4 gap-3">
            <QtyCard label="Ordered" value={orderedQty} color="blue" icon={Package} />
            <QtyCard label="Planned" value={totalPlanned} color="emerald" icon={ClipboardList}
              sub={activePlans.length > 0 ? `${activePlans.length} plan(s)` : undefined} />
            <QtyCard label="Dispatched" value={totalDispatched} color="violet" icon={Truck} />
            <QtyCard
              label="Remaining"
              value={effectiveQty - totalPlanned}
              color={effectiveQty - totalPlanned > 0 ? 'amber' : 'slate'}
              icon={effectiveQty - totalPlanned > 0 ? AlertCircle : CheckCircle2}
              sub={cancelledQty > 0 ? `${cancelledQty} cancelled` : undefined}
            />
          </div>

          {cancelledQty > 0 && (
            <p className="text-xs text-red-500 -mt-2">
              ⚠️ {cancelledQty} unit(s) cancelled — effective orderable qty: <strong>{effectiveQty}</strong>
            </p>
          )}

          {/* ── Two-column body: LEFT = controls, RIGHT = existing plans ── */}
          <div className="grid grid-cols-2 gap-5 items-start">

            {/* ════ LEFT COLUMN ════ */}
            <div className="flex flex-col gap-4">

              {/* Shared Unit Price */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Unit Price
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    (shared across all plans for this item)
                  </span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 text-sm font-medium shrink-0">₹</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-36 h-8 text-sm font-semibold"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                  />
                  {item.unit_price && Number(unitPrice) !== Number(item.unit_price) && (
                    <button
                      type="button"
                      onClick={() => setUnitPrice(String(item.unit_price))}
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      Reset to ₹{Number(item.unit_price).toLocaleString('en-IN')}
                    </button>
                  )}
                  {unitPriceNum > 0 && (
                    <span className="ml-auto text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
                      Total: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              {/* Plan form */}
              <div id="plan-form-section" className="rounded-xl border border-slate-200 overflow-hidden">
                {/* form header */}
                <div className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-200 ${editingPlanId ? 'bg-primary/5' : 'bg-slate-50'
                  }`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    {editingPlanId
                      ? <><Edit2 size={14} className="text-primary" /> Edit Plan</>
                      : <><Plus size={14} className="text-slate-400" /> New Dispatch Plan</>
                    }
                  </span>
                  {!fullyPlanned && !editingPlanId && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      {remainingQty} remaining
                    </span>
                  )}
                  {fullyPlanned && (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} /> Fully Planned
                    </span>
                  )}
                  {editingPlanId && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-primary bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-full">
                        max {remainingQty}
                      </span>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Cancel edit"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {fullyPlanned && !editingPlanId ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">
                    <CheckCircle2 size={28} className="text-emerald-300 mx-auto mb-2" />
                    All {effectiveQty} unit(s) are planned.
                    <p className="text-[11px] mt-1 text-slate-300">Click ✏️ on a plan in the table to edit it.</p>
                  </div>
                ) : (
                  <div className="px-4 py-4 flex flex-col gap-3">
                    {/* Dispatch Qty */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Qty <span className="text-red-500">*</span>
                        <span className="ml-1 text-slate-400 font-normal">(max {remainingQty})</span>
                      </label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max={remainingQty}
                        placeholder={`1 – ${remainingQty}`}
                        value={form.quantity}
                        onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(/\D/g, '') }))}
                      />
                      {form.quantity && Number(form.quantity) > remainingQty && (
                        <p className="text-xs text-red-500 mt-1">Exceeds remaining ({remainingQty})</p>
                      )}
                    </div>



                    {/* Dispatch Date */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Date <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        value={form.dispatch_date}
                        onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))}
                        name="dispatch_date"
                        placeholder="Select date..."
                      />
                    </div>

                    {/* Godown */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Dispatch Godown <span className="text-red-500">*</span>
                      </label>
                      <Dropdown
                        value={form.godown_id}
                        onValueChange={v => setForm(f => ({ ...f, godown_id: v }))}
                        options={activeGodowns}
                        placeholder="Select godown..."
                        searchPlaceholder="Search godowns..."
                        align="start"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {activePlans.length > 0 && effectiveQty > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>Planning progress</span>
                    <span className="font-medium">
                      {Math.round((totalPlanned / effectiveQty) * 100)}% planned
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-violet-400 float-left rounded-l-full transition-all duration-500"
                      style={{ width: `${Math.min((totalDispatched / effectiveQty) * 100, 100)}%` }}
                    />
                    <div
                      className="h-full bg-emerald-400 float-left transition-all duration-500"
                      style={{ width: `${Math.min(((totalPlanned - totalDispatched) / effectiveQty) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-400 inline-block" />Dispatched</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Planned</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-200 inline-block" />Remaining</span>
                  </div>
                </div>
              )}
            </div>

            {/* ════ RIGHT COLUMN — Existing plans table ════ */}
            <div className="rounded-xl border border-slate-200 overflow-hidden self-start">
              {/* table header bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <ClipboardList size={13} className="text-slate-400" />
                  Dispatch Plans
                </span>
                {activePlans.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">
                    {activePlans.length} plan{activePlans.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {activePlans.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <ClipboardList size={24} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No plans created yet.</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">Use the form to add the first one.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">DN No.</th>
                        <th className="text-center px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Godown</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="w-8 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activePlans.map(plan => {
                        const isEditable = plan.dispatch_status === 'Pending' || plan.dispatch_status === 'Planned';
                        const isCurrentlyEditing = editingPlanId === plan.plan_id;
                        const godownName = godowns.find(g => g.godown_id === plan.godown_id)?.name || '—';
                        return (
                          <tr
                            key={plan.plan_id}
                            className={`transition-colors ${isCurrentlyEditing
                                ? 'bg-primary/5 border-l-2 border-l-primary'
                                : 'hover:bg-slate-50'
                              }`}
                          >
                            {/* DN number */}
                            <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">
                              {plan.dispatch_number || '—'}
                            </td>

                            {/* Qty + dispatched */}
                            <td className="px-3 py-2.5 text-center">
                              <span className="font-medium text-slate-700">{plan.quantity}</span>
                              {plan.already_dispatched > 0 && (
                                <div className="text-[10px] text-violet-500 leading-tight">
                                  {plan.already_dispatched} done
                                </div>
                              )}
                            </td>

                            {/* Date */}
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                              {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd/MM/yy') : '—'}
                            </td>

                            {/* Godown */}
                            <td className="px-3 py-2.5 text-slate-600 max-w-[100px] truncate" title={godownName}>
                              {godownName}
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5">
                              <StatusBadge status={plan.dispatch_status} />
                            </td>

                            {/* Edit / Cancel-edit button */}
                            <td className="px-2 py-2.5 text-center">
                              {isEditable && !isCurrentlyEditing && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(plan)}
                                  className="p-1 rounded text-slate-300 hover:text-primary hover:bg-primary/5 transition-all"
                                  title="Edit this plan"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                              {isCurrentlyEditing && (
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                  title="Cancel edit"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* totals footer */}
                    {activePlans.length > 1 && (
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td className="px-3 py-2 text-xs font-semibold text-slate-500">Total</td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700">{totalPlanned}</td>
                          <td colSpan={4} className="px-3 py-2 text-[11px] text-slate-400">
                            {totalDispatched > 0 && `${totalDispatched} dispatched`}
                          </td>
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
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          {(!fullyPlanned || editingPlanId) && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !form.quantity || Number(form.quantity) > remainingQty}
              className="gap-2"
            >
              <Save size={15} />
              {isSaving ? 'Saving...' : editingPlanId ? 'Update Plan' : 'Save Plan'}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default PlanDispatchModal;
