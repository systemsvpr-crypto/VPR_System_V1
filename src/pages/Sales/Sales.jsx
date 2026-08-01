import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, ClipboardList, Bell, CheckCircle, Mail, Truck, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllOrders, deleteOrder } from '../../services/salesService';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllCustomers } from '../../services/customerService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import OrderTable from './components/OrderTable';
import OrderModal from './components/OrderModal';
import BulkOrderProductsModal from './components/BulkOrderProductsModal';
import DispatchPlanningTable from './components/DispatchPlanningTable';
import DispatchCompletedTable from './components/DispatchCompletedTable';
import InformAfterDispatchTable from './components/InformAfterDispatchTable';
import SkipDeliveredTable from './components/SkipDeliveredTable';

const TABS = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'dispatch-planning', label: 'Dispatch Planning', icon: ClipboardList },
  { id: 'dispatch-completed', label: 'Dispatch Completed', icon: CheckCircle },
  { id: 'skip-delivered', label: 'Skip Delivered', icon: Truck },
  { id: 'inform-after-dispatch', label: 'Inform After Dispatch', icon: Mail },
];

const ITEMS_PER_PAGE = 10;

const Sales = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'orders';
  const setActiveTab = (tab) => setSearchParams({ tab });

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatchFilter, setDispatchFilter] = useState('pending');
  const [completeFilter, setCompleteFilter] = useState('pending');
  const [afterFilter, setAfterFilter] = useState('pending');
  const [skipFilter, setSkipFilter] = useState('pending');
  const [godownFilter, setGodownFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.sales;
    if (!allowedTabs || allowedTabs.length === 0) return [];
    return TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return orders.filter(o => {
      const matchSearch =
        o.order_number?.toLowerCase().includes(term) ||
        o.customers?.name?.toLowerCase().includes(term);
      const matchGodown = !godownFilter ||
        (o.sales_order_items || []).some(item => String(item.godown_id) === godownFilter);
      const matchType = !typeFilter || o.process_type === typeFilter;
      return matchSearch && matchGodown && matchType;
    });
  }, [orders, searchTerm, godownFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));

  const currentOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, completeFilter, afterFilter, skipFilter, godownFilter, typeFilter]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, g, c] = await Promise.all([
        getAllProducts(), getAllGodowns(), getAllCustomers(),
      ]);
      setProducts(p); setGodowns(g); setCustomers(c);
    } catch (err) { toast.error('Failed to load reference data'); }
    try {
      const o = await getAllOrders();
      setOrders(o);
    } catch (err) {
      setOrders([]);
    }
    setLoading(false);
  };

  const exportOrdersCSV = (data) => {
    const rows = [
      ['Order Date', 'Order No.', 'Customer', 'Type', 'Items', 'Total Amount', 'Created'],
    ];
    data.forEach(o => {
      const items = o.sales_order_items || [];
      rows.push([
        new Date(o.order_date).toLocaleDateString('en-IN'),
        o.order_number || '',
        o.customers?.name || '',
        o.process_type === 'skip_delivered' ? 'Skip' : 'Process',
        items.length,
        Number(o.total_amount).toFixed(2),
        new Date(o.created_at).toLocaleDateString('en-IN'),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingOrder(null);
  };

  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`Permanently delete order ${order.order_number}? This cannot be undone.`)) return;
    try {
      await deleteOrder(order.order_id);
      toast.success('Order deleted.');
      loadData();
    } catch (err) { toast.error(err.message || 'Failed to delete order.'); }
  };

  return (
    <div className="flex flex-col gap-6">


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
            <ShoppingCart size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Tabs Available</h3>
          <p className="text-sm text-slate-400">You don't have access to any Sales tabs. Contact your administrator.</p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
      {activeTab === 'orders' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search orders..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <select
                value={godownFilter}
                onChange={e => setGodownFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[140px]"
              >
                <option value="">All Godowns</option>
                {godowns.map(g => (
                  <option key={g.godown_id} value={String(g.godown_id)}>{g.name}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[130px]"
              >
                <option value="">All Types</option>
                <option value="order_process">Process</option>
                <option value="skip_delivered">Skip</option>
              </select>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!loading && filteredOrders.length > 0 && (
                <Button variant="outline" onClick={() => exportOrdersCSV(filteredOrders)} className="gap-2 px-4 font-medium text-slate-600 border-slate-200 hover:bg-slate-50">
                  <Download size={16} /><span>Export</span>
                </Button>
              )}
              {!loading && (
                <>
                  <Button variant="outline" onClick={() => setBulkModalOpen(true)} className="gap-2 px-4 font-medium text-slate-700 border-slate-200 hover:bg-slate-50">
                    <Upload size={18} /><span>Bulk Upload</span>
                  </Button>
                  <Button onClick={() => { setEditingOrder(null); setModalOpen(true); }} className="gap-2 px-4 font-medium">
                    <Plus size={20} /><span>Add Order</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 flex-col">
            <OrderTable orders={currentOrders} totalItems={filteredOrders.length} loading={loading}
              onEdit={handleEditOrder} onDelete={handleDeleteOrder} searchTerm={searchTerm} />
            {!loading && filteredOrders.length > 0 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredOrders.length}
                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length)}
                onPageChange={setCurrentPage} className="border-t border-slate-200" />
            )}
          </div>

          <OrderModal isOpen={modalOpen} onClose={handleCloseModal}
            user={user} onSuccess={loadData} editingOrder={editingOrder}
            products={products} godowns={godowns} customers={customers} />

          <BulkOrderProductsModal
            isOpen={bulkModalOpen}
            onClose={() => setBulkModalOpen(false)}
            user={user}
            products={products}
            godowns={godowns}
            customers={customers}
            onSuccess={loadData}
          />
        </div>
      )}

      {activeTab === 'dispatch-planning' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search items..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: 'pending', label: 'Pending' },
                  { id: 'history', label: 'History' },
                ].map(f => (
                  <button key={f.id} onClick={() => setDispatchFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      dispatchFilter === f.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DispatchPlanningTable godowns={godowns} searchTerm={searchTerm} dispatchFilter={dispatchFilter} onSave={loadData} user={user} />
        </div>
      )}

      {activeTab === 'dispatch-completed' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search dispatch plans..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: 'pending', label: 'Pending' },
                  { id: 'dispatch-done', label: 'Dispatch Done' },
                ].map(f => (
                  <button key={f.id} onClick={() => setCompleteFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      completeFilter === f.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DispatchCompletedTable searchTerm={searchTerm} completeFilter={completeFilter} onSave={loadData} products={products} godowns={godowns} />
        </div>
      )}

      {activeTab === 'inform-after-dispatch' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search dispatch plans..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: 'pending', label: 'Pending' },
                  { id: 'informed', label: 'Informed' },
                ].map(f => (
                  <button key={f.id} onClick={() => setAfterFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      afterFilter === f.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <InformAfterDispatchTable searchTerm={searchTerm} afterFilter={afterFilter} onSave={loadData} />
        </div>
      )}

      {activeTab === 'skip-delivered' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search items..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: 'pending', label: 'Pending' },
                  { id: 'partial', label: 'Partial' },
                  { id: 'skip-done', label: 'Skip Done' },
                ].map(f => (
                  <button key={f.id} onClick={() => setSkipFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      skipFilter === f.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SkipDeliveredTable searchTerm={searchTerm} skipFilter={skipFilter} onSave={loadData} products={products} godowns={godowns} user={user} customers={customers} />
        </div>
      )}
      </div>
      )}
    </div>
  );
};

export default Sales;
