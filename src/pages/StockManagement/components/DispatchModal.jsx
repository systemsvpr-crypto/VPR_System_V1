import { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { dispatchStock, editTransaction, getStockBalance, getStockBalanceBeforeTxn, getAffectedTransactionsImpact } from '../../../services/stockService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import ImpactPreview from './ImpactPreview';

const DispatchModal = ({ isOpen, onClose, products, godowns, productStockMap = {}, user, onSuccess, editingTransaction }) => {
  const [form, setForm] = useState({
    product_id: '', godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [stockBalance, setStockBalance] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  const isEditing = !!editingTransaction;

  useEffect(() => {
    if (!isOpen) {
      setForm({ product_id: '', godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0] });
      setStockBalance(null);
      setImpactData(null);
      setImpactStatus('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingTransaction && isOpen) {
      setForm({
        product_id: editingTransaction.product_id,
        godown_id: editingTransaction.godown_id,
        qty: String(Number(editingTransaction.qty)),
        txn_date: editingTransaction.txn_date,
      });
    }
  }, [editingTransaction, isOpen]);

  useEffect(() => {
    if (form.product_id && form.godown_id) {
      if (isEditing) {
        getStockBalanceBeforeTxn(form.product_id, form.godown_id, editingTransaction.txn_id, editingTransaction.txn_date)
          .then(setStockBalance).catch(() => setStockBalance(null));
      } else {
        getStockBalance(form.product_id, form.godown_id).then(setStockBalance).catch(() => setStockBalance(null));
      }
    } else {
      setStockBalance(null);
    }
  }, [form.product_id, form.godown_id, isEditing]);

  useEffect(() => {
    if (!isEditing || !isOpen) {
      setImpactData(null);
      setImpactStatus('idle');
      return;
    }

    const t = setTimeout(async () => {
      if (!form.product_id || !form.godown_id) {
        setImpactData(null);
        setImpactStatus('idle');
        return;
      }

      setImpactStatus('loading');
      try {
        const newQty = Number(form.qty || 0);
        const newRow = {
          txn_id: 'new-correction',
          product_id: editingTransaction.product_id,
          godown_id: form.godown_id,
          txn_date: form.txn_date,
          txn_type: editingTransaction.txn_type,
          qty: newQty,
          created_at: new Date().toISOString(),
        };

        const godownChanged = form.godown_id !== editingTransaction.godown_id;
        const fromDate = form.txn_date < editingTransaction.txn_date ? form.txn_date : editingTransaction.txn_date;

        if (godownChanged) {
          const [oldImpact, newImpact] = await Promise.all([
            getAffectedTransactionsImpact(
              editingTransaction.product_id, editingTransaction.godown_id, editingTransaction.txn_date,
              { removeTxnIds: [editingTransaction.txn_id], addRows: [] }
            ),
            getAffectedTransactionsImpact(
              editingTransaction.product_id, form.godown_id, form.txn_date,
              { removeTxnIds: [], addRows: [newRow] }
            ),
          ]);
          setImpactData([
            { ...oldImpact, godownName: godowns.find(g => g.godown_id === editingTransaction.godown_id)?.name },
            { ...newImpact, godownName: godowns.find(g => g.godown_id === form.godown_id)?.name },
          ]);
        } else {
          const data = await getAffectedTransactionsImpact(
            editingTransaction.product_id, form.godown_id, fromDate,
            { removeTxnIds: [editingTransaction.txn_id], addRows: [newRow] }
          );
          setImpactData([{ ...data, godownName: godowns.find(g => g.godown_id === form.godown_id)?.name }]);
        }
        setImpactStatus('done');
      } catch (e) {
        console.error('Impact preview error:', e);
        setImpactStatus('error');
      }
    }, 500);

    return () => clearTimeout(t);
  }, [form.qty, form.godown_id, form.txn_date, isOpen, isEditing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.godown_id || form.qty === '' || form.qty === undefined || form.qty === null || Number(form.qty) < 0) {
      toast.error('All fields required with valid qty.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingTransaction) {
        await editTransaction(editingTransaction.txn_id, { ...form, created_by: user?.user_id });
        toast.success('Dispatch entry updated');
      } else {
        await dispatchStock({ ...form, created_by: user?.user_id });
        toast.success('Stock dispatched successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const activeGodowns = godowns.filter(g => g.is_active);
  const balance = stockBalance !== null ? (stockBalance || 0) : null;
  const sufficient = balance !== null && Number(form.qty) > 0 && balance >= Number(form.qty);
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
          <div className="bg-rose-50 p-2 rounded-lg"><Truck size={20} className="text-rose-600" /></div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">
              {isEditing ? 'Edit Dispatch Out' : 'Dispatch Out'}
            </h2>
          </ModalTitle>
          {isEditing && editingTransaction?.dispatch_number && (
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-700">
                {editingTransaction.dispatch_number}
              </span>
            </div>
          )}
          <ModalDescription className="sr-only">{isEditing ? 'Editing dispatch out entry' : 'Dispatch stock out'}</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className={isEditing ? "grid grid-cols-5 gap-6" : ""}>
              <div className={isEditing ? "col-span-2 space-y-4" : "space-y-4"}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                  <Dropdown value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} options={products.map(p => ({ value: p.product_id, label: p.name }))} placeholder="Select Product" renderOption={renderProductOption} disabled={isEditing} contentClassName="w-full">
                    {selectedProduct?.name}
                  </Dropdown>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Godown</label>
                  <Select value={form.godown_id} onValueChange={(v) => setForm({ ...form, godown_id: v })}>
                    <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Godown</SelectLabel>
                          {activeGodowns.map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                {balance !== null && (
                  <div className={`rounded-lg px-3 py-1.5 text-sm ${sufficient ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'}`}>
                    {isEditing ? 'Stock at time of entry' : 'Available stock'}: <span className="font-semibold">{balance.toFixed(0)}</span>
                    {!sufficient && Number(form.qty) > 0 && <span className="ml-1">— insufficient</span>}
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
                <div className="col-span-3">
                  <ImpactPreview loading={impactStatus === 'loading'} error={impactStatus === 'error'} data={impactData} productName={productName} />
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (isEditing ? 'Update Dispatch' : 'Dispatch Out')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default DispatchModal;
