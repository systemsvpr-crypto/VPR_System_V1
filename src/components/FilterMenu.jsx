import { useState, useEffect, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

// Single "Filters" button that opens a dropdown panel holding all of a tab's
// filter controls, so the toolbar stays on one row. Pass the filter controls
// as children; activeCount drives the badge, onClear resets the filters.
const FilterMenu = ({ activeCount = 0, onClear, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      // Searchable Dropdowns (Radix popover) render their option list in a
      // portal outside this panel — clicks there must not close the panel.
      if (e.target.closest?.('[data-radix-popper-content-wrapper]')) return;
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`h-9 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${
          open || activeCount > 0
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-[min(18rem,calc(100vw-2rem))] bg-white rounded-xl border border-slate-200 shadow-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-semibold text-slate-700">Filters</span>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
          {children}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={activeCount === 0}
              className="mt-1 h-8 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterMenu;
