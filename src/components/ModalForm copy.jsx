import React from 'react';
import { X } from 'lucide-react';
import { FormActionButtons } from './StandardButtons';

const ModalForm = ({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  submitText = 'Submit',
  cancelText = 'Cancel',
  maxWidth = 'max-w-2xl',
  maxHeight = '60vh',
  zIndex = 'z-[100]',
  extraFooterAction = null,
  overflowVisible = false
}) => {
  const formRef = React.useRef(null);

  React.useEffect(() => {
    if (isOpen && formRef.current) {
      const focusable = formRef.current.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), [tabindex="0"]:not([disabled])'
      );
      const firstField = Array.from(focusable).find(el => {
        return true;
      });
      if (firstField) {
        const timer = setTimeout(() => {
          firstField.focus();
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 lg:left-64 2xl:left-72 bg-slate-900/40 backdrop-blur-md flex items-center justify-center ${zIndex} p-3 md:p-4 aidash-overlay-in`}>
      <style>{`
        @media (max-width: 767px) {
          .responsive-modal-height {
            max-height: 55vh !important;
          }
        }
      `}</style>
      <div
        className={`aidash-glass-solid aidash-panel-in relative rounded-[24px] shadow-glass-hover w-full ${maxWidth} flex flex-col ${overflowVisible ? '' : 'overflow-hidden'} responsive-modal-height`}
        style={{ scale: 1, maxHeight }}
      >
        <span className="aidash-specular" />
        {/* Compact Header */}
        <div className="relative px-4 py-3 border-b border-royal-600/25 flex items-center justify-center flex-shrink-0 z-20">
          <h2 className="text-[11px] md:text-sm font-bold text-ink-heading uppercase tracking-wider text-center">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-ink-body hover:text-ink-heading hover:bg-royal-50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Minimal Scrollable Body */}
        <div
          className={`flex-1 ${overflowVisible ? 'overflow-visible z-30' : 'overflow-y-auto z-10'} min-h-0 scrollbar-hide`}
        >

          <div className="px-3 py-2 md:px-4 md:py-3">
            <form ref={formRef} id="ultra-compact-form" onSubmit={onSubmit} autoComplete="off" className="space-y-1.5 md:space-y-2 text-left">
              {children}
            </form>
          </div>
        </div>

        {/* Standardized Footer Buttons */}
        <div className="px-4 py-3 border-t border-royal-600/25 flex-shrink-0 z-20">
          <FormActionButtons
            onCancel={onClose}
            cancelText={cancelText}
            submitText={submitText}
            className="w-full"
            formId="ultra-compact-form"
            extraButton={extraFooterAction}
          />
        </div>
      </div>
    </div>
  );
};

export default ModalForm;
