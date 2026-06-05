import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllUsers } from '../../services/settingsService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { USER_ROLES, GENDERS, PAGES, DEFAULT_USER_PAGES } from '../../constants';
import UserModal from './components/UserModal';
import { UserRow, MobileUserCard, EmptyRow, HeaderCell } from './components/UserTable';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 6;

const Settings = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab] = useState('Manage Users');

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

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

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage system users, teams, and access permissions.</p>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        <button className={`pb-3 text-sm font-medium transition-all ${activeTab === 'Manage Users' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}>
          Manage Users
        </button>
      </div>

      <div className="flex flex-col gap-4">
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

        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-sm text-slate-400">Loading users...</p>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Users size={32} className="text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-600 mb-1">No Users Found</h3>
              <p className="text-sm text-slate-400">
                {searchTerm ? 'No users match your search criteria.' : 'Click "Add User" above to create the first user.'}
              </p>
            </div>
          ) : currentItems.map((user) => <MobileUserCard key={user.user_id} user={user} onEdit={() => handleOpenModal(user)} />)}
        </div>

        <div className="hidden md:flex bg-white rounded-xl border border-slate-200 flex-col">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <HeaderCell>User Details</HeaderCell>
                  <HeaderCell>Role & Designation</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell align="right">Actions</HeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <EmptyRow message="Loading users..." />
                : currentItems.length === 0 ? <EmptyRow message="No users found matching your search." />
                : currentItems.map((user) => <UserRow key={user.user_id} user={user} onEdit={() => handleOpenModal(user)} />)}
                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                  <tr key={`empty-${i}`}><td colSpan="4" className="h-16"></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredUsers.length > 0 && (
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredUsers.length}
              startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
              onPageChange={handlePageChange} className="border-t border-slate-200" />
          )}
        </div>

        {!loading && filteredUsers.length > 0 && (
          <div className="md:hidden shrink-0 mt-auto">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredUsers.length}
              startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
              onPageChange={handlePageChange} className="bg-white border-t border-slate-200 rounded-b-xl" />
          </div>
        )}
      </div>

      <UserModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingUser(null); }}
        editingUser={editingUser} users={users} onSuccess={fetchUsers} />
    </div>
  );
};

export default Settings;
