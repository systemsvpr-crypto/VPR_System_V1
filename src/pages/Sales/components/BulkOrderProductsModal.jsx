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
  'Order Date': ['order date', 'orderdate', 'date', 'order_date'],
  'Order Number': ['order number', 'ordernumber', 'order no', 'order no.', 'order_no', 'order_number'],
  'Customer Name': ['customer name', 'customer', 'customername', 'client', 'party name', 'party', 'customer_name'],
  'Process Type': ['process type', 'processtype', 'type', 'order type', 'process_type'],
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item', 'itemname', 'product_name'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name', 'location', 'godown_name'],
  'Quantity': ['quantity', 'qty', 'qnty', 'count', 'amount', 'units'],
  'Unit Price': ['unit price', 'unitprice', 'price', 'rate', 'cost', 'unit cost', 'amount/unit'],
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

const BulkOrderProductsModal = ({ isOpen, onClose, products = [], godowns = [], customers = [], onImportProducts }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [headerData, setHeaderData] = useState({
    order_date: '',
    order_number: '',
    customer_id: '',
    rawCustomerName: '',
    process_type: 'order_process',
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

  const customerOptions = useMemo(() => {
    return customers.map(c => ({ value: c.customer_id, label: c.name }));
  }, [customers]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaderData({
      order_date: '',
      order_number: '',
      customer_id: '',
      rawCustomerName: '',
      process_type: 'order_process',
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
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const qtyKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Quantity');
        const priceKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Unit Price');

        if (!productKey || !qtyKey) {
          toast.error(`Missing required item columns ("Product Name" and "Quantity"). Found: ${headers.join(', ')}`);
          return;
        }

        // Header detection
        const orderDateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Order Date');
        const orderNumKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Order Number');
        const customerKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Customer Name');
        const processTypeKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Process Type');

        let rawOrderDate = '';
        let rawOrderNumber = '';
        let rawCustomerName = '';
        let rawProcessType = '';

        for (const r of json) {
          if (!rawOrderDate && orderDateKey && r[orderDateKey]) rawOrderDate = r[orderDateKey];
          if (!rawOrderNumber && orderNumKey && r[orderNumKey]) rawOrderNumber = String(r[orderNumKey]).trim();
          if (!rawCustomerName && customerKey && r[customerKey]) rawCustomerName = String(r[customerKey]).trim();
          if (!rawProcessType && processTypeKey && r[processTypeKey]) rawProcessType = String(r[processTypeKey]).trim();
        }

        const parsedOrderDate = parseExcelDate(rawOrderDate);
        const matchedCustomer = customers.find(c => c.name.trim().toLowerCase() === rawCustomerName.toLowerCase());
        let parsedProcessType = 'order_process';
        if (rawProcessType) {
          const pLower = rawProcessType.toLowerCase();
          if (pLower.includes('skip')) parsedProcessType = 'skip_delivered';
        }

        setHeaderData({
          order_date: parsedOrderDate,
          order_number: rawOrderNumber,
          customer_id: matchedCustomer ? matchedCustomer.customer_id : '',
          rawCustomerName,
          process_type: parsedProcessType,
        });

        const parsedRows = json.map((row, idx) => {
          const rawProd = String(row[productKey] || '').trim();
          const rawGodown = godownKey ? String(row[godownKey] || '').trim() : '';
          const rawQty = Number(row[qtyKey]) || 0;
          const rawPrice = priceKey && row[priceKey] !== '' ? String(row[priceKey]) : '';

          // Find product match
          const matchedProd = products.find(p => p.name.trim().toLowerCase() === rawProd.toLowerCase());
          // Find godown match
          const matchedGodown = activeGodowns.find(g => g.name.trim().toLowerCase() === rawGodown.toLowerCase());

          return {
            id: idx,
            rawProductName: rawProd,
            rawGodownName: rawGodown,
            product_id: matchedProd ? matchedProd.product_id : '',
            godown_id: matchedGodown ? matchedGodown.godown_id : (activeGodowns[0]?.godown_id || ''),
            unit_price: rawPrice,
            quantity: rawQty > 0 ? String(rawQty) : '1',
          };
        }).filter(r => r.rawProductName || r.rawGodownName);

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
    const invalidCount = rawRows.filter(r => !r.product_id || !r.godown_id || !Number(r.quantity)).length;
    if (invalidCount > 0) {
      toast.error(`Please select a valid product and godown for all rows (${invalidCount} incomplete).`);
      return;
    }

    const itemsToImport = rawRows.map(r => ({
      product_id: r.product_id,
      godown_id: r.godown_id,
      unit_price: r.unit_price || '0',
      quantity: r.quantity || '1',
    }));

    onImportProducts({
      header: headerData,
      items: itemsToImport,
    }, importMode);

    toast.success(`Successfully imported order data with ${itemsToImport.length} product(s)!`);
    handleClose();
  };

  const handleExportHeaderOnly = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Order Date', 'Order Number', 'Customer Name', 'Process Type', 'Product Name', 'Godown Name', 'Unit Price', 'Quantity']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Format_Headers');
    XLSX.writeFile(wb, 'Order_Bulk_Import_Headers_Only.csv');
  };

  const handleDownloadTemplate = () => {
    const sampleCustomer = customers[0]?.name || 'Acme Enterprises';
    const sampleProduct1 = products[0]?.name || 'Cement Grade A';
    const sampleProduct2 = products[1]?.name || 'Steel Rods 10mm';
    const sampleGodown1 = activeGodowns[0]?.name || 'Main Godown';
    const sampleGodown2 = activeGodowns[1]?.name || activeGodowns[0]?.name || 'Factory Godown';

    const ws = XLSX.utils.json_to_sheet([
      {
        'Order Date': '2026-07-30',
        'Order Number': 'VPR/OR-001',
        'Customer Name': sampleCustomer,
        'Process Type': 'Order Process',
        'Product Name': sampleProduct1,
        'Godown Name': sampleGodown1,
        'Quantity': 50,
        'Unit Price': 350
      },
      {
        'Order Date': '2026-07-30',
        'Order Number': 'VPR/OR-001',
        'Customer Name': sampleCustomer,
        'Process Type': 'Order Process',
        'Product Name': sampleProduct2,
        'Godown Name': sampleGodown2,
        'Quantity': 100,
        'Unit Price': 650
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order_Import_Template');
    XLSX.writeFile(wb, 'Order_Bulk_Upload_Template.xlsx');
  };

  const validRowsCount = useMemo(() => {
    return rawRows.filter(r => r.product_id && r.godown_id && Number(r.quantity) > 0).length;
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
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload Order</h2>
              <p className="text-xs text-slate-500">Import complete order details and products via Excel or CSV file</p>
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

              {/* Order Header Fields Preview Card */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-primary" /> Order Header Information
                  </span>
                  {headerData.rawCustomerName && !headerData.customer_id && (
                    <span className="text-[11px] text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Customer "{headerData.rawCustomerName}" not matched. Select below.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Order Date</label>
                    <DatePicker
                      value={headerData.order_date}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, order_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Order Number</label>
                    <Input
                      value={headerData.order_number}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, order_number: e.target.value }))}
                      placeholder="e.g. VPR/OR-001"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Customer</label>
                    <Dropdown
                      value={headerData.customer_id}
                      onValueChange={(val) => setHeaderData(prev => ({ ...prev, customer_id: val }))}
                      options={customerOptions}
                      placeholder={headerData.rawCustomerName ? `Match "${headerData.rawCustomerName}"...` : "Select customer..."}
                      searchPlaceholder="Search customers..."
                      align="start"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Process Type</label>
                    <Dropdown
                      value={headerData.process_type}
                      onValueChange={(val) => setHeaderData(prev => ({ ...prev, process_type: val }))}
                      options={[
                        { value: 'order_process', label: 'Order Process' },
                        { value: 'skip_delivered', label: 'Skip Delivered' },
                      ]}
                      align="start"
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
                      <th className="px-3 py-2 w-5/12">Product <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 w-4/12">Godown <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 w-2/12">Unit Price</th>
                      <th className="px-3 py-2 w-2/12 text-right">Qty <span className="text-red-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawRows.map((row, i) => {
                      const isMatched = row.product_id && row.godown_id;
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
                            <Dropdown
                              value={row.godown_id}
                              onValueChange={(val) => handleUpdateRow(i, 'godown_id', val)}
                              options={godownOptions}
                              placeholder={row.rawGodownName ? `Match "${row.rawGodownName}"...` : "Select godown..."}
                              searchPlaceholder="Search godowns..."
                              align="start"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.unit_price}
                              onChange={(e) => handleUpdateRow(i, 'unit_price', e.target.value)}
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
                Import Order ({rawRows.length} Products)
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default BulkOrderProductsModal;
