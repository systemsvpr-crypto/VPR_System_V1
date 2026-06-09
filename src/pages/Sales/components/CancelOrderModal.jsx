import { useState, useMemo } from 'react';
import { X, AlertTriangle, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import { cancelOrderItems } from '../../../services/salesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const CancelOrderModal = ({ isOpen, onClose, order, onSuccess, user }) => {
  const [reason, setReason] = useState('');
  const [cancelQtys, setCancelQtys] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(() => (order?.sales_order_items || []), [order]);

  useMemo(() => {
    if (isOpen && items.length > 0) {
      const initial = {};
      items.forEach(item => {
        const plans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const totalPlanned = plans.reduce((s, p) => s + Number(p.quantity), 0);
        const remaining = Number(item.quantity) - totalPlanned - Number(item.cancelled_quantity || 0);
        initial[item.item_id] = Math.max(0, remaining);
      });
      setCancelQtys(initial);
      setReason('');
    }
  }, [isOpen, items]);

  const setQty = (itemId, val) => {
    const num = Math.max(0, Number(val) || 0);
    setCancelQtys(prev => ({ ...prev, [itemId]: num }));
  };

  const getItemSummary = (item) => {
    const plans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
    const totalPlanned = plans.reduce((s, p) => s + Number(p.quantity), 0);
    const totalDispatched = plans
      .filter(p => p.dispatch_status === 'Dispatch Done' || p.dispatch_status === 'Partially Dispatched')
      .reduce((s, p) => s + Number(p.quantity), 0);
    const cancelledSoFar = Number(item.cancelled_quantity || 0);
    const remaining = Number(item.quantity) - totalPlanned - cancelledSoFar;
    return { totalPlanned, totalDispatched, cancelledSoFar, remaining };
  };

  const allSelectedZero = useMemo(() => {
    return items.every(item => (cancelQtys[item.item_id] || 0) <= 0);
  }, [items, cancelQtys]);

  const handleConfirm = async () => {
    if (!reason.trim()) { toast.error('Please provide a reason for cancellation.'); return; }
    if (allSelectedZero) { toast.error('No items selected for cancellation.'); return; }

    setSubmitting(true);
    try {
      const cancelItems = items
        .filter(item => (cancelQtys[item.item_id] || 0) > 0)
        .map(item => ({ item_id: item.item_id, cancel_qty: cancelQtys[item.item_id] }));

      await cancelOrderItems(order.order_id, cancelItems, reason.trim(), user?.user_id);
      toast.success('Order items cancelled successfully');
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel items');
    }
    setSubmitting(false);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="bg-red-50 p-2 rounded-lg">
              <Ban size={20} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              Cancel Order Items — {order?.order_number || ''}
            </h2>
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              Customer: <span className="font-medium text-slate-700">{order?.customers?.name || '—'}</span>
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer cancelled the order, Out of stock, etc."
            />
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {items.map(item => {
              const { totalPlanned, totalDispatched, cancelledSoFar, remaining } = getItemSummary(item);
              const maxCancel = remaining + totalPlanned;
              const currentQty = cancelQtys[item.item_id] || 0;
              const hasDispatched = totalDispatched > 0;
              return (
                <div key={item.item_id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {item.products?.name || '—'} <span className="text-xs text-slate-400">({item.products?.unit})</span>
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                        <span>Order: <strong>{item.quantity}</strong></span>
                        <span>Planned: <strong>{totalPlanned}</strong></span>
                        <span>Dispatched: <strong>{totalDispatched}</strong></span>
                        {cancelledSoFar > 0 && <span className="text-red-500">Already cancelled: <strong>{cancelledSoFar}</strong></span>}
                        <span>Remaining: <strong>{remaining}</strong></span>
                      </div>
                      {hasDispatched && currentQty > remaining && (
                        <p className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                          <AlertTriangle size={12} />
                          Cancelling dispatched qty will reverse stock
                        </p>
                      )}
                    </div>
                    <div className="w-24 shrink-0">
                      <label className="block text-xs text-slate-500 mb-1">Cancel Qty</label>
                      <Input
                        type="number" min="0" max={maxCancel} step="1"
                        value={currentQty || ''}
                        onChange={(e) => setQty(item.item_id, e.target.value)}
                        className={`h-8 text-sm text-center ${currentQty > remaining ? 'border-amber-300' : ''}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || allSelectedZero || !reason.trim()}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white">
            <Ban size={16} />
            {submitting ? 'Cancelling...' : 'Confirm Cancel'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CancelOrderModal;
