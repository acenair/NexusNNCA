import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, Star, Bell, FileText, Activity, Receipt, Building2, Briefcase, TrendingUp, Shield, LogOut, Users, Mail, Plus } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MainLayout = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      document.cookie = 'session_token=; path=/; max-age=0';
      navigate('/login');
    } catch (error) {
      document.cookie = 'session_token=; path=/; max-age=0';
      navigate('/login');
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

  const getPageTitle = () => {
    const path = location.pathname;
    for (const section of menuSections) {
      for (const item of section.items) {
        if (item.path === path) return item.label;
      }
    }
    return 'Dashboard';
  };

  return (
    <div className="min-h-screen flex" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar - Dark Navy */}
      <aside
        className="flex flex-col flex-shrink-0"
        style={{
          width: 252,
          minWidth: 252,
          background: 'var(--navy)',
          borderRight: '1px solid rgba(255,255,255,0.055)',
          height: '100vh',
          overflowY: 'auto',
          backgroundImage: 'linear-gradient(180deg,rgba(201,168,76,0.03) 0%,transparent 40%)',
        }}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontFamily: 'DM Serif Display', fontWeight: 700, fontSize: 16 }}>
              N&N
            </div>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 15, lineHeight: 1.2 }}>Nair & Nelliyatt</div>
              <div style={{ fontSize: 10, color: 'var(--light)', letterSpacing: 0.5 }}>Chartered Accountants</div>
            </div>
          </div>
        </div>

        {/* Partners */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--light)', marginBottom: 6 }}>Active Partners</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(201,168,76,0.08)', borderRadius: 6, padding: '4px 8px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>Arjun S.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(201,168,76,0.08)', borderRadius: 6, padding: '4px 8px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>Sooraj N.</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {menuSections.map((section) => (
            <div key={section.title} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--light)', padding: '6px 10px 4px', fontWeight: 600 }}>{section.title}</div>
              {section.items.map((item) => {
                if (item.partnerOnly && !isPartner) return null;
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 7,
                      fontSize: 13,
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                      background: isActive ? 'var(--gold)' : 'transparent',
                      color: isActive ? 'var(--navy)' : 'rgba(255,255,255,0.65)',
                      fontWeight: isActive ? 600 : 400,
                      marginBottom: 1,
                    }}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon size={15} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 10,
                        background: isActive ? 'var(--navy)' : 'rgba(201,168,76,0.15)',
                        color: isActive ? 'var(--gold)' : 'var(--gold)',
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Footer */}
        {user && (
          <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--gold)', color: 'var(--navy)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13
              }}>
                {user.name?.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                <div style={{ fontSize: 10, color: 'var(--gold)' }}>{user.title || user.role}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 6,
                background: 'rgba(255,255,255,0.05)', border: 'none',
                color: 'var(--light)', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.15s',
                fontFamily: 'DM Sans, sans-serif',
              }}
              data-testid="logout-btn"
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area - Light Theme */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <header
          style={{
            background: 'var(--white)',
            borderBottom: '1px solid var(--nn-border)',
            padding: '0 24px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            zIndex: 20,
            boxShadow: '0 1px 0 var(--nn-border)',
          }}
          data-testid="topbar"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 17, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{getPageTitle()}</h2>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isPartner && (
              <>
                <button className="tbtn tbtn-green" data-testid="topbar-meeting-btn">
                  <Users size={13} /> + Meeting
                </button>
                <button className="tbtn tbtn-blue" data-testid="topbar-followup-btn">
                  <Mail size={13} /> Follow-up
                </button>
                <button className="tbtn" style={{ background: 'var(--gold5)', color: 'var(--gold4)' }} data-testid="topbar-appreciate-btn">
                  <Star size={13} /> Appreciate Staff
                </button>
              </>
            )}
            <button className="tbtn tbtn-gold" data-testid="topbar-newtask-btn">
              <Plus size={13} /> New Task
            </button>
          </div>
        </header>

        {/* View Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: 'var(--off)' }}>
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
