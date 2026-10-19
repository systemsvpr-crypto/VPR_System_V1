// Wraps a page and, when `active`, blocks every pointer/keyboard
// interaction inside it so a view-only user can browse but not edit.
import ReadOnlyBanner from "./ReadOnlyBanner";

const ReadOnlyGuard = ({ active = false, showBanner = true, children }) => {
  if (!active) return children;
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {showBanner && <ReadOnlyBanner className="mb-3" />}
      <div className="pointer-events-none select-text flex-1 min-h-0" aria-disabled="true">
        {children}
      </div>
    </div>
  );
};

export default ReadOnlyGuard;
