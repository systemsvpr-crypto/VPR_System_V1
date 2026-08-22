import React from 'react';

const VARIANTS = {
  success: 'bg-emerald-50 text-emerald-600 ring-emerald-600/15',
  info: 'bg-royal-50 text-royal-600 ring-royal-600/30',
  warning: 'bg-amber-50 text-amber-600 ring-amber-600/15',
  danger: 'bg-rose-50 text-rose-600 ring-rose-600/15',
  neutral: 'bg-gray-100 text-gray-500 ring-gray-500/10',
};

const DOT = {
  success: 'bg-emerald-500',
  info: 'bg-royal-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  neutral: 'bg-gray-400',
};

/**
 * Small pill badge with a status dot, used for record/task/deal states.
 */
const StatusBadge = ({ children, variant = 'neutral', dot = true, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${VARIANTS[variant] || VARIANTS.neutral} ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[variant] || DOT.neutral}`} />}
    {children}
  </span>
);

export default StatusBadge;
