import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, Star, Bell, FileText, Activity, Receipt, Building2, Briefcase, TrendingUp, Shield, LogOut, Users, Mail, Plus, X, CheckCircle, ChevronDown, ChevronRight, Menu, PanelLeftClose, MessageSquare, Database } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SERVICE_MODULES = [
  'Statutory Audit', 'Internal Audit', 'Stock Audit', 'Fraud Audit',
  'VAT Registration', 'VAT Filing', 'VAT Amendments',
  'Corporate Registration', 'Corporate Tax', 'Company Formation', 'Liquidation',
  'Valuation', 'Due Diligence', 'AML Review', 'AML Filing', 'AML Report',
];
const PRIORITIES = ['High', 'Medium', 'Low'];

const MainLayout = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Sidebar state
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ Overview: true });

  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('meeting');

  // Data
  const [clients, setClients] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Forms
  const [taskForm, setTaskForm] = useState({ title: '', service_module: '', client_id: '', client_name: '', assigned_to: '', assigned_to_name: '', due_date: '', priority: 'Medium', description: '' });
  const [eventForm, setEventForm] = useState({ title: '', date: '', time: '', client_name: '', client_id: '', assigned_to: '', assigned_to_name: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-expand section matching current route
  useEffect(() => {
    menuSections.forEach(s => {
      if (s.items.some(i => i.path === location.pathname)) {
        setExpandedSections(prev => ({ ...prev, [s.title]: true }));
      }
    });
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }); } catch (e) { /* ignore */ }
    document.cookie = 'session_token=; path=/; max-age=0';
    navigate('/login');
  };

  const isPartner = user?.role === 'partner';
  const isManagingPartner = user?.title === 'Managing Partner';

  const loadLists = async () => {
    if (listsLoaded) return;
    try {
      const [cr, ur] = await Promise.all([
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`),
      ]);
      setClients(cr.data);
      setStaffList(ur.data.filter(u => u.role === 'staff'));
      setListsLoaded(true);
    } catch (err) { console.error(err); }
  };

  const toggleSection = (title) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  // --- Task Modal ---
  const openTaskModal = () => {
    setTaskForm({ title: '', service_module: '', client_id: '', client_name: '', assigned_to: '', assigned_to_name: '', due_date: '', priority: 'Medium', description: '' });
    setSuccessMsg('');
    setShowTaskModal(true);
    loadLists();
  };
  const handleClientChangeTask = (e) => { const id = e.target.value; const c = clients.find(x => x.client_id === id); setTaskForm(p => ({ ...p, client_id: id, client_name: c?.name || '' })); };
  const handleStaffChangeTask = (e) => { const em = e.target.value; const s = staffList.find(x => x.email === em); setTaskForm(p => ({ ...p, assigned_to: em, assigned_to_name: s?.name || '' })); };
  const handleSubmitTask = async () => {
    if (!taskForm.title || !taskForm.service_module || !taskForm.due_date || !taskForm.assigned_to) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/tasks`, taskForm, { withCredentials: true });
      setSuccessMsg(`Task "${taskForm.title}" assigned to ${taskForm.assigned_to_name}`);
      setTimeout(() => { setShowTaskModal(false); setSuccessMsg(''); }, 1800);
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  // --- Event Modal ---
  const openEventModal = (type) => {
    setEventType(type);
    setEventForm({ title: '', date: '', time: '', client_name: '', client_id: '', assigned_to: '', assigned_to_name: '', notes: '' });
    setSuccessMsg('');
    setShowEventModal(true);
    loadLists();
  };
  const handleClientChangeEvent = (e) => { const id = e.target.value; const c = clients.find(x => x.client_id === id); setEventForm(p => ({ ...p, client_id: id, client_name: c?.name || '' })); };
  const handleStaffChangeEvent = (e) => { const em = e.target.value; const s = staffList.find(x => x.email === em); setEventForm(p => ({ ...p, assigned_to: em, assigned_to_name: s?.name || '' })); };
  const handleSubmitEvent = async () => {
    if (!eventForm.title || !eventForm.date) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/events`, { ...eventForm, event_type: eventType }, { withCredentials: true });
      const label = eventType === 'meeting' ? 'Meeting' : 'Follow-up';
      setSuccessMsg(`${label} "${eventForm.title}" scheduled`);
      setTimeout(() => { setShowEventModal(false); setSuccessMsg(''); }, 1800);
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const sectionIcons = { Overview: LayoutDashboard, Audit: FileText, VAT: Receipt, Corporate: Building2, Advisory: TrendingUp, AML: Shield };

  const menuSections = [
    {
      title: 'Overview',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/deadlines', label: 'Deadline Tracker', icon: Clock, badge: '4' },
        { path: '/calendar', label: 'Calendar', icon: Calendar },
        { path: '/appreciation', label: 'Staff Appreciation', icon: Star, partnerOnly: true },
        { path: '/reminders', label: 'Reminders', icon: Bell, badge: '5' },
        { path: '/ai-assistant', label: 'AI Assistant', icon: MessageSquare },
        { path: '/client-master', label: 'Client Master', icon: Database, managingPartnerOnly: true },
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
    for (const s of menuSections) for (const i of s.items) if (i.path === location.pathname) return i.label;
    return 'Dashboard';
  };

  const sidebarWidth = collapsed ? 64 : 252;
  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };

  const sidebarContent = (isMobile) => (
    <>
      {/* Logo */}
      <div style={{ padding: collapsed && !isMobile ? '16px 0' : '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'space-between' }}>
        {collapsed && !isMobile ? (
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontFamily: 'DM Serif Display', fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={() => setCollapsed(false)} data-testid="sidebar-expand-btn">N</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontFamily: 'DM Serif Display', fontWeight: 700, fontSize: 16 }}>N&N</div>
              <div>
                <div style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 15, lineHeight: 1.2 }}>Nair & Nelliyatt</div>
                <div style={{ fontSize: 10, color: 'var(--light)', letterSpacing: 0.5 }}>Chartered Accountants</div>
              </div>
            </div>
            {!isMobile && (
              <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', color: 'var(--light)', cursor: 'pointer', padding: 4, display: 'flex' }} data-testid="sidebar-collapse-btn"><PanelLeftClose size={16} /></button>
            )}
            {isMobile && (
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--light)', cursor: 'pointer', padding: 4, display: 'flex' }} data-testid="sidebar-close-mobile"><X size={18} /></button>
            )}
          </>
        )}
      </div>

      {/* Partners - hide when collapsed */}
      {(!collapsed || isMobile) && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--light)', marginBottom: 6 }}>Active Partners</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Arjun S.', 'Sooraj N.'].map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(201,168,76,0.08)', borderRadius: 6, padding: '4px 8px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: collapsed && !isMobile ? '8px 6px' : '8px 10px', overflowY: 'auto' }}>
        {menuSections.map((section) => {
          const SectionIcon = sectionIcons[section.title] || FileText;
          const isExpanded = expandedSections[section.title];
          const hasActiveItem = section.items.some(i => i.path === location.pathname);
          const totalBadge = section.items.reduce((sum, i) => sum + (i.badge ? parseInt(i.badge) : 0), 0);

          // Collapsed mode — show only section icon
          if (collapsed && !isMobile) {
            return (
              <div key={section.title} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => { setCollapsed(false); setExpandedSections(p => ({ ...p, [section.title]: true })); }}
                  style={{ width: 42, height: 42, margin: '0 auto 2px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', background: hasActiveItem ? 'var(--gold)' : 'transparent', color: hasActiveItem ? 'var(--navy)' : 'rgba(255,255,255,0.5)', position: 'relative' }}
                  title={section.title}
                  data-testid={`section-icon-${section.title.toLowerCase()}`}
                >
                  <SectionIcon size={18} />
                  {totalBadge > 0 && (
                    <span style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--gold)', color: 'var(--navy)', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{totalBadge}</span>
                  )}
                </div>
              </div>
            );
          }

          // Expanded mode — collapsible sections
          return (
            <div key={section.title} style={{ marginBottom: 6 }}>
              {/* Section Header — Clickable */}
              <button
                onClick={() => toggleSection(section.title)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', borderRadius: 7, border: 'none', background: hasActiveItem ? 'rgba(201,168,76,0.06)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'DM Sans, sans-serif',
                }}
                data-testid={`section-toggle-${section.title.toLowerCase()}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SectionIcon size={14} color={hasActiveItem ? 'var(--gold)' : 'rgba(255,255,255,0.45)'} />
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: hasActiveItem ? 'var(--gold)' : 'var(--light)' }}>{section.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {totalBadge > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(201,168,76,0.12)', color: 'var(--gold)' }}>{totalBadge}</span>}
                  {isExpanded ? <ChevronDown size={13} color="rgba(255,255,255,0.35)" /> : <ChevronRight size={13} color="rgba(255,255,255,0.35)" />}
                </div>
              </button>

              {/* Sub-items — Visible when expanded */}
              {isExpanded && (
                <div style={{ paddingLeft: 6, marginTop: 2 }}>
                  {section.items.map((item) => {
                    if (item.partnerOnly && !isPartner) return null;
                    if (item.managingPartnerOnly && !isManagingPartner) return null;
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => isMobile && setMobileOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
                          transition: 'all 0.15s', marginBottom: 1,
                          background: isActive ? 'var(--gold)' : 'transparent',
                          color: isActive ? 'var(--navy)' : 'rgba(255,255,255,0.6)',
                          fontWeight: isActive ? 600 : 400,
                        }}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon size={14} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: isActive ? 'var(--navy)' : 'rgba(201,168,76,0.15)', color: isActive ? 'var(--gold)' : 'var(--gold)' }}>{item.badge}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Footer */}
      {user && (
        <div style={{ padding: collapsed && !isMobile ? '10px 6px' : '12px 14px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
          {collapsed && !isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{user.name?.charAt(0)}</div>
              <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--light)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }} data-testid="logout-btn"><LogOut size={14} /></button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{user.name?.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--gold)' }}>{user.title || user.role}</div>
                </div>
              </div>
              <button onClick={handleLogout} style={{ width: '100%', padding: '6px 0', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--light)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'DM Sans, sans-serif' }} data-testid="logout-btn"><LogOut size={13} /> Logout</button>
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Desktop Sidebar */}
      <aside
        className="sidebar-desktop"
        style={{
          width: sidebarWidth, minWidth: sidebarWidth, background: 'var(--navy)',
          borderRight: '1px solid rgba(255,255,255,0.055)',
          height: '100vh', overflowY: 'auto',
          backgroundImage: 'linear-gradient(180deg,rgba(201,168,76,0.03) 0%,transparent 40%)',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          display: 'flex', flexDirection: 'column',
        }}
        data-testid="sidebar"
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="sidebar-mobile-overlay" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }} data-testid="mobile-sidebar-overlay">
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
          <aside style={{ width: 280, background: 'var(--navy)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, boxShadow: '4px 0 24px rgba(0,0,0,0.3)' }}>
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{ background: 'var(--white)', borderBottom: '1px solid var(--nn-border)', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 20, boxShadow: '0 1px 0 var(--nn-border)' }} data-testid="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mobile menu button */}
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 4, display: 'none', alignItems: 'center' }} data-testid="mobile-menu-btn"><Menu size={20} /></button>
            <h2 style={{ fontSize: 17, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{getPageTitle()}</h2>
            <span className="topbar-date" style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isPartner && (
              <>
                <button className="tbtn tbtn-green topbar-action-btn" onClick={() => openEventModal('meeting')} data-testid="topbar-meeting-btn"><Users size={13} /> <span className="btn-label">+ Meeting</span></button>
                <button className="tbtn tbtn-blue topbar-action-btn" onClick={() => openEventModal('followup')} data-testid="topbar-followup-btn"><Mail size={13} /> <span className="btn-label">Follow-up</span></button>
                <button className="tbtn topbar-action-btn" style={{ background: 'var(--gold5)', color: 'var(--gold4)' }} onClick={() => navigate('/appreciation')} data-testid="topbar-appreciate-btn"><Star size={13} /> <span className="btn-label">Appreciate</span></button>
              </>
            )}
            <button className="tbtn tbtn-gold" onClick={openTaskModal} data-testid="topbar-newtask-btn"><Plus size={13} /> <span className="btn-label">New Task</span></button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--off)' }} className="main-content">
          <Outlet context={{ user }} />
        </main>
      </div>

      {/* ===== NEW TASK MODAL ===== */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => !submitting && setShowTaskModal(false)} data-testid="new-task-modal">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>New Task</h3>
              <button onClick={() => setShowTaskModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }} data-testid="close-task-modal"><X size={18} /></button>
            </div>
            {successMsg ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}><CheckCircle size={42} color="var(--green)" style={{ marginBottom: 12 }} /><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{successMsg}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Added to tracker.</div></div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Task Title *</label><input type="text" placeholder="e.g. Prepare VAT return for Q1" value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} data-testid="task-title-input" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Service Module *</label><select value={taskForm.service_module} onChange={(e) => setTaskForm(p => ({ ...p, service_module: e.target.value }))} style={inputStyle} data-testid="task-service-select"><option value="">— Select —</option>{SERVICE_MODULES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label style={labelStyle}>Priority *</label><select value={taskForm.priority} onChange={(e) => setTaskForm(p => ({ ...p, priority: e.target.value }))} style={inputStyle} data-testid="task-priority-select">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                  </div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Client *</label><select value={taskForm.client_id} onChange={handleClientChangeTask} style={inputStyle} data-testid="task-client-select"><option value="">— Select client —</option>{clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}</select></div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Assign To (Staff) *</label><select value={taskForm.assigned_to} onChange={handleStaffChangeTask} style={inputStyle} data-testid="task-assignee-select"><option value="">— Select staff —</option>{staffList.map(s => <option key={s.email} value={s.email}>{s.name} — {s.title}</option>)}</select></div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Due Date *</label><input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} data-testid="task-duedate-input" /></div>
                  <div><label style={labelStyle}>Description</label><textarea placeholder="Details..." rows={3} value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} data-testid="task-description-input" /></div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowTaskModal(false)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={handleSubmitTask} disabled={submitting || !taskForm.title || !taskForm.service_module || !taskForm.due_date || !taskForm.assigned_to} style={{ opacity: (!taskForm.title || !taskForm.service_module || !taskForm.due_date || !taskForm.assigned_to) ? 0.5 : 1 }} data-testid="task-submit-btn">{submitting ? 'Creating...' : 'Create Task'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== MEETING / FOLLOW-UP MODAL ===== */}
      {showEventModal && (
        <div className="modal-overlay" onClick={() => !submitting && setShowEventModal(false)} data-testid="event-modal">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>{eventType === 'meeting' ? 'Schedule Meeting' : 'Create Follow-up'}</h3>
              <button onClick={() => setShowEventModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }} data-testid="close-event-modal"><X size={18} /></button>
            </div>
            {successMsg ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}><CheckCircle size={42} color="var(--green)" style={{ marginBottom: 12 }} /><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{successMsg}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Added to calendar.</div></div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: eventType === 'meeting' ? 'var(--green)' : 'var(--blue)' }} /><span style={{ fontSize: 12, fontWeight: 600, color: eventType === 'meeting' ? 'var(--green)' : 'var(--blue)' }}>{eventType === 'meeting' ? 'Meeting' : 'Follow-up'}</span></div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>{eventType === 'meeting' ? 'Meeting Title' : 'Follow-up Subject'} *</label><input type="text" placeholder={eventType === 'meeting' ? 'e.g. Al Baraka VAT Review' : 'e.g. Follow up on audit progress'} value={eventForm.title} onChange={(e) => setEventForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} data-testid="event-title-input" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Date *</label><input type="date" value={eventForm.date} onChange={(e) => setEventForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} data-testid="event-date-input" /></div>
                    <div><label style={labelStyle}>Time</label><input type="time" value={eventForm.time} onChange={(e) => setEventForm(p => ({ ...p, time: e.target.value }))} style={inputStyle} data-testid="event-time-input" /></div>
                  </div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Client</label><select value={eventForm.client_id} onChange={handleClientChangeEvent} style={inputStyle} data-testid="event-client-select"><option value="">— Select client —</option>{clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}</select></div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>{eventType === 'meeting' ? 'Attendee' : 'Assign To'}</label><select value={eventForm.assigned_to} onChange={handleStaffChangeEvent} style={inputStyle} data-testid="event-staff-select"><option value="">— Select staff —</option>{staffList.map(s => <option key={s.email} value={s.email}>{s.name} — {s.title}</option>)}</select></div>
                  <div><label style={labelStyle}>Notes</label><textarea placeholder="Details..." rows={3} value={eventForm.notes} onChange={(e) => setEventForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} data-testid="event-notes-input" /></div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowEventModal(false)}>Cancel</button>
                  <button className="tbtn" style={{ background: eventType === 'meeting' ? 'var(--green)' : 'var(--blue)', color: '#fff' }} onClick={handleSubmitEvent} disabled={submitting || !eventForm.title || !eventForm.date} data-testid="event-submit-btn">{submitting ? 'Saving...' : eventType === 'meeting' ? 'Schedule Meeting' : 'Create Follow-up'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .topbar-date { display: none !important; }
          .btn-label { display: none; }
          .topbar-action-btn { padding: 7px 8px !important; gap: 0 !important; }
          .main-content { padding: 14px 12px !important; }
          .modal-box { width: 95vw !important; max-height: 88vh !important; }
        }
        @media (min-width: 769px) {
          .sidebar-mobile-overlay { display: none !important; }
          .mobile-menu-btn { display: none !important; }
          .main-content { padding: 22px 24px; }
        }
      `}</style>
    </div>
  );
};

export default MainLayout;
