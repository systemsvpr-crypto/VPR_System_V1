import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertTriangle, AlertCircle, RotateCw, X, Layers, PlusCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPricingGroup, updatePricingGroup } from '../../../services/pricingService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export const PricingImportModal = ({
  isOpen,
  onClose,
  existingGroups = [],
  ranks = [],
  onImportComplete,
  userCanEdit = true,
  user,
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

  const activeRanks = useMemo(() => (ranks || []).filter((r) => r.is_active !== false), [ranks]);

  // Map each rank to matching column in CSV row
  const findColumnForRank = (row, rankName) => {
    const keys = Object.keys(row);
    const targetClean = rankName.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const key of keys) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        cleanKey === targetClean ||
        cleanKey === `${targetClean}rate` ||
        cleanKey === `rank${targetClean}` ||
        cleanKey === `rank${targetClean}rate`
      ) {
        return key;
      }
    }
    // Also try fuzzy header match: contains rankName + 'rate'
    for (const key of keys) {
      const cleanKey = key.toLowerCase();
      if (cleanKey.includes(rankName.toLowerCase()) && cleanKey.includes('rate')) {
        return key;
      }
    }
    return null;
  };

  // Find column for group name
  const findGroupNameCol = (row) => {
    const keys = Object.keys(row);
    for (const key of keys) {
      const clean = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['groupname', 'group', 'productgroup', 'name', 'itemname'].includes(clean)) {
        return key;
      }
    }
    return keys[0] || '';
  };

  // Match rows with existing pricing groups
  const analyzedRows = useMemo(() => {
    if (!parsedRows || parsedRows.length === 0) {
      return { toCreate: [], toUpdate: [], invalid: [] };
    }

    const toCreate = [];
    const toUpdate = [];
    const invalid = [];

    // Lookup map of existing groups by lowercase trimmed name
    const groupLookup = new Map();
    existingGroups.forEach((g) => {
      if (g.group_name) {
        groupLookup.set(g.group_name.trim().toLowerCase(), g);
      }
    });

    parsedRows.forEach((row, index) => {
      const groupCol = findGroupNameCol(row);
      const groupName = row[groupCol] ? String(row[groupCol]).trim() : '';

      if (!groupName) {
        invalid.push({ rowIndex: index + 1, reason: 'Empty group name' });
        return;
      }

      // Parse rates for each active rank
      const rankRates = {};
      activeRanks.forEach((rank) => {
        const col = findColumnForRank(row, rank.rank_name);
        if (col && row[col] !== undefined && row[col] !== null) {
          const rawVal = String(row[col]).replace(/[^\d.]/g, '').trim();
          if (rawVal !== '' && !isNaN(Number(rawVal))) {
            rankRates[rank.rank_name] = rawVal;
          }
        }
      });

      const existingGroup = groupLookup.get(groupName.toLowerCase());

      if (existingGroup) {
        toUpdate.push({
          rowIndex: index + 1,
          groupId: existingGroup.group_id,
          groupName,
          rankRates,
          existingGroup,
        });
      } else {
        toCreate.push({
          rowIndex: index + 1,
          groupName,
          rankRates,
        });
      }
    });

    return { toCreate, toUpdate, invalid };
  }, [parsedRows, existingGroups, activeRanks]);

  const handleConfirmImport = async () => {
    if (!userCanEdit) {
      toast.error('Permission denied. Only Admins can modify pricing.');
      return;
    }

    const totalToProcess = analyzedRows.toCreate.length + analyzedRows.toUpdate.length;
    if (totalToProcess === 0) {
      toast.error('No valid pricing groups found in the CSV.');
      return;
    }

    setImporting(true);
    setProgress(0);
    let createdCount = 0;
    let updatedCount = 0;
    let failCount = 0;

    let processed = 0;

    // 1. Process Updates
    for (const item of analyzedRows.toUpdate) {
      try {
        // Merge with existing rates so unmentioned ranks aren't erased
        const mergedRankRates = {
          ...(item.existingGroup.rank_rates || {}),
          ...item.rankRates,
        };

        await updatePricingGroup(item.groupId, {
          group_name: item.groupName,
          rank_rates: mergedRankRates,
          updated_by: user?.user_id,
        });
        updatedCount++;
      } catch (err) {
        console.error(`Failed to update group ${item.groupName}:`, err);
        failCount++;
      }
      processed++;
      setProgress(Math.round((processed / totalToProcess) * 100));
    }

    // 2. Process Creates
    for (const item of analyzedRows.toCreate) {
      try {
        await createPricingGroup({
          group_name: item.groupName,
          rank_rates: item.rankRates,
          created_by: user?.user_id,
        });
        createdCount++;
      } catch (err) {
        console.error(`Failed to create group ${item.groupName}:`, err);
        failCount++;
      }
      processed++;
      setProgress(Math.round((processed / totalToProcess) * 100));
    }

    setImporting(false);

    let summaryMsg = '';
    if (createdCount > 0 && updatedCount > 0) {
      summaryMsg = `Created ${createdCount} new groups and updated ${updatedCount} groups!`;
    } else if (createdCount > 0) {
      summaryMsg = `Successfully created ${createdCount} new pricing groups!`;
    } else {
      summaryMsg = `Successfully updated rates for ${updatedCount} pricing groups!`;
    }

    if (failCount > 0) {
      summaryMsg += ` (${failCount} failed)`;
    }

    toast.success(summaryMsg);

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
              Bulk Import Pricing Groups & Rank Rates
            </ModalTitle>
            <ModalDescription className="text-xs text-slate-500">
              Upload a CSV file to create new pricing groups or update rank rates for existing groups.
            </ModalDescription>
          </div>
        </ModalHeader>

        <ModalBody className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* File Upload Zone */}
          {!file ? (
            <div className="border-2 border-dashed border-slate-200 hover:border-primary/50 transition-colors rounded-xl p-8 text-center bg-slate-50/50">
              <input
                type="file"
                id="pricing-csv-file-input"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="pricing-csv-file-input"
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
                    Columns: Group Name, {activeRanks.map(r => `${r.rank_name} Rate (₹)`).join(', ')}
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
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center gap-2.5">
                  <RefreshCw size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-amber-900">
                      {analyzedRows.toUpdate.length} Groups to Update
                    </span>
                    <p className="text-[11px] text-amber-700">Existing groups — rates will be updated</p>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center gap-2.5">
                  <PlusCircle size={18} className="text-blue-600 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-blue-900">
                      {analyzedRows.toCreate.length} New Groups to Create
                    </span>
                    <p className="text-[11px] text-blue-700">New pricing groups will be added</p>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              {(analyzedRows.toUpdate.length > 0 || analyzedRows.toCreate.length > 0) && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    Pricing Preview ({analyzedRows.toUpdate.length + analyzedRows.toCreate.length} Groups)
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Action</th>
                          <th className="px-3 py-2">Group Name</th>
                          {activeRanks.map((r) => (
                            <th key={r.rank_id} className="px-3 py-2 text-center">
                              {r.rank_name} (₹)
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {/* Show Updates First */}
                        {analyzedRows.toUpdate.slice(0, 40).map((row, i) => (
                          <tr key={`upd-${i}`} className="hover:bg-slate-50/60">
                            <td className="px-3 py-1.5 text-slate-400 text-[11px]">{i + 1}</td>
                            <td className="px-3 py-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                Update
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-medium text-slate-800">{row.groupName}</td>
                            {activeRanks.map((r) => {
                              const val = row.rankRates[r.rank_name];
                              return (
                                <td key={r.rank_id} className="px-3 py-1.5 text-center font-medium">
                                  {val ? (
                                    <span className="text-emerald-700 font-semibold">₹{Number(val).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}

                        {/* Then Creates */}
                        {analyzedRows.toCreate.slice(0, 40).map((row, i) => (
                          <tr key={`crt-${i}`} className="hover:bg-slate-50/60 bg-blue-50/20">
                            <td className="px-3 py-1.5 text-slate-400 text-[11px]">
                              {analyzedRows.toUpdate.length + i + 1}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                                + New
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-medium text-slate-800">{row.groupName}</td>
                            {activeRanks.map((r) => {
                              const val = row.rankRates[r.rank_name];
                              return (
                                <td key={r.rank_id} className="px-3 py-1.5 text-center font-medium">
                                  {val ? (
                                    <span className="text-blue-700 font-semibold">₹{Number(val).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invalid Rows Warning */}
              {analyzedRows.invalid.length > 0 && (
                <div className="border border-red-200 bg-red-50/30 rounded-lg p-2.5 text-[11px] text-red-700">
                  <div className="flex items-center gap-1.5 font-semibold text-red-800">
                    <AlertCircle size={14} />
                    {analyzedRows.invalid.length} row(s) skipped due to missing group name.
                  </div>
                </div>
              )}

              {/* Progress Bar while importing */}
              {importing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Importing pricing groups...</span>
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
            disabled={
              importing ||
              (analyzedRows.toCreate.length === 0 && analyzedRows.toUpdate.length === 0)
            }
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
                <span>
                  Confirm Import ({analyzedRows.toUpdate.length + analyzedRows.toCreate.length} Groups)
                </span>
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default PricingImportModal;
