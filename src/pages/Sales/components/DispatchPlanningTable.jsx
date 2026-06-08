import { useState, useEffect, useMemo } from 'react';
import { ClipboardList, Save, Square, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllOrderItemsForDispatch, saveDispatchPlan } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const DispatchPlanningTable = ({ godowns, searchTerm, dispatchFilter, onSave, user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editedPlans, setEditedPlans] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState(() => new Set());

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getAllOrderItemsForDispatch();
      setItems(data);
      const initial = {};
      data.forEach(item => {
        const uncancelledPlans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const latestPlan = uncancelledPlans[uncancelledPlans.length - 1] || item.dispatch_plans?.[0];
        initial[item.item_id] = {
          plan_id: latestPlan?.plan_id || '',
          quantity: latestPlan ? String(latestPlan.quantity) : '',
          godown_id: latestPlan ? latestPlan.godown_id : item.godown_id || '',
          unit_price: latestPlan ? String(latestPlan.unit_price) : String(item.unit_price),
          dispatch_date: latestPlan?.dispatch_date || new Date().toISOString().split('T')[0],
        };
      });
      setEditedPlans(initial);
    } catch (err) {
      toast.error('Failed to load dispatch items');
    }
    setLoading(false);
  };

  const filteredItems = useMemo(() => {
    let result = items;
    result = result.filter(item => item.sales_orders?.process_type !== 'skip_delivered');
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(item =>
        item.sales_orders?.order_number?.toLowerCase().includes(term) ||
        item.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term)
      );
    }
    if (dispatchFilter === 'pending') {
      result = result.filter(item => {
        const plans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        return plans.length === 0;
      });
    } else if (dispatchFilter === 'history') {
      result = result.filter(item => {
        const plans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        return plans.length > 0;
      });
    }
    return result;
  }, [items, searchTerm, dispatchFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dispatchFilter]);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  const updatePlan = (itemId, field, value) => {
    setEditedPlans(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const toggleCheck = (itemId) => {
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSaveAll = async () => {
    if (checkedRows.size === 0) return;
    setIsSaving(true);
    const errors = [];
    const savedPlans = {};
    const itemsToSave = items.filter(i => checkedRows.has(i.item_id));
    for (const item of itemsToSave) {
      const plan = editedPlans[item.item_id];
      if (!plan.godown_id) { errors.push(`Order ${item.sales_orders?.order_number}: Select a godown.`); continue; }
      if (!plan.quantity || Number(plan.quantity) <= 0) { errors.push(`Order ${item.sales_orders?.order_number}: Enter a dispatch quantity.`); continue; }
      if (!plan.unit_price || Number(plan.unit_price) <= 0) { errors.push(`Order ${item.sales_orders?.order_number}: Enter a unit price.`); continue; }
      if (Number(plan.quantity) > Number(item.quantity)) { errors.push(`Order ${item.sales_orders?.order_number}: Dispatch qty exceeds order qty.`); continue; }
      try {
        const uncancelled = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const latest = uncancelled[uncancelled.length - 1];
        const isEdit = latest && (latest.dispatch_status === 'Pending' || latest.dispatch_status === 'Planned');
        const saved = await saveDispatchPlan({
          plan_id: isEdit ? (plan.plan_id || undefined) : undefined,
          order_item_id: item.item_id,
          quantity: plan.quantity,
          godown_id: plan.godown_id,
          unit_price: plan.unit_price,
          dispatch_date: plan.dispatch_date,
          created_by: user?.user_id,
        });
        savedPlans[item.item_id] = saved;
      } catch (err) {
        errors.push(`Order ${item.sales_orders?.order_number}: ${err.message}`);
      }
    }
    const savedIds = Object.keys(savedPlans);
    if (savedIds.length > 0) {
      setItems(prev => prev.map(i => {
        if (!savedPlans[i.item_id]) return i;
        const existing = i.dispatch_plans || [];
        const saved = savedPlans[i.item_id];
        const idx = existing.findIndex(p => p.plan_id === saved.plan_id);
        if (idx >= 0) {
          const copy = [...existing];
          copy[idx] = saved;
          return { ...i, dispatch_plans: copy };
        }
        return { ...i, dispatch_plans: [...existing, saved] };
      }));
      setEditedPlans(prev => {
        const next = { ...prev };
        Object.entries(savedPlans).forEach(([itemId, sp]) => {
          next[itemId] = {
            ...(next[itemId] || {}),
            plan_id: sp.plan_id,
            quantity: String(sp.quantity),
            unit_price: String(sp.unit_price),
            godown_id: sp.godown_id,
            dispatch_date: sp.dispatch_date,
          };
        });
        return next;
      });
    }
    setCheckedRows(new Set());
    if (savedIds.length > 0) onSave?.();
    if (errors.length === 0) toast.success(`Saved ${savedIds.length} dispatch plan(s)`);
    else toast.error(errors[0]);
    setIsSaving(false);
  };

  const activeGodowns = godowns.filter(g => g.is_active);
  const godownOptions = activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading dispatch items...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ClipboardList size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Items</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No items match your search.' : dispatchFilter === 'pending' ? 'All items have been planned.' : dispatchFilter === 'history' ? 'No planned dispatches yet.' : 'Create an order to start planning dispatches.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-sm text-slate-500">
          {checkedRows.size > 0 ? `${checkedRows.size} row(s) selected` : 'Select rows to edit'}
        </span>
        <Button onClick={handleSaveAll} disabled={checkedRows.size === 0 || isSaving}
          className="gap-2 px-4 font-medium">
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Selected'}
        </Button>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center"></th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Qty</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Godown</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Qty <span className="text-red-500">*</span></th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Price <span className="text-red-500">*</span></th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentItems.map(item => {
              const plan = editedPlans[item.item_id] || {};
              const allPlans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
              const totalPlanned = allPlans.reduce((s, p) => s + Number(p.quantity), 0);
              const totalDispatched = allPlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);
              const cancelledQty = Number(item.cancelled_quantity || 0);
              let remaining;
              if (checkedRows.has(item.item_id)) {
                const editedQty = Number(plan.quantity || 0);
                if (plan.plan_id) {
                  const savedPlanQty = Number(allPlans.find(p => p.plan_id === plan.plan_id)?.quantity || 0);
                  remaining = Number(item.quantity) - (totalDispatched - Number(plan.already_dispatched || 0) + editedQty) - cancelledQty;
                } else {
                  remaining = Number(item.quantity) - totalDispatched - editedQty - cancelledQty;
                }
              } else {
                remaining = Number(item.quantity) - totalDispatched - cancelledQty;
              }
              const hasUncancelled = allPlans.length > 0;
              const lastPlan = allPlans[allPlans.length - 1] || allPlans[0];
              return (
                <tr key={item.item_id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => toggleCheck(item.item_id)}
                      className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                      {checkedRows.has(item.item_id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {hasUncancelled ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Planned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {lastPlan?.dispatch_number || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.sales_orders?.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.products?.name ? `${item.products.name} (${item.products.unit})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.sales_orders?.customers?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium text-slate-700">{item.quantity}</span>
                    {cancelledQty > 0 && (
                      <span className="ml-1 text-[10px] text-red-400">({cancelledQty} cancelled)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <DatePicker
                      value={plan.dispatch_date || ''}
                      onChange={(e) => updatePlan(item.item_id, 'dispatch_date', e.target.value)}
                      name="dispatch_date"
                      placeholder="Select dispatch date..."
                      disabled={!checkedRows.has(item.item_id)} />
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <Dropdown value={plan.godown_id || ''}
                      onValueChange={(v) => updatePlan(item.item_id, 'godown_id', v)}
                      options={godownOptions}
                      placeholder="Select godown..." searchPlaceholder="Search godowns..."
                      disabled={!checkedRows.has(item.item_id)} align="start" />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" step="1" min="0" placeholder="0"
                      className="w-20 h-8 text-sm text-center mx-auto"
                      value={plan.quantity || ''}
                      onChange={(e) => updatePlan(item.item_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                      disabled={!checkedRows.has(item.item_id)} />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      className="w-24 h-8 text-sm text-center mx-auto"
                      value={plan.unit_price || ''}
                      onChange={(e) => updatePlan(item.item_id, 'unit_price', e.target.value)}
                      disabled={!checkedRows.has(item.item_id)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium text-slate-700">{remaining}</span>
                    {cancelledQty > 0 && (
                      <span className="ml-1 text-[10px] text-red-400">(-{cancelledQty} cancelled)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredItems.length > 0 && (
        <Pagination currentPage={currentPage} totalPages={totalPages}
          totalItems={filteredItems.length}
          startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
          endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}
          onPageChange={setCurrentPage} className="border-t border-slate-200" />
      )}
    </div>
  );
};

export default DispatchPlanningTable;
