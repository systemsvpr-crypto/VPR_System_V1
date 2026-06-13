import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, FileText, Users, BadgeCheck, Truck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllIndents } from '../../services/purchaseService';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllVendors } from '../../services/vendorService';
import { getAllTransporters } from '../../services/transporterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import IndentTable from './components/IndentTable';
import IndentModal from './components/IndentModal';
import VendorSelectionTable from './components/VendorSelectionTable';
import VendorApprovalTable from './components/VendorApprovalTable';
import DeliveryTable from './components/DeliveryTable';
import AawakDetailsTable from './components/AawakDetailsTable';

const TABS = [
  { id: 'indent', label: 'Indent', icon: FileText },
  { id: 'vendor-selection', label: 'Vendor Selection', icon: Users },
  { id: 'vendor-approval', label: 'Vendor Approval', icon: BadgeCheck },
  { id: 'delivery', label: 'Delivery', icon: Truck },
  { id: 'aawak-details', label: 'Aawak Details', icon: Zap },
];

const ITEMS_PER_PAGE = 10;

const Purchase = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'indent';
  const setActiveTab = (tab) => setSearchParams({ tab });

  const [indents, setIndents] = useState([]);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndent, setEditingIndent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.purchase;
    if (!allowedTabs || allowedTabs.length === 0) return [];
    return TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user]);

  const filteredIndents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return indents.filter(o =>
      o.indent_number?.toLowerCase().includes(term) ||
      o.vendors?.name?.toLowerCase().includes(term)
    );
  }, [indents, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIndents.length / ITEMS_PER_PAGE));

  const currentIndents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredIndents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredIndents, currentPage]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, g, v, t] = await Promise.all([
        getAllProducts(), getAllGodowns(), getAllVendors(), getAllTransporters(),
      ]);
      setProducts(p); setGodowns(g); setVendors(v); setTransporters(t);
    } catch (err) { toast.error('Failed to load reference data'); }
    try {
      const ind = await getAllIndents();
      setIndents(ind);
    } catch (err) {
      setIndents([]);
    }
    setLoading(false);
  };

  const handleEditIndent = (indent) => {
    setEditingIndent(indent);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingIndent(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Purchase / Procurement</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {activeTab === 'indent' ? 'Manage purchase indents.'
            : activeTab === 'vendor-selection' ? 'Assign vendors and finalize rates for indent items.'
            : activeTab === 'vendor-approval' ? 'Approve vendor assignments and finalize indent items.'
            : activeTab === 'delivery' ? 'Record deliveries and track received quantities against approved indents.'
            : activeTab === 'aawak-details' ? 'Receive goods against Direct-type indents without vendor workflow.'
            : ''}
        </p>
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
            <ShoppingCart size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Tabs Available</h3>
          <p className="text-sm text-slate-400">You don't have access to any Purchase tabs. Contact your administrator.</p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
      {activeTab === 'indent' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
              <Input type="text" placeholder="Search indents..." className="pl-9"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-4">
              {!loading && (
                <Button onClick={() => { setEditingIndent(null); setModalOpen(true); }} className="gap-2 px-4 font-medium">
                  <Plus size={20} /><span>Add Indent</span>
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 flex-col">
            <IndentTable indents={currentIndents} totalItems={filteredIndents.length} loading={loading}
              onEdit={handleEditIndent} searchTerm={searchTerm} />
            {!loading && filteredIndents.length > 0 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredIndents.length}
                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredIndents.length)}
                onPageChange={setCurrentPage} className="border-t border-slate-200" />
            )}
          </div>

          <IndentModal isOpen={modalOpen} onClose={handleCloseModal}
            user={user} onSuccess={loadData} editingIndent={editingIndent}
            products={products} godowns={godowns} vendors={vendors} />
        </div>
      )}

      {activeTab === 'vendor-selection' && (
        <VendorSelectionTable vendors={vendors} />
      )}

      {activeTab === 'vendor-approval' && (
        <VendorApprovalTable vendors={vendors} godowns={godowns} />
      )}

      {activeTab === 'delivery' && (
        <DeliveryTable transporters={transporters} user={user} godowns={godowns} />
      )}

      {activeTab === 'aawak-details' && (
        <AawakDetailsTable transporters={transporters} user={user} godowns={godowns} />
      )}
      </div>
      )}
    </div>
  );
};

export default Purchase;
