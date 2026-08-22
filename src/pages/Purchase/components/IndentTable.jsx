import { ShoppingCart, Edit2, Zap, ArrowRightLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import useAuthStore from '../../../store/authStore';

const IndentTable = ({ indents, totalItems, loading, onEdit, onDelete, searchTerm }) => {
  const { user } = useAuthStore();
  const roleUpper = String(user?.role || '').trim().toUpperCase();
  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPERADMIN';
  const canDelete = import.meta.env.DEV || isSuperAdmin;

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading indents...</p>
      </div>
    );
  }



  // Flatten the indents array so each row is an item
  const flattenedData = indents.flatMap(indent => {
    const items = indent.purchase_indent_items || [];
    if (items.length === 0) {
      return [{ indent, item: null }];
    }
    return items.map(item => ({ indent, item }));
  });

  return (
    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col">
      <table className="w-full text-xs relative">
        <thead className="sticky top-0 z-10 shadow-sm">
          <tr className="bg-blue-50 border-b border-slate-200">
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-blue-50 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.1)]">Actions</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Date</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[150px]">Vendor</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Goodown</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Items</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Type</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Created Date</th>
            
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">Product Name</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Indent Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Approve Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-700 uppercase tracking-wider whitespace-nowrap">Recived Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap">Pending Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate per Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Amount</th>
            
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {totalItems === 0 && (
            <tr>
              <td colSpan="16" className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <ShoppingCart size={32} className="text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-600 mb-1">No Indents Found</h3>
                <p className="text-sm text-slate-400">
                  {searchTerm ? 'No indents match your search criteria.' : 'Click "Add Indent" above to create your first indent.'}
                </p>
              </td>
            </tr>
          )}
          {flattenedData.map((row, index) => {
            const { indent: o, item } = row;
            return (
              <tr key={`${o.indent_id}-${item ? item.item_id : 'empty'}-${index}`} className="group hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-3 text-center flex items-center justify-center gap-1 whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.1)]">
                  <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(o)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                    <Edit2 size={15} />
                  </Button>
                  {canDelete && (
                    <Button variant="ghost" size="icon" type="button" onClick={() => onDelete(o)}
                      title="Delete indent"
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                      <Trash2 size={15} />
                    </Button>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{format(new Date(o.indent_date), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3 font-semibold text-primary text-center whitespace-nowrap">{o.indent_number}</td>
                <td className="px-4 py-3 text-slate-600 text-center whitespace-nowrap">{o.vendors?.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600 text-center whitespace-nowrap">{o.godowns?.name || '—'}</td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    {o.purchase_indent_items?.length || 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {o.process_type === 'direct' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-100">
                      <Zap size={10} /> Direct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      <ArrowRightLeft size={10} /> Process
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs text-center whitespace-nowrap">{format(new Date(o.created_at), 'dd/MM/yyyy')}</td>
                
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium text-slate-800">{item?.products?.name || '—'}</span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {item?.products?.unit ? (
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{item.products.unit}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                
                <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                  {item ? (item.quantity || 0) : '—'}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                  {item ? (item.approve_qty || item.quantity || 0) : '—'}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                  {item ? (item.received_qty || 0) : '—'}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-red-600 tabular-nums whitespace-nowrap">
                  {item ? (item.remaining_qty || 0) : '—'}
                </td>
                <td className="px-4 py-3 text-center text-slate-600 tabular-nums whitespace-nowrap">
                  {item ? `₹${Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                </td>
                <td className="px-4 py-3 text-center font-medium text-slate-800 tabular-nums whitespace-nowrap">
                  {item ? `₹${(Number(item.rate || 0) * Number(item.quantity || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default IndentTable;
