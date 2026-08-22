import { Truck, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';

const TransporterTable = ({ transporters, totalItems, loading, onEdit, searchTerm, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading transporters...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Truck size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Transporters Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No transporters match your search criteria.' : 'Click "Add Transporter" above to create your first transporter.'}
        </p>
      </div>
    );
  }

  return (
    <DataTable
      headers={[
        'Name', 'Vehicle Number', 'Driver Phone', 'Actions'
      ]}
      data={transporters}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(t, index) => (
        <tr key={t.transporter_id} className="hover:bg-slate-50 transition-colors group text-xs">
          <td className="px-4 py-3 text-center font-medium text-slate-800">{t.name}</td>
          <td className="px-4 py-3 text-center text-slate-600">{t.vehicle_number || '—'}</td>
          <td className="px-4 py-3 text-center text-slate-600">{t.driver_phone_number || '—'}</td>
          <td className="px-4 py-3 text-center">
            <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(t)}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
              <Edit2 size={15} />
            </Button>
          </td>
        </tr>
      )}
      renderCard={(t, index) => (
        <div key={t.transporter_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-slate-800">{t.name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{t.vehicle_number || 'No Vehicle No.'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onEdit(t)} className="text-slate-400 hover:text-primary h-8 w-8">
              <Edit2 size={14} />
            </Button>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg text-xs">
            <span className="text-slate-500 block mb-1">Driver Phone</span>
            <span className="text-slate-700">{t.driver_phone_number || '—'}</span>
          </div>
        </div>
      )}
    />
  );
};

export default TransporterTable;
