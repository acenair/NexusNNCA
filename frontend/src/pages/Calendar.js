import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Users, Mail, Clock, AlertTriangle } from 'lucide-react';

const CalendarPage = () => {
  const { user } = useOutletContext();
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 2, 1)); // March 2026
  const [showEventModal, setShowEventModal] = useState(false);

  const events = {
    '2026-03-03': [{ title: 'Al Baraka VAT Review', type: 'meeting', color: 'var(--green)' }],
    '2026-03-05': [{ title: 'Falcon AML Follow-up', type: 'followup', color: 'var(--blue)' }],
    '2026-03-10': [
      { title: 'AML Reports Due (3)', type: 'deadline', color: 'var(--red)' },
      { title: 'Internal Audit Due (3)', type: 'deadline', color: 'var(--red)' },
    ],
    '2026-03-12': [{ title: 'Gulf Pharma Fieldwork', type: 'task', color: 'var(--purple)' }],
    '2026-03-15': [{ title: 'Marina Holdings Planning', type: 'meeting', color: 'var(--green)' }],
    '2026-03-18': [{ title: 'Zara Tech Reporting', type: 'task', color: 'var(--purple)' }],
    '2026-03-20': [{ title: 'Staff Meeting', type: 'meeting', color: 'var(--green)' }],
    '2026-03-24': [{ title: 'CT Return Review', type: 'task', color: 'var(--purple)' }],
    '2026-03-27': [
      { title: 'Al Hayat Audit Due', type: 'deadline', color: 'var(--red)' },
      { title: 'Sunrise Holdings Follow-up', type: 'followup', color: 'var(--blue)' },
    ],
    '2026-03-28': [{ title: 'VAT Returns Due (5)', type: 'deadline', color: 'var(--red)' }],
  };

  const upcomingEvents = [
    { date: '10 Apr', title: 'AML Monthly Reports (3)', type: 'deadline', color: 'var(--red)' },
    { date: '10 Apr', title: 'Internal Audit Reports (3)', type: 'deadline', color: 'var(--red)' },
    { date: '10 Apr', title: 'Statutory Audit — Al Hayat', type: 'deadline', color: 'var(--amber)' },
    { date: '15 Apr', title: 'Al Baraka Fieldwork Review', type: 'meeting', color: 'var(--green)' },
    { date: '28 Apr', title: 'VAT Returns Due (5)', type: 'deadline', color: 'var(--red)' },
    { date: '30 Apr', title: 'Corporate Tax — Gulf Pharma', type: 'deadline', color: 'var(--amber)' },
  ];

  const eventTypes = [
    { label: 'Meeting', color: 'var(--green)', bg: 'var(--green-bg)' },
    { label: 'Follow-up', color: 'var(--blue)', bg: 'var(--blue-bg)' },
    { label: 'Task', color: 'var(--purple)', bg: 'var(--purple-bg)' },
    { label: 'Deadline', color: 'var(--red)', bg: 'var(--red-bg)' },
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const getDateKey = (day) => {
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${currentMonth.getFullYear()}-${m}-${d}`;
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
  };

  return (
    <div className="fade-in" data-testid="calendar-view">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 16, alignItems: 'start' }}>
        {/* Calendar Main */}
        <div className="nn-card" style={{ overflow: 'hidden' }}>
          {/* Calendar Header */}
          <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 20, marginBottom: 2 }}>{monthName}</h2>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Nair & Nelliyatt Chartered Accountants</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="cal-prev-btn">
                <ChevronLeft size={16} />
              </button>
              <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="cal-next-btn">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Event type pills */}
          <div style={{ padding: '8px 16px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', gap: 8 }}>
            {eventTypes.map((t) => (
              <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: t.color, fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} /> {t.label}
              </span>
            ))}
          </div>

          {/* Days of Week */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)' }}>
            {daysOfWeek.map((d) => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calendarDays.map((day, idx) => {
              const dateKey = day ? getDateKey(day) : null;
              const dayEvents = dateKey ? events[dateKey] || [] : [];
              return (
                <div
                  key={idx}
                  style={{
                    minHeight: 80, padding: '4px 6px',
                    borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--nn-border)',
                    borderBottom: '1px solid var(--nn-border)',
                    background: day && isToday(day) ? 'rgba(201,168,76,0.06)' : 'transparent',
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: 12, fontWeight: isToday(day) ? 700 : 400,
                        color: isToday(day) ? 'var(--gold4)' : 'var(--text)',
                        marginBottom: 3,
                        width: 22, height: 22, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday(day) ? 'var(--gold)' : 'transparent',
                        ...(isToday(day) ? { color: '#fff' } : {}),
                      }}>
                        {day}
                      </div>
                      {dayEvents.slice(0, 2).map((ev, i) => (
                        <div key={i} style={{
                          fontSize: 9, padding: '2px 4px', borderRadius: 3, marginBottom: 2,
                          background: ev.type === 'deadline' ? 'var(--red-bg)' : ev.type === 'meeting' ? 'var(--green-bg)' : ev.type === 'followup' ? 'var(--blue-bg)' : 'var(--purple-bg)',
                          color: ev.color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div style={{ fontSize: 9, color: 'var(--gold4)', fontWeight: 600, cursor: 'pointer' }}>+{dayEvents.length - 2} more</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="tbtn tbtn-green" style={{ justifyContent: 'center', padding: '10px 0' }} onClick={() => setShowEventModal(true)} data-testid="cal-new-meeting">
              <Users size={13} /> Meeting
            </button>
            <button className="tbtn tbtn-blue" style={{ justifyContent: 'center', padding: '10px 0' }} onClick={() => setShowEventModal(true)} data-testid="cal-new-followup">
              <Mail size={13} /> Follow-up
            </button>
            <button className="tbtn" style={{ justifyContent: 'center', padding: '10px 0', background: 'var(--purple-bg)', color: 'var(--purple)' }} onClick={() => setShowEventModal(true)} data-testid="cal-new-task">
              <Clock size={13} /> Task
            </button>
            <button className="tbtn" style={{ justifyContent: 'center', padding: '10px 0', background: 'var(--red-bg)', color: 'var(--red)' }} onClick={() => setShowEventModal(true)} data-testid="cal-new-deadline">
              <AlertTriangle size={13} /> Deadline
            </button>
          </div>

          {/* Upcoming Events */}
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Upcoming Events</h3>
            </div>
            <div>
              {upcomingEvents.map((ev, idx) => (
                <div key={idx} style={{ padding: '10px 16px', borderBottom: idx < upcomingEvents.length - 1 ? '1px solid var(--nn-border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{ev.date}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 1 }}>{ev.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* This Month Summary */}
          <div className="nn-card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 10 }}>This Month</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Meetings', count: 4, color: 'var(--green)' },
                { label: 'Follow-ups', count: 3, color: 'var(--blue)' },
                { label: 'Tasks', count: 5, color: 'var(--purple)' },
                { label: 'Deadlines', count: 8, color: 'var(--red)' },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="modal-overlay" onClick={() => setShowEventModal(false)} data-testid="event-modal">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>New Event</h3>
              <button onClick={() => setShowEventModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18 }}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Event Type</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Meeting', 'Follow-up', 'Task', 'Deadline'].map((t) => (
                    <button key={t} className="tbtn tbtn-outline" style={{ flex: 1, justifyContent: 'center' }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Title / Subject</label>
                <input type="text" placeholder="e.g. Al Baraka VAT Review Meeting" style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }} data-testid="event-title-input" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Date</label>
                  <input type="date" defaultValue="2026-03-27" style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Time</label>
                  <input type="time" defaultValue="10:00" style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Client / Reference</label>
                <input type="text" placeholder="Client name or reference" style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Notes / Agenda</label>
                <textarea placeholder="Agenda items, follow-up actions, or notes..." rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans', resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowEventModal(false)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={() => setShowEventModal(false)}>Save Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
