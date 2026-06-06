import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllOrders } from '../../services/salesService';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllCustomers } from '../../services/customerService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import OrderTable from './components/OrderTable';
import OrderModal from './components/OrderModal';
import DispatchPlanningTable from './components/DispatchPlanningTable';

const TABS = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'dispatch-planning', label: 'Dispatch Planning', icon: ClipboardList },
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
  const [editingOrder, setEditingOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatchFilter, setDispatchFilter] = useState('all');

  const filteredOrders = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return orders.filter(o =>
      o.order_number?.toLowerCase().includes(term) ||
      o.customers?.name?.toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));

  const currentOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab]);

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

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingOrder(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Sales</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {activeTab === 'orders' ? 'Manage sales orders.' : 'Plan product dispatches from orders.'}
        </p>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {TABS.map(tab => (
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

      {activeTab === 'orders' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
              <Input type="text" placeholder="Search orders..." className="pl-9"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-4">
              {!loading && (
                <Button onClick={() => { setEditingOrder(null); setModalOpen(true); }} className="gap-2 px-4 font-medium">
                  <Plus size={20} /><span>Add Order</span>
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 flex-col">
            <OrderTable orders={currentOrders} totalItems={filteredOrders.length} loading={loading}
              onEdit={handleEditOrder} searchTerm={searchTerm} />
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
                  { id: 'all', label: 'All' },
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
          <DispatchPlanningTable godowns={godowns} searchTerm={searchTerm} dispatchFilter={dispatchFilter} />
        </div>
      )}
    </div>
  );
};

export default Sales;
