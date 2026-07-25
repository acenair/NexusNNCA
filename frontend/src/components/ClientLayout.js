import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Clock, Receipt, LogOut } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ClientLayout = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }); } catch {}
    document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    localStorage.removeItem('session_token');
    navigate('/login');
  };

  const navItems = [
    { path: '/client/documents', label: 'Documents', icon: FileText },
    { path: '/client/workflow', label: 'Workflow Status', icon: Clock },
    { path: '/client/invoices', label: 'Invoices', icon: Receipt },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off, #f7f8fa)' }} data-testid="client-layout">
      {/* Top Nav */}
      <nav style={{ background: 'var(--navy, #0a1128)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--gold, #D4AF37)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy, #0a1128)', fontWeight: 800, fontSize: 9, fontFamily: 'DM Serif Display' }}>N&N</div>
          <span style={{ fontFamily: 'DM Serif Display', fontSize: 13, color: 'var(--gold, #D4AF37)' }}>Client Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6,
                textDecoration: 'none', fontSize: 12, fontWeight: 500,
                background: isActive ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: isActive ? 'var(--gold, #D4AF37)' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.15s', fontFamily: 'DM Sans',
              }} data-testid={`client-nav-${item.path.split('/').pop()}`}>
                <Icon size={14} /> {item.label}
              </Link>
            );
          })}
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{user?.name}</span>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'DM Sans' }} data-testid="client-logout">
            <LogOut size={13} /> Logout
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
        <Outlet context={{ user }} />
      </div>
    </div>
  );
};

export default ClientLayout;
