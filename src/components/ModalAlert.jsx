import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';

/**
 * ModalAlert Component
 * A premium modal for success messages and action confirmations.
 * 
 * @param {boolean} isOpen - Controls visibility.
 * @param {string} type - 'success', 'error', or 'confirm'.
 * @param {string} title - Main heading.
 * @param {string} message - Description text.
 * @param {Function} onConfirm - Action for 'Confirm' button.
 * @param {Function} onClose - Action for 'Cancel/OK' button.
 */
const ModalAlert = ({ 
  isOpen, 
  type = 'success', 
  title, 
  message, 
  onConfirm, 
  onClose 
}) => {
  if (!isOpen) return null;

  const config = {
    success: {
      icon: <CheckCircle2 className="text-emerald-500" size={38} />,
      btnColor: 'ring-1 ring-emerald-500/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700',
      iconBg: 'bg-emerald-50 ring-1 ring-emerald-600/10',
      accent: 'from-emerald-400 to-emerald-500'
    },
    error: {
      icon: <AlertCircle className="text-rose-500" size={38} />,
      btnColor: 'ring-1 ring-rose-500/50 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
      iconBg: 'bg-rose-50 ring-1 ring-rose-600/10',
      accent: 'from-rose-400 to-rose-500'
    },
    confirm: {
      icon: <HelpCircle className="text-royal-500" size={38} />,
      btnColor: 'ring-1 ring-royal-500/50 bg-royal-50 text-royal-600 hover:bg-royal-100 hover:text-royal-700',
      iconBg: 'bg-royal-50 ring-1 ring-royal-600/25',
      accent: 'from-royal-400 to-royal-500'
    }
  }[type] || {};

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[1000] p-4 aidash-overlay-in">
      <div
        className="aidash-glass-solid aidash-panel-in rounded-[24px] p-7 w-full max-w-sm shadow-glass-hover flex flex-col items-center text-center relative overflow-hidden"
      >
        <span className="aidash-specular" />
        {/* Visual Accent */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.accent}`} />

        <div className={`mb-5 ${config.iconBg} w-16 h-16 rounded-2xl flex items-center justify-center`}>
          {config.icon}
        </div>

        <h3 className="text-lg font-bold text-ink-heading mb-2 tracking-tight">{title}</h3>
        <p className="text-ink-body text-sm mb-7 leading-relaxed px-2">
          {message}
        </p>

        <div className="flex gap-3 w-full">
          {type === 'confirm' ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-semibold text-sm py-2.5 rounded-2xl transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 font-semibold text-sm py-2.5 rounded-2xl transition-all active:scale-95 ${config.btnColor}`}
              >
                Confirm
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className={`w-full font-semibold text-sm py-2.5 rounded-2xl transition-all active:scale-95 ${config.btnColor}`}
            >
              Great, thanks!
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalAlert;
