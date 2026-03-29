import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, Star, Bell, FileText, Activity, Receipt, Building2, Briefcase, TrendingUp, Shield, LogOut } from 'lucide-react';
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

  const isPartner = user?.role === 'partner';

  const menuSections = [
    {
      title: 'Overview',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/deadlines', label: 'Deadline Tracker', icon: Clock, badge: '4' },
        { path: '/calendar', label: 'Calendar', icon: Calendar },
        { path: '/appreciation', label: 'Staff Appreciation', icon: Star, partnerOnly: true },
        { path: '/reminders', label: 'Reminders', icon: Bell, badge: '5' },
      ]
    },
    {
      title: 'Audit',
      items: [
        { path: '/audit/statutory', label: 'Statutory Audit', icon: FileText, badge: '10' },
        { path: '/audit/internal', label: 'Internal Audit', icon: Activity, badge: '3' },
        { path: '/audit/stock', label: 'Stock Audit', icon: Receipt },
        { path: '/audit/fraud', label: 'Fraud Audit', icon: Shield },
      ]
    },
    {
      title: 'VAT',
      items: [
        { path: '/vat/registration', label: 'Registration', icon: FileText },
        { path: '/vat/filing', label: 'Filing', icon: Receipt, badge: '5' },
        { path: '/vat/amendments', label: 'Amendments', icon: Activity },
      ]
    },
    {
      title: 'Corporate',
      items: [
        { path: '/corporate/registration', label: 'Registration', icon: Building2 },
        { path: '/corporate/tax', label: 'Corporate Tax', icon: Receipt, badge: '5' },
        { path: '/corporate/formation', label: 'Formation', icon: Briefcase },
        { path: '/corporate/liquidation', label: 'Liquidation', icon: TrendingUp },
      ]
    },
    {
      title: 'Advisory',
      items: [
        { path: '/advisory/valuation', label: 'Valuation', icon: TrendingUp, badge: '2' },
        { path: '/advisory/due-diligence', label: 'Due Diligence', icon: FileText, badge: '2' },
      ]
    },
    {
      title: 'AML',
      items: [
        { path: '/aml/review', label: 'Monthly Review', icon: Shield, badge: '3' },
        { path: '/aml/filing', label: 'Filing', icon: Receipt },
        { path: '/aml/reports', label: 'Monthly Reports', icon: FileText, badge: '3' },
      ]
    },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#0a1128' }}>
      {/* Sidebar */}
      <aside className="w-64 flex flex-col" style={{ background: '#0f1832', borderRight: '1px solid rgba(255,255,255,0.08)', height: '100vh', position: 'sticky', top: 0 }}>
        {/* Logo */}
        <div className="p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Serif Display', color: '#D4AF37' }}>N&N</h1>
          <p className="text-xs text-gray-500 mt-1">Chartered Accountants</p>
        </div>

        {/* Partners */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Partners</p>
          <div className="space-y-1">
            <div className="text-xs text-gray-300">Arjun Srinivas</div>
            <div className="text-xs text-gray-300">Sooraj Nelliyatt</div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.title} className="mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-3">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  if (item.partnerOnly && !isPartner) return null;
                  
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                        isActive
                          ? 'text-navy font-medium'
                          : 'text-gray-300 hover:text-white hover:bg-navy3'
                      }`}
                      style={isActive ? { background: '#D4AF37', color: '#0a1128' } : {}}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-xs rounded-full" style={{ background: isActive ? '#0a1128' : '#D4AF37', color: isActive ? '#D4AF37' : '#0a1128' }}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        
        {/* User Footer */}
        {user && (
          <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#D4AF37', color: '#0a1128', fontWeight: 600 }}>
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs truncate" style={{ color: '#D4AF37' }}>{user.title || user.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#8892a6' }}
              data-testid="logout-btn"
            >
              <LogOut size={14} />
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
