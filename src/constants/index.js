export const USER_ROLES = ['SUPER ADMIN', 'ADMIN', 'USER'];

export const GENDERS = ['Male', 'Female', 'Other'];

export const PAGES = [
    { id: 'live-stock-dashboard', label: 'Live Stock Dashboard' },
    { id: 'ultimate-ims', label: 'Ultimate IMS' },
    { id: 'stock-management', label: 'Stock Management' },
    { id: 'master', label: 'Master' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'sales', label: 'Sales' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'settings', label: 'Settings' },
    { id: 'my-profile', label: 'My Profile' },
];

export const DEFAULT_USER_PAGES = ['my-profile'];

export const PAGE_TABS = {
  'live-stock-dashboard': [
    { id: 'live', label: 'Godown Live Stock' },
    { id: 'transport', label: 'Transport Godown Stock' },
    { id: 'vendor', label: 'Vendor Dashboard' },
    { id: 'sales', label: 'Sales Dashboard' },
  ],
  master: [
    { id: 'products', label: 'Products' },
    { id: 'godowns', label: 'Godowns' },
    { id: 'customers', label: 'Customers' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'transporters', label: 'Transporters' },
    { id: 'product-grouping', label: 'Product Grouping' },
    { id: 'ranks', label: 'Ranks' },
  ],
  sales: [
    { id: 'orders', label: 'Orders' },
    { id: 'smart-dispatch', label: 'Smart Dispatch Planning' },
    { id: 'dispatch-planning', label: 'Dispatch Planning' },
    { id: 'dispatch-completed', label: 'Dispatch Completed' },
    { id: 'inform-after-dispatch', label: 'Inform After Dispatch' },
    { id: 'skip-delivered', label: 'Skip Delivered' },
  ],
  purchase: [
    { id: 'indent', label: 'Indent' },
    { id: 'vendor-selection', label: 'Vendor Approval' },
    { id: 'in-transit', label: 'Delivery' },
    { id: 'aawak-details', label: 'Aawak Details' },
    { id: 'purchase-complete', label: 'Purchase Dashboard' },
  ],
  // Checklist sub-pages show as their own sidebar entries; `path` is the
  // route under /checklist. Ids match the module's usePagePermission ids.
  checklist: [
    { id: 'checklist_dashboard', label: 'Dashboard', path: 'admin' },
    { id: 'checklist_quick_task', label: 'Task Management', path: 'quick-task' },
    { id: 'checklist_assign_task', label: 'Assign Task', path: 'assign-task' },
    { id: 'checklist_delegation', label: 'Delegation', path: 'delegation' },
    { id: 'checklist_task', label: 'Task', path: 'task' },
    { id: 'checklist_calendar', label: 'Calendar', path: 'calendar' },
    { id: 'checklist_holiday', label: 'Holiday List', path: 'holiday-list' },
    { id: 'checklist_working_day', label: 'Working Day Calendar', path: 'working-day-calendar' },
    { id: 'checklist_approval', label: 'Admin Approval', path: 'admin-approval' },
  ],
};
