import { useState } from 'react';
import { FolderTree, Edit2, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GroupTable = ({ groups, loading, onEdit, onDelete }) => {
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleExpand = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading groups...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <FolderTree size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Product Groups</h3>
        <p className="text-sm text-slate-400">Click "Add Group" above to create your first product group.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="w-10" />
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Group Name</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Products</th>
            <th className="w-24 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.flatMap(g => {
            const isExpanded = expandedGroups.has(g.group_id);
            const rows = [
              <tr key={g.group_id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => toggleExpand(g.group_id)}>
                <td className="px-2 py-3">
                  <ChevronDown size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{g.group_name}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    {g.members?.length || 0}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(g)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                      <Edit2 size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" type="button" onClick={() => onDelete(g)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </td>
              </tr>
            ];
            if (isExpanded) {
              rows.push(
                <tr key={`${g.group_id}-details`}>
                  <td colSpan={4} className="px-0 py-0">
                    <div className="bg-slate-50 border-t border-slate-100">
                      {g.members && g.members.length > 0 ? (
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {g.members.map(m => (
                              <tr key={m.id} className="hover:bg-white transition-colors">
                                <td className="px-4 py-2 text-slate-700">{m.product_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="px-4 py-3 text-sm text-slate-400 text-center">No products in this group.</p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
};

export default GroupTable;
