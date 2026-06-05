import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart3, Package, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboardData, getGodownSummary } from '../../services/dashboardService';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodownSummaryTable from './components/GodownSummaryTable';
import ProductStockCard from './components/ProductStockCard';

const PAGE_SIZE = 10;

const LiveStockDashboard = () => {
  const [date, setDate] = useState(() => {
    return localStorage.getItem('dashboardDate') || new Date().toISOString().split('T')[0];
  });
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({ godowns: [], totals: { opening: 0, stockIn: 0, stockOut: 0, closing: 0 } });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const trimmed = searchQuery.trim();
    Promise.all([
      getGodownSummary(date, controller.signal),
      getDashboardData(date, controller.signal, {
        page: 1,
        pageSize: PAGE_SIZE,
        search: trimmed || undefined,
      }),
    ])
      .then(([summary, dashboard]) => {
        if (!controller.signal.aborted) {
          setSummaryData(summary);
          setData(dashboard.data);
          setHasMore(dashboard.hasMore && !trimmed);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        toast.error('Failed to load dashboard');
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, searchQuery]);

  const handleLoadMore = async () => {
    const nextPage = Math.ceil(data.length / PAGE_SIZE) + 1;
    setLoadingMore(true);
    try {
      const result = await getDashboardData(date, null, { page: nextPage, pageSize: PAGE_SIZE });
      setData(prev => [...prev, ...result.data]);
      setHasMore(result.hasMore);
    } catch (err) {
      toast.error('Failed to load more data');
    }
    setLoadingMore(false);
  };

  const today = new Date().toISOString().split('T')[0];

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().split('T')[0];
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split('T')[0];
    if (newDate > today) return;
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
  };

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    return data.filter(p =>
      p.productName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Live Stock Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">View real-time stock levels across all godowns.</p>
        </div>
      </div>

      <div className="border-b border-slate-200" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay} title="Previous day">
            <ChevronLeft size={16} />
          </Button>
          <div className="relative w-full md:w-64">
            <DatePicker value={date} onChange={handleDateChange} className="w-full" />
          </div>
          <Button variant="outline" size="icon" onClick={handleNextDay} disabled={date === today} title="Next day">
            <ChevronRight size={16} />
          </Button>
          <div className="relative ml-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-48"
            />
          </div>
        </div>
        {!loading && data.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg shrink-0">
            <span className="text-xs text-blue-600 font-medium">Total Closing:</span>
            <span className="text-sm font-bold text-blue-700">{summaryData.totals.closing.toFixed(0)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-sm text-slate-400">Loading dashboard data...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <BarChart3 size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Data Available</h3>
          <p className="text-sm text-slate-400">Add products and transactions to see stock data here.</p>
        </div>
      ) : (
        <>
          <GodownSummaryTable godowns={summaryData.godowns} totals={summaryData.totals} />

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Package size={18} className="text-primary" />
              </div>
              <h3 className="font-semibold text-slate-800">Product-wise Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Opening</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider">Stock In</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wider">Stock Out</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Closing</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider">Current Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((product) => (
                    <ProductStockCard key={product.productId} product={product} />
                  ))}
                  {filteredData.length === 0 && (
                    <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        No products match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {hasMore && !searchQuery.trim() && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-primary bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Package size={16} />
                )}
                {loadingMore ? 'Loading...' : 'Load More Products'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LiveStockDashboard;
