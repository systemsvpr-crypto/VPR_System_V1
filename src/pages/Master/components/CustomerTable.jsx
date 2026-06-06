import { Users, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CustomerTable = ({ customers, totalItems, loading, onEdit, searchTerm }) => {
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading customers...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Users size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Customers Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No customers match your search criteria.' : 'Click "Add Customer" above to create your first customer.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">GST No.</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CRM Follow Up</th>
            <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map(c => (
            <tr key={c.customer_id} className="hover:bg-slate-50 transition-colors group">
              <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
              <td className="px-4 py-3 text-slate-600">{c.location || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{c.phone_number || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{c.gst_number || '—'}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.crm_follow_up || '—'}</td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(c)}
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                  <Edit2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerTable;
