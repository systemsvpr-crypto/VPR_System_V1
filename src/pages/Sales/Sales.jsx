import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, ClipboardList, Bell, CheckCircle, Mail, Truck } from 'lucide-react';
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
import CancelOrderModal from './components/CancelOrderModal';
import DispatchPlanningTable from './components/DispatchPlanningTable';
import InformBeforeDispatchTable from './components/InformBeforeDispatchTable';
import DispatchCompletedTable from './components/DispatchCompletedTable';
import InformAfterDispatchTable from './components/InformAfterDispatchTable';
import SkipDeliveredTable from './components/SkipDeliveredTable';

const TABS = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'dispatch-planning', label: 'Dispatch Planning', icon: ClipboardList },
  { id: 'inform-before-dispatch', label: 'Inform Before Dispatch', icon: Bell },
  { id: 'dispatch-completed', label: 'Dispatch Completed', icon: CheckCircle },
  { id: 'inform-after-dispatch', label: 'Inform After Dispatch', icon: Mail },
  { id: 'skip-delivered', label: 'Skip Delivered', icon: Truck },
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
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatchFilter, setDispatchFilter] = useState('pending');
  const [informFilter, setInformFilter] = useState('pending');
  const [completeFilter, setCompleteFilter] = useState('pending');
  const [afterFilter, setAfterFilter] = useState('pending');
  const [skipFilter, setSkipFilter] = useState('pending');

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
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, informFilter, completeFilter, afterFilter, skipFilter]);

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

  const handleCancelOrder = (order) => {
    setCancellingOrder(order);
    setCancelModalOpen(true);
  };

  const handleCloseCancelModal = () => {
    setCancelModalOpen(false);
    setCancellingOrder(null);
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
          {activeTab === 'orders' ? 'Manage sales orders.'
            : activeTab === 'dispatch-completed' ? 'View completed and pending dispatches.'
            : activeTab === 'skip-delivered' ? 'Manage skip delivered dispatches.'
            : activeTab === 'inform-after-dispatch' ? 'Inform customers about completed dispatches.'
            : 'Plan product dispatches from orders.'}
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
              onEdit={handleEditOrder} onCancel={handleCancelOrder} searchTerm={searchTerm} />
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
          <CancelOrderModal isOpen={cancelModalOpen} onClose={handleCloseCancelModal}
            order={cancellingOrder} onSuccess={loadData} user={user} />
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
                  { id: 'all', label: 'All' },
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

      {activeTab === 'inform-before-dispatch' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search orders..." className="pl-9"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: 'pending', label: 'Pending' },
                  { id: 'informed', label: 'Informed' },
                  { id: 'all', label: 'All' },
                ].map(f => (
                  <button key={f.id} onClick={() => setInformFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      informFilter === f.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <InformBeforeDispatchTable orders={orders} godowns={godowns} searchTerm={searchTerm} loading={loading} informFilter={informFilter} onSave={loadData} />
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
                  { id: 'all', label: 'All' },
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
                  { id: 'all', label: 'All' },
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
                  { id: 'skip-done', label: 'Skip Done' },
                  { id: 'all', label: 'All' },
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
          <SkipDeliveredTable searchTerm={searchTerm} skipFilter={skipFilter} onSave={loadData} products={products} godowns={godowns} user={user} />
        </div>
      )}
    </div>
  );
};

export default Sales;
