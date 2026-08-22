import { Building2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable from '@/components/DataTable';

const VendorTable = ({ vendors, totalItems, loading, onEdit, searchTerm, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading vendors...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Building2 size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Vendors Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No vendors match your search criteria.' : 'Click "Add Vendor" above to create your first vendor.'}
        </p>
      </div>
    );
  }

  return (
    <DataTable
      headers={[
        'Name', 'Location', 'Phone', 'Email', 'GST No.', 'Actions'
      ]}
      data={vendors}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(v, index) => (
        <tr key={v.vendor_id} className="hover:bg-slate-50 transition-colors group text-xs">
          <td className="px-4 py-3 text-center font-medium text-slate-800">{v.name}</td>
          <td className="px-4 py-3 text-center text-slate-600">{v.location || '—'}</td>
          <td className="px-4 py-3 text-center text-slate-600">{v.phone_number || '—'}</td>
          <td className="px-4 py-3 text-center text-slate-600">{v.email || '—'}</td>
          <td className="px-4 py-3 text-center text-slate-600">{v.gst_number || '—'}</td>
          <td className="px-4 py-3 text-center">
            <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(v)}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
              <Edit2 size={15} />
            </Button>
          </td>
        </tr>
      )}
      renderCard={(v, index) => (
        <div key={v.vendor_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-slate-800">{v.name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{v.location || 'No Location'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onEdit(v)} className="text-slate-400 hover:text-primary h-8 w-8">
              <Edit2 size={14} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Phone</span>
              <span className="text-slate-700">{v.phone_number || '—'}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block mb-1">Email</span>
              <span className="text-slate-700 truncate">{v.email || '—'}</span>
            </div>
          </div>
        </div>
      )}
    />
  );
};

export default VendorTable;
