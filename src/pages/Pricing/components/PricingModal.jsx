import { useState, useEffect } from 'react';
import { IndianRupee, Calendar, Layers, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPricingGroup, updatePricingGroup } from '../../../services/pricingService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const INITIAL_FORM_STATE = {
  group_name: '',
  second_last_purchase: '',
  last_purchase: '',
  rank_rates: {},
};

const toDateInputValue = (str) => {
  if (!str) return '';
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
  if (/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.test(s)) {
    const [, d, m, y] = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    return `${y}-${m}-${d}`;
  }
  return s;
};

const PricingModal = ({ isOpen, onClose, editingGroup, onSuccess, user, ranks = [] }) => {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const isEditing = Boolean(editingGroup);

  useEffect(() => {
    if (isOpen) {
      const initialRankRates = {};
      (ranks || []).forEach((r) => {
        const existing = editingGroup?.rank_rates?.[r.rank_name] ?? (
          r.rank_name === 'A' ? editingGroup?.a_rate :
          r.rank_name === 'B' ? editingGroup?.b_rate :
          r.rank_name === 'C' ? editingGroup?.c_rate : ''
        );
        initialRankRates[r.rank_name] = existing !== null && existing !== undefined ? String(existing) : '';
      });

      if (editingGroup) {
        setFormData({
          group_name: editingGroup.group_name || '',
          second_last_purchase: toDateInputValue(editingGroup.second_last_purchase),
          last_purchase: toDateInputValue(editingGroup.last_purchase),
          rank_rates: initialRankRates,
        });
      } else {
        setFormData({
          group_name: '',
          second_last_purchase: '',
          last_purchase: '',
          rank_rates: initialRankRates,
        });
      }
      setErrors({});
    }
  }, [isOpen, editingGroup, ranks]);

  const validate = () => {
    const newErrors = {};
    if (!formData.group_name?.trim()) {
      newErrors.group_name = 'Group Name is required';
    }

    (ranks || []).forEach((r) => {
      const val = formData.rank_rates?.[r.rank_name];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        if (isNaN(val) || Number(val) < 0) {
          newErrors[r.rank_name] = `Rate for ${r.rank_name} must be a valid positive number`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const cleanedRankRates = {};
      for (const [key, val] of Object.entries(formData.rank_rates || {})) {
        if (val !== '' && val !== null && val !== undefined) {
          cleanedRankRates[key] = String(val).trim();
        }
      }

      const payload = {
        group_name: formData.group_name,
        second_last_purchase: formData.second_last_purchase || null,
        last_purchase: formData.last_purchase || null,
        rank_rates: cleanedRankRates,
      };

      if (isEditing) {
        await updatePricingGroup(editingGroup.group_id, {
          ...payload,
          updated_by: user?.user_id,
        });
        toast.success(`Pricing for "${formData.group_name}" updated successfully!`);
      } else {
        await createPricingGroup({
          ...payload,
          created_by: user?.user_id,
        });
        toast.success(`Product group "${formData.group_name}" created successfully!`);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error saving pricing group:', err);
      toast.error(err.message || 'Failed to save product group pricing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-lg w-full">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <ModalHeader>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 border border-emerald-100">
              <IndianRupee size={20} />
            </div>
            <div>
              <ModalTitle className="text-base font-semibold text-slate-800">
                {isEditing ? 'Edit Group Rates & Pricing' : 'Add New Product Group'}
              </ModalTitle>
              <p className="text-xs text-slate-500">
                {isEditing ? 'Update group name, rank rates and purchase dates' : 'Create a new group and assign rank rates'}
              </p>
              <ModalDescription className="sr-only">
                Modal for managing product group pricing and rates
              </ModalDescription>
            </div>
          </ModalHeader>

          <ModalBody className="space-y-4">
            {/* Group Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Group Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Layers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  value={formData.group_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, group_name: e.target.value }))}
                  placeholder="e.g. Copper Tubes 1/2 Inch, PVC Fittings..."
                  className={`pl-8 text-xs h-9 ${errors.group_name ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
                />
              </div>
              {errors.group_name && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.group_name}
                </p>
              )}
            </div>

            {/* Rates Section */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-1.5 mb-3">
                <IndianRupee size={15} className="text-primary font-bold" />
                <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  Rank Rates (₹)
                </h4>
              </div>

              {ranks && ranks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ranks.map((r) => (
                    <div key={r.rank_id || r.rank_name}>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {r.rank_name} Rank Rate (₹)
                      </label>
                      <Input
                        type="text"
                        value={formData.rank_rates?.[r.rank_name] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setFormData((prev) => ({
                              ...prev,
                              rank_rates: {
                                ...(prev.rank_rates || {}),
                                [r.rank_name]: val,
                              },
                            }));
                          }
                        }}
                        placeholder="0.00"
                        className={`text-xs h-9 bg-white ${errors[r.rank_name] ? 'border-red-500' : ''}`}
                      />
                      {errors[r.rank_name] && (
                        <p className="text-[10px] text-red-500 mt-0.5">{errors[r.rank_name]}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No ranks defined in the ranks table.</p>
              )}
            </div>

            {/* Purchase Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Calendar size={13} className="text-slate-400" />
                  Last Purchase Date
                </label>
                <Input
                  type="date"
                  value={formData.last_purchase}
                  onChange={(e) => setFormData(prev => ({ ...prev, last_purchase: e.target.value }))}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Calendar size={13} className="text-slate-400" />
                  2nd Last Purchase Date
                </label>
                <Input
                  type="date"
                  value={formData.second_last_purchase}
                  onChange={(e) => setFormData(prev => ({ ...prev, second_last_purchase: e.target.value }))}
                  className="text-xs h-9"
                />
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="h-9 px-5 text-xs bg-primary hover:bg-primary/90 text-white font-medium"
            >
              {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default PricingModal;
