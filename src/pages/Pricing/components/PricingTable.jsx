import React, { useMemo } from 'react';
import {
  History,
  IndianRupee,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataTable from '@/components/DataTable';

const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '') return '—';
  return `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  dateStr = dateStr.trim();
  if (!dateStr) return '—';

  // Already in dd/mm/yyyy or dd-mm-yyyy format
  if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(dateStr)) {
    return dateStr.replace(/-/g, '/');
  }
  // In yyyy-mm-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    let s = dateStr;
    if (!s.includes('Z') && !s.includes('+') && !/-\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(parsed);
    }
  } catch {
    // fallback
  }
  return dateStr;
};

const formatISTDateTime = (dateStr) => {
  if (!dateStr) return null;
  try {
    let s = typeof dateStr === 'string' ? dateStr.trim() : String(dateStr);
    if (!s) return null;
    if (!s.includes('Z') && !s.includes('+') && !/-\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
    return `${formatted} IST`;
  } catch {
    return null;
  }
};

/**
 * Single Desktop Table Row
 */
const PricingTableRow = ({
  g,
  isSelected,
  onToggleSelect,
  rowRates,
  onRateChange,
  onSaveSingleRow,
  onViewHistory,
  ranks = [],
}) => {
  return (
    <tr
      key={g.group_id}
      className={`transition-colors text-xs ${
        isSelected
          ? 'bg-emerald-50/40 border-l-4 border-l-emerald-600 font-medium'
          : 'hover:bg-slate-50/80 group'
      }`}
    >
      {/* 1. Checkbox Column */}
      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(g.group_id)}
          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary mx-auto block"
          title={isSelected ? 'Deselect row' : 'Select row to edit rates'}
        />
      </td>

      {/* 2. Product Name */}
      <td className="px-4 py-3 text-center font-medium text-slate-800">
        <span className="font-semibold text-xs">{g.group_name}</span>
      </td>

      {/* 3. Last Purchase Rate */}
      <td className="px-4 py-3 text-center">
        {g.last_purchase_rate !== null && g.last_purchase_rate !== undefined ? (
          <div className="flex flex-col items-center">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {formatRate(g.last_purchase_rate)}
            </span>
            {g.last_purchase_date && (
              <span className="text-[10px] text-slate-400 mt-0.5">
                {formatDate(g.last_purchase_date)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* 4. Current Purchase Rate */}
      <td className="px-4 py-3 text-center">
        {g.current_purchase_rate !== null && g.current_purchase_rate !== undefined ? (
          <div className="flex flex-col items-center">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              {formatRate(g.current_purchase_rate)}
            </span>
            {g.current_purchase_date && (
              <span className="text-[10px] text-slate-400 mt-0.5">
                {formatDate(g.current_purchase_date)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* Dynamic Rank Rate Columns */}
      {ranks.map((r) => {
        const rankName = r.rank_name;
        const rateVal = rowRates?.[rankName] ?? '';
        const savedRate = g.rank_rates?.[rankName] ?? (
          rankName === 'A' ? g.a_rate :
          rankName === 'B' ? g.b_rate :
          rankName === 'C' ? g.c_rate : null
        );

        return (
          <td
            key={r.rank_id || rankName}
            className="px-3 py-2 text-center"
            onClick={(e) => isSelected && e.stopPropagation()}
          >
            {isSelected ? (
              <div className="relative w-32 sm:w-36 mx-auto">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] pointer-events-none font-semibold">₹</span>
                <Input
                  type="text"
                  value={rateVal}
                  onChange={(e) => onRateChange(g.group_id, rankName, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveSingleRow?.(g.group_id);
                  }}
                  placeholder="0.00"
                  className="h-8 pl-6 pr-2 text-xs font-semibold text-center bg-white border-primary/40 focus:border-primary shadow-2xs"
                />
              </div>
            ) : (
              savedRate !== null && savedRate !== undefined && String(savedRate).trim() !== '' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {formatRate(savedRate)}
                </span>
              ) : (
                <span className="text-slate-300 text-xs">—</span>
              )
            )}
          </td>
        );
      })}

      {/* Rate Changed On */}
      <td className="px-4 py-3 text-center text-slate-600 text-xs font-medium">
        {g.rate_changed_on ? formatDate(g.rate_changed_on) : '—'}
      </td>

      {/* Rates Updated On */}
      <td
        className="px-4 py-3 text-center text-slate-600 text-xs font-medium"
        title={g.abc_updated_on ? formatISTDateTime(g.abc_updated_on) : undefined}
      >
        {formatDate(g.abc_updated_on)}
      </td>

      {/* History Column */}
      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="View Rate History"
          onClick={() => onViewHistory(g)}
          className="p-1.5 h-7 w-7 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all cursor-pointer mx-auto"
        >
          <History size={15} />
        </Button>
      </td>
    </tr>
  );
};

/**
 * Single Mobile Card View
 */
const PricingCardRow = ({
  g,
  isSelected,
  onToggleSelect,
  rowRates,
  onRateChange,
  onViewHistory,
  ranks = [],
}) => {
  return (
    <div
      key={g.group_id}
      className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
        isSelected
          ? 'bg-primary/[0.02] border-2 border-primary shadow-sm'
          : 'bg-white border-slate-200 shadow-xs'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(g.group_id)}
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
          />
          <span className="text-xs text-slate-400">Select to edit</span>
        </div>

        <div className="text-right flex-1">
          <h4 className="font-semibold text-slate-800 text-sm">{g.group_name}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Current: <span className="font-semibold text-amber-800">{formatRate(g.current_purchase_rate)}</span>
            {g.last_purchase_rate && (
              <span className="text-slate-400"> (Last: {formatRate(g.last_purchase_rate)})</span>
            )}
          </p>
        </div>
      </div>

      {/* Rates Section */}
      {isSelected ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ranks.map((r) => (
            <div key={r.rank_id || r.rank_name}>
              <label className="text-[10px] font-semibold text-slate-700 block uppercase mb-1">
                {r.rank_name} Rate (₹)
              </label>
              <Input
                type="text"
                value={rowRates?.[r.rank_name] ?? ''}
                onChange={(e) => onRateChange(g.group_id, r.rank_name, e.target.value)}
                placeholder="0.00"
                className="h-8 text-xs font-semibold bg-white border-slate-300"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
          {ranks.map((r) => {
            const savedRate = g.rank_rates?.[r.rank_name] ?? (
              r.rank_name === 'A' ? g.a_rate :
              r.rank_name === 'B' ? g.b_rate :
              r.rank_name === 'C' ? g.c_rate : null
            );
            return (
              <div key={r.rank_id || r.rank_name} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">{r.rank_name} Rate</span>
                <span className="font-bold text-slate-800">{formatRate(savedRate)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timestamps & History Button at Bottom */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
        <div className="flex flex-col gap-0.5">
          <span>Rate Changed: <strong>{g.rate_changed_on ? formatDate(g.rate_changed_on) : '—'}</strong></span>
          <span title={g.abc_updated_on ? formatISTDateTime(g.abc_updated_on) : undefined}>
            Rates Updated: <strong>{formatDate(g.abc_updated_on)}</strong>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewHistory(g)}
          className="h-7 px-2.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 cursor-pointer"
        >
          <History size={13} className="mr-1" />
          History
        </Button>
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
  onViewHistory,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  // Selection & Bulk props
  selectedGroupIds,
  onToggleSelect,
  onToggleSelectAll,
  editedRates,
  onRateChange,
  onSaveSingleRow,
  hidePagination = false,
  emptyTitle,
  emptyMessage,
  ranks = [],
}) => {
  // Map groups to new row objects containing _isSelected and _rowRates for fast memoized rendering
  const rows = useMemo(() => {
    return groups.map((g) => {
      const isSelected = selectedGroupIds?.has(g.group_id) || false;
      const defaultRates = {};
      (ranks || []).forEach((r) => {
        const val = g.rank_rates?.[r.rank_name] ?? (
          r.rank_name === 'A' ? g.a_rate :
          r.rank_name === 'B' ? g.b_rate :
          r.rank_name === 'C' ? g.c_rate : ''
        );
        defaultRates[r.rank_name] = val !== null && val !== undefined ? String(val) : '';
      });
      const rates = editedRates?.[g.group_id] || defaultRates;
      return {
        ...g,
        _isSelected: isSelected,
        _rowRates: rates,
      };
    });
  }, [groups, selectedGroupIds, editedRates, ranks]);

  const allPageSelected = groups.length > 0 && groups.every((g) => selectedGroupIds?.has(g.group_id));
  const somePageSelected = groups.some((g) => selectedGroupIds?.has(g.group_id));

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
      <div className="p-8 sm:p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3 border border-slate-100">
          <IndianRupee size={24} className="text-slate-300" />
        </div>
        <h3 className="text-sm font-semibold text-slate-700 mb-1">
          {emptyTitle || 'No Product Groups Found'}
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          {emptyMessage || (searchTerm
            ? 'No product groups match your search criteria. Try a different search keyword.'
            : 'Get started by creating your first product group and defining its rank rates.')}
        </p>
      </div>
    );
  }

  const tableHeaders = [
    {
      label: (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = somePageSelected && !allPageSelected;
            }}
            onChange={(e) => onToggleSelectAll?.(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
            title={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
          />
        </div>
      ),
      className: 'w-14 text-center',
    },
    'Product Name',
    'Last Purchase Rate',
    'Current Purchase Rate',
    ...(ranks || []).map((r) => ({
      label: `${r.rank_name} Rate`,
      className: 'min-w-[140px] text-center',
    })),
    'Rate Changed On',
    'Rates Updated On',
    {
      label: 'History',
      className: 'w-20 text-center',
    },
  ];

  return (
    <DataTable
      headers={tableHeaders}
      data={rows}
      currentPage={currentPage}
      totalPages={totalPages}
      itemsPerPage={itemsPerPage}
      itemsPerPageOptions={[50, 100, 200, 500]}
      onPageChange={onPageChange}
      onItemsPerPageChange={onItemsPerPageChange}
      totalResults={totalItems}
      hidePagination={hidePagination}
      renderRow={(g) => (
        <PricingTableRow
          key={g.group_id}
          g={g}
          isSelected={g._isSelected}
          onToggleSelect={onToggleSelect}
          rowRates={g._rowRates}
          onRateChange={onRateChange}
          onSaveSingleRow={onSaveSingleRow}
          onViewHistory={onViewHistory}
          ranks={ranks}
        />
      )}
      renderCard={(g) => (
        <PricingCardRow
          key={g.group_id}
          g={g}
          isSelected={g._isSelected}
          onToggleSelect={onToggleSelect}
          rowRates={g._rowRates}
          onRateChange={onRateChange}
          onViewHistory={onViewHistory}
          ranks={ranks}
        />
      )}
    />
  );
};

export default PricingTable;
