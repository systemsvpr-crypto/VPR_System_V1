import React, { useRef, useState } from 'react';

// Movement (in px) the mouse must travel before a mousedown commits to a
// horizontal pan-drag. Below this threshold it's treated as a plain click or
// the start of a text selection, not a scroll gesture.
const DRAG_THRESHOLD = 6;

const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

const DragScrollTable = ({ children, className = "" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  // Mutable drag bookkeeping that mousemove needs on every event — kept out
  // of state so it doesn't trigger a re-render per pixel of movement.
  const dragRef = useRef({ armed: false, panning: false, startX: 0, scrollLeft: 0 });

  const handleMouseDown = (e) => {
    if (isCoarsePointer() || e.button !== 0) return;
    // Only "arm" a potential drag here — don't touch scrollLeft or call
    // preventDefault yet. Doing that immediately on mousedown is what used to
    // hijack every click-and-drag into a pan, including one meant to select
    // and copy table text.
    dragRef.current = {
      armed: true,
      panning: false,
      startX: e.pageX,
      scrollLeft: containerRef.current.scrollLeft,
    };
  };

  const endDrag = () => {
    dragRef.current = { armed: false, panning: false, startX: 0, scrollLeft: 0 };
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    const state = dragRef.current;
    if (!state.armed || isCoarsePointer()) return;

    const delta = e.pageX - state.startX;

    if (!state.panning) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      // The browser already started building a native text selection during
      // this same drag — defer to it instead of stealing the gesture into a
      // horizontal pan, so click-and-drag text selection (and copy) works.
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        state.armed = false;
        return;
      }
      state.panning = true;
      setIsDragging(true);
    }

    e.preventDefault();
    containerRef.current.scrollLeft = state.scrollLeft - delta * 2;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={endDrag}
      onMouseUp={endDrag}
      onMouseMove={handleMouseMove}
      className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-hide ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'} ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
};

export default DragScrollTable;
