import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatQty } from '@/lib/qty';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const humanize = (key) => key
  .replace(/_id$/, '')
  .split('_')
  .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
  .join(' ');

const formatDateTime = (value) => {
  try { return format(new Date(value), 'dd/MM/yyyy, hh:mm a'); } catch { return String(value); }
};

const formatDate = (value) => {
  try { return format(new Date(value), 'dd/MM/yyyy'); } catch { return String(value); }
};

// Raw jsonb snapshot → displayable [label, value] pairs. Ids that point at a
// known godown/vendor are shown by name; any other bare uuid (internal keys)
// is left out, as are empty values and nested objects.
const toFields = (data, { godowns, vendors }) => {
  if (!data || typeof data !== 'object') return [];
  const godownName = (id) => godowns.find(g => String(g.godown_id) === String(id))?.name;
  const vendorName = (id) => vendors.find(v => String(v.vendor_id) === String(id))?.name;

  return Object.entries(data).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === '' || typeof value === 'object') return [];
    let display = value;
    if (typeof value === 'string' && UUID_RE.test(value)) {
      const name = key.includes('godown') ? godownName(value) : key.includes('vendor') ? vendorName(value) : null;
      if (!name) return [];
      display = name;
    } else if (typeof value === 'boolean') {
      display = value ? 'Yes' : 'No';
    } else if (typeof value === 'string' && DATE_TIME_RE.test(value)) {
      display = formatDateTime(value);
    } else if (typeof value === 'string' && DATE_ONLY_RE.test(value)) {
      display = formatDate(value);
    }
    return [[humanize(key), String(display)]];
  });
};

const Section = ({ title, fields }) => {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {title}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 px-4 py-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] text-slate-400 font-medium">{label}</dt>
            <dd className="text-sm text-slate-800 font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const DeletedIndentDetailsModal = ({ record, onClose, godowns = [], vendors = [] }) => {
  const lookups = { godowns, vendors };
  const r = record || {};
  const unit = r.product_unit || r.product_data?.unit || '';

  const summary = [
    ['Deleted On', r.deleted_at ? formatDateTime(r.deleted_at) : '—'],
    ['Deleted By', r.deleted_by_name || '—'],
    ['What Was Deleted', r.delete_type === 'remainder' ? 'Pending remainder only (dispatched lifts kept)' : 'Whole item'],
    ['Deleted Qty', `${formatQty(r.deleted_qty)} ${unit}`.trim()],
    ['Indent No.', r.indent_number || '—'],
    ['Indent Date', r.indent_date ? formatDate(r.indent_date) : '—'],
    ['Product', r.product_name || '—'],
    ['Vendor', r.vendor_name || '—'],
    ['Rate', r.rate != null ? `₹${r.rate}` : '—'],
    ['Indent Type', r.process_type ? humanize(r.process_type) : '—'],
  ];

  return (
    <Modal open={!!record} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={16} className="text-red-600" />
          </div>
          <div>
            <ModalTitle className="text-base font-semibold text-slate-900">
              Deleted Indent — {r.indent_number || '—'}
            </ModalTitle>
            <p className="text-xs text-slate-500">{r.product_name || ''}</p>
          </div>
        </ModalHeader>
        <ModalBody>
          {!r.item_data && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              This item was deleted before full details were being saved, so only the summary is available.
            </p>
          )}
          <Section title="Deletion Summary" fields={summary} />
          <Section title="Indent Item" fields={toFields(r.item_data, lookups)} />
          <Section title="Indent" fields={toFields(r.indent_data, lookups)} />
          <Section title="Product" fields={toFields(r.product_data, lookups)} />
          <Section title="Vendor" fields={toFields(r.vendor_data, lookups)} />
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DeletedIndentDetailsModal;
