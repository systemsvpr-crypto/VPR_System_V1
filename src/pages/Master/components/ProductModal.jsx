import { useState, useEffect } from 'react';
import { Package, X, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createProduct, updateProduct, deleteProduct } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const ProductModal = ({ isOpen, onClose, godowns, user, onSuccess, editingProduct, onDelete }) => {
  const [form, setForm] = useState({
    brand_name: '', category: '', unit: 'bag', product_type: '', mux: '', allow_negative_stock: true,
    as_of_date: new Date().toISOString().split('T')[0], entries: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState('');

  const isEditing = !!editingProduct;
  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER ADMIN';

  const baseName = [form.brand_name, form.category, form.product_type]
    .map(v => v.trim())
    .filter(Boolean)
    .join(' ');
  const computedName = form.mux.trim() ? `${baseName} (${form.mux.trim()})` : baseName;

  useEffect(() => {
    if (!isOpen) {
      setForm({ brand_name: '', category: '', unit: 'bag', product_type: '', mux: '', allow_negative_stock: true, as_of_date: new Date().toISOString().split('T')[0], entries: [] });
      setDuplicateNotice('');
    } else if (editingProduct) {
      setForm({
        brand_name: editingProduct.brand_name || '',
        category: editingProduct.category || '',
        unit: editingProduct.unit,
        product_type: editingProduct.product_type || '',
        mux: editingProduct.mux || '',
        allow_negative_stock: editingProduct.allow_negative_stock,
        as_of_date: new Date().toISOString().split('T')[0],
        entries: [],
      });
      setDuplicateNotice('');
    }
  }, [isOpen, editingProduct]);

  // Once flagged as a duplicate, clear the notice as soon as the user changes any of the
  // 4 identity fields — it becomes stale the moment they start correcting it.
  useEffect(() => {
    setDuplicateNotice('');
  }, [form.brand_name, form.category, form.product_type, form.mux]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand_name.trim()) { toast.error('Brand name is required.'); return; }
    if (!form.category.trim()) { toast.error('Category is required.'); return; }
    setDuplicateNotice('');
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateProduct({
          product_id: editingProduct.product_id,
          name: computedName,
          unit: form.unit,
          product_type: form.product_type.trim(),
          brand_name: form.brand_name.trim(),
          category: form.category.trim(),
          mux: form.mux.trim(),
          allow_negative_stock: form.allow_negative_stock,
        });
        toast.success('Product updated successfully');
      } else {
        await createProduct({
          name: computedName, unit: form.unit, product_type: form.product_type.trim(),
          brand_name: form.brand_name.trim(), category: form.category.trim(), mux: form.mux.trim(),
          allow_negative_stock: form.allow_negative_stock,
          openingEntries: form.entries, as_of_date: form.as_of_date, created_by: user?.user_id,
        });
        toast.success('Product created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) {
      if (err.code === 'DUPLICATE_PRODUCT') {
        setDuplicateNotice(err.message);
      } else {
        toast.error(err.message);
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete product "${editingProduct?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteProduct(editingProduct.product_id);
      toast.success('Product deleted successfully');
      onClose();
      onSuccess();
      if (onDelete) onDelete();
    } catch (err) { toast.error(err.message); }
    setDeleting(false);
  };

  // Only real (Own) godowns can carry opening stock — Transporter-type godowns
  // are just stock-tracking placeholders, not physical storage locations.
  const activeGodowns = godowns.filter(g => g.is_active && (g.godown_type || 'Own') === 'Own');

  const addEntry = () => {
    const availableGodowns = activeGodowns.filter(g => !form.entries.find(e => e.godown_id === g.godown_id));
    if (availableGodowns.length === 0) { toast.error('No more godowns available.'); return; }
    setForm({ ...form, entries: [...form.entries, { godown_id: availableGodowns[0].godown_id, qty: '' }] });
  };

  const updateEntry = (index, field, value) => {
    const entries = [...form.entries]; entries[index][field] = value; setForm({ ...form, entries });
  };

  const removeEntry = (index) => {
    setForm({ ...form, entries: form.entries.filter((_, i) => i !== index) });
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><Package size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Product' : 'Add Product'}</h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Brand Name <span className="text-red-500">*</span></label>
                <Input value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} placeholder="Ex: Ambuja" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Cement" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Type</label>
              <Input value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} placeholder="Ex: 10*12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Unit</SelectLabel>
                      {['kg', 'bag'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mux (Weight)</label>
                <Input value={form.mux} onChange={(e) => setForm({ ...form, mux: e.target.value })} placeholder="Ex: 32 Kg" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
              <Input value={computedName} disabled readOnly placeholder="Auto-generated from Brand + Category + Type + Mux" className="bg-slate-50 text-slate-500" />
            </div>
            {duplicateNotice && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{duplicateNotice}</span>
              </div>
            )}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">As of Date</label>
                <DatePicker value={form.as_of_date} onChange={(e) => setForm({ ...form, as_of_date: e.target.value })} />
              </div>
            )}

            {!isEditing && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-700">Opening Stock (per Godown)</label>
                  <button type="button" onClick={addEntry} className="text-xs text-primary hover:underline font-medium">+ Add Godown</button>
                </div>
                {form.entries.length === 0 && <p className="text-xs text-slate-400 italic">No opening stock entries.</p>}
                <div className="space-y-2">
                  {form.entries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={entry.godown_id} onValueChange={(v) => updateEntry(i, 'godown_id', v)}>
                        <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Godown</SelectLabel>
                            {activeGodowns.map(g => (
                              <SelectItem key={g.godown_id} value={g.godown_id}
                                disabled={form.entries.some((e, j) => e.godown_id === g.godown_id && j !== i)}
                              >{g.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Input type="number" step="1" min="0" placeholder="Qty" className="w-28"
                        value={entry.qty} onChange={(e) => updateEntry(i, 'qty', e.target.value.replace(/\D/g, ''))} />
                      <button type="button" onClick={() => removeEntry(i)} className="p-1 text-red-400 hover:text-red-600">
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {isEditing && isSuperAdmin && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} className="mr-auto">
                <Trash2 size={16} className="mr-1" />
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (isEditing ? 'Update Product' : 'Save Product')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ProductModal;
