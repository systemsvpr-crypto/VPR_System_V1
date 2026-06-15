import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Package, Warehouse, Users, Building2, Truck, FolderTree, Plus, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllGodowns, getAllProducts, getAllProductStock, toggleGodownStatus } from '../../services/masterService';
import { getAllCustomers } from '../../services/customerService';
import { getAllVendors } from '../../services/vendorService';
import { getAllTransporters } from '../../services/transporterService';
import { getAllGroups, deleteGroup } from '../../services/productGroupingService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/Select';
import Pagination from '@/components/ui/pagination';
import ProductModal from './components/ProductModal';
import ProductTable from './components/ProductTable';
import GodownModal from './components/GodownModal';
import GodownTable from './components/GodownTable';
import BulkImportModal from './components/BulkImportModal';
import CustomerTable from './components/CustomerTable';
import CustomerModal from './components/CustomerModal';
import VendorTable from './components/VendorTable';
import VendorModal from './components/VendorModal';
import TransporterTable from './components/TransporterTable';
import TransporterModal from './components/TransporterModal';
import GroupTable from './components/ProductGrouping/GroupTable';
import GroupModal from './components/ProductGrouping/GroupModal';

const TABS = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'godowns', label: 'Godowns', icon: Warehouse },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'vendors', label: 'Vendors', icon: Building2 },
  { id: 'transporters', label: 'Transporters', icon: Truck },
  { id: 'product-grouping', label: 'Product Grouping', icon: FolderTree },
];

const ITEMS_PER_PAGE = 10;

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
  const [loading, setLoading] = useState(true);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [godownModalOpen, setGodownModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [transporterModalOpen, setTransporterModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [editingTransporter, setEditingTransporter] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [godownFilter, setGodownFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.master;
    if (!allowedTabs || allowedTabs.length === 0) return [];
    return TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user]);

  const filteredProducts = useMemo(() => {
    let result = products.filter(p =>
      p.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (godownFilter !== 'all') {
      result = result.filter(p =>
        allStock.some(s => s.product_id === p.product_id && s.godown_id === godownFilter)
      );
    }
    return result;
  }, [products, searchTerm, godownFilter, allStock]);

  const filteredGodowns = useMemo(() => {
    return godowns.filter(g =>
      g.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [godowns, searchTerm]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(term) ||
      c.location?.toLowerCase().includes(term) ||
      c.phone_number?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const filteredVendors = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return vendors.filter(v =>
      v.name?.toLowerCase().includes(term) ||
      v.location?.toLowerCase().includes(term) ||
      v.phone_number?.toLowerCase().includes(term) ||
      v.email?.toLowerCase().includes(term)
    );
  }, [vendors, searchTerm]);

  const filteredTransporters = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return transporters.filter(t =>
      t.name?.toLowerCase().includes(term) ||
      t.vehicle_number?.toLowerCase().includes(term) ||
      t.driver_phone_number?.toLowerCase().includes(term)
    );
  }, [transporters, searchTerm]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return groups.filter(g =>
      g.group_name?.toLowerCase().includes(term)
    );
  }, [groups, searchTerm]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const totalGodownPages = Math.max(1, Math.ceil(filteredGodowns.length / ITEMS_PER_PAGE));
  const totalCustomerPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE));
  const totalVendorPages = Math.max(1, Math.ceil(filteredVendors.length / ITEMS_PER_PAGE));
  const totalTransporterPages = Math.max(1, Math.ceil(filteredTransporters.length / ITEMS_PER_PAGE));
  const totalGroupPages = Math.max(1, Math.ceil(filteredGroups.length / ITEMS_PER_PAGE));

  const currentProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const currentGodowns = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGodowns.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGodowns, currentPage]);

  const currentCustomers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  const currentVendors = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVendors.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVendors, currentPage]);

  const currentTransporters = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransporters.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransporters, currentPage]);

  const currentGroups = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGroups.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGroups, currentPage]);

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

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, godownFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, g, s, c, v, t, gr] = await Promise.all([
        getAllProducts(), getAllGodowns(), getAllProductStock(),
        getAllCustomers(), getAllVendors(), getAllTransporters(),
        getAllGroups(),
      ]);
      setProducts(p); setGodowns(g); setAllStock(s);
      setCustomers(c); setVendors(v); setTransporters(t);
      setGroups(gr);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Master</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage products and godowns.</p>
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {visibleTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary translate-y-[1px]'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            <tab.icon size={18} />{tab.label}
          </button>
        ))}
      </div>

      {visibleTabs.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Package size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Tabs Available</h3>
          <p className="text-sm text-slate-400">You don't have access to any Master tabs. Contact your administrator.</p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
              <Input type="text" placeholder={`Search ${activeTab}...`} className="pl-9"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {activeTab === 'products' && godowns.length > 0 && (
              <div className="w-full md:w-48">
                <Select value={godownFilter} onValueChange={setGodownFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Godowns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Filter by Godown</SelectLabel>
                      <SelectItem value="all">All Godowns</SelectItem>
                      {godowns.map(g => (
                        <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {!loading && (
              <>
                {/* activeTab === 'products' && (
                  <Button onClick={() => setImportModalOpen(true)} variant="outline"
                    className="gap-2 px-4 font-medium">
                    <FileSpreadsheet size={20} /><span>Import</span>
                  </Button>
                ) */}
                <Button onClick={() => {
                  if (activeTab === 'products') { setEditingProduct(null); setProductModalOpen(true); }
                  else if (activeTab === 'godowns') setGodownModalOpen(true);
                  else if (activeTab === 'customers') { setEditingCustomer(null); setCustomerModalOpen(true); }
                  else if (activeTab === 'vendors') { setEditingVendor(null); setVendorModalOpen(true); }
                  else if (activeTab === 'transporters') { setEditingTransporter(null); setTransporterModalOpen(true); }
                  else if (activeTab === 'product-grouping') { setEditingGroup(null); setGroupModalOpen(true); }
                }} className="gap-2 px-4 font-medium">
                  <Plus size={20} /><span>Add {activeTab === 'product-grouping' ? 'Group' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1)}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'products' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <ProductTable products={currentProducts} totalItems={filteredProducts.length} loading={loading} onEdit={handleEditProduct} searchTerm={searchTerm} stockMap={stockMap} />
              {!loading && filteredProducts.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalProductPages} totalItems={filteredProducts.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'godowns' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <GodownTable godowns={currentGodowns} totalItems={filteredGodowns.length} loading={loading} onToggle={handleToggleGodown} searchTerm={searchTerm} />
              {!loading && filteredGodowns.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalGodownPages} totalItems={filteredGodowns.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredGodowns.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'customers' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <CustomerTable customers={currentCustomers} totalItems={filteredCustomers.length} loading={loading} onEdit={handleEditCustomer} searchTerm={searchTerm} />
              {!loading && filteredCustomers.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalCustomerPages} totalItems={filteredCustomers.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'vendors' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <VendorTable vendors={currentVendors} totalItems={filteredVendors.length} loading={loading} onEdit={handleEditVendor} searchTerm={searchTerm} />
              {!loading && filteredVendors.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalVendorPages} totalItems={filteredVendors.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredVendors.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'transporters' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <TransporterTable transporters={currentTransporters} totalItems={filteredTransporters.length} loading={loading} onEdit={handleEditTransporter} searchTerm={searchTerm} />
              {!loading && filteredTransporters.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalTransporterPages} totalItems={filteredTransporters.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredTransporters.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'product-grouping' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <GroupTable groups={currentGroups} loading={loading} onEdit={handleEditGroup} onDelete={handleDeleteGroup} />
              {!loading && filteredGroups.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalGroupPages} totalItems={filteredGroups.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredGroups.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
        </div>
      </div>
      )}

      <ProductModal isOpen={productModalOpen} onClose={handleCloseProductModal}
        godowns={godowns} user={user} onSuccess={loadData} editingProduct={editingProduct} />
      <GodownModal isOpen={godownModalOpen} onClose={() => setGodownModalOpen(false)}
        onSuccess={loadData} />
      <BulkImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)}
        user={user} onSuccess={loadData} />
      <CustomerModal isOpen={customerModalOpen} onClose={handleCloseCustomerModal}
        onSuccess={loadData} editingCustomer={editingCustomer} />
      <VendorModal isOpen={vendorModalOpen} onClose={handleCloseVendorModal}
        onSuccess={loadData} editingVendor={editingVendor} />
      <TransporterModal isOpen={transporterModalOpen} onClose={handleCloseTransporterModal}
        onSuccess={loadData} editingTransporter={editingTransporter} />
      <GroupModal isOpen={groupModalOpen} onClose={handleCloseGroupModal}
        user={user} onSuccess={loadData} editingGroup={editingGroup} />
    </div>
  );
};

export default Master;
