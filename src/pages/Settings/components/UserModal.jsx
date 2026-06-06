import { useState, useEffect } from 'react';
import { User, Mail, Shield, Phone, Camera, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../../store/authStore';
import {
  createUser, updateUser, checkUsernameExists, checkUserIdExists,
} from '../../../services/settingsService';
import { uploadProfilePicture } from '../../../services/storageService';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { USER_ROLES, GENDERS, PAGES, DEFAULT_USER_PAGES, PAGE_TABS } from '../../../constants';

const DEFAULT_FORM_DATA = {
  user_id: '', full_name: '', email: '', password: '', role: USER_ROLES[USER_ROLES.length - 1],
  designation: '', page_access: DEFAULT_USER_PAGES, tab_access: {},
  phone_number: '', date_of_birth: '',
  gender: '', current_address: '', username: '', is_active: true, profile_picture: ''
};

const UserModal = ({ isOpen, onClose, editingUser, users, onSuccess }) => {
  const { user: currentUser } = useAuthStore();
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen && editingUser) {
      setFormData({
        ...DEFAULT_FORM_DATA, ...editingUser,
        password: editingUser.password || '',
        role: editingUser.role || USER_ROLES[USER_ROLES.length - 1],
        page_access: editingUser.page_access || DEFAULT_USER_PAGES,
        tab_access: editingUser.tab_access || {},
        profile_picture: editingUser.profile_picture || '',
        designation: editingUser.designation || '',
        phone_number: editingUser.phone_number || '',
        date_of_birth: editingUser.date_of_birth || '',
        gender: editingUser.gender || '',
        current_address: editingUser.current_address || '',
        username: editingUser.username || '',
        email: editingUser.email || '',
        full_name: editingUser.full_name || ''
      });
    } else if (isOpen) {
      setFormData(DEFAULT_FORM_DATA);
    }
    setErrors({});
  }, [isOpen, editingUser]);

  const handleClose = () => {
    setFormData(DEFAULT_FORM_DATA);
    setErrors({});
    onClose();
  };

  const validateField = (name, value) => {
    if (name === 'phone_number') return value.replace(/[^0-9]/g, '').slice(0, 10);
    if (name === 'user_id') return value.replace(/^0+/, '').toUpperCase();
    if (name === 'username') return value.replace(/\s/g, '');
    return value;
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    let newValue = type === 'checkbox' ? checked : value;
    if (['phone_number', 'user_id', 'username'].includes(name)) newValue = validateField(name, value);
    setFormData(prev => {
      const newState = { ...prev, [name]: newValue };
      if (name === 'role' && USER_ROLES.slice(0, -1).some(r => r.toLowerCase() === newValue?.toLowerCase())) {
        newState.page_access = PAGES.map(p => p.id);
        newState.tab_access = Object.fromEntries(
          Object.entries(PAGE_TABS).map(([pageId, tabs]) => [pageId, tabs.map(t => t.id)])
        );
      }
      return newState;
    });
    if (name === 'user_id' || name === 'username') {
      const duplicate = users.find(u => u[name] === newValue);
      const isConflict = duplicate && (!editingUser || duplicate.user_id !== editingUser.user_id);
      if (isConflict) setErrors(prev => ({ ...prev, [name]: `This ${name} is already taken` }));
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploading(true);
      const publicUrl = await uploadProfilePicture(file);
      setFormData(prev => ({ ...prev, profile_picture: publicUrl }));
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Error uploading image: ' + error.message);
    } finally { setUploading(false); }
  };

  const handlePageAccessToggle = (pageId) => {
    setFormData(prev => {
      const currentAccess = prev.page_access || [];
      if (currentAccess.includes(pageId)) {
        const { [pageId]: _, ...rest } = prev.tab_access || {};
        return { ...prev, page_access: currentAccess.filter(id => id !== pageId), tab_access: rest };
      }
      const pageTabs = PAGE_TABS[pageId];
      const tabAccessUpdate = pageTabs ? { [pageId]: pageTabs.map(t => t.id) } : {};
      return {
        ...prev,
        page_access: [...currentAccess, pageId],
        tab_access: { ...prev.tab_access, ...tabAccessUpdate },
      };
    });
  };

  const handleTabAccessToggle = (pageId, tabId) => {
    setFormData(prev => {
      const currentTabs = prev.tab_access?.[pageId] || [];
      const pageTabs = PAGE_TABS[pageId]?.map(t => t.id) || [];
      if (currentTabs.includes(tabId)) {
        const updated = currentTabs.filter(id => id !== tabId);
        return { ...prev, tab_access: { ...prev.tab_access, [pageId]: updated } };
      }
      return { ...prev, tab_access: { ...prev.tab_access, [pageId]: [...currentTabs, tabId] } };
    });
  };

  const handleSelectAllTabs = (pageId) => {
    setFormData(prev => {
      const pageTabs = PAGE_TABS[pageId]?.map(t => t.id) || [];
      return { ...prev, tab_access: { ...prev.tab_access, [pageId]: [...pageTabs] } };
    });
  };

  const handleDeselectAllTabs = (pageId) => {
    setFormData(prev => {
      const { [pageId]: _, ...rest } = prev.tab_access || {};
      return { ...prev, tab_access: rest };
    });
  };

  const validateForm = (data) => {
    const newErrors = {};
    if (editingUser && !data.user_id) newErrors.user_id = 'User ID is required';
    if (!data.username) newErrors.username = 'Username is required';
    else if (/\s/.test(data.username)) newErrors.username = 'Username cannot contain spaces';
    else if (!/^[a-zA-Z0-9]+$/.test(data.username)) newErrors.username = 'Username must be alphanumeric only (a-z, A-Z, 0-9)';
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) newErrors.email = 'Invalid email address';
    if (!data.full_name) newErrors.full_name = 'Full Name is required';
    if (!editingUser && !data.password) newErrors.password = 'Password is required';
    if (data.phone_number && data.phone_number.length !== 10) newErrors.phone_number = 'Phone number must be exactly 10 digits';
    return newErrors;
  };

  const scrollToField = (fieldName) => {
    requestAnimationFrame(() => {
      const element = document.getElementsByName(fieldName)[0];
      if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.focus(); }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanedData = {
      ...formData, user_id: editingUser ? formData.user_id?.trim() : undefined,
      username: formData.username?.trim(), email: formData.email?.trim(), full_name: formData.full_name?.trim()
    };
    const formErrors = validateForm(cleanedData);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors); scrollToField(Object.keys(formErrors)[0]);
      toast.error('Please Fill the required fields'); return;
    }
    try {
      const checks = [checkUsernameExists(cleanedData.username)];
      if (cleanedData.user_id) checks.push(checkUserIdExists(cleanedData.user_id));
      const [usernameCheck, userCheck] = await Promise.all(checks);
      const conflictErrors = {};
      const existingIdUser = userCheck?.[0];
      if (existingIdUser && (!editingUser || existingIdUser.user_id !== editingUser.user_id)) conflictErrors.user_id = 'This User ID is already assigned to another user';
      const existingNameUser = usernameCheck[0];
      if (existingNameUser && (!editingUser || existingNameUser.user_id !== editingUser.user_id)) conflictErrors.username = 'This Username is already taken';
      if (Object.keys(conflictErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...conflictErrors })); scrollToField(Object.keys(conflictErrors)[0]);
        toast.error('Duplicate entry found'); return;
      }
      const userData = { ...cleanedData };
      if (!userData.date_of_birth) userData.date_of_birth = null;
      if (editingUser && !userData.password) delete userData.password;
      if (editingUser) {
        await updateUser(editingUser.user_id, userData);
        toast.success('User updated successfully');
        if (currentUser && currentUser.user_id === editingUser.user_id) {
          const updatedUserCompat = { ...currentUser, ...userData, Name: userData.full_name, Admin: (userData.role && USER_ROLES.slice(0, -1).some(r => r.toLowerCase() === userData.role.toLowerCase())) ? 'Yes' : 'No' };
          useAuthStore.getState().login(updatedUserCompat);
          localStorage.setItem('user', JSON.stringify(updatedUserCompat));
        }
      } else {
        await createUser(userData);
        toast.success('User created successfully');
      }
      handleClose();
      onSuccess();
    } catch (error) {
      if (error.message?.includes('invalid input syntax for type date')) {
        setErrors(prev => ({ ...prev, date_of_birth: 'Invalid date format' }));
        toast.error('Please check the date fields');
      } else { toast.error(`Error: ${error.message}`); }
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent className="max-w-4xl">
        <ModalHeader>
          <div className="bg-primary/10 p-2 rounded-lg">
            {editingUser ? <Shield size={20} className="text-primary" /> : <User size={20} className="text-primary" />}
          </div>
          <ModalTitle className="text-xl font-bold text-slate-800">{editingUser ? 'Edit User' : 'Add New User'}</ModalTitle>
        </ModalHeader>
        <ModalDescription className="sr-only">{editingUser ? 'Edit user details' : 'Create a new user'}</ModalDescription>

        <div className="overflow-y-auto max-h-[60vh] p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            <div className="col-span-1 md:col-span-2 flex flex-col items-center mb-4">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-100 flex items-center justify-center shadow-sm">
                  {formData.profile_picture ? (
                    <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : <User size={40} className="text-slate-400" />}
                </div>
                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-md">
                  {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Camera size={16} />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              </div>
              <p className="text-xs text-slate-400 mt-2">Allowed *.jpeg, *.jpg, *.png, *.gif</p>
            </div>

            <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Account Information</h3>
            </div>

            <FormField label="Username" name="username" value={formData.username} onChange={handleInputChange} required error={errors.username} icon={User} placeholder="jdoe" className="italic" />
            <FormField label="Email" name="email" type="email" value={formData.email} onChange={handleInputChange} error={errors.email} icon={Mail} placeholder="john@example.com" />
            <FormField label="Password" name="password" type="text" value={formData.password} onChange={handleInputChange} required={!editingUser} error={errors.password} icon={Shield} placeholder={editingUser ? "Leave empty to keep current" : "Enter password"} />

            <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Personal Details</h3>
            </div>

            <FormField label="Full Name" name="full_name" value={formData.full_name} onChange={handleInputChange} required error={errors.full_name} icon={User} placeholder="John Doe" />
            <FormField label="Phone Number" name="phone_number" value={formData.phone_number} onChange={handleInputChange} error={errors.phone_number} icon={Phone} placeholder="10 digit number" />

            <SelectField label="Gender" name="gender" value={formData.gender} onChange={handleInputChange} options={GENDERS} />
            <DateField label="Date of Birth" name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange} error={errors.date_of_birth} />

            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Address</label>
              <textarea name="current_address" value={formData.current_address} onChange={handleInputChange}
                rows="2" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                placeholder="Enter address"></textarea>
            </div>

            <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Role & Permissions</h3>
            </div>

            <SelectField label="Role" name="role" value={formData.role} onChange={handleInputChange} options={USER_ROLES} />
            <FormField label="Designation" name="designation" value={formData.designation} onChange={handleInputChange} icon={Shield} placeholder="Eg: Accountant" />

            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Page Access</label>
                <div className="flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => setFormData(prev => ({
                    page_access: PAGES.map(p => p.id),
                    tab_access: Object.fromEntries(
                      Object.entries(PAGE_TABS).map(([pageId, tabs]) => [pageId, tabs.map(t => t.id)])
                    ),
                  }))} className="text-primary hover:underline font-medium">Select All</button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, page_access: [], tab_access: {} }))}
                    className="text-slate-400 hover:text-slate-600 hover:underline">None</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PAGES.map(page => {
                  const isPageChecked = formData.page_access?.includes(page.id) || false;
                  const pageTabs = PAGE_TABS[page.id];
                  const hasTabs = !!pageTabs?.length;
                  const selectedTabs = formData.tab_access?.[page.id] || [];
                  const allTabsSelected = hasTabs && pageTabs.every(t => selectedTabs.includes(t.id));
                  const selectedCount = selectedTabs.length;
                  const totalCount = pageTabs?.length || 0;
                  return (
                    <div key={page.id}
                      className={`rounded-lg border transition-all ${isPageChecked ? 'bg-white border-primary/30 shadow-sm' : 'bg-slate-50/50 border-slate-200'}`}>
                      <label className={`flex items-center justify-between px-3.5 py-3 cursor-pointer rounded-t-lg ${isPageChecked ? '' : 'rounded-lg'}`}>
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" checked={isPageChecked}
                            onChange={() => handlePageAccessToggle(page.id)}
                            className="rounded text-primary focus:ring-primary" />
                          <span className={`text-sm font-medium ${isPageChecked ? 'text-slate-900' : 'text-slate-500'}`}>{page.label}</span>
                        </div>
                        {hasTabs && isPageChecked && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allTabsSelected ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                            {selectedCount}/{totalCount}
                          </span>
                        )}
                      </label>
                      {isPageChecked && hasTabs && (
                        <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-100">
                          <div className="flex items-center gap-3 mt-2.5 mb-2">
                            <span className="text-xs text-slate-400 font-medium">Sub-tabs</span>
                            <div className="flex items-center gap-2 text-xs ml-auto">
                              <button type="button" onClick={() => handleSelectAllTabs(page.id)}
                                className="text-primary hover:underline">Select All</button>
                              {!allTabsSelected && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <button type="button" onClick={() => handleDeselectAllTabs(page.id)}
                                    className="text-slate-400 hover:text-slate-600 hover:underline">None</button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {pageTabs.map(tab => (
                              <label key={tab.id} className="flex items-center gap-2 cursor-pointer py-1 px-1 rounded hover:bg-slate-50 transition-colors">
                                <input type="checkbox" checked={selectedTabs.includes(tab.id)}
                                  onChange={() => handleTabAccessToggle(page.id, tab.id)}
                                  className="rounded text-primary focus:ring-primary" />
                                <span className="text-sm text-slate-600">{tab.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 mt-2">
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                <div className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </div>
                <div>
                  <span className="block text-sm font-medium text-slate-900">Active Account</span>
                  <span className="block text-xs text-slate-500">Allow this user to log in</span>
                </div>
              </label>
            </div>
          </form>
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={handleClose} className="px-5">Cancel</Button>
          <Button onClick={handleSubmit} className="px-5">
            {editingUser ? 'Save Changes' : 'Create User'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const FormField = ({ label, icon: Icon, className = "", ...props }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">{label} {props.required && <span className="text-red-500">*</span>}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />}
      <Input className={`${Icon ? 'pl-10' : 'pl-4'} pr-4 h-10 w-full ${className}`} {...props} />
    </div>
    {props.error && <p className="text-red-500 text-xs mt-1 animate-in slide-in-from-top-1">{props.error}</p>}
  </div>
);

const SelectField = ({ label, options, name, value, onChange, placeholder, ...props }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">{label}</label>
    <Select name={name} value={value} onValueChange={(val) => onChange({ target: { name, value: val } })} {...props}>
      <SelectTrigger className="w-full h-10">
        <SelectValue placeholder={placeholder || `Select ${label}`} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{label}</SelectLabel>
          {options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

const DateField = ({ label, name, value, onChange, ...props }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">{label}</label>
    <DatePicker name={name} value={value} onChange={onChange} {...props} />
    {props.error && <p className="text-red-500 text-xs mt-1">{props.error}</p>}
  </div>
);

export default UserModal;
