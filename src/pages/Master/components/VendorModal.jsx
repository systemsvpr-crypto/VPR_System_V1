import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createVendor, updateVendor } from '../../../services/vendorService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

const VendorModal = ({ isOpen, onClose, onSuccess, editingVendor }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingVendor;

  useEffect(() => {
    if (!isOpen) {
      if (!editingVendor) {
        setName(''); setLocation(''); setPhoneNumber(''); setEmail(''); setGstNumber('');
      }
    } else if (editingVendor) {
      setName(editingVendor.name || '');
      setLocation(editingVendor.location || '');
      setPhoneNumber(editingVendor.phone_number || '');
      setEmail(editingVendor.email || '');
      setGstNumber(editingVendor.gst_number || '');
    }
  }, [isOpen, editingVendor]);

  const validatePhone = (phone) => /^\d{10}$/.test(phone);
  const validateEmail = (email) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Vendor name is required.'); return; }
    if (phoneNumber && !validatePhone(phoneNumber)) { toast.error('Phone number must be exactly 10 digits.'); return; }
    if (email && !validateEmail(email)) { toast.error('Please enter a valid email address.'); return; }
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), location: location.trim(), phone_number: phoneNumber.trim(), email: email.trim(), gst_number: gstNumber.trim() };
      if (isEditing) {
        await updateVendor({ ...payload, vendor_id: editingVendor.vendor_id });
        toast.success('Vendor updated successfully');
      } else {
        await createVendor(payload);
        toast.success('Vendor created successfully');
      }
      onClose();
      onSuccess();
    } catch (err) { toast.error(err.message); }
    setSubmitting(false);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg"><Building2 size={20} className="text-primary" /></div>
          <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Vendor' : 'Add Vendor'}</h2>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name <span className="text-red-500">*</span></label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter vendor name" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Enter location" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-sm font-medium pointer-events-none">+91</span>
                  <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter phone number" className="pl-12" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="Enter GST number" />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : isEditing ? 'Update Vendor' : 'Save Vendor'}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default VendorModal;
