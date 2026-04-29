import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, X, CheckCircle, GitBranch } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ServicePage = ({ title, subtitle, serviceType, stats }) => {
  const { user } = useOutletContext();
  const [engagements, setEngagements] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [workflows, setWorkflows] = useState([]);
  const [clients, setClients] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState({ client_id: '', assigned_to: '', assigned_to_name: '', workflow_id: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadEngagements(); }, [serviceType]);

  const loadEngagements = async () => {
    try {
      const res = await axios.get(`${API}/service/engagements?service_type=${serviceType}`, { withCredentials: true });
      setEngagements(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openCreate = async () => {
    setSuccessMsg('');
    setShowCreate(true);
    try {
      const [wfRes, cRes, sRes] = await Promise.all([
        axios.get(`${API}/service/workflows-for-type?service_type=${serviceType}`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`),
      ]);
      setWorkflows(wfRes.data);
      setClients(cRes.data);
      setStaffList(sRes.data.filter(u => u.role === 'staff'));
    } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    if (!form.client_id) return;
    setSubmitting(true);
    try {
      const staff = staffList.find(s => s.email === form.assigned_to);
      await axios.post(`${API}/service/engagements`, {
        service_type: serviceType,
        client_id: form.client_id,
        assigned_to: form.assigned_to || undefined,
        assigned_to_name: staff?.name || undefined,
        workflow_id: form.workflow_id || undefined,
        notes: form.notes || undefined,
      }, { withCredentials: true });
      setSuccessMsg('Engagement created');
      loadEngagements();
      setTimeout(() => { setShowCreate(false); setSuccessMsg(''); setForm({ client_id: '', assigned_to: '', assigned_to_name: '', workflow_id: '', notes: '' }); }, 1500);
    } catch (e) { console.error(e); alert(e.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const toggleChecklist = async (engId, gIdx, iIdx, currentDone) => {
    try {
      await axios.patch(`${API}/service/engagements/${engId}/checklist`, { group_index: gIdx, item_index: iIdx, done: !currentDone }, { withCredentials: true });
      setEngagements(prev => prev.map(eng => {
        if (eng.engagement_id !== engId) return eng;
        const cl = [...eng.checklist];
        cl[gIdx] = { ...cl[gIdx], items: cl[gIdx].items.map((item, i) => i === iIdx ? { ...item, done: !currentDone } : item) };
        const total = cl.reduce((s, g) => s + g.items.length, 0);
        const done = cl.reduce((s, g) => s + g.items.filter(i => i.done).length, 0);
        return { ...eng, checklist: cl, status: done === total ? 'Completed' : 'Active' };
      }));
    } catch (e) { console.error(e); }
  };

  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const getProgress = (eng) => {
    const total = eng.checklist?.reduce((s, g) => s + g.items.length, 0) || 0;
    const done = eng.checklist?.reduce((s, g) => s + g.items.filter(i => i.done).length, 0) || 0;
    return total > 0 ? Math.round(done / total * 100) : 0;
  };

  const activeEngs = engagements.filter(e => e.status === 'Active');
  const completedEngs = engagements.filter(e => e.status === 'Completed');
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  return (
    <div className="fade-in" data-testid={`service-page-${serviceType}`}>
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy3))', borderRadius: 'var(--rl)', padding: '18px 22px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, boxShadow: 'var(--shadow)' }} data-testid="service-banner">
        <div>
          <h1 style={{ fontFamily: 'DM Serif Display', color: 'var(--gold)', fontSize: 18, marginBottom: 3 }}>{title}</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {(stats || [
            { label: 'Active', value: activeEngs.length },
            { label: 'Completed', value: completedEngs.length },
            { label: 'Total', value: engagements.length },
          ]).map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Serif Display' }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
          <button className="tbtn tbtn-gold" onClick={openCreate} data-testid="new-engagement-btn"><Plus size={13} /> New Engagement</button>
        </div>
      </div>

      {/* Engagements Grid */}
      {loading ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : engagements.length === 0 ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No engagements yet</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Create your first {title.toLowerCase()} engagement to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }} data-testid="engagements-grid">
          {engagements.map(eng => {
            const progress = getProgress(eng);
            return (
              <div key={eng.engagement_id} className="nn-card" style={{ overflow: 'hidden' }} data-testid={`eng-${eng.engagement_id}`}>
                {/* Engagement Header */}
                <div style={{ background: 'var(--navy)', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontSize: 11, fontWeight: 700 }}>{eng.client_name?.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eng.client_name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{eng.assigned_to_name || 'Unassigned'}</div>
                  </div>
                  <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 8, background: eng.status === 'Completed' ? 'var(--green-bg)' : 'rgba(201,168,76,0.12)', color: eng.status === 'Completed' ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{eng.status}</span>
                </div>

                {/* Progress Bar */}
                <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--nn-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Phase: {eng.phase}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: progress === 100 ? 'var(--green)' : 'var(--text)' }}>{progress}%</span>
                  </div>
                  <div className="nn-progress"><div className="nn-progress-bar" style={{ width: `${progress}%`, background: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue, #3b82f6)' : 'var(--gold)' }} /></div>
                  {eng.workflow_name && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}><GitBranch size={9} /> {eng.workflow_name}</div>}
                </div>

                {/* Checklist Groups */}
                {eng.checklist?.map((group, gIdx) => {
                  const gKey = `${eng.engagement_id}-${gIdx}`;
                  const groupDone = group.items.filter(i => i.done).length;
                  return (
                    <div key={gIdx}>
                      <div onClick={() => toggleGroup(gKey)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--nn-border)', cursor: 'pointer' }}>
                        {expandedGroups[gKey] ? <ChevronDown size={13} color="var(--muted)" /> : <ChevronRight size={13} color="var(--muted)" />}
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{group.group}</span>
                        <span style={{ fontSize: 10, color: groupDone === group.items.length ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>{groupDone}/{group.items.length}</span>
                      </div>
                      {expandedGroups[gKey] && group.items.map((item, iIdx) => (
                        <div key={iIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 36px', borderBottom: '1px solid var(--nn-border)' }}>
                          <div
                            onClick={() => toggleChecklist(eng.engagement_id, gIdx, iIdx, item.done)}
                            style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${item.done ? 'var(--green)' : 'var(--nn-border)'}`, background: item.done ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            data-testid={`check-${eng.engagement_id}-${gIdx}-${iIdx}`}
                          >
                            {item.done && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 11, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Engagement Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => !submitting && setShowCreate(false)} data-testid="create-engagement-modal">
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>New {title} Engagement</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            {successMsg ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}><CheckCircle size={42} color="var(--green)" style={{ marginBottom: 12 }} /><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{successMsg}</div></div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ marginBottom: 12 }}><label style={labelStyle}>Client *</label><select value={form.client_id} onChange={(e) => setForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} data-testid="eng-client"><option value="">— Select —</option>{clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}</select></div>
                  <div style={{ marginBottom: 12 }}><label style={labelStyle}>Assign To</label><select value={form.assigned_to} onChange={(e) => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={inputStyle} data-testid="eng-assignee"><option value="">— Select —</option>{staffList.map(s => <option key={s.email} value={s.email}>{s.name} — {s.title}</option>)}</select></div>
                  {workflows.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Workflow Template</label>
                      <select value={form.workflow_id} onChange={(e) => setForm(p => ({ ...p, workflow_id: e.target.value }))} style={inputStyle} data-testid="eng-workflow">
                        <option value="">— Use default checklist —</option>
                        {workflows.map(wf => <option key={wf.workflow_id} value={wf.workflow_id}>{wf.name} ({wf.steps?.length} steps)</option>)}
                      </select>
                      {form.workflow_id && (
                        <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Workflow Steps:</div>
                          {workflows.find(w => w.workflow_id === form.workflow_id)?.steps?.map((s, i) => (
                            <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '2px 0', display: 'flex', gap: 6 }}>
                              <span style={{ color: 'var(--gold4)', fontWeight: 600, fontSize: 10 }}>{i + 1}.</span> {s.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." style={{ ...inputStyle, resize: 'vertical' }} data-testid="eng-notes" /></div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={handleCreate} disabled={submitting || !form.client_id} data-testid="create-eng-btn">{submitting ? 'Creating...' : 'Create Engagement'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePage;
