// Shared building blocks for the Docs & Subscriptions pages, styled with the
// same tokens as the rest of VPR (Purchase / Sales tables, ui/modal, ui/button)
// so the module reads as a native part of the app.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Inbox, UploadCloud, X, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import Pagination from "@/components/ui/pagination";
import { DOCS_DATA_CHANGED_EVENT } from "../services/docsApi";

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

// Runs `loader` on mount and again whenever any Docs data changes (this tab,
// another tab, or Supabase realtime), so every page stays live.
export const useDocsData = (loader, initial) => {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      console.error("Docs load failed:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(DOCS_DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DOCS_DATA_CHANGED_EVENT, reload);
  }, [reload]);

  return { data, loading, error, reload };
};

export const usePaged = (list, pageSize = 15) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  const start = (page - 1) * pageSize;
  const rows = useMemo(() => list.slice(start, start + pageSize), [list, start, pageSize]);
  return {
    rows,
    page,
    setPage,
    totalPages,
    paginationProps: {
      currentPage: page,
      totalPages,
      totalItems: list.length,
      startIndex: list.length === 0 ? 0 : start + 1,
      endIndex: Math.min(start + pageSize, list.length),
      onPageChange: (p) => setPage(Math.min(Math.max(1, p), totalPages)),
    },
  };
};

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

export const PageHeader = ({ icon: Icon, title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/15">
          <Icon size={19} strokeWidth={2.1} />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-800 tracking-tight truncate">{title}</h1>
        {description && <p className="text-xs text-slate-500 truncate">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const PageShell = ({ children }) => <div className="flex flex-col gap-4 pb-2 flex-1 min-h-0">{children}</div>;

// Pending / History style segmented switch used across VPR tables.
export const SubTabs = ({ tabs, active, onChange }) => (
  <div className="flex items-center gap-1 shrink-0 flex-wrap">
    {tabs.map((t) => {
      const on = active === t.id;
      return (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
            on ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          }`}
        >
          {t.icon && <t.icon size={14} />}
          {t.label}
          {t.count !== undefined && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                on ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export const Toolbar = ({ children }) => <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>;

export const SearchInput = ({ value, onChange, placeholder = "Search...", className = "" }) => (
  <div className={`relative w-full sm:w-60 lg:w-64 min-w-[180px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
    <Input
      type="text"
      placeholder={placeholder}
      className="pl-9 h-9 text-xs w-full bg-white border-slate-200"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export const FILTER_SELECT_CLASS =
  "h-9 px-2.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 shrink-0 min-w-[120px] max-w-[180px]";

// options: string[] | {value,label}[]
export const FilterSelect = ({ value, onChange, options, allLabel = "All" }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={FILTER_SELECT_CLASS}>
    {allLabel !== null && <option value="">{allLabel}</option>}
    {options.map((o) => {
      const opt = typeof o === "string" ? { value: o, label: o } : o;
      return (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      );
    })}
  </select>
);

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

const KPI_TONES = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  red: "bg-red-50 text-red-600 border-red-100",
  violet: "bg-violet-50 text-violet-600 border-violet-100",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};

export const KpiCard = ({ icon: Icon, label, value, hint, tone = "blue", onClick }) => {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3 text-left ${
        onClick ? "hover:shadow-xs hover:border-primary/30 transition-all cursor-pointer" : ""
      }`}
    >
      {Icon && (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${KPI_TONES[tone] || KPI_TONES.blue}`}>
          <Icon size={17} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-slate-800 tabular-nums leading-tight mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </Comp>
  );
};

export const KpiGrid = ({ children, cols = 4 }) => (
  <div
    className={`grid grid-cols-1 sm:grid-cols-2 ${
      cols >= 4 ? "xl:grid-cols-4" : cols === 3 ? "lg:grid-cols-3" : ""
    } gap-3 shrink-0`}
  >
    {children}
  </div>
);

export const Card = ({ title, icon: Icon, action, children, className = "", bodyClassName = "p-4" }) => (
  <div className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col min-w-0 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={15} className="text-primary shrink-0" />}
          <h3 className="text-sm font-semibold text-slate-700 truncate">{title}</h3>
        </div>
        {action}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </div>
);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const TH_CLASS =
  "text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap";
export const TD_CLASS = "px-4 py-3 text-slate-600 whitespace-nowrap align-middle";

// columns: (string | {label, className})[]
export const DataTable = ({ columns, children, footer, minWidth = "900px" }) => (
  <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden">
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs" style={{ minWidth }}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-blue-50 border-b border-slate-200">
            {columns.map((c, i) => {
              const col = typeof c === "string" ? { label: c } : c;
              return (
                <th key={i} className={`${TH_CLASS} ${col.className || ""}`}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
    {footer && <div className="border-t border-slate-100">{footer}</div>}
  </div>
);

export const TR_CLASS = "group hover:bg-slate-50/60 transition-colors";

export const EmptyRow = ({ colSpan, icon: Icon = Inbox, title = "Nothing here yet", message }) => (
  <tr>
    <td colSpan={colSpan} className="p-12 text-center">
      <EmptyState icon={Icon} title={title} message={message} />
    </td>
  </tr>
);

export const EmptyState = ({ icon: Icon = Inbox, title, message }) => (
  <div className="flex flex-col items-center">
    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
      <Icon size={26} className="text-slate-300" />
    </div>
    <h3 className="text-sm font-semibold text-slate-600 mb-1">{title}</h3>
    {message && <p className="text-xs text-slate-400 max-w-sm">{message}</p>}
  </div>
);

export const TablePagination = ({ paginationProps }) =>
  paginationProps.totalItems > 0 ? <Pagination {...paginationProps} className="py-3" /> : null;

export const LoadingState = ({ text = "Loading..." }) => (
  <div className="flex flex-1 flex-col items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3" />
    <p className="text-sm text-slate-400">{text}</p>
  </div>
);

const ACTION_TONES = {
  primary: "text-slate-400 hover:text-primary hover:bg-primary/5",
  danger: "text-slate-300 hover:text-red-500 hover:bg-red-50",
  success: "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50",
  warning: "text-slate-400 hover:text-amber-600 hover:bg-amber-50",
};

export const IconAction = ({ icon: Icon, title, onClick, tone = "primary", disabled }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
    className={`p-1.5 rounded transition-all disabled:opacity-40 disabled:pointer-events-none ${ACTION_TONES[tone] || ACTION_TONES.primary}`}
  >
    <Icon size={15} />
  </button>
);

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const PILL_TONES = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  red: "bg-red-50 text-red-700 border-red-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export const Pill = ({ tone = "slate", icon: Icon, children, className = "" }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
      PILL_TONES[tone] || PILL_TONES.slate
    } ${className}`}
  >
    {Icon && <Icon size={11} />}
    {children}
  </span>
);

const STATUS_TONE = {
  active: "emerald",
  paid: "emerald",
  settled: "emerald",
  yes: "emerald",
  collected: "emerald",
  renewed: "emerald",
  valid: "emerald",
  pending: "amber",
  requested: "amber",
  "due soon": "amber",
  "expiring soon": "amber",
  approved: "blue",
  email: "blue",
  whatsapp: "emerald",
  rejected: "red",
  overdue: "red",
  expired: "red",
  closed: "slate",
  none: "slate",
  no: "slate",
};

export const StatusPill = ({ status, label }) => (
  <Pill tone={STATUS_TONE[String(status || "").toLowerCase()] || "slate"}>{label || status || "—"}</Pill>
);

// Days-left chip for expiry/renewal columns.
export const DaysLeftPill = ({ days }) => {
  if (days === null || days === undefined) return <span className="text-slate-300">—</span>;
  if (days < 0) return <Pill tone="red">{Math.abs(days)}d overdue</Pill>;
  if (days === 0) return <Pill tone="red">Due today</Pill>;
  if (days <= 30) return <Pill tone="amber">{days}d left</Pill>;
  return <Pill tone="emerald">{days}d left</Pill>;
};

// ---------------------------------------------------------------------------
// Modals & forms
// ---------------------------------------------------------------------------

const MODAL_SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export const DocsModal = ({ open, onClose, icon: Icon, title, description, size = "md", children, footer, onSubmit }) => {
  const Body = onSubmit ? "form" : "div";
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent className={`${MODAL_SIZES[size] || MODAL_SIZES.md} w-[calc(100%-2rem)]`}>
        <Body onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <ModalHeader className="bg-slate-50/70 pr-12">
            {Icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon size={17} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 truncate">{title}</h2>
              {description && <p className="text-xs text-slate-500 truncate">{description}</p>}
            </div>
          </ModalHeader>
          <ModalBody>{children}</ModalBody>
          {footer && <ModalFooter className="bg-slate-50/40">{footer}</ModalFooter>}
        </Body>
      </ModalContent>
    </Modal>
  );
};

export const FIELD_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:bg-slate-50 disabled:text-slate-400";
export const TEXTAREA_CLASS =
  "w-full min-h-[72px] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40";

export const Field = ({ label, required, hint, children, className = "" }) => (
  <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
    {children}
    {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
  </label>
);

export const FormGrid = ({ children, cols = 2 }) => (
  <div className={`grid grid-cols-1 ${cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : ""} gap-4`}>
    {children}
  </div>
);

// Info box summarising the record a modal acts on.
export const DetailGrid = ({ items }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
    {items.map(([label, value]) => (
      <div key={label} className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-xs font-medium text-slate-700 truncate">{value || "—"}</p>
      </div>
    ))}
  </div>
);

const formatSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// files: (File | {name,size})[]
export const FileDropzone = ({ files = [], onChange, multiple = true, accept }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const add = (list) => {
    const incoming = Array.from(list || []);
    if (incoming.length === 0) return;
    onChange(multiple ? [...files, ...incoming] : incoming.slice(0, 1));
  };
  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-slate-300 bg-slate-50/50 hover:border-primary/50 hover:bg-primary/5"
        }`}
      >
        <UploadCloud size={20} className="text-primary" />
        <p className="text-xs font-medium text-slate-600">Click or drag files to upload</p>
        <p className="text-[11px] text-slate-400">
          PDF, images, Word, Excel
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <Paperclip size={13} className="text-slate-400 shrink-0" />
              <span className="truncate text-slate-700 flex-1">{f.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                aria-label={`Remove ${f.name}`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Spinner = ({ className = "border-white" }) => (
  <div className={`animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 ${className}`} />
);

// Simple CSV export used by list pages. rows: array of arrays incl. header.
export const exportCsv = (rows, fileName) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
