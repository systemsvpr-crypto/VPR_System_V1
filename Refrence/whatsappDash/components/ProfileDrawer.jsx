import { useState } from "react";
import { X, Phone, Tag, FileImage, FileText, Clock } from "lucide-react";
import supabase from "../../../SupabaseClient";
import { getInitials, isMetaSessionActive } from "../utils/chatUtils";

export default function ProfileDrawer({ conversation, onClose, onContactNameUpdated, onContactPhoneUpdated }) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(conversation.phoneNumber || "");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const mediaMessages = conversation.messages.filter(
    (m) => m.type === "IMAGE" || m.type === "VIDEO",
  );
  const docMessages = conversation.messages.filter((m) => m.type === "DOCUMENT");
  const sessionActive = isMetaSessionActive(conversation.metaSessionExpiresAt);

  // Check if contact's display_name is missing, empty, or simply matches their phone number
  const hasNoCustomName = !conversation.displayName || 
    conversation.displayName.trim() === "" || 
    conversation.displayName.replace(/\D/g, "") === conversation.phoneNumber.replace(/\D/g, "");

  const handleSaveName = async (e) => {
    if (e) e.preventDefault();
    const inputCustomName = newName.trim();
    if (!inputCustomName) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("whatsapp_contacts_metadata")
        .update({ display_name: inputCustomName })
        .eq("id", conversation.contactId);

      if (error) throw error;

      if (onContactNameUpdated) {
        onContactNameUpdated(conversation.contactId, inputCustomName);
      }
      setIsEditingName(false);
    } catch (err) {
      console.error("Failed to save display name:", err);
      alert("Failed to save display name: " + err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSavePhone = async (e) => {
    if (e) e.preventDefault();
    const updatedNewNumber = newPhone.trim();
    if (!updatedNewNumber) return;

    setIsSavingPhone(true);
    try {
      const { error } = await supabase
        .from("whatsapp_contacts_metadata")
        .update({ 
          raw_phone_number: updatedNewNumber,
          phone_number: updatedNewNumber 
        })
        .eq("id", conversation.contactId);

      if (error) throw error;

      if (onContactPhoneUpdated) {
        onContactPhoneUpdated(conversation.contactId, updatedNewNumber);
      }
      setIsEditingPhone(false);
    } catch (err) {
      console.error("Failed to save phone number:", err);
      alert("Failed to save phone number: " + err.message);
    } finally {
      setIsSavingPhone(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[120] flex h-full w-full sm:w-[320px] flex-shrink-0 flex-col border-l border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 md:relative md:inset-auto md:z-auto">
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 dark:border-slate-800 px-4">
        <h3 className="text-sm font-black text-gray-900 dark:text-white">Profile</h3>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-3 h-20 w-20 rounded-full bg-gradient-to-tr ${conversation.avatarColor} flex items-center justify-center text-white text-2xl font-bold shadow-md`}
          >
            {getInitials(conversation.customerName)}
          </div>
          <div className="flex items-center justify-center w-full min-h-[32px] mb-1">
            {!isEditingName ? (
              <p className="group flex items-center gap-1.5 text-base font-black text-gray-900 dark:text-white">
                <span>{conversation.customerName}</span>
                <button
                  onClick={() => {
                    setNewName(hasNoCustomName ? "" : conversation.customerName);
                    setIsEditingName(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                  title="Edit Display Name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </p>
            ) : (
              <form onSubmit={handleSaveName} className="flex items-center gap-1 w-full max-w-[220px]">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter display name..."
                  disabled={isSavingName}
                  className="w-full min-w-0 px-2 py-1 text-xs border border-gray-250 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-950 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSavingName || !newName.trim()}
                  className="flex-shrink-0 p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-40 cursor-pointer"
                  title="Save Name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  disabled={isSavingName}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Cancel"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </form>
            )}
          </div>
          
          <div className="flex items-center justify-center w-full min-h-[24px]">
            {!isEditingPhone ? (
              <p className="group flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                <Phone size={11} /> 
                <span>{conversation.phoneNumber}</span>
                <button
                  onClick={() => {
                    setNewPhone(conversation.phoneNumber);
                    setIsEditingPhone(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                  title="Edit Phone Number"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </p>
            ) : (
              <form onSubmit={handleSavePhone} className="flex items-center gap-1 w-full max-w-[220px]">
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  disabled={isSavingPhone}
                  className="w-full min-w-0 px-2 py-1 text-xs border border-gray-250 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSavingPhone || !newPhone.trim()}
                  className="flex-shrink-0 p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-40 cursor-pointer"
                  title="Save Phone Number"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  disabled={isSavingPhone}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Cancel"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>

        <Section title="Tags" icon={Tag}>
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.length ? (
              conversation.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">No tags assigned</span>
            )}
          </div>
        </Section>

        <Section title="Meta Session" icon={Clock}>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
              sessionActive
                ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
            }`}
          >
            {sessionActive ? "Active" : "Expired"}
          </span>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
            {new Date(conversation.metaSessionExpiresAt).toLocaleString()}
          </p>
        </Section>

        <Section title={`Shared Media (${mediaMessages.length})`} icon={FileImage}>
          {mediaMessages.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {mediaMessages.map((m) => (
                <div key={m.id} className="aspect-square overflow-hidden rounded-lg">
                  <img src={m.mediaUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No media shared yet</p>
          )}
        </Section>

        <Section title={`Documents (${docMessages.length})`} icon={FileText}>
          {docMessages.length ? (
            <div className="space-y-1.5">
              {docMessages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-slate-800 px-2.5 py-2"
                >
                  <FileText size={14} className="text-rose-500" />
                  <span className="truncate text-xs font-semibold text-gray-700 dark:text-slate-300">
                    {m.body}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No documents shared yet</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-505">
        <Icon size={12} /> {title}
      </p>
      {children}
    </div>
  );
}
