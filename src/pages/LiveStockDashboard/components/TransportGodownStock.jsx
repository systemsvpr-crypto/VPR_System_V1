import { useState, useEffect, useMemo } from 'react';
import { Truck, Package, Search, BarChart3, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAawakDeliveries } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';

const naturalCompare = (a, b) => {
  const numsA = String(a).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  const numsB = String(b).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  const len = Math.max(numsA.length, numsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (numsA[i] ?? 0) - (numsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(a).localeCompare(String(b));
};

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const TransportGodownStock = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch deliveries in Transport Godown status
      const data = await getAawakDeliveries(['In Transport Godown', 'AT TPT GDN']);
      setDeliveries(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transport godown stock data');
    }
    setLoading(false);
  };

  // Process data for transporter summary & material-wise pivot table
  const { transporterSummaries, sortedProducts, sortedTransporters, matrix, productMeta, grandTotal } = useMemo(() => {
    const transporterMap = new Map(); // transporterName -> { totalQty, liftCount }
    const productSet = new Set();
    const transporterSet = new Set();
    const matMap = new Map(); // `${productName}__${transporterName}` -> totalQty
    const metaMap = new Map(); // productName -> { unit }
    let totalAll = 0;

    for (const d of deliveries) {
      const transporterName = d.transporters?.name || 'Unassigned Transporter';
      const prod = d.purchase_indent_items?.products || {};
      const productName = prod.name || 'Unassigned Product';
      const unit = prod.unit || 'Kg';
      const qty = Number(d.received_quantity || 0);

      totalAll += qty;
      productSet.add(productName);
      transporterSet.add(transporterName);
      metaMap.set(productName, { unit });

      // Matrix key
      const key = `${productName}__${transporterName}`;
      matMap.set(key, (matMap.get(key) || 0) + qty);

      // Transporter totals
      if (!transporterMap.has(transporterName)) {
        transporterMap.set(transporterName, { name: transporterName, totalQty: 0, liftCount: 0 });
      }
      const tObj = transporterMap.get(transporterName);
      tObj.totalQty += qty;
      tObj.liftCount += 1;
    }

    const sortedProds = [...productSet].sort(naturalCompare);
    const sortedTrans = [...transporterSet].sort((a, b) => a.localeCompare(b));
    const transporterSummariesList = Array.from(transporterMap.values()).sort((a, b) => b.totalQty - a.totalQty);

    return {
      transporterSummaries: transporterSummariesList,
      sortedProducts: sortedProds,
      sortedTransporters: sortedTrans,
      matrix: matMap,
      productMeta: metaMap,
      grandTotal: totalAll,
    };
  }, [deliveries]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedProducts;
    return sortedProducts.filter((prodName) => {
      if (prodName.toLowerCase().includes(query)) return true;
      // Check if any transporter with stock for this product matches query
      return sortedTransporters.some((transporterName) => {
        const qty = matrix.get(`${prodName}__${transporterName}`) || 0;
        return qty > 0 && transporterName.toLowerCase().includes(query);
      });
    });
  }, [sortedProducts, sortedTransporters, matrix, searchQuery]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading transport godown stock...</p>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Truck size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Transport Godown Stock</h3>
        <p className="text-sm text-slate-400">There are currently no lifts in Transport Godown status.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-sans h-[calc(100vh-160px)] min-h-0">
      {/* Transporter Summary Card Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Truck size={18} />
            </div>
            <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">Transport Godown Transporter Summary</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg shrink-0">
            <span className="text-xs text-blue-600 font-medium">Total Transport Stock:</span>
            <span className="text-sm font-bold text-blue-700">{formatNum(grandTotal)} KG</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transporter</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lifts Count</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Stock Qty (KG)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transporterSummaries.map((t) => (
                <tr key={t.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{t.name}</td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{t.liftCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">{formatNum(t.totalQty)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-800">Total</td>
                <td className="px-4 py-3 text-center text-slate-800 tabular-nums">
                  {transporterSummaries.reduce((acc, curr) => acc + curr.liftCount, 0)}
                </td>
                <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">{formatNum(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Product-wise Breakdown Table Section (by Transporter) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Package size={18} />
            </div>
            <h3 className="font-semibold text-slate-800 text-lg">Product Breakdown by Transporter</h3>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search product or transporter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 w-full text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">
                  Product
                </th>
                {sortedTransporters.map((transporterName) => (
                  <th
                    key={transporterName}
                    className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[120px]"
                  >
                    {transporterName}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider min-w-[120px]">
                  Total Stock
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((prodName) => {
                const meta = productMeta.get(prodName) || {};
                let rowTotal = 0;
                const transporterQtys = sortedTransporters.map((transporterName) => {
                  const qty = matrix.get(`${prodName}__${transporterName}`) || 0;
                  rowTotal += qty;
                  return qty;
                });

                return (
                  <tr key={prodName} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{prodName}</span>
                        {meta.unit && (
                          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{meta.unit}</span>
                        )}
                      </div>
                    </td>
                    {transporterQtys.map((qty, i) => (
                      <td key={sortedTransporters[i]} className="px-4 py-3 text-center tabular-nums">
                        {qty === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          <span className="font-semibold text-slate-800">{formatNum(qty)}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center font-bold text-primary tabular-nums">
                      {formatNum(rowTotal)}
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={sortedTransporters.length + 2} className="px-4 py-8 text-center text-sm text-slate-400">
                    No products match your search.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredProducts.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-4 py-3 text-slate-800">Total</td>
                  {sortedTransporters.map((transporterName) => {
                    const colTotal = sortedProducts.reduce((acc, prodName) => {
                      return acc + (matrix.get(`${prodName}__${transporterName}`) || 0);
                    }, 0);
                    return (
                      <td key={transporterName} className="px-4 py-3 text-center text-slate-800 tabular-nums font-bold">
                        {formatNum(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center text-primary font-bold tabular-nums text-sm">
                    {formatNum(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransportGodownStock;
