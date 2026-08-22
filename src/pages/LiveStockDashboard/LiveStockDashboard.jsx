import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart3, Package, Warehouse, Truck, Store, Users, ChevronLeft, ChevronRight, Search, Download, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboardData, getGodownSummary } from '../../services/dashboardService';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodownSummaryTable from './components/GodownSummaryTable';
import ProductStockCard from './components/ProductStockCard';
import TransportGodownStock from './components/TransportGodownStock';
import VendorDashboard from './components/VendorDashboard';
import SalesDashboard from './components/SalesDashboard';
import { exportStockReport } from './exportStockReport';
import { exportStockPdf } from './exportStockPdf';
import DataTable from '@/components/DataTable';
import { TabSwitcher } from '@/components/StandardButtons';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const LiveStockDashboard = () => {
  const [activeView, setActiveView] = useState('live'); // 'live' | 'transport' | 'vendor' | 'sales'
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({ godowns: [], totals: { opening: 0, stockIn: 0, stockOut: 0, closing: 0 } });
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [godownTypeFilter, setGodownTypeFilter] = useState('Own');
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
    setDate(e.target.value);
    setCurrentPage(1);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
    setCurrentPage(1);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split('T')[0];
    if (newDate > today) return;
    setDate(newDate);
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
    const t0 = performance.now();
    try {
      const result = await getDashboardData(date, null, { all: true });
      const t1 = performance.now();
      await exportStockReport(result.data, date);
      const t2 = performance.now();
      console.info(`[Excel export] fetch: ${(t1 - t0).toFixed(0)}ms, build+download: ${(t2 - t1).toFixed(0)}ms, total: ${(t2 - t0).toFixed(0)}ms`);
    } catch (err) {
      toast.error('Failed to export data');
    }
    setExporting(false);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    const t0 = performance.now();
    try {
      const result = await getDashboardData(date, null, { all: true });
      const t1 = performance.now();
      await exportStockPdf(result.data, summaryData, date);
      const t2 = performance.now();
      console.info(`[PDF export] fetch: ${(t1 - t0).toFixed(0)}ms, build+handoff to print: ${(t2 - t1).toFixed(0)}ms, total: ${(t2 - t0).toFixed(0)}ms (the browser's own print dialog opens after this, outside our control)`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    }
    setExportingPdf(false);
  };

  const filteredData = useMemo(() => {
    if (!trimmedSearch) return data;
    return data.filter(p =>
      p.productName.toLowerCase().includes(trimmedSearch.toLowerCase())
    );
  }, [data, trimmedSearch]);

  const filteredSummaryGodowns = useMemo(() => {
    return summaryData.godowns.filter(g => (g.godownType || 'Own') === godownTypeFilter);
  }, [summaryData.godowns, godownTypeFilter]);

  const filteredSummaryTotals = useMemo(() => {
    return filteredSummaryGodowns.reduce((acc, g) => ({
      opening: acc.opening + g.opening,
      stockIn: acc.stockIn + g.stockIn,
      stockOut: acc.stockOut + g.stockOut,
      closing: acc.closing + g.closing,
    }), { opening: 0, stockIn: 0, stockOut: 0, closing: 0 });
  }, [filteredSummaryGodowns]);

  const showSpinner = loading && data.length === 0;
  const showEmpty = !loading && data.length === 0 && !trimmedSearch;
  const showTables = !showSpinner && !showEmpty;

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Top View Switcher Bar */}
      <div className="flex justify-center w-full shrink-0">
        <TabSwitcher
          activeTab={activeView}
          onTabChange={setActiveView}
          tabs={[
            { id: 'live', label: <div className="flex items-center gap-2"><Warehouse size={15} /><span>Godown Live Stock</span></div> },
            { id: 'transport', label: <div className="flex items-center gap-2"><Truck size={15} /><span>Transport Godown Stock</span></div> },
            { id: 'vendor', label: <div className="flex items-center gap-2"><Store size={15} /><span>Vendor Dashboard</span></div> },
            { id: 'sales', label: <div className="flex items-center gap-2"><Users size={15} /><span>Sales Dashboard</span></div> },
          ]}
        />
      </div>

      {activeView === 'vendor' ? (
        <VendorDashboard />
      ) : activeView === 'sales' ? (
        <SalesDashboard />
      ) : activeView === 'transport' ? (
        <TransportGodownStock />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Warehouse size={18} className="text-primary" />
                </div>
                <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">Godown Summary</h3>
              </div>

              <div className="flex items-center gap-2 w-fit shrink-0">
                <button type="button" onClick={() => setGodownTypeFilter('Own')}
                  className={`px-3 py-1.5 h-[32px] text-xs font-medium rounded-lg border ${
                    godownTypeFilter === 'Own' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}>
                  Own
                </button>
                <button type="button" onClick={() => setGodownTypeFilter('Transporter')}
                  className={`px-3 py-1.5 h-[32px] text-xs font-medium rounded-lg border ${
                    godownTypeFilter === 'Transporter' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}>
                  Transporter
                </button>
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
                    {/* Always the combined Own + Transporter total, regardless of the type filter below */}
                    <span className="text-sm font-bold text-blue-700">{summaryData.totals.closing.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
              <GodownSummaryTable godowns={filteredSummaryGodowns} totals={filteredSummaryTotals} />
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
                    disabled={exporting || exportingPdf}
                    title="Export all products to Excel"
                    className="flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={exporting || exportingPdf}
                    title="Export all products to PDF (Landscape)"
                    className="flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    Export PDF
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
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col max-h-[560px]">
                <DataTable
                  headers={[
                    { label: 'Product Name', className: 'text-center' },
                    { label: 'Unit', className: 'text-center' },
                    { label: 'Opening', className: 'text-center' },
                    { label: 'Stock In', className: 'text-center !text-green-600' },
                    { label: 'Stock Out', className: 'text-center !text-red-500' },
                    { label: 'Closing', className: 'text-center !text-primary' },
                    { label: 'Current Stock', className: 'text-center !text-slate-900' }
                  ]}
                  data={filteredData}
                  renderRow={(product) => <ProductStockCard key={product.productId} product={product} />}
                  renderCard={(product) => (
                    <div key={product.productId} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                      <div className="font-semibold text-slate-800">{product.productName}</div>
                      <div className="text-sm text-slate-500 mt-1 flex justify-between">
                        <span>Closing: {product.totals?.closing || 0}</span>
                        <span className="text-primary font-medium">{product.unit}</span>
                      </div>
                    </div>
                  )}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  itemsPerPage={pageSize}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handlePageSizeChange}
                  totalResults={totalCount}
                  itemsPerPageOptions={PAGE_SIZE_OPTIONS}
                  minWidth="800px"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LiveStockDashboard;
