import React, { useEffect, useState } from 'react';
import {
  User, Mail, Phone, MapPin, Calendar, Briefcase,
  Edit2, Save, Camera, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchProfile, updateProfile } from '../../services/myprofileService';
import { uploadProfilePicture } from '../../services/storageService';
import { GENDERS } from '../../constants';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import ProfileStat from './components/ProfileStat';
import SectionCard from './components/SectionCard';
import InfoField from './components/InfoField';

const MyProfile = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) throw new Error("User session not found.");
      const sessionUser = JSON.parse(storedUser);
      const identifier = sessionUser.user_id || sessionUser.username;
      if (!identifier) throw new Error("User identifier missing.");
      const field = sessionUser.user_id ? 'user_id' : 'username';
      const data = await fetchProfile(identifier, field);
      setProfileData(data);
      setFormData({ ...data, password: data.password || '' });
    } catch (error) {
      toast.error(`Failed to load profile: ${error.message}`);
    } finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    if (name === 'phone_number') newValue = value.replace(/[^0-9]/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploading(true);
      const publicUrl = await uploadProfilePicture(file);
      setFormData(prev => ({ ...prev, profile_picture: publicUrl }));
      if (!isEditing && profileData) {
        await updateProfile(profileData.user_id, { profile_picture: publicUrl });
        setProfileData(prev => ({ ...prev, profile_picture: publicUrl }));
        toast.success('Profile picture updated');
      }
    } catch (error) {
      toast.error('Error uploading image: ' + error.message);
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (formData.username && /\s/.test(formData.username.trim())) return toast.error('Username cannot contain spaces');
    if (formData.phone_number && formData.phone_number.length !== 10) return toast.error('Phone number must be exactly 10 digits');
    if (!formData.full_name?.trim()) return toast.error('Full Name is required');
    try {
      setSaving(true);
      const { created_at, updated_at, user_id, password, ...updates } = formData;
      const cleanUpdates = { ...updates, username: updates.username?.trim(), full_name: updates.full_name?.trim(), email: updates.email?.trim(), date_of_birth: updates.date_of_birth || null };
      if (password && password.trim() !== '') cleanUpdates.password = password;
      await updateProfile(profileData.user_id, cleanUpdates);
      setProfileData({ ...formData, password: '' });
      setFormData(prev => ({ ...prev, password: '' }));
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally { setSaving(false); }
  };

  if (loading && !profileData) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Profile</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your personal information and view history.</p>
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => { setIsEditing(false); setFormData({ ...profileData, password: '' }); }}
                className="px-4 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm font-medium">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="gap-2 px-5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm font-medium">
                <Save size={18} /><span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)} variant="outline"
              className="gap-2 px-5 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm font-medium">
              <Edit2 size={18} /><span>Edit Profile</span>
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="relative h-28 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200"></div>
            <div className="px-6 pb-6 relative">
              <div className="relative -mt-14 mb-4 inline-block group">
                <div className="w-28 h-28 rounded-full border-4 border-white overflow-hidden bg-white shadow flex items-center justify-center">
                  {formData.profile_picture ? (
                    <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User size={56} className="text-slate-300" />
                  )}
                </div>
                {isEditing && (
                  <label className="absolute bottom-1 right-1 bg-primary text-primary-foreground p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow border-2 border-white">
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Camera size={14} />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">{formData.full_name || 'User'}</h2>
                <div className="flex flex-col gap-1 mt-1">
                  <p className="text-slate-500 text-sm flex items-center gap-2">
                    <Briefcase size={14} className="text-primary" />
                    <span>{formData.designation || 'No Designation'}</span>
                  </p>
                </div>
                <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Status</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${formData.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {formData.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <ProfileStat label="Role" value={formData.role || 'Employee'} uppercase />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <SectionCard title="Personal Information" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoField label="Full Name" name="full_name" value={formData.full_name} onChange={handleInputChange} icon={User} isEditing={isEditing} required />
              <InfoField label="Designation" name="designation" value={formData.designation} onChange={handleInputChange} icon={Briefcase} isEditing={isEditing} />
              <InfoField label="Username" value={formData.username} icon={User} disabled />
              {isEditing && (
                <InfoField label="Password" name="password" type="password" value={formData.password} onChange={handleInputChange} icon={Lock} isEditing={isEditing} placeholder="Enter to change password" />
              )}
              <div className="md:col-span-1">
                {isEditing ? (
                  <>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                    <DatePicker name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange} />
                  </>
                ) : (
                  <div className="group">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 group-hover:border-slate-300 transition-colors">
                      <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className={`text-sm font-medium ${!formData.date_of_birth ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                        {formData.date_of_birth ? new Date(formData.date_of_birth).toLocaleDateString('en-GB') : 'Not set'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <InfoField label="Gender" name="gender" type="select" options={GENDERS} value={formData.gender} onChange={handleInputChange} icon={User} isEditing={isEditing} />
            </div>
          </SectionCard>

          <SectionCard title="Contact Information" icon={Phone}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoField label="Email Address" name="email" value={formData.email} onChange={handleInputChange} icon={Mail} isEditing={isEditing} />
              <InfoField label="Phone Number" name="phone_number" value={formData.phone_number} onChange={handleInputChange} icon={Phone} isEditing={isEditing} placeholder="10 digit number" />
              <div className="md:col-span-2">
                <InfoField label="Current Address" name="current_address" type="textarea" value={formData.current_address} onChange={handleInputChange} icon={MapPin} isEditing={isEditing} />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
