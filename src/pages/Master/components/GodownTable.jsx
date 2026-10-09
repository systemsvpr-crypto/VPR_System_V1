import { ToggleLeft, ToggleRight, Warehouse, Trash2, Edit2 } from 'lucide-react';
import DataTable from '@/components/DataTable';
import useAuthStore from '../../../store/authStore';
import { canEditOrDelete } from '@/lib/permissions';

const GodownTable = ({ godowns, totalItems, loading, onToggle, onEdit, searchTerm, user: propUser, onDelete, typeFilter, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange, productCounts = {} }) => {
  const { user: authUser } = useAuthStore();
  const user = propUser || authUser;
  const userCanEdit = canEditOrDelete(user);
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
    <DataTable
      headers={[
        'Name', 'Godown Type', 'Assigned Products', 'Status', 'Actions'
      ]}
      data={godowns}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(g, index) => (
        <tr key={g.godown_id} className="hover:bg-slate-50 transition-colors group text-xs">
          <td className="px-4 py-3 text-center font-medium text-slate-800">{g.name}</td>
          <td className="px-4 py-3 text-center">
            <span className="text-[10px] sm:text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{g.godown_type || 'Own'}</span>
          </td>
          <td className="px-4 py-3 text-center">
            <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {productCounts[g.godown_id] || 0} product{(productCounts[g.godown_id] || 0) === 1 ? '' : 's'}
            </span>
          </td>
          <td className="px-4 py-3 text-center">
            {g.is_active
              ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium">Active</span>
              : <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium">Inactive</span>
            }
          </td>
          <td className="px-4 py-3 text-center">
            {userCanEdit ? (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => onEdit(g)} className="text-slate-400 hover:text-primary transition-colors" title="Edit Godown">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => onToggle(g)} className="text-slate-400 hover:text-primary transition-colors" title="Toggle Status">
                  {g.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <button onClick={() => onDelete(g)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete Godown">
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <span className="text-slate-300 text-xs">—</span>
            )}
          </td>
        </tr>
      )}
      renderCard={(g, index) => (
        <div key={g.godown_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-slate-800">{g.name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{g.godown_type || 'Own'}</p>
            </div>
            {userCanEdit && (
              <div className="flex gap-2">
                <button onClick={() => onEdit(g)} className="text-slate-400 hover:text-primary h-8 w-8" title="Edit Godown">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => onToggle(g)} className="text-slate-400 hover:text-primary h-8 w-8" title="Toggle Status">
                  {g.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => onDelete(g)} className="text-slate-300 hover:text-red-500 h-8 w-8" title="Delete Godown">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Assigned Products</span>
              <span className="text-slate-700 font-medium">
                {productCounts[g.godown_id] || 0} product{(productCounts[g.godown_id] || 0) === 1 ? '' : 's'}
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Status</span>
              {g.is_active
                ? <span className="text-green-600 font-medium">Active</span>
                : <span className="text-red-500 font-medium">Inactive</span>
              }
            </div>
          </div>
        </div>
      )}
    />
  );
};

export default GodownTable;
