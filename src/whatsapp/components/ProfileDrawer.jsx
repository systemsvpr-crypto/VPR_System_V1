import { useState } from "react";
import { X, Phone, Tag, FileImage, FileText, Clock, Pencil, Check } from "lucide-react";
import { getInitials, isMetaSessionActive } from "../utils/chatUtils";
import { updateContact } from "../services/whatsappApi";
import { useWaToast } from "../utils/toast";

const EDIT_INPUT =
  "w-full min-w-0 h-8 px-2 text-xs rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40";

export default function ProfileDrawer({ conversation, onClose, onContactNameUpdated, onContactPhoneUpdated }) {
  const { showToast } = useWaToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(conversation.phoneNumber || "");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const mediaMessages = conversation.messages.filter((m) => m.type === "IMAGE" || m.type === "VIDEO");
  const docMessages = conversation.messages.filter((m) => m.type === "DOCUMENT");
  const sessionActive = isMetaSessionActive(conversation.metaSessionExpiresAt);

  // Display name missing, empty, or simply the phone number.
  const hasNoCustomName =
    !conversation.displayName ||
    conversation.displayName.trim() === "" ||
    conversation.displayName.replace(/\D/g, "") === (conversation.phoneNumber || "").replace(/\D/g, "");

  const handleSaveName = async (e) => {
    if (e) e.preventDefault();
    const inputCustomName = newName.trim();
    if (!inputCustomName) return;

    setIsSavingName(true);
    try {
      await updateContact(conversation.contactId, { display_name: inputCustomName });
      if (onContactNameUpdated) onContactNameUpdated(conversation.contactId, inputCustomName);
      setIsEditingName(false);
    } catch (err) {
      console.error("Failed to save display name:", err);
      showToast("Failed to save display name: " + err.message, "error");
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
      const saved = await updateContact(conversation.contactId, { raw_phone_number: updatedNewNumber });
      if (onContactPhoneUpdated) onContactPhoneUpdated(conversation.contactId, saved?.raw_phone_number || updatedNewNumber);
      setIsEditingPhone(false);
    } catch (err) {
      console.error("Failed to save phone number:", err);
      showToast("Failed to save phone number: " + err.message, "error");
    } finally {
      setIsSavingPhone(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[120] flex h-full w-full sm:w-[320px] shrink-0 flex-col border-l border-slate-200 bg-white md:relative md:inset-auto md:z-auto">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <h3 className="text-sm font-semibold text-slate-800">Contact Profile</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-3 h-20 w-20 rounded-full bg-gradient-to-tr ${conversation.avatarColor} flex items-center justify-center text-white text-2xl font-semibold shadow-sm`}
          >
            {getInitials(conversation.customerName)}
          </div>
          <div className="flex items-center justify-center w-full min-h-[32px] mb-1">
            {!isEditingName ? (
              <p className="group flex items-center gap-1.5 text-base font-semibold text-slate-800">
                <span>{conversation.customerName}</span>
                <button
                  onClick={() => {
                    setNewName(hasNoCustomName ? "" : conversation.customerName);
                    setIsEditingName(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-primary"
                  title="Edit Display Name"
                >
                  <Pencil size={13} />
                </button>
              </p>
            ) : (
              <form onSubmit={handleSaveName} className="flex items-center gap-1 w-full max-w-[230px]">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter display name..."
                  disabled={isSavingName}
                  className={EDIT_INPUT}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSavingName || !newName.trim()}
                  className="shrink-0 p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-40"
                  title="Save Name"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  disabled={isSavingName}
                  className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  title="Cancel"
                >
                  <X size={15} />
                </button>
              </form>
            )}
          </div>

          <div className="flex items-center justify-center w-full min-h-[24px]">
            {!isEditingPhone ? (
              <p className="group flex items-center gap-1.5 text-xs text-slate-500">
                <Phone size={11} />
                <span>{conversation.phoneNumber}</span>
                <button
                  onClick={() => {
                    setNewPhone(conversation.phoneNumber);
                    setIsEditingPhone(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-primary"
                  title="Edit Phone Number"
                >
                  <Pencil size={12} />
                </button>
              </p>
            ) : (
              <form onSubmit={handleSavePhone} className="flex items-center gap-1 w-full max-w-[230px]">
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  disabled={isSavingPhone}
                  className={EDIT_INPUT}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSavingPhone || !newPhone.trim()}
                  className="shrink-0 p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-40"
                  title="Save Phone Number"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  disabled={isSavingPhone}
                  className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  title="Cancel"
                >
                  <X size={15} />
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
                  className="rounded-full bg-primary/10 border border-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">No tags assigned</span>
            )}
          </div>
        </Section>

        <Section title="Meta Session" icon={Clock}>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
              sessionActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {sessionActive ? "Active" : "Expired"}
          </span>
          <p className="mt-1 text-[11px] text-slate-400">
            {conversation.metaSessionExpiresAt
              ? new Date(conversation.metaSessionExpiresAt).toLocaleString("en-IN")
              : "No customer message yet"}
          </p>
        </Section>

        <Section title={`Shared Media (${mediaMessages.length})`} icon={FileImage}>
          {mediaMessages.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {mediaMessages.map((m) => (
                <div key={m.id} className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {m.type === "VIDEO" ? (
                    <video src={m.mediaUrl} className="h-full w-full object-cover" preload="metadata" />
                  ) : (
                    <img src={m.mediaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No media shared yet</p>
          )}
        </Section>

        <Section title={`Documents (${docMessages.length})`} icon={FileText}>
          {docMessages.length ? (
            <div className="space-y-1.5">
              {docMessages.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                  <FileText size={14} className="text-red-500 shrink-0" />
                  <span className="truncate text-xs font-medium text-slate-700">{m.body}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No documents shared yet</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon size={12} /> {title}
      </p>
      {children}
    </div>
  );
}
