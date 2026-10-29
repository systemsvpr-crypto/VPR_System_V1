import { useState, useEffect, useMemo } from 'react';
import { Warehouse, Search, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Every product's Opening / Stock In / Stock Out / Closing for one godown on
// the dashboard's date — opened by clicking a row in Godown Summary.
// `loadAllProducts(date)` returns getDashboardData's full product list (each
// with its per-godown rows); the parent caches it per date.
const GodownProductsModal = ({ godown, date, loadAllProducts, onClose }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!godown) return;
    let cancelled = false;
    setSearch('');
    setLoading(true);
    loadAllProducts(date)
      .then(products => {
        if (cancelled) return;
        // Only products that had any stock or movement in this godown.
        const list = (products || [])
          .map(p => {
            const g = (p.godowns || []).find(x => x.godownId === godown.godownId);
            return g ? { productId: p.productId, productName: p.productName, unit: p.unit, ...g } : null;
          })
          .filter(r => r && (r.opening || r.stockIn || r.stockOut || r.closing));
        setRows(list);
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load godown products'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [godown, date, loadAllProducts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? rows.filter(r => r.productName.toLowerCase().includes(term)) : rows;
  }, [rows, search]);

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    stockIn: acc.stockIn + r.stockIn,
    stockOut: acc.stockOut + r.stockOut,
    closing: acc.closing + r.closing,
  }), { opening: 0, stockIn: 0, stockOut: 0, closing: 0 }), [filtered]);

  return (
    <Modal open={!!godown} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-4xl">
        <ModalHeader>
          <div className="flex items-center gap-3 pr-12">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Warehouse size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{godown?.godownName}</h2>
              <p className="text-xs text-slate-500">
                {godown?.godownType || 'Own'} godown · Stock on {date ? format(new Date(date), 'dd MMM yyyy') : '—'}
              </p>
            </div>
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-full" />
            </div>
            {!loading && (
              <span className="text-xs text-slate-500 font-medium">
                {filtered.length} product{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
              Loading products...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              {search ? 'No products match your search.' : 'No stock or movement in this godown on this date.'}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Unit</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider">Opening</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-green-600 uppercase tracking-wider">Stock In</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-red-500 uppercase tracking-wider">Stock Out</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-primary uppercase tracking-wider">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => (
                    <tr key={r.productId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.productName}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{r.unit || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 tabular-nums">{formatNum(r.opening)}</td>
                      <td className="px-3 py-2.5 text-center text-green-600 tabular-nums">+{formatNum(r.stockIn)}</td>
                      <td className="px-3 py-2.5 text-center text-red-500 tabular-nums">-{formatNum(r.stockOut)}</td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${r.closing < 0 ? 'text-red-600' : 'text-primary'}`}>{formatNum(r.closing)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold sticky bottom-0">
                    <td className="px-4 py-2.5 text-slate-800">Total</td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-center text-slate-800 tabular-nums">{formatNum(totals.opening)}</td>
                    <td className="px-3 py-2.5 text-center text-green-700 tabular-nums">+{formatNum(totals.stockIn)}</td>
                    <td className="px-3 py-2.5 text-center text-red-600 tabular-nums">-{formatNum(totals.stockOut)}</td>
                    <td className="px-3 py-2.5 text-center text-primary font-bold tabular-nums">{formatNum(totals.closing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default GodownProductsModal;
