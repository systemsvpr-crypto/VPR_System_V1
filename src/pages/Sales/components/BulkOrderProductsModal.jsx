import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, Download, Info, FileText, Layers, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { createOrder, generateMultipleOrderNumbers } from '../../../services/salesService';

const COLUMN_ALIASES = {
  'Order Date': ['order date', 'orderdate', 'date', 'order_date'],
  'Customer Name': ['customer name', 'customer', 'customername', 'client', 'party name', 'party', 'customer_name'],
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

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const BulkOrderProductsModal = ({ isOpen, onClose, user, products = [], godowns = [], customers = [], onImportProducts, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

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
    setRawRows([]);
    setSubmitting(false);
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
        const priceKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Unit Price');

        if (!productKey || !qtyKey) {
          toast.error(`Missing required item columns ("Product Name" and "Quantity"). Found: ${headers.join(', ')}`);
          return;
        }

        const orderDateKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Order Date');
        const customerKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Customer Name');
        const godownKey = Object.keys(normalizedMap).find(k => normalizedMap[k] === 'Godown Name');

        const defaultDate = getTodayLocal();
        const parsedRows = json.map((row, idx) => {
          const rawProd = String(row[productKey] || '').trim();
          const rawGodown = godownKey ? String(row[godownKey] || '').trim() : '';
          const rawQty = Number(row[qtyKey]) || 0;
          const rawPrice = priceKey && row[priceKey] !== '' ? String(row[priceKey]) : '';
          const rawCust = customerKey ? String(row[customerKey] || '').trim() : '';
          const rawDate = orderDateKey ? String(row[orderDateKey] || '').trim() : '';

          const parsedDate = parseExcelDate(rawDate) || defaultDate;
          const matchedProd = products.find(p => p.name.trim().toLowerCase() === rawProd.toLowerCase());
          const matchedCust = customers.find(c => c.name.trim().toLowerCase() === rawCust.toLowerCase());
          const matchedGodown = activeGodowns.find(g => g.name.trim().toLowerCase() === rawGodown.toLowerCase());

          return {
            id: idx,
            order_date: parsedDate,
            rawCustomerName: rawCust,
            customer_id: matchedCust ? matchedCust.customer_id : (customers[0]?.customer_id || ''),
            rawGodownName: rawGodown,
            godown_id: matchedGodown ? matchedGodown.godown_id : (activeGodowns[0]?.godown_id || ''),
            rawProductName: rawProd,
            product_id: matchedProd ? matchedProd.product_id : '',
            unit_price: rawPrice,
            quantity: rawQty > 0 ? String(rawQty) : '1',
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
    updated[index][field] = value;
    setRawRows(updated);
  };

  const handleRemoveRow = (index) => {
    const updated = rawRows.filter((_, i) => i !== index);
    setRawRows(updated);
  };

  // Group rows by unique (Order Date, Customer) combination
  const groupedOrders = useMemo(() => {
    const groups = {};
    rawRows.forEach((row, idx) => {
      const custKey = row.customer_id || row.rawCustomerName || 'unassigned';
      const key = `${row.order_date}_${custKey}`;
      if (!groups[key]) {
        const custObj = customers.find(c => c.customer_id === row.customer_id);
        groups[key] = {
          key,
          order_date: row.order_date,
          customer_id: row.customer_id,
          customer_name: custObj ? custObj.name : (row.rawCustomerName || 'Unknown Customer'),
          process_type: 'order_process',
          items: [],
        };
      }
      groups[key].items.push({ ...row, originalIndex: idx });
    });
    return Object.values(groups);
  }, [rawRows, customers]);

  const handleGroupHeaderChange = (groupKey, field, value) => {
    const updated = rawRows.map(row => {
      const cKey = row.customer_id || row.rawCustomerName || 'unassigned';
      const k = `${row.order_date}_${cKey}`;
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

      // Automatically create sales orders for each (Date, Customer) group with system-generated order numbers
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
          items: grp.items.map(item => ({
            product_id: item.product_id,
            godown_id: item.godown_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          notify_customer: false,
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

  const handleExportHeaderOnly = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Order Date', 'Customer Name', 'Godown Name', 'Product Name', 'Unit Price', 'Quantity']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Format_Headers');
    XLSX.writeFile(wb, 'Order_Bulk_Import_Headers_Only.csv');
  };

  const handleDownloadTemplate = () => {
    const sampleCustomer1 = customers[0]?.name || 'Acme Enterprises';
    const sampleCustomer2 = customers[1]?.name || customers[0]?.name || 'Global Logistics';
    const sampleGodown1 = activeGodowns[0]?.name || 'Main Godown';
    const sampleGodown2 = activeGodowns[1]?.name || activeGodowns[0]?.name || 'Factory Godown';
    const sampleProduct1 = products[0]?.name || 'Cement Grade A';
    const sampleProduct2 = products[1]?.name || 'Steel Rods 10mm';

    const ws = XLSX.utils.json_to_sheet([
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer1,
        'Godown Name': sampleGodown1,
        'Product Name': sampleProduct1,
        'Quantity': 50,
        'Unit Price': 350
      },
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer1,
        'Godown Name': sampleGodown2,
        'Product Name': sampleProduct2,
        'Quantity': 100,
        'Unit Price': 650
      },
      {
        'Order Date': getTodayLocal(),
        'Customer Name': sampleCustomer2,
        'Godown Name': sampleGodown1,
        'Product Name': sampleProduct1,
        'Quantity': 25,
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
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-4xl">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <FileSpreadsheet size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Bulk Upload Sales Orders</h2>
              <p className="text-xs text-slate-500">Import orders via Excel or CSV. Order numbers will be auto-generated for each unique date & customer.</p>
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
                      <Info size={15} className="text-primary" /> Document Format & Auto Order-Number Guidelines
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
                <div className="mt-2 text-xs text-slate-600 space-y-1 pl-8">
                  <p>• <strong>Order Numbers are auto-generated:</strong> Do not include Order Number in your file.</p>
                  <p>• <strong>Process Type is auto-set to Order Process:</strong> Do not include Process Type in your file.</p>
                  <p>• <strong>Grouping Logic:</strong> Rows with the <em>same Order Date and Customer Name</em> will be assigned the <strong>same auto-generated order number</strong>.</p>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Order Date</label>
                        <DatePicker
                          value={group.order_date}
                          onChange={(e) => handleGroupHeaderChange(group.key, 'order_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Customer <span className="text-red-500">*</span></label>
                        <Dropdown
                          value={group.customer_id}
                          onValueChange={(val) => handleGroupHeaderChange(group.key, 'customer_id', val)}
                          options={customerOptions}
                          placeholder={group.customer_name ? `Match "${group.customer_name}"...` : "Select customer..."}
                          searchPlaceholder="Search customers..."
                          align="start"
                        />
                      </div>
                    </div>

                    {/* Products Table for this group */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                          <tr>
                            <th className="px-3 py-1.5">#</th>
                            <th className="px-3 py-1.5 w-5/12">Product <span className="text-red-500">*</span></th>
                            <th className="px-3 py-1.5 w-4/12">Godown <span className="text-red-500">*</span></th>
                            <th className="px-3 py-1.5 w-2/12">Unit Price</th>
                            <th className="px-3 py-1.5 w-2/12 text-right">Qty <span className="text-red-500">*</span></th>
                            <th className="px-2 py-1.5 text-center w-1/12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.items.map((row, i) => {
                            const origIdx = row.originalIndex;
                            const isMatched = row.product_id && row.godown_id;
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
                                  />
                                  {!row.product_id && row.rawProductName && (
                                    <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                                      File value: "{row.rawProductName}" (Not matched)
                                    </span>
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
                                <td className="px-3 py-1.5 text-right">
                                  <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    value={row.quantity}
                                    onChange={(e) => handleUpdateRow(origIdx, 'quantity', e.target.value.replace(/\D/g, ''))}
                                    placeholder="1"
                                    className="w-20 h-7 px-2 rounded-md border border-slate-200 text-xs text-right outline-none focus:border-primary bg-white"
                                  />
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
  );
};

export default BulkOrderProductsModal;
