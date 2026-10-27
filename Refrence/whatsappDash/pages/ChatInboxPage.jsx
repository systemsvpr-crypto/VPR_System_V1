import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../checklist/components/layout/AdminLayout";
import { useMagicToast } from "../../../context/MagicToastContext";
import ChatSidebar from "../components/ChatSidebar";
import ChatWindow from "../components/ChatWindow";
import EmptyState from "../components/EmptyState";
import ProfileDrawer from "../components/ProfileDrawer";
import TemplateDrawer from "../components/TemplateDrawer";
import NewChatModal from "../components/NewChatModal";
import ForwardModal from "../components/ForwardModal";
import { activeAgent } from "../data/dummyData";
import { mapDbConversationToUi, mapDbMessageToUi } from "../utils/chatUtils";
import {
  fetchInboxConversations,
  fetchMessages,
  fetchApprovedTemplates,
  fetchUsers,
  markConversationRead,
  softDeleteMessages,
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  uploadWhatsappMedia,
  syncTemplatesFromMeta,
  subscribeToConversations,
  subscribeToContacts,
  subscribeToMessages,
  subscribeToStatusHistory,
  initiateNewChat,
  fetchContacts,
  executeForwarding,
} from "../services/whatsappApi";

const mapDbTemplateToUi = (t) => ({
  id: t.id,
  elementName: t.element_name,
  category: t.category,
  language: t.language,
  bodyText: t.body_text,
  headerType: t.header_type || "NONE",
  headerText: t.header_text || null,
  headerSampleUrl: t.header_sample_url || null,
  footerText: t.footer_text || null,
  buttons: t.buttons || [],
});

export default function ChatInboxPage() {
  const { showToast } = useMagicToast();

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const [messagesByChat, setMessagesByChat] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [isSyncingTemplates, setIsSyncingTemplates] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);

  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  // New-chat modal state
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [isSendingNewChat, setIsSendingNewChat] = useState(false);
  const [chatUsers, setChatUsers] = useState([]);
  const [newChatSendProgress, setNewChatSendProgress] = useState(null); // { done, total }

  // Forwarding modal states
  const [contacts, setContacts] = useState([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);

  const reloadConversations = useCallback(async () => {
    try {
      const rows = await fetchInboxConversations();
      setConversations(rows.map(mapDbConversationToUi));
    } catch (err) {
      console.error("Failed to load WhatsApp conversations:", err);
      showToast("Failed to load conversations", "error");
    } finally {
      setLoadingConversations(false);
    }
  }, [showToast]);

  const reloadContacts = useCallback(async () => {
    try {
      const data = await fetchContacts();
      setContacts(data);
    } catch (err) {
      console.error("Failed to load WhatsApp contacts:", err);
    }
  }, []);

  // Initial load + live updates to the conversation list (unread counts,
  // last message preview, new inbound conversations).
  useEffect(() => {
    reloadConversations();
    reloadContacts();
    const unsubscribeConv = subscribeToConversations(() => reloadConversations());
    const unsubscribeContact = subscribeToContacts(() => {
      reloadConversations();
      reloadContacts();
    });
    return () => {
      unsubscribeConv();
      unsubscribeContact();
    };
  }, [reloadConversations, reloadContacts]);

  const handleRefreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        reloadConversations(),
        reloadContacts(),
      ]);
      if (activeChatId) {
        const rows = await fetchMessages(activeChatId);
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: rows.map(mapDbMessageToUi),
        }));
      }
      showToast("Data refreshed successfully", "success");
    } catch (err) {
      console.error("Failed to refresh data:", err);
      showToast("Failed to refresh data", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [activeChatId, reloadConversations, reloadContacts, showToast]);

  // Polling backup to fetch updates every 5 seconds.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const convRows = await fetchInboxConversations();
        setConversations(convRows.map(mapDbConversationToUi));

        if (activeChatId) {
          const msgRows = await fetchMessages(activeChatId);
          setMessagesByChat((prev) => ({
            ...prev,
            [activeChatId]: msgRows.map(mapDbMessageToUi),
          }));
        }
      } catch (err) {
        console.error("Background auto-refresh failed:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeChatId]);

  const reloadTemplates = useCallback(async () => {
    try {
      const rows = await fetchApprovedTemplates();
      setTemplates(rows.map(mapDbTemplateToUi));
    } catch (err) {
      console.error("Failed to load WhatsApp templates:", err);
    }
  }, []);

  // Approved template catalogue for the "Fetch Meta Template" drawer.
  useEffect(() => {
    reloadTemplates();
  }, [reloadTemplates]);

  const handleSyncTemplates = async () => {
    setIsSyncingTemplates(true);
    try {
      const result = await syncTemplatesFromMeta();
      await reloadTemplates();
      showToast(
        `Synced ${result.saved}/${result.fetched} templates from Meta`,
        "success",
      );
    } catch (err) {
      console.error("Failed to sync templates from Meta:", err);
      showToast(err.message || "Failed to sync templates from Meta", "error");
    } finally {
      setIsSyncingTemplates(false);
    }
  };

  // Open the New Chat modal and lazily fetch the users list if not already loaded.
  const handleOpenNewChat = useCallback(async () => {
    setNewChatModalOpen(true);
    if (chatUsers.length === 0) {
      try {
        const rows = await fetchUsers();
        setChatUsers(rows);
      } catch (err) {
        console.error("Failed to load users for new-chat picker:", err);
        // Non-fatal — the manual phone input still works.
      }
    }
  }, [chatUsers.length]);

  /**
   * Sends the first outbound template to a new/existing contact.
   * The edge function handles get-or-create conversation server-side.
   * On success we reload the sidebar and jump to the new thread.
   */
  const handleInitiateNewChat = useCallback(
    async ({
      contacts,
      templateElementName,
      templateLanguage,
      variables,
      headerMediaUrl,
      headerFileName,
    }) => {
      setIsSendingNewChat(true);
      setNewChatSendProgress({ done: 0, total: contacts.length });
      let lastConversationId = null;
      let successCount = 0;
      let failCount = 0;
      const CHUNK_SIZE = 5;
      try {
        for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
          const chunk = contacts.slice(i, i + CHUNK_SIZE);
          const results = await Promise.allSettled(
            chunk.map(({ phoneNumber, displayName }) =>
              initiateNewChat({
                phoneNumber,
                displayName,
                templateElementName,
                templateLanguage,
                variables,
                headerMediaUrl,
                headerFileName,
              }).then((res) => ({ ...res, phoneNumber })),
            ),
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              lastConversationId = r.value.conversationId;
              successCount += 1;
            } else {
              console.error(
                `Failed to initiate chat with ${chunk[idx].phoneNumber}:`,
                r.reason,
              );
              failCount += 1;
            }
          });
          setNewChatSendProgress({
            done: Math.min(i + CHUNK_SIZE, contacts.length),
            total: contacts.length,
          });
          if (i + CHUNK_SIZE < contacts.length) {
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        }

        // Reload sidebar so new conversations appear at the top.
        await reloadConversations();

        if (lastConversationId) {
          // Load messages for the most recent new thread immediately.
          const msgs = await fetchMessages(lastConversationId);
          setMessagesByChat((prev) => ({
            ...prev,
            [lastConversationId]: msgs.map(mapDbMessageToUi),
          }));
          handleSelectChat(lastConversationId);
        }

        setNewChatModalOpen(false);

        if (failCount === 0) {
          showToast(
            successCount > 1
              ? `Template sent to ${successCount} contacts!`
              : "Template sent — conversation started!",
            "success",
          );
        } else if (successCount > 0) {
          showToast(
            `Sent to ${successCount} contact(s), ${failCount} failed`,
            "error",
          );
        } else {
          showToast("Failed to start conversation", "error");
        }
      } finally {
        setIsSendingNewChat(false);
        setNewChatSendProgress(null);
      }
    },
    [reloadConversations, showToast],
  );

  // Global status-history feed: patch a message's status in-place wherever
  // it's currently loaded (status_history has no conversation_id to filter on).
  useEffect(() => {
    const unsubscribe = subscribeToStatusHistory((payload) => {
      const { message_id, status } = payload.new;
      setMessagesByChat((prev) => {
        let touched = false;
        const next = { ...prev };
        for (const chatId of Object.keys(next)) {
          if (next[chatId].some((m) => m.id === message_id)) {
            touched = true;
            next[chatId] = next[chatId].map((m) =>
              m.id === message_id ? { ...m, status: status.toUpperCase() } : m,
            );
          }
        }
        return touched ? next : prev;
      });
    });
    return unsubscribe;
  }, []);

  // Load full message history + subscribe to live inserts for the open chat.
  useEffect(() => {
    if (!activeChatId) return;

    let cancelled = false;
    setLoadingMessages(true);

    fetchMessages(activeChatId)
      .then((rows) => {
        if (cancelled) return;
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: rows.map(mapDbMessageToUi),
        }));
      })
      .catch((err) => {
        console.error("Failed to load messages:", err);
        showToast("Failed to load message history", "error");
      })
      .finally(() => !cancelled && setLoadingMessages(false));

    const unsubscribe = subscribeToMessages(activeChatId, (payload) => {
      const uiMessage = mapDbMessageToUi(payload.new);
      setMessagesByChat((prev) => {
        const existing = prev[activeChatId] || [];
        if (payload.eventType === "INSERT") {
          if (existing.some((m) => m.id === uiMessage.id)) return prev;
          return { ...prev, [activeChatId]: [...existing, uiMessage] };
        } else if (payload.eventType === "UPDATE") {
          if (payload.new && payload.new.deleted_at) {
            return {
              ...prev,
              [activeChatId]: existing.filter((m) => m.id !== payload.new.id),
            };
          }
          return {
            ...prev,
            [activeChatId]: existing.map((m) =>
              m.id === uiMessage.id ? uiMessage : m,
            ),
          };
        }
        return prev;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeChatId, showToast]);

  const activeConversation = useMemo(() => {
    const conv = conversations.find((c) => c.chatId === activeChatId);
    if (!conv) return null;
    return { ...conv, messages: messagesByChat[activeChatId] || [] };
  }, [conversations, activeChatId, messagesByChat]);

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setIsMultiSelectMode(false);
    setSelectedMessageIds([]);
    setProfileDrawerOpen(false);
    if (chatId) {
      setConversations((prev) =>
        prev.map((c) => (c.chatId === chatId ? { ...c, unreadCount: 0 } : c)),
      );
      markConversationRead(chatId).catch((err) =>
        console.error("Failed to mark conversation read:", err),
      );
    }
  };

  const handleSendText = async (text, replyToMessageId) => {
    if (!activeChatId) return;
    try {
      await sendTextMessage({
        conversationId: activeChatId,
        text,
        replyToMessageId,
      });
      
      // The realtime INSERT subscription above appends the persisted row —
      // no optimistic local append needed.
    } catch (err) {
      console.error("Failed to send message:", err);
      showToast(err.message || "Failed to send message", "error");
    }
  };

  const handleSendMedia = async (file) => {
    if (!activeChatId) return;

    showToast(`Uploading ${file.name}...`, "info");

    try {
      const publicUrl = await uploadWhatsappMedia(
        file,
        `whatsapp_${activeChatId}`,
      );

      await sendMediaMessage({
        conversationId: activeChatId,
        mediaUrl: publicUrl,
        mimeType: file.type,
        fileName: file.name,
      });

      showToast("File sent successfully", "success");
    } catch (err) {
      console.error("Failed to upload/send file:", err);
      showToast(err.message || "Failed to send file", "error");
    }
  };

  const handleDispatchTemplate = async (
    template,
    variables,
    headerMediaUrl,
    headerFileName,
  ) => {
    if (!activeChatId) return;
    try {
      await sendTemplateMessage({
        conversationId: activeChatId,
        templateElementName: template.elementName,
        templateLanguage: template.language,
        variables,
        headerMediaUrl,
        headerFileName,
      });
      setTemplateDrawerOpen(false);
      showToast(`Template "${template.elementName}" dispatched`, "success");
    } catch (err) {
      console.error("Failed to dispatch template:", err);
      showToast(err.message || "Failed to dispatch template", "error");
    }
  };

  const handleSendInitiationTemplate = async () => {
    if (!activeChatId) return;
    try {
      await sendTemplateMessage({
        conversationId: activeChatId,
        templateElementName: "message_initiation",
        templateLanguage: "en",
        variables: [],
        headerMediaUrl: undefined,
        headerFileName: undefined,
      });
      showToast('Initiation template dispatched successfully', "success");
    } catch (err) {
      console.error("Failed to send initiation template:", err);
      showToast(err.message || "Failed to send initiation template", "error");
    }
  };

  const handleContactNameUpdated = useCallback((contactId, newDisplayName) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.contactId === contactId
          ? { ...c, displayName: newDisplayName, customerName: newDisplayName }
          : c
      )
    );
    reloadConversations();
  }, [reloadConversations]);

  const handleContactPhoneUpdated = useCallback((contactId, newPhoneNumber) => {
    const displayPhone = newPhoneNumber.startsWith('+') ? newPhoneNumber : '+' + newPhoneNumber;
    setConversations((prev) =>
      prev.map((c) =>
        c.contactId === contactId
          ? { ...c, phoneNumber: displayPhone }
          : c
      )
    );
    reloadConversations();
  }, [reloadConversations]);

  const handleToggleMultiSelect = (active) => {
    setIsMultiSelectMode(active);
    if (!active) setSelectedMessageIds([]);
  };

  const handleToggleMessageSelect = (messageId) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId],
    );
  };

  // Forwarding to another conversation needs a contact-picker UI we haven't
  // built yet, so this stays a mock action for now.
  const handleForwardSelected = (idsOverride) => {
    const ids = idsOverride || selectedMessageIds;
    if (!ids.length) return;
    if (idsOverride) {
      setSelectedMessageIds(idsOverride);
    }
    setShowForwardModal(true);
  };

  const handleCloseForwardModal = () => {
    setShowForwardModal(false);
    setIsMultiSelectMode(false);
    setSelectedMessageIds([]);
  };

  const handleExecuteForwarding = async (selectedContactIds) => {
    setIsForwarding(true);
    showToast(`Forwarding ${selectedMessageIds.length} message(s)...`, "info");
    try {
      const result = await executeForwarding(selectedContactIds, selectedMessageIds);
      if (result && result.failedContacts && result.failedContacts.length > 0) {
        setIsForwarding(false);
        return result;
      } else {
        showToast(`Messages forwarded successfully!`, "success");
        handleCloseForwardModal();
        await reloadConversations();
      }
    } catch (err) {
      console.error("Forwarding failed:", err);
      showToast(err.message || "Failed to forward messages", "error");
    } finally {
      setIsForwarding(false);
    }
  };

  const handleBatchTemplateFallback = async (failedRecipients) => {
    setIsForwarding(true);
    showToast(`Sending fallback templates...`, "info");
    let successCount = 0;
    let failCount = 0;
    try {
      for (const recipient of failedRecipients) {
        try {
          await initiateNewChat({
            phoneNumber: recipient.phoneNumber,
            displayName: recipient.displayName,
            templateElementName: "message_initiation",
            templateLanguage: "en",
            variables: [],
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to send fallback template to ${recipient.phoneNumber}:`, err);
          failCount++;
        }
      }
      if (failCount === 0) {
        showToast(`Fallback template sent successfully to all ${successCount} contacts!`, "success");
      } else if (successCount > 0) {
        showToast(`Fallback template sent to ${successCount} contacts, ${failCount} failed`, "warning");
      } else {
        showToast(`Failed to send initiation templates`, "error");
      }
      handleCloseForwardModal();
      await reloadConversations();
    } catch (err) {
      console.error("Batch fallback template failed:", err);
      showToast(err.message || "Failed to send batch templates", "error");
    } finally {
      setIsForwarding(false);
    }
  };

  const handleDeleteSelected = async (idsOverride) => {
    const rawIds = idsOverride || selectedMessageIds;
    if (!rawIds.length || !activeChatId) return;

    // Resolve any synthetic album IDs to underlying message IDs
    const currentMessages = messagesByChat[activeChatId] || [];
    const ids = [];
    rawIds.forEach((id) => {
      if (typeof id === "string" && id.startsWith("album_")) {
        const firstId = id.replace("album_", "");
        const match = currentMessages.find((m) => m.id === firstId);
        if (match && match.mediaItems) {
          match.mediaItems.forEach((m) => ids.push(m.id));
        } else if (match) {
          ids.push(match.id);
        }
      } else {
        ids.push(id);
      }
    });

    if (!ids.length) return;

    if (
      !window.confirm(
        "Are you sure you want to delete the selected message(s)?",
      )
    )
      return;
    try {
      await softDeleteMessages(ids);
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: (prev[activeChatId] || []).filter(
          (m) => !ids.includes(m.id),
        ),
      }));
      await reloadConversations();
      showToast(`Deleted ${ids.length} message(s)`, "success");
    } catch (err) {
      console.error("Failed to delete messages:", err);
      showToast(err.message || "Failed to delete message(s)", "error");
    } finally {
      setIsMultiSelectMode(false);
      setSelectedMessageIds([]);
    }
  };

  // No whatsapp_message_reactions table yet — reactions are visual-only
  // until that's added, so this only updates local state.
  const handleReactToMessage = (messageId, emoji) => {
    if (!activeChatId) return;
    setMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: (prev[activeChatId] || []).map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions || [];
        const found = existing.find((r) => r.emoji === emoji);
        const reactions = found
          ? existing.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1 } : r,
            )
          : [...existing, { emoji, count: 1 }];
        return { ...m, reactions };
      }),
    }));
  };

  return (
    <AdminLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        <div className="flex w-full h-full overflow-hidden flex-1">
          <ChatSidebar
          conversations={conversations}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeAgent={activeAgent}
          onSyncTemplates={handleSyncTemplates}
          isSyncingTemplates={isSyncingTemplates}
          onRefreshData={handleRefreshData}
          isRefreshingData={isRefreshing}
          onNewChat={handleOpenNewChat}
        />

        {loadingConversations ? (
          <div className="flex flex-1 items-center justify-center text-sm font-semibold text-gray-400">
            Loading conversations…
          </div>
        ) : activeConversation ? (
          <ChatWindow
            key={activeConversation.chatId}
            conversation={activeConversation}
            isLoadingMessages={loadingMessages}
            isMultiSelectMode={isMultiSelectMode}
            selectedMessageIds={selectedMessageIds}
            onToggleMultiSelect={handleToggleMultiSelect}
            onToggleMessageSelect={handleToggleMessageSelect}
            onForwardSelected={handleForwardSelected}
            onDeleteSelected={handleDeleteSelected}
            onSendText={handleSendText}
            onSendMedia={handleSendMedia}
            onOpenTemplateDrawer={() => setTemplateDrawerOpen(true)}
            onReactToMessage={handleReactToMessage}
            onOpenProfileDrawer={() => setProfileDrawerOpen((v) => !v)}
            onBackToList={() => handleSelectChat(null)}
            onSendInitiationTemplate={handleSendInitiationTemplate}
          />
        ) : (
          <EmptyState />
        )}

        {activeConversation && profileDrawerOpen && (
          <ProfileDrawer
            conversation={activeConversation}
            onClose={() => setProfileDrawerOpen(false)}
            onContactNameUpdated={handleContactNameUpdated}
            onContactPhoneUpdated={handleContactPhoneUpdated}
          />
        )}
      </div>
      </div>

      {templateDrawerOpen && (
        <TemplateDrawer
          templates={templates}
          onClose={() => setTemplateDrawerOpen(false)}
          onDispatch={handleDispatchTemplate}
        />
      )}

      {newChatModalOpen && (
        <NewChatModal
          templates={templates}
          isSending={isSendingNewChat}
          sendProgress={newChatSendProgress}
          onClose={() => setNewChatModalOpen(false)}
          onSend={handleInitiateNewChat}
        />
      )}

      {showForwardModal && (
        <ForwardModal
          isOpen={showForwardModal}
          onClose={handleCloseForwardModal}
          contacts={contacts}
          conversations={conversations}
          onForwardSubmit={handleExecuteForwarding}
          isSending={isForwarding}
          onBatchTemplateFallback={handleBatchTemplateFallback}
        />
      )}
    </AdminLayout>
  );
}
