import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Bell, CheckCircle, Clock, ShoppingCart } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabase';
import { USER_ROLES, PAGES } from '../constants';

const Header = ({ children }) => {
  const { user, logout } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);
  const notificationRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) return;

      const isAdmin = user?.Admin === 'Yes' || USER_ROLES.slice(0, -1).some(r => r.toLowerCase() === user?.role?.toLowerCase());
      const isHr = user?.role === 'hr' || user?.role === 'HR';
      const userId = user?.user_id;
      const userName = user?.full_name || user?.Name;

      try {


        const notificationsMap = new Map();





        // 3. Fetch System Notifications (e.g. Requests for more leaves)
        if (isAdmin) {
          // Notifications table missing, disabling fetch for now
          const systemNotifs = [];

          systemNotifs?.forEach(item => {
            const uniqueId = `sys-${item.id}`;
            notificationsMap.set(uniqueId, {
              id: uniqueId,
              type: 'System Alert',
              title: 'Admin Notification',
              time: item.created_at,
              link: `/${PAGES[1].id}`,
              status: item.is_read ? 'Read' : 'Unread',
              context: 'management',
              isLeave: false,
              message: item.message,
              details: {
                type: 'Alert',
                description: item.message,
                date: new Date(item.created_at).toLocaleDateString(),
                hod: null,
                hr: null
              }
            });
          });
        }

        const allNotifications = Array.from(notificationsMap.values()).sort((a, b) => new Date(b.time) - new Date(a.time));
        setNotifications(allNotifications);

      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const handleNotificationClick = (link) => {
    setIsNotificationOpen(false);
    navigate(link);
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-20 px-4 sm:px-6 py-3">
      <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 flex-1">
          {children}
          {/* Order Management Header removed */}
        </div>

        <div className="flex items-center space-x-4 sm:space-x-6">

          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all focus:outline-none"
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background animate-pulse"></span>
              )}
            </button>

            {isNotificationOpen && (
              <div className="fixed inset-x-4 top-[72px] sm:absolute sm:inset-auto sm:right-0 sm:mt-3 w-auto sm:w-[28rem] bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 transform origin-top-right transition-all overflow-hidden ring-1 ring-slate-900/5 flex flex-col">
                <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-50 flex justify-between items-center bg-white flex-shrink-0">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">Notifications</h3>
                  {notifications.length > 0 && (
                    <span className="text-[10px] font-bold text-primary-foreground bg-primary px-2.5 py-1 rounded-full shadow-sm shadow-primary/20">{notifications.length} New</span>
                  )}
                </div>

                <div className="max-h-[60vh] sm:max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 overscroll-contain">
                  {notifications.length > 0 ? (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif.link)}
                        className="px-4 py-3 sm:px-5 sm:py-4 hover:bg-slate-50/80 transition-all cursor-pointer border-b border-slate-50 last:border-0 group relative"
                      >
                        <div className="flex gap-3 sm:gap-4">
                          {/* Icon Column */}
                          <div className="mt-1 flex-shrink-0">
                            {notif.type.includes('Leave') ? (
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-sm ${notif.status?.toLowerCase().includes('approved') ? 'bg-green-50 text-green-600' :
                                notif.status?.toLowerCase().includes('reject') ? 'bg-red-50 text-red-600' :
                                  'bg-blue-50 text-blue-600'
                                }`}>
                                <Clock size={20} strokeWidth={2} />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shadow-sm">
                                <Bell size={20} strokeWidth={2} />
                              </div>
                            )}
                          </div>

                          {/* Content Column */}
                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-semibold text-slate-800 leading-tight">
                                {notif.title}
                              </p>
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                {formatTimeAgo(notif.time)}
                              </span>
                            </div>

                            {/* Main Message / Details */}
                            <div className="text-sm text-slate-600 leading-relaxed space-y-1.5 mt-1">
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-700">
                                {notif.message}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-12 text-center bg-slate-50/30">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 mb-4 text-slate-300 border border-slate-100">
                        <CheckCircle size={32} strokeWidth={1.5} />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">All caught up!</p>
                      <p className="text-xs text-slate-400 mt-1">No new notifications at the moment.</p>
                    </div>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-center">
                    <button
                      className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider"
                      onClick={() => setIsNotificationOpen(false)}
                    >
                      Close Notifications
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-3 pl-6 focus:outline-none group"
            >
              <div className="flex flex-col items-end hidden md:block text-right">
                <p className="text-sm font-semibold text-slate-700 leading-tight group-hover:text-primary transition-colors">
                  {user?.full_name || user?.Name || 'Guest User'}
                </p>
                <p className="text-xs text-slate-500 font-medium capitalize">
                  {user?.role || user?.designation || 'User'}
                </p>
              </div>

              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 text-primary overflow-hidden group-hover:ring-2 group-hover:ring-primary/20 transition-all">
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
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 transform origin-top-right transition-all">
                <div className="px-4 py-3 border-b border-slate-50">
                  <p className="text-sm font-bold text-slate-800 truncate">{user?.full_name || user?.Name || 'Guest User'}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || 'No email'}</p>
                </div>

                <div className="py-1">
                  <Link
                    to={`/${PAGES[0].id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-accent hover:text-primary transition-colors"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <User size={18} />
                    My Profile
                  </Link>
                </div>

                <div className="py-1 border-t border-slate-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut size={18} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;