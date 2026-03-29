import React from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Bell, Clock, AlertTriangle, FileText, Shield } from 'lucide-react';

const Reminders = () => {
  const { user } = useOutletContext();

  const reminders = [
    { title: 'VAT Returns — all 5 clients', desc: 'Due 28 Apr 2026', daysLeft: '32 days', priority: 'high', icon: FileText, color: 'var(--red)', bg: 'var(--red-bg)', count: 5 },
    { title: 'AML Monthly Reviews — 3 clients', desc: 'Due 10 Apr 2026', daysLeft: '14 days', priority: 'high', icon: Shield, color: 'var(--amber)', bg: 'var(--amber-bg)', count: 3 },
    { title: 'Internal Audit Reports — 3 reports', desc: 'Due 10 Apr 2026', daysLeft: '14 days', priority: 'high', icon: FileText, color: 'var(--amber)', bg: 'var(--amber-bg)', count: 3 },
    { title: 'CT Return — Gulf Pharma Group', desc: 'Due 30 Apr 2026', daysLeft: '34 days', priority: 'medium', icon: FileText, color: 'var(--blue)', bg: 'var(--blue-bg)', count: 1 },
    { title: 'Sunrise Holdings — DED approval expected', desc: 'Company formation in process', daysLeft: 'Ongoing', priority: 'low', icon: Clock, color: 'var(--purple)', bg: 'var(--purple-bg)', count: 1 },
  ];

  const quickLinks = [
    { label: 'Deadline Tracker', path: '/deadlines', icon: Clock, desc: '21 items tracked' },
    { label: 'AML Compliance', path: '/aml/review', icon: Shield, desc: '3 reports due' },
    { label: 'VAT Filing', path: '/vat/filing', icon: FileText, desc: '5 returns pending' },
  ];

  const monthlyChecklist = [
    { label: 'VAT returns filed', done: false, total: 5, completed: 0 },
    { label: 'AML reviews completed', done: false, total: 3, completed: 0 },
    { label: 'Internal audit reports', done: false, total: 3, completed: 0 },
    { label: 'Staff appreciation done', done: false, total: 9, completed: 0 },
    { label: 'CT returns reviewed', done: false, total: 1, completed: 0 },
  ];

  return (
    <div className="fade-in" data-testid="reminders-view">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 285px', gap: 14 }}>
        {/* Main Reminders */}
        <div>
          {/* Summary Banner */}
          <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={18} color="var(--amber)" />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Monthly Compliance Reminders</h3>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>March 2026 · {reminders.length} active alerts</p>
              </div>
            </div>
            <span className="pill pill-amber">{reminders.filter(r => r.priority === 'high').length} urgent</span>
          </div>

          {/* Reminder Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reminders.map((r, idx) => {
              const Icon = r.icon;
              return (
                <div key={idx} className="nn-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }} data-testid={`reminder-item-${idx}`}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} color={r.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.title}</h4>
                      <span className={`pill ${r.priority === 'high' ? 'pill-red' : r.priority === 'medium' ? 'pill-blue' : 'pill-navy'}`} style={{ fontSize: 10 }}>
                        {r.daysLeft}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{r.desc}</p>
                  </div>
                  <div style={{ background: 'var(--off)', borderRadius: 6, padding: '4px 10px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{r.count}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>items</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Quick Links */}
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Quick Links</h3>
            </div>
            {quickLinks.map((ql, idx) => {
              const Icon = ql.icon;
              return (
                <Link key={idx} to={ql.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: idx < quickLinks.length - 1 ? '1px solid var(--nn-border)' : 'none', textDecoration: 'none', transition: 'background 0.12s' }}>
                  <Icon size={14} color="var(--gold4)" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{ql.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{ql.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Monthly Checklist */}
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Monthly Checklist</h3>
            </div>
            <div style={{ padding: '8px 0' }}>
              {monthlyChecklist.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${item.done ? 'var(--green)' : 'var(--nn-border)'}`,
                    background: item.done ? 'var(--green-bg)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {item.done && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: item.done ? 'var(--muted)' : 'var(--text)' }}>{item.label}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.completed}/{item.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Key Dates */}
          <div className="nn-card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 10 }}>Key Dates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { date: '10 Apr', label: 'AML + Internal Audit', color: 'var(--red)' },
                { date: '28 Apr', label: 'VAT Returns Deadline', color: 'var(--amber)' },
                { date: '30 Apr', label: 'CT Return — Gulf Pharma', color: 'var(--blue)' },
              ].map((d, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 20, borderRadius: 2, background: d.color }} />
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: d.color }}>{d.date}</div>
                    <div style={{ fontSize: 11, color: 'var(--text)' }}>{d.label}</div>
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

export default Reminders;
