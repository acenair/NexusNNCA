import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FileText, Plus, X, Edit2, Trash2, Send, Copy, ChevronDown, ChevronUp, Search } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_COLORS = { Draft: 'var(--muted)', Sent: 'var(--blue)', Accepted: 'var(--green)', Declined: 'var(--red)' };

const Proposals = () => {
  const { user } = useOutletContext();
  const [proposals, setProposals] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editProposal, setEditProposal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const emptyForm = { client_id: '', template_id: '', title: '', scope_of_work: '', fee_structure: '', terms: '', total_fee: '', status: 'Draft' };
  const [form, setForm] = useState(emptyForm);
  const [tplForm, setTplForm] = useState({ name: '', scope_of_work: '', fee_structure: '', terms: '', service_type: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [pRes, tRes, cRes] = await Promise.all([
        axios.get(`${API}/proposals`, { withCredentials: true }),
        axios.get(`${API}/proposal-templates`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
      ]);
      setProposals(pRes.data);
      setTemplates(tRes.data);
      setClients(cRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openNew = (tpl = null) => {
    setEditProposal(null);
    if (tpl) {
      setForm({ ...emptyForm, template_id: tpl.template_id, scope_of_work: tpl.scope_of_work, fee_structure: tpl.fee_structure, terms: tpl.terms, title: tpl.name });
    } else {
      setForm(emptyForm);
    }
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditProposal(p);
    setForm({ client_id: p.client_id, template_id: p.template_id || '', title: p.title, scope_of_work: p.scope_of_work || '', fee_structure: p.fee_structure || '', terms: p.terms || '', total_fee: p.total_fee ? String(p.total_fee) : '', status: p.status });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.client_id || !form.title) return alert('Client and title are required');
    setSaving(true);
    try {
      const client = clients.find(c => c.client_id === form.client_id);
      if (editProposal) {
        const params = new URLSearchParams();
        if (form.status) params.set('status', form.status);
        if (form.title) params.set('title', form.title);
        params.set('scope_of_work', form.scope_of_work);
        params.set('fee_structure', form.fee_structure);
        params.set('terms', form.terms);
        if (form.total_fee) params.set('total_fee', form.total_fee);
        await axios.patch(`${API}/proposals/${editProposal.proposal_id}?${params.toString()}`, {}, { withCredentials: true });
      } else {
        await axios.post(`${API}/proposals`, { ...form, client_name: client?.name, total_fee: form.total_fee ? parseFloat(form.total_fee) : null }, { withCredentials: true });
      }
      setShowModal(false);
      loadData();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this proposal?')) return;
    try { await axios.delete(`${API}/proposals/${id}`, { withCredentials: true }); loadData(); }
    catch (err) { alert('Failed to delete'); }
  };

  const handleSaveTemplate = async () => {
    if (!tplForm.name) return alert('Template name is required');
    setSaving(true);
    try {
      await axios.post(`${API}/proposal-templates`, tplForm, { withCredentials: true });
      setShowTemplateModal(false);
      setTplForm({ name: '', scope_of_work: '', fee_structure: '', terms: '', service_type: '' });
      loadData();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try { await axios.delete(`${API}/proposal-templates/${id}`, { withCredentials: true }); loadData(); }
    catch (err) { alert('Failed'); }
  };

  const updateStatus = async (p, newStatus) => {
    try {
      await axios.patch(`${API}/proposals/${p.proposal_id}?status=${newStatus}`, {}, { withCredentials: true });
      loadData();
    } catch (err) { alert('Failed'); }
  };

  const filtered = proposals.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.client_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const cardStyle = { background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 'var(--rl)', padding: 0 };
  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
  const textareaStyle = { ...inputStyle, minHeight: 80, resize: 'vertical' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading proposals...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }} data-testid="proposals-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>Proposals</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Create and track client proposals</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tbtn tbtn-outline" onClick={() => setShowTemplateModal(true)} style={{ fontSize: 11, padding: '7px 14px' }} data-testid="new-template-btn"><Plus size={13} /> Template</button>
          <button className="tbtn tbtn-gold" onClick={() => openNew()} style={{ fontSize: 11, padding: '7px 14px' }} data-testid="new-proposal-btn"><Plus size={13} /> New Proposal</button>
        </div>
      </div>

      {/* Templates Strip */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 8 }}>Quick Start from Template</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {templates.map(t => (
              <div key={t.template_id} style={{ background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => openNew(t)} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} data-testid={`use-tpl-${t.template_id}`}>{t.name}</button>
                <button onClick={() => handleDeleteTemplate(t.template_id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search proposals..." style={{ ...inputStyle, paddingLeft: 30 }} data-testid="proposal-search" />
        </div>
        {['', 'Draft', 'Sent', 'Accepted', 'Declined'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`tbtn ${filterStatus === s ? 'tbtn-gold' : 'tbtn-outline'}`} style={{ fontSize: 10, padding: '5px 12px' }}>{s || 'All'}</button>
        ))}
      </div>

      {/* Proposals List */}
      <div style={cardStyle}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No proposals found. Create one to get started.</div>
        ) : (
          filtered.map(p => {
            const isExpanded = expandedId === p.proposal_id;
            return (
              <div key={p.proposal_id} style={{ borderBottom: '1px solid var(--nn-border)' }}>
                <div onClick={() => setExpandedId(isExpanded ? null : p.proposal_id)} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} data-testid={`proposal-row-${p.proposal_id}`}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{p.client_name} &middot; {p.created_at?.split('T')[0]} &middot; by {p.created_by_name || 'Partner'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {p.total_fee && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>AED {p.total_fee.toLocaleString()}</div>}
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${STATUS_COLORS[p.status] || 'var(--muted)'}15`, color: STATUS_COLORS[p.status] || 'var(--muted)' }}>{p.status}</span>
                    {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 20px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Scope of Work</div>
                        <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', background: 'var(--nn-bg)', padding: 10, borderRadius: 6, minHeight: 60 }}>{p.scope_of_work || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Fee Structure</div>
                        <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', background: 'var(--nn-bg)', padding: 10, borderRadius: 6, minHeight: 60 }}>{p.fee_structure || '—'}</div>
                      </div>
                    </div>
                    {p.terms && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Terms & Conditions</div>
                        <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', background: 'var(--nn-bg)', padding: 10, borderRadius: 6 }}>{p.terms}</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="tbtn tbtn-outline" onClick={() => openEdit(p)} style={{ fontSize: 10, padding: '4px 10px' }} data-testid={`edit-proposal-${p.proposal_id}`}><Edit2 size={11} /> Edit</button>
                      {p.status === 'Draft' && <button className="tbtn tbtn-gold" onClick={() => updateStatus(p, 'Sent')} style={{ fontSize: 10, padding: '4px 10px' }}><Send size={11} /> Mark Sent</button>}
                      {p.status === 'Sent' && (
                        <>
                          <button className="tbtn" onClick={() => updateStatus(p, 'Accepted')} style={{ fontSize: 10, padding: '4px 10px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6 }}>Accepted</button>
                          <button className="tbtn" onClick={() => updateStatus(p, 'Declined')} style={{ fontSize: 10, padding: '4px 10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6 }}>Declined</button>
                        </>
                      )}
                      <button className="tbtn tbtn-outline" onClick={() => handleDelete(p.proposal_id)} style={{ fontSize: 10, padding: '4px 10px', color: 'var(--red)' }}><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Proposal Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>{editProposal ? 'Edit Proposal' : 'New Proposal'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Client *</label>
                  <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} data-testid="proposal-client-select">
                    <option value="">— Select Client —</option>
                    {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                    {['Draft', 'Sent', 'Accepted', 'Declined'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Proposal Title *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Annual Audit Engagement 2026" style={inputStyle} data-testid="proposal-title-input" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Total Fee (AED)</label>
                <input type="number" value={form.total_fee} onChange={e => setForm(p => ({ ...p, total_fee: e.target.value }))} placeholder="0.00" style={inputStyle} data-testid="proposal-fee-input" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Scope of Work</label>
                <textarea value={form.scope_of_work} onChange={e => setForm(p => ({ ...p, scope_of_work: e.target.value }))} placeholder="Describe the services to be provided..." style={textareaStyle} data-testid="proposal-scope-input" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Fee Structure</label>
                <textarea value={form.fee_structure} onChange={e => setForm(p => ({ ...p, fee_structure: e.target.value }))} placeholder="Breakdown of fees and payment schedule..." style={textareaStyle} data-testid="proposal-fee-structure-input" />
              </div>
              <div>
                <label style={labelStyle}>Terms & Conditions</label>
                <textarea value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} placeholder="Terms of engagement, liability, confidentiality..." style={textareaStyle} data-testid="proposal-terms-input" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={handleSave} disabled={saving} data-testid="save-proposal-btn">{saving ? 'Saving...' : editProposal ? 'Save Changes' : 'Create Proposal'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowTemplateModal(false)}>
          <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>New Proposal Template</h3>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Template Name *</label>
                <input value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Standard Audit Proposal" style={inputStyle} data-testid="tpl-name-input" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Service Type</label>
                <input value={tplForm.service_type} onChange={e => setTplForm(p => ({ ...p, service_type: e.target.value }))} placeholder="e.g. Audit, VAT, Corporate" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Scope of Work</label>
                <textarea value={tplForm.scope_of_work} onChange={e => setTplForm(p => ({ ...p, scope_of_work: e.target.value }))} placeholder="Default scope..." style={textareaStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Fee Structure</label>
                <textarea value={tplForm.fee_structure} onChange={e => setTplForm(p => ({ ...p, fee_structure: e.target.value }))} placeholder="Default fee structure..." style={textareaStyle} />
              </div>
              <div>
                <label style={labelStyle}>Terms & Conditions</label>
                <textarea value={tplForm.terms} onChange={e => setTplForm(p => ({ ...p, terms: e.target.value }))} placeholder="Default terms..." style={textareaStyle} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowTemplateModal(false)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={handleSaveTemplate} disabled={saving} data-testid="save-template-btn">{saving ? 'Saving...' : 'Save Template'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proposals;
