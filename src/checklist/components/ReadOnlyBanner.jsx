// Notice shown at the top of a page the current user may view but not change.
import { Eye } from "lucide-react";

const ReadOnlyBanner = ({ className = "" }) => (
  <div
    className={`flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ${className}`}
  >
    <Eye size={16} className="shrink-0" />
    <span>View-only access — changes are disabled on this page.</span>
  </div>
);

export default ReadOnlyBanner;
