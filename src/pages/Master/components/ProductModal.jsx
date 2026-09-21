import { useState, useEffect, useMemo } from 'react';
import { Package, Trash2, AlertTriangle, Plus, FolderPlus, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { createProduct, updateProduct, deleteProduct, getAllProducts } from '../../../services/masterService';
import { getAllGroups } from '../../../services/productGroupingService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';

const createEmptyProduct = (defaultUnit = 'bag') => ({
  id: Date.now() + Math.random(),
  product_type: '',
  unit: defaultUnit,
  mux: '',
});

const createEmptyGroupBlock = () => ({
  id: Date.now() + Math.random(),
  group_id: '',
  isCreatingNewGroup: false,
  brand_name: '',
  category: '',
  products: [createEmptyProduct()],
});

const ProductModal = ({
  isOpen,
  onClose,
  godowns = [],
  groups: propGroups = [],
  products: propProducts = [],
  user,
  onSuccess,
  editingProduct,
  onDelete,
  quickAdd = false,
  initialValues = null,
}) => {
  const [groups, setGroups] = useState(propGroups);
  const [products, setProducts] = useState(propProducts);

  const [groupBlocks, setGroupBlocks] = useState([createEmptyGroupBlock()]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState('');

  const isEditing = !!editingProduct;
  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER ADMIN';

  // Sync prop changes
  useEffect(() => {
    if (propGroups && propGroups.length > 0) {
      setGroups(propGroups);
    }
  }, [propGroups]);

  useEffect(() => {
    if (propProducts && propProducts.length > 0) {
      setProducts(propProducts);
    }
  }, [propProducts]);

  // Fallback fetch if modal opened where parent didn't pass groups or products
  useEffect(() => {
    if (isOpen) {
      if (!propGroups || propGroups.length === 0) {
        getAllGroups().then(setGroups).catch(() => { });
      }
      if (!propProducts || propProducts.length === 0) {
        getAllProducts().then(setProducts).catch(() => { });
      }
    }
  }, [isOpen, propGroups, propProducts]);

  // Map of group_id -> { brand_name, category }
  const groupDetailsMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => {
      if (p.group_id && !map.has(p.group_id)) {
        map.set(p.group_id, {
          brand_name: p.brand_name || '',
          category: p.category || '',
        });
      }
    });
    (groups || []).forEach(g => {
      if (!map.has(g.group_id)) {
        const memberProdId = g.members?.[0]?.product_id || g.allProducts?.[0]?.product_id;
        if (memberProdId) {
          const prod = (products || []).find(p => p.product_id === memberProdId);
          if (prod) {
            map.set(g.group_id, {
              brand_name: prod.brand_name || '',
              category: prod.category || '',
            });
          }
        }
      }
    });
    return map;
  }, [products, groups]);

  const groupOptions = useMemo(() => {
    return (groups || [])
      .map(g => ({
        value: g.group_id,
        label: g.group_name || 'Unnamed Group',
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [groups]);

  // Initialize or reset form groupBlocks when modal opens / closes
  useEffect(() => {
    if (!isOpen) {
      setGroupBlocks([createEmptyGroupBlock()]);
      setDuplicateNotice('');
    } else if (editingProduct) {
      let initialGroupId = editingProduct.group_id || '';
      if (!initialGroupId && (editingProduct.brand_name || editingProduct.category)) {
        const combined = `${(editingProduct.brand_name || '').trim()}${(editingProduct.category || '').trim()}`.toLowerCase();
        const found = (groups || []).find(g => (g.group_name || '').trim().toLowerCase() === combined);
        if (found) initialGroupId = found.group_id;
      }
      setGroupBlocks([{
        id: Date.now(),
        group_id: initialGroupId,
        isCreatingNewGroup: false,
        brand_name: editingProduct.brand_name || '',
        category: editingProduct.category || '',
        products: [{
          id: Date.now() + 1,
          product_type: editingProduct.product_type || '',
          unit: editingProduct.unit || 'bag',
          mux: editingProduct.mux || '',
        }],
      }]);
      setDuplicateNotice('');
    } else if (initialValues) {
      setGroupBlocks([{
        id: Date.now(),
        group_id: initialValues.group_id || '',
        isCreatingNewGroup: false,
        brand_name: initialValues.brand_name || '',
        category: initialValues.category || '',
        products: [{
          id: Date.now() + 1,
          product_type: initialValues.product_type || '',
          unit: initialValues.unit || 'bag',
          mux: initialValues.mux || '',
        }],
      }]);
      setDuplicateNotice('');
    } else {
      setGroupBlocks([createEmptyGroupBlock()]);
      setDuplicateNotice('');
    }
  }, [isOpen, editingProduct, initialValues]);

  // If group arrived after modal opened with editingProduct without group_id
  useEffect(() => {
    if (isOpen && editingProduct && groups.length > 0) {
      setGroupBlocks(prev => {
        if (prev.length === 1 && !prev[0].group_id && !prev[0].isCreatingNewGroup) {
          const combined = `${(editingProduct.brand_name || '').trim()}${(editingProduct.category || '').trim()}`.toLowerCase();
          const found = groups.find(g => (g.group_name || '').trim().toLowerCase() === combined);
          if (found) {
            return [{ ...prev[0], group_id: found.group_id }];
          }
        }
        return prev;
      });
    }
  }, [isOpen, editingProduct, groups]);

  const addProductToGroup = (gIdx) => {
    setGroupBlocks(prev => {
      const next = [...prev];
      const g = next[gIdx];
      const lastUnit = g.products[g.products.length - 1]?.unit || 'bag';
      next[gIdx] = {
        ...g,
        products: [...g.products, createEmptyProduct(lastUnit)],
      };
      return next;
    });
  };

  const removeProductFromGroup = (gIdx, pIdx) => {
    setGroupBlocks(prev => {
      const next = [...prev];
      const g = next[gIdx];
      next[gIdx] = {
        ...g,
        products: g.products.filter((_, i) => i !== pIdx),
      };
      return next;
    });
  };

  const updateProductInGroup = (gIdx, pIdx, patch) => {
    setDuplicateNotice('');
    setGroupBlocks(prev => {
      const next = [...prev];
      const g = next[gIdx];
      const prods = [...g.products];
      prods[pIdx] = { ...prods[pIdx], ...patch };
      next[gIdx] = { ...g, products: prods };
      return next;
    });
  };

  const addGroupBlock = () => {
    setGroupBlocks(prev => [...prev, createEmptyGroupBlock()]);
  };

  const removeGroupBlock = (gIdx) => {
    setGroupBlocks(prev => prev.filter((_, i) => i !== gIdx));
  };

  const updateGroupBlock = (gIdx, patch) => {
    setDuplicateNotice('');
    setGroupBlocks(prev => {
      const next = [...prev];
      next[gIdx] = { ...next[gIdx], ...patch };
      return next;
    });
  };

  const handleGroupChange = (gIdx, groupId) => {
    if (!groupId) {
      updateGroupBlock(gIdx, { group_id: '', brand_name: '', category: '' });
      return;
    }
    const details = groupDetailsMap.get(groupId);
    const selectedGroup = groups.find(g => g.group_id === groupId);
    const brand = details?.brand_name || selectedGroup?.group_name || '';
    const cat = details?.category || '';
    updateGroupBlock(gIdx, { group_id: groupId, brand_name: brand, category: cat });
  };

  const totalProductsCount = useMemo(() => {
    return groupBlocks.reduce((sum, g) => sum + g.products.length, 0);
  }, [groupBlocks]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all groups and their products
    for (let gIdx = 0; gIdx < groupBlocks.length; gIdx++) {
      const g = groupBlocks[gIdx];
      const prefix = groupBlocks.length > 1 ? `Group ${gIdx + 1}: ` : '';
      if (!g.brand_name.trim()) {
        toast.error(`${prefix}Brand name is required. Please select a group or enter a brand name.`);
        return;
      }
    }

    // Check duplicate keys across the entire form
    const seenKeys = new Set();
    let productCounter = 1;
    for (let gIdx = 0; gIdx < groupBlocks.length; gIdx++) {
      const g = groupBlocks[gIdx];
      for (let pIdx = 0; pIdx < g.products.length; pIdx++) {
        const p = g.products[pIdx];
        const key = `${(g.brand_name || '').trim().toLowerCase()}|${(g.category || '').trim().toLowerCase()}|${(p.product_type || '').trim().toLowerCase()}|${(p.mux || '').trim().toLowerCase()}`;
        if (seenKeys.has(key)) {
          toast.error(`Product ${productCounter} has the exact same Brand, Category, Size & Mux as another product in this form.`);
          return;
        }
        seenKeys.add(key);
        productCounter++;
      }
    }

    setDuplicateNotice('');
    setSubmitting(true);

    try {
      if (isEditing) {
        const g = groupBlocks[0];
        const p = g.products[0];
        let formattedMux = (p.mux || '').trim();
        if (formattedMux && !/kg$/i.test(formattedMux)) {
          formattedMux = `${formattedMux} Kg`;
        }
        const baseName = [g.brand_name, g.category, p.product_type].map(v => (v || '').trim()).filter(Boolean).join(' ');
        const computedName = formattedMux ? `${baseName} (${formattedMux})` : baseName;

        const targetGroupId = g.isCreatingNewGroup ? null : (g.group_id || null);

        const updated = await updateProduct({
          product_id: editingProduct.product_id,
          name: computedName,
          unit: p.unit,
          product_type: p.product_type.trim(),
          brand_name: g.brand_name.trim(),
          category: g.category.trim(),
          mux: formattedMux,
          allow_negative_stock: false,
          group_id: targetGroupId,
        });

        toast.success('Product updated successfully');
        onClose();
        onSuccess(updated);
      } else {
        const createdProducts = [];
        for (const g of groupBlocks) {
          const targetGroupId = g.isCreatingNewGroup ? null : (g.group_id || null);
          for (const p of g.products) {
            let formattedMux = (p.mux || '').trim();
            if (formattedMux && !/kg$/i.test(formattedMux)) {
              formattedMux = `${formattedMux} Kg`;
            }
            const baseName = [g.brand_name, g.category, p.product_type].map(v => (v || '').trim()).filter(Boolean).join(' ');
            const computedName = formattedMux ? `${baseName} (${formattedMux})` : baseName;

            const created = await createProduct({
              name: computedName,
              unit: p.unit,
              product_type: p.product_type.trim(),
              brand_name: g.brand_name.trim(),
              category: g.category.trim(),
              mux: formattedMux,
              allow_negative_stock: false,
              group_id: targetGroupId,
              created_by: user?.user_id,
            });
            createdProducts.push(created);
          }
        }

        toast.success(
          createdProducts.length > 1
            ? `${createdProducts.length} products created successfully`
            : 'Product created successfully'
        );
        onClose();
        onSuccess(createdProducts[0]);
      }
    } catch (err) {
      if (err.code === 'DUPLICATE_PRODUCT') {
        setDuplicateNotice(err.message);
      } else {
        toast.error(err.message);
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete product "${editingProduct?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteProduct(editingProduct.product_id);
      toast.success('Product deleted successfully');
      onClose();
      onSuccess();
      if (onDelete) onDelete();
    } catch (err) { toast.error(err.message); }
    setDeleting(false);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className={quickAdd ? "max-w-4xl z-[60]" : "max-w-4xl"}>
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><Package size={20} className="text-primary" /></div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">
              {isEditing ? 'Edit Product' : (totalProductsCount > 1 ? `Add Products (${totalProductsCount})` : 'Add Product')}
            </h2>
          </ModalTitle>
        </ModalHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ModalBody className="space-y-4">
            {duplicateNotice && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{duplicateNotice}</span>
              </div>
            )}

            {groupBlocks.map((group, gIdx) => {
              const derivedGroupName = `${(group.brand_name || '').trim()}${(group.category || '').trim()}`;

              return (
                <div key={group.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3.5 relative">
                  {/* Group Block Header (if multiple groups exist) */}
                  {!isEditing && groupBlocks.length > 1 && (
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FolderPlus size={14} className="text-primary" /> Group {gIdx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGroupBlock(gIdx)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors flex items-center gap-1 text-xs"
                        title="Remove this group"
                      >
                        <Trash2 size={14} /> Remove Group
                      </button>
                    </div>
                  )}

                  {/* Single Row: Group Name, Brand Name, Category */}
                  <div className="grid grid-cols-3 gap-3 items-start">
                    {/* 1. Group Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1 h-5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Group Name <span className="text-red-500">*</span>
                        </label>
                        {group.isCreatingNewGroup ? (
                          <button
                            type="button"
                            onClick={() => updateGroupBlock(gIdx, { isCreatingNewGroup: false, group_id: '', brand_name: '', category: '' })}
                            className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                          >
                            <ArrowLeft size={11} /> Select Group
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {group.group_id && (
                              <button
                                type="button"
                                onClick={() => updateGroupBlock(gIdx, { group_id: '', brand_name: '', category: '' })}
                                className="text-[11px] text-slate-400 hover:text-red-500 font-medium"
                              >
                                Clear
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => updateGroupBlock(gIdx, { isCreatingNewGroup: true, group_id: '', brand_name: '', category: '' })}
                              className="text-[11px] text-primary hover:underline font-medium flex items-center gap-0.5"
                            >
                              <Plus size={11} /> New Group
                            </button>
                          </div>
                        )}
                      </div>

                      {group.isCreatingNewGroup ? (
                        <div className="h-9 px-2.5 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <FolderPlus size={14} className="text-primary shrink-0" />
                            <span className="font-semibold text-slate-800 truncate">
                              {derivedGroupName || <span className="text-slate-400 italic font-normal">Auto (Brand + Category)</span>}
                            </span>
                          </div>
                          <span className="text-[9px] text-primary font-medium bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                            New Group
                          </span>
                        </div>
                      ) : (
                        <Dropdown
                          value={group.group_id}
                          onValueChange={(val) => handleGroupChange(gIdx, val)}
                          options={groupOptions}
                          placeholder="Select Group..."
                          searchPlaceholder="Search group..."
                          className="w-full h-9 text-xs"
                          onAddNew={() => updateGroupBlock(gIdx, { isCreatingNewGroup: true, group_id: '', brand_name: '', category: '' })}
                          addNewLabel="+ Add New Group"
                          renderOption={(opt) => {
                            const details = groupDetailsMap.get(opt.value);
                            return (
                              <div className="flex flex-col py-0.5">
                                <span className="font-medium text-slate-800 text-xs">{opt.label}</span>
                                {details && (details.brand_name || details.category) && (
                                  <span className="text-[10px] text-slate-500">
                                    {[details.brand_name, details.category].filter(Boolean).join(' • ')}
                                  </span>
                                )}
                              </div>
                            );
                          }}
                        />
                      )}
                    </div>

                    {/* 2. Brand Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1 h-5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Brand Name <span className="text-red-500">*</span>
                        </label>
                      </div>
                      <Input
                        value={group.brand_name}
                        onChange={(e) => updateGroupBlock(gIdx, { brand_name: e.target.value })}
                        placeholder="Ex: Ambuja"
                        readOnly={!group.isCreatingNewGroup && !!group.group_id}
                        className={`h-9 text-xs ${!group.isCreatingNewGroup && group.group_id ? "bg-slate-50 text-slate-700 cursor-not-allowed border-dashed" : ""}`}
                      />
                    </div>

                    {/* 3. Category */}
                    <div>
                      <div className="flex items-center justify-between mb-1 h-5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Category
                        </label>
                      </div>
                      <Input
                        value={group.category}
                        onChange={(e) => updateGroupBlock(gIdx, { category: e.target.value })}
                        placeholder="Ex: Cement"
                        readOnly={!group.isCreatingNewGroup && !!group.group_id}
                        className={`h-9 text-xs ${!group.isCreatingNewGroup && group.group_id ? "bg-slate-50 text-slate-700 cursor-not-allowed border-dashed" : ""}`}
                      />
                    </div>
                  </div>

                  {/* Single Row: Size, Unit, Mux, Product Name */}
                  <div className="space-y-2 pt-1">
                    {/* Header for Product Row */}
                    <div className="grid grid-cols-12 gap-2.5 px-0.5 text-xs font-semibold text-slate-700">
                      <div className="col-span-3">
                        Size <span className="text-slate-400 font-normal">(Product Type)</span>
                      </div>
                      <div className="col-span-2">Unit</div>
                      <div className="col-span-2">Mux (Weight)</div>
                      <div className={group.products.length > 1 && !isEditing ? "col-span-4" : "col-span-5"}>
                        Product Name <span className="text-slate-400 font-normal">(Preview)</span>
                      </div>
                      {group.products.length > 1 && !isEditing && <div className="col-span-1"></div>}
                    </div>

                    {/* Product Rows */}
                    {group.products.map((prod, pIdx) => {
                      const baseName = [group.brand_name, group.category, prod.product_type].map(v => (v || '').trim()).filter(Boolean).join(' ');
                      let formattedMux = (prod.mux || '').trim();
                      if (formattedMux && !/kg$/i.test(formattedMux)) {
                        formattedMux = `${formattedMux} Kg`;
                      }
                      const computedName = formattedMux ? `${baseName} (${formattedMux})` : baseName;

                      return (
                        <div key={prod.id} className="grid grid-cols-12 gap-2.5 items-center">
                          {/* 1. Size */}
                          <div className="col-span-3">
                            <Input
                              value={prod.product_type}
                              onChange={(e) => updateProductInGroup(gIdx, pIdx, { product_type: e.target.value })}
                              placeholder="Ex: 10*12"
                              className="h-9 text-xs"
                            />
                          </div>

                          {/* 2. Unit */}
                          <div className="col-span-2">
                            <Select value={prod.unit} onValueChange={(v) => updateProductInGroup(gIdx, pIdx, { unit: v })}>
                              <SelectTrigger className="w-full h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Unit</SelectLabel>
                                  {['bag', 'kg'].map(u => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 3. Mux (Weight) */}
                          <div className="col-span-2">
                            <Input
                              value={prod.mux}
                              onChange={(e) => updateProductInGroup(gIdx, pIdx, { mux: e.target.value })}
                              placeholder="Ex: 32 Kg"
                              className="h-9 text-xs"
                            />
                          </div>

                          {/* 4. Product Name */}
                          <div className={group.products.length > 1 && !isEditing ? "col-span-4" : "col-span-5"}>
                            <Input
                              value={computedName}
                              disabled
                              readOnly
                              placeholder="Auto-generated name"
                              className="h-9 text-xs bg-slate-50 text-slate-600 truncate font-medium"
                              title={computedName}
                            />
                          </div>

                          {/* Remove row button */}
                          {group.products.length > 1 && !isEditing && (
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => removeProductFromGroup(gIdx, pIdx)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                title="Remove this product"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions for this Group: Add Another Product & Add New Group */}
                  {!isEditing && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => addProductToGroup(gIdx)}
                        className="text-xs font-semibold text-primary hover:text-primary/90 flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-all shadow-2xs"
                      >
                        <Plus size={14} /> Add Another Product
                      </button>
                      <button
                        type="button"
                        onClick={addGroupBlock}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-all shadow-2xs"
                      >
                        <FolderPlus size={14} className="text-primary" /> Add New Group
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom Add New Group Button when multiple groups exist */}
            {!isEditing && groupBlocks.length > 1 && (
              <button
                type="button"
                onClick={addGroupBlock}
                className="w-full py-2.5 px-4 border-2 border-dashed border-slate-200 hover:border-primary/50 rounded-xl text-xs font-semibold text-slate-600 hover:text-primary hover:bg-slate-50/80 transition-all flex items-center justify-center gap-2"
              >
                <FolderPlus size={15} className="text-primary" />
                <span>+ Add New Group</span>
              </button>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {isEditing && isSuperAdmin && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} className="mr-auto">
                <Trash2 size={16} className="mr-1" />
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : isEditing
                  ? 'Update Product'
                  : totalProductsCount > 1
                    ? `Save (${totalProductsCount}) Products`
                    : 'Save Product'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ProductModal;
