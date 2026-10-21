import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Building2, MapPin, CalendarDays, FileText, Wallet, Briefcase } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const TABS = ['Overview', 'Engagements', 'Billing', 'Documents', 'Calendar'];

const Customer360 = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/clients/${clientId}/overview360`, { withCredentials: true });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load client');
    }
    setLoading(false);
  };

  if (loading) return <div className="page-loading">Loading customer…</div>;
  if (error) return <div className="af-card" style={{ padding: 24, color: 'var(--red)' }}>{error} — <Link className="af-link" to="/app/client-master">back to Customers</Link></div>;
  if (!data) return null;

  const c = data.client;
  const engs = data.engagements || [];
  const invoices = data.invoices || [];
  const tasks = data.tasks || [];
  const docs = data.documents || [];
  const events = data.events || [];
  const totals = data.totals || {};
  const activeEngs = engs.filter(e => e.status === 'Active');

  const profileRows = [
    ['Legal name', c.name], ['Trade name', c.trade_name], ['Entity type', c.entity_type],
    ['Emirate', c.emirate], ['Jurisdiction', c.jurisdiction], ['Free zone', c.free_zone],
    ['Licensing authority', c.licensing_authority], ['Industry / sector', c.industry],
    ['Trade licence no.', c.trade_licence_no], ['Licence type', c.license_type],
    ['Licence expiry', fmt(c.license_expiry)], ['VAT registered', c.vat_registered == null ? '—' : c.vat_registered ? 'Yes' : 'No'],
    ['VAT TRN', c.trn], ['Corporate tax registered', c.ct_registered == null ? '—' : c.ct_registered ? 'Yes' : 'No'],
    ['Financial year end', fmt(c.financial_year_end)], ['Service type', c.service_type],
    ['Audit purpose', c.audit_purpose], ['Audit period', c.audit_period],
    ['Previous auditor', c.previous_auditor], ['Fee (AED)', c.fee_amount ? aed(c.fee_amount) : '—'],
    ['Corporate tax TRN', c.corporate_tax_trn], ['Handled by', c.workdone_by],
    ['Lead source', c.lead_source], ['Referred by', c.referred_by],
    ['Onboarding stage', c.onboarding_stage || 'Completed'],
    ['Primary contact', c.contact_name ? `${c.contact_name}${c.contact_designation ? ' · ' + c.contact_designation : ''}` : null],
    ['Contact phone / email', [c.contact_phone, c.contact_email].filter(Boolean).join(' · ') || null],
    ['Secondary contact', c.secondary_contact],
    ['AML risk rating', c.aml_risk_rating || 'Low'],
    ['Status', c.status],
  ];

  const months = {};
  invoices.forEach(i => {
    const k = (i.date_issued || i.created_at || '').slice(0, 7);
    if (!k) return;
    months[k] = months[k] || { billed: 0, paid: 0 };
    if (i.status !== 'Cancelled') months[k].billed += i.amount || 0;
    if (i.paid) months[k].paid += i.amount || 0;
  });

  return (
    <div className="ov-wrap" data-testid="customer-360">
      <div className="ov-heading">
        <div>
          <button className="af-link" onClick={() => navigate('/app/client-master')} style={{ marginBottom: 6 }}>← All customers</button>
          <div className="ov-eyebrow">CUSTOMER 360</div>
          <h1>{c.name}</h1>
          <p>{c.industry || c.entity_type || 'Client'}{c.emirate ? ` · ${c.emirate}` : ''}{c.jurisdiction ? ` · ${c.jurisdiction}` : ''}</p>
        </div>
        <div className="ov-asof">{c.status}</div>
      </div>

      {/* Summary tiles */}
      <div className="af-kpis">
        <section className="af-card af-metric">
          <span className="af-icon"><Briefcase size={18} /></span>
          <label>Active engagements</label>
          <b>{activeEngs.length}</b><small>of {engs.length} total</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><Wallet size={18} /></span>
          <label>Billed to date</label>
          <b>{aed(totals.billed_total)}</b><small>{invoices.length} invoice(s)</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><Wallet size={18} /></span>
          <label>Outstanding</label>
          <b>{aed(totals.outstanding)}</b><small>{invoices.filter(i => !i.paid).length} unpaid</small>
        </section>
        <section className="af-card af-metric">
          <span className="af-icon"><FileText size={18} /></span>
          <label>Documents</label>
          <b>{docs.length}</b><small>{tasks.filter(t => t.status !== 'Completed').length} open tasks</small>
        </section>
      </div>

      {/* Tabs */}
      <div className="af-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Profile &amp; compliance data</h2><div className="af-sub">From the firm's client master</div></div></div>
          <div className="af-profile-grid">
            {profileRows.map(([k, v]) => (
              <div className="af-profile-row" key={k}><span>{k}</span><b>{v ?? '—'}</b></div>
            ))}
          </div>
        </section>
      )}

      {tab === 'Engagements' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Engagements</h2><div className="af-sub">All engagements for this client</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>SERVICE</th><th>PHASE</th><th>STATUS</th><th>ASSIGNED</th><th>CREATED</th><th></th></tr></thead>
              <tbody>
                {engs.map(e => (
                  <tr key={e.engagement_id}>
                    <td><b>{SERVICE_LABELS[e.service_type] || e.service_type}</b></td>
                    <td>{e.phase || '—'}</td>
                    <td><span className={`af-badge ${e.status === 'Active' ? 'af-badge-blue' : 'af-badge-green'}`}>{e.status}</span></td>
                    <td>{e.assigned_to_name || '—'}</td>
                    <td>{fmt(e.created_at)}</td>
                    <td><Link className="af-link" to={`/app/engagements/${e.engagement_id}`}>Open ↗</Link></td>
                  </tr>
                ))}
                {engs.length === 0 && <tr><td colSpan="6" className="af-empty">No engagements yet. Create one from a service module.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Billing' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Invoices</h2><div className="af-sub">Outstanding {aed(totals.outstanding)} · Paid to date {aed(totals.paid)}</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>INVOICE</th><th>ISSUED</th><th>DUE</th><th>AMOUNT</th><th>STATUS</th></tr></thead>
              <tbody>
                {invoices.map(i => (
                  <tr key={i.invoice_id}>
                    <td><b>{i.invoice_number || i.invoice_id}</b></td>
                    <td>{fmt(i.date_issued || i.created_at)}</td>
                    <td>{fmt(i.due_date)}</td>
                    <td>{aed(i.amount)}</td>
                    <td><span className={`af-badge ${i.paid ? 'af-badge-green' : 'af-badge-amber'}`}>{i.paid ? 'Paid' : i.status || 'Unpaid'}</span></td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan="5" className="af-empty">No invoices yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Documents' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Documents</h2><div className="af-sub">Files uploaded for this client</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>FILE</th><th>TYPE</th><th>UPLOADED</th><th></th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.file_id}>
                    <td><b>{d.original_filename}</b></td>
                    <td>{d.document_type || '—'}</td>
                    <td>{fmt(d.created_at)}</td>
                    <td><a className="af-link" href={`${API}/files/${d.file_id}`} target="_blank" rel="noreferrer">Download ↗</a></td>
                  </tr>
                ))}
                {docs.length === 0 && <tr><td colSpan="4" className="af-empty">No documents uploaded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Calendar' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Calendar &amp; timeline</h2><div className="af-sub">Events, filings and key dates</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>DATE</th><th>EVENT</th><th>TYPE</th></tr></thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.event_id}>
                    <td><b>{fmt(ev.date)}</b></td>
                    <td>{ev.title}{ev.description ? <small>{ev.description}</small> : null}</td>
                    <td><span className="af-badge af-badge-blue">{ev.event_type || '—'}</span></td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan="3" className="af-empty">No calendar events for this client yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="af-note">Key dates from the client master: licence expiry {fmt(c.license_expiry)} · financial year end {fmt(c.financial_year_end)}</p>
        </section>
      )}
    </div>
  );
};

export default Customer360;
