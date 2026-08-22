import React, { useState, useCallback } from 'react';

const VARIANTS = {
  primary: 'bg-gradient-to-b from-royal-500 to-royal-600 text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] hover:shadow-[0_8px_22px_rgba(37,99,235,0.45)]',
  secondary: 'bg-white/70 text-royal-600 ring-1 ring-royal-600/30 hover:bg-white',
  ghost: 'bg-royal-50 text-royal-600 hover:bg-royal-100',
};

/**
 * Rounded pill button with a material-style ripple on click, used as the
 * primary call-to-action across widgets ("Send", "Compose", "New Task"...).
 */
const RippleButton = ({ children, icon: Icon, onClick, variant = 'primary', className = '', size = 'md', type = 'button' }) => {
  const [ripples, setRipples] = useState([]);

  const handleClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const id = Date.now();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size }]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 600);
    onClick?.(e);
  }, [onClick]);

  const sizing = size === 'sm' ? 'px-3.5 py-1.5 text-xs gap-1.5' : 'px-4.5 py-2.5 text-sm gap-2';
  
  let btnText = '';
  if (typeof children === 'string') btnText = children.toLowerCase();
  else if (Array.isArray(children)) {
    const strChild = children.find(c => typeof c === 'string');
    if (strChild) btnText = strChild.toLowerCase();
  }

  let colorClass = VARIANTS[variant] || VARIANTS.primary;

  if (variant === 'primary' && btnText) {
    if (btnText.includes('save') || btnText.includes('add') || btnText.includes('update') || btnText.includes('submit') || btnText.includes('create') || btnText.includes('apply')) {
      colorClass = 'ring-1 ring-emerald-500/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700';
    } else if (btnText.includes('cancel') || btnText.includes('delete') || btnText.includes('remove') || btnText.includes('clear')) {
      colorClass = 'ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700';
    } else {
      colorClass = 'ring-1 ring-royal-500/50 bg-royal-50 text-royal-600 hover:bg-royal-100 hover:text-royal-700';
    }
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold transition-all duration-200 active:scale-[0.97] ${sizing} ${colorClass} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.3} />}
      {children}
      {ripples.map((r) => (
        <span key={r.id} className="aidash-ripple-span" style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />
      ))}
    </button>
  );
};

export default RippleButton;

