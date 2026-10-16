import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Truck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateAawakLiftInfo, updateAawakLift, getPackagingSize } from '../../../services/purchaseService';
import { roundQty } from '@/lib/qty';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { canEditOrDelete } from '../../../lib/permissions';

const EditAawakLiftModal = ({ isOpen, onClose, delivery, activeSubTab, products = [], transporters = [], godowns = [], user, onSuccess }) => {
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
    receiving_date: '',
    received_quantity: '',
    godown_id: '',
    status: 'Arrived',
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

  const isHistory = activeSubTab === 'history' || delivery?.status === 'Arrived' || delivery?.status === 'Received';

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

      const ownGodownIds = new Set(godowns.map(g => String(g.godown_id)));
      const isKnownOwn = (id) => id && ownGodownIds.has(String(id));
      const currentAlloc = delivery.purchase_delivery_godowns?.[0]?.godown_id;
      const approved = delivery.purchase_indent_items?.approved_godown_id;
      const defaultGodownId = godowns.find(g => g.name?.trim().toLowerCase() === 'godown')?.godown_id || godowns[0]?.godown_id || '';

      const existingGodownId = isKnownOwn(currentAlloc)
        ? currentAlloc
        : (isKnownOwn(approved)
            ? approved
            : (isKnownOwn(delivery.godown_id)
                ? delivery.godown_id
                : defaultGodownId));

      const initialStatus =
        (delivery.status === 'AT TPT GDN' || delivery.status === 'In Transport Godown')
          ? 'In Transport Godown'
          : (delivery.status || (activeSubTab === 'transporter-godown' ? 'In Transport Godown' : 'Arrived'));

      const masterUnit = (prod.unit || '').toLowerCase();
      const defaultRecvQty = masterUnit === 'kg'
        ? (delivery.dispatch_qty_kg != null ? String(delivery.dispatch_qty_kg) : '')
        : (delivery.dispatch_qty_bag != null ? String(delivery.dispatch_qty_bag) : '');

      const initialRecvQty = delivery.received_quantity != null && Number(delivery.received_quantity) > 0
        ? String(delivery.received_quantity)
        : defaultRecvQty;

      const initialRecvDate = delivery.receiving_date
        ? delivery.receiving_date.slice(0, 10)
        : (delivery.expected_delivery_date
            ? delivery.expected_delivery_date.slice(0, 10)
            : (delivery.delivery_date ? delivery.delivery_date.slice(0, 10) : ''));

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
        receiving_date: initialRecvDate,
        received_quantity: initialRecvQty,
        godown_id: existingGodownId ? String(existingGodownId) : '',
        status: initialStatus,
        driver_phone_number: delivery.driver_phone_number || '',
        vehicle_number: delivery.vehicle_number || '',
        remarks: delivery.remarks || '',
      });
    }
  }, [delivery, isOpen, products, transporters, godowns]);

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

    if (form.status === 'Arrived') {
      if (!form.godown_id) {
        toast.error('Select a destination godown before saving as Arrived');
        return;
      }
      if (form.received_quantity !== '' && Number(form.received_quantity) <= 0) {
        toast.error('Received quantity must be greater than zero');
        return;
      }
    }

    if (form.receiving_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.receiving_date > today) {
        toast.error('Receiving date cannot be a future date');
        return;
      }
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
        lr_number: form.lr_number,
      };

      if (canEditTransporter) {
        payload.transporter_id = form.transporter_id || null;
      }

      await updateAawakLiftInfo(payload);

      // Synchronize intake fields (receiving_date, received_quantity, godown_id, status) with stock ledger
      const dbStatus = form.status === 'AT TPT GDN' ? 'In Transport Godown' : form.status;
      const recvQty = form.received_quantity !== '' && form.received_quantity != null
        ? Number(form.received_quantity)
        : (delivery.received_quantity != null ? Number(delivery.received_quantity) : undefined);

      await updateAawakLift({
        delivery_id: delivery.delivery_id,
        user_id: user?.user_id,
        status: dbStatus,
        lr_number: form.lr_number,
        driver_phone_number: form.driver_phone_number,
        vehicle_number: form.vehicle_number,
        remarks: form.remarks,
        godown_id: form.godown_id || null,
        received_quantity: recvQty,
        receiving_date: form.receiving_date || null,
        expected_delivery_date: form.expected_delivery_date || null,
        transporter_id: form.transporter_id || null,
      });

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

              {/* Dispatch Date (Read-only) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Dispatch Date
                </label>
                <Input
                  type="text"
                  readOnly
                  disabled
                  value={form.delivery_date ? format(new Date(form.delivery_date), 'dd/MM/yyyy') : '—'}
                  className="h-9 text-xs bg-slate-100 text-slate-500 cursor-not-allowed select-none"
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

              {/* Dispatch Qty KG & Bags (Hidden in History & Transporter Godown sections) */}
              {!isTransporterGodownOrHistory && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Dispatch Qty (KG)
                    </label>
                    <Input
                      type="text"
                      readOnly
                      disabled
                      value={form.dispatch_qty_kg || '—'}
                      className="h-9 text-xs bg-slate-100 text-slate-500 cursor-not-allowed select-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Dispatch Qty (Bags) {packagingSize ? `(${packagingSize} kg/bag)` : ''}
                    </label>
                    <Input
                      type="text"
                      readOnly
                      disabled
                      value={form.dispatch_qty_bag || '—'}
                      className="h-9 text-xs bg-slate-100 text-slate-500 cursor-not-allowed select-none"
                    />
                  </div>
                </>
              )}

              {/* LR Number */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  LR Number
                </label>
                <Input
                  type="text"
                  placeholder="LR No."
                  value={form.lr_number}
                  onChange={e => handleChange('lr_number', e.target.value)}
                  disabled={isHistory}
                  className={`h-9 text-xs ${isHistory ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                />
              </div>

              {/* Exp Recv Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Expected Recv Date
                </label>
                <DatePicker
                  showActions={!isHistory}
                  value={form.expected_delivery_date}
                  onChange={e => handleChange('expected_delivery_date', e.target.value)}
                  disabled={isHistory}
                  className={`h-9 text-xs ${isHistory ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                />
              </div>

              {/* Receiving Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Receiving Date
                </label>
                <DatePicker
                  showActions
                  value={form.receiving_date}
                  onChange={e => handleChange('receiving_date', e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Received Qty */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Received Qty {currentProduct?.unit ? `(${currentProduct.unit})` : ''}
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={form.received_quantity}
                  onChange={e => handleChange('received_quantity', e.target.value)}
                  className="h-9 text-xs font-bold text-emerald-700"
                />
              </div>

              {/* Godown Name */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Godown Name
                </label>
                <select
                  value={form.godown_id}
                  onChange={e => handleChange('godown_id', e.target.value)}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select godown...</option>
                  {godowns.map(g => (
                    <option key={g.godown_id} value={String(g.godown_id)}>
                      {g.name}
                    </option>
                  ))}
                  {form.godown_id && !godowns.some(g => String(g.godown_id) === String(form.godown_id)) && (
                    <option value={form.godown_id}>
                      {delivery?.purchase_delivery_godowns?.[0]?.godowns?.name || 'Selected Godown'}
                    </option>
                  )}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={e => handleChange('status', e.target.value)}
                  className="w-full h-9 text-xs font-semibold px-2.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="Arrived">Arrived</option>
                  <option value="In Transport Godown">AT TPT GDN</option>
                  <option value="In Transit">In Transit (Move to Pending)</option>
                </select>
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
                  disabled={isHistory}
                  className={`h-9 text-xs ${isHistory ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
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
                  disabled={isHistory}
                  className={`h-9 text-xs ${isHistory ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
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
                  disabled={isHistory}
                  className={`h-9 text-xs ${isHistory ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
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
