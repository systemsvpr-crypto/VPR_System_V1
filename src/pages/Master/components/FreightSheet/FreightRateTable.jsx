import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteFreightRate } from '@/services/transporterService';
import { canEditOrDelete } from '@/lib/permissions';
import { useConfirm } from '@/hooks/useConfirm';

const FreightRateTable = ({ rates, loading, onEdit, onDelete, onRefresh, user, searchTerm }) => {
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (rate) => {
    if (!canEditOrDelete(user)) return toast.error('Permission denied. Only Admins can delete rates.');
    if (onDelete) {
      return onDelete(rate);
    }
    const ok = await confirm({
      title: 'Delete Freight Rate',
      message: `Delete freight rate for "${rate.transporters?.name || 'Unknown'}" → ${rate.city}? This action cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    setDeletingId(rate.rate_id);
    try {
      await deleteFreightRate(rate.rate_id);
      toast.success('Rate deleted');
      onRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Failed to delete rate');
    }
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">Loading freight rates...</div>
    );
  }

  if (!rates || rates.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-slate-300 text-4xl mb-3">₹</div>
        <p className="text-slate-500 font-medium text-sm">
          {searchTerm ? `No freight rates matching "${searchTerm}"` : 'No freight rates configured yet'}
        </p>
        <p className="text-slate-400 text-xs mt-1">
          {searchTerm ? 'Try searching by a different term' : 'Add a rate using the "Add Rate" button above'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Transport Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              City / Location
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Rate With GST (₹/KG)
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Rate Without GST (₹/KG)
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rates.map(rate => (
            <tr key={rate.rate_id} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800">
                {rate.transporters?.name || '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">{rate.city}</td>
              <td className="px-4 py-3 text-right text-slate-800 font-medium">
                ₹{Number(rate.rate_with_gst).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right text-slate-800 font-medium">
                ₹{Number(rate.rate_without_gst).toFixed(2)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onEdit(rate)}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Edit rate"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(rate)}
                    disabled={deletingId === rate.rate_id}
                    className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    title="Delete rate"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FreightRateTable;
