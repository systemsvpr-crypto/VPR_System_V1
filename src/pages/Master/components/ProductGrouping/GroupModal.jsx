import { useState, useEffect } from 'react';
import { FolderTree, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllGroups, createGroup, updateGroup } from '../../../../services/productGroupingService';
import { getAllProducts } from '../../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const GroupModal = ({ isOpen, onClose, user, onSuccess, editingGroup }) => {
  const [groupName, setGroupName] = useState('');
  const [productIds, setProductIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyGroupedProductIds, setAlreadyGroupedProductIds] = useState(new Set());

  const isEditing = !!editingGroup;

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadGroupedProductIds();
      if (editingGroup) {
        setGroupName(editingGroup.group_name || '');
        setProductIds((editingGroup.members || []).map(m => m.product_id));
      } else {
        setGroupName('');
        setProductIds([]);
      }
      setSearchTerm('');
    }
  }, [isOpen, editingGroup]);

  const loadProducts = async () => {
    try {
      const data = await getAllProducts();
      setProducts(data);
    } catch (err) {
      toast.error('Failed to load products');
    }
  };

  const loadGroupedProductIds = async () => {
    try {
      const groups = await getAllGroups();
      const ids = new Set();
      for (const g of groups) {
        if (editingGroup && g.group_id === editingGroup.group_id) continue;
        for (const m of g.members || []) {
          ids.add(m.product_id);
        }
      }
      setAlreadyGroupedProductIds(ids);
    } catch (err) {
      toast.error('Failed to load grouped products');
    }
  };

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !alreadyGroupedProductIds.has(p.product_id)
  );

  const toggleProduct = (productId) => {
    setProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error('Group name is required.');
      return;
    }
    if (productIds.length === 0) {
      toast.error('Select at least one product.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateGroup(editingGroup.group_id, {
          group_name: groupName.trim(),
          product_ids: productIds,
        });
        toast.success('Group updated successfully');
      } else {
        await createGroup({
          group_name: groupName.trim(),
          product_ids: productIds,
          created_by: user?.user_id,
        });
        toast.success('Group created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg">
            <FolderTree size={20} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            {isEditing ? 'Edit Product Group' : 'Create Product Group'}
          </h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. AM BLK"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">
                  Products ({productIds.length} selected)
                </label>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  type="text"
                  placeholder="Search products..."
                  className="pl-9 h-9 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {alreadyGroupedProductIds.size > 0 && (
                  <p className="px-3 py-1.5 text-xs text-amber-600 bg-amber-50 border-b border-amber-200">
                    Products already in other groups are hidden.
                  </p>
                )}
                {filteredProducts.length === 0 ? (
                  <p className="p-4 text-sm text-slate-400 text-center">No products found.</p>
                ) : (
                  filteredProducts.map(p => (
                    <label
                      key={p.product_id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={productIds.includes(p.product_id)}
                        onChange={() => toggleProduct(p.product_id)}
                        className="rounded text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-700 block truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 uppercase shrink-0">{p.unit}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : (isEditing ? 'Update Group' : 'Create Group')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default GroupModal;
