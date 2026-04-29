import React, { useState, useEffect } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { Bell, Clock, AlertTriangle, FileText, Shield, X, ChevronRight, Calendar, Users, Briefcase, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Reminders = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      const res = await axios.get(`${API}/reminders`, { withCredentials: true });
      setReminders(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = filterType === 'all' ? reminders : reminders.filter(r => r.type === filterType);
  const urgentCount = reminders.filter(r => r.severity === 'urgent').length;
  const warningCount = reminders.filter(r => r.severity === 'warning').length;

  const typeIcon = (type) => {
    switch (type) {
      case 'task': return FileText;
      case 'event': return Calendar;
      case 'engagement': return Briefcase;
      default: return Bell;
    }
  };

  const severityStyle = (severity) => {
    switch (severity) {
      case 'urgent': return { bg: 'var(--red-bg)', color: 'var(--red)', border: 'rgba(239,68,68,0.2)' };
      case 'warning': return { bg: 'rgba(245,158,11,0.06)', color: '#d97706', border: 'rgba(245,158,11,0.2)' };
      default: return { bg: 'var(--blue-bg)', color: 'var(--blue, #3b82f6)', border: 'rgba(59,130,246,0.15)' };
    }
  };

  const daysLabel = (days) => {
    if (days === null || days === undefined) return 'Ongoing';
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`;
    if (days === 0) return 'Due today';
    return `${days} day${days !== 1 ? 's' : ''} left`;
  };

  const handleNavigate = (reminder) => {
    if (reminder.type === 'engagement' && reminder.ref_id) {
      navigate(`/engagements/${reminder.ref_id}`);
    } else if (reminder.type === 'task') {
      navigate('/tasks');
    } else if (reminder.type === 'event') {
      navigate('/calendar');
    }
  };

  // Detail View
  if (selectedReminder) {
    const r = selectedReminder;
    const Icon = typeIcon(r.type);
    const sev = severityStyle(r.severity);
    return (
      <div className="fade-in" data-testid="reminder-detail-view">
        <button onClick={() => setSelectedReminder(null)} className="tbtn tbtn-outline" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }} data-testid="reminder-back-btn">
          <ArrowLeft size={14} /> Back to Reminders
        </button>

        <div className="nn-card" style={{ overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} style={{ color: 'var(--gold)' }} />
              </div>
              <div>
                <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18, margin: 0 }}>{r.title}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: sev.bg, color: sev.color, textTransform: 'uppercase' }}>
                    {r.type}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: sev.bg, color: sev.color }}>
                    {daysLabel(r.days_until)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: r.priority === 'High' ? 'var(--red-bg)' : r.priority === 'Medium' ? 'rgba(245,158,11,0.1)' : 'var(--blue-bg)', color: r.priority === 'High' ? 'var(--red)' : r.priority === 'Medium' ? '#d97706' : 'var(--blue, #3b82f6)' }}>
                    {r.priority} Priority
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.type === 'task' ? 'Task Reminder' : r.type === 'event' ? 'Event / Client Notification' : 'Engagement Reminder'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.status}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Due Date</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.due_date || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Assigned To</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.assigned_to || '—'}</div>
              </div>
              {r.client_name && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Client</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.client_name}</div>
                </div>
              )}
              {r.service_module && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Service / Module</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{r.service_module}</div>
                </div>
              )}
            </div>

            {r.description && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '10px 14px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>{r.description}</div>
              </div>
            )}

            <button onClick={() => handleNavigate(r)} className="tbtn tbtn-gold" data-testid="reminder-navigate-btn">
              {r.type === 'engagement' ? 'Open Engagement' : r.type === 'task' ? 'View Tasks' : 'View Calendar'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" data-testid="reminders-view">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 285px', gap: 14 }}>
        {/* Main Reminders */}
        <div>
          {/* Summary Banner */}
          <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={18} color="var(--amber)" />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Compliance Reminders</h3>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>{reminders.length} active alerts &middot; {urgentCount} overdue</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ key: 'all', label: 'All' }, { key: 'task', label: 'Tasks' }, { key: 'event', label: 'Events' }, { key: 'engagement', label: 'Engagements' }].map(f => (
                <button key={f.key} onClick={() => setFilterType(f.key)} style={{
                  padding: '5px 12px', borderRadius: 14, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: filterType === f.key ? '1px solid var(--gold)' : '1px solid var(--nn-border)',
                  background: filterType === f.key ? 'rgba(212,175,55,0.08)' : 'transparent',
                  color: filterType === f.key ? 'var(--gold4)' : 'var(--muted)', fontFamily: 'DM Sans',
                }} data-testid={`filter-${f.key}`}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* Reminder Items */}
          {loading ? (
            <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading reminders...</div>
          ) : filtered.length === 0 ? (
            <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No reminders to show.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((r, idx) => {
                const Icon = typeIcon(r.type);
                const sev = severityStyle(r.severity);
                return (
                  <div
                    key={r.reminder_id}
                    className="nn-card"
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', transition: 'border-color 0.15s', borderLeft: `3px solid ${sev.color}` }}
                    onClick={() => setSelectedReminder(r)}
                    data-testid={`reminder-item-${idx}`}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: sev.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} color={sev.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</h4>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: sev.bg, color: sev.color, textTransform: 'uppercase' }}>{r.type}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: sev.bg, color: sev.color }}>
                            {daysLabel(r.days_until)}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {r.client_name && <span>{r.client_name}</span>}
                        {r.assigned_to && <span>Assigned: {r.assigned_to}</span>}
                        {r.service_module && <span>{r.service_module}</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--light)', flexShrink: 0, marginTop: 8 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stats */}
          <div className="nn-card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 10 }}>Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>Overdue</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{urgentCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500 }}>Due Soon</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>{warningCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{reminders.length}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Quick Links</h3>
            </div>
            {[
              { label: 'Deadline Tracker', path: '/deadlines', icon: Clock },
              { label: 'Tasks', path: '/tasks', icon: FileText },
              { label: 'Calendar', path: '/calendar', icon: Calendar },
            ].map((ql, idx) => {
              const QIcon = ql.icon;
              return (
                <Link key={idx} to={ql.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: idx < 2 ? '1px solid var(--nn-border)' : 'none', textDecoration: 'none', transition: 'background 0.12s' }}>
                  <QIcon size={14} color="var(--gold4)" />
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{ql.label}</div>
                </Link>
              );
            })}
          </div>

          {/* Type Breakdown */}
          <div className="nn-card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 10 }}>By Type</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['task', 'event', 'engagement'].map(type => {
                const count = reminders.filter(r => r.type === type).length;
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>{type}s</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: count > 0 ? 'var(--gold4)' : 'var(--muted)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reminders;
