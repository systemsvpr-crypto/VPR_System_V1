import React, { useState } from 'react';
import { FolderTree, Edit2, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';

const GroupTable = ({ groups, totalItems, loading, onEdit, onDelete, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
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

  if (totalItems === 0 || (!totalItems && groups.length === 0)) {
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
    <DataTable
      headers={[
        { label: '', className: 'w-10' },
        'Group Name', 'Products', 'Actions'
      ]}
      data={groups}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(g, index) => {
        const isExpanded = expandedGroups.has(g.group_id);
        return (
          <React.Fragment key={g.group_id}>
            <tr className="hover:bg-slate-50 transition-colors cursor-pointer group text-xs" onClick={() => toggleExpand(g.group_id)}>
              <td className="px-2 py-3 text-center">
                <ChevronDown size={16}
                  className={`mx-auto text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
              </td>
              <td className="px-4 py-3 text-center font-medium text-slate-800">{g.group_name}</td>
              <td className="px-4 py-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  {g.members?.length || 0}
                </span>
              </td>
              <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-1">
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
            {isExpanded && (
              <tr>
                <td colSpan={4} className="px-0 py-0">
                  <div className="bg-slate-50 border-t border-slate-100">
                    {g.members && g.members.length > 0 ? (
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          {g.members.map(m => (
                            <tr key={m.id} className="hover:bg-white transition-colors">
                              <td className="px-4 py-2 text-center text-slate-700">{m.product_name}</td>
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
            )}
          </React.Fragment>
        );
      }}
      renderCard={(g, index) => {
        const isExpanded = expandedGroups.has(g.group_id);
        return (
          <div key={g.group_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start cursor-pointer" onClick={() => toggleExpand(g.group_id)}>
              <div className="flex items-center gap-2">
                <ChevronDown size={16}
                  className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                <h4 className="font-semibold text-slate-800">{g.group_name}</h4>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  {g.members?.length || 0} Products
                </span>
                <Button variant="ghost" size="icon" onClick={() => onEdit(g)} className="text-slate-400 hover:text-primary h-8 w-8">
                  <Edit2 size={14} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(g)} className="text-slate-300 hover:text-red-500 h-8 w-8">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            {isExpanded && (
              <div className="bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                {g.members && g.members.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {g.members.map(m => (
                      <li key={m.id} className="px-3 py-2 text-xs text-center text-slate-700 bg-white">
                        {m.product_name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-xs text-slate-400 text-center">No products in this group.</p>
                )}
              </div>
            )}
          </div>
        );
      }}
    />
  );
};

export default GroupTable;
