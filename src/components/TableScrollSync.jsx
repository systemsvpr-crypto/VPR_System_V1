import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * useTopScrollSync
 * Keeps a top horizontal scrollbar in sync with a table's scroll container.
 * Attach `bottomRef` to the scrolling element and call `onBottomScroll` from
 * its onScroll; render <TopScrollbar {...topProps} /> above it.
 */
export const useTopScrollSync = () => {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const syncingFromTop = useRef(false);
  const syncingFromBottom = useRef(false);

  const measure = useCallback(() => {
    const el = bottomRef.current;
    if (!el) return;
    setScrollWidth(el.scrollWidth);
    setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    if (topRef.current) topRef.current.scrollLeft = el.scrollLeft;
  }, []);

  useEffect(() => {
    measure();
    const el = bottomRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  const onTopScroll = () => {
    if (syncingFromTop.current) {
      syncingFromTop.current = false;
      return;
    }
    if (bottomRef.current && topRef.current) {
      syncingFromBottom.current = true;
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    }
  };

  const onBottomScroll = () => {
    if (syncingFromBottom.current) {
      syncingFromBottom.current = false;
      return;
    }
    if (topRef.current && bottomRef.current) {
      syncingFromTop.current = true;
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
  };

  return { bottomRef, onBottomScroll, topProps: { topRef, onTopScroll, scrollWidth, hasOverflow } };
};

export const TopScrollbar = ({ topRef, onTopScroll, scrollWidth, hasOverflow }) => {
  if (!hasOverflow) return null;
  return (
    <div
      ref={topRef}
      onScroll={onTopScroll}
      className="overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-100/90 border-b border-slate-200 shrink-0"
      style={{ height: '12px', minHeight: '12px' }}
      title="Scroll table horizontally"
    >
      <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
    </div>
  );
};

/**
 * TableScrollSync
 * Provides a synchronized top horizontal scrollbar for wide data tables.
 * `scrollClassName` is applied to the scrolling container (e.g. to add
 * vertical scrolling for sticky headers).
 */
export const TableScrollSync = ({
  children,
  className = '',
  scrollClassName = '',
  hideBottomScrollbar = false,
  containerRef,
  onScroll,
}) => {
  const { bottomRef, onBottomScroll, topProps } = useTopScrollSync();

  const handleBottomScroll = (e) => {
    onBottomScroll(e);
    if (onScroll) onScroll(e);
  };

  const setBottomRef = (el) => {
    bottomRef.current = el;
    if (containerRef) {
      if (typeof containerRef === 'function') {
        containerRef(el);
      } else {
        containerRef.current = el;
      }
    }
  };

  return (
    <div className={`flex flex-col w-full ${className}`}>
      <TopScrollbar {...topProps} />
      <div
        ref={setBottomRef}
        onScroll={handleBottomScroll}
        className={`overflow-x-auto ${hideBottomScrollbar ? 'scrollbar-hide' : 'custom-scrollbar'} ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
};

export default TableScrollSync;
