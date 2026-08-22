import React from 'react';

/**
 * Standard header row for a card/section: icon tile, title, subtitle and an
 * optional trailing action (button / badge / link).
 */
const SectionHeader = ({ icon: Icon, iconColor = 'text-royal-600', iconBg = 'bg-royal-50', title, subtitle, action }) => {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconBg} ring-1 ring-royal-600/25`}>
            <Icon size={18} className={iconColor} strokeWidth={2.1} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-ink-heading tracking-tight truncate">{title}</h3>
          {subtitle && <p className="text-xs text-ink-body truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export default SectionHeader;
