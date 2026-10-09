import { useState, useEffect, useMemo } from 'react';
import { Warehouse, Search, Check, X, Layers, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createGodown,
  updateGodown,
  updateGodownProductAssignments,
  getAllProducts,
  getAllGodowns,
} from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';
import { canEditOrDelete } from '../../../lib/permissions';

const GodownModal = ({
  isOpen,
  onClose,
  onSuccess,
  editingGodown,
  products: propProducts = [],
  allGodowns: propGodowns = [],
  user,
}) => {
  const [name, setName] = useState('');
  const [godownType, setGodownType] = useState('Own');
  const [products, setProducts] = useState(propProducts);
  const [allGodowns, setAllGodowns] = useState(propGodowns);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [initialAssignedIds, setInitialAssignedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'selected' | 'unassigned'
  const [submitting, setSubmitting] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (propProducts && propProducts.length > 0) {
      setProducts(propProducts);
    }
  }, [propProducts]);

  useEffect(() => {
    if (propGodowns && propGodowns.length > 0) {
      setAllGodowns(propGodowns);
    }
  }, [propGodowns]);

  // Fallback fetch if opened without passed props
  useEffect(() => {
    if (isOpen) {
      if (!propProducts || propProducts.length === 0) {
        getAllProducts().then(setProducts).catch(() => {});
      }
      if (!propGodowns || propGodowns.length === 0) {
        getAllGodowns().then(setAllGodowns).catch(() => {});
      }
    }
  }, [isOpen, propProducts, propGodowns]);

  // Map of godown_id -> godown_name for status tags
  const godownMap = useMemo(() => {
    const map = new Map();
    (allGodowns || []).forEach((g) => {
      if (g.godown_id) map.set(g.godown_id, g.name);
    });
    return map;
  }, [allGodowns]);

  // Initialize form state when opened or when editingGodown changes
  useEffect(() => {
    if (isOpen) {
      setName(editingGodown ? editingGodown.name || '' : '');
      setGodownType(editingGodown ? editingGodown.godown_type || 'Own' : 'Own');
      setSearchTerm('');
      setFilterTab('all');

      if (editingGodown) {
        const assignedIds = (products || [])
          .filter((p) => p.godown_id === editingGodown.godown_id)
          .map((p) => p.product_id);
        setSelectedProductIds(assignedIds);
        setInitialAssignedIds(assignedIds);
      } else {
        setSelectedProductIds([]);
        setInitialAssignedIds([]);
      }
    }
  }, [isOpen, editingGodown, products]);

  // Selected Set for O(1) lookups
  const selectedSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  // Count unassigned products
  const unassignedCount = useMemo(() => {
    return (products || []).filter((p) => !p.godown_id).length;
  }, [products]);

  // Filter products by search term and filter tab
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return (products || []).filter((p) => {
      // Search filter
      const matchesSearch =
        !term ||
        p.name?.toLowerCase().includes(term) ||
        p.brand_name?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.product_type?.toLowerCase().includes(term) ||
        p.mux?.toLowerCase().includes(term) ||
        p.unit?.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // Tab filter
      if (filterTab === 'selected') {
        return selectedSet.has(p.product_id);
      }
      if (filterTab === 'unassigned') {
        return !p.godown_id && !selectedSet.has(p.product_id);
      }

      return true;
    });
  }, [products, searchTerm, filterTab, selectedSet]);

  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredProducts.map((p) => p.product_id);
    setSelectedProductIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAllFiltered = () => {
    const filteredIdsSet = new Set(filteredProducts.map((p) => p.product_id));
    setSelectedProductIds((prev) => prev.filter((id) => !filteredIdsSet.has(id)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingGodown && !canEditOrDelete(user)) {
      toast.error('You do not have permission to edit godowns.');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Godown name is required.');
      return;
    }

    setSubmitting(true);
    try {
      let targetGodownId;

      if (editingGodown) {
        targetGodownId = editingGodown.godown_id;
        await updateGodown(targetGodownId, { name: trimmedName, godownType });
        await updateGodownProductAssignments(targetGodownId, selectedProductIds, initialAssignedIds);
        toast.success(`Godown updated (${selectedProductIds.length} product${selectedProductIds.length === 1 ? '' : 's'} assigned)`);
      } else {
        const newGodown = await createGodown(trimmedName);
        targetGodownId = newGodown?.godown_id;
        if (targetGodownId && selectedProductIds.length > 0) {
          await updateGodownProductAssignments(targetGodownId, selectedProductIds, []);
        }
        toast.success(`Godown created with ${selectedProductIds.length} product${selectedProductIds.length === 1 ? '' : 's'} assigned`);
      }

      onClose();
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to save godown');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <ModalHeader className="pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Warehouse size={20} className="text-primary" />
            </div>
            <div>
              <ModalTitle asChild>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingGodown ? 'Edit Godown' : 'Add Godown'}
                </h2>
              </ModalTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingGodown
                  ? 'Update godown details and assigned products.'
                  : 'Create a new godown and assign products to it.'}
              </p>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ModalBody className="py-4 space-y-4 overflow-y-auto flex-1">
            {/* Top Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={editingGodown ? 'sm:col-span-1' : 'sm:col-span-2'}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Godown Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Warehouse"
                  autoFocus
                  className="h-9 text-sm"
                />
              </div>

              {editingGodown && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Godown Type
                  </label>
                  <Select value={godownType} onValueChange={setGodownType}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Own">Own</SelectItem>
                      <SelectItem value="Transporter">Transporter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Product Assignment Section */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Assign Products
                  </label>
                  <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {selectedProductIds.length} Selected
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    disabled={filteredProducts.length === 0}
                    className="text-primary hover:underline font-medium disabled:text-slate-300 disabled:no-underline"
                  >
                    Select Visible ({filteredProducts.length})
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    disabled={selectedProductIds.length === 0}
                    className="text-slate-500 hover:text-slate-800 disabled:text-slate-300"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Search & Filter Tabs */}
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    size={14}
                  />
                  <Input
                    type="text"
                    placeholder="Search products by name, brand, category, etc..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-8 h-8 text-xs bg-slate-50/70 border-slate-200"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      filterTab === 'all'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('selected')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      filterTab === 'selected'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Selected ({selectedProductIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('unassigned')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      filterTab === 'unassigned'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Unassigned ({unassignedCount})
                  </button>
                </div>
              </div>

              {/* Products List Box */}
              <div className="max-h-60 min-h-[140px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                {filteredProducts.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    <Layers size={24} className="mx-auto mb-1.5 text-slate-300" />
                    <p>No products found matching the criteria.</p>
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const isChecked = selectedSet.has(p.product_id);
                    const isCurrentlyThisGodown =
                      editingGodown && p.godown_id === editingGodown.godown_id;
                    const isOtherGodown =
                      p.godown_id && (!editingGodown || p.godown_id !== editingGodown.godown_id);
                    const otherGodownName = isOtherGodown
                      ? godownMap.get(p.godown_id) || 'Another Godown'
                      : null;

                    return (
                      <label
                        key={p.product_id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs select-none ${
                          isChecked ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProduct(p.product_id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium truncate ${
                                isChecked ? 'text-primary' : 'text-slate-800'
                              }`}
                            >
                              {p.name}
                            </span>
                            {p.unit && (
                              <span className="text-[10px] text-slate-500 uppercase bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                {p.unit}
                              </span>
                            )}
                          </div>
                          {(p.brand_name || p.category) && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {[p.brand_name, p.category].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>

                        {/* Status Tag */}
                        <div className="shrink-0">
                          {isCurrentlyThisGodown ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                              Current
                            </span>
                          ) : isOtherGodown ? (
                            <span
                              className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium"
                              title={`Currently assigned to ${otherGodownName}. Selecting will reassign to this godown.`}
                            >
                              In: {otherGodownName}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </ModalBody>

          <ModalFooter className="pt-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : editingGodown
                ? 'Update Godown'
                : 'Save Godown'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default GodownModal;
