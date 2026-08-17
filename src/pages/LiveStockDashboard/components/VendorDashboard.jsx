import { useState, useEffect, useMemo } from 'react';
import { Store, Search, Download, FileText, Loader2, RotateCcw, ChevronLeft, ChevronRight, Package, UserCheck, Clock, CheckCircle2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getVendorDashboardData } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PAGE_SIZE_OPTIONS = [25, 50, 100];

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
      }),
      { totalQty: 0, pendingQty: 0, liftQty: 0, deliveryQty: 0 }
    );
  }, [filteredData]);

  // Reset filters
  const handleResetFilters = () => {
    setSelectedIndent('');
    setSelectedVendor('');
    setSelectedProduct('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(selectedIndent || selectedVendor || selectedProduct || searchQuery);

  // Pagination calculations
  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

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

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Top Header / Action Card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Store size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg">Vendor Indent Dashboard</h3>
              <p className="text-xs text-slate-500">Track indents, lifts, delivery progress, and vendor commitments</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel || exportingPdf || filteredData.length === 0}
              className="flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0 shadow-sm"
            >
              {exportingExcel ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export Excel
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingExcel || exportingPdf || filteredData.length === 0}
              className="flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0 shadow-sm"
            >
              {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Export PDF
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50/50 border-b border-slate-100">
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
        <div className="p-4 bg-white flex flex-wrap items-center gap-3 border-b border-slate-100">
          {/* Indent Filter */}
          <div className="w-full sm:w-44">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Indent No.
            </label>
            <select
              value={selectedIndent}
              onChange={(e) => {
                setSelectedIndent(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2.5 bg-white text-slate-700 focus:outline-none focus:border-primary shadow-xs"
            >
              <option value="">All Indents</option>
              {uniqueIndents.map((no) => (
                <option key={no} value={no}>
                  {no}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="w-full sm:w-52">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Vendor Name
            </label>
            <select
              value={selectedVendor}
              onChange={(e) => {
                setSelectedVendor(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2.5 bg-white text-slate-700 focus:outline-none focus:border-primary shadow-xs"
            >
              <option value="">All Vendors</option>
              {uniqueVendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Product Filter */}
          <div className="w-full sm:w-60">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Product Name
            </label>
            <select
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2.5 bg-white text-slate-700 focus:outline-none focus:border-primary shadow-xs"
            >
              <option value="">All Products</option>
              {uniqueProducts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Global Search */}
          <div className="w-full sm:w-64">
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
                className="pl-8 h-8 text-xs w-full"
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
                className="h-8 text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Reset
              </Button>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Indent No
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[160px]">
                  Vendor Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
                  Product Name
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">
                  Total Qty
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">
                  Approved By
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
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">
                  Delivery Expected Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                  Remark
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">
                    {row.indentNo}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {row.vendorName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{row.productName}</span>
                      {row.unit && (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {row.unit}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                    {formatNum(row.totalQty)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <UserCheck size={13} className="text-slate-400 shrink-0" />
                      <span>{row.approvedBy}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 tabular-nums">
                    {row.pendingQty > 0 ? (
                      formatNum(row.pendingQty)
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700 tabular-nums">
                    {row.liftQty > 0 ? (
                      formatNum(row.liftQty)
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700 tabular-nums">
                    {row.deliveryQty > 0 ? (
                      formatNum(row.deliveryQty)
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600 tabular-nums whitespace-nowrap">
                    {row.expectedDate !== '—' ? (
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {row.expectedDate}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate" title={row.remark}>
                    {row.remark}
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">
                    No vendor indent records match your filters.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-800">Total</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-normal" colSpan={2}>
                    {filteredData.length} item(s)
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                    {formatNum(totals.totalQty)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-red-600 tabular-nums">
                    {formatNum(totals.pendingQty)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-700 tabular-nums">
                    {formatNum(totals.liftQty)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700 tabular-nums">
                    {formatNum(totals.deliveryQty)}
                  </td>
                  <td className="px-4 py-3" colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-primary bg-white font-medium text-xs shadow-sm"
            >
              {PAGE_SIZE_OPTIONS.map((val) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {rangeStart}-{rangeEnd} of {totalItems}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span className="text-xs font-semibold text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
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
