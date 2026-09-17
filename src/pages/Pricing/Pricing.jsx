import { useState, useEffect, useMemo } from 'react';
import {
  IndianRupee,
  Search,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllPricingGroups, deletePricingGroup } from '../../services/pricingService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import PricingTable from './components/PricingTable';
import PricingModal from './components/PricingModal';
import RateHistoryModal from './components/RateHistoryModal';

const Pricing = () => {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rateFilter, setRateFilter] = useState('all'); // 'all' | 'configured' | 'missing'

  // Modal states
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyGroup, setHistoryGroup] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination state - default to 100 records for displaying more records
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await getAllPricingGroups();
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load pricing groups:', err);
      toast.error('Failed to load product group pricing data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const matchesSearch = !searchTerm || g.group_name?.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const hasAnyRate = g.a_rate !== null || g.b_rate !== null || g.c_rate !== null;

      if (!matchesSearch) return false;
      if (rateFilter === 'configured') return hasAnyRate;
      if (rateFilter === 'missing') return !hasAnyRate;
      return true;
    });
  }, [groups, searchTerm, rateFilter]);

  // Counts for filters
  const counts = useMemo(() => {
    const total = groups.length;
    const configured = groups.filter((g) => g.a_rate !== null || g.b_rate !== null || g.c_rate !== null).length;
    const missing = total - configured;
    return { total, configured, missing };
  }, [groups]);

  // Paginated slice
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredGroups.slice(start, start + itemsPerPage);
  }, [filteredGroups, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage) || 1;

  // Handlers
  const handleOpenAdd = () => {
    setEditingGroup(null);
    setPricingModalOpen(true);
  };

  const handleSaveRow = async (groupId, updatedData) => {
    try {
      await updatePricingGroup(groupId, {
        ...updatedData,
        updated_by: user?.user_id,
      });
      toast.success(`Pricing for "${updatedData.group_name}" updated!`);
      setGroups((prev) =>
        prev.map((g) => (g.group_id === groupId ? { ...g, ...updatedData } : g))
      );
      loadGroups(true);
      return true;
    } catch (err) {
      console.error('Failed to update group rates:', err);
      toast.error(err.message || 'Failed to update rates');
      return false;
    }
  };

  const handleOpenHistory = (group) => {
    setHistoryGroup(group);
    setHistoryModalOpen(true);
  };

  const handleOpenDelete = (group) => {
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    try {
      setDeleting(true);
      await deletePricingGroup(groupToDelete.group_id);
      toast.success(`Product group "${groupToDelete.group_name}" deleted`);
      setDeleteModalOpen(false);
      setGroupToDelete(null);
      loadGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
      toast.error(err.message || 'Failed to delete product group');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3 min-h-0">
      {/* Top Header Card - Compact & Fully Responsive */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shadow-xs shrink-0">
              <IndianRupee size={22} className="font-bold" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Pricing Management
              </h1>
              <p className="text-xs text-slate-500">
                Manage product groups, set tier rates (A, B, C) in ₹ and track historical pricing changes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadGroups(true)}
              disabled={refreshing || loading}
              className="h-9 text-xs text-slate-600 hover:text-primary gap-1.5 flex-1 sm:flex-initial"
            >
              <RotateCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>

            <Button
              onClick={handleOpenAdd}
              className="h-9 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-white gap-1.5 shadow-xs transition-all flex-1 sm:flex-initial"
            >
              <Plus size={16} />
              <span>Add Product Group</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar - Fully Responsive */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by group name..."
            className="pl-8 text-xs h-9 w-full bg-slate-50 focus:bg-white transition-colors"
          />
        </div>

        {/* Rate Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <button
            type="button"
            onClick={() => { setRateFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              rateFilter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Groups ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => { setRateFilter('configured'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              rateFilter === 'configured'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Rates Configured ({counts.configured})
          </button>
          <button
            type="button"
            onClick={() => { setRateFilter('missing'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              rateFilter === 'missing'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Rates Missing ({counts.missing})
          </button>
        </div>
      </div>

      {/* Main Table Container - Full Responsive Height */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
        <PricingTable
          groups={paginatedGroups}
          totalItems={filteredGroups.length}
          loading={loading}
          searchTerm={searchTerm}
          onSaveRow={handleSaveRow}
          onDelete={handleOpenDelete}
          onViewHistory={handleOpenHistory}
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Add / Edit Pricing Modal */}
      <PricingModal
        isOpen={pricingModalOpen}
        onClose={() => {
          setPricingModalOpen(false);
          setEditingGroup(null);
        }}
        editingGroup={editingGroup}
        onSuccess={() => loadGroups()}
        user={user}
      />

      {/* Rate History Modal */}
      <RateHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setHistoryGroup(null);
        }}
        group={historyGroup}
      />

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModalOpen} onOpenChange={(open) => { if (!open) setDeleteModalOpen(false); }}>
        <ModalContent className="max-w-md w-full">
          <ModalHeader>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0 border border-red-100">
              <Trash2 size={20} />
            </div>
            <div>
              <ModalTitle className="text-base font-semibold text-slate-800">
                Delete Product Group
              </ModalTitle>
              <ModalDescription className="text-xs text-slate-500">
                Are you sure you want to delete this product group?
              </ModalDescription>
            </div>
          </ModalHeader>

          <ModalBody>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will remove <strong className="text-slate-900 font-semibold">{groupToDelete?.group_name}</strong> and all its associated tier rates and rate history. This action cannot be undone.
            </p>
          </ModalBody>

          <ModalFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-9 px-4 text-xs bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {deleting ? 'Deleting...' : 'Delete Group'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Pricing;
