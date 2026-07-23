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
      icon: <AlertTriangle className="text-red-600" size={24} />,
      iconBg: "bg-red-100",
      buttonBg: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    },
    warning: {
      icon: <AlertTriangle className="text-orange-600" size={24} />,
      iconBg: "bg-orange-100",
      buttonBg: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500",
    },
    success: {
      icon: <CheckCircle className="text-emerald-600" size={24} />,
      iconBg: "bg-emerald-100",
      buttonBg: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
    },
    info: {
      icon: <Info className="text-blue-600" size={24} />,
      iconBg: "bg-blue-100",
      buttonBg: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
    }
  };

  const currentStyle = styles[type] || styles.warning;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="p-5 sm:p-6 flex flex-col items-center text-center">
          
          <div className={`w-12 h-12 rounded-full ${currentStyle.iconBg} flex items-center justify-center mb-4`}>
            {currentStyle.icon}
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {title}
          </h3>
          
          <p className="text-sm text-gray-500 mb-6">
            {message}
          </p>

          <div className="flex w-full gap-3">
            {!hideCancel && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${currentStyle.buttonBg}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
