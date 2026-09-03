import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Search, Edit2, X, ChevronDown, ChevronUp, Filter, Clock, ClipboardCheck, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ENTITY_TYPES = ['LLC', 'Group', 'Holding', 'Free Zone', 'Branch', 'Sole Proprietorship'];
const JURISDICTIONS = ['Dubai Mainland', 'Abu Dhabi', 'Sharjah', 'DMCC Free Zone', 'JAFZA Free Zone', 'Ajman Free Zone', 'Dubai Marina', 'DIFC', 'ADGM', 'RAK Free Zone'];
const RISK_RATINGS = ['Low', 'Medium', 'High'];
const STATUSES = ['Active', 'Inactive', 'Onboarding', 'Suspended'];
const ALL_SERVICES = [
  'Statutory Audit', 'Internal Audit', 'Stock Audit', 'Fraud Audit',
  'VAT Registration', 'VAT Filing', 'VAT Amendments',
  'Corporate Registration', 'Corporate Tax', 'Company Formation', 'Liquidation',
  'Valuation', 'Due Diligence', 'AML Review', 'AML Filing', 'AML Report',
];

const ClientMaster = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [auditSummary, setAuditSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [editClient, setEditClient] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/audit/clients-summary`, { withCredentials: true }).catch(() => ({ data: {} })),
      ]);
      setClients(cRes.data);
      setAuditSummary(aRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    let list = [...clients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.trn?.includes(q) || c.jurisdiction?.toLowerCase().includes(q));
    }
    if (filterService) list = list.filter(c => c.active_services?.includes(filterService));
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    list.sort((a, b) => {
      const va = (a[sortKey] || '').toString().toLowerCase();
      const vb = (b[sortKey] || '').toString().toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [clients, search, filterService, filterStatus, sortKey, sortAsc]);

  const openEdit = (client) => {
    setEditForm({ ...client });
    setEditClient(client);
    setSuccessMsg('');
  };

  const toggleService = (svc) => {
    setEditForm(prev => {
      const svcs = prev.active_services || [];
      return { ...prev, active_services: svcs.includes(svc) ? svcs.filter(s => s !== svc) : [...svcs, svc] };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      const fields = ['name', 'entity_type', 'jurisdiction', 'trade_licence_no', 'trn', 'ct_registration_no', 'vat_registration_date', 'tax_period', 'aml_risk_rating', 'pep_flag', 'status', 'active_services'];
      fields.forEach(f => {
        if (JSON.stringify(editForm[f]) !== JSON.stringify(editClient[f])) payload[f] = editForm[f];
      });
      if (Object.keys(payload).length === 0) { setEditClient(null); setSaving(false); return; }
      await axios.patch(`${API}/clients/${editClient.client_id}`, payload, { withCredentials: true });
      setSuccessMsg(`${editForm.name} updated`);
      loadClients();
      setTimeout(() => { setEditClient(null); setSuccessMsg(''); }, 1200);
    } catch (err) { console.error(err); alert(err.response?.data?.detail || 'Update failed'); }
    finally { setSaving(false); }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ col }) => sortKey === col ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null;

  const thStyle = { padding: '10px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '2px solid var(--nn-border)' };
  const tdStyle = { padding: '10px 12px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--nn-border)', verticalAlign: 'top' };
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  if (user?.title !== 'Managing Partner') {
    return <div className="fade-in" style={{ padding: 40, textAlign: 'center' }} data-testid="client-master-denied"><h2 style={{ fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 8 }}>Access Restricted</h2><p style={{ fontSize: 13, color: 'var(--muted)' }}>Client Master is available to the Managing Partner only.</p></div>;
  }

  return (
    <div className="fade-in" data-testid="client-master-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>Client Master</h2>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{clients.length} clients &middot; Managing Partner Access</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'rgba(255,255,255,0.4)' }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, TRN, jurisdiction..."
                style={{ padding: '7px 10px 7px 30px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontFamily: 'DM Sans', outline: 'none', width: 220 }}
                data-testid="client-search"
              />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="client-filter-status">
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterService} onChange={(e) => setFilterService(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="client-filter-service">
              <option value="">All Services</option>
              {ALL_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="nn-card" style={{ overflow: 'hidden' }}>
        <div className="client-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                <th style={thStyle} onClick={() => handleSort('name')} data-testid="sort-name">Client <SortIcon col="name" /></th>
                <th style={thStyle} onClick={() => handleSort('entity_type')}>Type <SortIcon col="entity_type" /></th>
                <th style={thStyle} onClick={() => handleSort('jurisdiction')}>Jurisdiction <SortIcon col="jurisdiction" /></th>
                <th style={thStyle}>TRN</th>
                <th style={thStyle} onClick={() => handleSort('aml_risk_rating')}>AML Risk <SortIcon col="aml_risk_rating" /></th>
                <th style={thStyle}>Services</th>
                <th style={thStyle}>Audit Status</th>
                <th style={thStyle} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No clients match your filters</td></tr>
              ) : filtered.map(c => (
                <tr key={c.client_id} style={{ transition: 'background 0.12s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} data-testid={`client-row-${c.client_id}`}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
                  <td style={tdStyle}>{c.entity_type}</td>
                  <td style={tdStyle}><span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.jurisdiction || '—'}</span></td>
                  <td style={tdStyle}><span style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.trn || '—'}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.aml_risk_rating === 'High' ? 'var(--red-bg)' : c.aml_risk_rating === 'Medium' ? 'var(--amber-bg, rgba(245,158,11,0.1))' : 'var(--green-bg)', color: c.aml_risk_rating === 'High' ? 'var(--red)' : c.aml_risk_rating === 'Medium' ? 'var(--amber, #d97706)' : 'var(--green)' }}>
                      {c.aml_risk_rating || 'Low'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {(c.active_services || []).map(svc => (
                        <span key={svc} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{svc}</span>
                      ))}
                      {(!c.active_services || c.active_services.length === 0) && <span style={{ fontSize: 11, color: 'var(--light)' }}>—</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {auditSummary[c.client_id] ? (
                      <div
                        onClick={() => navigate(`/app/engagements/${auditSummary[c.client_id].engagement_id}`, { state: { defaultTab: 'audit' } })}
                        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3 }}
                        data-testid={`audit-summary-${c.client_id}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ClipboardCheck size={11} color={auditSummary[c.client_id].status === 'completed' ? 'var(--green)' : 'var(--gold4)'} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{auditSummary[c.client_id].period}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: auditSummary[c.client_id].status === 'completed' ? 'var(--green-bg)' : 'rgba(201,168,76,0.12)', color: auditSummary[c.client_id].status === 'completed' ? 'var(--green)' : 'var(--gold4)' }}>
                            {auditSummary[c.client_id].status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="nn-progress" style={{ width: 70, height: 4 }}><div className="nn-progress-bar" style={{ width: `${auditSummary[c.client_id].overall_pct}%`, background: 'var(--gold)' }} /></div>
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>{auditSummary[c.client_id].overall_pct}%</span>
                          {auditSummary[c.client_id].flagged_count > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }} data-testid={`audit-flags-${c.client_id}`}>
                              <AlertTriangle size={10} /> {auditSummary[c.client_id].flagged_count}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--light)' }} data-testid={`audit-summary-${c.client_id}-empty`}>No audit yet</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.status === 'Active' ? 'var(--green-bg)' : 'var(--red-bg)', color: c.status === 'Active' ? 'var(--green)' : 'var(--red)' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => navigate(`/app/clients/${c.client_id}/timeline`)} className="tbtn" style={{ padding: '5px 8px', fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue, #3b82f6)', border: 'none' }} data-testid={`timeline-${c.client_id}`}><Clock size={10} /> Timeline</button>
                      <button onClick={() => openEdit(c)} className="tbtn" style={{ padding: '5px 8px', fontSize: 10, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', border: 'none' }} data-testid={`edit-client-${c.client_id}`}><Edit2 size={10} /> Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--nn-border)', fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Showing {filtered.length} of {clients.length} clients</span>
          {(search || filterService || filterStatus) && <button onClick={() => { setSearch(''); setFilterService(''); setFilterStatus(''); }} style={{ background: 'none', border: 'none', color: 'var(--gold4)', cursor: 'pointer', fontSize: 11, fontFamily: 'DM Sans' }} data-testid="clear-filters">Clear filters</button>}
        </div>
      </div>

      {/* Edit Modal */}
      {editClient && (
        <div className="modal-overlay" onClick={() => !saving && setEditClient(null)} data-testid="edit-client-modal">
          <div className="modal-box" style={{ maxWidth: 600, maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Edit Client</h3>
              <button onClick={() => setEditClient(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }} data-testid="close-edit-modal"><X size={18} /></button>
            </div>
            {successMsg ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>{successMsg}</div>
              </div>
            ) : (
              <>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  <div style={{ marginBottom: 12 }}><label style={labelStyle}>Client Name</label><input value={editForm.name || ''} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} data-testid="edit-name" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div><label style={labelStyle}>Entity Type</label><select value={editForm.entity_type || ''} onChange={(e) => setEditForm(p => ({ ...p, entity_type: e.target.value }))} style={inputStyle} data-testid="edit-entity-type">{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label style={labelStyle}>Jurisdiction</label><select value={editForm.jurisdiction || ''} onChange={(e) => setEditForm(p => ({ ...p, jurisdiction: e.target.value }))} style={inputStyle} data-testid="edit-jurisdiction"><option value="">—</option>{JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}</select></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div><label style={labelStyle}>TRN</label><input value={editForm.trn || ''} onChange={(e) => setEditForm(p => ({ ...p, trn: e.target.value }))} style={inputStyle} data-testid="edit-trn" /></div>
                    <div><label style={labelStyle}>Trade Licence No.</label><input value={editForm.trade_licence_no || ''} onChange={(e) => setEditForm(p => ({ ...p, trade_licence_no: e.target.value }))} style={inputStyle} data-testid="edit-licence" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div><label style={labelStyle}>CT Registration No.</label><input value={editForm.ct_registration_no || ''} onChange={(e) => setEditForm(p => ({ ...p, ct_registration_no: e.target.value }))} style={inputStyle} data-testid="edit-ct-reg" /></div>
                    <div><label style={labelStyle}>Tax Period</label><input value={editForm.tax_period || ''} onChange={(e) => setEditForm(p => ({ ...p, tax_period: e.target.value }))} placeholder="e.g. Q1 2026" style={inputStyle} data-testid="edit-tax-period" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div><label style={labelStyle}>AML Risk</label><select value={editForm.aml_risk_rating || 'Low'} onChange={(e) => setEditForm(p => ({ ...p, aml_risk_rating: e.target.value }))} style={inputStyle} data-testid="edit-aml-risk">{RISK_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div><label style={labelStyle}>Status</label><select value={editForm.status || 'Active'} onChange={(e) => setEditForm(p => ({ ...p, status: e.target.value }))} style={inputStyle} data-testid="edit-status">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                        <input type="checkbox" checked={editForm.pep_flag || false} onChange={(e) => setEditForm(p => ({ ...p, pep_flag: e.target.checked }))} data-testid="edit-pep" />
                        PEP Flag
                      </label>
                    </div>
                  </div>

                  {/* Services */}
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Active Services</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {ALL_SERVICES.map(svc => {
                        const active = (editForm.active_services || []).includes(svc);
                        return (
                          <button
                            key={svc}
                            type="button"
                            onClick={() => toggleService(svc)}
                            style={{
                              padding: '4px 10px', borderRadius: 14, fontSize: 10, fontWeight: 500,
                              border: active ? '1px solid var(--gold)' : '1px solid var(--nn-border)',
                              background: active ? 'rgba(201,168,76,0.1)' : 'var(--white)',
                              color: active ? 'var(--gold4)' : 'var(--muted)',
                              cursor: 'pointer', fontFamily: 'DM Sans', transition: 'all 0.12s',
                            }}
                            data-testid={`svc-toggle-${svc.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {svc}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setEditClient(null)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={handleSave} disabled={saving} data-testid="save-client-btn">{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .client-table-wrap { font-size: 11px; }
        }
      `}</style>
    </div>
  );
};

export default ClientMaster;
