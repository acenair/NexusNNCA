import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Download, ArrowRight } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

const SOURCES = ['Referral', 'Website', 'Email enquiry', 'Phone / WhatsApp', 'Existing client', 'Networking'];
const SERVICES = ['External Audit', 'Internal Audit', 'Accounting', 'VAT', 'Corporate Tax', 'AML', 'Advisory'];
const STAGES = ['New', 'Contacted', 'Proposal sent', 'Confirmed', 'Rejected'];
const stageBadge = (s) => ({ New: 'af-badge-grey', Contacted: 'af-badge-blue', 'Proposal sent': 'af-badge-amber', Confirmed: 'af-badge-green', Rejected: 'af-badge-red' }[s] || 'af-badge-blue');

const Leads = () => {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ company: '', contact_name: '', phone: '', email: '', source: 'Referral', service: 'External Audit', value: '', followup_date: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leads`, { withCredentials: true });
      setData(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/leads`, { ...form, value: parseFloat(form.value) || 0 }, { withCredentials: true });
      setShowCreate(false);
      setForm({ company: '', contact_name: '', phone: '', email: '', source: 'Referral', service: 'External Audit', value: '', followup_date: '', notes: '' });
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const advance = async (lead) => {
    const idx = STAGES.indexOf(lead.stage);
    if (idx < 0 || idx >= STAGES.length - 2) return;
    const next = STAGES[idx + 1];
    try {
      await axios.patch(`${API}/leads/${lead.lead_id}?stage=${encodeURIComponent(next)}`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert('Failed'); }
  };

  const reject = async (lead) => {
    if (!window.confirm(`Close ${lead.company} as lost?`)) return;
    try {
      await axios.patch(`${API}/leads/${lead.lead_id}?stage=Rejected`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert('Failed'); }
  };

  const convert = async (lead) => {
    try {
      await axios.post(`${API}/leads/${lead.lead_id}/convert`, {}, { withCredentials: true });
      await load();
    } catch (err) { alert('Failed'); }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Company', 'Contact', 'Phone', 'Email', 'Source', 'Service', 'Owner', 'Value', 'Stage', 'Follow-up', 'Notes']];
    data.leads.forEach(l => rows.push([l.company, l.contact_name || '', l.phone || '', l.email || '', l.source, l.service, l.owner || '', l.value, l.stage, l.followup_date || '', l.notes || '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'leads.csv';
    a.click();
  };

  if (loading || !data) return <div className="page-loading">Loading leads…</div>;
  const S = data.summary;

  return (
    <div className="ov-wrap" data-testid="leads-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">TURN ENQUIRIES INTO ENGAGEMENTS</div>
          <h1>Lead management</h1>
          <p>Track every enquiry, proposal, follow-up and decision.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="af-btn" onClick={exportCsv}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export</button>
          <button className="af-btn-primary" onClick={() => setShowCreate(true)} data-testid="new-lead-btn"><Plus size={14} style={{ marginRight: 4 }} /> New lead</button>
        </div>
      </div>

      {/* Funnel */}
      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <section className="af-card af-metric"><label>New leads received</label><b>{S.new_leads}</b><small>All time</small></section>
        <section className="af-card af-metric"><label>Proposals sent</label><b>{S.proposals_sent}</b><small>{S.new_leads ? Math.round(S.proposals_sent / S.new_leads * 100) : 0}% of leads</small></section>
        <section className="af-card af-metric"><label>Confirmed</label><b>{S.confirmed}</b><small>{aed(S.confirmed_value)} fee value</small></section>
        <section className="af-card af-metric"><label>Rejected</label><b>{S.rejected}</b><small>Closed losses</small></section>
        <section className="af-card af-metric"><label>Open proposal value</label><b>{aed(S.open_value)}</b><small>Awaiting decision</small></section>
        <section className="af-card af-metric"><label>Win rate</label><b>{S.win_rate}%</b><small>Confirmed / proposed</small></section>
      </div>

      {/* Pipeline bar */}
      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead"><div><h2>Pipeline</h2><div className="af-sub">Leads by stage · Now</div></div></div>
        <div className="af-pipeline">
          {STAGES.map((s, i) => (
            <span key={s} style={{ width: S.new_leads ? (S.by_stage[s] / S.new_leads) * 100 + '%' : '0%', background: ['#d8e9f7', '#7fb9e0', '#d39835', '#159e81', '#d36b6b'][i] }} />
          ))}
        </div>
        <div className="af-stages">
          {STAGES.map(s => <div className="af-stage" key={s}><span>{s}</span><b>{S.by_stage[s]}</b></div>)}
        </div>
      </section>

      {/* Register */}
      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead"><div><h2>Lead register</h2><div className="af-sub">{data.leads.length} leads · newest first</div></div></div>
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>COMPANY / CONTACT</th><th>SOURCE</th><th>SERVICE</th><th>OWNER</th><th>VALUE</th><th>FOLLOW-UP</th><th>STAGE</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {data.leads.map(l => (
                <tr key={l.lead_id} data-testid={`lead-${l.lead_id}`}>
                  <td><b>{l.company}</b><small>{l.contact_name || '—'}{l.phone ? ` · ${l.phone}` : ''}</small></td>
                  <td>{l.source}</td>
                  <td>{l.service}</td>
                  <td>{l.owner || '—'}</td>
                  <td><b>{aed(l.value)}</b></td>
                  <td>{fmt(l.followup_date)}</td>
                  <td><span className={`af-badge ${stageBadge(l.stage)}`}>{l.stage}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {l.stage !== 'Confirmed' && l.stage !== 'Rejected' && (
                      <button className="af-link" onClick={() => advance(l)} title={`Move to ${STAGES[STAGES.indexOf(l.stage) + 1] || 'next'}`}>
                        {STAGES[STAGES.indexOf(l.stage) + 1] === 'Confirmed' ? 'Confirm' : 'Advance'} ↗
                      </button>
                    )}
                    {l.stage === 'Proposal sent' && <button className="af-link" style={{ marginLeft: 8, color: 'var(--green)' }} onClick={() => convert(l)}>Win ✓</button>}
                    {l.stage !== 'Rejected' && l.stage !== 'Confirmed' && (
                      <button className="af-link" style={{ marginLeft: 8, color: 'var(--red)' }} onClick={() => reject(l)}>Lost</button>
                    )}
                    {l.stage === 'Confirmed' && <small style={{ color: 'var(--muted)' }}>Added to proposals</small>}
                  </td>
                </tr>
              ))}
              {data.leads.length === 0 && <tr><td colSpan="8" className="af-empty">No leads yet. Add the first enquiry.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create modal */}
      {showCreate && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setShowCreate(false)}>
          <div className="af-dialog" data-testid="new-lead-modal">
            <button className="af-close" onClick={() => setShowCreate(false)}>×</button>
            <h2>New lead</h2>
            <div className="af-formrow"><label>Company *</label>
              <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Enquiry company name" />
            </div>
            <div className="af-formrow"><label>Contact person</label>
              <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Phone / WhatsApp</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Source</label>
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Service line</label>
              <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>
                {SERVICES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Expected fee (AED)</label>
              <input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Next follow-up</label>
              <input type="date" value={form.followup_date} onChange={e => setForm({ ...form, followup_date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Context, requirements…" />
            </div>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={create} disabled={saving || !form.company} data-testid="save-lead-btn">{saving ? 'Saving…' : 'Save lead'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
