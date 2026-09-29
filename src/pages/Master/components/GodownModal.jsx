import { useState, useEffect } from 'react';
import { Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import { createGodown, updateGodown } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/ui/modal';

const GodownModal = ({ isOpen, onClose, onSuccess, editingGodown }) => {
  const [name, setName] = useState('');
  const [godownType, setGodownType] = useState('Own');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(isOpen && editingGodown ? editingGodown.name || '' : '');
    setGodownType(isOpen && editingGodown ? editingGodown.godown_type || 'Own' : 'Own');
  }, [isOpen, editingGodown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Godown name is required.'); return; }
    setSubmitting(true);
    try {
      if (editingGodown) {
        await updateGodown(editingGodown.godown_id, { name: name.trim(), godownType });
        toast.success('Godown updated successfully');
      } else {
        await createGodown(name.trim());
        toast.success('Godown created successfully');
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
          <div className="bg-primary/10 p-2 rounded-lg"><Warehouse size={20} className="text-primary" /></div>
          <ModalTitle asChild>
            <h2 className="text-xl font-bold text-slate-800">{editingGodown ? 'Edit Godown' : 'Add Godown'}</h2>
          </ModalTitle>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Godown Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter godown name" autoFocus />
            </div>
            {editingGodown && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Godown Type</label>
                <Select value={godownType} onValueChange={setGodownType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select godown type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Own">Own</SelectItem>
                    <SelectItem value="Transporter">Transporter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : (editingGodown ? 'Update Godown' : 'Save Godown')}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default GodownModal;
