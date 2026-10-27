import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Calendar } from "lucide-react";
import useAuthStore from "../../store/authStore";
import { canAccessWhatsappPage } from "../WhatsAppApp";

const LINKS = [
  { id: "whatsapp_inbox", path: "/whatsapp/inbox", label: "Chat Inbox", icon: MessageSquare },
  { id: "whatsapp_scheduler", path: "/whatsapp/scheduler", label: "Broadcast Scheduler", icon: Calendar },
];

export default function WhatsAppSubNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const links = LINKS.filter((l) => canAccessWhatsappPage(user, l.id));

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 shrink-0 overflow-x-auto">
      <div className="flex items-center gap-6">
        {links.map((l) => {
          const active = location.pathname.startsWith(l.path);
          return (
            <button
              key={l.id}
              onClick={() => navigate(l.path)}
              className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                active ? "text-primary border-b-2 border-primary translate-y-[1px]" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <l.icon size={16} />
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>
      <span className="pb-3 text-xs text-slate-400 font-medium hidden sm:block whitespace-nowrap">WhatsApp Business</span>
    </div>
  );
}
