import React, { useState, useEffect } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Users, FileCheck, Wallet, ArrowDownToLine } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Map engagement phases to the 5-stage Auditflow pipeline
const PIPELINE_STAGES = [
  { key: 'awaiting', label: 'Awaiting documents', phases: ['Client Due Diligence'] },
  { key: 'progress', label: 'In progress', phases: ['Planning', 'Fieldwork', 'Computation', 'Transaction Monitoring'] },
  { key: 'review', label: 'Manager review', phases: ['Review & Reporting'] },
  { key: 'draft', label: 'Draft sent', phases: ['Filing'] },
  { key: 'confirmed', label: 'Management confirmed', phases: ['Completion'] },
];
const STAGE_COLORS = { awaiting: '#d8e9f7', progress: '#2e93d9', review: '#0b5e9b', draft: '#7fb9e0', confirmed: '#77cfc4' };

const SERVICE_LABELS = {
  statutory_audit: 'External Audit', internal_audit: 'Internal Audit', stock_audit: 'Stock Audit',
  fraud_audit: 'Fraud Audit', vat_filing: 'VAT', aml_review: 'AML', corporate_tax: 'Corporate Tax',
  accounting: 'Accounting', due_diligence: 'Due Diligence', valuation: 'Valuation',
};

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');

const Dashboard = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [activities, setActivities] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [visaAlerts, setVisaAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
  const isPartner = user?.role === 'partner';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const calls = [
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/service/engagements`, { withCredentials: true }),
        axios.get(`${API}/invoices`, { withCredentials: true }),
        axios.get(`${API}/tasks`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`, { withCredentials: true }),
        axios.get(`${API}/dashboard/activities`, { withCredentials: true }),
        axios.get(`${API}/proposals`, { withCredentials: true }).catch(() => ({ data: [] })),
      ];
      if (isPartner) calls.push(axios.get(`${API}/dashboard/visa-alerts`, { withCredentials: true }).catch(() => ({ data: [] })));
      const results = await Promise.all(calls);
      setStats(results[0].data || {});
      setEngagements(Array.isArray(results[1].data) ? results[1].data : []);
      setInvoices(Array.isArray(results[2].data) ? results[2].data : []);
      setTasks(Array.isArray(results[3].data) ? results[3].data : []);
      setStaff(Array.isArray(results[4].data) ? results[4].data : []);
      setActivities(Array.isArray(results[5].data) ? results[5].data : []);
      setProposals(Array.isArray(results[6].data) ? results[6].data : []);
      if (isPartner && results[7]) setVisaAlerts(Array.isArray(results[7].data) ? results[7].data : []);
    } catch (err) { console.error('Failed to load dashboard data:', err); }
    setLoading(false);
  };

  const today = new Date();
  const in7 = new Date(Date.now() + 7 * 86400000);
  const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

  // ---- Derived (all live data) ----
  const active = engagements.filter(e => e.status === 'Active');
  const pipeline = PIPELINE_STAGES.map(s => ({ ...s, count: active.filter(e => s.phases.includes(e.phase)).length }));
  const totalActive = active.length;

  const thisMonth = today.toISOString().slice(0, 7);
  const monthInvoices = invoices.filter(i => (i.date_issued || i.created_at || '').slice(0, 7) === thisMonth && i.status !== 'Cancelled');
  const billed = monthInvoices.reduce((n, i) => n + (i.amount || 0), 0);
  const collected = invoices.filter(i => i.paid && (i.paid_at || i.date_issued || '').slice(0, 7) === thisMonth).reduce((n, i) => n + (i.amount || 0), 0);
  const outstanding = invoices.filter(i => !i.paid && i.status !== 'Cancelled').reduce((n, i) => n + (i.amount || 0), 0);
  const overdueInv = invoices.filter(i => !i.paid && i.due_date && i.due_date < today.toISOString().slice(0, 10) && i.status !== 'Cancelled').reduce((n, i) => n + (i.amount || 0), 0);

  const openTasks = tasks.filter(t => t.status !== 'Completed');
  const dueSoon = openTasks.filter(t => t.due_date && t.due_date <= in7.toISOString().slice(0, 10)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today.toISOString().slice(0, 10));
  const reviewQueue = active.filter(e => e.phase === 'Review & Reporting');

  const chartMonths = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const key = d.toISOString().slice(0, 7);
    chartMonths.push({
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      billed: invoices.filter(i => (i.date_issued || i.created_at || '').slice(0, 7) === key && i.status !== 'Cancelled').reduce((n, i) => n + (i.amount || 0), 0),
      collected: invoices.filter(i => i.paid && (i.paid_at || i.date_issued || '').slice(0, 7) === key).reduce((n, i) => n + (i.amount || 0), 0),
    });
  }
  const maxChart = Math.max(...chartMonths.map(m => Math.max(m.billed, m.collected)), 1);

  const perStaff = staff.filter(u => u.role !== 'client').map(u => ({
    name: u.name,
    initials: u.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(),
    open: openTasks.filter(t => t.assigned_to_name === u.name).length,
  }));

  const openProposals = proposals.filter(p => !['Confirmed', 'Rejected'].includes(p.stage || p.status));
  const openProposalValue = openProposals.reduce((n, p) => n + (p.value || 0), 0);
  const wonProposals = proposals.filter(p => (p.stage || p.status) === 'Confirmed');
  const serviceMix = {};
  active.forEach(e => {
    const k = SERVICE_LABELS[e.service_type] || e.service_type;
    serviceMix[k] = (serviceMix[k] || 0) + 1;
  });
  const mixText = Object.entries(serviceMix).map(([k, v]) => `${k} ${v}`).join(' · ') || '—';

  const attentionItems = [
    overdueTasks.length > 0 && { label: 'Overdue tasks', desc: `${overdueTasks.length} task(s) past their due date`, badge: `${overdueTasks.length} tasks`, cls: 'af-badge-red', link: '/app/tasks' },
    overdueInv > 0 && { label: 'Overdue receivables', desc: 'Invoices past their due date', badge: aed(overdueInv), cls: 'af-badge-red', link: '/app/invoices' },
    reviewQueue.length > 0 && { label: 'Partner approval queue', desc: 'Engagements in Review & Reporting', badge: `${reviewQueue.length} jobs`, cls: 'af-badge-blue', link: '/app/audit/statutory' },
    dueSoon.length > 0 && { label: 'Due within 7 days', desc: 'Deliverables closing this week', badge: `${dueSoon.length} items`, cls: 'af-badge-blue', link: '/app/deadlines' },
    (stats?.aml_alerts > 0) && { label: 'AML alerts', desc: 'Flagged transactions to review', badge: `${stats.aml_alerts} flagged`, cls: 'af-badge-amber', link: '/app/aml/review' },
    isPartner && visaAlerts.length > 0 && { label: 'Visa / document expiry', desc: 'Staff documents expiring soon', badge: `${visaAlerts.length} alerts`, cls: 'af-badge-amber', link: '/app/settings' },
  ].filter(Boolean);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--surface)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const briefLines = [
    overdueTasks.length > 0 && `${overdueTasks.length} overdue task(s) need attention.`,
    dueSoon.length > 0 && `${dueSoon.length} deliverables due in the next 7 days.`,
    reviewQueue.length > 0 && `${reviewQueue.length} engagement(s) await partner review.`,
    overdueInv > 0 && `${aed(overdueInv)} is overdue for collection.`,
  ].filter(Boolean);

  return (
    <div className="ov-wrap" data-testid="dashboard-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">YOUR FIRM, AT A GLANCE</div>
          <h1>Firm overview</h1>
          <p>A clear view of clients, delivery, finances and your team.</p>
        </div>
        <div className="ov-asof">As of {fmtDay(today.toISOString())} · {today.getFullYear()}</div>
      </div>

      <section className="af-hero">
        <div>
          <strong>Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}</strong>
          <p>{briefLines.length ? briefLines.join(' ') : 'Everything is on track. No overdue items, nothing blocking delivery.'}</p>
        </div>
        {briefLines.length > 0 && (
          <button className="af-btn-primary" data-testid="priority-briefing-btn" onClick={() => setBriefOpen(true)}>View priority briefing ↗</button>
        )}
      </section>

      <div className="af-kpis" data-testid="kpi-row">
        <section className="af-card af-metric">
          <span className="af-icon"><Users size={18} /></span>
          <label>Active clients</label>
          <b>{stats?.active_clients ?? 0}</b>
          <small>Current snapshot</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><FileCheck size={18} /></span>
          <label>Active engagements</label>
          <b>{totalActive}</b>
          <small>Across all service lines</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><Wallet size={18} /></span>
          <label>Billed this month</label>
          <b>{aed(billed)}</b>
          <small>Invoices issued this month</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><ArrowDownToLine size={18} /></span>
          <label>Collected this month</label>
          <b>{aed(collected)}</b>
          <small>Receipts recorded this month</small>
        </section>
      </div>

      <div className="af-grid af-grid-65">
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Billing &amp; collections</h2><div className="af-sub">Monthly movement · AED · Last 6 months</div></div>
            <Link className="af-link" to="/app/invoices">Open invoices ↗</Link>
          </div>
          <div className="af-chart">
            {chartMonths.map(m => (
              <div className="af-month" key={m.label} title={`${m.label}: Billed ${aed(m.billed)}; Collected ${aed(m.collected)}`}>
                <div className="af-bars">
                  <div className="af-bar" style={{ height: Math.max(4, (m.billed / maxChart) * 120) + 'px' }} />
                  <div className="af-bar af-bar-light" style={{ height: Math.max(4, (m.collected / maxChart) * 120) + 'px' }} />
                </div>
                <small>{m.label}</small>
              </div>
            ))}
          </div>
          <div className="af-chartfoot">
            <span>Outstanding <strong>{aed(outstanding)}</strong></span>
            <span>Overdue <strong className="af-red-text">{aed(overdueInv)}</strong></span>
          </div>
        </section>
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Engagement pipeline</h2><div className="af-sub">All active engagements · Now</div></div>
          </div>
          <div className="af-pipeline">
            {pipeline.map(s => (
              <span key={s.key} style={{ width: totalActive ? (s.count / totalActive) * 100 + '%' : '0%', background: STAGE_COLORS[s.key] }} />
            ))}
          </div>
          <div className="af-stages">
            {pipeline.map(s => (
              <div className="af-stage" key={s.key}><span>{s.label}</span><b>{s.count}</b></div>
            ))}
            <div className="af-stage af-stage-total"><span>Total active</span><b>{totalActive}</b></div>
          </div>
        </section>
      </div>

      <div className="af-grid af-grid-65">
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Upcoming deliverables</h2><div className="af-sub">Next 7 days · Tasks and deadlines</div></div>
            <Link className="af-link" to="/app/deadlines">Full tracker ↗</Link>
          </div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>TASK / CLIENT</th><th>OWNER</th><th>DUE</th><th>STATUS</th></tr></thead>
              <tbody>
                {dueSoon.slice(0, 6).map(t => (
                  <tr key={t.task_id}>
                    <td><b>{t.title}</b><small>{t.client_name || '—'}</small></td>
                    <td>{t.assigned_to_name || '—'}</td>
                    <td>{fmtDay(t.due_date)}</td>
                    <td><span className="af-badge af-badge-blue">{t.status}</span></td>
                  </tr>
                ))}
                {dueSoon.length === 0 && <tr><td colSpan="4" className="af-empty">Nothing due in the next 7 days.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Needs your attention</h2><div className="af-sub">Exceptions affecting delivery and cash flow</div></div>
          </div>
          {attentionItems.length ? attentionItems.map((it, idx) => (
            <div className="af-attention" key={idx}>
              <div><strong>{it.label}</strong><small>{it.desc}</small></div>
              <button className={`af-badge ${it.cls}`} onClick={() => navigate(it.link)}>{it.badge} ↗</button>
            </div>
          )) : <p className="af-note">No exceptions. Delivery and cash flow are clean.</p>}
        </section>
      </div>

      <div className="af-grid af-grid-3">
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Team capacity</h2><div className="af-sub">Open tasks per staff · Now</div></div>
            <Link className="af-link" to="/app/tasks">Tasks ↗</Link>
          </div>
          {perStaff.map(s => {
            const max = Math.max(...perStaff.map(x => x.open), 1);
            return (
              <div className="af-staff" key={s.name}>
                <span className="af-initial">{s.initials}</span>
                <div className="af-staffname">{s.name}<small>{s.open} open task(s)</small></div>
                <div className="af-track"><i style={{ width: (s.open / max) * 100 + '%' }} /></div>
                <small>{s.open}</small>
              </div>
            );
          })}
        </section>
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Growth &amp; service mix</h2><div className="af-sub">Business development · Now</div></div>
            {isPartner && <Link className="af-link" to="/app/proposals">Proposals ↗</Link>}
          </div>
          <div className="af-mini"><span>Open proposals</span><b>{openProposals.length}</b></div>
          <div className="af-mini"><span>Open proposal value</span><b>{aed(openProposalValue)}</b></div>
          <div className="af-mini"><span>Confirmed engagements</span><b>{wonProposals.length}</b></div>
          <div className="af-mini"><span>Active service mix</span><b>{mixText}</b></div>
        </section>
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Recent firm activity</h2><div className="af-sub">Latest updates across the workspace</div></div>
          </div>
          {activities.slice(0, 4).map(a => (
            <div className="af-activity" key={a.activity_id}>
              <b>{a.description}</b>
              <small>{new Date(a.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
            </div>
          ))}
          {activities.length === 0 && <p className="af-note">No activity recorded yet.</p>}
        </section>
      </div>

      {briefOpen && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && setBriefOpen(false)}>
          <div className="af-dialog">
            <button className="af-close" onClick={() => setBriefOpen(false)}>×</button>
            <h2>Priority briefing</h2>
            <ul>
              {overdueTasks.map(t => <li key={t.task_id}><b>{t.title}</b> · {t.client_name || '—'} · due {fmtDay(t.due_date)}</li>)}
              {dueSoon.slice(0, 5).map(t => <li key={'soon_' + t.task_id}>Due soon: {t.title} · {t.client_name || '—'} · {fmtDay(t.due_date)}</li>)}
              {reviewQueue.map(e => <li key={e.engagement_id}>{e.client_name} · {SERVICE_LABELS[e.service_type] || e.service_type} · awaiting review</li>)}
              {overdueInv > 0 && <li>{aed(overdueInv)} overdue for collection.</li>}
            </ul>
            <p className="af-note">Live data from your workspace.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
