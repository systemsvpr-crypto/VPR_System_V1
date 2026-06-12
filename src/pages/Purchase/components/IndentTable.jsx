import { useState } from 'react';
import { ShoppingCart, Edit2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

const IndentTable = ({ indents, totalItems, loading, onEdit, searchTerm }) => {
  const [expandedIndents, setExpandedIndents] = useState(new Set());

  const toggleExpand = (indentId) => {
    setExpandedIndents(prev => {
      const next = new Set(prev);
      if (next.has(indentId)) next.delete(indentId);
      else next.add(indentId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading indents...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ShoppingCart size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Indents Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No indents match your search criteria.' : 'Click "Add Indent" above to create your first indent.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="w-10" />
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Indent Date</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Indent No.</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Amount</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
            <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {indents.flatMap(o => {
            const isExpanded = expandedIndents.has(o.indent_id);
            const items = o.purchase_indent_items || [];
            const rows = [
              <tr key={o.indent_id} className="hover:bg-slate-50 transition-colors group cursor-pointer"
                onClick={() => toggleExpand(o.indent_id)}>
                <td className="px-2 py-3">
                  {items.length > 0 && (
                    <ChevronDown size={16}
                      className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{format(new Date(o.indent_date), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{o.indent_number}</td>
                <td className="px-4 py-3 text-slate-600">{o.vendors?.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.godowns?.name || '—'}</td>
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
                </td>
              </tr>
            ];
            if (isExpanded && items.length > 0) {
              rows.push(
                <tr key={`${o.indent_id}-details`}>
                  <td colSpan={9} className="px-0 py-0">
                    <div className="bg-slate-50 border-t border-slate-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Qty</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map(item => (
                            <tr key={item.item_id} className="hover:bg-white transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                                <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                  {item.quantity}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-600">
                                ₹{Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                                ₹{(Number(item.rate) * Number(item.quantity)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
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
  );
};

export default IndentTable;
