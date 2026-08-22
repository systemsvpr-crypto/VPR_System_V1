import { useState, useEffect, useMemo } from 'react';
import { Users, Search, Download, FileText, RotateCcw, ChevronLeft, ChevronRight, ArrowLeft, Package, UserCheck, Clock, CheckCircle2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCustomerDashboardData } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const PAGE_SIZE_OPTIONS = [50, 100, 200];

// Compact stat pills for the customer detail header — kept as one config
// list so the header/name block and all 5 metrics can sit in a single row
// instead of the name block and a separate stats-grid section stacked on
// top of it.
const detailStatPills = (c) => [
  { key: 'total', label: 'Total Qty', value: c.totalQty, icon: Package, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', valueColor: 'text-slate-800' },
  { key: 'net', label: 'Net Qty', value: c.netQty, icon: UserCheck, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
  { key: 'planned', label: 'Planned Qty', value: c.plannedQty, icon: Truck, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', valueColor: 'text-amber-700' },
  { key: 'dispatched', label: 'Dispatched Qty', value: c.dispatchedQty, icon: CheckCircle2, iconBg: 'bg-green-50', iconColor: 'text-green-600', valueColor: 'text-green-700' },
  { key: 'pending', label: 'Pending Qty', value: c.pendingQty, icon: Clock, iconBg: 'bg-red-50', iconColor: 'text-red-600', valueColor: 'text-red-600' },
];

const SalesDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  // The customer currently being viewed in the dedicated detail page — null
  // means the customer list is showing. Clicking a customer row navigates
  // into its detail page rather than expanding inline.
  const [detailCustomerName, setDetailCustomerName] = useState(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailSelectedProduct, setDetailSelectedProduct] = useState('');
  const [detailSelectedOrder, setDetailSelectedOrder] = useState('');
  const [detailSelectedDate, setDetailSelectedDate] = useState('');
  const [detailCurrentPage, setDetailCurrentPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await getCustomerDashboardData();
      setData(rows || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load sales dashboard data');
    }
    setLoading(false);
  };

  // Filter dropdown options
  const uniqueOrders = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.orderNo).filter(Boolean))).sort();
  }, [data]);

  const uniqueCustomers = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.customerName).filter(Boolean))).sort();
  }, [data]);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.productName).filter(Boolean))).sort();
  }, [data]);

  // Filtered rows
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (selectedOrder && row.orderNo !== selectedOrder) return false;
      if (selectedCustomer && row.customerName !== selectedCustomer) return false;
      if (selectedProduct && row.productName !== selectedProduct) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const match =
          row.orderNo?.toLowerCase().includes(query) ||
          row.customerName?.toLowerCase().includes(query) ||
          row.productName?.toLowerCase().includes(query) ||
          row.createdBy?.toLowerCase().includes(query) ||
          row.remark?.toLowerCase().includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [data, selectedOrder, selectedCustomer, selectedProduct, searchQuery]);

  // Customer-centric snapshot: how much of this product is this customer
  // still owed (summed across every one of their orders for it), and the
  // soonest planned dispatch date covering that pending amount — not the
  // company-wide godown stock/purchase-transit figures, which have nothing
  // to do with this specific customer.
  const customerProductSnapshot = useMemo(() => {
    if (!selectedCustomer) return [];

    const map = new Map();
    for (const row of filteredData) {
      if (!map.has(row.productName)) {
        map.set(row.productName, {
          productId: row.productId,
          productName: row.productName,
          unit: row.unit,
          lastDeliveredDate: row.lastDeliveredDate,
          lastRate: row.unitPrice,
          maxOrderDate: row.orderDate,
          pendingQty: 0,
          nextDispatchDate: '—',
        });
      }
      const existing = map.get(row.productName);
      if (row.lastDeliveredDate !== '—' && (existing.lastDeliveredDate === '—' || new Date(row.lastDeliveredDate) > new Date(existing.lastDeliveredDate))) {
        existing.lastDeliveredDate = row.lastDeliveredDate;
      }
      if (row.orderDate !== '—' && (existing.maxOrderDate === '—' || new Date(row.orderDate) > new Date(existing.maxOrderDate))) {
        existing.maxOrderDate = row.orderDate;
        existing.lastRate = row.unitPrice;
      }
      existing.pendingQty += Number(row.pendingQty || 0);
      if (row.expectedDate && row.expectedDate !== '—') {
        if (existing.nextDispatchDate === '—' || new Date(row.expectedDate) < new Date(existing.nextDispatchDate)) {
          existing.nextDispatchDate = row.expectedDate;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filteredData, selectedCustomer]);

  const recentSalesHistory = useMemo(() => {
    if (!selectedCustomer) return [];
    return filteredData.slice(0, 5);
  }, [filteredData, selectedCustomer]);

  return (
    <div className="flex flex-col gap-6 font-sans h-[calc(100vh-160px)] min-h-0">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        
        {/* Top Controls Bar */}
        <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-100">
          {/* Customer Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Select Customer Name
            </label>
            <Dropdown
              value={selectedCustomer || "all"}
              onValueChange={(v) => setSelectedCustomer(v === "all" ? "" : v)}
              options={[{ value: "all", label: "Select a Customer" }, ...uniqueCustomers.map(c => ({ value: c, label: c }))]}
              placeholder="Select a Customer"
              className="h-10 bg-white"
            />
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Item Name (Filter)
            </label>
            <Dropdown
              value={selectedProduct || "all"}
              onValueChange={(v) => setSelectedProduct(v === "all" ? "" : v)}
              options={[{ value: "all", label: "All Items" }, ...uniqueProducts.map(p => ({ value: p, label: p }))]}
              placeholder="All Items"
              className="h-10 bg-white"
            />
          </div>
        </div>

        {/* Data Tables */}
        {selectedCustomer ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-4 gap-6 bg-slate-50/50">
            {/* Table 1: Product Snapshot */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[250px]">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-800 text-sm">Product Snapshot</h3>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Delivery Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Rate</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Qty</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Planning Dispatch Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerProductSnapshot.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No products found for this customer.</td></tr>
                    ) : (
                      customerProductSnapshot.map((p) => (
                        <tr key={p.productId || p.productName} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{p.productName}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{p.lastDeliveredDate}</td>
                          <td className="px-4 py-3 text-center text-emerald-600 font-semibold">{p.lastRate ? `₹${formatNum(p.lastRate)}` : '—'}</td>
                          <td className="px-4 py-3 text-center text-red-600 font-semibold">{p.pendingQty > 0 ? `${formatNum(p.pendingQty)} ${p.unit || ''}` : '—'}</td>
                          <td className="px-4 py-3 text-center text-amber-600 font-semibold">{p.nextDispatchDate}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Recent Sales */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[250px]">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-800 text-sm">Recent Sales History (Last 5)</h3>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ordered Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentSalesHistory.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-slate-400">No sales history found.</td></tr>
                    ) : (
                      recentSalesHistory.map((s, idx) => (
                        <tr key={s.id || idx} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{s.productName}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{s.orderDate}</td>
                          <td className="px-4 py-3 text-center text-slate-900 font-semibold">{formatNum(s.totalQty)} {s.unit}</td>
                          <td className="px-4 py-3 text-center text-emerald-600 font-semibold">{s.unitPrice ? `₹${formatNum(s.unitPrice)}` : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <Users size={48} className="text-slate-200 mb-4" />
            <p className="text-lg font-medium text-slate-500">No Customer Selected</p>
            <p className="text-sm mt-1">Please select a customer from the dropdown above to view the dashboard.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesDashboard;
