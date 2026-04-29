import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Settings as SettingsIcon, Shield, HardDrive, GitBranch, Save, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, X, CheckCircle, Cloud, Edit2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SECTIONS = [
  { key: 'overview', label: 'Overview', desc: 'Dashboard, Deadlines, Calendar, AI Assistant, Documents' },
  { key: 'audit', label: 'Audit', desc: 'Statutory, Internal, Stock, Fraud Audit' },
  { key: 'vat', label: 'VAT', desc: 'Registration, Filing, Amendments' },
  { key: 'corporate', label: 'Corporate', desc: 'Registration, Tax, Formation, Liquidation' },
  { key: 'advisory', label: 'Advisory', desc: 'Valuation, Due Diligence' },
  { key: 'aml', label: 'AML', desc: 'Review, Filing, Reports' },
];

const SERVICE_TYPES = [
  { key: 'statutory_audit', label: 'Statutory Audit' },
  { key: 'internal_audit', label: 'Internal Audit' },
  { key: 'vat_filing', label: 'VAT Filing' },
  { key: 'vat_registration', label: 'VAT Registration' },
  { key: 'corporate_tax', label: 'Corporate Tax' },
  { key: 'aml_review', label: 'AML Review' },
  { key: 'company_formation', label: 'Company Formation' },
  { key: 'due_diligence', label: 'Due Diligence' },
  { key: 'valuation', label: 'Valuation' },
];

const STORAGE_PROVIDERS = [
  { key: 'aws_s3', label: 'AWS S3', icon: '🪣', color: '#FF9900', fields: [
    { key: 'bucket_name', label: 'Bucket Name', placeholder: 'my-firm-documents' },
    { key: 'region', label: 'Region', placeholder: 'me-south-1' },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: 'AKIA...' },
    { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '********', type: 'password' },
  ]},
  { key: 'google_drive', label: 'Google Drive', icon: '📁', color: '#4285F4', fields: [
    { key: 'folder_id', label: 'Folder ID', placeholder: 'Drive folder ID' },
    { key: 'service_account_email', label: 'Service Account Email', placeholder: 'sa@project.iam.gserviceaccount.com' },
    { key: 'credentials_json', label: 'Credentials JSON', placeholder: 'Paste service account JSON...', multiline: true },
  ]},
  { key: 'onedrive', label: 'OneDrive', icon: '☁️', color: '#0078D4', fields: [
    { key: 'tenant_id', label: 'Tenant ID', placeholder: 'Azure AD tenant ID' },
    { key: 'client_id', label: 'Client ID', placeholder: 'Application (client) ID' },
    { key: 'client_secret', label: 'Client Secret', placeholder: '********', type: 'password' },
    { key: 'drive_path', label: 'Folder Path', placeholder: '/Documents/NairNelliyatt' },
  ]},
];

const Settings = () => {
  const { user } = useOutletContext();
  const [tab, setTab] = useState('rbac');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // RBAC
  const [rbac, setRbac] = useState({ staff: {}, partner: {} });

  // Storage
  const [storage, setStorage] = useState({ provider: 'default', aws_s3: {}, google_drive: {}, onedrive: {} });

  // Workflows
  const [workflows, setWorkflows] = useState([]);
  const [editWf, setEditWf] = useState(null);
  const [wfForm, setWfForm] = useState({ name: '', service_type: '', steps: [] });
  const [dragIdx, setDragIdx] = useState(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const [rbacRes, storageRes, wfRes] = await Promise.all([
        axios.get(`${API}/settings/rbac`, { withCredentials: true }),
        axios.get(`${API}/settings/storage`, { withCredentials: true }),
        axios.get(`${API}/settings/workflows`, { withCredentials: true }),
      ]);
      setRbac(rbacRes.data.config || { staff: {}, partner: {} });
      setStorage(storageRes.data.config || { provider: 'default', aws_s3: {}, google_drive: {}, onedrive: {} });
      setWorkflows(wfRes.data);
    } catch (err) { console.error(err); }
  };

  const showSave = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2000); };

  // --- RBAC ---
  const toggleRbac = (role, section) => {
    setRbac(prev => ({ ...prev, [role]: { ...prev[role], [section]: !prev[role]?.[section] } }));
  };
  const saveRbac = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/rbac`, { config: rbac }, { withCredentials: true });
      showSave('RBAC settings saved');
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  // --- Storage ---
  const updateStorageField = (provider, field, value) => {
    setStorage(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  };
  const setActiveProvider = (p) => setStorage(prev => ({ ...prev, provider: p }));
  const saveStorage = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/storage`, { config: storage }, { withCredentials: true });
      showSave('Storage configuration saved');
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  // --- Workflows ---
  const openWfEditor = (wf) => {
    if (wf) {
      setEditWf(wf);
      setWfForm({ name: wf.name, service_type: wf.service_type, steps: [...wf.steps] });
    } else {
      setEditWf('new');
      setWfForm({ name: '', service_type: '', steps: [{ name: '', description: '', order: 0 }] });
    }
  };

  const addStep = () => {
    setWfForm(p => ({ ...p, steps: [...p.steps, { name: '', description: '', order: p.steps.length }] }));
  };

  const removeStep = (idx) => {
    setWfForm(p => ({ ...p, steps: p.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })) }));
  };

  const updateStep = (idx, field, value) => {
    setWfForm(p => ({ ...p, steps: p.steps.map((s, i) => i === idx ? { ...s, [field]: value } : s) }));
  };

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => { e.preventDefault(); };
  const handleDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) return;
    setWfForm(p => {
      const steps = [...p.steps];
      const [moved] = steps.splice(dragIdx, 1);
      steps.splice(idx, 0, moved);
      return { ...p, steps: steps.map((s, i) => ({ ...s, order: i })) };
    });
    setDragIdx(null);
  };

  const saveWorkflow = async () => {
    if (!wfForm.name || !wfForm.service_type || wfForm.steps.length === 0) return;
    const cleanSteps = wfForm.steps.filter(s => s.name.trim()).map((s, i) => ({ ...s, order: i }));
    if (cleanSteps.length === 0) return;

    setSaving(true);
    try {
      if (editWf === 'new') {
        await axios.post(`${API}/settings/workflows`, { ...wfForm, steps: cleanSteps }, { withCredentials: true });
      } else {
        await axios.patch(`${API}/settings/workflows/${editWf.workflow_id}`, { name: wfForm.name, steps: cleanSteps }, { withCredentials: true });
      }
      setEditWf(null);
      loadSettings();
      showSave('Workflow saved');
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const deleteWorkflow = async (id) => {
    if (!window.confirm('Delete this workflow?')) return;
    try {
      await axios.delete(`${API}/settings/workflows/${id}`, { withCredentials: true });
      loadSettings();
    } catch (err) { alert('Failed to delete'); }
  };

  if (user?.role !== 'partner') {
    return <div className="fade-in" style={{ padding: 40, textAlign: 'center' }} data-testid="settings-denied"><h2 style={{ fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Access Restricted</h2><p style={{ fontSize: 13, color: 'var(--muted)' }}>Settings are available to Partners only.</p></div>;
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  const tabs = [
    { key: 'rbac', label: 'Access Control', icon: Shield },
    { key: 'storage', label: 'Storage', icon: HardDrive },
    { key: 'workflows', label: 'Workflows', icon: GitBranch },
  ];

  return (
    <div className="fade-in" data-testid="settings-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>Firm Settings</h2>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Manage access, storage integrations & workflows</div>
          </div>
          {saveMsg && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> {saveMsg}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 'var(--rs)',
              border: active ? '1px solid var(--gold)' : '1px solid var(--nn-border)',
              background: active ? 'rgba(201,168,76,0.08)' : 'var(--white)',
              color: active ? 'var(--gold4)' : 'var(--muted)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', transition: 'all 0.15s',
            }} data-testid={`tab-${t.key}`}><Icon size={14} /> {t.label}</button>
          );
        })}
      </div>

      {/* === RBAC TAB === */}
      {tab === 'rbac' && (
        <div className="nn-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div><h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Section Access by Role</h3><p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Toggle which sections each role can access</p></div>
            <button className="tbtn tbtn-gold" onClick={saveRbac} disabled={saving} data-testid="save-rbac"><Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ background: 'var(--off)' }}>
                  <th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Section</th>
                  <th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', letterSpacing: 0.5 }}>Staff Access</th>
                  <th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', letterSpacing: 0.5 }}>Partner Access</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(s => (
                  <tr key={s.key} style={{ borderBottom: '1px solid var(--nn-border)' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{s.desc}</div>
                    </td>
                    {['staff', 'partner'].map(role => (
                      <td key={role} style={{ padding: '12px 20px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleRbac(role, s.key)}
                          style={{
                            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: (rbac[role]?.[s.key] !== false) ? 'var(--green)' : 'var(--nn-border)',
                            position: 'relative', transition: 'background 0.2s',
                          }}
                          data-testid={`rbac-${role}-${s.key}`}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 3,
                            left: (rbac[role]?.[s.key] !== false) ? 23 : 3,
                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === STORAGE TAB === */}
      {tab === 'storage' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Active: <strong style={{ color: 'var(--text)' }}>{storage.provider === 'default' ? 'Emergent Storage (Default)' : STORAGE_PROVIDERS.find(p => p.key === storage.provider)?.label || storage.provider}</strong></div>
            <button className="tbtn tbtn-gold" onClick={saveStorage} disabled={saving} data-testid="save-storage"><Save size={13} /> {saving ? 'Saving...' : 'Save Configuration'}</button>
          </div>

          {/* Default storage card */}
          <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 12, border: storage.provider === 'default' ? '2px solid var(--gold)' : '1px solid var(--nn-border)', cursor: 'pointer' }} onClick={() => setActiveProvider('default')} data-testid="storage-default">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--navy), var(--navy3))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Cloud size={18} color="var(--gold)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Emergent Storage (Default)</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Built-in cloud storage — no configuration required</div>
              </div>
              {storage.provider === 'default' && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'var(--green-bg)', color: 'var(--green)' }}>Active</span>}
            </div>
          </div>

          {/* Provider cards */}
          {STORAGE_PROVIDERS.map(p => {
            const isActive = storage.provider === p.key;
            const config = storage[p.key] || {};
            const hasAnyField = p.fields.some(f => config[f.key]);
            return (
              <div key={p.key} className="nn-card" style={{ overflow: 'hidden', marginBottom: 12, border: isActive ? `2px solid ${p.color}` : '1px solid var(--nn-border)' }} data-testid={`storage-${p.key}`}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setActiveProvider(p.key)}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${p.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{p.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hasAnyField ? 'Configured' : 'Not configured'}</div>
                  </div>
                  {isActive && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'var(--green-bg)', color: 'var(--green)' }}>Active</span>}
                </div>
                {isActive && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--nn-border)', paddingTop: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {p.fields.map(f => (
                        <div key={f.key} style={{ gridColumn: f.multiline ? '1 / -1' : undefined }}>
                          <label style={labelStyle}>{f.label}</label>
                          {f.multiline ? (
                            <textarea rows={3} value={config[f.key] || ''} onChange={(e) => updateStorageField(p.key, f.key, e.target.value)} placeholder={f.placeholder} style={{ ...inputStyle, resize: 'vertical' }} data-testid={`storage-${p.key}-${f.key}`} />
                          ) : (
                            <input type={f.type || 'text'} value={config[f.key] || ''} onChange={(e) => updateStorageField(p.key, f.key, e.target.value)} placeholder={f.placeholder} style={inputStyle} data-testid={`storage-${p.key}-${f.key}`} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 10, fontStyle: 'italic' }}>Actual file sync will be enabled in a future update. Configuration is saved for when integration goes live.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === WORKFLOWS TAB === */}
      {tab === 'workflows' && !editWf && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{workflows.length} workflow{workflows.length !== 1 ? 's' : ''} defined</div>
            <button className="tbtn tbtn-gold" onClick={() => openWfEditor(null)} data-testid="new-workflow-btn"><Plus size={13} /> New Workflow</button>
          </div>
          {workflows.length === 0 ? (
            <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No workflows yet. Create your first one.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {workflows.map(wf => (
                <div key={wf.workflow_id} className="nn-card" style={{ overflow: 'hidden' }} data-testid={`wf-${wf.workflow_id}`}>
                  <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h4 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{wf.name}</h4>
                        {wf.is_preset && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', fontWeight: 600 }}>Preset</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{SERVICE_TYPES.find(t => t.key === wf.service_type)?.label || wf.service_type} &middot; {wf.steps?.length || 0} steps</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openWfEditor(wf)} className="tbtn" style={{ padding: '5px 10px', fontSize: 11, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', border: 'none' }} data-testid={`edit-wf-${wf.workflow_id}`}><Edit2 size={11} /> Edit</button>
                      {!wf.is_preset && <button onClick={() => deleteWorkflow(wf.workflow_id)} className="tbtn" style={{ padding: '5px 10px', fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} data-testid={`delete-wf-${wf.workflow_id}`}><Trash2 size={11} /></button>}
                    </div>
                  </div>
                  {/* Step visualizer */}
                  <div style={{ padding: '0 20px 14px', display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto' }}>
                    {(wf.steps || []).map((step, idx) => (
                      <React.Fragment key={idx}>
                        <div style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--off)', border: '1px solid var(--nn-border)', fontSize: 10, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{step.name}</div>
                        {idx < wf.steps.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--nn-border)', flexShrink: 0 }} />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === WORKFLOW EDITOR === */}
      {tab === 'workflows' && editWf && (
        <div className="nn-card" style={{ overflow: 'hidden' }} data-testid="workflow-editor">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{editWf === 'new' ? 'New Workflow' : `Edit: ${editWf.name}`}</h3>
            <button onClick={() => setEditWf(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Workflow Name *</label>
                <input value={wfForm.name} onChange={(e) => setWfForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Custom Audit Workflow" style={inputStyle} data-testid="wf-name" />
              </div>
              <div>
                <label style={labelStyle}>Service Type *</label>
                <select value={wfForm.service_type} onChange={(e) => setWfForm(p => ({ ...p, service_type: e.target.value }))} style={inputStyle} disabled={editWf !== 'new' && editWf?.is_preset} data-testid="wf-service-type">
                  <option value="">— Select —</option>
                  {SERVICE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <label style={labelStyle}>Steps (drag to reorder)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {wfForm.steps.map((step, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
                    background: dragIdx === idx ? 'rgba(201,168,76,0.06)' : 'var(--off)',
                    border: '1px solid var(--nn-border)', borderRadius: 'var(--rs)',
                    cursor: 'grab', transition: 'background 0.15s',
                  }}
                  data-testid={`wf-step-${idx}`}
                >
                  <GripVertical size={16} color="var(--light)" style={{ marginTop: 4, flexShrink: 0 }} />
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--navy)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{idx + 1}</div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8 }}>
                    <input value={step.name} onChange={(e) => updateStep(idx, 'name', e.target.value)} placeholder="Step name" style={{ ...inputStyle, fontSize: 11 }} data-testid={`step-name-${idx}`} />
                    <input value={step.description || ''} onChange={(e) => updateStep(idx, 'description', e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, fontSize: 11 }} data-testid={`step-desc-${idx}`} />
                  </div>
                  <button onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', color: 'var(--light)', cursor: 'pointer', padding: 4, marginTop: 2 }} data-testid={`remove-step-${idx}`}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            <button onClick={addStep} className="tbtn tbtn-outline" style={{ marginBottom: 16 }} data-testid="add-step-btn"><Plus size={13} /> Add Step</button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--nn-border)', paddingTop: 14 }}>
              <button className="tbtn tbtn-outline" onClick={() => setEditWf(null)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={saveWorkflow} disabled={saving || !wfForm.name || !wfForm.service_type || wfForm.steps.filter(s => s.name.trim()).length === 0} data-testid="save-workflow-btn"><Save size={13} /> {saving ? 'Saving...' : 'Save Workflow'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
