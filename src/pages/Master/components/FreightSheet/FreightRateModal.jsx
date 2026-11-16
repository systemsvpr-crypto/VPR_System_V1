import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createFreightRate, updateFreightRate } from '@/services/transporterService';

const FreightRateModal = ({ isOpen, onClose, onSuccess, transporters, editingRate }) => {
  const [form, setForm] = useState({
    transporter_id: '', city: '', rate_with_gst: '', rate_without_gst: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingRate) {
      setForm({
        transporter_id: editingRate.transporter_id || '',
        city: editingRate.city || '',
        rate_with_gst: editingRate.rate_with_gst ?? '',
        rate_without_gst: editingRate.rate_without_gst ?? '',
      });
    } else {
      setForm({ transporter_id: '', city: '', rate_with_gst: '', rate_without_gst: '' });
    }
  }, [editingRate, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!form.transporter_id) return toast.error('Select a transporter');
    if (!form.city.trim()) return toast.error('City / Location is required');
    if (form.rate_with_gst === '' || form.rate_without_gst === '') return toast.error('Both freight rates are required');
    setSaving(true);
    try {
      if (editingRate) {
        await updateFreightRate({
          rate_id: editingRate.rate_id,
          city: form.city,
          rate_with_gst: parseFloat(form.rate_with_gst),
          rate_without_gst: parseFloat(form.rate_without_gst),
        });
        toast.success('Rate updated');
      } else {
        await createFreightRate({
          transporter_id: form.transporter_id,
          city: form.city,
          rate_with_gst: parseFloat(form.rate_with_gst),
          rate_without_gst: parseFloat(form.rate_without_gst),
        });
        toast.success('Rate added');
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save rate');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            {editingRate ? 'Edit Freight Rate' : 'Add Freight Rate'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Transporter */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Transport Name *</label>
            <select
              className="w-full border border-slate-200 rounded-md h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.transporter_id}
              onChange={e => setForm(f => ({ ...f, transporter_id: e.target.value }))}
              disabled={!!editingRate}
            >
              <option value="">Select transporter...</option>
              {(transporters || []).map(t => (
                <option key={t.transporter_id} value={t.transporter_id}>{t.name}</option>
              ))}
            </select>
            {!!editingRate && (
              <p className="text-xs text-slate-400 mt-1">Transport cannot be changed after creation</p>
            )}
          </div>

          {/* City */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">City / Location *</label>
            <Input
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Delhi"
            />
          </div>

          {/* Rates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Rate With GST (₹/KG) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.rate_with_gst}
                onChange={e => setForm(f => ({ ...f, rate_with_gst: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Rate Without GST (₹/KG) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.rate_without_gst}
                onChange={e => setForm(f => ({ ...f, rate_without_gst: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingRate ? 'Update Rate' : 'Add Rate'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FreightRateModal;
