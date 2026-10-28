import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Download, Plane } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

// unit rendering: P present, L leave, A absent, H holiday, SC unconfirmed working saturday, · unmarked
const UNIT_STYLE = {
  present: { bg: '#0e6db4', color: '#fff' },
  leave: { bg: '#d39835', color: '#fff' },
  absent: { bg: '#d36b6b', color: '#fff' },
  holiday: { bg: '#eef3f7', color: '#6b8799' },
  sc: { bg: '#fdf3e0', color: '#b68128' },
  future: { bg: 'transparent', color: '#c3d2dd' },
};
const label = { present: 'P', leave: 'L', absent: 'A', holiday: 'H', sc: 'SC', future: '·' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const AttendanceLeave = () => {
  const { user } = useOutletContext();
  const isPartner = user?.role === 'partner';
  const [tab, setTab] = useState('Attendance');
  const now = new Date();
  const [month, setMonth] = useState(now.toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [leaves, setLeaves] = useState({ requests: [], monthly_grid: [] });
  const [loading, setLoading] = useState(true);
  const [markFor, setMarkFor] = useState(null);   // {user, date, am, pm}
  const [mark, setMark] = useState({ am: 'present', pm: 'present' });
  const [leaveForm, setLeaveForm] = useState({ user_id: '', from_date: '', to_date: '', days: 1, leave_type: 'Annual', reason: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, s, l] = await Promise.all([
        axios.get(`${API}/attendance/month?month=${month}`, { withCredentials: true }),
        axios.get(`${API}/attendance/summary?month=${month}`, { withCredentials: true }),
        axios.get(`${API}/attendance/leave?year=${month.slice(0, 4)}`, { withCredentials: true }),
      ]);
      setData(m.data); setSummary(s.data); setLeaves(l.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const shiftMonth = (k) => {
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() + k);
    setMonth(d.toISOString().slice(0, 7));
  };

  const saveMark = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/attendance/mark`, { user_id: markFor.user_id, date: markFor.date, ...mark }, { withCredentials: true });
      setMarkFor(null);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const saveLeave = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/attendance/leave`, leaveForm, { withCredentials: true });
      setLeaveForm({ user_id: '', from_date: '', to_date: '', days: 1, leave_type: 'Annual', reason: '' });
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const decide = async (leaveId, status) => {
    try {
      await axios.patch(`${API}/attendance/leave/${leaveId}?status=${status}`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert('Failed'); }
  };

  const exportMonth = () => {
    if (!data) return;
    const rows = [['Staff', 'Month', 'Attendance days', 'Leave days']];
    data.staff.forEach(s => rows.push([s.name, month, s.attendance_days, s.leave_days]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `attendance-${month}.csv`;
    a.click();
  };

  if (loading || !data || !summary) return <div className="page-loading">Loading attendance…</div>;

  return (
    <div className="ov-wrap" data-testid="attendance-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">EVERY DAY, CLEARLY RECORDED</div>
          <h1>Attendance &amp; leave</h1>
          <p>Every staff member. Every month. Leave and Saturday compensation, clearly connected.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="af-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={14} /></button>
          <div className="ov-asof">{new Date(month + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
          <button className="af-btn" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={14} /></button>
          <button className="af-btn" onClick={exportMonth}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export</button>
        </div>
      </div>

      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <section className="af-card af-metric"><label>Attendance recorded</label><b>{summary.attendance_days} days</b><small>AM/PM half-day units</small></section>
        <section className="af-card af-metric"><label>Approved leave taken</label><b>{summary.leave_days} days</b><small>This month</small></section>
        <section className="af-card af-metric"><label>Pending leave</label><b>{summary.pending_leave} day(s)</b><small>Approval pending</small></section>
        <section className="af-card af-metric"><label>Unmarked working days</label><b>{summary.unmarked_days}</b><small>Not assumed present or absent</small></section>
      </div>

      <div className="af-tabs">
        {['Attendance', 'Monthly leave overview', 'Leave requests', 'Holidays & policy'].map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Attendance' && (
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Daily register — {new Date(month + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
              <div className="af-sub">Click a day cell to mark AM/PM · P present · L leave · A absent · H holiday · SC working Saturday (unconfirmed)</div></div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="af-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>STAFF</th>
                  {data.days.map(d => <th key={d} style={{ padding: '6px 2px', textAlign: 'center' }}>{Number(d.slice(8))}</th>)}
                  <th>DAYS</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map(s => (
                  <tr key={s.user_id}>
                    <td style={{ position: 'sticky', left: 0, background: 'white', whiteSpace: 'nowrap' }}><b>{s.name}</b><small>{s.title}</small></td>
                    {s.cells.map((c, i) => {
                      const st = c.am === c.pm ? (UNIT_STYLE[c.am] || UNIT_STYLE.future) : { background: 'linear-gradient(135deg, ' + (UNIT_STYLE[c.am] || UNIT_STYLE.future).bg + ' 50%, ' + (UNIT_STYLE[c.pm] || UNIT_STYLE.future).bg + ' 50%)' };
                      return (
                        <td key={i} style={{ padding: 0, textAlign: 'center' }}>
                          {isPartner && c.date <= new Date().toISOString().slice(0, 10) ? (
                            <button data-testid={`att-${s.user_id}-${c.date}`}
                              onClick={() => { setMarkFor(s); setMark({ am: c.am === 'workday' || c.am === 'sc' || c.am === 'holiday' ? 'present' : c.am, pm: c.pm === 'workday' || c.pm === 'sc' || c.pm === 'holiday' ? 'present' : c.pm }); }}
                              style={{ width: 26, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontWeight: 600, ...st }}>
                              {c.am === c.pm ? label[c.am] : label[c.am] + label[c.pm]}
                            </button>
                          ) : (
                            <span style={{ display: 'inline-block', width: 26, height: 26, lineHeight: '26px', fontSize: 9, fontWeight: 600, borderRadius: 4, ...st }}>{c.am === c.pm ? label[c.am] : label[c.am] + label[c.pm]}</span>
                          )}
                        </td>
                      );
                    })}
                    <td><b>{s.attendance_days}</b><small>+{s.leave_days}L</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Monthly leave overview' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>{month.slice(0, 4)} · Leave taken by staff, month by month</h2><div className="af-sub">Approved leave · full day = 1, half day = 0.5</div></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="af-table">
              <thead><tr><th>STAFF</th>{MONTHS.map(m => <th key={m}>{m.slice(0, 3)}</th>)}<th>YEAR</th></tr></thead>
              <tbody>
                {leaves.monthly_grid.map(g => (
                  <tr key={g.name}>
                    <td><b>{g.name}</b></td>
                    {MONTHS.map((m, i) => <td key={m}>{g.months[`${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`] || 0}</td>)}
                    <td><b>{Object.values(g.months).reduce((a, b) => a + b, 0)}</b></td>
                  </tr>
                ))}
                {leaves.monthly_grid.length === 0 && <tr><td colSpan="14" className="af-empty">No approved leave recorded this year yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Leave requests' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Leave requests</h2><div className="af-sub">Partner approval queue</div></div></div>
          {isPartner && (
            <div className="af-formrow" style={{ maxWidth: 620 }}>
              <label>New request (staff member, dates, type)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={leaveForm.user_id} onChange={e => setLeaveForm({ ...leaveForm, user_id: e.target.value })} style={{ flex: 2 }}>
                  <option value="">Staff…</option>
                  {data.staff.map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
                </select>
                <input type="date" value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
                <input type="date" value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
                <input type="number" step="0.5" value={leaveForm.days} onChange={e => setLeaveForm({ ...leaveForm, days: parseFloat(e.target.value) })} style={{ width: 80 }} />
                <select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                  {['Annual', 'Sick', 'Public holiday', 'Comp-off (Saturday)', 'Unpaid'].map(t => <option key={t}>{t}</option>)}
                </select>
                <button className="af-btn-primary" onClick={saveLeave} disabled={saving || !leaveForm.user_id || !leaveForm.from_date} data-testid="add-leave-btn"><Plane size={13} /> Add</button>
              </div>
            </div>
          )}
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>STAFF</th><th>FROM → TO</th><th>DAYS</th><th>TYPE</th><th>STATUS</th><th></th></tr></thead>
              <tbody>
                {leaves.requests.map(l => (
                  <tr key={l.leave_id}>
                    <td><b>{l.name}</b></td>
                    <td>{fmt(l.from_date)} → {fmt(l.to_date)}</td>
                    <td>{l.days}</td>
                    <td>{l.leave_type}</td>
                    <td><span className={`af-badge ${l.status === 'Approved' ? 'af-badge-green' : l.status === 'Rejected' ? 'af-badge-red' : 'af-badge-amber'}`}>{l.status}</span></td>
                    <td>
                      {isPartner && l.status === 'Pending' && <>
                        <button className="af-link" onClick={() => decide(l.leave_id, 'Approved')}>Approve</button>
                        <button className="af-link" style={{ marginLeft: 8, color: 'var(--red)' }} onClick={() => decide(l.leave_id, 'Rejected')}>Reject</button>
                      </>}
                    </td>
                  </tr>
                ))}
                {leaves.requests.length === 0 && <tr><td colSpan="6" className="af-empty">No leave requests this year.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Holidays & policy' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Working-week rule &amp; holidays</h2><div className="af-sub">UAE firm policy</div></div></div>
          <p className="af-note" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <b>Nov–Dec:</b> Saturday &amp; Sunday off.<br />
            <b>Jan–Oct:</b> alternate-Saturday schedule — unconfirmed Saturdays show <b>SC</b>; mark them present/off as decided.<br />
            Attendance is recorded in AM/PM half-day units. Leave and compensation connect automatically.
          </p>
        </section>
      )}

      {/* mark modal */}
      {markFor && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setMarkFor(null)}>
          <div className="af-dialog" data-testid="mark-attendance-modal">
            <button className="af-close" onClick={() => setMarkFor(null)}>×</button>
            <h2>Mark attendance</h2>
            <p className="af-sub">{markFor.name} · {fmt(markFor.date)}</p>
            {['am', 'pm'].map(half => (
              <div className="af-formrow" key={half}>
                <label>{half.toUpperCase()}</label>
                <select value={mark[half]} onChange={e => setMark({ ...mark, [half]: e.target.value })}>
                  <option value="present">Present</option>
                  <option value="leave">Leave</option>
                  <option value="absent">Absent</option>
                  <option value="holiday">Holiday</option>
                </select>
              </div>
            ))}
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={saveMark} disabled={saving} data-testid="save-attendance-btn">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceLeave;
