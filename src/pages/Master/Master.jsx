import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Package, Warehouse, Users, Building2, Truck, FolderTree, Plus, FileSpreadsheet, Award, PackagePlus, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllGodowns, getAllProducts, getAllProductStock, toggleGodownStatus, deleteGodown } from '../../services/masterService';
import { getAllCustomers, bulkImportCustomers } from '../../services/customerService';
import { getAllVendors, bulkImportVendors } from '../../services/vendorService';
import { getAllTransporters, bulkImportTransporters } from '../../services/transporterService';
import { getAllGroups, deleteGroup } from '../../services/productGroupingService';
import { getAllRanks, deleteRank } from '../../services/rankService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/Select';

import ProductModal from './components/ProductModal';
import ProductTable from './components/ProductTable';
import GodownModal from './components/GodownModal';
import GodownTable from './components/GodownTable';
import BulkImportModal from './components/BulkImportModal';
import BulkImportOpeningStockModal from './components/BulkImportOpeningStockModal';
import CustomerTable from './components/CustomerTable';
import CustomerModal from './components/CustomerModal';
import VendorTable from './components/VendorTable';
import VendorModal from './components/VendorModal';
import TransporterTable from './components/TransporterTable';
import TransporterModal from './components/TransporterModal';
import GroupTable from './components/ProductGrouping/GroupTable';
import { TabSwitcher } from '@/components/StandardButtons';
import GroupModal from './components/ProductGrouping/GroupModal';
import BulkImportEntityModal, { CUSTOMER_CONFIG, VENDOR_CONFIG, TRANSPORTER_CONFIG } from './components/BulkImportEntityModal';
import RankTable from './components/RankTable';
import RankModal from './components/RankModal';

const TABS = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'godowns', label: 'Godowns', icon: Warehouse },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'vendors', label: 'Vendors', icon: Building2 },
  { id: 'transporters', label: 'Transporters', icon: Truck },
  { id: 'product-grouping', label: 'Product Grouping', icon: FolderTree },
  { id: 'ranks', label: 'Ranks', icon: Award },
];

// Select dropdown with a search box pinned above the options — for filters with long lists.
const FilterSelect = ({ value, onValueChange, options, placeholder, label, allLabel }) => {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef(null);

  const filteredOptions = useMemo(() => (
    options.filter(o => o.name?.toLowerCase().includes(search.toLowerCase()))
  ), [options, search]);

  return (
    <Select value={value} onValueChange={onValueChange}
      onOpenChange={(open) => { if (!open) setSearch(''); }}>
      <SelectTrigger className="w-full h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent onOpenAutoFocus={(e) => { e.preventDefault(); searchInputRef.current?.focus(); }}>
        <div className="sticky top-0 z-10 bg-popover p-1.5 border-b border-slate-100"
          onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
            <input ref={searchInputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full h-7 pl-6 pr-2 text-xs rounded-md border border-slate-200 outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary" />
          </div>
        </div>
        <SelectGroup>
          <SelectLabel>{label}</SelectLabel>
          <SelectItem value="all">{allLabel}</SelectItem>
          {filteredOptions.map(o => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-slate-400">No matches found</div>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};


const Master = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'products';
  const setActiveTab = (tab) => setSearchParams({ tab });
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [allStock, setAllStock] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [godownModalOpen, setGodownModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [openingStockImportOpen, setOpeningStockImportOpen] = useState(false);
  const [entityImportType, setEntityImportType] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [transporterModalOpen, setTransporterModalOpen] = useState(false);
  const [rankModalOpen, setRankModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [editingTransporter, setEditingTransporter] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingRank, setEditingRank] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [godownFilter, setGodownFilter] = useState('all');
  const [transporterFilter, setTransporterFilter] = useState('all');
  const [groupingFilter, setGroupingFilter] = useState('all');
  const [godownTypeFilter, setGodownTypeFilter] = useState('Own');
  const [customerRankFilter, setCustomerRankFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.master;
    if (!allowedTabs || allowedTabs.length === 0) return [];
    return TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user]);

  const ownGodowns = useMemo(() => (
    godowns.filter(g => (g.godown_type || 'Own') === 'Own')
  ), [godowns]);

  const transporterGodowns = useMemo(() => (
    godowns.filter(g => g.godown_type === 'Transporter')
  ), [godowns]);

  // group_id -> group_name, straight from product_groups — the Products
  // table's Grouping column and filter both read the actual stored group a
  // product is linked to, not a re-derived Brand+Category string (the two
  // can drift apart once a group's name is edited, or casing gets
  // normalized on save).
  const groupNameMap = useMemo(() => {
    const map = {};
    groups.forEach(g => { map[g.group_id] = g.group_name; });
    return map;
  }, [groups]);

  // Groupings actually in use by at least one product, for the Grouping
  // filter dropdown — sorted alphabetically, products with no group_id yet
  // excluded since "no grouping" isn't a useful filter option.
  const productGroupings = useMemo(() => {
    const seen = new Map();
    products.forEach(p => {
      const name = p.group_id && groupNameMap[p.group_id];
      if (name && !seen.has(p.group_id)) seen.set(p.group_id, name);
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, groupNameMap]);

  const stockMap = useMemo(() => {
    const map = {};
    for (const s of allStock) {
      if (!map[s.product_id]) map[s.product_id] = [];
      const godown = godowns.find(g => g.godown_id === s.godown_id);
      if (godown) {
        map[s.product_id].push({ godown_name: godown.name, godown_id: s.godown_id, current_stock: s.current_stock ?? 0 });
      }
    }
    return map;
  }, [allStock, godowns]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = products.filter(p => {
      if (!term) return true;
      const groupName = p.group_id ? (groupNameMap[p.group_id] || '') : '';
      const stocks = stockMap[p.product_id] || [];
      const godownNames = stocks.map(s => s.godown_name).join(' ');
      const createdDate = p.created_at ? (() => {
        try { return format(new Date(p.created_at), 'dd/MM/yyyy'); } catch { return ''; }
      })() : '';

      return (
        p.name?.toLowerCase().includes(term) ||
        p.unit?.toLowerCase().includes(term) ||
        p.product_type?.toLowerCase().includes(term) ||
        p.brand_name?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.mux?.toLowerCase().includes(term) ||
        p.hsn_code?.toLowerCase().includes(term) ||
        p.sku?.toLowerCase().includes(term) ||
        p.product_code?.toLowerCase().includes(term) ||
        groupName.toLowerCase().includes(term) ||
        godownNames.toLowerCase().includes(term) ||
        createdDate.includes(term)
      );
    });
    if (godownFilter !== 'all') {
      result = result.filter(p =>
        allStock.some(s => s.product_id === p.product_id && s.godown_id === godownFilter)
      );
    }
    if (transporterFilter !== 'all') {
      result = result.filter(p =>
        allStock.some(s => s.product_id === p.product_id && s.godown_id === transporterFilter)
      );
    }
    if (groupingFilter !== 'all') {
      result = result.filter(p => p.group_id === groupingFilter);
    }
    return result;
  }, [products, searchTerm, godownFilter, transporterFilter, groupingFilter, allStock, groupNameMap, stockMap]);

  const filteredGodowns = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return godowns.filter(g => {
      const matchType = (g.godown_type || 'Own') === godownTypeFilter;
      if (!matchType) return false;
      if (!term) return true;
      const statusText = g.is_active ? 'active' : 'inactive';
      return (
        g.name?.toLowerCase().includes(term) ||
        g.godown_type?.toLowerCase().includes(term) ||
        g.location?.toLowerCase().includes(term) ||
        g.address?.toLowerCase().includes(term) ||
        g.contact_person?.toLowerCase().includes(term) ||
        g.phone?.toLowerCase().includes(term) ||
        g.phone_number?.toLowerCase().includes(term) ||
        g.contact_number?.toLowerCase().includes(term) ||
        g.remarks?.toLowerCase().includes(term) ||
        statusText.includes(term)
      );
    });
  }, [godowns, searchTerm, godownTypeFilter]);

  const rankNameMap = useMemo(() => {
    const map = {};
    ranks.forEach(r => { map[r.rank_id] = r.rank_name; });
    return map;
  }, [ranks]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = customers.filter(c => {
      if (!term) return true;
      const rankName = c.ranks?.rank_name || (c.rank_id ? rankNameMap[c.rank_id] : '') || '';
      return (
        c.name?.toLowerCase().includes(term) ||
        c.location?.toLowerCase().includes(term) ||
        c.phone_number?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.mobile?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.gst_number?.toLowerCase().includes(term) ||
        c.gst_no?.toLowerCase().includes(term) ||
        c.gstin?.toLowerCase().includes(term) ||
        c.pan_number?.toLowerCase().includes(term) ||
        c.pan_no?.toLowerCase().includes(term) ||
        c.address?.toLowerCase().includes(term) ||
        c.contact_person?.toLowerCase().includes(term) ||
        c.crm_follow_up?.toLowerCase().includes(term) ||
        c.customer_code?.toLowerCase().includes(term) ||
        rankName.toLowerCase().includes(term)
      );
    });
    if (customerRankFilter !== 'all') {
      result = result.filter(c => c.rank_id === customerRankFilter);
    }
    return result;
  }, [customers, searchTerm, customerRankFilter, rankNameMap]);

  const filteredVendors = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return vendors.filter(v => {
      if (!term) return true;
      return (
        v.name?.toLowerCase().includes(term) ||
        v.location?.toLowerCase().includes(term) ||
        v.phone_number?.toLowerCase().includes(term) ||
        v.phone?.toLowerCase().includes(term) ||
        v.email?.toLowerCase().includes(term) ||
        v.gst_number?.toLowerCase().includes(term) ||
        v.gst_no?.toLowerCase().includes(term) ||
        v.gstin?.toLowerCase().includes(term) ||
        v.pan_number?.toLowerCase().includes(term) ||
        v.pan_no?.toLowerCase().includes(term) ||
        v.address?.toLowerCase().includes(term) ||
        v.contact_person?.toLowerCase().includes(term) ||
        v.vendor_code?.toLowerCase().includes(term)
      );
    });
  }, [vendors, searchTerm]);

  const filteredTransporters = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return transporters.filter(t => {
      if (!term) return true;
      return (
        t.name?.toLowerCase().includes(term) ||
        t.vehicle_number?.toLowerCase().includes(term) ||
        t.driver_phone_number?.toLowerCase().includes(term) ||
        t.driver_phone?.toLowerCase().includes(term) ||
        t.driver_name?.toLowerCase().includes(term) ||
        t.phone_number?.toLowerCase().includes(term) ||
        t.phone?.toLowerCase().includes(term) ||
        t.contact_person?.toLowerCase().includes(term) ||
        t.location?.toLowerCase().includes(term) ||
        t.address?.toLowerCase().includes(term) ||
        t.transporter_code?.toLowerCase().includes(term)
      );
    });
  }, [transporters, searchTerm]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return groups.filter(g => {
      if (!term) return true;
      const matchGroupName = g.group_name?.toLowerCase().includes(term);
      const matchDescription = g.description?.toLowerCase().includes(term);
      const matchBrand = g.brand?.toLowerCase().includes(term);
      const matchCategory = g.category?.toLowerCase().includes(term);
      const matchProducts = g.allProducts?.some(p =>
        p.product_name?.toLowerCase().includes(term) ||
        p.name?.toLowerCase().includes(term)
      );
      return matchGroupName || matchDescription || matchBrand || matchCategory || matchProducts;
    });
  }, [groups, searchTerm]);

  const filteredRanks = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return ranks.filter(r => {
      if (!term) return true;
      const createdDate = r.created_at ? (() => {
        try { return format(new Date(r.created_at), 'dd/MM/yyyy'); } catch { return ''; }
      })() : '';
      return (
        r.rank_name?.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term) ||
        String(r.rank_id || '').toLowerCase().includes(term) ||
        createdDate.includes(term)
      );
    });
  }, [ranks, searchTerm]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const totalGodownPages = Math.max(1, Math.ceil(filteredGodowns.length / itemsPerPage));
  const totalCustomerPages = Math.max(1, Math.ceil(filteredCustomers.length / itemsPerPage));
  const totalVendorPages = Math.max(1, Math.ceil(filteredVendors.length / itemsPerPage));
  const totalTransporterPages = Math.max(1, Math.ceil(filteredTransporters.length / itemsPerPage));
  const totalGroupPages = Math.max(1, Math.ceil(filteredGroups.length / itemsPerPage));
  const totalRankPages = Math.max(1, Math.ceil(filteredRanks.length / itemsPerPage));

  const currentProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const currentGodowns = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredGodowns.slice(start, start + itemsPerPage);
  }, [filteredGodowns, currentPage, itemsPerPage]);

  const currentCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage, itemsPerPage]);

  const currentVendors = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredVendors.slice(start, start + itemsPerPage);
  }, [filteredVendors, currentPage, itemsPerPage]);

  const currentTransporters = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransporters.slice(start, start + itemsPerPage);
  }, [filteredTransporters, currentPage, itemsPerPage]);

  const currentGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredGroups.slice(start, start + itemsPerPage);
  }, [filteredGroups, currentPage, itemsPerPage]);

  const currentRanks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRanks.slice(start, start + itemsPerPage);
  }, [filteredRanks, currentPage, itemsPerPage]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setSearchTerm(''); }, [activeTab]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, godownFilter, transporterFilter, groupingFilter, godownTypeFilter, customerRankFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, g, s, c, v, t, gr, rk] = await Promise.all([
        getAllProducts(), getAllGodowns(), getAllProductStock(),
        getAllCustomers(), getAllVendors(), getAllTransporters(),
        getAllGroups(),
        // Falls back to empty rather than failing the whole page — lets
        // every other Master tab keep working even before the `ranks`
        // table migration has been run.
        getAllRanks().catch(() => []),
      ]);
      setProducts(p); setGodowns(g); setAllStock(s);
      setCustomers(c); setVendors(v); setTransporters(t);
      setGroups(gr); setRanks(rk);
    } catch (err) { toast.error('Failed to load data'); }
    setLoading(false);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductModalOpen(true);
  };

  const handleCloseProductModal = () => {
    setProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleToggleGodown = async (godown) => {
    try {
      await toggleGodownStatus(godown.godown_id, !godown.is_active);
      toast.success(`Godown ${godown.is_active ? 'deactivated' : 'activated'}`);
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerModalOpen(true);
  };

  const handleCloseCustomerModal = () => {
    setCustomerModalOpen(false);
    setEditingCustomer(null);
  };

  const handleEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setVendorModalOpen(true);
  };

  const handleCloseVendorModal = () => {
    setVendorModalOpen(false);
    setEditingVendor(null);
  };

  const handleEditTransporter = (transporter) => {
    setEditingTransporter(transporter);
    setTransporterModalOpen(true);
  };

  const handleCloseTransporterModal = () => {
    setTransporterModalOpen(false);
    setEditingTransporter(null);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setGroupModalOpen(true);
  };

  const handleCloseGroupModal = () => {
    setGroupModalOpen(false);
    setEditingGroup(null);
  };

  const handleDeleteGroup = async (group) => {
    if (!window.confirm(`Delete group "${group.group_name}"? This action cannot be undone.`)) return;
    try {
      await deleteGroup(group.group_id);
      toast.success('Group deleted');
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const handleEditRank = (rank) => {
    setEditingRank(rank);
    setRankModalOpen(true);
  };

  const handleCloseRankModal = () => {
    setRankModalOpen(false);
    setEditingRank(null);
  };

  const handleDeleteRank = async (rank) => {
    if (!window.confirm(`Delete rank "${rank.rank_name}"? This action cannot be undone.`)) return;
    try {
      await deleteRank(rank.rank_id);
      toast.success('Rank deleted');
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteGodown = async (godown) => {
    if (!window.confirm(`Delete godown "${godown.name}"? This action cannot be undone.`)) return;
    try {
      await deleteGodown(godown.godown_id);
      toast.success('Godown deleted');
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">

      {/* Tabs (Outer from table div) */}
      <div className="flex justify-center w-full shrink-0">
        <TabSwitcher
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={visibleTabs.map(tab => ({
            id: tab.id,
            label: <div className="flex items-center gap-2"><tab.icon size={15} /><span>{tab.label}</span></div>
          }))}
        />
      </div>

      <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0">

        {visibleTabs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Package size={32} className="text-slate-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-600 mb-1">No Tabs Available</h3>
            <p className="text-sm text-slate-400">You don't have access to any Master tabs. Contact your administrator.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Table UI Header matching Live Stock pages */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-white shrink-0">

              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  {(() => {
                    const ActiveIcon = visibleTabs.find(t => t.id === activeTab)?.icon || Package;
                    return <ActiveIcon size={18} />;
                  })()}
                </div>
                <h3 className="font-semibold text-slate-800 text-lg whitespace-nowrap">
                  {visibleTabs.find(t => t.id === activeTab)?.label || 'Master'}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto lg:justify-end">
                <div className="relative w-full sm:w-60 md:w-64 lg:w-72 shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={14} />
                  <Input
                    type="text"
                    placeholder={`Search ${visibleTabs.find(t => t.id === activeTab)?.label?.toLowerCase() || 'anything'}...`}
                    className="pl-8 pr-8 h-8 w-full text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {activeTab === 'products' && ownGodowns.length > 0 && (
                  <div className="w-36 shrink-0">
                    <FilterSelect
                      value={godownFilter}
                      onValueChange={setGodownFilter}
                      options={ownGodowns.map(g => ({ id: g.godown_id, name: g.name }))}
                      placeholder="All Godowns"
                      label="Filter by Godown"
                      allLabel="All Godowns"
                    />
                  </div>
                )}
                {activeTab === 'products' && transporterGodowns.length > 0 && (
                  <div className="w-36 shrink-0">
                    <FilterSelect
                      value={transporterFilter}
                      onValueChange={setTransporterFilter}
                      options={transporterGodowns.map(g => ({ id: g.godown_id, name: g.name }))}
                      placeholder="All Transporters"
                      label="Filter by Transporter"
                      allLabel="All Transporters"
                    />
                  </div>
                )}
                {activeTab === 'products' && productGroupings.length > 0 && (
                  <div className="w-36 shrink-0">
                    <FilterSelect
                      value={groupingFilter}
                      onValueChange={setGroupingFilter}
                      options={productGroupings}
                      placeholder="All Groupings"
                      label="Filter by Grouping"
                      allLabel="All Groupings"
                    />
                  </div>
                )}
                {activeTab === 'customers' && ranks.length > 0 && (
                  <div className="w-36 shrink-0">
                    <FilterSelect
                      value={customerRankFilter}
                      onValueChange={setCustomerRankFilter}
                      options={ranks.map(r => ({ id: r.rank_id, name: r.rank_name }))}
                      placeholder="All Ranks"
                      label="Filter by Rank"
                      allLabel="All Ranks"
                    />
                  </div>
                )}
                {activeTab === 'godowns' && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 w-fit shrink-0">
                    <button type="button" onClick={() => setGodownTypeFilter('Own')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all h-6 flex items-center ${godownTypeFilter === 'Own' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}>
                      Own
                    </button>
                    <button type="button" onClick={() => setGodownTypeFilter('Transporter')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all h-6 flex items-center ${godownTypeFilter === 'Transporter' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}>
                      Transporter
                    </button>
                  </div>
                )}
                {!loading && (
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    {['products', 'customers', 'vendors', 'transporters'].includes(activeTab) && (
                      <Button onClick={() => {
                        if (activeTab === 'products') setImportModalOpen(true);
                        else setEntityImportType(activeTab);
                      }} variant="outline" className="gap-2 px-3 h-8 text-sm font-medium shrink-0">
                        <FileSpreadsheet size={15} /><span>Import</span>
                      </Button>
                    )}
                    {activeTab === 'products' && (
                      <Button onClick={() => setOpeningStockImportOpen(true)} variant="outline" className="gap-2 px-3 h-8 text-sm font-medium shrink-0">
                        <PackagePlus size={15} /><span>Opening Stock</span>
                      </Button>
                    )}
                    {activeTab !== 'product-grouping' && !(activeTab === 'godowns' && godownTypeFilter === 'Transporter') && (
                      <Button onClick={() => {
                        if (activeTab === 'products') { setEditingProduct(null); setProductModalOpen(true); }
                        else if (activeTab === 'godowns') setGodownModalOpen(true);
                        else if (activeTab === 'customers') { setEditingCustomer(null); setCustomerModalOpen(true); }
                        else if (activeTab === 'vendors') { setEditingVendor(null); setVendorModalOpen(true); }
                        else if (activeTab === 'transporters') { setEditingTransporter(null); setTransporterModalOpen(true); }
                        else if (activeTab === 'ranks') { setEditingRank(null); setRankModalOpen(true); }
                      }} className="gap-2 px-3 h-8 text-sm font-medium shrink-0">
                        <Plus size={15} />
                        <span>Add {
                          activeTab === 'products' ? 'Product' :
                            activeTab === 'godowns' ? 'Godown' :
                              activeTab === 'customers' ? 'Customer' :
                                activeTab === 'vendors' ? 'Vendor' :
                                  activeTab === 'transporters' ? 'Transporter' :
                                    'Rank'
                        }</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0">
              {activeTab === 'products' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <ProductTable products={currentProducts} totalItems={filteredProducts.length} loading={loading} onEdit={handleEditProduct} searchTerm={searchTerm} stockMap={stockMap} groupNameMap={groupNameMap}
                    currentPage={currentPage} totalPages={totalProductPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
              {activeTab === 'godowns' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <GodownTable godowns={currentGodowns} totalItems={filteredGodowns.length} loading={loading} onToggle={handleToggleGodown} searchTerm={searchTerm} user={user} onDelete={handleDeleteGodown} typeFilter={godownTypeFilter}
                    currentPage={currentPage} totalPages={totalGodownPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
              {activeTab === 'customers' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <CustomerTable customers={currentCustomers} totalItems={filteredCustomers.length} loading={loading} onEdit={handleEditCustomer} searchTerm={searchTerm}
                    currentPage={currentPage} totalPages={totalCustomerPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage}
                    ranks={ranks} />
                </div>
              )}
              {activeTab === 'vendors' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <VendorTable vendors={currentVendors} totalItems={filteredVendors.length} loading={loading} onEdit={handleEditVendor} searchTerm={searchTerm}
                    currentPage={currentPage} totalPages={totalVendorPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
              {activeTab === 'transporters' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <TransporterTable transporters={currentTransporters} totalItems={filteredTransporters.length} loading={loading} onEdit={handleEditTransporter} searchTerm={searchTerm}
                    currentPage={currentPage} totalPages={totalTransporterPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
              {activeTab === 'product-grouping' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <GroupTable groups={currentGroups} totalItems={filteredGroups.length} loading={loading} onEdit={handleEditGroup} onDelete={handleDeleteGroup} searchTerm={searchTerm}
                    currentPage={currentPage} totalPages={totalGroupPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
              {activeTab === 'ranks' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <RankTable ranks={currentRanks} totalItems={filteredRanks.length} loading={loading} onEdit={handleEditRank} onDelete={handleDeleteRank} searchTerm={searchTerm}
                    currentPage={currentPage} totalPages={totalRankPages} itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ProductModal isOpen={productModalOpen} onClose={handleCloseProductModal}
        godowns={godowns} groups={groups} products={products} user={user} onSuccess={loadData} editingProduct={editingProduct} />
      <GodownModal isOpen={godownModalOpen} onClose={() => setGodownModalOpen(false)}
        onSuccess={loadData} />
      <BulkImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)}
        godowns={godowns} products={products} user={user} onSuccess={loadData} />
      <BulkImportOpeningStockModal isOpen={openingStockImportOpen} onClose={() => setOpeningStockImportOpen(false)}
        godowns={godowns} products={products} user={user} onSuccess={loadData} />
      <CustomerModal isOpen={customerModalOpen} onClose={handleCloseCustomerModal}
        onSuccess={loadData} editingCustomer={editingCustomer} user={user} ranks={ranks} />
      <VendorModal isOpen={vendorModalOpen} onClose={handleCloseVendorModal}
        onSuccess={loadData} editingVendor={editingVendor} user={user} />
      <TransporterModal isOpen={transporterModalOpen} onClose={handleCloseTransporterModal}
        onSuccess={loadData} editingTransporter={editingTransporter} user={user} godowns={godowns} />
      <GroupModal isOpen={groupModalOpen} onClose={handleCloseGroupModal}
        user={user} onSuccess={loadData} editingGroup={editingGroup} />
      <RankModal isOpen={rankModalOpen} onClose={handleCloseRankModal}
        onSuccess={loadData} editingRank={editingRank} />
      {entityImportType && (
        <BulkImportEntityModal
          isOpen={!!entityImportType}
          onClose={() => setEntityImportType(null)}
          onSuccess={loadData}
          config={
            entityImportType === 'customers' ? CUSTOMER_CONFIG :
              entityImportType === 'vendors' ? VENDOR_CONFIG :
                TRANSPORTER_CONFIG
          }
          importFn={
            entityImportType === 'customers' ? bulkImportCustomers :
              entityImportType === 'vendors' ? bulkImportVendors :
                bulkImportTransporters
          }
        />
      )}
    </div>
  );
};

export default Master;
