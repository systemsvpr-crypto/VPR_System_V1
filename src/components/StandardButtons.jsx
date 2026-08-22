import React from 'react';
import { XCircle, Save, Check } from 'lucide-react';

/**
 * TabSwitcher Component - Standardized Tabs for Pending/History
 */
export const TabSwitcher = ({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="flex justify-start gap-2 px-2 sm:px-0 flex-wrap w-full sm:w-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 sm:flex-initial h-[32px] md:h-[38px] flex items-center justify-center px-3 sm:px-5 whitespace-nowrap text-xs font-medium rounded-lg border ${
            activeTab === tab.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

/**
 * FormActionButtons Component - Standardized Save/Cancel Buttons
 */
export const FormActionButtons = ({ 
  onCancel, 
  onSubmit, 
  cancelText = 'Cancel', 
  submitText = 'Save Changes',
  loading = false,
  className = "",
  formId = null,
  extraButton = null
}) => {
  const getSubmitColor = (text) => {
    const t = (text || '').toLowerCase();
    if (t.includes('save') || t.includes('add') || t.includes('update') || t.includes('submit') || t.includes('create') || t.includes('apply')) {
      return 'ring-1 ring-emerald-500/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700';
    }
    if (t.includes('delete') || t.includes('remove') || t.includes('clear')) {
      return 'ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700';
    }
    return 'ring-1 ring-blue-500/50 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700';
  };

  const getCancelColor = (text) => {
    const t = (text || '').toLowerCase();
    if (t.includes('cancel') || t.includes('close') || t.includes('no')) {
      return 'ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700';
    }
    return 'ring-1 ring-blue-600/25 bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900';
  };

  return (
    <div className={`flex gap-3 items-center ${className}`}>
      <button
        type="button"
        onClick={onCancel}
        className={`flex-1 px-2 md:px-4 py-2.5 rounded-2xl font-bold transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2 ${getCancelColor(cancelText)}`}
        title={cancelText}
      >
        <XCircle size={18} />
        <span className="hidden sm:inline">{cancelText}</span>
      </button>

      {extraButton && (
        <div className="flex-1 flex w-full justify-center">
          {extraButton}
        </div>
      )}

      <button
        type={onSubmit ? "button" : "submit"}
        form={formId}
        onClick={onSubmit}
        disabled={loading}
        className={`flex-[1.5] font-bold py-2.5 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${getSubmitColor(submitText)}`}
        title={submitText}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="hidden sm:inline">Processing...</span>
          </>
        ) : (
          <>
            <Save size={18} />
            <span className="hidden sm:inline">{submitText}</span>
          </>
        )}
      </button>
    </div>
  );
};
