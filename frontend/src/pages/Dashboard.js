import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Users, AlertTriangle, FileCheck, Shield, ChevronRight, Calendar } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const { user } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, activitiesRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/dashboard/activities`, { withCredentials: true })
      ]);
      setStats(statsRes.data);
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = [
    { label: 'Active Clients', value: stats?.active_clients || 48, sub: '6 new this month', trend: 'up', color: 'var(--gold)', bg: 'var(--gold5)' },
    { label: 'Overdue / Critical', value: stats?.overdue_tasks || 4, sub: 'Immediate action', trend: 'alert', color: 'var(--red)', bg: 'var(--red-bg)' },
    { label: 'Filed This Month', value: stats?.filings_this_month || 11, sub: 'On track', trend: 'up', color: 'var(--green)', bg: 'var(--green-bg)' },
    { label: 'AML Alerts', value: stats?.aml_alerts || 3, sub: 'Pending review', trend: 'warn', color: 'var(--blue)', bg: 'var(--blue-bg)' },
  ];

  const upcomingDeadlines = [
    { service: 'VAT Return — Mar 2026', portal: 'FTA Portal', client: 'Al Baraka Trading LLC', dueDate: '28 Apr 2026', daysLeft: 32, daysColor: 'var(--amber)' },
    { service: 'AML Monthly Review', portal: 'Internal', client: 'Falcon Logistics', dueDate: '10 Apr 2026', daysLeft: 14, daysColor: 'var(--amber)' },
    { service: 'Internal Audit Report', portal: 'Client', client: 'Marina Holdings', dueDate: '10 Apr 2026', daysLeft: 14, daysColor: 'var(--amber)' },
    { service: 'Statutory Audit — Al Hayat', portal: 'Client', client: 'Al Hayat Retail', dueDate: '10 Apr 2026', daysLeft: 14, daysColor: 'var(--amber)' },
    { service: 'Corporate Tax Return', portal: 'FTA Portal', client: 'Gulf Pharma Group', dueDate: '30 Apr 2026', daysLeft: 34, daysColor: 'var(--blue)' },
  ];

  const serviceModules = [
    { name: 'VAT Filing', desc: '5 returns due 28 Apr 2026', badge: '5 pending', badgeType: 'pill-red', path: '/vat/filing' },
    { name: 'AML Compliance', desc: '3 monthly reports due 10 Apr', badge: '3 flagged', badgeType: 'pill-amber', path: '/aml/review' },
    { name: 'Statutory Audit', desc: '10 engagements in progress', badge: '10 active', badgeType: 'pill-blue', path: '/audit/statutory' },
    { name: 'Internal Audit', desc: '3 reports due 10 Apr 2026', badge: '3 reports', badgeType: 'pill-green', path: '/audit/internal' },
    { name: 'Corporate Tax', desc: 'UAE CT returns and compliance', badge: '5 active', badgeType: 'pill-purple', path: '/corporate/tax' },
    { name: 'Due Diligence', desc: 'Financial & legal pre-transaction', badge: '2 reports', badgeType: 'pill-teal', path: '/advisory/due-diligence' },
  ];

  const calendarEvents = [
    { time: '09:00', title: 'Al Baraka — VAT Review', type: 'meeting', color: 'var(--green)' },
    { time: '11:30', title: 'Falcon Logistics — AML Follow-up', type: 'followup', color: 'var(--blue)' },
    { time: '14:00', title: 'Gulf Pharma — Audit Fieldwork', type: 'task', color: 'var(--purple)' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--surface)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="fade-in" data-testid="dashboard-view">
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }} data-testid="kpi-row">
        {kpiCards.map((kpi, idx) => (
          <div
            key={idx}
            className="nn-card"
            style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.15s' }}
            data-testid={`kpi-${kpi.label.toLowerCase().replace(/[\s\/]+/g, '-')}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)' }}>{kpi.label}</span>
              <span className={`pill ${kpi.trend === 'up' ? 'pill-green' : kpi.trend === 'alert' ? 'pill-red' : kpi.trend === 'warn' ? 'pill-amber' : 'pill-blue'}`} style={{ fontSize: 10 }}>
                {kpi.trend === 'up' ? '↑' : kpi.trend === 'alert' ? '!' : '⚑'} {kpi.sub}
              </span>
            </div>
            <div style={{ fontSize: 32, fontFamily: 'DM Serif Display', color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Bottom Grid: Deadlines + Service Modules | Activity + Calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 316px', gap: 14 }}>
        {/* Left Column */}
        <div>
          {/* Upcoming Deadlines */}
          <div className="nn-card" style={{ marginBottom: 14 }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Upcoming Deadlines</h3>
              <Link to="/deadlines" className="sec-link" data-testid="view-full-tracker-link">View full tracker →</Link>
            </div>
            <table className="nn-table" data-testid="deadlines-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Client</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {upcomingDeadlines.map((d, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{d.service}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.portal}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text)' }}>{d.client}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{d.dueDate}</div>
                    </td>
                    <td>
                      <span className={`pill ${d.daysLeft <= 14 ? 'pill-amber' : 'pill-blue'}`}>{d.daysLeft} Days</span>
                    </td>
                    <td>
                      <button className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>Open →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Service Modules */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Service Modules</h3>
              <span className="sec-link">All modules →</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }} data-testid="service-modules-grid">
              {serviceModules.map((m, idx) => (
                <Link
                  key={idx}
                  to={m.path}
                  className="nn-card"
                  style={{ padding: '14px 16px', textDecoration: 'none', transition: 'all 0.15s', cursor: 'pointer' }}
                  data-testid={`module-${m.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h4 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{m.name}</h4>
                    <ChevronRight size={14} color="var(--muted)" />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{m.desc}</div>
                  <span className={`pill ${m.badgeType}`}>{m.badge}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Activity Card */}
          <div className="nn-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Recent Activity</h3>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Today</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>
              {activities.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  <div style={{ marginBottom: 4 }}>No recent activity</div>
                  <div style={{ fontSize: 11, color: 'var(--light)' }}>Actions will appear here</div>
                </div>
              ) : (
                activities.slice(0, 6).map((a, idx) => (
                  <div key={idx} style={{ padding: '10px 16px', borderBottom: '1px solid var(--nn-border)', display: 'flex', gap: 10 }} data-testid="activity-item">
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{a.description}</div>
                      {a.client_name && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{a.client_name}</div>}
                      <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 2 }}>{new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--nn-border)', textAlign: 'center' }}>
              <Link to="/calendar" className="sec-link" data-testid="view-calendar-link">View calendar →</Link>
            </div>
          </div>

          {/* Today's Schedule */}
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Today's Schedule</h3>
              <Calendar size={14} color="var(--muted)" />
            </div>
            <div>
              {calendarEvents.map((ev, idx) => (
                <div key={idx} style={{ padding: '10px 16px', borderBottom: idx < calendarEvents.length - 1 ? '1px solid var(--nn-border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{ev.time}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 1 }}>{ev.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
