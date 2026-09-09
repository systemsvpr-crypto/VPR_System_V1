import { useState, useEffect, useMemo } from 'react';
import { Factory, PackagePlus, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { addFactoryStock, bulkAddFactoryStock, addProductionStock, bulkAddProductionStock, editTransaction, getStockBalance, getStockBalanceBeforeTxn, getAffectedTransactionsImpact } from '../../../services/stockService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import ImpactPreview from './ImpactPreview';
import BulkStockInModal from './BulkStockInModal';
import ProductModal from '../../Master/components/ProductModal';
import { sanitizeQtyInput, formatQty } from '@/lib/qty';
import { getProductGrouping } from '@/lib/productGrouping';

// Same form as Factory Stock In (Product, Godown, Qty, Date) — mode="production"
// switches only the title/icon and the txn_type actually saved (PRODUCTION_IN
// instead of IN_FACTORY). Editing an existing transaction is unaffected by
// `mode`: editTransaction keeps whatever txn_type the row already had, and
// StockManagement routes an existing PRODUCTION_IN row into a
// mode="production" instance so its title/icon still match.
//
// Godown IN's own create-new flow (non-production only) picks by Grouping
// (Brand Name + Category) instead of one product at a time — choosing a
// Grouping shows every product in it with its own Select checkbox, Godown
// and Quantity. There's no separate "add to list" step: every checked row
// live-previews below and Save All submits exactly what's checked, straight
// to the database. Editing and Production keep the original single
// Product + Qty + Add-to-list-then-Save-All picker unchanged.
const FactoryInModal = ({ isOpen, onClose, products, godowns, productStockMap = {}, user, onSuccess, onImportProducts, editingTransaction, mode = 'factory' }) => {
  const isProduction = mode === 'production';
  const [form, setForm] = useState({
    product_id: '', godown_id: '', qty: '', txn_date: new Date().toISOString().split('T')[0],
  });
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stockBalance, setStockBalance] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactStatus, setImpactStatus] = useState('idle');

  // Godown IN's Grouping-based picker state — which Grouping is chosen, and
  // per-product-in-that-grouping { checked, qty } selections.
  const [selectedGrouping, setSelectedGrouping] = useState('');
  const [groupingRows, setGroupingRows] = useState({});

  // Product created on the fly via "+ Add New Product" — kept alongside the
  // list loaded from the parent so it's immediately selectable here even
  // before the parent's own product list has synced back down.
  const [extraProducts, setExtraProducts] = useState([]);
  const [productQuickAddOpen, setProductQuickAddOpen] = useState(false);

  const allProducts = useMemo(() => {
    const map = new Map();
    [...products, ...extraProducts].forEach(p => map.set(p.product_id, p));
    return Array.from(map.values());
  }, [products, extraProducts]);

  const isEditing = !!editingTransaction;
  const isPurchaseIn = editingTransaction?.txn_type === 'PURCHASE_IN';
  // The Grouping picker applies to both Godown IN's and Production's
  // create-new flow — only editing an existing single transaction keeps the
  // original single-product form (with its Impact Preview).
  const useGroupingPicker = !isEditing;

  // Godown In / Production only ever post stock into a real "own" godown —
  // a transporter's auto-created stock-tracking godown is managed
  // automatically by the purchase/delivery pipeline while a lift is in
  // transit (see resolveGodownAllocations in purchaseService.js) and is
  // never a valid manual destination here, same rule TransactionTable's own
  // Godown filter already applies. Computed early since the Grouping
  // picker's default-godown lookup below needs it.
  const activeGodowns = godowns
    .filter(g => g.is_active)
    .sort((a, b) => {
      const typeA = a.godown_type || 'Own';
      const typeB = b.godown_type || 'Own';
      if (typeA === typeB) return a.name.localeCompare(b.name);
      return typeA === 'Own' ? -1 : 1;
    });
  const isOwnGodown = (g) => (g.godown_type || 'Own') === 'Own';
  const byGodownName = (a, b) => a.name.localeCompare(b.name);
  const ownGodowns = activeGodowns.filter(isOwnGodown).sort(byGodownName);

  const productGroupings = useMemo(() => {
    const names = new Set();
    allProducts.forEach(p => {
      const grouping = getProductGrouping(p);
      if (grouping) names.add(grouping);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allProducts]);

  const groupingProducts = useMemo(() => {
    if (!selectedGrouping) return [];
    return allProducts
      .filter(p => getProductGrouping(p) === selectedGrouping)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, selectedGrouping]);

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

  // New product saved from the "+ Add New Product" row inside the Product
  // dropdown — make it usable everywhere here and select it straight away,
  // same as picking an existing one.
  const handleProductQuickAdded = (product) => {
    setExtraProducts(prev => [...prev, product]);
    setForm(f => ({ ...f, product_id: product.product_id }));
    onImportProducts?.(product);
  };

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

  const setGroupingGodown = (productId, godownId) => {
    setGroupingRows(prev => ({
      ...prev,
      [productId]: { ...prev[productId], godown_id: godownId },
    }));
  };

  // Every row defaults to whichever active own-godown is literally named
  // "Godown" (matched from the DB, case/whitespace-insensitive) until it's
  // explicitly changed for that row — most stock still goes to the one
  // real Godown location, so this saves picking it product by product.
  const defaultGroupingGodownId = ownGodowns.find(g => g.name.trim().toLowerCase() === 'godown')?.godown_id || '';
  const getGroupingRowGodown = (productId) => groupingRows[productId]?.godown_id || defaultGroupingGodownId;

  // Grouping picker (both Godown In and Production create-new flows): reads
  // straight from the current checklist (groupingRows) — no separate staged
  // list, every checked row is validated and saved in one shot here.
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
      if (isProduction) {
        await bulkAddProductionStock(payload);
        toast.success(`Successfully added ${payload.length} production ${payload.length === 1 ? 'entry' : 'entries'}`);
      } else {
        await bulkAddFactoryStock(payload);
        toast.success(`Successfully added ${payload.length} stock ${payload.length === 1 ? 'entry' : 'entries'}`);
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEditing) {
      // The Grouping picker's only save action is the "Save All" button
      // (handleSaveAll) — an implicit Enter-key submit does nothing here.
      return;
    }
    if (!form.product_id || !form.godown_id || form.qty === '' || form.qty === undefined || form.qty === null || Number(form.qty) < 0) {
      toast.error('All fields required with valid qty.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form, created_by: user?.user_id };
      await editTransaction(editingTransaction.txn_id, payload);
      toast.success('Stock entry updated');
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  const editTitle = editingTransaction?.txn_type === 'OPEN_STOCK' ? 'Edit Opening Stock'
    : editingTransaction?.txn_type === 'ADJUSTMENT_IN' ? 'Edit Adjustment In'
    : editingTransaction?.txn_type === 'PURCHASE_IN' ? 'Edit Purchase In'
    : editingTransaction?.txn_type === 'PRODUCTION_IN' ? 'Edit Production'
    : 'Edit Godown IN';
  const selectedProduct = allProducts.find(p => p.product_id === form.product_id);
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
    <>
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className={isEditing ? "max-w-5xl" : "max-w-2xl"}>
        <ModalHeader>
          <div className={`p-2 rounded-lg ${isProduction ? 'bg-indigo-50' : 'bg-blue-50'}`}>
            {isProduction ? <PackagePlus size={20} className="text-indigo-600" /> : <Factory size={20} className="text-blue-600" />}
          </div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">{isEditing ? editTitle : (isProduction ? 'Production' : 'Godown IN')}</h2>
          </ModalTitle>
          {isEditing && (editingTransaction?.lifting_number || editingTransaction?.dispatch_number) && (
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-700">
                {editingTransaction.lifting_number || editingTransaction.dispatch_number}
              </span>
            </div>
          )}
          <ModalDescription className="sr-only">{isEditing ? `Editing ${editTitle}` : (isProduction ? 'Add production stock' : 'Add Godown IN')}</ModalDescription>
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
                                        options={ownGodowns.map(g => ({ value: g.godown_id, label: g.name }))}
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
                      <Dropdown value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} options={allProducts.map(p => ({ value: p.product_id, label: p.name }))} placeholder="Select Product" searchPlaceholder="Search products..." renderOption={renderProductOption} disabled={isEditing} contentClassName="w-full"
                        onAddNew={() => setProductQuickAddOpen(true)} addNewLabel="+ Add New Product">
                        {selectedProduct?.name}
                      </Dropdown>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Godown</label>
                      <Dropdown
                        value={form.godown_id}
                        onValueChange={(v) => setForm({ ...form, godown_id: v })}
                        options={ownGodowns.map(g => ({ value: g.godown_id, label: g.name }))}
                        placeholder="Select Godown"
                        searchPlaceholder="Search godowns..."
                        className="w-full h-10"
                        contentClassName="w-full"
                      />
                    </div>
                    {stockBalance !== null && (
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5 text-sm text-slate-600">
                        {isEditing ? 'Stock at time of entry' : 'Current stock'}: <span className="font-semibold">{formatQty(stockBalance)}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                        <div className="flex gap-2">
                          <Input type="number" step="0.01" min="0" placeholder="Qty" value={form.qty}
                            onChange={(e) => setForm({ ...form, qty: sanitizeQtyInput(e.target.value) })} className="flex-1" />
                          {selectedProduct?.unit && (
                            <Input type="text" disabled value={selectedProduct.unit} className="w-20 bg-slate-50 text-slate-500 font-semibold text-center border-slate-200 shadow-none shrink-0 disabled:opacity-80" />
                          )}
                        </div>
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
            {!isEditing && (
              <Button type="button" variant="outline" onClick={() => setBulkModalOpen(true)} className="mr-auto text-primary border-primary/20 hover:bg-primary/5">
                <FileSpreadsheet size={16} className="mr-2 inline" />
                Import Excel (Bulk)
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {isEditing ? (
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Update Stock'}</Button>
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

    <BulkStockInModal
      isOpen={bulkModalOpen}
      onClose={() => setBulkModalOpen(false)}
      user={user}
      products={allProducts}
      godowns={godowns}
      isProduction={isProduction}
      onImportProducts={onImportProducts}
      onSuccess={() => {
        onSuccess();
        onClose(); // Close the parent modal too if successful
      }}
    />

    <ProductModal
      isOpen={productQuickAddOpen}
      onClose={() => setProductQuickAddOpen(false)}
      onSuccess={handleProductQuickAdded}
      user={user}
      quickAdd
    />
    </>
  );
};

export default FactoryInModal;
