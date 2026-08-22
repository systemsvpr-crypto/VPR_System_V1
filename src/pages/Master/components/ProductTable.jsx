import { Package, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';
import { formatQty } from '@/lib/qty';

const ProductTable = ({ products, totalItems, loading, onEdit, searchTerm, stockMap, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  return (
    <DataTable
      headers={[
        'Product Name', 'Unit', 'Product Type', 'Brand', 'Category', 'Mux', 'Stock', 'Created Date', 'Actions'
      ]}
      data={products}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(p, index) => (
        <tr key={p.product_id} className="hover:bg-slate-50 transition-colors group text-xs">
          <td className="px-4 py-3 text-center font-medium text-slate-800">{p.name}</td>
          <td className="px-4 py-3 text-center text-slate-600">{p.unit}</td>
          <td className="px-4 py-3 text-center text-slate-600">{p.product_type || <span className="text-slate-300">—</span>}</td>
          <td className="px-4 py-3 text-center text-slate-600">{p.brand_name || <span className="text-slate-300">—</span>}</td>
          <td className="px-4 py-3 text-center text-slate-600">{p.category || <span className="text-slate-300">—</span>}</td>
          <td className="px-4 py-3 text-center text-slate-600">{p.mux || <span className="text-slate-300">—</span>}</td>
          <td className="px-4 py-3 text-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {stockMap?.[p.product_id]?.length > 0
                ? stockMap[p.product_id].map((s, i) => (
                    <span key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                      {s.godown_name}: {formatQty(s.current_stock)}
                    </span>
                  ))
                : <span className="text-slate-300 text-xs">—</span>
              }
            </div>
          </td>
          <td className="px-4 py-3 text-center text-slate-400 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
          <td className="px-4 py-3 text-center">
            <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(p)}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
              <Edit2 size={15} />
            </Button>
          </td>
        </tr>
      )}
      renderCard={(p, index) => (
        <div key={p.product_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-slate-800">{p.name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{p.product_type} • {p.unit}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onEdit(p)} className="text-slate-400 hover:text-primary h-8 w-8">
              <Edit2 size={14} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Brand</span>
              <span className="text-slate-700">{p.brand_name || '—'}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Category</span>
              <span className="text-slate-700">{p.category || '—'}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Mux</span>
              <span className="text-slate-700">{p.mux || '—'}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Created</span>
              <span className="text-slate-700">{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg text-xs">
             <span className="text-slate-500 block mb-1">Stock</span>
             <div className="flex flex-wrap gap-1.5">
              {stockMap?.[p.product_id]?.length > 0
                ? stockMap[p.product_id].map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {s.godown_name}: {formatQty(s.current_stock)}
                    </span>
                  ))
                : <span className="text-slate-300">—</span>
              }
             </div>
          </div>
        </div>
      )}
    />
  );
};

export default ProductTable;
