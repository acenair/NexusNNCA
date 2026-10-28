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
  vat_amendments: 'VAT Amendments', corporate_registration: 'Corporate Registration',
  corporate_tax: 'Corporate Tax', company_formation: 'Company Formation',
  company_liquidation: 'Company Liquidation', business_valuation: 'Business Valuation',
  due_diligence: 'Due Diligence', aml_review: 'AML Review', aml_filing: 'AML Filing',
  aml_reports: 'AML Reports', accounting: 'Accounting', goaml: 'goAML',
  bank_account_opening: 'Bank Account Opening', transfer_pricing: 'Transfer Pricing',
  attestation_services: 'Attestation Services', mofa_services: 'MOFA Services',
  dmcc_services: 'DMCC Services', certification_services: 'Certification Services',
  chamber_attestation: 'Chamber Attestation',
};

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Engagements = () => {
  const [renewals, setRenewals] = useState([]);
  const [renewing, setRenewing] = useState('');
  useEffect(() => {
    if (user?.role === 'partner') {
      axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/insights/renewal-candidates`, { withCredentials: true })
        .then(res => setRenewals(res.data.candidates || []))
        .catch(() => {});
    }
  }, [user, loading]);
  const doRenew = async (eid) => {
    setRenewing(eid);
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/insights/renew`, { engagement_id: eid }, { withCredentials: true });
      setRenewals(prev => prev.filter(c => c.engagement_id !== eid));
      alert(`Renewed — new engagement ${res.data.new_engagement_id} created with a fresh checklist.`);
      setLoading(true); await load(); setLoading(false);
    } catch (e) { alert('Renewal failed'); }
    setRenewing('');
  };
  const { user } = useOutletContext();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const preset = params.get('service') || ROUTE_PRESETS[location.pathname] || '';

  const [engs, setEngs] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termDefs, setTermDefs] = useState({ service_terms: {}, general_terms: [] });
  const [form, setForm] = useState({ client_id: '', service_type: preset || 'statutory_audit', assigned_to: '', notes: '' });

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

  const filtered = engs.filter(e =>
    (!preset || e.service_type === preset) &&
    (!phaseFilter || e.phase === phaseFilter) &&
    (!statusFilter || e.status.toLowerCase() === statusFilter.toLowerCase()) &&
    (!search || (e.client_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const active = filtered.filter(e => e.status === 'Active').length;
  const inReview = filtered.filter(e => e.phase === 'Review & Reporting').length;
  const completed = filtered.filter(e => e.status === 'Completed').length;

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
        <section className="af-card af-metric"><label>Engagements</label><b>{filtered.length}</b><small>{preset ? SERVICE_LABELS[preset] : 'All services'}</small></section>
        <section className="af-card af-metric"><label>Active</label><b>{active}</b><small>In delivery now</small></section>
        <section className="af-card af-metric"><label>Awaiting review</label><b>{inReview}</b><small>Review &amp; Reporting phase</small></section>
        <section className="af-card af-metric"><label>Completed</label><b>{completed}</b><small>Closed out</small></section>
      </div>

      {/* Service chips */}
      {user?.role === 'partner' && renewals.length > 0 && (
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
      <div className="af-chips" role="tablist">
        <button role="tab" aria-selected={!preset} onClick={clearPreset}>All ({engs.length})</button>
        {chips.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={preset === k}
            style={serviceCounts[k] ? undefined : { opacity: 0.55 }}
            onClick={() => setParams({ service: k }, { replace: true })}>
            {label} ({serviceCounts[k] || 0})
          </button>
        ))}
      </div>

      {/* Filters + table */}
      <section className="af-card">
        <div className="af-cardhead">
          <div><h2>{preset ? SERVICE_LABELS[preset] : 'All engagements'}</h2><div className="af-sub">{filtered.length} shown</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="af-searchbox"><Search size={13} />
              <input placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search engagements by client" />
            </div>
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
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>CLIENT</th><th>SERVICE</th><th>PHASE</th><th>PROGRESS</th><th>ASSIGNED</th><th>STATUS</th><th>CREATED</th><th></th></tr></thead>
            <tbody>
              {filtered.map(e => {
                const pct = progressOf(e);
                return (
                  <tr key={e.engagement_id}>
                    <td><span className="af-avatar-cell"><Avatar name={e.client_name} size={26} /><b className="nm">{e.client_name || "—"}</b></span></td>
                    <td><span className="af-badge af-badge-blue">{SERVICE_LABELS[e.service_type] || e.service_type}</span></td>
                    <td>{e.phase || '—'}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="af-track"><i style={{ width: pct + '%' }} /></div>
                      <small style={{ color: 'var(--muted)', fontSize: 10 }}>{pct}%</small>
                    </td>
                    <td>{e.assigned_to_name || '—'}</td>
                    <td><span className={`af-badge ${e.status === 'Completed' ? 'af-badge-green' : 'af-badge-blue'}`}>{e.status}</span></td>
                    <td>{fmt(e.created_at)}</td>
                    <td><Link className="af-link" to={`/app/engagements/${e.engagement_id}`} data-testid={`open-eng-${e.engagement_id}`}>Open ↗</Link></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="8" className="af-empty">No engagements match. {preset ? 'Try the All filter.' : 'Create one with “New engagement”.'}</td></tr>}
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
