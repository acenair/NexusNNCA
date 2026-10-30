import React, { useState, useEffect } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Users, FileCheck, Wallet, ArrowDownToLine } from 'lucide-react';
import AnimatedNumber from '../components/AnimatedNumber';
import Sparkline from '../components/Sparkline';
import Skeleton from '../components/Skeleton';
import Avatar from '../components/Avatar';

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

const aed = (n) => 'AED ' + Math.round(Number(n || 0)).toLocaleString('en-US');

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
  const [ovTab, setOvTab] = useState('glance');
  const [period, setPeriod] = useState(0); // 0 = this month, 1 = last month
  const [leads, setLeads] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [util, setUtil] = useState([]);
  const [regDeadlines, setRegDeadlines] = useState([]);
  const [renewals, setRenewals] = useState([]);
  const [kycRecs, setKycRecs] = useState([]);
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
        axios.get(`${API}/leads`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/clients`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/insights/staff-utilization`, { withCredentials: true }).catch(() => ({ data: { staff: [] } })),
        axios.get(`${API}/insights/regulatory-deadlines?within_days=60`, { withCredentials: true }).catch(() => ({ data: { deadlines: [] } })),
        axios.get(`${API}/insights/renewal-candidates`, { withCredentials: true }).catch(() => ({ data: { candidates: [] } })),
        axios.get(`${API}/compliance/records?scope=customers`, { withCredentials: true }).catch(() => ({ data: [] })),
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
      // the conditional visa-alerts push lands AFTER these array entries, so:
      // [7]=leads [8]=clients [9]=utilization [10]=regulatory [11]=renewals [12]=compliance [13]=visa
      const lraw = results[7].data; setLeads(Array.isArray(lraw) ? lraw : (lraw?.leads || []));
      setClientsList(Array.isArray(results[8].data) ? results[8].data : []);
      setUtil(results[9].data?.staff || []);
      setRegDeadlines(results[10].data?.deadlines || []);
      setRenewals(results[11].data?.candidates || []);
      const kraw = results[12].data;
      setKycRecs(Array.isArray(kraw) ? kraw : (kraw?.records || []));
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
  const pendingOf = (i) => Math.max(0, (i.amount || 0) - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + (c.amount || 0), 0));
  const live = invoices.filter(i => !i.cancelled);
  const monthInvoices = live.filter(i => (i.date || '').slice(0, 7) === thisMonth);
  const billed = monthInvoices.reduce((n, i) => n + (i.amount || 0), 0);
  const collected = live.reduce((n, i) => n + (i.receipts || []).filter(r => (r.date || '').slice(0, 7) === thisMonth).reduce((n, r) => n + (r.amount || 0), 0), 0);
  const outstanding = live.reduce((n, i) => n + pendingOf(i), 0);
  const overdueInv = live.filter(i => pendingOf(i) > 0.009 && i.due_date && i.due_date < today.toISOString().slice(0, 10)).reduce((n, i) => n + pendingOf(i), 0);

  const openTasks = tasks.filter(t => t.status !== 'Completed');
  const dueSoon = openTasks.filter(t => t.due_date && t.due_date <= in7.toISOString().slice(0, 10)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today.toISOString().slice(0, 10));
  const reviewQueue = active.filter(e => e.phase === 'Review & Reporting');

  // ---- Kanban pipeline (drag an engagement to a new stage) ----
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const isPartnerUser = user?.role === 'partner';
  const stageEngs = (s) => active.filter(e => s.phases.includes(e.phase));
  const moveEngagement = async (engagement_id, stage) => {
    const st = PIPELINE_STAGES.find(x => x.key === stage);
    const phase = st?.phases?.[0];
    if (!phase) return;
    setEngagements(prev => prev.map(e => e.engagement_id === engagement_id ? { ...e, phase } : e));
    try { await axios.patch(`${process.env.REACT_APP_BACKEND_URL}/api/service/engagements/${engagement_id}`, { phase }, { withCredentials: true }); }
    catch (e) { console.error('Stage move failed', e); loadData(); }
  };

  const chartMonths = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - k, 1));
    const key = d.toISOString().slice(0, 7);
    chartMonths.push({
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      billed: invoices.filter(i => !i.cancelled && (i.date || '').slice(0, 7) === key).reduce((n, i) => n + (i.amount || 0), 0),
      collected: invoices.reduce((n, i) => n + (i.receipts || []).filter(r => (r.date || '').slice(0, 7) === key).reduce((n, r) => n + (r.amount || 0), 0), 0),
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

  // ---- Overview panels data (all live, all linked) ----
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const periodDate = new Date(Date.UTC(today.getFullYear(), today.getMonth() - period, 1));
  const periodKey = periodDate.toISOString().slice(0, 7);
  const periodLabel = `${MONTHS[periodDate.getUTCMonth()]} ${periodDate.getUTCFullYear()}`;
  const lastPeriodDate = new Date(Date.UTC(today.getFullYear(), today.getMonth() - period - 1, 1));
  const lastPeriodLabel = `${MONTHS[lastPeriodDate.getUTCMonth()]} ${lastPeriodDate.getUTCFullYear()}`;
  const pBilled = live.filter(i => (i.date || '').slice(0, 7) === periodKey).reduce((n, i) => n + (i.amount || 0), 0);
  const pCollected = live.reduce((n, i) => n + (i.receipts || []).filter(r => (r.date || '').slice(0, 7) === periodKey).reduce((n, r) => n + (r.amount || 0), 0), 0);

  const overdueJobs = openTasks.filter(t => t.due_date && t.due_date < today.toISOString().slice(0, 10));
  const finalPrint = active.filter(e => e.phase === 'Completion' || e.phase === 'Filing');
  const stagesTable = [
    { label: 'Awaiting documents', count: pipeline[0].count, action: 'Follow up with clients', link: '/app/engagements' },
    { label: 'In progress', count: pipeline[1].count, action: 'Complete fieldwork and preparation', link: '/app/engagements' },
    { label: 'Manager review', count: pipeline[2].count, action: 'Clear review points', link: '/app/engagements' },
    { label: 'Draft sent', count: pipeline[3].count, action: 'Obtain management confirmation', link: '/app/engagements' },
    { label: 'Management confirmed', count: pipeline[4].count, action: 'Final print and partner signature', link: '/app/engagements' },
  ];
  const todayIso = today.toISOString().slice(0, 10);
  const daysToD = (d) => Math.round((new Date(d.length > 10 ? d : d + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / 86400000);
  const todayIso2 = todayIso;
  const kycExpired = kycRecs.filter(r => r.date_basis !== 'review' && r.due_date && r.due_date < todayIso);
  const kycExpiring = kycRecs.filter(r => r.date_basis !== 'review' && r.due_date && r.due_date >= todayIso && daysToD(r.due_date) <= 30);
  const kycAttentionCount = kycExpired.length + kycExpiring.length;
  const awaitingClientTasks = openTasks.filter(t => disp_await(t));
  function disp_await(t) { return t.status === 'Awaiting client'; }
  const responsesOverdue = awaitingClientTasks.filter(t => t.due_date && t.due_date < today.toISOString().slice(0, 10));
  const completedThisMonth = tasks.filter(t => t.status === 'Completed' && (t.completed_at || '').slice(0, 7) === periodKey);
  const draftInv = invoices.filter(i => i.status === 'Draft');
  const creditsThisMonth = live.reduce((n, i) => n + (i.credits || []).filter(c => (c.date || '').slice(0, 7) === periodKey).reduce((n, c) => n + (c.amount || 0), 0), 0);
  const cancelledInv = invoices.filter(i => i.cancelled);
  // receivables ageing (real)
  const age = { current: 0, d30: 0, d60: 0, d90: 0 };
  live.forEach(i => { const p = pendingOf(i); if (p <= 0.009) return; const dd = i.due_date ? Math.round((new Date(today.toISOString().slice(0, 10)) - new Date(i.due_date)) / 86400000) : -1;
    if (dd <= 0) age.current += p; else if (dd <= 30) age.d30 += p; else if (dd <= 60) age.d60 += p; else age.d90 += p; });
  // growth
  const leadsThisPeriod = leads.filter(l => (l.created_at || '').slice(0, 7) === periodKey);
  const activeClients = clientsList.filter(c => c.status !== 'Inactive').length;
  const newClientsThisPeriod = clientsList.filter(c => (c.created_at || '').slice(0, 7) === periodKey).length;
  const onboardingIncomplete = clientsList.filter(c => c.onboarding_stage && !['Completed', 'Lost'].includes(c.onboarding_stage)).length;
  const inactiveClients = clientsList.filter(c => c.status === 'Inactive').length;
  const followupsOverdue = responsesOverdue.length;
  // capacity
  const totalCapacity = util.reduce((n, u) => n + (u.capacity || 0), 0);
  const totalAllocated = util.reduce((n, u) => n + (u.allocated || 0), 0);
  const overCapacity = util.filter(u => u.utilization_pct > 100);
  // compliance
  const kycIncomplete = kycRecs.filter(r => ['Requested', 'Received'].includes(r.stage) || (r.date_basis !== 'review' && r.due_date && r.due_date < today.toISOString().slice(0, 10))).length;
  const licenceRenewals = regDeadlines.filter(x => x.kind === 'Trade licence').length;

  const Tile = ({ label, value, sub, to }) => (
    <section className="af-card af-metric">
      <span className="sub">{label}</span>
      <Link to={to} data-testid={`tile-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        <b style={{ display: 'block', fontSize: 26, margin: '10px 0', color: '#01457C', textDecoration: 'underline', textDecorationColor: 'rgba(14,109,180,0.3)', textUnderlineOffset: 4 }}>{value}</b>
      </Link>
      <small>{sub}</small>
    </section>
  );

  if (loading) {
    return (
      <div className="ov-wrap" data-testid="dashboard-skeleton">
        <div className="ov-heading"><div><div className="ov-eyebrow">WORKSPACE</div><h1>Firm overview</h1></div></div>
        <Skeleton kpi={4} cards={2} rows={6} cols={4} />
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))} data-testid="period-select" className="af-btn" style={{ padding: '9px 12px' }}>
            <option value={0}>{periodLabel}</option>
            <option value={1}>{lastPeriodLabel}</option>
          </select>
          <button className="af-btn" onClick={() => window.print()} data-testid="print-overview">Print overview</button>
        </div>
      </div>

      <div className="af-tabs" role="tablist" data-testid="overview-tabs" style={{ marginBottom: 16 }}>
        {[['glance', 'At a glance'], ['engagements', 'Engagements'], ['financials', 'Financials'], ['growth', 'Clients & growth'], ['team', 'Team & capacity'], ['compliance', 'Compliance & deadlines']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={ovTab === k} onClick={() => setOvTab(k)} data-testid={`ovtab-${k}`}
            style={{ background: ovTab === k ? '#dff2ff' : 'transparent', color: ovTab === k ? '#087ebd' : '#6b8799', fontWeight: ovTab === k ? 650 : 400, border: 'none', padding: '8px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5 }}>{label}</button>
        ))}
      </div>

      {ovTab === 'glance' && (<>
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
          <b><Link to="/app/customers" style={{ color: 'inherit' }}>{stats?.active_clients ?? 0}</Link></b>
          <small>{newClientsThisPeriod} new client(s) in {periodLabel}</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><FileCheck size={18} /></span>
          <label>Active engagements</label>
          <b><Link to="/app/engagements" style={{ color: 'inherit' }}>{totalActive}</Link></b>
          <small>Current snapshot · across all service lines</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><Wallet size={18} /></span>
          <label>Billed · {periodLabel}</label>
          <b><AnimatedNumber value={pBilled} format={aed} /></b>
          <span className="af-spark"><Sparkline data={chartMonths.map(m => m.billed)} color="#0e6db4" /></span>
          <small>Invoices issued in selected month</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><ArrowDownToLine size={18} /></span>
          <label>Collected · {periodLabel}</label>
          <b><AnimatedNumber value={pCollected} format={aed} /></b>
          <span className="af-spark"><Sparkline data={chartMonths.map(m => m.collected)} color="#0e7ec4" /></span>
          <small>Receipts recorded in selected month</small>
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
          <div className="af-kanban" data-testid="engagement-kanban">
            {pipeline.map(s => (
              <div key={s.key}
                className={`af-kancol${dragOver === s.key ? ' dragover' : ''}`}
                onDragOver={e => { if (!isPartnerUser) return; e.preventDefault(); setDragOver(s.key); }}
                onDragLeave={() => setDragOver(prev => prev === s.key ? null : prev)}
                onDrop={e => { e.preventDefault(); setDragOver(null); if (dragging && isPartnerUser) moveEngagement(dragging, s.key); setDragging(null); }}>
                <div className="af-kanhead"><span>{s.label.replace(/^Stage \d+: /, '')}</span><b>{s.count}</b></div>
                {stageEngs(s).slice(0, 8).map(e => (
                  <div key={e.engagement_id} className={`af-kancard${dragging === e.engagement_id ? ' dragging' : ''}`}
                    style={{ borderLeftColor: STAGE_COLORS[s.key] }}
                    draggable={isPartnerUser}
                    onDragStart={ev => { setDragging(e.engagement_id); ev.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragging(null)}>
                    <b>{e.client_name}</b>
                    <small>{SERVICE_LABELS[e.service_type] || e.service_type}</small>
                  </div>
                ))}
                {stageEngs(s).length === 0 && <div className="af-kanempty">Drop here{isPartnerUser ? '' : ' (partners only)'}</div>}
              </div>
            ))}
          </div>
          <div className="af-sub" style={{ marginTop: 8 }}>{isPartnerUser ? 'Drag a card between stages to update the engagement phase · ' : ''}{totalActive} active engagement(s)</div>
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

      </>)}

      {ovTab === 'engagements' && (
        <div data-testid="panel-engagements">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
            <Tile label="Active jobs" value={totalActive} sub="Across all services" to="/app/engagements" />
            <Tile label="Overdue jobs" value={overdueJobs.length} sub="Current delivery exceptions" to="/app/tasks" />
            <Tile label="Manager review" value={pipeline[2].count} sub="Awaiting review" to="/app/engagements" />
            <Tile label="Ready for final print" value={finalPrint.length} sub="Filing & completion phases" to="/app/engagements" />
          </div>
          <section className="af-card" style={{ marginBottom: 18 }}>
            <div className="af-cardhead"><div><h2>Delivery stages</h2><div className="af-sub">Current snapshot · counts cover {totalActive} active engagements</div></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>STAGE</th><th>ENGAGEMENTS</th><th>NEXT ACTION</th></tr></thead>
                <tbody>
                  {stagesTable.map(s => (
                    <tr key={s.label}>
                      <td><Link to={s.link} style={{ color: '#01457C', textDecoration: 'underline', textDecorationColor: 'rgba(14,109,180,0.3)' }}><b>{s.label}</b></Link></td>
                      <td><Link to={s.link} style={{ color: '#01457C' }}><b>{s.count}</b></Link></td>
                      <td>{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="af-grid af-grid-65">
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Service portfolio</h2><div className="af-sub">Active engagements by service</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <thead><tr><th>SERVICE</th><th>ACTIVE</th></tr></thead>
                  <tbody>
                    {Object.entries(serviceMix).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <tr key={k}><td>{k}</td><td><Link to="/app/engagements" style={{ color: '#01457C' }}><b>{v}</b></Link></td></tr>
                    ))}
                    {Object.keys(serviceMix).length === 0 && <tr><td colSpan="2" className="af-empty">No active engagements.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Delivery checkpoints</h2><div className="af-sub">Current snapshot</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <tbody>
                    <tr><td>Client responses overdue</td><td><Link to="/app/tasks" style={{ color: '#01457C' }}><b>{responsesOverdue.length}</b></Link></td></tr>
                    <tr><td>Partner approval pending</td><td><Link to="/app/engagements" style={{ color: '#01457C' }}><b>{reviewQueue.length}</b></Link></td></tr>
                    <tr><td>Final issued this month</td><td><Link to="/app/engagements" style={{ color: '#01457C' }}><b>{completedThisMonth.length}</b></Link></td></tr>
                    <tr><td>Due in next 7 days</td><td><Link to="/app/deadlines" style={{ color: '#01457C' }}><b>{dueSoon.length}</b></Link></td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {ovTab === 'financials' && (
        <div data-testid="panel-financials">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
            <Tile label="Billed this month" value={aed(pBilled)} sub={`Invoices issued in ${periodLabel}`} to="/app/invoices" />
            <Tile label="Collected this month" value={aed(pCollected)} sub={`Receipts in ${periodLabel}`} to="/app/invoices" />
            <Tile label="Outstanding" value={aed(outstanding)} sub="Across all invoices" to="/app/invoices" />
            <Tile label="Overdue" value={aed(overdueInv)} sub="Included in outstanding" to="/app/invoices" />
          </div>
          <div className="af-grid af-grid-65">
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Receivables ageing</h2><div className="af-sub">Current snapshot · AED</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <thead><tr><th>AGE BUCKET</th><th>BALANCE</th><th>ACTION</th></tr></thead>
                  <tbody>
                    <tr><td>Not yet due</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{aed(age.current)}</b></Link></td><td>Monitor due dates</td></tr>
                    <tr><td>1–30 days overdue</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{aed(age.d30)}</b></Link></td><td>Client reminder</td></tr>
                    <tr><td>31–60 days overdue</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{aed(age.d60)}</b></Link></td><td>Owner follow-up</td></tr>
                    <tr><td>61+ days overdue</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{aed(age.d90)}</b></Link></td><td>Partner escalation</td></tr>
                    <tr><td><b>Total outstanding</b></td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{aed(outstanding)}</b></Link></td><td></td></tr>
                  </tbody>
                </table>
              </div>
            </section>
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Billing controls</h2><div className="af-sub">Current snapshot</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <tbody>
                    <tr><td>Draft invoices pending</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{draftInv.length}</b></Link></td><td>{aed(draftInv.reduce((n, i) => n + (i.amount || 0), 0))}</td></tr>
                    <tr><td>Credit notes this month</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{creditsThisMonth ? '—' : '—'}</b></Link></td><td>{aed(creditsThisMonth)}</td></tr>
                    <tr><td>Cancelled invoices</td><td><Link to="/app/invoices" style={{ color: '#01457C' }}><b>{cancelledInv.length}</b></Link></td><td>{aed(cancelledInv.reduce((n, i) => n + (i.amount || 0), 0))}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="af-note">Billed totals represent net issued invoices. Drafts are excluded from receivables.</p>
            </section>
          </div>
        </div>
      )}

      {ovTab === 'growth' && (
        <div data-testid="panel-growth">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
            <Tile label="Active clients" value={activeClients} sub={`${newClientsThisPeriod} new in ${periodLabel}`} to="/app/client-master" />
            <Tile label="New enquiries" value={leadsThisPeriod.length} sub={`Leads created in ${periodLabel}`} to="/app/leads" />
            <Tile label="Won engagements" value={wonProposals.length} sub="Confirmed proposals" to="/app/proposals" />
            <Tile label="Open proposals" value={openProposals.length} sub={`${aed(openProposalValue)} pipeline`} to="/app/proposals" />
          </div>
          <div className="af-grid af-grid-65">
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Opportunity pipeline</h2><div className="af-sub">Open proposals</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <thead><tr><th>CLIENT</th><th>SERVICE</th><th>VALUE</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {openProposals.slice(0, 6).map(pp => (
                      <tr key={pp.proposal_id || pp.id}>
                        <td><b>{pp.client_name || '—'}</b></td>
                        <td>{pp.service_type ? (SERVICE_LABELS[pp.service_type] || pp.service_type) : (pp.service || '—')}</td>
                        <td>{pp.value ? aed(pp.value) : '—'}</td>
                        <td><span className="af-badge af-badge-blue">{pp.stage || pp.status || '—'}</span></td>
                      </tr>
                    ))}
                    {openProposals.length === 0 && <tr><td colSpan="4" className="af-empty">No open proposals.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="af-card">
              <div className="af-cardhead"><div><h2>Client relationship priorities</h2><div className="af-sub">Current snapshot</div></div></div>
              <div className="af-tablewrap">
                <table className="af-table">
                  <tbody>
                    <tr><td>Renewals due (engagements to renew)</td><td><Link to="/app/engagements" style={{ color: '#01457C' }}><b>{renewals.length}</b></Link></td><td>Prepare renewal quotations</td></tr>
                    <tr><td>Onboarding incomplete</td><td><Link to="/app/client-master" style={{ color: '#01457C' }}><b>{onboardingIncomplete}</b></Link></td><td>Complete KYC and engagement letter</td></tr>
                    <tr><td>Inactive clients to revisit</td><td><Link to="/app/client-master" style={{ color: '#01457C' }}><b>{inactiveClients}</b></Link></td><td>Review service needs</td></tr>
                    <tr><td>Client follow-ups overdue</td><td><Link to="/app/tasks" style={{ color: '#01457C' }}><b>{followupsOverdue}</b></Link></td><td>Contact relationship owner</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {ovTab === 'team' && (
        <div data-testid="panel-team">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
            <Tile label="Available hours" value={totalCapacity} sub={`${util.length} staff · this month`} to="/app/performance" />
            <Tile label="Planned hours" value={Math.round(totalAllocated)} sub="Current allocations" to="/app/performance" />
            <Tile label="Planned utilisation" value={`${totalCapacity ? Math.round(totalAllocated / totalCapacity * 100) : 0}%`} sub={`${Math.round(totalAllocated)} / ${totalCapacity} hours`} to="/app/performance" />
            <Tile label="Over capacity" value={overCapacity.length} sub={overCapacity.length ? `${overCapacity.map(u => u.name).join(', ')} — review assignments` : 'Everyone within capacity'} to="/app/performance" />
          </div>
          <section className="af-card" style={{ marginBottom: 18 }}>
            <div className="af-cardhead"><div><h2>Staff allocation</h2><div className="af-sub">Allocated engagement hours vs working-day capacity · this month</div></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>STAFF</th><th>PLANNED</th><th>CAPACITY</th><th>UTILISATION</th><th>ACTION</th></tr></thead>
                <tbody>
                  {util.map(u => (
                    <tr key={u.user_id}>
                      <td><Link to="/app/performance" style={{ color: '#01457C' }}><b>{u.name}</b></Link></td>
                      <td>{u.allocated} hrs</td>
                      <td>{u.capacity} hrs</td>
                      <td><span className={`af-badge ${u.utilization_pct > 100 ? 'af-badge-red' : u.utilization_pct > 75 ? 'af-badge-amber' : 'af-badge-green'}`}>{u.utilization_pct}%</span></td>
                      <td>{u.utilization_pct > 100 ? 'Reassign work' : `${Math.max(0, u.capacity - Math.round(u.allocated))} hrs available`}</td>
                    </tr>
                  ))}
                  {util.length === 0 && <tr><td colSpan="5" className="af-empty">No allocation data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Review capacity</h2><div className="af-sub">Management snapshot</div></div></div>
            <div className="af-mini"><span>Manager review</span><Link to="/app/engagements" style={{ color: '#01457C' }}><b>{reviewQueue.length} engagements</b></Link></div>
            <div className="af-mini"><span>Due within 7 days</span><Link to="/app/deadlines" style={{ color: '#01457C' }}><b>{dueSoon.length} deliverables</b></Link></div>
            <div className="af-mini"><span>Open tasks</span><Link to="/app/tasks" style={{ color: '#01457C' }}><b>{openTasks.length}</b></Link></div>
          </section>
        </div>
      )}

      {ovTab === 'compliance' && (
        <div data-testid="panel-compliance">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
            <Tile label="Due in 7 days" value={dueSoon.length} sub="All deliverables" to="/app/deadlines" />
            <Tile label="Overdue jobs" value={overdueJobs.length} sub="Escalation required" to="/app/tasks" />
            <Tile label="KYC attention" value={kycAttentionCount} sub="Expired or expiring documents" to="/app/compliance" />
            <Tile label="Licence renewals" value={licenceRenewals} sub="Due in next 60 days" to="/app/deadlines" />
          </div>
          <section className="af-card" style={{ marginBottom: 18 }}>
            <div className="af-cardhead"><div><h2>Compliance calendar</h2><div className="af-sub">FTA / Corporate Tax / Licence · next 60 days</div></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>CLIENT</th><th>DELIVERABLE</th><th>DUE</th><th>DAYS LEFT</th></tr></thead>
                <tbody>
                  {regDeadlines.slice(0, 8).map((x, i) => (
                    <tr key={i}>
                      <td><b>{x.client}</b></td>
                      <td>{x.label}</td>
                      <td>{fmtDay(x.due)}</td>
                      <td><span className={`af-badge ${x.days_left < 0 ? 'af-badge-red' : x.days_left <= 14 ? 'af-badge-amber' : 'af-badge-green'}`}>{x.days_left < 0 ? `${-x.days_left}d overdue` : `${x.days_left}d left`}</span></td>
                    </tr>
                  ))}
                  {regDeadlines.length === 0 && <tr><td colSpan="4" className="af-empty">No regulatory deadlines in the window.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Document readiness</h2><div className="af-sub">KYC register · customers scope</div></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <tbody>
                  <tr><td> KYC records on file</td><td><Link to="/app/compliance" style={{ color: '#01457C' }}><b>{kycRecs.length}</b></Link></td></tr>
                  <tr><td>Expired documents</td><td><Link to="/app/compliance" style={{ color: '#01457C' }}><b>{kycExpired.length}</b></Link></td></tr>
                  <tr><td>Expiring within 30 days</td><td><Link to="/app/compliance" style={{ color: '#01457C' }}><b>{kycExpiring.length}</b></Link></td></tr>
                  <tr><td>Client follow-ups overdue</td><td><Link to="/app/tasks" style={{ color: '#01457C' }}><b>{followupsOverdue}</b></Link></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

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
