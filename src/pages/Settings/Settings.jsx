import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllUsers } from '../../services/settingsService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import UserModal from './components/UserModal';
import { UserRow, MobileUserCard } from './components/UserTable';
import DataTable from '@/components/DataTable';

const Settings = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activeTab] = useState('Manage Users');

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, itemsPerPage]);

  const fetchUsers = async () => {
    setLoading(true);
    try { const data = await fetchAllUsers(); setUsers(data || []); }
    catch (error) { toast.error('Failed to fetch users'); }
    finally { setLoading(false); }
  };

  const handleOpenModal = (user = null) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.designation?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-[500px]">

      <div className="flex flex-col gap-4 h-full flex-1 min-h-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="relative w-full md:w-72 order-2 md:order-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
            <Input type="text" placeholder="Search users..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 order-1 md:order-2">
            {!loading && (
              <Button onClick={() => handleOpenModal()} className="gap-2 px-4 font-medium">
                <Plus size={20} /><span>Add User</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          {loading ? (
            <div className="p-12 text-center flex-1 flex flex-col justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-sm text-slate-400">Loading users...</p>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="p-12 text-center flex-1 flex flex-col justify-center items-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Users size={32} className="text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-600 mb-1">No Users Found</h3>
              <p className="text-sm text-slate-400">
                {searchTerm ? 'No users match your search criteria.' : 'Click "Add User" above to create the first user.'}
              </p>
            </div>
          ) : (
            <DataTable
              headers={['User Details', 'Role & Designation', 'Status', { label: 'Actions', className: 'text-center' }]}
              data={currentItems}
              renderRow={(user) => <UserRow key={user.user_id} user={user} onEdit={() => handleOpenModal(user)} onView={() => handleOpenModal(user)} />}
              renderCard={(user) => <MobileUserCard key={user.user_id} user={user} onEdit={() => handleOpenModal(user)} />}
              minWidth="800px"
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={setItemsPerPage}
              totalResults={filteredUsers.length}
              itemsPerPageOptions={[10, 20, 50, 100]}
            />
          )}
        </div>
      </div>

      <UserModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingUser(null); }}
        editingUser={editingUser} users={users} onSuccess={fetchUsers} />
    </div>
  );
};

export default Settings;
