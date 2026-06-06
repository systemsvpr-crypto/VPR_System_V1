import { Package, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProductTable = ({ products, totalItems, loading, onEdit, searchTerm, stockMap }) => {
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading products...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Package size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Products Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No products match your search criteria.' : 'Click "Add Product" above to create your first product.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Allow Negative</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
            </tr>
          </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map(p => (
            <tr key={p.product_id} className="hover:bg-slate-50 transition-colors group">
              <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
              <td className="px-4 py-3 text-slate-600">{p.product_type || <span className="text-slate-300">—</span>}</td>
              <td className="px-4 py-3 text-slate-600">{p.unit}</td>
              <td className="px-4 py-3 text-center">
                {p.allow_negative_stock
                  ? <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium">Yes</span>
                  : <span className="text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full text-xs font-medium">No</span>
                }
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {stockMap?.[p.product_id]?.length > 0
                    ? stockMap[p.product_id].map((s, i) => (
                        <span key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                          {s.godown_name}: {Number(s.current_stock).toFixed(0)}
                        </span>
                      ))
                    : <span className="text-slate-300 text-xs">—</span>
                  }
                </div>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                  <Edit2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductTable;
