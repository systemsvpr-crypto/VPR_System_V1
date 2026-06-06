import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ArrowLeft, Loader, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { bulkImportProducts } from '../../../services/masterService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const REQUIRED_COLUMNS = ['Product Name', 'Godown Name'];

const COLUMN_ALIASES = {
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name'],
  'Quantity': ['quantity', 'qty', 'qnty', 'stock', 'opening stock', 'opening', 'count'],
  'Product Type': ['product type', 'producttype', 'type', 'category', 'item type'],
};

const normalizeHeader = (header) => {
  const h = header.trim().toLowerCase();
  for (const [standard, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return standard;
  }
  return header.trim();
};

const BulkImportModal = ({ isOpen, onClose, user, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setAsOfDate(new Date().toISOString().split('T')[0]);
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

        const qtyKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Quantity') || 'Quantity';
        const productKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Product Name');
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const typeKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Product Type');

        const parsed = json.map((row) => ({
          productName: String(row[productKey] || '').trim(),
          godownName: String(row[godownKey] || '').trim(),
          qty: Number(row[qtyKey]) || 0,
          productType: typeKey ? String(row[typeKey] || '').trim() : '',
        })).filter(r => r.productName || r.godownName);

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
      const result = await bulkImportProducts({
        rows,
        as_of_date: asOfDate,
        created_by: user?.user_id,
      });
      setResults(result);
      setStep('results');
      if (result.successCount > 0) {
        toast.success(`Imported ${result.successCount} opening stock entr${result.successCount === 1 ? 'y' : 'ies'} successfully`);
      }
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    reset();
    onSuccess();
    onClose();
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
          <div className="bg-primary/10 p-2 rounded-lg"><FileSpreadsheet size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">Bulk Import Products</h2>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Your file must have columns named <strong>Product Name</strong>, <strong>Godown Name</strong>, and <strong>Quantity</strong>.
                  Products not found in the system will be auto-created with default settings (unit: kg, negative stock: off).
                  Godowns must already exist in the system.
                </span>
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
                <button onClick={() => setStep('upload')} className="text-xs text-primary hover:underline flex items-center gap-1">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-700">{r.productName || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-slate-700">{r.godownName || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.qty || <span className="text-red-400 italic">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">As of Date</label>
                <DatePicker value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={submitting}>
                {submitting ? 'Importing...' : `Import ${rows.length} Entr${rows.length === 1 ? 'y' : 'ies'}`}
              </Button>
            </ModalFooter>
          </>
        )}

        {step === 'processing' && (
          <ModalBody>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10">
                  <Database size={36} className="text-primary" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <span className="relative flex h-5 w-5">
                    <span className="animate-ping absolute inset-0 rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-primary"></span>
                  </span>
                </div>
              </div>
              <Loader size={28} className="text-primary animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800 mb-1">Importing Products</p>
              <p className="text-sm text-slate-400">Processing {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} into the system...</p>
              <div className="mt-6 w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }}></div>
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
                      ? 'Import completed successfully!'
                      : results.successCount > 0
                        ? 'Import completed with some errors'
                        : 'Import failed'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {results.successCount} entr{results.successCount === 1 ? 'y' : 'ies'} imported
                    {results.newProductCount > 0 ? ` · ${results.newProductCount} product${results.newProductCount === 1 ? '' : 's'} created` : ''}
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-start gap-2">
                  <CheckCircle size={14} className="mt-0.5 shrink-0" />
                  <span>Successfully imported {results.successCount} opening stock entr{results.successCount === 1 ? 'y' : 'ies'} into the system.</span>
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

export default BulkImportModal;
