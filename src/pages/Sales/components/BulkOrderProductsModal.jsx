import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, Download, Info, FileText, Layers, Trash2, ChevronDown, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { createOrder, generateMultipleOrderNumbers, convertQtyToMasterUnit, convertQtyFromMasterUnit } from '../../../services/salesService';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';
import { parseFileDate } from '@/lib/parseFileDate';
import ProductModal from '../../Master/components/ProductModal';
import CustomerModal from '../../Master/components/CustomerModal';

const COLUMN_ALIASES = {
  'Order Date': ['order date', 'orderdate', 'date', 'order_date'],
  'Customer Name': ['customer name', 'customer', 'customername', 'client', 'party name', 'party', 'customer_name'],
  'Product Name': ['product name', 'product', 'productname', 'item name', 'item', 'itemname', 'product_name'],
  'Godown Name': ['godown name', 'godown', 'godownname', 'warehouse', 'warehouse name', 'location', 'godown_name'],
  'Quantity': ['quantity', 'qty', 'qnty', 'count', 'amount', 'units'],
  'Unit': ['unit', 'uom', 'unit of measure', 'unit_of_measure', 'measure'],
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

// Case doesn't matter and neither does spacing/punctuation — only the actual
// letters and numbers need to line up (so "Yatra Milky 13*16 (30 Kg)" matches
// "yatra milky 13-16 30kg" etc.) for both exact matching and similarity scoring.
const normalizeKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Edit distance between two strings, used to score how close an unmatched
// file value is to an existing product name.
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
  // A short/partial value that's fully contained in the full name (or vice
  // versa) is a strong signal even when the raw length difference would tank
  // a plain edit-distance score — e.g. a bulk file listing just "10*15"
  // against the full product name "51 Mic Ld 10*15 (30 Kg)". Plain
  // Levenshtein penalizes that gap so heavily (edit distance grows with the
  // number of inserted characters) that a real, obvious partial match can
  // score below any reasonable cutoff — so containment gets scored on its
  // own, more forgiving scale instead.
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.6 + 0.4 * (shorter / longer); // always >= 0.6
  }
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

// Finds the closest-named existing products for a file value that didn't
// match exactly, so the user can pick the intended one with one click
// instead of searching the whole product list.
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

const BulkOrderProductsModal = ({ isOpen, onClose, user, products = [], godowns = [], customers = [], onImportProducts, onImportCustomers, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Products/customers created on the fly (via "+ Add New Product/Customer" below) —
  // kept alongside the lists loaded from the parent so a just-created record is
  // immediately selectable/matchable without waiting for a full page reload.
  const [extraProducts, setExtraProducts] = useState([]);
  const [extraCustomers, setExtraCustomers] = useState([]);
  const [productQuickAddOpen, setProductQuickAddOpen] = useState(false);
  const [customerQuickAddOpen, setCustomerQuickAddOpen] = useState(false);
  const [quickAddProductRow, setQuickAddProductRow] = useState(null); // originalIndex of the row that asked for a new product
  const [quickAddCustomerGroup, setQuickAddCustomerGroup] = useState(null); // group key that asked for a new customer

  // De-duplicated by id: a quick-added record lives in extraProducts/extraCustomers
  // immediately, and — once the parent syncs its own list back down as an updated
  // prop — the very same record also arrives via products/customers. Merging by id
  // (last one wins) keeps it appearing exactly once in the dropdown either way.
  const allProducts = useMemo(() => {
    const map = new Map();
    [...products, ...extraProducts].forEach(p => map.set(p.product_id, p));
    return Array.from(map.values());
  }, [products, extraProducts]);

  const allCustomers = useMemo(() => {
    const map = new Map();
    [...customers, ...extraCustomers].forEach(c => map.set(c.customer_id, c));
    return Array.from(map.values());
  }, [customers, extraCustomers]);

  const activeGodowns = useMemo(() => godowns.filter(g => g.is_active), [godowns]);

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({ value: p.product_id, label: p.name }));
  }, [allProducts]);

  const godownOptions = useMemo(() => {
    return activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));
  }, [activeGodowns]);

  const customerOptions = useMemo(() => {
    return allCustomers.map(c => ({ value: c.customer_id, label: c.name }));
  }, [allCustomers]);

  // For every unmatched product name in the file, precompute the closest
  // existing products so we can offer one-click "Did you mean...?" picks.
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
    setExtraCustomers([]);
    setQuickAddProductRow(null);
    setQuickAddCustomerGroup(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // New product saved from the "+ Add New Product" quick-add form — make it
  // usable everywhere in this preview (dropdown, suggestions) and drop it
  // straight into the row that asked for it, same as picking it manually.
  const handleProductQuickAdded = (product) => {
    setExtraProducts(prev => [...prev, product]);
    if (quickAddProductRow !== null) {
      setRawRows(prev => prev.map((row, i) => (
        i === quickAddProductRow
          ? { ...row, product_id: product.product_id, Selected_Unit: row.Selected_Unit || (product.unit || '').toLowerCase() }
          : row
      )));
    }
    onImportProducts?.(product);
    setQuickAddProductRow(null);
  };

  // Same idea for a new customer — applies to every row in the group that asked for it.
  const handleCustomerQuickAdded = (customer) => {
    setExtraCustomers(prev => [...prev, customer]);
    if (quickAddCustomerGroup !== null) {
      handleGroupHeaderChange(quickAddCustomerGroup, 'customer_id', customer.customer_id);
    }
    onImportCustomers?.(customer);
    setQuickAddCustomerGroup(null);
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
        const priceKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Unit Price');

        if (!productKey || !qtyKey) {
          toast.error(`Missing required item columns ("Product Name" and "Quantity"). Found: ${headers.join(', ')}`);
          return;
        }

        const orderDateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Order Date');
        const customerKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Customer Name');
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');
        const unitKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Unit');

        const defaultDate = getTodayLocal();
        const parsedRows = json.map((row, idx) => {
          const rawProd = String(row[productKey] || '').trim();
          const rawGodown = godownKey ? String(row[godownKey] || '').trim() : '';
          const rawQty = Number(row[qtyKey]) || 0;
          const rawPrice = priceKey && row[priceKey] !== '' ? String(row[priceKey]) : '';
          const rawCust = customerKey ? String(row[customerKey] || '').trim() : '';
          const rawDate = orderDateKey ? String(row[orderDateKey] || '').trim() : '';
          // Unit is optional — if the file gives a valid Bag/Kg value, Qty
          // above is treated as entered in that unit; otherwise it falls
          // back to the matched product's own master unit (Qty read as-is,
          // same behavior as before this column existed).
          const rawUnit = unitKey ? String(row[unitKey] || '').trim().toLowerCase() : '';
          const fileUnit = rawUnit === 'bag' || rawUnit === 'kg' ? rawUnit : '';

          const parsedDate = parseFileDate(rawDate) || defaultDate;
          const matchedProd = products.find(p => normalizeKey(p.name) === normalizeKey(rawProd));
          const matchedCust = customers.find(c => c.name.trim().toLowerCase() === rawCust.toLowerCase());
          const matchedGodown = activeGodowns.find(g => g.name.trim().toLowerCase() === rawGodown.toLowerCase());

          return {
            id: idx,
            order_date: parsedDate,
            rawCustomerName: rawCust,
            customer_id: matchedCust ? matchedCust.customer_id : '',
            rawGodownName: rawGodown,
            godown_id: matchedGodown ? matchedGodown.godown_id : '',
            rawProductName: rawProd,
            product_id: matchedProd ? matchedProd.product_id : '',
            unit_price: rawPrice,
            quantity: rawQty > 0 ? String(rawQty) : '1',
            Selected_Unit: fileUnit || (matchedProd?.unit || '').toLowerCase(),
            process_type: 'order_process',
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
    // Picking/changing the product defaults Unit to that product's own
    // master unit — but only when the row doesn't already have one (e.g.
    // from the file's own Unit column), so that pick isn't silently
    // overwritten.
    if (field === 'product_id') {
      const product = allProducts.find(p => p.product_id === value);
      updated[index] = { ...updated[index], product_id: value, Selected_Unit: updated[index].Selected_Unit || (product?.unit || '').toLowerCase() };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setRawRows(updated);
  };

  const handleRemoveRow = (index) => {
    const updated = rawRows.filter((_, i) => i !== index);
    setRawRows(updated);
  };

  // Unit defaults to the product's master unit, falling back to Bag when
  // neither the row nor a matched product says otherwise (e.g. a row whose
  // product hasn't been matched/picked yet) — always a real value, never ''
  // (which would leave the <select> showing the browser's own first-option
  // default while state still thought nothing was selected, so switching
  // Unit silently no-op'd instead of re-basing Qty). Qty (raw, as typed in
  // that unit) is the row's own `quantity` field.
  const getRowUnit = (row, product) => row.Selected_Unit || (product?.unit || '').toLowerCase() || 'bag';
  const getRowRawQty = (row) => row.quantity ?? '';

  // Order Qty is auto-calculated from the Unit + Qty inputs, converted into
  // the product's master unit via that product's Pkg/Bag (Mux) figure —
  // this is what actually gets saved as quantity (the value that drives the
  // rest of the sales/dispatch pipeline).
  const getRowComputedQty = (row, product) => {
    const raw = getRowRawQty(row);
    if (raw === '' || !Number(raw)) return 0;
    const unit = getRowUnit(row, product);
    return roundQty(convertQtyToMasterUnit(raw, unit, product));
  };

  // Switching Unit re-bases whatever Qty is currently showing into the
  // newly picked unit (e.g. 20 bags becomes 640 when switching to Kg) so a
  // stale number typed in the old unit doesn't linger under a new one.
  const handleUnitChange = (index, newUnit) => {
    const row = rawRows[index];
    const product = allProducts.find(p => p.product_id === row.product_id);
    const currentUnit = getRowUnit(row, product);
    const currentQty = getRowRawQty(row);
    const masterQty = convertQtyToMasterUnit(currentQty, currentUnit, product);
    const requantified = convertQtyFromMasterUnit(masterQty, newUnit, product);
    const updated = [...rawRows];
    updated[index] = { ...row, Selected_Unit: newUnit, quantity: requantified ? String(roundQty(requantified)) : '' };
    setRawRows(updated);
  };

  // Group rows by unique (Order Date, Customer, Product) combination
  const groupedOrders = useMemo(() => {
    const groups = {};
    rawRows.forEach((row, idx) => {
      const custKey = row.customer_id || row.rawCustomerName || 'unassigned';
      const prodKey = row.product_id || row.rawProductName || 'unassigned';
      const key = `${row.order_date}_${custKey}_${prodKey}`;
      if (!groups[key]) {
        const custObj = allCustomers.find(c => c.customer_id === row.customer_id);
        groups[key] = {
          key,
          order_date: row.order_date,
          customer_id: row.customer_id,
          customer_name: custObj ? custObj.name : (row.rawCustomerName || 'Unknown Customer'),
          process_type: 'order_process',
          notify_customer: !!row.notify_customer,
          items: [],
        };
      }
      groups[key].items.push({ ...row, originalIndex: idx });
    });
    return Object.values(groups);
  }, [rawRows, allCustomers]);

  const handleGroupHeaderChange = (groupKey, field, value) => {
    const updated = rawRows.map(row => {
      const cKey = row.customer_id || row.rawCustomerName || 'unassigned';
      const pKey = row.product_id || row.rawProductName || 'unassigned';
      const k = `${row.order_date}_${cKey}_${pKey}`;
      if (k === groupKey) {
        return { ...row, [field]: value };
      }
      return row;
    });
    setRawRows(updated);
  };

  const handleConfirmImport = async () => {
    const invalidCount = rawRows.filter(r => !r.product_id || !r.customer_id || !r.godown_id || !Number(r.quantity)).length;
    if (invalidCount > 0) {
      toast.error(`Please select a valid product, customer, and godown for all rows (${invalidCount} incomplete).`);
      return;
    }

    setSubmitting(true);
    try {

      // Automatically create sales orders for each (Date, Customer, Product) group with system-generated order numbers
      const generatedNumbers = await generateMultipleOrderNumbers(groupedOrders.length);

      for (let i = 0; i < groupedOrders.length; i++) {
        const grp = groupedOrders[i];
        const autoOrderNumber = generatedNumbers[i];

        await createOrder({
          order_date: grp.order_date,
          order_number: autoOrderNumber,
          customer_id: grp.customer_id,
          process_type: 'order_process',
          created_by: user?.user_id,
          // quantity sent here is always the product's real master-unit
          // figure (see getRowComputedQty) — Selected_Unit/sales_qty are
          // kept alongside purely as a record of the raw Unit + Qty entry.
          items: grp.items.map(item => {
            const product = allProducts.find(p => p.product_id === item.product_id);
            const rawQty = getRowRawQty(item);
            return {
              product_id: item.product_id,
              godown_id: item.godown_id,
              quantity: getRowComputedQty(item, product),
              unit_price: item.unit_price,
              Selected_Unit: getRowUnit(item, product),
              sales_qty: rawQty === '' ? null : Number(rawQty),
            };
          }),
          notify_customer: grp.notify_customer,
        });
      }

      toast.success(`Successfully generated and created ${groupedOrders.length} sales order(s) with ${rawRows.length} item(s)!`);
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err) {
      toast.error('Failed to create sales orders: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleCustomer1 = customers[0]?.name || 'Acme Enterprises';
    const sampleCustomer2 = customers[1]?.name || customers[0]?.name || 'Global Logistics';
    const sampleGodown1 = activeGodowns[0]?.name || 'Main Godown';
    const sampleGodown2 = activeGodowns[1]?.name || activeGodowns[0]?.name || 'Factory Godown';
    const sampleProduct1 = products[0]?.name || 'Cement Grade A';
    const sampleProduct2 = products[1]?.name || 'Steel Rods 10mm';
    const sampleUnit1 = (products[0]?.unit || 'bag').toUpperCase();
    const sampleUnit2 = (products[1]?.unit || 'bag').toUpperCase();

    const ws = XLSX.utils.json_to_sheet([
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer1,
        'Godown Name': sampleGodown1,
        'Product Name': sampleProduct1,
        'Quantity': 50,
        'Unit': sampleUnit1,
        'Unit Price': 350
      },
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer1,
        'Godown Name': sampleGodown2,
        'Product Name': sampleProduct2,
        'Quantity': 100,
        'Unit': sampleUnit2,
        'Unit Price': 650
      },
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer2,
        'Godown Name': sampleGodown1,
        'Product Name': sampleProduct1,
        'Quantity': 25,
        'Unit': sampleUnit1,
        'Unit Price': 345
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order_Import_Template');
    XLSX.writeFile(wb, 'Order_Bulk_Upload_Template.xlsx');
  };

  const validRowsCount = useMemo(() => {
    return rawRows.filter(r => r.product_id && r.customer_id && r.godown_id && Number(r.quantity) > 0).length;
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
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload Sales Orders</h2>
              <p className="text-xs text-slate-500">Import orders via Excel or CSV. Order numbers will be auto-generated for each unique date, customer & product.</p>
            </div>
          </div>
        </ModalHeader>

        {step === 'upload' && (
          <>
            <ModalBody className="space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <FileText size={16} />
                  </div>
                  <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    <Info size={15} className="text-primary" /> Document Format & Auto Order-Number Guidelines
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600 space-y-1 pl-8">
                  <p>• <strong>Order Numbers are auto-generated:</strong> Do not include Order Number in your file.</p>
                  <p>• <strong>Process Type is auto-set to Order Process:</strong> Do not include Process Type in your file.</p>
                  <p>• <strong>Unit is optional (Bag/Kg):</strong> when given, Quantity is read in that unit and converted to Order Qty in the product's own master unit; otherwise Quantity is read as already being in the product's master unit.</p>
                  <p>• <strong>Grouping Logic:</strong> Rows with the <em>same Order Date, Customer Name, and Product Name</em> will be assigned the <strong>same auto-generated order number</strong>.</p>
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
            <ModalBody className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <p className="text-sm text-slate-700">
                    Document: <span className="font-semibold text-slate-800">{fileName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Detected <span className="font-semibold text-slate-800">{groupedOrders.length} Order Group(s)</span> across <span className="font-semibold text-slate-800">{rawRows.length} item(s)</span> ({validRowsCount} fully matched)
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

              {/* Grouped Orders Preview */}
              <div className="space-y-4">
                {groupedOrders.map((group, gIdx) => (
                  <div key={group.key} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/10 text-primary font-bold text-xs px-2.5 py-1 rounded-md flex items-center gap-1">
                          <Layers size={13} /> Order Group #{gIdx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          System Order No: <span className="text-primary font-mono italic">VPR/OR-AUTO-{String(gIdx + 1).padStart(2, '0')}</span>
                        </span>
                        <span className="bg-slate-200/70 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                          Order Process
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {group.items.length} product(s) in this order
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                      <div className="md:col-span-4">
                        <label className="block text-slate-500 font-medium mb-1">Order Date</label>
                        <DatePicker
                          value={group.order_date}
                          onChange={(e) => handleGroupHeaderChange(group.key, 'order_date', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-5">
                        <label className="block text-slate-500 font-medium mb-1">Customer <span className="text-red-500">*</span></label>
                        <Dropdown
                          value={group.customer_id}
                          onValueChange={(val) => handleGroupHeaderChange(group.key, 'customer_id', val)}
                          options={customerOptions}
                          placeholder={group.customer_name ? `Match "${group.customer_name}"...` : "Select customer..."}
                          searchPlaceholder="Search customers..."
                          align="start"
                          onAddNew={() => { setQuickAddCustomerGroup(group.key); setCustomerQuickAddOpen(true); }}
                          addNewLabel="+ Add New Customer"
                        />
                        {!group.customer_id && group.customer_name && (
                          <span className="text-[10px] text-red-600 font-medium block mt-0.5">
                            File value: "{group.customer_name}" (Not matched)
                          </span>
                        )}
                      </div>
                      <div className="md:col-span-3 flex items-center gap-2 md:pt-6">
                        <input
                          type="checkbox"
                          id={`notify-${group.key}`}
                          checked={group.notify_customer}
                          onChange={(e) => handleGroupHeaderChange(group.key, 'notify_customer', e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <label htmlFor={`notify-${group.key}`} className="text-slate-600 font-medium cursor-pointer">
                          Send WhatsApp Message
                        </label>
                      </div>
                    </div>

                    {/* Products Table for this group */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                          <tr>
                            <th className="px-3 py-1.5 whitespace-nowrap">#</th>
                            <th className="px-3 py-1.5 w-4/12">Product <span className="text-red-500">*</span></th>
                            <th className="px-3 py-1.5 w-3/12">Godown <span className="text-red-500">*</span></th>
                            <th className="px-3 py-1.5 min-w-[84px] whitespace-nowrap">Unit Price</th>
                            <th className="px-3 py-1.5 min-w-[64px] whitespace-nowrap">Unit</th>
                            <th className="px-3 py-1.5 min-w-[72px] whitespace-nowrap text-right">Qty <span className="text-red-500">*</span></th>
                            <th className="px-3 py-1.5 min-w-[84px] whitespace-nowrap text-right text-emerald-700">Order Qty</th>
                            <th className="px-2 py-1.5 text-center min-w-[40px]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.items.map((row, i) => {
                            const origIdx = row.originalIndex;
                            const isMatched = row.product_id && row.godown_id;
                            const rowProduct = allProducts.find(p => p.product_id === row.product_id);
                            const computedQty = getRowComputedQty(row, rowProduct);
                            return (
                              <tr key={origIdx} className={isMatched ? 'hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50/70'}>
                                <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                                <td className="px-3 py-1.5">
                                  <Dropdown
                                    value={row.product_id}
                                    onValueChange={(val) => handleUpdateRow(origIdx, 'product_id', val)}
                                    options={productOptions}
                                    placeholder={row.rawProductName ? `Match "${row.rawProductName}"...` : "Select product..."}
                                    searchPlaceholder="Search products..."
                                    align="start"
                                    onAddNew={() => { setQuickAddProductRow(origIdx); setProductQuickAddOpen(true); }}
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
                                              onClick={() => handleUpdateRow(origIdx, 'product_id', p.product_id)}
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-medium transition-colors"
                                            >
                                              {p.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => { setQuickAddProductRow(origIdx); setProductQuickAddOpen(true); }}
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
                                    onValueChange={(val) => handleUpdateRow(origIdx, 'godown_id', val)}
                                    options={godownOptions}
                                    placeholder={row.rawGodownName ? `Match "${row.rawGodownName}"...` : "Select godown..."}
                                    searchPlaceholder="Search godowns..."
                                    align="start"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={row.unit_price}
                                    onChange={(e) => handleUpdateRow(origIdx, 'unit_price', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full h-7 px-2 rounded-md border border-slate-200 text-xs outline-none focus:border-primary bg-white"
                                  />
                                </td>
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  <div className="relative w-[72px]">
                                    <select
                                      value={getRowUnit(row, rowProduct)}
                                      onChange={(e) => handleUnitChange(origIdx, e.target.value)}
                                      className="w-full h-7 pl-2 pr-6 rounded-md border border-slate-200 text-xs font-medium text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white cursor-pointer appearance-none"
                                    >
                                      <option value="bag">BAG</option>
                                      <option value="kg">KG</option>
                                    </select>
                                    <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    value={row.quantity}
                                    onChange={(e) => handleUpdateRow(origIdx, 'quantity', sanitizeQtyInput(e.target.value))}
                                    placeholder="1"
                                    className="w-20 h-7 px-2 rounded-md border border-slate-200 text-xs text-right outline-none focus:border-primary bg-white"
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold text-emerald-600 tabular-nums">
                                  {computedQty || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRow(origIdx)}
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
                  </div>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="button" onClick={handleConfirmImport} disabled={validRowsCount === 0 || submitting}>
                {submitting ? 'Generating Orders...' : `Import & Create ${groupedOrders.length} Order(s)`}
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
    <CustomerModal
      isOpen={customerQuickAddOpen}
      onClose={() => setCustomerQuickAddOpen(false)}
      onSuccess={handleCustomerQuickAdded}
      user={user}
    />
    </>
  );
};

export default BulkOrderProductsModal;
