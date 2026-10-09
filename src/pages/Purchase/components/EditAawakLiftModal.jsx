import { useState, useEffect } from 'react';
import { Truck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateAawakLiftInfo, getPackagingSize } from '../../../services/purchaseService';
import { roundQty } from '@/lib/qty';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { canEditOrDelete } from '../../../lib/permissions';

const EditAawakLiftModal = ({ isOpen, onClose, delivery, activeSubTab, products = [], transporters = [], user, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    lifting_number: '',
    delivery_date: '',
    product_id: '',
    dispatch_qty_kg: '',
    dispatch_qty_bag: '',
    transporter_id: '',
    process_type: 'direct',
    lr_number: '',
    expected_delivery_date: '',
    driver_phone_number: '',
    vehicle_number: '',
    remarks: '',
  });

  const isTransporterGodownOrHistory =
    activeSubTab === 'transporter-godown' ||
    activeSubTab === 'history' ||
    delivery?.status === 'In Transport Godown' ||
    delivery?.status === 'AT TPT GDN' ||
    delivery?.status === 'Arrived' ||
    delivery?.status === 'Received';

  const canEditTransporter = delivery?.status === 'In Transit' || activeSubTab === 'pending';

  useEffect(() => {
    if (delivery && isOpen) {
      const item = delivery.purchase_indent_items || {};
      const prod = item.products || {};
      const indent = item.purchase_indents || {};
      let prodId = item.product_id || delivery.product_id || '';
      if (!prodId && prod.name) {
        const found = products.find(p => p.name?.toLowerCase().trim() === prod.name?.toLowerCase().trim());
        if (found) prodId = found.product_id;
      }
      let transpId = delivery.transporter_id || delivery.transporters?.transporter_id || '';
      if (!transpId && delivery.transporters?.name) {
        const match = transporters.find(t => t.name?.toLowerCase().trim() === delivery.transporters.name?.toLowerCase().trim());
        if (match) transpId = match.transporter_id;
      }

      setForm({
        lifting_number: delivery.lifting_number || '',
        delivery_date: delivery.delivery_date ? delivery.delivery_date.slice(0, 10) : '',
        product_id: prodId ? String(prodId) : '',
        dispatch_qty_kg: delivery.dispatch_qty_kg != null ? String(delivery.dispatch_qty_kg) : '',
        dispatch_qty_bag: delivery.dispatch_qty_bag != null ? String(delivery.dispatch_qty_bag) : '',
        transporter_id: transpId ? String(transpId) : '',
        process_type: indent.process_type || delivery.process_type || 'direct',
        lr_number: delivery.lr_number || '',
        expected_delivery_date: delivery.expected_delivery_date ? delivery.expected_delivery_date.slice(0, 10) : '',
        driver_phone_number: delivery.driver_phone_number || '',
        vehicle_number: delivery.vehicle_number || '',
        remarks: delivery.remarks || '',
      });
    }
  }, [delivery, isOpen, products, transporters]);

  const currentProduct = products.find(p => String(p.product_id) === String(form.product_id)) || delivery?.purchase_indent_items?.products || {};
  const packagingSize = getPackagingSize(currentProduct);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleDispatchKgChange = (val) => {
    if (val === '') {
      setForm(prev => ({ ...prev, dispatch_qty_kg: '', dispatch_qty_bag: '' }));
      return;
    }
    const num = parseFloat(val);
    const convertedBags = (!isNaN(num) && packagingSize > 0) ? String(roundQty(num / packagingSize)) : '';
    setForm(prev => ({
      ...prev,
      dispatch_qty_kg: val,
      dispatch_qty_bag: convertedBags,
    }));
  };

  const handleDispatchBagChange = (val) => {
    if (val === '') {
      setForm(prev => ({ ...prev, dispatch_qty_kg: '', dispatch_qty_bag: '' }));
      return;
    }
    const num = parseFloat(val);
    const convertedKg = (!isNaN(num) && packagingSize > 0) ? String(roundQty(num * packagingSize)) : '';
    setForm(prev => ({
      ...prev,
      dispatch_qty_bag: val,
      dispatch_qty_kg: convertedKg,
    }));
  };

  const handleTransporterSelect = (tId) => {
    const selected = transporters.find(t => String(t.transporter_id) === String(tId));
    setForm(prev => ({
      ...prev,
      transporter_id: tId,
      driver_phone_number: prev.driver_phone_number || selected?.driver_phone_number || '',
      vehicle_number: prev.vehicle_number || selected?.vehicle_number || '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEditOrDelete(user)) {
      toast.error('You do not have permission to edit deliveries');
      return;
    }
    if (!delivery) return;

    if (!form.lifting_number?.trim()) {
      toast.error('Lifting number is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        delivery_id: delivery.delivery_id,
        item_id: delivery.purchase_indent_items?.item_id,
        indent_id: delivery.purchase_indent_items?.purchase_indents?.indent_id,
        delivery_date: form.delivery_date || null,
        dispatch_qty_kg: form.dispatch_qty_kg,
        dispatch_qty_bag: form.dispatch_qty_bag,
        expected_delivery_date: form.expected_delivery_date || null,
        driver_phone_number: form.driver_phone_number,
        vehicle_number: form.vehicle_number,
        remarks: form.remarks,
      };

      // In Pending section, LR Number and Transporter can also be updated
      if (!isTransporterGodownOrHistory) {
        payload.lr_number = form.lr_number;
      }
      if (canEditTransporter) {
        payload.transporter_id = form.transporter_id || null;
      }

      await updateAawakLiftInfo(payload);
      toast.success('Lift details updated successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update lift details');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={open => { if (!open && !submitting) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader className="bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Truck size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Edit Lift Details</h2>
              <p className="text-xs text-slate-500">
                {delivery?.lifting_number ? `Lifting #${delivery.lifting_number}` : 'Update delivery lift particulars'}
                {isTransporterGodownOrHistory ? ' (Locked fields for stock consistency)' : ''}
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ModalBody className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Lifting Number (Read-only across all sections) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Lifting Number
                </label>
                <Input
                  type="text"
                  readOnly
                  disabled
                  value={form.lifting_number}
                  className="h-9 text-xs bg-slate-100 text-slate-500 cursor-not-allowed select-none"
                />
              </div>

              {/* Delivery Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Dispatch Date
                </label>
                <DatePicker
                  showActions
                  value={form.delivery_date}
                  onChange={e => handleChange('delivery_date', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Product (Read-only across all sections) */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Product Name
                </label>
                <select
                  disabled
                  value={form.product_id}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.product_id} value={String(p.product_id)}>
                      {p.name} {p.unit ? `(${p.unit})` : ''}
                    </option>
                  ))}
                  {form.product_id && !products.some(p => String(p.product_id) === String(form.product_id)) && (
                    <option value={form.product_id}>
                      {delivery?.purchase_indent_items?.products?.name || 'Selected Product'} {delivery?.purchase_indent_items?.products?.unit ? `(${delivery.purchase_indent_items.products.unit})` : ''}
                    </option>
                  )}
                </select>
              </div>

              {/* Transporter */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Transporter {!canEditTransporter && '(Locked)'}
                </label>
                <select
                  disabled={!canEditTransporter}
                  value={form.transporter_id}
                  onChange={e => handleTransporterSelect(e.target.value)}
                  className={`w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 ${!canEditTransporter ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white focus:outline-none focus:ring-2 focus:ring-primary/30'}`}
                >
                  <option value="">Select transporter...</option>
                  {transporters.map(t => (
                    <option key={t.transporter_id} value={String(t.transporter_id)}>
                      {t.name}
                    </option>
                  ))}
                  {form.transporter_id && !transporters.some(t => String(t.transporter_id) === String(form.transporter_id)) && (
                    <option value={form.transporter_id}>
                      {delivery?.transporters?.name || 'Selected Transporter'}
                    </option>
                  )}
                </select>
              </div>

              {/* Dispatch Qty KG */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Dispatch Qty (KG)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={form.dispatch_qty_kg}
                  onChange={e => handleDispatchKgChange(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Dispatch Qty Bag */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Dispatch Qty (Bags) {packagingSize ? `(${packagingSize} kg/bag)` : ''}
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={form.dispatch_qty_bag}
                  onChange={e => handleDispatchBagChange(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* LR Number (Read-only in Transporter Godown & History, editable in Pending) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  LR Number {isTransporterGodownOrHistory && '(Read-only)'}
                </label>
                <Input
                  type="text"
                  placeholder="LR No."
                  readOnly={isTransporterGodownOrHistory}
                  disabled={isTransporterGodownOrHistory}
                  value={form.lr_number}
                  onChange={e => handleChange('lr_number', e.target.value)}
                  className={`h-9 text-xs ${isTransporterGodownOrHistory ? 'bg-slate-100 text-slate-500 cursor-not-allowed select-none' : ''}`}
                />
              </div>

              {/* Exp Recv Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Expected Recv Date
                </label>
                <DatePicker
                  showActions
                  value={form.expected_delivery_date}
                  onChange={e => handleChange('expected_delivery_date', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Indent Type (Read-only) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Indent Type
                </label>
                <select
                  disabled
                  value={form.process_type}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                >
                  <option value="direct">Direct</option>
                  <option value="process">Process</option>
                </select>
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Vehicle Number
                </label>
                <Input
                  type="text"
                  placeholder="Vehicle No."
                  value={form.vehicle_number}
                  onChange={e => handleChange('vehicle_number', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Driver Phone Number */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Driver Phone Number
                </label>
                <Input
                  type="text"
                  placeholder="Driver Phone"
                  value={form.driver_phone_number}
                  onChange={e => handleChange('driver_phone_number', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Remarks */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Remarks / Review
                </label>
                <Input
                  type="text"
                  placeholder="Enter remarks..."
                  value={form.remarks}
                  onChange={e => handleChange('remarks', e.target.value)}
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

export default EditAawakLiftModal;
