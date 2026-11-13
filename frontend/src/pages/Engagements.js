import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Plus, Search } from 'lucide-react';
import Avatar from '../components/Avatar';
import Skeleton from '../components/Skeleton';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Route path -> service_type preset (old deep links keep working)
const ROUTE_PRESETS = {
  '/app/audit/statutory': 'statutory_audit',
  '/app/audit/internal': 'internal_audit',
  '/app/audit/stock': 'stock_audit',
  '/app/audit/fraud': 'fraud_audit',
  '/app/vat/registration': 'vat_registration',
  '/app/vat/filing': 'vat_filing',
  '/app/vat/amendments': 'vat_amendments',
  '/app/corporate/registration': 'corporate_registration',
  '/app/corporate/tax': 'corporate_tax',
  '/app/corporate/formation': 'company_formation',
  '/app/corporate/liquidation': 'company_liquidation',
  '/app/advisory/valuation': 'business_valuation',
  '/app/advisory/due-diligence': 'due_diligence',
  '/app/aml/review': 'aml_review',
  '/app/aml/filing': 'aml_filing',
  '/app/aml/reports': 'aml_reports',
};

const SERVICE_LABELS = {
  statutory_audit: 'External Audit', internal_audit: 'Internal Audit', stock_audit: 'Stock Audit',
  fraud_audit: 'Fraud Audit', vat_registration: 'VAT Registration', vat_filing: 'VAT Filing',
  vat_amendments: 'VAT Amendments', corporate_registration: 'Corporate Tax Registration',
  corporate_tax: 'CT Filing', company_formation: 'Company Formation',
  company_liquidation: 'Company Liquidation', business_valuation: 'Business Valuation',
  due_diligence: 'Due Diligence', aml_review: 'AML Review', aml_filing: 'AML Filing',
  aml_reports: 'AML Reports', accounting: 'Accounting', goaml: 'goAML',
  bank_account_opening: 'Bank Account Opening', transfer_pricing: 'TP / Benchmarking',
  attestation_services: 'Attestation Services', mofa_services: 'MOFA Services',
  dmcc_services: 'DMCC Services', certification_services: 'Certification Services',
  chamber_attestation: 'Chamber Attestation',
};

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Engagements = () => {  const { user } = useOutletContext();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const preset = params.get('service') || ROUTE_PRESETS[location.pathname] || '';
  const stagePreset = params.get('stage') || '';

  const [engs, setEngs] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termDefs, setTermDefs] = useState({ service_terms: {}, general_terms: [] });
  const [form, setForm] = useState({ client_id: '', service_type: preset || 'statutory_audit', assigned_to: '', notes: '' });


  const [renewals, setRenewals] = useState([]);
  const [renewing, setRenewing] = useState('');
  useEffect(() => {
    if (user?.role === 'partner') {
      axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/insights/renewal-candidates`, { withCredentials: true })
        .then(res => setRenewals(res.data.candidates || []))
        .catch(() => {});
    }
  }, [user]);
  const doRenew = async (eid) => {
    setRenewing(eid);
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/insights/renew`, { engagement_id: eid }, { withCredentials: true });
      setRenewals(prev => prev.filter(c => c.engagement_id !== eid));
      alert(`Renewed — new engagement ${res.data.new_engagement_id} created with a fresh checklist.`);
      await loadEngs();
    } catch (e) { alert('Renewal failed'); }
    setRenewing('');
  };
  const loadEngs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/service/engagements`, { withCredentials: true });
      setEngs(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadEngs(); }, [loadEngs]);
  useEffect(() => {
    axios.get(`${API}/clients`, { withCredentials: true }).then(r => setClients(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    axios.get(`${API}/auth/users-list`, { withCredentials: true }).then(r => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    axios.get(`${API}/service/engagement-terms`, { withCredentials: true }).then(r => setTermDefs(r.data)).catch(() => {});
  }, []);

  const serviceCounts = {};
  engs.forEach(e => { serviceCounts[e.service_type] = (serviceCounts[e.service_type] || 0) + 1; });
  const chips = Object.entries(SERVICE_LABELS)
    .sort((a, b) => (serviceCounts[b[0]] || 0) - (serviceCounts[a[0]] || 0));

  const phases = [...new Set(engs.map(e => e.phase).filter(Boolean))];
  const STAGE_MAP = {
    awaiting: ['Client Due Diligence', 'Scoping', 'Setup', 'Application', ''],
    progress: ['Planning', 'Fieldwork', 'Preparation', 'Documentation', 'Collection', 'Processing', 'Analysis', 'Assessment', 'Compilation', 'Computation', 'Transaction Monitoring'],
    review: ['Review & Reporting'],
    draft: ['Filing'],
    confirmed: ['Completion'],
  };
  const STAGE_LABELS = { awaiting: 'Awaiting documents', progress: 'In progress', review: 'Manager review', draft: 'Draft sent', confirmed: 'Management confirmed' };
  const stageLabel = STAGE_LABELS[stagePreset];
  const qSel = params.get('quarter') || '';
  const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // quarter key/label/due from an engagement (FTA due = 28th of the month after the quarter ends)
  const quarterOf = (e) => {
    const pf = (e.period_from || '').slice(0, 10), pt = (e.period_to || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pf) || !/^\d{4}-\d{2}-\d{2}$/.test(pt)) return null;
    const y = pt.slice(0, 4), m1 = parseInt(pf.slice(5, 7), 10), m2 = parseInt(pt.slice(5, 7), 10);
    const dueY = m2 === 12 ? parseInt(y, 10) + 1 : y;
    const dueM = m2 === 12 ? 'Jan' : MONS[m2];
    return { key: pf + '_' + pt, label: `${MONS[m1 - 1]} – ${MONS[m2 - 1]} ${y}`, due: `28 ${dueM} ${dueY}` };
  };
  const qSelKey = qSel || '';  // '' = all quarters

  const rowRow = (e, n) => {
    const pct = progressOf(e);
    return (
      <tr key={e.engagement_id}>
        <td style={{ color: 'var(--muted)', fontSize: 11 }}>{n}</td>
        <td><span className="af-avatar-cell"><Avatar name={e.client_name} size={26} /><b className="nm">{e.client_name || "—"}</b></span></td>
        <td><span className="af-badge af-badge-blue">{SERVICE_LABELS[e.service_type] || e.service_type}</span></td>
        <td>{e.phase || '—'}</td>
        <td style={{ minWidth: 110 }}>
          <div className="af-track"><i style={{ width: pct + '%' }} /></div>
          <small style={{ color: 'var(--muted)', fontSize: 10 }}>{pct}%</small>
        </td>
        <td>{e.assigned_to_name || '—'}</td>
        <td><span className={`af-badge ${e.status === 'Completed' ? 'af-badge-green' : 'af-badge-blue'}`}>{e.status}</span></td>
        <td data-testid="eng-period">
          {(() => { const q = quarterOf(e); return q
            ? <b style={{ fontSize: 11.5 }}>{q.label}</b>
            : <span style={{ color: 'var(--muted)' }}>—</span>; })()}
        </td>
        <td data-testid="eng-due">{e.due_date ? fmt(e.due_date) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
        <td><Link className="af-link" to={`/app/engagements/${e.engagement_id}`} data-testid={`open-eng-${e.engagement_id}`}>Open ↗</Link></td>
      </tr>
    );
  };

  const filtered = engs.filter(e =>
    (!preset || e.service_type === preset) &&
    (!stagePreset || (STAGE_MAP[stagePreset] || []).includes(e.phase)) &&
    (!phaseFilter || e.phase === phaseFilter) &&
    (!staffFilter || (e.assigned_to_name || 'Unassigned') === staffFilter) &&
    (!statusFilter || e.status.toLowerCase() === statusFilter.toLowerCase()) &&
    (!search || (e.client_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  // VAT quarters: the firm files quarterly (e.g. Aug–Oct) and the FTA due date is
  // always the 28th of the month AFTER the quarter ends. Group the VAT view by quarter.
  const vatGroups = (() => {
    if (preset !== 'vat_filing') return null;
    const map = new Map();
    filtered.forEach(e => {
      const q = quarterOf(e) || { key: '_none', label: 'No period set', due: 'set the period' };
      if (qSelKey && q.key !== qSelKey) return;   // quarter tab filter
      if (!map.has(q.key)) { const g = { ...q, rows: [] }; map.set(q.key, g); }
      map.get(q.key).rows.push(e);
    });
    const gs = [...map.values()];
    gs.sort((a, b) => ((a.key === '_none') - (b.key === '_none')) || (b.key || '').localeCompare(a.key || ''));
    gs.forEach(g => g.rows.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || '')));
    return gs;
  })();
  // quarter tabs: built from ALL vat engagements so every quarter is reachable
  const qTabs = (() => {
    if (preset !== 'vat_filing') return null;
    const map = new Map();
    filtered.forEach(e => { const q = quarterOf(e); const k = q ? q.key : '_none'; const o = map.get(k) || { ...q, key: k, label: q ? q.label : 'No period set', due: q ? q.due : '', rows: [] }; o.rows.push(e); map.set(k, o); });
    const gs = [...map.values()];
    gs.sort((a, b) => ((a.key === '_none') - (b.key === '_none')) || (b.key || '').localeCompare(a.key || ''));
    return gs;
  })();

  // Stats strip is FIRM-WIDE — it must not change with the service chip / filters below
  const active = engs.filter(e => e.status === 'Active').length;
  const inReview = engs.filter(e => e.phase === 'Review & Reporting').length;
  const completed = engs.filter(e => e.status === 'Completed').length;

  const progressOf = (e) => {
    const cl = e.checklist || [];
    const total = cl.reduce((n, g) => n + (g.items?.length || 0), 0);
    const done = cl.reduce((n, g) => n + (g.items?.filter(i => i.done).length || 0), 0);
    return total ? Math.round((done / total) * 100) : 0;
  };

  const handleCreate = async () => {
    if (!form.client_id) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/service/engagements`, { ...form, quoted_fee: form.quoted_fee ? parseFloat(form.quoted_fee) : null }, { withCredentials: true });
      setShowCreate(false);
      setForm({ client_id: '', service_type: preset || 'statutory_audit', assigned_to: '', notes: '' });
      await loadEngs();
    } catch (err) { console.error(err); alert(err.response?.data?.detail || 'Failed to create engagement'); }
    setSubmitting(false);
  };

  const clearPreset = () => { const p = new URLSearchParams(params); p.delete('service'); setParams(p, { replace: true }); };

  if (loading) return <div className="ov-wrap"><div className="ov-heading"><div><div className="ov-eyebrow">DELIVERY</div><h1>Engagements</h1></div></div><Skeleton kpi={4} rows={8} cols={5} /></div>;

  // visible rows with continuous serial numbers (group headers interleaved in the VAT view)
  const displayRows = (() => {
    const out = [];
    if (vatGroups) {
      let n = 0;
      vatGroups.forEach(g => {
        out.push({ qhead: g });
        g.rows.forEach(e => { n += 1; out.push({ e, n }); });
      });
    } else {
      filtered.forEach((e, i) => out.push({ e, n: i + 1 }));
    }
    return out;
  })();

  return (
    <div className="ov-wrap" data-testid="engagements-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">SERVICE DELIVERY</div>
          <h1>Engagements</h1>
          <p>Every engagement across all service lines — one view, filter by service.</p>
        </div>
        <button className="af-btn-primary" data-testid="new-engagement-btn" onClick={() => setShowCreate(true)}><Plus size={14} style={{ marginRight: 4 }} /> New engagement</button>
      </div>

      {/* Stats strip */}
      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <section className="af-card af-metric"><label>Engagements</label><b>{engs.length}</b><small>All services</small></section>
        <section className="af-card af-metric"><label>Active</label><b>{active}</b><small>In delivery now</small></section>
        <section className="af-card af-metric"><label>Awaiting review</label><b>{inReview}</b><small>Review &amp; Reporting phase</small></section>
        <section className="af-card af-metric"><label>Completed</label><b>{completed}</b><small>Closed out</small></section>
      </div>

      {/* Renewals banner hidden (partner feedback: confusing on this page). The renew
          flow lives on: POST /insights/renew stays wired; re-show by removing this guard. */}
      {false && user?.role === 'partner' && renewals.length > 0 && (
        <section className="af-card" style={{ marginBottom: 14, borderLeft: '4px solid #fd5426' }} data-testid="renewals-banner">
          <div className="af-cardhead"><div><h2>Annual renewals due</h2><div className="af-sub">These engagements are due for renewal — cloning creates a fresh checklist for the new period</div></div></div>
          {renewals.map(c => (
            <div key={c.engagement_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 12.5 }}><b>{c.client_name}</b> · {c.service_type.replace(/_/g, ' ')} · fee {c.fee ? `AED ${c.fee.toLocaleString()}` : '—'}</span>
              <button className="af-btn" onClick={() => doRenew(c.engagement_id)} disabled={renewing === c.engagement_id} data-testid={`renew-${c.engagement_id}`}>{renewing === c.engagement_id ? 'Renewing…' : 'Renew now'}</button>
            </div>
          ))}
        </section>
      )}
      {/* Service chips: all service lines (restored per partner feedback), wrapped — no horizontal scroll. */}
      <div className="af-chips" role="tablist" style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
        <button role="tab" aria-selected={!preset} onClick={clearPreset}>All ({engs.length})</button>
        {chips.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={preset === k}
            style={serviceCounts[k] ? undefined : { opacity: 0.55 }}
            onClick={() => setParams({ service: k }, { replace: true })}>
            {label} ({serviceCounts[k] || 0})
          </button>
        ))}
      </div>

      {preset === 'vat_filing' && qTabs && qTabs.length > 0 && (
        <div className="af-chips" role="tablist" style={{ flexWrap: 'wrap', marginBottom: 10 }} data-testid="quarter-tabs">
          <button role="tab" aria-selected={!qSel}
            onClick={() => { const p2 = new URLSearchParams(params); p2.delete('quarter'); setParams(p2, { replace: true }); }}>
            All quarters
          </button>
          {qTabs.map(q => (
            <button key={q.key} role="tab" aria-selected={qSel === q.key}
              onClick={() => { const p2 = new URLSearchParams(params); p2.set('quarter', q.key); setParams(p2, { replace: true }); }}>
              {q.label} ({q.rows.length})
            </button>
          ))}
        </div>
      )}

      {/* Filters + table */}
      <section className="af-card">
        <div className="af-cardhead">
          <div><h2>{preset ? SERVICE_LABELS[preset] : 'All engagements'}</h2>
            <div className="af-sub">{filtered.length} shown{stageLabel ? ` · filtered to stage: ${stageLabel}` : ''}
              {stageLabel && <button className="tbtn" style={{ marginLeft: 8, fontSize: 10.5 }} data-testid="clear-stage-filter"
                onClick={() => { params.delete('stage'); setParams(params, { replace: true }); }}>Clear stage filter ✕</button>}
            </div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="af-searchbox"><Search size={13} />
              <input placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search engagements by client" />
            </div>
            <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} aria-label="Filter by assigned staff" data-testid="staff-filter">
              <option value="">All staff</option>
              {[...new Set(engs.map(e => e.assigned_to_name).filter(Boolean))].sort().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} aria-label="Filter by phase">
              <option value="">All phases</option>
              {phases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>
        <div className="af-tablewrap af-tablewrap-tall">
          <table className="af-table">
            <thead><tr><th>#</th><th>CLIENT</th><th>SERVICE</th><th>PHASE</th><th>PROGRESS</th><th>ASSIGNED</th><th>STATUS</th><th>PERIOD (QUARTER)</th><th>DUE DATE</th><th></th></tr></thead>
            <tbody>
              {displayRows.map(it => it.qhead
                ? <tr key={'q_' + it.qhead.key} className="af-qhead"><td colSpan="10"><b>VAT quarter {it.qhead.label}</b><small> · return due {it.qhead.due} · {it.qhead.rows.length} job(s)</small></td></tr>
                : rowRow(it.e, it.n))}
              {filtered.length === 0 && <tr><td colSpan="10" className="af-empty">No engagements match. {preset ? 'Try the All filter.' : 'Create one with “New engagement”.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create modal */}
      {showCreate && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !submitting && setShowCreate(false)}>
          <div className="af-dialog" data-testid="create-engagement-modal">
            <button className="af-close" onClick={() => setShowCreate(false)}>×</button>
            <h2>New engagement</h2>
            <div className="af-formrow"><label>Client *</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Service line</label>
              <select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
                {Object.entries(SERVICE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Assign to</label>
              <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">Unassigned</option>
                {users.filter(u => u.role !== 'client').map(u => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            </div>

            {termDefs.general_terms.map(t => (
              <div className="af-formrow" key={t.key}>
                <label>{t.label}</label>
                <input type={t.type === 'number' ? 'number' : t.type === 'date' ? 'date' : 'text'}
                  placeholder={t.placeholder || ''} value={form[t.key] || ''}
                  onChange={e => setForm({ ...form, [t.key]: e.target.value })} />
              </div>
            ))}

            {(termDefs.service_terms[form.service_type] || []).length > 0 && (
              <>
                <div className="af-sub" style={{ margin: '8px 0 2px', fontWeight: 650 }}>Service terms — {form.service_type.replace(/_/g, ' ')}</div>
                {termDefs.service_terms[form.service_type].map(t => (
                  <div className="af-formrow" key={t.key}>
                    <label>{t.label}</label>
                    {t.type === 'select'
                      ? <select value={form[t.key] || ''} onChange={e => setForm({ ...form, [t.key]: e.target.value })}>
                          <option value="">—</option>
                          {t.options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      : <input type={t.type} value={form[t.key] || ''} onChange={e => setForm({ ...form, [t.key]: e.target.value })} />}
                  </div>
                ))}
              </>
            )}

            <div className="af-formrow"><label>Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional context" />
            </div>
            <button className="af-btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={handleCreate} disabled={submitting || !form.client_id} data-testid="create-engagement-submit">
              {submitting ? 'Creating…' : 'Create engagement'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Engagements;
