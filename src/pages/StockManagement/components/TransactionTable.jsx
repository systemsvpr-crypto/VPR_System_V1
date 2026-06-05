import { Filter, Pencil, Trash2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';

const TransactionFilters = ({ filters, onChange, products, godowns }) => (
  <div className="flex flex-col md:flex-row md:items-center gap-3">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 w-full">
      <Select value={filters.product_id} onValueChange={(v) => onChange('product_id', v)}>
        <SelectTrigger className="w-full h-10"><SelectValue placeholder="All Products" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Products</SelectLabel>
            <SelectItem value="all">All Products</SelectItem>
            {products.map(p => <SelectItem key={p.product_id} value={p.product_id}>{p.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={filters.godown_id} onValueChange={(v) => onChange('godown_id', v)}>
        <SelectTrigger className="w-full h-10"><SelectValue placeholder="All Godowns" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Godowns</SelectLabel>
            <SelectItem value="all">All Godowns</SelectItem>
            {godowns.map(g => <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={filters.txn_type} onValueChange={(v) => onChange('txn_type', v)}>
        <SelectTrigger className="w-full h-10"><SelectValue placeholder="All Types" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Types</SelectLabel>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="OPEN_STOCK">Opening Stock</SelectItem>
            <SelectItem value="IN_FACTORY">Factory In</SelectItem>
            <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
            <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
            <SelectItem value="OUT_GODOWN">Dispatch Out</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <DatePicker placeholder="From" value={filters.from_date}
        onChange={(e) => onChange('from_date', e.target.value)} />
      <DatePicker placeholder="To" value={filters.to_date}
        onChange={(e) => onChange('to_date', e.target.value)} />
    </div>
  </div>
);

const canEdit = (type) => ['IN_FACTORY', 'OUT_GODOWN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPEN_STOCK'].includes(type);

const TransactionTable = ({ transactions, totalItems, loading, onEdit, onVoid }) => (
  <>
    <div className="px-5 py-4 border-b border-slate-100">
      <h3 className="font-semibold text-slate-800">Transaction History</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={6}>
              <div className="flex flex-col items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
                <p className="text-sm text-slate-400">Loading transactions...</p>
              </div>
            </td></tr>
          ) : totalItems === 0 ? (
            <tr><td colSpan={7} className="text-center py-16">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <Filter size={32} className="text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-600 mb-1">No Transactions Found</h3>
                <p className="text-sm text-slate-400">Try adjusting your filters or add a new transaction.</p>
              </div>
            </td></tr>
          ) : transactions.map(t => (
            <tr key={t.txn_id} className="hover:bg-slate-50 transition-colors group">
              <td className="px-4 py-3 text-slate-600">{t.txn_date}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{t.products?.name || '-'}</td>
              <td className="px-4 py-3 text-slate-600">{t.godowns?.name || '-'}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  t.txn_type === 'OPEN_STOCK' ? 'bg-purple-50 text-purple-700' :
                  t.txn_type === 'IN_FACTORY' ? 'bg-green-50 text-green-700' :
                  t.txn_type === 'TRANSFER_IN' ? 'bg-blue-50 text-blue-700' :
                  t.txn_type === 'TRANSFER_OUT' ? 'bg-amber-50 text-amber-700' :
                  t.txn_type === 'OUT_GODOWN' ? 'bg-rose-50 text-rose-700' :
                  'bg-slate-50 text-slate-600'
                }`}>{t.txn_type.replace(/_/g, ' ')}</span>
              </td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(t.txn_type) ? 'text-green-600' : 'text-red-600'
              }`}>
                {['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(t.txn_type) ? '+' : '-'}
                {Number(t.qty).toFixed(0)}
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
          ))}
        </tbody>
      </table>
    </div>
  </>
);

export { TransactionFilters, TransactionTable };
