import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  UploadCloud,
  FileSpreadsheet,
  X,
  Edit2,
  Trash2,
  Search,
  Filter,
  Check,
  RotateCcw,
} from "lucide-react";

/**
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - fileName: string
 * - parsedData: Array<{ rawRow: object, index: number, name: string, rawPhone: string, cleanPhone: string, status: 'valid' | 'invalid' | 'duplicate', issues: string[] }>
 * - onConfirmImport: (validAndFixedRows: Array<{ display_name: string, raw_phone_number: string, batch_label: string }>) => void
 * - isImporting: boolean
 */
export default function BulkContactPreviewModal({
  isOpen,
  onClose,
  fileName,
  parsedData: initialParsedData = [],
  onConfirmImport,
  isImporting = false,
}) {
  const [rows, setRows] = useState([]);
  const [filterTab, setFilterTab] = useState("all"); // 'all' | 'valid' | 'invalid' | 'duplicate'
  const [searchQuery, setSearchQuery] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Initialize rows with discrepancy detection whenever initialParsedData changes
  React.useEffect(() => {
    if (!initialParsedData || initialParsedData.length === 0) {
      setRows([]);
      return;
    }

    // Evaluate discrepancies & duplicates
    const phoneCountMap = new Map();

    const analyzed = initialParsedData.map((item, idx) => {
      const name = String(item.name || "").trim();
      const rawPhone = String(item.rawPhone || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      const normalizedPhone = digits.length >= 10 ? digits.slice(-10) : digits;

      const issues = [];
      let status = "valid";

      if (!rawPhone) {
        issues.push("Missing phone number");
        status = "invalid";
      } else if (digits.length < 10) {
        issues.push(`Incomplete number (${digits.length} digits, minimum 10 required)`);
        status = "invalid";
      } else if (digits.length > 13) {
        issues.push(`Unusually long phone number (${digits.length} digits)`);
        status = "invalid";
      }

      if (normalizedPhone) {
        const count = phoneCountMap.get(normalizedPhone) || 0;
        phoneCountMap.set(normalizedPhone, count + 1);
        if (count > 0 && status === "valid") {
          status = "duplicate";
          issues.push(`Duplicate number (appears ${count + 1} times in this file)`);
        }
      }

      return {
        id: `row-${idx}`,
        originalIdx: idx + 1,
        name: name,
        rawPhone: rawPhone,
        normalizedPhone: normalizedPhone,
        digits: digits,
        status: status,
        issues: issues,
        selected: status === "valid", // only valid selected by default
      };
    });

    // Mark previous instances of duplicates as duplicate warning if needed
    analyzed.forEach((item) => {
      if (item.normalizedPhone && (phoneCountMap.get(item.normalizedPhone) || 0) > 1) {
        if (!item.issues.some((i) => i.includes("Duplicate"))) {
          item.issues.push("Duplicate phone number exists in this batch");
          if (item.status === "valid") {
            item.status = "duplicate";
            item.selected = true; // Still selectable/mergeable
          }
        }
      }
    });

    setRows(analyzed);
    setFilterTab("all");
    setSearchQuery("");
  }, [initialParsedData]);

  // Recalculate duplicates & validation on single row inline edit
  const handleSaveInlineEdit = (id) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const name = editName.trim();
        const rawPhone = editPhone.trim();
        const digits = rawPhone.replace(/\D/g, "");
        const normalizedPhone = digits.length >= 10 ? digits.slice(-10) : digits;

        const issues = [];
        let status = "valid";

        if (!rawPhone) {
          issues.push("Missing phone number");
          status = "invalid";
        } else if (digits.length < 10) {
          issues.push(`Incomplete number (${digits.length} digits)`);
          status = "invalid";
        }

        return {
          ...r,
          name,
          rawPhone,
          digits,
          normalizedPhone,
          status,
          issues,
          selected: status === "valid",
        };
      });

      // Recalculate duplicate status
      const phoneCountMap = new Map();
      updated.forEach((r) => {
        if (r.normalizedPhone && r.status !== "invalid") {
          phoneCountMap.set(r.normalizedPhone, (phoneCountMap.get(r.normalizedPhone) || 0) + 1);
        }
      });

      return updated.map((r) => {
        if (r.status === "invalid") return r;
        const count = phoneCountMap.get(r.normalizedPhone) || 0;
        if (count > 1) {
          return {
            ...r,
            status: "duplicate",
            issues: [`Duplicate number (occurs ${count} times)`],
          };
        }
        return {
          ...r,
          status: "valid",
          issues: [],
        };
      });
    });
    setEditingIndex(null);
  };

  const handleStartEdit = (row) => {
    setEditingIndex(row.id);
    setEditName(row.name || "");
    setEditPhone(row.rawPhone || "");
  };

  const handleDeleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleRowSelection = (id) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAllValid = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.status !== "invalid",
      }))
    );
  };

  const handleDeselectAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  // Filtered rows for display
  const counts = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.status === "valid").length;
    const duplicate = rows.filter((r) => r.status === "duplicate").length;
    const invalid = rows.filter((r) => r.status === "invalid").length;
    const selectedCount = rows.filter((r) => r.selected).length;
    return { total, valid, duplicate, invalid, selectedCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterTab === "valid" && r.status !== "valid") return false;
      if (filterTab === "duplicate" && r.status !== "duplicate") return false;
      if (filterTab === "invalid" && r.status !== "invalid") return false;
      if (filterTab === "selected" && !r.selected) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (r.name || "").toLowerCase().includes(q);
        const matchPhone = (r.rawPhone || "").toLowerCase().includes(q);
        return matchName || matchPhone;
      }
      return true;
    });
  }, [rows, filterTab, searchQuery]);

  const handleConfirm = () => {
    // Only import selected rows that are not invalid
    const toImport = rows.filter((r) => r.selected && r.status !== "invalid");
    if (toImport.length === 0) return;

    // Deduplicate on confirm so only 1 record per unique phone number is passed
    const map = new Map();
    toImport.forEach((r) => {
      const key = r.normalizedPhone || r.rawPhone;
      map.set(key, {
        display_name: r.name || null,
        raw_phone_number: r.rawPhone,
        batch_label: fileName || "Bulk CSV Import",
      });
    });

    onConfirmImport(Array.from(map.values()));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                  CSV Contact Import & Data Verification
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {fileName}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Verify imported records, fix discrepancies, and exclude malformed rows before saving.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats / Metric Badges */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-900">
          <div
            onClick={() => setFilterTab("all")}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === "all"
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 shadow-xs"
                : "border-gray-100 dark:border-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-850"
            }`}
          >
            <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Rows
            </span>
            <span className="text-lg font-black text-gray-900 dark:text-white">
              {counts.total}
            </span>
          </div>

          <div
            onClick={() => setFilterTab("valid")}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === "valid"
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 shadow-xs"
                : "border-gray-100 dark:border-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-850"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Valid & Ready
              </span>
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
              {counts.valid}
            </span>
          </div>

          <div
            onClick={() => setFilterTab("duplicate")}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === "duplicate"
                ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 shadow-xs"
                : "border-gray-100 dark:border-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-850"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                Duplicates (Merged)
              </span>
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-lg font-black text-amber-700 dark:text-amber-300">
              {counts.duplicate}
            </span>
          </div>

          <div
            onClick={() => setFilterTab("invalid")}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === "invalid"
                ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 shadow-xs"
                : "border-gray-100 dark:border-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-850"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">
                Discrepancies / Errors
              </span>
              <XCircle size={15} className="text-red-600 dark:text-red-400" />
            </div>
            <span className="text-lg font-black text-red-700 dark:text-red-300">
              {counts.invalid}
            </span>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/40 dark:bg-slate-950/20">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or number..."
                className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-gray-200/60 dark:bg-slate-800 p-0.5 rounded-xl text-xs">
              {[
                { id: "all", label: "All" },
                { id: "valid", label: "Valid" },
                { id: "duplicate", label: "Duplicates" },
                { id: "invalid", label: "Errors" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterTab(t.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterTab === t.id
                      ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-xs"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleSelectAllValid}
              className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <Check size={12} /> Select All Valid
            </button>
            <span className="text-gray-300 dark:text-slate-700">|</span>
            <button
              onClick={handleDeselectAll}
              className="text-[11px] font-bold text-gray-500 dark:text-slate-400 hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Contacts Table / Discrepancy View */}
        <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[460px] p-6 space-y-2">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Filter size={32} className="text-gray-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                No rows matching current filter or search criteria.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 shadow-xs">
              <div className="grid grid-cols-12 bg-gray-50 dark:bg-slate-950/70 px-4 py-2.5 text-[11px] font-extrabold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="col-span-1 flex items-center">#</div>
                <div className="col-span-3">Contact Name</div>
                <div className="col-span-3">Phone Number</div>
                <div className="col-span-3">Status / Discrepancy</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredRows.map((r) => {
                  const isEditing = editingIndex === r.id;
                  const isInvalid = r.status === "invalid";
                  const isDup = r.status === "duplicate";

                  return (
                    <div
                      key={r.id}
                      className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs transition-colors ${
                        isInvalid
                          ? "bg-red-50/40 dark:bg-red-950/20"
                          : isDup
                          ? "bg-amber-50/30 dark:bg-amber-950/15"
                          : "hover:bg-gray-50/60 dark:hover:bg-slate-850/50"
                      }`}
                    >
                      {/* Checkbox & Index */}
                      <div className="col-span-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={isInvalid}
                          checked={r.selected && !isInvalid}
                          onChange={() => handleToggleRowSelection(r.id)}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 dark:border-slate-700 cursor-pointer disabled:opacity-30"
                        />
                        <span className="text-[11px] text-gray-400 font-mono">
                          {r.originalIdx}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="col-span-3 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Name"
                            className="w-full px-2 py-1 text-xs rounded-lg border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-950 focus:outline-none"
                          />
                        ) : (
                          <span className="font-semibold text-gray-900 dark:text-white truncate block">
                            {r.name || <span className="text-gray-400 italic">No Name</span>}
                          </span>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="col-span-3 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="Phone (10 digits)"
                            className="w-full px-2 py-1 text-xs rounded-lg border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-950 font-mono focus:outline-none"
                          />
                        ) : (
                          <span className="font-mono text-gray-800 dark:text-slate-200 truncate block">
                            {r.rawPhone || <span className="text-red-500 italic">Empty</span>}
                          </span>
                        )}
                      </div>

                      {/* Status / Issues */}
                      <div className="col-span-3 pr-2">
                        {isInvalid ? (
                          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <XCircle size={14} className="shrink-0" />
                            <span className="text-[11px] font-semibold truncate" title={r.issues.join(", ")}>
                              {r.issues[0] || "Invalid record"}
                            </span>
                          </div>
                        ) : isDup ? (
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={14} className="shrink-0" />
                            <span className="text-[11px] font-semibold truncate" title={r.issues.join(", ")}>
                              Duplicate (Auto-deduplicated)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={14} className="shrink-0" />
                            <span className="text-[11px] font-semibold">Valid</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveInlineEdit(r.id)}
                              className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold px-2 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              title="Edit Row"
                              onClick={() => handleStartEdit(r)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              title="Remove Row"
                              onClick={() => handleDeleteRow(r.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-slate-950/40">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            <span className="font-bold text-gray-900 dark:text-white">
              {counts.selectedCount} contact(s)
            </span>{" "}
            selected to be saved into database
            {counts.duplicate > 0 && " (duplicates will be merged safely)"}.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 text-xs font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isImporting || counts.selectedCount === 0}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <RotateCcw size={14} className="animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <UploadCloud size={14} />
                  Import {counts.selectedCount} Valid Contacts
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
