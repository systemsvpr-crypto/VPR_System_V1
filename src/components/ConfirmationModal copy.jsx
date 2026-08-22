import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action", 
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "warning", // warning, danger, success, info
  hideCancel = false
}) {
  useEffect(() => {
    if (isOpen && type === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type, onClose]);

  if (!isOpen) return null;

  const styles = {
    danger: {
      icon: <AlertTriangle className="text-red-600" size={20} />,
      iconBg: "bg-red-50 ring-1 ring-red-600/10",
      buttonBg: "ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
    },
    warning: {
      icon: <AlertTriangle className="text-amber-600" size={20} />,
      iconBg: "bg-amber-50 ring-1 ring-amber-600/10",
      buttonBg: "ring-1 ring-amber-500/50 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700",
    },
    success: {
      icon: <CheckCircle className="text-emerald-600" size={20} />,
      iconBg: "bg-emerald-50 ring-1 ring-emerald-600/10",
      buttonBg: "ring-1 ring-emerald-500/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700",
    },
    info: {
      icon: <Info className="text-royal-600" size={20} />,
      iconBg: "bg-royal-50 ring-1 ring-royal-600/25",
      buttonBg: "ring-1 ring-royal-500/50 bg-royal-50 text-royal-600 hover:bg-royal-100 hover:text-royal-700",
    }
  };

  const currentStyle = styles[type] || styles.warning;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="aidash-overlay-in fixed inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="aidash-panel-in aidash-glass-solid relative rounded-[24px] shadow-glass-hover w-full max-w-sm overflow-hidden z-10">
        <span className="aidash-specular" />
        <div className="p-7 flex flex-col items-center text-center">

          <div className={`w-[52px] h-[52px] rounded-2xl ${currentStyle.iconBg} flex items-center justify-center mb-4`}>
            {currentStyle.icon}
          </div>

          <h3 className="text-base font-bold text-ink-heading mb-2 tracking-tight">
            {title}
          </h3>

          <p className="text-sm text-ink-body mb-6 leading-relaxed">
            {message}
          </p>

          <div className="flex w-full gap-3">
            {!hideCancel && (
              <button
                onClick={onClose}
                className={`flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] focus:outline-none focus:ring-2 ${
                  cancelText.toLowerCase().includes('cancel') || cancelText.toLowerCase().includes('no') || cancelText.toLowerCase().includes('close')
                    ? 'ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 focus:ring-red-200'
                    : 'bg-white/70 ring-1 ring-royal-600/25 text-ink-heading hover:bg-white focus:ring-gray-200'
                }`}
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] focus:outline-none focus:ring-2 ${
                confirmText.toLowerCase().includes('delete') || confirmText.toLowerCase().includes('remove')
                  ? 'ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700'
                  : confirmText.toLowerCase().includes('save') || confirmText.toLowerCase().includes('add')
                  ? 'ring-1 ring-emerald-500/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700'
                  : currentStyle.buttonBg
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
