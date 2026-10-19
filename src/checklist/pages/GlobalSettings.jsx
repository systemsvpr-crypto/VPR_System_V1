import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  Users,
  Search,
  Check,
  Lock,
  Settings,
  Building,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  X,
  Save,
  User,
  Calendar,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  ShoppingBag,
  Clock,
  Shield,
  CheckSquare,
  Square,
  RotateCcw,
  PackageCheck,
  TrendingUp,
  Files,
  ClipboardList,
  HelpCircle,
} from "lucide-react";
import AdminLayout from "../components/layout/ChecklistLayout";
import {
  createUser,
  updateUser,
  deleteUser,
  userDetails,
  departmentDetails,
  uploadProfileImage,
} from "../redux/slice/settingSlice";
import supabase from "../SupabaseClient";
import { useMagicToast } from "../context/MagicToastContext";
import SettingsView from "../../inventory/components/SettingsView";
import PurchaseMasterSettingsView from "../../purchase/components/PurchaseMasterSettingsView";
import TatMasterSettingsView from "../components/TatMasterSettingsView";
import OrderMasterSettingsView from "../../orderDelivery/components/OrderMasterSettingsView";
import LeadsMasterSettingsView from "../../leads/components/LeadsMasterSettingsView";
import { fetchInventoryData } from "../redux/slice/inventorySlice";
import { isAdministrator } from "../utils/roleUtils";
import {
  PERMISSIONS,
  parsePageAccess,
  serializePageAccess,
  getReadablePageIds,
  applyPermissionChange,
  getAccessLevel,
  setStoredPageAccess,
  usePagePermission,
  READ_ONLY_TOOLTIP,
} from "../utils/pagePermissionUtils";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import { MIS_PAGE_IDS } from "../../../services/pendingSummary/stageRegistry";

// System Page Config for permissions matrix
const SYSTEM_PAGES = {
  checklist: {
    name: "Checklist & Delegation",
    icon: Building,
    pages: [
      {
        id: "checklist_dashboard",
        label: "Dashboard",
        route: "/checklist/admin",
      },
      {
        id: "checklist_quick_task",
        label: "Task Management",
        route: "/checklist/quick-task",
      },
      {
        id: "checklist_assign_task",
        label: "Assign Task",
        route: "/checklist/assign-task",
      },
      {
        id: "checklist_delegation",
        label: "Delegation",
        route: "/checklist/delegation",
      },
      { id: "checklist_task", label: "Task List", route: "/checklist/task" },
      {
        id: "checklist_calendar",
        label: "Calendar",
        route: "/checklist/calendar",
      },
      {
        id: "checklist_holiday",
        label: "Holiday List",
        route: "/checklist/holiday-list",
      },
      {
        id: "checklist_working_day",
        label: "Working Day Calendar",
        route: "/checklist/working-day-calendar",
      },
      {
        id: "checklist_approval",
        label: "Admin Approval",
        route: "/checklist/admin-approval",
      },
    ],
  },
  inventory: {
    name: "Inventory System",
    icon: Settings,
    pages: [
      {
        id: "inventory_dashboard",
        label: "Dashboard",
        route: "/checklist/inventory/dashboard",
      },
      {
        id: "inventory_stock",
        label: "IMS",
        route: "/checklist/inventory/stock",
      },
      {
        id: "inventory_physical_stock",
        label: "Physical Stock",
        route: "/checklist/inventory/physical-stock",
      },
      {
        id: "inventory_master",
        label: "Master Data",
        route: "/checklist/inventory/master",
      },
      {
        id: "inventory_transactions",
        label: "Stock Transactions",
        route: "/checklist/inventory/transactions",
      },
      {
        id: "inventory_reorder",
        label: "Reorder Management",
        route: "/checklist/inventory/reorder",
      },
      {
        id: "inventory_indent",
        label: "Indent Management",
        route: "/checklist/inventory/indent",
      },
      {
        id: "inventory_transfer_request",
        label: "Transfer Request",
        route: "/checklist/inventory/transfer-request",
      },
      {
        id: "inventory_transfer_approval",
        label: "Approve Transfer",
        route: "/checklist/inventory/transfer-approval",
      },
      {
        id: "inventory_video",
        label: "Training Video",
        route: "/checklist/inventory/video",
      },
      {
        id: "inventory_settings",
        label: "Master",
        route: "/checklist/inventory/settings",
      },
    ],
  },
  purchase: {
    name: "Purchase System",
    icon: ShoppingBag,
    pages: [
      {
        id: "purchase_dashboard",
        label: "Overview",
        route: "/checklist/purchase/dashboard",
      },
      {
        id: "purchase_indent",
        label: "Create Indent",
        route: "/checklist/purchase/create-indent",
      },
      {
        id: "purchase_delegate",
        label: "Delegate Approvers",
        route: "/checklist/purchase/delegate-approval",
      },
      {
        id: "purchase_approval",
        label: "Indent Approval",
        route: "/checklist/purchase/indent-approval",
      },
      {
        id: "purchase_quotation",
        label: "Quotations",
        route: "/checklist/purchase/quotation",
      },
      {
        id: "purchase_approved_vendor",
        label: "Approved Vendor",
        route: "/checklist/purchase/approved-vendor",
      },
      {
        id: "purchase_po",
        label: "Make PO",
        route: "/checklist/purchase/po-entry",
      },
      {
        id: "purchase_payment",
        label: "Payment",
        route: "/checklist/purchase/payment",
      },
      {
        id: "purchase_lifting",
        label: "Follow-up / Lifting",
        route: "/checklist/purchase/follow-up-vendor",
      },
      {
        id: "purchase_transporter",
        label: "Transporter Follow-Up",
        route: "/checklist/purchase/transporter-follow-up",
      },
      {
        id: "purchase_grn",
        label: "Material Received (GRN)",
        route: "/checklist/purchase/material-received",
      },
      {
        id: "purchase_tally",
        label: "Tally Billing",
        route: "/checklist/purchase/receipt-in-tally",
      },
      {
        id: "purchase_cancel",
        label: "Order Cancel",
        route: "/checklist/purchase/order-cancel",
      },
      {
        id: "purchase_video",
        label: "Training Video",
        route: "/checklist/purchase/video",
      },
    ],
  },
  purchase_return: {
    name: "Purchase Return (ReturnTrack)",
    icon: RotateCcw,
    pages: [
      {
        id: "purchase_return_dashboard",
        label: "Dashboard",
        route: "/checklist/purchase-return/dashboard",
      },
      {
        id: "purchase_return_approval",
        label: "Return Approval",
        route: "/checklist/purchase-return/approval",
      },
      {
        id: "purchase_return_credit",
        label: "Credit Note",
        route: "/checklist/purchase-return/credit",
      },
      {
        id: "purchase_return_logistics",
        label: "Arrange Logistics",
        route: "/checklist/purchase-return/logistics",
      },
      {
        id: "purchase_return_debit_note",
        label: "Debit Note",
        route: "/checklist/purchase-return/debit-note",
      },
      {
        id: "purchase_return_plant_return",
        label: "Return From Plant",
        route: "/checklist/purchase-return/plant-return",
      },
      {
        id: "purchase_return_video",
        label: "Training Video",
        route: "/checklist/purchase-return/video",
      },
    ],
  },
  whatsapp: {
    name: "WhatsApp CRM",
    icon: MessageCircle,
    pages: [
      {
        id: "whatsapp_inbox",
        label: "Chat Inbox",
        route: "/checklist/whatsapp/inbox",
      },
      {
        id: "whatsapp_scheduler",
        label: "Broadcast Scheduler",
        route: "/checklist/whatsapp/scheduler",
      },
    ],
  },
  orderDelivery: {
    name: "Order Management",
    icon: PackageCheck,
    pages: [
      {
        id: "o2d_dashboard",
        label: "Overview",
        route: "/checklist/order-delivery/dashboard",
      },
      {
        id: "o2d_purchase_order",
        label: "Received Order",
        route: "/checklist/order-delivery/purchase-order",
      },
      {
        id: "o2d_check_validation",
        label: "Check & Validation",
        route: "/checklist/order-delivery/check-and-validation",
      },
      {
        id: "o2d_check_delivery",
        label: "Stock Verification",
        route: "/checklist/order-delivery/check-for-delivery",
      },
      {
        id: "o2d_production",
        label: "Production Planning",
        route: "/checklist/order-delivery/production-planning",
      },
      {
        id: "o2d_dispatch",
        label: "Dispatch Planning",
        route: "/checklist/order-delivery/dispatch-planning",
      },
      {
        id: "o2d_packaging",
        label: "Packaging",
        route: "/checklist/order-delivery/packaging",
      },
      {
        id: "o2d_logistic",
        label: "Vehicle Logistic",
        route: "/checklist/order-delivery/vehicle-logistic",
      },
      {
        id: "o2d_callan",
        label: "Make Challan",
        route: "/checklist/order-delivery/make-callan",
      },
      {
        id: "o2d_invoice",
        label: "Make Invoice",
        route: "/checklist/order-delivery/make-invoice",
      },
      {
        id: "o2d_confirm_delivery",
        label: "Confirm Delivery",
        route: "/checklist/order-delivery/confirm-delivery",
      },
      {
        id: "o2d_payment",
        label: "Payments",
        route: "/checklist/order-delivery/payment",
      },
      {
        id: "o2d_video",
        label: "Training Video",
        route: "/checklist/order-delivery/training-video",
      },
    ],
  },
  leads: {
    name: "Leads System",
    icon: TrendingUp,
    pages: [
      {
        id: "leads_dashboard",
        label: "Dashboard",
        route: "/checklist/leads",
      },
      {
        id: "leads_new_lead",
        label: "New Lead",
        route: "/checklist/leads/new-lead",
      },
      {
        id: "leads_followup_tracker",
        label: "Followup Tracker",
        route: "/checklist/leads/followup-tracker",
      },
      {
        id: "leads_pending_quotation",
        label: "Pending Quotation",
        route: "/checklist/leads/pending-quotation",
      },
      {
        id: "leads_quotation_tracker",
        label: "Quotation Tracker",
        route: "/checklist/leads/quotation-tracker",
      },
      {
        id: "leads_contacts",
        label: "Contacts",
        route: "/checklist/leads/contacts",
      },
      {
        id: "leads_calendar",
        label: "Calendar",
        route: "/checklist/leads/calendar",
      },
      {
        id: "settings_leads",
        label: "Leads Master Tab",
        route: "/checklist/global-settings?tab=leads_master",
      },
    ],
  },
  docs: {
    name: "Docs & Subscriptions",
    icon: Files,
    pages: [
      {
        id: "docs_dashboard",
        label: "Dashboard",
        route: "/checklist/docs/dashboard",
      },
      {
        id: "docs_resources",
        label: "Resource Manager",
        route: "/checklist/docs/resources",
      },
      {
        id: "docs_all",
        label: "All Documents",
        route: "/checklist/docs/all",
      },
      {
        id: "docs_renewal",
        label: "Document Renewal",
        route: "/checklist/docs/renewal",
      },
      {
        id: "docs_shared",
        label: "Shared Documents",
        route: "/checklist/docs/shared",
      },
      {
        id: "docs_sub_all",
        label: "All Subscriptions",
        route: "/checklist/docs/subscription/all",
      },
      {
        id: "docs_sub_approval",
        label: "Subscription Approval",
        route: "/checklist/docs/subscription/approval",
      },
      {
        id: "docs_sub_payment",
        label: "Subscription Payment",
        route: "/checklist/docs/subscription/payment",
      },
      {
        id: "docs_sub_renewal",
        label: "Subscription Renewal",
        route: "/checklist/docs/subscription/renewal",
      },
      {
        id: "docs_loan_all",
        label: "All Loans",
        route: "/checklist/docs/loan/all",
      },
      {
        id: "docs_loan_foreclosure",
        label: "Loan Foreclosure",
        route: "/checklist/docs/loan/foreclosure",
      },
      {
        id: "docs_loan_noc",
        label: "Loan NOC",
        route: "/checklist/docs/loan/noc",
      },
    ],
  },
  global_settings: {
    name: "Global Settings",
    icon: Settings,
    pages: [
      {
        id: "settings_users",
        label: "User Management Tab",
        route: "/checklist/setting?tab=users",
      },
      {
        id: "settings_inventory",
        label: "Inventory Master Tab",
        route: "/checklist/setting?tab=inventory",
      },
      {
        id: "settings_purchase",
        label: "Purchase Master Tab",
        route: "/checklist/setting?tab=purchase",
      },
      {
        id: "settings_o2d",
        label: "Order Master Tab",
        route: "/checklist/setting?tab=o2d",
      },
      {
        id: "settings_tat",
        label: "TAT Master Tab",
        route: "/checklist/setting?tab=tat",
      },
      {
        id: "settings_leads",
        label: "Leads Master Tab",
        route: "/checklist/global-settings?tab=leads_master",
      },
    ],
  },
  pc: {
    name: "PC Dashboard",
    icon: ClipboardList,
    pages: [
      {
        id: "pc_dashboard",
        label: "PC Dashboard (all systems pending)",
        route: "/checklist/pc",
      },
    ],
  },
  query: {
    name: "Query System",
    icon: HelpCircle,
    pages: [
      {
        id: "query_form",
        label: "Raise Query Form",
        route: "/checklist/query/new",
      },
      {
        id: "query_tracker",
        label: "Query Tracker (Status Editor)",
        route: "/checklist/query/tracker",
      },
    ],
  },
};

// Initial Mock Permissions State
const INITIAL_PERMISSIONS = {
  query_form: { admin: true, HOD: true, manager: true, user: true },
  query_tracker: { admin: true, HOD: true, manager: true, user: true },
  checklist_dashboard: { admin: true, HOD: true, manager: true, user: true },
  checklist_quick_task: {
    admin: true,
    HOD: false,
    manager: false,
    user: false,
  },
  checklist_assign_task: {
    admin: true,
    HOD: true,
    manager: false,
    user: false,
  },
  checklist_delegation: { admin: true, HOD: true, manager: true, user: true },
  checklist_task: { admin: true, HOD: true, manager: true, user: true },
  checklist_calendar: { admin: true, HOD: true, manager: true, user: true },
  checklist_holiday: { admin: true, HOD: false, manager: false, user: false },
  checklist_working_day: {
    admin: true,
    HOD: false,
    manager: false,
    user: false,
  },
  checklist_approval: { admin: true, HOD: true, manager: false, user: false },
  checklist_video: { admin: true, HOD: true, manager: true, user: true },
  checklist_settings: { admin: true, HOD: true, manager: false, user: false },

  inventory_dashboard: { admin: true, HOD: true, manager: true, user: true },
  inventory_stock: { admin: true, HOD: true, manager: true, user: true },
  inventory_physical_stock: { admin: true, HOD: true, manager: true, user: true },
  inventory_master: { admin: true, HOD: true, manager: true, user: true },
  inventory_transactions: { admin: true, HOD: true, manager: true, user: true },
  inventory_reorder: { admin: true, HOD: true, manager: true, user: true },
  inventory_indent: { admin: true, HOD: true, manager: true, user: true },
  inventory_transfer_request: { admin: true, HOD: true, manager: true, user: true },
  inventory_transfer_approval: { admin: true, HOD: true, manager: false, user: false },
  inventory_video: { admin: true, HOD: true, manager: true, user: true },
  inventory_settings: { admin: true, HOD: true, manager: false, user: false },

  purchase_dashboard: { admin: true, HOD: true, manager: false, user: false },
  purchase_indent: { admin: true, HOD: true, manager: false, user: false },
  purchase_delegate: { admin: true, HOD: true, manager: false, user: false },
  purchase_approval: { admin: true, HOD: true, manager: false, user: false },
  purchase_quotation: { admin: true, HOD: true, manager: false, user: false },
  purchase_approved_vendor: { admin: true, HOD: true, manager: false, user: false },
  purchase_po: { admin: true, HOD: true, manager: false, user: false },
  purchase_payment: { admin: true, HOD: true, manager: false, user: false },
  purchase_lifting: { admin: true, HOD: true, manager: false, user: false },
  purchase_transporter: { admin: true, HOD: true, manager: false, user: false },
  purchase_grn: { admin: true, HOD: true, manager: false, user: false },
  purchase_tally: { admin: true, HOD: true, manager: false, user: false },
  purchase_cancel: { admin: true, HOD: true, manager: false, user: false },
  purchase_video: { admin: true, HOD: true, manager: true, user: true },

  purchase_return_dashboard: { admin: true, HOD: true, manager: false, user: false },
  purchase_return_approval: { admin: true, HOD: true, manager: false, user: false },
  purchase_return_credit: { admin: true, HOD: true, manager: false, user: false },
  purchase_return_logistics: { admin: true, HOD: true, manager: false, user: false },
  purchase_return_debit_note: { admin: true, HOD: true, manager: false, user: false },
  purchase_return_plant_return: { admin: true, HOD: true, manager: false, user: false },

  whatsapp_inbox: { admin: true, HOD: true, manager: false, user: false },
  whatsapp_scheduler: { admin: true, HOD: true, manager: false, user: false },

  o2d_dashboard: { admin: true, HOD: true, manager: false, user: false },
  o2d_purchase_order: { admin: true, HOD: true, manager: false, user: false },
  o2d_check_validation: { admin: true, HOD: true, manager: false, user: false },
  o2d_check_delivery: { admin: true, HOD: true, manager: false, user: false },
  o2d_production: { admin: true, HOD: true, manager: false, user: false },
  o2d_dispatch: { admin: true, HOD: true, manager: false, user: false },
  o2d_packaging: { admin: true, HOD: true, manager: false, user: false },
  o2d_logistic: { admin: true, HOD: true, manager: false, user: false },
  o2d_callan: { admin: true, HOD: true, manager: false, user: false },
  o2d_invoice: { admin: true, HOD: true, manager: false, user: false },
  o2d_confirm_delivery: { admin: true, HOD: true, manager: false, user: false },
  o2d_payment: { admin: true, HOD: true, manager: false, user: false },
  o2d_video: { admin: true, HOD: true, manager: true, user: true },

  settings_users: { admin: true, HOD: false, manager: false, user: false },
  settings_inventory: { admin: true, HOD: false, manager: false, user: false },
  settings_purchase: { admin: true, HOD: false, manager: false, user: false },
  settings_o2d: { admin: true, HOD: false, manager: false, user: false },
  settings_tat: { admin: true, HOD: false, manager: false, user: false },
  settings_leads: { admin: true, HOD: false, manager: false, user: false },

  leads_dashboard: { admin: true, HOD: true, manager: true, user: true },
  leads_new_lead: { admin: true, HOD: true, manager: true, user: true },
  leads_followup_tracker: { admin: true, HOD: true, manager: true, user: true },
  leads_entry: { admin: true, HOD: true, manager: true, user: true },
  leads_followup: { admin: true, HOD: true, manager: true, user: true },
  leads_quotation: { admin: true, HOD: true, manager: true, user: true },
  leads_advance_payment: { admin: true, HOD: true, manager: true, user: true },
  leads_pending_quotation: { admin: true, HOD: true, manager: true, user: true },
  leads_quotation_tracker: { admin: true, HOD: true, manager: true, user: true },
  leads_contacts: { admin: true, HOD: true, manager: true, user: true },
  leads_calendar: { admin: true, HOD: true, manager: true, user: true },

  docs_dashboard: { admin: true, HOD: true, manager: true, user: true },
  docs_resources: { admin: true, HOD: true, manager: true, user: true },
  docs_all: { admin: true, HOD: true, manager: true, user: true },
  docs_renewal: { admin: true, HOD: true, manager: true, user: true },
  docs_shared: { admin: true, HOD: true, manager: true, user: true },
  docs_sub_all: { admin: true, HOD: true, manager: true, user: true },
  docs_sub_approval: { admin: true, HOD: true, manager: true, user: true },
  docs_sub_payment: { admin: true, HOD: true, manager: true, user: true },
  docs_sub_renewal: { admin: true, HOD: true, manager: true, user: true },
  docs_loan_all: { admin: true, HOD: true, manager: true, user: true },
  docs_loan_foreclosure: { admin: true, HOD: true, manager: true, user: true },
  docs_loan_noc: { admin: true, HOD: true, manager: true, user: true },
  // Off by default for every role; granted per user from the permission list
  pc_dashboard: { admin: true, HOD: false, manager: false, user: false },
};

// Saves page_access in the Read/Write/MIS token format; legacy unsuffixed tokens become explicit full access
function normalizePageAccessForSave(rawPageAccess) {
  const { all, map } = parsePageAccess(rawPageAccess || "");
  return all ? "all" : serializePageAccess(map);
}

export default function GlobalSettings() {
  const { showToast } = useMagicToast();
  // User Management write access (legacy "checklist_settings" also grants the Users tab)
  const usersPermission = usePagePermission("settings_users");
  const legacySettingsPermission = usePagePermission("checklist_settings");
  // Users with no page_access at all keep the old role-based behaviour (tabs come from fallbackRoles)
  const hasNoPageAccess = (localStorage.getItem("page_access") || "").trim() === "";
  const canWriteUsers = hasNoPageAccess || usersPermission.canWrite || legacySettingsPermission.canWrite;
  const isUsersReadOnly = !canWriteUsers;
  const blockReadOnlyUsers = () => {
    if (canWriteUsers) return false;
    showToast(READ_ONLY_TOOLTIP, "warning");
    return true;
  };
  const dispatch = useDispatch();

  // Load state from Redux setting slice
  const {
    userData = [],
    department = [],
    loading,
    error,
  } = useSelector((state) => state.setting);

  // Local UI and form states
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "users";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [userStateSeq, setUserStateSeq] = useState(0);

  // Derived user credentials from simulation switches for SettingsView
  const activeUser = useMemo(() => {
    const realName = localStorage.getItem("user-name") || "Guest User";
    const realRole = localStorage.getItem("role") || "user";

    // Simulated overrides
    const simRole = localStorage.getItem("sp_simulated_role") || realRole;
    const simDept = localStorage.getItem("sp_simulated_dept") || "General";
    const simLoc = localStorage.getItem("sp_simulated_loc") || "";

    // Standardize role display: Capitalize first letter if lowercase
    const formattedRole =
      simRole.charAt(0).toUpperCase() + simRole.slice(1).toLowerCase();

    return {
      name: realName,
      role: formattedRole,
      department: simDept,
      location: simLoc,
      isSimulated: !!(
        localStorage.getItem("sp_simulated_role") ||
        localStorage.getItem("sp_simulated_dept") ||
        localStorage.getItem("sp_simulated_loc")
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userStateSeq is an intentional cache-buster to force recompute after onReloadUser
  }, [userStateSeq]);

  // Configuration of all available Global Settings tabs
  const ALL_SETTINGS_TABS = useMemo(() => [
    {
      id: "users",
      label: "User Management",
      icon: Users,
      permId: "settings_users",
      fallbackRoles: ["administrator", "admin"],
    },
    {
      id: "inventory_master",
      label: "Inventory",
      icon: Settings,
      permId: "settings_inventory",
      fallbackRoles: ["administrator", "admin", "hod"],
    },
    {
      id: "purchase_master",
      label: "Purchase",
      icon: ShoppingBag,
      permId: "settings_purchase",
      fallbackRoles: ["administrator", "admin", "hod"],
    },
    {
      id: "o2d_master",
      label: "Order",
      icon: PackageCheck,
      permId: "settings_o2d",
      fallbackRoles: ["administrator", "admin", "hod"],
    },
    {
      id: "tat_master",
      label: "TAT",
      icon: Clock,
      permId: "settings_tat",
      fallbackRoles: ["administrator", "admin", "hod"],
    },
    {
      id: "leads_master",
      label: "Leads",
      icon: TrendingUp,
      permId: "settings_leads",
      fallbackRoles: ["administrator", "admin", "hod"],
    },
  ], []);

  // Compute tabs dynamically allowed for current user
  const isSuperAdmin = (activeUser.role || "").toLowerCase() === "administrator";
  const userRoleLower = (activeUser.role || "user").toLowerCase();
  const rawPageAccess = localStorage.getItem("page_access") || "";
  const allowedPageIds = useMemo(() => {
    const readable = getReadablePageIds(rawPageAccess);
    return readable === "all" ? ["all"] : readable;
  }, [rawPageAccess]);
  const hasCustomPageAccess = rawPageAccess.trim() !== "";

  const accessibleTabs = useMemo(() => {
    if (isSuperAdmin) return ALL_SETTINGS_TABS;

    return ALL_SETTINGS_TABS.filter((tab) => {
      // Order tab is always accessible to administrator, admin, HOD, or anyone with o2d permissions
      if (tab.id === "o2d_master") {
        if (["administrator", "admin", "hod"].includes(userRoleLower)) return true;
        if (allowedPageIds.includes("settings_o2d") || allowedPageIds.some((p) => p.startsWith("o2d_"))) return true;
        if (allowedPageIds.includes("checklist_settings") || allowedPageIds.includes("purchase_settings")) return true;
      }

      if (hasCustomPageAccess) {
        if (allowedPageIds.includes(tab.permId)) return true;
        // Backwards compatibility fallbacks
        if (allowedPageIds.includes("checklist_settings") && tab.id === "users") return true;
        if (allowedPageIds.includes("inventory_settings") && tab.id === "inventory_master") return true;
        if (allowedPageIds.includes("purchase_settings") && tab.id === "purchase_master") return true;
        if ((allowedPageIds.includes("leads_settings") || allowedPageIds.includes("settings_leads")) && tab.id === "leads_master") return true;
        if (allowedPageIds.includes("tat_settings") && tab.id === "tat_master") return true;
        return false;
      }

      return tab.fallbackRoles.includes(userRoleLower);
    });
  }, [isSuperAdmin, hasCustomPageAccess, allowedPageIds, userRoleLower, ALL_SETTINGS_TABS]);

  // Keep activeTab pointing to a valid accessible tab
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && accessibleTabs.some((t) => t.id === tabParam)) {
      if (activeTab !== tabParam) {
        setActiveTab(tabParam);
      }
      return;
    }
    if (accessibleTabs.length > 0) {
      const isCurrentAllowed = accessibleTabs.some((t) => t.id === activeTab);
      if (!isCurrentAllowed) {
        setActiveTab(accessibleTabs[0].id);
      }
    }
  }, [accessibleTabs, activeTab, searchParams]);

  useEffect(() => {
    if (activeTab === "inventory_master") {
      dispatch(fetchInventoryData());
    }
  }, [activeTab, dispatch]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("alphabetical_asc");
  const [sortField, setSortField] = useState("user_name");
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" | "desc"
  const [locations, setLocations] = useState([]);
  const [divisions, setDivisions] = useState([]);

  // Handle sort selection from dropdown
  const handleSortDropdownChange = (value) => {
    setSortBy(value);
    if (value === "alphabetical_asc") {
      setSortField("user_name");
      setSortOrder("asc");
    } else if (value === "alphabetical_desc") {
      setSortField("user_name");
      setSortOrder("desc");
    } else if (value === "newest") {
      setSortField("created_at");
      setSortOrder("desc");
    } else if (value === "oldest") {
      setSortField("created_at");
      setSortOrder("asc");
    }
  };

  // Toggle sort handler for table headers
  const handleSort = (field) => {
    let nextOrder = "asc";
    if (sortField === field) {
      nextOrder = sortOrder === "asc" ? "desc" : "asc";
    }
    setSortField(field);
    setSortOrder(nextOrder);

    if (field === "user_name") {
      setSortBy(nextOrder === "asc" ? "alphabetical_asc" : "alphabetical_desc");
    } else if (field === "created_at" || field === "id") {
      setSortBy(nextOrder === "desc" ? "newest" : "oldest");
    } else {
      setSortBy("custom");
    }
  };

  // User form states
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    employee_id: "",
    role: "user",
    status: "active",
    department: "",
    division: "",
    user_access: "",
    Designation: "",
    profile_image: "",
    reported_by: "",
    can_self_assign: false,
    page_access: "",
    location: "",
    day_off: "",
  });

  // Check for duplicate username (case-insensitive)
  const isDuplicateUsername = useMemo(() => {
    const trimmed = (userForm.username || "").trim().toLowerCase();
    if (!trimmed) return false;
    return (userData || []).some((u) => {
      if (isEditing && u.id === currentUserId) return false;
      return String(u.user_name || "").trim().toLowerCase() === trimmed;
    });
  }, [userForm.username, userData, isEditing, currentUserId]);

  // Modal tabs
  const [modalTab, setModalTab] = useState("details"); // 'details' | 'permissions'
  const [permissionSearch, setPermissionSearch] = useState("");
  const [isDivisionDropdownOpen, setIsDivisionDropdownOpen] = useState(false);

  // User deletion confirmations
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDeleteData, setUserToDeleteData] = useState({
    id: null,
    name: "",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCountingTasks, setIsCountingTasks] = useState(false);
  const [deleteRelatedTasks, setDeleteRelatedTasks] = useState(false);
  const [taskCounts, setTaskCounts] = useState({
    checklist: 0,
    delegation: 0,
    maintenance: 0,
    repair: 0,
    ea: 0,
    total: 0,
  });

  // Day Off task conflict modal states
  const [dayOffConflicts, setDayOffConflicts] = useState([]);
  const [showDayOffConflictModal, setShowDayOffConflictModal] = useState(false);
  const [, setIsCheckingDayOffConflicts] = useState(false);
  const [showDeleteDayOffTasksConfirm, setShowDeleteDayOffTasksConfirm] = useState(false);
  const [isDeletingDayOffTasks, setIsDeletingDayOffTasks] = useState(false);

  const checkDayOffTaskConflicts = async (username, dayOff) => {
    if (!dayOff || !username) return;
    const DAY_MAP = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDayIndex = DAY_MAP[String(dayOff).toLowerCase().trim()];
    if (targetDayIndex === undefined) return;

    setIsCheckingDayOffConflicts(true);
    try {
      // Query checklist table for uncompleted tasks assigned to username
      const { data: checklistData, error: clError } = await supabase
        .from("checklist")
        .select("*")
        .eq("name", username)
        .is("submission_date", null);

      if (clError) console.error("Error querying checklist for day off:", clError);

      // Query delegation table for uncompleted tasks assigned to username
      const { data: delegationData, error: delError } = await supabase
        .from("delegation")
        .select("*")
        .eq("name", username)
        .is("submission_date", null);

      if (delError) console.error("Error querying delegation for day off:", delError);

      const checklistMatches = (checklistData || [])
        .filter((t) => {
          const rawDate = t.planned_date || t.task_start_date || t.created_at;
          if (!rawDate) return false;
          const d = new Date(rawDate);
          return d.getDay() === targetDayIndex;
        })
        .map((t) => ({
          ...t,
          _source: "Checklist",
          _table: "checklist",
          task_id: t.task_id || t.id,
        }));

      const delegationMatches = (delegationData || [])
        .filter((t) => {
          const rawDate = t.planned_date || t.task_start_date || t.created_at;
          if (!rawDate) return false;
          const d = new Date(rawDate);
          return d.getDay() === targetDayIndex;
        })
        .map((t) => ({
          ...t,
          _source: "Delegation",
          _table: "delegation",
          task_id: t.task_id || t.id,
        }));

      const allMatches = [...checklistMatches, ...delegationMatches];
      if (allMatches.length > 0) {
        setDayOffConflicts(allMatches);
        setShowDayOffConflictModal(true);
      }
    } catch (err) {
      console.error("Failed checking day off conflicts:", err);
    } finally {
      setIsCheckingDayOffConflicts(false);
    }
  };

  // Fetch and Subscribe to Users Table
  useEffect(() => {
    dispatch(userDetails());
    dispatch(departmentDetails());

    // Fetch locations dynamically
    const fetchLocations = async () => {
      try {
        const { data } = await supabase
          .from("inventory_locations")
          .select("location")
          .order("location", { ascending: true });
        if (data) {
          setLocations(data.map((item) => item.location));
        }
      } catch (err) {
        console.error("Error fetching inventory locations:", err);
      }
    };
    fetchLocations();

    const fetchDivisions = async () => {
      try {
        const { data } = await supabase
          .from("divisions")
          .select("*")
          .order("name", { ascending: true });
        if (data) {
          setDivisions(data);
        }
      } catch (err) {
        console.error("Error fetching divisions:", err);
      }
    };
    fetchDivisions();

    // Setup real-time postgres changes listener
    const subscription = supabase
      .channel("global-settings-users")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_users",
        },
        () => {
          dispatch(userDetails());
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [dispatch]);

  // Search, Filter & Sort Users
  const filteredUsers = useMemo(() => {
    const list = (userData || []).filter((u) => {
      if (!u || !u.user_name) return false;
      const term = searchQuery.toLowerCase();
      return (
        String(u.user_name || "")
          .toLowerCase()
          .includes(term) ||
        String(u.email_id || "")
          .toLowerCase()
          .includes(term) ||
        String(u.number || "")
          .toLowerCase()
          .includes(term) ||
        String(u.employee_id || "")
          .toLowerCase()
          .includes(term) ||
        String(u.division || "")
          .toLowerCase()
          .includes(term) ||
        String(u.department || "")
          .toLowerCase()
          .includes(term) ||
        String(u.Designation || "")
          .toLowerCase()
          .includes(term) ||
        String(u.status || "")
          .toLowerCase()
          .includes(term) ||
        String(u.role || "")
          .toLowerCase()
          .includes(term) ||
        String(u.reported_by || "")
          .toLowerCase()
          .includes(term)
      );
    });

    return list.sort((a, b) => {
      // 1. Dropdown explicit presets
      if (sortBy === "newest") {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateA && dateB && dateA !== dateB) {
          return dateB - dateA;
        }
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        if (idA !== idB) return idB - idA;
      } else if (sortBy === "oldest") {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateA && dateB && dateA !== dateB) {
          return dateA - dateB;
        }
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        if (idA !== idB) return idA - idB;
      } else if (sortBy === "alphabetical_asc") {
        const strA = String(a.user_name || "").toLowerCase().trim();
        const strB = String(b.user_name || "").toLowerCase().trim();
        return strA.localeCompare(strB, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      } else if (sortBy === "alphabetical_desc") {
        const strA = String(a.user_name || "").toLowerCase().trim();
        const strB = String(b.user_name || "").toLowerCase().trim();
        return strB.localeCompare(strA, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      // 2. Generic table header column sort
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle null/undefined values
      if (valA == null) valA = "";
      if (valB == null) valB = "";

      // Convert to string for consistent comparison (ignoring case)
      const strA = String(valA).toLowerCase().trim();
      const strB = String(valB).toLowerCase().trim();

      const comparison = strA.localeCompare(strB, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [searchQuery, userData, sortBy, sortField, sortOrder]);

  const getPagesForRole = (role) => {
    if (isAdministrator(role)) {
      return "all";
    }
    const roleLower = (role || "user").toLowerCase();
    const roleKey = roleLower === "employee" ? "user" : roleLower;
    const map = {};
    Object.entries(SYSTEM_PAGES).forEach(([, sys]) => {
      sys.pages.forEach((p) => {
        const rule = INITIAL_PERMISSIONS[p.id];
        if (rule && rule[roleKey]) {
          map[p.id] = { read: true, write: true, mis: false };
        }
      });
    });
    return serializePageAccess(map);
  };

  // ---- Read / Write / MIS permission matrix helpers (logic lives in pagePermissionUtils) ----
  const ALL_PERMISSION_PAGE_IDS = Object.values(SYSTEM_PAGES).flatMap((sys) => sys.pages.map((p) => p.id));

  // Current form permissions as { pageId: { read, write, mis } }; "all" expands to full access on every page
  const toPermissionMap = (pageAccess) => {
    const { all, map } = parsePageAccess(pageAccess);
    if (!all) return map;
    const full = {};
    ALL_PERMISSION_PAGE_IDS.forEach((id) => {
      full[id] = { read: true, write: true, mis: false };
    });
    return full;
  };

  // Applies a permission change to the given pages and re-serializes page_access
  const updatePagePermissions = (pageIds, permission, checked) => {
    setUserForm((prev) => {
      const map = toPermissionMap(prev.page_access);
      pageIds.forEach((id) => {
        map[id] = applyPermissionChange(map[id], permission, checked);
      });
      return { ...prev, page_access: serializePageAccess(map) };
    });
  };

  // Bulk grant keeps existing MIS (pending responsibility) assignments; null revokes everything
  const setAllPagePermissions = (entry) => {
    setUserForm((prev) => {
      const current = toPermissionMap(prev.page_access);
      const map = {};
      if (entry) {
        ALL_PERMISSION_PAGE_IDS.forEach((id) => {
          map[id] = { ...entry, mis: !!current[id]?.mis && MIS_PAGE_IDS.has(id) };
        });
      }
      return { ...prev, page_access: serializePageAccess(map) };
    });
  };

  // Form Handlers
  const handleUserInputChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "department") {
        updated.user_access = value;
      }
      if (name === "role") {
        if (isAdministrator(value, prev.username)) {
          updated.page_access = "all";
          setModalTab("details");
        } else {
          updated.page_access = getPagesForRole(value);
        }
      }
      return updated;
    });

    if (name === "day_off" && value) {
      checkDayOffTaskConflicts(userForm.username, value);
    }
  };

  const handleOpenDeleteDayOffConfirm = () => {
    setShowDeleteDayOffTasksConfirm(true);
  };

  const confirmDeleteAllDayOffTasks = async () => {
    setIsDeletingDayOffTasks(true);
    try {
      for (const task of dayOffConflicts) {
        const idKey =
          task._table === "checklist" || task._table === "delegation"
            ? "task_id"
            : "id";
        await supabase.from(task._table).delete().eq(idKey, task.task_id);
      }
      showToast("All conflicting tasks on Day Off deleted successfully.", "success");
      setDayOffConflicts([]);
      setShowDeleteDayOffTasksConfirm(false);
      setShowDayOffConflictModal(false);
    } catch (err) {
      console.error("Error deleting conflict tasks:", err);
      showToast("Failed to delete tasks.", "error");
    } finally {
      setIsDeletingDayOffTasks(false);
    }
  };

  const handleCancelDayOffConflict = () => {
    setUserForm((prev) => ({ ...prev, day_off: "" }));
    setShowDayOffConflictModal(false);
    setDayOffConflicts([]);
  };

  const resetUserForm = () => {
    setUserForm({
      username: "",
      email: "",
      password: "",
      phone: "",
      employee_id: "",
      role: "user",
      status: "active",
      department: "",
      division: "",
      user_access: "",
      Designation: "",
      profile_image: "",
      reported_by: "",
      can_self_assign: false,
      page_access: getPagesForRole("user"),
      location: "",
      day_off: "",
    });
    setProfileFile(null);
    setProfilePreview(null);
    setIsEditing(false);
    setCurrentUserId(null);
    setModalTab("details");
    setIsDivisionDropdownOpen(false);
  };

  const handleAddButtonClick = () => {
    if (blockReadOnlyUsers()) return;
    resetUserForm();
    setShowUserModal(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (blockReadOnlyUsers()) return;

    const trimmedUsername = (userForm.username || "").trim();
    if (!trimmedUsername) {
      showToast("Please enter a username.", "error");
      return;
    }

    // 1. Instant check against loaded users list
    const duplicateInList = (userData || []).find(
      (u) => String(u.user_name || "").trim().toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicateInList) {
      showToast(
        `User "${duplicateInList.user_name}" already exists. Please choose a different username.`,
        "error"
      );
      return;
    }

    // 2. Real-time DB check against Supabase
    try {
      const { data: existingDbUser } = await supabase
        .from("checklist_users")
        .select("id, user_name")
        .ilike("user_name", trimmedUsername)
        .maybeSingle();

      if (existingDbUser) {
        showToast(
          `User "${existingDbUser.user_name}" already exists in the system. Account creation stopped to prevent duplicate account.`,
          "error"
        );
        return;
      }
    } catch (checkErr) {
      console.error("Error checking username uniqueness:", checkErr);
    }

    const generatedEmpId = `EMP-${Date.now().toString().slice(-6)}`;

    let imageUrl = userForm.profile_image;
    if (profileFile) {
      try {
        imageUrl = await dispatch(
          uploadProfileImage({ file: profileFile, userId: generatedEmpId }),
        ).unwrap();
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr);
        showToast("Image upload failed, continuing without image.", "warning");
      }
    }

    const isSuperAdminUser = isAdministrator(userForm.role, userForm.username);
    const finalPageAccess = isSuperAdminUser
      ? "all"
      : normalizePageAccessForSave(userForm.page_access);

    const newUser = {
      ...userForm,
      employee_id: generatedEmpId,
      user_access: userForm.user_access || userForm.department,
      department: userForm.department,
      profile_image: imageUrl,
      reported_by: userForm.reported_by,
      can_self_assign: userForm.can_self_assign,
      page_access: finalPageAccess,
      location: userForm.location,
    };

    try {
      await dispatch(createUser(newUser)).unwrap();

      // Update local storage if creating self (unlikely)
      if (newUser.user_name === localStorage.getItem("user-name")) {
        localStorage.setItem("profile_image", imageUrl || "");
        setStoredPageAccess(finalPageAccess);
      }

      resetUserForm();
      setShowUserModal(false);
      showToast("User created successfully!", "success");
      dispatch(userDetails());
    } catch (error) {
      console.error("Error adding user:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Failed to create user."), "error");
    }
  };

  const handleEditUser = (userId) => {
    const user = userData.find((u) => u.id === userId);
    if (!user) return;

    const userIsSuperAdmin = isAdministrator(user.role, user.user_name);
    const initialPageAccess = userIsSuperAdmin
      ? "all"
      : (user.page_access !== undefined && user.page_access !== null
          ? user.page_access
          : getPagesForRole(user.role || "user"));

    setUserForm({
      username: user.user_name || "",
      email: user.email_id || "",
      password: "", // Empty password field so it doesn't get updated unless typed
      phone: user.number || "",
      employee_id: user.employee_id || "",
      department: user.department || "",
      division: user.division || "",
      user_access: user.user_access || "",
      role: user.role || "user",
      status: user.status || "active",
      Designation: user.Designation || "",
      profile_image: user.profile_image || "",
      reported_by: user.reported_by || "",
      can_self_assign: user.can_self_assign || false,
      page_access: initialPageAccess,
      location: user.location || "",
      day_off: user.day_off || "",
    });
    setProfilePreview(user.profile_image || null);
    setProfileFile(null);
    setCurrentUserId(userId);
    setIsEditing(true);
    setModalTab("details");
    setShowUserModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (blockReadOnlyUsers()) return;

    const trimmedUsername = (userForm.username || "").trim();
    if (!trimmedUsername) {
      showToast("Please enter a username.", "error");
      return;
    }

    // Check duplicate in local state (excluding the current user being edited)
    const duplicateInList = (userData || []).find(
      (u) => u.id !== currentUserId && String(u.user_name || "").trim().toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicateInList) {
      showToast(
        `User "${duplicateInList.user_name}" already exists. Please choose a different username.`,
        "error"
      );
      return;
    }

    let imageUrl = userForm.profile_image;
    if (profileFile) {
      try {
        imageUrl = await dispatch(
          uploadProfileImage({
            file: profileFile,
            userId: userForm.employee_id || currentUserId,
          }),
        ).unwrap();
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr);
        showToast(
          "Image upload failed, continuing with previous image.",
          "warning",
        );
      }
    }

    const isSuperAdminUser = isAdministrator(userForm.role, userForm.username);
    const finalPageAccess = isSuperAdminUser
      ? "all"
      : normalizePageAccessForSave(userForm.page_access);

    const updatedUser = {
      user_name: userForm.username,
      password: userForm.password,
      email_id: userForm.email,
      number: userForm.phone,
      employee_id: userForm.employee_id,
      role: userForm.role,
      status: userForm.status,
      user_access: userForm.user_access || userForm.department,
      department: userForm.department,
      division: userForm.division || null,
      Designation: userForm.Designation || null,
      profile_image: imageUrl,
      reported_by: userForm.reported_by,
      can_self_assign: userForm.can_self_assign,
      page_access: finalPageAccess,
      location: userForm.location,
      day_off: userForm.day_off || null,
    };

    try {
      await dispatch(updateUser({ id: currentUserId, updatedUser })).unwrap();

      // If updating currently logged in user
      if (updatedUser.user_name === localStorage.getItem("user-name")) {
        localStorage.setItem("profile_image", imageUrl || "");
        localStorage.setItem("role", updatedUser.role || "");
        setStoredPageAccess(updatedUser.page_access || "");
        localStorage.setItem("division", updatedUser.division || "");
        window.location.reload();
      }

      resetUserForm();
      setShowUserModal(false);
      showToast("User updated successfully!", "success");
      dispatch(userDetails());
    } catch (error) {
      console.error("Error updating user:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Failed to update user."), "error");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (blockReadOnlyUsers()) return;
    const userToDel = userData.find((u) => u.id === userId);
    if (!userToDel) return;
    setUserToDeleteData({ id: userId, name: userToDel.user_name });
    setDeleteRelatedTasks(false); // default to preserving task history
    setIsCountingTasks(true);
    setTaskCounts({ checklist: 0, delegation: 0, maintenance: 0, repair: 0, total: 0 });
    setShowDeleteConfirm(true);

    try {
      const userName = userToDel.user_name;
      const [clRes, delRes, mtRes, rpRes] = await Promise.all([
        supabase.from("checklist").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("delegation").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("maintenance_tasks").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("repair_tasks").select("id", { count: "exact", head: true }).eq("assigned_person", userName),
      ]);

      const counts = {
        checklist: clRes.count || 0,
        delegation: delRes.count || 0,
        maintenance: mtRes.count || 0,
        repair: rpRes.count || 0,
      };
      counts.total = counts.checklist + counts.delegation + counts.maintenance + counts.repair;
      setTaskCounts(counts);
    } catch (err) {
      console.error("Error fetching task counts for user deletion:", err);
    } finally {
      setIsCountingTasks(false);
    }
  };

  const confirmDeleteUserAndTasks = async () => {
    const { id: userId, name: userName } = userToDeleteData;
    if (!userId) return;
    setIsDeleting(true);
    try {
      // Cascading deletion ONLY if deleteRelatedTasks is true
      if (deleteRelatedTasks && userName) {
        const deletePromises = [
          supabase.from("checklist").delete().eq("name", userName),
          supabase.from("delegation").delete().eq("name", userName),
          supabase.from("maintenance_tasks").delete().eq("name", userName),
          supabase
            .from("repair_tasks")
            .delete()
            .eq("assigned_person", userName),
        ];
        await Promise.all(deletePromises);
      }

      await dispatch(deleteUser(userId)).unwrap();
      if (deleteRelatedTasks) {
        showToast(`User ${userName} and all associated tasks deleted successfully`, "success");
      } else {
        showToast(`User ${userName} deleted. All task history preserved.`, "success");
      }
      dispatch(userDetails());
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Error during deletion process"), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Status & Role Badge Styles
  const getStatusColor = (status) => {
    if (status === "active")
      return "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-400";
    if (status === "on leave" || status === "on_leave")
      return "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400";
    return "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400";
  };

  const getRoleColor = (role) => {
    switch (role?.toUpperCase()) {
      case "ADMINISTRATOR":
        return "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-black border border-purple-300 dark:border-purple-800";
      case "ADMIN":
        return "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400";
      case "HOD":
        return "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400";
      case "MANAGER":
        return "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400";
      default:
        return "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300";
    }
  };

  return (
    <AdminLayout>
      <div className="w-full p-4 md:p-6 space-y-6 theme-transition">
        {/* Banner Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl">
              <Settings size={28} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                Global Enterprise Master Settings
              </h1>
              <p className="text-gray-500 dark:text-slate-400 text-xs font-semibold">
                Centralized user management, role-based access control, inventory catalogues, and procurement masters
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        {accessibleTabs.length > 0 ? (
          <div className="flex border-b border-gray-200 dark:border-slate-800 gap-2 mb-6 overflow-x-auto">
            {accessibleTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                    isActive
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-slate-400"
                  }`}
                >
                  <TabIcon size={14} strokeWidth={2.5} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-gray-150 dark:border-slate-800 shadow-sm max-w-lg mx-auto my-12">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-900/50">
              <Lock size={28} />
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              Settings Access Restricted
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 font-medium">
              You do not currently have permission to access any settings modules. Please contact an Administrator to grant access.
            </p>
          </div>
        )}

        {activeTab === "purchase_master" && (
          <div className="animate-in fade-in duration-200">
            <PurchaseMasterSettingsView activeUser={activeUser} />
          </div>
        )}

        {activeTab === "o2d_master" && (
          <div className="animate-in fade-in duration-200">
            <OrderMasterSettingsView activeUser={activeUser} />
          </div>
        )}

        {activeTab === "tat_master" && (
          <div className="animate-in fade-in duration-200">
            <TatMasterSettingsView activeUser={activeUser} />
          </div>
        )}

        {activeTab === "leads_master" && (
          <div className="animate-in fade-in duration-200">
            <LeadsMasterSettingsView activeUser={activeUser} />
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {isUsersReadOnly && <ReadOnlyBanner />}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative w-full md:max-w-md">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search user by name, email, department, designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl text-sm font-medium focus:outline-blue-600 dark:focus:outline-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Sort Dropdown */}
                <div className="relative flex items-center">
                  <ArrowUpDown
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
                    size={14}
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => handleSortDropdownChange(e.target.value)}
                    className="pl-8.5 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer shadow-xs appearance-none transition-all"
                    title="Sort users list"
                  >
                    <option
                      value="alphabetical_asc"
                      className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    >
                      Alphabetical (A to Z)
                    </option>
                    <option
                      value="alphabetical_desc"
                      className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    >
                      Alphabetical (Z to A)
                    </option>
                    <option
                      value="newest"
                      className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    >
                      Newest to Oldest
                    </option>
                    <option
                      value="oldest"
                      className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    >
                      Oldest to Newest
                    </option>
                    {sortBy === "custom" && (
                      <option
                        value="custom"
                        disabled
                        className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      >
                        Custom ({sortField})
                      </option>
                    )}
                  </select>
                  <ChevronDown
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
                    size={13}
                  />
                </div>

                <button
                  onClick={handleAddButtonClick}
                  disabled={isUsersReadOnly}
                  title={isUsersReadOnly ? READ_ONLY_TOOLTIP : undefined}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                  <span>Add New User</span>
                </button>
              </div>
            </div>

            {/* Error or Loading Banners */}
            {loading && (
              <div className="flex items-center justify-center p-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl">
                <RefreshCw
                  size={24}
                  className="animate-spin text-blue-600 mr-3"
                />
                <span className="text-sm font-bold text-gray-500 dark:text-slate-400">
                  Loading users database...
                </span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-rose-800 dark:text-rose-400 rounded-2xl text-xs font-bold">
                ⚠️ Database error: {error}
              </div>
            )}

            {/* Table (Desktop View) */}
            {!loading && (
              <div className="hidden lg:block bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 text-gray-450 dark:text-slate-500 text-[10px] font-black uppercase tracking-wider select-none">
                        <th
                          onClick={() => handleSort("user_name")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Username</span>
                            {sortField === "user_name" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("email_id")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Email</span>
                            {sortField === "email_id" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("number")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Phone No.</span>
                            {sortField === "number" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("employee_id")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Employee ID</span>
                            {sortField === "employee_id" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("division")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Division</span>
                            {sortField === "division" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("department")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Department</span>
                            {sortField === "department" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("Designation")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Designation</span>
                            {sortField === "Designation" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("status")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Status</span>
                            {sortField === "status" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("role")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Role</span>
                            {sortField === "role" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("reported_by")}
                          className="px-6 py-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Reported To</span>
                            {sortField === "reported_by" ? (
                              sortOrder === "asc" ? (
                                <ArrowUp size={12} className="text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ArrowDown size={12} className="text-blue-600 dark:text-blue-400" />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300 dark:text-slate-600 opacity-60 hover:opacity-100" />
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold overflow-hidden border border-blue-200/20">
                                  {user.profile_image ? (
                                    <img
                                      src={user.profile_image}
                                      alt={user.user_name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span>
                                      {user.user_name.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {user.user_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                              {user.email_id}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                              {user.number}
                            </td>
                            <td className="px-6 py-4 text-sm font-mono text-gray-600 dark:text-slate-300">
                              {user.employee_id || "N/A"}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-slate-300">
                              {user.division || "—"}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-slate-300">
                              {user.department || "—"}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-blue-700 dark:text-blue-400">
                              {user.Designation || "—"}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(user.status)}`}
                              >
                                {user.status === "on_leave"
                                  ? "On Leave"
                                  : user.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getRoleColor(user.role)}`}
                              >
                                {user.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                              {user.reported_by || "Admin"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleEditUser(user.id)}
                                  disabled={isUsersReadOnly}
                                  className="p-1.5 text-gray-450 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={isUsersReadOnly}
                                  className="p-1.5 text-gray-450 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="11"
                            className="px-6 py-12 text-center text-gray-400 dark:text-slate-500 font-bold text-sm"
                          >
                            No users found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cards (Mobile & Tablet View) */}
            {!loading && (
              <div className="lg:hidden space-y-4">
                {filteredUsers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:shadow-md dark:hover:shadow-black/35 hover:border-blue-500/25 transition-all duration-200 space-y-4 text-left"
                      >
                        {/* Card Header: Avatar, Name, Designation, and Action Buttons */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold overflow-hidden border border-blue-200/20 flex-shrink-0">
                              {user.profile_image ? (
                                <img
                                  src={user.profile_image}
                                  alt={user.user_name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-lg">
                                  {user.user_name.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                                {user.user_name}
                              </h4>
                              <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mt-0.5">
                                {user.Designation || "—"}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-855 p-1.5 rounded-xl border border-gray-100 dark:border-slate-800/80">
                            <button
                              onClick={() => handleEditUser(user.id)}
                                  disabled={isUsersReadOnly}
                              className="p-1.5 text-gray-450 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-150 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Edit User"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                                  disabled={isUsersReadOnly}
                              className="p-1.5 text-gray-450 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-150 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Delete User"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Badges section */}
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(user.status)}`}
                          >
                            {user.status === "on_leave" ? "On Leave" : user.status}
                          </span>
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getRoleColor(user.role)}`}
                          >
                            {user.role}
                          </span>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-slate-800/80 text-xs">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Email
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-slate-300 break-all">
                              {user.email_id || "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Phone No.
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-slate-300">
                              {user.number || "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Employee ID
                            </span>
                            <span className="font-mono font-semibold text-gray-700 dark:text-slate-300">
                              {user.employee_id || "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Division
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-slate-300">
                              {user.division || "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Department
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-slate-300">
                              {user.department || "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5 col-span-2">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                              Reported To
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-slate-300">
                              {user.reported_by || "Admin"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center text-gray-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl font-bold text-sm">
                    No users found matching your search.
                  </div>
                )}
              </div>
            )}

            {!loading && (
              <div className="flex items-center justify-between text-xs font-semibold text-gray-400 px-2">
                <div>
                  Showing {filteredUsers.length} of {userData.length} entries
                </div>
                <div className="text-[10px] uppercase font-black tracking-widest text-green-600 bg-green-50 dark:bg-green-950/40 px-2.5 py-0.5 rounded-md">
                  ● Real-time Live Connection
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "inventory_master" && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-xs animate-in fade-in duration-200">
            <SettingsView
              activeUser={activeUser}
              onReloadUser={() => setUserStateSeq((prev) => prev + 1)}
            />
          </div>
        )}

        {showUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setShowUserModal(false)}
            ></div>

            <div className="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden animate-in zoom-in-95 duration-305 border border-white/10 flex flex-col max-h-[95vh]">
              {/* Premium Header */}
              <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-pink-500 px-10 py-8 relative">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight animate-fade-in">
                      {isEditing ? "Update Profile" : "Nurture Talent"}
                    </h3>
                    <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mt-1">
                      {isEditing
                        ? "Refine user information"
                        : "Create a new team member"}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all hover:rotate-90 cursor-pointer"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* Premium Tabs Swapper */}
              <div className="flex border-b border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-900/70 px-10 gap-3">
                <button
                  type="button"
                  onClick={() => setModalTab("details")}
                  className={`px-6 py-3.5 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-2 ${
                    modalTab === "details"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-white/70 dark:bg-slate-800/70 rounded-t-xl"
                      : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-slate-400"
                  }`}
                >
                  <User size={14} strokeWidth={2.5} />
                  <span>User Details</span>
                </button>
                {!isAdministrator(userForm.role, userForm.username) && (
                  <button
                    type="button"
                    onClick={() => setModalTab("permissions")}
                    className={`px-6 py-3.5 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-2 ${
                      modalTab === "permissions"
                        ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-white/70 dark:bg-slate-800/70 rounded-t-xl"
                        : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-slate-400"
                    }`}
                  >
                    <Lock size={14} strokeWidth={2.5} />
                    <span>Page Permissions</span>
                  </button>
                )}
              </div>

              <div className="p-10 overflow-y-auto no-scrollbar flex-1">
                <form
                  onSubmit={isEditing ? handleUpdateUser : handleAddUser}
                  className="space-y-8"
                >
                  {modalTab === "details" && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Profile Image Section */}
                      <div className="flex flex-col items-center mb-4">
                        <div className="relative group">
                          <div className="h-24 w-24 rounded-full bg-white dark:bg-slate-800 p-1 shadow-xl ring-4 ring-blue-100/50 dark:ring-slate-800/80">
                            <div className="h-full w-full rounded-full bg-gradient-to-tr from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 border-2 border-dashed border-blue-200 dark:border-slate-700 flex items-center justify-center overflow-hidden transition-all group-hover:border-blue-400 group-hover:bg-blue-50/50">
                              {profilePreview || userForm.profile_image ? (
                                <img
                                  src={profilePreview || userForm.profile_image}
                                  alt="Profile"
                                  className="h-full w-full object-cover transform transition-transform duration-500 group-hover:scale-110"
                                />
                              ) : (
                                <User
                                  size={32}
                                  className="text-blue-200 dark:text-slate-600 group-hover:text-blue-400 transition-colors"
                                />
                              )}
                            </div>
                          </div>
                          <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer shadow-xl hover:bg-blue-700 transition-all active:scale-90 ring-4 ring-white dark:ring-slate-900 flex items-center justify-center">
                            <Plus size={14} strokeWidth={3} />
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  setProfileFile(file);
                                  const reader = new FileReader();
                                  reader.onloadend = () =>
                                    setProfilePreview(reader.result);
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                        <span className="text-[9px] text-gray-400 dark:text-slate-500 mt-2 font-black uppercase tracking-widest">
                          Profile Identity
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <div className="space-y-1">
                          <label
                            htmlFor="username"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Username
                          </label>
                          <input
                            type="text"
                            name="username"
                            id="username"
                            value={userForm.username}
                            onChange={handleUserInputChange}
                            required
                            className={`w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border rounded-xl focus:ring-2 outline-none transition-all text-sm font-medium ${
                              isDuplicateUsername
                                ? "border-rose-500 focus:ring-rose-500 text-rose-900 dark:text-rose-100"
                                : "border-gray-200 dark:border-slate-700 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            }`}
                            placeholder="Enter username"
                          />
                          {isDuplicateUsername && (
                            <p className="text-[11px] font-bold text-rose-500 mt-1 flex items-center gap-1">
                              <AlertCircle size={13} className="shrink-0" />
                              <span>A user with this username already exists. Please choose another username.</span>
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="email"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Email Address
                          </label>
                          <input
                            type="email"
                            name="email"
                            id="email"
                            value={userForm.email}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                            placeholder="Enter email address"
                          />
                        </div>

                        {!isEditing && (
                          <div className="space-y-1">
                            <label
                              htmlFor="password"
                              className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                            >
                              Password
                            </label>
                            <input
                              type="password"
                              name="password"
                              id="password"
                              value={userForm.password}
                              onChange={handleUserInputChange}
                              required
                              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                              placeholder="••••••••"
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <label
                            htmlFor="phone"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            id="phone"
                            value={userForm.phone}
                            onChange={handleUserInputChange}
                            required
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                            placeholder="+91 00000 00000"
                          />
                        </div>

                        {isEditing && (
                          <div className="space-y-1">
                            <label
                              htmlFor="employee_id"
                              className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                            >
                              Employee ID
                            </label>
                            <input
                              type="text"
                              name="employee_id"
                              id="employee_id"
                              value={userForm.employee_id}
                              readOnly
                              className="w-full px-4 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-500 cursor-not-allowed outline-none text-sm font-medium"
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <label
                            htmlFor="role"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            User Role
                          </label>
                          <select
                            id="role"
                            name="role"
                            value={userForm.role}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                          >
                            <option value="ADMINISTRATOR">ADMINISTRATOR (Super Admin - Full Authority)</option>
                            <option value="admin">Admin</option>
                            <option value="HOD">HOD</option>
                            <option value="user">User</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="reported_by"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Reported To (Supervisor)
                          </label>
                          <select
                            id="reported_by"
                            name="reported_by"
                            value={userForm.reported_by}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                          >
                            <option value="">
                              No Supervisor (Direct Admin)
                            </option>
                            {userData &&
                              userData.length > 0 &&
                              userData
                                .filter(
                                  (u) =>
                                    u &&
                                    u.user_name &&
                                    u.user_name !== userForm.username &&
                                    u.user_name !== "admin",
                                )
                                .map((u, i) => (
                                  <option key={i} value={u.user_name}>
                                    {u.user_name}
                                  </option>
                                ))}
                          </select>
                        </div>

                        <div className="space-y-1 md:col-span-2 relative">
                           <label
                             htmlFor="division"
                             className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                           >
                             Division (Select Multiple)
                           </label>
                           <button
                             type="button"
                             onClick={() => setIsDivisionDropdownOpen((prev) => !prev)}
                             className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-left text-gray-950 dark:text-white transition-all text-sm font-medium flex items-center justify-between"
                           >
                             <span className="truncate">
                               {(userForm.division || "")
                                 .split(",")
                                 .map((s) => s.trim())
                                 .filter(Boolean).length > 0
                                 ? (userForm.division || "")
                                     .split(",")
                                     .map((s) => s.trim())
                                     .filter(Boolean)
                                     .join(", ")
                                 : "Choose division(s)..."}
                             </span>
                             <span className="ml-2 text-xs text-gray-400">▼</span>
                           </button>

                           {isDivisionDropdownOpen && (
                             <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-2 space-y-1 max-h-48 overflow-y-auto">
                               {divisions.map((div) => {
                                 const selected = (userForm.division || "")
                                   .split(",")
                                   .map((s) => s.trim())
                                   .filter(Boolean)
                                   .includes(div.name);
                                 return (
                                   <label
                                     key={div.id}
                                     className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200"
                                   >
                                     <input
                                       type="checkbox"
                                       checked={selected}
                                       onChange={() => {
                                         const current = (userForm.division || "")
                                           .split(",")
                                           .map((s) => s.trim())
                                           .filter(Boolean);
                                         let updated;
                                         if (selected) {
                                           updated = current.filter((d) => d !== div.name);
                                         } else {
                                           updated = [...current, div.name];
                                         }
                                         setUserForm((prev) => ({
                                           ...prev,
                                           division: updated.join(", "),
                                         }));
                                       }}
                                       className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                     />
                                     <span>{div.name}</span>
                                   </label>
                                 );
                               })}
                             </div>
                           )}
                         </div>

                         <div className="space-y-1 md:col-span-2">
                           <label
                             htmlFor="department"
                             className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                           >
                             Department Assigned
                           </label>
                           <select
                             id="department"
                             name="department"
                             value={userForm.department}
                             onChange={handleUserInputChange}
                             className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-950 dark:text-white transition-all text-sm font-medium"
                           >
                             <option value="">Choose a department...</option>
                             {(() => {
                               if (!department || department.length === 0) return null;

                               const selectedDivList = (userForm.division || "")
                                 .split(",")
                                 .map((s) => s.toLowerCase().trim())
                                 .filter(Boolean);

                               let filteredDeptNames = [];

                               if (selectedDivList.length === 0) {
                                 filteredDeptNames = Array.from(
                                   new Set(department.map((d) => (d.department || "").trim()).filter(Boolean))
                                 ).sort();
                               } else if (selectedDivList.length === 1) {
                                 const targetDiv = selectedDivList[0];
                                 filteredDeptNames = Array.from(
                                   new Set(
                                     department
                                       .filter((d) => (d.division || "").toLowerCase().trim() === targetDiv)
                                       .map((d) => (d.department || "").trim())
                                       .filter(Boolean)
                                   )
                                 ).sort();
                               } else {
                                 const deptDivMap = new Map();

                                 department.forEach((d) => {
                                   const rawDeptName = (d.department || "").trim();
                                   const normDiv = (d.division || "").toLowerCase().trim();
                                   if (!rawDeptName || !normDiv || !selectedDivList.includes(normDiv)) return;

                                   const normDeptName = rawDeptName.toLowerCase();
                                   if (!deptDivMap.has(normDeptName)) {
                                     deptDivMap.set(normDeptName, {
                                       displayName: rawDeptName,
                                       divisions: new Set(),
                                     });
                                   }
                                   deptDivMap.get(normDeptName).divisions.add(normDiv);
                                 });

                                 const commonNames = [];
                                 deptDivMap.forEach((info) => {
                                   if (info.divisions.size >= selectedDivList.length) {
                                     commonNames.push(info.displayName);
                                   }
                                 });

                                 filteredDeptNames = commonNames.sort();
                               }

                               return filteredDeptNames.map((deptName, index) => (
                                 <option key={index} value={deptName}>
                                   {deptName}
                                 </option>
                               ));
                             })()}
                           </select>
                         </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="Designation"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Designation
                          </label>
                          <input
                            type="text"
                            name="Designation"
                            id="Designation"
                            value={userForm.Designation}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                            placeholder="e.g. Senior Technician..."
                          />
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="day_off"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Day Off
                          </label>
                          <select
                            id="day_off"
                            name="day_off"
                            value={userForm.day_off || ""}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                          >
                            <option value="">None (No Day Off)</option>
                            <option value="sunday">Sunday</option>
                            <option value="monday">Monday</option>
                            <option value="tuesday">Tuesday</option>
                            <option value="wednesday">Wednesday</option>
                            <option value="thursday">Thursday</option>
                            <option value="friday">Friday</option>
                            <option value="saturday">Saturday</option>
                          </select>
                        </div>

                        {isEditing && (
                          <div className="space-y-1">
                            <label
                              htmlFor="status"
                              className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                            >
                              User Status
                            </label>
                            <select
                              id="status"
                              name="status"
                              value={userForm.status}
                              onChange={handleUserInputChange}
                              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white transition-all text-sm font-medium"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="on_leave">On Leave</option>
                            </select>
                          </div>
                        )}

                        <div className="space-y-1 md:col-span-2">
                          <label
                            htmlFor="location"
                            className="block text-[11px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                          >
                            Restricted Storage Location
                          </label>
                          <select
                            id="location"
                            name="location"
                            value={userForm.location}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-950 dark:text-white transition-all text-sm font-medium cursor-pointer"
                          >
                            <option value="">
                              All / Unrestricted Location
                            </option>
                            {locations.map((loc, idx) => (
                              <option key={idx} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-850 p-4 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 flex items-center justify-between group transition-all">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm border border-blue-100 dark:border-slate-700">
                            <User size={16} strokeWidth={2.5} />
                          </div>
                          <div className="text-left">
                            <h4 className="text-xs font-black text-blue-900 dark:text-white uppercase tracking-widest mb-0.5">
                              Self-Assign
                            </h4>
                            <p className="text-[9px] text-gray-400 font-bold max-w-[180px]">
                              Assign tasks to themselves
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer scale-100">
                          <input
                            type="checkbox"
                            name="can_self_assign"
                            checked={userForm.can_self_assign}
                            onChange={(e) =>
                              setUserForm((prev) => ({
                                ...prev,
                                can_self_assign: e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
                        </label>
                      </div>
                    </div>
                  )}

                  {modalTab === "permissions" && !isAdministrator(userForm.role, userForm.username) && (() => {
                    const permMap = toPermissionMap(userForm.page_access);
                    const enabledCount = ALL_PERMISSION_PAGE_IDS.filter((id) => permMap[id]?.read).length;
                    const writeCount = ALL_PERMISSION_PAGE_IDS.filter((id) => permMap[id]?.write).length;
                    const misCount = ALL_PERMISSION_PAGE_IDS.filter((id) => permMap[id]?.mis).length;
                    const PERM_COLUMNS = [
                      { key: PERMISSIONS.READ, label: "Read" },
                      { key: PERMISSIONS.WRITE, label: "Write" },
                      { key: PERMISSIONS.MIS, label: "MIS" },
                    ];
                    const levelBadge = (level) =>
                      level === "Full Access"
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
                        : level === "No Access"
                        ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200/60 dark:border-slate-700"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50";

                    return (
                    <div className="space-y-4 animate-in fade-in duration-200 text-left">
                      {/* Header & Quick Action Toolbar */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-gray-150 dark:border-slate-800">
                        <div>
                          <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <Shield size={16} className="text-blue-600 dark:text-blue-400" />
                            Page Level Permissions
                          </h4>
                          <p className="text-xs text-gray-450 dark:text-slate-450 mt-0.5 font-medium">
                            Read = view only (actions disabled) · Write = full actions · MIS = responsible for that page&apos;s pending
                            tasks (shown as Responsible on the PC Dashboard; only for pages with a pending section). Pages without Read are hidden and blocked.
                          </p>
                        </div>

                        {/* Global Bulk Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setAllPagePermissions({ read: true, write: true })}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all border border-blue-200/60 dark:border-blue-900/60 flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckSquare size={13} />
                            <span>Grant All (Full)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllPagePermissions({ read: true, write: false })}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold transition-all border border-amber-200/60 dark:border-amber-900/60 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Lock size={13} />
                            <span>Grant All (Read-Only)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllPagePermissions(null)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 rounded-xl text-xs font-bold transition-all border border-gray-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Square size={13} />
                            <span>Revoke All</span>
                          </button>
                        </div>
                      </div>

                      {/* Search Box & Counter Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                          <input
                            type="text"
                            value={permissionSearch}
                            onChange={(e) => setPermissionSearch(e.target.value)}
                            placeholder="Filter by page name, module, or route URL..."
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {permissionSearch && (
                            <button
                              type="button"
                              onClick={() => setPermissionSearch("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        <div className="text-xs font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800/60 px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700/60 shrink-0">
                          Enabled:{" "}
                          <span className="text-blue-600 dark:text-blue-400 font-mono font-black">{enabledCount}</span>{" "}
                          / {ALL_PERMISSION_PAGE_IDS.length} Pages · Write:{" "}
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">{writeCount}</span>
                          {" "}· MIS:{" "}
                          <span className="text-violet-600 dark:text-violet-400 font-mono font-black">{misCount}</span>
                        </div>
                      </div>

                      {/* Read / Write / MIS matrix */}
                      <div className="border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900 max-h-[460px] overflow-y-auto no-scrollbar">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 z-10 bg-gray-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-gray-200 dark:border-slate-700">
                            <tr>
                              <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                Page Name
                              </th>
                              <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 hidden md:table-cell">
                                System / Module
                              </th>
                              <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 hidden lg:table-cell">
                                Path URL
                              </th>
                              {PERM_COLUMNS.map((c) => (
                                <th key={c.key} className="py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 text-center w-14">
                                  {c.label}
                                </th>
                              ))}
                              <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 text-right pr-6">
                                Access Level
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60">
                            {Object.entries(SYSTEM_PAGES).map(([sysKey, sys]) => {
                              const SystemIcon = sys.icon;
                              const filteredPages = sys.pages.filter((p) => {
                                if (!permissionSearch) return true;
                                const q = permissionSearch.toLowerCase();
                                return (
                                  p.label.toLowerCase().includes(q) ||
                                  p.route.toLowerCase().includes(q) ||
                                  p.id.toLowerCase().includes(q) ||
                                  sys.name.toLowerCase().includes(q)
                                );
                              });

                              if (filteredPages.length === 0) return null;

                              const sysPageIds = sys.pages.map((p) => p.id);
                              const totalInSys = sysPageIds.length;
                              const readInSys = sysPageIds.filter((id) => permMap[id]?.read).length;
                              const writeInSys = sysPageIds.filter((id) => permMap[id]?.write).length;

                              return (
                                <React.Fragment key={sysKey}>
                                  {/* Module header row with bulk Read / Write / MIS toggles */}
                                  <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-y border-gray-200 dark:border-slate-700 font-bold">
                                    <td colSpan={3} className="py-2.5 px-4">
                                      <div className="flex items-center gap-2.5 flex-wrap">
                                        <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                                          <SystemIcon size={14} />
                                        </div>
                                        <span className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                                          {sys.name}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                                            readInSys === 0
                                              ? "bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700"
                                              : writeInSys === totalInSys
                                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                          }`}
                                        >
                                          {readInSys} / {totalInSys} Read · {writeInSys} Write
                                        </span>
                                      </div>
                                    </td>
                                    {PERM_COLUMNS.map((c) => {
                                      // MIS only applies to pages that have a pending section
                                      const colIds = c.key === PERMISSIONS.MIS ? sysPageIds.filter((id) => MIS_PAGE_IDS.has(id)) : sysPageIds;
                                      if (colIds.length === 0) {
                                        return (
                                          <td key={c.key} className="py-2.5 px-2 text-center text-gray-300 dark:text-slate-600">
                                            —
                                          </td>
                                        );
                                      }
                                      const countOn = colIds.filter((id) => permMap[id]?.[c.key]).length;
                                      const allOn = countOn === colIds.length;
                                      return (
                                        <td key={c.key} className="py-2.5 px-2 text-center">
                                          <input
                                            type="checkbox"
                                            checked={allOn}
                                            ref={(el) => {
                                              if (el) el.indeterminate = countOn > 0 && !allOn;
                                            }}
                                            onChange={() => updatePagePermissions(colIds, c.key, !allOn)}
                                            className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            title={`${allOn ? "Remove" : "Grant"} ${c.label} for all ${sys.name} pages`}
                                          />
                                        </td>
                                      );
                                    })}
                                    <td className="py-2.5 px-4" />
                                  </tr>

                                  {/* Page rows */}
                                  {filteredPages.map((page) => {
                                    const entry = permMap[page.id] || { read: false, write: false, mis: false };
                                    const level = getAccessLevel(entry);
                                    return (
                                      <tr
                                        key={page.id}
                                        className={`hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors ${
                                          entry.read ? "bg-blue-50/20 dark:bg-blue-950/10" : "bg-white dark:bg-slate-900"
                                        }`}
                                      >
                                        <td className="py-2.5 px-4">
                                          <span className={`text-xs font-bold ${entry.read ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-slate-400"}`}>
                                            {page.label}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-4 hidden md:table-cell">
                                          <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">{sys.name}</span>
                                        </td>
                                        <td className="py-2.5 px-4 hidden lg:table-cell">
                                          <code className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200/60 dark:border-slate-700/60">
                                            {page.route}
                                          </code>
                                        </td>
                                        {PERM_COLUMNS.map((c) =>
                                          c.key === PERMISSIONS.MIS && !MIS_PAGE_IDS.has(page.id) ? (
                                            <td
                                              key={c.key}
                                              className="py-2.5 px-2 text-center text-gray-300 dark:text-slate-600"
                                              title="No pending section on this page"
                                            >
                                              —
                                            </td>
                                          ) : (
                                          <td key={c.key} className="py-2.5 px-2 text-center">
                                            <input
                                              type="checkbox"
                                              checked={!!entry[c.key]}
                                              onChange={(e) => updatePagePermissions([page.id], c.key, e.target.checked)}
                                              className="w-4 h-4 rounded border-gray-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                              aria-label={`${c.label} permission for ${page.label}`}
                                              title={c.key === PERMISSIONS.MIS ? "Responsible for this page's pending tasks" : undefined}
                                            />
                                          </td>
                                          ),
                                        )}
                                        <td className="py-2.5 px-4 text-right pr-6">
                                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap ${levelBadge(level)}`}>
                                            {level === "Full Access" && <Check size={11} strokeWidth={3} />}
                                            {level}
                                          </span>
                                          {entry.mis && (
                                            <span className="ml-1 inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900/50">
                                              MIS Owner
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })()}

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-slate-800 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowUserModal(false)}
                      className="px-8 py-3 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-slate-300 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDuplicateUsername}
                      className={`px-10 py-3 text-white text-xs font-black rounded-2xl shadow-md transition-all flex items-center gap-2 uppercase tracking-widest ${
                        isDuplicateUsername
                          ? "bg-gray-400 dark:bg-slate-700 cursor-not-allowed opacity-60"
                          : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 cursor-pointer"
                      }`}
                    >
                      <Save size={16} strokeWidth={3} />
                      {isEditing ? "Save Changes" : "Create User"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* --- DELETION CONFIRM DIALOG --- */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-md animate-in fade-in duration-200"
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden border border-gray-150 dark:border-slate-800 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
              <div className="p-6 sm:p-8 overflow-y-auto no-scrollbar space-y-5 text-center">
                <div className="h-14 w-14 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-4 ring-rose-100/50 dark:ring-rose-950/20">
                  <Trash2 size={26} />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                    Delete User Account?
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                    Target account:{" "}
                    <strong className="text-gray-900 dark:text-white font-black underline underline-offset-2">
                      {userToDeleteData.name}
                    </strong>
                  </p>
                </div>

                {/* Calculated Related Tasks Breakdown Card */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-4 text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Associated Task Records
                    </span>
                    {isCountingTasks ? (
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" /> Calculating...
                      </span>
                    ) : (
                      <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                        taskCounts.total > 0
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                      }`}>
                        {taskCounts.total} Total Records
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5">
                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400 block">Checklist</span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {isCountingTasks ? "..." : taskCounts.checklist}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400 block">Delegation</span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {isCountingTasks ? "..." : taskCounts.delegation}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400 block">Maintenance</span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {isCountingTasks ? "..." : taskCounts.maintenance}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400 block">Repair</span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {isCountingTasks ? "..." : taskCounts.repair}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 col-span-2 sm:col-span-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400 block">EA Tasks</span>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {isCountingTasks ? "..." : taskCounts.ea}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Option Selector: Keep Task History vs Delete Everything */}
                <div className="space-y-2.5 text-left">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    What should happen to the related tasks?
                  </p>

                  {/* Option 1: Keep Task History (Default & Recommended) */}
                  <div
                    onClick={() => setDeleteRelatedTasks(false)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      !deleteRelatedTasks
                        ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500 shadow-sm"
                        : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete_tasks_mode"
                      id="opt_keep_history"
                      checked={!deleteRelatedTasks}
                      onChange={() => setDeleteRelatedTasks(false)}
                      className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="opt_keep_history" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900 dark:text-white">
                          Keep Task Records (Preserve History)
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium mt-1 leading-snug">
                        Preserves all {taskCounts.total} task records for reporting, historical analytics, and audits. Only deletes the user login account.
                      </p>
                    </label>
                  </div>

                  {/* Option 2: Purge Tasks */}
                  <div
                    onClick={() => setDeleteRelatedTasks(true)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      deleteRelatedTasks
                        ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 dark:border-rose-500 shadow-sm"
                        : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete_tasks_mode"
                      id="opt_purge_tasks"
                      checked={deleteRelatedTasks}
                      onChange={() => setDeleteRelatedTasks(true)}
                      className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <label htmlFor="opt_purge_tasks" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                          Delete All Related Tasks
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          Irreversible
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium mt-1 leading-snug">
                        Permanently deletes the user account AND completely wipes all {taskCounts.total} associated task records from the database.
                      </p>
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    disabled={isDeleting || isCountingTasks}
                    onClick={confirmDeleteUserAndTasks}
                    className={`w-full py-3.5 px-6 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-white ${
                      deleteRelatedTasks
                        ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200 dark:shadow-none"
                        : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-blue-200 dark:shadow-none"
                    }`}
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Deleting...
                      </>
                    ) : deleteRelatedTasks ? (
                      `Confirm: Delete User & Purge ${taskCounts.total} Tasks`
                    ) : (
                      `Confirm: Delete User Only (Keep History)`
                    )}
                  </button>
                  <button
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full py-2.5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-slate-350 transition-colors cursor-pointer"
                  >
                    Cancel (Keep Profile)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- DAY OFF TASK CONFLICT MODAL --- */}
        {showDayOffConflictModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
              onClick={handleCancelDayOffConflict}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-150 dark:border-slate-800 animate-in zoom-in-95 duration-200">
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 dark:text-white">
                        Tasks Assigned on Day Off ({userForm.day_off?.toUpperCase()})
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                        User "{userForm.username}" has {dayOffConflicts.length} task(s) assigned on {userForm.day_off?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                    <thead className="bg-gray-50 dark:bg-slate-800/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Task ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Source
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {dayOffConflicts.map((task) => (
                        <tr key={`${task._table}_${task.task_id}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-white font-mono">
                            #{task.task_id}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                task._source === "Checklist"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                  : "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                              }`}
                            >
                              {task._source}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 dark:text-slate-300 max-w-[200px] truncate">
                            {task.task_description || task.reason || "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-400 font-medium whitespace-nowrap">
                            {task.planned_date || task.task_start_date
                              ? new Date(task.planned_date || task.task_start_date).toLocaleDateString("en-IN")
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleOpenDeleteDayOffConfirm}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDayOffConflict}
                    className="px-6 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- DAY OFF TASKS DELETE WARNING CONFIRMATION MODAL --- */}
        {showDeleteDayOffTasksConfirm && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-md"
              onClick={() => setShowDeleteDayOffTasksConfirm(false)}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden border border-gray-150 dark:border-slate-800 animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center space-y-6">
                <div className="h-16 w-16 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <AlertCircle size={32} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">
                    Confirm Task Deletion?
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-semibold">
                    Are you sure you want to permanently delete all{" "}
                    <strong className="text-rose-600 dark:text-rose-400 font-bold">
                      {dayOffConflicts.length} task(s)
                    </strong>{" "}
                    assigned to <strong>{userForm.username}</strong> on{" "}
                    <strong className="uppercase">{userForm.day_off}</strong>?
                    <br />
                    This action cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    disabled={isDeletingDayOffTasks}
                    onClick={confirmDeleteAllDayOffTasks}
                    className="w-full py-4 px-6 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isDeletingDayOffTasks ? (
                      "Deleting Tasks..."
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Yes, Delete All Tasks
                      </>
                    )}
                  </button>
                  <button
                    disabled={isDeletingDayOffTasks}
                    onClick={() => setShowDeleteDayOffTasksConfirm(false)}
                    className="w-full py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-slate-350 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
