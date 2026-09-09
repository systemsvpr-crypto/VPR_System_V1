import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, Download, Info, FileText, Trash2, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { DatePicker } from '@/components/ui/date-picker';
import { bulkAddFactoryStock, bulkAddProductionStock } from '../../../services/stockService';
import { sanitizeQtyInput } from '@/lib/qty';
import { parseFileDate } from '@/lib/parseFileDate';
import ProductModal from '../../Master/components/ProductModal';

const COLUMN_ALIASES = {
  'Date': ['date', 'txn date', 'txndate', 'transaction date', 'entry date'],
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item', 'itemname', 'product_name'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name', 'location', 'godown_name', 'store id', 'store'],
  'Quantity': ['quantity', 'qty', 'qnty', 'count', 'amount', 'units'],
};

const normalizeHeader = (header) => {
  if (!header) return '';
  const h = String(header).trim().toLowerCase();
  for (const [standard, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return standard;
  }
  return String(header).trim();
};

const normalizeKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
};

const similarity = (a, b) => {
  if (!a || !b) return 0;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.6 + 0.4 * (shorter / longer);
  }
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

const getProductSuggestions = (rawName, allProducts, limit = 3) => {
  const raw = normalizeKey(rawName);
  if (!raw) return [];
  return allProducts
    .map(p => ({ product: p, score: similarity(raw, normalizeKey(p.name)) }))
    .filter(x => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.product);
};

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const BulkStockInModal = ({ isOpen, onClose, user, products = [], godowns = [], isProduction = false, onImportProducts, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [extraProducts, setExtraProducts] = useState([]);
  const [productQuickAddOpen, setProductQuickAddOpen] = useState(false);
  const [quickAddProductRow, setQuickAddProductRow] = useState(null);

  const allProducts = useMemo(() => {
    const map = new Map();
    [...products, ...extraProducts].forEach(p => map.set(p.product_id, p));
    return Array.from(map.values());
  }, [products, extraProducts]);

  const activeGodowns = useMemo(() => godowns
    .filter(g => g.is_active)
    .sort((a, b) => {
      const typeA = a.godown_type || 'Own';
      const typeB = b.godown_type || 'Own';
      if (typeA === typeB) return a.name.localeCompare(b.name);
      return typeA === 'Own' ? -1 : 1;
    }), [godowns]);

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({ value: p.product_id, label: p.name }));
  }, [allProducts]);

  const godownOptions = useMemo(() => {
    return activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));
  }, [activeGodowns]);

  const productSuggestionsMap = useMemo(() => {
    const map = {};
    rawRows.forEach(row => {
      if (!row.product_id && row.rawProductName && !map[row.rawProductName]) {
        map[row.rawProductName] = getProductSuggestions(row.rawProductName, allProducts, 3);
      }
    });
    return map;
  }, [rawRows, allProducts]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRawRows([]);
    setSubmitting(false);
    setExtraProducts([]);
    setQuickAddProductRow(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleProductQuickAdded = (product) => {
    setExtraProducts(prev => [...prev, product]);
    if (quickAddProductRow !== null) {
      setRawRows(prev => prev.map((row, i) => (
        i === quickAddProductRow
          ? { ...row, product_id: product.product_id }
          : row
      )));
    }
    onImportProducts?.(product);
    setQuickAddProductRow(null);
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
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const dateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Date');

        if (!productKey || !qtyKey || !godownKey) {
          toast.error(`Missing required columns ("Product Name", "Godown Name", "Quantity"). Found: ${headers.join(', ')}`);
          return;
        }

        const defaultDate = getTodayLocal();
        const parsedRows = json.map((row, idx) => {
          const rawProd = String(row[productKey] || '').trim();
          const rawGodown = String(row[godownKey] || '').trim();
          const rawQty = Number(row[qtyKey]) || 0;
          const rawDate = dateKey ? String(row[dateKey] || '').trim() : '';

          const parsedDate = parseFileDate(rawDate) || defaultDate;
          const matchedProd = products.find(p => normalizeKey(p.name) === normalizeKey(rawProd));
          const matchedGodown = activeGodowns.find(g => normalizeKey(g.name) === normalizeKey(rawGodown));

          return {
            id: idx,
            txn_date: parsedDate,
            rawGodownName: rawGodown,
            godown_id: matchedGodown ? matchedGodown.godown_id : '',
            rawProductName: rawProd,
            product_id: matchedProd ? matchedProd.product_id : '',
            qty: rawQty > 0 ? String(rawQty) : '',
          };
        }).filter(r => r.rawProductName || r.product_id);

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
    updated[index] = { ...updated[index], [field]: value };
    setRawRows(updated);
  };

  const handleRemoveRow = (index) => {
    const updated = rawRows.filter((_, i) => i !== index);
    setRawRows(updated);
  };

  const handleConfirmImport = async () => {
    const invalidCount = rawRows.filter(r => !r.product_id || !r.godown_id || !Number(r.qty)).length;
    if (invalidCount > 0) {
      toast.error(`Please select a valid product, godown, and quantity for all rows (${invalidCount} incomplete).`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = rawRows.map(r => ({
        product_id: r.product_id,
        godown_id: r.godown_id,
        qty: Number(r.qty),
        txn_date: r.txn_date,
        created_by: user?.user_id
      }));

      if (isProduction) {
        await bulkAddProductionStock(payload);
        toast.success(`Successfully added ${rawRows.length} production entries`);
      } else {
        await bulkAddFactoryStock(payload);
        toast.success(`Successfully added ${rawRows.length} stock entries`);
      }
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err) {
      toast.error('Failed to bulk add stock: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleGodown = activeGodowns[0]?.name || 'Main Godown';
    const sampleProduct = products[0]?.name || 'Sample Product';
    
    const ws = XLSX.utils.json_to_sheet([
      {
        'Date': getTodayLocal(),
        'Godown Name': sampleGodown,
        'Product Name': sampleProduct,
        'Quantity': 50,
      },
      {
        'Date': getTodayLocal(),
        'Godown Name': activeGodowns[1]?.name || sampleGodown,
        'Product Name': products[1]?.name || sampleProduct,
        'Quantity': 100,
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock_In_Template');
    XLSX.writeFile(wb, 'Bulk_Stock_In_Template.xlsx');
  };

  const validRowsCount = useMemo(() => {
    return rawRows.filter(r => r.product_id && r.godown_id && Number(r.qty) > 0).length;
  }, [rawRows]);

  return (
    <>
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-5xl">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <FileSpreadsheet size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload {isProduction ? 'Production' : 'Godown IN'}</h2>
              <p className="text-xs text-slate-500">Import multiple stock entries from an Excel or CSV file.</p>
            </div>
          </div>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody className="space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <FileText size={16} />
                  </div>
                  <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    <Info size={15} className="text-primary" /> Required Columns
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600 space-y-1 pl-8">
                  <p>• <strong>Product Name:</strong> Matches your existing products or allows adding new ones.</p>
                  <p>• <strong>Godown Name:</strong> Matches your existing godowns/stores.</p>
                  <p>• <strong>Quantity:</strong> Valid positive number.</p>
                  <p>• <strong>Date:</strong> Optional (defaults to today).</p>
                </div>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-white flex items-center justify-center mx-auto mb-3 border border-slate-200 shadow-sm transition-all">
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
            <ModalBody className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <p className="text-sm text-slate-700">
                    Document: <span className="font-semibold text-slate-800">{fileName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Detected <span className="font-semibold text-slate-800">{rawRows.length} item(s)</span> ({validRowsCount} fully matched)
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

              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-1.5 whitespace-nowrap">#</th>
                      <th className="px-3 py-1.5 w-[120px]">Date</th>
                      <th className="px-3 py-1.5 w-4/12">Product <span className="text-red-500">*</span></th>
                      <th className="px-3 py-1.5 w-3/12">Godown <span className="text-red-500">*</span></th>
                      <th className="px-3 py-1.5 min-w-[72px] text-right">Qty <span className="text-red-500">*</span></th>
                      <th className="px-2 py-1.5 text-center min-w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawRows.map((row, i) => {
                      const isMatched = row.product_id && row.godown_id && row.qty;
                      return (
                        <tr key={i} className={isMatched ? 'hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50/70'}>
                          <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <DatePicker
                              value={row.txn_date}
                              onChange={(e) => handleUpdateRow(i, 'txn_date', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Dropdown
                              value={row.product_id}
                              onValueChange={(val) => handleUpdateRow(i, 'product_id', val)}
                              options={productOptions}
                              placeholder={row.rawProductName ? `Match "${row.rawProductName}"...` : "Select product..."}
                              searchPlaceholder="Search products..."
                              align="start"
                              onAddNew={() => { setQuickAddProductRow(i); setProductQuickAddOpen(true); }}
                              addNewLabel="+ Add New Product"
                            />
                            {!row.product_id && row.rawProductName && (
                              <div className="mt-0.5">
                                <span className="text-[10px] text-amber-600 font-medium block">
                                  File value: "{row.rawProductName}" (Not matched)
                                </span>
                                {productSuggestionsMap[row.rawProductName]?.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    <span className="text-[10px] text-slate-400">Did you mean:</span>
                                    {productSuggestionsMap[row.rawProductName].map(p => (
                                      <button
                                        key={p.product_id}
                                        type="button"
                                        onClick={() => handleUpdateRow(i, 'product_id', p.product_id)}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-medium transition-colors"
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { setQuickAddProductRow(i); setProductQuickAddOpen(true); }}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/30 hover:bg-primary/10 font-semibold transition-colors"
                                >
                                  <PlusCircle size={11} /> Add New Product
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <Dropdown
                              value={row.godown_id}
                              onValueChange={(val) => handleUpdateRow(i, 'godown_id', val)}
                              options={godownOptions}
                              placeholder={row.rawGodownName ? `Match "${row.rawGodownName}"...` : "Select godown..."}
                              searchPlaceholder="Search godowns..."
                              align="start"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.qty}
                              onChange={(e) => handleUpdateRow(i, 'qty', sanitizeQtyInput(e.target.value))}
                              placeholder="0"
                              className="w-full h-7 px-2 rounded-md border border-slate-200 text-xs text-right outline-none focus:border-primary bg-white"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(i)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Remove row"
                            >
                              <Trash2 size={14} />
                            </button>
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
              <Button type="button" onClick={handleConfirmImport} disabled={validRowsCount === 0 || submitting}>
                {submitting ? 'Adding...' : `Import & Save ${rawRows.length} Entry(s)`}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>

    <ProductModal
      isOpen={productQuickAddOpen}
      onClose={() => setProductQuickAddOpen(false)}
      onSuccess={handleProductQuickAdded}
      user={user}
      quickAdd
    />
    </>
  );
};

export default BulkStockInModal;
