import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SERVICE_LABELS = {
  statutory_audit: 'External Audit', internal_audit: 'Internal Audit', stock_audit: 'Stock Audit',
  fraud_audit: 'Fraud Audit', vat_registration: 'VAT Registration', vat_filing: 'VAT',
  vat_amendments: 'VAT Amendments', corporate_registration: 'Corporate Registration',
  corporate_tax: 'Corporate Tax', company_formation: 'Company Formation', company_liquidation: 'Liquidation',
  advisory_valuation: 'Valuation', advisory_due_diligence: 'Due Diligence', aml_review: 'AML / CFT',
  aml_filing: 'AML Filing', goaml: 'goAML', aml_reports: 'AML Reports', accounting: 'Accounting',
};
const svcLabel = (s) => SERVICE_LABELS[s] || (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const disp = (s) => s === 'Pending' ? 'Scheduled' : s === 'In Progress' ? 'In progress' : (s || '');
const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt = (d) => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtShort = (d) => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
const daysTo = (d) => Math.round((new Date(d.length > 10 ? d : d + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);
const initials = (name) => (name || '?').replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const numLink = { fontSize: 26, letterSpacing: '-0.8px', fontWeight: 650, margin: '10px 0 5px', display: 'inline-block', color: '#01457C', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(14,109,180,0.35)', textUnderlineOffset: 4, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' };

const Customer360 = () => {
  const { clientId } = useParams();
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [kyc, setKyc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [workFilter, setWorkFilter] = useState('All statuses');

  const load = async () => {
    setLoading(true);
    try {
      const [res, kycRes] = await Promise.all([
        axios.get(`${API}/clients/${clientId}/overview360`, { withCredentials: true }),
        axios.get(`${API}/compliance/records?scope=customers`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      setData(res.data);
      const recs = Array.isArray(kycRes.data) ? kycRes.data : (kycRes.data.records || []);
      setKyc(recs.filter(r => r.subject_id === clientId || r.client_id === clientId));
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load client');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [clientId]);

  const scroll = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 6500); };

  if (loading) return <div className="ov-wrap" data-testid="customer-overview"><p style={{ padding: 24, color: 'var(--muted)' }}>Loading customer…</p></div>;
  if (error) return <div className="af-card" style={{ padding: 24, color: 'var(--red)' }} data-testid="customer-overview">{error} — <Link className="af-link" to="/app/customers">back to Customer overview</Link></div>;
  if (!data) return null;

  const c = data.client;
  const engs = data.engagements || [];
  const invoices = (data.invoices || []).filter(i => !i.cancelled);
  const tasks = data.tasks || [];
  const liveInv = invoices.filter(i => i.status !== 'Draft');
  const totalInvoiced = liveInv.reduce((n, i) => n + (i.amount || 0), 0);
  const totalPaid = liveInv.reduce((n, i) => n + (i.amount_paid || 0) - (i.credits || []).reduce((m, x) => m + x.amount, 0), 0);
  const due = Math.max(0, totalInvoiced - totalPaid);
  const unpaid = liveInv.filter(i => (i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((m, x) => m + x.amount, 0)) > 0.009);
  const overdueInv = unpaid.filter(i => i.due_date && i.due_date < today);
  const overdueAmt = overdueInv.reduce((n, i) => n + (i.amount - (i.amount_paid || 0)), 0);

  const openTasks = tasks.filter(t => disp(t.status) !== 'Completed');
  const kycExpired = kyc.filter(r => r.date_basis !== 'review' && r.due_date && r.due_date < today);
  const kycExpiring = kyc.filter(r => r.date_basis !== 'review' && r.due_date && r.due_date >= today && daysTo(r.due_date) <= 30);
  const kycAttention = kycExpired.length + kycExpiring.length;
  const nextTask = openTasks.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
  const activeEngs = engs.filter(e => e.status === 'Active');
  const rm = activeEngs[0]?.assigned_to_name || c.workdone_by || '—';
  const dueLabel = (d) => d && d.includes('-') && d.length === 5 ? d.replace('-', '/') : (d ? fmt(d) : '—');

  const tabLink = (id, label) => (
    <a key={id} onClick={() => scroll(id)} style={{ padding: '17px 0', whiteSpace: 'nowrap', color: 'var(--muted, #7891a4)', cursor: 'pointer', borderBottom: '3px solid transparent' }}>{label}</a>
  );

  return (
    <div className="ov-wrap" data-testid="customer-overview">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">CUSTOMER WORKSPACE</div>
          <h1>Customer overview</h1>
          <p>Engagements, compliance and collections at a glance.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/app/customers" className="af-btn" data-testid="back-customers">All customers</Link>
          <Link to="/app/client-master" className="af-btn" data-testid="edit-customer-btn">Edit customer profile</Link>
          <button className="af-btn-primary" data-testid="prepare-reminder"
            onClick={() => showToast(`Reminder preview: follow up with ${c.name} on ${unpaid.length ? unpaid[0].invoice_number : 'open items'}${overdueAmt ? ` (${aed(overdueAmt)} overdue)` : ''}. No message has been sent.`)}>
            Prepare reminder
          </button>
        </div>
      </div>

      {/* profile */}
      <section className="af-card" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 4 }} data-testid="customer-profile">
        <div style={{ padding: 19, background: '#e7f1fa', borderRadius: 12, fontSize: 22, fontWeight: 700, color: '#01457C' }}>{initials(c.name)}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 20, fontWeight: 650 }}>{c.name} <span className="af-badge af-badge-green" style={{ marginLeft: 6 }}>{c.status || 'Active customer'}</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            {c.client_code || c.client_id} &nbsp;·&nbsp; {c.jurisdiction || c.emirate || '—'}{c.industry ? ` · ${c.industry}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {c.trade_name ? <>Trade name: {c.trade_name} &nbsp;·&nbsp;</> : null}
            Financial year end: {dueLabel(c.financial_year_end || c.fy_end)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`af-badge ${kycAttention ? 'af-badge-amber' : 'af-badge-green'}`} data-testid="kyc-badge">{kycAttention ? 'KYC action required' : 'KYC valid'}</span>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Relationship manager: {rm}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Snapshot · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>
      </section>

      {/* section tabs */}
      <nav style={{ display: 'flex', gap: 25, borderBottom: '1px solid var(--line, #e4eff6)', marginTop: 13, overflow: 'auto' }} aria-label="Customer sections" data-testid="customer-tabs">
        {tabLink('top', 'Overview')}
        {tabLink('services', 'Customer & services')}
        {tabLink('kyc', 'KYC & documents')}
        {tabLink('billing', 'Billing & payments')}
        {tabLink('deadlines', 'Reminders & deadlines')}
      </nav>

      {/* 4 metric widgets — numbers hyperlinked to their sections */}
      <section className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', margin: '20px 0' }} data-testid="customer-metrics">
        <section className="af-card af-metric">
          <label>Total amount due</label>
          <button onClick={() => scroll('billing')} title="Jump to Billing & payments" data-testid="metric-due" style={numLink}>
            {aed(due)}
          </button>
          <small>{overdueAmt ? <span style={{ color: '#b14943' }}>{aed(overdueAmt)} overdue</span> : 'Nothing overdue'} · {unpaid.length} unpaid invoice{unpaid.length === 1 ? '' : 's'}</small>
        </section>
        <section className="af-card af-metric">
          <label>Ongoing work</label>
          <button onClick={() => scroll('work')} title="Jump to Ongoing work" data-testid="metric-work" style={numLink}>
            {activeEngs.length} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>engagements</span>
          </button>
          <small>
            {openTasks.filter(t => disp(t.status) === 'In progress').length} in progress · {openTasks.filter(t => disp(t.status) === 'In review').length} review · {openTasks.filter(t => disp(t.status) === 'Awaiting client').length} awaiting client
          </small>
        </section>
        <section className="af-card af-metric">
          <label>KYC attention</label>
          <button onClick={() => scroll('kyc')} title="Jump to KYC & documents" data-testid="metric-kyc" style={{ ...numLink, color: kycAttention ? '#b14943' : '#01457C' }}>
            {kycAttention} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>documents</span>
          </button>
          <small>{kycExpired.length} expired · {kycExpiring.length} expiring within 30 days</small>
        </section>
        <section className="af-card af-metric">
          <label>Next deadline</label>
          <button onClick={() => scroll('deadlines')} title="Jump to Reminders & deadlines" data-testid="metric-deadline" style={numLink}>
            {nextTask ? fmtShort(nextTask.due_date) : '—'}
          </button>
          <small>{nextTask ? `${nextTask.title.slice(0, 34)} · in ${Math.max(0, daysTo(nextTask.due_date))} days` : 'No open deadlines'}</small>
        </section>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: 20, alignItems: 'start' }}>
        {/* left column */}
        <div>
          {/* scope of work */}
          <section className="af-card" id="services" style={{ marginBottom: 20 }} data-testid="scope-card">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 15 }}>Scope of work</h2></div><span className="af-sub">{activeEngs.length} service areas</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {activeEngs.map(e => (
                <div key={e.engagement_id} style={{ border: '1px solid var(--line, #e4eff6)', padding: 14, borderRadius: 8 }}>
                  <strong style={{ fontSize: 13, display: 'block' }}>{svcLabel(e.service_type)}</strong>
                  <p style={{ fontSize: 11, minHeight: 32, color: 'var(--muted)' }}>{e.phase ? `${e.phase} phase` : 'In progress'}</p>
                  <span className="af-badge af-badge-green">Engaged</span>{' '}
                  <small style={{ fontSize: 10, color: 'var(--muted)' }}>{e.fee_amount ? `${aed(e.fee_amount)} · ` : ''}{((e.terms || {}).payment_terms || 'Annual').slice(0, 30)}</small>
                </div>
              ))}
              {activeEngs.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No engagements yet for this customer.</p>}
            </div>
          </section>

          {/* ongoing work */}
          <section className="af-card" id="work" style={{ marginBottom: 20 }} data-testid="work-card">
            <div className="af-cardhead">
              <div><h2 style={{ fontSize: 15 }}>Ongoing work</h2></div>
              <select className="af-btn" value={workFilter} onChange={e => setWorkFilter(e.target.value)} data-testid="work-status-filter" style={{ fontSize: 11, padding: '6px 9px' }}>
                {['All statuses', 'In progress', 'In review', 'Awaiting client', 'Scheduled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="af-tablewrap" style={{ overflow: 'auto' }}>
              <table className="af-table">
                <thead><tr><th>ENGAGEMENT / PERIOD</th><th>ASSIGNED TO</th><th>STATUS</th><th>TARGET DATE</th></tr></thead>
                <tbody>
                  {openTasks.filter(t => workFilter === 'All statuses' || disp(t.status) === workFilter).map(t => (
                    <tr key={t.task_id} data-work={disp(t.status)} data-testid="work-row">
                      <td><strong>{t.title}</strong></td>
                      <td>{t.assigned_to_name || '—'}</td>
                      <td>
                        <span className={`af-badge ${disp(t.status) === 'Awaiting client' ? 'af-badge-amber' : disp(t.status) === 'In review' ? 'af-badge-blue' : 'af-badge-green'}`}>{disp(t.status)}</span>
                        <div style={{ height: 5, background: 'var(--line, #e4eff6)', borderRadius: 5, marginTop: 8, width: 100 }}>
                          <i style={{ display: 'block', height: '100%', background: '#168ed2', borderRadius: 5, width: `${t.progress || 0}%` }} />
                        </div>
                      </td>
                      <td>{fmt(t.due_date)}</td>
                    </tr>
                  ))}
                  {openTasks.filter(t => workFilter === 'All statuses' || disp(t.status) === workFilter).length === 0 && (
                    <tr><td colSpan={4} className="af-empty">No open work items.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* KYC & document validity */}
          <section className="af-card" id="kyc" data-testid="kyc-card">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 15 }}>KYC &amp; document validity</h2></div><span className={`af-badge ${kycAttention ? 'af-badge-amber' : 'af-badge-green'}`}>{kycAttention ? `${kycAttention} require attention` : 'All valid'}</span></div>
            {kycAttention > 0 && (
              <div style={{ padding: '12px 14px', background: '#fff7e7', color: '#8b6725', fontSize: 12, borderRadius: 7, marginBottom: 14, lineHeight: 1.6 }}>
                {kycExpired.length > 0 && <><b>{kycExpired[0].doc_type}</b> has expired{kycExpired.length > 1 ? ` (+${kycExpired.length - 1} more expired)` : ''}. </>}
                {kycExpiring.length > 0 && <>{kycExpiring[0].doc_type} expires in {daysTo(kycExpiring[0].due_date)} days. </>}
                Request updated copies from the primary contact.
              </div>
            )}
            <div className="af-tablewrap" style={{ overflow: 'auto' }}>
              <table className="af-table">
                <thead><tr><th>DOCUMENT</th><th>REFERENCE / HOLDER</th><th>EXPIRY DATE</th><th>STATUS</th></tr></thead>
                <tbody>
                  {kyc.map(r => {
                    const isReview = r.date_basis === 'review';
                    const expired = !isReview && r.due_date && r.due_date < today;
                    const expiring = !isReview && r.due_date && daysTo(r.due_date) <= 30 && !expired;
                    return (
                      <tr key={r.record_id}>
                        <td><strong>{r.doc_type}</strong></td>
                        <td>{r.masked_ref || r.holder || '—'}{r.holder && r.masked_ref ? <small>{r.holder}</small> : null}</td>
                        <td>{r.due_date ? fmt(r.due_date) : '—'}</td>
                        <td>
                          {expired ? <span className="af-badge af-badge-red">Expired · {Math.abs(daysTo(r.due_date))} days ago</span>
                            : expiring ? <span className="af-badge af-badge-amber">Expiring · {daysTo(r.due_date)} days</span>
                              : isReview ? <span className="af-badge af-badge-grey">Review due {r.due_date ? fmt(r.due_date) : '—'}</span>
                                : <span className="af-badge af-badge-green">Valid{r.due_date ? ` · ${daysTo(r.due_date)} days` : ' · no expiry'}</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {kyc.length === 0 && <tr><td colSpan={4} className="af-empty">No KYC documents recorded.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Full register in the Compliance tracker · masked references only</span>
              <Link to="/app/doc-requests" className="af-btn" data-testid="prepare-doc-request">Prepare document request</Link>
            </div>
          </section>
        </div>

        {/* right column */}
        <div>
          {/* reminders & deadlines */}
          <section className="af-card" id="deadlines" style={{ marginBottom: 20 }} data-testid="deadlines-card">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 15 }}>Reminders &amp; deadlines</h2></div><span className="af-sub">{new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span></div>
            {overdueInv.length > 0 && (
              <div style={{ padding: '12px 14px', background: '#fdebea', color: '#b14943', fontSize: 12, borderRadius: 7, marginBottom: 14, lineHeight: 1.6 }}>
                <b>Overdue follow-up</b><br />{overdueInv[0].invoice_number} · {aed(overdueInv[0].amount - (overdueInv[0].amount_paid || 0))}<br />Due {fmt(overdueInv[0].due_date)} · {Math.abs(daysTo(overdueInv[0].due_date))} days overdue
              </div>
            )}
            {openTasks.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 4).map(t => {
              const dt = daysTo(t.due_date);
              return (
                <div key={t.task_id} style={{ display: 'flex', gap: 13, padding: '13px 0', borderBottom: '1px solid var(--line, #e4eff6)' }}>
                  <div style={{ background: '#f1f5f7', borderRadius: 8, textAlign: 'center', padding: '8px 10px', minWidth: 48, height: 50, fontWeight: 700, fontSize: 17 }}>
                    {t.due_date.slice(-2)}<small style={{ display: 'block', fontSize: 9, fontWeight: 500 }}>{new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</small>
                  </div>
                  <div>
                    <strong style={{ fontSize: 12 }}>{t.title.slice(0, 46)}</strong>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '5px 0 8px' }}>{t.assigned_to_name ? `Internal target · ${t.assigned_to_name}` : 'Internal target'}</p>
                    <span className={`af-badge ${dt < 0 ? 'af-badge-red' : disp(t.status) === 'Awaiting client' ? 'af-badge-amber' : 'af-badge-grey'}`}>{dt < 0 ? `${-dt} days overdue` : dt === 0 ? 'Due today' : `In ${dt} days`}</span>
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>Job targets from Task management · statutory dates tracked in the Deadline tracker.</p>
          </section>

          {/* outstanding balance */}
          <section className="af-card" id="billing" style={{ marginBottom: 20 }} data-testid="billing-card">
            <div className="af-cardhead"><div><h2 style={{ fontSize: 15 }}>Outstanding balance</h2></div><span className={`af-badge ${due > 0 ? 'af-badge-red' : 'af-badge-green'}`}>{due > 0 ? 'Payment pending' : 'Settled'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 12 }}><span>Total invoiced</span><strong>{aed(totalInvoiced)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 12 }}><span>Payments received</span><strong>{aed(Math.max(0, totalPaid))}</strong></div>
            <div style={{ borderTop: '1px solid var(--line, #e4eff6)', fontWeight: 700, marginTop: 8, paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Amount due</span><strong data-testid="billing-due">{aed(due)}</strong></div>
            </div>
            <div style={{ marginTop: 16 }}>
              {unpaid.slice(0, 4).map(i => (
                <div key={i.invoice_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <div><strong>{i.invoice_number}</strong><p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0' }}>Due {fmt(i.due_date)} · {i.status === 'Draft' ? 'Draft' : (i.due_date && i.due_date < today) ? 'Overdue' : 'Upcoming'}</p></div>
                  <strong>{aed(i.amount - (i.amount_paid || 0))}</strong>
                </div>
              ))}
              {unpaid.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)' }}>No unpaid invoices.</p>}
            </div>
            <Link to="/app/invoices" className="af-btn" style={{ width: '100%', marginTop: 12, textAlign: 'center', display: 'block', boxSizing: 'border-box' }} data-testid="open-invoices">Open Invoices &amp; collections</Link>
          </section>

          {/* primary contact */}
          <section className="af-card" data-testid="contact-card">
            <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Primary contact</h2>
            <div style={{ borderTop: '1px solid var(--line, #e4eff6)', paddingTop: 14, marginTop: 6, fontSize: 12, lineHeight: 1.8 }}>
              <strong>{c.contact_name || c.name}</strong><br />
              {c.contact_designation ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.contact_designation}</span> : null}
              {c.contact_email || c.contact_phone ? <><br />{[c.contact_phone, c.contact_email].filter(Boolean).join(' · ')}</> : null}
            </div>
            <div style={{ borderTop: '1px solid var(--line, #e4eff6)', paddingTop: 14, marginTop: 14, fontSize: 12, lineHeight: 1.8 }}>
              <span style={{ fontSize: 10, letterSpacing: 1, color: 'var(--muted)' }}>PAYMENT TERMS</span><br />
              {(activeEngs[0]?.terms || {}).payment_terms || '—'}
            </div>
          </section>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#17354c', color: '#fff', padding: 16, borderRadius: 8, fontSize: 12.5, zIndex: 90, maxWidth: 420 }} data-testid="customer-toast">{toast}</div>
      )}
    </div>
  );
};

export default Customer360;
