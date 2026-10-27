import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { PAGES, DEFAULT_USER_PAGES, PAGE_TABS } from '../constants';
import {
  LogOut as LogOutIcon,
  X,
  User,
  Menu,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  Package,
  Warehouse,
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  DollarSign,
  IndianRupee,
  ShoppingCart,
  Boxes,
  ListChecks,
  FolderLock,
  LayoutDashboard,
  FolderKanban,
  FileText,
  CalendarClock,
  Share2,
  Layers,
  BadgeCheck,
  CreditCard,
  RefreshCw,
  Landmark,
  HandCoins,
  FileCheck2,
  MessageCircle,
  MessagesSquare,
  Megaphone,
} from 'lucide-react';
import vprLogo from '../../assets/vpr_logo.png';
import { DOCS_DATA_CHANGED_EVENT, fetchDocsSidebarBadgeCounts } from '../docs/services/docsApi';

// Icons for the Docs & Subscriptions sub-pages (keyed by PAGE_TABS.docs id).
const SUB_ICONS = {
  docs_dashboard: LayoutDashboard,
  docs_resource_manager: FolderKanban,
  docs_all_documents: FileText,
  docs_document_renewal: CalendarClock,
  docs_shared_documents: Share2,
  docs_all_subscriptions: Layers,
  docs_subscription_approval: BadgeCheck,
  docs_subscription_payment: CreditCard,
  docs_subscription_renewal: RefreshCw,
  docs_all_loans: Landmark,
  docs_loan_foreclosure: HandCoins,
  docs_loan_noc: FileCheck2,
  whatsapp_inbox: MessagesSquare,
  whatsapp_scheduler: Megaphone,
};

// Pages whose sub-pages each get their own sidebar link (as a collapsible
// group) instead of in-page tabs.
const DROPDOWN_PAGES = ['checklist', 'docs', 'whatsapp'];

const Sidebar = ({ onClose }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState(() =>
    Object.fromEntries(DROPDOWN_PAGES.map(id => [id, pathname.startsWith(`/${id}`)])),
  );
  const [docsBadges, setDocsBadges] = useState({});

  // Keep a group expanded whenever one of its pages is open.
  useEffect(() => {
    const active = DROPDOWN_PAGES.find(id => pathname.startsWith(`/${id}`));
    if (active) {
      setOpenDropdowns(prev => (prev[active] ? prev : { ...prev, [active]: true }));
    }
  }, [pathname]);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('vpr_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('vpr_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!user?.user_id) return;

    const channel = supabase
      .channel('user-permission-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `user_id=eq.${user.user_id}`,
        },
        (payload) => {
          const newData = payload.new;
          if (newData) {
            // Get latest state from store to avoid stale closure
            const currentUser = useAuthStore.getState().user;

            // Handle Postgres array string format from Realtime {item1,item2}
            let newPageAccess = newData.page_access;
            if (typeof newPageAccess === 'string') {
              // Convert "{a,b}" to ["a","b"]
              newPageAccess = newPageAccess.replace(/^\{|\}$/g, '').split(',');
              // Handle empty array case "{}" which split returns [""]
              if (newPageAccess.length === 1 && newPageAccess[0] === "") {
                newPageAccess = [];
              }
            }

            // Merge new data while maintaining compatibility fields
            const updatedUser = {
              ...currentUser,
              ...newData,
              page_access: newPageAccess || newData.page_access || currentUser.page_access,
              Name: newData.full_name || currentUser?.Name,
              Admin: (newData.role?.toLowerCase().includes('admin')) ? 'Yes' : 'No',
            };

            // Update the store immediately
            useAuthStore.getState().login(updatedUser);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.user_id]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem('user');
    localStorage.removeItem('user-name');
    localStorage.removeItem('role');
    localStorage.removeItem('user-id');
    localStorage.removeItem('email_id');
    localStorage.removeItem('phone');
    localStorage.removeItem('can_self_assign');
    localStorage.removeItem('profile_image');
    localStorage.removeItem('department');
    localStorage.removeItem('division');
    localStorage.removeItem('user_access');
    localStorage.removeItem('page_access');
    localStorage.removeItem('designation');
    localStorage.removeItem('vpr-systems');
    sessionStorage.clear();
    navigate('/login', { replace: true });
  };

  const iconMap = {
    'live-stock-dashboard': BarChart3,
    'stock-management': ArrowLeftRight,
    'master': Package,
    'pricing': IndianRupee,
    'sales': DollarSign,
    'purchase': ShoppingCart,
    'ultimate-ims': Boxes,
    'checklist': ListChecks,
    'docs': FolderLock,
    'whatsapp': MessageCircle,
    'settings': Settings,
    'my-profile': User,
  };

  const toggleDropdown = (id) => {
    setOpenDropdowns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  /* Combined Master Menu List for Permission Checking */
  const MASTER_MENU_ITEMS = PAGES.map(page => {
    const base = {
      path: `/${page.id}`,
      icon: iconMap[page.id] || User,
      label: page.label,
      id: page.id,
    };
    if (!DROPDOWN_PAGES.includes(page.id)) return base;
    return {
      ...base,
      type: 'dropdown',
      isOpen: !!openDropdowns[page.id],
      toggle: () => toggleDropdown(page.id),
      items: PAGE_TABS[page.id].map(tab => ({
        id: tab.id,
        parentId: page.id,
        label: tab.label,
        path: `/${page.id}/${tab.path}`,
        section: tab.section,
        icon: SUB_ICONS[tab.id],
        badge: tab.badge ? docsBadges[tab.badge] : undefined,
      })),
    };
  });

  const isAdminUser = user?.role === 'SUPER ADMIN' || user?.role?.toUpperCase().includes('ADMIN');

  // Helper: Check if user has access to a specific page ID
  const hasAccess = (pageId) => {
    if (isAdminUser) return true;
    if (!user?.page_access || !Array.isArray(user?.page_access)) {
      return DEFAULT_USER_PAGES.includes(pageId);
    }

    return user.page_access.includes(pageId);
  };

  // A dropdown child is a tab of its parent page (users.tab_access).
  const hasChildAccess = (child) => {
    if (isAdminUser) return true;
    return hasAccess(child.parentId) && (user?.tab_access?.[child.parentId] || []).includes(child.id);
  };

  // Filter the menu items
  const baseMenuItems = MASTER_MENU_ITEMS.reduce((acc, item) => {
    // Handle Dropdowns specially
    if (item.type === 'dropdown') {
      // Check if any child is accessible
      const accessibleChildren = item.items.filter(child => hasChildAccess(child));
      if (accessibleChildren.length > 0) {
        acc.push({ ...item, items: accessibleChildren });
      }
    } else {
      // Normal Item
      if (hasAccess(item.id)) {
        acc.push(item);
      }
    }
    return acc;
  }, []);

  // Pending-stage counts for the Docs group, refreshed on every Docs change.
  const showDocs = baseMenuItems.some(item => item.id === 'docs');
  useEffect(() => {
    if (!showDocs) return;
    let cancelled = false;
    const load = () => fetchDocsSidebarBadgeCounts()
      .then(counts => !cancelled && setDocsBadges(counts))
      .catch(() => {});
    load();
    window.addEventListener(DOCS_DATA_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(DOCS_DATA_CHANGED_EVENT, load);
    };
  }, [showDocs]);

  // A group's badge sums the badges of the sub-pages this user can see.
  const menuItems = baseMenuItems.map(item => {
    if (item.type !== 'dropdown') return item;
    const total = item.items.reduce((sum, sub) => sum + (sub.badge || 0), 0);
    return total > 0 ? { ...item, badge: total } : item;
  });

  return (
    <>
      {/* Mobile menu button */}
      <button
        className={`md:hidden fixed top-4 left-4 z-50 p-2 text-slate-500 hover:text-slate-700 transition-all duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onClick={() => setIsOpen(true)}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Tablet menu button */}
      <button
        className={`hidden md:block lg:hidden fixed top-4 left-4 z-50 p-2 text-slate-500 hover:text-slate-700 transition-all duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onClick={() => setIsOpen(true)}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Desktop Sidebar - Static Flow (Flex Item) */}
      <div className="hidden lg:flex h-screen sticky top-0 bg-sidebar border-r border-sidebar-border z-30 relative transition-all duration-300">
        <SidebarContent
          menuItems={menuItems}
          user={user}
          handleLogout={handleLogout}
          isCollapsed={isCollapsed}
        />
        {/* Toggle Collapse Button on Desktop */}
        <button
          type="button"
          onClick={toggleCollapse}
          className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-40 bg-white border border-slate-300 text-slate-700 hover:text-primary hover:border-primary shadow-md hover:shadow-lg rounded-full w-7 h-7 items-center justify-center transition-all duration-200 cursor-pointer"
          title={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} className="stroke-[2.5]" /> : <ChevronLeft size={14} className="stroke-[2.5]" />}
        </button>
      </div>

      {/* Tablet Sidebar - collapsible */}
      <div className={`hidden md:block lg:hidden fixed inset-0 z-50 transition-all duration-500 ease-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500"
          onClick={() => setIsOpen(false)}
        />
        <div className={`fixed left-0 top-0 h-full z-50 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1)`}>
          <SidebarContent
            menuItems={menuItems}
            onClose={() => setIsOpen(false)}
            user={user}
            handleLogout={handleLogout}
            isMobile={true}
          />
        </div>
      </div>

      {/* Mobile Sidebar - collapsible */}
      <div className={`md:hidden fixed inset-0 z-50 transition-all duration-500 ease-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500"
          onClick={() => setIsOpen(false)}
        />
        <div className={`fixed left-0 top-0 h-full z-50 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1)`}>
          <SidebarContent
            menuItems={menuItems}
            onClose={() => setIsOpen(false)}
            user={user}
            handleLogout={handleLogout}
            isMobile={true}
          />
        </div>
      </div>
    </>
  );
};

const SidebarBadge = ({ count }) => (count > 0 ? (
  <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold tabular-nums shrink-0">
    {count > 99 ? '99+' : count}
  </span>
) : null);

// Extracted SidebarContent to prevent re-renders
const SidebarContent = ({ menuItems, onClose, isCollapsed = false, user, handleLogout, isMobile = false }) => (
  <div className={`flex flex-col h-full ${isCollapsed ? 'w-20' : 'w-[85vw] max-w-[280px] lg:w-72'} bg-sidebar text-sidebar-foreground transition-all duration-300 ${!isMobile ? 'border-r border-sidebar-border' : ''} ${isMobile ? 'shadow-2xl' : ''}`}>

    {/* Header */}
    <div className={`flex items-center justify-center ${isCollapsed ? 'px-2 py-6' : 'px-6 py-8'}`}>
      {!isCollapsed ? (
        <div className="flex items-center gap-4 bg-primary/10 px-4 py-3 rounded-xl border border-primary/20">
          <div className="rounded-lg border border-primary/20 p-1 bg-white shadow-sm">
            <img src={vprLogo} alt="VPR Logo" className="h-12 w-12 rounded-md object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg xl:text-xl font-extrabold tracking-tight uppercase whitespace-nowrap">
              <span className="text-slate-900">VPR</span>{' '}
              <span className="text-blue-600">Systems</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">Enterprise Suite</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/20 p-1 bg-white shadow-sm">
          <img src={vprLogo} alt="VPR Logo" className="h-10 w-10 rounded-md object-contain" />
        </div>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>

    {/* Menu */}
    <nav className="flex-1 px-4 space-y-2 overflow-y-auto scrollbar-hide py-2">
      {menuItems.map((item) => {
        // Collapsed to icons, a group is a plain link to its page (which
        // routes to the first sub-page the user may open).
        if (item.type === 'dropdown' && !isCollapsed) {
          return (
            <div key={item.label} className="mb-1">
              <button
                onClick={item.toggle}
                className={`flex items-center justify-between w-full py-3 px-3 rounded-xl transition-all duration-200 group ${item.isOpen
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-primary/5 hover:text-primary'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <item.icon className={`shrink-0 transition-colors ${item.isOpen ? 'text-primary' : 'text-sidebar-foreground/60 group-hover:text-primary'}`} size={20} />
                  {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!item.isOpen && <SidebarBadge count={item.badge} />}
                  {!isCollapsed && (item.isOpen ? <ChevronUp size={14} className="text-primary" /> : <ChevronDown size={14} className="text-sidebar-foreground/40 group-hover:text-primary" />)}
                </div>
              </button>

              {
                item.isOpen && !isCollapsed && (
                  <div className="ml-5 mt-1 space-y-1 pl-4 border-l border-slate-100">
                    {item.items.map((subItem, index) => (
                      <React.Fragment key={subItem.path}>
                        {subItem.section && subItem.section !== item.items[index - 1]?.section && (
                          <p className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40 ${index > 0 ? 'pt-3' : 'pt-1'}`}>
                            {subItem.section}
                          </p>
                        )}
                        <NavLink
                          to={subItem.path}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 py-2.5 px-3 rounded-lg transition-all duration-200 text-sm ${isActive
                              ? 'text-primary font-medium bg-primary/10'
                              : 'text-sidebar-foreground/60 hover:text-primary hover:bg-primary/5'
                            }`
                          }
                          onClick={() => {
                            onClose?.();
                          }}
                        >
                          {subItem.icon && <subItem.icon size={16} className="shrink-0" />}
                          <span className="font-medium flex-1 truncate">{subItem.label}</span>
                          <SidebarBadge count={subItem.badge} />
                        </NavLink>
                      </React.Fragment>
                    ))}
                  </div>
                )
              }
            </div>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center py-3 px-3 rounded-xl transition-all duration-200 mb-1 group ${isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-sidebar-foreground/80 hover:bg-primary/5 hover:text-primary'
              }`
            }
            onClick={() => {
              onClose?.();
            }}
            title={isCollapsed ? item.label : undefined}
          >
            <item.icon className={`transition-colors ${isCollapsed ? 'mx-auto' : 'mr-3'}`} size={20} />
            {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav >

    {/* Footer - Always visible */}
    <div className="p-4 mt-auto">
      <div className={`flex items-center gap-3 p-3 rounded-2xl ${isCollapsed ? 'flex-col justify-center gap-2 p-2' : 'bg-sidebar-accent/30 border border-sidebar-border/50'}`}>
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-sidebar-border text-sidebar-primary shadow-sm overflow-hidden" title={isCollapsed ? (user?.Name || user?.full_name || 'User') : undefined}>
          {user?.profile_picture ? (
            <img
              src={user.profile_picture}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={20} />
          )}
        </div>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.Name || user?.full_name || user?.Username || 'Guest'}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role || 'User'}</p>
          </div>
        )}
        <button
          onClick={() => {
            handleLogout();
            onClose?.();
          }}
          className={`p-2 rounded-lg text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
          title="Logout"
        >
          <LogOutIcon size={18} />
        </button>
      </div>
    </div >
  </div >
);

export default Sidebar;