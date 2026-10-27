import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Search, X, Check, Send } from "lucide-react";
import { getInitials, avatarColorForId } from "../utils/chatUtils";

// Inner row component
function ContactRow({ contact, isSelected, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50 text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none min-h-[56px]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`h-11 w-11 rounded-full bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0`}
        >
          {getInitials(contact.displayName)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {contact.displayName}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
            {contact.phoneNumber}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        <div
          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected
              ? "bg-emerald-600 border-emerald-600"
              : "border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          }`}
        >
          {isSelected && <Check size={12} className="text-white" strokeWidth={3.5} />}
        </div>
      </div>
    </button>
  );
}

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

  // Trigger slide-up/fade-in animation on mount
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setMounted(true), 20);
      return () => clearTimeout(timer);
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Map conversations to top 5 unique recent contacts
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

  // Map all database contacts, excluding those already in recentContacts to prevent duplicates in layout
  const allContacts = useMemo(() => {
    const recentIds = new Set(recentContacts.map((rc) => rc.id));
    return contacts.map((c) => ({
      id: c.id,
      displayName: c.display_name || c.raw_phone_number || "Unknown Contact",
      phoneNumber: c.raw_phone_number ? `+${c.raw_phone_number}` : c.phone_number,
      avatarColor: avatarColorForId(c.id),
    })).filter((c) => !recentIds.has(c.id));
  }, [contacts, recentContacts]);

  // Dynamic filter for Recent Contacts
  const filteredRecent = useMemo(() => {
    if (!searchQuery.trim()) return recentContacts;
    const q = searchQuery.toLowerCase().trim();
    return recentContacts.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q)
    );
  }, [recentContacts, searchQuery]);

  // Dynamic filter for All Contacts
  const filteredAll = useMemo(() => {
    if (!searchQuery.trim()) return allContacts;
    const q = searchQuery.toLowerCase().trim();
    return allContacts.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q)
    );
  }, [allContacts, searchQuery]);

  // Horizontally scrolling row of selected contacts
  const selectedContactsDetails = useMemo(() => {
    const allList = [...recentContacts, ...allContacts];
    return selectedContactIds.map((id) =>
      allList.find((c) => c.id === id)
    ).filter(Boolean);
  }, [selectedContactIds, recentContacts, allContacts]);

  const handleToggleContact = (id) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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

  // Prevent scroll propagation to main page when modal is active
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  if (summary) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-300 opacity-100"
        onClick={onClose}
      >
        <div
          className="relative w-[480px] max-h-[80vh] flex flex-col bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform scale-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white select-none">
              Forward Summary
            </h1>
            <button
              onClick={onClose}
              className="h-12 w-12 flex items-center justify-center rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200/55 dark:hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Success Badge */}
            <div className="flex">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 animate-scale-up">
                Sent to {summary.successCount} contacts
              </span>
            </div>

            {/* Warning Message */}
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
              The following recipients have no active 24-hour customer service session window open. Standard message forwarding failed:
            </p>

            {/* Scrollable Failures Container */}
            <div className="flex-grow max-h-[200px] overflow-y-auto border border-gray-200 dark:border-slate-800 rounded-xl divide-y divide-gray-100 dark:divide-slate-800/60 bg-gray-50/30 dark:bg-slate-955/20">
              {summary.failedContacts.map((contact) => (
                <div key={contact.id} className="px-4 py-2.5 flex flex-col">
                  <span className="text-sm font-bold text-gray-800 dark:text-slate-200">
                    {contact.displayName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-450 mt-0.5">
                    {contact.phoneNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Next Step Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-950/20 flex-shrink-0">
            <button
              onClick={() => onBatchTemplateFallback(summary.failedContacts)}
              disabled={isSending}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-500/20 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSending ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={16} />
                  <span>Send Initiation Template Instead</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-300 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`relative w-[480px] max-h-[80vh] flex flex-col bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform ${
          mounted ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Top Container (Header & Search & Selected Contacts) */}
        <div className="flex-shrink-0 bg-white dark:bg-slate-900">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-3">
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={isSending}
                className="h-12 w-12 flex items-center justify-center rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200/55 dark:hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
                title="Back"
              >
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white select-none">
                Forward to...
              </h1>
            </div>
            <button
              onClick={onClose}
              disabled={isSending}
              className="h-12 w-12 flex items-center justify-center rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200/55 dark:hover:bg-slate-850 active:scale-95 transition-all cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-gray-150 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone number"
                disabled={isSending}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-gray-800 dark:text-slate-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Selected Contacts Horizontal Row */}
          {selectedContactsDetails.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-3 overflow-x-auto px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/30 scrollbar-none">
              {selectedContactsDetails.map((contact) => (
                <div
                  key={contact.id}
                  className="relative flex flex-col items-center gap-1 flex-shrink-0 animate-scale-up"
                >
                  <div
                    className={`h-11 w-11 rounded-full bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-white text-xs font-bold shadow-sm select-none`}
                  >
                    {getInitials(contact.displayName)}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-slate-400 max-w-[56px] truncate">
                    {contact.displayName.split(" ")[0]}
                  </span>
                  <button
                    onClick={() => handleDeselectContact(contact.id)}
                    disabled={isSending}
                    className="absolute -top-1 -right-1 h-5 w-5 bg-slate-500 dark:bg-slate-700 text-white rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm cursor-pointer hover:bg-rose-600 transition-colors"
                    title="Remove"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Body Wrapper */}
        <div className="flex-grow flex-shrink overflow-y-auto min-h-0 pb-4">
          {/* Recent Chats Section */}
          {filteredRecent.length > 0 && (
            <div className="mt-2">
              <h2 className="px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider select-none">
                Recent Chats
              </h2>
              <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                {filteredRecent.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={isSelected}
                      onClick={() => handleToggleContact(contact.id)}
                      disabled={isSending}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* All Contacts Section */}
          {filteredAll.length > 0 && (
            <div className="mt-3">
              <h2 className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-slate-450 uppercase tracking-wider select-none">
                All Contacts
              </h2>
              <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                {filteredAll.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={isSelected}
                      onClick={() => handleToggleContact(contact.id)}
                      disabled={isSending}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {filteredRecent.length === 0 && filteredAll.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-slate-500">
              <p className="text-sm font-medium">No contacts found</p>
              <p className="text-xs mt-1">Try searching by another name or number</p>
            </div>
          )}
        </div>

        {/* Floating Action Send Button inside the card relative wrapper */}
        {selectedContactIds.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={isSending}
            className={`absolute bottom-6 right-6 h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-700 active:scale-95 z-20 cursor-pointer ${
              isSending ? "animate-pulse" : "animate-scale-up"
            }`}
            title="Forward Selected"
          >
            {isSending ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={22} className="ml-0.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
