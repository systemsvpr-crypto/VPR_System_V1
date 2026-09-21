import { useState, useEffect, useMemo } from 'react';
import {
  IndianRupee,
  Search,
  Plus,
  RotateCw,
  Trash2,
  Check,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import {
  getAllPricingGroups,
  deletePricingGroup,
  bulkUpdatePricingGroups,
  bulkDeletePricingGroups,
  updatePricingGroup,
} from '../../services/pricingService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import PricingTable from './components/PricingTable';
import PricingModal from './components/PricingModal';
import RateHistoryModal from './components/RateHistoryModal';
import { TabSwitcher } from '../../components/StandardButtons';

const Pricing = () => {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'needs_review'
  const [searchTerm, setSearchTerm] = useState('');
  const [rateFilter, setRateFilter] = useState('all'); // 'all' | 'configured' | 'missing'

  // Multi-selection & inline bulk edit state
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  const [editedRates, setEditedRates] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Modal states
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyGroup, setHistoryGroup] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination state - default to 100 records
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

  // Automatic Pricing Alert: Groups whose purchase rate has changed and need ABC rate review
  const needsReviewGroups = useMemo(() => {
    return groups.filter((g) => {
      // 1. Purchase rate has changed: both last_purchase_rate and current_purchase_rate must exist and differ
      const hasRateChanged =
        g.last_purchase_rate !== null &&
        g.last_purchase_rate !== undefined &&
        g.current_purchase_rate !== null &&
        g.current_purchase_rate !== undefined &&
        Number(g.current_purchase_rate) !== Number(g.last_purchase_rate);

      if (!hasRateChanged) return false;

      // 2. Once the pricing person updates and saves all three A, B, and C rates, the alert disappears
      const hasAllThreeRates =
        g.a_rate !== null && g.a_rate !== undefined && g.a_rate !== '' &&
        g.b_rate !== null && g.b_rate !== undefined && g.b_rate !== '' &&
        g.c_rate !== null && g.c_rate !== undefined && g.c_rate !== '';

      if (!hasAllThreeRates || !g.abc_updated_on) return true;

      if (g.rate_changed_on) {
        const rateChangedTime = new Date(g.rate_changed_on).getTime();
        const abcUpdatedTime = new Date(g.abc_updated_on).getTime();
        if (abcUpdatedTime < rateChangedTime) return true;
      }

      return false;
    });
  }, [groups]);

  // Filtered groups based on activeTab ('all' or 'needs_review')
  const displayedGroups = useMemo(() => {
    const baseList = activeTab === 'needs_review' ? needsReviewGroups : groups;
    return baseList.filter((g) => {
      const matchesSearch = !searchTerm || g.group_name?.toLowerCase().includes(searchTerm.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (activeTab === 'all') {
        const hasAnyRate = g.a_rate !== null || g.b_rate !== null || g.c_rate !== null;
        if (rateFilter === 'configured') return hasAnyRate;
        if (rateFilter === 'missing') return !hasAnyRate;
      }
      return true;
    });
  }, [groups, needsReviewGroups, activeTab, searchTerm, rateFilter]);

  // Counts for filters
  const counts = useMemo(() => {
    const total = groups.length;
    const configured = groups.filter((g) => g.a_rate !== null || g.b_rate !== null || g.c_rate !== null).length;
    const missing = total - configured;
    return { total, configured, missing, needsReview: needsReviewGroups.length };
  }, [groups, needsReviewGroups]);

  // Paginated slice for current active tab
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return displayedGroups.slice(start, start + itemsPerPage);
  }, [displayedGroups, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(displayedGroups.length / itemsPerPage) || 1;

  // --- Multi-Selection Handlers ---
  const handleToggleSelect = (groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
        // Initialize editedRates for this group if not set
        const g = groups.find((item) => item.group_id === groupId);
        if (g && !editedRates[groupId]) {
          setEditedRates((r) => ({
            ...r,
            [groupId]: {
              a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
              b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
              c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
            },
          }));
        }
      }
      return next;
    });
  };

  const handleToggleSelectGroupList = (select, targetGroupList) => {
    const targetList = targetGroupList || paginatedGroups;
    const ids = targetList.map((g) => g.group_id);
    if (!select) {
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setEditedRates((prev) => {
      const next = { ...prev };
      targetList.forEach((g) => {
        if (!next[g.group_id]) {
          next[g.group_id] = {
            a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
            b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
            c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
          };
        }
      });
      return next;
    });
  };

  const handleToggleSelectAll = (select) => {
    handleToggleSelectGroupList(select, paginatedGroups);
  };

  const handleRateChange = (groupId, field, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setEditedRates((prev) => ({
      ...prev,
      [groupId]: {
        ...(prev[groupId] || {}),
        [field]: value,
      },
    }));
  };

  const handleClearSelection = () => {
    setSelectedGroupIds(new Set());
    setEditedRates({});
  };

  // --- Bulk Save Handler ---
  const handleBulkSave = async () => {
    if (selectedGroupIds.size === 0) return;

    const updates = [];
    for (const gid of selectedGroupIds) {
      const rates = editedRates[gid];
      if (!rates) continue;

      if (rates.a_rate !== '' && (isNaN(rates.a_rate) || Number(rates.a_rate) < 0)) {
        toast.error('Rate A must be a valid positive number');
        return;
      }
      if (rates.b_rate !== '' && (isNaN(rates.b_rate) || Number(rates.b_rate) < 0)) {
        toast.error('Rate B must be a valid positive number');
        return;
      }
      if (rates.c_rate !== '' && (isNaN(rates.c_rate) || Number(rates.c_rate) < 0)) {
        toast.error('Rate C must be a valid positive number');
        return;
      }

      updates.push({
        group_id: gid,
        a_rate: rates.a_rate,
        b_rate: rates.b_rate,
        c_rate: rates.c_rate,
      });
    }

    if (updates.length === 0) {
      toast.error('No changes found to save');
      return;
    }

    setBulkSaving(true);
    try {
      await bulkUpdatePricingGroups(updates);
      toast.success(`Successfully saved rates for ${updates.length} product group(s)!`);

      // Optimistic update
      const nowIso = new Date().toISOString();
      setGroups((prev) =>
        prev.map((g) => {
          const u = updates.find((item) => item.group_id === g.group_id);
          if (!u) return g;
          return {
            ...g,
            a_rate: u.a_rate !== '' ? parseFloat(u.a_rate) : null,
            b_rate: u.b_rate !== '' ? parseFloat(u.b_rate) : null,
            c_rate: u.c_rate !== '' ? parseFloat(u.c_rate) : null,
            abc_updated_on: nowIso,
          };
        })
      );

      setSelectedGroupIds(new Set());
      setEditedRates({});
      loadGroups(true);
    } catch (err) {
      console.error('Failed to bulk save rates:', err);
      toast.error(err.message || 'Failed to save rates');
    } finally {
      setBulkSaving(false);
    }
  };

  // --- Save Single Row (when Enter pressed) ---
  const handleSaveSingleRow = async (groupId) => {
    const rates = editedRates[groupId];
    if (!rates) return;

    if (rates.a_rate !== '' && (isNaN(rates.a_rate) || Number(rates.a_rate) < 0)) {
      toast.error('Rate A must be a valid positive number');
      return;
    }
    if (rates.b_rate !== '' && (isNaN(rates.b_rate) || Number(rates.b_rate) < 0)) {
      toast.error('Rate B must be a valid positive number');
      return;
    }
    if (rates.c_rate !== '' && (isNaN(rates.c_rate) || Number(rates.c_rate) < 0)) {
      toast.error('Rate C must be a valid positive number');
      return;
    }

    try {
      await updatePricingGroup(groupId, {
        ...rates,
        updated_by: user?.user_id,
      });
      toast.success('Rates updated successfully!');

      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId
            ? {
              ...g,
              a_rate: rates.a_rate !== '' ? parseFloat(rates.a_rate) : null,
              b_rate: rates.b_rate !== '' ? parseFloat(rates.b_rate) : null,
              c_rate: rates.c_rate !== '' ? parseFloat(rates.c_rate) : null,
              abc_updated_on: new Date().toISOString(),
            }
            : g
        )
      );

      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });

      loadGroups(true);
    } catch (err) {
      console.error('Failed to update group rates:', err);
      toast.error(err.message || 'Failed to update rates');
    }
  };

  // --- Bulk Delete Handlers ---
  const handleOpenBulkDelete = () => {
    if (selectedGroupIds.size === 0) return;
    setBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedGroupIds.size === 0) return;
    const ids = Array.from(selectedGroupIds);

    setBulkDeleting(true);
    try {
      await bulkDeletePricingGroups(ids);
      toast.success(`Successfully deleted ${ids.length} product group(s)`);
      setBulkDeleteModalOpen(false);
      setSelectedGroupIds(new Set());
      setEditedRates({});
      loadGroups();
    } catch (err) {
      console.error('Failed to bulk delete product groups:', err);
      toast.error(err.message || 'Failed to delete selected product groups');
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Modal Openers ---
  const handleOpenAdd = () => {
    setEditingGroup(null);
    setPricingModalOpen(true);
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
      {/* Tab Switcher: All Pricing (Main Tab) vs Needs Review */}
      <div className="flex justify-start w-full shrink-0 overflow-x-auto pb-0.5 custom-scrollbar">
        <TabSwitcher
          activeTab={activeTab}
          onTabChange={(tabId) => {
            setActiveTab(tabId);
            setCurrentPage(1);
          }}
          tabs={[
            {
              id: 'all',
              label: (
                <div className="flex items-center gap-2">
                  <span>All Pricing</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {counts.total}
                  </span>
                </div>
              ),
            },
            {
              id: 'needs_review',
              label: (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className={needsReviewGroups.length > 0 ? (activeTab === 'needs_review' ? 'text-white animate-pulse' : 'text-amber-500 animate-pulse') : ''} />
                  <span>Needs Review</span>
                  {needsReviewGroups.length > 0 ? (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${activeTab === 'needs_review' ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                      {needsReviewGroups.length}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${activeTab === 'needs_review' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                      0
                    </span>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* Filter and Search Bar Card - Right at the top! */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative w-full sm:w-80 md:w-96">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={activeTab === 'needs_review' ? "Search items needing review..." : "Search by group name..."}
              className="pl-8 text-xs h-9 w-full bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Submit & Delete Buttons on Search Bar Card */}
        {selectedGroupIds.size > 0 && (
          <div className="flex items-center gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-2 lg:pt-0 lg:pl-3 animate-in fade-in shrink-0">
            <span className="text-xs font-bold text-primary px-2.5 py-1 bg-primary/10 rounded-md whitespace-nowrap">
              {selectedGroupIds.size} Selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleClearSelection}
              disabled={bulkSaving || bulkDeleting}
              className="h-8 px-2.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Clear
            </Button>
            {activeTab === 'all' && (
              <Button
                type="button"
                size="sm"
                onClick={handleOpenBulkDelete}
                disabled={bulkSaving || bulkDeleting}
                className="h-8 px-3 text-xs bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Trash2 size={13} className="mr-1.5" />
                Delete ({selectedGroupIds.size})
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleBulkSave}
              disabled={bulkSaving || bulkDeleting}
              className="h-8 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer shadow-xs whitespace-nowrap"
            >
              {bulkSaving ? (
                <RotateCw size={13} className="mr-1.5 animate-spin" />
              ) : (
                <Check size={13} className="mr-1.5" />
              )}
              Submit ({selectedGroupIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Main Table Container */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
        <PricingTable
          groups={paginatedGroups}
          totalItems={displayedGroups.length}
          loading={loading}
          searchTerm={searchTerm}
          onViewHistory={handleOpenHistory}
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            setCurrentPage(1);
          }}
          selectedGroupIds={selectedGroupIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          editedRates={editedRates}
          onRateChange={handleRateChange}
          onBulkSave={handleBulkSave}
          onBulkDelete={handleOpenBulkDelete}
          onClearSelection={handleClearSelection}
          onSaveSingleRow={handleSaveSingleRow}
          bulkSaving={bulkSaving}
          bulkDeleting={bulkDeleting}
          emptyTitle={activeTab === 'needs_review' ? 'No Items Need Review' : undefined}
          emptyMessage={
            activeTab === 'needs_review'
              ? 'All product purchase rate changes have been reviewed and saved.'
              : undefined
          }
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

      {/* Single Delete Confirmation Modal */}
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
              className="h-9 px-4 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-9 px-4 text-xs bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer"
            >
              {deleting ? 'Deleting...' : 'Delete Group'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal open={bulkDeleteModalOpen} onOpenChange={(open) => { if (!open) setBulkDeleteModalOpen(false); }}>
        <ModalContent className="max-w-md w-full">
          <ModalHeader>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0 border border-red-100">
              <Trash2 size={20} />
            </div>
            <div>
              <ModalTitle className="text-base font-semibold text-slate-800">
                Delete {selectedGroupIds.size} Product Groups
              </ModalTitle>
              <ModalDescription className="text-xs text-slate-500">
                Are you sure you want to delete these {selectedGroupIds.size} selected product groups?
              </ModalDescription>
            </div>
          </ModalHeader>

          <ModalBody>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all <strong className="text-slate-900 font-semibold">{selectedGroupIds.size} selected product groups</strong> and their associated rate histories. This action cannot be undone.
            </p>
          </ModalBody>

          <ModalFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setBulkDeleteModalOpen(false)}
              disabled={bulkDeleting}
              className="h-9 px-4 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmBulkDelete}
              disabled={bulkDeleting}
              className="h-9 px-4 text-xs bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer"
            >
              {bulkDeleting ? 'Deleting...' : `Delete (${selectedGroupIds.size}) Groups`}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Pricing;
