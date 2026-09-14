import { useState, useEffect, useMemo } from 'react';
import { Zap, X, Plus, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { createDirectOrder, generateNextOrderNumber, convertQtyToMasterUnit, convertQtyFromMasterUnit } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import BulkOrderProductsModal from './BulkOrderProductsModal';
import ProductModal from '../../Master/components/ProductModal';
import CustomerModal from '../../Master/components/CustomerModal';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';

// Dispatch Planning's "Direct" button — a Create Order-style popup that also
// auto-plans every item's dispatch on save (see createDirectOrder), so a
// direct order goes straight from entry to a planned dispatch (dispatch_plans
// + the stock-ledger transaction) in one step instead of two separate trips
// (Orders' Create Order, then Dispatch Planning's Dispatch). Create-only —
// unlike OrderModal there's no editingOrder/locked-items support, since a
// direct order's items are typically already planned the moment they exist.
const DirectOrderModal = ({ isOpen, onClose, user, onSuccess, products, godowns, customers, onImportProducts, onImportCustomers }) => {
  const [form, setForm] = useState({
    order_date: new Date().toISOString().split('T')[0],
    order_number: '',
    customer_id: '',
    items: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

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

  useEffect(() => {
    if (!isOpen) {
      setForm({
        order_date: new Date().toISOString().split('T')[0],
        order_number: '',
        customer_id: '',
        items: [],
      });
      setExtraProducts([]);
      setExtraCustomers([]);
      setQuickAddProductRow(null);
    } else {
      setForm(prev => ({
        ...prev,
        items: [{ product_id: '', godown_id: '', unit_price: '', Selected_Unit: '', sales_qty: '' }],
      }));
      generateNextOrderNumber().then(num => {
        setForm(prev => ({ ...prev, order_number: num }));
      }).catch(() => {});
    }
  }, [isOpen]);

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
      const { planErrors } = await createDirectOrder({
        order_date: form.order_date,
        order_number: form.order_number.trim(),
        customer_id: form.customer_id,
        items: payloadItems,
        created_by: user?.user_id,
        // Direct orders never send an automatic WhatsApp confirmation — this
        // popup has no Notify Customer option on purpose.
        notify_customer: false,
      });
      if (planErrors.length > 0) {
        toast.error(`Order created, but ${planErrors.length} item(s) could not be auto-dispatched (${planErrors[0].message}). They remain pending in Dispatch Planning.`);
      } else {
        toast.success('Direct order created and dispatched.');
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

  // Unit defaults to the product's master unit — always a real value, never
  // '' (which would leave the <select> showing the browser's own first-option
  // default out of sync with state, so switching Unit before a product is
  // picked would silently no-op).
  const getItemUnit = (item, product) => item.Selected_Unit || (product?.unit || '').toLowerCase() || 'bag';
  const getItemRawQty = (item) => (item.sales_qty !== undefined && item.sales_qty !== null ? String(item.sales_qty) : '');

  // Order Qty is auto-calculated from the Unit + Qty inputs, converted into
  // the product's master unit via that product's Pkg/Bag (Mux) figure —
  // this is what actually gets saved as quantity (the value that drives the
  // rest of the sales/dispatch pipeline, and what gets deducted from stock).
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

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({ value: p.product_id, label: p.name }));
  }, [allProducts]);

  // Own godowns first (a direct dispatch normally leaves from one of these),
  // then Transporter stock-tracking godowns below — each group alphabetical.
  // Same convention as Dispatch Planning's own Godown dropdown.
  const activeGodowns = useMemo(() => {
    const active = godowns.filter(g => g.is_active);
    const isOwn = (g) => (g.godown_type || 'Own') === 'Own';
    const byName = (a, b) => a.name.localeCompare(b.name);
    const own = active.filter(isOwn).sort(byName);
    const transporter = active.filter(g => !isOwn(g)).sort(byName);
    return [...own, ...transporter];
  }, [godowns]);

  return (
    <>
      <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <ModalContent className="max-w-4xl">
          <ModalHeader>
            <div className="flex items-center justify-between w-full pr-12">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Zap size={20} className="text-primary" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Direct Order</h2>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                <Zap size={13} /> Auto-dispatched on save
              </span>
            </div>
          </ModalHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Order Date <span className="text-red-500">*</span></label>
                  <DatePicker value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Order Number <span className="text-red-500">*</span></label>
                  <Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} placeholder="e.g. VPR/OR-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                  <Dropdown value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}
                    options={allCustomers.map(c => ({ value: c.customer_id, label: c.name }))}
                    placeholder="Select customer..." searchPlaceholder="Search customers..."
                    align="start"
                    onAddNew={() => setCustomerQuickAddOpen(true)}
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
                    const selectedProduct = allProducts.find(p => p.product_id === item.product_id);
                    const computedQty = getComputedQty(item, selectedProduct);
                    return (
                    <div key={i} className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 items-end">
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Product <span className="text-red-500">*</span></label>
                        <Dropdown value={item.product_id} onValueChange={(v) => handleProductChange(i, v)}
                          options={productOptions} placeholder="Select product..." searchPlaceholder="Search products..."
                          align="start"
                          onAddNew={() => { setQuickAddProductRow(i); setProductQuickAddOpen(true); }}
                          addNewLabel="+ Add New Product" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Unit</label>
                        <select
                          value={getItemUnit(item, selectedProduct)}
                          onChange={(e) => handleUnitChange(i, e.target.value)}
                          className="w-full h-9 text-sm px-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                          align="start" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Unit Price</label>
                        <Input type="number" step="0.01" min="0" placeholder="0.00"
                          value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Qty <span className="text-red-500">*</span></label>
                        <Input type="text" inputMode="decimal" placeholder="Qty"
                          value={getItemRawQty(item)} onChange={(e) => handleQtyChange(i, e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Order Qty</label>
                        <div className="h-9 flex items-center justify-center text-sm font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-100 rounded-md">
                          {computedQty || <span className="text-slate-300">—</span>}
                        </div>
                      </div>
                      <div className="col-span-1 flex items-end pb-0.5">
                        <button type="button" onClick={() => removeItem(i)}
                          className="p-1.5 rounded transition-all text-red-400 hover:text-red-600 hover:bg-red-50">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={addItem}
                    className="gap-1.5 text-xs font-medium">
                    <Plus size={14} /> Add Product
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalOpen(true)}
                    className="gap-1.5 text-xs font-medium text-slate-600 hover:text-primary border-slate-200 hover:bg-slate-50"
                  >
                    <Upload size={14} /> Bulk Upload Products
                  </Button>
                </div>
              </div>

            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Direct Order'}
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
        processType="direct"
        autoPlanDispatch
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

export default DirectOrderModal;
