import React from 'react';

const TONES = {
  royal: 'bg-royal-50 text-royal-600 ring-royal-600/25',
  sky: 'bg-sky-50 text-sky-600 ring-sky-600/10',
  success: 'bg-emerald-50 text-emerald-600 ring-emerald-600/10',
  amber: 'bg-amber-50 text-amber-600 ring-amber-600/10',
  slate: 'bg-gray-100 text-gray-500 ring-gray-500/10',
  solid: 'bg-gradient-to-br from-royal-500 to-royal-700 text-white ring-transparent shadow-[0_6px_14px_rgba(37,99,235,0.35)]',
};

/**
 * Rounded square icon tile used for avatars-of-concepts (file types,
 * automation nodes, notification kinds, etc).
 */
const IconTile = ({ icon: Icon, tone = 'royal', size = 'md', className = '' }) => {
  const box = size === 'sm' ? 'h-8 w-8 rounded-xl' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-2xl';
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  return (
    <div className={`flex shrink-0 items-center justify-center ring-1 ring-inset ${box} ${TONES[tone] || TONES.royal} ${className}`}>
      <Icon size={iconSize} strokeWidth={2.1} />
    </div>
  );
};

export default IconTile;
