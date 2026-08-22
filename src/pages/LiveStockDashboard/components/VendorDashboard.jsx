import { useState, useEffect, useMemo } from 'react';
import { Store, Search, Download, FileText, Loader2, RotateCcw, ChevronLeft, ChevronRight, ArrowLeft, Package, UserCheck, Clock, CheckCircle2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getVendorDashboardData } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const PAGE_SIZE_OPTIONS = [50, 100, 200];

// Compact stat pills for the vendor detail header — kept as one config list
// so the header/name block and all 5 metrics can sit in a single row instead
// of the name block and a separate stats-grid section stacked on top of it.
const detailStatPills = (v) => [
  { key: 'total', label: 'Total Qty', value: v.totalQty, icon: Package, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', valueColor: 'text-slate-800' },
  { key: 'approved', label: 'Approved Qty', value: v.approvedQty, icon: UserCheck, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
  { key: 'lift', label: 'Lift Qty', value: v.liftQty, icon: Truck, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', valueColor: 'text-amber-700' },
  { key: 'delivery', label: 'Delivery Qty', value: v.deliveryQty, icon: CheckCircle2, iconBg: 'bg-green-50', iconColor: 'text-green-600', valueColor: 'text-green-700' },
  { key: 'pending', label: 'Pending Qty', value: v.pendingQty, icon: Clock, iconBg: 'bg-red-50', iconColor: 'text-red-600', valueColor: 'text-red-600' },
];

const VendorDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndent, setSelectedIndent] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  // The vendor currently being viewed in the dedicated detail page — null
  // means the vendor list is showing. Clicking a vendor row navigates into
  // its detail page rather than expanding inline.
  const [detailVendorName, setDetailVendorName] = useState(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailSelectedProduct, setDetailSelectedProduct] = useState('');
  const [detailSelectedIndent, setDetailSelectedIndent] = useState('');
  const [detailSelectedDate, setDetailSelectedDate] = useState('');
  const [detailCurrentPage, setDetailCurrentPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await getVendorDashboardData();
      setData(rows || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load vendor dashboard data');
    }
    setLoading(false);
  };

  // Filter dropdown options
  const uniqueIndents = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.indentNo).filter(Boolean))).sort();
  }, [data]);

  const uniqueVendors = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.vendorName).filter(Boolean))).sort();
  }, [data]);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(data.map((r) => r.productName).filter(Boolean))).sort();
  }, [data]);

  // Filtered rows
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (selectedIndent && row.indentNo !== selectedIndent) return false;
      if (selectedVendor && row.vendorName !== selectedVendor) return false;
      if (selectedProduct && row.productName !== selectedProduct) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const match =
          row.indentNo?.toLowerCase().includes(query) ||
          row.vendorName?.toLowerCase().includes(query) ||
          row.productName?.toLowerCase().includes(query) ||
          row.approvedBy?.toLowerCase().includes(query) ||
          row.remark?.toLowerCase().includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [data, selectedIndent, selectedVendor, selectedProduct, searchQuery]);

  // Summary Totals
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, r) => ({
        totalQty: acc.totalQty + (r.totalQty || 0),
        pendingQty: acc.pendingQty + (r.pendingQty || 0),
        liftQty: acc.liftQty + (r.liftQty || 0),
        deliveryQty: acc.deliveryQty + (r.deliveryQty || 0),
        approvedQty: acc.approvedQty + (r.approveQty || r.totalQty || 0),
      }),
      { totalQty: 0, pendingQty: 0, liftQty: 0, deliveryQty: 0, approvedQty: 0 }
    );
  }, [filteredData]);

  // Group the flat indent-item rows by vendor — the table shows one summary
  // row per vendor, and clicking it navigates into a dedicated detail page
  // with the full indent-wise breakdown (the rows that used to be shown flat,
  // one per indent+product).
  const groupedByVendor = useMemo(() => {
    const map = new Map();
    for (const row of filteredData) {
      const key = row.vendorName || 'Unassigned Vendor';
      if (!map.has(key)) {
        map.set(key, {
          vendorName: key,
          rows: [],
          indentNumbers: new Set(),
          totalQty: 0,
          pendingQty: 0,
          liftQty: 0,
          deliveryQty: 0,
          approvedQty: 0,
        });
      }
      const group = map.get(key);
      group.rows.push(row);
      if (row.indentNo) group.indentNumbers.add(row.indentNo);
      group.totalQty += row.totalQty || 0;
      group.pendingQty += row.pendingQty || 0;
      group.liftQty += row.liftQty || 0;
      group.deliveryQty += row.deliveryQty || 0;
      // Same fallback the detail table uses per-row: an item without its own
      // approveQty is treated as approved for its full indent quantity.
      group.approvedQty += row.approveQty || row.totalQty || 0;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, indentCount: g.indentNumbers.size }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [filteredData]);

  const openVendorDetail = (vendorName) => {
    setDetailVendorName(vendorName);
    setDetailSearch('');
    setDetailSelectedProduct('');
    setDetailSelectedIndent('');
    setDetailSelectedDate('');
    setDetailCurrentPage(1);
  };

  const closeVendorDetail = () => {
    setDetailVendorName(null);
    setDetailSearch('');
    setDetailSelectedProduct('');
    setDetailSelectedIndent('');
    setDetailSelectedDate('');
    setDetailCurrentPage(1);
  };

  // The vendor group currently open in detail view (if any), and its rows
  // narrowed by the detail page's own search box.
  const detailVendor = useMemo(
    () => groupedByVendor.find((g) => g.vendorName === detailVendorName) || null,
    [groupedByVendor, detailVendorName]
  );

  const detailRows = useMemo(() => {
    if (!detailVendor) return [];
    
    let filtered = detailVendor.rows;

    if (detailSelectedProduct) {
      filtered = filtered.filter((row) => row.productName === detailSelectedProduct);
    }
    if (detailSelectedIndent) {
      filtered = filtered.filter((row) => row.indentNo === detailSelectedIndent);
    }
    if (detailSelectedDate) {
      filtered = filtered.filter((row) => row.indentDate === detailSelectedDate);
    }

    const query = detailSearch.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((row) =>
        row.indentNo?.toLowerCase().includes(query) ||
        row.productName?.toLowerCase().includes(query) ||
        row.approvedBy?.toLowerCase().includes(query) ||
        row.remark?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [detailVendor, detailSearch, detailSelectedProduct, detailSelectedIndent, detailSelectedDate]);

  const detailUniqueProducts = useMemo(() => {
    if (!detailVendor) return [];
    return Array.from(new Set(detailVendor.rows.map((r) => r.productName).filter(Boolean))).sort();
  }, [detailVendor]);

  const detailUniqueIndents = useMemo(() => {
    if (!detailVendor) return [];
    return Array.from(new Set(detailVendor.rows.map((r) => r.indentNo).filter(Boolean))).sort();
  }, [detailVendor]);

  const detailTotalItems = detailRows.length;
  const detailTotalPages = Math.max(1, Math.ceil(detailTotalItems / detailPageSize));
  
  const paginatedDetailRows = useMemo(() => {
    const start = (detailCurrentPage - 1) * detailPageSize;
    return detailRows.slice(start, start + detailPageSize);
  }, [detailRows, detailCurrentPage, detailPageSize]);

  const detailRangeStart = detailTotalItems > 0 ? (detailCurrentPage - 1) * detailPageSize + 1 : 0;
  const detailRangeEnd = Math.min(detailCurrentPage * detailPageSize, detailTotalItems);

  // Reset filters
  const handleResetFilters = () => {
    setSelectedIndent('');
    setSelectedVendor('');
    setSelectedProduct('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(selectedIndent || selectedVendor || selectedProduct || searchQuery);

  // Pagination now walks vendor groups, not individual indent-item rows —
  // each page shows N vendors, and expanding one reveals all of its rows.
  const totalItems = groupedByVendor.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedVendors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return groupedByVendor.slice(start, start + pageSize);
  }, [groupedByVendor, currentPage, pageSize]);

  const rangeStart = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  // Excel Export
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Vendor Dashboard');

      worksheet.columns = [
        { header: 'Indent No', key: 'indentNo', width: 16 },
        { header: 'Vendor Name', key: 'vendorName', width: 25 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Total Qty', key: 'totalQty', width: 14 },
        { header: 'Approved By', key: 'approvedBy', width: 20 },
        { header: 'Pending Qty', key: 'pendingQty', width: 14 },
        { header: 'Lift Qty', key: 'liftQty', width: 14 },
        { header: 'Delivery Qty', key: 'deliveryQty', width: 14 },
        { header: 'Delivery Expected Date', key: 'expectedDate', width: 22 },
        { header: 'Remark', key: 'remark', width: 30 },
      ];

      // Format header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      headerRow.height = 24;
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Add data rows
      filteredData.forEach((r) => {
        worksheet.addRow({
          indentNo: r.indentNo,
          vendorName: r.vendorName,
          productName: r.productName,
          unit: r.unit,
          totalQty: r.totalQty,
          approvedBy: r.approvedBy,
          pendingQty: r.pendingQty,
          liftQty: r.liftQty,
          deliveryQty: r.deliveryQty,
          expectedDate: r.expectedDate,
          remark: r.remark,
        });
      });

      // Totals row
      const totalRow = worksheet.addRow({
        indentNo: 'Total',
        vendorName: '',
        productName: '',
        unit: '',
        totalQty: totals.totalQty,
        approvedBy: '',
        pendingQty: totals.pendingQty,
        liftQty: totals.liftQty,
        deliveryQty: totals.deliveryQty,
        expectedDate: '',
        remark: '',
      });
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Vendor_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel exported successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel');
    }
    setExportingExcel(false);
  };

  // PDF Export
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const today = new Date().toISOString().split('T')[0];
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginLeft = 14;
      const marginRight = 14;

      // Header Banner
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(0, 0, pageWidth, 20, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('VPR SYSTEMS — VENDOR DASHBOARD', marginLeft, 12);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on ${today}`, pageWidth - marginRight, 12, { align: 'right' });

      const tableData = filteredData.map((r) => [
        r.indentNo,
        r.vendorName,
        r.productName,
        formatNum(r.totalQty),
        r.approvedBy,
        formatNum(r.pendingQty),
        formatNum(r.liftQty),
        formatNum(r.deliveryQty),
        r.expectedDate,
        r.remark,
      ]);

      const footRow = [
        [
          'Total',
          '',
          '',
          formatNum(totals.totalQty),
          '',
          formatNum(totals.pendingQty),
          formatNum(totals.liftQty),
          formatNum(totals.deliveryQty),
          '',
          '',
        ],
      ];

      autoTable(doc, {
        startY: 26,
        margin: { left: marginLeft, right: marginRight },
        head: [
          [
            'Indent No',
            'Vendor Name',
            'Product Name',
            'Total Qty',
            'Approved By',
            'Pending',
            'Lift Qty',
            'Delivery Qty',
            'Exp. Date',
            'Remark',
          ],
        ],
        body: tableData,
        foot: footRow,
        theme: 'grid',
        headStyles: {
          fillColor: [217, 230, 245],
          textColor: [30, 41, 59],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [51, 65, 85],
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [30, 41, 59],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold' },
          1: { halign: 'left' },
          2: { halign: 'left' },
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'left' },
          5: { halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
          6: { halign: 'right', textColor: [217, 119, 6] },
          7: { halign: 'right', textColor: [22, 163, 74] },
          8: { halign: 'center' },
          9: { halign: 'left' },
        },
      });

      doc.save(`Vendor_Dashboard_${today}.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    }
    setExportingPdf(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading vendor dashboard...</p>
      </div>
    );
  }

  // Dedicated vendor detail page — replaces the vendor list entirely while a
  // vendor row is open, rather than expanding inline underneath it.
  if (detailVendor) {
    return (
      <div className="flex flex-col gap-6 font-sans h-[calc(100vh-160px)] min-h-0">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          {/* Header: back button, vendor name/counts, and every qty metric
              all in a single row instead of a name row stacked on top of a
              separate stats-grid section. */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 overflow-x-auto">
            <button
              type="button"
              onClick={closeVendorDetail}
              className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0 shadow-sm"
            >
              <ArrowLeft size={13} />
              Back to Vendors
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-blue-50 p-1.5 rounded-lg text-blue-600 shrink-0">
                <Store size={15} />
              </div>
              <div className="leading-tight">
                <h3 className="font-semibold text-slate-800 text-sm whitespace-nowrap">{detailVendor.vendorName}</h3>
                <p className="text-[10px] text-slate-500 whitespace-nowrap">
                  {detailVendor.indentCount} indent{detailVendor.indentCount !== 1 ? 's' : ''} · {detailVendor.rows.length} item{detailVendor.rows.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="w-px h-7 bg-slate-200 shrink-0" />

            <div className="flex items-center gap-2 flex-1 min-w-0">
              {detailStatPills(detailVendor).map((s) => (
                <div key={s.key} className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white flex-1 min-w-[110px]">
                  <div className={`p-1 rounded-md ${s.iconBg} ${s.iconColor} shrink-0`}>
                    <s.icon size={13} />
                  </div>
                  <div className="leading-tight whitespace-nowrap">
                    <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">{s.label}</p>
                    <p className={`text-xs font-bold ${s.valueColor}`}>{formatNum(s.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Search & Filters */}
          <div className="p-4 bg-white border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Dropdown
                value={detailSelectedIndent || "all"}
                onValueChange={(v) => {
                  setDetailSelectedIndent(v === "all" ? "" : v);
                  setDetailCurrentPage(1);
                }}
                options={[{ value: "all", label: "All Indents" }, ...detailUniqueIndents.map(no => ({ value: no, label: no }))]}
                placeholder="All Indents"
                className="h-10 bg-white"
              />
            </div>
            
            <div>
              <Dropdown
                value={detailSelectedProduct || "all"}
                onValueChange={(v) => {
                  setDetailSelectedProduct(v === "all" ? "" : v);
                  setDetailCurrentPage(1);
                }}
                options={[{ value: "all", label: "All Products" }, ...detailUniqueProducts.map(p => ({ value: p, label: p }))]}
                placeholder="All Products"
                className="h-10 bg-white"
              />
            </div>

            <div>
              <DatePicker
                placeholder="Select Date"
                value={detailSelectedDate}
                className="h-10 w-full bg-white"
                onChange={(e) => {
                  setDetailSelectedDate(e.target.value);
                  setDetailCurrentPage(1);
                }}
              />
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search indent, product, remark..."
                value={detailSearch}
                onChange={(e) => {
                  setDetailSearch(e.target.value);
                  setDetailCurrentPage(1);
                }}
                className="pl-8 h-10 w-full"
              />
            </div>
          </div>

          {/* Indent-wise Detail Table */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-xs relative">
                <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-blue-50 border-b border-slate-200">
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">Product Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Total Qty(Indent Qty)</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Approve Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Approved By</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap">Pending</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap">Lift Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap">Delivery Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Delivery Expected Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDetailRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-primary text-center whitespace-nowrap">{row.indentNo}</td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.indentDate}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="font-medium text-slate-800">{row.productName}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.unit ? (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{row.unit}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums">{formatNum(row.totalQty)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums">{formatNum(row.approveQty || row.totalQty)}</td>
                    <td className="px-4 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <UserCheck size={13} className="text-slate-400 shrink-0" />
                        <span>{row.approvedBy}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-red-600 tabular-nums">
                      {row.pendingQty > 0 ? formatNum(row.pendingQty) : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-amber-700 tabular-nums">
                      {row.liftQty > 0 ? formatNum(row.liftQty) : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-green-700 tabular-nums">
                      {row.deliveryQty > 0 ? formatNum(row.deliveryQty) : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {row.expectedDate !== '—' ? (
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{row.expectedDate}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 max-w-[250px] truncate" title={row.remark}>{row.remark}</td>
                  </tr>
                ))}
                {paginatedDetailRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-400">
                      No items match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            
            {/* Pagination Footer */}
            <div className="flex-none px-4 py-2.5 border-t border-slate-200 bg-blue-50 flex items-center justify-between gap-4">
              {/* Left Side */}
              <div className="flex items-center gap-2">
                <select
                  value={detailPageSize}
                  onChange={(e) => {
                    setDetailPageSize(Number(e.target.value));
                    setDetailCurrentPage(1);
                  }}
                  className="ring-1 ring-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white font-medium text-xs md:text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] md:text-sm text-slate-600 whitespace-nowrap font-medium hidden sm:inline">
                  {detailRangeStart}-{detailRangeEnd} of {detailTotalItems}
                </span>
              </div>
              
              {/* Right Side */}
              <div className="flex items-center gap-2 md:gap-4 text-slate-700">
                <button
                  onClick={() => setDetailCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={detailCurrentPage === 1}
                  className="p-1.5 md:px-2 md:py-1 ring-1 ring-slate-200 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-primary"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <div className="flex items-center text-xs md:text-sm font-semibold text-slate-600">
                  {detailCurrentPage} / {detailTotalPages || 1}
                </div>
                <button
                  onClick={() => setDetailCurrentPage((p) => Math.min(detailTotalPages, p + 1))}
                  disabled={detailCurrentPage === detailTotalPages || detailTotalPages === 0}
                  className="p-1.5 md:px-2 md:py-1 ring-1 ring-slate-200 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-primary"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-sans h-[calc(100vh-160px)] min-h-0">

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-5 gap-3 p-4 bg-slate-50/50 border-b border-slate-100">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Package size={16} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Total Qty</p>
              <p className="text-base font-bold text-slate-800">{formatNum(totals.totalQty)}</p>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Approved Qty</p>
              <p className="text-base font-bold text-emerald-700">{formatNum(totals.approvedQty)}</p>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Truck size={16} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Lift Qty</p>
              <p className="text-base font-bold text-amber-700">{formatNum(totals.liftQty)}</p>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50 text-green-600">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Delivery Qty</p>
              <p className="text-base font-bold text-green-700">{formatNum(totals.deliveryQty)}</p>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Pending Qty</p>
              <p className="text-base font-bold text-red-600">{formatNum(totals.pendingQty)}</p>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-slate-100">
          {/* Indent Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Indent No.
            </label>
            <Dropdown
              value={selectedIndent || "all"}
              onValueChange={(v) => {
                setSelectedIndent(v === "all" ? "" : v);
                setCurrentPage(1);
              }}
              options={[{ value: "all", label: "All Indents" }, ...uniqueIndents.map(no => ({ value: no, label: no }))]}
              placeholder="All Indents"
              className="h-10 bg-white"
            />
          </div>

          {/* Vendor Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Vendor Name
            </label>
            <Dropdown
              value={selectedVendor || "all"}
              onValueChange={(v) => {
                setSelectedVendor(v === "all" ? "" : v);
                setCurrentPage(1);
              }}
              options={[{ value: "all", label: "All Vendors" }, ...uniqueVendors.map(v => ({ value: v, label: v }))]}
              placeholder="All Vendors"
              className="h-10 bg-white"
            />
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Product Name
            </label>
            <Dropdown
              value={selectedProduct || "all"}
              onValueChange={(v) => {
                setSelectedProduct(v === "all" ? "" : v);
                setCurrentPage(1);
              }}
              options={[{ value: "all", label: "All Products" }, ...uniqueProducts.map(p => ({ value: p, label: p }))]}
              placeholder="All Products"
              className="h-10 bg-white"
            />
          </div>

          {/* Global Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Search
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search anything..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 h-10 text-xs w-full"
              />
            </div>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <div className="self-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-10 px-3 text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Reset
              </Button>
            </div>
          )}
        </div>

        {/* Data Table — one row per vendor; click a row to open its
            dedicated detail page with the full indent-wise breakdown. */}
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-50 border-b border-slate-200">
                <th className="w-10 px-2 py-3" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
                  Vendor Name
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Indents
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">
                  Total Qty
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">
                  Approved Qty
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap">
                  Pending
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap">
                  Lift Qty
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap">
                  Delivery Qty
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedVendors.map((vendor) => (
                <tr
                  key={vendor.vendorName}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => openVendorDetail(vendor.vendorName)}
                >
                  <td className="px-2 py-3 text-center">
                    <ChevronRight size={16} className="text-slate-400" />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-blue-500 shrink-0" />
                      <span className="font-semibold text-slate-800">{vendor.vendorName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {vendor.indentCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                    {formatNum(vendor.totalQty)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">
                    {formatNum(vendor.approvedQty)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 tabular-nums">
                    {vendor.pendingQty > 0 ? formatNum(vendor.pendingQty) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700 tabular-nums">
                    {vendor.liftQty > 0 ? formatNum(vendor.liftQty) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700 tabular-nums">
                    {vendor.deliveryQty > 0 ? formatNum(vendor.deliveryQty) : <span className="text-slate-300">0</span>}
                  </td>
                </tr>
              ))}
              {groupedByVendor.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    No vendor indent records match your filters.
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>

        {/* Pagination Footer */}
        <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-blue-50 flex items-center justify-between gap-4 rounded-b-xl">
          {/* Left Side */}
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ring-1 ring-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white font-medium text-xs md:text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((val) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
            <span className="text-[10px] md:text-sm text-slate-600 whitespace-nowrap font-medium hidden sm:inline">
              {rangeStart}-{rangeEnd} of {totalItems}
            </span>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 md:gap-4 text-slate-700">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 md:px-2 md:py-1 ring-1 ring-slate-200 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-primary"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <div className="flex items-center text-xs md:text-sm font-semibold text-slate-600">
              {currentPage} / {totalPages || 1}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-1.5 md:px-2 md:py-1 ring-1 ring-slate-200 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-primary"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorDashboard;
