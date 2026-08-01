import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, FileText, Users, BadgeCheck, Truck, Zap, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllIndents, deleteIndent } from '../../services/purchaseService';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllVendors } from '../../services/vendorService';
import { getAllTransporters } from '../../services/transporterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import IndentTable from './components/IndentTable';
import IndentModal from './components/IndentModal';
import BulkIndentProductsModal from './components/BulkIndentProductsModal';
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
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editingIndent, setEditingIndent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [godownFilter, setGodownFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.purchase;
    if (!allowedTabs || allowedTabs.length === 0) return [];
    return TABS.filter(tab => allowedTabs.includes(tab.id));
  }, [user]);

  const filteredIndents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return indents.filter(o => {
      const matchSearch =
        o.indent_number?.toLowerCase().includes(term) ||
        o.vendors?.name?.toLowerCase().includes(term);
      const matchGodown = !godownFilter || String(o.godown_id) === godownFilter;
      const matchType = !typeFilter || o.process_type === typeFilter;
      return matchSearch && matchGodown && matchType;
    });
  }, [indents, searchTerm, godownFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredIndents.length / ITEMS_PER_PAGE));

  const currentIndents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredIndents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredIndents, currentPage]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, godownFilter, typeFilter]);

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

  const handleDeleteIndent = async (indent) => {
    if (!window.confirm(`Permanently delete indent "${indent.indent_number}"? This cannot be undone.`)) return;
    try {
      await deleteIndent(indent.indent_id);
      toast.success('Indent deleted');
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingIndent(null);
  };

  const exportIndentsCSV = (data) => {
    const rows = [
      ['Indent Date', 'Indent No.', 'Vendor', 'Godown', 'Type', 'Items', 'Total Amount', 'Created'],
    ];
    data.forEach(o => {
      const items = o.purchase_indent_items || [];
      rows.push([
        new Date(o.indent_date).toLocaleDateString('en-IN'),
        o.indent_number || '',
        o.vendors?.name || '',
        o.godowns?.name || '',
        o.process_type === 'direct' ? 'Direct' : 'Process',
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
    a.download = `indents_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <p className="text-sm text-slate-400">You don't have access to any Purchase tabs. Contact your administrator.</p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
      {activeTab === 'indent' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                <Input type="text" placeholder="Search indents..." className="pl-9"
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
                <option value="direct">Direct</option>
                <option value="process">Process</option>
              </select>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!loading && filteredIndents.length > 0 && (
                <Button variant="outline" onClick={() => exportIndentsCSV(filteredIndents)} className="gap-2 px-4 font-medium text-slate-600 border-slate-200 hover:bg-slate-50">
                  <Download size={16} /><span>Export</span>
                </Button>
              )}
              {!loading && (
                <>
                  <Button variant="outline" onClick={() => setBulkModalOpen(true)} className="gap-2 px-4 font-medium text-slate-700 border-slate-200 hover:bg-slate-50">
                    <Upload size={18} /><span>Bulk Upload</span>
                  </Button>
                  <Button onClick={() => { setEditingIndent(null); setModalOpen(true); }} className="gap-2 px-4 font-medium">
                    <Plus size={20} /><span>Add Indent</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 flex-col">
            <IndentTable indents={currentIndents} totalItems={filteredIndents.length} loading={loading}
              onEdit={handleEditIndent} onDelete={handleDeleteIndent} searchTerm={searchTerm} />
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

          <BulkIndentProductsModal
            isOpen={bulkModalOpen}
            onClose={() => setBulkModalOpen(false)}
            user={user}
            products={products}
            godowns={godowns}
            vendors={vendors}
            onSuccess={loadData}
          />
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
