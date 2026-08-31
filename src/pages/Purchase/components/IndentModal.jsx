import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, X, Plus, ArrowRightLeft, Zap, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { createIndent, updateIndent, generateNextIndentNumber, getPackagingSize } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import BulkIndentProductsModal from './BulkIndentProductsModal';
import ProductModal from '../../Master/components/ProductModal';
import VendorModal from '../../Master/components/VendorModal';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';

// Bag <-> Kg conversion. Qty is entered in whichever unit the row's Unit
// dropdown is set to (`fromUnit`, defaulting to the product's master unit)
// — whichever of Bag/Kg matches that entry unit just mirrors Qty as-is, the
// other (Indent Qty) is derived via this row's own Pkg/Bag (Mux) figure.
const convertQty = (qty, fromUnit, targetUnit, pkgSize) => {
  const amount = Number(qty) || 0;
  const mux = Number(pkgSize) || 0;
  const from = (fromUnit || '').toLowerCase();
  const target = (targetUnit || from).toLowerCase();
  if (!from || target === from) return amount;
  if (from === 'bag' && target === 'kg') return mux > 0 ? amount * mux : amount;
  if (from === 'kg' && target === 'bag') return mux > 0 ? amount / mux : amount;
  return amount;
};

const IndentModal = ({ isOpen, onClose, user, onSuccess, editingIndent, products, godowns, vendors, onImportProducts, onImportVendors }) => {
  const [form, setForm] = useState({
    indent_date: new Date().toISOString().split('T')[0],
    indent_number: '',
    godown_id: '',
    vendor_id: '',
    remarks: '',
    items: [],
    process_type: 'direct',
  });
  const [submitting, setSubmitting] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Products/vendors created on the fly (via the "+ Add New Product/Vendor"
  // row pinned inside their dropdowns) — kept alongside the lists loaded
  // from the parent so a just-created record is immediately selectable here
  // without waiting for a full page reload.
  const [extraProducts, setExtraProducts] = useState([]);
  const [extraVendors, setExtraVendors] = useState([]);
  const [productQuickAddOpen, setProductQuickAddOpen] = useState(false);
  const [vendorQuickAddOpen, setVendorQuickAddOpen] = useState(false);
  const [quickAddProductRow, setQuickAddProductRow] = useState(null); // items index that asked for a new product

  // De-duplicated by id — see BulkIndentProductsModal for why this matters:
  // once the parent syncs its own list back down as an updated prop, the same
  // record could otherwise arrive from both sources and show twice.
  const allProducts = useMemo(() => {
    const map = new Map();
    [...products, ...extraProducts].forEach(p => map.set(p.product_id, p));
    return Array.from(map.values());
  }, [products, extraProducts]);

  const allVendors = useMemo(() => {
    const map = new Map();
    [...vendors, ...extraVendors].forEach(v => map.set(v.vendor_id, v));
    return Array.from(map.values());
  }, [vendors, extraVendors]);

  const isEditing = !!editingIndent;

  useEffect(() => {
    if (!isOpen) {
      setForm({
        indent_date: new Date().toISOString().split('T')[0],
        indent_number: '',
        godown_id: '',
        vendor_id: '',
        remarks: '',
        items: [],
        process_type: 'direct',
      });
      setExtraProducts([]);
      setExtraVendors([]);
      setQuickAddProductRow(null);
    } else if (editingIndent) {
      setForm({
        indent_date: editingIndent.indent_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        indent_number: editingIndent.indent_number || '',
        godown_id: editingIndent.godown_id || '',
        vendor_id: editingIndent.vendor_id || '',
        remarks: editingIndent.remarks || '',
        process_type: editingIndent.process_type || 'direct',
        items: (editingIndent.purchase_indent_items || []).map(item => ({
          item_id: item.item_id,
          product_id: item.product_id,
          quantity: String(item.quantity),
          rate: String(item.rate),
          // Unit defaults to the product's master unit; Qty (raw, as typed
          // in that unit) defaults to whatever was saved before, falling
          // back to the item's current quantity for rows that predate this
          // feature.
          direct_indent_unit: item.direct_indent_unit || (item.products?.unit || '').toLowerCase(),
          direct_indent_qty: item.direct_indent_qty != null ? String(item.direct_indent_qty) : String(item.quantity),
        })),
      });
    } else {
      setForm(prev => ({
        ...prev,
        items: [{ product_id: '', quantity: '', rate: '', direct_indent_unit: '', direct_indent_qty: '' }],
      }));
      generateNextIndentNumber().then(num => {
        setForm(prev => ({ ...prev, indent_number: num }));
      }).catch(() => {});
    }
  }, [isOpen, editingIndent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.indent_number.trim()) { toast.error('Indent number is required.'); return; }
    // Godown and Vendor are optional here — either can be decided later,
    // per item, on Vendor Approval instead of upfront at indent creation.
    if (form.items.length === 0) { toast.error('Add at least one product.'); return; }
    for (const [i, item] of form.items.entries()) {
      if (!item.product_id) { toast.error(`Item ${i + 1}: Select a product.`); return; }
      const product = allProducts.find(p => p.product_id === item.product_id);
      if (!getComputedQty(item, product)) { toast.error(`Item ${i + 1}: Enter a valid quantity.`); return; }
    }
    // Indent Qty (quantity) is always the product's real master-unit
    // figure, converted from whichever Unit + Qty the row was actually
    // entered in — see getComputedQty. direct_indent_unit/direct_indent_qty
    // are kept alongside purely as a record of that raw entry.
    const payloadItems = form.items.map(item => {
      const product = allProducts.find(p => p.product_id === item.product_id);
      const rawQty = getItemRawQty(item);
      return {
        ...item,
        quantity: getComputedQty(item, product),
        direct_indent_unit: getItemUnit(item, product),
        direct_indent_qty: rawQty === '' ? null : Number(rawQty),
      };
    });
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateIndent(editingIndent.indent_id, {
          indent_date: form.indent_date,
          indent_number: form.indent_number.trim(),
          godown_id: form.godown_id,
          vendor_id: form.vendor_id,
          remarks: form.remarks.trim(),
          items: payloadItems,
          process_type: form.process_type,
          user_id: user?.user_id,
        });
        toast.success('Indent updated successfully');
      } else {
        await createIndent({
          indent_date: form.indent_date,
          indent_number: form.indent_number.trim(),
          godown_id: form.godown_id,
          vendor_id: form.vendor_id,
          remarks: form.remarks.trim(),
          items: payloadItems,
          created_by: user?.user_id,
          process_type: form.process_type,
        });
        toast.success('Indent created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { product_id: '', quantity: '', rate: '', direct_indent_unit: '', direct_indent_qty: '' }] });
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
  // rows, which only ever set quantity directly in the master unit).
  const getItemUnit = (item, product) => item.direct_indent_unit || (product?.unit || '').toLowerCase();
  const getItemRawQty = (item) =>
    item.direct_indent_qty !== undefined && item.direct_indent_qty !== null && item.direct_indent_qty !== ''
      ? String(item.direct_indent_qty)
      : String(item.quantity ?? '');

  // Indent Qty is auto-calculated from the Unit + Qty inputs, converted into
  // the product's master unit via that product's Pkg/Bag (Mux) figure —
  // this is what actually gets saved as quantity (the value that drives the
  // rest of the purchase pipeline).
  const getComputedQty = (item, product) => {
    const raw = getItemRawQty(item);
    if (raw === '') return 0;
    const masterUnit = (product?.unit || '').toLowerCase();
    const unit = getItemUnit(item, product);
    return roundQty(convertQty(raw, unit, masterUnit, getPackagingSize(product)));
  };

  const handleProductChange = (index, productId) => {
    const product = allProducts.find(p => p.product_id === productId);
    const items = [...form.items];
    items[index] = { ...items[index], product_id: productId, direct_indent_unit: (product?.unit || '').toLowerCase() };
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
    const requantified = convertQty(currentQty, currentUnit, newUnit, getPackagingSize(product));
    const items = [...form.items];
    items[index] = { ...item, direct_indent_unit: newUnit, direct_indent_qty: requantified ? String(roundQty(requantified)) : '' };
    setForm({ ...form, items });
  };

  const handleQtyChange = (index, value) => {
    const items = [...form.items];
    items[index] = { ...items[index], direct_indent_qty: sanitizeQtyInput(value) };
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

  // Same idea for a new vendor — this indent only ever has one, so it's
  // applied straight to the form.
  const handleVendorQuickAdded = (vendor) => {
    setExtraVendors(prev => [...prev, vendor]);
    setForm(prev => ({ ...prev, vendor_id: vendor.vendor_id }));
    onImportVendors?.(vendor);
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
        if (header.indent_date) updated.indent_date = header.indent_date;
        if (header.indent_number) updated.indent_number = header.indent_number;
        if (header.godown_id) updated.godown_id = header.godown_id;
        if (header.vendor_id) updated.vendor_id = header.vendor_id;
        if (header.remarks !== undefined && header.remarks !== '') updated.remarks = header.remarks;
        if (header.process_type) updated.process_type = header.process_type;
      }
      if (mode === 'replace') {
        updated.items = newItems;
      } else {
        const existingFiltered = prev.items.filter(item => item.product_id || item.quantity);
        updated.items = [...existingFiltered, ...newItems];
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => {
    return form.items.reduce((sum, item) => {
      const product = allProducts.find(p => p.product_id === item.product_id);
      return sum + (Number(item.rate) || 0) * getComputedQty(item, product);
    }, 0);
  }, [form.items, allProducts]);

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({ value: p.product_id, label: p.name }));
  }, [allProducts]);

  // Only real (Own) godowns are valid delivery destinations for an indent —
  // Transporter-type godowns are just stock-tracking placeholders.
  const godownOptions = useMemo(() => {
    return godowns
      .filter(g => g.is_active && (g.godown_type || 'Own') === 'Own')
      .map(g => ({ value: g.godown_id, label: g.name }));
  }, [godowns]);

  const vendorOptions = useMemo(() => {
    return allVendors.map(v => ({ value: v.vendor_id, label: v.name }));
  }, [allVendors]);

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
                  {isEditing ? 'Edit Indent' : 'Create Indent'}
                </h2>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                {[
                  { id: 'direct', label: 'Direct', icon: Zap },
                ].map(t => (
                  <button key={t.id} type="button" onClick={() => setForm({ ...form, process_type: t.id })}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      form.process_type === t.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}>
                    <t.icon size={13} />{t.label}
                  </button>
                ))}
              </div>
            </div>
          </ModalHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Indent Date <span className="text-red-500">*</span></label>
                  <DatePicker value={form.indent_date} onChange={(e) => setForm({ ...form, indent_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Indent Number <span className="text-red-500">*</span></label>
                  <Input value={form.indent_number} onChange={(e) => setForm({ ...form, indent_number: e.target.value })} placeholder="e.g. VPR/IN-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Godown <span className="text-slate-400 font-normal">(optional)</span></label>
                  <Dropdown value={form.godown_id} onValueChange={(v) => setForm({ ...form, godown_id: v })}
                    options={godownOptions} placeholder="Decide later..." searchPlaceholder="Search godowns..." align="start" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name <span className="text-slate-400 font-normal">(optional)</span></label>
                  <Dropdown value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}
                    options={vendorOptions} placeholder="Decide later..." searchPlaceholder="Search vendors..." align="start"
                    onAddNew={() => setVendorQuickAddOpen(true)} addNewLabel="+ Add New Vendor" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                  <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks..." />
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
                      <div key={i} className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-2 items-end">
                        <div className="col-span-4">
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
                          <label className="block text-xs font-medium text-slate-500 mb-1">Rate</label>
                          <Input type="number" step="0.01" min="0" placeholder="0.00"
                            value={item.rate} onChange={(e) => updateItem(i, 'rate', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Qty <span className="text-red-500">*</span></label>
                          <Input type="text" inputMode="decimal" placeholder="Qty"
                            value={getItemRawQty(item)} onChange={(e) => handleQtyChange(i, e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Indent Qty</label>
                          <div className="h-9 flex items-center justify-center text-sm font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-100 rounded-md">
                            {computedQty || <span className="text-slate-300">—</span>}
                          </div>
                        </div>
                        <div className="col-span-1 flex items-end pb-0.5">
                          <button type="button" onClick={() => removeItem(i)}
                            className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={addItem}
                    className="mt-2 gap-1.5 text-xs font-medium">
                    <Plus size={14} /> Add Product
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalOpen(true)}
                    className="mt-2 gap-1.5 text-xs font-medium text-slate-600 hover:text-primary border-slate-200 hover:bg-slate-50"
                  >
                    <Upload size={14} /> Bulk Upload Products
                  </Button>
                </div>
              </div>

              {totalAmount > 0 && (
                <div className="mt-3 text-right text-sm font-medium text-slate-700">
                  Total Amount: ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : (isEditing ? 'Update Indent' : 'Create Indent')}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <BulkIndentProductsModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        user={user}
        products={allProducts}
        godowns={godowns}
        vendors={allVendors}
        onImportProducts={(product) => { setExtraProducts(prev => [...prev, product]); onImportProducts?.(product); }}
        onImportVendors={(vendor) => { setExtraVendors(prev => [...prev, vendor]); onImportVendors?.(vendor); }}
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
      <VendorModal
        isOpen={vendorQuickAddOpen}
        onClose={() => setVendorQuickAddOpen(false)}
        onSuccess={handleVendorQuickAdded}
        user={user}
      />
    </>
  );
};

export default IndentModal;

