import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Download, Plus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysTo = (deadline) => Math.ceil((new Date(deadline) - new Date(todayIso())) / 86400000);

// urgency: overdue <0 | urgent 0-3 | soon 4-7 | upcoming 8-14 | track 15+ | completed
function bucketOf(deadline, status) {
  if (status === 'Completed') return 'completed';
  const days = daysTo(deadline);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'soon';
  if (days <= 14) return 'upcoming';
  return 'track';
}
const BUCKETS = [
  ['open', 'Open deadlines'], ['overdue', 'Overdue'], ['urgent', 'Today / 0–3 days'],
  ['soon', 'Due in 4–7 days'], ['upcoming', '8–14 days'], ['track', 'On track · 15+ days'], ['completed', 'Completed'],
];

const DeadlineTracker = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [engs, setEngs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState('open');
  const [serviceFilter, setServiceFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', client_id: '', service_module: 'audit', due_date: '', priority: 'Medium', assigned_to: '' });

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/service/engagements`, { withCredentials: true }),
      axios.get(`${API}/tasks`, { withCredentials: true }),
      axios.get(`${API}/clients`, { withCredentials: true }),
      axios.get(`${API}/auth/users-list`, { withCredentials: true }),
    ]).then(([e, t, c, u]) => {
      setEngs(Array.isArray(e.data) ? e.data : []);
      setTasks(Array.isArray(t.data) ? t.data : []);
      setClients(Array.isArray(c.data) ? c.data : []);
      setStaff(Array.isArray(u.data) ? u.data.filter(x => x.role !== 'client') : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const progressOf = (e) => {
    const cl = e.checklist || [];
    const total = cl.reduce((n, g) => n + (g.items?.length || 0), 0);
    const done = cl.reduce((n, g) => n + (g.items?.filter(i => i.done).length || 0), 0);
    return total ? Math.round((done / total) * 100) : 0;
  };

  // Deadline register: one row per deliverable — tasks + engagement date-terms
  const rows = useMemo(() => {
    const out = [];
    tasks.forEach(t => {
      if (!t.due_date) return;
      out.push({
        id: t.task_id, client: t.client_name || '—', client_id: t.client_id,
        deliverable: t.title, service: t.service_module || '—', period: '',
        deadline: t.due_date, type: 'Task due', internal_target: '',
        owner: t.assigned_to_name || '—', reviewer: '',
        work: t.status === 'Completed' ? 100 : 0,
        docs: t.status === 'Completed' ? 'Complete' : '—',
        status: t.status,
        next: t.status === 'Completed' ? 'Done' : (t.due_date < todayIso() ? 'Overdue — chase owner' : 'In progress'),
        engagement_id: null,
      });
    });
    const TERM_ROWS = [
      ['fta_due_date', 'FTA statutory due'],
      ['internal_target_date', 'Internal target'],
      ['report_due_date', 'Report draft due'],
      ['closing_meeting_date', 'Closing meeting'],
      ['field_visit_end', 'Field visit end'],
      ['returns_due_date', 'goAML return due'],
    ];
    engs.filter(e => e.status !== 'Deleted').forEach(e => {
      const terms = e.terms || {};
      const pct = progressOf(e);
      TERM_ROWS.forEach(([key, label]) => {
        if (!terms[key]) return;
        out.push({
          id: `${e.engagement_id}_${key}`, client: e.client_name, client_id: e.client_id,
          deliverable: `${e.service_type.replace(/_/g, ' ')} — ${label}`,
          service: e.service_type, period: terms.tax_period || terms.audit_period || '',
          deadline: terms[key],
          type: key === 'fta_due_date' ? 'Statutory (FTA)' : key === 'internal_target_date' ? 'Internal target' : 'Agreed delivery',
          internal_target: terms.internal_target_date ? fmt(terms.internal_target_date) : '',
          owner: e.assigned_to_name || '—', reviewer: 'Partner',
          work: pct,
          docs: e.phase === 'Client Due Diligence' ? 'Awaiting client' : `Checklist ${pct}%`,
          status: e.status === 'Completed' ? 'Completed' : 'Open',
          next: e.phase === 'Client Due Diligence' ? 'Escalate missing documents'
            : e.phase === 'Review & Reporting' ? 'Send to partner review' : 'Track checklist',
          engagement_id: e.engagement_id,
        });
      });
    });
    return out.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  }, [engs, tasks]);

  const withBucket = useMemo(() => rows.map(r => ({ ...r, bucket: bucketOf(r.deadline, r.status) })), [rows]);
  const counts = useMemo(() => {
    const c = { open: withBucket.filter(r => r.bucket !== 'completed').length };
    BUCKETS.slice(1).forEach(([k]) => { c[k] = withBucket.filter(r => r.bucket === k).length; });
    return c;
  }, [withBucket]);

  const risk = useMemo(() => ({
    forecastLate: withBucket.filter(r => r.bucket !== 'completed' && r.internal_target && r.internal_target < fmt(todayIso())).length,
    dependenciesOpen: withBucket.filter(r => r.bucket !== 'completed' && r.docs === 'Awaiting client').length,
    reviewMissed: withBucket.filter(r => r.bucket !== 'completed' && r.next === 'Send to partner review').length,
    noTarget: withBucket.filter(r => r.bucket !== 'completed' && !r.internal_target).length,
  }), [withBucket]);

  const filtered = withBucket
    .filter(r => bucket === 'open' ? r.bucket !== 'completed' : r.bucket === bucket)
    .filter(r => !serviceFilter || r.service === serviceFilter)
    .filter(r => !ownerFilter || r.owner === ownerFilter)
    .filter(r => !search || r.client.toLowerCase().includes(search.toLowerCase()) || r.deliverable.toLowerCase().includes(search.toLowerCase()));

  const services = [...new Set(rows.map(r => r.service))];
  const owners = [...new Set(rows.map(r => r.owner))];

  const exportCsv = () => {
    const header = ['Client', 'Deliverable', 'Service', 'Period', 'Deadline', 'Type', 'Days remaining', 'Owner', 'Reviewer', 'Work %', 'Docs', 'Next action', 'Status'];
    const body = filtered.map(r => [r.client, r.deliverable, r.service, r.period, r.deadline, r.type,
      daysTo(r.deadline), r.owner, r.reviewer, r.work, r.docs, r.next, r.status]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[header, ...body].map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'deadline-register.csv';
    a.click();
  };

  const addDeadline = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/tasks`, {
        title: form.title, description: 'Added via deadline tracker',
        service_module: form.service_module, client_id: form.client_id || undefined,
        due_date: form.due_date, priority: form.priority, assigned_to: form.assigned_to || undefined,
      }, { withCredentials: true });
      setShowAdd(false);
      const t = await axios.get(`${API}/tasks`, { withCredentials: true });
      setTasks(Array.isArray(t.data) ? t.data : []);
    } catch (err) { alert(err.response?.data?.detail || 'Failed to add'); }
    setSaving(false);
  };

  if (loading) return <div className="page-loading">Loading deadline tracker…</div>;

  const badge = (b) => ({ overdue: 'af-badge-red', urgent: 'af-badge-red', soon: 'af-badge-amber', upcoming: 'af-badge-blue', track: 'af-badge-blue', completed: 'af-badge-green' }[b] || 'af-badge-blue');
  const daysLabel = (r) => {
    if (r.status === 'Completed') return 'Done';
    const d = daysTo(r.deadline);
    return d < 0 ? `${-d} days overdue` : d === 0 ? 'Due today' : `${d} days remaining`;
  };

  return (
    <div className="ov-wrap" data-testid="deadline-tracker-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">EVERY DEADLINE, IN VIEW</div>
          <h1>Deadline tracker</h1>
          <p>Know what is due, how many days remain and who owns the next step.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="af-btn" onClick={exportCsv}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export</button>
          <button className="af-btn-primary" onClick={() => setShowAdd(true)} data-testid="add-deadline-btn"><Plus size={14} style={{ marginRight: 4 }} /> Add deadline</button>
        </div>
      </div>

      <div className="af-chips">
        {BUCKETS.map(([k, label]) => (
          <button key={k} aria-selected={bucket === k} onClick={() => setBucket(k)} data-testid={`bucket-${k}`}>
            {label} ({counts[k] || 0})
          </button>
        ))}
      </div>

      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
        <section className="af-card af-metric"><label>Forecast late</label><b>{risk.forecastLate}</b><small>Internal target passed</small></section>
        <section className="af-card af-metric"><label>Dependencies open</label><b>{risk.dependenciesOpen}</b><small>Awaiting client documents</small></section>
        <section className="af-card af-metric"><label>Review checkpoints</label><b>{risk.reviewMissed}</b><small>Waiting partner review</small></section>
        <section className="af-card af-metric"><label>No internal target set</label><b>{risk.noTarget}</b><small>Set target dates on engagements</small></section>
      </div>

      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead">
          <div><h2>Deadline register</h2><div className="af-sub">{filtered.length} of {rows.length} records · calendar days · earliest first</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="af-searchbox" style={{ border: '1px solid var(--nn-border)' }}>
              <input placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} aria-label="Service filter">
              <option value="">All services</option>
              {services.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} aria-label="Owner filter">
              <option value="">All owners</option>
              {owners.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>CLIENT / DELIVERABLE</th><th>SERVICE / PERIOD</th><th>DEADLINE / TYPE</th><th>DAYS REMAINING</th><th>OWNER / REVIEWER</th><th>WORK / DOCS</th><th>NEXT ACTION</th><th></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} data-testid={`deadline-${r.id}`}>
                  <td><b>{r.deliverable}</b><small>{r.client}</small></td>
                  <td>{r.service}<small>{r.period || '—'}</small></td>
                  <td>{fmt(r.deadline)}<small>{r.type}</small></td>
                  <td><span className={`af-badge ${badge(r.bucket)}`}>{daysLabel(r)}</span></td>
                  <td>{r.owner}<small>{r.reviewer ? `Review: ${r.reviewer}` : ''}</small></td>
                  <td>{r.docs}<small>{r.work}% complete</small></td>
                  <td>{r.next}</td>
                  <td>{r.engagement_id && <button className="af-link" onClick={() => navigate(`/app/engagements/${r.engagement_id}`)}>Open ↗</button>}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="8" className="af-empty">No deadlines in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setShowAdd(false)}>
          <div className="af-dialog" data-testid="add-deadline-modal">
            <button className="af-close" onClick={() => setShowAdd(false)}>×</button>
            <h2>Add deadline</h2>
            <div className="af-formrow"><label>Deliverable *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Audit draft report" />
            </div>
            <div className="af-formrow"><label>Client</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">—</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Service</label>
              <select value={form.service_module} onChange={e => setForm({ ...form, service_module: e.target.value })}>
                {['audit', 'vat', 'aml', 'corporate', 'accounting', 'advisory'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Deadline *</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Owner</label>
              <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">—</option>
                {staff.map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {['High', 'Medium', 'Low'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={addDeadline} disabled={saving || !form.title || !form.due_date} data-testid="save-deadline-btn">{saving ? 'Saving…' : 'Add deadline'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeadlineTracker;
