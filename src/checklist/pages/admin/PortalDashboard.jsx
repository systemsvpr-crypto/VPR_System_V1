import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
  Sparkles,
  Layers,
  Building2,
  CheckCircle2,
  Boxes,
  MessageCircle,
  ShoppingBag,
  RotateCcw,
  PackageCheck,
  Settings,
  TrendingUp,
  Files,
} from "lucide-react";
import AdminLayout from "../../components/layout/ChecklistLayout";
import supabase from "../../SupabaseClient";
import { isAdministrator } from "../../utils/roleUtils";
import { getReadablePageIds, setStoredPageAccess } from "../../utils/pagePermissionUtils";
import useAuthStore from "../../../store/authStore";

export default function PortalDashboard() {
  const authUser = useAuthStore.getState().user || {};
  const [userInfo, setUserInfo] = useState({
    username: localStorage.getItem("user-name") || authUser.full_name || authUser.Name || authUser.username || "Admin User",
    role: (localStorage.getItem("role") || authUser.role || "admin").toUpperCase(),
    email: authUser.email || "Not provided",
    phone: authUser.phone_number || "Not provided",
    profileImage: localStorage.getItem("profile_image") || authUser.profile_picture || "",
  });

  useEffect(() => {
    const fetchUserProfile = async () => {
      const storedUsername = localStorage.getItem("user-name");
      const storedUserId = localStorage.getItem("user-id");

      if (!storedUsername && !storedUserId) return;

      try {
        let query = supabase.from("checklist_users").select("*");
        if (storedUserId) {
          query = query.eq("id", storedUserId);
        } else if (storedUsername) {
          query = query.eq("user_name", storedUsername);
        }

        const { data, error } = await query.maybeSingle();

        if (data && !error) {
          const fetchedEmail = data.email_id || data.email || userInfo.email;
          const fetchedPhone =
            data.number || data.phone || data.mobile || userInfo.phone;
          const fetchedRole = (data.role || userInfo.role).toUpperCase();
          const fetchedUsername =
            data.user_name || data.username || userInfo.username;
          const fetchedImg = data.profile_image || userInfo.profileImage;

          setUserInfo({
            username: fetchedUsername,
            role: fetchedRole,
            email: fetchedEmail,
            phone: fetchedPhone,
            profileImage: fetchedImg,
          });

          // Sync back required items to localStorage
          localStorage.setItem("user-name", fetchedUsername);
          if (data.role) localStorage.setItem("role", data.role);
          if (data.division) localStorage.setItem("division", data.division);
          else localStorage.removeItem("division");
          if (data.page_access) setStoredPageAccess(data.page_access);
          if (data.profile_image) {
            localStorage.setItem("profile_image", data.profile_image);
          } else {
            localStorage.removeItem("profile_image");
          }

          // Clean up sensitive / redundant keys
          localStorage.removeItem("email_id");
          localStorage.removeItem("phone");
          localStorage.removeItem("contact");
          localStorage.removeItem("can_self_assign");
        }
      } catch (err) {
        console.error("Error fetching user profile in PortalDashboard:", err);
      }
    };

    fetchUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const storedRole = localStorage.getItem("role") || "";
  const storedUsername = localStorage.getItem("user-name") || "";
  const isSuperAdmin = isAdministrator(storedRole, storedUsername);
  const rawPageAccess = localStorage.getItem("page_access") || "";
  const allowedPages = rawPageAccess
    ? getReadablePageIds(rawPageAccess)
    : [];

  const ALL_SYSTEM_MODULES = [
    {
      id: "checklist",
      name: "Checklist & Delegation Module",
      description: "Manage operational checklists, recurring task assignments, team delegation trackers, and automated validation routines.",
      link: "/checklist/admin",
      btnText: "Launch Module",
      icon: ClipboardList,
      colorClass: "from-blue-600 to-indigo-600",
      borderHover: "hover:border-blue-600 dark:hover:border-blue-400",
      btnColor: "bg-blue-600 hover:bg-blue-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("checklist_")),
    },
    {
      id: "inventory",
      name: "Inventory Management Module",
      description: "Track stock levels, record IN/OUT transactions, manage supplier master lists, compile threshold shortages, and generate purchase indents.",
      link: "/checklist/inventory",
      btnText: "Launch IMS Module",
      icon: Boxes,
      colorClass: "from-indigo-600 to-blue-650",
      borderHover: "hover:border-indigo-600 dark:hover:border-indigo-400",
      btnColor: "bg-indigo-600 hover:bg-indigo-750",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("inventory_")),
    },
    {
      id: "purchase",
      name: "Purchase System Module",
      description: "Manage material requisitions, quotation matrices, purchase orders, vendor payments, carrier tracking, gate GRN receipts, and Tally billing.",
      link: "/checklist/purchase",
      btnText: "Launch Purchase System",
      icon: ShoppingBag,
      colorClass: "from-blue-600 to-cyan-600",
      borderHover: "hover:border-blue-600 dark:hover:border-blue-400",
      btnColor: "bg-blue-600 hover:bg-blue-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("purchase_") && !p.startsWith("purchase_return_")),
    },
    {
      id: "purchase_return",
      name: "Purchase Return (ReturnTrack)",
      description: "End-to-end reverse logistics, debit/credit note tracking, supplier damaged material returns, plant gate approvals, and audit trails.",
      link: "/checklist/purchase-return",
      btnText: "Launch ReturnTrack",
      icon: RotateCcw,
      colorClass: "from-rose-600 to-amber-600",
      borderHover: "hover:border-rose-600 dark:hover:border-rose-400",
      btnColor: "bg-rose-600 hover:bg-rose-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("purchase_return_")),
    },
    {
      id: "leads",
      name: "Leads & CRM System",
      description: "Sales lead ingestion, followup tracker, call scheduling, quotation & PI generation, and advance payment tracking.",
      link: (() => {
        if (isSuperAdmin || allowedPages === "all" || allowedPages.includes("leads_dashboard")) return "/checklist/leads";
        if (allowedPages.includes("leads_new_lead") || allowedPages.includes("leads_entry")) return "/checklist/leads/new-lead";
        if (allowedPages.includes("leads_followup_tracker") || allowedPages.includes("leads_followup")) return "/checklist/leads/followup-tracker";
        if (allowedPages.includes("leads_pending_quotation") || allowedPages.includes("leads_quotation")) return "/checklist/leads/pending-quotation";
        if (allowedPages.includes("leads_quotation_tracker") || allowedPages.includes("leads_advance_payment")) return "/checklist/leads/quotation-tracker";
        if (allowedPages.includes("leads_contacts")) return "/checklist/leads/contacts";
        if (allowedPages.includes("leads_calendar")) return "/checklist/leads/calendar";
        if (allowedPages.includes("settings_leads") || allowedPages.includes("leads_settings")) return "/checklist/global-settings?tab=leads_master";
        return "/checklist/leads";
      })(),
      btnText: "Launch Leads System",
      icon: TrendingUp,
      colorClass: "from-sky-600 to-blue-600",
      borderHover: "hover:border-sky-600 dark:hover:border-sky-400",
      btnColor: "bg-sky-600 hover:bg-sky-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("leads_") || p === "settings_leads"),
    },
    {
      id: "order_delivery",
      name: "Order Management (O2D)",
      description: "Order-to-delivery lifecycle management: received orders, validation, delivery checks, production planning, challans, dispatch, and invoices.",
      link: "/checklist/order-delivery",
      btnText: "Launch Order Management",
      icon: PackageCheck,
      colorClass: "from-amber-600 to-orange-600",
      borderHover: "hover:border-amber-600 dark:hover:border-amber-400",
      btnColor: "bg-amber-600 hover:bg-amber-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("o2d_")),
    },
    {
      id: "docs",
      name: "Docs & Subscriptions",
      description: "Enterprise document vault, compliance renewal schedules, cloud subscription approvals, and commercial loan liabilities.",
      link: (() => {
        if (isSuperAdmin || allowedPages === "all" || allowedPages.includes("docs_dashboard")) return "/checklist/docs/dashboard";
        if (allowedPages.includes("docs_resources")) return "/checklist/docs/resources";
        if (allowedPages.includes("docs_all")) return "/checklist/docs/all";
        if (allowedPages.includes("docs_renewal")) return "/checklist/docs/renewal";
        if (allowedPages.includes("docs_shared")) return "/checklist/docs/shared";
        if (allowedPages.includes("docs_sub_all")) return "/checklist/docs/subscription/all";
        if (allowedPages.includes("docs_sub_approval")) return "/checklist/docs/subscription/approval";
        if (allowedPages.includes("docs_sub_payment")) return "/checklist/docs/subscription/payment";
        if (allowedPages.includes("docs_sub_renewal")) return "/checklist/docs/subscription/renewal";
        if (allowedPages.includes("docs_loan_all")) return "/checklist/docs/loan/all";
        if (allowedPages.includes("docs_loan_foreclosure")) return "/checklist/docs/loan/foreclosure";
        if (allowedPages.includes("docs_loan_noc")) return "/checklist/docs/loan/noc";
        return "/checklist/docs/dashboard";
      })(),
      btnText: "Launch Docs & Subscriptions",
      icon: Files,
      colorClass: "from-blue-600 to-indigo-600",
      borderHover: "hover:border-blue-600 dark:hover:border-blue-400",
      btnColor: "bg-blue-600 hover:bg-blue-700",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("docs_")),
    },
    {
      id: "whatsapp",
      name: "WhatsApp CRM Module",
      description: "Customer conversations, automated message workflows, meta broadcast campaigns, and direct multi-module communication.",
      link: "/checklist/whatsapp/inbox",
      btnText: "Open Chat Inbox",
      icon: MessageCircle,
      colorClass: "from-emerald-600 to-teal-600",
      borderHover: "hover:border-emerald-600 dark:hover:border-emerald-400",
      btnColor: "bg-emerald-600 hover:bg-emerald-750",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("whatsapp_")),
    },
    {
      id: "global_settings",
      name: "Global Enterprise Settings",
      description: "Centralized user administration, role-based page clearance, inventory item catalogs, vendor master directories, and system TAT rules.",
      link: "/checklist/global-settings",
      btnText: "Open Settings",
      icon: Settings,
      colorClass: "from-slate-700 to-slate-900",
      borderHover: "hover:border-slate-600 dark:hover:border-slate-400",
      btnColor: "bg-slate-700 hover:bg-slate-800",
      isAllowed: isSuperAdmin || allowedPages === "all" || allowedPages.some((p) => p.startsWith("settings_") || p === "checklist_settings"),
    },
  ];

  const visibleModules = ALL_SYSTEM_MODULES.filter((m) => m.isAllowed);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 theme-transition">
        {/* --- Header Banner --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-blue-600/10 dark:bg-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400">
                <Layers size={28} />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                Portal{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  Dashboard
                </span>
              </h1>
            </div>
            <p className="text-gray-500 dark:text-slate-400 font-medium text-sm md:text-base">
              Unified enterprise ecosystem for authorized system modules and
              user profile management.
            </p>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-slate-900 border border-blue-100 dark:border-blue-900/50 rounded-xl text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck
              size={18}
              className="text-blue-600 dark:text-blue-400"
            />
            <span>Authenticated Portal Access</span>
          </div>
        </div>

        {/* --- User Profile Section (Grid Card Format) --- */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <User size={22} className="text-blue-600 dark:text-blue-400" />
            <span>User Profile Overview</span>
          </h2>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800/80 p-6 md:p-8 shadow-sm hover:shadow-md transition-all">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* User Avatar & Identity (Column 1-4) */}
              <div className="lg:col-span-4 flex flex-col items-center text-center lg:border-r border-gray-100 dark:border-slate-800 lg:pr-8">
                <div className="relative mb-4">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl overflow-hidden border-4 border-blue-500/20 dark:border-blue-500/40 shadow-xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-3xl">
                    {userInfo.profileImage ? (
                      <img
                        src={userInfo.profileImage}
                        alt={userInfo.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      userInfo.username.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 border-4 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-white"
                    title="Active Account"
                  >
                    <CheckCircle2 size={12} strokeWidth={3} />
                  </div>
                </div>

                <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-1">
                  {userInfo.username}
                </h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                  <Sparkles size={12} />
                  <span>{userInfo.role} ROLE</span>
                </div>
              </div>

              {/* Contact & Systems Grid (Column 5-12) */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                {/* Email Info Card */}
                <div className="bg-gray-50 dark:bg-slate-950 p-4 md:p-5 rounded-2xl border border-gray-100 dark:border-slate-800/60 flex items-start gap-4">
                  <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Mail size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400 mb-1">
                      Email Address
                    </p>
                    <p
                      className="text-sm font-semibold text-gray-900 dark:text-white truncate"
                      title={userInfo.email}
                    >
                      {userInfo.email}
                    </p>
                  </div>
                </div>

                {/* Contact Number Card */}
                <div className="bg-gray-50 dark:bg-slate-950 p-4 md:p-5 rounded-2xl border border-gray-100 dark:border-slate-800/60 flex items-start gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <Phone size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400 mb-1">
                      Contact Number
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {userInfo.phone}
                    </p>
                  </div>
                </div>

                {/* Permissioned Logic Summary */}
                <div className="sm:col-span-2 bg-blue-50/50 dark:bg-slate-950/80 p-4 md:p-5 rounded-2xl border border-blue-100 dark:border-blue-900/40 flex items-start gap-4">
                  <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                      Permissioned System Logic
                    </p>
                    <p className="text-xs md:text-sm text-gray-600 dark:text-slate-300 leading-relaxed mb-3">
                      {isSuperAdmin
                        ? "Your account holds unrestricted Super Administrator authority across all enterprise modules."
                        : `Your profile has ${visibleModules.length} operational module(s) enabled according to role & granular page clearance.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visibleModules.map((m) => (
                        <span key={m.id} className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold">
                          ✓ {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- System Modules Grid --- */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Building2
                  size={22}
                  className="text-blue-600 dark:text-blue-400"
                />
                <span>Authorized System Modules</span>
              </h2>
              <p className="text-xs md:text-sm text-gray-500 dark:text-slate-400">
                Launch operational applications enabled for your profile.
              </p>
            </div>
          </div>

          {visibleModules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleModules.map((mod) => {
                const IconComponent = mod.icon;
                return (
                  <div
                    key={mod.id}
                    className={`group relative bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 p-6 md:p-7 shadow-lg shadow-blue-500/5 hover:shadow-blue-500/15 ${mod.borderHover} transition-all duration-300 flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <div className={`w-14 h-14 bg-gradient-to-br ${mod.colorClass} text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300`}>
                          <IconComponent size={28} />
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Active System
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {mod.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed mb-6">
                        {mod.description}
                      </p>
                    </div>

                    <Link
                      to={mod.link}
                      className={`w-full py-3.5 px-6 ${mod.btnColor} text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer`}
                    >
                      <span>{mod.btnText}</span>
                      <ArrowRight size={18} />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800">
              <p className="text-sm font-bold text-gray-600 dark:text-slate-400">
                No active system modules assigned. Please contact an Administrator.
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

