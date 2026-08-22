import React from 'react';
import { motion } from 'framer-motion';

const TONES = {
  royal: 'from-royal-600 to-royal-400',
  success: 'from-emerald-500 to-emerald-400',
  amber: 'from-amber-500 to-amber-400',
  sky: 'from-sky-500 to-royal-400',
};

/**
 * Animated progress bar — width tweens in on mount/scroll-into-view.
 */
const ProgressBar = ({ value = 0, tone = 'royal', label, showValue = true, className = '' }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="text-ink-body font-medium">{label}</span>}
          {showValue && <span className="font-bold text-ink-heading">{clamped}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-royal-600/10">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${clamped}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full bg-gradient-to-r ${TONES[tone] || TONES.royal} shadow-[0_0_8px_rgba(37,99,235,0.5)]`}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
