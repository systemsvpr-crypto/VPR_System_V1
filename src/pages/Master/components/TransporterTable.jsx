import { Truck, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TransporterTable = ({ transporters, totalItems, loading, onEdit, searchTerm }) => {
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle Number</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Driver Phone</th>
            <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transporters.map(t => (
            <tr key={t.transporter_id} className="hover:bg-slate-50 transition-colors group">
              <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
              <td className="px-4 py-3 text-slate-600">{t.vehicle_number || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{t.driver_phone_number || '—'}</td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(t)}
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

export default TransporterTable;
