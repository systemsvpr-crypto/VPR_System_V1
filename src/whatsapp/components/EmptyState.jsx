import { MessagesSquare } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="hidden md:flex h-full flex-1 flex-col items-center justify-center bg-slate-50 text-center px-6">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 border border-primary/15">
        <MessagesSquare size={34} className="text-primary" />
      </div>
      <h2 className="text-base font-semibold text-slate-700">Select a chat to begin customer management</h2>
      <p className="mt-1.5 max-w-sm text-xs text-slate-500">
        Pick a conversation from the left to view message history, dispatch templates, and manage this customer's
        profile.
      </p>
    </div>
  );
}
