import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * Compact KPI tile: icon, label, big value and a trend delta.
 * Used inside Analytics / Sales / Reports widgets.
 */
const StatTile = ({ icon: Icon, label, value, delta, trend = 'up', tone = 'royal' }) => {
  const positive = trend === 'up';
  const toneRing = tone === 'royal' ? 'bg-royal-50 text-royal-600' : 'bg-sky-50 text-sky-600';
  return (
    <div className="rounded-2xl bg-white/60 ring-1 ring-royal-600/25 p-4 transition-colors hover:bg-white/90">
      <div className="flex items-center justify-between">
        {Icon && (
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneRing}`}>
            <Icon size={15} strokeWidth={2.2} />
          </div>
        )}
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${positive ? 'text-emerald-600' : 'text-rose-500'}`}>
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-xl font-extrabold text-ink-heading tracking-tight">{value}</p>
      <p className="text-xs text-ink-body">{label}</p>
    </div>
  );
};

export default StatTile;
