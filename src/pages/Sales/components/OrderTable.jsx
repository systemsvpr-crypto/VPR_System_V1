import { useState } from 'react';
import { ShoppingCart, Edit2, ChevronDown, Lock, Trash2, Calendar, Check, RotateCw, Clock, MapPin, Package, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import useAuthStore from '../../../store/authStore';

const OrderTable = ({ orders, totalItems, loading, onEdit, onDelete, searchTerm, selectedIds, onToggleSelect, onToggleSelectAll }) => {
  const { user } = useAuthStore();
  const roleUpper = String(user?.role || '').trim().toUpperCase();
  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPERADMIN';
  const canDelete = import.meta.env.DEV || isSuperAdmin;
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('sales_orders_view_mode') || 'card');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('sales_orders_view_mode', mode);
  };

  const toggleExpand = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading orders...</p>
      </div>
    );
  }

  const allSelected = orders.length > 0 && orders.every(o => selectedIds?.has(o.order_id));

  const renderCards = () => {
    if (orders.length === 0) {
      return (
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <ShoppingCart size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Orders Found</h3>
          <p className="text-sm text-slate-400">
            {searchTerm ? 'No orders match your search criteria.' : 'Click "Add Order" above to create your first order.'}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-y-auto p-3 custom-scrollbar bg-slate-50/50 flex flex-col gap-2 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          {orders.map(o => {
            const isSelected = !!selectedIds?.has(o.order_id);
            const isExpanded = expandedOrders.has(o.order_id);
            const items = o.sales_order_items || [];

            let totalOrdered = 0;
            let totalDispatched = 0;
            let totalPlanned = 0;
            items.forEach(item => {
              const activePlans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
              const effQty = Number(item.quantity || 0) - Number(item.cancelled_quantity || 0);
              totalOrdered += effQty;
              totalPlanned += activePlans.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
              totalDispatched += activePlans.reduce((sum, p) => sum + Number(p.already_dispatched || 0), 0);
            });

            const isFullyDispatched = totalOrdered > 0 && totalDispatched >= totalOrdered;
            const isPartiallyDispatched = totalDispatched > 0 || totalPlanned > 0;
            const pct = totalOrdered > 0 ? Math.min(100, Math.round((totalDispatched / totalOrdered) * 100)) : 0;

            const accentBorder = isFullyDispatched
              ? 'border-l-emerald-500'
              : isPartiallyDispatched
              ? 'border-l-blue-500'
              : 'border-l-amber-500';

            const godownsSummary = Array.from(new Set(items.map(it => it.godowns?.name).filter(Boolean))).join(', ');
            const productsSummary = items.map(it => it.products?.name).filter(Boolean).slice(0, 2).join(', ') + (items.length > 2 ? ` +${items.length - 2} more` : '');

            return (
              <div
                key={o.order_id}
                className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col border-l-[3.5px] ${accentBorder} ${
                  isSelected ? 'ring-2 ring-primary/20 border-primary' : ''
                }`}
              >
                {/* Main Compact 1-Card Row */}
                <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                  {/* Left Column: Checkbox, Status Badge, Order No, Order Date */}
                  <div className="flex items-center gap-2.5 shrink-0 min-w-[155px]">
                    {canDelete && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(o.order_id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex flex-col gap-1">
                      <div>
                        {isFullyDispatched ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
                            <Check size={11} className="stroke-[3]" /> Dispatched
                          </span>
                        ) : isPartiallyDispatched ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 leading-none">
                            <RotateCw size={10} className="stroke-[2.5]" /> In Planning
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 leading-none">
                            <Clock size={10} className="stroke-[2.5]" /> Pending
                          </span>
                        )}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                        {o.order_number || '—'}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap leading-none">
                        <Calendar size={11} className="text-slate-400 shrink-0" />
                        <span>Date: {o.order_date ? format(new Date(o.order_date), 'dd MMM yyyy') : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle Column: Avatar, Customer Name, Badges, Metadata Row */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                        <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                          <ShoppingCart size={18} className="text-slate-400" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={o.customers?.name}>
                            {o.customers?.name || '—'}
                          </span>
                          {o.process_type === 'skip_delivered' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              Skip
                            </span>
                          ) : o.process_type === 'direct' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-medium bg-violet-50 text-violet-700 border border-violet-100">
                              Direct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-medium bg-blue-50 text-blue-700 border border-blue-100">
                              Process
                            </span>
                          )}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 leading-none">
                            {items.length} item{items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {productsSummary && (
                          <div className="text-[11px] text-slate-500 font-medium leading-tight truncate max-w-lg">
                            {productsSummary}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata Row: Total Amount, Created At, Godowns */}
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <span className="text-slate-400">Total Amt:</span>
                        <span className="font-bold text-slate-900">₹{Number(o.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <span className="text-slate-400">Created:</span>
                        <span className="font-medium text-slate-700">{format(new Date(o.created_at), 'dd MMM yyyy')}</span>
                      </div>
                      {godownsSummary && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Godown:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={godownsSummary}>{godownsSummary}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle-Right: Quantities / Dispatch Progress Box */}
                  <div className={`py-1.5 px-3 rounded-lg border flex flex-col justify-between gap-1.5 min-w-[190px] sm:min-w-[210px] shrink-0 ${
                    isFullyDispatched
                      ? 'bg-emerald-50/50 border-emerald-200/70'
                      : isPartiallyDispatched
                      ? 'bg-blue-50/50 border-blue-200/70'
                      : 'bg-amber-50/50 border-amber-200/70'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-white/90 border border-slate-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                          <Package size={11} className={isFullyDispatched ? 'text-emerald-600' : isPartiallyDispatched ? 'text-blue-600' : 'text-amber-600'} />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          {totalDispatched} / {totalOrdered} Qty
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold ${
                        isFullyDispatched ? 'text-emerald-700' : (totalDispatched === 0 ? 'text-amber-700' : 'text-blue-700')
                      }`}>
                        {totalDispatched === 0 ? '0% dispatched' : `${pct}% dispatched`}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isFullyDispatched ? 'bg-emerald-500' : isPartiallyDispatched ? 'bg-blue-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div>
                        <span>Ordered:</span>
                        <span className="ml-1 font-semibold text-slate-800">{totalOrdered}</span>
                      </div>
                      {totalPlanned > 0 && (
                        <div>
                          <span>Planned:</span>
                          <span className="ml-1 font-semibold text-blue-600">{totalPlanned}</span>
                        </div>
                      )}
                      <div>
                        <span>Disp:</span>
                        <span className="ml-1 font-bold text-emerald-700">{totalDispatched}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center justify-end xl:justify-center gap-1.5 shrink-0">
                    {items.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => toggleExpand(o.order_id)}
                        className={`h-7 px-2 text-xs font-semibold gap-1 rounded-md border-slate-200 transition-all shadow-2xs ${
                          isExpanded ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        <span>Items ({items.length})</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Edit order"
                      onClick={() => onEdit(o)}
                      className="p-1 h-7 w-7 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg shrink-0"
                    >
                      <Edit2 size={13} />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        title="Delete order"
                        onClick={() => onDelete(o)}
                        className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Collapsible Items Sub-table when expanded */}
                {isExpanded && items.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/80 p-3">
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Product</th>
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Godown</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Ordered</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Planned</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Dispatched</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Remaining</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">Unit Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map(item => {
                            const plansArr = Array.isArray(item.dispatch_plans) ? item.dispatch_plans : [];
                            const activePlans = plansArr.filter(p => p.dispatch_status !== 'Cancelled');
                            const effQty = Number(item.quantity || 0) - Number(item.cancelled_quantity || 0);
                            const plQty = activePlans.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
                            const dsQty = activePlans.reduce((sum, p) => sum + Number(p.already_dispatched || 0), 0);
                            const rem = effQty - plQty;
                            return (
                              <tr key={item.item_id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2 font-medium text-slate-800">
                                  {item.products?.name || '—'} <span className="text-[10px] text-slate-400 uppercase">({item.products?.unit})</span>
                                </td>
                                <td className="px-3 py-2 text-slate-600">{item.godowns?.name || '—'}</td>
                                <td className="px-3 py-2 text-center font-semibold text-slate-700">{effQty}</td>
                                <td className="px-3 py-2 text-center font-semibold text-blue-600">{plQty}</td>
                                <td className="px-3 py-2 text-center font-semibold text-emerald-700">{dsQty}</td>
                                <td className="px-3 py-2 text-center font-semibold text-amber-600">{rem}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">₹{Number(item.unit_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sub-header Bar: Total, Selection, View Mode Switcher */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-600">
            {totalItems} order{totalItems !== 1 ? 's' : ''}
          </span>
          {canDelete && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
              />
              <span>Select All</span>
            </label>
          )}
          {selectedIds?.size > 0 && (
            <span className="text-primary font-semibold">({selectedIds.size} selected)</span>
          )}
        </div>

        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => handleViewModeChange('card')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            title="Card View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('table')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            title="Table View"
          >
            <LayoutList size={15} />
          </button>
        </div>
      </div>

      {viewMode === 'card' ? (
        renderCards()
      ) : (
        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col">
          <table className="w-full text-sm relative">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-blue-50 border-b border-slate-200">
                {canDelete && (
                  <th className="w-10 px-2 py-3 text-center">
                    <input type="checkbox"
                      checked={allSelected}
                      onChange={onToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                  </th>
                )}
                <th className="w-10" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Customer</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px] whitespace-nowrap">Order Type</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Items</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Created</th>
                <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {totalItems === 0 && (
                <tr>
                  <td colSpan={canDelete ? 10 : 9} className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <ShoppingCart size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-600 mb-1">No Orders Found</h3>
                    <p className="text-sm text-slate-400">
                      {searchTerm ? 'No orders match your search criteria.' : 'Click "Add Order" above to create your first order.'}
                    </p>
                  </td>
                </tr>
              )}
              {orders.flatMap(o => {
                const isExpanded = expandedOrders.has(o.order_id);
                const items = o.sales_order_items || [];
                const rows = [
                  <tr key={o.order_id} className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedIds?.has(o.order_id) ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleExpand(o.order_id)}>
                    {canDelete && (
                      <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={!!selectedIds?.has(o.order_id)} onChange={() => onToggleSelect(o.order_id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                      </td>
                    )}
                    <td className="px-2 py-3">
                      {items.length > 0 && (
                        <ChevronDown size={16}
                          className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{format(new Date(o.order_date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{o.order_number}</td>
                    <td className="px-4 py-3 text-slate-600">{o.customers?.name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {o.process_type === 'skip_delivered' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                          Skip
                        </span>
                      ) : o.process_type === 'direct' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                          Direct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          Process
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {items.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      ₹{Number(o.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{format(new Date(o.created_at), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-center flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(o)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                        <Edit2 size={15} />
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="icon" type="button" onClick={() => onDelete(o)}
                          title="Delete order"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all">
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ];
                if (isExpanded && items.length > 0) {
                  rows.push(
                    <tr key={`${o.order_id}-details`}>
                      <td colSpan={canDelete ? 10 : 9} className="px-0 py-0">
                        <div className="bg-slate-50 border-t border-slate-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ordered</th>
                                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Planned</th>
                                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dispatched</th>
                                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Remaining/Pending</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map(item => {
                                const plansArr = Array.isArray(item.dispatch_plans) ? item.dispatch_plans : [];
                                const activePlans = plansArr.filter(p => p.dispatch_status !== 'Cancelled');
                                const cancelledQty = Number(item.cancelled_quantity || 0);
                                const effectiveQty = Number(item.quantity) - cancelledQty;
                                const plannedQty = activePlans.reduce((sum, p) => sum + Number(p.quantity), 0);
                                const dispatchedQty = activePlans.reduce((sum, p) => sum + Number(p.already_dispatched || 0), 0);
                                const remaining = effectiveQty - plannedQty;
                                const itemLocked = activePlans.some(p => p.dispatch_status === 'Dispatch Done');
                                const plannedPct = effectiveQty > 0 ? Math.min((plannedQty / effectiveQty) * 100, 100) : 0;
                                const dispPct = effectiveQty > 0 ? Math.min((dispatchedQty / effectiveQty) * 100, 100) : 0;
                                return (
                                  <tr key={item.item_id} className={`hover:bg-white transition-colors ${itemLocked ? 'opacity-70' : ''}`}>
                                    <td className="px-4 py-2.5">
                                      <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                                      <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                                      {itemLocked && <Lock size={12} className="inline ml-1 text-slate-300" />}
                                      {cancelledQty > 0 && (
                                        <span className="ml-1.5 text-[10px] text-red-400 bg-red-50 border border-red-100 px-1 py-0.5 rounded-full">
                                          {cancelledQty} cancelled
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600 text-xs">{item.godowns?.name || '—'}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                        {effectiveQty}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`inline-flex flex-col items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        plannedQty > 0
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                                      }`}>
                                        {plannedQty}
                                        {activePlans.length > 1 && (
                                          <span className="text-[9px] opacity-70 font-normal leading-none">{activePlans.length} plans</span>
                                        )}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        dispatchedQty > 0
                                          ? 'bg-violet-50 text-violet-700 border border-violet-100'
                                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                                      }`}>
                                        {dispatchedQty}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        remaining > 0
                                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                          : remaining === 0
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                                      }`}>
                                        {remaining}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 min-w-[100px]">
                                      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                        <div
                                          className="h-full bg-violet-400 float-left rounded-l-full"
                                          style={{ width: `${dispPct}%` }}
                                        />
                                        <div
                                          className="h-full bg-emerald-300 float-left"
                                          style={{ width: `${Math.max(plannedPct - dispPct, 0)}%` }}
                                        />
                                      </div>
                                      <p className="text-[9px] text-slate-400 mt-0.5 text-right">
                                        {Math.round(plannedPct)}% planned
                                      </p>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OrderTable;
