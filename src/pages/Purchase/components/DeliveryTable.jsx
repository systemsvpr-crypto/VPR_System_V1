import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Check, History, Clock, Search, Zap, ArrowRightLeft, ChevronLeft, ChevronRight, Trash2, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  getApprovedItemsForDelivery,
  getAawakDeliveries,
  createDelivery,
  cancelIndentItem,
  getPackagingSize,
  deleteIndentItem,
  deleteDelivery,
} from '../../../services/purchaseService';
import { getGroupNameFromItem } from '../../../services/productGroupingService';
import { sendPurchaseDeliveredWhatsapp } from '../../../services/whatsappService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { roundQty } from '@/lib/qty';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Bag <-> Kg conversion. Dispatch Qty is entered in whichever unit the row's
// Dispatch Unit dropdown is set to (`fromUnit`, defaulting to the product's
// master unit) — whichever of Bag/Kg matches that entry unit just mirrors
// Dispatch Qty as-is, the other is derived from it using THIS row's own
// Pkg/Bag figure as the kg-per-bag factor. Both values get stored.
const convertDispatchQty = (qty, fromUnit, targetUnit, pkgSize) => {
  const amount = Number(qty) || 0;
  const mux = Number(pkgSize) || 0;
  const from = (fromUnit || '').toLowerCase();
  const target = (targetUnit || from).toLowerCase();
  if (!from || target === from) return amount;
  if (from === 'bag' && target === 'kg') return mux > 0 ? amount * mux : amount;
  if (from === 'kg' && target === 'bag') return mux > 0 ? amount / mux : amount;
  return amount;
};

const IndentTypeBadge = ({ processType }) => (
  processType === 'direct' ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-100">
      <Zap size={10} /> Direct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-blue-50 text-blue-700 border border-blue-100">
      <ArrowRightLeft size={10} /> Process
    </span>
  )
);

const DeliveryTable = ({ transporters = [], user, godowns = [], groups = [] }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' | 'history'
  const [items, setItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [indentFilter, setIndentFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [rowEdits, setRowEdits] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('purchase_view_mode', mode);
  };

  // Transporter-type godowns are stock-tracking placeholders, never a valid
  // fallback final destination — only an Own godown may be defaulted to.
  const ownGodowns = useMemo(() =>
    godowns.filter(g => (g.godown_type || 'Own') === 'Own'),
    [godowns],
  );

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, indentFilter, productFilter, vendorFilter, activeSubTab, pageSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [approvedData, historyData] = await Promise.all([
        getApprovedItemsForDelivery(),
        getAawakDeliveries(),
      ]);
      setItems(approvedData.filter(i =>
        i.planning_status !== 'Cancelled' && Number(i.remaining_alloc_qty ?? i.remaining_qty ?? 0) > 0
      ));
      setHistoryItems(historyData || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load delivery data');
      setItems([]);
      setHistoryItems([]);
    }
    setLoading(false);
  };

  const indentOptions = useMemo(() => {
    const map = new Map();
    const targetList = activeSubTab === 'pending' ? items : historyItems;
    targetList.forEach(i => {
      const num = activeSubTab === 'pending'
        ? i.purchase_indents?.indent_number
        : i.purchase_indent_items?.purchase_indents?.indent_number;
      if (num) map.set(num, num);
    });
    return Array.from(map.values());
  }, [items, historyItems, activeSubTab]);

  const productOptions = useMemo(() => {
    const map = new Map();
    if (activeSubTab === 'pending') {
      items.forEach(i => {
        if (i.product_id && i.products?.name) {
          map.set(String(i.product_id), i.products.name);
        }
      });
    } else {
      historyItems.forEach(h => {
        const p = h.purchase_indent_items?.products;
        if (p?.name) map.set(p.name, p.name);
      });
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items, historyItems, activeSubTab]);

  const vendorOptions = useMemo(() => {
    const map = new Map();
    items.forEach(i => {
      const vId = i.approved_vendor_id || i.item_vendor?.vendor_id || i.vendor_id;
      const vName = i.approved_vendor?.name || i.item_vendor?.name;
      if (vId && vName) map.set(String(vId), vName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      const indent = item.purchase_indents || {};
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const matchProduct = !productFilter || String(item.product_id) === productFilter;
      const itemVendorId = item.approved_vendor_id || item.item_vendor?.vendor_id || item.vendor_id;
      const matchVendor = !vendorFilter || String(itemVendorId) === vendorFilter;
      const pName = item.products?.name?.toLowerCase() || '';
      const vName = (item.approved_vendor?.name || item.item_vendor?.name || '').toLowerCase();
      const iNum = (indent.indent_number || '').toLowerCase();
      const gName = getGroupNameFromItem(item, groups);
      const matchSearch = !term || iNum.includes(term) || pName.includes(term) || (gName && gName !== '—' && gName.toLowerCase().includes(term)) || vName.includes(term);
      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [items, indentFilter, productFilter, vendorFilter, searchTerm, groups]);

  const filteredHistoryItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return historyItems.filter(h => {
      const indent = h.purchase_indent_items?.purchase_indents || {};
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const pName = h.purchase_indent_items?.products?.name || '';
      const matchProduct = !productFilter || pName === productFilter || String(h.purchase_indent_items?.product_id) === productFilter;
      const tName = h.transporters?.name || '';
      const matchVendor = !vendorFilter || tName === vendorFilter;
      const vName = (h.purchase_indent_items?.approved_vendor?.name || h.purchase_indent_items?.item_vendor?.name || '').toLowerCase();
      const iNum = indent.indent_number || h.lifting_number || '';
      const gName = getGroupNameFromItem(h, groups) || getGroupNameFromItem(h.purchase_indent_items, groups);
      const matchSearch = !term || iNum.toLowerCase().includes(term) || pName.toLowerCase().includes(term) || (gName && gName !== '—' && gName.toLowerCase().includes(term)) || vName.toLowerCase().includes(term) || tName.toLowerCase().includes(term);
      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [historyItems, indentFilter, productFilter, vendorFilter, searchTerm, groups]);

  const currentList = activeSubTab === 'pending' ? filteredItems : filteredHistoryItems;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const currentPageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return currentList.slice(start, start + pageSize);
  }, [currentList, currentPage, pageSize]);

  const getRowVal = (itemId, field, defaultVal = '') => {
    const edit = rowEdits[itemId];
    if (edit && edit[field] !== undefined) return edit[field];
    return defaultVal;
  };

  const setRowVal = (itemId, field, value) => {
    setRowEdits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  // Picking a Transporter for one row applies it to every other row that's
  // currently checkbox-selected too — same convention as Dispatch Date on
  // the Dispatch Planning page.
  const handleTransporterChange = (itemId, transporterId) => {
    const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(transporterId));
    setRowEdits(prev => {
      const next = { ...prev };
      const targets = new Set(selectedItems);
      targets.add(itemId);
      targets.forEach(id => {
        const current = next[id] || {};
        next[id] = {
          ...current,
          transporter_id: transporterId,
          vehicle_number: transporterId ? (selectedTransporter?.vehicle_number || current.vehicle_number || '') : '',
          driver_phone_number: transporterId ? (selectedTransporter?.driver_phone_number || current.driver_phone_number || '') : '',
          lr_number: transporterId ? (current.lr_number || '') : '',
        };
      });
      return next;
    });
  };

  // Same "applies to every selected row" convention for Exp. Date, LR No.,
  // Vehicle No. and Driver No.
  const setFieldForSelected = (itemId, field, value) => {
    setRowEdits(prev => {
      const next = { ...prev };
      const targets = new Set(selectedItems);
      targets.add(itemId);
      targets.forEach(id => { next[id] = { ...next[id], [field]: value }; });
      return next;
    });
  };

  const handleReceivedQtyChange = (item, val) => {
    setRowEdits(prev => ({
      ...prev,
      [item.item_id]: {
        ...prev[item.item_id],
        del_qty_kg: val,
      },
    }));
  };

  // Switching Dispatch Unit re-bases whatever Dispatch Qty is currently
  // showing into the newly picked unit (e.g. 20 bags becomes 640 when
  // switching to Kg) so a stale number typed in the old unit doesn't linger
  // under a new one.
  const handleDispatchUnitChange = (item, newUnit) => {
    const masterUnit = (item.products?.unit || '').toLowerCase();
    const pkgSize = getRowVal(item.item_id, 'packaging_size', getPackagingSize(item.products));
    const currentUnit = getRowVal(item.item_id, 'dispatch_unit', masterUnit);
    const currentQty = getRowVal(item.item_id, 'del_qty_kg', String(item.remaining_alloc_qty ?? item.remaining_qty ?? ''));
    const requantified = convertDispatchQty(currentQty, currentUnit, newUnit, pkgSize);
    setRowEdits(prev => ({
      ...prev,
      [item.item_id]: {
        ...prev[item.item_id],
        dispatch_unit: newUnit,
        del_qty_kg: requantified ? String(Math.round(requantified * 100) / 100) : '',
      },
    }));
  };

  const currentIdField = activeSubTab === 'pending' ? 'item_id' : 'delivery_id';

  const toggleSelect = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const ids = currentPageItems.map(i => i[currentIdField]);
    if (ids.length > 0 && ids.every(id => selectedItems.has(id))) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const allSelected = currentPageItems.length > 0 && currentPageItems.every(i => selectedItems.has(i[currentIdField]));

  const handleSubmitDeliveries = async () => {
    const toSubmitIds = [...selectedItems];
    if (toSubmitIds.length === 0) {
      toast.error('Please select at least one item using the checkbox to submit delivery.');
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    const successfulDeliveries = [];
    // Only a row that actually submits drops out of selection/edits — one
    // that fails validation or the API call stays checked with whatever was
    // typed still in place, so the user just fixes that field and retries
    // instead of redoing every field on the row.
    const savedIds = new Set();

    // Auto-fallback: if the user only fills out Transporter/LR No/Exp Date on the first row,
    // apply it to the other selected rows automatically.
    let fallbackTransporterId = null;
    let fallbackTransporterName = '-';
    let fallbackLrNumber = null;
    let fallbackExpDate = null;
    
    for (const itemId of toSubmitIds) {
      const edit = rowEdits[itemId];
      if (!fallbackTransporterId && edit?.transporter_id) {
        fallbackTransporterId = edit.transporter_id;
        const t = transporters.find(x => String(x.transporter_id) === String(edit.transporter_id));
        if (t) fallbackTransporterName = t.name;
      }
      if (!fallbackLrNumber && edit?.lr_number) {
        fallbackLrNumber = edit.lr_number;
      }
      if (!fallbackExpDate && edit?.exp_date) {
        fallbackExpDate = edit.exp_date;
      }
      if (fallbackTransporterId && fallbackLrNumber && fallbackExpDate) break;
    }

    for (const itemId of toSubmitIds) {
      const item = items.find(i => i.item_id === itemId);
      if (!item) continue;
      const edit = rowEdits[itemId] || {};
      const pendingQty = Number(item.remaining_alloc_qty ?? item.remaining_qty ?? 0);
      // Dispatch Qty is prefilled with the Pending Qty on screen even before the
      // user touches the field — fall back to that same default here so an
      // untouched row still submits with the value actually shown.
      const delQty = edit.del_qty_kg !== undefined && edit.del_qty_kg !== '' ? Number(edit.del_qty_kg) : pendingQty;

      if (delQty <= 0) {
        toast.error(`Please enter valid Dispatch Qty for indent ${item.purchase_indents?.indent_number}`);
        continue;
      }

      // Removed validation blocking delQty > pendingQty as requested


      const packagingSize = edit.packaging_size !== undefined && edit.packaging_size !== '' ? Number(edit.packaging_size) : getPackagingSize(item.products);

      // Dispatch Qty is entered in whichever unit the row's Dispatch Unit
      // dropdown is set to (defaults to the product's master unit) — the
      // matching Bag/Kg column just mirrors it, the other is derived via
      // this row's own Pkg/Bag figure. Both get stored.
      const masterUnit = (item.products?.unit || '').toLowerCase();
      const dispatchUnit = edit.dispatch_unit || masterUnit;
      const dispatchQtyBag = convertDispatchQty(delQty, dispatchUnit, 'bag', packagingSize);
      const dispatchQtyKg = convertDispatchQty(delQty, dispatchUnit, 'kg', packagingSize);
      // Stock deduction (received_quantity) always has to be in the
      // product's real master unit, regardless of which unit this dispatch
      // was actually typed in. Kept at up to 2 decimal places (not forced
      // to a whole number) — received_quantity and purchase_delivery_godowns.qty
      // are allowed to be fractional; whole-number rounding only has to
      // happen right at the point a qty is actually posted to transactions
      // (which has the chk_qty_integer constraint) — see ensureLiftPurchaseIn
      // and the Arrived-status branches in purchaseService.js.
      const masterQty = roundQty(masterUnit === 'kg' ? dispatchQtyKg : dispatchQtyBag);

      const defaultGodownId = item.approved_godown_id || item.purchase_indents?.godown_id || ownGodowns[0]?.godown_id;

      const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(edit.transporter_id));

      const tId = edit.transporter_id || fallbackTransporterId || null;
      const tName = edit.transporter_id ? (selectedTransporter?.name || '-') : fallbackTransporterName;
      const lrNum = edit.lr_number || fallbackLrNumber || null;

      if (!lrNum) {
        toast.error(`Please enter LR Number for indent ${item.purchase_indents?.indent_number}`);
        continue;
      }

      try {
        await createDelivery({
          item_id: item.item_id,
          indent_id: item.purchase_indents?.indent_id,
          delivery_date: new Date().toISOString().slice(0, 10),
          group_id: item.group_id || item.products?.group_id || item.purchase_indents?.group_id || null,
          expected_delivery_date: edit.exp_date !== undefined ? edit.exp_date : (fallbackExpDate || item.planning_date || null),
          godown_allocations: defaultGodownId ? [{ godown_id: defaultGodownId, qty: masterQty }] : [],
          transporter_id: tId,
          lr_number: lrNum,
          vehicle_number: edit.vehicle_number || (edit.transporter_id ? selectedTransporter?.vehicle_number : null) || null,
          driver_phone_number: edit.driver_phone_number || (edit.transporter_id ? selectedTransporter?.driver_phone_number : null) || null,
          remarks: edit.remarks || null,
          packaging_size: packagingSize,
          dispatch_unit: dispatchUnit,
          dispatch_qty_bag: dispatchQtyBag,
          dispatch_qty_kg: dispatchQtyKg,
          created_by: user?.user_id,
          status: 'In Transit',
        });
        successCount++;
        savedIds.add(itemId);
        successfulDeliveries.push({
          lrNumber: lrNum,
          transporterId: tId,
          transporterName: tName,
          date: new Date().toISOString().slice(0, 10),
          productName: item.products?.name || 'Product',
          unit: dispatchUnit,
          delQty,
          dispatchQtyBag,
          dispatchQtyKg,
        });
      } catch (err) {
        toast.error(`Failed for ${item.purchase_indents?.indent_number}: ${err.message}`);
      }
    }

    if (successfulDeliveries.length > 0) {
      const groupedByLR = successfulDeliveries.reduce((acc, curr) => {
        const key = curr.lrNumber || 'NO_LR';
        if (!acc[key]) acc[key] = [];
        acc[key].push(curr);
        return acc;
      }, {});

      for (const [lrKey, group] of Object.entries(groupedByLR)) {
        const lrNumber = lrKey === 'NO_LR' ? '-' : lrKey;
        const transporterName = group[0].transporterName;
        const date = group[0].date;
        
        let productDetails = '';
        let totalBag = 0;
        let totalKg = 0;
        let totalLot = 0;

        group.forEach((p, idx) => {
          const pBag = Number(p.dispatchQtyBag) || 0;
          const pKg = Number(p.dispatchQtyKg) || 0;
          const pLot = Number(p.delQty) || 0;
          
          productDetails += `${idx > 0 ? ' , ' : ''}Product ${idx + 1} :- ${p.productName} (${p.delQty}${p.unit ? ' ' + p.unit : ''}) Total Bag : ${pBag}, Total KG: ${pKg}, Total Lot: ${pLot}`;
          
          totalBag += pBag;
          totalKg += pKg;
          totalLot += pLot;
        });
        
        const totalValuesStr = `Total: ${totalBag} bag, ${totalKg} KG, ${totalLot} Lot`;
        
        try {
          console.log('DeliveryTable - about to call sendPurchaseDeliveredWhatsapp for LR:', lrNumber);
          console.log('Group details:', { transporterName, date, productDetails: productDetails.trim(), totalValuesStr });
          await sendPurchaseDeliveredWhatsapp({
            transporterName,
            lrNumber,
            date,
            productDetails: productDetails.trim(),
            totalValuesStr,
          });
        } catch (err) {
          console.error('WhatsApp Error:', err);
        }
      }
    }

    setSubmitting(false);
    if (successCount > 0) {
      toast.success(`${successCount} delivery lift${successCount !== 1 ? 's' : ''} submitted successfully!`);
      setSelectedItems(prev => { const next = new Set(prev); savedIds.forEach(id => next.delete(id)); return next; });
      setRowEdits(prev => { const next = { ...prev }; savedIds.forEach(id => { delete next[id]; }); return next; });
      loadData();
    }
  };

  const handleDeletePendingItem = async (item) => {
    const pName = item.products?.name || 'this product';
    const iNum = item.purchase_indents?.indent_number || '';
    if (!window.confirm(`Permanently delete "${pName}"${iNum ? ` from indent "${iNum}"` : ''}? This cannot be undone.`)) return;
    try {
      await deleteIndentItem(item.item_id);
      toast.success('Item deleted');
      setItems(prev => prev.filter(i => i.item_id !== item.item_id));
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const handleDeleteDelivery = async (del) => {
    const liftNum = del.lifting_number || del.delivery_id;
    if (!window.confirm(`Permanently delete delivery lift "${liftNum}"? This cannot be undone.`)) return;
    try {
      await deleteDelivery(del.delivery_id);
      toast.success('Delivery lift deleted');
      setHistoryItems(prev => prev.filter(d => d.delivery_id !== del.delivery_id));
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete delivery');
    }
  };

  const handleDeleteSelected = async () => {
    const toDeleteIds = Array.from(selectedItems);
    if (toDeleteIds.length === 0) return;

    if (activeSubTab === 'pending') {
      if (!window.confirm(`Are you sure you want to permanently delete ${toDeleteIds.length} selected pending item(s)? This cannot be undone.`)) {
        return;
      }
      setDeletingSelected(true);
      let success = 0;
      for (const id of toDeleteIds) {
        try {
          await deleteIndentItem(id);
          success++;
        } catch (err) {
          console.error('Failed to delete pending item', id, err);
        }
      }
      setDeletingSelected(false);
      if (success > 0) {
        toast.success(`Successfully deleted ${success} item(s)`);
        setSelectedItems(new Set());
        loadData();
      } else {
        toast.error('Failed to delete selected items');
      }
    } else {
      if (!window.confirm(`Are you sure you want to permanently delete ${toDeleteIds.length} selected delivery lift(s)? This will revert inventory transactions and cannot be undone.`)) {
        return;
      }
      setDeletingSelected(true);
      let success = 0;
      for (const id of toDeleteIds) {
        try {
          await deleteDelivery(id);
          success++;
        } catch (err) {
          console.error('Failed to delete delivery', id, err);
        }
      }
      setDeletingSelected(false);
      if (success > 0) {
        toast.success(`Successfully deleted ${success} delivery lift(s)`);
        setSelectedItems(new Set());
        loadData();
      } else {
        toast.error('Failed to delete selected deliveries');
      }
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setIndentFilter('');
    setProductFilter('');
    setVendorFilter('');
  };

  const renderStatusBadge = (status) => {
    if (status === 'In Transit') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
          In Transit
        </span>
      );
    }
    if (status === 'In Transport Godown' || status === 'AT TPT GDN') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
          AT TPT GDN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        Arrived
      </span>
    );
  };

  const renderPendingCards = () => (
    <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 p-4 bg-slate-50/50">
      {currentList.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">No approved deliveries available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {currentPageItems.map(item => {
            const indent = item.purchase_indents || {};
            const isSelected = selectedItems.has(item.item_id);
            const pkgSize = getPackagingSize(item.products);
            const transpId = getRowVal(item.item_id, 'transporter_id');
            const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(transpId));

            const masterUnit = (item.products?.unit || '').toLowerCase();
            const currentPkgSize = getRowVal(item.item_id, 'packaging_size', pkgSize);
            const dispatchUnit = getRowVal(item.item_id, 'dispatch_unit', masterUnit);
            const dispatchQtyVal = getRowVal(item.item_id, 'del_qty_kg', String(item.remaining_alloc_qty ?? item.remaining_qty ?? ''));
            const dispatchQtyBag = convertDispatchQty(dispatchQtyVal, dispatchUnit, 'bag', currentPkgSize);
            const dispatchQtyKg = convertDispatchQty(dispatchQtyVal, dispatchUnit, 'kg', currentPkgSize);

            return (
              <div
                key={item.item_id}
                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 ${
                  isSelected ? 'ring-2 ring-primary/20 border-primary' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.item_id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{indent.indent_number || '—'}</span>
                        {getGroupNameFromItem(item, groups) !== '—' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {getGroupNameFromItem(item, groups)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.products?.name || '—'} <span className="uppercase text-[10px] text-slate-400">({item.products?.unit || '—'})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <IndentTypeBadge processType={indent.process_type} />
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Delete Row"
                      onClick={() => handleDeletePendingItem(item)}
                      className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {/* Card Grid Info */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <div><span className="text-slate-400">Date:</span> <span className="text-slate-700">{indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}</span></div>
                  <div><span className="text-slate-400">Vendor:</span> <span className="text-slate-700 truncate">{item.approved_vendor?.name || item.item_vendor?.name || '—'}</span></div>
                  <div><span className="text-slate-400">Total Qty:</span> <span className="font-semibold text-slate-900">{item.quantity}</span></div>
                  <div><span className="text-slate-400">Pending Qty:</span> <span className="font-bold text-amber-600">{item.remaining_alloc_qty ?? item.remaining_qty}</span></div>
                  <div><span className="text-slate-400">Rate:</span> <span className="text-slate-700 font-medium">{(item.rate != null && item.rate !== '') || (item.approved_rate != null && item.approved_rate !== '') ? `₹${Number(item.rate ?? item.approved_rate).toFixed(2)}` : '—'}</span></div>
                  <div><span className="text-slate-400">Packaging:</span> <span className="text-slate-700">{currentPkgSize}</span></div>
                </div>

                {/* Inputs Grid */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <label className="block text-[10px] text-slate-400 mb-1">Exp. Date</label>
                      <Input
                        type="date"
                        value={getRowVal(item.item_id, 'exp_date', item.planning_date || '')}
                        onChange={e => setFieldForSelected(item.item_id, 'exp_date', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-6">
                      <label className="block text-[10px] text-slate-400 mb-1">Remarks</label>
                      <Input
                        type="text"
                        placeholder="Remarks..."
                        value={getRowVal(item.item_id, 'remarks')}
                        onChange={e => setRowVal(item.item_id, 'remarks', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-1">Unit</label>
                      <select
                        value={dispatchUnit}
                        onChange={e => handleDispatchUnitChange(item, e.target.value)}
                        className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                      >
                        <option value="bag">Bag</option>
                        <option value="kg">Kg</option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-1">Dis. Qty</label>
                      <Input
                        type="number"
                        step="any"
                        placeholder={String(item.remaining_alloc_qty ?? item.remaining_qty ?? '')}
                        value={dispatchQtyVal}
                        onChange={e => handleReceivedQtyChange(item, e.target.value)}
                        className="h-8 text-xs bg-white font-semibold text-blue-700 border-blue-200 focus:border-blue-400 text-center"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-1">Converted</label>
                      <div className="h-8 w-full flex items-center justify-center text-[10px] font-semibold text-slate-700 bg-slate-50 rounded-md border border-slate-200">
                        {dispatchUnit === 'bag' ? `${dispatchQtyKg ? Math.round(dispatchQtyKg * 100) / 100 : 0} kg` : `${dispatchQtyBag ? Math.round(dispatchQtyBag * 100) / 100 : 0} bag`}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Transporter</label>
                    <select
                      value={transpId}
                      onChange={e => handleTransporterChange(item.item_id, e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs text-slate-700"
                    >
                      <option value="">-- Select Transporter --</option>
                      {transporters.map(t => (
                        <option key={t.transporter_id} value={t.transporter_id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">LR No.</label>
                      <Input
                        type="text"
                        placeholder="LR No."
                        value={getRowVal(item.item_id, 'lr_number')}
                        onChange={e => setFieldForSelected(item.item_id, 'lr_number', e.target.value)}
                        disabled={!isSelected || !transpId}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Vehicle</label>
                      <Input
                        type="text"
                        placeholder="Vehicle"
                        value={getRowVal(item.item_id, 'vehicle_number', selectedTransporter?.vehicle_number || '')}
                        onChange={e => setFieldForSelected(item.item_id, 'vehicle_number', e.target.value)}
                        disabled={!isSelected || !transpId}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Driver</label>
                      <Input
                        type="text"
                        placeholder="Driver"
                        value={getRowVal(item.item_id, 'driver_phone_number', selectedTransporter?.driver_phone_number || '')}
                        onChange={e => setFieldForSelected(item.item_id, 'driver_phone_number', e.target.value)}
                        disabled={!isSelected || !transpId}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderHistoryCards = () => (
    <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 p-4 bg-slate-50/50">
      {currentList.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">No delivery history found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {currentPageItems.map(del => {
            const prod = del.purchase_indent_items?.products || {};
            const qtyKg = Number(del.received_quantity || 0);
            const indentNum = del.purchase_indent_items?.purchase_indents?.indent_number || '—';
            const vendorName = del.purchase_indent_items?.approved_vendor?.name || del.purchase_indent_items?.item_vendor?.name || '—';
            const isSelected = selectedItems.has(del.delivery_id);

            return (
              <div
                key={del.delivery_id}
                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 ${
                  isSelected ? 'ring-2 ring-primary/20 border-primary' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(del.delivery_id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{del.lifting_number || '—'}</span>
                        {(getGroupNameFromItem(del, groups) !== '—' || getGroupNameFromItem(del.purchase_indent_items, groups) !== '—') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {getGroupNameFromItem(del, groups) !== '—' ? getGroupNameFromItem(del, groups) : getGroupNameFromItem(del.purchase_indent_items, groups)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {prod.name || '—'} <span className="uppercase text-[10px] text-slate-400">({prod.unit || '—'})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {renderStatusBadge(del.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Delete Delivery"
                      onClick={() => handleDeleteDelivery(del)}
                      className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {/* Grid Info */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <div><span className="text-slate-400">Date:</span> <span className="text-slate-700">{del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}</span></div>
                  <div><span className="text-slate-400">Indent No:</span> <span className="text-slate-700">{indentNum}</span></div>
                  <div><span className="text-slate-400">Vendor:</span> <span className="text-slate-700 truncate">{vendorName}</span></div>
                  <div><span className="text-slate-400">Rate:</span> <span className="text-slate-700 font-medium">{del.purchase_indent_items?.rate != null && del.purchase_indent_items?.rate !== '' ? `₹${Number(del.purchase_indent_items.rate).toFixed(2)}` : '—'}</span></div>
                  <div><span className="text-slate-400">Transporter:</span> <span className="text-slate-700 truncate">{del.transporters?.name || '—'}</span></div>
                  <div><span className="text-slate-400">LR No:</span> <span className="text-slate-700">{del.lr_number || '—'}</span></div>
                  <div><span className="text-slate-400">Vehicle:</span> <span className="text-slate-700">{del.vehicle_number || del.transporters?.vehicle_number || '—'}</span></div>
                  <div><span className="text-slate-400">Disp. Bags:</span> <span className="font-semibold text-slate-800">{del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : '—'}</span></div>
                  <div><span className="text-slate-400">Disp. KG:</span> <span className="font-semibold text-slate-800">{del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : '—'}</span></div>
                  <div><span className="text-slate-400">Received:</span> <span className="font-bold text-emerald-700">{qtyKg}</span></div>
                  <div><span className="text-slate-400">Godown:</span> <span className="text-slate-700 truncate">{del.purchase_delivery_godowns?.[0]?.godowns?.name || '—'}</span></div>
                  <div><span className="text-slate-400">Remarks:</span> <span className="text-slate-700 truncate">{del.remarks || '—'}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading delivery data...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans flex-1 min-h-0">
      {/* Sub-tabs + Search & Filter Toolbar, all in one wrapping row */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setActiveSubTab('pending'); setCurrentPage(1); setSelectedItems(new Set()); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'pending'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Clock size={14} />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'pending' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {items.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveSubTab('history'); setCurrentPage(1); setSelectedItems(new Set()); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'history'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <History size={14} />
            History
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'history' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {historyItems.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input
            type="text"
            placeholder="Search indent no., product, vendor..."
            className="pl-9 h-9 text-xs w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          value={indentFilter}
          onChange={e => setIndentFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">-- All Indents --</option>
          {indentOptions.map(num => (
            <option key={num} value={num}>{num}</option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">-- All Products --</option>
          {productOptions.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {activeSubTab === 'pending' ? (
          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
          >
            <option value="">-- All Vendors --</option>
            {vendorOptions.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        ) : (
          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
          >
            <option value="">-- All Transporters --</option>
            {transporters.map(t => (
              <option key={t.transporter_id} value={t.name}>{t.name}</option>
            ))}
          </select>
        )}

        {(searchTerm || indentFilter || productFilter || vendorFilter) && (
          <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 text-xs border-slate-200 hover:bg-slate-50 shrink-0">
            Clear
          </Button>
        )}

        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          {/* View Mode Switcher */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => handleViewModeChange('card')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card View"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <LayoutList size={14} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{currentList.length} item{currentList.length !== 1 ? 's' : ''}</span>

          {selectedItems.size > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="h-9 px-3 text-xs bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5 shadow-sm shrink-0 animate-in fade-in"
            >
              {deletingSelected ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete Selected ({selectedItems.size})
            </Button>
          )}

          {activeSubTab === 'pending' && (
            <Button onClick={handleSubmitDeliveries} disabled={submitting} size="sm" className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium gap-1.5 shadow-sm">
              {submitting ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
              ) : (
                <Check size={14} />
              )}
              Submit
            </Button>
          )}
        </div>
      </div>

      {/* Main Table - Modern Dispatch Day Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0">
        {/* ── Sub-header bar with Select All Checkbox & Count (same as Sales Dispatch Planning) ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">
              {currentList.length} item{currentList.length !== 1 ? 's' : ''}
            </span>
            {selectedItems.size > 0 && (
              <span className="text-primary font-semibold">({selectedItems.size} selected)</span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
            />
            <span>Select All</span>
          </label>
        </div>

        {activeSubTab === 'pending' ? (
          viewMode === 'card' ? renderPendingCards() : (
          /* PENDING TABLE */
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-16 px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Action</span>
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Type</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Group Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Pending Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Pkg/Bag</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Remarks</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Exp. Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Actual Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] whitespace-nowrap">Dispatch Unit</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] whitespace-nowrap">Dispatch Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] whitespace-nowrap">Dispatch in BAG</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] whitespace-nowrap">Dispatch in KG</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px] whitespace-nowrap">Transporter</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[120px] whitespace-nowrap">LR No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Vehicle No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Driver No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentList.length === 0 && (
                  <tr>
                    <td colSpan="22" className="p-12 text-center text-slate-400">
                      <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-medium">No approved deliveries available.</p>
                    </td>
                  </tr>
                )}
                {currentPageItems.map(item => {
                  const indent = item.purchase_indents || {};
                  const isSelected = selectedItems.has(item.item_id);
                  const pkgSize = getPackagingSize(item.products);
                  const transpId = getRowVal(item.item_id, 'transporter_id');
                  const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(transpId));

                  const masterUnit = (item.products?.unit || '').toLowerCase();
                  const currentPkgSize = getRowVal(item.item_id, 'packaging_size', pkgSize);
                  const dispatchUnit = getRowVal(item.item_id, 'dispatch_unit', masterUnit);
                  const dispatchQtyVal = getRowVal(item.item_id, 'del_qty_kg', String(item.remaining_alloc_qty ?? item.remaining_qty ?? ''));
                  const dispatchQtyBag = convertDispatchQty(dispatchQtyVal, dispatchUnit, 'bag', currentPkgSize);
                  const dispatchQtyKg = convertDispatchQty(dispatchQtyVal, dispatchUnit, 'kg', currentPkgSize);

                  return (
                    <tr key={item.item_id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-2 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.item_id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            title="Delete Row"
                            onClick={() => handleDeletePendingItem(item)}
                            className="p-1 h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap text-slate-500 text-xs">
                        {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800 whitespace-nowrap">
                        {indent.indent_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <IndentTypeBadge processType={indent.process_type} />
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-700 whitespace-nowrap">
                        {item.approved_vendor?.name || item.item_vendor?.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {getGroupNameFromItem(item, groups)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="text-slate-800 font-medium">{item.products?.name || '—'}</span>
                        <span className="text-slate-500 ml-1">({item.products?.unit || '—'})</span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-amber-600">
                        {item.remaining_alloc_qty ?? item.remaining_qty}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {(item.rate != null && item.rate !== '') || (item.approved_rate != null && item.approved_rate !== '') ? Number(item.rate ?? item.approved_rate).toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Pkg/Bag"
                          value={getRowVal(item.item_id, 'packaging_size', pkgSize)}
                          onChange={e => setRowVal(item.item_id, 'packaging_size', e.target.value)}
                          disabled={!isSelected}
                          className="h-8 text-xs text-center bg-slate-50/50 border-slate-200 focus:bg-white w-20"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="Remarks..."
                          value={getRowVal(item.item_id, 'remarks')}
                          onChange={e => setRowVal(item.item_id, 'remarks', e.target.value)}
                          disabled={!isSelected}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="date"
                          value={getRowVal(item.item_id, 'exp_date', item.planning_date || '')}
                          onChange={e => setFieldForSelected(item.item_id, 'exp_date', e.target.value)}
                          disabled={!isSelected}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500 whitespace-nowrap">
                        {format(new Date(), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select
                          value={dispatchUnit}
                          onChange={e => handleDispatchUnitChange(item, e.target.value)}
                          disabled={!isSelected}
                          className="w-full h-8 text-xs px-2 rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="bag">BAG</option>
                          <option value="kg">KG</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={convertDispatchQty(item.remaining_alloc_qty ?? item.remaining_qty, masterUnit, dispatchUnit, currentPkgSize)}
                          placeholder="Dispatch Qty"
                          value={getRowVal(item.item_id, 'del_qty_kg', String(item.remaining_alloc_qty ?? item.remaining_qty ?? ''))}
                          onChange={e => handleReceivedQtyChange(item, e.target.value)}
                          disabled={!isSelected}
                          className="h-8 text-xs font-semibold text-center bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className={`px-3 py-3 text-center font-medium whitespace-nowrap ${masterUnit === 'bag' ? 'text-slate-800' : 'text-slate-500'}`}>
                        {dispatchQtyBag ? Number(dispatchQtyBag.toFixed(2)) : '—'}
                      </td>
                      <td className={`px-3 py-3 text-center font-medium whitespace-nowrap ${masterUnit === 'kg' ? 'text-slate-800' : 'text-slate-500'}`}>
                        {dispatchQtyKg ? Number(dispatchQtyKg.toFixed(2)) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select
                          value={transpId}
                          onChange={e => handleTransporterChange(item.item_id, e.target.value)}
                          disabled={!isSelected}
                          className="w-full h-8 text-xs px-2.5 rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="">Select transp...</option>
                          {transporters.map(t => (
                            <option key={t.transporter_id} value={t.transporter_id}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="LR No."
                          value={getRowVal(item.item_id, 'lr_number')}
                          onChange={e => setFieldForSelected(item.item_id, 'lr_number', e.target.value)}
                          disabled={!isSelected || !transpId}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[110px]"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="Vehicle No."
                          value={getRowVal(item.item_id, 'vehicle_number', selectedTransporter?.vehicle_number || '')}
                          onChange={e => setFieldForSelected(item.item_id, 'vehicle_number', e.target.value)}
                          disabled={!isSelected || !transpId}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[120px]"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="Driver No."
                          value={getRowVal(item.item_id, 'driver_phone_number', selectedTransporter?.driver_phone_number || '')}
                          onChange={e => setFieldForSelected(item.item_id, 'driver_phone_number', e.target.value)}
                          disabled={!isSelected || !transpId}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[120px]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )
        ) : (
          viewMode === 'card' ? renderHistoryCards() : (
          /* HISTORY TABLE */
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-16 px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Action</span>
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lifting No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Type</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Group Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Received Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dispatch in BAG</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dispatch in KG</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">LR No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Driver No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vehicle No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentList.length === 0 && (
                  <tr>
                    <td colSpan="16" className="p-12 text-center text-slate-400">
                      <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-medium">No delivery history found.</p>
                    </td>
                  </tr>
                )}
                {currentPageItems.map(del => {
                  const prod = del.purchase_indent_items?.products || {};
                  const qtyKg = Number(del.received_quantity || 0);
                  const indentNum = del.purchase_indent_items?.purchase_indents?.indent_number || '—';
                  const vendorName = del.purchase_indent_items?.approved_vendor?.name || del.purchase_indent_items?.item_vendor?.name || '—';

                  return (
                    <tr key={del.delivery_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-2 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(del.delivery_id)}
                            onChange={() => toggleSelect(del.delivery_id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            title="Delete Delivery"
                            onClick={() => handleDeleteDelivery(del)}
                            className="p-1 h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap text-slate-500 text-xs">
                        {del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800 whitespace-nowrap">
                        {del.lifting_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700 whitespace-nowrap">
                        {indentNum}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <IndentTypeBadge processType={del.purchase_indent_items?.purchase_indents?.process_type} />
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 font-medium whitespace-nowrap">
                        {vendorName}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {getGroupNameFromItem(del, groups) !== '—' ? getGroupNameFromItem(del, groups) : getGroupNameFromItem(del.purchase_indent_items, groups)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-800 whitespace-nowrap">
                        {prod.name || '—'}
                        <span className="text-slate-500 ml-1">({prod.unit || '—'})</span>
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-700">
                        {qtyKg}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {del.transporters?.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                        {del.lr_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                        {del.driver_phone_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                        {del.vehicle_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {renderStatusBadge(del.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )
        )}

        <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-blue-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-primary bg-white font-medium text-xs shadow-sm"
            >
              {PAGE_SIZE_OPTIONS.map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {currentList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, currentList.length)} of {currentList.length} items
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span className="text-xs font-semibold text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryTable;

