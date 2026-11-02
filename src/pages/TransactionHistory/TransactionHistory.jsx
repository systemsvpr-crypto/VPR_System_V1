import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  RotateCw,
  Download,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  Edit3,
  Trash2,
  Eye,
  AlertCircle,
  Copy,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, subDays } from 'date-fns';
import {
  fetchAuditLogs,
  fetchAuditStats,
  exportAuditLogsToExcel,
  getMasterEntityCache,
  resolveEntityName,
  AUDIT_MODULES,
  AUDIT_ACTIONS,
} from '../../services/auditService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import Pagination from '@/components/ui/pagination';
import TableScrollSync from '@/components/TableScrollSync';
import TransactionDetailModal from './TransactionDetailModal';

const ACTION_CONFIG = {
  CREATE: {
    label: 'Created',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  EDIT: {
    label: 'Edited',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Edit3,
  },
  DELETE: {
    label: 'Deleted',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: Trash2,
  },
};

const ENTITY_CONFIG = {
  sales_orders: { label: 'Sales Order', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  sales_order_items: { label: 'Order Item', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  dispatch_plans: { label: 'Dispatch Plan', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  purchase_indents: { label: 'Purchase Indent', pill: 'bg-purple-50 text-purple-700 border-purple-200' },
  purchase_indent_items: { label: 'Indent Item', pill: 'bg-violet-50 text-violet-700 border-violet-200' },
  purchase_deliveries: { label: 'Delivery / Lift', pill: 'bg-teal-50 text-teal-700 border-teal-200' },
  transactions: { label: 'Stock Movement', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  products: { label: 'Product', pill: 'bg-slate-100 text-slate-700 border-slate-200' },
  customers: { label: 'Customer', pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  godowns: { label: 'Godown', pill: 'bg-orange-50 text-orange-700 border-orange-200' },
  vendors: { label: 'Vendor', pill: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  transporters: { label: 'Transporter', pill: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  ranks: { label: 'Rank', pill: 'bg-stone-50 text-stone-700 border-stone-200' },
  product_groups: { label: 'Product Group', pill: 'bg-stone-50 text-stone-700 border-stone-200' },
  users: { label: 'User Account', pill: 'bg-pink-50 text-pink-700 border-pink-200' },
};
const STAGE_CONFIG = {
  'Purchase Delivery': { label: 'Purchase Delivery', pill: 'bg-teal-50 text-teal-700 border-teal-200' },
  'Dispatch Planning': { label: 'Dispatch Planning', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Smart Dispatch': { label: 'Smart Dispatch', pill: 'bg-orange-50 text-orange-700 border-orange-200' },
  'Dispatch Completed': { label: 'Dispatch Done', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Orders': { label: 'Orders', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Indent': { label: 'Indent', pill: 'bg-purple-50 text-purple-700 border-purple-200' },
  'Vendor Approval': { label: 'Vendor Approval', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  'Approval': { label: 'Approval', pill: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Aawak Details': { label: 'Aawak Details', pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  'Purchase Dashboard': { label: 'Purchase Dashboard', pill: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  'Stock Management': { label: 'Stock Management', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Master Data': { label: 'Master Data', pill: 'bg-slate-100 text-slate-700 border-slate-200' },
  'Live Stock': { label: 'Live Stock', pill: 'bg-lime-50 text-lime-700 border-lime-200' },
  'Ultimate IMS': { label: 'Ultimate IMS', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const getStageBadge = (log) => {
  if (log.stage && STAGE_CONFIG[log.stage]) {
    return STAGE_CONFIG[log.stage];
  }
  if (log.stage) {
    return { label: log.stage, pill: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
  return ENTITY_CONFIG[log.table_name] || {
    label: log.table_name?.replace(/_/g, ' ') || 'Record',
    pill: 'bg-slate-100 text-slate-700 border-slate-200',
  };
};


const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
const isIsoDate = (str) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
const isDateOnly = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str);

const formatSummaryText = (text, cache) => {
  if (!text) return '—';
  let clean = text;
  clean = clean.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => resolveEntityName(m, '', cache) || '');
  clean = clean.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, (iso) => {
    try {
      const d = new Date(iso);
      return !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy hh:mm a') : iso;
    } catch {
      return iso;
    }
  });
  clean = clean.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
  return clean;
};

const formatRecordRef = (ref, tableName) => {
  if (!ref) return '—';
  if (isUUID(ref)) {
    const entity = ENTITY_CONFIG[tableName]?.label || 'Item';
    return `${entity} #${ref.slice(0, 8)}`;
  }
  return ref;
};

const renderChangeSummary = (log, masterCache, onViewDetails) => {
  if (log.action === 'CREATE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
        <CheckCircle2 size={13} />
        New record created
      </span>
    );
  }
  if (log.action === 'DELETE') {
    const isRemainder = log.summary?.startsWith('Deleted pending delivery remainder');
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/70">
        <Trash2 size={13} />
        {isRemainder ? log.summary : 'Record deleted'}
      </span>
    );
  }
  if (log.diff && typeof log.diff === 'object') {
    // Check if this was an Approval action
    const isApproval = log.diff?.approval_status?.new === 'Approved' || (log.diff?.approved_by && log.diff?.approved_rate);
    if (isApproval) {
      const qty = log.diff?.approve_qty?.new || log.diff?.quantity?.new || '';
      const unit = log.diff?.approve_unit?.new || '';
      const rateNum = Number(log.diff?.approved_rate?.new);
      const rateStr = !isNaN(rateNum) && rateNum > 0 ? `₹${rateNum.toLocaleString('en-IN')}` : '';
      const rawVendor = log.diff?.approved_vendor_id?.new || log.diff?.vendor_id?.new;
      const vendorName = rawVendor ? resolveEntityName(rawVendor, 'vendor_id', masterCache) : null;
      const rawBy = log.diff?.approved_by?.new;
      const byName = rawBy ? resolveEntityName(rawBy, 'approved_by', masterCache) : log.user_name;

      return (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} />
            Approved{qty ? `: ${qty} ${unit}` : ''} {rateStr ? `@ ${rateStr}` : ''}
          </span>
          {vendorName && (
            <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md text-xs border border-slate-200 text-slate-700">
              <span className="text-slate-400 font-normal">Vendor:</span> <strong className="text-slate-800">{vendorName}</strong>
            </span>
          )}
          {byName && (
            <span className="text-xs text-slate-500">
              By: <span className="font-semibold text-slate-700">{byName}</span>
            </span>
          )}
        </div>
      );
    }

    const IGNORE_FIELDS = new Set([
      'sales_qty', 'converted_value', 'updated_at', 'created_at', 'is_deleted',
      'approve_unit_qty', 'approved_remarks'
    ]);
    const entries = Object.entries(log.diff).filter(([k, val]) => {
      if (IGNORE_FIELDS.has(k)) return false;
      if ((val?.old == null || val?.old === '') && (val?.new == null || val?.new === '')) return false;
      if (val?.old === val?.new) return false;

      // Zero-ID rule: Suppress unresolvable IDs from pills
      if (val?.new && isUUID(String(val.new)) && !resolveEntityName(String(val.new), k, masterCache)) {
        return false;
      }
      return true;
    });

    if (entries.length > 0) {
      const visibleEntries = entries.slice(0, 2);
      const hiddenCount = entries.length - visibleEntries.length;

      return (
        <div className="flex items-center gap-2 flex-wrap">
          {visibleEntries.map(([key, val]) => {
            const fieldLabel = key.replace(/_/g, ' ');
            const isAmount = key.includes('amount') || key.includes('price') || key.includes('rate');
            const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
            const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
            const formatVal = (v) => {
              if (v === null || v === undefined || v === '') return '—';
              const str = String(v).trim();
              if (isUUID(str)) {
                return resolveEntityName(str, key, masterCache) || '—';
              }
              if (isAmount && !isNaN(Number(v))) {
                return `₹${Number(v).toLocaleString('en-IN')}`;
              }
              if (isIsoDate(str)) {
                try {
                  const d = new Date(str);
                  if (!isNaN(d.getTime())) return format(d, 'dd/MM/yyyy hh:mm a');
                } catch {}
              }
              if (isDateOnly(str)) {
                const parts = str.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
              }
              return String(v);
            };

            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg text-xs border border-slate-200 shadow-2xs whitespace-nowrap"
              >
                <span className="capitalize font-semibold text-slate-700">{fieldLabel}:</span>
                <span className="line-through text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 font-mono text-[11px]">
                  {formatVal(val?.old)}
                </span>
                <span className="text-slate-400 font-bold">→</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70 font-mono text-[11px]">
                  {formatVal(val?.new)}
                </span>
              </span>
            );
          })}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(log);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
              title="Click to view all modifications"
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      );
    }
  }
  return <span className="text-slate-700 font-medium text-xs truncate block max-w-xl">{formatSummaryText(log.summary, masterCache)}</span>;
};

const TransactionHistory = () => {
  // State
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [isMissingTable, setIsMissingTable] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selected Log for detail modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [masterCache, setMasterCache] = useState({ users: {}, vendors: {}, godowns: {}, customers: {}, loaded: false });

  // Load master entity cache for name resolution
  useEffect(() => {
    getMasterEntityCache().then(cache => {
      if (cache) setMasterCache({ ...cache });
    });
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load KPI stats
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const data = await fetchAuditStats();
    if (data) setStats(data);
    setStatsLoading(false);
  }, []);

  // Load Audit Logs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs({
        page,
        pageSize,
        module: selectedModule,
        action: selectedAction,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        search: debouncedSearch,
      });

      if (res.isMissingTable) {
        setIsMissingTable(true);
        setLogs([]);
        setTotalCount(0);
      } else {
        setIsMissingTable(false);
        setLogs(res.data);
        setTotalCount(res.count);
      }
    } catch (err) {
      console.error('Failed to load transaction history:', err);
      toast.error('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedModule, selectedAction, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Date Presets
  const handlePresetDate = (days) => {
    setPage(1);
    if (days === 0) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (days > 0) {
      const fromStr = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const toStr = format(new Date(), 'yyyy-MM-dd');
      setDateFrom(fromStr);
      setDateTo(toStr);
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedModule('all');
    setSelectedAction('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Export to Excel
  const handleExport = async () => {
    if (logs.length === 0) {
      toast.error('No transaction records to export');
      return;
    }
    const toastId = toast.loading('Generating Excel export...');
    try {
      await exportAuditLogsToExcel(logs);
      toast.success('Transaction history exported successfully', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export transaction history', { id: toastId });
    }
  };

  // Open Log Details Modal
  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setModalOpen(true);
  };

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  // Dropdown options
  const moduleOptions = useMemo(
    () => AUDIT_MODULES.map((m) => ({ value: m.id, label: m.label })),
    []
  );

  const actionOptions = useMemo(
    () => AUDIT_ACTIONS.map((a) => ({ value: a.id, label: a.label })),
    []
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16 w-full max-w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm">
              <History size={22} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                Transaction History
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                Audit trail and activity log of all record creations, edits, and deletions across VPR Systems.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 px-3 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading || logs.length === 0}
            className="h-9 px-3 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <Download size={15} />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Database Setup Notice if table does not exist */}
      {isMissingTable && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle size={22} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Database Migration Pending
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-semibold">system_audit_logs</code> table
                and triggers have been created in the migration script. Please run{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-semibold">
                  supabase/migrations/20261031_create_system_audit_logs.sql
                </code>{' '}
                in your Supabase SQL Editor to start logging transactions automatically.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText('supabase/migrations/20261031_create_system_audit_logs.sql');
              setCopiedSql(true);
              toast.success('Migration file path copied to clipboard');
              setTimeout(() => setCopiedSql(false), 2000);
            }}
            className="h-8 text-xs gap-1.5 bg-white border-amber-300 hover:bg-amber-100 text-amber-900 shrink-0"
          >
            {copiedSql ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copiedSql ? 'Copied Path' : 'Copy File Path'}
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Today's Activity
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {statsLoading ? '—' : stats?.todayTotal?.toLocaleString('en-IN') ?? 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 text-slate-600 border border-slate-100">
            <Activity size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
              Created Today
            </p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {statsLoading ? '—' : stats?.todayCreate?.toLocaleString('en-IN') ?? 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
              Edited Today
            </p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {statsLoading ? '—' : stats?.todayEdit?.toLocaleString('en-IN') ?? 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Edit3 size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-rose-600 uppercase tracking-wider">
              Deleted Today
            </p>
            <p className="text-2xl font-bold text-rose-700 mt-1">
              {statsLoading ? '—' : stats?.todayDelete?.toLocaleString('en-IN') ?? 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
            <Trash2 size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <Input
              type="text"
              placeholder="Search by order no, dispatch no, user name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-sm border-slate-200 focus:border-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Module Dropdown */}
          <div>
            <Dropdown
              value={selectedModule}
              onValueChange={(val) => {
                setSelectedModule(val);
                setPage(1);
              }}
              placeholder="Filter by Module"
              options={moduleOptions}
              className="h-10 text-sm border-slate-200"
            />
          </div>

          {/* Action Dropdown */}
          <div>
            <Dropdown
              value={selectedAction}
              onValueChange={(val) => {
                setSelectedAction(val);
                setPage(1);
              }}
              placeholder="Filter by Action"
              options={actionOptions}
              className="h-10 text-sm border-slate-200"
            />
          </div>

          {/* Quick Clear / Reset */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="h-10 w-full text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Reset Filters
            </Button>
          </div>
        </div>

        {/* Date Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1 flex items-center gap-1">
              <Calendar size={13} />
              Date Presets:
            </span>
            <Button
              variant={dateFrom === format(new Date(), 'yyyy-MM-dd') && dateTo === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePresetDate(0)}
              className="h-7 px-2.5 text-xs rounded-lg border-slate-200"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetDate(7)}
              className="h-7 px-2.5 text-xs rounded-lg border-slate-200"
            >
              Last 7 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetDate(30)}
              className="h-7 px-2.5 text-xs rounded-lg border-slate-200"
            >
              Last 30 Days
            </Button>
            <Button
              variant={!dateFrom && !dateTo ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePresetDate(-1)}
              className="h-7 px-2.5 text-xs rounded-lg border-slate-200"
            >
              All Time
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-36">
              <DatePicker
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                placeholder="From Date"
                className="h-8 text-xs border-slate-200"
              />
            </div>
            <span className="text-xs text-slate-400">to</span>
            <div className="w-36">
              <DatePicker
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                placeholder="To Date"
                className="h-8 text-xs border-slate-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <TableScrollSync className="min-h-[400px]">
          <table className="w-full min-w-[1100px] text-left border-collapse text-xs">
            <thead className="bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 sticky top-0 z-10 shadow-2xs">
              <tr className="text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-14 text-center">Details</th>
                <th className="py-3.5 px-4 w-48 whitespace-nowrap">Date & Time</th>
                <th className="py-3.5 px-4 w-40 whitespace-nowrap">User</th>
                <th className="py-3.5 px-4 w-28 whitespace-nowrap">Action</th>
                <th className="py-3.5 px-4 w-32 whitespace-nowrap">Module</th>
                <th className="py-3.5 px-4 w-40 whitespace-nowrap">Stage / Entity</th>
                <th className="py-3.5 px-4 min-w-[240px] whitespace-nowrap">Record Ref</th>
                <th className="py-3.5 px-4 w-full min-w-[340px]">Change Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RotateCw size={24} className="animate-spin text-blue-600" />
                      <span className="text-sm font-medium">Loading transaction records...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="p-3 rounded-full bg-slate-100 text-slate-400">
                        <History size={26} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">No transactions recorded yet</span>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {debouncedSearch || selectedModule !== 'all' || selectedAction !== 'all' || dateFrom || dateTo
                          ? 'No results match your active filters. Try resetting the filters.'
                          : 'Transactions will automatically appear here whenever records are created, edited, or deleted.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actionCfg = ACTION_CONFIG[log.action] || {
                    label: log.action,
                    pill: 'bg-slate-100 text-slate-700 border-slate-200',
                    icon: History,
                  };
                  const stageBadge = getStageBadge(log);
                  const ActionIcon = actionCfg.icon;
                  const formattedTime = log.created_at
                    ? format(new Date(log.created_at), 'dd/MM/yyyy hh:mm a')
                    : '—';

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetails(log)}
                    >
                      {/* View Details Action Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(log);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View Changes & Details"
                        >
                          <Eye size={16} />
                        </button>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-mono font-medium">
                        {formattedTime}
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {(log.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-800 truncate max-w-[120px]">
                            {log.user_name || 'System'}
                          </span>
                        </div>
                      </td>

                      {/* Action Pill */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${actionCfg.pill}`}
                        >
                          <ActionIcon size={12} />
                          {actionCfg.label}
                        </span>
                      </td>

                      {/* Module */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-700">
                        {log.module}
                      </td>

                      {/* Stage / Entity Pill */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${stageBadge.pill}`}
                          title={`Table: ${log.table_name || '—'}`}
                        >
                          {stageBadge.label}
                        </span>
                      </td>

                      {/* Record Ref */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-blue-600" title={log.record_ref || log.record_id}>
                        {formatRecordRef(log.record_ref, log.table_name)}
                      </td>

                      {/* Summary with Smart Renderer */}
                      <td className="py-3.5 px-4">
                        {renderChangeSummary(log, masterCache, handleViewDetails)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollSync>

        {/* Pagination & Page Size Control */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-100 gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>records per page</span>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalCount}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        log={selectedLog}
      />
    </div>
  );
};

export default TransactionHistory;
