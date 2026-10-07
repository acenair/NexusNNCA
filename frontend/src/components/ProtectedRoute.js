import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(location.state?.user ? true : null);
  const [user, setUser] = useState(location.state?.user || null);

  useEffect(() => {
    if (location.state?.user) return;
    
    const checkAuth = async () => {
      try {
        const response = await axios.get(`${API}/auth/me`, {
          withCredentials: true,
          headers: getAuthHeaders(),
        });
        setUser(response.data);
        setIsAuthenticated(true);
      } catch (error) {
        // Clear stale tokens
        localStorage.removeItem('session_token');
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, [location.state]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Forced password-change gate: applies to every role until resolved
  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (!user?.must_change_password && location.pathname === '/change-password') {
    return <Navigate to={(user?.role || 'staff') === 'client' ? '/client/documents' : '/app/dashboard'} replace />;
  }

  // Role-based redirect: client users go to /client, staff/partner go to /app
  const userRole = user?.role || 'staff';
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (userRole === 'client') {
      return <Navigate to="/client/documents" replace />;
    }
    return <Navigate to="/app/dashboard" replace />;
  }

  // Auto-redirect: if client tries to access /app, send to /client
  if (userRole === 'client' && location.pathname.startsWith('/app')) {
    return <Navigate to="/client/documents" replace />;
  }

  return React.cloneElement(children, { user });
};

export { getAuthHeaders };
export default ProtectedRoute;
