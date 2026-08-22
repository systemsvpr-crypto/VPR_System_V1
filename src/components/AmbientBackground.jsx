import React from 'react';

/**
 * Soft ambient lighting for full-page canvases (login, empty states, hero
 * sections): pure white base with faint drifting blue glows. Fixed and
 * pointer-events-none so it never interferes with content above it.
 */
const AmbientBackground = () => {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white">
      <div className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-royal-100/60 blur-[120px]" />
      <div className="absolute top-1/3 -right-40 h-[36rem] w-[36rem] rounded-full bg-sky-100/70 blur-[130px] animate-aidash-float" />
      <div className="absolute bottom-0 left-1/4 h-[28rem] w-[28rem] rounded-full bg-royal-50 blur-[110px]" />
    </div>
  );
};

export default AmbientBackground;
