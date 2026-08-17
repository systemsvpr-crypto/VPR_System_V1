import { ToggleLeft, ToggleRight, Warehouse, Trash2 } from 'lucide-react';

const GodownTable = ({ godowns, totalItems, loading, onToggle, searchTerm, user, onDelete, typeFilter }) => {
  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER ADMIN';
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading godowns...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Warehouse size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Godowns Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm
            ? 'No godowns match your search criteria.'
            : typeFilter === 'Transporter'
              ? 'No transporter godowns yet — these are created automatically from Master > Transporters.'
              : 'Click "Add Godown" above to create your first godown.'}
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown Type</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {godowns.map(g => (
              <tr key={g.godown_id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3 font-medium text-slate-800">{g.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{g.godown_type || 'Own'}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {g.is_active
                    ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">Active</span>
                    : <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full text-xs font-medium">Inactive</span>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onToggle(g)} className="text-slate-400 hover:text-primary transition-colors">
                      {g.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => onDelete(g)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete Godown">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </div>
  );
};

export default GodownTable;
