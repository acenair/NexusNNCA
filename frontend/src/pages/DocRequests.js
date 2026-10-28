import React, { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Copy, Trash2, ExternalLink, FileText, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DocRequests = () => {
  const { user } = useOutletContext();
  const isPartner = user?.role === 'partner';
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState({});
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ client_id: '', title: '', due_date: '', engagement_id: '', note: '' });
  const [items, setItems] = useState(['']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, tpl, cl, eng] = await Promise.all([
        axios.get(`${API}/doc-requests`, { withCredentials: true }),
        axios.get(`${API}/doc-requests/templates`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/service/engagements`, { withCredentials: true }),
      ]);
      setRows(Array.isArray(reqs.data) ? reqs.data : []);
      setTemplates(tpl.data || {});
      setClients(Array.isArray(cl.data) ? cl.data : []);
      setEngagements(Array.isArray(eng.data) ? eng.data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const selectedClient = clients.find(c => c.client_id === form.client_id);
  const clientEngs = engagements.filter(e => e.client_id === form.client_id);

  const applyTemplate = (svc) => {
    if (templates[svc]) setItems([...templates[svc]]);
  };

  const create = async () => {
    setSaving(true);
    try {
      const res = await axios.post(`${API}/doc-requests`, { ...form, items: items.filter(i => i.trim()) }, { withCredentials: true });
      const link = `${window.location.origin}/upload/${res.data.token}`;
      await navigator.clipboard?.writeText(link).catch(() => {});
      setShowCreate(false);
      setItems(['']);
      setForm({ client_id: '', title: '', due_date: '', engagement_id: '', note: '' });
      await load();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create request'); }
    setSaving(false);
  };

  const copyLink = async (r) => {
    // link needs the token — fetch it via detail? token isn't in list. Use a dedicated share endpoint:
    const res = await axios.get(`${API}/doc-requests/${r.request_id}`, { withCredentials: true }).catch(() => null);
    const token = res?.data?.token;
    const link = `${window.location.origin}/upload/${token}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(r.request_id);
    setTimeout(() => setCopied(null), 2000);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this document request?')) return;
    await axios.delete(`${API}/doc-requests/${id}`, { withCredentials: true }).catch(() => {});
    await load();
  };

  const progressOf = (r) => `${r.items.filter(i => i.status === 'Received').length}/${r.items.length}`;

  return (
    <div className="ov-wrap" data-testid="doc-requests-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">CLIENT DOCUMENTS</div>
          <h1>Document requests</h1>
          <p>Send a PBC list to a client — they upload via a secure link, no login needed. Files land in the client's folder (and Google Drive).</p>
        </div>
        <button className="af-btn-primary" onClick={() => setShowCreate(true)} data-testid="new-doc-request"><Plus size={14} style={{ marginRight: 4 }} /> New request</button>
      </div>

      {loading ? <p className="af-note">Loading…</p> : (
        <section className="af-card">
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>REQUEST / CLIENT</th><th>PROGRESS</th><th>DUE</th><th>STATUS</th><th>LINKED</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const done = r.items.filter(i => i.status === 'Received').length;
                  return (
                    <tr key={r.request_id}>
                      <td><b>{r.title}</b><small>{r.client_name} · {r.created_by_name}</small></td>
                      <td><span className={`af-badge ${done === r.items.length ? 'af-badge-green' : done > 0 ? 'af-badge-blue' : 'af-badge-amber'}`}>{done}/{r.items.length} received</span></td>
                      <td>{r.due_date || '—'}</td>
                      <td><span className={`af-badge ${r.status === 'Completed' ? 'af-badge-green' : 'af-badge-blue'}`}>{r.status}</span></td>
                      <td>{r.engagement_id ? <Link className="af-link" to={`/app/engagements/${r.engagement_id}`}>Engagement ↗</Link> : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="af-link" onClick={() => copyLink(r)}>{copied === r.request_id ? <CheckCircle2 size={12} style={{ verticalAlign: -2, color: 'var(--green)' }} /> : <Copy size={12} style={{ verticalAlign: -2 }} />} {copied === r.request_id ? 'Copied!' : 'Copy link'}</button>
                        {' '}
                        <a className="af-link" href={`/upload/${r.share_token || r.token || ''}`} target="_blank" rel="noreferrer"><ExternalLink size={12} style={{ verticalAlign: -2 }} /> Open</a>
                        {isPartner && <> {' '}<button className="af-link" onClick={() => remove(r.request_id)}><Trash2 size={12} style={{ verticalAlign: -2, color: 'var(--red)' }} /></button></>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan="6" className="af-empty">No document requests yet. Create one and send the link to your client over WhatsApp or email.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showCreate && (
        <div className="af-modal" onClick={e => e.target === e.currentTarget && !saving && setShowCreate(false)}>
          <div className="af-dialog" style={{ maxWidth: 680 }} data-testid="create-doc-request-modal">
            <button className="af-close" onClick={() => setShowCreate(false)}>×</button>
            <h2>New document request</h2>
            <div className="af-formrow"><label>Client *</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
            </div>
            {form.client_id && clientEngs.length > 0 && (
              <div className="af-formrow"><label>Link to engagement</label>
                <select value={form.engagement_id} onChange={e => setForm({ ...form, engagement_id: e.target.value })}>
                  <option value="">—</option>
                  {clientEngs.map(e => <option key={e.engagement_id} value={e.engagement_id}>{e.service_type.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            )}
            <div className="af-formrow"><label>Request title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Audit FY2026 — documents required" />
            </div>
            <div className="af-formrow"><label>Due date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>PBC template</label>
              <select value="" onChange={e => e.target.value && applyTemplate(e.target.value)}>
                <option value="">Apply a template…</option>
                {Object.keys(templates).map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Requested documents *</label>
              {items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={it} onChange={e => setItems(items.map((x, k) => k === idx ? e.target.value : x))}
                    placeholder={`Document ${idx + 1}`} style={{ flex: 1 }} />
                  {items.length > 1 && <button className="af-link" onClick={() => setItems(items.filter((_, k) => k !== idx))}>Remove</button>}
                </div>
              ))}
              <button className="af-link" onClick={() => setItems([...items, ''])}>+ Add item</button>
            </div>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={create} disabled={saving || !form.client_id || !form.title || !items.some(i => i.trim())}
              data-testid="create-doc-request-submit">{saving ? 'Creating…' : 'Create + copy client link'}</button>
            <p className="af-note">After creating, send the copied link to the client (WhatsApp / email). They upload without logging in; you see receipts here.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocRequests;
