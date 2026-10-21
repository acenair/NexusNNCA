import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Download } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Math.round(Number(n || 0)).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';
const todayIso = () => new Date().toISOString().slice(0, 10);
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '\u2014';

const SOURCES = ['Referral', 'Website', 'Email enquiry', 'Phone / WhatsApp', 'Existing client', 'Networking'];
const SERVICES = ['External Audit', 'Internal Audit', 'Accounting', 'VAT', 'Corporate Tax', 'AML', 'Advisory'];
const stageBadge = (s) => ({ 'New lead': 'af-badge-blue', 'Qualified': 'af-badge-blue', 'Proposal sent': 'af-badge-amber', 'Negotiation': 'af-badge-amber', 'Confirmed': 'af-badge-green', 'Rejected': 'af-badge-red' }[s] || 'af-badge-blue');

const Leads = () => {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(null);   // lead being edited
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leads`, { withCredentials: true });
      setData(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <div className="page-loading">Loading leads…</div>;
  const S = data.summary;
  const leads = data.leads;

  const cohortLeads = leads.filter(l =>
    (!sourceFilter || l.source === sourceFilter) &&
    (!serviceFilter || l.service === serviceFilter));

  const openLeads = cohortLeads.filter(l => !['Confirmed', 'Rejected'].includes(l.stage));
  const followups = openLeads.filter(l => l.followup_date).sort((a, b) => (a.followup_date || '').localeCompare(b.followup_date || ''));

  const openCreate = () => {
    setForm({ company: '', contact_name: '', phone: '', email: '', source: 'Referral', source_detail: '', service: 'External Audit', owner: user?.name || '', received_date: todayIso(), value: '', stage: 'New lead', proposal_ref: '', sent_date: '', expected_decision_date: '', followup_date: '', closed_date: '', rejection_reason: '', notes: '' });
    setCreating(true); setEditing(null);
  };
  const openEdit = (l) => { setForm({ ...l }); setEditing(l); setCreating(false); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, value: parseFloat(form.value) || 0 };
      if (creating) await axios.post(`${API}/leads`, payload, { withCredentials: true });
      else {
        const q = new URLSearchParams();
        for (const k of ['stage', 'value', 'followup_date', 'notes', 'proposal_ref', 'sent_date', 'expected_decision_date', 'closed_date', 'rejection_reason', 'source_detail']) {
          if (payload[k] !== undefined && payload[k] !== null && payload[k] !== (editing[k] ?? null)) q.set(k, payload[k]);
        }
        await axios.patch(`${API}/leads/${editing.lead_id}?${q.toString()}`, {}, { withCredentials: true });
      }
      setEditing(null); setCreating(false);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Save failed'); }
    setSaving(false);
  };

  const advance = async (lead) => {
    const idx = S.stages.indexOf(lead.stage);
    if (idx < 0 || idx >= S.stages.length - 2) return;
    try {
      await axios.patch(`${API}/leads/${lead.lead_id}?stage=${encodeURIComponent(S.stages[idx + 1])}`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
  };

  const reject = async (lead, reason) => {
    try {
      await axios.patch(`${API}/leads/${lead.lead_id}?stage=Rejected&rejection_reason=${encodeURIComponent(reason)}&closed_date=${todayIso()}`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
  };

  const convert = async (lead) => {
    try {
      await axios.post(`${API}/leads/${lead.lead_id}/convert`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert('Failed'); }
  };

  const exportCsv = () => {
    const rows = [['Company', 'Contact', 'Phone', 'Email', 'Source', 'Source detail', 'Service', 'Owner', 'Received', 'Value', 'Stage', 'Proposal ref', 'Sent', 'Expected decision', 'Closed', 'Rejection reason', 'Follow-up', 'Notes']];
    cohortLeads.forEach(l => rows.push([l.company, l.contact_name || '', l.phone || '', l.email || '', l.source, l.source_detail || '', l.service, l.owner || '', l.received_date || '', l.value, l.stage, l.proposal_ref || '', l.sent_date || '', l.expected_decision_date || '', l.closed_date || '', l.rejection_reason || '', l.followup_date || '', l.notes || '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'lead-cohort.csv';
    a.click();
  };

  const registerRows = cohortLeads.filter(l =>
    (!stageFilter || l.stage === stageFilter) &&
    (!search || [l.company, l.contact_name, l.proposal_ref].join(' ').toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="ov-wrap" data-testid="leads-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">TURN ENQUIRIES INTO ENGAGEMENTS</div>
          <h1>Lead management</h1>
          <p>Track every enquiry, proposal, follow-up and decision.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="af-btn" onClick={exportCsv}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export cohort</button>
          <button className="af-btn-primary" onClick={openCreate} data-testid="new-lead-btn"><Plus size={14} style={{ marginRight: 4 }} /> New lead</button>
        </div>
      </div>

      <div className="af-tabs">
        {['Dashboard', 'Proposal pipeline', 'Lead register', 'Sources & rejection analysis'].map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Dashboard' && (<>
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <section className="af-card af-metric"><label>New leads received</label><b>{S.new_leads}</b><small>All received</small></section>
          <section className="af-card af-metric"><label>Proposals sent</label><b>{S.proposals_sent}</b><small>{S.sent_rate ? S.sent_rate + '% of leads' : '—'}</small></section>
          <section className="af-card af-metric"><label>Proposals confirmed</label><b>{S.confirmed}</b><small>{aed(S.confirmed_value)} fee value</small></section>
          <section className="af-card af-metric"><label>Rejected opportunities</label><b>{S.rejected}</b><small>Reason recorded per loss</small></section>
        </div>
        <div className="af-grid af-grid-3">
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Where the leads stand</h2><div className="af-sub">Each lead appears once</div></div></div>
            {S.stages.map(s => (
              <div className="af-mini" key={s}><span>{s}</span><b>{S.by_stage[s]}</b></div>
            ))}
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Next follow-ups</h2><div className="af-sub">Open leads · earliest first</div></div></div>
            {followups.slice(0, 5).map(l => (
              <div className="af-attention" key={l.lead_id}>
                <div><strong>{l.company}</strong><small>{l.owner} · {l.stage}</small></div>
                <button className={`af-badge ${(l.followup_date < todayIso()) ? 'af-badge-red' : 'af-badge-blue'}`} onClick={() => openEdit(l)}>{fmt(l.followup_date)} ↗</button>
              </div>
            ))}
            {followups.length === 0 && <p className="af-note">No follow-ups scheduled for open leads.</p>}
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Partner attention</h2><div className="af-sub">Pipeline hygiene</div></div></div>
            <div className="af-mini"><span>Open leads with no follow-up</span><b>{S.attention.open_without_followup}</b></div>
            <div className="af-mini"><span>Qualified without proposal</span><b>{S.attention.qualified_without_proposal}</b></div>
            <div className="af-mini"><span>Expected decision date passed</span><b>{S.attention.decision_date_passed}</b></div>
            <div className="af-mini"><span>Overdue follow-ups</span><b>{S.attention.overdue_followups}</b></div>
            <div className="af-mini"><span>Proposal acceptance rate</span><b>{S.attention.acceptance_rate ?? '—'}%</b></div>
          </section>
        </div>
      </>)}

      {tab === 'Proposal pipeline' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Pipeline board</h2><div className="af-sub">{cohortLeads.length} leads · open a card to update stage or outcome</div></div>
            <button className="af-btn-primary" onClick={openCreate}><Plus size={13} style={{ marginRight: 4 }} /> Lead</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(190px, 1fr))', gap: 12, overflowX: 'auto', alignItems: 'start' }}>
            {S.stages.map(s => (
              <div key={s} style={{ background: '#eef4f9', border: '1px solid var(--nn-border)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7693a8', padding: '4px 4px 10px' }}><strong>{s}</strong><span>{S.by_stage[s]}</span></div>
                {cohortLeads.filter(l => l.stage === s).map(l => (
                  <div key={l.lead_id} style={{ background: 'white', border: '1px solid var(--nn-border)', borderRadius: 8, padding: 12, marginBottom: 8 }} data-testid={`deal-${l.lead_id}`}>
                    <button className="af-link" onClick={() => openEdit(l)}><strong style={{ fontSize: 12 }}>{l.company}</strong></button>
                    <p style={{ fontSize: 10, color: 'var(--muted)', margin: '5px 0' }}>{l.service}<br />{l.source}</p>
                    <div style={{ fontSize: 15, margin: '8px 0' }}>{aed(l.value)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)' }}>
                      <span>{(l.owner || '—').split(' ')[0]}</span>
                      <span>{fmt(l.followup_date || l.closed_date)}</span>
                    </div>
                  </div>
                ))}
                {S.by_stage[s] === 0 && <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 14 }}>—</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'Lead register' && (
        <section className="af-card">
          <div className="af-cardhead">
            <div><h2>Lead &amp; proposal register</h2><div className="af-sub">{registerRows.length} records · one per opportunity</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="af-searchbox"><input placeholder="Search client / proposal ref…" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} aria-label="Stage filter">
                <option value="">All stages</option>
                {S.stages.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>CLIENT / CONTACT</th><th>SOURCE / OWNER</th><th>SERVICE / RECEIVED</th><th>PROPOSAL / VALUE</th><th>STAGE / OUTCOME</th><th>NEXT FOLLOW-UP</th><th></th></tr></thead>
              <tbody>
                {registerRows.map(l => (
                  <tr key={l.lead_id} data-testid={`lead-${l.lead_id}`}>
                    <td><b>{l.company}</b><small>{l.contact_name || '—'}</small></td>
                    <td>{l.source}<small>{l.owner || '—'}</small></td>
                    <td>{l.service}<small>{fmt(l.received_date)}</small></td>
                    <td>{l.proposal_ref || 'Not sent'}<small>{aed(l.value)}{l.sent_date ? ` · Sent ${fmt(l.sent_date)}` : ' · Estimate'}</small></td>
                    <td><span className={`af-badge ${stageBadge(l.stage)}`}>{l.stage}</span><small>{l.rejection_reason || ''}{l.closed_date ? ` · ${fmt(l.closed_date)}` : ''}</small></td>
                    <td>{['Confirmed', 'Rejected'].includes(l.stage) ? 'Closed' : fmt(l.followup_date)}<small>{l.notes || ''}</small></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="af-link" onClick={() => openEdit(l)}>Edit</button>
                      {l.stage !== 'Confirmed' && l.stage !== 'Rejected' && (
                        <>
                          {S.stages.indexOf(l.stage) < S.stages.length - 2 && (
                            <button className="af-link" style={{ marginLeft: 8 }} onClick={() => advance(l)}>Advance ↗</button>
                          )}
                          {l.stage === 'Negotiation' && <button className="af-link" style={{ marginLeft: 8, color: 'var(--green)' }} onClick={() => convert(l)}>Win ✓</button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {registerRows.length === 0 && <tr><td colSpan="7" className="af-empty">No leads match.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Sources & rejection analysis' && (
        <div className="af-grid af-grid-65">
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Source performance</h2><div className="af-sub">Closed win rate = confirmed ÷ (confirmed + rejected)</div></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>SOURCE</th><th>LEADS</th><th>SENT</th><th>CONFIRMED</th><th>REJECTED</th><th>WIN RATE</th><th>CONFIRMED VALUE</th></tr></thead>
                <tbody>
                  {Object.entries(S.by_source).map(([src, v]) => (
                    <tr key={src}>
                      <td><b>{src}</b></td><td>{v.leads}</td><td>{v.sent}</td><td>{v.confirmed}</td><td>{v.rejected}</td>
                      <td>{v.closed_win_rate === null ? '—' : v.closed_win_rate + '%'}</td>
                      <td>{aed(v.confirmed_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="af-cardhead" style={{ marginTop: 18, marginBottom: 8 }}><div><h2>Owner-wise pipeline</h2></div></div>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>OWNER</th><th>LEADS</th><th>SENT</th><th>CONFIRMED</th><th>REJECTED</th><th>OPEN VALUE</th></tr></thead>
                <tbody>
                  {Object.entries(S.by_owner).map(([o, v]) => (
                    <tr key={o}><td><b>{o}</b></td><td>{v.leads}</td><td>{v.sent}</td><td>{v.confirmed}</td><td>{v.rejected}</td><td>{aed(v.open_value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Why opportunities were lost</h2><div className="af-sub">Recorded rejection reasons</div></div></div>
            {Object.entries(S.loss_reasons).map(([r, n]) => (
              <div className="af-mini" key={r}><span>{r}</span><b>{n}</b></div>
            ))}
            {S.rejected === 0 && <p className="af-note">No rejected opportunities in this cohort.</p>}
            <div className="af-cardhead" style={{ marginTop: 18, marginBottom: 8 }}><div><h2>Rejection reason codes</h2></div></div>
            <p className="af-note">{S.rejection_reasons.join(' · ')}</p>
          </section>
        </div>
      )}

      {(creating || editing) && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && (setCreating(false), setEditing(null))}>
          <div className="af-dialog" data-testid="lead-editor">
            <button className="af-close" onClick={() => { setCreating(false); setEditing(null); }}>×</button>
            <h2>{creating ? 'New lead' : 'Lead details'}</h2>
            <div className="af-formrow"><label>Prospect / company *</label>
              <input value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="af-formrow"><label>Contact person</label><input value={form.contact_name || ''} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div className="af-formrow"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="af-formrow"><label>Email</label><input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="af-formrow"><label>Service</label>
                <select value={form.service || 'External Audit'} onChange={e => setForm({ ...form, service: e.target.value })}>
                  {SERVICES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="af-formrow"><label>Source</label>
                <select value={form.source || 'Referral'} onChange={e => setForm({ ...form, source: e.target.value })}>
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="af-formrow"><label>Referrer / campaign detail</label><input value={form.source_detail || ''} onChange={e => setForm({ ...form, source_detail: e.target.value })} /></div>
              <div className="af-formrow"><label>Received date</label><input type="date" value={form.received_date || todayIso()} onChange={e => setForm({ ...form, received_date: e.target.value })} /></div>
              <div className="af-formrow"><label>Stage</label>
                <select value={form.stage || 'New lead'} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {S.stages.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="af-formrow"><label>Proposal reference</label><input value={form.proposal_ref || ''} onChange={e => setForm({ ...form, proposal_ref: e.target.value })} placeholder="PROP-2026-001" /></div>
              <div className="af-formrow"><label>Proposal sent date</label><input type="date" value={form.sent_date || ''} onChange={e => setForm({ ...form, sent_date: e.target.value })} /></div>
              <div className="af-formrow"><label>Value (AED, excl. tax)</label><input type="number" value={form.value ?? ''} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
              <div className="af-formrow"><label>Expected decision date</label><input type="date" value={form.expected_decision_date || ''} onChange={e => setForm({ ...form, expected_decision_date: e.target.value })} /></div>
              <div className="af-formrow"><label>Next follow-up</label><input type="date" value={form.followup_date || ''} onChange={e => setForm({ ...form, followup_date: e.target.value })} /></div>
              <div className="af-formrow"><label>Confirmed / rejected date</label><input type="date" value={form.closed_date || ''} onChange={e => setForm({ ...form, closed_date: e.target.value })} /></div>
            </div>
            {form.stage === 'Rejected' && (
              <div className="af-formrow"><label>Rejection reason *</label>
                <select value={form.rejection_reason || ''} onChange={e => setForm({ ...form, rejection_reason: e.target.value })}>
                  <option value="">Choose…</option>
                  {S.rejection_reasons.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div className="af-formrow"><label>Notes / next action</label>
              <textarea rows="2" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            {(form.history || []).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                {(form.history || []).slice().reverse().slice(0, 4).map((hh, i) => <div key={i}>· {hh.text || hh.stage} <small>({fmt(hh.at)})</small></div>)}
              </div>
            )}
            <button className="af-btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={save} disabled={saving || !form.company} data-testid="save-lead-btn">{saving ? 'Saving…' : 'Save lead'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
