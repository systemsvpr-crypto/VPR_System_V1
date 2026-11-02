import { useState, useEffect, useMemo } from 'react';
import { Edit2, Package, Calendar, User, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import { sanitizeQtyInput } from '@/lib/qty';
import { updatePendingDispatchOrderItem } from '../../../services/salesService';
import { canEditOrDelete } from '../../../lib/permissions';

const UNIT_OPTIONS = [{ value: 'bag', label: 'BAG' }, { value: 'kg', label: 'KG' }];

const PROCESS_TYPE_OPTIONS = [
  { value: 'order_process', label: 'Process' },
  { value: 'direct', label: 'Direct' },
  { value: 'skip_delivered', label: 'Skip Deliver' },
];

const EditOrderItemModal = ({
  isOpen,
  onClose,
  item,
  products = [],
  customers = [],
  user,
  onSuccess,
}) => {
  const [orderDate, setOrderDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [processType, setProcessType] = useState('order_process');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('bag');
  const [unitPrice, setUnitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item && isOpen) {
      const order = item.sales_orders || {};
      setOrderDate(order.order_date ? order.order_date.split('T')[0] : new Date().toISOString().split('T')[0]);

      // Resolve customer ID from order, item, or matching customer name
      let resolvedCustomerId = order.customer_id || item.customer_id || order.customers?.customer_id;
      if (!resolvedCustomerId && (order.customers?.name || item.customerName)) {
        const nameToMatch = (order.customers?.name || item.customerName || '').trim().toLowerCase();
        const found = (customers || []).find(c => c.name?.trim().toLowerCase() === nameToMatch);
        if (found) resolvedCustomerId = found.customer_id;
      }
      setCustomerId(resolvedCustomerId ? String(resolvedCustomerId) : '');

      setProcessType(order.process_type || 'order_process');
      setProductId(item.product_id ? String(item.product_id) : '');
      setQuantity(item.quantity != null ? String(item.quantity) : '');
      setUnit(item.Selected_Unit?.toLowerCase() || item.convert_unit?.toLowerCase() || item.products?.unit?.toLowerCase() || 'bag');
      setUnitPrice(item.unit_price != null ? String(item.unit_price) : '');
    }
  }, [item, isOpen, customers]);

  const customerOptions = useMemo(() => {
    return (customers || []).map(c => ({
      value: String(c.customer_id),
      label: c.name,
    }));
  }, [customers]);

  const productOptions = useMemo(() => {
    return (products || []).map(p => ({
      value: String(p.product_id),
      label: p.name,
    }));
  }, [products]);

  const totalAmount = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  const plannedQty = Number(item?.planned || 0);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canEditOrDelete(user)) {
      toast.error('Permission denied. Only Admins can edit order details.');
      return;
    }
    if (!orderDate) {
      toast.error('Please select an order date.');
      return;
    }
    if (!customerId) {
      toast.error('Please select a customer.');
      return;
    }
    if (!productId) {
      toast.error('Please select a product.');
      return;
    }
    const parsedQty = parseFloat(quantity);
    if (!parsedQty || parsedQty <= 0) {
      toast.error('Please enter a valid quantity.');
      return;
    }
    if (plannedQty > 0 && parsedQty < plannedQty) {
      toast.error(`Cannot reduce quantity below already planned/dispatched amount (${plannedQty} ${unit.toUpperCase()}).`);
      return;
    }

    setSubmitting(true);
    try {
      await updatePendingDispatchOrderItem({
        item_id: item.item_id,
        order_id: item.order_id || item.sales_orders?.order_id,
        order_date: orderDate,
        customer_id: customerId,
        process_type: processType,
        product_id: productId,
        quantity: parsedQty,
        unit,
        unit_price: parseFloat(unitPrice) || 0,
      });

      toast.success('Order details updated successfully');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update order details');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  const orderNumber = item.sales_orders?.order_number || item.item_id;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader className="border-b pb-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Edit2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                Edit Order Details
              </h3>
              <p className="text-xs text-slate-500">
                Order <span className="font-semibold text-primary">{orderNumber}</span>
                {item.productNo ? ` • Item #${item.productNo}` : ''}
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit}>
          <ModalBody className="space-y-4 py-4 text-xs">
            {/* 1. Order-Level Fields (Filled in Create Order) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Calendar size={13} className="text-slate-400" /> Order Date <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  placeholder="Order date..."
                  className="h-9 w-full"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <User size={13} className="text-slate-400" /> Customer <span className="text-red-500">*</span>
                </label>
                <Dropdown
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select customer..."
                  searchPlaceholder="Search customers..."
                  className="h-9 w-full"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Order Type (Process Type)</label>
              <Dropdown
                value={processType}
                onValueChange={setProcessType}
                options={PROCESS_TYPE_OPTIONS}
                className="h-9 w-full"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 pt-2" />

            {/* 2. Item-Level Fields (Filled in Create Order) */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1">
                <Package size={13} className="text-slate-400" /> Product <span className="text-red-500">*</span>
              </label>
              <Dropdown
                value={productId}
                onValueChange={setProductId}
                options={productOptions}
                placeholder="Select product..."
                searchPlaceholder="Search products..."
                disabled={plannedQty > 0}
                className="h-9 w-full"
              />
              {plannedQty > 0 && (
                <p className="text-[11px] text-amber-600">Product locked because this item already has active dispatch plans.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Ordered Quantity <span className="text-red-500">*</span></label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(sanitizeQtyInput(e.target.value))}
                  placeholder="0.00"
                  className="h-9"
                  required
                />
                {plannedQty > 0 && (
                  <p className="text-[10px] text-slate-500">Min: {plannedQty} (already planned)</p>
                )}
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

            <div className="grid grid-cols-2 gap-3">
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
          </ModalBody>

          <ModalFooter className="border-t pt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
              <Save size={14} />
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default EditOrderItemModal;
