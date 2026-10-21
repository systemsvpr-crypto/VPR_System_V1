"use client";
import aceLogo from "../../../../assets/vpr_logo.png";

import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "../../context/ThemeContext";
import { fetchInventoryData } from "../../redux/slice/inventorySlice";
import { fetchTransfers } from "../../redux/slice/transferSlice";
import { countsFromItems } from "../../../../services/pendingSummary/stageRegistry";
import { fetchChecklistPending } from "../../../../services/pendingSummary/checklistPending";
import { computeInventoryPending } from "../../../../services/pendingSummary/inventoryPending";
import { computeO2DPending, readO2DStore } from "../../../../services/pendingSummary/o2dPending";
import { fetchLeadsPending } from "../../../../services/pendingSummary/otherPending";
import supabase from "../../SupabaseClient";
import { fetchPurchaseSidebarBadgeCounts } from "../../../../systems/purchase/services/purchaseWorkflowApi";
import { fetchPurchaseReturnSidebarBadgeCounts } from "../../../../systems/purchaseReturn/services/purchaseReturnApi";
import {
  fetchDocsSidebarBadgeCounts,
  DOCS_DATA_CHANGED_EVENT,
} from "../../../../systems/docs/services/docsLocalStorage";
import {
  DATA_CHANGED_EVENT,
} from "../../../../systems/orderDelivery/utils/storageManager";
import { isAdministrator } from "../../utils/roleUtils";
import { getReadablePageIds, setStoredPageAccess, usePagePermission } from "../../utils/pagePermissionUtils";
import useAuthStore from "../../../../store/authStore";
import ReadOnlyGuard from "../ReadOnlyGuard";
import {
  CheckSquare,
  ClipboardList,
  LogOut,
  Menu,
  Database,
  ChevronDown,
  ChevronRight,
  Zap,
  Settings,
  CalendarCheck,
  Calendar as CalendarIcon,
  BookmarkCheck,
  X,
  Video,
  Sun,
  Moon,
  LayoutDashboard,
  Boxes,
  History,
  AlertTriangle,
  ShieldCheck,
  MessageCircle,
  UserCheck,
  ShoppingBag,
  CreditCard,
  Truck,
  Package,
  FileEdit,
  MessagesSquare,
  UserCog,
  PlusCircle,
  CheckCircle2,
  Phone,
  FileText,
  RotateCcw,
  Coins,
  PackageCheck,
  Receipt,
  Warehouse,
  ShoppingCart,
  ClipboardCheck,
  TrendingUp,
  UserPlus,
  PhoneCall,
  Wallet,
  Contact,
  Files,
  Mail,
  ListChecks,
  HelpCircle,
  ListFilter,
} from "lucide-react";

const ROUTE_TO_PAGE_ID = {
  "/checklist/pc": "pc_dashboard",
  "/checklist/admin": "checklist_dashboard",
  "/checklist/quick-task": "checklist_quick_task",
  "/checklist/assign-task": "checklist_assign_task",
  "/checklist/delegation": "checklist_delegation",
  "/checklist/task": "checklist_task",
  "/checklist/calendar": "checklist_calendar",
  "/checklist/holiday-list": "checklist_holiday",
  "/checklist/working-day-calendar": "checklist_working_day",
  "/checklist/admin-approval": "checklist_approval",
  "/checklist/inventory/dashboard": "inventory_dashboard",
  "/checklist/inventory/stock": "inventory_stock",
  "/checklist/inventory/physical-stock": "inventory_physical_stock",
  "/checklist/inventory/master": "inventory_master",
  "/checklist/inventory/transactions": "inventory_transactions",
  "/checklist/inventory/reorder": "inventory_reorder",
  "/checklist/inventory/indent": "inventory_indent",
  "/checklist/inventory/transfer-request": "inventory_transfer_request",
  "/checklist/inventory/transfer-approval": "inventory_transfer_approval",
  "/checklist/inventory/video": "inventory_video",
  "/checklist/inventory/audit": "inventory_audit",
  "/checklist/inventory/settings": "inventory_settings",
  "/checklist/purchase/dashboard": "purchase_dashboard",
  "/checklist/purchase/create-indent": "purchase_indent",
  "/checklist/purchase/delegate-approval": "purchase_delegate",
  "/checklist/purchase/indent-approval": "purchase_approval",
  "/checklist/purchase/quotation": "purchase_quotation",
  "/checklist/purchase/approved-vendor": "purchase_approved_vendor",
  "/checklist/purchase/po-entry": "purchase_po",
  "/checklist/purchase/payment": "purchase_payment",
  "/checklist/purchase/follow-up-vendor": "purchase_lifting",
  "/checklist/purchase/transporter-follow-up": "purchase_transporter",
  "/checklist/purchase/material-received": "purchase_grn",
  "/checklist/purchase/receipt-in-tally": "purchase_tally",
  "/checklist/purchase/order-cancel": "purchase_cancel",
  "/checklist/purchase/video": "purchase_video",
  "/checklist/purchase-return": "purchase_return",
  "/checklist/purchase-return/dashboard": "purchase_return_dashboard",
  "/checklist/purchase-return/approval": "purchase_return_approval",
  "/checklist/purchase-return/credit": "purchase_return_credit",
  "/checklist/purchase-return/logistics": "purchase_return_logistics",
  "/checklist/purchase-return/debit-note": "purchase_return_debit_note",
  "/checklist/purchase-return/plant-return": "purchase_return_plant_return",
  "/checklist/purchase-return/video": "purchase_return_video",
  "/checklist/purchase-return/training-video": "purchase_return_video",
  "/checklist/purchase-return/settings": "purchase_return_settings",
  "/checklist/whatsapp/inbox": "whatsapp_inbox",
  "/checklist/whatsapp/scheduler": "whatsapp_scheduler",
  "/checklist/leads": "leads_dashboard",
  "/checklist/leads/new-lead": "leads_new_lead",
  "/checklist/leads/entry": "leads_new_lead",
  "/checklist/leads/followup-tracker": "leads_followup_tracker",
  "/checklist/leads/followup-tracker/new": "leads_followup_tracker",
  "/checklist/leads/follow-up": "leads_followup_tracker",
  "/checklist/leads/follow-up/new": "leads_followup_tracker",
  "/checklist/leads/pending-quotation": "leads_pending_quotation",
  "/checklist/leads/quotation": "leads_pending_quotation",
  "/checklist/leads/quotation-tracker": "leads_quotation_tracker",
  "/checklist/leads/advance-payment": "leads_quotation_tracker",
  "/checklist/leads/contacts": "leads_contacts",
  "/checklist/leads/calendar": "leads_calendar",
  "/checklist/order-delivery/dashboard": "o2d_dashboard",
  "/checklist/order-delivery/received-order": "o2d_purchase_order",
  "/checklist/order-delivery/purchase-order": "o2d_purchase_order",
  "/checklist/order-delivery/check-and-validation": "o2d_check_validation",
  "/checklist/order-delivery/check-for-delivery": "o2d_check_delivery",
  "/checklist/order-delivery/production-planning": "o2d_production",
  "/checklist/order-delivery/dispatch-planning": "o2d_dispatch",
  "/checklist/order-delivery/packaging": "o2d_packaging",
  "/checklist/order-delivery/vehicle-logistic": "o2d_logistic",
  "/checklist/order-delivery/make-callan": "o2d_callan",
  "/checklist/order-delivery/make-invoice": "o2d_invoice",
  "/checklist/order-delivery/confirm-delivery": "o2d_confirm_delivery",
  "/checklist/order-delivery/payment": "o2d_payment",
  "/checklist/order-delivery/training-video": "o2d_video",
  "/checklist/order-delivery/video": "o2d_video",
  "/checklist/docs/dashboard": "docs_dashboard",
  "/checklist/docs/resources": "docs_resources",
  "/checklist/docs/all": "docs_all",
  "/checklist/docs/renewal": "docs_renewal",
  "/checklist/docs/shared": "docs_shared",
  "/checklist/docs/subscription/all": "docs_sub_all",
  "/checklist/docs/subscription/approval": "docs_sub_approval",
  "/checklist/docs/subscription/payment": "docs_sub_payment",
  "/checklist/docs/subscription/renewal": "docs_sub_renewal",
  "/checklist/docs/loan/all": "docs_loan_all",
  "/checklist/docs/loan/foreclosure": "docs_loan_foreclosure",
  "/checklist/docs/loan/noc": "docs_loan_noc",
  "/checklist/query": "query_form",
  "/checklist/query/new": "query_form",
  "/checklist/query/tracker": "query_tracker",
};

const checkPagePermission = (allowedPages, pageId) => {
  if (!allowedPages || !pageId) return false;
  if (pageId === "query_form" || pageId === "query_tracker") return true;
  if (allowedPages === "all" || allowedPages.includes(pageId)) return true;
  // Aliases for renamed pages
  if (pageId === "leads_new_lead" && allowedPages.includes("leads_entry")) return true;
  if (pageId === "leads_entry" && allowedPages.includes("leads_new_lead")) return true;
  if (pageId === "leads_followup_tracker" && allowedPages.includes("leads_followup")) return true;
  if (pageId === "leads_followup" && allowedPages.includes("leads_followup_tracker")) return true;
  if (pageId === "leads_pending_quotation" && allowedPages.includes("leads_quotation")) return true;
  if (pageId === "leads_quotation" && allowedPages.includes("leads_pending_quotation")) return true;
  if (pageId === "leads_quotation_tracker" && allowedPages.includes("leads_advance_payment")) return true;
  if (pageId === "leads_advance_payment" && allowedPages.includes("leads_quotation_tracker")) return true;
  if (pageId === "settings_leads" && allowedPages.includes("leads_settings")) return true;
  if (pageId === "leads_settings" && allowedPages.includes("settings_leads")) return true;
  if (pageId === "leads_calendar" && allowedPages.includes("leads_dashboard")) return true;
  if (pageId === "o2d_video" && (allowedPages.includes("o2d_video") || allowedPages.some((p) => p.startsWith("o2d_")))) return true;
  return false;
};

const getPageIdForPath = (path) => {
  if (ROUTE_TO_PAGE_ID[path]) return ROUTE_TO_PAGE_ID[path];
  let bestMatch = "";
  let bestPageId = "";
  Object.keys(ROUTE_TO_PAGE_ID).forEach((route) => {
    if (path.startsWith(route) && route.length > bestMatch.length) {
      bestMatch = route;
      bestPageId = ROUTE_TO_PAGE_ID[route];
    }
  });
  return bestPageId;
};

// Settings pages keep one route per screen and select the tab via ?tab=
const SETTINGS_TAB_TO_PAGE_ID = {
  users: "settings_users",
  inventory_master: "settings_inventory",
  inventory: "settings_inventory",
  purchase_master: "settings_purchase",
  purchase: "settings_purchase",
  o2d_master: "settings_o2d",
  o2d: "settings_o2d",
  tat_master: "settings_tat",
  tat: "settings_tat",
  leads_master: "settings_leads",
};

// Page-permission ID of the screen being shown (drives the read-only guard)
const getGuardPageId = (pathname, search) => {
  const tab = new URLSearchParams(search).get("tab");
  if (pathname.startsWith("/checklist/global-settings")) {
    return SETTINGS_TAB_TO_PAGE_ID[tab] || "settings_users";
  }
  if (pathname.startsWith("/checklist/setting") && SETTINGS_TAB_TO_PAGE_ID[tab]) {
    return SETTINGS_TAB_TO_PAGE_ID[tab];
  }
  return getPageIdForPath(pathname);
};

export default function AdminLayout({
  children,
  showLayout = true,
}) {
  const location = useLocation();
  // Read-only guard: user has Read but not Write on the current page
  const guardPageId = getGuardPageId(location.pathname, location.search);
  const guardPermission = usePagePermission(guardPageId || "__none__");
  const isReadOnlyPage = !!guardPageId && guardPermission.isReadOnly && !guardPermission.isSuperAdmin;
  // Purchase Return pages already show their own view-only notice
  const showGuardBanner = !location.pathname.startsWith("/checklist/purchase-return");
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const notifications = [];
  const {
    materials = [],
    transactions = [],
    indents = [],
    physicalStocks = [],
  } = useSelector((state) => state.inventory || {});
  const { transfers = [] } = useSelector((state) => state.transfers || {});

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChecklistDropdownOpen, setIsChecklistDropdownOpen] = useState(
    location.pathname.startsWith("/checklist") &&
      !location.pathname.startsWith("/checklist/inventory") &&
      !location.pathname.startsWith("/checklist/purchase") &&
      !location.pathname.startsWith("/checklist/purchase-return") &&
      !location.pathname.startsWith("/checklist/whatsapp") &&
      !location.pathname.startsWith("/checklist/order-delivery") &&
      !location.pathname.startsWith("/checklist/leads") &&
      !location.pathname.startsWith("/checklist/docs") &&
      location.pathname !== "/checklist/global-settings" &&
      location.pathname !== "/checklist/portal" &&
      location.pathname !== "/checklist/pc" &&
      !location.pathname.startsWith("/checklist/pc/"),
  );
  const [isHolidayDropdownOpen, setIsHolidayDropdownOpen] = useState(
    location.pathname === "/checklist/holiday-list" ||
      location.pathname === "/checklist/working-day-calendar",
  );
  const [isInventoryDropdownOpen, setIsInventoryDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/inventory"),
  );
  const [isPurchaseDropdownOpen, setIsPurchaseDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/purchase") &&
      !location.pathname.startsWith("/checklist/purchase-return"),
  );
  const [isPurchaseReturnDropdownOpen, setIsPurchaseReturnDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/purchase-return"),
  );
  const [isWhatsappDropdownOpen, setIsWhatsappDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/whatsapp"),
  );
  const [isO2DDropdownOpen, setIsO2DDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/order-delivery"),
  );
  const [isLeadsDropdownOpen, setIsLeadsDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/leads"),
  );
  const [isDocsDropdownOpen, setIsDocsDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/docs"),
  );
  const [isQueryDropdownOpen, setIsQueryDropdownOpen] = useState(
    location.pathname.startsWith("/checklist/query"),
  );

  const { isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [profileImage, setProfileImage] = useState("");

  const [isUserPopupOpen, setIsUserPopupOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [userDelegationCount, setUserDelegationCount] = useState(0);
  const [userTaskCount, setUserTaskCount] = useState(0);
  const [purchaseBadgeCounts, setPurchaseBadgeCounts] = useState({
    delegateApproval: 0,
    indentApproval: 0,
    quotation: 0,
    approvedVendor: 0,
    poEntry: 0,
    payment: 0,
    followUpVendor: 0,
    transporterFollowUp: 0,
    materialReceived: 0,
    tallyBilling: 0,
    total: 0,
  });
  const [purchaseReturnBadgeCounts, setPurchaseReturnBadgeCounts] = useState({
    approval: 0,
    credit: 0,
    logistics: 0,
    debitNote: 0,
    plantReturn: 0,
    total: 0,
  });
  const [o2dBadgeCounts, setO2dBadgeCounts] = useState({
    receivedOrder: 0,
    checkAndValidation: 0,
    checkForDelivery: 0,
    productionPlanning: 0,
    dispatchPlanning: 0,
    packaging: 0,
    vehicleLogistic: 0,
    makeCallan: 0,
    makeInvoice: 0,
    confirmDelivery: 0,
    payment: 0,
    total: 0,
  });
  const [leadsBadgeCounts, setLeadsBadgeCounts] = useState({
    newLead: 0,
    followupTracker: 0,
    pendingQuotation: 0,
    quotationTracker: 0,
    contacts: 0,
    total: 0,
  });
  const [docsBadgeCounts, setDocsBadgeCounts] = useState({
    documentRenewal: 0,
    subscriptionApproval: 0,
    subscriptionPayment: 0,
    subscriptionRenewal: 0,
    loanForeclosure: 0,
    loanNoc: 0,
    total: 0,
  });

  // Check authentication on component mount
  useEffect(() => {
    const storedUsername = localStorage.getItem("user-name");
    const storedRole = localStorage.getItem("role");
    const authUser = useAuthStore.getState().user || {};
    const storedEmail = authUser.email || "";

    if (!storedUsername) {
      // Redirect to login if not authenticated
      navigate("/login");
      return;
    }

    setUsername(storedUsername);
    setUserRole(storedRole || "user");
    setUserEmail(storedEmail);
    const isAdminUser = isAdministrator(storedRole, storedUsername);
    setIsSuperAdmin(isAdminUser);

    // Centralized Security Guard for User Role & Page Permissions
    const path = location.pathname;
    const storedPageAccess = localStorage.getItem("page_access") || "";
    const hasCustomPageAccess = storedPageAccess.trim() !== "";
    const allowedPages = hasCustomPageAccess ? getReadablePageIds(storedPageAccess) : [];

    if (!isAdminUser && allowedPages !== "all") {
      const isPortalPage = path === "/checklist/portal" || path === "/checklist";
      const isSettingsPage =
        path.startsWith("/checklist/setting") ||
        path.startsWith("/checklist/global-settings");

      if (!isPortalPage) {
        if (isSettingsPage) {
          const hasAnySettingsPerm = allowedPages.some((p) =>
            [
              "checklist_settings",
              "settings_users",
              "settings_inventory",
              "settings_purchase",
              "settings_o2d",
              "settings_tat",
              "settings_leads",
            ].includes(p),
          );
          if (!hasAnySettingsPerm) {
            navigate("/checklist/portal");
            return;
          }
        } else {
          const pathPageId = getPageIdForPath(path);
          if (pathPageId) {
            if (!checkPagePermission(allowedPages, pathPageId)) {
              navigate("/checklist/portal");
              return;
            }
          }
        }
      }
    }

    // Initial load from localStorage
    const cachedImage = localStorage.getItem("profile_image");
    setProfileImage(cachedImage || "");

    // Check if this is super admin (role or username)
    setIsSuperAdmin(isAdministrator(storedRole, storedUsername));
  }, [navigate, location.pathname]);

  // Sync user profile from DB once on mount (separate from route guard to prevent infinite re-render loop)
  useEffect(() => {
    const storedUsername = localStorage.getItem("user-name");
    if (!storedUsername) return;

    const syncUserProfile = async () => {
      try {
        const { data } = await supabase
          .from("checklist_users")
          .select("profile_image, can_self_assign, department, page_access")
          .eq("user_name", storedUsername)
          .single();

        if (data) {
          if (data.profile_image) {
            setProfileImage(data.profile_image);
            localStorage.setItem("profile_image", data.profile_image);
          } else {
            localStorage.removeItem("profile_image");
          }
          localStorage.removeItem("can_self_assign");
          if (data.department) localStorage.setItem("department", data.department);
          else localStorage.removeItem("department");
          localStorage.removeItem("division");
          setStoredPageAccess(data.page_access || "");
        }
      } catch (err) {
        console.error("❌ Error syncing user profile:", err);
      }
    };

    syncUserProfile();
  }, []); // Run only once on mount

  // Fetch inventory data and transfers globally for the Inventory badge counts
  useEffect(() => {
    dispatch(fetchInventoryData());
    dispatch(fetchTransfers());
  }, [dispatch]);

  // Fetch pending approvals and user task/delegation counts for Checklist sidebar badges
  // (same rules as the PC Dashboard, scoped to the logged-in user's role)
  useEffect(() => {
    let isMounted = true;
    const role = (localStorage.getItem("role") || "user").toLowerCase();
    const username = localStorage.getItem("user-name");

    fetchChecklistPending({ scope: "user", role, username }, { countsOnly: true })
      .then(({ task, delegation, approval }) => {
        if (!isMounted) return;
        if (task !== null) setUserTaskCount(task);
        if (delegation !== null) setUserDelegationCount(delegation);
        if (approval !== null) setPendingApprovalsCount(approval);
      })
      .catch((err) => console.error("Error fetching checklist sidebar badges:", err));

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  // Fetch purchase system sidebar pending badge counts (Stage 2 to Stage 11)
  useEffect(() => {
    let isMounted = true;
    const loadPurchaseBadges = async () => {
      try {
        const counts = await fetchPurchaseSidebarBadgeCounts();
        if (isMounted && counts) {
          setPurchaseBadgeCounts(counts);
        }
      } catch (err) {
        console.error("Error loading purchase sidebar badges:", err);
      }
    };
    loadPurchaseBadges();

    const handlePurchaseUpdate = () => {
      loadPurchaseBadges();
    };
    const handleDirectPaymentCount = (e) => {
      if (typeof e.detail?.paymentCount === "number") {
        setPurchaseBadgeCounts((prev) => {
          if (prev.payment === e.detail.paymentCount) return prev;
          const diff = e.detail.paymentCount - prev.payment;
          return {
            ...prev,
            payment: e.detail.paymentCount,
            total: Math.max(0, prev.total + diff),
          };
        });
      }
    };
    window.addEventListener("purchase-updated", handlePurchaseUpdate);
    window.addEventListener("purchase-payment-count-updated", handleDirectPaymentCount);

    return () => {
      isMounted = false;
      window.removeEventListener("purchase-updated", handlePurchaseUpdate);
      window.removeEventListener("purchase-payment-count-updated", handleDirectPaymentCount);
    };
  }, [location.pathname]);

  // Fetch purchase return system sidebar pending badge counts
  useEffect(() => {
    let isMounted = true;
    const loadPurchaseReturnBadges = async () => {
      try {
        const counts = await fetchPurchaseReturnSidebarBadgeCounts();
        if (isMounted && counts) {
          setPurchaseReturnBadgeCounts(counts);
        }
      } catch (err) {
        console.error("Error loading purchase return sidebar badges:", err);
      }
    };
    loadPurchaseReturnBadges();

    const handleUpdate = () => {
      loadPurchaseReturnBadges();
    };
    window.addEventListener("purchase-return-updated", handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("purchase-return-updated", handleUpdate);
    };
  }, [location.pathname]);

  // Compute Order-to-Delivery (O2D) sidebar pending badge counts
  useEffect(() => {
    const refreshO2DCounts = () => {
      try {
        setO2dBadgeCounts(countsFromItems(computeO2DPending(readO2DStore())));
      } catch (e) {
        console.error("Error computing O2D badge counts:", e);
      }
    };

    refreshO2DCounts();

    const handleStorageChange = () => refreshO2DCounts();
    window.addEventListener(DATA_CHANGED_EVENT, handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [location.pathname]);

  // Compute Leads System sidebar pending badge counts
  useEffect(() => {
    let isMounted = true;
    const loadLeadsBadges = async () => {
      try {
        const storedUsername = localStorage.getItem("user-name") || "Admin";
        const storedRole = (localStorage.getItem("role") || "admin").toLowerCase();
        const stages = await fetchLeadsPending({
          scope: "user",
          username: storedUsername,
          role: storedRole,
        });

        if (isMounted) {
          setLeadsBadgeCounts({
            newLead: 0,
            pendingQuotation: 0,
            contacts: 0,
            ...countsFromItems(stages),
          });
        }
      } catch (err) {
        console.error("Error loading leads sidebar badges:", err);
      }
    };

    loadLeadsBadges();

    const handleLeadsUpdate = () => {
      loadLeadsBadges();
    };

    window.addEventListener("leads-updated", handleLeadsUpdate);
    window.addEventListener("storage", handleLeadsUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("leads-updated", handleLeadsUpdate);
      window.removeEventListener("storage", handleLeadsUpdate);
    };
  }, [location.pathname]);

  // Fetch Docs & Subscriptions sidebar pending badge counts
  useEffect(() => {
    let isMounted = true;
    const loadDocsBadges = async () => {
      try {
        const counts = await fetchDocsSidebarBadgeCounts();
        if (isMounted && counts) {
          setDocsBadgeCounts(counts);
        }
      } catch (err) {
        console.error("Error loading docs sidebar badges:", err);
      }
    };

    loadDocsBadges();

    const handleDocsUpdate = () => {
      loadDocsBadges();
    };

    window.addEventListener(DOCS_DATA_CHANGED_EVENT, handleDocsUpdate);
    window.addEventListener("storage", handleDocsUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener(DOCS_DATA_CHANGED_EVENT, handleDocsUpdate);
      window.removeEventListener("storage", handleDocsUpdate);
    };
  }, [location.pathname]);

  // Set submenu state based on current location, automatically collapsing other tabs
  useEffect(() => {
    const path = location.pathname;
    const isInventoryPath = path.startsWith("/checklist/inventory");
    const isPurchaseReturnPath = path.startsWith("/checklist/purchase-return");
    const isPurchasePath =
      path.startsWith("/checklist/purchase") && !isPurchaseReturnPath;
    const isWhatsappPath = path.startsWith("/checklist/whatsapp");
    const isO2DPath = path.startsWith("/checklist/order-delivery");
    const isLeadsPath = path.startsWith("/checklist/leads");
    const isDocsPath = path.startsWith("/checklist/docs");
    const isQueryPath = path.startsWith("/checklist/query");
    const isChecklistPath =
      path.startsWith("/checklist") &&
      !isInventoryPath &&
      !isPurchasePath &&
      !isPurchaseReturnPath &&
      !isWhatsappPath &&
      !isO2DPath &&
      !isLeadsPath &&
      !isDocsPath &&
      !isQueryPath &&
      path !== "/checklist/global-settings" &&
      path !== "/checklist/portal" &&
      path !== "/checklist/pc" &&
      !path.startsWith("/checklist/pc/");
    const isHolidayPath =
      path === "/checklist/holiday-list" ||
      path === "/checklist/working-day-calendar";

    setIsInventoryDropdownOpen(isInventoryPath);
    setIsPurchaseDropdownOpen(isPurchasePath);
    setIsPurchaseReturnDropdownOpen(isPurchaseReturnPath);
    setIsChecklistDropdownOpen(isChecklistPath);
    setIsWhatsappDropdownOpen(isWhatsappPath);
    setIsO2DDropdownOpen(isO2DPath);
    setIsLeadsDropdownOpen(isLeadsPath);
    setIsDocsDropdownOpen(isDocsPath);
    setIsHolidayDropdownOpen(isHolidayPath);
    setIsQueryDropdownOpen(isQueryPath);
  }, [location.pathname]);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("user-name");
    localStorage.removeItem("role");
    localStorage.removeItem("email_id");
    localStorage.removeItem("phone");
    localStorage.removeItem("can_self_assign");
    localStorage.removeItem("token");
    localStorage.removeItem("profile_image");
    localStorage.removeItem("user");
    localStorage.removeItem("user-id");
    localStorage.removeItem("department");
    localStorage.removeItem("division");
    localStorage.removeItem("user_access");
    localStorage.removeItem("page_access");
    localStorage.removeItem("designation");
    localStorage.removeItem("vpr-systems");
    sessionStorage.clear();
    window.location.href = "/login";
  };

  // Inventory System badges: same rules as the PC Dashboard (Reorder honours the simulated location)
  const inventoryPending = useMemo(
    () =>
      computeInventoryPending({
        materials,
        transactions,
        indents,
        physicalStocks,
        transfers,
        simLoc: localStorage.getItem("sp_simulated_loc") || "",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location.pathname is an intentional trigger to recompute after navigation, since it reads localStorage (sp_simulated_loc) which isn't reactively tracked
    [materials, transactions, indents, physicalStocks, transfers, location.pathname],
  );
  const reorderBadgeCount = inventoryPending.reorder.length;
  const pendingPhysicalStockCount = inventoryPending.physicalStock.length;
  const pendingIndentCount = inventoryPending.indent.length;
  const pendingTransferApprovalCount = inventoryPending.transferApproval.length;

  const inventorySubItems = [
    // {
    //   isHeader: true,
    //   label: "Overview",
    // },
    {
      href: "/checklist/inventory/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active:
        location.pathname === "/checklist/inventory/dashboard" ||
        location.pathname === "/checklist/inventory",
      showFor: ["admin", "user", "HOD", "hod"],
    },
    {
      href: "/checklist/inventory/stock",
      label: "IMS",
      icon: Boxes,
      active: location.pathname === "/checklist/inventory/stock",
      showFor: ["admin", "user", "HOD", "hod"],
    },
    {
      href: "/checklist/inventory/physical-stock",
      label: "Physical Stock",
      icon: ClipboardCheck,
      active: location.pathname === "/checklist/inventory/physical-stock",
      showFor: ["admin", "user", "HOD", "hod"],
      badge: pendingPhysicalStockCount > 0 ? pendingPhysicalStockCount : null,
    },
    // {
    //   isHeader: true,
    //   label: "Operations",
    // },
    // {
    //   href: "/checklist/inventory/master",
    //   label: "Master Data",
    //   icon: Database,
    //   active: location.pathname === "/checklist/inventory/master",
    //   showFor: ["admin", "user", "HOD", "hod"],
    // },
    {
      href: "/checklist/inventory/transactions",
      label: "Stock Transactions",
      icon: History,
      active: location.pathname === "/checklist/inventory/transactions",
      showFor: ["admin", "user", "HOD", "hod"],
    },
    {
      href: "/checklist/inventory/reorder",
      label: "Reorder Management",
      icon: AlertTriangle,
      active: location.pathname === "/checklist/inventory/reorder",
      showFor: ["admin", "user", "HOD", "hod"],
      badge: reorderBadgeCount > 0 ? reorderBadgeCount : null,
    },
    {
      href: "/checklist/inventory/indent",
      label: "Indent Management",
      icon: ClipboardList,
      active: location.pathname === "/checklist/inventory/indent",
      showFor: ["admin", "user", "HOD", "hod"],
      badge: pendingIndentCount > 0 ? pendingIndentCount : null,
    },
    {
      href: "/checklist/inventory/transfer-approval",
      label: "Approve Transfer",
      icon: UserCheck,
      active: location.pathname === "/checklist/inventory/transfer-approval",
      showFor: ["admin", "user", "HOD", "hod"],
      badge: pendingTransferApprovalCount > 0 ? pendingTransferApprovalCount : null,
    },
    {
      href: "/checklist/inventory/video",
      label: "Training Video",
      icon: Video,
      active: location.pathname === "/checklist/inventory/video",
      showFor: ["admin", "user", "HOD", "hod"],
    },
    // {
    //   isHeader: true,
    //   label: "System",
    // },

    // {
    //   href: "/checklist/inventory/settings",
    //   label: "Master",
    //   icon: Settings,
    //   active: location.pathname === "/checklist/inventory/settings",
    //   showFor: ["admin"],
    // },
  ];

  const checklistSubItems = [
    {
      href: "/checklist/admin",
      label: "Dashboard",
      icon: Database,
      active: location.pathname === "/checklist/admin",
      showFor: ["admin", "user", "HOD"],
    },
    {
      href: "/checklist/quick-task",
      label: "Task Management",
      icon: Zap,
      active: location.pathname === "/checklist/quick-task",
      showFor: ["admin"],
    },
    {
      href: "/checklist/assign-task",
      label: "Assign Task",
      icon: CheckSquare,
      active: location.pathname === "/checklist/assign-task",
      showFor: ["admin", "HOD"],
    },
    {
      href: "/checklist/delegation",
      label: "Delegation",
      icon: ClipboardList,
      active: location.pathname === "/checklist/delegation",
      showFor: ["admin", "user", "HOD"],
      badge: userDelegationCount > 0 ? userDelegationCount : null,
    },
    {
      href: "/checklist/task",
      label: "Task",
      icon: CalendarCheck,
      active: location.pathname === "/checklist/task",
      showFor: ["admin", "HOD", "user"],
      badge: userTaskCount > 0 ? userTaskCount : null,
    },
    {
      href: "/checklist/calendar",
      label: "Calendar",
      icon: CalendarIcon,
      active: location.pathname === "/checklist/calendar",
      showFor: ["admin", "user", "HOD"],
    },
    {
      label: "Holiday",
      icon: CalendarIcon,
      isSubGroup: true,
      isOpen: isHolidayDropdownOpen,
      setIsOpen: setIsHolidayDropdownOpen,
      active:
        location.pathname === "/checklist/holiday-list" ||
        location.pathname === "/checklist/working-day-calendar",
      showFor: ["admin"],
      subItems: [
        {
          href: "/checklist/holiday-list",
          label: "Holiday List",
          icon: CalendarIcon,
          active: location.pathname === "/checklist/holiday-list",
          showFor: ["admin"],
        },
        {
          href: "/checklist/working-day-calendar",
          label: "Working Day Calendar",
          icon: CalendarIcon,
          active: location.pathname === "/checklist/working-day-calendar",
          showFor: ["admin"],
        },
      ],
    },
    {
      href: "/checklist/admin-approval",
      label: "Admin Approval",
      icon: BookmarkCheck,
      active: location.pathname === "/checklist/admin-approval",
      showFor: ["admin", "HOD"],
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null,
    },
  ];

  const purchaseSubItems = [
    {
      href: "/checklist/purchase/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      active:
        location.pathname === "/checklist/purchase/dashboard" ||
        location.pathname === "/checklist/purchase",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/purchase/create-indent",
      label: "Create Indent",
      icon: PlusCircle,
      active: location.pathname === "/checklist/purchase/create-indent",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/purchase/delegate-approval",
      label: "Delegate Approvers",
      icon: UserCog,
      active: location.pathname === "/checklist/purchase/delegate-approval",
      showFor: ["admin", "HOD", "administrator"],
      badge:
        purchaseBadgeCounts.delegateApproval > 0
          ? purchaseBadgeCounts.delegateApproval
          : null,
    },
    {
      href: "/checklist/purchase/indent-approval",
      label: "Indent Approval",
      icon: CheckCircle2,
      active: location.pathname === "/checklist/purchase/indent-approval",
      showFor: ["admin", "HOD", "administrator"],
      badge:
        purchaseBadgeCounts.indentApproval > 0
          ? purchaseBadgeCounts.indentApproval
          : null,
    },
    {
      href: "/checklist/purchase/quotation",
      label: "Quotations",
      icon: MessagesSquare,
      active: location.pathname === "/checklist/purchase/quotation",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        purchaseBadgeCounts.quotation > 0
          ? purchaseBadgeCounts.quotation
          : null,
    },
    {
      href: "/checklist/purchase/approved-vendor",
      label: "Approved Vendor",
      icon: ShieldCheck,
      active: location.pathname === "/checklist/purchase/approved-vendor",
      showFor: ["admin", "HOD", "administrator"],
      badge:
        purchaseBadgeCounts.approvedVendor > 0
          ? purchaseBadgeCounts.approvedVendor
          : null,
    },
    {
      href: "/checklist/purchase/po-entry",
      label: "Make PO",
      icon: FileEdit,
      active: location.pathname === "/checklist/purchase/po-entry",
      showFor: ["admin", "HOD", "administrator"],
      badge:
        purchaseBadgeCounts.poEntry > 0 ? purchaseBadgeCounts.poEntry : null,
    },
    {
      href: "/checklist/purchase/payment",
      label: "Payment",
      icon: CreditCard,
      active: location.pathname === "/checklist/purchase/payment",
      showFor: ["admin", "HOD", "administrator", "user"],
      badge:
        purchaseBadgeCounts.payment > 0 ? purchaseBadgeCounts.payment : null,
    },
    {
      href: "/checklist/purchase/follow-up-vendor",
      label: "Follow-up / Lifting",
      icon: Phone,
      active: location.pathname === "/checklist/purchase/follow-up-vendor",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        purchaseBadgeCounts.followUpVendor > 0
          ? purchaseBadgeCounts.followUpVendor
          : null,
    },
    {
      href: "/checklist/purchase/transporter-follow-up",
      label: "Transporter Follow-Up",
      icon: Truck,
      active: location.pathname === "/checklist/purchase/transporter-follow-up",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        purchaseBadgeCounts.transporterFollowUp > 0
          ? purchaseBadgeCounts.transporterFollowUp
          : null,
    },
    {
      href: "/checklist/purchase/material-received",
      label: "Material Received (GRN)",
      icon: Package,
      active: location.pathname === "/checklist/purchase/material-received",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        purchaseBadgeCounts.materialReceived > 0
          ? purchaseBadgeCounts.materialReceived
          : null,
    },
    {
      href: "/checklist/purchase/receipt-in-tally",
      label: "Tally Billing",
      icon: FileText,
      active: location.pathname === "/checklist/purchase/receipt-in-tally",
      showFor: ["admin", "HOD", "administrator", "user"],
      badge:
        purchaseBadgeCounts.tallyBilling > 0
          ? purchaseBadgeCounts.tallyBilling
          : null,
    },
    {
      href: "/checklist/purchase/order-cancel",
      label: "Order Cancel",
      icon: X,
      active: location.pathname === "/checklist/purchase/order-cancel",
      showFor: ["admin", "HOD", "administrator"],
    },
    {
      href: "/checklist/purchase/video",
      label: "Training Video",
      icon: Video,
      active: location.pathname === "/checklist/purchase/video",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
  ];

  const whatsappSubItems = [
    {
      href: "/checklist/whatsapp/inbox",
      label: "Chat Inbox",
      icon: MessageCircle,
      active:
        location.pathname === "/checklist/whatsapp/inbox" ||
        location.pathname === "/checklist/whatsapp",
      showFor: ["admin", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/whatsapp/scheduler",
      label: "Broadcast Scheduler",
      icon: CalendarIcon,
      active: location.pathname === "/checklist/whatsapp/scheduler",
      showFor: ["admin", "HOD", "hod", "administrator"],
    },
  ];

  const querySubItems = [
    {
      href: "/checklist/query/new",
      label: "Raise Query",
      icon: PlusCircle,
      active:
        location.pathname === "/checklist/query/new" ||
        location.pathname === "/checklist/query",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/query/tracker",
      label: "Query Tracker",
      icon: ListFilter,
      active: location.pathname === "/checklist/query/tracker",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
  ];

  const leadsSubItems = [
    {
      href: "/checklist/leads",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: location.pathname === "/checklist/leads",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/leads/new-lead",
      label: "New Lead",
      icon: UserPlus,
      active:
        location.pathname === "/checklist/leads/new-lead" ||
        location.pathname === "/checklist/leads/entry",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: leadsBadgeCounts.newLead > 0 ? leadsBadgeCounts.newLead : null,
    },
    {
      href: "/checklist/leads/followup-tracker",
      label: "Followup Tracker",
      icon: PhoneCall,
      active:
        location.pathname.startsWith("/checklist/leads/followup-tracker") ||
        location.pathname.startsWith("/checklist/leads/follow-up"),
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        leadsBadgeCounts.followupTracker > 0
          ? leadsBadgeCounts.followupTracker
          : null,
    },
    {
      href: "/checklist/leads/pending-quotation",
      label: "Create Quotation",
      icon: FileText,
      active:
        location.pathname === "/checklist/leads/pending-quotation" ||
        location.pathname === "/checklist/leads/quotation",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: null,
    },
    {
      href: "/checklist/leads/quotation-tracker",
      label: "Quotation Tracker",
      icon: Wallet,
      active:
        location.pathname === "/checklist/leads/quotation-tracker" ||
        location.pathname === "/checklist/leads/advance-payment",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        leadsBadgeCounts.quotationTracker > 0
          ? leadsBadgeCounts.quotationTracker
          : null,
    },
    {
      href: "/checklist/leads/contacts",
      label: "Contacts",
      icon: Contact,
      active: location.pathname === "/checklist/leads/contacts",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: leadsBadgeCounts.contacts > 0 ? leadsBadgeCounts.contacts : null,
    },
    {
      href: "/checklist/leads/calendar",
      label: "Calendar",
      icon: CalendarIcon,
      active: location.pathname === "/checklist/leads/calendar",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
  ];

  const o2dSubItems = [
    {
      href: "/checklist/order-delivery/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      active:
        location.pathname === "/checklist/order-delivery/dashboard" ||
        location.pathname === "/checklist/order-delivery",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/order-delivery/purchase-order",
      label: "Received Order",
      icon: ShoppingBag,
      active:
        location.pathname === "/checklist/order-delivery/purchase-order" ||
        location.pathname === "/checklist/order-delivery/received-order",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        o2dBadgeCounts.receivedOrder > 0
          ? o2dBadgeCounts.receivedOrder
          : null,
    },
    {
      href: "/checklist/order-delivery/check-and-validation",
      label: "Check & Validation",
      icon: CheckSquare,
      active: location.pathname === "/checklist/order-delivery/check-and-validation",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.checkAndValidation > 0 ? o2dBadgeCounts.checkAndValidation : null,
    },
    {
      href: "/checklist/order-delivery/check-for-delivery",
      label: "Stock Verification",
      icon: Warehouse,
      active: location.pathname === "/checklist/order-delivery/check-for-delivery",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.checkForDelivery > 0 ? o2dBadgeCounts.checkForDelivery : null,
    },
    {
      href: "/checklist/order-delivery/production-planning",
      label: "Production Planning",
      icon: Boxes,
      active: location.pathname === "/checklist/order-delivery/production-planning",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge:
        o2dBadgeCounts.productionPlanning > 0
          ? o2dBadgeCounts.productionPlanning
          : null,
    },
    {
      href: "/checklist/order-delivery/dispatch-planning",
      label: "Dispatch Planning",
      icon: CalendarCheck,
      active: location.pathname === "/checklist/order-delivery/dispatch-planning",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.dispatchPlanning > 0 ? o2dBadgeCounts.dispatchPlanning : null,
    },
    {
      href: "/checklist/order-delivery/packaging",
      label: "Packaging",
      icon: PackageCheck,
      active: location.pathname === "/checklist/order-delivery/packaging",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.packaging > 0 ? o2dBadgeCounts.packaging : null,
    },
    {
      href: "/checklist/order-delivery/vehicle-logistic",
      label: "Vehicle Logistic",
      icon: Truck,
      active: location.pathname === "/checklist/order-delivery/vehicle-logistic",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.vehicleLogistic > 0 ? o2dBadgeCounts.vehicleLogistic : null,
    },
    {
      href: "/checklist/order-delivery/make-callan",
      label: "Make Challan",
      icon: Receipt,
      active: location.pathname === "/checklist/order-delivery/make-callan",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.makeCallan > 0 ? o2dBadgeCounts.makeCallan : null,
    },
    {
      href: "/checklist/order-delivery/make-invoice",
      label: "Make Invoice",
      icon: FileText,
      active: location.pathname === "/checklist/order-delivery/make-invoice",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.makeInvoice > 0 ? o2dBadgeCounts.makeInvoice : null,
    },
    {
      href: "/checklist/order-delivery/confirm-delivery",
      label: "Confirm Delivery",
      icon: UserCheck,
      active: location.pathname === "/checklist/order-delivery/confirm-delivery",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.confirmDelivery > 0 ? o2dBadgeCounts.confirmDelivery : null,
    },
    {
      href: "/checklist/order-delivery/payment",
      label: "Payments",
      icon: Coins,
      active: location.pathname === "/checklist/order-delivery/payment",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: o2dBadgeCounts.payment > 0 ? o2dBadgeCounts.payment : null,
    },
    {
      href: "/checklist/order-delivery/training-video",
      label: "Training Video",
      icon: Video,
      active:
        location.pathname === "/checklist/order-delivery/training-video" ||
        location.pathname === "/checklist/order-delivery/video",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
  ];

  const docsSubItems = [
    { isHeader: true, label: "📄 Documents" },
    {
      href: "/checklist/docs/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: location.pathname === "/checklist/docs/dashboard",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/docs/resources",
      label: "Resource Manager",
      icon: Files,
      active: location.pathname === "/checklist/docs/resources",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/docs/all",
      label: "All Documents",
      icon: FileText,
      active: location.pathname === "/checklist/docs/all",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/docs/renewal",
      label: "Document Renewal",
      icon: RotateCcw,
      active: location.pathname === "/checklist/docs/renewal",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.documentRenewal > 0 ? docsBadgeCounts.documentRenewal : null,
    },
    {
      href: "/checklist/docs/shared",
      label: "Shared Documents",
      icon: Mail,
      active: location.pathname === "/checklist/docs/shared",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    { isHeader: true, label: "🔄 Subscriptions" },
    {
      href: "/checklist/docs/subscription/all",
      label: "All Subscriptions",
      icon: CreditCard,
      active: location.pathname === "/checklist/docs/subscription/all",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/docs/subscription/approval",
      label: "Approval",
      icon: CheckCircle2,
      active: location.pathname === "/checklist/docs/subscription/approval",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.subscriptionApproval > 0 ? docsBadgeCounts.subscriptionApproval : null,
    },
    {
      href: "/checklist/docs/subscription/payment",
      label: "Payment",
      icon: Wallet,
      active: location.pathname === "/checklist/docs/subscription/payment",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.subscriptionPayment > 0 ? docsBadgeCounts.subscriptionPayment : null,
    },
    {
      href: "/checklist/docs/subscription/renewal",
      label: "Renewal",
      icon: RotateCcw,
      active: location.pathname === "/checklist/docs/subscription/renewal",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.subscriptionRenewal > 0 ? docsBadgeCounts.subscriptionRenewal : null,
    },
    { isHeader: true, label: "🏦 Loans" },
    {
      href: "/checklist/docs/loan/all",
      label: "All Loans",
      icon: Coins,
      active: location.pathname === "/checklist/docs/loan/all",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/docs/loan/foreclosure",
      label: "Foreclosure",
      icon: AlertTriangle,
      active: location.pathname === "/checklist/docs/loan/foreclosure",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.loanForeclosure > 0 ? docsBadgeCounts.loanForeclosure : null,
    },
    {
      href: "/checklist/docs/loan/noc",
      label: "NOC",
      icon: ShieldCheck,
      active: location.pathname === "/checklist/docs/loan/noc",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
      badge: docsBadgeCounts.loanNoc > 0 ? docsBadgeCounts.loanNoc : null,
    },
  ];

  // Update the routes array to group modules
  const routes = [
    {
      href: "/checklist/portal",
      label: "Portal Dashboard",
      icon: LayoutDashboard,
      active: location.pathname === "/checklist/portal",
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/pc",
      label: "PC Dashboard",
      icon: ListChecks,
      active:
        location.pathname === "/checklist/pc" ||
        location.pathname.startsWith("/checklist/pc/"),
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      label: "Checklist & Delegation",
      icon: ClipboardList,
      isSubmenu: true,
      isOpen: isChecklistDropdownOpen,
      setIsOpen: setIsChecklistDropdownOpen,
      active: checklistSubItems.some((sub) => sub.active),
      badge:
        pendingApprovalsCount +
          userDelegationCount +
          userTaskCount || null,
      subItems: checklistSubItems,
    },
    {
      label: "Inventory System",
      icon: Boxes,
      isSubmenu: true,
      isOpen: isInventoryDropdownOpen,
      setIsOpen: setIsInventoryDropdownOpen,
      active: inventorySubItems.some((sub) => sub.active),
      badge:
        reorderBadgeCount +
          pendingPhysicalStockCount +
          pendingIndentCount +
          pendingTransferApprovalCount || null,
      subItems: inventorySubItems,
    },
    {
      label: "Purchase System",
      icon: ShoppingBag,
      isSubmenu: true,
      isOpen: isPurchaseDropdownOpen,
      setIsOpen: setIsPurchaseDropdownOpen,
      active: purchaseSubItems.some((sub) => sub.active),
      badge: purchaseBadgeCounts.total > 0 ? purchaseBadgeCounts.total : null,
      subItems: purchaseSubItems,
      // Only visible to administrators, or users with at least one purchase_* page permission
      requiresPurchaseAccess: true,
    },
    {
      label: "Purchase Return",
      icon: RotateCcw,
      isSubmenu: true,
      isOpen: isPurchaseReturnDropdownOpen,
      setIsOpen: setIsPurchaseReturnDropdownOpen,
      active:
        location.pathname.startsWith("/checklist/purchase-return"),
      badge:
        purchaseReturnBadgeCounts.total > 0
          ? purchaseReturnBadgeCounts.total
          : null,
      subItems: [
        {
          href: "/checklist/purchase-return/dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
          active:
            location.pathname === "/checklist/purchase-return/dashboard" ||
            location.pathname === "/checklist/purchase-return",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
        },
        {
          href: "/checklist/purchase-return/approval",
          label: "Return Approval",
          icon: CheckCircle2,
          active: location.pathname === "/checklist/purchase-return/approval",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
          badge:
            purchaseReturnBadgeCounts.approval > 0
              ? purchaseReturnBadgeCounts.approval
              : null,
        },
        {
          href: "/checklist/purchase-return/credit",
          label: "Ask Credit Note",
          icon: FileText,
          active: location.pathname === "/checklist/purchase-return/credit",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
          badge:
            purchaseReturnBadgeCounts.credit > 0
              ? purchaseReturnBadgeCounts.credit
              : null,
        },
        {
          href: "/checklist/purchase-return/logistics",
          label: "Arrange Logistics",
          icon: Truck,
          active: location.pathname === "/checklist/purchase-return/logistics",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
          badge:
            purchaseReturnBadgeCounts.logistics > 0
              ? purchaseReturnBadgeCounts.logistics
              : null,
        },
        {
          href: "/checklist/purchase-return/debit-note",
          label: "Issue Debit Note",
          icon: CreditCard,
          active: location.pathname === "/checklist/purchase-return/debit-note",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
          badge:
            purchaseReturnBadgeCounts.debitNote > 0
              ? purchaseReturnBadgeCounts.debitNote
              : null,
        },
        {
          href: "/checklist/purchase-return/plant-return",
          label: "Return From Plant",
          icon: Package,
          active: location.pathname === "/checklist/purchase-return/plant-return",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
          badge:
            purchaseReturnBadgeCounts.plantReturn > 0
              ? purchaseReturnBadgeCounts.plantReturn
              : null,
        },
        {
          href: "/checklist/purchase-return/video",
          label: "Training Video",
          icon: Video,
          active:
            location.pathname === "/checklist/purchase-return/video" ||
            location.pathname === "/checklist/purchase-return/training-video",
          showFor: ["admin", "user", "HOD", "hod", "administrator"],
        },
      ],
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      label: "Leads System",
      icon: TrendingUp,
      isSubmenu: true,
      isOpen: isLeadsDropdownOpen,
      setIsOpen: setIsLeadsDropdownOpen,
      active: leadsSubItems.some((sub) => sub.active),
      badge: leadsBadgeCounts.total > 0 ? leadsBadgeCounts.total : null,
      subItems: leadsSubItems,
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      label: "Order Management",
      icon: ShoppingCart,
      isSubmenu: true,
      isOpen: isO2DDropdownOpen,
      setIsOpen: setIsO2DDropdownOpen,
      active: o2dSubItems.some((sub) => sub.active),
      badge: o2dBadgeCounts.total > 0 ? o2dBadgeCounts.total : null,
      subItems: o2dSubItems,
      requiresO2DAccess: true,
    },
    {
      label: "Docs & Subscriptions",
      icon: Files,
      isSubmenu: true,
      isOpen: isDocsDropdownOpen,
      setIsOpen: setIsDocsDropdownOpen,
      active: docsSubItems.some((sub) => sub.active),
      badge: docsBadgeCounts.total > 0 ? docsBadgeCounts.total : null,
      subItems: docsSubItems,
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      label: "WhatsApp System",
      icon: MessageCircle,
      isSubmenu: true,
      isOpen: isWhatsappDropdownOpen,
      setIsOpen: setIsWhatsappDropdownOpen,
      active: whatsappSubItems.some((sub) => sub.active),
      subItems: whatsappSubItems,
      requiresWhatsappAccess: true,
    },
    {
      label: "Query System",
      icon: HelpCircle,
      isSubmenu: true,
      isOpen: isQueryDropdownOpen,
      setIsOpen: setIsQueryDropdownOpen,
      active: querySubItems.some((sub) => sub.active),
      subItems: querySubItems,
      showFor: ["admin", "user", "HOD", "hod", "administrator"],
    },
    {
      href: "/checklist/global-settings",
      label: "Global Settings",
      icon: Settings,
      active:
        location.pathname === "/checklist/global-settings" ||
        location.pathname === "/checklist/setting",
      showFor: ["admin", "HOD", "hod", "administrator"],
    },
  ];

  // Filter routes based on user role and super admin status
  const getAccessibleRoutes = () => {
    const userRole = localStorage.getItem("role") || "user";
    const username = localStorage.getItem("user-name");
    const isAdminUser = isAdministrator(userRole, username);

    const storedPageAccess = localStorage.getItem("page_access") || "";
    const hasCustomPageAccess = storedPageAccess.trim() !== "";
    const allowedPages = hasCustomPageAccess ? getReadablePageIds(storedPageAccess) : [];

    if (isAdminUser || allowedPages === "all") {
      return routes;
    }

    return routes
      .map((route) => {
        // If route has subItems (e.g. System submenus like Checklist, Inventory, Purchase, etc.)
        if (route.subItems) {
          const filteredSubItems = route.subItems
            .map((sub) => {
              if (sub.isHeader) return sub;

              if (sub.isSubGroup && sub.subItems) {
                const filteredNested = sub.subItems.filter((nested) => {
                  const nestedPageId = ROUTE_TO_PAGE_ID[nested.href];
                  return nestedPageId && checkPagePermission(allowedPages, nestedPageId);
                });
                if (filteredNested.length === 0) return null;
                return { ...sub, subItems: filteredNested };
              }

              if (
                sub.href === "/checklist/setting" ||
                sub.href === "/checklist/global-settings"
              ) {
                const hasAnySettingsPerm = allowedPages.some((p) =>
                  [
                    "checklist_settings",
                    "settings_users",
                    "settings_inventory",
                    "settings_purchase",
                    "settings_o2d",
                    "settings_tat",
                    "settings_leads",
                  ].includes(p),
                );
                return hasAnySettingsPerm ? sub : null;
              }

              const pageId = ROUTE_TO_PAGE_ID[sub.href];
              if (pageId && checkPagePermission(allowedPages, pageId)) {
                return sub;
              }

              return null;
            })
            .filter(Boolean);

          // Clean up empty section headers (headers with no items before next header or end)
          const cleanSubItems = [];
          for (let i = 0; i < filteredSubItems.length; i++) {
            const current = filteredSubItems[i];
            if (current.isHeader) {
              let hasItemUnderHeader = false;
              for (let j = i + 1; j < filteredSubItems.length; j++) {
                if (filteredSubItems[j].isHeader) break;
                hasItemUnderHeader = true;
                break;
              }
              if (hasItemUnderHeader) {
                cleanSubItems.push(current);
              }
            } else {
              cleanSubItems.push(current);
            }
          }

          // If no actionable subItems remain (or only headers), hide the whole system menu
          const nonHeaderCount = cleanSubItems.filter((s) => !s.isHeader).length;
          if (nonHeaderCount === 0) {
            return null;
          }

          // For Docs & Subscriptions, calculate badge based on allowed pages only
          let routeBadge = route.badge;
          if (route.label === "Docs & Subscriptions") {
            const permittedDocsTotal = [
              allowedPages.includes("docs_renewal") ? (docsBadgeCounts.documentRenewal || 0) : 0,
              allowedPages.includes("docs_sub_approval") ? (docsBadgeCounts.subscriptionApproval || 0) : 0,
              allowedPages.includes("docs_sub_payment") ? (docsBadgeCounts.subscriptionPayment || 0) : 0,
              allowedPages.includes("docs_sub_renewal") ? (docsBadgeCounts.subscriptionRenewal || 0) : 0,
              allowedPages.includes("docs_loan_foreclosure") ? (docsBadgeCounts.loanForeclosure || 0) : 0,
              allowedPages.includes("docs_loan_noc") ? (docsBadgeCounts.loanNoc || 0) : 0,
            ].reduce((a, b) => a + b, 0);
            routeBadge = permittedDocsTotal > 0 ? permittedDocsTotal : null;
          }

          return {
            ...route,
            badge: routeBadge,
            subItems: cleanSubItems,
          };
        }

        // Single Top-Level Routes
        if (route.href === "/checklist/portal") {
          return route;
        }

        if (
          route.href === "/checklist/global-settings" ||
          route.href === "/checklist/setting"
        ) {
          const hasAnySettingsPerm = allowedPages.some((p) =>
            [
              "checklist_settings",
              "settings_users",
              "settings_inventory",
              "settings_purchase",
              "settings_o2d",
              "settings_tat",
              "settings_leads",
            ].includes(p),
          );
          return hasAnySettingsPerm ? route : null;
        }

        const pageId = ROUTE_TO_PAGE_ID[route.href];
        if (pageId && allowedPages.includes(pageId)) {
          return route;
        }

        return null;
      })
      .filter(Boolean);
  };

  // Submenu logic removed

  // Get accessible routes
  const accessibleRoutes = getAccessibleRoutes();

  if (!showLayout) {
    return (
      <ReadOnlyGuard active={isReadOnlyPage} showBanner={showGuardBanner}>
        {children}
      </ReadOnlyGuard>
    );
  }

  return (
    <div
      className={`theme-transition flex h-screen overflow-hidden bg-gradient-to-br from-blue-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950`}
    >
      {/* Sidebar for desktop */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-blue-200 dark:border-slate-800 bg-white dark:bg-slate-950 md:flex md:flex-col transition-colors duration-300">
        <div className="flex h-14 flex-shrink-0 items-center border-b border-blue-200 dark:border-slate-800 px-4 bg-gradient-to-r from-blue-100 to-blue-100 dark:from-slate-900 dark:to-slate-900">
          <Link
            to="/checklist/portal"
            className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400"
          >
            <img
              src={aceLogo}
              alt="TaskDesk Logo"
              className="h-8 w-8 rounded-full object-cover border border-blue-200 dark:border-slate-800"
            />
            <span>Master System</span>
          </Link>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-2">
          <ul className="space-y-1">
            {accessibleRoutes.map((route) => (
              <li key={route.label}>
                {route.isSubmenu ? (
                  <div className="flex flex-col">
                    <button
                      onClick={() => route.setIsOpen(!route.isOpen)}
                      className={`flex items-center justify-between w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        route.active
                          ? "bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 dark:from-slate-900 dark:to-slate-950 dark:text-blue-400"
                          : "text-gray-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <route.icon
                          className={`h-4 w-4 ${route.active ? "text-blue-600 dark:text-blue-400" : "text-gray-405 dark:text-slate-500"}`}
                        />
                        <div className="flex items-center justify-between w-full">
                          <span>{route.label}</span>
                          {route.badge && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                              {route.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      {route.isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {route.isOpen && (
                      <ul className="mt-1 ml-4 space-y-1 border-l border-blue-100 dark:border-slate-800 pl-2.5">
                        {route.subItems.map((sub, index) => (
                          <li key={sub.label || `header-${index}`}>
                            {sub.isHeader ? (
                              <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400/80 dark:text-slate-500/80 px-3 py-1 mt-2.5 select-none">
                                {sub.label}
                              </div>
                            ) : sub.isSubGroup ? (
                              <div className="flex flex-col">
                                <button
                                  onClick={() => sub.setIsOpen(!sub.isOpen)}
                                  className={`flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    sub.active
                                      ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                      : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    {sub.icon && (
                                      <sub.icon
                                        className={`h-3.5 w-3.5 ${sub.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                      />
                                    )}
                                    <span className="flex-1 truncate">
                                      {sub.label}
                                    </span>
                                  </div>
                                  {sub.isOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                {sub.isOpen && (
                                  <ul className="mt-1 ml-3 space-y-1 border-l border-blue-100 dark:border-slate-800 pl-2">
                                    {sub.subItems.map((nested) => (
                                        <li key={nested.label}>
                                          <Link
                                            to={nested.href}
                                            className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                              nested.active
                                                ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                                : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                            }`}
                                          >
                                            {nested.icon && (
                                              <nested.icon
                                                className={`h-3.5 w-3.5 ${nested.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                              />
                                            )}
                                            <span className="flex-1 truncate">
                                              {nested.label}
                                            </span>
                                          </Link>
                                        </li>
                                      ))}
                                  </ul>
                                )}
                              </div>
                            ) : (
                              <Link
                                to={sub.href}
                                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                  sub.active
                                    ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                    : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                }`}
                              >
                                {sub.icon && (
                                  <sub.icon
                                    className={`h-3.5 w-3.5 ${sub.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                  />
                                )}
                                <span className="flex-1 truncate">
                                  {sub.label}
                                </span>
                                {sub.badge && (
                                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                    {sub.badge}
                                  </span>
                                )}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Link
                    to={route.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      route.active
                        ? "bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 dark:from-slate-900 dark:to-slate-950 dark:text-blue-400"
                        : "text-gray-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-900"
                    }`}
                  >
                    <route.icon
                      className={`h-4 w-4 ${route.active ? "text-blue-600 dark:text-blue-400" : "text-gray-405 dark:text-slate-500"}`}
                    />
                    <div className="flex items-center justify-between w-full">
                      <span>{route.label}</span>
                      {route.badge && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {route.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-shrink-0 border-t border-blue-200 dark:border-slate-800 p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-slate-950 dark:to-slate-950">
          <div className="flex flex-col">
            {/* User info section */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full gradient-bg flex items-center justify-center overflow-hidden border border-blue-100 dark:border-slate-800">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt={username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-black dark:text-slate-300">
                      {username ? username.charAt(0).toUpperCase() : "U"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate">
                    {username || "User"}{" "}
                    {userRole.toLowerCase() === "admin"
                      ? isSuperAdmin
                        ? "(Super Admin)"
                        : "(Admin)"
                      : userRole.toLowerCase() === "hod"
                        ? "(HOD)"
                        : ""}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-550 truncate">
                    {userEmail || "user@example.com"}
                  </p>
                </div>
              </div>

              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 p-1.5 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                title="Toggle theme"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-blue-700" />
                )}
                <span className="sr-only">Toggle Theme</span>
              </button>
            </div>

            {/* Logout button positioned below user info */}
            <div className="mt-2 flex justify-center">
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-slate-900 text-sm"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
      {/* Mobile menu button and sidebar - similar structure as desktop but with mobile classes */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden absolute left-4 top-3 z-[110] text-blue-700 dark:text-blue-400 p-2 rounded-md hover:bg-blue-100 dark:hover:bg-slate-900"
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </button>
      {/* Mobile sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div
            className="fixed inset-0 bg-black/20 dark:bg-black/50"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          <div className="fixed inset-y-0 left-0 z-[100] w-64 flex flex-col h-full max-h-screen bg-white dark:bg-slate-950 shadow-lg dark:border-r dark:border-slate-800 overflow-hidden">
            <div className="flex h-14 flex-shrink-0 items-center border-b border-blue-200 dark:border-slate-800 px-4 bg-gradient-to-r from-blue-100 to-blue-100 dark:from-slate-900 dark:to-slate-900">
              <Link
                to="/checklist/portal"
                className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <img
                  src={aceLogo}
                  alt="TaskDesk Logo"
                  className="h-8 w-8 rounded-full object-cover border border-blue-200 dark:border-slate-800"
                />
                <span>Master System</span>
              </Link>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto p-2 bg-white dark:bg-slate-950 overscroll-contain">
              <ul className="space-y-1">
                {accessibleRoutes.map((route) => (
                  <li key={route.label}>
                    {route.isSubmenu ? (
                      <div className="flex flex-col">
                        <button
                          onClick={() => route.setIsOpen(!route.isOpen)}
                          className={`flex items-center justify-between w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            route.active
                              ? "bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 dark:from-slate-900 dark:to-slate-950 dark:text-blue-400"
                              : "text-gray-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                              <route.icon
                                className={`h-4 w-4 ${route.active ? "text-blue-600 dark:text-blue-400" : "text-gray-405 dark:text-slate-500"}`}
                              />
                              <span>{route.label}</span>
                            </div>
                            {route.badge && (
                              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center mr-2">
                                {route.badge}
                              </span>
                            )}
                          </div>
                          {route.isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        {route.isOpen && (
                          <ul className="mt-1 ml-4 space-y-1 border-l border-blue-100 dark:border-slate-800 pl-2.5">
                            {route.subItems.map((sub, index) => (
                              <li key={sub.label || `header-${index}`}>
                                {sub.isHeader ? (
                                  <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400/80 dark:text-slate-500/80 px-3 py-1 mt-2.5 select-none">
                                    {sub.label}
                                  </div>
                                ) : sub.isSubGroup ? (
                                  <div className="flex flex-col">
                                    <button
                                      onClick={() => sub.setIsOpen(!sub.isOpen)}
                                      className={`flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                        sub.active
                                          ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                          : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                      }`}
                                    >
                                      <div className="flex items-center gap-3">
                                        {sub.icon && (
                                          <sub.icon
                                            className={`h-3.5 w-3.5 ${sub.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                          />
                                        )}
                                        <span className="flex-1 truncate">
                                          {sub.label}
                                        </span>
                                      </div>
                                      {sub.isOpen ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    {sub.isOpen && (
                                      <ul className="mt-1 ml-3 space-y-1 border-l border-blue-100 dark:border-slate-800 pl-2">
                                        {sub.subItems.map((nested) => (
                                            <li key={nested.label}>
                                              <Link
                                                to={nested.href}
                                                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                                  nested.active
                                                    ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                                    : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                                }`}
                                                onClick={() =>
                                                  setIsMobileMenuOpen(false)
                                                }
                                              >
                                                {nested.icon && (
                                                  <nested.icon
                                                    className={`h-3.5 w-3.5 ${nested.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                                  />
                                                )}
                                                <span className="flex-1 truncate">
                                                  {nested.label}
                                                </span>
                                              </Link>
                                            </li>
                                          ))}
                                      </ul>
                                    )}
                                  </div>
                                ) : (
                                  <Link
                                    to={sub.href}
                                    className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                      sub.active
                                        ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-900 font-semibold"
                                        : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900"
                                    }`}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                  >
                                    {sub.icon && (
                                      <sub.icon
                                        className={`h-3.5 w-3.5 ${sub.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                                      />
                                    )}
                                    <span className="flex-1 truncate">
                                      {sub.label}
                                    </span>
                                    {sub.badge && (
                                      <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                        {sub.badge}
                                      </span>
                                    )}
                                  </Link>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <Link
                        to={route.href}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          route.active
                            ? "bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 dark:from-slate-900 dark:to-slate-950 dark:text-blue-400"
                            : "text-gray-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-900"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <route.icon
                          className={`h-4 w-4 ${route.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                        />
                        <div className="flex items-center justify-between w-full">
                          <span>{route.label}</span>
                          {route.badge && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                              {route.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex-shrink-0 border-t border-blue-200 dark:border-slate-800 p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-slate-950 dark:to-slate-950">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full gradient-bg flex items-center justify-center overflow-hidden border border-blue-100">
                    {profileImage ? (
                      <img
                        src={profileImage}
                        alt={username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-black">
                        {username ? username.charAt(0).toUpperCase() : "U"}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      {username || "User"}{" "}
                      {userRole === "admin"
                        ? isSuperAdmin
                          ? "(Super Admin)"
                          : "(Admin)"
                        : userRole === "HOD"
                          ? "(HOD)"
                          : ""}
                    </p>
                    <p className="text-xs text-blue-600">
                      {userEmail || "user@example.com"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleTheme}
                    className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 p-1.5 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors cursor-pointer"
                    title="Toggle theme"
                  >
                    {isDark ? (
                      <Sun className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                    <span className="sr-only">Toggle Theme</span>
                  </button>
                </div>
              </div>
              <div className="mt-2 flex justify-center">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-slate-900 text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}{" "}
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden dark:bg-slate-950 transition-colors duration-300">
        <header className="flex h-16 items-center justify-between border-b border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 md:px-6 shadow-sm z-30 transition-colors duration-300">
          <div className="flex md:hidden w-8"></div>
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-700 to-blue-700 bg-clip-text text-transparent dark:from-blue-400 dark:to-blue-400">
              Master System
            </h1>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-[0.2em] -mt-1 hidden xs:block">
              Master System
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme Toggle Button in Header */}
            <button
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 hover:bg-gray-100/80 transition-all shadow-sm cursor-pointer mr-1"
              title="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-4.5 w-4.5 text-amber-500" />
              ) : (
                <Moon className="h-4.5 w-4.5 text-indigo-600" />
              )}
            </button>

            <div className="hidden sm:flex flex-col items-end mr-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Welcome
              </span>
              <span className="text-sm font-black text-blue-700 dark:text-blue-400 -mt-1">
                Hello, {username || "User"}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-50 to-blue-600 flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-blue-100/50 dark:ring-blue-950/50 overflow-hidden">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={username}
                  className="h-full w-full object-cover"
                  onError={() => {
                    console.error(
                      "❌ AdminLayout Image Failed to Load:",
                      profileImage,
                    );
                    setProfileImage(""); // Fallback to initials
                  }}
                />
              ) : (
                <span className="text-white text-sm font-black uppercase">
                  {username ? username.charAt(0) : "U"}
                </span>
              )}
            </div>
          </div>
        </header>

        <main
          className={`flex-1 transition-colors duration-300 ${
            location.pathname.startsWith("/checklist/whatsapp")
              ? "p-0 overflow-hidden bg-white dark:bg-slate-950"
              : "overflow-y-auto overflow-x-hidden px-4 pb-4 md:px-6 md:pb-6 bg-gradient-to-br from-blue-50/50 to-blue-50/50 dark:from-slate-950 dark:to-slate-900 pb-24 md:pb-6"
          }`}
        >
          <ReadOnlyGuard active={isReadOnlyPage} showBanner={showGuardBanner}>
            {children}
          </ReadOnlyGuard>
        </main>

        <div className="bg-gradient-to-r from-blue-600 to-blue-600 h-5 flex items-center justify-center px-4 shadow-md z-40">
          <a
            href="https://www.botivate.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-white/90 font-medium tracking-[0.2em] uppercase hover:underline hover:text-white transition-colors"
          >
            Powered by <span className="font-bold">Botivate</span>
          </a>
        </div>

        {/* Premium Bottom Navigation for Mobile */}
        {/* 
        <div className="md:hidden fixed bottom-6 left-4 right-4 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/20 dark:border-slate-800 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 flex items-center justify-around px-2 transition-colors duration-300">
          <Link
            to="/checklist/portal"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${location.pathname === "/checklist/portal"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              : "text-gray-400 dark:text-slate-500 hover:text-blue-400 dark:hover:text-blue-300"
              }`}
          >
            <Home size={22} strokeWidth={location.pathname === "/checklist/portal" ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-bold">Home</span>
          </Link>



          <Link
            to="/checklist/task"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${location.pathname === "/checklist/task"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              : "text-gray-400 dark:text-slate-500 hover:text-blue-400 dark:hover:text-blue-300"
              }`}
          >
            <CalendarCheck size={22} strokeWidth={location.pathname === "/checklist/task" ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-bold">Tasks</span>
          </Link>

          {(userRole?.toUpperCase() === "ADMIN" || userRole?.toUpperCase() === "HOD") && (
            <div className="relative -mt-12">
              <Link
                to="/checklist/assign-task"
                className="flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-blue-600 to-blue-600 rounded-2xl shadow-lg shadow-blue-200 text-white transform active:scale-90 transition-all duration-300 border-4 border-blue-50 dark:border-slate-900"
              >
                <CirclePlus size={28} strokeWidth={2.5} />
              </Link>
            </div>
          )}

          <Link
            to="/checklist/delegation"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${location.pathname === "/checklist/delegation"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              : "text-gray-400 dark:text-slate-500 hover:text-blue-400 dark:hover:text-blue-300"
              }`}
          >
            <BookmarkCheck size={22} strokeWidth={location.pathname === "/checklist/delegation" ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-bold">Status</span>
          </Link>

          <button
            onClick={() => setIsUserPopupOpen(true)}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-gray-400 dark:text-slate-500 hover:text-blue-400 dark:hover:text-blue-300 transition-all"
          >
            <UserRound size={22} strokeWidth={2} />
            <span className="text-[10px] mt-1 font-bold">Profile</span>
          </button>
        </div>
        */}

        {/* User Popup */}
        {isUserPopupOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 transition-all duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-[340px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/50 dark:border-slate-800">
              {/* Header Gradient */}
              <div className="h-32 bg-gradient-to-br from-indigo-600 via-blue-600 to-pink-500 relative">
                <div className="absolute inset-0 bg-white/10 dark:bg-black/20 backdrop-blur-[2px]"></div>
                <button
                  onClick={() => setIsUserPopupOpen(false)}
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-all hover:rotate-90 z-10"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Profile Info */}
              <div className="px-8 pb-8 text-center bg-white dark:bg-slate-900 animate-colors duration-300">
                <div className="relative -mt-16 mb-6 flex justify-center">
                  <div className="h-28 w-28 rounded-full bg-white dark:bg-slate-900 p-1.5 shadow-2xl ring-4 ring-white/30 dark:ring-slate-800/30">
                    <div className="h-full w-full rounded-full bg-gradient-to-tr from-indigo-50 to-blue-600 flex items-center justify-center overflow-hidden border-2 border-white dark:border-slate-800 shadow-inner">
                      {profileImage ? (
                        <img
                          src={profileImage}
                          alt={username}
                          className="h-full w-full object-cover transform hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <span className="text-4xl font-black text-white uppercase tracking-tighter">
                          {username ? username.charAt(0) : "U"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-slate-100 tracking-tight mb-1">
                      {username || "User"}
                    </h3>
                    <div className="flex justify-center flex-wrap gap-2">
                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100/50 dark:border-indigo-900/30">
                        {userRole?.toLowerCase() === "admin"
                          ? isSuperAdmin
                            ? "Super Admin"
                            : "Administrator"
                          : userRole?.toLowerCase() === "hod"
                            ? "HOD / Supervisor"
                            : "Staff"}
                      </span>
                    </div>
                  </div>

                  <div className="py-3 px-4 bg-gray-50 dark:bg-slate-950 rounded-2xl flex items-center justify-center gap-2 border border-gray-100 dark:border-slate-800/60">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400 truncate">
                      {userEmail || "user@example.com"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setIsUserPopupOpen(false)}
                    className="flex justify-center items-center py-3.5 px-4 rounded-2xl text-xs font-black text-gray-400 border-2 border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-850 hover:text-gray-600 dark:hover:text-slate-300 transition-all active:scale-95 uppercase tracking-widest"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleLogout}
                    className="flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-[0_10px_20px_-5px_rgba(79,70,229,0.4)] hover:shadow-indigo-200 transition-all active:scale-95 uppercase tracking-widest"
                  >
                    Logout <LogOut size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
