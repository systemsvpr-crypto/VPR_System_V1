import { useState, useEffect } from 'react';
import {
  Truck, Hash, ClipboardList, Package,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { createDelivery, generateNextLiftingNumber, getDeliveriesForItem } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/textarea';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const QtyCard = ({ label, value, color, icon: Icon, sub }) => {
  const colors = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100',    icon: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', icon: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100',   icon: 'text-amber-400' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   icon: 'text-slate-400' },
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

const ReceiveModal = ({ isOpen, onClose, item, transporters, godowns, user, onSuccess }) => {
  const [form, setForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    godown_id: '',
    received_quantity: '',
    transporter_id: '',
    lr_number: '',
    vehicle_number: '',
    remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [nextLifting, setNextLifting] = useState(null);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      const defaultGodownId = item.approved_godown_id || item.purchase_indents?.godown_id || '';
      setForm({
        delivery_date: new Date().toISOString().split('T')[0],
        godown_id: defaultGodownId,
        received_quantity: String(item.remaining_qty || ''),
        transporter_id: '',
        lr_number: '',
        vehicle_number: '',
        remarks: '',
      });
      generateNextLiftingNumber().then(setNextLifting).catch(() => {});
      setLoadingHistory(true);
      getDeliveriesForItem(item.item_id)
        .then(res => {
          setDeliveryHistory(res.map(d => ({
            ...d,
            purchase_delivery_godowns: d.purchase_delivery_godowns || [],
          })));
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, item]);

  const activeGodowns = (godowns || []).filter(g => g.is_active !== false);
  const godownOptions = activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));

  const transporterOptions = transporters
    .filter(t => t.name)
    .map(t => ({ value: t.transporter_id, label: t.name }));

  const formQty = Number(form.received_quantity) || 0;
  const remainingQty = Number(item?.remaining_qty || 0);
  const exceedRemaining = formQty > remainingQty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.delivery_date) { toast.error('Please select a lifting date.'); return; }
    if (!form.godown_id) { toast.error('Please select a godown.'); return; }
    if (!form.received_quantity || Number(form.received_quantity) <= 0) { toast.error('Please enter a valid received quantity.'); return; }
    if (exceedRemaining) { toast.error(`Quantity (${formQty}) exceeds remaining (${remainingQty}).`); return; }

    setSubmitting(true);
    try {
      const indent = item.purchase_indents || {};
      const result = await createDelivery({
        item_id: item.item_id,
        indent_id: indent.indent_id,
        delivery_date: form.delivery_date,
        godown_allocations: [{ godown_id: form.godown_id, qty: Number(form.received_quantity) }],
        transporter_id: form.transporter_id || null,
        lr_number: form.lr_number || null,
        vehicle_number: form.vehicle_number || null,
        remarks: form.remarks || null,
        created_by: user?.user_id,
      });
      toast.success(`Delivery recorded — ${result.lifting_number}`);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to record delivery');
    }
    setSubmitting(false);
  };

  if (!item) return null;

  const indent = item.purchase_indents || {};
  const orderedQty = Number(item.quantity || 0);
  const receivedQty = Number(item.received_qty || 0);
  const fullyDelivered = remainingQty <= 0;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-h-[90vh] flex flex-col md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <ModalHeader>
          <div className="flex items-center gap-2 w-full pr-10">
            <div className="bg-primary/10 p-1.5 rounded-lg shrink-0">
              <ClipboardList size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-800 leading-tight">Receive Delivery</h2>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {indent.indent_number} &nbsp;·&nbsp;
                {item.item_vendor?.name || indent.vendors?.name || '—'} &nbsp;·&nbsp;
                <span className="font-medium text-slate-700">
                  {item.products?.name} ({item.products?.unit})
                </span>
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ModalBody className="flex-1 overflow-y-auto pr-1.5 custom-scrollbar flex flex-col gap-3 space-y-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <QtyCard label="Ordered" value={orderedQty} color="blue" icon={Package} />
              <QtyCard label="Received" value={receivedQty} color="emerald" icon={Truck} />
              <QtyCard
                label="Remaining"
                value={remainingQty}
                color={remainingQty > 0 ? 'amber' : 'slate'}
                icon={remainingQty > 0 ? AlertCircle : CheckCircle2}
              />
              <QtyCard label="To Receive" value={formQty || 0} color="emerald" icon={Truck} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Lifting Number</label>
              <div className="h-9 flex items-center gap-2 px-3 rounded-lg bg-teal-50 border border-teal-200 text-xs font-semibold text-teal-700">
                <Hash size={13} />
                {nextLifting || <span className="text-teal-400 font-normal">Generating...</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Truck size={13} className="text-slate-400" /> New Lift
                    </span>
                    {!fullyDelivered && (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                        {remainingQty} remaining
                      </span>
                    )}
                    {fullyDelivered && (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={12} /> Fully Received
                      </span>
                    )}
                  </div>

                  {fullyDelivered ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">
                      <CheckCircle2 size={20} className="text-emerald-300 mx-auto mb-1" />
                      All {orderedQty} unit(s) received.
                    </div>
                  ) : (
                    <div className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Received Qty <span className="text-red-500">*</span>
                          <span className="ml-1 text-slate-400 font-normal">(max {remainingQty})</span>
                        </label>
                        <Input type="number" step="1" min="1" max={remainingQty}
                          placeholder={`1 – ${remainingQty}`}
                          className="h-7 text-xs"
                          value={form.received_quantity}
                          onChange={(e) => setForm({ ...form, received_quantity: e.target.value.replace(/\D/g, '') })} />
                        {exceedRemaining && (
                          <p className="text-xs text-red-500 mt-1">Exceeds remaining ({remainingQty})</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Godown <span className="text-red-500">*</span></label>
                        <Dropdown value={form.godown_id}
                          onValueChange={(v) => setForm({ ...form, godown_id: v })}
                          options={godownOptions}
                          placeholder="Select godown..."
                          searchPlaceholder="Search godowns..."
                          align="start" />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Lifting Date <span className="text-red-500">*</span></label>
                        <DatePicker name="delivery_date" placeholder="Select date"
                          value={form.delivery_date}
                          onChange={(val) => setForm({ ...form, delivery_date: val.target ? val.target.value : val })}
                          required />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Transporter</label>
                        <Dropdown value={form.transporter_id}
                          onValueChange={(v) => setForm({ ...form, transporter_id: v })}
                          options={transporterOptions}
                          placeholder="Select transporter..."
                          searchPlaceholder="Search transporters..."
                          align="start" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">LR Number</label>
                        <Input type="text" placeholder="Enter LR number"
                          className="h-7 text-xs"
                          value={form.lr_number}
                          onChange={(e) => setForm({ ...form, lr_number: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle Number</label>
                        <Input type="text" placeholder="Enter vehicle no."
                          className="h-7 text-xs"
                          value={form.vehicle_number}
                          onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
                        <Textarea placeholder="Optional remarks..."
                          value={form.remarks}
                          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                          rows={2} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden self-start">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    <ClipboardList size={12} className="text-slate-400" />
                    Lifts History
                  </span>
                  {deliveryHistory.length > 0 && (
                    <span className="text-[10px] font-medium text-slate-400">
                      {deliveryHistory.length} lift{deliveryHistory.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {loadingHistory && deliveryHistory.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary" />
                  </div>
                ) : deliveryHistory.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <ClipboardList size={20} className="text-slate-200 mx-auto mb-1.5" />
                    <p className="text-[11px] text-slate-400">No lifts yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/60">
                          <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Lift No.</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                          <th className="text-center px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Godown</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Transporter</th>
                          <th className="text-center px-2.5 py-1.5 font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deliveryHistory.map(del => (
                          <tr key={del.delivery_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-2.5 py-2 font-semibold text-teal-700 whitespace-nowrap">
                              {del.lifting_number || '—'}
                            </td>
                            <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">
                              {format(new Date(del.delivery_date), 'dd/MM/yy')}
                            </td>
                            <td className="px-2.5 py-2 text-center font-medium text-slate-700">
                              {del.received_quantity}
                            </td>
                            <td className="px-2.5 py-2 text-slate-500 max-w-[120px]">
                              {del.purchase_delivery_godowns?.length > 0 ? (
                                <span className="flex flex-wrap gap-0.5">
                                  {del.purchase_delivery_godowns.map(g => (
                                    <span key={g.godown_id} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-white border border-slate-200 text-[10px]">
                                      {g.godowns?.name || '—'}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600 max-w-[100px] truncate" title={del.transporters?.name || ''}>
                              {del.transporters?.name || '—'}
                            </td>
                            <td className="px-2.5 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                del.status === 'Received'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {del.status === 'Received' ? <CheckCircle2 size={10} /> : null}
                                {del.status || 'Received'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={submitting}>Close</Button>
            {!fullyDelivered && (
              <Button size="sm" type="submit"
                disabled={submitting || !form.received_quantity || formQty === 0 || exceedRemaining || !form.godown_id}
                className="gap-1.5">
                {submitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                ) : (
                  <Truck size={13} />
                )}
                Record Delivery
              </Button>
            )}
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ReceiveModal;
