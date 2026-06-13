import { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const getTodayLocalString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getEndOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const ArriveConfirmModal = ({ isOpen, onClose, delivery, onConfirm }) => {
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && delivery) {
      setQty(String(delivery.received_quantity || ''));
      setDate(delivery.delivery_date ? delivery.delivery_date.split('T')[0] : '');
    }
  }, [isOpen, delivery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedQty = Number(qty);
    if (!qty || parsedQty <= 0) {
      toast.error('Please enter a valid quantity.');
      return;
    }
    if (!date) {
      toast.error('Please select a lifting date.');
      return;
    }

    const today = getTodayLocalString();
    if (date.slice(0, 10) > today) {
      toast.error('Lifting date cannot be a future date when marking as Arrived.');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(delivery.delivery_id, parsedQty, date);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  if (!delivery) return null;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <div className="flex items-center gap-2">
            <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
            <ModalTitle className="text-base font-bold text-slate-800">Confirm Arrival</ModalTitle>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit}>
          <ModalBody className="flex flex-col gap-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Confirming arrival for lift <strong className="text-teal-700">{delivery.lifting_number}</strong>. This will finalize the status to <strong>Arrived</strong> and update the stock directly.
            </p>

            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 flex flex-col gap-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Lift No.:</span>
                <span className="font-semibold text-slate-800">{delivery.lifting_number || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Planned Qty:</span>
                <span className="font-semibold text-slate-800">{delivery.received_quantity || 0}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lifting Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                name="delivery_date"
                placeholder="Select date"
                value={date}
                onChange={(val) => setDate(val.target ? val.target.value : val)}
                required
                calendarProps={{ disabled: { after: getEndOfToday() } }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Actual Received Qty <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter actual received quantity"
                className="text-xs"
              />
            </div>
          </ModalBody>

          <ModalFooter>
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={submitting || !qty || !date} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 border-none shadow-sm">
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              Confirm & Arrive
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ArriveConfirmModal;
