import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DragScrollTable from './DragScrollTable';

/**
 * DataTable Component
 * Standardized table with Desktop Table View and Mobile Card View.
 * Includes integrated pagination footer.
 */
const DataTable = ({ 
  headers, 
  data, 
  renderRow, 
  renderCard,
  minWidth = "1000px",
  // Pagination Props
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  totalResults,
  itemsPerPageOptions = [50, 100, 150, 200],
  emptyState = null
}) => {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white w-full">
      {/* Mobile Card View (Hidden on Desktop) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 overflow-y-auto flex-1 bg-slate-50/50 scrollbar-hide content-start">
        {data.length > 0 && (
          data.map((item, index) => renderCard(item, index))
        )}
      </div>

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden">
        <DragScrollTable className="w-full flex-1 min-h-0">
          <table className={`w-full relative border-collapse ${minWidth}`}>
            <thead className="bg-blue-50 border-b-2 border-slate-200 sticky top-0 z-10 shadow-sm">
              <tr>
                {headers.map((header, index) => {
                  const label = typeof header === 'object' ? header.label : header;
                  const customClass = typeof header === 'object' ? header.className : '';
                  return (
                    <th
                      key={index}
                      className={`px-4 py-3 text-center text-xs font-semibold text-slate-900 whitespace-nowrap uppercase tracking-wider ${customClass}`}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-600/[0.12] bg-white [&>tr:hover]:bg-royal-50/40 [&>tr]:transition-colors">
              {data.length === 0 && emptyState && (
                <tr>
                  <td colSpan={headers.length} className="p-0">
                    {emptyState}
                  </td>
                </tr>
              )}
              {data.length > 0 && (
                data.map((item, index) => {
                  const row = renderRow(item, index);
                  if (!row || !item || !item.orderType) return row;
                  
                  const isUrgent = item.orderType.trim().toLowerCase() === 'urgent order';
                  const isStock = item.orderType.trim().toLowerCase() === 'stock order';
                  
                  let customClass = '';
                  if (isUrgent) {
                    customClass = 'order-row-urgent';
                  } else if (isStock) {
                    customClass = 'order-row-stock';
                  }
                  
                  if (customClass) {
                    return React.cloneElement(row, {
                      className: `${row.props.className || ''} ${customClass}`
                    });
                  }
                  return row;
                })
              )}
            </tbody>
          </table>
        </DragScrollTable>
      </div>

      {/* Footer - Unified for both views */}
      <div className="px-4 py-2.5 border-t border-royal-600/25 bg-blue-50 flex items-center justify-between gap-4 rounded-b-[24px]">
        {/* Left Side: Row Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="ring-1 ring-royal-600/25 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-royal-500/30 bg-white font-medium text-xs md:text-sm"
          >
            {itemsPerPageOptions.map(val => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
          <span className="text-[10px] md:text-sm text-ink-body whitespace-nowrap font-medium hidden sm:inline">
            {totalResults > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0}-{Math.min(currentPage * itemsPerPage, totalResults)} of {totalResults}
          </span>
        </div>

        {/* Right Side: Pagination Controls */}
        <div className="flex items-center gap-2 md:gap-4 text-gray-700">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <div className="flex items-center text-xs md:text-sm font-semibold text-gray-600">
            {currentPage} / {totalPages || 1}
          </div>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

const areEqual = (prevProps, nextProps) => {
  // Compare scalar props
  if (prevProps.currentPage !== nextProps.currentPage) return false;
  if (prevProps.itemsPerPage !== nextProps.itemsPerPage) return false;
  if (prevProps.totalResults !== nextProps.totalResults) return false;
  if (prevProps.minWidth !== nextProps.minWidth) return false;

  // Compare headers (usually static, but check length)
  if (prevProps.headers.length !== nextProps.headers.length) return false;

  // Compare data array (shallow compare of elements)
  if (prevProps.data.length !== nextProps.data.length) return false;
  for (let i = 0; i < prevProps.data.length; i++) {
    if (prevProps.data[i] !== nextProps.data[i]) return false;
  }

  // We explicitly ignore renderRow and renderCard because they are 
  // passed as inline functions from the parent and recreate on every render.
  // Their output depends purely on the data objects, which we already compared.
  return true;
};

export default React.memo(DataTable, areEqual);
