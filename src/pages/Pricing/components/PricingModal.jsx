import { useState, useEffect } from 'react';
import { IndianRupee, Calendar, Layers, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPricingGroup, updatePricingGroup } from '../../../services/pricingService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const INITIAL_FORM_STATE = {
  group_name: '',
  a_rate: '',
  b_rate: '',
  c_rate: '',
  second_last_purchase: '',
  last_purchase: '',
};

const PricingModal = ({ isOpen, onClose, editingGroup, onSuccess, user }) => {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const isEditing = Boolean(editingGroup);

  useEffect(() => {
    if (isOpen) {
      if (editingGroup) {
        setFormData({
          group_name: editingGroup.group_name || '',
          a_rate: editingGroup.a_rate !== null && editingGroup.a_rate !== undefined ? editingGroup.a_rate : '',
          b_rate: editingGroup.b_rate !== null && editingGroup.b_rate !== undefined ? editingGroup.b_rate : '',
          c_rate: editingGroup.c_rate !== null && editingGroup.c_rate !== undefined ? editingGroup.c_rate : '',
          second_last_purchase: editingGroup.second_last_purchase || '',
          last_purchase: editingGroup.last_purchase || '',
        });
      } else {
        setFormData(INITIAL_FORM_STATE);
      }
      setErrors({});
    }
  }, [isOpen, editingGroup]);

  const validate = () => {
    const newErrors = {};
    if (!formData.group_name?.trim()) {
      newErrors.group_name = 'Group Name is required';
    }

    if (formData.a_rate !== '' && (isNaN(formData.a_rate) || Number(formData.a_rate) < 0)) {
      newErrors.a_rate = 'Rate A must be a valid positive number';
    }
    if (formData.b_rate !== '' && (isNaN(formData.b_rate) || Number(formData.b_rate) < 0)) {
      newErrors.b_rate = 'Rate B must be a valid positive number';
    }
    if (formData.c_rate !== '' && (isNaN(formData.c_rate) || Number(formData.c_rate) < 0)) {
      newErrors.c_rate = 'Rate C must be a valid positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEditing) {
        await updatePricingGroup(editingGroup.group_id, {
          ...formData,
          updated_by: user?.user_id,
        });
        toast.success(`Pricing for "${formData.group_name}" updated successfully!`);
      } else {
        await createPricingGroup({
          ...formData,
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
                {isEditing ? 'Update group name, tier rates (A, B, C) and purchase dates' : 'Create a new group and assign base tier rates'}
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
                  Tier Rates (₹)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Rate A */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Rate A (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.a_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, a_rate: e.target.value }))}
                    placeholder="0.00"
                    className={`text-xs h-9 bg-white ${errors.a_rate ? 'border-red-500' : ''}`}
                  />
                  {errors.a_rate && <p className="text-[10px] text-red-500 mt-0.5">{errors.a_rate}</p>}
                </div>

                {/* Rate B */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Rate B (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.b_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, b_rate: e.target.value }))}
                    placeholder="0.00"
                    className={`text-xs h-9 bg-white ${errors.b_rate ? 'border-red-500' : ''}`}
                  />
                  {errors.b_rate && <p className="text-[10px] text-red-500 mt-0.5">{errors.b_rate}</p>}
                </div>

                {/* Rate C */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Rate C (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.c_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, c_rate: e.target.value }))}
                    placeholder="0.00"
                    className={`text-xs h-9 bg-white ${errors.c_rate ? 'border-red-500' : ''}`}
                  />
                  {errors.c_rate && <p className="text-[10px] text-red-500 mt-0.5">{errors.c_rate}</p>}
                </div>
              </div>
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
