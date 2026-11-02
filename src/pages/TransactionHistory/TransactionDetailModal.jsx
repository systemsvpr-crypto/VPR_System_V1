import { resolveEntityName } from '../../services/auditService';
import React from 'react';
import { format } from 'date-fns';
import {
  History,
  User,
  Calendar,
  Layers,
  FileText,
  CheckCircle2,
  Edit3,
  Trash2,
} from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const ENTITY_NAMES = {
  sales_orders: 'Sales Order',
  sales_order_items: 'Order Item',
  dispatch_plans: 'Dispatch Plan',
  purchase_indents: 'Purchase Indent',
  purchase_indent_items: 'Indent Item',
  purchase_deliveries: 'Purchase Delivery',
  transactions: 'Stock Movement',
  products: 'Product',
  customers: 'Customer',
  godowns: 'Godown',
  vendors: 'Vendor',
  transporters: 'Transporter',
  users: 'User Account',
};

const formatEntityName = (tbl) => ENTITY_NAMES[tbl] || tbl?.replace(/_/g, ' ') || 'Record';

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
const isIsoDate = (str) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
const isDateOnly = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str);

const formatSummaryText = (text, cache) => {
  if (!text) return '—';
  let clean = text;
  // Replace UUIDs
  clean = clean.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => resolveEntityName(m, '', cache) || '');
  // Format ISO timestamps (e.g. 2026-10-31T09:44:20.925+00:00 -> 31/10/2026 03:14 PM)
  clean = clean.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, (iso) => {
    try {
      const d = new Date(iso);
      return !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy hh:mm a') : iso;
    } catch {
      return iso;
    }
  });
  // Format date-only (e.g. 2026-10-31 -> 31/10/2026)
  clean = clean.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
  return clean;
};

const formatRecordRef = (ref, tableName) => {
  if (!ref) return '—';
  if (isUUID(ref)) {
    return `${formatEntityName(tableName)} #${ref.slice(0, 8)}`;
  }
  return ref;
};

const formatValue = (val, key = '', cache = {}) => {
  if (val === null || val === undefined || val === '') {
    return <span className="text-slate-400 italic font-mono">—</span>;
  }
  if (typeof val === 'boolean') return <span className="font-mono">{val ? 'true' : 'false'}</span>;
  if (typeof val === 'object') return <span className="font-mono text-xs">{JSON.stringify(val)}</span>;

  const str = String(val).trim();

  // If value is a UUID, attempt to resolve to human name
  if (isUUID(str)) {
    const resolved = resolveEntityName(str, key, cache);
    if (resolved) return resolved;
    // Strict Zero-ID Policy: Never render raw hash or unresolvable ID
    return null;
  }

  // Format currencies
  if (key.includes('price') || key.includes('amount') || key.includes('rate')) {
    const num = Number(val);
    if (!isNaN(num)) return `₹${num.toLocaleString('en-IN')}`;
  }

  // Format ISO timestamps (e.g. 2026-10-31T09:44:20.925+00:00 -> 31/10/2026 03:14 PM)
  if (isIsoDate(str)) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return format(d, 'dd/MM/yyyy hh:mm a');
    } catch {
      // fallback
    }
  }

  // Format date-only (e.g. 2026-10-31 -> 31/10/2026)
  if (isDateOnly(str)) {
    const parts = str.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  return str;
};

const formatFieldName = (field) => {
  let clean = field;
  // Clean up ID suffixes so users see 'Approved Vendor' instead of 'Approved Vendor Id'
  if (clean.endsWith('_id') || clean.endsWith('Id')) {
    clean = clean.replace(/_id$/i, '').replace(/Id$/, '');
  }
  return clean
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const TransactionDetailModal = ({ open, onClose, log, masterCache = {} }) => {
  if (!log) return null;

  const formattedDate = log.created_at
    ? format(new Date(log.created_at), 'dd/MM/yyyy hh:mm:ss a')
    : '—';

  const actionPill = {
    CREATE: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      label: 'Record Created',
    },
    EDIT: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Edit3,
      label: 'Record Edited',
    },
    DELETE: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: Trash2,
      label: 'Record Deleted',
    },
  }[log.action] || {
    bg: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: History,
    label: log.action || 'Unknown',
  };

  const ActionIcon = actionPill.icon;
  const IGNORE_FIELDS = new Set([
    'sales_qty', 'converted_value', 'updated_at', 'created_at', 'is_deleted',
    'approve_unit_qty', 'approved_remarks', 'indent_qty', 'direct_indent_qty',
    'direct_indent_unit', 'reorder_unit', 'reorder_unit_qty'
  ]);

  const diffEntries = log.diff && typeof log.diff === 'object'
    ? Object.entries(log.diff).filter(([k, delta]) => {
        if (IGNORE_FIELDS.has(k)) return false;
        const oldEmpty = delta?.old == null || delta?.old === '';
        const newEmpty = delta?.new == null || delta?.new === '';
        if (oldEmpty && newEmpty) return false;
        if (delta?.old === delta?.new) return false;

        // If field value is an unresolvable ID, suppress from non-tech user view
        if (delta?.new && isUUID(String(delta.new)) && !resolveEntityName(String(delta.new), k, masterCache)) {
          return false;
        }
        return true;
      })
    : [];

  return (
    <Modal open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <ModalContent className="max-w-2xl">
        <ModalHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-xs">
              <History size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Transaction Audit Details
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${actionPill.bg}`}
                >
                  <ActionIcon size={12} />
                  {actionPill.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Log ID #{log.id} • {log.module} • {log.stage || formatEntityName(log.table_name)}
              </p>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <User size={13} className="text-slate-400" />
                <span>Performed By</span>
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {log.user_name || 'System'}
              </div>
              {log.user_id && (
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  ID: {log.user_id.slice(0, 8)}...
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Calendar size={13} className="text-slate-400" />
                <span>Date & Time</span>
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {formattedDate}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Layers size={13} className="text-slate-400" />
                <span>Stage / Entity</span>
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {log.stage ? `${log.stage} (${formatEntityName(log.table_name)})` : formatEntityName(log.table_name)}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <FileText size={13} className="text-slate-400" />
                <span>Record Ref</span>
              </div>
              <div className="text-sm font-bold text-blue-600 font-mono truncate" title={log.record_ref || log.record_id}>
                {formatRecordRef(log.record_ref, log.table_name)}
              </div>
            </div>
          </div>

          {/* Human Readable Summary */}
          {log.summary && (
            <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl">
              <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block mb-1">
                Summary of Action
              </span>
              <p className="text-sm text-slate-800 font-medium">
                {formatSummaryText(log.summary, masterCache)}
              </p>
            </div>
          )}

          {/* Field Changes Diff (For EDIT) */}
          {log.action === 'EDIT' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Field-Level Modifications ({diffEntries.length})
                </h4>
              </div>

              {diffEntries.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3.5 w-1/3">Field</th>
                        <th className="py-2.5 px-3.5 w-1/3 text-rose-700 bg-rose-50/40">Previous Value</th>
                        <th className="py-2.5 px-3.5 w-1/3 text-emerald-700 bg-emerald-50/40">Updated Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {diffEntries.map(([field, delta]) => (
                        <tr key={field} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-3.5 font-medium text-slate-800">
                            {formatFieldName(field)}
                          </td>
                          <td className="py-2.5 px-3.5 bg-rose-50/20 text-rose-800 line-through">
                            {formatValue(delta?.old, field, masterCache)}
                          </td>
                          <td className="py-2.5 px-3.5 bg-emerald-50/20 text-emerald-800 font-semibold">
                            {formatValue(delta?.new, field, masterCache)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg">
                  No individual field diff recorded for this update.
                </div>
              )}
            </div>
          )}

          {/* Record Snapshot (For CREATE or DELETE) */}
          {(log.action === 'CREATE' || log.action === 'DELETE') && log.full_data && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Record Snapshot ({log.action === 'CREATE' ? 'Created Attributes' : 'Deleted Attributes'})
              </h4>
              {(() => {
                const TECHNICAL_FIELDS = new Set([
                  'id', 'item_id', 'group_id', 'indent_id', 'order_id', 'order_item_id',
                  'plan_id', 'delivery_id', 'txn_id', 'customer_id', 'vendor_id', 'godown_id',
                  'transporter_id', 'user_id', 'created_by', 'updated_by', 'deleted_by',
                  'created_at', 'updated_at', 'deleted_at', 'is_deleted',
                  'approve_unit_qty', 'converted_value', 'sales_qty'
                ]);

                const snapshotEntries = Object.entries(log.full_data).filter(([k, val]) => {
                  if (TECHNICAL_FIELDS.has(k)) return false;
                  if (val === null || val === undefined || val === '') return false;
                  return true;
                });

                if (snapshotEntries.length === 0) {
                  return (
                    <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">
                      No additional business attributes recorded.
                    </div>
                  );
                }

                return (
                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 max-h-64 overflow-y-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      {snapshotEntries.map(([key, value]) => (
                        <div key={key} className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                          <span className="text-[11px] text-slate-400 font-medium block mb-0.5 truncate">
                            {formatFieldName(key)}
                          </span>
                          <span className="font-semibold text-slate-800 break-words block">
                            {formatValue(value, key, masterCache)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-200">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TransactionDetailModal;
