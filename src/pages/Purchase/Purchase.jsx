import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, FileText, Users, CheckCircle, BadgeCheck, Truck, Zap, Download, Upload, Timer, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllIndents, deleteIndent } from '../../services/purchaseService';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllVendors } from '../../services/vendorService';
import { getAllTransporters } from '../../services/transporterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import IndentPendingHistoryTable from './components/IndentPendingHistoryTable';
import IndentModal from './components/IndentModal';
import BulkIndentProductsModal from './components/BulkIndentProductsModal';
import VendorSelectionTable from './components/VendorSelectionTable';
import VendorApprovalTable from './components/VendorApprovalTable';
import DeliveryTable from './components/DeliveryTable';
import AawakDetailsTable from './components/AawakDetailsTable';
import PurchaseCompleteTable from './components/PurchaseCompleteTable';

// "Vendor Approval" (VendorSelectionTable) is planning — picking vendor,
// rate, qty, expected delivery date. "Approval" (VendorApprovalTable) is the
// separate, final sign-off that actually flips approval_status — only items
// approved there reach Delivery (getApprovedItemsForDelivery gates on it).
const TABS = [
  { id: 'indent', label: 'Indent', icon: FileText },
  { id: 'vendor-selection', label: 'Vendor Approval', icon: Users },
  { id: 'approval', label: 'Approval', icon: CheckCircle },
  { id: 'in-transit', label: 'Delivery', icon: Timer },
  { id: 'aawak-details', label: 'Aawak Details', icon: Zap },
  { id: 'purchase-complete', label: 'Purchase Dashboard', icon: BadgeCheck },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [godownFilter, setGodownFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  // Bumped every time loadData() finishes — tells IndentPendingHistoryTable
  // (which owns its own item-level fetch) to reload after any indent is
  // created/edited/bulk-uploaded, without touching those popup forms.
  const [dataVersion, setDataVersion] = useState(0);

  const visibleTabs = useMemo(() => {
    const allowedTabs = user?.tab_access?.purchase;
    if (!allowedTabs || allowedTabs.length === 0) return TABS;
    return TABS.filter(tab =>
      allowedTabs.includes(tab.id) ||
      (allowedTabs.includes('delivery') && tab.id === 'in-transit') ||
      (allowedTabs.includes('aawak-details') && tab.id === 'purchase-complete') ||
      tab.id === 'purchase-complete'
    );
  }, [user]);

  // Indents are only ever placed against a real "own" godown, not a
  // transporter's auto-created stock-tracking godown — so keep those out of
  // the filter dropdown.
  const ownGodowns = useMemo(() =>
    godowns.filter(g => (g.godown_type || 'Own') === 'Own'),
    [godowns],
  );

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

  const totalPages = Math.max(1, Math.ceil(filteredIndents.length / pageSize));

  const currentIndents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIndents.slice(start, start + pageSize);
  }, [filteredIndents, currentPage, pageSize]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, godownFilter, typeFilter, pageSize]);

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
    setDataVersion(v => v + 1);
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
    <div className="flex flex-col gap-6 h-full min-h-0">


      <div className="flex items-center gap-6 border-b border-slate-200 shrink-0">
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
      <div className="flex flex-col gap-4 flex-1 min-h-0">
      {activeTab === 'indent' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <IndentPendingHistoryTable
            vendors={vendors}
            user={user}
            refreshToken={dataVersion}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            toolbarExtra={
              <>
                <select
                  value={godownFilter}
                  onChange={e => setGodownFilter(e.target.value)}
                  className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[140px] shrink-0"
                >
                  <option value="">All Godowns</option>
                  {ownGodowns.map(g => (
                    <option key={g.godown_id} value={String(g.godown_id)}>{g.name}</option>
                  ))}
                </select>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[130px] shrink-0"
                >
                  <option value="">All Types</option>
                  <option value="direct">Direct</option>
                  <option value="process">Process</option>
                </select>
                {!loading && filteredIndents.length > 0 && (
                  <Button variant="outline" onClick={() => exportIndentsCSV(filteredIndents)} className="gap-2 px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50 shrink-0">
                    <Download size={16} /><span>Export</span>
                  </Button>
                )}
                {!loading && (
                  <>
                    <Button variant="outline" onClick={() => setBulkModalOpen(true)} className="gap-2 px-4 font-medium text-xs h-9 text-slate-700 border-slate-200 hover:bg-slate-50 shrink-0">
                      <Upload size={16} /><span>Bulk Upload</span>
                    </Button>
                    <Button onClick={() => { setEditingIndent(null); setModalOpen(true); }} className="gap-2 px-4 font-medium text-xs h-9 shrink-0">
                      <Plus size={16} /><span>Add Indent</span>
                    </Button>
                  </>
                )}
              </>
            }
          />

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
        <VendorSelectionTable vendors={vendors} godowns={godowns} user={user} />
      )}

      {activeTab === 'approval' && (
        <VendorApprovalTable vendors={vendors} godowns={godowns} user={user} />
      )}

      {(activeTab === 'in-transit' || activeTab === 'delivery') && (
        <DeliveryTable tabMode="in-transit" transporters={transporters} user={user} godowns={godowns} />
      )}

      {activeTab === 'aawak-details' && (
        <AawakDetailsTable transporters={transporters} user={user} godowns={godowns} products={products} vendors={vendors} />
      )}

      {activeTab === 'purchase-complete' && (
        <PurchaseCompleteTable user={user} godowns={godowns} products={products} vendors={vendors} />
      )}
      </div>
      )}
    </div>
  );
};

export default Purchase;
