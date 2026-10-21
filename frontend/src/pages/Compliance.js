import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Shield, AlertTriangle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SCOPES = [
  { key: 'customers', label: 'Customers / KYC' },
  { key: 'firm', label: 'Firm Compliance' },
  { key: 'staff', label: 'Staff Compliance' },
];
const SCOPE_SUB = {
  customers: 'Trade licences, TRNs and KYC documents for every client in the master.',
  firm: 'The firm\u2019s own registrations, licences and policy reviews.',
  staff: 'Individual staff visas, identity documents and employment-related records.',
};
const DOC_TYPES = {
  customers: ['Trade Licence', 'VAT TRN Certificate', 'Corporate Tax Registration', 'KYC Documents', 'Other'],
  firm: ['FTA Registration', 'Audit Licence', 'AML Policy', 'Professional Indemnity', 'Other'],
  staff: ['Residence Visa', 'Emirates ID', 'Passport', 'Medical Insurance', 'Employment Records', 'Other'],
};
const STAGES = ['Not requested', 'Requested', 'Received', 'Under review', 'Verified', 'Renewal in progress', 'Not applicable'];

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded';
const daysLeft = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
};

const Compliance = () => {
  const { user } = useOutletContext();
  const isPartner = user?.role === 'partner';
  const [scope, setScope] = useState('customers');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState(null);   // record being updated
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/compliance/records`, { withCredentials: true });
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const scopeRecords = records.filter(r => r.scope === scope);
  const buckets = {
    expired: scopeRecords.filter(r => r.bucket === 'expired').length,
    le30: scopeRecords.filter(r => r.bucket === 'le30').length,
    le60: scopeRecords.filter(r => r.bucket === 'le60').length,
    requested: scopeRecords.filter(r => r.stage === 'Requested').length,
    review: scopeRecords.filter(r => r.stage === 'Under review').length,
  };

  const filtered = scopeRecords.filter(r =>
    (!stageFilter || r.stage === stageFilter) && (!typeFilter || r.doc_type === typeFilter));

  const openEdit = (r) => { setForm({ ...r }); setReason(''); setEditing(true); };
  const openCreate = () => {
    setForm({ scope, subject_name: '', doc_type: DOC_TYPES[scope][0], holder: '', masked_ref: '', owner: user?.name || 'Admin', date_basis: 'expiry', due_date: '', stage: 'Not requested', authority: '', notes: '' });
    setReason(''); setCreating(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (creating) {
        await axios.post(`${API}/compliance/records`, form, { withCredentials: true });
      } else {
        await axios.patch(`${API}/compliance/records/${form.record_id}`,
          { ...form, change_reason: reason || undefined }, { withCredentials: true });
      }
      setEditing(false); setCreating(false);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Save failed'); }
    setSaving(false);
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.doc_type} record for ${r.subject_name}?`)) return;
    try {
      await axios.delete(`${API}/compliance/records/${r.record_id}`, { withCredentials: true });
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Delete failed'); }
  };

  if (loading) return <div className="page-loading">Loading compliance register…</div>;

  const stageBadge = (s) => ({
    'Verified': 'af-badge-green', 'Under review': 'af-badge-amber', 'Requested': 'af-badge-amber',
    'Received': 'af-badge-blue', 'Renewal in progress': 'af-badge-red', 'Not requested': 'af-badge-grey',
  }[s] || 'af-badge-blue');

  return (
    <div className="ov-wrap" data-testid="compliance-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">KEEP EVERY RECORD CURRENT</div>
          <h1>Compliance tracker</h1>
          <p>Customer KYC, firm documents and staff records, clearly organised.</p>
        </div>
        {isPartner && <button className="af-btn-primary" onClick={openCreate} data-testid="add-record-btn"><Plus size={14} style={{ marginRight: 4 }} /> Add record</button>}
      </div>

      {/* Scope tabs */}
      <div className="af-tabs" role="tablist">
        {SCOPES.map(s => (
          <button key={s.key} role="tab" aria-selected={scope === s.key}
            onClick={() => { setScope(s.key); setStageFilter(''); setTypeFilter(''); }}>
            {s.label} ({records.filter(r => r.scope === s.key).length})
          </button>
        ))}
      </div>
      <p className="af-sub" style={{ margin: '4px 0 14px' }}>{SCOPE_SUB[scope]}</p>

      {/* Buckets */}
      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <section className={`af-card af-metric ${buckets.expired ? 'af-metric-alert' : ''}`}>
          <span className="af-icon"><AlertTriangle size={18} /></span>
          <label>Expired / overdue</label><b>{buckets.expired}</b><small>Needs immediate action</small>
        </section>
        <section className="af-card af-metric"><label>Due within 30 days</label><b>{buckets.le30}</b><small>Priority renewals</small></section>
        <section className="af-card af-metric"><label>Due in 31–60 days</label><b>{buckets.le60}</b><small>Upcoming</small></section>
        <section className="af-card af-metric"><label>Documents requested</label><b>{buckets.requested}</b><small>Awaiting receipt</small></section>
        <section className="af-card af-metric"><label>Under review</label><b>{buckets.review}</b><small>Being checked</small></section>
      </div>

      {/* Register */}
      <section className="af-card" style={{ marginTop: 16 }}>
        <div className="af-cardhead">
          <div><h2>Detailed register</h2><div className="af-sub">{filtered.length} of {scopeRecords.length} records · Status as of {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter by document type">
              <option value="">All document types</option>
              {[...new Set(scopeRecords.map(r => r.doc_type))].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} aria-label="Filter by stage">
              <option value="">All stages</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="af-tablewrap">
          <table className="af-table">
            <thead><tr><th>DOCUMENT / HOLDER</th><th>REFERENCE</th><th>OWNER</th><th>DUE / REVIEW DATE</th><th>WINDOW</th><th>STAGE</th><th></th></tr></thead>
            <tbody>
              {filtered.map(r => {
                const dl = daysLeft(r.due_date);
                const window = r.due_date
                  ? (dl < 0 ? `Expired ${-dl}d ago` : `${dl} days remaining`)
                  : 'No date tracked';
                return (
                  <tr key={r.record_id} data-testid={`cmp-${r.record_id}`}>
                    <td><b>{r.doc_type}</b><small>{r.subject_name}{r.holder && r.holder !== '—' ? ` · ${r.holder}` : ''}</small></td>
                    <td>{r.masked_ref || '—'}</td>
                    <td>{r.owner || '—'}</td>
                    <td>{fmt(r.due_date)}<small>{r.date_basis === 'review' ? 'Internal review' : 'Document expiry'}</small></td>
                    <td>{window}</td>
                    <td><span className={`af-badge ${stageBadge(r.stage)}`}>{r.stage}</span></td>
                    <td>
                      {isPartner
                        ? <button className="af-link" onClick={() => openEdit(r)} style={{ background: 'none' }}>View / update →</button>
                        : <span className="af-sub">—</span>}
                      {isPartner && r.source === 'manual' && (
                        <button className="af-link" onClick={() => remove(r)} style={{ background: 'none', marginLeft: 8, color: 'var(--red)' }}>Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="7" className="af-empty">No records match this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="af-note"><Shield size={11} style={{ verticalAlign: -2 }} /> Masked references only — no scans or full ID numbers are collected. Date status and verification stage are separate checks.</p>
      </section>

      {/* Add/Edit modal */}
      {(editing || creating) && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && (setEditing(false), setCreating(false))}>
          <div className="af-dialog" data-testid="compliance-record-modal">
            <button className="af-close" onClick={() => { setEditing(false); setCreating(false); }}>×</button>
            <h2>{creating ? 'Add compliance record' : 'Update compliance record'}</h2>
            {!creating && <p className="af-sub">{form.doc_type} · {form.subject_name}</p>}
            {creating && (
              <>
                <div className="af-formrow"><label>Scope</label>
                  <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value, doc_type: DOC_TYPES[e.target.value][0] })}>
                    {SCOPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="af-formrow"><label>Name (customer / firm entity / staff) *</label>
                  <input value={form.subject_name} onChange={e => setForm({ ...form, subject_name: e.target.value })} placeholder="e.g. the company or person this document belongs to" />
                </div>
              </>
            )}
            <div className="af-formrow"><label>Document type</label>
              <select value={form.doc_type || ''} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
                {DOC_TYPES[creating ? form.scope : scope].map(t => <option key={t} value={t}>{t}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="af-formrow"><label>Masked reference · optional</label>
              <input value={form.masked_ref || ''} onChange={e => setForm({ ...form, masked_ref: e.target.value })} placeholder="e.g. ····4821 (never full numbers)" />
            </div>
            <div className="af-formrow"><label>Responsible owner</label>
              <input value={form.owner || ''} onChange={e => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Date basis</label>
              <select value={form.date_basis || 'expiry'} onChange={e => setForm({ ...form, date_basis: e.target.value })}>
                <option value="expiry">Document expiry</option>
                <option value="review">Internal review due</option>
              </select>
            </div>
            <div className="af-formrow"><label>{form.date_basis === 'review' ? 'Review due date' : 'Expiry date'}</label>
              <input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Stage</label>
              <select value={form.stage || ''} onChange={e => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!creating && (form.due_date || '') !== '' && form.due_date !== records.find(r => r.record_id === form.record_id)?.due_date && (
              <div className="af-formrow"><label>Reason for date change *</label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Required when changing an existing date" />
              </div>
            )}
            <div className="af-formrow"><label>Notes / location reference</label>
              <input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
            <button className="af-btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={save} disabled={saving || (creating && !form.subject_name)} data-testid="save-record-btn">
              {saving ? 'Saving…' : creating ? 'Save compliance record' : 'Update record'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Compliance;
