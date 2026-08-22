import { Filter, Pencil, Trash2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/dropdown';
import DataTable from '@/components/DataTable';
import { formatQty } from '@/lib/qty';

// Transactions are only ever filtered by a real "own" godown, not a
// transporter's auto-created stock-tracking godown — so keep those out of
// the filter dropdown.
const TransactionFilters = ({ filters, onChange, products, godowns }) => (
  <div className="flex flex-col md:flex-row md:items-center gap-3">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 w-full">
      <Dropdown className="w-full h-10" value={filters.product_id} onValueChange={(v) => onChange('product_id', v)} options={[{ value: "all", label: "All Products" }, ...products.map(p => ({ value: p.product_id, label: p.name }))]} placeholder="All Products" />
      <Select value={filters.godown_id} onValueChange={(v) => onChange('godown_id', v)}>
        <SelectTrigger className="w-full data-[size=default]:h-10"><SelectValue placeholder="All Godowns" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Godowns</SelectLabel>
            <SelectItem value="all">All Godowns</SelectItem>
            {godowns.filter(g => (g.godown_type || 'Own') === 'Own').map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={filters.txn_type} onValueChange={(v) => onChange('txn_type', v)}>
        <SelectTrigger className="w-full data-[size=default]:h-10"><SelectValue placeholder="All Types" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Types</SelectLabel>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="OPEN_STOCK">Opening Stock</SelectItem>
            <SelectItem value="IN_FACTORY">Factory In</SelectItem>
            <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
            <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
            <SelectItem value="OUT_GODOWN">Dispatch Out</SelectItem>
            <SelectItem value="PURCHASE_IN">Purchase In</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <DatePicker placeholder="From" value={filters.from_date}
        className="w-full h-10"
        onChange={(e) => onChange('from_date', e.target.value)} />
      <DatePicker placeholder="To" value={filters.to_date}
        className="w-full h-10"
        onChange={(e) => onChange('to_date', e.target.value)} />
    </div>
  </div>
);

const canEdit = (type) => ['IN_FACTORY', 'OUT_GODOWN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPEN_STOCK', 'PURCHASE_IN'].includes(type);

const TransactionTable = ({ 
  transactions, totalItems, loading, onEdit, onVoid,
  currentPage, totalPages, pageSize, onPageChange, onPageSizeChange
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading transactions...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Filter size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Transactions Found</h3>
        <p className="text-sm text-slate-400">Try adjusting your filters or add a new transaction.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <DataTable
        headers={[
          { label: 'Date', className: 'text-center' },
          { label: 'Product Name', className: 'text-center' },
          { label: 'Unit', className: 'text-center' },
          { label: 'Godown', className: 'text-center' },
          { label: 'Type', className: 'text-center' },
          { label: 'Lift/Dispatch #', className: 'text-center' },
          { label: 'Qty', className: 'text-center' },
          { label: 'Actions', className: 'text-center w-20' }
        ]}
        data={transactions}
        renderRow={(t) => (
          <tr key={t.txn_id} className="hover:bg-slate-50 transition-colors group text-xs">
            <td className="px-4 py-3 text-center text-slate-600">{t.txn_date}</td>
            <td className="px-4 py-3 text-center font-medium text-slate-800">{t.products?.name || '-'}</td>
            <td className="px-4 py-3 text-center">
              {t.products?.unit ? (
                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{t.products.unit}</span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-center text-slate-600">{t.godowns?.name || '-'}</td>
            <td className="px-4 py-3 text-center">
              <span className={`text-[10px] sm:text-xs font-medium px-2 py-1 rounded-full ${
                t.txn_type === 'OPEN_STOCK' ? 'bg-purple-50 text-purple-700' :
                t.txn_type === 'IN_FACTORY' ? 'bg-green-50 text-green-700' :
                t.txn_type === 'TRANSFER_IN' ? 'bg-blue-50 text-blue-700' :
                t.txn_type === 'TRANSFER_OUT' ? 'bg-amber-50 text-amber-700' :
                t.txn_type === 'OUT_GODOWN' ? 'bg-rose-50 text-rose-700' :
                t.txn_type === 'PURCHASE_IN' ? 'bg-teal-50 text-teal-700' :
                'bg-slate-50 text-slate-600'
              }`}>{t.txn_type.replace(/_/g, ' ')}</span>
            </td>
            <td className="px-4 py-3 text-center text-slate-500">
              {t.txn_type === 'PURCHASE_IN' ? (t.lifting_number || '—') : (t.dispatch_number || t.lr_number || '—')}
            </td>
            <td className={`px-4 py-3 text-center font-medium tabular-nums ${
              ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN','PURCHASE_IN','PURCHASE_IN(TPT)'].includes(t.txn_type) ? 'text-green-600' : 'text-red-600'
            }`}>
              {['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN','PURCHASE_IN','PURCHASE_IN(TPT)'].includes(t.txn_type) ? '+' : '-'}
              {formatQty(t.qty)}
            </td>
            <td className="px-4 py-3 text-center">
              {canEdit(t.txn_type) && (
                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => onEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors" title="Edit transaction">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onVoid(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Void transaction">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </td>
          </tr>
        )}
        renderCard={(t) => (
          <div key={t.txn_id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="font-semibold text-slate-800 text-xs">{t.products?.name || '-'}</div>
            <div className="text-xs text-slate-500 flex justify-between">
              <span>{t.txn_date}</span>
              <span className={`font-medium ${
                ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN','PURCHASE_IN','PURCHASE_IN(TPT)'].includes(t.txn_type) ? 'text-green-600' : 'text-red-600'
              }`}>
                {['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN','PURCHASE_IN','PURCHASE_IN(TPT)'].includes(t.txn_type) ? '+' : '-'}
                {formatQty(t.qty)}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                t.txn_type === 'OPEN_STOCK' ? 'bg-purple-50 text-purple-700' :
                t.txn_type === 'IN_FACTORY' ? 'bg-green-50 text-green-700' :
                t.txn_type === 'TRANSFER_IN' ? 'bg-blue-50 text-blue-700' :
                t.txn_type === 'TRANSFER_OUT' ? 'bg-amber-50 text-amber-700' :
                t.txn_type === 'OUT_GODOWN' ? 'bg-rose-50 text-rose-700' :
                t.txn_type === 'PURCHASE_IN' ? 'bg-teal-50 text-teal-700' :
                'bg-slate-50 text-slate-600'
              }`}>{t.txn_type.replace(/_/g, ' ')}</span>
              {canEdit(t.txn_type) && (
                <div className="flex items-center gap-2">
                  <button onClick={() => onEdit(t)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><Pencil size={13} /></button>
                  <button onClick={() => onVoid(t)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          </div>
        )}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={pageSize}
        onPageChange={onPageChange}
        onItemsPerPageChange={onPageSizeChange}
        totalResults={totalItems}
        itemsPerPageOptions={[50, 100, 200]}
        minWidth="800px"
      />
    </div>
  );
};

export { TransactionFilters, TransactionTable };
