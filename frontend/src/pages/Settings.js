import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Settings as SettingsIcon, Shield, HardDrive, GitBranch, Save, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, X, CheckCircle, Cloud, Edit2, Building, Users, Timer, Download, AlertTriangle, RefreshCw, Link as LinkIcon, Bell } from 'lucide-react';
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
  const [tab, setTab] = useState('firm');
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

  // Firm
  const [firmName, setFirmName] = useState('Nair & Nelliyatt Chartered Accountants');
  const [users, setUsers] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [userForm, setUserForm] = useState({ role: '', title: '', email: '', new_password: '', date_of_joining: '' });

  // Billable Hours
  const [bhEntries, setBhEntries] = useState([]);
  const [bhSummary, setBhSummary] = useState(null);
  const [bhFilter, setBhFilter] = useState({ staff_email: '', client_id: '', date_from: '', date_to: '' });
  const [bhClients, setBhClients] = useState([]);
  const [bhStaffList, setBhStaffList] = useState([]);
  const [showLogHours, setShowLogHours] = useState(false);
  const [bhForm, setBhForm] = useState({ client_id: '', task_id: '', hours: '', date: '', description: '' });
  const [bhView, setBhView] = useState('entries');

  // Clients for linking
  const [clientsForLinking, setClientsForLinking] = useState([]);

  // Reset data
  const [dataStats, setDataStats] = useState(null);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetSelected, setResetSelected] = useState([]);
  const [resetting, setResetting] = useState(false);

  // Reminder config
  const [reminderCfg, setReminderCfg] = useState({ aml_designated_staff: '', audit_client_mapping: {} });
  const [reminderClients, setReminderClients] = useState([]);
  const [reminderStaff, setReminderStaff] = useState([]);

  // Drive
  const [driveStatus, setDriveStatus] = useState(null);

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { if (tab === 'reset') loadDataStats(); }, [tab]);
  useEffect(() => { if (tab === 'storage') loadDriveStatus(); }, [tab]);
  useEffect(() => { if (tab === 'reminders') loadReminderConfig(); }, [tab]);

  const loadReminderConfig = async () => {
    try {
      const [cfgRes, clientsRes, staffRes] = await Promise.all([
        axios.get(`${API}/settings/reminder-config`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`),
      ]);
      setReminderCfg({
        aml_designated_staff: cfgRes.data.aml_designated_staff || '',
        audit_client_mapping: cfgRes.data.audit_client_mapping || {},
      });
      setReminderClients(clientsRes.data);
      setReminderStaff(staffRes.data.filter(u => u.role === 'staff'));
    } catch (err) { console.error(err); }
  };

  const saveReminderConfig = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/reminder-config`, reminderCfg, { withCredentials: true });
      showSave('Reminder config saved');
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const loadDataStats = async () => {
    try {
      const res = await axios.get(`${API}/admin/data-stats`, { withCredentials: true });
      setDataStats(res.data);
    } catch (err) { console.error(err); }
  };

  const loadDriveStatus = async () => {
    try {
      const res = await axios.get(`${API}/drive/status`, { withCredentials: true });
      setDriveStatus(res.data);
    } catch (err) { console.error(err); }
  };

  const handleReset = async () => {
    if (resetConfirm !== 'RESET') return;
    setResetting(true);
    try {
      const res = await axios.post(`${API}/admin/reset-data`, { confirm: 'RESET', collections: resetSelected.length > 0 ? resetSelected : [] }, { withCredentials: true });
      showSave(`Reset complete: ${Object.keys(res.data.deleted).length} collections cleared`);
      setResetConfirm('');
      setResetSelected([]);
      loadDataStats();
    } catch (err) { alert(err.response?.data?.detail || 'Reset failed'); }
    finally { setResetting(false); }
  };

  const loadSettings = async () => {
    try {
      const [rbacRes, storageRes, wfRes, firmRes, usersRes] = await Promise.all([
        axios.get(`${API}/settings/rbac`, { withCredentials: true }),
        axios.get(`${API}/settings/storage`, { withCredentials: true }),
        axios.get(`${API}/settings/workflows`, { withCredentials: true }),
        axios.get(`${API}/settings/firm`, { withCredentials: true }),
        axios.get(`${API}/settings/users`, { withCredentials: true }),
      ]);
      setRbac(rbacRes.data.config || { staff: {}, partner: {} });
      setStorage(storageRes.data.config || { provider: 'default', aws_s3: {}, google_drive: {}, onedrive: {} });
      setWorkflows(wfRes.data);
      setFirmName(firmRes.data.firm_name || 'Nair & Nelliyatt Chartered Accountants');
      setUsers(usersRes.data);
      // Load clients for linking
      try {
        const clientsRes = await axios.get(`${API}/clients`, { withCredentials: true });
        setClientsForLinking(clientsRes.data);
      } catch {}
    } catch (err) { console.error(err); }
  };

  const showSave = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2000); };

  // Load billable hours data
  const loadBillableHours = async () => {
    try {
      const params = new URLSearchParams();
      if (bhFilter.staff_email) params.append('staff_email', bhFilter.staff_email);
      if (bhFilter.client_id) params.append('client_id', bhFilter.client_id);
      if (bhFilter.date_from) params.append('date_from', bhFilter.date_from);
      if (bhFilter.date_to) params.append('date_to', bhFilter.date_to);
      const [entriesRes, summaryRes, clientsRes, staffRes] = await Promise.all([
        axios.get(`${API}/billable-hours?${params}`, { withCredentials: true }),
        axios.get(`${API}/billable-hours/summary?${params}`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`),
      ]);
      setBhEntries(entriesRes.data);
      if (summaryRes.data) setBhSummary(summaryRes.data);
      setBhClients(clientsRes.data);
      setBhStaffList(staffRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if (tab === 'billable') loadBillableHours(); }, [tab, bhFilter]);

  const submitLogHours = async () => {
    if (!bhForm.client_id || !bhForm.hours || !bhForm.date) return;
    setSaving(true);
    try {
      const client = bhClients.find(c => c.client_id === bhForm.client_id);
      await axios.post(`${API}/billable-hours`, {
        client_id: bhForm.client_id,
        client_name: client?.name,
        hours: parseFloat(bhForm.hours),
        date: bhForm.date,
        description: bhForm.description,
      }, { withCredentials: true });
      setShowLogHours(false);
      setBhForm({ client_id: '', task_id: '', hours: '', date: '', description: '' });
      loadBillableHours();
      showSave('Hours logged');
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteBhEntry = async (entryId) => {
    if (!window.confirm('Delete this time entry?')) return;
    try {
      await axios.delete(`${API}/billable-hours/${entryId}`, { withCredentials: true });
      loadBillableHours();
    } catch (err) { alert('Failed to delete'); }
  };

  const downloadBhReport = (staffEmail) => {
    const params = new URLSearchParams();
    if (staffEmail) params.append('staff_email', staffEmail);
    if (bhFilter.date_from) params.append('date_from', bhFilter.date_from);
    if (bhFilter.date_to) params.append('date_to', bhFilter.date_to);
    window.open(`${API}/billable-hours/export?${params}`, '_blank');
  };

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

  // --- Firm ---
  const saveFirmName = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/firm`, { firm_name: firmName }, { withCredentials: true });
      showSave('Firm name updated');
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const openUserEdit = (u) => {
    setEditUser(u);
    setUserForm({ role: u.role, title: u.title || '', email: u.email || '', new_password: '', date_of_joining: u.date_of_joining || '', client_id: u.client_id || '' });
  };

  const saveUser = async () => {
    setSaving(true);
    try {
      const payload = { role: userForm.role, title: userForm.title, date_of_joining: userForm.date_of_joining };
      if (userForm.email && userForm.email !== editUser.email) payload.email = userForm.email;
      if (userForm.new_password) payload.new_password = userForm.new_password;
      if (userForm.role === 'client' && userForm.client_id) payload.client_id = userForm.client_id;
      await axios.patch(`${API}/settings/users/${editUser.user_id}`, payload, { withCredentials: true });
      showSave(`${editUser.name} updated`);
      setEditUser(null);
      loadSettings();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  if (user?.role !== 'partner') {
    return <div className="fade-in" style={{ padding: 40, textAlign: 'center' }} data-testid="settings-denied"><h2 style={{ fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Access Restricted</h2><p style={{ fontSize: 13, color: 'var(--muted)' }}>Settings are available to Partners only.</p></div>;
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  const tabs = [
    { key: 'firm', label: 'Firm & Users', icon: Building },
    { key: 'rbac', label: 'Access Control', icon: Shield },
    { key: 'storage', label: 'Storage', icon: HardDrive },
    { key: 'workflows', label: 'Workflows', icon: GitBranch },
    { key: 'billable', label: 'Billable Hours', icon: Timer },
    { key: 'reminders', label: 'Reminder Routing', icon: Bell },
    { key: 'reset', label: 'Reset Data', icon: AlertTriangle },
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
      <div className="settings-tabs-scroll" style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
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
              flexShrink: 0, whiteSpace: 'nowrap',
            }} data-testid={`tab-${t.key}`}><Icon size={14} /> {t.label}</button>
          );
        })}
      </div>

      {/* === FIRM TAB === */}
      {tab === 'firm' && (
        <div>
          {/* Firm Name */}
          <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Firm Identity</h3><p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Change the parent firm name displayed across the application</p></div>
              <button className="tbtn tbtn-gold" onClick={saveFirmName} disabled={saving} data-testid="save-firm-name"><Save size={13} /> Save</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <label style={labelStyle}>Firm Name</label>
              <input value={firmName} onChange={(e) => setFirmName(e.target.value)} style={{ ...inputStyle, maxWidth: 420 }} data-testid="firm-name-input" />
            </div>
          </div>

          {/* Users Table */}
          <div className="nn-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Team Members</h3><p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{users.length} members &middot; Manage roles, credentials & approvals</p></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--off)' }}>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Name</th>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Email</th>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Role</th>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Status</th>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>Title</th>
                    <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', letterSpacing: 0.5 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const isPending = u.status === 'pending_approval';
                    return (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid var(--nn-border)', background: isPending ? 'rgba(245,158,11,0.03)' : 'transparent' }} data-testid={`user-row-${u.user_id}`}>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{u.name}</td>
                      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{u.email}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: u.role === 'partner' ? 'rgba(201,168,76,0.1)' : 'var(--blue-bg)', color: u.role === 'partner' ? 'var(--gold4)' : 'var(--blue, #3b82f6)' }}>{u.role}</span></td>
                      <td style={{ padding: '10px 16px' }}>
                        {isPending ? (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>Pending Approval</span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--green-bg)', color: 'var(--green)' }}>Active</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text)' }}>{u.title || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {isPending ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={async () => { await axios.patch(`${API}/settings/users/${u.user_id}/approve`, {}, { withCredentials: true }); loadSettings(); showSave('User approved'); }} className="tbtn" style={{ padding: '5px 10px', fontSize: 10, background: 'var(--green-bg)', color: 'var(--green)', border: 'none' }} data-testid={`approve-user-${u.user_id}`}>Approve</button>
                            <button onClick={async () => { if (window.confirm(`Reject and remove ${u.name}?`)) { await axios.patch(`${API}/settings/users/${u.user_id}/reject`, {}, { withCredentials: true }); loadSettings(); showSave('User rejected'); } }} className="tbtn" style={{ padding: '5px 10px', fontSize: 10, background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} data-testid={`reject-user-${u.user_id}`}>Reject</button>
                          </div>
                        ) : (
                          <button onClick={() => openUserEdit(u)} className="tbtn" style={{ padding: '5px 10px', fontSize: 11, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', border: 'none' }} data-testid={`edit-user-${u.user_id}`}><Edit2 size={11} /> Edit</button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit User Modal */}
          {editUser && (
            <div className="modal-overlay" onClick={() => !saving && setEditUser(null)} data-testid="edit-user-modal">
              <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-hdr">
                  <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Edit: {editUser.name}</h3>
                  <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Email Address</label>
                    <input type="email" value={userForm.email} onChange={(e) => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="user@nnadvisory.ae" style={inputStyle} data-testid="user-email-input" />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Role *</label>
                    <select value={userForm.role} onChange={(e) => setUserForm(p => ({ ...p, role: e.target.value }))} style={inputStyle} data-testid="user-role-select">
                      <option value="staff">Staff</option>
                      <option value="partner">Partner</option>
                      <option value="client">Client</option>
                    </select>
                  </div>
                  {userForm.role === 'client' && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Linked Client Record</label>
                      <select value={userForm.client_id || ''} onChange={(e) => setUserForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} data-testid="user-client-select">
                        <option value="">— Select Client —</option>
                        {(clientsForLinking || []).map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Title / Designation</label>
                    <input value={userForm.title} onChange={(e) => setUserForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Senior Associate, Manager..." style={inputStyle} data-testid="user-title-input" />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Date of Joining</label>
                    <input type="date" value={userForm.date_of_joining} onChange={(e) => setUserForm(p => ({ ...p, date_of_joining: e.target.value }))} style={inputStyle} data-testid="user-doj-input" />
                  </div>
                  <div>
                    <label style={labelStyle}>New Password (leave blank to keep current)</label>
                    <input type="password" value={userForm.new_password} onChange={(e) => setUserForm(p => ({ ...p, new_password: e.target.value }))} placeholder="Enter new password..." style={inputStyle} data-testid="user-password-input" />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setEditUser(null)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={saveUser} disabled={saving} data-testid="save-user-btn">{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* === BILLABLE HOURS TAB === */}
      {tab === 'billable' && (
        <div data-testid="billable-hours-tab">
          {/* Filters & Actions */}
          <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={bhFilter.staff_email} onChange={(e) => setBhFilter(p => ({ ...p, staff_email: e.target.value }))} style={{ ...inputStyle, width: 160 }} data-testid="bh-filter-staff">
                <option value="">All Staff</option>
                {bhStaffList.filter(s => s.role === 'staff').map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
              <select value={bhFilter.client_id} onChange={(e) => setBhFilter(p => ({ ...p, client_id: e.target.value }))} style={{ ...inputStyle, width: 160 }} data-testid="bh-filter-client">
                <option value="">All Clients</option>
                {bhClients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
              <input type="date" value={bhFilter.date_from} onChange={(e) => setBhFilter(p => ({ ...p, date_from: e.target.value }))} style={{ ...inputStyle, width: 140 }} data-testid="bh-filter-from" placeholder="From" />
              <input type="date" value={bhFilter.date_to} onChange={(e) => setBhFilter(p => ({ ...p, date_to: e.target.value }))} style={{ ...inputStyle, width: 140 }} data-testid="bh-filter-to" placeholder="To" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="tbtn tbtn-outline" onClick={() => downloadBhReport(bhFilter.staff_email)} data-testid="bh-export-btn"><Download size={13} /> Export CSV</button>
              <button className="tbtn tbtn-gold" onClick={() => setShowLogHours(true)} data-testid="bh-log-hours-btn"><Plus size={13} /> Log Hours</button>
            </div>
          </div>

          {/* Summary Cards */}
          {bhSummary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
              <div className="nn-card" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Hours</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold4)', marginTop: 4 }}>{bhSummary.total_hours.toFixed(1)}</div>
              </div>
              <div className="nn-card" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Entries</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{bhSummary.total_entries}</div>
              </div>
              <div className="nn-card" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Staff</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{bhSummary.by_staff?.length || 0}</div>
              </div>
            </div>
          )}

          {/* View Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ key: 'entries', label: 'Time Entries' }, { key: 'by_staff', label: 'By Staff' }, { key: 'by_client', label: 'By Client' }].map(v => (
              <button key={v.key} onClick={() => setBhView(v.key)} style={{
                padding: '6px 14px', borderRadius: 'var(--rs)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: bhView === v.key ? '1px solid var(--gold)' : '1px solid var(--nn-border)',
                background: bhView === v.key ? 'rgba(212,175,55,0.08)' : 'var(--white)',
                color: bhView === v.key ? 'var(--gold4)' : 'var(--muted)', fontFamily: 'DM Sans',
              }} data-testid={`bh-view-${v.key}`}>{v.label}</button>
            ))}
          </div>

          {/* Time Entries Table */}
          {bhView === 'entries' && (
            <div className="nn-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--off)' }}>
                      {['Date', 'Staff', 'Client', 'Hours', 'Description', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bhEntries.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No billable hours logged yet. Click "Log Hours" to add your first entry.</td></tr>
                    ) : bhEntries.map(e => (
                      <tr key={e.entry_id} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`bh-row-${e.entry_id}`}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text)' }}>{e.date}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{e.staff_name}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>{e.client_name}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--gold4)' }}>{e.hours}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button onClick={() => deleteBhEntry(e.entry_id)} className="tbtn" style={{ padding: '4px 8px', fontSize: 10, background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} data-testid={`bh-delete-${e.entry_id}`}><Trash2 size={10} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Staff View */}
          {bhView === 'by_staff' && bhSummary && (
            <div style={{ display: 'grid', gap: 12 }}>
              {(bhSummary.by_staff || []).map((s, idx) => (
                <div key={idx} className="nn-card" style={{ overflow: 'hidden' }} data-testid={`bh-staff-${s.staff_email}`}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--nn-border)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.staff_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.staff_email}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold4)' }}>{s.total_hours.toFixed(1)}h</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.clients.length} client{s.clients.length !== 1 ? 's' : ''}</div>
                      </div>
                      <button className="tbtn tbtn-outline" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => downloadBhReport(s.staff_email)} data-testid={`bh-export-staff-${s.staff_email}`}><Download size={11} /></button>
                    </div>
                  </div>
                  <div style={{ padding: '8px 18px' }}>
                    {s.clients.map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: ci < s.clients.length - 1 ? '1px solid var(--nn-border)' : 'none' }}>
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>{c.client_name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold4)' }}>{c.hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!bhSummary.by_staff || bhSummary.by_staff.length === 0) && (
                <div className="nn-card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No data. Log some hours first.</div>
              )}
            </div>
          )}

          {/* By Client View */}
          {bhView === 'by_client' && bhSummary && (
            <div style={{ display: 'grid', gap: 12 }}>
              {(bhSummary.by_client || []).map((c, idx) => (
                <div key={idx} className="nn-card" style={{ overflow: 'hidden' }} data-testid={`bh-client-card-${idx}`}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--nn-border)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.client_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.staff.length} staff member{c.staff.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold4)' }}>{c.total_hours.toFixed(1)}h</div>
                  </div>
                  <div style={{ padding: '8px 18px' }}>
                    {c.staff.map((s, si) => (
                      <div key={si} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: si < c.staff.length - 1 ? '1px solid var(--nn-border)' : 'none' }}>
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>{s.staff_name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold4)' }}>{s.hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!bhSummary.by_client || bhSummary.by_client.length === 0) && (
                <div className="nn-card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No data. Log some hours first.</div>
              )}
            </div>
          )}

          {/* Log Hours Modal */}
          {showLogHours && (
            <div className="modal-overlay" onClick={() => !saving && setShowLogHours(false)} data-testid="log-hours-modal">
              <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-hdr">
                  <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Log Billable Hours</h3>
                  <button onClick={() => setShowLogHours(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Client *</label>
                    <select value={bhForm.client_id} onChange={(e) => setBhForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} data-testid="bh-form-client">
                      <option value="">Select client...</option>
                      {bhClients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Hours *</label>
                      <input type="number" step="0.25" min="0.25" value={bhForm.hours} onChange={(e) => setBhForm(p => ({ ...p, hours: e.target.value }))} placeholder="e.g. 2.5" style={inputStyle} data-testid="bh-form-hours" />
                    </div>
                    <div>
                      <label style={labelStyle}>Date *</label>
                      <input type="date" value={bhForm.date} onChange={(e) => setBhForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} data-testid="bh-form-date" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <textarea value={bhForm.description} onChange={(e) => setBhForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="What was worked on..." style={{ ...inputStyle, resize: 'vertical' }} data-testid="bh-form-desc" />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowLogHours(false)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={submitLogHours} disabled={saving || !bhForm.client_id || !bhForm.hours || !bhForm.date} data-testid="bh-form-submit">{saving ? 'Saving...' : 'Log Hours'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === REMINDER ROUTING TAB === */}
      {tab === 'reminders' && (
        <div data-testid="reminder-config-tab">
          <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>AML Service Reminders</h3>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>All AML-related reminders and tasks will be routed to a single designated staff member.</p>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <label style={labelStyle}>Designated AML Staff *</label>
              <select value={reminderCfg.aml_designated_staff} onChange={(e) => setReminderCfg(p => ({ ...p, aml_designated_staff: e.target.value }))} style={{ ...inputStyle, maxWidth: 300 }} data-testid="aml-staff-select">
                <option value="">— Not configured —</option>
                {reminderStaff.map(s => <option key={s.email} value={s.email}>{s.name} ({s.title || 'Staff'})</option>)}
              </select>
            </div>
          </div>

          <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Audit Service Reminders</h3>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Map each client to the staff member responsible for their audit reminders.</p>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {reminderClients.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No clients found.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {reminderClients.map(c => (
                    <div key={c.client_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }} data-testid={`audit-map-${c.client_id}`}>
                      <div style={{ flex: '1 1 140px', minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--text)', wordBreak: 'break-word' }}>{c.name}</div>
                      <select
                        value={reminderCfg.audit_client_mapping[c.client_id] || ''}
                        onChange={(e) => setReminderCfg(p => ({ ...p, audit_client_mapping: { ...p.audit_client_mapping, [c.client_id]: e.target.value } }))}
                        style={{ ...inputStyle, width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 1 200px' }}
                        data-testid={`audit-map-select-${c.client_id}`}
                      >
                        <option value="">— Not assigned —</option>
                        {reminderStaff.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveReminderConfig} disabled={saving} className="tbtn tbtn-gold" data-testid="save-reminder-config"><Save size={13} /> {saving ? 'Saving...' : 'Save Reminder Config'}</button>
          </div>
        </div>
      )}

      {/* === RESET DATA TAB === */}
      {tab === 'reset' && (
        <div data-testid="reset-data-tab">
          <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 14, borderLeft: '3px solid var(--red)' }}>
            <div style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--red)', marginBottom: 4 }}>Danger Zone — Reset Application Data</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>This will permanently delete selected data. User accounts and firm settings will be preserved. This action cannot be undone.</p>
            </div>
          </div>

          {/* Data Stats */}
          {dataStats && (
            <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Current Data</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {Object.entries(dataStats).filter(([k]) => k !== 'users').map(([key, count]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', cursor: 'pointer', background: resetSelected.includes(key) ? 'var(--red-bg)' : 'var(--white)' }}>
                    <input type="checkbox" checked={resetSelected.includes(key)} onChange={(e) => setResetSelected(prev => e.target.checked ? [...prev, key] : prev.filter(k => k !== key))} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{key.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{count} records</div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>Users: {dataStats.users} (preserved, not deletable from here)</div>
            </div>
          )}

          {/* Confirm */}
          <div className="nn-card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Type "RESET" to confirm</label>
                <input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET" style={{ ...inputStyle, borderColor: resetConfirm === 'RESET' ? 'var(--red)' : 'var(--nn-border)' }} data-testid="reset-confirm-input" />
              </div>
              <button onClick={handleReset} disabled={resetConfirm !== 'RESET' || resetting} className="tbtn" style={{ padding: '8px 20px', background: resetConfirm === 'RESET' ? 'var(--red)' : 'var(--off)', color: resetConfirm === 'RESET' ? '#fff' : 'var(--muted)', border: 'none', fontSize: 12, fontWeight: 600, cursor: resetConfirm === 'RESET' ? 'pointer' : 'not-allowed' }} data-testid="reset-btn">
                {resetting ? 'Resetting...' : resetSelected.length > 0 ? `Reset ${resetSelected.length} Selected` : 'Reset All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === STORAGE TAB - DRIVE CONNECT === */}
      {tab === 'storage' && driveStatus && (
        <div className="nn-card" style={{ overflow: 'hidden', marginTop: 14 }} data-testid="drive-integration">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Google Drive Integration</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Connect Google Drive to sync client documents to the cloud.</p>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {driveStatus.connected ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CheckCircle size={16} color="var(--green)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Google Drive Connected</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Connected: {driveStatus.connected_at ? new Date(driveStatus.connected_at).toLocaleDateString() : '—'}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => { try { await axios.post(`${API}/drive/disconnect`, {}, { withCredentials: true }); loadDriveStatus(); showSave('Drive disconnected'); } catch (e) { alert('Failed'); } }} className="tbtn tbtn-outline" style={{ fontSize: 11 }} data-testid="drive-disconnect-btn"><X size={12} /> Disconnect</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>To connect, first add your Google Cloud OAuth credentials above in the Storage Config (Client ID + Client Secret), then click Connect.</p>
                <button onClick={async () => { try { const res = await axios.get(`${API}/drive/connect`, { withCredentials: true }); if (res.data.authorization_url) window.location.href = res.data.authorization_url; } catch (e) { alert(e.response?.data?.detail || 'Failed to connect'); } }} className="tbtn tbtn-gold" style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-testid="drive-connect-btn"><LinkIcon size={13} /> Connect Google Drive</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
