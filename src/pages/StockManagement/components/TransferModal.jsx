import { useState, useEffect } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { bulkTransferStock, editTransfer, getStockBalance, getStockBalanceBeforeTxn, getAffectedTransactionsImpact } from '../../../services/stockService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import ImpactPreview from './ImpactPreview';
import { sanitizeQtyInput, formatQty } from '@/lib/qty';
import { getProductGrouping } from '@/lib/productGrouping';

// Create-new Transfer picks by Grouping (Brand Name + Category) instead of
// one product at a time — choosing a Grouping shows every product in it
// with its own Select checkbox, From Godown, To Godown and Quantity, so
// different products in the same batch can move between different
// godown pairs. Date is the only field shared across the whole batch.
// Save All validates and moves every checked product straight to the
// database in one call — no separate "add to list" step. Editing an
// existing transfer keeps the original single Product + Qty picker (with
// its Impact Preview) unchanged.
const TransferModal = ({ isOpen, onClose, products, godowns, productStockMap = {}, user, onSuccess, editingTransaction }) => {
  const [form, setForm] = useState({
    product_id: '', from_godown_id: '', to_godown_id: '', qty: '',
    txn_date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [stockBalance, setStockBalance] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  // Grouping-picker state — which Grouping is chosen, and
  // per-product-in-that-grouping { checked, qty } selections.
  const [selectedGrouping, setSelectedGrouping] = useState('');
  const [groupingRows, setGroupingRows] = useState({});

  const isEditing = !!editingTransaction;
  const useGroupingPicker = !isEditing;

  // Own godowns listed first (the common case), then Transporter
  // stock-tracking godowns below — same grouping/order used elsewhere
  // (e.g. FactoryInModal's godown picker) so the two lists read consistently.
  const activeGodowns = godowns.filter(g => g.is_active);
  const isOwnGodown = (g) => (g.godown_type || 'Own') === 'Own';
  const byGodownName = (a, b) => a.name.localeCompare(b.name);
  const ownGodowns = activeGodowns.filter(isOwnGodown).sort(byGodownName);
  const transporterGodowns = activeGodowns.filter(g => !isOwnGodown(g)).sort(byGodownName);
  const sortedGodowns = [...ownGodowns, ...transporterGodowns];

  const productGroupings = (() => {
    const names = new Set();
    products.forEach(p => {
      const grouping = getProductGrouping(p);
      if (grouping) names.add(grouping);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  })();

  const groupingProducts = selectedGrouping
    ? products.filter(p => getProductGrouping(p) === selectedGrouping).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  useEffect(() => {
    if (!isOpen) {
      setForm({ product_id: '', from_godown_id: '', to_godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0] });
      setSelectedGrouping('');
      setGroupingRows({});
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

  // Switching Grouping starts its product checklist fresh — a checked
  // product/qty from a previous Grouping shouldn't linger unseen.
  const handleGroupingChange = (value) => {
    setSelectedGrouping(value);
    setGroupingRows({});
  };

  const toggleGroupingProduct = (productId) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], checked: !prev[productId]?.checked },
    }));
  };

  const allGroupingProductsChecked = groupingProducts.length > 0 && groupingProducts.every(p => groupingRows[p.product_id]?.checked);

  const toggleSelectAllGroupingProducts = (selectAll) => {
    setGroupingRows(prev => {
      const next = { ...prev };
      groupingProducts.forEach(p => {
        next[p.product_id] = { ...next[p.product_id], checked: selectAll };
      });
      return next;
    });
  };

  const setGroupingQty = (productId, value) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], qty: sanitizeQtyInput(value) },
    }));
  };

  const setGroupingFromGodown = (productId, godownId) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], from_godown_id: godownId },
    }));
  };

  const setGroupingToGodown = (productId, godownId) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], to_godown_id: godownId },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.from_godown_id || !form.to_godown_id || form.qty === '' || form.qty === undefined || form.qty === null || Number(form.qty) < 0) {
      toast.error('All fields required with valid qty.');
      return;
    }
    if (form.from_godown_id === form.to_godown_id) { toast.error('Source and destination must be different.'); return; }
    setSubmitting(true);
    try {
      await editTransfer(editingTransaction.pair_id, { ...form, created_by: user?.user_id });
      toast.success('Transfer updated');
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  // Grouping picker: reads straight from the current checklist (groupingRows)
  // — every checked product carries its own From/To Godown, so different
  // products can move between different godown pairs in the same batch;
  // only Date is shared. Each row is validated and transferred in one shot.
  const handleSaveAll = async () => {
    if (!form.txn_date) { toast.error('Select a date.'); return; }

    const checkedRows = groupingProducts
      .filter(p => groupingRows[p.product_id]?.checked)
      .map(p => ({
        product: p,
        qty: groupingRows[p.product_id]?.qty ?? '',
        from_godown_id: groupingRows[p.product_id]?.from_godown_id || '',
        to_godown_id: groupingRows[p.product_id]?.to_godown_id || '',
      }));

    if (checkedRows.length === 0) { toast.error('Select at least one product.'); return; }

    const missingFromRow = checkedRows.find(({ from_godown_id }) => !from_godown_id);
    if (missingFromRow) { toast.error(`Select a source godown for ${missingFromRow.product.name}.`); return; }

    const missingToRow = checkedRows.find(({ to_godown_id }) => !to_godown_id);
    if (missingToRow) { toast.error(`Select a destination godown for ${missingToRow.product.name}.`); return; }

    const sameGodownRow = checkedRows.find(({ from_godown_id, to_godown_id }) => from_godown_id === to_godown_id);
    if (sameGodownRow) { toast.error(`Source and destination must be different for ${sameGodownRow.product.name}.`); return; }

    const invalidRow = checkedRows.find(({ qty }) => qty === '' || Number(qty) <= 0);
    if (invalidRow) { toast.error(`Enter a valid quantity for ${invalidRow.product.name}.`); return; }

    setSubmitting(true);
    try {
      const payload = checkedRows.map(({ product, qty, from_godown_id, to_godown_id }) => ({
        product_id: product.product_id,
        productName: product.name,
        from_godown_id,
        to_godown_id,
        qty,
        txn_date: form.txn_date,
      }));
      const result = await bulkTransferStock(payload, user?.user_id);
      if (result.errorCount > 0) {
        toast.error(`${result.errorCount} row${result.errorCount === 1 ? '' : 's'} failed: ${result.errors[0].message}${result.errorCount > 1 ? ' (and more)' : ''}`);
      }
      if (result.successCount > 0) {
        toast.success(`Transferred ${result.successCount} product${result.successCount === 1 ? '' : 's'} successfully`);
        onClose();
        onSuccess();
      }
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

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
        <form onSubmit={isEditing ? handleSubmit : (e) => e.preventDefault()}>
          <ModalBody>
            <div className={isEditing ? "grid grid-cols-5 gap-6" : ""}>
              <div className={isEditing ? "col-span-2 space-y-4" : "space-y-4"}>
                {useGroupingPicker ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                      <Dropdown
                        value={selectedGrouping}
                        onValueChange={handleGroupingChange}
                        options={productGroupings.map(g => ({ value: g, label: g }))}
                        placeholder="Select Grouping"
                        searchPlaceholder="Search groupings..."
                        className="w-full h-10"
                        contentClassName="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <DatePicker value={form.txn_date}
                        onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
                    </div>
                    {selectedGrouping && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs sticky top-0">
                              <tr>
                                <th className="px-3 py-2 w-12 text-center">
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <span>Select</span>
                                    <input type="checkbox" checked={allGroupingProductsChecked} onChange={(e) => toggleSelectAllGroupingProducts(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                                  </div>
                                </th>
                                <th className="px-3 py-2">Product Name</th>
                                <th className="px-3 py-2 w-28">From Godown</th>
                                <th className="px-3 py-2 w-28">To Godown</th>
                                <th className="px-3 py-2 w-24">Quantity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {groupingProducts.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-4 text-center text-slate-400 text-xs">No products in this grouping.</td>
                                </tr>
                              ) : groupingProducts.map(p => {
                                const row = groupingRows[p.product_id] || {};
                                const stockEntries = productStockMap[p.product_id];
                                return (
                                  <tr key={p.product_id} className={row.checked ? 'bg-primary/5' : ''}>
                                    <td className="px-3 py-2 text-center">
                                      <input type="checkbox" checked={!!row.checked}
                                        onChange={() => toggleGroupingProduct(p.product_id)}
                                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-slate-800">{p.name}</div>
                                      {stockEntries?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {stockEntries.map((s, i) => (
                                            <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${s.badge}`}>
                                              {s.godownName}: {s.qty}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <Dropdown
                                        value={row.from_godown_id || ''}
                                        onValueChange={(v) => setGroupingFromGodown(p.product_id, v)}
                                        options={sortedGodowns.filter(g => g.godown_id !== row.to_godown_id).map(g => ({ value: g.godown_id, label: g.name }))}
                                        placeholder="From..."
                                        searchPlaceholder="Search godowns..."
                                        className="w-full h-8 text-xs"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Dropdown
                                        value={row.to_godown_id || ''}
                                        onValueChange={(v) => setGroupingToGodown(p.product_id, v)}
                                        options={sortedGodowns.filter(g => g.godown_id !== row.from_godown_id).map(g => ({ value: g.godown_id, label: g.name }))}
                                        placeholder="To..."
                                        searchPlaceholder="Search godowns..."
                                        className="w-full h-8 text-xs"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input type="text" inputMode="decimal" placeholder="Qty"
                                        value={row.qty || ''}
                                        onChange={(e) => setGroupingQty(p.product_id, e.target.value)}
                                        className="h-8 text-xs text-center w-20" />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                      <Dropdown value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} options={products.map(p => ({ value: p.product_id, label: p.name }))} placeholder="Select Product" renderOption={renderProductOption} disabled={isEditing} contentClassName="w-full">
                        {selectedProduct?.name}
                      </Dropdown>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">From Godown</label>
                        <Select value={form.from_godown_id} onValueChange={(v) => setForm({ ...form, from_godown_id: v })}>
                          <SelectTrigger className="w-full h-10"><SelectValue placeholder="Source" /></SelectTrigger>
                            <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Own</SelectLabel>
                              {ownGodowns.filter(g => g.godown_id !== form.to_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                            </SelectGroup>
                            {transporterGodowns.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Transporter</SelectLabel>
                                {transporterGodowns.filter(g => g.godown_id !== form.to_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">To Godown</label>
                        <Select value={form.to_godown_id} onValueChange={(v) => setForm({ ...form, to_godown_id: v })}>
                          <SelectTrigger className="w-full h-10"><SelectValue placeholder="Destination" /></SelectTrigger>
                            <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Own</SelectLabel>
                              {ownGodowns.filter(g => g.godown_id !== form.from_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                            </SelectGroup>
                            {transporterGodowns.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Transporter</SelectLabel>
                                {transporterGodowns.filter(g => g.godown_id !== form.from_godown_id).map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {stockBalance !== null && (
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5 text-sm text-amber-700">
                        {isEditing ? 'At time of entry' : 'Available at source'}: <span className="font-semibold">{formatQty(stockBalance)}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                        <Input type="number" step="0.01" min="0" placeholder="Qty" value={form.qty}
                          onChange={(e) => setForm({ ...form, qty: sanitizeQtyInput(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                        <DatePicker value={form.txn_date}
                          onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}
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
            {isEditing ? (
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Update Transfer'}</Button>
            ) : (
              <Button type="button" onClick={handleSaveAll}
                disabled={submitting || !groupingProducts.some(p => groupingRows[p.product_id]?.checked)}>
                {submitting ? 'Saving...' : 'Save All'}
              </Button>
            )}
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default TransferModal;
