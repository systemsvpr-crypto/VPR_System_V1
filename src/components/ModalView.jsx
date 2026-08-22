import React from 'react';
import { X } from 'lucide-react';

const ModalView = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
  zIndex = 'z-[100]'
}) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 lg:left-64 2xl:left-72 bg-slate-900/40 backdrop-blur-md flex items-center justify-center ${zIndex} p-3 aidash-overlay-in overflow-hidden`}>
      <div
        className={`aidash-glass-solid aidash-panel-in relative rounded-[24px] shadow-glass-hover w-full ${maxWidth} h-[450px] max-h-[85vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="aidash-specular" />
        {/* Compact Header */}
        <div className="relative px-4 py-3 border-b border-royal-600/25 flex items-center justify-center flex-shrink-0">
          <h2 className="text-[11px] font-bold text-ink-heading uppercase tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-ink-body hover:text-ink-heading hover:bg-royal-50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body - Hidden scrollbar */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          <style>{`
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {children}
        </div>

        {/* Footer Action */}
        <div className="px-4 py-3 border-t border-royal-600/25 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 ring-1 ring-royal-600/25 bg-white/60 rounded-2xl text-xs text-ink-body hover:bg-white hover:text-ink-heading transition-all active:scale-[0.98] font-bold uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalView;
