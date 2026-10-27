import { useState, useMemo, useEffect } from "react";
import { Search, X, Check, Send, Forward, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInitials, avatarColorForId } from "../utils/chatUtils";

const Spinner = () => <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />;

function ContactRow({ contact, isSelected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none ${
        isSelected ? "bg-primary/5" : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`h-9 w-9 rounded-full bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}
        >
          {getInitials(contact.displayName)}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{contact.displayName}</p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{contact.phoneNumber}</p>
        </div>
      </div>
      <div
        className={`ml-3 h-[18px] w-[18px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
          isSelected ? "bg-primary border-primary" : "border-slate-300 bg-white"
        }`}
      >
        {isSelected && <Check size={11} className="text-white" strokeWidth={3.5} />}
      </div>
    </button>
  );
}

const SectionLabel = ({ children, className = "" }) => (
  <h2 className={`px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide select-none ${className}`}>
    {children}
  </h2>
);

export default function ForwardModal({
  isOpen,
  onClose,
  contacts,
  conversations,
  onForwardSubmit,
  isSending,
  onBatchTemplateFallback,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [summary, setSummary] = useState(null); // { successCount, failedContacts }

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setMounted(true), 20);
      return () => clearTimeout(timer);
    }
    setMounted(false);
  }, [isOpen]);

  // Top 5 unique recent contacts from the inbox
  const recentContacts = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const c of conversations) {
      if (!c.contactId || seen.has(c.contactId)) continue;
      seen.add(c.contactId);
      const dbMatch = contacts.find((contact) => contact.id === c.contactId);
      list.push({
        id: c.contactId,
        displayName: c.customerName || dbMatch?.display_name || "Unknown",
        phoneNumber: c.phoneNumber || dbMatch?.phone_number || "",
        avatarColor: c.avatarColor || avatarColorForId(c.contactId),
      });
      if (list.length >= 5) break;
    }
    return list;
  }, [conversations, contacts]);

  // Every other contact, excluding the recent ones
  const allContacts = useMemo(() => {
    const recentIds = new Set(recentContacts.map((rc) => rc.id));
    return contacts
      .map((c) => ({
        id: c.id,
        displayName: c.display_name || c.raw_phone_number || "Unknown Contact",
        phoneNumber: c.raw_phone_number ? `+${c.raw_phone_number}` : c.phone_number,
        avatarColor: avatarColorForId(c.id),
      }))
      .filter((c) => !recentIds.has(c.id));
  }, [contacts, recentContacts]);

  const matches = (c, q) => c.displayName.toLowerCase().includes(q) || c.phoneNumber.toLowerCase().includes(q);

  const filteredRecent = useMemo(() => {
    if (!searchQuery.trim()) return recentContacts;
    const q = searchQuery.toLowerCase().trim();
    return recentContacts.filter((c) => matches(c, q));
  }, [recentContacts, searchQuery]);

  const filteredAll = useMemo(() => {
    if (!searchQuery.trim()) return allContacts;
    const q = searchQuery.toLowerCase().trim();
    return allContacts.filter((c) => matches(c, q));
  }, [allContacts, searchQuery]);

  const selectedContactsDetails = useMemo(() => {
    const allList = [...recentContacts, ...allContacts];
    return selectedContactIds.map((id) => allList.find((c) => c.id === id)).filter(Boolean);
  }, [selectedContactIds, recentContacts, allContacts]);

  const handleToggleContact = (id) => {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDeselectContact = (id) => {
    setSelectedContactIds((prev) => prev.filter((x) => x !== id));
  };

  const handleSubmit = async () => {
    if (selectedContactIds.length === 0 || isSending) return;
    try {
      const result = await onForwardSubmit(selectedContactIds);
      if (result && result.failedContacts && result.failedContacts.length > 0) {
        setSummary(result);
      }
    } catch (err) {
      console.error("Forwarding failed inside modal:", err);
    }
  };

  // Lock page scroll while the modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      disabled={isSending}
      className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      title="Close"
    >
      <X size={18} />
    </button>
  );

  if (summary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="relative w-full max-w-md max-h-[80vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle size={17} />
              </div>
              <h2 className="text-sm font-semibold text-slate-800">Forward Summary</h2>
            </div>
            {closeButton}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
              Sent to {summary.successCount} contacts
            </span>
            <p className="text-xs text-slate-500 leading-relaxed">
              The following recipients have no active 24-hour customer service session window open. Standard message
              forwarding failed:
            </p>
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50/50">
              {summary.failedContacts.map((contact) => (
                <div key={contact.id} className="px-3.5 py-2 flex flex-col">
                  <span className="text-xs font-semibold text-slate-800">{contact.displayName}</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">{contact.phoneNumber}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-slate-100 shrink-0">
            <Button
              onClick={() => onBatchTemplateFallback(summary.failedContacts)}
              disabled={isSending}
              className="w-full gap-2 h-9 text-xs font-medium"
            >
              {isSending ? <Spinner /> : <Send size={14} />}
              Send Initiation Template Instead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 transition-opacity duration-200 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md max-h-[80vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 ${
          mounted ? "scale-100 translate-y-0" : "scale-95 translate-y-3"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Forward size={17} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Forward to...</h2>
                <p className="text-xs text-slate-500">Select one or more contacts</p>
              </div>
            </div>
            {closeButton}
          </div>

          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone number"
                disabled={isSending}
                className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 text-slate-700 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {selectedContactsDetails.length > 0 && (
            <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              {selectedContactsDetails.map((contact) => (
                <div key={contact.id} className="relative flex flex-col items-center gap-1 shrink-0">
                  <div
                    className={`h-9 w-9 rounded-full bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-white text-[11px] font-bold select-none`}
                  >
                    {getInitials(contact.displayName)}
                  </div>
                  <span className="text-[10px] font-medium text-slate-600 max-w-[56px] truncate">
                    {contact.displayName.split(" ")[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeselectContact(contact.id)}
                    disabled={isSending}
                    className="absolute -top-1 -right-1 h-4 w-4 bg-slate-500 text-white rounded-full flex items-center justify-center border border-white hover:bg-red-500 transition-colors"
                    title="Remove"
                  >
                    <X size={9} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pb-2">
          {filteredRecent.length > 0 && (
            <div>
              <SectionLabel className="text-primary">Recent Chats</SectionLabel>
              <div className="divide-y divide-slate-100">
                {filteredRecent.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContactIds.includes(contact.id)}
                    onClick={() => handleToggleContact(contact.id)}
                    disabled={isSending}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredAll.length > 0 && (
            <div className="mt-1">
              <SectionLabel className="text-slate-500">All Contacts</SectionLabel>
              <div className="divide-y divide-slate-100">
                {filteredAll.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContactIds.includes(contact.id)}
                    onClick={() => handleToggleContact(contact.id)}
                    disabled={isSending}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredRecent.length === 0 && filteredAll.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <p className="text-xs font-medium text-slate-500">No contacts found</p>
              <p className="text-[11px] mt-1">Try searching by another name or number</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 shrink-0">
          <span className="text-xs text-slate-500">
            {selectedContactIds.length > 0 ? `${selectedContactIds.length} selected` : "No contacts selected"}
          </span>
          <Button
            onClick={handleSubmit}
            disabled={isSending || selectedContactIds.length === 0}
            className="gap-2 px-4 h-9 text-xs font-medium"
          >
            {isSending ? <Spinner /> : <Send size={14} />}
            Forward
          </Button>
        </div>
      </div>
    </div>
  );
}
