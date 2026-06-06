import { useState, useEffect } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { transferStock, editTransfer, getStockBalance, getStockBalanceBeforeTxn, getAffectedTransactionsImpact } from '../../../services/stockService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown, DropdownTrigger, DropdownContent } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import ImpactPreview from './ImpactPreview';

const TransferModal = ({ isOpen, onClose, products, godowns, productStockMap = {}, user, onSuccess, editingTransaction }) => {
  const [form, setForm] = useState({
    product_id: '', from_godown_id: '', to_godown_id: '', qty: '',
    txn_date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [stockBalance, setStockBalance] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  const isEditing = !!editingTransaction;

  useEffect(() => {
    if (!isOpen) {
      setForm({ product_id: '', from_godown_id: '', to_godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0] });
      setStockBalance(null);
      setImpactData(null);
      setImpactStatus('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingTransaction && isOpen) {
      setForm({
        product_id: editingTransaction.product_id,
        from_godown_id: editingTransaction.from_godown_id || '',
        to_godown_id: editingTransaction.to_godown_id || '',
        qty: String(Number(editingTransaction.qty)),
        txn_date: editingTransaction.txn_date,
      });
    }
  }, [editingTransaction, isOpen]);

  useEffect(() => {
    if (form.product_id && form.from_godown_id) {
      if (isEditing) {
        const outLeg = editingTransaction.txn_type === 'TRANSFER_OUT' ? editingTransaction : editingTransaction.pair;
        getStockBalanceBeforeTxn(form.product_id, form.from_godown_id, outLeg.txn_id, outLeg.txn_date)
          .then(setStockBalance).catch(() => setStockBalance(null));
      } else {
        getStockBalance(form.product_id, form.from_godown_id).then(setStockBalance).catch(() => setStockBalance(null));
      }
    } else {
      setStockBalance(null);
    }
  }, [form.product_id, form.from_godown_id, isEditing]);

  useEffect(() => {
    if (!isEditing || !isOpen || !editingTransaction.pair) {
      setImpactData(null);
      setImpactStatus('idle');
      return;
    }

    const t = setTimeout(async () => {
      if (!form.product_id || !form.from_godown_id || !form.to_godown_id) {
        setImpactData(null);
        setImpactStatus('idle');
        return;
      }

      setImpactStatus('loading');
      try {
        const newQty = Number(form.qty || 0);
        const isOut = editingTransaction.txn_type === 'TRANSFER_OUT';
        const outLeg = isOut ? editingTransaction : editingTransaction.pair;
        const inLeg = isOut ? editingTransaction.pair : editingTransaction;

        const newOut = {
          txn_id: 'new-out',
          product_id: form.product_id,
          godown_id: form.from_godown_id,
          txn_date: form.txn_date,
          txn_type: 'TRANSFER_OUT',
          qty: newQty,
          created_at: new Date().toISOString(),
        };
        const newIn = {
          txn_id: 'new-in',
          product_id: form.product_id,
          godown_id: form.to_godown_id,
          txn_date: form.txn_date,
          txn_type: 'TRANSFER_IN',
          qty: newQty,
          created_at: new Date().toISOString(),
        };

        const srcFromDate = form.txn_date < outLeg.txn_date ? form.txn_date : outLeg.txn_date;
        const dstFromDate = form.txn_date < inLeg.txn_date ? form.txn_date : inLeg.txn_date;

        const srcGodownChanged = form.from_godown_id !== outLeg.godown_id;
        const dstGodownChanged = form.to_godown_id !== inLeg.godown_id;

        const srcPromise = srcGodownChanged
          ? getAffectedTransactionsImpact(outLeg.product_id, outLeg.godown_id, outLeg.txn_date, { removeTxnIds: [outLeg.txn_id], addRows: [] })
          : getAffectedTransactionsImpact(outLeg.product_id, form.from_godown_id, srcFromDate, { removeTxnIds: [outLeg.txn_id], addRows: [newOut] });

        const dstPromise = dstGodownChanged
          ? getAffectedTransactionsImpact(inLeg.product_id, inLeg.godown_id, inLeg.txn_date, { removeTxnIds: [inLeg.txn_id], addRows: [] })
          : getAffectedTransactionsImpact(inLeg.product_id, form.to_godown_id, dstFromDate, { removeTxnIds: [inLeg.txn_id], addRows: [newIn] });

        const [srcImpact, dstImpact] = await Promise.all([srcPromise, dstPromise]);
        setImpactData([
          { ...srcImpact, godownName: godowns.find(g => g.godown_id === form.from_godown_id)?.name },
          { ...dstImpact, godownName: godowns.find(g => g.godown_id === form.to_godown_id)?.name },
        ]);
        setImpactStatus('done');
      } catch (e) {
        console.error('Impact preview error:', e);
        setImpactStatus('error');
      }
    }, 500);

    return () => clearTimeout(t);
  }, [form.qty, form.from_godown_id, form.to_godown_id, form.txn_date, isOpen, isEditing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.from_godown_id || !form.to_godown_id || form.qty === '' || form.qty === undefined || form.qty === null || Number(form.qty) < 0) {
      toast.error('All fields required with valid qty.');
      return;
    }
    if (form.from_godown_id === form.to_godown_id) { toast.error('Source and destination must be different.'); return; }
    setSubmitting(true);
    try {
      if (editingTransaction?.pair_id) {
        await editTransfer(editingTransaction.pair_id, { ...form, created_by: user?.user_id });
        toast.success('Transfer updated');
      } else {
        await transferStock({ ...form, created_by: user?.user_id });
        toast.success('Stock transferred successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const activeGodowns = godowns.filter(g => g.is_active);
  const selectedProduct = products.find(p => p.product_id === form.product_id);
  const productName = selectedProduct?.name || '';

  const renderProductOption = (option) => {
    const pId = option.value;
    const pName = option.label;
    const stockEntries = productStockMap[pId];
    if (stockEntries && stockEntries.length > 0) {
      return (
        <span className="flex items-center justify-between gap-2 w-full">
          <span className="font-medium truncate">{pName}</span>
          <span className="flex items-center gap-1 flex-wrap justify-end shrink-0">
            {stockEntries.map((s) => (
              <span key={s.godownId} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border ${s.badge}`}>
                <span>{s.godownName}:</span>
                <span className="font-semibold">{s.qty}</span>
              </span>
            ))}
          </span>
        </span>
      );
    }
    return pName;
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className={isEditing ? "max-w-5xl" : "max-w-2xl"}>
        <ModalHeader>
          <div className="bg-amber-50 p-2 rounded-lg"><ArrowLeftRight size={20} className="text-amber-600" /></div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Transfer' : 'Transfer Stock'}</h2>
          </ModalTitle>
          <ModalDescription className="sr-only">{isEditing ? 'Editing transfer entry' : 'Transfer stock between godowns'}</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className={isEditing ? "grid grid-cols-5 gap-6" : ""}>
              <div className={isEditing ? "col-span-2 space-y-4" : "space-y-4"}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                  <Dropdown value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} options={products.map(p => ({ value: p.product_id, label: p.name }))} placeholder="Select Product" renderOption={renderProductOption}>
                    <DropdownTrigger disabled={isEditing}>{selectedProduct?.name}</DropdownTrigger>
                    <DropdownContent className="w-full" />
                  </Dropdown>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">From Godown</label>
                    <Select value={form.from_godown_id} onValueChange={(v) => setForm({ ...form, from_godown_id: v })}>
                      <SelectTrigger className="w-full h-10"><SelectValue placeholder="Source" /></SelectTrigger>
                        <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Source</SelectLabel>
                          {activeGodowns.filter(g => g.godown_id !== form.to_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">To Godown</label>
                    <Select value={form.to_godown_id} onValueChange={(v) => setForm({ ...form, to_godown_id: v })}>
                      <SelectTrigger className="w-full h-10"><SelectValue placeholder="Destination" /></SelectTrigger>
                        <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Destination</SelectLabel>
                          {activeGodowns.filter(g => g.godown_id !== form.from_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {stockBalance !== null && (
                  <div className="bg-slate-50 rounded-lg px-3 py-1.5 text-sm text-amber-700">
                    {isEditing ? 'At time of entry' : 'Available at source'}: <span className="font-semibold">{(stockBalance || 0).toFixed(0)}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                    <Input type="number" step="1" min="0" placeholder="Qty" value={form.qty}
                      onChange={(e) => setForm({ ...form, qty: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                    <DatePicker value={form.txn_date}
                      onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
                  </div>
                </div>
              </div>
              {isEditing && (
                <div className="col-span-3 space-y-4">
                  <ImpactPreview loading={impactStatus === 'loading'} error={impactStatus === 'error'} data={impactData} productName={productName} />
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (isEditing ? 'Update Transfer' : 'Transfer Stock')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default TransferModal;
