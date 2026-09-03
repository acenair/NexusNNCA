import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, Clock, GitBranch, User, Calendar, Edit2, Save, X, ListChecks, BookOpen } from 'lucide-react';
import axios from 'axios';
import AuditWorkbook from './AuditWorkbook';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AUDIT_SERVICE_TYPES = ['statutory_audit', 'internal_audit', 'stock_audit', 'fraud_audit'];

const EngagementDetail = () => {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const [eng, setEng] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('checklist');

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
              <button onClick={() => setEditing(true)} style={{ background: 'rgba(201,168,76,0.15)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="edit-eng-btn"><Edit2 size={12} /> Edit</button>
            )}
            {user?.role === 'partner' && eng.status !== 'Completed' && (
              <button onClick={bypassApprove} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }} data-testid="bypass-approve-btn"><CheckCircle size={12} /> Quick Approve</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>{eng.service_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h2>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> {eng.client_name}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Phase: {eng.phase}</span>
                {eng.workflow_name && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}><GitBranch size={11} /> {eng.workflow_name}</span>}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={11} /> {eng.created_at?.slice(0, 10)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: progress === 100 ? 'var(--green)' : 'var(--gold)', fontFamily: 'DM Serif Display' }}>{progress}%</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Progress</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Serif Display' }}>{done}/{total}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Steps</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 10, background: eng.status === 'Completed' ? 'var(--green-bg)' : 'rgba(201,168,76,0.12)', color: eng.status === 'Completed' ? 'var(--green)' : 'var(--gold)' }}>{eng.status}</span>
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
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Edit Engagement</h3>
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
          <button onClick={() => setActiveTab('checklist')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === 'checklist' ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === 'checklist' ? 'rgba(201,168,76,0.08)' : 'var(--white)', color: activeTab === 'checklist' ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid="tab-checklist"><ListChecks size={14} /> Checklist</button>
          <button onClick={() => setActiveTab('audit')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--rs)', border: activeTab === 'audit' ? '1px solid var(--gold)' : '1px solid var(--nn-border)', background: activeTab === 'audit' ? 'rgba(201,168,76,0.08)' : 'var(--white)', color: activeTab === 'audit' ? 'var(--gold4)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} data-testid="tab-audit-workbook"><BookOpen size={14} /> Audit Workbook</button>
        </div>
      )}

      {activeTab === 'audit' && AUDIT_SERVICE_TYPES.includes(eng.service_type) ? (
        <AuditWorkbook engagementId={engagementId} clientId={eng.client_id} clientName={eng.client_name} />
      ) : (
      <div className="nn-card" style={{ overflow: 'hidden' }} data-testid="engagement-checklist">
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Checklist</h3>
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
                <div key={iIdx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 10px 52px', borderBottom: '1px solid var(--nn-border)', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div
                    onClick={() => toggleChecklist(gIdx, iIdx, item.done)}
                    style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${item.done ? 'var(--green)' : 'var(--nn-border)'}`, background: item.done ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    data-testid={`check-${gIdx}-${iIdx}`}
                  >
                    {item.done && <CheckCircle size={12} color="var(--green)" />}
                  </div>
                  <span style={{ fontSize: 13, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>{item.label}</span>
                  {item.done && <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 600 }}>Done</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default EngagementDetail;
