import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bot, Users, CheckSquare, FileText, Building, Activity, TrendingUp, Shield, Briefcase, BarChart3 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MainLayout = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      document.cookie = 'session_token=; path=/; max-age=0';
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/ai-assistant', label: 'AI Assistant', icon: Bot },
    { path: '/clients', label: 'Clients', icon: Users },
    { path: '/tasks', label: 'Tasks', icon: CheckSquare },
    { path: '/vat/registrations', label: 'VAT Services', icon: FileText },
    { path: '/audit/engagements', label: 'Audit Services', icon: Activity },
    { path: '/aml/alerts', label: 'AML Compliance', icon: Shield },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#FFFFFF' }}>
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col" style={{ height: '100vh', position: 'sticky', top: 0 }}>
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>CA AI</h1>
          <p className="text-xs text-slate-500 mt-1">UAE Compliance Platform</p>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path.split('/')[1]);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium mb-1 transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        {user && (
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                  {user.name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
              data-testid="logout-btn"
            >
              Logout
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto" style={{ height: '100vh' }}>
        <div className="p-8">
          <Outlet context={{ user }} />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
