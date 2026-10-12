import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * TableScrollSync
 * Provides a synchronized top horizontal scrollbar for wide data tables.
 * Both top and bottom scrollbars stay in sync bidirectionally.
 */
export const TableScrollSync = ({ children, className = '', hideBottomScrollbar = false }) => {
  const topScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const isSyncingTop = useRef(false);
  const isSyncingBottom = useRef(false);

  const measure = useCallback(() => {
    const bottomEl = bottomScrollRef.current;
    if (bottomEl) {
      const sw = bottomEl.scrollWidth;
      const cw = bottomEl.clientWidth;
      setScrollWidth(sw);
      setHasOverflow(sw > cw + 1);
      // Keep scroll positions aligned upon resize
      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = bottomEl.scrollLeft;
      }
    }
  }, []);

  useEffect(() => {
    measure();
    const bottomEl = bottomScrollRef.current;
    if (!bottomEl) return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(bottomEl);
    if (bottomEl.firstElementChild) {
      observer.observe(bottomEl.firstElementChild);
    }
    return () => observer.disconnect();
  }, [measure]);

  const onTopScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (bottomScrollRef.current && topScrollRef.current) {
      isSyncingBottom.current = true;
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const onBottomScroll = () => {
    if (isSyncingBottom.current) {
      isSyncingBottom.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingTop.current = true;
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  return (
    <div className={`flex flex-col w-full ${className}`}>
      {/* Top Horizontal Scrollbar Track */}
      {hasOverflow && (
        <div
          ref={topScrollRef}
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-50/90 border-b border-slate-200/80 shrink-0"
          style={{ height: '10px', minHeight: '10px' }}
          title="Scroll table horizontally"
        >
          <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
        </div>
      )}

      {/* Main Table Container */}
      <div
        ref={bottomScrollRef}
        onScroll={onBottomScroll}
        className={`overflow-x-auto ${hideBottomScrollbar ? 'scrollbar-hide' : 'custom-scrollbar'}`}
      >
        {children}
      </div>
    </div>
  );
};

export default TableScrollSync;
