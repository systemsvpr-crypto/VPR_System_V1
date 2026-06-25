import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ArrowLeft, Loader, Database, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { bulkDispatchStock } from '../../../services/stockService';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const REQUIRED_COLUMNS = ['Product Name', 'Godown Name', 'Quantity'];

const COLUMN_ALIASES = {
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name'],
  'Quantity': ['quantity', 'qty', 'qnty', 'amount', 'count'],
  'Date': ['date', 'dispatch date', 'txn date', 'txndate', 'transaction date'],
};

const normalizeHeader = (header) => {
  const h = header.trim().toLowerCase();
  for (const [standard, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return standard;
  }
  return header.trim();
};

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const BulkDispatchModal = ({ isOpen, onClose, user, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setSubmitting(false);
    setResults(null);
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
      toast.error('Please upload a .xlsx, .xls, or .csv file.');
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
          toast.error('The file is empty.');
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
          toast.error(`Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`);
          return;
        }

        const qtyKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Quantity');
        const productKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Product Name');
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const dateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Date');

        const parsed = json.map((row) => {
          let rowDate = getTodayLocal();
          if (dateKey && row[dateKey]) {
            let d = row[dateKey];
            if (typeof d === 'number') {
              const excelEpoch = new Date(1899, 11, 30);
              const jsDate = new Date(excelEpoch.getTime() + d * 86400000);
              rowDate = jsDate.toISOString().split('T')[0];
            } else {
              const dStr = String(d).trim();
              if (dStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                rowDate = dStr;
              } else {
                 const pd = new Date(dStr);
                 if (!isNaN(pd.getTime())) {
                   rowDate = pd.toISOString().split('T')[0];
                 }
              }
            }
          }

          return {
            productName: String(row[productKey] || '').trim(),
            godownName: String(row[godownKey] || '').trim(),
            qty: Number(row[qtyKey]) || 0,
            date: rowDate,
          };
        }).filter(r => r.productName || r.godownName);

        if (parsed.length === 0) {
          toast.error('No valid data rows found in the file.');
          return;
        }

        setRows(parsed);
        setStep('preview');
      } catch (err) {
        toast.error('Failed to parse file: ' + err.message);
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

  const handleImport = async () => {
    setStep('processing');
    setSubmitting(true);
    try {
      const result = await bulkDispatchStock({
        rows,
        created_by: user?.user_id,
      });
      setResults(result);
      setStep('results');
      if (result.successCount > 0) {
        toast.success(`Dispatched ${result.successCount} entr${result.successCount === 1 ? 'y' : 'ies'} successfully`);
      }
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    reset();
    if (results?.successCount > 0) {
      onSuccess();
    }
    onClose();
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Product Name': 'Cement Grade A',
        'Godown Name': 'Main Godown',
        'Quantity': 50,
        'Date': getTodayLocal()
      },
      {
        'Product Name': 'Steel Rods 10mm',
        'Godown Name': 'Site B Godown',
        'Quantity': 100,
        'Date': getTodayLocal()
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Dispatch_Out_Template.xlsx');
  };

  const summary = rows.reduce((acc, r) => {
    const key = r.productName;
    if (!acc[key]) acc[key] = { productName: key, godowns: new Set(), totalQty: 0, count: 0 };
    acc[key].godowns.add(r.godownName);
    acc[key].totalQty += Number(r.qty) || 0;
    acc[key].count += 1;
    return acc;
  }, {});

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <div className="bg-rose-50 p-2 rounded-lg"><FileSpreadsheet size={20} className="text-rose-600" /></div>
          <h2 className="text-xl font-bold text-slate-800">Bulk Dispatch Out</h2>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-rose-500 hover:bg-rose-50 transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-200">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-400">.xlsx, .xls, or .csv files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleFile(e.target.files[0])}
                  className="hidden"
                />
              </div>
              
              <div className="mt-6 flex flex-col gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Your file must have columns named <strong>Product Name</strong>, <strong>Godown Name</strong>, and <strong>Quantity</strong>.
                    Products and Godowns must already exist in the system and have sufficient stock.
                    Date is optional and defaults to today.
                  </span>
                </div>
                
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Expected Format</span>
                    <button onClick={handleDownloadTemplate} className="text-xs text-rose-600 hover:underline flex items-center gap-1 font-medium transition-colors">
                      <Download size={12} /> Download Template
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Product Name<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Godown Name<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Quantity<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-50/50">
                        <tr>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">Cement Grade A</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">Main Godown</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">50</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">{getTodayLocal()}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500">Steel Rods 10mm</td>
                          <td className="px-3 py-2 text-slate-500">Site B Godown</td>
                          <td className="px-3 py-2 text-slate-500">100</td>
                          <td className="px-3 py-2 text-slate-500">{getTodayLocal()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </ModalFooter>
          </>
        )}

        {step === 'preview' && (
          <>
            <ModalBody>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{rows.length}</span> rows found in <span className="font-medium">{fileName}</span>
                </p>
                <button onClick={() => setStep('upload')} className="text-xs text-rose-600 hover:underline flex items-center gap-1">
                  <ArrowLeft size={12} /> Change file
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">#</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Product Name</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Godown Name</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Quantity</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-700">{r.productName || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-slate-700">{r.godownName || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.qty || <span className="text-red-400 italic">0</span>}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div><span className="text-slate-400">Unique Products:</span> <span className="font-medium">{Object.keys(summary).length}</span></div>
                  <div><span className="text-slate-400">Total Entries:</span> <span className="font-medium">{rows.length}</span></div>
                  {Object.entries(summary).slice(0, 5).map(([name, s]) => (
                    <div key={name} className="col-span-2 truncate" title={name}>
                      <span className="text-slate-400">•</span> {name} — <span className="font-medium">{s.godowns.size}</span> godown{s.godowns.size !== 1 ? 's' : ''}, <span className="font-medium">{s.totalQty}</span> total qty
                    </div>
                  ))}
                  {Object.keys(summary).length > 5 && (
                    <div className="col-span-2 text-slate-400 italic">...and {Object.keys(summary).length - 5} more</div>
                  )}
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={submitting} className="bg-rose-600 hover:bg-rose-700">
                {submitting ? 'Dispatching...' : `Dispatch ${rows.length} Entr${rows.length === 1 ? 'y' : 'ies'}`}
              </Button>
            </ModalFooter>
          </>
        )}

        {step === 'processing' && (
          <ModalBody>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-100">
                  <Database size={36} className="text-rose-600" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <span className="relative flex h-5 w-5">
                    <span className="animate-ping absolute inset-0 rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-rose-500"></span>
                  </span>
                </div>
              </div>
              <Loader size={28} className="text-rose-600 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800 mb-1">Dispatching Stock</p>
              <p className="text-sm text-slate-400">Processing {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}...</p>
              <div className="mt-6 w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <p className="text-xs text-slate-400 mt-2">This may take a few seconds</p>
            </div>
          </ModalBody>
        )}

        {step === 'results' && results && (
          <>
            <ModalBody>
              <div className="flex items-center gap-3 mb-4">
                {results.errorCount === 0 ? (
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle size={24} className="text-green-600" />
                  </div>
                ) : results.successCount > 0 ? (
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertCircle size={24} className="text-amber-600" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle size={24} className="text-red-600" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {results.errorCount === 0
                      ? 'Dispatch completed successfully!'
                      : results.successCount > 0
                        ? 'Dispatch completed with some errors'
                        : 'Dispatch failed'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {results.successCount} entr{results.successCount === 1 ? 'y' : 'ies'} dispatched
                    {results.errorCount > 0 ? ` · ${results.errorCount} error${results.errorCount === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
              </div>

              {results.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 border-b border-red-200 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-red-600 uppercase">Row</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-red-600 uppercase">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {results.errors.map((err, i) => (
                        <tr key={i} className="hover:bg-red-50/50">
                          <td className="px-3 py-2 text-xs text-slate-600">{err.row}</td>
                          <td className="px-3 py-2 text-xs text-red-600">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {results.successCount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-start gap-2 mt-4">
                  <CheckCircle size={14} className="mt-0.5 shrink-0" />
                  <span>Successfully dispatched {results.successCount} entr{results.successCount === 1 ? 'y' : 'ies'}.</span>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onClick={handleDone}>Done</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default BulkDispatchModal;
