import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ArrowLeft, Loader, Database, Download, FileText, Pencil, Check, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { bulkImportProducts, getAllProducts } from '../../../services/masterService';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const REQUIRED_COLUMNS = ['Brand Name', 'Category', 'Godown Name', 'Qty'];

const COLUMN_ALIASES = {
  'Brand Name': ['brand name', 'brand', 'brandname'],
  'Category': ['category', 'categories'],
  'Product Type': ['product type', 'producttype', 'type', 'item type'],
  'Unit': ['unit', 'units', 'uom'],
  'mux': ['mux', 'weight', 'packaging weight', 'packaging'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name'],
  'Qty': ['qty', 'quantity', 'qnty', 'stock', 'opening stock', 'opening', 'count'],
};

const normalizeHeader = (header) => {
  const h = header.trim().toLowerCase();
  for (const [standard, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return standard;
  }
  return header.trim();
};

const matchKey = (brandName, category, productType, unit, mux) =>
  [brandName, category, productType, unit, mux].map(v => (v || '').trim().toLowerCase()).join('|');

const buildProductName = (brandName, category, productType, mux) => {
  const base = [brandName, category, productType].map(v => (v || '').trim()).filter(Boolean).join(' ');
  return mux?.trim() ? `${base} (${mux.trim()})` : base;
};

const BulkImportModal = ({ isOpen, onClose, godowns, user, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [productLookup, setProductLookup] = useState(new Map());
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const activeGodowns = (godowns || []).filter(g => g.is_active !== false);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setProductLookup(new Map());
    setEditingIndex(null);
    setEditDraft(null);
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
    reader.onload = async (e) => {
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

        const keyFor = (std) => Object.keys(normalizedMap).find(k => normalizedMap[k] === std);
        const brandKey = keyFor('Brand Name');
        const categoryKey = keyFor('Category');
        const typeKey = keyFor('Product Type');
        const unitKey = keyFor('Unit');
        const muxKey = keyFor('mux');
        const godownKey = keyFor('Godown Name');
        const qtyKey = keyFor('Qty');

        const parsed = json.map((row) => {
          const brandName = String(row[brandKey] || '').trim();
          const category = String(row[categoryKey] || '').trim();
          const productType = typeKey ? String(row[typeKey] || '').trim() : '';
          const unit = unitKey ? String(row[unitKey] || '').trim() : '';
          const mux = muxKey ? String(row[muxKey] || '').trim() : '';
          const godownName = String(row[godownKey] || '').trim();
          const qty = Number(row[qtyKey]) || 0;
          return {
            brandName, category, productType, unit, mux, godownName, qty,
            productName: buildProductName(brandName, category, productType, mux),
          };
        }).filter(r => r.brandName || r.category || r.godownName);

        if (parsed.length === 0) {
          toast.error('No valid data rows found in the file.');
          return;
        }

        const existingProducts = await getAllProducts();
        const lookup = new Map();
        for (const p of existingProducts) {
          lookup.set(matchKey(p.brand_name, p.category, p.product_type, p.unit, p.mux), p);
        }

        const withMatch = parsed.map(r => {
          const match = lookup.get(matchKey(r.brandName, r.category, r.productType, r.unit, r.mux));
          return { ...r, productId: match?.product_id || null, isNew: !match };
        });

        setProductLookup(lookup);
        setRows(withMatch);
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

  const startEdit = (index) => {
    const r = rows[index];
    setEditingIndex(index);
    setEditDraft({
      brandName: r.brandName, category: r.category, productType: r.productType,
      unit: r.unit, mux: r.mux, godownName: r.godownName, qty: r.qty,
    });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    const productName = buildProductName(editDraft.brandName, editDraft.category, editDraft.productType, editDraft.mux);
    const match = productLookup.get(matchKey(editDraft.brandName, editDraft.category, editDraft.productType, editDraft.unit, editDraft.mux));
    setRows(prev => prev.map((r, i) => i !== editingIndex ? r : {
      ...r,
      ...editDraft,
      qty: Number(editDraft.qty) || 0,
      productName,
      productId: match?.product_id || null,
      isNew: !match,
    }));
    setEditingIndex(null);
    setEditDraft(null);
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

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Brand Name': 'Ambuja',
        'Category': 'Nt 160g',
        'Product Type': '10*13',
        'Unit': 'bag',
        'mux': '32 Kg',
        'Godown Name': 'Main Godown',
        'Qty': 500,
      },
      {
        'Brand Name': 'AM',
        'Category': 'BLK',
        'Product Type': '7*14',
        'Unit': 'bag',
        'mux': '30 Kg',
        'Godown Name': 'Site B Godown',
        'Qty': 1000,
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Products_Import_Template.xlsx');
  };

  const summary = rows.reduce((acc, r) => {
    const key = matchKey(r.brandName, r.category, r.productType, r.unit, r.mux);
    if (!acc[key]) acc[key] = { productName: r.productName, isNew: r.isNew, godowns: new Set(), totalQty: 0, count: 0 };
    acc[key].godowns.add(r.godownName);
    acc[key].totalQty += Number(r.qty) || 0;
    acc[key].count += 1;
    return acc;
  }, {});
  const newProductCount = Object.values(summary).filter(s => s.isNew).length;
  const existingProductCount = Object.keys(summary).length - newProductCount;

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-4xl">
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
                      Your document must include headers for <strong>Brand Name</strong>, <strong>Category</strong>, <strong>Godown Name</strong>, and <strong>Qty</strong>.
                      <strong> Product Type</strong>, <strong>Unit</strong> and <strong>mux</strong> are optional. Product Name is auto-generated as Brand + Category + Product Type + (mux) and matched
                      against existing products — a combination not found in the system will be auto-created. Godowns must already exist in Master records.
                    </p>
                  </div>
                </div>
                
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Expected Format</span>
                    <button onClick={handleDownloadTemplate} className="text-xs text-primary hover:underline flex items-center gap-1 font-medium transition-colors">
                      <Download size={12} /> Download Template
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Brand Name<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Category<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Product Type</th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Unit</th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">mux</th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Godown Name<span className="text-red-500 ml-0.5">*</span></th>
                          <th className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">Qty<span className="text-red-500 ml-0.5">*</span></th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-50/50">
                        <tr>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">Ambuja</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">Nt 160g</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">10*13</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">bag</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">32 Kg</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">Main Godown</td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">500</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500">AM</td>
                          <td className="px-3 py-2 text-slate-500">BLK</td>
                          <td className="px-3 py-2 text-slate-500">7*14</td>
                          <td className="px-3 py-2 text-slate-500">bag</td>
                          <td className="px-3 py-2 text-slate-500">30 Kg</td>
                          <td className="px-3 py-2 text-slate-500">Site B Godown</td>
                          <td className="px-3 py-2 text-slate-500">1000</td>
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
                <button onClick={() => setStep('upload')} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ArrowLeft size={12} /> Change file
                </button>
              </div>
              <div className="flex items-center gap-4 mb-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />Existing product — stock will be added</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />New product — will be created</span>
              </div>
              <div className="border border-slate-200 rounded-lg max-h-72 overflow-auto">
                <table className="w-full text-sm min-w-[880px]">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">#</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Product Name</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Brand Name</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Category</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Product Type</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Unit</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">mux</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Godown Name</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Qty</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Status</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => {
                      const isEditing = editingIndex === i;
                      const cellInput = (field, opts = {}) => (
                        <input
                          type={opts.type || 'text'}
                          value={editDraft[field]}
                          onChange={(e) => setEditDraft({ ...editDraft, [field]: opts.type === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                          className="w-full min-w-[70px] border border-slate-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      );
                      return (
                        <tr key={i} className={isEditing ? 'bg-blue-50/60' : r.isNew ? 'bg-red-50/50 hover:bg-red-50' : 'bg-green-50/50 hover:bg-green-50'}>
                          <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                          {isEditing ? (
                            <>
                              <td className="px-3 py-2 text-slate-400 italic text-xs whitespace-nowrap">
                                {buildProductName(editDraft.brandName, editDraft.category, editDraft.productType, editDraft.mux) || 'empty'}
                              </td>
                              <td className="px-2 py-2">{cellInput('brandName')}</td>
                              <td className="px-2 py-2">{cellInput('category')}</td>
                              <td className="px-2 py-2">{cellInput('productType')}</td>
                              <td className="px-2 py-2">
                                <select
                                  value={editDraft.unit}
                                  onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
                                  className="w-full min-w-[70px] border border-slate-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                                >
                                  <option value="">Select unit</option>
                                  {['kg', 'bag'].map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">{cellInput('mux')}</td>
                              <td className="px-2 py-2">
                                {activeGodowns.length > 0 ? (
                                  <select
                                    value={editDraft.godownName}
                                    onChange={(e) => setEditDraft({ ...editDraft, godownName: e.target.value })}
                                    className="w-full min-w-[100px] border border-slate-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                                  >
                                    <option value="">Select godown</option>
                                    {activeGodowns.map(g => (
                                      <option key={g.godown_id} value={g.name}>{g.name}</option>
                                    ))}
                                  </select>
                                ) : cellInput('godownName')}
                              </td>
                              <td className="px-2 py-2">{cellInput('qty', { type: 'number' })}</td>
                              <td className="px-3 py-2" colSpan={2}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button type="button" onClick={saveEdit} title="Save" className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                    <Check size={13} />
                                  </button>
                                  <button type="button" onClick={cancelEdit} title="Cancel" className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200">
                                    <X size={13} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.productName || <span className="text-red-400 italic">empty</span>}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.brandName || <span className="text-red-400 italic">empty</span>}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.category || <span className="text-red-400 italic">empty</span>}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.productType || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.unit || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.mux || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.godownName || <span className="text-red-400 italic">empty</span>}</td>
                              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{r.qty || <span className="text-red-400 italic">0</span>}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {r.isNew ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">New</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Existing</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button type="button" onClick={() => startEdit(i)} title="Edit row" className="p-1 rounded text-slate-400 hover:text-primary hover:bg-primary/10">
                                  <Pencil size={13} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div><span className="text-slate-400">Unique Products:</span> <span className="font-medium">{Object.keys(summary).length}</span></div>
                  <div><span className="text-slate-400">Total Entries:</span> <span className="font-medium">{rows.length}</span></div>
                  <div><span className="text-slate-400">New Products:</span> <span className="font-medium text-red-600">{newProductCount}</span></div>
                  <div><span className="text-slate-400">Existing Products:</span> <span className="font-medium text-green-700">{existingProductCount}</span></div>
                  {Object.entries(summary).slice(0, 5).map(([key, s]) => (
                    <div key={key} className="col-span-2 truncate" title={s.productName}>
                      <span className={s.isNew ? 'text-red-400' : 'text-green-500'}>•</span> {s.productName} — <span className="font-medium">{s.godowns.size}</span> godown{s.godowns.size !== 1 ? 's' : ''}, <span className="font-medium">{s.totalQty}</span> total qty
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
