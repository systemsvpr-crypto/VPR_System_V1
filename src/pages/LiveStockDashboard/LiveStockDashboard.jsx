import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart3, Package, Warehouse, ChevronLeft, ChevronRight, Search, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboardData, getGodownSummary } from '../../services/dashboardService';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodownSummaryTable from './components/GodownSummaryTable';
import ProductStockCard from './components/ProductStockCard';
import { exportStockReport } from './exportStockReport';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const LiveStockDashboard = () => {
  const [date, setDate] = useState(() => {
    return localStorage.getItem('dashboardDate') || new Date().toISOString().split('T')[0];
  });
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({ godowns: [], totals: { opening: 0, stockIn: 0, stockOut: 0, closing: 0 } });
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [exporting, setExporting] = useState(false);
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
        page: trimmed ? 1 : currentPage,
        pageSize,
        search: trimmed || undefined,
      }),
    ])
      .then(([summary, dashboard]) => {
        if (!controller.signal.aborted) {
          setSummaryData(summary);
          setData(dashboard.data);
          setTotalCount(dashboard.total);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        toast.error('Failed to load dashboard');
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, searchQuery, currentPage, pageSize]);

  const today = new Date().toISOString().split('T')[0];

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
    setCurrentPage(1);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().split('T')[0];
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
    setCurrentPage(1);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split('T')[0];
    if (newDate > today) return;
    setDate(newDate);
    localStorage.setItem('dashboardDate', newDate);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const trimmedSearch = searchQuery.trim();
  const totalPages = trimmedSearch ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = trimmedSearch ? totalCount : Math.min(currentPage * pageSize, totalCount);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const result = await getDashboardData(date, null, { all: true });
      await exportStockReport(result.data, date);
    } catch (err) {
      toast.error('Failed to export data');
    }
    setExporting(false);
  };

  const filteredData = useMemo(() => {
    if (!trimmedSearch) return data;
    return data.filter(p =>
      p.productName.toLowerCase().includes(trimmedSearch.toLowerCase())
    );
  }, [data, trimmedSearch]);

  const showSpinner = loading && data.length === 0;
  const showEmpty = !loading && data.length === 0 && !trimmedSearch;
  const showTables = !showSpinner && !showEmpty;

  return (
    <div className="flex flex-col gap-6">

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Warehouse size={18} className="text-primary" />
            </div>
            <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">Godown Summary</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevDay} title="Previous day">
              <ChevronLeft size={16} />
            </Button>
            <div className="relative w-full sm:w-56">
              <DatePicker value={date} onChange={handleDateChange} className="w-full" />
            </div>
            <Button variant="outline" size="icon" onClick={handleNextDay} disabled={date === today} title="Next day">
              <ChevronRight size={16} />
            </Button>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-8 h-8 w-48"
              />
            </div>
            {data.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg shrink-0">
                <span className="text-xs text-blue-600 font-medium">Total Closing:</span>
                <span className="text-sm font-bold text-blue-700">{summaryData.totals.closing.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>

        {showSpinner ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
            <p className="text-sm text-slate-400">Loading dashboard data...</p>
          </div>
        ) : showEmpty ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <BarChart3 size={32} className="text-slate-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-600 mb-1">No Data Available</h3>
            <p className="text-sm text-slate-400">Add products and transactions to see stock data here.</p>
          </div>
        ) : (
          <GodownSummaryTable godowns={summaryData.godowns} totals={summaryData.totals} />
        )}
      </div>

      {showTables && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center justify-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Package size={18} className="text-primary" />
                </div>
                <h3 className="font-semibold text-slate-800 text-lg">Product-wise Breakdown</h3>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exporting}
                  title="Export all products to Excel"
                  className="flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Export Excel
                </button>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="pl-8 h-9 w-full"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
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

            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-primary bg-white font-medium text-xs shadow-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {rangeStart}-{rangeEnd} of {totalCount}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || !!trimmedSearch}
                  className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || !!trimmedSearch}
                  className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default LiveStockDashboard;
