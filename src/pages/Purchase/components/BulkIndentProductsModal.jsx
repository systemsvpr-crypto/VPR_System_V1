import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, Download, Info, FileText, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const COLUMN_ALIASES = {
  'Indent Date': ['indent date', 'indentdate', 'date', 'indent_date'],
  'Indent Number': ['indent number', 'indentnumber', 'indent no', 'indent no.', 'indent_no', 'indent_number'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name', 'location', 'godown_name'],
  'Vendor Name': ['vendor name', 'vendorname', 'vendor', 'supplier', 'supplier name', 'party name', 'party', 'vendor_name'],
  'Remarks': ['remarks', 'remark', 'notes', 'note', 'description'],
  'Process Type': ['process type', 'processtype', 'type', 'indent type', 'process_type'],
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item', 'itemname', 'product_name'],
  'Quantity': ['quantity', 'qty', 'qnty', 'count', 'amount', 'units'],
  'Rate': ['rate', 'unit rate', 'unit price', 'unitprice', 'price', 'cost', 'unit cost', 'amount/unit'],
};

const normalizeHeader = (header) => {
  if (!header) return '';
  const h = String(header).trim().toLowerCase();
  for (const [standard, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return standard;
  }
  return String(header).trim();
};

const parseExcelDate = (val) => {
  if (!val) return '';
  if (typeof val === 'number') {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (err) {}
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const d = String(match[1]).padStart(2, '0');
    const m = String(match[2]).padStart(2, '0');
    const y = match[3];
    return `${y}-${m}-${d}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return '';
};

const BulkIndentProductsModal = ({ isOpen, onClose, products = [], godowns = [], vendors = [], onImportProducts }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [headerData, setHeaderData] = useState({
    indent_date: '',
    indent_number: '',
    godown_id: '',
    vendor_id: '',
    remarks: '',
    process_type: 'process',
    rawGodownName: '',
    rawVendorName: '',
  });
  const [rawRows, setRawRows] = useState([]);
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'

  const activeGodowns = useMemo(() => godowns.filter(g => g.is_active), [godowns]);

  const productOptions = useMemo(() => {
    return products.map(p => ({ value: p.product_id, label: `${p.name} (${p.unit || 'units'})` }));
  }, [products]);

  const godownOptions = useMemo(() => {
    return activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));
  }, [activeGodowns]);

  const vendorOptions = useMemo(() => {
    return vendors.map(v => ({ value: v.vendor_id, label: v.name }));
  }, [vendors]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaderData({
      indent_date: '',
      indent_number: '',
      godown_id: '',
      vendor_id: '',
      remarks: '',
      process_type: 'process',
      rawGodownName: '',
      rawVendorName: '',
    });
    setRawRows([]);
    setImportMode('append');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Please upload a valid document (.xlsx, .xls, or .csv).');
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!json || json.length === 0) {
          toast.error('The uploaded document is empty.');
          return;
        }

        const headers = Object.keys(json[0]);
        const normalizedMap = {};
        for (const h of headers) {
          normalizedMap[h] = normalizeHeader(h);
        }

        const productKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Product Name');
        const qtyKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Quantity');
        const rateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Rate');

        if (!productKey || !qtyKey) {
          toast.error(`Missing required item columns ("Product Name" and "Quantity"). Found: ${headers.join(', ')}`);
          return;
        }

        // Header detection
        const indentDateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Indent Date');
        const indentNumKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Indent Number');
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const vendorKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Vendor Name');
        const remarksKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Remarks');
        const processTypeKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Process Type');

        let rawIndentDate = '';
        let rawIndentNumber = '';
        let rawGodownName = '';
        let rawVendorName = '';
        let rawRemarks = '';
        let rawProcessType = '';

        for (const r of json) {
          if (!rawIndentDate && indentDateKey && r[indentDateKey]) rawIndentDate = r[indentDateKey];
          if (!rawIndentNumber && indentNumKey && r[indentNumKey]) rawIndentNumber = String(r[indentNumKey]).trim();
          if (!rawGodownName && godownKey && r[godownKey]) rawGodownName = String(r[godownKey]).trim();
          if (!rawVendorName && vendorKey && r[vendorKey]) rawVendorName = String(r[vendorKey]).trim();
          if (!rawRemarks && remarksKey && r[remarksKey]) rawRemarks = String(r[remarksKey]).trim();
          if (!rawProcessType && processTypeKey && r[processTypeKey]) rawProcessType = String(r[processTypeKey]).trim();
        }

        const parsedIndentDate = parseExcelDate(rawIndentDate);
        const matchedGodown = activeGodowns.find(g => g.name.trim().toLowerCase() === rawGodownName.toLowerCase());
        const matchedVendor = vendors.find(v => v.name.trim().toLowerCase() === rawVendorName.toLowerCase());
        let parsedProcessType = 'process';
        if (rawProcessType) {
          const pLower = rawProcessType.toLowerCase();
          if (pLower.includes('direct')) parsedProcessType = 'direct';
        }

        setHeaderData({
          indent_date: parsedIndentDate,
          indent_number: rawIndentNumber,
          godown_id: matchedGodown ? matchedGodown.godown_id : '',
          vendor_id: matchedVendor ? matchedVendor.vendor_id : '',
          remarks: rawRemarks,
          process_type: parsedProcessType,
          rawGodownName,
          rawVendorName,
        });

        const parsedRows = json.map((row, idx) => {
          const rawProd = String(row[productKey] || '').trim();
          const rawQty = Number(row[qtyKey]) || 0;
          const rawRate = rateKey && row[rateKey] !== '' ? String(row[rateKey]) : '';

          // Find product match
          const matchedProd = products.find(p => p.name.trim().toLowerCase() === rawProd.toLowerCase());

          return {
            id: idx,
            rawProductName: rawProd,
            product_id: matchedProd ? matchedProd.product_id : '',
            rate: rawRate,
            quantity: rawQty > 0 ? String(rawQty) : '1',
          };
        }).filter(r => r.rawProductName);

        if (parsedRows.length === 0) {
          toast.error('No valid product rows found in the uploaded document.');
          return;
        }

        setRawRows(parsedRows);
        setStep('preview');
      } catch (err) {
        toast.error('Failed to parse document: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleUpdateRow = (index, field, value) => {
    const updated = [...rawRows];
    updated[index][field] = value;
    setRawRows(updated);
  };

  const handleConfirmImport = () => {
    const invalidCount = rawRows.filter(r => !r.product_id || !Number(r.quantity)).length;
    if (invalidCount > 0) {
      toast.error(`Please select a valid product for all rows (${invalidCount} incomplete).`);
      return;
    }

    const itemsToImport = rawRows.map(r => ({
      product_id: r.product_id,
      rate: r.rate || '0',
      quantity: r.quantity || '1',
    }));

    onImportProducts({
      header: headerData,
      items: itemsToImport,
    }, importMode);

    toast.success(`Successfully imported indent data with ${itemsToImport.length} product(s)!`);
    handleClose();
  };

  const handleExportHeaderOnly = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Indent Date', 'Indent Number', 'Godown Name', 'Vendor Name', 'Process Type', 'Remarks', 'Product Name', 'Quantity', 'Rate']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Format_Headers');
    XLSX.writeFile(wb, 'Indent_Bulk_Import_Headers_Only.csv');
  };

  const handleDownloadTemplate = () => {
    const sampleVendor = vendors[0]?.name || 'Reliable Traders';
    const sampleGodown = activeGodowns[0]?.name || 'Main Godown';
    const sampleProduct1 = products[0]?.name || 'Cement Grade A';
    const sampleProduct2 = products[1]?.name || 'Steel Rods 10mm';

    const ws = XLSX.utils.json_to_sheet([
      {
        'Indent Date': '2026-07-30',
        'Indent Number': 'VPR/IN-001',
        'Godown Name': sampleGodown,
        'Vendor Name': sampleVendor,
        'Process Type': 'Process',
        'Remarks': 'Urgent purchase',
        'Product Name': sampleProduct1,
        'Quantity': 100,
        'Rate': 320
      },
      {
        'Indent Date': '2026-07-30',
        'Indent Number': 'VPR/IN-001',
        'Godown Name': sampleGodown,
        'Vendor Name': sampleVendor,
        'Process Type': 'Process',
        'Remarks': 'Urgent purchase',
        'Product Name': sampleProduct2,
        'Quantity': 250,
        'Rate': 600
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Indent_Import_Template');
    XLSX.writeFile(wb, 'Indent_Bulk_Upload_Template.xlsx');
  };

  const validRowsCount = useMemo(() => {
    return rawRows.filter(r => r.product_id && Number(r.quantity) > 0).length;
  }, [rawRows]);

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <FileSpreadsheet size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload Indent</h2>
              <p className="text-xs text-slate-500">Import complete indent details and products via Excel or CSV file</p>
            </div>
          </div>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody className="space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <FileText size={16} />
                    </div>
                    <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                      <Info size={15} className="text-primary" /> Required Document Guidelines & Format
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportHeaderOnly}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-primary/5 text-primary border border-primary/30 rounded-lg text-xs font-semibold shadow-2xs transition-all hover:border-primary shrink-0"
                  >
                    <Download size={13} /> Export Format (Headers Only)
                  </button>
                </div>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-white flex items-center justify-center mx-auto mb-3 border border-slate-200 shadow-2xs transition-all">
                  <Upload size={24} className="text-slate-500 group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Click to upload document or drag and drop</p>
                <p className="text-xs text-slate-400">Excel spreadsheets (.xlsx, .xls) or CSV files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleFile(e.target.files[0])}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-600 font-medium">Need a sample document format?</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-primary hover:underline flex items-center gap-1.5 font-semibold transition-colors"
                >
                  <Download size={14} /> Download Sample Template
                </button>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            </ModalFooter>
          </>
        )}

        {step === 'preview' && (
          <>
            <ModalBody className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <p className="text-sm text-slate-700">
                    Document: <span className="font-semibold text-slate-800">{fileName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Found <span className="font-semibold text-slate-700">{rawRows.length}</span> items ({validRowsCount} fully matched)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="text-xs text-slate-600 hover:text-primary flex items-center gap-1 font-medium"
                  >
                    <ArrowLeft size={12} /> Change Document
                  </button>
                </div>
              </div>

              {/* Indent Header Fields Preview Card */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-primary" /> Indent Header Information
                  </span>
                  {(headerData.rawVendorName && !headerData.vendor_id || headerData.rawGodownName && !headerData.godown_id) && (
                    <span className="text-[11px] text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Some header fields not matched. Please select below.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Indent Date</label>
                    <DatePicker
                      value={headerData.indent_date}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, indent_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Indent Number</label>
                    <Input
                      value={headerData.indent_number}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, indent_number: e.target.value }))}
                      placeholder="e.g. VPR/IN-001"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Godown</label>
                    <Dropdown
                      value={headerData.godown_id}
                      onValueChange={(val) => setHeaderData(prev => ({ ...prev, godown_id: val }))}
                      options={godownOptions}
                      placeholder={headerData.rawGodownName ? `Match "${headerData.rawGodownName}"...` : "Select godown..."}
                      searchPlaceholder="Search godowns..."
                      align="start"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Vendor</label>
                    <Dropdown
                      value={headerData.vendor_id}
                      onValueChange={(val) => setHeaderData(prev => ({ ...prev, vendor_id: val }))}
                      options={vendorOptions}
                      placeholder={headerData.rawVendorName ? `Match "${headerData.rawVendorName}"...` : "Select vendor..."}
                      searchPlaceholder="Search vendors..."
                      align="start"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Process Type</label>
                    <Dropdown
                      value={headerData.process_type}
                      onValueChange={(val) => setHeaderData(prev => ({ ...prev, process_type: val }))}
                      options={[
                        { value: 'process', label: 'Process' },
                        { value: 'direct', label: 'Direct' },
                      ]}
                      align="start"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Remarks</label>
                    <Input
                      value={headerData.remarks}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, remarks: e.target.value }))}
                      placeholder="Optional remarks..."
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Import Mode Toggle */}
              <div className="flex items-center gap-4 text-xs font-medium bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500">Import Mode:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="text-primary focus:ring-primary"
                  />
                  <span>Append to existing products</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="text-primary focus:ring-primary"
                  />
                  <span>Replace existing products</span>
                </label>
              </div>

              {/* Parsed Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2 w-6/12">Product <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 w-3/12">Rate</th>
                      <th className="px-3 py-2 w-3/12 text-right">Qty <span className="text-red-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawRows.map((row, i) => {
                      const isMatched = !!row.product_id;
                      return (
                        <tr key={i} className={isMatched ? 'hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50/70'}>
                          <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2">
                            <Dropdown
                              value={row.product_id}
                              onValueChange={(val) => handleUpdateRow(i, 'product_id', val)}
                              options={productOptions}
                              placeholder={row.rawProductName ? `Match "${row.rawProductName}"...` : "Select product..."}
                              searchPlaceholder="Search products..."
                              align="start"
                            />
                            {!row.product_id && row.rawProductName && (
                              <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                                File value: "{row.rawProductName}" (Not matched)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.rate}
                              onChange={(e) => handleUpdateRow(i, 'rate', e.target.value)}
                              placeholder="0.00"
                              className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs outline-none focus:border-primary bg-white"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={row.quantity}
                              onChange={(e) => handleUpdateRow(i, 'quantity', e.target.value.replace(/\D/g, ''))}
                              placeholder="1"
                              className="w-20 h-8 px-2 rounded-md border border-slate-200 text-xs text-right outline-none focus:border-primary bg-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="button" onClick={handleConfirmImport} disabled={validRowsCount === 0}>
                Import Indent ({rawRows.length} Products)
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default BulkIndentProductsModal;
