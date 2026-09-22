import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Download,
  FileText,
  RotateCw,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  TrendingUp,
  ChevronDown,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCustomerDashboardData, getProductCurrentStockAndTransit } from '../../../services/salesService';
import { getAllCustomers } from '../../../services/customerService';
import { getAllRanks } from '../../../services/rankService';
import { getAllPricingGroups } from '../../../services/pricingService';
import { resolveCustomerTier } from '../../../lib/pricingCategoryHelper';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';

/**
 * Format date in DD-MMM-YY (e.g. "20-Aug-26") matching user's Excel screenshot
 */
const formatDisplayDate = (dateStr) => {
  if (!dateStr || dateStr === '—') return '—';
  try {
    let s = String(dateStr).trim();
    if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(s)) {
      const [d, m, y] = s.split(/[\/-]/);
      s = `${y}-${m}-${d}`;
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
};

/**
 * Format rate number: 1.68 -> "1.68", 174 -> "174", 1.7 -> "1.70"
 */
const formatRate = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '—';
  const num = Number(val);
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-IN');
  }
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format quantity number
 */
const formatQty = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '0';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const SalesDashboard = () => {
  const [data, setData] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Selected customer & group filter
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [itemSearch, setItemSearch] = useState('');

  // Stock & transit maps for customer's items: { [productId]: number }
  const [stockMap, setStockMap] = useState({});
  const [transitMap, setTransitMap] = useState({});

  useEffect(() => {
    loadAllMasterData();
  }, []);

  const loadAllMasterData = async () => {
    setLoading(true);
    try {
      const [orderRows, custList, rankList, groupList] = await Promise.all([
        getCustomerDashboardData().catch((err) => {
          console.error('Failed to load dashboard data:', err);
          return [];
        }),
        getAllCustomers().catch((err) => {
          console.error('Failed to load customers:', err);
          return [];
        }),
        getAllRanks().catch((err) => {
          console.error('Failed to load ranks:', err);
          return [];
        }),
        getAllPricingGroups().catch((err) => {
          console.error('Failed to load product groups:', err);
          return [];
        }),
      ]);

      setData(orderRows || []);
      setCustomers(custList || []);
      setRanks(rankList || []);
      setProductGroups(groupList || []);

      // Auto-select first customer with orders if none selected
      if (!selectedCustomerId && custList && custList.length > 0) {
        const customerWithOrders = custList.find((c) =>
          (orderRows || []).some((r) => r.customerId === c.customer_id || r.customerName === c.name)
        );
        setSelectedCustomerId(customerWithOrders ? customerWithOrders.customer_id : custList[0].customer_id);
      }
    } catch (err) {
      console.error('Error loading master data:', err);
      toast.error('Failed to load sales dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Resolve current active customer object
  const currentCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return (
      customers.find(
        (c) => c.customer_id === selectedCustomerId || c.name?.toLowerCase() === selectedCustomerId.toLowerCase()
      ) || null
    );
  }, [customers, selectedCustomerId]);

  // Customer Rank label (e.g. "A+", "A", "B", etc.)
  const customerRank = useMemo(() => {
    if (!currentCustomer) return '—';
    const rankName = currentCustomer.ranks?.rank_name || currentCustomer.rank_name;
    return rankName || '—';
  }, [currentCustomer]);

  // Customer's order rows
  const customerRows = useMemo(() => {
    if (!currentCustomer) return [];
    return data.filter(
      (r) =>
        r.customerId === currentCustomer.customer_id ||
        (r.customerName && r.customerName.toLowerCase() === currentCustomer.name?.toLowerCase())
    );
  }, [data, currentCustomer]);

  // Fetch Current Stock and In Transit whenever the customer's items change
  useEffect(() => {
    const productIds = Array.from(new Set(customerRows.map((r) => r.productId).filter(Boolean)));
    if (productIds.length === 0) {
      setStockMap({});
      setTransitMap({});
      return;
    }

    let isMounted = true;
    setStockLoading(true);
    getProductCurrentStockAndTransit(productIds)
      .then((res) => {
        if (isMounted) {
          setStockMap(res.stockMap || {});
          setTransitMap(res.transitMap || {});
        }
      })
      .catch((err) => {
        console.error('Failed to fetch stock/transit:', err);
      })
      .finally(() => {
        if (isMounted) setStockLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [customerRows]);

  // 1. LEFT TABLE: Ordered History (Items Purchased Details)
  // Columns: Item Name | Last Delivered | Last Rate | Category Rate | Current Stock | In Transit
  const orderedHistoryItems = useMemo(() => {
    if (customerRows.length === 0) return [];

    const itemMap = new Map();

    for (const r of customerRows) {
      const pid = r.productId || r.productName;
      if (!itemMap.has(pid)) {
        itemMap.set(pid, {
          productId: r.productId,
          productName: r.productName,
          unit: r.unit,
          groupId: r.groupId,
          groupName: r.groupName,
          rankRates: r.rankRates,
          lastDeliveredDate: r.lastDeliveredDate || '—',
          lastRate: r.unitPrice,
          latestOrderDate: r.orderDate || '',
        });
      }

      const existing = itemMap.get(pid);

      // Track latest delivery date
      if (r.lastDeliveredDate && r.lastDeliveredDate !== '—') {
        if (
          existing.lastDeliveredDate === '—' ||
          new Date(r.lastDeliveredDate) > new Date(existing.lastDeliveredDate)
        ) {
          existing.lastDeliveredDate = r.lastDeliveredDate;
        }
      }

      // Track latest order rate
      if (r.orderDate && r.orderDate !== '—') {
        if (!existing.latestOrderDate || new Date(r.orderDate) >= new Date(existing.latestOrderDate)) {
          existing.latestOrderDate = r.orderDate;
          existing.lastRate = r.unitPrice;
        }
      }
    }

    // Resolve Category Rate, Stock, and In Transit for each distinct item
    const results = Array.from(itemMap.values()).map((it) => {
      // Find matching group to get rank rates
      const grp =
        productGroups.find(
          (g) =>
            (it.groupId && g.group_id === it.groupId) ||
            (it.groupName && g.group_name?.toLowerCase() === it.groupName?.toLowerCase())
        ) || it.product?.product_groups;

      const groupRates = grp?.rank_rates || it.rankRates || {};

      // Resolve category rate for customer's rank
      let catRate = null;
      if (groupRates && typeof groupRates === 'object') {
        // 1. Exact match (e.g. "A+", "A", "B")
        if (customerRank && groupRates[customerRank] !== undefined) {
          catRate = groupRates[customerRank];
        } else {
          // 2. Fallback to base tier (e.g. "A+" -> "A")
          const tier = resolveCustomerTier(currentCustomer);
          if (tier && groupRates[tier] !== undefined) {
            catRate = groupRates[tier];
          }
        }
      }

      const cStock = stockMap[it.productId] ?? 0;
      const inTra = transitMap[it.productId] ?? 0;

      return {
        ...it,
        categoryRate: catRate,
        currentStock: cStock,
        inTransit: inTra,
      };
    });

    results.sort((a, b) => a.productName.localeCompare(b.productName));

    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase().trim();
      return results.filter((it) => it.productName.toLowerCase().includes(q));
    }

    return results;
  }, [customerRows, productGroups, customerRank, currentCustomer, stockMap, transitMap, itemSearch]);

  // 2. RIGHT TABLE: Pending Orders
  // Columns: Item Name | Or Date | Qty | Rate
  const pendingOrders = useMemo(() => {
    if (customerRows.length === 0) return [];

    let filtered = customerRows.filter((r) => Number(r.pendingQty || 0) > 0);

    // Group filter from the "New Item Price" widget dropdown
    if (selectedGroupId && selectedGroupId !== 'all') {
      filtered = filtered.filter(
        (r) =>
          r.groupId === selectedGroupId ||
          (r.groupName && r.groupName.toLowerCase() === selectedGroupId.toLowerCase())
      );
    }

    // Sort by order date descending
    filtered.sort((a, b) => {
      const dateA = a.orderDate || '';
      const dateB = b.orderDate || '';
      return dateB.localeCompare(dateA);
    });

    return filtered;
  }, [customerRows, selectedGroupId]);

  // Active selected group object for the "New Item Price" widget
  const activePriceGroup = useMemo(() => {
    if (!selectedGroupId || selectedGroupId === 'all') {
      return productGroups[0] || null;
    }
    return (
      productGroups.find(
        (g) => g.group_id === selectedGroupId || g.group_name?.toLowerCase() === selectedGroupId.toLowerCase()
      ) || null
    );
  }, [productGroups, selectedGroupId]);

  // Display ranks for New Item Price header (A, B, C, D, E...)
  const displayRanks = useMemo(() => {
    if (ranks && ranks.length > 0) return ranks;
    return [{ rank_name: 'A' }, { rank_name: 'B' }, { rank_name: 'C' }];
  }, [ranks]);

  // ─── Export to Excel ─────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!currentCustomer) {
      toast.error('Please select a customer first');
      return;
    }

    try {
      setExportingExcel(true);
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'VPR Systems';
      workbook.created = new Date();

      // Sheet 1: Ordered History
      const wsHistory = workbook.addWorksheet('Ordered History');
      wsHistory.addRow([`Customer: ${currentCustomer.name}`, `Rank: ${customerRank}`]);
      wsHistory.addRow([]);
      wsHistory.addRow(['Item Name', 'Last Delivered', 'Last Rate (₹)', 'Category Rate (₹)', 'Current Stock', 'In Transit']);

      orderedHistoryItems.forEach((it) => {
        wsHistory.addRow([
          it.productName,
          formatDisplayDate(it.lastDeliveredDate),
          it.lastRate ? Number(it.lastRate) : '—',
          it.categoryRate ? Number(it.categoryRate) : '—',
          Number(it.currentStock || 0),
          Number(it.inTransit || 0),
        ]);
      });

      // Sheet 2: Pending Orders
      const wsPending = workbook.addWorksheet('Pending Orders');
      wsPending.addRow([`Customer: ${currentCustomer.name}`, `Pending Orders Count: ${pendingOrders.length}`]);
      wsPending.addRow([]);
      wsPending.addRow(['Item Name', 'Or Date', 'Qty', 'Rate (₹)']);

      pendingOrders.forEach((po) => {
        wsPending.addRow([
          po.productName,
          formatDisplayDate(po.orderDate),
          Number(po.pendingQty || 0),
          Number(po.unitPrice || 0),
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentCustomer.name.replace(/[^a-z0-9]/gi, '_')}_Sales_Dashboard.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel exported successfully');
    } catch (err) {
      console.error('Excel export error:', err);
      toast.error('Failed to export Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // ─── Export to PDF ───────────────────────────────────────────────────────────
  const handleExportPdf = () => {
    if (!currentCustomer) {
      toast.error('Please select a customer first');
      return;
    }

    try {
      setExportingPdf(true);
      const doc = new jsPDF('landscape');

      doc.setFontSize(14);
      doc.setTextColor(33, 37, 41);
      doc.text(`Customer: ${currentCustomer.name} (Rank: ${customerRank})`, 14, 14);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 20);

      // Table 1: Ordered History
      doc.setFontSize(11);
      doc.setTextColor(20, 83, 45);
      doc.text('Ordered History (Purchased Items)', 14, 28);

      const historyData = orderedHistoryItems.map((it) => [
        it.productName,
        formatDisplayDate(it.lastDeliveredDate),
        it.lastRate ? `₹${formatRate(it.lastRate)}` : '—',
        it.categoryRate ? `₹${formatRate(it.categoryRate)}` : '—',
        formatQty(it.currentStock),
        it.inTransit > 0 ? formatQty(it.inTransit) : '—',
      ]);

      autoTable(doc, {
        startY: 32,
        head: [['Item Name', 'Last Delivered', 'Last Rate', 'Category Rate', 'Current Stock', 'In Transit']],
        body: historyData,
        theme: 'grid',
        headStyles: { fillColor: [184, 226, 184], textColor: [27, 67, 50], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      // Table 2: Pending Orders
      const nextY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 100;
      doc.setFontSize(11);
      doc.setTextColor(88, 28, 135);
      doc.text('Pending Orders', 14, nextY);

      const pendingData = pendingOrders.map((po) => [
        po.productName,
        formatDisplayDate(po.orderDate),
        formatQty(po.pendingQty),
        po.unitPrice ? `₹${formatRate(po.unitPrice)}` : '—',
      ]);

      autoTable(doc, {
        startY: nextY + 4,
        head: [['Item Name', 'Or Date', 'Qty', 'Rate']],
        body: pendingData,
        theme: 'grid',
        headStyles: { fillColor: [234, 209, 220], textColor: [74, 21, 75], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      doc.save(`${currentCustomer.name.replace(/[^a-z0-9]/gi, '_')}_Dashboard.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 font-sans pb-6 min-h-0">
      {/* ─── Top Control Bar: Customer Selector with Rank Badge ─────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        {/* Left: Customer Dropdown with Attached Purple Rank Pill (Matching Screenshot) */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <div className="flex items-center rounded-lg border-2 border-[#7e60b8] bg-[#f8f5fc] p-0.5 shadow-xs">
            {/* Customer Dropdown */}
            <div className="w-56 sm:w-72 md:w-80">
              <Dropdown
                value={selectedCustomerId}
                onValueChange={(val) => {
                  setSelectedCustomerId(val);
                }}
                options={customers.map((c) => ({
                  value: c.customer_id,
                  label: c.name,
                }))}
                placeholder="Select Customer..."
                searchPlaceholder="Search customer name..."
                className="h-9 border-0 bg-transparent text-slate-900 font-bold text-xs sm:text-sm focus-visible:ring-0 truncate"
              />
            </div>

            {/* Purple Rank Badge (e.g. "A+", "A", "B") */}
            <div
              className="px-3.5 py-1.5 bg-[#7e60b8] text-white font-black text-xs sm:text-sm rounded-md shadow-2xs shrink-0 flex items-center justify-center min-w-[42px] tracking-wide"
              title={`Customer Rank: ${customerRank}`}
            >
              {customerRank}
            </div>
          </div>

          {currentCustomer?.location && (
            <span className="text-[11px] text-slate-500 font-medium hidden lg:inline-block">
              Location: <strong>{currentCustomer.location}</strong>
            </span>
          )}
        </div>

        {/* Right: Actions Bar (Search inside table, Refresh, Export) */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Item filter input */}
          <div className="relative w-40 sm:w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search items..."
              className="h-8 pl-7.5 text-xs bg-slate-50 focus:bg-white"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadAllMasterData}
            disabled={loading}
            className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
            title="Refresh Data"
          >
            <RotateCw size={13} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exportingExcel || !currentCustomer}
            className="h-8 px-2.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 cursor-pointer"
            title="Export Excel"
          >
            <Download size={13} className="mr-1" />
            Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exportingPdf || !currentCustomer}
            className="h-8 px-2.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 border-red-200 cursor-pointer"
            title="Export PDF"
          >
            <FileText size={13} className="mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-xs text-slate-500 font-medium">Loading customer purchased details and pending orders...</p>
        </div>
      ) : !currentCustomer ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Users size={40} className="mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-semibold text-slate-700">No Customer Selected</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Please select a customer from the dropdown above to view their purchased item history and pending orders.
          </p>
        </div>
      ) : (
        /* ─── Main Two-Column Layout (Matching the Excel Screenshot) ───────── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* LEFT PANEL (7 Cols): ORDERED HISTORY (Purchased Items Details)  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            {/* Table Header Container */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Two-tone header row matching screenshot: Green for Items & Orange for Stock */}
                  <tr className="border-b border-slate-300 font-bold text-slate-900 select-none">
                    {/* Green Segment (#d9ead3) */}
                    <th className="px-3 py-2.5 text-left bg-[#b8e2b8] text-[#1b4332] border-r border-slate-300 min-w-[180px] font-bold">
                      Item Name
                    </th>
                    <th className="px-3 py-2.5 text-center bg-[#b8e2b8] text-[#1b4332] border-r border-slate-300 w-28 whitespace-nowrap font-bold">
                      Last Delivered
                    </th>
                    <th className="px-3 py-2.5 text-right bg-[#b8e2b8] text-[#1b4332] border-r border-slate-300 w-20 whitespace-nowrap font-bold">
                      Last Rate
                    </th>
                    <th className="px-3 py-2.5 text-right bg-[#b8e2b8] text-[#1b4332] border-r border-slate-300 w-24 whitespace-nowrap font-bold">
                      Category Rate
                    </th>

                    {/* Orange Segment (#f9cb9c) */}
                    <th className="px-3 py-2.5 text-center bg-[#f9cb9c] text-[#78350f] border-r border-slate-300 w-24 whitespace-nowrap font-bold">
                      Current Stock
                    </th>
                    <th className="px-3 py-2.5 text-center bg-[#f9cb9c] text-[#78350f] w-20 whitespace-nowrap font-bold">
                      In Tra
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 bg-white">
                  {orderedHistoryItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 bg-slate-50/50">
                        No ordered history found for this customer.
                      </td>
                    </tr>
                  ) : (
                    orderedHistoryItems.map((it, idx) => {
                      const hasStock = Number(it.currentStock || 0) > 0;
                      const hasTransit = Number(it.inTransit || 0) > 0;

                      return (
                        <tr
                          key={it.productId || idx}
                          className="hover:bg-slate-50/90 transition-colors group text-[11.5px]"
                        >
                          {/* 1. Item Name */}
                          <td className="px-3 py-2 text-left font-semibold text-slate-800 border-r border-slate-200">
                            {it.productName}
                          </td>

                          {/* 2. Last Delivered (e.g. 20-Aug-26) */}
                          <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-200 whitespace-nowrap font-medium">
                            {formatDisplayDate(it.lastDeliveredDate)}
                          </td>

                          {/* 3. Last Rate (e.g. 1.68) */}
                          <td className="px-3 py-2 text-right text-slate-800 border-r border-slate-200 font-bold tabular-nums">
                            {formatRate(it.lastRate)}
                          </td>

                          {/* 4. Category Rate (e.g. 174) */}
                          <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-200 font-bold tabular-nums">
                            {formatRate(it.categoryRate)}
                          </td>

                          {/* 5. Current Stock (Muted grey if 0, bold if positive) */}
                          <td className="px-3 py-2 text-center border-r border-slate-200 tabular-nums">
                            <span
                              className={`font-semibold ${hasStock ? 'text-slate-900 font-bold' : 'text-slate-300 font-normal'
                                }`}
                            >
                              {formatQty(it.currentStock)}
                            </span>
                          </td>

                          {/* 6. In Transit (Blank or muted if 0) */}
                          <td className="px-3 py-2 text-center tabular-nums">
                            {hasTransit ? (
                              <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] border border-amber-200/60">
                                {formatQty(it.inTransit)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Count */}
            <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Purchased Items: <strong>{orderedHistoryItems.length}</strong></span>
              {stockLoading && <span className="text-primary animate-pulse font-medium">Updating live stock...</span>}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* RIGHT PANEL (5 Cols): NEW ITEM PRICE & PENDING ORDERS           */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* ─── 1. New Item Price Widget (Peach Header) ─────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {/* Header Row in Peach (#fce5cd) */}
                    <tr className="border-b border-slate-300 font-bold bg-[#fce5cd] text-[#78350f]">
                      <th className="px-3 py-2 text-left border-r border-slate-300 min-w-[140px] font-bold">
                        New Item Price
                      </th>
                      {displayRanks.map((r) => (
                        <th
                          key={r.rank_id || r.rank_name}
                          className="px-2.5 py-2 text-center border-r border-slate-300 last:border-r-0 min-w-[50px] font-bold"
                        >
                          {r.rank_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      {/* Dropdown to select Group / Item */}
                      <td className="p-1.5 border-r border-slate-200">
                        <Dropdown
                          value={selectedGroupId}
                          onValueChange={(val) => setSelectedGroupId(val)}
                          options={[
                            { value: 'all', label: 'All Groups' },
                            ...productGroups.map((g) => ({
                              value: g.group_id,
                              label: g.group_name,
                            })),
                          ]}
                          placeholder="Select Group..."
                          searchPlaceholder="Search product group..."
                          className="h-8 text-xs font-semibold bg-slate-50 border-slate-200"
                        />
                      </td>

                      {/* Rank Rate Columns (A, B, C...) */}
                      {displayRanks.map((r) => {
                        const rateVal = activePriceGroup?.rank_rates?.[r.rank_name];
                        return (
                          <td
                            key={r.rank_id || r.rank_name}
                            className="px-2 py-2 text-center font-bold text-slate-800 border-r border-slate-200 last:border-r-0 tabular-nums text-xs"
                          >
                            {formatRate(rateVal)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── 2. Pending Orders Table (Pink/Mauve Header) ─────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {/* Pink/Mauve Header Row (#ead1dc) */}
                    <tr className="border-b border-slate-300 font-bold bg-[#ead1dc] text-[#581c87]">
                      <th className="px-3 py-2.5 text-left border-r border-slate-300 min-w-[150px] font-bold">
                        Item Name
                      </th>
                      <th className="px-2.5 py-2.5 text-center border-r border-slate-300 w-24 whitespace-nowrap font-bold">
                        Or Date
                      </th>
                      <th className="px-2.5 py-2.5 text-center border-r border-slate-300 w-16 whitespace-nowrap font-bold">
                        Qty
                      </th>
                      <th className="px-2.5 py-2.5 text-right w-20 whitespace-nowrap font-bold">
                        Rate
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 bg-white">
                    {pendingOrders.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-slate-400 bg-slate-50/50">
                          No pending orders for this customer{selectedGroupId !== 'all' ? ' in this group' : ''}.
                        </td>
                      </tr>
                    ) : (
                      pendingOrders.map((po, idx) => (
                        <tr
                          key={po.id || idx}
                          className="hover:bg-slate-50/90 transition-colors text-[11.5px]"
                        >
                          {/* 1. Item Name */}
                          <td className="px-3 py-2 text-left font-semibold text-slate-800 border-r border-slate-200">
                            {po.productName}
                          </td>

                          {/* 2. Order Date (e.g. 20-Aug-26) */}
                          <td className="px-2.5 py-2 text-center text-slate-600 border-r border-slate-200 whitespace-nowrap font-medium">
                            {formatDisplayDate(po.orderDate)}
                          </td>

                          {/* 3. Quantity */}
                          <td className="px-2.5 py-2 text-center border-r border-slate-200 font-bold text-slate-900 tabular-nums">
                            {formatQty(po.pendingQty)}
                          </td>

                          {/* 4. Rate */}
                          <td className="px-2.5 py-2 text-right font-bold text-emerald-700 tabular-nums">
                            {formatRate(po.unitPrice)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pending Orders Footer */}
              <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Pending Orders: <strong>{pendingOrders.length}</strong>
                </span>
                {selectedGroupId !== 'all' && (
                  <span className="text-[10.5px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    Filtered by group
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesDashboard;
