import { useState, useEffect } from 'react';
import { FileEdit, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { updatePendingDeliveryRowInfo, updateItemsExpectedDispatchDate } from '../../../services/purchaseService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { canEditOrDelete } from '../../../lib/permissions';

const EditDeliveryIndentModal = ({ isOpen, onClose, item, products = [], vendors = [], user, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    indent_date: '',
    indent_number: '',
    process_type: 'direct',
    vendor_id: '',
    product_id: '',
    quantity: '',
    rate: '',
    expected_dispatch_date: '',
  });

  useEffect(() => {
    if (item && isOpen) {
      const indent = item.purchase_indents || {};
      const savedRate = (item.rate != null && item.rate !== '') || (item.approved_rate != null && item.approved_rate !== '') 
        ? (item.rate ?? item.approved_rate) 
        : '';
      const vendorId = String(item.approved_vendor_id || item.vendor_id || indent.vendor_id || '');
      const productId = String(item.product_id || '');

      setForm({
        indent_date: indent.indent_date ? indent.indent_date.slice(0, 10) : '',
        indent_number: indent.indent_number || '',
        process_type: indent.process_type || 'direct',
        vendor_id: vendorId,
        product_id: productId,
        quantity: item.quantity != null ? String(item.quantity) : '',
        rate: savedRate !== '' ? String(savedRate) : '',
        expected_dispatch_date: item.expected_dispatch_date ? item.expected_dispatch_date.slice(0, 10) : '',
      });
    }
  }, [item, isOpen]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEditOrDelete(user)) {
      toast.error('You do not have permission to edit indents');
      return;
    }
    if (!item) return;

    if (!form.indent_number?.trim()) {
      toast.error('Indent number is required');
      return;
    }
    if (!form.product_id) {
      toast.error('Please select a product');
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setSubmitting(true);
    try {
      await updatePendingDeliveryRowInfo({
        item_id: item.item_id,
        indent_id: item.purchase_indents?.indent_id,
        indent_date: form.indent_date || null,
        indent_number: form.indent_number.trim(),
        process_type: form.process_type,
        vendor_id: form.vendor_id || null,
        product_id: form.product_id,
        quantity: Number(form.quantity),
        rate: form.rate !== '' ? Number(form.rate) : null,
      });

      if (form.expected_dispatch_date !== (item.expected_dispatch_date ? item.expected_dispatch_date.slice(0, 10) : '')) {
        await updateItemsExpectedDispatchDate([item.item_id], form.expected_dispatch_date || null);
      }

      toast.success('Indent details updated successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update indent details');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = products.find(p => String(p.product_id) === String(form.product_id));

  return (
    <Modal open={isOpen} onOpenChange={open => { if (!open && !submitting) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader className="bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-primary flex items-center justify-center font-bold">
              <FileEdit size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Edit Indent Details</h2>
              <p className="text-xs text-slate-500">
                {item?.purchase_indents?.indent_number ? `Indent #${item.purchase_indents.indent_number}` : 'Update delivery indent particulars'}
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ModalBody className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Indent Number */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Indent Number <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. IND-001"
                  value={form.indent_number}
                  onChange={e => handleChange('indent_number', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Indent Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Indent Date
                </label>
                <DatePicker
                  showActions
                  value={form.indent_date}
                  onChange={e => handleChange('indent_date', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Process Type */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Indent Type
                </label>
                <select
                  value={form.process_type}
                  onChange={e => handleChange('process_type', e.target.value)}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="direct">Direct</option>
                  <option value="process">Process</option>
                </select>
              </div>

              {/* Vendor */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Vendor Name
                </label>
                <select
                  value={form.vendor_id}
                  onChange={e => handleChange('vendor_id', e.target.value)}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select vendor...</option>
                  {vendors.map(v => (
                    <option key={v.vendor_id} value={String(v.vendor_id)}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.product_id}
                  onChange={e => handleChange('product_id', e.target.value)}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.product_id} value={String(p.product_id)}>
                      {p.name} {p.unit ? `(${p.unit})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Total Quantity {selectedProduct?.unit ? `(${selectedProduct.unit})` : ''} <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => handleChange('quantity', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Rate */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Rate per Unit (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.rate}
                  onChange={e => handleChange('rate', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Expected Dispatch Date */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Expected Dispatch Date
                </label>
                <DatePicker
                  showActions
                  value={form.expected_dispatch_date}
                  onChange={e => handleChange('expected_dispatch_date', e.target.value)}
                  placeholder="Select expected dispatch date"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </ModalBody>

          <ModalFooter className="bg-slate-50/70">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={onClose}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="h-9 px-5 text-xs bg-primary hover:bg-primary/90 text-white font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default EditDeliveryIndentModal;
