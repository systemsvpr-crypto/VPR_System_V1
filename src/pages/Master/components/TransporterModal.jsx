import { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { createTransporter, updateTransporter } from '../../../services/transporterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const TransporterModal = ({ isOpen, onClose, onSuccess, editingTransporter }) => {
  const [name, setName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverPhoneNumber, setDriverPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingTransporter;

  useEffect(() => {
    if (!isOpen) {
      if (!editingTransporter) {
        setName(''); setVehicleNumber(''); setDriverPhoneNumber('');
      }
    } else if (editingTransporter) {
      setName(editingTransporter.name || '');
      setVehicleNumber(editingTransporter.vehicle_number || '');
      setDriverPhoneNumber(editingTransporter.driver_phone_number || '');
    }
  }, [isOpen, editingTransporter]);

  const validatePhone = (phone) => /^\d{10}$/.test(phone);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Transporter name is required.'); return; }
    if (driverPhoneNumber && !validatePhone(driverPhoneNumber)) { toast.error('Phone number must be exactly 10 digits.'); return; }
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), vehicle_number: vehicleNumber.trim(), driver_phone_number: driverPhoneNumber.trim() };
      if (isEditing) {
        await updateTransporter({ ...payload, transporter_id: editingTransporter.transporter_id });
        toast.success('Transporter updated successfully');
      } else {
        await createTransporter(payload);
        toast.success('Transporter created successfully');
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
          <div className="bg-primary/10 p-2 rounded-lg"><Truck size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Transporter' : 'Add Transporter'}</h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Transporter Name <span className="text-red-500">*</span></label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter transporter name" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Number</label>
                <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="CG04AR5695" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Driver Phone Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-sm font-medium pointer-events-none">+91</span>
                  <Input value={driverPhoneNumber} onChange={(e) => setDriverPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter driver phone number" className="pl-12" />
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : isEditing ? 'Update Transporter' : 'Save Transporter'}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default TransporterModal;
