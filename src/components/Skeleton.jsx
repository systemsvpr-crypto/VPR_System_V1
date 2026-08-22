import React from 'react';

/**
 * Frosted shimmer loading placeholder. Pass `rows` for stacked lines or
 * use as a single block via className (e.g. h-32 w-full).
 */
const Skeleton = ({ rows, className = '' }) => {
  if (rows) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="aidash-shimmer h-3 rounded-full"
            style={{ width: `${88 - i * 14}%` }}
          />
        ))}
      </div>
    );
  }
  return <div className={`aidash-shimmer rounded-2xl ${className}`} />;
};

export default Skeleton;
