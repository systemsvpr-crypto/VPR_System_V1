import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, X, Plus, ArrowRightLeft, Zap, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { createIndent, updateIndent, generateNextIndentNumber } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/textarea';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import BulkIndentProductsModal from './BulkIndentProductsModal';

const IndentModal = ({ isOpen, onClose, user, onSuccess, editingIndent, products, godowns, vendors }) => {
  const [form, setForm] = useState({
    indent_date: new Date().toISOString().split('T')[0],
    indent_number: '',
    godown_id: '',
    vendor_id: '',
    remarks: '',
    items: [],
    process_type: 'process',
  });
  const [submitting, setSubmitting] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

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
        process_type: 'process',
      });
    } else if (editingIndent) {
      setForm({
        indent_date: editingIndent.indent_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        indent_number: editingIndent.indent_number || '',
        godown_id: editingIndent.godown_id || '',
        vendor_id: editingIndent.vendor_id || '',
        remarks: editingIndent.remarks || '',
        process_type: editingIndent.process_type || 'process',
        items: (editingIndent.purchase_indent_items || []).map(item => ({
          item_id: item.item_id,
          product_id: item.product_id,
          quantity: String(item.quantity),
          rate: String(item.rate),
        })),
      });
    } else {
      setForm(prev => ({
        ...prev,
        items: [{ product_id: '', quantity: '', rate: '' }],
      }));
      generateNextIndentNumber().then(num => {
        setForm(prev => ({ ...prev, indent_number: num }));
      }).catch(() => {});
    }
  }, [isOpen, editingIndent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.indent_number.trim()) { toast.error('Indent number is required.'); return; }
    if (!form.godown_id) { toast.error('Please select a godown.'); return; }
    if (!form.vendor_id) { toast.error('Please select a vendor.'); return; }
    if (form.items.length === 0) { toast.error('Add at least one product.'); return; }
    for (const [i, item] of form.items.entries()) {
      if (!item.product_id) { toast.error(`Item ${i + 1}: Select a product.`); return; }
      if (!Number(item.quantity) || Number(item.quantity) <= 0) { toast.error(`Item ${i + 1}: Enter a valid quantity.`); return; }
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateIndent(editingIndent.indent_id, {
          indent_date: form.indent_date,
          indent_number: form.indent_number.trim(),
          godown_id: form.godown_id,
          vendor_id: form.vendor_id,
          remarks: form.remarks.trim(),
          items: form.items,
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
          items: form.items,
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
    setForm({ ...form, items: [...form.items, { product_id: '', quantity: '', rate: '' }] });
  };

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index][field] = value;
    setForm({ ...form, items });
  };

  const removeItem = (index) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
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
    return form.items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);
  }, [form.items]);

  const productOptions = useMemo(() => {
    return products.map(p => ({ value: p.product_id, label: p.name }));
  }, [products]);

  // Only real (Own) godowns are valid delivery destinations for an indent —
  // Transporter-type godowns are just stock-tracking placeholders.
  const activeGodowns = useMemo(() => godowns.filter(g => g.is_active && (g.godown_type || 'Own') === 'Own'), [godowns]);

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
                  { id: 'process', label: 'Process', icon: ArrowRightLeft },
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Indent Date <span className="text-red-500">*</span></label>
                  <DatePicker value={form.indent_date} onChange={(e) => setForm({ ...form, indent_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Indent Number <span className="text-red-500">*</span></label>
                  <Input value={form.indent_number} onChange={(e) => setForm({ ...form, indent_number: e.target.value })} placeholder="e.g. VPR/IN-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Godown <span className="text-red-500">*</span></label>
                  <Dropdown value={form.godown_id} onValueChange={(v) => setForm({ ...form, godown_id: v })}
                    options={activeGodowns.map(g => ({ value: g.godown_id, label: g.name }))}
                    placeholder="Select godown..." searchPlaceholder="Search godowns..." align="start" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vendor <span className="text-red-500">*</span></label>
                  <Dropdown value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}
                    options={vendors.map(c => ({ value: c.vendor_id, label: c.name }))}
                    placeholder="Select vendor..." searchPlaceholder="Search vendors..." align="start" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                  <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    placeholder="Optional remarks..." className="min-h-[38px]" />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Products ({form.items.length})</label>
                {form.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic mb-2">No products added yet.</p>
                )}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1 border border-slate-200/80 rounded-xl p-3 bg-slate-50/50">
                  {form.items.map((item, i) => {
                    const selectedProduct = products.find(p => p.product_id === item.product_id);
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Product <span className="text-red-500">*</span></label>
                          <Dropdown value={item.product_id} onValueChange={(v) => updateItem(i, 'product_id', v)}
                            options={productOptions} placeholder="Select product..." searchPlaceholder="Search products..."
                            align="start" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">UoM</label>
                          <Input value={selectedProduct?.unit || ''} readOnly placeholder="-" className="bg-slate-100/70 text-slate-600 cursor-not-allowed" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Rate</label>
                          <Input type="number" step="0.01" min="0" placeholder="0.00"
                            value={item.rate} onChange={(e) => updateItem(i, 'rate', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Qty <span className="text-red-500">*</span></label>
                          <Input type="number" step="1" min="1" placeholder="1"
                            value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value.replace(/\D/g, ''))} />
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
        products={products}
        godowns={godowns}
        vendors={vendors}
        onSuccess={() => {
          if (onSuccess) onSuccess();
          onClose();
        }}
      />
    </>
  );
};

export default IndentModal;

