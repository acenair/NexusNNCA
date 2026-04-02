import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Users, Mail, Clock, AlertTriangle, X, CheckCircle } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CalendarPage = () => {
  const { user } = useOutletContext();
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 2, 1));
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('meeting');
  const [events, setEvents] = useState({});
  const [allEvents, setAllEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [eventForm, setEventForm] = useState({ title: '', date: '', time: '', client_name: '', client_id: '', notes: '', assigned_to: '', assigned_to_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Seed events for display
  const seedEvents = {
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
    '2026-03-27': [{ title: 'Al Hayat Audit Due', type: 'deadline', color: 'var(--red)' }, { title: 'Sunrise Follow-up', type: 'followup', color: 'var(--blue)' }],
    '2026-03-28': [{ title: 'VAT Returns Due (5)', type: 'deadline', color: 'var(--red)' }],
    '2026-04-10': [{ title: 'AML Reports (3)', type: 'deadline', color: 'var(--red)' }, { title: 'Internal Audit (3)', type: 'deadline', color: 'var(--red)' }],
    '2026-04-15': [{ title: 'Al Baraka Fieldwork', type: 'meeting', color: 'var(--green)' }],
    '2026-04-28': [{ title: 'VAT Returns Due (5)', type: 'deadline', color: 'var(--red)' }],
    '2026-04-30': [{ title: 'CT — Gulf Pharma', type: 'deadline', color: 'var(--red)' }],
  };

  useEffect(() => { loadEvents(); }, [currentMonth]);

  const loadEvents = async () => {
    const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    try {
      const res = await axios.get(`${API}/events?month=${monthStr}`, { withCredentials: true });
      const dbEvents = {};
      res.data.forEach(ev => {
        const colorMap = { meeting: 'var(--green)', followup: 'var(--blue)', task: 'var(--purple)', deadline: 'var(--red)' };
        if (!dbEvents[ev.date]) dbEvents[ev.date] = [];
        dbEvents[ev.date].push({ title: ev.title, type: ev.event_type, color: colorMap[ev.event_type] || 'var(--gold)', event_id: ev.event_id });
      });
      // Merge seed events with DB events
      const merged = { ...seedEvents };
      Object.entries(dbEvents).forEach(([date, evts]) => {
        if (merged[date]) merged[date] = [...merged[date], ...evts];
        else merged[date] = evts;
      });
      setEvents(merged);
      setAllEvents(res.data);
    } catch (err) {
      setEvents(seedEvents);
    }
  };

  const loadLists = async () => {
    try {
      const [cr, ur] = await Promise.all([
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`),
      ]);
      setClients(cr.data);
      setStaffList(ur.data.filter(u => u.role === 'staff'));
    } catch (err) { /* ignore */ }
  };

  const openModal = (type) => {
    setEventType(type);
    setEventForm({ title: '', date: '', time: '', client_name: '', client_id: '', notes: '', assigned_to: '', assigned_to_name: '' });
    setSuccessMsg('');
    setShowEventModal(true);
    loadLists();
  };

  const handleSubmitEvent = async () => {
    if (!eventForm.title || !eventForm.date) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/events`, { ...eventForm, event_type: eventType }, { withCredentials: true });
      const label = { meeting: 'Meeting', followup: 'Follow-up', task: 'Task', deadline: 'Deadline' }[eventType];
      setSuccessMsg(`${label} "${eventForm.title}" added to calendar`);
      setTimeout(() => { setShowEventModal(false); setSuccessMsg(''); loadEvents(); }, 1800);
    } catch (err) { console.error('Failed to create event:', err); }
    finally { setSubmitting(false); }
  };

  const handleClientChange = (e) => {
    const id = e.target.value;
    const c = clients.find(x => x.client_id === id);
    setEventForm(p => ({ ...p, client_id: id, client_name: c?.name || '' }));
  };

  const handleStaffChange = (e) => {
    const email = e.target.value;
    const s = staffList.find(x => x.email === email);
    setEventForm(p => ({ ...p, assigned_to: email, assigned_to_name: s?.name || '' }));
  };

  const eventTypes = [
    { key: 'meeting', label: 'Meeting', color: 'var(--green)', bg: 'var(--green-bg)' },
    { key: 'followup', label: 'Follow-up', color: 'var(--blue)', bg: 'var(--blue-bg)' },
    { key: 'task', label: 'Task', color: 'var(--purple)', bg: 'var(--purple-bg)' },
    { key: 'deadline', label: 'Deadline', color: 'var(--red)', bg: 'var(--red-bg)' },
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const getDaysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (d) => { const day = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); return day === 0 ? 6 : day - 1; };
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);
  const getDateKey = (day) => `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isToday = (day) => { const t = new Date(); return day === t.getDate() && currentMonth.getMonth() === t.getMonth() && currentMonth.getFullYear() === t.getFullYear(); };

  // Compute upcoming events across months
  const upcomingEvents = [
    { date: '10 Apr', title: 'AML Monthly Reports (3)', type: 'deadline', color: 'var(--red)' },
    { date: '10 Apr', title: 'Internal Audit Reports (3)', type: 'deadline', color: 'var(--red)' },
    { date: '15 Apr', title: 'Al Baraka Fieldwork Review', type: 'meeting', color: 'var(--green)' },
    { date: '28 Apr', title: 'VAT Returns Due (5)', type: 'deadline', color: 'var(--red)' },
    { date: '30 Apr', title: 'Corporate Tax — Gulf Pharma', type: 'deadline', color: 'var(--amber)' },
    ...allEvents.map(ev => ({ date: ev.date, title: ev.title, type: ev.event_type, color: { meeting: 'var(--green)', followup: 'var(--blue)', task: 'var(--purple)', deadline: 'var(--red)' }[ev.event_type] || 'var(--gold)' })),
  ];

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };

  const [selectedDay, setSelectedDay] = useState(null);
  const daysOfWeekShort = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="fade-in" data-testid="calendar-view">
      <div className="cal-layout">
        {/* Calendar Main */}
        <div className="nn-card" style={{ overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18, marginBottom: 2 }}>{monthName}</h2>
              <div className="cal-subtitle" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Nair & Nelliyatt Chartered Accountants</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="cal-prev-btn"><ChevronLeft size={16} /></button>
              <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="cal-next-btn"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="cal-legend" style={{ padding: '6px 12px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eventTypes.map(t => (
              <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: t.color, fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} /> {t.label}
              </span>
            ))}
          </div>

          {/* Day headers - full names on desktop, single letter on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)' }}>
            {daysOfWeek.map((d, i) => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span className="cal-day-full">{d}</span>
                <span className="cal-day-short">{daysOfWeekShort[i]}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calendarDays.map((day, idx) => {
              const dateKey = day ? getDateKey(day) : null;
              const dayEvents = dateKey ? events[dateKey] || [] : [];
              const isSelected = selectedDay === day;
              return (
                <div
                  key={idx}
                  className="cal-cell"
                  onClick={() => day && dayEvents.length > 0 && setSelectedDay(isSelected ? null : day)}
                  style={{
                    padding: '4px 4px', 
                    borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--nn-border)', 
                    borderBottom: '1px solid var(--nn-border)', 
                    background: day && isToday(day) ? 'rgba(201,168,76,0.06)' : isSelected ? 'rgba(201,168,76,0.03)' : 'transparent',
                    cursor: day && dayEvents.length > 0 ? 'pointer' : 'default',
                  }}
                >
                  {day && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: isToday(day) ? 700 : 400, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday(day) ? 'var(--gold)' : 'transparent', color: isToday(day) ? '#fff' : 'var(--text)', marginBottom: 2 }}>{day}</div>
                      {/* Desktop: show event titles */}
                      <div className="cal-events-desktop">
                        {dayEvents.slice(0, 2).map((ev, i) => (
                          <div key={i} style={{ fontSize: 9, padding: '2px 4px', borderRadius: 3, marginBottom: 2, background: ev.type === 'deadline' ? 'var(--red-bg)' : ev.type === 'meeting' ? 'var(--green-bg)' : ev.type === 'followup' ? 'var(--blue-bg)' : 'var(--purple-bg)', color: ev.color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                        ))}
                        {dayEvents.length > 2 && <div style={{ fontSize: 9, color: 'var(--gold4)', fontWeight: 600 }}>+{dayEvents.length - 2} more</div>}
                      </div>
                      {/* Mobile: show colored dots */}
                      {dayEvents.length > 0 && (
                        <div className="cal-events-mobile" style={{ display: 'none', gap: 2, justifyContent: 'center', flexWrap: 'wrap', marginTop: 1 }}>
                          {dayEvents.slice(0, 3).map((ev, i) => (
                            <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: ev.color }} />
                          ))}
                          {dayEvents.length > 3 && <span style={{ fontSize: 7, color: 'var(--muted)', fontWeight: 700 }}>+</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile: selected day event details */}
          {selectedDay && (
            <div className="cal-day-detail" style={{ borderTop: '1px solid var(--nn-border)', padding: '10px 14px', background: 'var(--off)' }} data-testid="cal-day-detail">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{getDateKey(selectedDay)}</span>
                <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
              </div>
              {(events[getDateKey(selectedDay)] || []).map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < (events[getDateKey(selectedDay)]?.length || 0) - 1 ? '1px solid var(--nn-border)' : 'none' }}>
                  <span style={{ width: 4, height: 18, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{ev.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="cal-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="tbtn tbtn-green" style={{ justifyContent: 'center', padding: '10px 0' }} onClick={() => openModal('meeting')} data-testid="cal-new-meeting"><Users size={13} /> Meeting</button>
            <button className="tbtn tbtn-blue" style={{ justifyContent: 'center', padding: '10px 0' }} onClick={() => openModal('followup')} data-testid="cal-new-followup"><Mail size={13} /> Follow-up</button>
            <button className="tbtn" style={{ justifyContent: 'center', padding: '10px 0', background: 'var(--purple-bg)', color: 'var(--purple)' }} onClick={() => openModal('task')} data-testid="cal-new-task"><Clock size={13} /> Task</button>
            <button className="tbtn" style={{ justifyContent: 'center', padding: '10px 0', background: 'var(--red-bg)', color: 'var(--red)' }} onClick={() => openModal('deadline')} data-testid="cal-new-deadline"><AlertTriangle size={13} /> Deadline</button>
          </div>

          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Upcoming Events</h3>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {upcomingEvents.slice(0, 8).map((ev, idx) => (
                <div key={idx} style={{ padding: '10px 16px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{ev.date}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 1 }}>{ev.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="nn-card" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 10 }}>This Month</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Meetings', count: Object.values(events).flat().filter(e => e.type === 'meeting').length, color: 'var(--green)' },
                { label: 'Follow-ups', count: Object.values(events).flat().filter(e => e.type === 'followup').length, color: 'var(--blue)' },
                { label: 'Tasks', count: Object.values(events).flat().filter(e => e.type === 'task').length, color: 'var(--purple)' },
                { label: 'Deadlines', count: Object.values(events).flat().filter(e => e.type === 'deadline').length, color: 'var(--red)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} /><span style={{ fontSize: 12, color: 'var(--text)' }}>{s.label}</span></div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Calendar CSS */}
      <style>{`
        .cal-layout { display: grid; grid-template-columns: 1fr 290px; gap: 16px; align-items: start; }
        .cal-cell { min-height: 80px; }
        .cal-day-short { display: none; }
        .cal-events-mobile { display: none !important; }
        .cal-day-detail { display: none; }

        @media (max-width: 900px) {
          .cal-layout { grid-template-columns: 1fr !important; }
          .cal-sidebar { order: 2; }
        }
        @media (max-width: 640px) {
          .cal-cell { min-height: 44px !important; padding: 2px 1px !important; }
          .cal-day-full { display: none; }
          .cal-day-short { display: inline; }
          .cal-events-desktop { display: none !important; }
          .cal-events-mobile { display: flex !important; }
          .cal-day-detail { display: block !important; }
          .cal-subtitle { display: none; }
          .cal-legend { padding: 4px 8px !important; gap: 6px !important; }
          .cal-legend span { font-size: 9px !important; }
        }
      `}</style>

      {/* Event Modal */}
      {showEventModal && (
        <div className="modal-overlay" onClick={() => !submitting && setShowEventModal(false)} data-testid="cal-event-modal">
          <div className="modal-box" style={{ width: 510 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>
                {{ meeting: 'Schedule Meeting', followup: 'Create Follow-up', task: 'Add Task', deadline: 'Add Deadline' }[eventType]}
              </h3>
              <button onClick={() => setShowEventModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            {successMsg ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <CheckCircle size={42} color="var(--green)" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{successMsg}</div>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ marginBottom: 16, display: 'flex', gap: 6 }}>
                    {eventTypes.map(t => (
                      <button key={t.key} onClick={() => setEventType(t.key)} style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--rs)', border: eventType === t.key ? `2px solid ${t.color}` : '1px solid var(--nn-border)', background: eventType === t.key ? t.bg : 'var(--white)', color: t.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'center' }} data-testid={`cal-type-${t.key}`}>{t.label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Title *</label>
                    <input type="text" placeholder="Event title" value={eventForm.title} onChange={(e) => setEventForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} data-testid="cal-event-title" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Date *</label><input type="date" value={eventForm.date} onChange={(e) => setEventForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} data-testid="cal-event-date" /></div>
                    <div><label style={labelStyle}>Time</label><input type="time" value={eventForm.time} onChange={(e) => setEventForm(p => ({ ...p, time: e.target.value }))} style={inputStyle} data-testid="cal-event-time" /></div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Client</label>
                    <select value={eventForm.client_id} onChange={handleClientChange} style={inputStyle} data-testid="cal-event-client">
                      <option value="">— Select client —</option>
                      {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Assigned To</label>
                    <select value={eventForm.assigned_to} onChange={handleStaffChange} style={inputStyle} data-testid="cal-event-staff">
                      <option value="">— Select staff —</option>
                      {staffList.map(s => <option key={s.email} value={s.email}>{s.name} — {s.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes</label>
                    <textarea placeholder="Details..." rows={3} value={eventForm.notes} onChange={(e) => setEventForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} data-testid="cal-event-notes" />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowEventModal(false)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={handleSubmitEvent} disabled={submitting || !eventForm.title || !eventForm.date} style={{ opacity: (!eventForm.title || !eventForm.date) ? 0.5 : 1 }} data-testid="cal-event-submit">{submitting ? 'Saving...' : 'Save Event'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
