import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, Download, Info, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const REQUIRED_COLUMNS = ['Product Name', 'Quantity'];

const COLUMN_ALIASES = {
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item', 'itemname'],
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

const BulkIndentProductsModal = ({ isOpen, onClose, products = [], onImportProducts }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'

  const productOptions = useMemo(() => {
    return products.map(p => ({ value: p.product_id, label: `${p.name} (${p.unit || 'units'})` }));
  }, [products]);

  const reset = () => {
    setStep('upload');
    setFileName('');
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

        const missing = REQUIRED_COLUMNS.filter(
          c => !Object.values(normalizedMap).includes(c)
        );
        if (missing.length > 0) {
          toast.error(`Missing required columns in document: ${missing.join(', ')}. Found: ${headers.join(', ')}`);
          return;
        }

        const productKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Product Name');
        const qtyKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Quantity');
        const rateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Rate');

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

    onImportProducts(itemsToImport, importMode);
    toast.success(`Successfully added ${itemsToImport.length} product(s) to indent!`);
    handleClose();
  };

  const handleExportHeaderOnly = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Product Name', 'Quantity', 'Rate']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Format_Headers');
    XLSX.writeFile(wb, 'Indent_Products_Headers_Only.csv');
  };

  const handleDownloadTemplate = () => {
    const sampleProduct1 = products[0]?.name || 'Cement Grade A';
    const sampleProduct2 = products[1]?.name || 'Steel Rods 10mm';

    const ws = XLSX.utils.json_to_sheet([
      {
        'Product Name': sampleProduct1,
        'Quantity': 100,
        'Rate': 320
      },
      {
        'Product Name': sampleProduct2,
        'Quantity': 250,
        'Rate': 600
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Indent_Products_Template');
    XLSX.writeFile(wb, 'Indent_Products_Upload_Template.xlsx');
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
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload Products to Indent</h2>
              <p className="text-xs text-slate-500">Import multiple purchase indent products via Excel or CSV file</p>
            </div>
          </div>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody className="space-y-4">
              {/* Light Note for Required Documents */}
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

              {/* Upload Drop Area */}
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

              {/* Template Download Bar */}
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
                              className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs outline-none focus:border-primary"
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
                              className="w-20 h-8 px-2 rounded-md border border-slate-200 text-xs text-right outline-none focus:border-primary"
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
                Import {rawRows.length} Product(s) to Indent
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default BulkIndentProductsModal;
