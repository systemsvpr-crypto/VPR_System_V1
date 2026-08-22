import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const HoverTooltip = ({ content, children, maxWidth = 'max-w-sm', noTruncate = false }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e) => {
    if (!content || content === '-') return;
    setShow(true);
    setPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!show) return;
    setPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setShow(false);
  };

  return (
    <>
      <div
        className={`w-full cursor-default ${noTruncate ? 'whitespace-nowrap' : 'truncate'}`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {show && content && createPortal(
        <div 
          className={`fixed z-[9999] pointer-events-none bg-gray-900/95 backdrop-blur-sm text-white text-[11px] p-2.5 rounded-xl shadow-[0_12px_28px_rgba(17,24,39,0.35)] ${maxWidth} whitespace-normal leading-relaxed aidash-menu-in`}
          style={{ 
            top: pos.y + 15 + 'px', 
            left: pos.x + 15 + 'px',
            transform: 'translate(0, 0)'
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
};

export default React.memo(HoverTooltip);
