import { MessagesSquare } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="hidden md:flex h-full flex-1 flex-col items-center justify-center bg-[#f7f7f5] dark:bg-slate-900 text-center px-6">
      <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
        <MessagesSquare size={40} className="text-emerald-500" />
      </div>
      <h2 className="text-lg font-black text-gray-700 dark:text-slate-200">
        Select a chat to begin customer management
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-gray-400 dark:text-slate-500">
        Pick a conversation from the left to view message history, dispatch
        templates, and manage this customer's profile.
      </p>
    </div>
  );
}
