import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, X, Plus, Truck, ArrowRightCircle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { createOrder, updateOrder, generateNextOrderNumber } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const OrderModal = ({ isOpen, onClose, user, onSuccess, editingOrder, products, godowns, customers }) => {
  const [form, setForm] = useState({
    order_date: new Date().toISOString().split('T')[0],
    order_number: '',
    customer_id: '',
    process_type: 'order_process',
    items: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingOrder;

  const lockedItemIds = useMemo(() => {
    if (!editingOrder) return new Set();
    return new Set(
      (editingOrder.sales_order_items || [])
        .filter(item => (item.dispatch_plans || []).some(plan => plan.dispatch_status === 'Dispatch Done'))
        .map(item => item.item_id)
    );
  }, [editingOrder]);

  const anyItemLocked = lockedItemIds.size > 0;

  const isItemLocked = (itemId) => itemId && lockedItemIds.has(itemId);

  useEffect(() => {
    if (!isOpen) {
      setForm({
        order_date: new Date().toISOString().split('T')[0],
        order_number: '',
        customer_id: '',
        process_type: 'order_process',
        items: [],
      });
    } else if (editingOrder) {
      setForm({
        order_date: editingOrder.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        order_number: editingOrder.order_number || '',
        customer_id: editingOrder.customer_id || '',
        process_type: editingOrder.process_type || 'order_process',
        items: (editingOrder.sales_order_items || []).map(item => ({
          item_id: item.item_id,
          product_id: item.product_id,
          godown_id: item.godown_id,
          unit_price: String(item.unit_price),
          quantity: String(item.quantity),
        })),
      });
    } else {
      setForm(prev => ({
        ...prev,
        items: [{ product_id: '', godown_id: '', unit_price: '', quantity: '' }],
      }));
      generateNextOrderNumber().then(num => {
        setForm(prev => ({ ...prev, order_number: num }));
      }).catch(() => {});
    }
  }, [isOpen, editingOrder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.order_number.trim()) { toast.error('Order number is required.'); return; }
    if (!form.customer_id) { toast.error('Please select a customer.'); return; }
    if (form.items.length === 0) { toast.error('Add at least one product.'); return; }
    for (const [i, item] of form.items.entries()) {
      if (!item.product_id) { toast.error(`Item ${i + 1}: Select a product.`); return; }
      if (!item.godown_id) { toast.error(`Item ${i + 1}: Select a godown.`); return; }
      if (!Number(item.quantity) || Number(item.quantity) <= 0) { toast.error(`Item ${i + 1}: Enter a valid quantity.`); return; }
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateOrder(editingOrder.order_id, {
          order_date: form.order_date,
          order_number: form.order_number.trim(),
          customer_id: form.customer_id,
          items: form.items,
          process_type: form.process_type,
        });
        toast.success('Order updated successfully');
      } else {
        await createOrder({
          order_date: form.order_date,
          order_number: form.order_number.trim(),
          customer_id: form.customer_id,
          items: form.items,
          created_by: user?.user_id,
          process_type: form.process_type,
        });
        toast.success('Order created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { product_id: '', godown_id: '', unit_price: '', quantity: '' }] });
  };

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index][field] = value;
    setForm({ ...form, items });
  };

  const removeItem = (index) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const totalAmount = useMemo(() => {
    return form.items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
  }, [form.items]);

  const productOptions = useMemo(() => {
    return products.map(p => ({ value: p.product_id, label: `${p.name} (${p.unit})` }));
  }, [products]);

  const activeGodowns = godowns.filter(g => g.is_active);

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-4xl">
        <ModalHeader>
          <div className="flex items-center justify-between w-full pr-12">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <ShoppingCart size={20} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Edit Order' : 'Create Order'}
                {anyItemLocked && (
                  <span className="ml-2 inline-flex items-center gap-1 text-sm font-normal text-amber-600">
                    <Lock size={14} /> Some items locked
                  </span>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {[
                { id: 'order_process', label: 'Order Process' },
                { id: 'skip_delivered', label: 'Skip Delivered' },
              ].map(t => (
                <button key={t.id} type="button" onClick={() => !anyItemLocked && setForm({ ...form, process_type: t.id })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    anyItemLocked ? 'cursor-not-allowed opacity-60' :
                    form.process_type === t.id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {t.id === 'order_process' ? <ArrowRightCircle size={14} /> : <Truck size={14} />}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Order Date <span className="text-red-500">*</span></label>
                <DatePicker value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} disabled={anyItemLocked} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Order Number <span className="text-red-500">*</span></label>
                <Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} placeholder="e.g. VPR/OR-001" disabled={anyItemLocked} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                <Dropdown value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}
                  options={customers.map(c => ({ value: c.customer_id, label: c.name }))}
                  placeholder="Select customer..." searchPlaceholder="Search customers..."
                  align="start" disabled={anyItemLocked} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Products ({form.items.length})</label>
              </div>
              {form.items.length === 0 && (
                <p className="text-xs text-slate-400 italic mb-2">No products added yet.</p>
              )}
              <div className="space-y-3">
                {form.items.map((item, i) => {
                  const itemLocked = isItemLocked(item.item_id);
                  return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Product <span className="text-red-500">*</span></label>
                      <Dropdown value={item.product_id} onValueChange={(v) => updateItem(i, 'product_id', v)}
                        options={productOptions} placeholder="Select product..." searchPlaceholder="Search products..."
                        align="start" disabled={itemLocked} />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Godown <span className="text-red-500">*</span></label>
                      <Dropdown value={item.godown_id} onValueChange={(v) => updateItem(i, 'godown_id', v)}
                        options={activeGodowns.map(g => ({ value: g.godown_id, label: g.name }))}
                        placeholder="Select godown..." searchPlaceholder="Search godowns..."
                        align="start" disabled={itemLocked} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Unit Price</label>
                      <Input type="number" step="0.01" min="0" placeholder="0.00"
                        value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} disabled={itemLocked} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Qty <span className="text-red-500">*</span></label>
                      <Input type="number" step="1" min="1" placeholder="1"
                        value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value.replace(/\D/g, ''))} disabled={itemLocked} />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5">
                      <button type="button" onClick={() => !itemLocked && removeItem(i)}
                        className={`p-1.5 rounded transition-all ${itemLocked ? 'text-slate-200 cursor-not-allowed' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}>
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItem}
                className="mt-2 gap-1.5 text-xs font-medium">
                <Plus size={14} /> Add Product
              </Button>
            </div>

          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : (isEditing ? 'Update Order' : 'Create Order')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default OrderModal;
