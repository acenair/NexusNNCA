import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, Clock, GitBranch, User, Calendar, Edit2, Save, X, ListChecks, BookOpen, Plus, Trash2} from 'lucide-react';
import axios from 'axios';
import AuditWorkbook from './AuditWorkbook';
import TrialBalance from './TrialBalance';
import WorkJournal from './WorkJournal';
import ClientQueries from './ClientQueries';
import AJEs from './AJEs';
import ReceiptInbox from './ReceiptInbox';
import VatRecon from './VatRecon';
import Statements from './Statements';
import NotesDisclosure from './NotesDisclosure';
import AuditIntel from './AuditIntel';
import { MessageSquare, Scale, Receipt, FileText, FlaskConical } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AUDIT_SERVICE_TYPES = ['statutory_audit', 'internal_audit', 'stock_audit', 'fraud_audit'];
const VAT_RECON_TYPES = [...AUDIT_SERVICE_TYPES, 'vat_filing', 'vat_registration', 'vat_amendments', 'accounting'];

const EngagementDetail = () => {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useOutletContext();
  const [eng, setEng] = useState(null);
  const [noteEditing, setNoteEditing] = useState(null);
  const [reviewNotes, setReviewNotes] = useState([]);
  const [rnText, setRnText] = useState('');
  const [assumptions, setAssumptions] = useState([]);
  const [asText, setAsText] = useState('');
  const [asBasis, setAsBasis] = useState('');  // `${gIdx}-${iIdx}` being edited
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
      const item = eng.checklist?.[gIdx]?.items?.[iIdx];
      setEng(prev => {
        const cl = [...prev.checklist];
        cl[gIdx] = { ...cl[gIdx], items: cl[gIdx].items.map((item, i) => i === iIdx ? { ...item, done: !currentDone } : item) };
        return { ...prev, checklist: cl, phase: res.data.phase, status: res.data.status };
      });
      // Continuity nudge: completing an item with no working-paper note opens the note editor
      if (!currentDone && !(item?.note || '').trim()) setNoteEditing(`${gIdx}-${iIdx}`);
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
  // Audit standards workpapers (risk register / materiality / confirmations / rep letter)
  const [wps, setWps] = useState({ risk: [], materiality: [], confirmation: [], rep_letter: [] });
  const [wpForm, setWpForm] = useState({ risk: '', assertion: '', response: '', conf_account: '', conf_type: 'Bank', bench: 'profit_before_tax', bench_value: '', pct: 5, pm: 50, triv: 5, matResult: null, sampConf: 95, sampTer: 5, sampPop: '', sampDev: '', sampResult: null, tcwgDate: '', tcwgMatter: '', tcwgSeverity: 'Deficiency', tcwgResponse: '', letter: null, repOpinion: 'unmodified', repBasis: '', repKam: '', repDate: new Date().toISOString().slice(0, 10), report: null, grpComponent: '', grpAuditor: '', grpScope: 'Full scope', grpMat: '', grpNote: '', tcwgSendToClient: false });

  const loadWorkpapers = async () => {
    try {
      const res = await axios.get(`${API}/engagements/${engagementId}/workpapers`, { withCredentials: true });
      setWps({ risk: res.data.risk || [], materiality: res.data.materiality || [], confirmation: res.data.confirmation || [], rep_letter: res.data.rep_letter || [], sampling: res.data.sampling || [], tcwg: res.data.tcwg || [], group: res.data.group || [], report: res.data.report || [] });
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadNotes(); loadAssumptions(); loadWorkpapers(); }, [engagementId]);

  const addWp = async (kind, data, clearFn) => {
    try {
      await axios.post(`${API}/engagements/${engagementId}/workpapers`, { kind, data }, { withCredentials: true });
      await loadWorkpapers();
      clearFn && clearFn();
    } catch (e) { alert(e.response?.data?.detail || 'Could not save'); }
  };
  const delWp = async (id) => {
    try {
      await axios.patch(`${API}/engagements/${engagementId}/workpapers/${id}`, { is_deleted: true }, { withCredentials: true });
      await loadWorkpapers();
    } catch (e) { alert('Could not delete'); }
  };
  const calcSampling = async () => {
    try {
      const res = await axios.get(`${API}/engagements/${engagementId}/sampling-calc`, { params: { confidence: wpForm.sampConf, tolerable_rate: wpForm.sampTer, population: wpForm.sampPop || 0, deviations: wpForm.sampDev || 0 }, withCredentials: true });
      setWpForm(prev => ({ ...prev, sampResult: res.data }));
    } catch (e) { alert(e.response?.data?.detail || 'Check the inputs'); }
  };
  const generateReport = async () => {
    try {
      const res = await axios.post(`${API}/engagements/${engagementId}/audit-report`, {
        opinion: wpForm.repOpinion, basis: wpForm.repBasis, report_date: wpForm.repDate,
        key_audit_matters: wpForm.repKam ? wpForm.repKam.split('\n').map(x => x.trim()).filter(Boolean) : [],
      }, { withCredentials: true });
      setWpForm(prev => ({ ...prev, report: res.data }));
      await loadWorkpapers();
    } catch (e) { alert(e.response?.data?.detail || 'Could not generate the report'); }
  };
  const generateLetter = async () => {
    try {
      const res = await axios.post(`${API}/engagements/${engagementId}/engagement-letter`, {}, { withCredentials: true });
      setWpForm(prev => ({ ...prev, letter: res.data }));
    } catch (e) { alert('Could not generate the letter'); }
  };
  const calcMateriality = async () => {
    try {
      const res = await axios.get(`${API}/engagements/${engagementId}/materiality-calc`, { params: { benchmark: wpForm.bench, benchmark_value: wpForm.bench_value, pct: wpForm.pct, pm_pct: wpForm.pm, trivial_pct: wpForm.triv }, withCredentials: true });
      setWpForm(prev => ({ ...prev, matResult: res.data }));
    } catch (e) { alert(e.response?.data?.detail || 'Check the inputs'); }
  };
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

      {/* Tab Switcher — base tabs for every service; audit extras for audit types */}
      {(() => {
        const isAudit = AUDIT_SERVICE_TYPES.includes(eng.service_type);
        const tabBtn = (key, testid, icon, label) => (
          <button onClick={() => setActiveTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === key ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === key ? 'rgba(14,109,180,0.08)' : 'var(--white)', color: activeTab === key ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid={testid}>{icon} {label}</button>
        );
        return (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }} data-testid="engagement-tabs">
            {tabBtn('checklist', 'tab-checklist', <ListChecks size={14} />, 'Checklist')}
            {isAudit && tabBtn('audit', 'tab-audit-workbook', <BookOpen size={14} />, 'Audit Workbook')}
            {isAudit && tabBtn('review', 'tab-review', <ListChecks size={14} />, 'Review & assumptions')}
            {isAudit && tabBtn('standards', 'tab-standards', <BookOpen size={14} />, 'Standards workbook')}
            {isAudit && tabBtn('tb', 'tab-trial-balance', <BookOpen size={14} />, 'Trial Balance')}
            {isAudit && tabBtn('receipts', 'tab-receipts', <Receipt size={14} />, 'Receipts')}
            {VAT_RECON_TYPES.includes(eng.service_type) && tabBtn('vatrecon', 'tab-vat-recon', <Scale size={14} />, 'VAT Recon')}
            {isAudit && tabBtn('ajes', 'tab-ajes', <Scale size={14} />, 'Adjustments')}
            {isAudit && tabBtn('statements', 'tab-statements', <FileText size={14} />, 'Statements')}
            {isAudit && tabBtn('notes', 'tab-notes', <ListChecks size={14} />, 'Notes & disclosures')}
            {isAudit && tabBtn('intel', 'tab-intel', <FlaskConical size={14} />, 'Audit intel')}
            {tabBtn('journal', 'tab-journal', <BookOpen size={14} />, 'Journal')}
            {tabBtn('queries', 'tab-queries', <MessageSquare size={14} />, 'Client queries')}
          </div>
        );
      })()}

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

      {activeTab === 'standards' && (
  <div style={{ margin: '0 20px' }} data-testid="standards-workbook">
    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-risk-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Risk register — ISA 315/330</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Identified risk → affected assertion → planned response → conclusion. Each entry is the documented link between your risk assessment and the work performed.</div>
      {wps.risk.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {wps.risk.map(w => (
            <div key={w.workpaper_id} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{w.data.risk}</b>
                <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => delWp(w.workpaper_id)} data-testid={`wp-risk-del-${w.workpaper_id}`}>✕</button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Assertion: {w.data.assertion || '—'} · Response: {w.data.response || '—'}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Identified risk" value={wpForm.risk} onChange={e => setWpForm({ ...wpForm, risk: e.target.value })} data-testid="wp-risk-input" style={{ flex: 2, minWidth: 200, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <input placeholder="Assertion (e.g. occurrence)" value={wpForm.assertion} onChange={e => setWpForm({ ...wpForm, assertion: e.target.value })} style={{ flex: 1, minWidth: 140, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <input placeholder="Planned response" value={wpForm.response} onChange={e => setWpForm({ ...wpForm, response: e.target.value })} style={{ flex: 2, minWidth: 200, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <button className="af-btn-primary" onClick={() => { if (!wpForm.risk) return; addWp('risk', { risk: wpForm.risk, assertion: wpForm.assertion, response: wpForm.response }, () => setWpForm({ ...wpForm, risk: '', assertion: '', response: '' })); }} data-testid="wp-risk-add">Add risk</button>
      </div>
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-materiality-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Materiality — ISA 320</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <select value={wpForm.bench} onChange={e => setWpForm({ ...wpForm, bench: e.target.value })} data-testid="wp-mat-bench" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          <option value="profit_before_tax">Profit before tax (0.5–5%)</option>
          <option value="revenue">Revenue (0.5–1%)</option>
          <option value="total_assets">Total assets (0.5–2%)</option>
          <option value="equity">Equity (0.5–2%)</option>
          <option value="cost_base">Cost base (0.5–2%)</option>
        </select>
        <input type="number" placeholder="Benchmark value (AED)" value={wpForm.bench_value} onChange={e => setWpForm({ ...wpForm, bench_value: e.target.value })} data-testid="wp-mat-value" style={{ width: 170, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <input type="number" step="0.1" title="Overall materiality %" value={wpForm.pct} onChange={e => setWpForm({ ...wpForm, pct: e.target.value })} style={{ width: 90, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} /> %
        <button className="af-btn-primary" onClick={calcMateriality} data-testid="wp-mat-calc">Calculate</button>
      </div>
      {wpForm.matResult && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }} data-testid="wp-mat-result">
          {[['Overall materiality', wpForm.matResult.overall_materiality], ['Performance materiality', wpForm.matResult.performance_materiality], ['Clearly trivial', wpForm.matResult.trivial_threshold]].map(([label, v]) => (
            <div key={label} style={{ padding: 10, borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
              <b style={{ fontSize: 14, color: 'var(--text)' }}>AED {Number(v).toLocaleString()}</b>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="tbtn tbtn-outline" style={{ fontSize: 11 }} onClick={() => addWp('materiality', { ...wpForm.matResult }, () => setWpForm(prev => ({ ...prev, matResult: null })))} data-testid="wp-mat-save">Save to file</button>
          </div>
        </div>
      )}
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-confirmations-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>External confirmations — ISA 505</div>
      {wps.confirmation.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {wps.confirmation.map(w => (
            <div key={w.workpaper_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: w.data.status === 'Received - clean' ? '#f0f7f2' : w.data.status === 'Exception' ? '#fdf0ee' : 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)' }}><b>{w.data.account}</b> · {w.data.type} · sent {w.data.sent || '—'} → {w.data.status}</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => delWp(w.workpaper_id)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Account / party" value={wpForm.conf_account} onChange={e => setWpForm({ ...wpForm, conf_account: e.target.value })} data-testid="wp-conf-account" style={{ flex: 1, minWidth: 160, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <select value={wpForm.conf_type} onChange={e => setWpForm({ ...wpForm, conf_type: e.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          {['Bank', 'Receivable', 'Payable', 'Lawyer', 'Other'].map(x => <option key={x}>{x}</option>)}
        </select>
        <button className="af-btn-primary" onClick={() => { if (!wpForm.conf_account) return; addWp('confirmation', { account: wpForm.conf_account, type: wpForm.conf_type, sent: new Date().toISOString().slice(0, 10), status: 'Sent - awaiting' }, () => setWpForm({ ...wpForm, conf_account: '' })); }} data-testid="wp-conf-add">Mark as sent</button>
      </div>
    </div>

    <div className="nn-card" style={{ padding: '16px 20px' }} data-testid="wp-rep-letter-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Management representation letter — ISA 580</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Track the rep letter through preparation, signature and filing. The letter must be obtained before the audit report is dated.</div>
      {wps.rep_letter.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {wps.rep_letter.map(w => (
            <div key={w.workpaper_id} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6, fontSize: 12.5, color: 'var(--text)' }}>
              {w.data.status} — {w.data.date} {w.data.note && `· ${w.data.note}`}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={wpForm.repStatus || 'Prepared'} onChange={e => setWpForm({ ...wpForm, repStatus: e.target.value })} data-testid="wp-rep-status" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          {['Prepared', 'Sent to client', 'Signed & received', 'Not obtained'].map(x => <option key={x}>{x}</option>)}
        </select>
        <button className="af-btn-primary" onClick={() => addWp('rep_letter', { status: wpForm.repStatus || 'Prepared', date: new Date().toISOString().slice(0, 10) }, null)} data-testid="wp-rep-add">Log status</button>
      </div>
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-group-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Group audit components — ISA 600 (Revised)</div>
      {wps.group.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {wps.group.map(w => (
            <div key={w.workpaper_id} style={{ padding: '9px 12px', borderRadius: 8, background: w.data.consolidation_status === 'Reviewed & consolidated' ? '#f0f7f2' : 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{w.data.component}</b>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{w.data.scope_work} · materiality {w.data.materiality_allocation || '—'}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => delWp(w.workpaper_id)}>✕</button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Component auditor: {w.data.component_auditor || '—'} · {w.data.consolidation_status || 'Not consolidated'}{w.data.note ? ` · ${w.data.note}` : ''}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Component (entity/branch)" value={wpForm.grpComponent} onChange={e => setWpForm({ ...wpForm, grpComponent: e.target.value })} data-testid="wp-grp-component" style={{ flex: 2, minWidth: 180, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <input placeholder="Component auditor" value={wpForm.grpAuditor} onChange={e => setWpForm({ ...wpForm, grpAuditor: e.target.value })} style={{ flex: 1, minWidth: 150, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <select value={wpForm.grpScope} onChange={e => setWpForm({ ...wpForm, grpScope: e.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          {['Full scope', 'Specified risks', 'Specified items', 'Analytical review'].map(x => <option key={x}>{x}</option>)}
        </select>
        <input type="number" placeholder="Mat. allocation" value={wpForm.grpMat} onChange={e => setWpForm({ ...wpForm, grpMat: e.target.value })} style={{ width: 120, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <button className="af-btn-primary" onClick={() => { if (!wpForm.grpComponent) return; addWp('group', { component: wpForm.grpComponent, component_auditor: wpForm.grpAuditor, scope_work: wpForm.grpScope, materiality_allocation: wpForm.grpMat, consolidation_status: 'Instructions sent', note: wpForm.grpNote }, () => setWpForm({ ...wpForm, grpComponent: '', grpAuditor: '', grpMat: '', grpNote: '' })); }} data-testid="wp-grp-add">Add component</button>
      </div>
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-report-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Auditor's report — ISA 700 (with MOE licence numbers)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <select value={wpForm.repOpinion} onChange={e => setWpForm({ ...wpForm, repOpinion: e.target.value })} data-testid="wp-rep-opinion" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          {['unmodified', 'qualified', 'adverse', 'disclaimer'].map(x => <option key={x} value={x}>{x.charAt(0).toUpperCase() + x.slice(1)} opinion</option>)}
        </select>
        <input type="date" value={wpForm.repDate} onChange={e => setWpForm({ ...wpForm, repDate: e.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <button className="af-btn-primary" onClick={generateReport} data-testid="wp-rep-generate">Generate report</button>
      </div>
      {wpForm.repOpinion !== 'unmodified' && (
        <textarea rows={2} placeholder="Basis for the modified opinion (the matters that drive the modification)" value={wpForm.repBasis} onChange={e => setWpForm({ ...wpForm, repBasis: e.target.value })} data-testid="wp-rep-basis" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12, marginBottom: 8 }} />
      )}
      {wpForm.report && (
        <div style={{ border: '1px solid var(--nn-border)', borderRadius: 8, padding: 14 }} data-testid="wp-report-doc">
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 10 }}>Report dated {wpForm.report.report_date} — print on firm letterhead. Retain 10 years (MOE Art. 16).</div>
          {wpForm.report.sections.map(s2 => (
            <div key={s2.title} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{s2.title}</b>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, marginTop: 2 }}>{s2.body}</div>
              {s2.items.length > 0 && <ul style={{ fontSize: 12, color: 'var(--text)', margin: '4px 0 0 18px' }}>{s2.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-sampling-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>Attribute sampling — ISA 530</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <select value={wpForm.sampConf} onChange={e => setWpForm({ ...wpForm, sampConf: Number(e.target.value) })} data-testid="wp-samp-conf" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          <option value={90}>90% confidence</option>
          <option value={95}>95% confidence</option>
          <option value={99}>99% confidence</option>
        </select>
        <input type="number" step="0.5" title="Tolerable deviation rate %" placeholder="Tolerable rate %" value={wpForm.sampTer} onChange={e => setWpForm({ ...wpForm, sampTer: e.target.value })} style={{ width: 130, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} /> %
        <input type="number" placeholder="Population" value={wpForm.sampPop} onChange={e => setWpForm({ ...wpForm, sampPop: e.target.value })} style={{ width: 110, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <input type="number" placeholder="Deviations found" value={wpForm.sampDev} onChange={e => setWpForm({ ...wpForm, sampDev: e.target.value })} style={{ width: 140, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <button className="af-btn-primary" onClick={calcSampling} data-testid="wp-samp-calc">Calculate</button>
      </div>
      {wpForm.sampResult && (
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)', fontSize: 12.5, color: 'var(--text)' }} data-testid="wp-samp-result">
          Sample size: <b>{wpForm.sampResult.sample_size}</b> ({wpForm.sampResult.method})
          {wpForm.sampResult.evaluation && (
            <div style={{ marginTop: 6, color: wpForm.sampResult.evaluation.within_tolerance ? 'var(--green)' : 'var(--gold)' }}>
              {wpForm.sampResult.evaluation.deviations} deviation(s) → UDL {wpForm.sampResult.evaluation.upper_deviation_limit_pct}% — {wpForm.sampResult.evaluation.conclusion}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <button className="tbtn tbtn-outline" style={{ fontSize: 11 }} onClick={() => addWp('sampling', { ...wpForm.sampResult }, () => setWpForm(prev => ({ ...prev, sampResult: null })))} data-testid="wp-samp-save">Save to file</button>
          </div>
        </div>
      )}
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-tcwg-card">
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>TCWG communications &amp; deficiencies — ISA 260 / 265</div>
      {wps.tcwg.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {wps.tcwg.map(w => (
            <div key={w.workpaper_id} style={{ padding: '9px 12px', borderRadius: 8, background: w.data.resolved ? '#f0f7f2' : '#fdf6ec', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{w.data.matter}</b>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{w.data.date} · {w.data.severity}{w.data.resolved ? ' · resolved' : ''}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => delWp(w.workpaper_id)}>✕</button>
              </div>
              {w.data.response && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Management response: {w.data.response}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Deficiency / matter communicated" value={wpForm.tcwgMatter} onChange={e => setWpForm({ ...wpForm, tcwgMatter: e.target.value })} data-testid="wp-tcwg-matter" style={{ flex: 2, minWidth: 220, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <select value={wpForm.tcwgSeverity} onChange={e => setWpForm({ ...wpForm, tcwgSeverity: e.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }}>
          {['Observation', 'Deficiency', 'Significant deficiency'].map(x => <option key={x}>{x}</option>)}
        </select>
        <input placeholder="Management response" value={wpForm.tcwgResponse} onChange={e => setWpForm({ ...wpForm, tcwgResponse: e.target.value })} style={{ flex: 2, minWidth: 200, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12 }} />
        <button className="af-btn-primary" onClick={async () => { if (!wpForm.tcwgMatter) return; await addWp('tcwg', { matter: wpForm.tcwgMatter, severity: wpForm.tcwgSeverity, response: wpForm.tcwgResponse, date: new Date().toISOString().slice(0, 10), resolved: false, sent_to_client: wpForm.tcwgSendToClient }, null); if (wpForm.tcwgSendToClient) { try { await axios.post(`${API}/service/engagements/${engagementId}/queries`, { question: `[ISA 265 ${wpForm.tcwgSeverity}] ${wpForm.tcwgMatter} — please provide management's response and corrective action.` }, { withCredentials: true }); } catch (e2) { alert('Saved to the file, but could not send to the client portal'); } } setWpForm(prev => ({ ...prev, tcwgMatter: '', tcwgResponse: '', tcwgSendToClient: false })); }} data-testid="wp-tcwg-add">Log{wpForm.tcwgSendToClient ? ' + send to client' : ''}</button>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }} data-testid="wp-tcwg-send-label">
          <input type="checkbox" checked={wpForm.tcwgSendToClient} onChange={e => setWpForm({ ...wpForm, tcwgSendToClient: e.target.checked })} /> Send to client portal
        </label>
      </div>
    </div>

    <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="wp-letter-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)' }}>Engagement letter — ISA 210</div>
        <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={generateLetter} data-testid="wp-letter-generate">Generate letter</button>
      </div>
      {wpForm.letter && (
        <div style={{ border: '1px solid var(--nn-border)', borderRadius: 8, padding: 14 }} data-testid="wp-letter-doc">
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 10 }}>Ref {wpForm.letter.letter_ref} · generated {new Date(wpForm.letter.generated_at).toLocaleDateString()} — print on firm letterhead</div>
          {wpForm.letter.sections.map(s2 => (
            <div key={s2.title} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{s2.title}</b>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, marginTop: 2 }}>{s2.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>

    {eng.completed_at && (
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }} data-testid="archive-due-note">
        10-year retention (MOE Art. 16 — documents from report issuance): archive due {new Date(new Date(eng.completed_at).setFullYear(new Date(eng.completed_at).getFullYear() + 10)).toISOString().slice(0, 10)} · CT tax records 7 years
      </div>
    )}
  </div>
)}
{activeTab === 'tb' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <TrialBalance engagementId={engagementId} />
      ) : activeTab === 'receipts' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <ReceiptInbox engagementId={engagementId} isPartner={isPartner} />
      ) : activeTab === 'vatrecon' && VAT_RECON_TYPES.includes(eng.service_type) ? (
        <VatRecon engagementId={engagementId} />
      ) : activeTab === 'ajes' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <AJEs engagementId={engagementId} isPartner={isPartner} />
      ) : activeTab === 'statements' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <Statements engagementId={engagementId} isPartner={isPartner} />
      ) : activeTab === 'notes' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <NotesDisclosure engagementId={engagementId} isPartner={isPartner} />
      ) : activeTab === 'intel' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <AuditIntel engagementId={engagementId} />
      ) : activeTab === 'journal' ? (
        <WorkJournal engagementId={engagementId} />
      ) : activeTab === 'queries' ? (
        <ClientQueries engagementId={engagementId} />
      ) : activeTab === 'audit' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
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
