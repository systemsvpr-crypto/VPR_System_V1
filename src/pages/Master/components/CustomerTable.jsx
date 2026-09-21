import { useMemo } from 'react';
import { Users, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';

const CustomerTable = ({
  customers,
  totalItems,
  loading,
  onEdit,
  searchTerm,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  ranks = [],
}) => {
  const ranksMap = useMemo(() => {
    const map = new Map();
    (ranks || []).forEach((r) => {
      map.set(r.rank_id, r.rank_name);
    });
    return map;
  }, [ranks]);

  const getRankName = (c) => {
    return c.ranks?.rank_name || (c.rank_id ? ranksMap.get(c.rank_id) : null) || null;
  };

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
    <DataTable
      headers={[
        'Name', 'Rank', 'Location', 'Phone', 'Email', 'GST No.', 'CRM Follow Up', 'Actions'
      ]}
      data={customers}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(c, index) => {
        const rankName = getRankName(c);
        return (
          <tr key={c.customer_id} className="hover:bg-slate-50 transition-colors group text-xs">
            <td className="px-4 py-3 text-center font-medium text-slate-800">{c.name}</td>
            <td className="px-4 py-3 text-center">
              {rankName ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  {rankName}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-center text-slate-600">{c.location || '—'}</td>
            <td className="px-4 py-3 text-center text-slate-600">{c.phone_number || '—'}</td>
            <td className="px-4 py-3 text-center text-slate-600">{c.email || '—'}</td>
            <td className="px-4 py-3 text-center text-slate-600">{c.gst_number || '—'}</td>
            <td className="px-4 py-3 text-center text-slate-600 max-w-[200px] truncate">{c.crm_follow_up || '—'}</td>
            <td className="px-4 py-3 text-center">
              <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(c)}
                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                <Edit2 size={15} />
              </Button>
            </td>
          </tr>
        );
      }}
      renderCard={(c, index) => {
        const rankName = getRankName(c);
        return (
          <div key={c.customer_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-slate-800">{c.name}</h4>
                  {rankName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      {rankName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{c.location || 'No Location'}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onEdit(c)} className="text-slate-400 hover:text-primary h-8 w-8">
                <Edit2 size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2 rounded-lg">
                <span className="text-slate-500 block mb-1">Phone</span>
                <span className="text-slate-700">{c.phone_number || '—'}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg">
                <span className="text-slate-500 block mb-1">Email</span>
                <span className="text-slate-700 truncate">{c.email || '—'}</span>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
};

export default CustomerTable;
