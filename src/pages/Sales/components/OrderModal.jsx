import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, X, Plus, Truck, ArrowRightCircle, Lock, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { createOrder, updateOrder, generateNextOrderNumber, convertQtyToMasterUnit, convertQtyFromMasterUnit } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import BulkOrderProductsModal from './BulkOrderProductsModal';
import ProductModal from '../../Master/components/ProductModal';
import CustomerModal from '../../Master/components/CustomerModal';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';

const OrderModal = ({ isOpen, onClose, user, onSuccess, editingOrder, products, godowns, customers, onImportProducts, onImportCustomers }) => {
  const [form, setForm] = useState({
    order_date: new Date().toISOString().split('T')[0],
    order_number: '',
    customer_id: '',
    process_type: 'order_process',
    items: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  // Products/customers created on the fly (via the "+ Add New Product/Customer"
  // row pinned inside their dropdowns) — kept alongside the lists loaded from
  // the parent so a just-created record is immediately selectable here without
  // waiting for a full page reload.
  const [extraProducts, setExtraProducts] = useState([]);
  const [extraCustomers, setExtraCustomers] = useState([]);
  const [productQuickAddOpen, setProductQuickAddOpen] = useState(false);
  const [customerQuickAddOpen, setCustomerQuickAddOpen] = useState(false);
  const [quickAddProductRow, setQuickAddProductRow] = useState(null); // items index that asked for a new product

  // De-duplicated by id — see BulkOrderProductsModal for why this matters:
  // once the parent syncs its own list back down as an updated prop, the same
  // record could otherwise arrive from both sources and show twice.
  const allProducts = useMemo(() => {
    const map = new Map();
    [...products, ...extraProducts].forEach(p => map.set(p.product_id, p));
    return Array.from(map.values());
  }, [products, extraProducts]);

  const allCustomers = useMemo(() => {
    const map = new Map();
    [...customers, ...extraCustomers].forEach(c => map.set(c.customer_id, c));
    return Array.from(map.values());
  }, [customers, extraCustomers]);

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
      setNotifyCustomer(true);
      setExtraProducts([]);
      setExtraCustomers([]);
      setQuickAddProductRow(null);
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
          // Unit defaults to the product's master unit; Qty (raw, as typed
          // in that unit) defaults to whatever was saved before, falling
          // back to the item's current quantity for rows that predate this
          // feature (e.g. Bulk Upload rows, which only ever set quantity
          // directly in the master unit).
          Selected_Unit: item.Selected_Unit || (item.products?.unit || '').toLowerCase(),
          sales_qty: item.sales_qty != null ? String(item.sales_qty) : String(item.quantity),
        })),
      });
      setNotifyCustomer(true);
    } else {
      setForm(prev => ({
        ...prev,
        items: [{ product_id: '', godown_id: '', unit_price: '', Selected_Unit: '', sales_qty: '' }],
      }));
      setNotifyCustomer(true);
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
      const product = allProducts.find(p => p.product_id === item.product_id);
      if (!getComputedQty(item, product)) { toast.error(`Item ${i + 1}: Enter a valid quantity.`); return; }
    }
    // quantity is always the product's real master-unit figure, converted
    // from whichever Unit + Qty the row was actually entered in — see
    // getComputedQty. Selected_Unit/sales_qty are kept alongside purely as a
    // record of that raw entry.
    const payloadItems = form.items.map(item => {
      const product = allProducts.find(p => p.product_id === item.product_id);
      const rawQty = getItemRawQty(item);
      return {
        ...item,
        quantity: getComputedQty(item, product),
        Selected_Unit: getItemUnit(item, product),
        sales_qty: rawQty === '' ? null : Number(rawQty),
      };
    });
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateOrder(editingOrder.order_id, {
          order_date: form.order_date,
          order_number: form.order_number.trim(),
          customer_id: form.customer_id,
          items: payloadItems,
          process_type: form.process_type,
          notify_customer: notifyCustomer,
        });
        toast.success('Order updated successfully');
      } else {
        await createOrder({
          order_date: form.order_date,
          order_number: form.order_number.trim(),
          customer_id: form.customer_id,
          items: payloadItems,
          created_by: user?.user_id,
          process_type: form.process_type,
          notify_customer: notifyCustomer,
        });
        toast.success('Order created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { product_id: '', godown_id: '', unit_price: '', Selected_Unit: '', sales_qty: '' }] });
  };

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index][field] = value;
    setForm({ ...form, items });
  };

  const removeItem = (index) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  // Unit defaults to the product's master unit; Qty (raw, as typed in that
  // unit) defaults to whatever was saved before, falling back to the item's
  // plain quantity for rows that predate this feature (e.g. Bulk Upload
  // rows, which only ever set quantity directly in the master unit). Always
  // a real value, never '' (which would leave the <select> showing the
  // browser's own first-option default out of sync with state, so
  // switching Unit before a product is picked would silently no-op).
  const getItemUnit = (item, product) => item.Selected_Unit || (product?.unit || '').toLowerCase() || 'bag';
  const getItemRawQty = (item) =>
    item.sales_qty !== undefined && item.sales_qty !== null && item.sales_qty !== ''
      ? String(item.sales_qty)
      : String(item.quantity ?? '');

  // Order Qty is auto-calculated from the Unit + Qty inputs, converted into
  // the product's master unit via that product's Pkg/Bag (Mux) figure —
  // this is what actually gets saved as quantity (the value that drives the
  // rest of the sales/dispatch pipeline).
  const getComputedQty = (item, product) => {
    const raw = getItemRawQty(item);
    if (raw === '') return 0;
    const unit = getItemUnit(item, product);
    return roundQty(convertQtyToMasterUnit(raw, unit, product));
  };

  const handleProductChange = (index, productId) => {
    const product = allProducts.find(p => p.product_id === productId);
    const items = [...form.items];
    items[index] = { ...items[index], product_id: productId, Selected_Unit: (product?.unit || '').toLowerCase() };
    setForm({ ...form, items });
  };

  // Switching Unit re-bases whatever Qty is currently showing into the
  // newly picked unit (e.g. 20 bags becomes 640 when switching to Kg) so a
  // stale number typed in the old unit doesn't linger under a new one.
  const handleUnitChange = (index, newUnit) => {
    const item = form.items[index];
    const product = allProducts.find(p => p.product_id === item.product_id);
    const currentUnit = getItemUnit(item, product);
    const currentQty = getItemRawQty(item);
    const masterQty = convertQtyToMasterUnit(currentQty, currentUnit, product);
    const requantified = convertQtyFromMasterUnit(masterQty, newUnit, product);
    const items = [...form.items];
    items[index] = { ...item, Selected_Unit: newUnit, sales_qty: requantified ? String(roundQty(requantified)) : '' };
    setForm({ ...form, items });
  };

  const handleQtyChange = (index, value) => {
    const items = [...form.items];
    items[index] = { ...items[index], sales_qty: sanitizeQtyInput(value) };
    setForm({ ...form, items });
  };

  // New product saved from the "+ Add New Product" row inside that item's
  // dropdown — make it usable everywhere here and drop it straight into the
  // row that asked for it, same as picking it manually.
  const handleProductQuickAdded = (product) => {
    setExtraProducts(prev => [...prev, product]);
    if (quickAddProductRow !== null) {
      handleProductChange(quickAddProductRow, product.product_id);
    }
    onImportProducts?.(product);
    setQuickAddProductRow(null);
  };

  // Same idea for a new customer — this order only ever has one, so it's
  // applied straight to the form.
  const handleCustomerQuickAdded = (customer) => {
    setExtraCustomers(prev => [...prev, customer]);
    setForm(prev => ({ ...prev, customer_id: customer.customer_id }));
    onImportCustomers?.(customer);
  };

  const handleImportProducts = (data, mode) => {
    let header = null;
    let newItems = [];

    if (Array.isArray(data)) {
      newItems = data;
    } else if (data && typeof data === 'object') {
      header = data.header || null;
      newItems = data.items || [];
    }

    setForm(prev => {
      const updated = { ...prev };
      if (header) {
        if (header.order_date) updated.order_date = header.order_date;
        if (header.order_number) updated.order_number = header.order_number;
        if (header.customer_id) updated.customer_id = header.customer_id;
        if (header.process_type) updated.process_type = header.process_type;
      }
      if (mode === 'replace') {
        updated.items = newItems;
      } else {
        const existingFiltered = prev.items.filter(item => item.product_id || item.godown_id || item.quantity);
        updated.items = [...existingFiltered, ...newItems];
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => {
    return form.items.reduce((sum, item) => {
      const product = allProducts.find(p => p.product_id === item.product_id);
      return sum + (Number(item.unit_price) || 0) * getComputedQty(item, product);
    }, 0);
  }, [form.items, allProducts]);

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({ value: p.product_id, label: p.name }));
  }, [allProducts]);

  const activeGodowns = godowns.filter(g => g.is_active);

  return (
    <>
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
                    style={t.id === 'skip_delivered' ? { display: 'none' } : {}}
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
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
                    options={allCustomers.map(c => ({ value: c.customer_id, label: c.name }))}
                    placeholder="Select customer..." searchPlaceholder="Search customers..."
                    align="start" disabled={anyItemLocked}
                    onAddNew={anyItemLocked ? undefined : () => setCustomerQuickAddOpen(true)}
                    addNewLabel="+ Add New Customer" />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Products ({form.items.length})</label>
                {form.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic mb-2">No products added yet.</p>
                )}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1 border border-slate-200/80 rounded-xl p-3 bg-slate-50/50">
                  {form.items.map((item, i) => {
                    const itemLocked = isItemLocked(item.item_id);
                    const selectedProduct = allProducts.find(p => p.product_id === item.product_id);
                    const computedQty = getComputedQty(item, selectedProduct);
                    return (
                    <div key={i} className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 items-end">
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Product <span className="text-red-500">*</span></label>
                        <Dropdown value={item.product_id} onValueChange={(v) => handleProductChange(i, v)}
                          options={productOptions} placeholder="Select product..." searchPlaceholder="Search products..."
                          align="start" disabled={itemLocked}
                          onAddNew={itemLocked ? undefined : () => { setQuickAddProductRow(i); setProductQuickAddOpen(true); }}
                          addNewLabel="+ Add New Product" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Unit</label>
                        <select
                          value={getItemUnit(item, selectedProduct)}
                          onChange={(e) => handleUnitChange(i, e.target.value)}
                          disabled={itemLocked}
                          className="w-full h-9 text-sm px-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="bag">BAG</option>
                          <option value="kg">KG</option>
                        </select>
                      </div>
                      <div className="col-span-2">
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
                        <Input type="text" inputMode="decimal" placeholder="Qty"
                          value={getItemRawQty(item)} onChange={(e) => handleQtyChange(i, e.target.value)} disabled={itemLocked} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Order Qty</label>
                        <div className="h-9 flex items-center justify-center text-sm font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-100 rounded-md">
                          {computedQty || <span className="text-slate-300">—</span>}
                        </div>
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
                <div className="flex items-center gap-2 mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={anyItemLocked}
                    className="gap-1.5 text-xs font-medium">
                    <Plus size={14} /> Add Product
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalOpen(true)}
                    disabled={anyItemLocked}
                    className="gap-1.5 text-xs font-medium text-slate-600 hover:text-primary border-slate-200 hover:bg-slate-50"
                  >
                    <Upload size={14} /> Bulk Upload Products
                  </Button>
                </div>
              </div>

            </ModalBody>
            <ModalFooter>
              <div className="flex items-center gap-2 mr-auto">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyCustomer}
                    onChange={(e) => setNotifyCustomer(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                  <span>Notify Customer via WhatsApp</span>
                </label>
              </div>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : (isEditing ? 'Update Order' : 'Create Order')}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <BulkOrderProductsModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        user={user}
        products={allProducts}
        godowns={godowns}
        customers={allCustomers}
        onImportProducts={(product) => { setExtraProducts(prev => [...prev, product]); onImportProducts?.(product); }}
        onImportCustomers={(customer) => { setExtraCustomers(prev => [...prev, customer]); onImportCustomers?.(customer); }}
        onSuccess={() => {
          if (onSuccess) onSuccess();
          onClose();
        }}
      />

      <ProductModal
        isOpen={productQuickAddOpen}
        onClose={() => setProductQuickAddOpen(false)}
        onSuccess={handleProductQuickAdded}
        user={user}
        quickAdd
      />
      <CustomerModal
        isOpen={customerQuickAddOpen}
        onClose={() => setCustomerQuickAddOpen(false)}
        onSuccess={handleCustomerQuickAdded}
        user={user}
      />
    </>
  );
};

export default OrderModal;

