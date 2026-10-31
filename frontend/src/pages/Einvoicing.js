import React, { useState, useEffect } from 'react';
import { FileCheck2, AlertTriangle, Pencil, Save, X, ExternalLink } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CHECK_LABELS = {
  tin_confirmed: 'TIN confirmed (first 10 digits of TRN)',
  fields_ready: 'Invoice data covers the 51 mandatory PINT AE fields',
  asp_appointed: 'ASP appointed via EmaraTax (MoF accredited register)',
  peppol_id: 'Peppol participant ID issued (0235 + TIN)',
  tested: 'Test invoice exchanged end-to-end with the ASP',
};

const URGENCY = {
  overdue: { bg: '#fdecec', fg: 'var(--red)', label: 'ASP APPOINTMENT OVERDUE' },
  urgent: { bg: '#fdf6ec', fg: '#b45309', label: 'ASP APPOINTMENT DUE SOON' },
  ok: { bg: '#f0f7f2', fg: 'var(--green)', label: 'ON TRACK' },
};

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US');

const Einvoicing = () => {
  const [clients, setClients] = useState([]);
  const [phases, setPhases] = useState({});
  const [facts, setFacts] = useState({});
  const [penalties, setPenalties] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // client_id
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/einvoicing/overview`, { withCredentials: true });
      setClients(res.data.clients || []);
      setPhases(res.data.phases || {});
      setFacts(res.data.facts || {});
      setPenalties(res.data.penalties || {});
    } catch (e) { setError('Failed to load e-invoicing readiness'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (c) => {
    setEditing(c.client_id);
    setForm({
      phase: c.phase || '', asp_name: c.asp_name || '', annual_revenue_aed: c.annual_revenue_aed || '',
      ...Object.fromEntries(Object.keys(CHECK_LABELS).map(k => [k, !!(c.checks || {})[k]])),
    });
  };

  const save = async (clientId) => {
    setSaving(true); setError('');
    try {
      await axios.patch(`${API}/einvoicing/readiness/${clientId}`, form, { withCredentials: true });
      setEditing(null);
      await load();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading e-invoicing readiness…</div>;

  const counts = clients.reduce((n, c) => { n[c.urgency || 'unclassified'] = (n[c.urgency || 'unclassified'] || 0) + 1; return n; }, {});
  const visible = clients.filter(c => filter === 'all' || (filter === 'action' && (c.urgency === 'overdue' || c.urgency === 'urgent')) || c.phase === filter);

  return (
    <div className="ov-wrap" data-testid="einvoicing-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">FIRM MANAGEMENT</div>
          <h1>E-invoicing readiness</h1>
          <p>UAE eInvoicing (PINT AE, 5-corner model) — track every client's route to their mandate date.</p>
        </div>
      </div>

      {/* Facts bar */}
      <div className="af-grid af-grid-3" style={{ marginBottom: 16 }}>
        <section className="af-card" data-testid="einvoicing-timeline">
          <div className="af-cardhead"><div><h2>Mandatory dates</h2><div className="af-sub">Ministerial Decisions 243/244/2025 · 66/168/2026</div></div></div>
          {Object.entries(phases).map(([k, p]) => (
            <div className="af-mini" key={k}><span>{p.label}</span><b>{p.go_live}</b></div>
          ))}
          <p className="af-note">ASP appointment deadlines: 30 Oct 2026 (≥50m) · 31 Mar 2027 (others). Voluntary since 1 Jul 2026 — test now, penalty-free.</p>
        </section>
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Penalty exposure</h2><div className="af-sub">Cabinet Decision 106/2025</div></div></div>
          {Object.entries(penalties).map(([k, v]) => (
            <div className="af-mini" key={k}><span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span><b>{v}</b></div>
          ))}
        </section>
        <section className="af-card">
          <div className="af-cardhead"><div><h2>What a compliant e-invoice is</h2><div className="af-sub">Not a PDF</div></div></div>
          <div className="af-mini"><span>Format</span><b>{facts.format}</b></div>
          <div className="af-mini"><span>Scope</span><b>{facts.scope}</b></div>
          <div className="af-mini"><span>Peppol participant ID</span><b>{facts.participant_id}</b></div>
          <p className="af-note">Voluntary phase opened {facts.voluntary_since}.</p>
        </section>
      </div>

      {/* Client readiness */}
      <section className="af-card" data-testid="einvoicing-clients">
        <div className="af-cardhead">
          <div><h2>Client readiness <span className="af-sub" style={{ display: 'inline', marginLeft: 8 }}>{clients.length} active clients</span></h2></div>
          <div className="af-tabs" style={{ borderBottom: 'none' }}>
            {[['all', `All (${clients.length})`], ['action', `Needs action (${(counts.overdue || 0) + (counts.urgent || 0)})`], ...Object.entries(phases).map(([k, p]) => [k, p.label])].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                style={{ background: filter === k ? '#dff2ff' : 'transparent', color: filter === k ? '#087ebd' : '#6b8799', fontWeight: filter === k ? 650 : 400, border: 'none', padding: '6px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5 }}>{label}</button>
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '0 20px 8px' }}>{error}</div>}

        {visible.map(c => {
          const u = URGENCY[c.urgency] || { bg: 'var(--off, #f7fafc)', fg: 'var(--muted)', label: 'NOT CLASSIFIED' };
          const isEdit = editing === c.client_id;
          return (
            <div key={c.client_id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)' }} data-testid={`einvoicing-${c.client_id}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13, color: 'var(--text)' }}>{c.client_name}</b>
                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: u.bg, color: u.fg }} data-testid={`einvoicing-urgency-${c.client_id}`}>
                  {c.urgency === 'overdue' && <AlertTriangle size={10} style={{ marginRight: 4, verticalAlign: -1 }} />}{u.label}
                </span>
                {c.asp_due_days != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ASP by {c.asp_by} ({c.asp_due_days < 0 ? `${-c.asp_due_days}d overdue` : `${c.asp_due_days}d left`}) · live {c.go_live}</span>}
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>TRN: {c.trn || '—'} · readiness {c.ready_count}</span>
                {isPartner && !isEdit && (
                  <button className="af-btn" onClick={() => startEdit(c)} data-testid={`einvoicing-edit-${c.client_id}`}><Pencil size={11} /> Update</button>
                )}
              </div>

              {!isEdit && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                  {c.phase_label}{c.asp_name ? ` · ASP: ${c.asp_name}` : ''}{c.annual_revenue_aed ? ` · revenue est. ${aed(c.annual_revenue_aed)}` : ''}
                </div>
              )}

              {isEdit && (
                <div style={{ marginTop: 10, background: 'var(--off, #f7fafc)', borderRadius: 8, padding: '12px 14px' }} data-testid={`einvoicing-form-${c.client_id}`}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Phase</label>
                      <select value={form.phase} onChange={e => setForm(p => ({ ...p, phase: e.target.value }))} style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} data-testid="einvoicing-phase-select">
                        <option value="">— classify —</option>
                        {Object.entries(phases).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Revenue estimate (AED/yr)</label>
                      <input type="number" value={form.annual_revenue_aed || ''} onChange={e => setForm(p => ({ ...p, annual_revenue_aed: e.target.value }))}
                        style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} data-testid="einvoicing-revenue-input" />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>ASP appointed</label>
                      <input value={form.asp_name} onChange={e => setForm(p => ({ ...p, asp_name: e.target.value }))} placeholder="Provider name"
                        style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} data-testid="einvoicing-asp-input" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 6, marginBottom: 10 }}>
                    {Object.entries(CHECK_LABELS).map(([k, label]) => (
                      <label key={k} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} data-testid={`einvoicing-check-${k}`} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="af-btn" onClick={() => setEditing(null)}><X size={12} /> Cancel</button>
                    <button className="af-btn-primary" onClick={() => save(c.client_id)} disabled={saving} data-testid={`einvoicing-save-${c.client_id}`}>
                      {saving ? 'Saving…' : (<><Save size={12} /> Save</>)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
          {visible.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>No clients in this view.</div>}
        </section>

      <p className="af-note" style={{ marginTop: 14 }}>
        Service opportunity: every client below the 50m line must appoint an ASP by <b>31 March 2027</b> and go live by <b>1 July 2027</b> —
        package this tracker as a readiness-assessment and managed e-invoicing service.
      </p>
    </div>
  );
};

export default Einvoicing;
