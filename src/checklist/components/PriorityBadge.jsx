import { AlertTriangle } from "lucide-react";
import { normalizePriority, PRIORITY_STYLES } from "../utils/taskPriority";

export default function PriorityBadge({ priority, className = "" }) {
  const level = normalizePriority(priority);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide whitespace-nowrap ${PRIORITY_STYLES[level]} ${className}`}
    >
      {level === "Urgent" && <AlertTriangle className="w-3 h-3" />}
      {level}
    </span>
  );
}
