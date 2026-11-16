import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertTriangle, AlertCircle, RotateCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateProductPlanning } from '../../../services/masterService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export const ImsImportModal = ({
  isOpen,
  onClose,
  products = [],
  onImportComplete,
  canModify = true,
}) => {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [progress, setProgress] = useState(0);

  const resetState = () => {
    setFile(null);
    setParsing(false);
    setImporting(false);
    setParsedRows([]);
    setProgress(0);
  };

  const handleModalClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a valid CSV file.');
      return;
    }

    setFile(selectedFile);
    setParsing(true);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        setParsing(false);
        if (results.errors && results.errors.length > 0) {
          console.warn('CSV Parse warnings:', results.errors);
        }
        if (!results.data || results.data.length === 0) {
          toast.error('The selected CSV file is empty.');
          setFile(null);
          return;
        }
        setParsedRows(results.data);
      },
      error: (err) => {
        setParsing(false);
        console.error('CSV Parse Error:', err);
        toast.error('Failed to parse CSV file: ' + err.message);
        setFile(null);
      },
    });
  };

  // Helper to extract values by flexible column name keys
  const getColValue = (row, ...aliases) => {
    const keys = Object.keys(row);
    for (const alias of aliases) {
      const target = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        return String(row[foundKey]).trim();
      }
    }
    return '';
  };

  // Match rows with existing products
  const matchResults = useMemo(() => {
    if (!parsedRows || parsedRows.length === 0) {
      return { matched: [], unmatched: [] };
    }

    const matched = [];
    const unmatched = [];

    // Pre-index products by trimmed lowercase name
    const productLookup = new Map();
    products.forEach((p) => {
      const name = (p.productName || p.name || '').trim().toLowerCase();
      if (name) {
        productLookup.set(name, p);
      }
    });

    parsedRows.forEach((row, index) => {
      const rawName = getColValue(row, 'Product Name', 'ProductName', 'Product', 'Item Name');
      const leadTimeStr = getColValue(row, 'Lead Time (Days)', 'Lead Time', 'LeadTime');
      const safetyFactorStr = getColValue(row, 'Safety Factor (Days)', 'Safety Factor', 'SafetyFactor');
      const reorderQtyStr = getColValue(row, 'Reorder Qty', 'Reorder Quantity', 'ReorderQty');
      const reorderUnitStr = getColValue(row, 'Reorder Unit', 'ReorderUnit', 'Unit');

      if (!rawName) {
        // Skip blank product rows
        return;
      }

      const normalizedName = rawName.toLowerCase();
      const product = productLookup.get(normalizedName);

      const leadTimeNum = leadTimeStr !== '' && !isNaN(Number(leadTimeStr)) ? Math.round(Number(leadTimeStr)) : null;
      const safetyFactorNum = safetyFactorStr !== '' && !isNaN(Number(safetyFactorStr)) ? Math.round(Number(safetyFactorStr)) : null;

      if (product) {
        matched.push({
          rowIndex: index + 1,
          productId: product.productId || product.product_id,
          productName: product.productName || product.name,
          currentLeadTime: product.leadTime ?? product.lead_time ?? '—',
          currentSafetyFactor: product.safetyFactor ?? product.safety_factor ?? '—',
          newLeadTime: leadTimeNum,
          newSafetyFactor: safetyFactorNum,
          reorderQty: reorderQtyStr || '—',
          reorderUnit: reorderUnitStr || product.unit || 'BAG',
        });
      } else {
        unmatched.push({
          rowIndex: index + 1,
          productName: rawName,
          leadTime: leadTimeNum ?? leadTimeStr,
          safetyFactor: safetyFactorNum ?? safetyFactorStr,
          reason: 'No matching product found in Master',
        });
      }
    });

    return { matched, unmatched };
  }, [parsedRows, products]);

  const handleConfirmImport = async () => {
    if (!canModify) {
      toast.error('Permission denied. Only Admins can modify product planning.');
      return;
    }

    if (matchResults.matched.length === 0) {
      toast.error('No matched products to import.');
      return;
    }

    setImporting(true);
    setProgress(0);
    let successCount = 0;
    let failCount = 0;

    const total = matchResults.matched.length;

    for (let i = 0; i < total; i++) {
      const item = matchResults.matched[i];
      try {
        const payload = {};
        if (item.newLeadTime !== null) payload.lead_time = item.newLeadTime;
        if (item.newSafetyFactor !== null) payload.safety_factor = item.newSafetyFactor;

        if (Object.keys(payload).length > 0) {
          await updateProductPlanning(item.productId, payload);
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to update ${item.productName}:`, err);
        failCount++;
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setImporting(false);

    if (failCount === 0) {
      toast.success(`Successfully updated ${successCount} products!`);
    } else {
      toast.success(`Updated ${successCount} products. (${failCount} failed)`);
    }

    if (onImportComplete) {
      await onImportComplete();
    }
    handleModalClose();
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && handleModalClose()}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Upload size={18} />
          </div>
          <div>
            <ModalTitle className="text-base font-semibold text-slate-800">
              Bulk Import Ultimate IMS Planning Parameters
            </ModalTitle>
            <ModalDescription className="text-xs text-slate-500">
              Import Lead Time & Safety Factor from CSV to automatically configure reorder planning.
            </ModalDescription>
          </div>
        </ModalHeader>

        <ModalBody className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* File Upload Zone */}
          {!file ? (
            <div className="border-2 border-dashed border-slate-200 hover:border-primary/50 transition-colors rounded-xl p-8 text-center bg-slate-50/50">
              <input
                type="file"
                id="ims-csv-file-input"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="ims-csv-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Upload size={22} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-primary hover:underline">
                    Click to select CSV file
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    Columns: Product Name, Lead Time (Days), Safety Factor (Days), Reorder Qty, Reorder Unit
                  </p>
                </div>
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{file.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB • {parsedRows.length} rows found
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetState}
                disabled={importing}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </Button>
            </div>
          )}

          {parsing && (
            <div className="flex items-center justify-center py-6 text-slate-500 text-xs gap-2">
              <RotateCw size={15} className="animate-spin text-primary" />
              Parsing CSV file...
            </div>
          )}

          {/* Results Summary */}
          {file && !parsing && parsedRows.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-emerald-900">
                      {matchResults.matched.length} Matched Products
                    </span>
                    <p className="text-[11px] text-emerald-700">Ready to update planning values</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-amber-900">
                      {matchResults.unmatched.length} Unmatched Products
                    </span>
                    <p className="text-[11px] text-amber-700">Will be skipped (name not found)</p>
                  </div>
                </div>
              </div>

              {/* Matched Preview Table */}
              {matchResults.matched.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    Matched Products Preview ({matchResults.matched.length})
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Product Name</th>
                          <th className="px-3 py-2 text-center">Lead Time (Days)</th>
                          <th className="px-3 py-2 text-center">Safety Factor (Days)</th>
                          <th className="px-3 py-2 text-center">Reorder Ref</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matchResults.matched.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/60">
                            <td className="px-3 py-1.5 text-slate-400 text-[11px]">{i + 1}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-800">{row.productName}</td>
                            <td className="px-3 py-1.5 text-center">
                              {row.newLeadTime !== null ? (
                                <span className="font-semibold text-primary">{row.newLeadTime}</span>
                              ) : (
                                <span className="text-slate-400">Keep {row.currentLeadTime}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {row.newSafetyFactor !== null ? (
                                <span className="font-semibold text-primary">{row.newSafetyFactor}</span>
                              ) : (
                                <span className="text-slate-400">Keep {row.currentSafetyFactor}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center text-slate-500 text-[11px]">
                              {row.reorderQty} {row.reorderUnit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {matchResults.matched.length > 50 && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">
                      Showing first 50 of {matchResults.matched.length} matched products.
                    </p>
                  )}
                </div>
              )}

              {/* Unmatched Products Warning */}
              {matchResults.unmatched.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                    <AlertCircle size={14} className="text-amber-600" />
                    Unmatched Items ({matchResults.unmatched.length})
                  </h4>
                  <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-2.5 max-h-32 overflow-y-auto text-[11px] space-y-1">
                    {matchResults.unmatched.map((u, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-700">
                        <span className="font-medium text-amber-900">• {u.productName}</span>
                        <span className="text-amber-600">{u.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress Bar while importing */}
              {importing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Importing planning values...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex items-center justify-between border-t border-slate-100 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleModalClose}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmImport}
            disabled={importing || matchResults.matched.length === 0}
            className="gap-2"
          >
            {importing ? (
              <>
                <RotateCw size={14} className="animate-spin" />
                <span>Importing... ({progress}%)</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Update {matchResults.matched.length} Products</span>
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ImsImportModal;
