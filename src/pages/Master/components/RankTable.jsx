import { Award, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';

const RankTable = ({ ranks, totalItems, loading, onEdit, onDelete, searchTerm, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading ranks...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Award size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Ranks Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No ranks match your search criteria.' : 'Click "Add Rank" above to create your first rank.'}
        </p>
      </div>
    );
  }

  return (
    <DataTable
      headers={[
        'Rank', 'Created Date', 'Actions'
      ]}
      data={ranks}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(r, index) => (
        <tr key={r.rank_id} className="hover:bg-slate-50 transition-colors group text-xs">
          <td className="px-4 py-3 text-center font-medium text-slate-800">{r.rank_name}</td>
          <td className="px-4 py-3 text-center text-slate-400">{r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy') : '—'}</td>
          <td className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(r)}
                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                <Edit2 size={15} />
              </Button>
              <Button variant="ghost" size="icon" type="button" onClick={() => onDelete(r)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                <Trash2 size={15} />
              </Button>
            </div>
          </td>
        </tr>
      )}
      renderCard={(r, index) => (
        <div key={r.rank_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-slate-800">{r.rank_name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(r)} className="text-slate-400 hover:text-primary h-8 w-8">
                <Edit2 size={14} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(r)} className="text-slate-300 hover:text-red-500 h-8 w-8">
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    />
  );
};

export default RankTable;
