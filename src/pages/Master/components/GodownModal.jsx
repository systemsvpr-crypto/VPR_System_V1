import { useState, useEffect } from 'react';
import { Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import { createGodown } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const GodownModal = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!isOpen) setName(''); }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Godown name is required.'); return; }
    setSubmitting(true);
    try {
      await createGodown(name.trim());
      toast.success('Godown created successfully');
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
          <h2 className="text-xl font-bold text-slate-800">Add Godown</h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Godown Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter godown name" autoFocus />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Godown'}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default GodownModal;
