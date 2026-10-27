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
import { Button } from "@/components/ui/button";

/**
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - fileName: string
 * - parsedData: Array<{ rawRow: object, index: number, name: string, rawPhone: string, cleanPhone: string, status: 'valid' | 'invalid' | 'duplicate', issues: string[] }>
 * - onConfirmImport: (validAndFixedRows: Array<{ display_name: string, raw_phone_number: string, batch_label: string }>) => void
 * - isImporting: boolean
 */

const STAT_TONES = {
  all: { active: "bg-slate-50 border-slate-300", label: "text-slate-500", value: "text-slate-800" },
  valid: { active: "bg-emerald-50 border-emerald-200", label: "text-emerald-700", value: "text-emerald-700" },
  duplicate: { active: "bg-amber-50 border-amber-200", label: "text-amber-700", value: "text-amber-700" },
  invalid: { active: "bg-red-50 border-red-200", label: "text-red-700", value: "text-red-700" },
};

const StatCard = ({ id, label, value, icon: Icon, filterTab, setFilterTab }) => {
  const tone = STAT_TONES[id];
  return (
    <button
      type="button"
      onClick={() => setFilterTab(id)}
      className={`p-3 rounded-xl border text-left transition-all ${
        filterTab === id ? `${tone.active} shadow-2xs` : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${tone.label}`}>{label}</span>
        {Icon && <Icon size={14} className={tone.label} />}
      </div>
      <span className={`text-lg font-bold tabular-nums ${tone.value}`}>{value}</span>
    </button>
  );
};

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

  // Analyse rows (validation + in-file duplicates) whenever new data arrives
  React.useEffect(() => {
    if (!initialParsedData || initialParsedData.length === 0) {
      setRows([]);
      return;
    }

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
        name,
        rawPhone,
        normalizedPhone,
        digits,
        status,
        issues,
        selected: status === "valid", // only valid rows selected by default
      };
    });

    // Flag the first occurrence of a duplicated number too
    analyzed.forEach((item) => {
      if (item.normalizedPhone && (phoneCountMap.get(item.normalizedPhone) || 0) > 1) {
        if (!item.issues.some((i) => i.includes("Duplicate"))) {
          item.issues.push("Duplicate phone number exists in this batch");
          if (item.status === "valid") {
            item.status = "duplicate";
            item.selected = true; // still selectable / mergeable
          }
        }
      }
    });

    setRows(analyzed);
    setFilterTab("all");
    setSearchQuery("");
  }, [initialParsedData]);

  // Re-validate an edited row and recompute duplicates across the batch
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

        return { ...r, name, rawPhone, digits, normalizedPhone, status, issues, selected: status === "valid" };
      });

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
          return { ...r, status: "duplicate", issues: [`Duplicate number (occurs ${count} times)`] };
        }
        return { ...r, status: "valid", issues: [] };
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
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const handleSelectAllValid = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: r.status !== "invalid" })));
  };

  const handleDeselectAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

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
        return (r.name || "").toLowerCase().includes(q) || (r.rawPhone || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, filterTab, searchQuery]);

  const handleConfirm = () => {
    // Only import selected rows that are not invalid
    const toImport = rows.filter((r) => r.selected && r.status !== "invalid");
    if (toImport.length === 0) return;

    // One record per unique phone number
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

  const inlineInput =
    "w-full h-7 px-2 text-xs rounded-md border border-primary/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 truncate">CSV Contact Import & Data Verification</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-[200px]">
                  {fileName}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Verify imported records, fix discrepancies, and exclude malformed rows before saving.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard id="all" label="Total Rows" value={counts.total} filterTab={filterTab} setFilterTab={setFilterTab} />
          <StatCard id="valid" label="Valid & Ready" value={counts.valid} icon={CheckCircle2} filterTab={filterTab} setFilterTab={setFilterTab} />
          <StatCard id="duplicate" label="Duplicates (Merged)" value={counts.duplicate} icon={AlertTriangle} filterTab={filterTab} setFilterTab={setFilterTab} />
          <StatCard id="invalid" label="Discrepancies / Errors" value={counts.invalid} icon={XCircle} filterTab={filterTab} setFilterTab={setFilterTab} />
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or number..."
                className="w-full h-9 pl-8 pr-7 rounded-md border border-slate-200 bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {[
                { id: "all", label: "All" },
                { id: "valid", label: "Valid" },
                { id: "duplicate", label: "Duplicates" },
                { id: "invalid", label: "Errors" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilterTab(t.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === t.id ? "bg-white text-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleSelectAllValid}
              className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <Check size={12} /> Select All Valid
            </button>
            <span className="text-slate-300">|</span>
            <button type="button" onClick={handleDeselectAll} className="text-[11px] font-semibold text-slate-500 hover:underline">
              Clear
            </button>
          </div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[460px] px-5 py-4">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Filter size={28} className="text-slate-300 mb-2" />
              <p className="text-xs font-medium text-slate-500">No rows matching current filter or search criteria.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="grid grid-cols-12 bg-blue-50 border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Contact Name</div>
                <div className="col-span-3">Phone Number</div>
                <div className="col-span-3">Status / Discrepancy</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const isEditing = editingIndex === r.id;
                  const isInvalid = r.status === "invalid";
                  const isDup = r.status === "duplicate";

                  return (
                    <div
                      key={r.id}
                      className={`grid grid-cols-12 items-center px-4 py-2 text-xs transition-colors ${
                        isInvalid ? "bg-red-50/50" : isDup ? "bg-amber-50/40" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="col-span-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={isInvalid}
                          checked={r.selected && !isInvalid}
                          onChange={() => handleToggleRowSelection(r.id)}
                          className="h-3.5 w-3.5 accent-primary cursor-pointer disabled:opacity-30"
                        />
                        <span className="text-[11px] text-slate-400 tabular-nums">{r.originalIdx}</span>
                      </div>

                      <div className="col-span-3 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Name"
                            className={inlineInput}
                          />
                        ) : (
                          <span className="font-medium text-slate-800 truncate block">
                            {r.name || <span className="text-slate-400 italic font-normal">No Name</span>}
                          </span>
                        )}
                      </div>

                      <div className="col-span-3 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="Phone (10 digits)"
                            className={`${inlineInput} tabular-nums`}
                          />
                        ) : (
                          <span className="tabular-nums text-slate-700 truncate block">
                            {r.rawPhone || <span className="text-red-500 italic">Empty</span>}
                          </span>
                        )}
                      </div>

                      <div className="col-span-3 pr-2">
                        {isInvalid ? (
                          <div className="flex items-center gap-1.5 text-red-600">
                            <XCircle size={13} className="shrink-0" />
                            <span className="text-[11px] font-medium truncate" title={r.issues.join(", ")}>
                              {r.issues[0] || "Invalid record"}
                            </span>
                          </div>
                        ) : isDup ? (
                          <div className="flex items-center gap-1.5 text-amber-600">
                            <AlertTriangle size={13} className="shrink-0" />
                            <span className="text-[11px] font-medium truncate" title={r.issues.join(", ")}>
                              Duplicate (Auto-deduplicated)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 size={13} className="shrink-0" />
                            <span className="text-[11px] font-medium">Valid</span>
                          </div>
                        )}
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button size="xs" onClick={() => handleSaveInlineEdit(r.id)} className="text-[10px] px-2">
                              Save
                            </Button>
                            <button
                              type="button"
                              onClick={() => setEditingIndex(null)}
                              className="p-1 rounded text-slate-400 hover:text-slate-600"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              title="Edit Row"
                              onClick={() => handleStartEdit(r)}
                              className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              title="Remove Row"
                              onClick={() => handleDeleteRow(r.id)}
                              className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{counts.selectedCount} contact(s)</span> selected to be saved
            {counts.duplicate > 0 && " (duplicates will be merged safely)"}.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isImporting}
              className="flex-1 sm:flex-initial px-4 h-9 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isImporting || counts.selectedCount === 0}
              className="flex-1 sm:flex-initial gap-1.5 px-4 h-9 text-xs font-medium"
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
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
