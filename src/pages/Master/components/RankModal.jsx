import { useState, useEffect } from 'react';
import { Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { createRank, updateRank } from '../../../services/rankService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';

const RankModal = ({ isOpen, onClose, onSuccess, editingRank }) => {
  const [rankName, setRankName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingRank;

  useEffect(() => {
    if (!isOpen) {
      setRankName('');
    } else if (editingRank) {
      setRankName(editingRank.rank_name || '');
    }
  }, [isOpen, editingRank]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rankName.trim()) { toast.error('Rank name is required.'); return; }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateRank(editingRank.rank_id, rankName.trim());
        toast.success('Rank updated successfully');
      } else {
        await createRank(rankName.trim());
        toast.success('Rank created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><Award size={20} className="text-primary" /></div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Rank' : 'Add Rank'}</h2>
          </ModalTitle>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rank Name <span className="text-red-500">*</span></label>
              <Input value={rankName} onChange={(e) => setRankName(e.target.value)} placeholder="Enter rank name" autoFocus />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (isEditing ? 'Update Rank' : 'Save Rank')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default RankModal;
