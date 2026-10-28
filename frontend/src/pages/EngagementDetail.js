import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, Clock, GitBranch, User, Calendar, Edit2, Save, X, ListChecks, BookOpen, Plus, Trash2} from 'lucide-react';
import axios from 'axios';
import AuditWorkbook from './AuditWorkbook';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AUDIT_SERVICE_TYPES = ['statutory_audit', 'internal_audit', 'stock_audit', 'fraud_audit'];

const EngagementDetail = () => {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useOutletContext();
  const [eng, setEng] = useState(null);
  const [noteEditing, setNoteEditing] = useState(null);  // `${gIdx}-${iIdx}` being edited
  const [noteDraft, setNoteDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(location.state?.defaultTab === 'audit' ? 'audit' : 'checklist');

  useEffect(() => { loadEngagement(); }, [engagementId]);

  const loadEngagement = async () => {
    try {
      const res = await axios.get(`${API}/service/engagements`, { withCredentials: true });
      const found = res.data.find(e => e.engagement_id === engagementId);
      if (found) {
        setEng(found);
        setEditForm({ status: found.status, assigned_to: found.assigned_to, assigned_to_name: found.assigned_to_name });
      }
      const sRes = await axios.get(`${API}/auth/users-list`);
      setStaffList(sRes.data.filter(u => u.role === 'staff'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleChecklist = async (gIdx, iIdx, currentDone) => {
    try {
      const res = await axios.patch(`${API}/service/engagements/${engagementId}/checklist`, { group_index: gIdx, item_index: iIdx, done: !currentDone }, { withCredentials: true });
      setEng(prev => {
        const cl = [...prev.checklist];
        cl[gIdx] = { ...cl[gIdx], items: cl[gIdx].items.map((item, i) => i === iIdx ? { ...item, done: !currentDone } : item) };
        return { ...prev, checklist: cl, phase: res.data.phase, status: res.data.status };
      });
    } catch (e) { console.error(e); }
  };
  const addItem = async (group, label) => {
    if (!label.trim()) return;
    try {
      const res = await axios.post(`${API}/service/engagements/${eng.engagement_id}/checklist/items`, { group, label }, { withCredentials: true });
      setEng({ ...eng, checklist: res.data.checklist });
    } catch (e) { alert(e.response?.data?.detail || 'Failed to add item'); }
  };
  const loadNotes = async () => {
    try {
      const res = await axios.get(`${API}/service/engagements/${engagementId}/review-notes`, { withCredentials: true });
      setReviewNotes(res.data.notes || []);
    } catch (e) {}
  };
  const loadAssumptions = async () => {
    try {
      const res = await axios.get(`${API}/service/engagements/${engagementId}/assumptions`, { withCredentials: true });
      setAssumptions(res.data.assumptions || []);
    } catch (e) {}
  };
  useEffect(() => { loadNotes(); loadAssumptions(); }, [engagementId]);
  const addReviewNote = async () => {
    if (!rnText.trim()) return;
    try {
      await axios.post(`${API}/service/engagements/${engagementId}/review-notes`, { text: rnText }, { withCredentials: true });
      setRnText(''); await loadNotes();
    } catch (e) { alert('Failed to add note'); }
  };
  const clearReviewNote = async (noteId) => {
    try {
      await axios.patch(`${API}/insights/review-notes/${noteId}/clear`, {}, { withCredentials: true });
      await loadNotes();
    } catch (e) { alert('Failed to clear note'); }
  };
  const addAssumption = async () => {
    if (!asText.trim()) return;
    try {
      await axios.post(`${API}/service/engagements/${engagementId}/assumptions`, { text: asText, basis: asBasis }, { withCredentials: true });
      setAsText(''); setAsBasis(''); await loadAssumptions();
    } catch (e) { alert('Failed to add assumption'); }
  };
  const removeAssumption = async (aid) => {
    try {
      await axios.delete(`${API}/service/engagements/${engagementId}/assumptions/${aid}`, { withCredentials: true });
      await loadAssumptions();
    } catch (e) { alert('Failed to remove'); }
  };
  const saveItemNote = async (gIdx, iIdx, note) => {
    try {
      const res = await axios.patch(`${API}/service/engagements/${eng.engagement_id}/checklist`,
        { group_index: gIdx, item_index: iIdx, note }, { withCredentials: true });
      setEng(prev => ({ ...prev, checklist: (() => {
        const cl = prev.checklist.map((g, gi) => gi === gIdx ? { ...g, items: g.items.map((it, ii) => ii === iIdx ? { ...it, note } : it) } : g);
        return cl;
      })() }));
      setNoteEditing(null);
    } catch (e) { alert('Failed to save note'); }
  };
  const removeItem = async (gIdx, iIdx) => {
    try {
      const res = await axios.delete(`${API}/service/engagements/${eng.engagement_id}/checklist/items/${gIdx}/${iIdx}`, { withCredentials: true });
      setEng({ ...eng, checklist: res.data.checklist });
    } catch (e) { alert(e.response?.data?.detail || 'Failed to remove item'); }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const staff = staffList.find(s => s.email === editForm.assigned_to);
      await axios.patch(`${API}/service/engagements/${engagementId}?status=${editForm.status}&assigned_to=${editForm.assigned_to || ''}&assigned_to_name=${staff?.name || editForm.assigned_to_name || ''}`, {}, { withCredentials: true });
      setEng(prev => ({ ...prev, status: editForm.status, assigned_to: editForm.assigned_to, assigned_to_name: staff?.name || editForm.assigned_to_name }));
      setEditing(false);
    } catch (e) { console.error(e); alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const exportPdf = () => {
    const type = eng.service_type?.includes('vat') ? 'vat-return' : 'audit-report';
    window.open(`${API}/export/${type}/${engagementId}`, '_blank');
  };

  const bypassApprove = async () => {
    if (!window.confirm(`Approve all remaining steps for this engagement? This will mark it as Completed.`)) return;
    try {
      const res = await axios.post(`${API}/service/engagements/${engagementId}/approve`, {}, { withCredentials: true });
      // Refresh the engagement data
      loadEngagement();
    } catch (err) {
      alert(err.response?.data?.detail || 'Approval failed');
    }
  };

  const isPartner = user?.role === 'partner';
  if (loading) return <div className="fade-in nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  if (!eng) return <div className="fade-in nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Engagement not found</div>;

  const total = eng.checklist?.reduce((s, g) => s + g.items.length, 0) || 0;
  const done = eng.checklist?.reduce((s, g) => s + g.items.filter(i => i.done).length, 0) || 0;
  const progress = total > 0 ? Math.round(done / total * 100) : 0;

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };

  return (
    <div className="fade-in" data-testid="engagement-detail-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="back-btn"><ArrowLeft size={14} /> Back</button>
            <button onClick={exportPdf} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="export-pdf-btn"><Download size={14} /> Export PDF</button>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ background: 'rgba(14,109,180,0.15)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="edit-eng-btn"><Edit2 size={12} /> Edit</button>
            )}
            {user?.role === 'partner' && eng.status !== 'Completed' && (
              <button onClick={bypassApprove} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }} data-testid="bypass-approve-btn"><CheckCircle size={12} /> Quick Approve</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Sans', fontSize: 18 }}>{eng.service_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h2>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> {eng.client_name}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Phase: {eng.phase}</span>
                {eng.workflow_name && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}><GitBranch size={11} /> {eng.workflow_name}</span>}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={11} /> {eng.created_at?.slice(0, 10)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: progress === 100 ? 'var(--green)' : 'var(--gold)', fontFamily: 'DM Sans' }}>{progress}%</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Progress</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Sans' }}>{done}/{total}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Steps</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 10, background: eng.status === 'Completed' ? 'var(--green-bg)' : 'rgba(14,109,180,0.12)', color: eng.status === 'Completed' ? 'var(--green)' : 'var(--gold)' }}>{eng.status}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 14 }}>
            <div className="nn-progress" style={{ height: 6 }}><div className="nn-progress-bar" style={{ width: `${progress}%`, background: progress >= 80 ? 'var(--green)' : progress >= 50 ? '#3b82f6' : 'var(--gold)', transition: 'width 0.3s' }} /></div>
          </div>
        </div>
      </div>

      {/* Edit Panel */}
      {editing && (
        <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 16 }} data-testid="edit-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Sans', color: 'var(--text)' }}>Edit Engagement</h3>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Status</label>
              <select value={editForm.status} onChange={(e) => setEditForm(p => ({ ...p, status: e.target.value }))} style={inputStyle} data-testid="edit-status">
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Assigned To</label>
              <select value={editForm.assigned_to || ''} onChange={(e) => setEditForm(p => ({ ...p, assigned_to: e.target.value }))} style={inputStyle} data-testid="edit-assignee">
                <option value="">— Unassigned —</option>
                {staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="tbtn tbtn-gold" onClick={saveEdit} disabled={saving} style={{ width: '100%', justifyContent: 'center' }} data-testid="save-edit-btn"><Save size={13} /> {saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      {AUDIT_SERVICE_TYPES.includes(eng.service_type) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} data-testid="engagement-tabs">
          <button onClick={() => setActiveTab('checklist')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === 'checklist' ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === 'checklist' ? 'rgba(14,109,180,0.08)' : 'var(--white)', color: activeTab === 'checklist' ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid="tab-checklist"><ListChecks size={14} /> Checklist</button>
          <button onClick={() => setActiveTab('audit')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === 'audit' ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === 'audit' ? 'rgba(14,109,180,0.08)' : 'var(--white)', color: activeTab === 'audit' ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid="tab-audit-workbook"><BookOpen size={14} /> Audit Workbook</button>
          <button onClick={() => setActiveTab('review')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === 'review' ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === 'review' ? 'rgba(14,109,180,0.08)' : 'var(--white)', color: activeTab === 'review' ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid="tab-review"><ListChecks size={14} /> Review &amp; assumptions</button>
        </div>
      )}

      {eng.terms && Object.keys(eng.terms).length > 0 && (
              <div className="nn-card" style={{ margin: '0 20px 14px', padding: '16px 20px' }} data-testid="engagement-terms">
                <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 10 }}>Service &amp; commercial terms</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {Object.entries(eng.terms).map(([k, v]) => (
                    <div key={k}><span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>{k.replace(/_/g, ' ')}</span><b style={{ fontSize: 13 }}>{String(v)}</b></div>
                  ))}
                  {eng.fee_amount ? <div><span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>quoted fee</span><b style={{ fontSize: 13 }}>AED {Number(eng.fee_amount).toLocaleString()}</b></div> : null}
                </div>
                {(eng.milestones || []).length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                    Billing milestones: {eng.milestones.map(ms => `${ms.label} ${ms.percent}% (AED ${Number(ms.amount).toLocaleString()})`).join(' - ')}
                  </div>
                )}
              </div>
            )}
      {activeTab === 'review' && (
        <div style={{ margin: '0 20px' }} data-testid="review-assumptions">
          <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="review-notes-card">
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Review notes</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Reviewer comments on this job — each note stays open until explicitly cleared (clears with your name and time).</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={rnText} onChange={e => setRnText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addReviewNote()}
                placeholder="Review observation — e.g. 'Bank reconciliation differs from statement by AED 420 — obtain explanation'"
                data-testid="review-note-input"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
              <button className="af-btn-primary" onClick={addReviewNote} data-testid="add-review-note">Add note</button>
            </div>
            {reviewNotes.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No review notes yet.</div>}
            {reviewNotes.map(n => (
              <div key={n.note_id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 8, marginBottom: 6, background: n.status === 'Open' ? '#fdf6ec' : '#f0f7f2', border: `1px solid ${n.status === 'Open' ? '#f0e0c8' : '#cfe5d6'}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{n.text}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
                    {n.author_name} · {new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {n.status === 'Cleared' && <> · cleared by {n.cleared_by} {n.cleared_at && new Date(n.cleared_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</>}
                  </div>
                </div>
                {n.status === 'Open'
                  ? <button className="af-btn" onClick={() => clearReviewNote(n.note_id)} data-testid={`clear-note-${n.note_id}`}>Mark cleared</button>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>CLEARED</span>}
              </div>
            ))}
          </div>

          <div className="nn-card" style={{ padding: '16px 20px' }} data-testid="assumptions-card">
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Assumptions &amp; basis</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Key audit assumptions and the values used — e.g. materiality threshold, depreciation rates, sampling basis, FX rate applied. Each entry states where the value comes from.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <input value={asText} onChange={e => setAsText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAssumption()}
                placeholder="Assumption — e.g. 'Materiality: AED 50,000'"
                data-testid="assumption-input"
                style={{ flex: 2, minWidth: 220, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
              <input value={asBasis} onChange={e => setAsBasis(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAssumption()}
                placeholder="Basis / justification — e.g. '5% of revenue before tax'"
                data-testid="assumption-basis-input"
                style={{ flex: 2, minWidth: 220, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
              <button className="af-btn-primary" onClick={addAssumption} data-testid="add-assumption">Add</button>
            </div>
            {assumptions.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No assumptions recorded yet — add materiality, sampling and rate assumptions as you set them.</div>}
            {assumptions.map(a => (
              <div key={a.assumption_id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 8, marginBottom: 6, background: 'var(--blue-bg, #eaf3fb)', border: '1px solid #d8e8f4' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{a.text}</div>
                  {a.basis && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Basis: {a.basis}</div>}
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{a.added_by} · {new Date(a.added_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                </div>
                <button className="af-btn" onClick={() => removeAssumption(a.assumption_id)} data-testid={`remove-assumption-${a.assumption_id}`}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'audit' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <AuditWorkbook engagementId={engagementId} clientId={eng.client_id} clientName={eng.client_name} />
      ) : (
      <div className="nn-card" style={{ overflow: 'hidden' }} data-testid="engagement-checklist">
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)' }}>Checklist</h3>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Assigned to: {eng.assigned_to_name || '—'}</span>
        </div>
        {eng.checklist?.map((group, gIdx) => {
          const groupDone = group.items.filter(i => i.done).length;
          const groupTotal = group.items.length;
          const groupProgress = groupTotal > 0 ? Math.round(groupDone / groupTotal * 100) : 0;
          return (
            <div key={gIdx} data-testid={`checklist-group-${gIdx}`}>
              {/* Group header */}
              <div style={{ padding: '10px 20px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: groupDone === groupTotal ? 'var(--green)' : 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: groupDone === groupTotal ? '#fff' : 'var(--gold)', fontSize: 10, fontWeight: 700 }}>{gIdx + 1}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{group.group}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="nn-progress" style={{ width: 50, height: 4 }}><div className="nn-progress-bar" style={{ width: `${groupProgress}%`, background: groupDone === groupTotal ? 'var(--green)' : 'var(--gold)' }} /></div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: groupDone === groupTotal ? 'var(--green)' : 'var(--muted)' }}>{groupDone}/{groupTotal}</span>
                </div>
              </div>
              {/* Items */}
              {group.items.map((item, iIdx) => (
                <div key={iIdx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 10px 52px', borderBottom: '1px solid var(--nn-border)', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(14,109,180,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div
                    onClick={() => toggleChecklist(gIdx, iIdx, item.done)}
                    style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${item.done ? 'var(--green)' : 'var(--nn-border)'}`, background: item.done ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    data-testid={`check-${gIdx}-${iIdx}`}
                  >
                    {item.done && <CheckCircle size={12} color="var(--green)" />}
                  </div>
                  <span style={{ fontSize: 13, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>{item.label}</span>
                  {item.done && <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 600 }}>Done</span>}
                  <button onClick={() => { setNoteEditing(`${gIdx}-${iIdx}`); setNoteDraft(item.note || ''); }}
                    title={item.note ? 'View / edit justification note' : 'Add a working-paper note or justification'}
                    data-testid={`note-${gIdx}-${iIdx}`}
                    style={{ background: item.note ? 'var(--blue-bg, #e7f1fa)' : 'none', border: 'none', cursor: 'pointer', color: item.note ? '#0e6db4' : 'var(--muted)', padding: 2, borderRadius: 4 }}>
                    <BookOpen size={12} />
                  </button>
                  {noteEditing === `${gIdx}-${iIdx}` && (
                    <div style={{ width: '100%', marginTop: 6 }} data-testid={`note-editor-${gIdx}-${iIdx}`}>
                      <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} autoFocus
                        placeholder="Working-paper note / justification — what was done, basis, sample reference…"
                        style={{ width: '100%', minHeight: 54, fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                        <button className="af-btn" onClick={() => setNoteEditing(null)}>Cancel</button>
                        <button className="af-btn-primary" onClick={() => saveItemNote(gIdx, iIdx, noteDraft)} data-testid={`note-save-${gIdx}-${iIdx}`}>Save note</button>
                      </div>
                    </div>
                  )}
                  {item.note && noteEditing !== `${gIdx}-${iIdx}` && (
                    <div style={{ width: '100%', fontSize: 11.5, color: 'var(--muted)', background: 'var(--blue-bg, #eaf3fb)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }} data-testid={`note-view-${gIdx}-${iIdx}`}>
                      📝 {item.note}
                      {item.note_by && <span style={{ opacity: 0.7 }}> — {item.note_by}</span>}
                    </div>
                  )}
                  {isPartner && (
                    <button onClick={() => removeItem(gIdx, iIdx)} title="Remove item"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}
                      data-testid={`remove-item-${gIdx}-${iIdx}`}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
              {isPartner && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 20px 10px 52px', alignItems: 'center' }} data-testid={`add-item-row-${gIdx}`}>
                  <Plus size={13} color="var(--muted)" />
                  <input placeholder="Add a task to this phase, press Enter…" data-testid={`add-item-input-${gIdx}`}
                    onKeyDown={e => { if (e.key === 'Enter') { addItem(group.group, e.currentTarget.value); e.currentTarget.value = ''; } }}
                    style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px dashed var(--nn-border)', background: 'var(--white)', color: 'var(--text)', outline: 'none' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default EngagementDetail;
