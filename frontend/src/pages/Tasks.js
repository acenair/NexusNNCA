import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Search, X, Pencil, Bell } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SERVICE_LABELS = {
  statutory_audit: 'External Audit', internal_audit: 'Internal Audit', stock_audit: 'Stock Audit',
  fraud_audit: 'Fraud Audit', vat_registration: 'VAT Registration', vat_filing: 'VAT Filing',
  vat_amendments: 'VAT Amendments', corporate_registration: 'Corporate Registration',
  corporate_tax: 'Corporate Tax', company_formation: 'Company Formation', company_liquidation: 'Liquidation',
  advisory_valuation: 'Valuation', advisory_due_diligence: 'Due Diligence', aml_review: 'AML Review',
  aml_filing: 'AML Filing', goaml: 'goAML', aml_reports: 'AML Reports', accounting: 'Accounting',
  audit: 'External Audit', vat: 'VAT', aml: 'AML', liquidation: 'Liquidation',
  tax: 'Corporate Tax', corporate: 'Corporate Tax', other: 'Other',
};
const svcLabel = (s) => SERVICE_LABELS[s] || s;
const DISPLAY = { 'Pending': 'Scheduled', 'In Progress': 'In progress', 'In progress': 'In progress' };
const disp = (s) => DISPLAY[s] || s;
const STATUSES = ['Scheduled', 'In progress', 'In review', 'Awaiting client', 'Completed'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const badgeCls = (s) =>
  s === 'Completed' ? 'af-badge-green' :
  s === 'Awaiting client' ? 'af-badge-amber' :
  s === 'In review' ? 'af-badge-blue' : 'af-badge-grey';
const priBadge = (p) => p === 'High' ? 'af-badge-red' : p === 'Medium' ? 'af-badge-amber' : 'af-badge-grey';
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const mon = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();

const Tasks = () => {
  const { user } = useOutletContext();
  const today = new Date().toISOString().slice(0, 10);
  const end14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Active');
  const [q, setQ] = useState('');
  const [svcFilter, setSvcFilter] = useState('All services');
  const [ownerFilter, setOwnerFilter] = useState('All staff');
  const [showNew, setShowNew] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client_id: '', title: '', service_module: 'statutory_audit', assigned_to: '', due_date: '', priority: 'Medium', progress: 0, blocker: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [t, c, u] = await Promise.all([
        axios.get(`${API}/tasks`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`, { withCredentials: true }),
      ]);
      setTasks(Array.isArray(t.data) ? t.data : []);
      setClients(Array.isArray(c.data) ? c.data : []);
      setStaff(Array.isArray(u.data) ? u.data.filter(s => s.role !== 'client') : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const open = (j) => disp(j.status) !== 'Completed';
  const isLate = (j) => open(j) && j.due_date < today;
  const isUpcoming = (j) => open(j) && j.due_date >= today && j.due_date <= end14;
  const active = (j) => open(j) && disp(j.status) !== 'Scheduled';
  const daysLate = (j) => Math.round((new Date(today) - new Date(j.due_date)) / 86400000);

  const kpis = {
    activeJobs: tasks.filter(active).length,
    upcoming: tasks.filter(isUpcoming).length,
    delayed: tasks.filter(isLate).length,
    awaiting: tasks.filter(j => disp(j.status) === 'Awaiting client').length,
    review: tasks.filter(j => disp(j.status) === 'In review').length,
  };

  const serviceOptions = [...new Set(tasks.map(t => t.service_module).concat(Object.keys(SERVICE_LABELS)))];
  const staffOptions = [...new Set(tasks.map(t => t.assigned_to_name).filter(Boolean)
    .concat(staff.map(s => s.name)))];

  const visible = tasks.filter(j => {
    const t = tab === 'Active' ? active(j) : tab === 'All jobs' ? true : tab === 'Delayed' ? isLate(j)
      : tab === 'Upcoming' ? isUpcoming(j) : tab === 'Review' ? disp(j.status) === 'In review'
      : disp(j.status) === 'Awaiting client';
    return t
      && (svcFilter === 'All services' || j.service_module === svcFilter)
      && (ownerFilter === 'All staff' || j.assigned_to_name === ownerFilter)
      && ((j.title + ' ' + (j.client_name || '') + ' ' + (j.description || '') + ' ' + (j.assigned_to_name || '')).toLowerCase().includes(q.toLowerCase()));
  });

  const workload = staffOptions.map(name => {
    const mine = tasks.filter(j => j.assigned_to_name === name && open(j));
    return { name, open: mine.length,
      act: mine.filter(j => disp(j.status) !== 'Scheduled').length,
      late: mine.filter(isLate).length,
      rev: mine.filter(j => disp(j.status) === 'In review').length };
  }).filter(w => w.open > 0).sort((a, b) => -a.open - (-b.open));
  const maxOpen = Math.max(1, ...workload.map(w => w.open));

  const createJob = async () => {
    if (!form.title.trim() || !form.due_date) { setToast('Scope of work and target date are required'); return; }
    setSaving(true);
    try {
      const c = clients.find(x => x.client_id === form.client_id);
      const s = staff.find(x => x.user_id === form.assigned_to);
      await axios.post(`${API}/tasks`, {
        title: form.title, service_module: form.service_module, due_date: form.due_date,
        priority: form.priority, client_id: form.client_id || null,
        client_name: c ? c.name : null, assigned_to: form.assigned_to || null,
        assigned_to_name: s ? s.name : user?.name || null,
        status: Number(form.progress) > 0 ? 'In progress' : 'Scheduled',
        progress: Number(form.progress) || 0, blocker: form.blocker,
      }, { withCredentials: true });
      setShowNew(false);
      setForm({ client_id: '', title: '', service_module: 'statutory_audit', assigned_to: '', due_date: '', priority: 'Medium', progress: 0, blocker: '' });
      setToast('Job created');
      await load();
    } catch (e) { setToast(e.response?.data?.detail || 'Failed to create job'); }
    setSaving(false);
  };

  const saveEdit = async () => {
    try {
      await axios.patch(`${API}/tasks/${editRow.task_id}`, {
        status: editForm.status, progress: Number(editForm.progress) || 0, blocker: editForm.blocker,
      }, { withCredentials: true });
      setEditRow(null);
      setToast('Job updated');
      await load();
    } catch (e) { setToast('Failed to update'); }
  };

  const sendReminder = (j) => {
    // honest placeholder until SMTP/WhatsApp is connected
    setToast(`Reminder for ${j.client_name || j.title} — logged. No client message is sent yet.`);
  };

  const Tab = ({ k, label }) => (
    <button aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`jobtab-${k.replace(/\s/g, '').toLowerCase()}`}
      style={{ padding: '8px 14px', borderRadius: 8, border: tab === k ? '1px solid #0e6db4' : '1px solid var(--line, #e4eff6)', background: tab === k ? 'rgba(14,109,180,0.08)' : '#fff', color: tab === k ? '#0e6db4' : 'var(--muted, #7891a4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      {label}
    </button>
  );

  return (
    <div className="ov-wrap" data-testid="task-management-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">TASK MANAGEMENT</div>
          <h1>Keep every engagement moving.</h1>
          <p>A clear view of active jobs, deadlines and work that needs attention.</p>
        </div>
        <button className="af-btn-primary" onClick={() => setShowNew(true)} data-testid="new-job-btn">
          <Plus size={14} style={{ marginRight: 4 }} /> New job
        </button>
      </div>

      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }} data-testid="task-kpis">
        <section className="af-card af-metric"><label>Active jobs</label><b>{kpis.activeJobs}</b><small>In progress, client pending &amp; review</small></section>
        <section className="af-card af-metric"><label>Upcoming deadlines</label><b>{kpis.upcoming}</b><small>Due today through 14 days</small></section>
        <section className="af-card af-metric"><label>Delayed jobs</label><b>{kpis.delayed}</b><small>Past target date · not completed</small></section>
        <section className="af-card af-metric"><label>Awaiting client</label><b>{kpis.awaiting}</b><small>Documents or confirmation pending</small></section>
        <section className="af-card af-metric"><label>Ready for review</label><b>{kpis.review}</b><small>Manager / partner action needed</small></section>
      </div>

      <p className="af-sub" style={{ margin: '0 0 12px' }} data-testid="context-note">Counts cover the full team. Deadline and delay counts can overlap active jobs. Staff workload counts scheduled jobs; completed jobs are excluded.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div>
          <section className="af-card" style={{ marginBottom: 16 }} data-testid="jobs-table-card">
            <div className="af-cardhead"><div><h2>Jobs &amp; tasks</h2><div className="af-sub">Every job has an owner and target date</div></div></div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <Tab k="Active" label="Active" /><Tab k="All jobs" label="All jobs" /><Tab k="Upcoming" label="Upcoming" />
              <Tab k="Delayed" label="Delayed" /><Tab k="Review" label="Review" /><Tab k="Client pending" label="Client pending" />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs, customers…" data-testid="job-search"
                  style={{ width: '100%', padding: '9px 10px 9px 30px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, boxSizing: 'border-box' }} />
              </div>
              <select value={svcFilter} onChange={e => setSvcFilter(e.target.value)} data-testid="job-service-filter"
                style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5 }}>
                <option>All services</option>
                {serviceOptions.map(s => <option key={s} value={s}>{svcLabel(s)}</option>)}
              </select>
              <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} data-testid="job-staff-filter"
                style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5 }}>
                <option>All staff</option>
                {staffOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="af-btn" onClick={() => { setQ(''); setSvcFilter('All services'); setOwnerFilter('All staff'); setTab('Active'); }} data-testid="job-clear-filters">Clear filters</button>
            </div>

            <div className="af-tablewrap">
              <table className="af-table" data-testid="jobs-table">
                <thead><tr><th>JOB / CUSTOMER</th><th>SERVICE / SCOPE</th><th>ASSIGNED STAFF</th><th>STATUS / PROGRESS</th><th>PRIORITY</th><th>TARGET DATE</th><th></th></tr></thead>
                <tbody>
                  {visible.map(j => {
                    const d = disp(j.status);
                    return (
                      <tr key={j.task_id} data-testid="task-row">
                        <td><b>{j.client_name || j.title}</b><small>{j.client_name ? j.title : (j.task_id || '')}</small></td>
                        <td><b>{svcLabel(j.service_module)}</b><small>{j.description || ''}</small></td>
                        <td>{j.assigned_to_name || '—'}</td>
                        <td>
                          <span className={`af-badge ${badgeCls(d)}`}>{d}</span>
                          <div style={{ height: 5, background: 'var(--line, #e4eff6)', borderRadius: 4, marginTop: 6, minWidth: 90 }}>
                            <div style={{ height: 5, borderRadius: 4, width: `${j.progress || 0}%`, background: '#0e6db4' }} />
                          </div>
                          <small style={{ color: 'var(--muted)' }}>{j.progress || 0}%</small>
                        </td>
                        <td><span className={`af-badge ${priBadge(j.priority)}`}>{j.priority}</span></td>
                        <td style={{ color: isLate(j) ? 'var(--red, #c0392b)' : 'var(--text)' }}>
                          {fmtDate(j.due_date)}
                          <br /><small>{isLate(j) ? `${daysLate(j)} days late` : d === 'Completed' ? 'Closed' : j.due_date === today ? 'Due today' : 'Target date'}</small>
                        </td>
                        <td>
                          <button className="af-link" onClick={() => { setEditRow(j); setEditForm({ status: d, progress: j.progress || 0, blocker: j.blocker || '' }); }} data-testid={`edit-task-${j.task_id}`}>
                            <Pencil size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="af-empty">No jobs match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <small style={{ color: 'var(--muted)', padding: '8px 20px', display: 'block' }}>{visible.length} jobs shown · team summary on the right covers all staff</small>
          </section>

          <section className="af-card" style={{ marginBottom: 16 }} data-testid="staff-workload">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 14 }}>Staff workload</h2><div className="af-sub">Assigned open jobs · click to filter</div></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {workload.map(w => (
                <div key={w.name} style={{ padding: '10px 12px', border: '1px solid var(--line, #e4eff6)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 6 }}>
                    <button className="af-link" style={{ padding: 0 }} onClick={() => { setOwnerFilter(w.name); setTab('All jobs'); }} data-testid={`workload-${w.name.replace(/\s/g, '-')}`}>{w.name}</button>
                    <b style={{ whiteSpace: 'nowrap' }}>{w.open} open</b>
                  </div>
                  <div style={{ height: 5, background: 'var(--line, #e4eff6)', borderRadius: 4, margin: '6px 0' }}>
                    <div style={{ height: 5, borderRadius: 4, width: `${Math.round(w.open / maxOpen * 100)}%`, background: '#0e7ec4' }} />
                  </div>
                  <small style={{ color: 'var(--muted)', fontSize: 10.5 }}>{w.act} active · {w.late} delayed · {w.rev} in review</small>
                </div>
              ))}
            </div>
            {workload.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No open jobs assigned yet.</p>}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, borderTop: '1px solid var(--line, #e4eff6)', paddingTop: 8 }}>
              Job counts show allocation, rather than hours or capacity. A delayed job remains assigned to its current owner.
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <section className="af-card" data-testid="client-followups">
              <div className="af-cardhead"><div><h2 style={{ fontSize: 14 }}>Client follow-ups</h2><span className="af-badge af-badge-amber">Documents pending</span></div></div>
              {tasks.filter(j => j.blocker && open(j)).map(j => (
                <div key={j.task_id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line, #e4eff6)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div><b style={{ fontSize: 12.5 }}>{j.client_name || j.title}</b>
                      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0' }}>{j.blocker}</p>
                      <small style={{ color: 'var(--muted)' }}>Owner: {j.assigned_to_name || '—'}</small></div>
                    <button className="af-btn" onClick={() => sendReminder(j)} data-testid={`reminder-${j.task_id}`}><Bell size={11} style={{ marginRight: 3 }} />Reminder</button>
                  </div>
                </div>
              ))}
              {tasks.filter(j => j.blocker && open(j)).length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing pending from clients.</p>}
            </section>

            <section className="af-card" data-testid="review-queue">
              <div className="af-cardhead"><div><h2 style={{ fontSize: 14 }}>Review queue</h2><span className="af-badge af-badge-grey">Manager action</span></div></div>
              {tasks.filter(j => disp(j.status) === 'In review').map(j => (
                <div key={j.task_id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line, #e4eff6)', fontSize: 12.5 }}>
                  <b>{j.client_name || j.title}</b>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0' }}>{svcLabel(j.service_module)} · {j.assigned_to_name || '—'}</p>
                </div>
              ))}
              {tasks.filter(j => disp(j.status) === 'In review').length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Review queue is clear.</p>}
            </section>
          </div>
        </div>

        <div>
          <section className="af-card" style={{ marginBottom: 16 }} data-testid="upcoming-deadlines">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 14 }}>Upcoming deadlines</h2><span className="af-badge af-badge-grey">Next 7 days</span></div></div>
            {tasks.filter(j => open(j) && j.due_date >= today && j.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).sort((a, b) => a.due_date.localeCompare(b.due_date)).map(j => (
              <div key={j.task_id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line, #e4eff6)' }}>
                <div style={{ background: '#e7f1fa', borderRadius: 8, textAlign: 'center', padding: '4px 8px', minWidth: 34 }}>
                  <b style={{ fontSize: 14, color: '#01457C' }}>{j.due_date.slice(-2)}</b><br /><small style={{ color: '#0e6db4' }}>{mon(j.due_date)}</small>
                </div>
                <div style={{ fontSize: 12.5 }}>
                  <b>{j.client_name || j.title}</b>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0' }}>{svcLabel(j.service_module)} · {j.assigned_to_name || '—'}</p>
                  <span className={`af-badge ${j.priority === 'High' ? 'af-badge-amber' : 'af-badge-grey'}`}>{disp(j.status)}</span>
                </div>
              </div>
            ))}
            {tasks.filter(j => open(j) && j.due_date >= today && j.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing due in the next 7 days.</p>}
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Internal job targets only — statutory filing dates live in the Deadline tracker.</p>
          </section>

          <section className="af-card" style={{ marginBottom: 16 }} data-testid="delayed-jobs-card">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 14 }}>Delayed jobs</h2><span className="af-badge af-badge-red">Action required</span></div></div>
            {tasks.filter(isLate).map(j => (
              <div key={j.task_id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line, #e4eff6)', fontSize: 12.5 }}>
                <b>{j.client_name || j.title}</b>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0' }}>{svcLabel(j.service_module)} · {daysLate(j)} days late · {j.assigned_to_name || '—'}</p>
              </div>
            ))}
            {tasks.filter(isLate).length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No delayed jobs.</p>}
          </section>

          <section className="af-card" data-testid="work-summary">
            <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Work summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STATUSES.map(s => (
                <span key={s} className={`af-badge ${badgeCls(s)}`} style={{ alignSelf: 'flex-start' }}>{s} {tasks.filter(j => disp(j.status) === s).length}</span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Use the tabs above the jobs table for upcoming work and completed jobs.</p>
          </section>
        </div>
      </div>

      {editRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(1,20,35,0.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditRow(null)}>
          <div className="af-card" style={{ width: 420, padding: 20 }} onClick={e => e.stopPropagation()} data-testid="edit-job-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15 }}>Update job</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setEditRow(null)}><X size={16} /></button>
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>STATUS</label>
            <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} data-testid="edit-status"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10 }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>PROGRESS %</label>
            <input type="number" min={0} max={100} value={editForm.progress} onChange={e => setEditForm({ ...editForm, progress: e.target.value })} data-testid="edit-progress"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>CLIENT BLOCKER (optional)</label>
            <input value={editForm.blocker} onChange={e => setEditForm({ ...editForm, blocker: e.target.value })} placeholder="e.g. Trial balance awaited" data-testid="edit-blocker"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="af-btn" onClick={() => setEditRow(null)}>Cancel</button>
              <button className="af-btn-primary" onClick={saveEdit} data-testid="save-task-edit">Save</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(1,20,35,0.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNew(false)}>
          <div className="af-card" style={{ width: 460, padding: 20 }} onClick={e => e.stopPropagation()} data-testid="new-job-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15 }}>New job</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>CUSTOMER</label>
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} data-testid="new-job-client"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10 }}>
              <option value="">— internal job (no customer) —</option>
              {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>SERVICE</label>
            <select value={form.service_module} onChange={e => setForm({ ...form, service_module: e.target.value })} data-testid="new-job-service"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10 }}>
              {Object.keys(SERVICE_LABELS).map(k => <option key={k} value={k}>{svcLabel(k)}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>SCOPE OF WORK</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. FY2026 · Planning & PBC collection" data-testid="new-job-title"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>ASSIGNED STAFF</label>
            <select value={form.assigned_to} onChange={e => { const s = staff.find(x => x.user_id === e.target.value); setForm({ ...form, assigned_to: e.target.value, assigned_to_name: s ? s.name : '' }); }} data-testid="new-job-staff"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, marginBottom: 10 }}>
              <option value="">— me —</option>
              {staff.map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>TARGET DATE</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} data-testid="new-job-due"
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>PRIORITY</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} data-testid="new-job-priority"
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5 }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>PROGRESS %</label>
                <input type="number" min={0} max={100} value={form.progress} onChange={e => setForm({ ...form, progress: e.target.value })} data-testid="new-job-progress"
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, boxSizing: 'border-box' }} />
              </div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginTop: 10 }}>CLIENT BLOCKER (optional — shows in Client follow-ups)</label>
            <input value={form.blocker} onChange={e => setForm({ ...form, blocker: e.target.value })} placeholder="e.g. Owner Emirates ID pending" data-testid="new-job-blocker"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="af-btn" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="af-btn-primary" onClick={createJob} disabled={saving} data-testid="create-job-btn">{saving ? 'Saving…' : 'Create job'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#17354c', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 12.5, zIndex: 90 }} data-testid="task-toast">
          {toast}
          <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', color: '#9fc3dd', marginLeft: 10, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
};

export default Tasks;
