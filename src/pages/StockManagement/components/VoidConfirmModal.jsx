import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { getVoidTransactionImpact } from '../../../services/stockService';
import ImpactPreview from './ImpactPreview';

const VoidConfirmModal = ({ isOpen, onClose, transaction, onConfirm, loading, products, godowns }) => {
  const [reason, setReason] = useState('');
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  useEffect(() => {
    if (isOpen) {
      setReason('');
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

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };

  if (!transaction) return null;

  const isTransfer = !!transaction.pair_id;
  const txnType = transaction.txn_type?.replace(/_/g, ' ');
  const productName = transaction.products?.name || products?.find(p => p.product_id === transaction.product_id)?.name || '';

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-5xl">
        <ModalHeader>
          <div className="bg-red-50 p-2 rounded-lg w-fit"><AlertTriangle size={20} className="text-red-600" /></div>
          <h2 className="text-xl font-bold text-slate-800">Void Transaction</h2>
        </ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-2 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium">{txnType}</span></div>
                <div><span className="text-slate-500">Product:</span> <span className="font-medium">{productName}</span></div>
                <div><span className="text-slate-500">Godown:</span> <span className="font-medium">{transaction.godowns?.name || '-'}</span></div>
                <div><span className="text-slate-500">Quantity:</span> <span className="font-medium">{Number(transaction.qty || 0).toFixed(0)}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{transaction.txn_date}</span></div>
                {isTransfer && (
                  <div className="text-amber-600 text-xs mt-1">This is part of a transfer — both legs will be voided together.</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason for voiding *</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full h-20 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
                  placeholder="Explain why this transaction is being voided..." />
              </div>
            </div>
            <div className="col-span-3">
              <ImpactPreview loading={impactStatus === 'loading'} error={impactStatus === 'error'} data={impactData} productName={productName} deletedTransaction={transaction} />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" onClick={handleConfirm} disabled={loading || !reason.trim()}
            className="bg-red-600 hover:bg-red-700 text-white">
            {loading ? 'Voiding...' : 'Void Transaction'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default VoidConfirmModal;
