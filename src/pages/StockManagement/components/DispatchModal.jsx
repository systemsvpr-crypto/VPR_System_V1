import { useState, useEffect } from 'react';
import { Truck, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { bulkAddManualDispatchStock, editTransaction, getStockBalance, getStockBalanceBeforeTxn, getAffectedTransactionsImpact } from '../../../services/stockService';
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

// Dispatch Out's own create-new flow picks by Grouping (Brand Name +
// Category) instead of one product at a time — choosing a Grouping shows
// every product in it with its own Select checkbox, Godown (defaulting to
// whichever active godown is literally named "Godown", independently
// changeable per row) and Quantity. There's no separate "add to list" step:
// every checked row live-previews right there in the checklist, and Save
// All submits exactly what's checked, straight to the database. Editing an
// existing dispatch keeps the original single Product + Qty picker (with
// its Impact Preview) unchanged. "Import Excel (Bulk)" is untouched.
const DispatchModal = ({ isOpen, onClose, onBulkClick, products, godowns, productStockMap = {}, user, onSuccess, editingTransaction }) => {
  const [form, setForm] = useState({
    product_id: '', godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [stockBalance, setStockBalance] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  // Grouping-picker state — which Grouping is chosen, and
  // per-product-in-that-grouping { checked, qty, godown_id } selections.
  const [selectedGrouping, setSelectedGrouping] = useState('');
  const [groupingRows, setGroupingRows] = useState({});

  const isEditing = !!editingTransaction;
  const useGroupingPicker = !isEditing;

  const activeGodowns = godowns
    .filter(g => g.is_active)
    .sort((a, b) => {
      const typeA = a.godown_type || 'Own';
      const typeB = b.godown_type || 'Own';
      if (typeA === typeB) return a.name.localeCompare(b.name);
      return typeA === 'Own' ? -1 : 1;
    });

  // Every checklist row defaults to whichever active godown is literally
  // named "Godown" (matched from the DB, case/whitespace-insensitive) until
  // it's explicitly changed for that row.
  const defaultGroupingGodownId = activeGodowns.find(g => g.name.trim().toLowerCase() === 'godown')?.godown_id || '';
  const getGroupingRowGodown = (productId) => groupingRows[productId]?.godown_id || defaultGroupingGodownId;

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
      setForm({ product_id: '', godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0] });
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
        godown_id: editingTransaction.godown_id,
        qty: String(Number(editingTransaction.qty)),
        // Show the real Dispatch Date (dispatch_plans.dispatch_date) when
        // this row is linked to a plan — not its txn_date, which is capped
        // at today and would otherwise silently overwrite a future dispatch
        // date with today's the moment this form is saved unchanged.
        txn_date: editingTransaction.dispatch_plans?.dispatch_date || editingTransaction.txn_date,
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

  // Switching Grouping starts its product checklist fresh — a checked
  // product/qty/godown from a previous Grouping shouldn't linger unseen.
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

  const setGroupingGodown = (productId, godownId) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], godown_id: godownId },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEditing) return; // Grouping picker's only save action is the Save All button.
    if (!form.product_id || !form.godown_id || form.qty === '' || form.qty === undefined || form.qty === null || Number(form.qty) < 0) {
      toast.error('All fields required with valid qty.');
      return;
    }
    setSubmitting(true);
    try {
      await editTransaction(editingTransaction.txn_id, { ...form, created_by: user?.user_id });
      toast.success('Dispatch entry updated');
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  // Grouping picker: reads straight from the current checklist (groupingRows)
  // — every checked product is validated and dispatched in one shot here.
  const handleSaveAll = async () => {
    if (!form.txn_date) { toast.error('Select a date.'); return; }

    const checkedRows = groupingProducts
      .filter(p => groupingRows[p.product_id]?.checked)
      .map(p => ({ product: p, qty: groupingRows[p.product_id]?.qty ?? '', godown_id: getGroupingRowGodown(p.product_id) }));

    if (checkedRows.length === 0) { toast.error('Select at least one product.'); return; }

    const missingGodownRow = checkedRows.find(({ godown_id }) => !godown_id);
    if (missingGodownRow) { toast.error(`Select a godown for ${missingGodownRow.product.name}.`); return; }

    const invalidRow = checkedRows.find(({ qty }) => qty === '' || Number(qty) <= 0);
    if (invalidRow) { toast.error(`Enter a valid quantity for ${invalidRow.product.name}.`); return; }

    setSubmitting(true);
    try {
      const payload = checkedRows.map(({ product, qty, godown_id }) => ({
        product_id: product.product_id,
        godown_id,
        qty,
        txn_date: form.txn_date,
        created_by: user?.user_id,
      }));
      await bulkAddManualDispatchStock(payload);
      toast.success(`Successfully dispatched ${payload.length} ${payload.length === 1 ? 'entry' : 'entries'}`);
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

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
                                <th className="px-3 py-2 w-32">Godown</th>
                                <th className="px-3 py-2 w-24">Quantity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {groupingProducts.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-xs">No products in this grouping.</td>
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
                                        value={getGroupingRowGodown(p.product_id)}
                                        onValueChange={(v) => setGroupingGodown(p.product_id, v)}
                                        options={activeGodowns.map(g => ({ value: g.godown_id, label: g.name }))}
                                        placeholder="Godown..."
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
                        {isEditing ? 'Stock at time of entry' : 'Available stock'}: <span className="font-semibold">{formatQty(balance)}</span>
                        {!sufficient && Number(form.qty) > 0 && <span className="ml-1">— insufficient</span>}
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
                <div className="col-span-3">
                  <ImpactPreview loading={impactStatus === 'loading'} error={impactStatus === 'error'} data={impactData} productName={productName} />
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            {!isEditing && onBulkClick && (
              <Button type="button" variant="outline" onClick={onBulkClick} className="mr-auto text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                <FileSpreadsheet size={16} className="mr-2 inline" />
                Import Excel (Bulk)
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {isEditing ? (
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Update Dispatch'}</Button>
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

export default DispatchModal;
