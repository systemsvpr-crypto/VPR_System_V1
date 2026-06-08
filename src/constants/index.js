export const USER_ROLES = ['SUPER ADMIN', 'ADMIN', 'USER'];

export const GENDERS = ['Male', 'Female', 'Other'];

export const PAGES = [
    { id: 'live-stock-dashboard', label: 'Live Stock Dashboard' },
    { id: 'stock-list', label: 'Stock List' },
    { id: 'stock-management', label: 'Stock Management' },
    { id: 'master', label: 'Master' },
    { id: 'sales', label: 'Sales' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'settings', label: 'Settings' },
    { id: 'my-profile', label: 'My Profile' },
];

export const DEFAULT_USER_PAGES = ['my-profile'];

export const PAGE_TABS = {
  master: [
    { id: 'products', label: 'Products' },
    { id: 'godowns', label: 'Godowns' },
    { id: 'customers', label: 'Customers' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'transporters', label: 'Transporters' },
    { id: 'product-grouping', label: 'Product Grouping' },
  ],
  sales: [
    { id: 'orders', label: 'Orders' },
    { id: 'dispatch-planning', label: 'Dispatch Planning' },
    { id: 'inform-before-dispatch', label: 'Inform Before Dispatch' },
    { id: 'dispatch-completed', label: 'Dispatch Completed' },
    { id: 'inform-after-dispatch', label: 'Inform After Dispatch' },
  ],
};
