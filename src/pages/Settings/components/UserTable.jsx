import { Edit2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HeaderCell = ({ children, align = "left" }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>{children}</th>
);

const EmptyRow = ({ message }) => (
  <tr><td colSpan="4" className="px-4 py-16 text-center">
    <div className="flex flex-col items-center gap-2">
      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
        <Users size={24} className="text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  </td></tr>
);

const UserRow = ({ user, onEdit }) => (
  <tr className="hover:bg-slate-50 transition-colors group">
    <td className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs border border-slate-200 overflow-hidden shrink-0">
          {user.profile_picture ? (
            <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
          ) : user.full_name?.charAt(0).toUpperCase()}
        </div>
        <div className="font-medium text-slate-900 text-sm">{user.full_name}</div>
      </div>
    </td>
    <td className="px-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm text-slate-900">{user.role || '-'}</span>
        <span className="text-xs text-slate-500">{user.designation || '-'}</span>
      </div>
    </td>
    <td className="px-4 py-3">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
        {user.is_active ? 'Active' : 'Inactive'}
      </span>
    </td>
    <td className="px-4 py-3 text-right">
      <Button variant="ghost" size="icon" type="button" onClick={onEdit}
        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all opacity-0 group-hover:opacity-100" title="Edit User">
        <Edit2 size={16} />
      </Button>
    </td>
  </tr>
);

const MobileUserCard = ({ user, onEdit }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-start justify-between">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm border border-slate-200 overflow-hidden shrink-0">
        {user.profile_picture ? (
          <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
        ) : user.full_name?.charAt(0).toUpperCase()}
      </div>
      <div>
        <h3 className="font-semibold text-slate-900 text-sm">{user.full_name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-sidebar-foreground/60">{user.role}</span>
        </div>
      </div>
    </div>
    <Button variant="ghost" size="icon" type="button" onClick={onEdit}
      className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors">
      <Edit2 size={18} />
    </Button>
  </div>
);

export { UserRow, MobileUserCard, EmptyRow, HeaderCell };
