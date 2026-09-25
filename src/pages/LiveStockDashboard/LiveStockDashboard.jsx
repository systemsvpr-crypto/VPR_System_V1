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
import useAuthStore from '../../store/authStore';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const DASHBOARD_TABS = [
  { id: 'live', label: 'Godown Live Stock', icon: Warehouse },
  { id: 'transport', label: 'Transport Godown Stock', icon: Truck },
  { id: 'vendor', label: 'Vendor Dashboard', icon: Store },
  { id: 'sales', label: 'Sales Dashboard', icon: Users },
];

const LiveStockDashboard = () => {
  const { user } = useAuthStore();
  const roleUpper = String(user?.role || '').trim().toUpperCase();
  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPERADMIN';

  const visibleTabs = useMemo(() => {
    if (isSuperAdmin) return DASHBOARD_TABS;
    const allowedTabs = user?.tab_access?.['live-stock-dashboard'];
    if (allowedTabs === undefined) return DASHBOARD_TABS;
    return DASHBOARD_TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user, isSuperAdmin]);

  const [activeView, setActiveView] = useState('live'); // 'live' | 'transport' | 'vendor' | 'sales'

  const currentView = visibleTabs.some(t => t.id === activeView)
    ? activeView
    : (visibleTabs[0]?.id || 'live');

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeView)) {
      setActiveView(visibleTabs[0].id);
    }
  }, [visibleTabs, activeView]);
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
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === 'live')) {
      setLoading(false);
      return;
    }
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
        if (err.name === 'AbortError' || err.message?.toLowerCase().includes('abort')) return;
        toast.error('Failed to load dashboard');
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, searchQuery, currentPage, pageSize, visibleTabs]);

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
      {visibleTabs.length > 0 && (
        <div className="flex justify-center w-full shrink-0">
          <TabSwitcher
            activeTab={currentView}
            onTabChange={setActiveView}
            tabs={visibleTabs.map(tab => {
              const Icon = tab.icon;
              return {
                id: tab.id,
                label: (
                  <div className="flex items-center gap-2">
                    <Icon size={15} />
                    <span>{tab.label}</span>
                  </div>
                ),
              };
            })}
          />
        </div>
      )}

      {visibleTabs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <BarChart3 size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Tabs Available</h3>
          <p className="text-sm text-slate-400">You don't have access to any Live Stock Dashboard tabs. Contact your administrator.</p>
        </div>
      ) : currentView === 'vendor' ? (
        <VendorDashboard />
      ) : currentView === 'sales' ? (
        <SalesDashboard />
      ) : currentView === 'transport' ? (
        <TransportGodownStock />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              {/* Left: title + Own/Transporter segmented toggle */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Warehouse size={18} className="text-primary" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">Godown Summary</h3>
                </div>

                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                  {['Own', 'Transporter'].map(type => (
                    <button key={type} type="button" onClick={() => setGodownTypeFilter(type)}
                      className={`px-3 h-8 text-xs font-medium rounded-md transition-all ${
                        godownTypeFilter === type ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: total badge, date navigation, search — all h-9 */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {data.length > 0 && (
                  <div className="flex items-center gap-2 px-3 h-9 bg-blue-50 border border-blue-200 rounded-lg shrink-0">
                    <span className="text-xs text-blue-600 font-medium whitespace-nowrap">Total Closing:</span>
                    {/* Always the combined Own + Transporter total, regardless of the type filter below */}
                    <span className="text-sm font-bold text-blue-700">{summaryData.totals.closing.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" onClick={handlePrevDay} title="Previous day" className="size-9 shrink-0">
                    <ChevronLeft size={16} />
                  </Button>
                  <div className="w-36">
                    <DatePicker value={date} onChange={handleDateChange} className="w-full h-9 text-sm" />
                  </div>
                  <Button variant="outline" size="icon" onClick={handleNextDay} disabled={date === today} title="Next day" className="size-9 shrink-0">
                    <ChevronRight size={16} />
                  </Button>
                </div>

                <div className="relative flex-1 min-w-[160px] lg:flex-none lg:w-52">
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
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Package size={18} className="text-primary" />
                    </div>
                    <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">Product-wise Breakdown</h3>
                  </div>
                  <div
                    className="flex items-center gap-2 px-3 h-9 bg-blue-50 border border-blue-200 rounded-lg shrink-0 whitespace-nowrap"
                    title="Sum across every product and godown — not just the rows on this page. Matches the Godown Summary total above."
                  >
                    <span className="text-xs text-blue-600 font-medium">Total Closing (All Products):</span>
                    <span className="text-sm font-bold text-blue-700">{summaryData.totals.closing.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
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
                  <div className="relative flex-1 min-w-[160px] lg:flex-none lg:w-52">
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
              <div className="flex flex-col">
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
