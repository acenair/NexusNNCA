import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Shield, AlertTriangle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SCOPES = [
  { key: 'customers', label: 'Customers / KYC', desc: 'Client company documents, shareholder identities and KYC review records.' },
  { key: 'firm', label: 'Firm Compliance', desc: "The firm's licences, premises, establishment records and insurance cover." },
  { key: 'staff', label: 'Staff Compliance', desc: 'Individual staff visas, identity documents and employment-related records.' },
];
const STAGES = ['Not requested', 'Requested', 'Received', 'Under review', 'Verified', 'Renewal in progress', 'Not applicable'];

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded';
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysLeft = (d) => d ? Math.ceil((new Date(d) - new Date(todayIso())) / 86400000) : null;

// risk bucket per the -2 mockup: expired/urgent(<=30)/soon(<=60)/valid/unknown/na
function riskOf(r) {
  if (r.stage === 'Not applicable') return 'na';
  if (r.date_basis === 'none' || !r.due_date) return 'unknown';
  const n = daysLeft(r.due_date);
  if (n < 0) return 'expired';
  if (n <= 30) return 'urgent';
  if (n <= 60) return 'soon';
  return 'valid';
}
const riskLabel = (r) => {
  const s = riskOf(r);
  if (s === 'na') return 'Not applicable';
  if (s === 'unknown') return r.date_basis === 'none' ? 'No date tracked' : 'Date missing';
  const n = daysLeft(r.due_date);
  if (n < 0) return r.date_basis === 'review' ? `Review ${-n}d overdue` : `Expired ${-n}d ago`;
  if (n === 0) return r.date_basis === 'review' ? 'Review due today' : 'Expires today';
  return `${n} days remaining`;
};
const riskBadge = { expired: 'af-badge-red', urgent: 'af-badge-amber', soon: 'af-badge-amber', valid: 'af-badge-green', unknown: 'af-badge-grey', na: 'af-badge-grey' };
const stageBadge = (s) => ({ 'Verified': 'af-badge-green', 'Under review': 'af-badge-amber', 'Requested': 'af-badge-amber', 'Received': 'af-badge-blue', 'Renewal in progress': 'af-badge-red', 'Not requested': 'af-badge-grey' }[s] || 'af-badge-blue');

const Compliance = () => {
  const { user } = useOutletContext();
  const isPartner = user?.role === 'partner';
  const [scope, setScope] = useState('customers');
  const [records, setRecords] = useState([]);
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('windows');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [reason, setReason] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        axios.get(`${API}/compliance/records`, { withCredentials: true }),
        axios.get(`${API}/compliance/categories`, { withCredentials: true }),
      ]);
      setRecords(Array.isArray(r.data) ? r.data : []);
      setCategories(c.data?.categories || {});
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const scopeRecs = records.filter(r => r.scope === scope);
  const buckets = {
    expired: scopeRecs.filter(r => riskOf(r) === 'expired').length,
    urgent: scopeRecs.filter(r => riskOf(r) === 'urgent').length,
    soon: scopeRecs.filter(r => riskOf(r) === 'soon').length,
    missing: scopeRecs.filter(r => r.stage === 'Requested').length,
    review: scopeRecs.filter(r => r.stage === 'Under review').length,
  };

  const visible = scopeRecs.filter(r =>
    (!typeFilter || r.doc_type === typeFilter) &&
    (!stageFilter || r.stage === stageFilter) &&
    (!riskFilter || riskOf(r) === riskFilter) &&
    (!search || [r.subject_name, r.doc_type, r.holder, r.owner].join(' ').toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => {
    const order = { expired: 0, urgent: 1, soon: 2, unknown: 3, valid: 4, na: 5 };
    return order[riskOf(a)] - order[riskOf(b)] || (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });

  const openEdit = (r) => { setForm({ ...r, date_basis_none: r.date_basis === 'none' }); setReason(''); setSaveError(''); setEditing(true); setCreating(false); };
  const openCreate = (docType) => {
    setForm({ scope, subject_name: '', doc_type: docType || (categories[scope] || ['Other'])[0], holder: '', masked_ref: '', owner: isPartner ? (user?.name || 'Admin') : 'Admin', date_basis: 'expiry', due_date: '', stage: 'Not requested', authority: '', notes: '', issued_date: '', verified_date: '', verified_by: '', followup_date: '', location_note: '' });
    setReason(''); setSaveError(''); setCreating(true); setEditing(false);
  };

  const save = async () => {
    setSaving(true); setSaveError('');
    try {
      if (creating) await axios.post(`${API}/compliance/records`, form, { withCredentials: true });
      else await axios.patch(`${API}/compliance/records/${form.record_id}`, { ...form, change_reason: reason || undefined }, { withCredentials: true });
      setEditing(false); setCreating(false);
      await load();
    } catch (err) { setSaveError(err.response?.data?.detail || 'Save failed'); }
    setSaving(false);
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.doc_type} record for ${r.subject_name}?`)) return;
    try { await axios.delete(`${API}/compliance/records/${r.record_id}`, { withCredentials: true }); await load(); }
    catch (err) { alert(err.response?.data?.detail || 'Delete failed'); }
  };

  const clearFilters = () => { setSearch(''); setTypeFilter(''); setRiskFilter(''); setStageFilter(''); };

  if (loading) return <div className="page-loading">Loading compliance register…</div>;

  const docTypes = categories[scope] || [];
  const stageTag = (s) => s === 'Verified' ? { background: '#eaf7f0', color: '#5d9d7d' } : ['Requested', 'Under review'].includes(s) ? { background: '#edf5ff', color: '#5a94c6' } : s === 'Renewal in progress' ? { background: '#ffeded', color: '#bf6464' } : { background: '#f0f4f7', color: '#8299aa' };

  return (
    <div className="ov-wrap" data-testid="compliance-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">KEEP EVERY RECORD CURRENT</div>
          <h1>Compliance tracker</h1>
          <p>Customer KYC, firm documents and staff records, clearly organised.</p>
        </div>
        {isPartner && <button className="af-btn-primary" onClick={() => openCreate()} data-testid="add-record-btn"><Plus size={14} style={{ marginRight: 4 }} /> Add record</button>}
      </div>

      <div className="af-tabs" role="tablist">
        {SCOPES.map(s => (
          <button key={s.key} role="tab" aria-selected={scope === s.key}
            onClick={() => { setScope(s.key); clearFilters(); }}>
            {s.label} <span style={{ fontSize: 9, background: '#eaf2f8', padding: '2px 6px', borderRadius: 5, marginLeft: 6 }}>{records.filter(r => r.scope === s.key && r.stage !== 'Not applicable').length}</span>
          </button>
        ))}
      </div>
      <p className="af-sub" style={{ margin: '4px 0 14px' }}>{SCOPES.find(s => s.key === scope).desc}</p>

      <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <button className={`af-card af-metric`} style={{ border: riskFilter === 'expired' ? '2px solid var(--gold)' : '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setRiskFilter(riskFilter === 'expired' ? '' : 'expired')} data-testid="bucket-expired">
          <span className="af-icon"><AlertTriangle size={18} /></span>
          <label>Expired / overdue</label><b>{buckets.expired}</b><small>Needs immediate action</small>
        </button>
        <button className="af-card af-metric" style={{ border: riskFilter === 'urgent' ? '2px solid var(--gold)' : '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setRiskFilter(riskFilter === 'urgent' ? '' : 'urgent')}>
          <label>Due within 30 days</label><b>{buckets.urgent}</b><small>Priority renewals</small>
        </button>
        <button className="af-card af-metric" style={{ border: riskFilter === 'soon' ? '2px solid var(--gold)' : '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setRiskFilter(riskFilter === 'soon' ? '' : 'soon')}>
          <label>Due in 31–60 days</label><b>{buckets.soon}</b><small>Upcoming</small>
        </button>
        <button className="af-card af-metric" style={{ border: stageFilter === 'Requested' ? '2px solid var(--gold)' : '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setStageFilter(stageFilter === 'Requested' ? '' : 'Requested')}>
          <label>Documents requested</label><b>{buckets.missing}</b><small>Awaiting receipt</small>
        </button>
        <button className="af-card af-metric" style={{ border: stageFilter === 'Under review' ? '2px solid var(--gold)' : '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setStageFilter(stageFilter === 'Under review' ? '' : 'Under review')}>
          <label>Under review</label><b>{buckets.review}</b><small>Being checked</small>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="af-searchbox" style={{ flex: 1, minWidth: 200, border: '1px solid var(--nn-border)' }}>
          <input placeholder="Search client, staff or document…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Document type">
          <option value="">All document types</option>
          {docTypes.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} aria-label="Expiry status">
          <option value="">All date statuses</option>
          <option value="expired">Expired / review overdue</option>
          <option value="urgent">Due within 30 days</option>
          <option value="soon">Due in 31–60 days</option>
          <option value="valid">More than 60 days</option>
          <option value="unknown">Date not tracked</option>
          <option value="na">Not applicable</option>
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || typeFilter || riskFilter || stageFilter) && <button className="af-btn" onClick={clearFilters}>Clear</button>}
        <div style={{ display: 'flex', gap: 4, background: '#eaf2f8', borderRadius: 8, padding: 4 }}>
          {['windows', 'register'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ border: 0, background: view === v ? 'white' : 'transparent', borderRadius: 5, padding: '8px 15px', fontSize: 10, color: view === v ? '#298ec1' : '#7e98aa', cursor: 'pointer', boxShadow: view === v ? '0 1px 5px rgba(35,70,93,0.06)' : 'none' }}>
              {v === 'windows' ? 'Document windows' : 'Detailed register'}
            </button>
          ))}
        </div>
      </div>

      {view === 'windows' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
          {docTypes.map(docType => {
            const items = visible.filter(r => r.doc_type === docType);
            if (!docTypes.includes(docType) && items.length === 0) return null;
            return (
              <section className="af-card" key={docType} style={{ padding: 0, overflow: 'hidden' }} data-testid={`window-${docType.replace(/\s+/g, '-').toLowerCase()}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--nn-border)' }}>
                  <div>
                    <b style={{ fontSize: 14 }}>{docType}</b>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                      {items.filter(r => riskOf(r) === 'expired').length} expired / overdue · {items.filter(r => ['Requested'].includes(r.stage)).length} pending receipt
                    </div>
                  </div>
                  <span style={{ background: '#edf6fc', padding: '6px 9px', borderRadius: 6, fontSize: 11, color: '#75a1bc' }}>{scopeRecs.filter(r => r.doc_type === docType).length}</span>
                </div>
                <div>
                  {items.map(r => (
                    <div key={r.record_id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div><b style={{ fontSize: 13 }}>{r.subject_name}</b><div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.holder || r.doc_type}</div></div>
                        <span className={`af-badge ${riskBadge[riskOf(r)]}`}>{riskLabel(r)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', margin: '10px 0' }}>
                        <span>{r.date_basis === 'review' ? 'Review date' : r.date_basis === 'none' ? 'No expiry tracked' : 'Expiry'}: {r.date_basis === 'none' ? '—' : fmt(r.due_date)}</span>
                        <span>{r.owner}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, padding: '4px 7px', borderRadius: 5, ...stageTag(r.stage) }}>{r.stage}</span>
                        {isPartner && <button className="af-link" onClick={() => openEdit(r)}>View / update →</button>}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="af-empty" style={{ padding: 22 }}>✓ No records match this window.</div>}
                </div>
                {isPartner && <div style={{ padding: '10px 20px', background: '#fcfdff', borderTop: '1px solid var(--nn-border)' }}>
                  <button className="af-link" onClick={() => openCreate(docType)}>+ Add {docType} record</button>
                </div>}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Detailed register</h2><div className="af-sub">{visible.length} of {scopeRecs.length} records · Status as of {fmt(todayIso())}</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>DOCUMENT / HOLDER</th><th>REFERENCE</th><th>EXPIRY / REVIEW</th><th>DATE STATUS</th><th>STAGE</th><th>OWNER / FOLLOW-UP</th><th></th></tr></thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.record_id} data-testid={`cmp-${r.record_id}`}>
                    <td><b>{r.doc_type}</b><small>{r.subject_name}{r.holder && r.holder !== '—' ? ` · ${r.holder}` : ''}</small></td>
                    <td>{r.masked_ref || '—'}</td>
                    <td>{r.date_basis === 'none' ? 'Not date based' : fmt(r.due_date)}<small>{r.date_basis === 'review' ? 'Internal review' : r.date_basis === 'none' ? '—' : 'Document expiry'}{r.issued_date ? ` · issued ${fmt(r.issued_date)}` : ''}</small></td>
                    <td><span className={`af-badge ${riskBadge[riskOf(r)]}`}>{riskLabel(r)}</span></td>
                    <td><span className={`af-badge ${stageBadge(r.stage)}`}>{r.stage}</span><small>{r.verified_date ? `Verified ${fmt(r.verified_date)} by ${r.verified_by}` : ''}</small></td>
                    <td>{r.owner}<small>Follow-up: {fmt(r.followup_date)}</small></td>
                    <td>
                      {isPartner ? <button className="af-link" onClick={() => openEdit(r)}>Edit / renew</button> : <span className="af-sub">—</span>}
                      {isPartner && r.source === 'manual' && <button className="af-link" style={{ marginLeft: 8, color: 'var(--red)' }} onClick={() => remove(r)}>Delete</button>}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan="7" className="af-empty">No matching records.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="af-note"><Shield size={11} style={{ verticalAlign: -2 }} /> Masked references only — no scans or full ID numbers. Date status and verification are separate checks: a Verified document can still be expired. Not-applicable records are excluded from expiry alerts.</p>

      {(creating || editing) && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && (setCreating(false), setEditing(false))}>
          <div className="af-dialog" data-testid="compliance-record-modal" style={{ width: 760 }}>
            <button className="af-close" onClick={() => { setCreating(false); setEditing(false); }}>×</button>
            <h2>{creating ? 'Add compliance record' : 'Document details / renewal'}</h2>
            {creating && (
              <div className="af-formrow"><label>Scope</label>
                <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value, doc_type: (categories[e.target.value] || ['Other'])[0] })}>
                  {SCOPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div className="af-formrow"><label>{creating ? 'Customer / firm / staff name *' : 'Name'}</label>
              <input value={form.subject_name || ''} onChange={e => setForm({ ...form, subject_name: e.target.value })} disabled={!creating} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="af-formrow"><label>Document type</label>
                <select value={form.doc_type || ''} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
                  {(categories[form.scope || scope] || []).map(t => <option key={t}>{t}</option>)}
                  <option>Other</option>
                </select>
              </div>
              <div className="af-formrow"><label>Document holder / role</label>
                <input value={form.holder || ''} onChange={e => setForm({ ...form, holder: e.target.value })} placeholder="e.g. Shareholder A, Director" />
              </div>
              <div className="af-formrow"><label>Masked reference · optional</label>
                <input value={form.masked_ref || ''} onChange={e => setForm({ ...form, masked_ref: e.target.value })} placeholder="e.g. ending 1234 — no full ID number" maxLength={40} />
              </div>
              <div className="af-formrow"><label>Responsible owner</label>
                <input value={form.owner || ''} onChange={e => setForm({ ...form, owner: e.target.value })} />
              </div>
              <div className="af-formrow"><label>Date basis</label>
                <select value={form.date_basis_none ? 'none' : (form.date_basis || 'expiry')} onChange={e => {
                  if (e.target.value === 'none') setForm({ ...form, date_basis_none: true });
                  else setForm({ ...form, date_basis_none: false, date_basis: e.target.value });
                }}>
                  <option value="expiry">Document expiry</option>
                  <option value="review">Internal review due</option>
                  <option value="none">No date tracked</option>
                </select>
              </div>
              {!form.date_basis_none && (
                <div className="af-formrow"><label>{form.date_basis === 'review' ? 'Review due date' : 'Expiry date'}</label>
                  <input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
              )}
              <div className="af-formrow"><label>Document issue date</label>
                <input type="date" value={form.issued_date || ''} onChange={e => setForm({ ...form, issued_date: e.target.value })} />
              </div>
              <div className="af-formrow"><label>Document stage</label>
                <select value={form.stage || ''} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="af-formrow"><label>Last verified / reviewed date</label>
                <input type="date" value={form.verified_date || ''} onChange={e => setForm({ ...form, verified_date: e.target.value })} />
              </div>
              <div className="af-formrow"><label>Verified / reviewed by</label>
                <input value={form.verified_by || ''} onChange={e => setForm({ ...form, verified_by: e.target.value })} />
              </div>
              <div className="af-formrow"><label>Next follow-up date</label>
                <input type="date" value={form.followup_date || ''} onChange={e => setForm({ ...form, followup_date: e.target.value })} />
              </div>
              <div className="af-formrow"><label>Issuing authority / provider</label>
                <input value={form.authority || ''} onChange={e => setForm({ ...form, authority: e.target.value })} />
              </div>
            </div>
            <div className="af-formrow"><label>Document location / reference note</label>
              <input value={form.location_note || ''} onChange={e => setForm({ ...form, location_note: e.target.value })} placeholder="File location label — documents are not uploaded" />
            </div>
            {!creating && form.due_date && editing && form.due_date !== (records.find(r => r.record_id === form.record_id)?.due_date) && (
              <div className="af-formrow"><label style={{ color: 'var(--red)' }}>Reason for expiry / review date change *</label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Required when changing an existing date" />
              </div>
            )}
            <div className="af-formrow"><label>Next action / renewal instructions / comments</label>
              <textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            {saveError && <div style={{ fontSize: 12, color: '#b25d5d', background: '#fff0ef', padding: 10, borderRadius: 7, marginBottom: 10 }}>{saveError}</div>}
            {!creating && (form.history || []).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--nn-border)', paddingTop: 8 }}>
                <b>Record history</b>
                {(form.history || []).slice().reverse().slice(0, 5).map((hh, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--nn-border)' }}>
                    {hh.field ? `${hh.field}: ${hh.from || '—'} → ${hh.to || '—'} · ${hh.reason}` : hh.text || ''}
                    <small> · {hh.by} · {fmt((hh.at || '').slice(0, 10))}</small>
                  </div>
                ))}
              </div>
            )}
            <button className="af-btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={save} disabled={saving || (creating && !form.subject_name)} data-testid="save-record-btn">{saving ? 'Saving…' : creating ? 'Save compliance record' : 'Update record'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Compliance;
