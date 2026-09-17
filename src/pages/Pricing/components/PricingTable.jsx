import React, { useState, useMemo, useEffect } from 'react';
import {
  Edit2,
  Trash2,
  History,
  IndianRupee,
  Check,
  X,
  RotateCw,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataTable from '@/components/DataTable';

const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '') return '—';
  return `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
};

/**
 * Single Desktop Table Row
 */
const PricingTableRow = ({
  g,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveRow,
  onDelete,
  onViewHistory,
}) => {
  const [values, setValues] = useState({
    group_name: g.group_name || '',
    a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
    b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
    c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
    last_purchase: g.last_purchase || '',
    second_last_purchase: g.second_last_purchase || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setValues({
        group_name: g.group_name || '',
        a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
        b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
        c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
        last_purchase: g.last_purchase || '',
        second_last_purchase: g.second_last_purchase || '',
      });
    }
  }, [isEditing, g]);

  const handleSave = async () => {
    if (!values.group_name?.trim()) {
      toast.error('Group Name is required');
      return;
    }
    if (values.a_rate !== '' && (isNaN(values.a_rate) || Number(values.a_rate) < 0)) {
      toast.error('Rate A must be a valid positive number');
      return;
    }
    if (values.b_rate !== '' && (isNaN(values.b_rate) || Number(values.b_rate) < 0)) {
      toast.error('Rate B must be a valid positive number');
      return;
    }
    if (values.c_rate !== '' && (isNaN(values.c_rate) || Number(values.c_rate) < 0)) {
      toast.error('Rate C must be a valid positive number');
      return;
    }

    setSaving(true);
    try {
      const success = await onSaveRow(g.group_id, values);
      if (success !== false) {
        onCancelEdit();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <tr className="bg-primary/5 border-l-4 border-l-primary transition-colors text-xs">
        {/* Actions Column FIRST (Save / Cancel) */}
        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1.5">
            <Button
              variant="default"
              size="icon"
              type="button"
              title="Save Changes (Enter)"
              onClick={handleSave}
              disabled={saving}
              className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-all cursor-pointer"
            >
              {saving ? <RotateCw size={13} className="animate-spin" /> : <Check size={14} />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              type="button"
              title="Cancel Edit (Esc)"
              onClick={onCancelEdit}
              disabled={saving}
              className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            >
              <X size={14} />
            </Button>
          </div>
        </td>

        {/* 2. Group Name (Disabled during row edit) */}
        <td className="px-2 py-2 text-center">
          <Input
            value={values.group_name}
            disabled
            title="Group Name is locked during rate editing"
            className="h-8 text-xs font-semibold text-center bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed select-none shadow-2xs"
          />
        </td>

        {/* 3. Rate A Input (Auto-focused) */}
        <td className="px-2 py-2 text-center">
          <div className="relative max-w-[130px] mx-auto">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] pointer-events-none font-semibold">₹</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={values.a_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, a_rate: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              className="h-8 pl-6 pr-2 text-xs font-semibold text-center bg-white border-emerald-300 focus:border-emerald-600 shadow-2xs"
            />
          </div>
        </td>

        {/* Rate B Input */}
        <td className="px-2 py-2 text-center">
          <div className="relative max-w-[130px] mx-auto">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] pointer-events-none font-semibold">₹</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.b_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, b_rate: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              className="h-8 pl-6 pr-2 text-xs font-semibold text-center bg-white border-blue-300 focus:border-blue-600 shadow-2xs"
            />
          </div>
        </td>

        {/* Rate C Input */}
        <td className="px-2 py-2 text-center">
          <div className="relative max-w-[130px] mx-auto">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] pointer-events-none font-semibold">₹</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.c_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, c_rate: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              className="h-8 pl-6 pr-2 text-xs font-semibold text-center bg-white border-purple-300 focus:border-purple-600 shadow-2xs"
            />
          </div>
        </td>

        {/* Last Purchase Date (Disabled) */}
        <td className="px-2 py-2 text-center text-slate-500 font-medium">
          <Input
            value={formatDate(values.last_purchase)}
            disabled
            title="Last Purchase Date is locked"
            className="h-8 text-xs text-center bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed select-none shadow-2xs max-w-[130px] mx-auto"
          />
        </td>

        {/* 2nd Last Purchase Date (Disabled) */}
        <td className="px-2 py-2 text-center text-slate-500 font-medium">
          <Input
            value={formatDate(values.second_last_purchase)}
            disabled
            title="2nd Last Purchase Date is locked"
            className="h-8 text-xs text-center bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed select-none shadow-2xs max-w-[130px] mx-auto"
          />
        </td>
      </tr>
    );
  }

  // View Mode Row
  return (
    <tr key={g.group_id} className="hover:bg-slate-50/80 transition-colors group text-xs">
      {/* 1. Actions Column FIRST */}
      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          {/* Inline Edit Button */}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="Edit Row Inline"
            onClick={() => onStartEdit(g.group_id)}
            className="p-1.5 h-7 w-7 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all cursor-pointer"
          >
            <Edit2 size={15} />
          </Button>

          {/* History Button */}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="View Rate History"
            onClick={() => onViewHistory(g)}
            className="p-1.5 h-7 w-7 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all cursor-pointer"
          >
            <History size={15} />
          </Button>

          {/* Delete Button */}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="Delete Group"
            onClick={() => onDelete(g)}
            className="p-1.5 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </td>

      {/* 2. Group Name */}
      <td className="px-4 py-3 text-center font-medium text-slate-800">
        <span className="font-semibold">{g.group_name}</span>
      </td>

      {/* 3. Rate A */}
      <td className="px-4 py-3 text-center">
        {g.a_rate !== null && g.a_rate !== undefined ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {formatRate(g.a_rate)}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* 4. Rate B */}
      <td className="px-4 py-3 text-center">
        {g.b_rate !== null && g.b_rate !== undefined ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {formatRate(g.b_rate)}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* 5. Rate C */}
      <td className="px-4 py-3 text-center">
        {g.c_rate !== null && g.c_rate !== undefined ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            {formatRate(g.c_rate)}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* 6. Last Purchase */}
      <td className="px-4 py-3 text-center text-slate-600 font-medium">
        {formatDate(g.last_purchase)}
      </td>

      {/* 7. 2nd Last Purchase */}
      <td className="px-4 py-3 text-center text-slate-600 font-medium">
        {formatDate(g.second_last_purchase)}
      </td>
    </tr>
  );
};

/**
 * Single Mobile Card View
 */
const PricingCardRow = ({
  g,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveRow,
  onDelete,
  onViewHistory,
}) => {
  const [values, setValues] = useState({
    group_name: g.group_name || '',
    a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
    b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
    c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
    last_purchase: g.last_purchase || '',
    second_last_purchase: g.second_last_purchase || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setValues({
        group_name: g.group_name || '',
        a_rate: g.a_rate !== null && g.a_rate !== undefined ? g.a_rate : '',
        b_rate: g.b_rate !== null && g.b_rate !== undefined ? g.b_rate : '',
        c_rate: g.c_rate !== null && g.c_rate !== undefined ? g.c_rate : '',
        last_purchase: g.last_purchase || '',
        second_last_purchase: g.second_last_purchase || '',
      });
    }
  }, [isEditing, g]);

  const handleSave = async () => {
    if (!values.group_name?.trim()) {
      toast.error('Group Name is required');
      return;
    }
    setSaving(true);
    try {
      const success = await onSaveRow(g.group_id, values);
      if (success !== false) {
        onCancelEdit();
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div
        key={g.group_id}
        className="bg-white p-4 rounded-xl border-2 border-primary shadow-sm flex flex-col gap-3"
      >
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <span className="text-xs font-semibold text-primary uppercase">Edit Group Pricing</span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            >
              {saving ? <RotateCw size={13} className="animate-spin" /> : <Check size={14} />}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelEdit}
              disabled={saving}
              className="h-8 px-3 text-xs text-slate-500"
            >
              Cancel
            </Button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Group Name</label>
          <Input
            value={values.group_name}
            disabled
            className="h-8 text-xs font-semibold bg-slate-100/80 text-slate-500 cursor-not-allowed select-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-emerald-700 block uppercase">Rate A (₹)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.a_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, a_rate: e.target.value }))}
              className="h-8 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-blue-700 block uppercase">Rate B (₹)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.b_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, b_rate: e.target.value }))}
              className="h-8 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-purple-700 block uppercase">Rate C (₹)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.c_rate}
              onChange={(e) => setValues((prev) => ({ ...prev, c_rate: e.target.value }))}
              className="h-8 text-xs font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-slate-500 block">Last Purchase</label>
            <Input
              value={formatDate(values.last_purchase)}
              disabled
              className="h-8 text-xs px-2 bg-slate-100/80 text-slate-500 cursor-not-allowed select-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 block">2nd Last Purchase</label>
            <Input
              value={formatDate(values.second_last_purchase)}
              disabled
              className="h-8 text-xs px-2 bg-slate-100/80 text-slate-500 cursor-not-allowed select-none"
            />
          </div>
        </div>
      </div>
    );
  }

  // View Mode Card
  return (
    <div
      key={g.group_id}
      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-1.5">
          {/* Actions at front */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onStartEdit(g.group_id)}
            className="text-slate-400 hover:text-primary h-8 w-8 cursor-pointer"
            title="Edit Row"
          >
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewHistory(g)}
            className="text-slate-400 hover:text-amber-600 h-8 w-8 cursor-pointer"
            title="View History"
          >
            <History size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(g)}
            className="text-slate-400 hover:text-red-500 h-8 w-8 cursor-pointer"
            title="Delete"
          >
            <Trash2 size={14} />
          </Button>
        </div>

        <div className="text-right flex-1">
          <h4 className="font-semibold text-slate-800 text-sm">{g.group_name}</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Last: {formatDate(g.last_purchase)}
          </p>
        </div>
      </div>

      {/* Rates pill grid */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 bg-emerald-50/60 rounded-lg border border-emerald-100">
          <span className="text-[10px] text-emerald-600 font-semibold block uppercase">Rate A</span>
          <span className="font-bold text-emerald-800">{formatRate(g.a_rate)}</span>
        </div>
        <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-100">
          <span className="text-[10px] text-blue-600 font-semibold block uppercase">Rate B</span>
          <span className="font-bold text-blue-800">{formatRate(g.b_rate)}</span>
        </div>
        <div className="p-2 bg-purple-50/60 rounded-lg border border-purple-100">
          <span className="text-[10px] text-purple-600 font-semibold block uppercase">Rate C</span>
          <span className="font-bold text-purple-800">{formatRate(g.c_rate)}</span>
        </div>
      </div>

      {/* Purchase dates info */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
        <span>2nd Last: <strong>{formatDate(g.second_last_purchase)}</strong></span>
        <span>Last: <strong>{formatDate(g.last_purchase)}</strong></span>
      </div>
    </div>
  );
};

/**
 * Main PricingTable Component
 */
const PricingTable = ({
  groups,
  totalItems,
  loading,
  searchTerm,
  onSaveRow,
  onDelete,
  onViewHistory,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}) => {
  const [editingRowId, setEditingRowId] = useState(null);

  // CRITICAL: Map groups to new row objects containing _isEditing
  // This ensures DataTable's areEqual comparator detects the change and triggers a re-render!
  const rows = useMemo(() => {
    return groups.map((g) => ({
      ...g,
      _isEditing: g.group_id === editingRowId,
    }));
  }, [groups, editingRowId]);

  if (loading) {
    return (
      <div className="p-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading product group rates...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-16 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <IndianRupee size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-1">No Product Groups Found</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          {searchTerm
            ? 'No product groups match your search criteria. Try a different search keyword.'
            : 'Get started by creating your first product group and defining its tier rates (A, B, C).'}
        </p>
      </div>
    );
  }

  return (
    <DataTable
      headers={[
        { label: 'Actions', className: 'w-24' },
        'Group Name',
        'Rate A (₹)',
        'Rate B (₹)',
        'Rate C (₹)',
        'Last Purchase',
        '2nd Last Purchase',
      ]}
      data={rows}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      itemsPerPageOptions={[50, 100, 200, 500]}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      renderRow={(g) => (
        <PricingTableRow
          key={g.group_id}
          g={g}
          isEditing={g._isEditing}
          onStartEdit={setEditingRowId}
          onCancelEdit={() => setEditingRowId(null)}
          onSaveRow={onSaveRow}
          onDelete={onDelete}
          onViewHistory={onViewHistory}
        />
      )}
      renderCard={(g) => (
        <PricingCardRow
          key={g.group_id}
          g={g}
          isEditing={g._isEditing}
          onStartEdit={setEditingRowId}
          onCancelEdit={() => setEditingRowId(null)}
          onSaveRow={onSaveRow}
          onDelete={onDelete}
          onViewHistory={onViewHistory}
        />
      )}
    />
  );
};

export default PricingTable;
