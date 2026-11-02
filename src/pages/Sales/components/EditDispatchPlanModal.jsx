import { useState, useEffect, useMemo } from 'react';
import { Edit2, Package, Warehouse, Calendar, Save, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import { sanitizeQtyInput } from '@/lib/qty';
import { saveDispatchPlan } from '../../../services/salesService';
import { getStockBalance } from '../../../services/stockService';

const UNIT_OPTIONS = [{ value: 'bag', label: 'BAG' }, { value: 'kg', label: 'KG' }];

const EditDispatchPlanModal = ({ isOpen, onClose, plan, godowns = [], user, onSuccess, isCompleted = false }) => {
  const [dispatchDate, setDispatchDate] = useState('');
  const [godownId, setGodownId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('bag');
  const [unitPrice, setUnitPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [availableStock, setAvailableStock] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    if (plan && isOpen) {
      setDispatchDate(plan.dispatch_date || new Date().toISOString().split('T')[0]);
      setGodownId(plan.godown_id || '');
      setQuantity(plan.quantity != null ? String(plan.quantity) : '');
      setUnit(plan.convert_unit?.toLowerCase() || plan.sales_order_items?.products?.unit?.toLowerCase() || 'bag');
      setUnitPrice(plan.unit_price != null ? String(plan.unit_price) : '');
    }
  }, [plan, isOpen]);

  const productId = plan?.sales_order_items?.product_id || plan?.product_id;

  // Check stock when godown or product changes
  useEffect(() => {
    if (!productId || !godownId) {
      setAvailableStock(null);
      return;
    }
    let cancelled = false;
    setStockLoading(true);
    getStockBalance(productId, godownId)
      .then(stk => {
        if (!cancelled) setAvailableStock(stk);
      })
      .catch(() => {
        if (!cancelled) setAvailableStock(0);
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => { cancelled = true; };
  }, [productId, godownId]);

  const activeGodownOptions = useMemo(() => {
    const list = (godowns || [])
      .filter(g => (g.godown_type || 'Own') === 'Own' && g.is_active !== false)
      .map(g => ({ value: String(g.godown_id), label: g.name }));
    if (plan?.godown_id && !list.some(o => o.value === String(plan.godown_id))) {
      list.unshift({ value: String(plan.godown_id), label: plan.godowns?.name || 'Assigned Godown' });
    }
    return list;
  }, [godowns, plan]);

  const totalAmount = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const parsedQty = parseFloat(quantity);
    if (!parsedQty || parsedQty <= 0) {
      toast.error('Please enter a valid dispatch quantity.');
      return;
    }
    const alreadyDispatched = Number(plan?.already_dispatched || 0);
    if (alreadyDispatched > 0 && parsedQty < alreadyDispatched) {
      toast.error(`Dispatch quantity cannot be less than already dispatched amount (${alreadyDispatched} ${unit.toUpperCase()}).`);
      return;
    }
    if (!dispatchDate) {
      toast.error('Please select a dispatch date.');
      return;
    }
    if (isCompleted && !godownId) {
      toast.error('Please select a godown.');
      return;
    }

    setIsSaving(true);
    try {
      await saveDispatchPlan({
        plan_id: plan.plan_id,
        order_item_id: plan.order_item_id || plan.sales_order_items?.item_id,
        quantity: parsedQty,
        unit,
        converted_qty: parsedQty,
        godown_id: isCompleted ? (godownId || null) : (plan.godown_id || null),
        unit_price: parseFloat(unitPrice) || 0,
        dispatch_date: dispatchDate,
        created_by: user?.user_id || plan.created_by,
        dispatch_status: plan.dispatch_status,
        stock_out: isCompleted,
      });

      toast.success(isCompleted ? 'Completed dispatch updated successfully' : 'Dispatch plan updated successfully');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update dispatch plan');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !plan) return null;

  const orderNumber = plan.sales_order_items?.sales_orders?.order_number || plan.orderNumber || '—';
  const customerName = plan.sales_order_items?.sales_orders?.customers?.name || plan.customerName || '—';
  const productName = plan.sales_order_items?.products?.name || plan.productName || '—';
  const dispatchNumber = plan.dispatch_number || plan.dispatchNo || '—';

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) onClose(); }}>
      <ModalContent className="max-w-lg">
        <ModalHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Edit2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                {isCompleted ? 'Edit Completed Dispatch' : 'Edit Dispatch Plan'}
              </h3>
              <p className="text-xs text-slate-500">
                Dispatch <span className="font-semibold text-slate-700">{dispatchNumber}</span> • Order <span className="font-semibold text-primary">{orderNumber}</span>
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit}>
          <ModalBody className="space-y-4 py-4 text-xs">
            {/* Summary card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="text-slate-800 font-semibold">{customerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Product:</span>
                <span className="text-slate-800 font-semibold">{productName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Current Status:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {plan.dispatch_status || 'Pending'}
                </span>
              </div>
            </div>

            {/* Dispatch Date */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1">
                <Calendar size={13} className="text-slate-400" /> Dispatch Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                placeholder="Select dispatch date..."
                className="h-9 w-full"
              />
            </div>

            {/* Godown Selection (Only for completed dispatches where stock ledger was deducted) */}
            {isCompleted && (
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Warehouse size={13} className="text-slate-400" /> Dispatch Godown <span className="text-red-500">*</span>
                </label>
                <Dropdown
                  value={godownId}
                  onValueChange={setGodownId}
                  options={activeGodownOptions}
                  placeholder="Select godown..."
                  className="h-9 w-full"
                />
                {godownId && (
                  <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                    <span>Available stock in selected godown:</span>
                    <span className={`font-semibold tabular-nums ${availableStock != null && availableStock < parseFloat(quantity || 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                      {stockLoading ? 'Checking...' : availableStock != null ? `${availableStock} ${unit.toUpperCase()}` : '—'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Package size={13} className="text-slate-400" /> Dispatch Qty <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(sanitizeQtyInput(e.target.value))}
                  placeholder="0.00"
                  className="h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Unit</label>
                <Dropdown
                  value={unit}
                  onValueChange={setUnit}
                  options={UNIT_OPTIONS}
                  className="h-9"
                />
              </div>
            </div>

            {/* Unit Price and Total */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Unit Price (₹)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(sanitizeQtyInput(e.target.value))}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Total Amount</label>
                <div className="h-9 px-3 rounded-md border border-slate-200 bg-slate-50 flex items-center font-bold text-slate-800">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {isCompleted && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Modifying a completed dispatch will automatically update the inventory ledger transaction in the selected godown.
                </span>
              </div>
            )}
          </ModalBody>

          <ModalFooter className="border-t pt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
              <Save size={14} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default EditDispatchPlanModal;

