import React from 'react';
import { motion } from 'framer-motion';

/**
 * Base floating glassmorphism card used across the app (dashboard tiles,
 * form sections, table containers, panels). Handles the frosted blur, thin
 * border, soft blue shadow, hover lift/glow and entrance animation.
 */
const GlassCard = ({
  children,
  className = '',
  span = '',
  delay = 0,
  glow = true,
  noPadding = false,
  as: Component = motion.div,
}) => {
  return (
    <Component
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6 }}
      className={`
        aidash-glass group relative overflow-hidden rounded-[24px]
        shadow-glass transition-shadow duration-500 ease-out
        ${glow ? 'hover:shadow-glow-blue' : 'hover:shadow-glass-hover'}
        ${noPadding ? '' : 'p-6'}
        ${span}
        ${className}
      `}
    >
      <span className="aidash-specular" />
      {/* Ambient corner glow, brightens on hover */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-royal-400/20 blur-3xl opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
      <div className="relative z-10 h-full flex flex-col">{children}</div>
    </Component>
  );
};

export default GlassCard;
