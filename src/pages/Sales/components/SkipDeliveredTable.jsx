import { useState, useEffect, useMemo } from 'react';
import { Truck, Square, CheckSquare, Save } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getSkipDeliveredItems, saveDispatchPlan } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const SkipDeliveredTable = ({ searchTerm, skipFilter, onSave, products, godowns, user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [editedPlans, setEditedPlans] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [stockMap, setStockMap] = useState({});

  useEffect(() => {
    loadItems();
    loadStock();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, skipFilter]);

  const loadStock = async () => {
    try {
      const data = await getAllProductStock();
      const map = {};
      (data || []).forEach(s => {
        map[`${s.product_id}|${s.godown_id}`] = s.current_stock;
      });
      setStockMap(map);
    } catch {
      // stock data non-critical
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getSkipDeliveredItems();
      setItems(data);
      const initial = {};
      data.forEach(item => {
        const plan = item.dispatch_plans?.[0];
        initial[item.item_id] = {
          quantity: plan ? String(plan.quantity) : '',
          godown_id: plan ? plan.godown_id : item.godown_id || '',
          dispatch_date: plan?.dispatch_date || new Date().toISOString().split('T')[0],
        };
      });
      setEditedPlans(initial);
    } catch (err) {
      toast.error('Failed to load skip delivered items');
      setItems([]);
    }
    setLoading(false);
  };

  const getCurrentStock = (productId, godownId) => {
    if (!productId || !godownId) return 0;
    return stockMap[`${productId}|${godownId}`] ?? 0;
  };

  const filteredItems = useMemo(() => {
    let result = items;
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(item =>
        item.sales_orders?.order_number?.toLowerCase().includes(term) ||
        item.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term)
      );
    }
    if (skipFilter === 'pending') {
      result = result.filter(item => !item.dispatch_plans?.[0]);
    } else if (skipFilter === 'skip-done') {
      result = result.filter(item => !!item.dispatch_plans?.[0]);
    }
    return result;
  }, [items, searchTerm, skipFilter]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

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

  const handleSave = async () => {
    if (checkedRows.size === 0) return;
    setIsSaving(true);
    const errors = [];
    const savedItems = [];
    const toSave = items.filter(i => checkedRows.has(i.item_id));
    for (const item of toSave) {
      const plan = editedPlans[item.item_id];
      if (!plan?.godown_id) { errors.push(`Order ${item.sales_orders?.order_number}: Select a godown.`); continue; }
      if (Number(plan.quantity || 0) > Number(item.quantity)) { errors.push(`Order ${item.sales_orders?.order_number}: Dispatch qty exceeds order qty.`); continue; }
      try {
        const saved = await saveDispatchPlan({
          order_item_id: item.item_id,
          quantity: plan.quantity,
          godown_id: plan.godown_id,
          unit_price: item.unit_price,
          dispatch_date: plan.dispatch_date,
          created_by: user?.user_id,
          dispatch_status: 'Dispatch Done',
        });
        savedItems.push({ item_id: item.item_id, plan: saved });
      } catch (err) {
        errors.push(`Order ${item.sales_orders?.order_number}: ${err.message}`);
      }
    }
    if (savedItems.length > 0) {
      setItems(prev => prev.map(i => {
        const found = savedItems.find(s => s.item_id === i.item_id);
        return found ? { ...i, dispatch_plans: [found.plan] } : i;
      }));
    }
    setCheckedRows(new Set());
    if (savedItems.length > 0) onSave?.();
    if (errors.length === 0) toast.success(`Saved ${savedItems.length} dispatch plan(s)`);
    else toast.error(errors[0]);
    setIsSaving(false);
  };

  const activeProducts = products?.filter(p => p.is_active !== false) || [];
  const activeGodowns = godowns?.filter(g => g.is_active) || [];
  const godownOptions = activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading skip delivered items...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Truck size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Skip Delivered Items</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No items match your search.' : 'No orders marked as Skip Delivered.'}
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
        <Button onClick={handleSave} disabled={checkedRows.size === 0 || isSaving}
          className="gap-2 px-4 font-medium">
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Selected'}
        </Button>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm whitespace-nowrap min-w-[1600px]">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center"></th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px]">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Order No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[150px]">Customer Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[220px]">Item Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[90px]">Order Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[100px]">Dispatch Qty</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[160px]">Dispatch Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[200px]">Godown</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[120px]">Current Stock</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px]">Order Date</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[90px]">Unit Price</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Person Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentItems.map(item => {
              const plan = editedPlans[item.item_id] || {};
              const existingPlan = item.dispatch_plans?.[0];
              const isChecked = checkedRows.has(item.item_id);
              const selectedGodownId = plan.godown_id || item.godown_id;
              const currentStock = getCurrentStock(item.product_id, selectedGodownId);
              return (
                <tr key={item.item_id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => toggleCheck(item.item_id)}
                      className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                      {isChecked ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {existingPlan ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Skip Done
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.sales_orders?.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.sales_orders?.customers?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.products?.name ? `${item.products.name} (${item.products.unit})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" step="1" min="0" placeholder="0"
                      className="w-20 h-8 text-sm text-center mx-auto"
                      value={plan.quantity || ''}
                      onChange={(e) => updatePlan(item.item_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                      disabled={!isChecked} />
                  </td>
                  <td className="px-4 py-3">
                    <DatePicker
                      value={plan.dispatch_date || ''}
                      onChange={(e) => updatePlan(item.item_id, 'dispatch_date', e.target.value)}
                      name="dispatch_date"
                      placeholder="Select dispatch date..."
                      disabled={!isChecked} />
                  </td>
                  <td className="px-4 py-3">
                    <Dropdown value={plan.godown_id || ''}
                      onValueChange={(v) => updatePlan(item.item_id, 'godown_id', v)}
                      options={godownOptions}
                      placeholder="Select godown..." searchPlaceholder="Search godowns..."
                      disabled={!isChecked} align="start" />
                  </td>
                  <td className="px-4 py-3 text-center font-medium">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      Number(currentStock) > 0
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {currentStock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700">
                    {Number(item.unit_price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.person_name || '—'}
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

export default SkipDeliveredTable;
