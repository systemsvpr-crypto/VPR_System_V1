import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ArrowLeft, Loader, Database, Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

// ---------------------------------------------------------------------------
// CONFIGS — define one per entity type
// ---------------------------------------------------------------------------
export const CUSTOMER_CONFIG = {
  label: 'Customers',
  fileName: 'Customers_Import_Template.xlsx',
  columns: [
    { key: 'name',         header: 'Name',         required: true,  aliases: ['name', 'customer name', 'customername', 'customer'] },
    { key: 'phone_number', header: 'Phone',         required: false, aliases: ['phone', 'phone number', 'phonenumber', 'mobile', 'contact'] },
    { key: 'email',        header: 'Email',         required: false, aliases: ['email', 'email address', 'emailaddress'] },
    { key: 'location',     header: 'Location',      required: false, aliases: ['location', 'address', 'city', 'place'] },
    { key: 'gst_number',   header: 'GST Number',    required: false, aliases: ['gst number', 'gstnumber', 'gst', 'gstin'] },
    { key: 'crm_follow_up', header: 'CRM Follow Up', required: false, aliases: ['crm follow up', 'crmfollowup', 'crm_follow_up', 'crm', 'follow up', 'followup', 'crm notes', 'crm status', 'remarks'] },
  ],
  templateRows: [
    { Name: 'Acme Corp', Phone: '9876543210', Email: 'acme@example.com', Location: 'Mumbai', 'GST Number': '27ABCDE1234F1Z5', 'CRM Follow Up': 'Call next week' },
    { Name: 'Beta Ltd',  Phone: '9123456789', Email: 'beta@example.com', Location: 'Delhi',  'GST Number': '', 'CRM Follow Up': '' },
  ],
};

export const VENDOR_CONFIG = {
  label: 'Vendors',
  fileName: 'Vendors_Import_Template.xlsx',
  columns: [
    { key: 'name',         header: 'Name',         required: true,  aliases: ['name', 'vendor name', 'vendorname', 'vendor', 'supplier'] },
    { key: 'phone_number', header: 'Phone',         required: false, aliases: ['phone', 'phone number', 'phonenumber', 'mobile', 'contact'] },
    { key: 'email',        header: 'Email',         required: false, aliases: ['email', 'email address', 'emailaddress'] },
    { key: 'location',     header: 'Location',      required: false, aliases: ['location', 'address', 'city', 'place'] },
    { key: 'gst_number',   header: 'GST Number',    required: false, aliases: ['gst number', 'gstnumber', 'gst', 'gstin'] },
  ],
  templateRows: [
    { Name: 'Alpha Suppliers', Phone: '9876543210', Email: 'alpha@example.com', Location: 'Pune',      'GST Number': '27XYZAB1234G1Z3' },
    { Name: 'Gamma Traders',   Phone: '9001234567', Email: '',                  Location: 'Hyderabad', 'GST Number': '' },
  ],
};

export const TRANSPORTER_CONFIG = {
  label: 'Transporters',
  fileName: 'Transporters_Import_Template.xlsx',
  columns: [
    { key: 'name',                header: 'Name',           required: true,  aliases: ['name', 'transporter name', 'transportername', 'transporter', 'company'] },
    { key: 'vehicle_number',      header: 'Vehicle Number', required: false, aliases: ['vehicle number', 'vehiclenumber', 'vehicle', 'truck number', 'truck no'] },
    { key: 'driver_phone_number', header: 'Driver Phone',   required: false, aliases: ['driver phone', 'driver phone number', 'driverphone', 'driver mobile', 'driver contact', 'driver'] },
  ],
  templateRows: [
    { Name: 'Fast Cargo',   'Vehicle Number': 'MH12AB1234', 'Driver Phone': '9876543210' },
    { Name: 'Quick Movers', 'Vehicle Number': 'DL01CD5678', 'Driver Phone': '9123456789' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const normalizeHeader = (raw, columns) => {
  const h = raw.trim().toLowerCase();
  for (const col of columns) {
    if (col.aliases.includes(h)) return col.key;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BulkImportEntityModal = ({ isOpen, onClose, onSuccess, config, importFn }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const { label, fileName: templateFileName, columns, templateRows } = config;
  const requiredCols = columns.filter(c => c.required);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setSubmitting(false);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

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
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!json || json.length === 0) { toast.error('The file is empty.'); return; }

        // Map raw headers → column keys
        const rawHeaders = Object.keys(json[0]);
        const headerMap = {}; // rawHeader → colKey
        for (const h of rawHeaders) {
          const key = normalizeHeader(h, columns);
          if (key) headerMap[h] = key;
        }

        // Check required columns are present
        const foundKeys = new Set(Object.values(headerMap));
        const missing = requiredCols.filter(c => !foundKeys.has(c.key)).map(c => c.header);
        if (missing.length > 0) {
          toast.error(`Missing required columns: ${missing.join(', ')}`);
          return;
        }

        const parsed = json.map(row => {
          const obj = {};
          for (const [rawH, key] of Object.entries(headerMap)) {
            obj[key] = String(row[rawH] || '').trim();
          }
          return obj;
        }).filter(r => Object.values(r).some(v => v));

        if (parsed.length === 0) { toast.error('No valid data rows found.'); return; }

        setRows(parsed);
        setStep('preview');
      } catch (err) {
        toast.error('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => e.preventDefault();

  const handleImport = async () => {
    setStep('processing');
    setSubmitting(true);
    try {
      const result = await importFn(rows);
      setResults(result);
      setStep('results');
      if (result.successCount > 0) {
        toast.success(`Imported ${result.successCount} ${label.toLowerCase()} successfully`);
      }
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
      setStep('preview');
    }
  };

  const handleDone = () => { reset(); onSuccess(); onClose(); };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, templateFileName);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><FileSpreadsheet size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">Bulk Import {label}</h2>
        </ModalHeader>

        {/* ── UPLOAD STEP ──────────────────────────────────────────── */}
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
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
              </div>

              <div className="mt-6 flex flex-col gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-start gap-3 shadow-2xs">
                  <div className="p-1.5 rounded-lg bg-amber-100/80 text-amber-700 shrink-0 mt-0.5">
                    <FileText size={16} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-xs">Required Document Guidelines</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 text-[10px] font-medium">Formats: .xlsx, .xls, .csv</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Your document must include a <strong>Name</strong> column.
                      Other columns ({columns.filter(c => !c.required).map(c => c.header).join(', ')}) are optional.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Expected Format</span>
                    <button onClick={handleDownloadTemplate}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium transition-colors">
                      <Download size={12} /> Download Template
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="bg-white">
                        <tr>
                          {columns.map(col => (
                            <th key={col.key} className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">
                              {col.header}{col.required && <span className="text-red-500 ml-0.5">*</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-slate-50/50">
                        {templateRows.map((row, i) => (
                          <tr key={i}>
                            {columns.map(col => (
                              <td key={col.key} className="px-3 py-2 text-slate-500 border-b border-slate-100">
                                {row[col.header] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
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

        {/* ── PREVIEW STEP ─────────────────────────────────────────── */}
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
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">#</th>
                      {columns.map(col => (
                        <th key={col.key} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{col.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                        {columns.map(col => (
                          <td key={col.key} className="px-3 py-2 text-slate-700">
                            {r[col.key] || <span className="text-slate-300 italic">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider">Summary</p>
                <div className="text-xs text-slate-600 flex gap-6">
                  <div><span className="text-slate-400">Total rows:</span> <span className="font-medium">{rows.length}</span></div>
                  <div><span className="text-slate-400">Ready to import:</span> <span className="font-medium text-emerald-600">{rows.filter(r => r.name).length}</span></div>
                  {rows.filter(r => !r.name).length > 0 && (
                    <div><span className="text-slate-400">Missing name:</span> <span className="font-medium text-red-500">{rows.filter(r => !r.name).length}</span></div>
                  )}
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={submitting}>
                {submitting ? 'Importing...' : `Import ${rows.length} ${rows.length === 1 ? label.slice(0, -1) : label}`}
              </Button>
            </ModalFooter>
          </>
        )}

        {/* ── PROCESSING STEP ──────────────────────────────────────── */}
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
              <p className="text-base font-semibold text-slate-800 mb-1">Importing {label}</p>
              <p className="text-sm text-slate-400">Processing {rows.length} row{rows.length !== 1 ? 's' : ''}...</p>
              <div className="mt-6 w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          </ModalBody>
        )}

        {/* ── RESULTS STEP ─────────────────────────────────────────── */}
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
                    {results.successCount} imported
                    {results.errorCount > 0 ? ` · ${results.errorCount} error${results.errorCount !== 1 ? 's' : ''}` : ''}
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
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-start gap-2">
                  <CheckCircle size={14} className="mt-0.5 shrink-0" />
                  <span>Successfully imported {results.successCount} {results.successCount === 1 ? label.slice(0, -1) : label} into the system.</span>
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

export default BulkImportEntityModal;
