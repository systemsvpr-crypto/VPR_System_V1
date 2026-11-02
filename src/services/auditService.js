import { supabase } from '../supabase';
import { startOfDay, endOfDay } from 'date-fns';
import ExcelJS from 'exceljs';

/**
 * Service to manage and query System-Wide Transaction History & Audit Trail.
 * Designed for high performance and zero system slowdown.
 */

export const AUDIT_MODULES = [
  { id: 'all', label: 'All Modules' },
  { id: 'Sales', label: 'Sales' },
  { id: 'Purchase', label: 'Purchase' },
  { id: 'Stock Management', label: 'Stock Management' },
  { id: 'Master', label: 'Master Data' },
  { id: 'Global Settings', label: 'Global Settings' },
];

export const AUDIT_ACTIONS = [
  { id: 'all', label: 'All Actions' },
  { id: 'CREATE', label: 'Created' },
  { id: 'EDIT', label: 'Edited' },
  { id: 'DELETE', label: 'Deleted' },
];

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

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export const masterEntityCache = {
  users: {},
  vendors: {},
  godowns: {},
  customers: {},
  products: {},
  loaded: false,
};

export const getMasterEntityCache = async () => {
  if (masterEntityCache.loaded) return masterEntityCache;
  try {
    const [uRes, vRes, gRes, cRes, pRes] = await Promise.all([
      supabase.from('users').select('user_id, full_name, username'),
      supabase.from('vendors').select('vendor_id, name'),
      supabase.from('godowns').select('godown_id, name'),
      supabase.from('customers').select('customer_id, name'),
      supabase.from('products').select('product_id, name'),
    ]);

    (uRes.data || []).forEach((u) => {
      masterEntityCache.users[u.user_id] = u.full_name || u.username;
    });
    (vRes.data || []).forEach((v) => {
      masterEntityCache.vendors[v.vendor_id] = v.name;
    });
    (gRes.data || []).forEach((g) => {
      masterEntityCache.godowns[g.godown_id] = g.name;
    });
    (cRes.data || []).forEach((c) => {
      masterEntityCache.customers[c.customer_id] = c.name;
    });
    (pRes.data || []).forEach((p) => {
      masterEntityCache.products[p.product_id] = p.name;
    });
    masterEntityCache.loaded = true;
  } catch (err) {
    console.warn('Failed to load master entity cache for audit logs:', err);
  }
  return masterEntityCache;
};

export const resolveEntityName = (val, fieldName = '', cache = masterEntityCache) => {
  if (!val || typeof val !== 'string') return val;
  const str = String(val).trim();
  if (!isUUID(str)) return val;

  const key = fieldName.toLowerCase();

  // Field-targeted lookup
  if (key.includes('user') || key.includes('by') || key === 'approved_by') {
    if (cache.users && cache.users[str]) return cache.users[str];
  }
  if (key.includes('vendor') || key === 'approved_vendor_id') {
    if (cache.vendors && cache.vendors[str]) return cache.vendors[str];
  }
  if (key.includes('godown') || key === 'approved_godown_id') {
    if (cache.godowns && cache.godowns[str]) return cache.godowns[str];
  }
  if (key.includes('customer')) {
    if (cache.customers && cache.customers[str]) return cache.customers[str];
  }
  if (key.includes('product')) {
    if (cache.products && cache.products[str]) return cache.products[str];
  }

  // Cross-entity fallback lookup
  if (cache.users && cache.users[str]) return cache.users[str];
  if (cache.vendors && cache.vendors[str]) return cache.vendors[str];
  if (cache.godowns && cache.godowns[str]) return cache.godowns[str];
  if (cache.customers && cache.customers[str]) return cache.customers[str];
  if (cache.products && cache.products[str]) return cache.products[str];

  // Strict Zero-ID Policy: return null so unresolvable IDs are never rendered as raw numbers/hashes
  return null;
};


/**
 * Fetch paginated and filtered audit logs with exact row count.
 */
export const fetchAuditLogs = async ({
  page = 1,
  pageSize = 50,
  module = 'all',
  action = 'all',
  dateFrom = null,
  dateTo = null,
  search = '',
} = {}) => {
  try {
    let query = supabase
      .from('system_audit_logs')
      .select('*', { count: 'exact' })
      .or('action.neq.CREATE,table_name.not.in.(purchase_indents,sales_orders)');

    // Module filter
    if (module && module !== 'all') {
      query = query.eq('module', module);
    }

    // Action filter
    if (action && action !== 'all') {
      query = query.eq('action', action.toUpperCase());
    }

    // Date range filter
    if (dateFrom) {
      const fromIso = startOfDay(new Date(dateFrom)).toISOString();
      query = query.gte('created_at', fromIso);
    }
    if (dateTo) {
      const toIso = endOfDay(new Date(dateTo)).toISOString();
      query = query.lte('created_at', toIso);
    }

    // Text search on record_ref, user_name, or summary
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      query = query.or(
        `record_ref.ilike.%${cleanSearch}%,user_name.ilike.%${cleanSearch}%,summary.ilike.%${cleanSearch}%,stage.ilike.%${cleanSearch}%`
      );
    }

    // Server-side Range Pagination
    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(fromIndex, toIndex);

    const { data, count, error } = await query;

    if (error) {
      // Check if table has not been created yet in Supabase
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return {
          data: [],
          count: 0,
          isMissingTable: true,
          error: error.message,
        };
      }
      throw error;
    }

    return {
      data: data || [],
      count: count || 0,
      isMissingTable: false,
      error: null,
    };
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return {
      data: [],
      count: 0,
      isMissingTable: false,
      error: err.message || 'Failed to fetch transaction history',
    };
  }
};

/**
 * Fetch summary counts for today's KPI metrics
 */
export const fetchAuditStats = async () => {
  try {
    const todayStart = startOfDay(new Date()).toISOString();

    const { data, error } = await supabase
      .from('system_audit_logs')
      .select('action')
      .gte('created_at', todayStart);

    if (error) {
      if (error.code === 'PGRST205') return null;
      throw error;
    }

    const stats = {
      todayTotal: data.length,
      todayCreate: data.filter((d) => d.action === 'CREATE').length,
      todayEdit: data.filter((d) => d.action === 'EDIT').length,
      todayDelete: data.filter((d) => d.action === 'DELETE').length,
    };

    return stats;
  } catch (err) {
    console.warn('Could not fetch audit stats:', err);
    return null;
  }
};

/**
 * Export filtered audit logs to Excel
 */
export const exportAuditLogsToExcel = async (logs = []) => {
  if (!logs || logs.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transaction History');

  // Define columns
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Timestamp', key: 'created_at', width: 22 },
    { header: 'User Name', key: 'user_name', width: 20 },
    { header: 'Action', key: 'action', width: 14 },
    { header: 'Module', key: 'module', width: 18 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Entity', key: 'entity', width: 18 },
    { header: 'Table', key: 'table_name', width: 22 },
    { header: 'Reference', key: 'record_ref', width: 25 },
    { header: 'Summary', key: 'summary', width: 45 },
    { header: 'Changes Diff', key: 'diff', width: 40 },
  ];

  // Header style
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E3A8A' }, // Navy blue
  };

  // Add rows
  logs.forEach((log) => {
    let diffStr = '';
    if (log.diff && typeof log.diff === 'object') {
      diffStr = Object.entries(log.diff)
        .filter(([k]) => !['sales_qty', 'converted_value', 'updated_at', 'created_at', 'is_deleted'].includes(k))
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${JSON.stringify(v.old)} -> ${JSON.stringify(v.new)}`)
        .join('; ');
    }

    const entity = ENTITY_NAMES[log.table_name] || log.table_name?.replace(/_/g, ' ') || 'Record';
    let formattedRef = log.record_ref || '—';
    if (isUUID(formattedRef)) {
      formattedRef = `${entity} #${formattedRef.slice(0, 8)}`;
    }

    worksheet.addRow({
      id: log.id,
      created_at: new Date(log.created_at).toLocaleString('en-IN'),
      user_name: log.user_name || 'System',
      action: log.action,
      module: log.module,
      stage: log.stage || '—',
      entity,
      table_name: log.table_name,
      record_ref: formattedRef,
      summary: log.summary || '—',
      diff: diffStr || '—',
    });
  });

  // Auto filter
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 11 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `VPR_Transaction_History_${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};
