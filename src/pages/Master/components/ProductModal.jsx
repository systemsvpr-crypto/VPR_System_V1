import { useState, useEffect } from 'react';
import { Package, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createProduct, updateProduct } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const ProductModal = ({ isOpen, onClose, godowns, user, onSuccess, editingProduct }) => {
  const [form, setForm] = useState({
    name: '', unit: 'pcs', product_type: '', allow_negative_stock: false,
    as_of_date: new Date().toISOString().split('T')[0], entries: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingProduct;

  useEffect(() => {
    if (!isOpen) {
      setForm({ name: '', unit: 'pcs', product_type: '', allow_negative_stock: false, as_of_date: new Date().toISOString().split('T')[0], entries: [] });
    } else if (editingProduct) {
      setForm({
        name: editingProduct.name,
        unit: editingProduct.unit,
        product_type: editingProduct.product_type || '',
        allow_negative_stock: editingProduct.allow_negative_stock,
        as_of_date: new Date().toISOString().split('T')[0],
        entries: [],
      });
    }
  }, [isOpen, editingProduct]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Product name is required.'); return; }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateProduct({
          product_id: editingProduct.product_id,
          name: form.name.trim(),
          unit: form.unit,
          product_type: form.product_type.trim(),
          allow_negative_stock: form.allow_negative_stock,
        });
        toast.success('Product updated successfully');
      } else {
        await createProduct({
          name: form.name.trim(), unit: form.unit, product_type: form.product_type.trim(), allow_negative_stock: form.allow_negative_stock,
          openingEntries: form.entries, as_of_date: form.as_of_date, created_by: user?.user_id,
        });
        toast.success('Product created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const addEntry = () => {
    const availableGodowns = godowns.filter(g => g.is_active && !form.entries.find(e => e.godown_id === g.godown_id));
    if (availableGodowns.length === 0) { toast.error('No more godowns available.'); return; }
    setForm({ ...form, entries: [...form.entries, { godown_id: availableGodowns[0].godown_id, qty: '' }] });
  };

  const updateEntry = (index, field, value) => {
    const entries = [...form.entries]; entries[index][field] = value; setForm({ ...form, entries });
  };

  const removeEntry = (index) => {
    setForm({ ...form, entries: form.entries.filter((_, i) => i !== index) });
  };

  const activeGodowns = godowns.filter(g => g.is_active);

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><Package size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Product' : 'Add Product'}</h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter product name" />
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
                      {['pcs', 'kg', 'ltr', 'mtr', 'box', 'bag', 'pair'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">As of Date</label>
                  <DatePicker value={form.as_of_date} onChange={(e) => setForm({ ...form, as_of_date: e.target.value })} />
                </div>
              )}
            </div>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
              <div className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="allow_negative" checked={form.allow_negative_stock}
                  onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </div>
              <span className="text-sm text-slate-700 font-medium">Allow Negative Stock</span>
            </label>
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
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (isEditing ? 'Update Product' : 'Save Product')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ProductModal;
