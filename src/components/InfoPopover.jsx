import React, { useState, useRef, useEffect } from 'react';

const InfoPopover = ({ children, items, title }) => {
  const [show, setShow] = useState(false);
  const [showUp, setShowUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (show && containerRef.current && !isMobile) {
      const timer = setTimeout(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const spaceRight = window.innerWidth - rect.right;

        if (spaceAbove < 200) {
          setShowUp(false);
        } else {
          setShowUp(true);
        }

        if (spaceRight < 150) {
          setAlignRight(true);
        } else {
          setAlignRight(false);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [show, isMobile]);

  return (
    <div
      className="relative inline-block cursor-help"
      onMouseEnter={() => !isMobile && setShow(true)}
      onMouseLeave={() => !isMobile && setShow(false)}
      onClick={() => setShow(!show)}
      ref={containerRef}
    >
      {children}

      {show && items && items.length > 0 && (
        <>
          {isMobile ? (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 aidash-overlay-in overflow-hidden lg:left-64">
              <div
                className="aidash-glass-solid aidash-panel-in relative rounded-[24px] shadow-glass-hover w-full max-w-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="aidash-specular" />
                {/* Compact Header */}
                <div className="px-4 py-2 md:py-3 border-b border-royal-600/25 flex items-center justify-center flex-none z-20">
                  <h2 className="text-[11px] md:text-sm font-black text-ink-heading uppercase tracking-widest text-center">{title}</h2>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto min-h-0 z-10">
                  <div className="p-4 space-y-3">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal-500 mt-1.5 flex-shrink-0 shadow-sm shadow-royal-200"></div>
                        <span className="text-[11px] md:text-[13px] font-medium text-gray-700 uppercase leading-snug break-words">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="px-4 py-2 md:py-3 border-t border-royal-600/25 flex-none z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShow(false); }}
                    className="w-full bg-gradient-to-b from-royal-500 to-royal-600 text-white font-bold py-2.5 rounded-2xl transition-all active:scale-[0.98] shadow-[0_6px_16px_rgba(37,99,235,0.28)] text-[11px] md:text-xs uppercase tracking-widest"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Popover */
            <div
              className={`absolute z-[300] w-max min-w-[150px] max-w-[260px] aidash-glass-solid bg-white/95 shadow-glass-hover rounded-2xl p-3 aidash-menu-in pointer-events-none
                ${showUp ? 'bottom-full mb-2.5' : 'top-full mt-2.5'}
                ${alignRight ? 'right-0 origin-top-right' : 'left-1/2 -translate-x-1/2 origin-top'}
              `}
            >
              <div className="flex flex-col gap-1.5">
                {title && (
                  <p className="text-[8px] font-medium text-gray-400 uppercase border-b border-royal-600/25 pb-1 mb-1 tracking-widest text-center whitespace-nowrap">
                    {title}
                  </p>
                )}
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-royal-500 mt-1.5 flex-shrink-0 shadow-sm shadow-royal-200"></div>
                      <span className="text-[11px] font-medium text-gray-700 uppercase leading-snug break-words">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Arrow indicator */}
              <div
                className={`absolute border-8 border-transparent drop-shadow-sm
                  ${showUp ? 'top-full border-t-white' : 'bottom-full border-b-white'}
                  ${alignRight ? 'right-4' : 'left-1/2 -translate-x-1/2'}
                `}
              ></div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InfoPopover;

