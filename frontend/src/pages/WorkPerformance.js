import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Download } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Math.round(Number(n || 0)).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const WorkPerformance = () => {
  const [util, setUtil] = useState([]);
  useEffect(() => {
    axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/insights/staff-utilization`, { withCredentials: true })
      .then(res => setUtil(res.data.staff || []))
      .catch(() => setUtil([]));
  }, []);
  const { user } = useOutletContext();
  const [engs, setEngs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staffFilter, setStaffFilter] = useState('');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/service/engagements`, { withCredentials: true }),
      axios.get(`${API}/invoices`, { withCredentials: true }),
      axios.get(`${API}/tasks`, { withCredentials: true }),
      axios.get(`${API}/auth/users-list`, { withCredentials: true }),
    ]).then(([e, i, t, u]) => {
      setEngs(Array.isArray(e.data) ? e.data : []);
      setInvoices(Array.isArray(i.data) ? i.data : []);
      setTasks(Array.isArray(t.data) ? t.data : []);
      setStaff(Array.isArray(u.data) ? u.data.filter(x => x.role !== 'client') : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const pendingOf = (i) => Math.max(0, (i.amount || 0) - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + (c.amount || 0), 0));

  const stats = useMemo(() => {
    const live = engs.filter(e => !staffFilter || e.assigned_to_name === staffFilter);
    const completedMonth = engs.filter(e => e.status === 'Completed' && ((e.updated_at || e.created_at || '') + '     ').slice(0, 7) >= month && (e.updated_at || e.created_at || '').slice(0, 7) <= month);
    const open = live.filter(e => e.status === 'Active');
    const pastDue = tasks.filter(t => t.status !== 'Completed' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10));
    const byStaff = staff.filter(s => !staffFilter || s.name === staffFilter).map(s => {
      const openE = open.filter(e => e.assigned_to_name === s.name);
      const myTasks = tasks.filter(t => t.assigned_to_name === s.name);
      const invPending = invoices.filter(i => i.staff === s.name && !i.cancelled).reduce((n, i) => n + pendingOf(i), 0);
      const doneTasks = myTasks.filter(t => t.status === 'Completed').length;
      return { name: s.name, title: s.title || '—', openEngs: openE.length, openTasks: myTasks.filter(t => t.status !== 'Completed').length, doneTasks, invPending };
    });
    const reviewQueue = open.filter(e => e.phase === 'Review & Reporting');
    return { completedMonth: completedMonth.length, open, pastDue, byStaff, reviewQueue };
  }, [engs, invoices, tasks, staff, month, staffFilter]);

  const exportCsv = () => {
    const rows = [['Staff', 'Title', 'Open engagements', 'Open tasks', 'Completed tasks', 'Pending invoicing']];
    stats.byStaff.forEach(s => rows.push([s.name, s.title, s.openEngs, s.openTasks, s.doneTasks, s.invPending]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `work-performance-${month}.csv`;
    a.click();
  };

  if (loading) return <div className="page-loading">Loading performance…</div>;

  return (
    <div className="ov-wrap" data-testid="performance-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">WORK · DELIVERY · QUALITY</div>
          <h1>Work &amp; performance</h1>
          <p>Balance workload. Track delivery. Understand capacity.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} aria-label="Filter staff">
            <option value="">All staff</option>
            {staff.map(s => <option key={s.user_id} value={s.name}>{s.name}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
            {Array.from({ length: 6 }, (_, k) => {
              const d = new Date(); d.setMonth(d.getMonth() - k);
              return <option key={d.toISOString().slice(0, 7)} value={d.toISOString().slice(0, 7)}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>;
            })}
          </select>
          <button className="af-btn" onClick={exportCsv}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export</button>
        </div>
      </div>

      <div className="af-card" style={{ marginBottom: 16 }} data-testid="utilization-card">
        <div className="af-cardhead"><div><h2>Staff utilization</h2><div className="af-sub">Allocated engagement hours vs working-day capacity · this month</div></div></div>
        {util.map(u => (
          <div key={u.user_id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <b>{u.name}</b>
              <span>{u.allocated}h allocated · {u.logged}h logged · {u.utilization_pct}% of {u.capacity}h</span>
            </div>
            <div style={{ height: 6, background: 'var(--line)', borderRadius: 4, marginTop: 6 }}>
              <div style={{ height: 6, borderRadius: 4, width: `${Math.min(100, u.utilization_pct)}%`, background: u.utilization_pct > 90 ? '#d36b6b' : u.utilization_pct > 60 ? '#d39835' : '#0e6db4' }} />
            </div>
          </div>
        ))}
        {util.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No utilization data yet.</p>}
      </div>
      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <section className="af-card af-metric"><label>Your team</label><b>{stats.open.length} open</b><small>{stats.completedMonth} completed this month</small></section>
        <section className="af-card af-metric"><label>Review checkpoints</label><b>{stats.reviewQueue.length}</b><small>Engagements in Review &amp; Reporting</small></section>
        <section className="af-card af-metric"><label>Open jobs past due</label><b>{stats.pastDue.length}</b><small>Tasks past their due date</small></section>
        <section className="af-card af-metric"><label>Awaiting client</label><b>{stats.open.filter(e => e.phase === 'Client Due Diligence').length}</b><small>Documents requested</small></section>
      </div>

      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead"><div><h2>Staff workload</h2><div className="af-sub">Open work and pending billing per staff member · {month}</div></div></div>
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>STAFF</th><th>TITLE</th><th>OPEN ENGAGEMENTS</th><th>OPEN TASKS</th><th>COMPLETED TASKS</th><th>PENDING INVOICING</th><th></th></tr></thead>
            <tbody>
              {stats.byStaff.map(s => (
                <tr key={s.name}>
                  <td><b>{s.name}</b></td>
                  <td>{s.title}</td>
                  <td><b>{s.openEngs}</b></td>
                  <td>{s.openTasks}</td>
                  <td>{s.doneTasks}</td>
                  <td><b>{aed(s.invPending)}</b></td>
                  <td><Link className="af-link" to="/app/engagements">Engagements ↗</Link></td>
                </tr>
              ))}
              {stats.byStaff.length === 0 && <tr><td colSpan="7" className="af-empty">No staff data.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="af-note">Hours-ledger comparison (allocated vs actual effort) activates once the time ledger from Attendance is in use.</p>
      </section>

      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead"><div><h2>Work register</h2><div className="af-sub">All engagements · delivery status</div></div></div>
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>CLIENT</th><th>SERVICE</th><th>PHASE</th><th>ASSIGNED</th><th>STATUS</th><th></th></tr></thead>
            <tbody>
              {engs.filter(e => !staffFilter || e.assigned_to_name === staffFilter).map(e => (
                <tr key={e.engagement_id}>
                  <td><b>{e.client_name}</b></td>
                  <td>{e.service_type}</td>
                  <td>{e.phase || '—'}</td>
                  <td>{e.assigned_to_name || '—'}</td>
                  <td><span className={`af-badge ${e.status === 'Completed' ? 'af-badge-green' : 'af-badge-blue'}`}>{e.status}</span></td>
                  <td><Link className="af-link" to={`/app/engagements/${e.engagement_id}`}>Open ↗</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default WorkPerformance;
