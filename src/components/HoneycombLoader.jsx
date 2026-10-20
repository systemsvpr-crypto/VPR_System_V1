import React from 'react';

/**
 * Standard system loader (replaced honeycomb design).
 */
const HoneycombLoader = ({
  size = 32,
  overlay = false,
}) => {
  const spinner = (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-xs">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default HoneycombLoader;
