import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { getVoidTransactionImpact } from '../../../services/stockService';
import ImpactPreview from './ImpactPreview';
import { formatQty } from '@/lib/qty';

// Confirms a permanent delete from Transaction History. Unlike the old
// Void flow this is a real hard delete — no reason is kept (there's no row
// left to attach it to) and only the transactions table is ever touched, so
// a dispatch-linked row is flagged here rather than silently patched up.
const DeleteConfirmModal = ({ isOpen, onClose, transaction, onConfirm, loading, products, godowns }) => {
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  useEffect(() => {
    if (isOpen) {
      setImpactData(null);
      setImpactStatus('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !transaction) return;

    const fetchImpact = async () => {
      setImpactStatus('loading');
      try {
        const results = await getVoidTransactionImpact(transaction);
        const enriched = results.map(r => ({
          ...r,
          godownName: godowns?.find(g => g.godown_id === r.godownId)?.name || '-',
        }));
        setImpactData(enriched);
        setImpactStatus('done');
      } catch (e) {
        setImpactStatus('error');
      }
    };
    fetchImpact();
  }, [isOpen]);

  if (!transaction) return null;

  const isTransfer = !!transaction.pair_id;
  const txnType = transaction.txn_type?.replace(/_/g, ' ');
  const productName = transaction.products?.name || products?.find(p => p.product_id === transaction.product_id)?.name || '';

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-5xl">
        <ModalHeader>
          <div className="bg-red-50 p-2 rounded-lg w-fit"><AlertTriangle size={20} className="text-red-600" /></div>
          <h2 className="text-xl font-bold text-slate-800">
            Delete Transaction
            {transaction?.dispatch_number && (
              <span className="ml-2 text-sm font-normal text-slate-400">(Dispatch #{transaction.dispatch_number})</span>
            )}
          </h2>
        </ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-2 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium">{txnType}</span></div>
                <div><span className="text-slate-500">Product:</span> <span className="font-medium">{productName}</span></div>
                <div><span className="text-slate-500">Godown:</span> <span className="font-medium">{transaction.godowns?.name || '-'}</span></div>
                <div><span className="text-slate-500">Quantity:</span> <span className="font-medium">{formatQty(transaction.qty)}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{transaction.txn_date}</span></div>
                {isTransfer && (
                  <div className="text-amber-600 text-xs mt-1">This is part of a transfer — both legs will be permanently deleted together.</div>
                )}
                {transaction.dispatch_plan_id && (
                  <div className="text-amber-600 text-xs mt-1">This is linked to Dispatch #{transaction.dispatch_number} from Sales. Deleting it only removes this transaction — that dispatch's status will NOT be updated and may become inconsistent.</div>
                )}
                <div className="text-red-600 text-xs font-medium mt-2">This permanently removes the transaction from the database. This cannot be undone.</div>
              </div>
            </div>
            <div className="col-span-3">
              <ImpactPreview loading={impactStatus === 'loading'} error={impactStatus === 'error'} data={impactData} productName={productName} deletedTransaction={transaction} />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white">
            {loading ? 'Deleting...' : 'Delete Transaction'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DeleteConfirmModal;
