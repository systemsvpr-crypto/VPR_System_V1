import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ProtectedRoute = ({ children }) => {
  const { pathname } = useLocation();
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowedPages = user.page_access || [];

  // Normalize location to match page IDs (remove leading slash)
  let currentPath = pathname.substring(1);

  // Handle root path explicitly
  if (pathname === '/') currentPath = '/';

  // Check if the current path is allowed
  const isAllowed =
    allowedPages.includes(currentPath) ||
    (currentPath === '/' && allowedPages.includes('/')) ||
    allowedPages.some(page =>
      page !== '/' && (currentPath === page || currentPath.startsWith(`${page}/`))
    );

  if (!isAllowed) {
    const fallback = allowedPages.length > 0 ? allowedPages[0] : null;

    if (!fallback) {
      return <Navigate to="/login" replace />;
    }

    const redirectPath = fallback === '/' ? '/' : `/${fallback}`;

    if (pathname !== redirectPath) {
      return <Navigate to={redirectPath} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;