import { useState, useEffect } from "react";
import { Mail, MessageCircle, Send, Phone, FileText, Info, ExternalLink, User } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { fetchAllUsers } from "@/services/settingsService";
import { sendDocumentShareWhatsapp } from "@/services/whatsappService";
import { documentsApi } from "../../services/docsApi";
import { DocsModal, Field, FIELD_CLASS, TEXTAREA_CLASS, Spinner } from "../../components/DocsUI";

const OUTLINE_BTN = "px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50";

const docFileUrl = (doc) =>
  doc?.fileUrl || (Array.isArray(doc?.attachments) && doc.attachments[0]?.url) || "";

const DocumentBox = ({ name }) => (
  <Field label="Document">
    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-700">
      <FileText size={14} className="text-primary shrink-0" />
      <span className="truncate">{name}</span>
    </div>
  </Field>
);

export default function ShareModal({ isOpen, onClose, document, onShared }) {
  // "email" | "whatsapp"
  const [activeTab, setActiveTab] = useState("email");

  const [formData, setFormData] = useState({
    recipientName: "",
    recipientEmail: "",
    subject: "",
    message: "",
  });
  const [sharing, setSharing] = useState(false);

  // WhatsApp state — contacts & global settings users
  const [recentContacts, setRecentContacts] = useState([]);
  const [settingsUsers, setSettingsUsers] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedContactOption, setSelectedContactOption] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [customName, setCustomName] = useState("");
  const [sharingWa, setSharingWa] = useState(false);

  useEffect(() => {
    if (isOpen) loadContactsAndUsers();
  }, [isOpen]);

  const loadContactsAndUsers = async () => {
    try {
      setLoadingContacts(true);
      setLoadingUsers(true);

      const [sharesRes, usersRes] = await Promise.allSettled([
        documentsApi.listShares(),
        fetchAllUsers(),
      ]);

      // 1. Process Global Settings Users with valid phone numbers
      if (usersRes.status === "fulfilled" && Array.isArray(usersRes.value)) {
        const validUsers = usersRes.value
          .filter((u) => u.phone_number && String(u.phone_number).trim() !== "" && u.is_active !== false)
          .map((u) => ({
            id: `user_${u.user_id}`,
            userId: u.user_id,
            name: u.full_name || u.username || "User",
            phone: String(u.phone_number).trim(),
            displayPhone: String(u.phone_number).trim(),
            role: u.role || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSettingsUsers(validUsers);
      }

      // 2. Process Recent Share Contacts
      if (sharesRes.status === "fulfilled" && Array.isArray(sharesRes.value)) {
        const map = new Map();
        sharesRes.value.forEach((row) => {
          const cleanPhone = String(row.recipientPhone || "").replace(/\D/g, "");
          if (!cleanPhone || map.has(cleanPhone)) return;
          map.set(cleanPhone, {
            id: `recent_${cleanPhone}`,
            name: row.recipientName || `+${cleanPhone}`,
            phone: cleanPhone,
            displayPhone: `+${cleanPhone}`,
          });
        });
        setRecentContacts(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) {
      console.error("Failed to load contacts or users:", err);
    } finally {
      setLoadingContacts(false);
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (document) {
      const docTitle = document.documentName || "Document";
      setFormData({
        recipientName: "",
        recipientEmail: "",
        subject: `Sharing Document: ${docTitle}`,
        message: `Please find attached the document: ${docTitle}`,
      });
      setSelectedContactOption("");
      setCustomPhone("");
      setCustomName("");
    }
  }, [document]);

  if (!document) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const buildBody = () => {
    const url = docFileUrl(document);
    return /^https?:/.test(url) ? `${formData.message}\n\n${url}` : formData.message;
  };

  const openMailClient = () => {
    const href = `mailto:${encodeURIComponent(formData.recipientEmail.trim())}?subject=${encodeURIComponent(
      formData.subject
    )}&body=${encodeURIComponent(buildBody())}`;
    window.open(href, "_self");
  };

  // ── Email Submit ──────────────────────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!formData.recipientName.trim()) {
      toast.error("Please enter recipient name");
      return;
    }
    if (!formData.recipientEmail.trim()) {
      toast.error("Please enter recipient email");
      return;
    }
    try {
      setSharing(true);
      await documentsApi.recordShare({
        documentId: document.id,
        documentName: document.documentName,
        docSn: document.sn,
        recipientName: formData.recipientName,
        recipientEmail: formData.recipientEmail,
        subject: formData.subject,
        message: formData.message,
        purpose: formData.subject,
        notes: formData.message,
        shareMethod: "Email",
      });
      toast.success(`Document shared with ${formData.recipientName}! Share logged.`);
      if (onShared) onShared();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record document share");
    } finally {
      setSharing(false);
    }
  };

  // ── WhatsApp (click-to-chat) ──────────────────────────────────────────────
  const handleWhatsAppShare = async (e) => {
    if (e) e.preventDefault();
    let targetPhone = "";
    let recipientName = "";

    if (selectedContactOption === "new") {
      targetPhone = customPhone.trim();
      recipientName = customName.trim() || "New Contact";
    } else if (selectedContactOption.startsWith("user_")) {
      const user = settingsUsers.find((u) => u.id === selectedContactOption);
      if (user) {
        targetPhone = user.phone;
        recipientName = user.name;
      }
    } else if (selectedContactOption.startsWith("recent_")) {
      const contact = recentContacts.find((c) => c.id === selectedContactOption);
      if (contact) {
        targetPhone = contact.phone;
        recipientName = contact.name;
      }
    } else if (selectedContactOption) {
      const found =
        settingsUsers.find((u) => u.phone === selectedContactOption) ||
        recentContacts.find((c) => c.phone === selectedContactOption);
      targetPhone = found ? found.phone : selectedContactOption;
      recipientName = found ? found.name : selectedContactOption;
    }

    if (!targetPhone) {
      toast.error("Please select a contact or enter a mobile number");
      return;
    }

    let digitsOnly = targetPhone.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      toast.error("Please enter a valid mobile number");
      return;
    }
    // Bare 10-digit Indian mobile numbers need the country code.
    if (digitsOnly.length === 10) digitsOnly = `91${digitsOnly}`;

    // The template header is the document itself, so Meta needs a public URL.
    const fileUrl = docFileUrl(document);
    if (!/^https?:/.test(fileUrl)) {
      toast.error("This document has no uploaded file to send. Attach a file via Edit first.");
      return;
    }
    const fileName =
      (Array.isArray(document.attachments) && document.attachments[0]?.name) ||
      document.fileName?.split(",")[0]?.trim() ||
      `${document.documentName || "Document"}.pdf`;

    try {
      setSharingWa(true);
      const docName = document.documentName || "Document";
      const greetingName = selectedContactOption === "new" && !customName.trim() ? "" : recipientName;

      await sendDocumentShareWhatsapp({
        phone: digitsOnly,
        recipientName: greetingName,
        documentName: docName,
        fileUrl,
        fileName,
      });

      await documentsApi.recordShare({
        documentId: document.id,
        documentName: document.documentName,
        docSn: document.sn,
        recipientName,
        recipientPhone: digitsOnly,
        recipientEmail: "",
        subject: `Document Share: ${docName}`,
        message: `Template document_share sent with ${fileName}`,
        purpose: "WhatsApp Document Share",
        notes: `WhatsApp template sent to ${digitsOnly}`,
        shareMethod: "WhatsApp",
      });

      toast.success(`Document sent via WhatsApp to ${recipientName}!`);
      if (onShared) onShared();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message?.startsWith("Meta API Error") ? "WhatsApp rejected the message. Check the template and number." : "Failed to send via WhatsApp");
    } finally {
      setSharingWa(false);
    }
  };

  const waDisabled =
    sharingWa ||
    !selectedContactOption ||
    (selectedContactOption === "new" && !customPhone.trim()) ||
    !/^https?:/.test(docFileUrl(document));

  const tabs = [
    { id: "email", label: "Email", icon: Mail },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  ];

  return (
    <DocsModal
      open={isOpen}
      onClose={onClose}
      icon={activeTab === "email" ? Mail : MessageCircle}
      title="Share Document"
      description="Choose a sharing method"
      size="sm"
      onSubmit={activeTab === "email" ? handleEmailSubmit : handleWhatsAppShare}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className={OUTLINE_BTN}>
            Cancel
          </Button>
          {activeTab === "email" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={openMailClient}
                disabled={!formData.recipientEmail.trim()}
                className={`gap-2 ${OUTLINE_BTN}`}
                title="Open in your mail app"
              >
                <ExternalLink size={14} />
                Mail App
              </Button>
              <Button type="submit" disabled={sharing} className="gap-2 px-4 font-medium text-xs h-9">
                {sharing ? <Spinner /> : <Send size={14} />}
                {sharing ? "Sharing..." : "Share via Email"}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={waDisabled} className="gap-2 px-4 font-medium text-xs h-9">
              {sharingWa ? <Spinner /> : <Send size={14} />}
              {sharingWa ? "Sending..." : "Send via WhatsApp"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium ${
              activeTab === t.id ? "bg-white text-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <DocumentBox name={document.documentName} />

      {activeTab === "email" ? (
        <>
          <Field label="Recipient Name" required>
            <input
              type="text"
              name="recipientName"
              value={formData.recipientName}
              onChange={handleChange}
              placeholder="Enter recipient name"
              required
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Email Address" required>
            <input
              type="email"
              name="recipientEmail"
              value={formData.recipientEmail}
              onChange={handleChange}
              placeholder="recipient@example.com"
              required
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Subject">
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Enter subject"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Message">
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={3}
              placeholder="Enter message"
              className={`${TEXTAREA_CLASS} resize-none`}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Mobile Number" required>
            <select
              value={selectedContactOption}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedContactOption(val);
                if (val !== "new") {
                  setCustomPhone("");
                  setCustomName("");
                }
              }}
              className={FIELD_CLASS}
            >
              <option value="">
                {loadingUsers || loadingContacts
                  ? "Loading users & contacts..."
                  : "-- Choose a contact or enter new number --"}
              </option>
              <option value="new">+ New Contact (Enter mobile number)</option>
              {settingsUsers.length > 0 && (
                <optgroup label="Users from Global Settings">
                  {settingsUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.phone})
                    </option>
                  ))}
                </optgroup>
              )}
              {recentContacts.filter(
                (c) => !settingsUsers.some((su) => su.phone.replace(/\D/g, "") === c.phone)
              ).length > 0 && (
                <optgroup label="Recent Contacts">
                  {recentContacts
                    .filter((c) => !settingsUsers.some((su) => su.phone.replace(/\D/g, "") === c.phone))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.displayPhone})
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </Field>

          {selectedContactOption && selectedContactOption.startsWith("user_") && (() => {
            const selectedUser = settingsUsers.find((u) => u.id === selectedContactOption);
            if (!selectedUser) return null;
            return (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <User size={13} className="text-primary shrink-0" />
                <span className="font-medium text-slate-800 truncate">{selectedUser.name}</span>
                <span className="text-slate-400">•</span>
                <span className="shrink-0">{selectedUser.phone}</span>
                {selectedUser.role && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 font-medium capitalize shrink-0">
                    {selectedUser.role}
                  </span>
                )}
              </div>
            );
          })()}

          {selectedContactOption === "new" && (
            <>
              <Field label="Recipient Name">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Optional"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Enter Mobile Number" required>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="e.g. 9876543210 or +919876543210"
                    autoFocus
                    required
                    className={`${FIELD_CLASS} pl-9`}
                  />
                </div>
              </Field>
            </>
          )}

          {/^https?:/.test(docFileUrl(document)) ? (
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-[11px] text-slate-600">
              <Info size={14} className="text-primary shrink-0 mt-px" />
              <p className="leading-relaxed">
                The document is sent as a file directly from the VPR Systems WhatsApp number. The share is logged in
                Shared Documents.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-800">
              <Info size={14} className="text-amber-600 shrink-0 mt-px" />
              <p className="leading-relaxed">
                This document has no uploaded file, so it can&apos;t be sent on WhatsApp. Attach a file via Edit first.
              </p>
            </div>
          )}
        </>
      )}
    </DocsModal>
  );
}
