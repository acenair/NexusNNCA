import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, CheckCircle, Clock, AlertCircle, Receipt, Loader2, Download, ChevronRight } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ClientDashboard = ({ user, defaultTab }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || 'documents');
  const [docData, setDocData] = useState({ checklist: [], service_type: '', client_name: '' });
  const [workflowData, setWorkflowData] = useState({ engagements: [] });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [docRes, wfRes, invRes] = await Promise.all([
        axios.get(`${API}/client-portal/documents`, { withCredentials: true }),
        axios.get(`${API}/client-portal/workflow`, { withCredentials: true }),
        axios.get(`${API}/client-portal/invoices`, { withCredentials: true }),
      ]);
      setDocData(docRes.data);
      setWorkflowData(wfRes.data);
      setInvoices(invRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleUpload = async (itemId, file) => {
    setUploading(itemId);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API}/client-portal/documents/${itemId}/upload`, formData, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      loadAll();
    } catch (err) { alert('Upload failed'); }
    finally { setUploading(null); }
  };

  const totalDocs = docData.checklist.length;
  const uploadedDocs = docData.checklist.filter(d => d.uploaded).length;
  const totalInvoices = invoices.length;
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid').length;

  const tabs = [
    { key: 'documents', label: 'Documents', icon: FileText, badge: totalDocs > 0 ? `${uploadedDocs}/${totalDocs}` : null },
    { key: 'workflow', label: 'Workflow Status', icon: Clock, badge: workflowData.engagements.length || null },
    { key: 'invoices', label: 'Invoices', icon: Receipt, badge: unpaidInvoices > 0 ? `${unpaidInvoices} unpaid` : null },
  ];

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading your portal...</div>;

  return (
    <div className="fade-in" data-testid="client-dashboard">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 24, color: 'var(--text)' }}>Welcome, {user?.name}</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{docData.client_name ? `Client Portal — ${docData.client_name}` : 'Client Portal'}</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="nn-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Documents</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: uploadedDocs === totalDocs && totalDocs > 0 ? 'var(--green)' : 'var(--gold4)', marginTop: 4 }}>{uploadedDocs}/{totalDocs}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{totalDocs - uploadedDocs} pending</div>
        </div>
        <div className="nn-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Services</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{workflowData.engagements.length}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>engagements</div>
        </div>
        <div className="nn-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Invoices</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: unpaidInvoices > 0 ? 'var(--red)' : 'var(--green)', marginTop: 4 }}>{unpaidInvoices > 0 ? `${unpaidInvoices} unpaid` : 'All paid'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{totalInvoices} total</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--nn-border)', paddingBottom: 2 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 12, fontWeight: 600,
              border: 'none', borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              background: 'transparent', color: isActive ? 'var(--gold4)' : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'DM Sans', transition: 'all 0.15s',
            }} data-testid={`client-tab-${t.key}`}>
              <Icon size={14} /> {t.label}
              {t.badge && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isActive ? 'rgba(212,175,55,0.1)' : 'var(--off)', color: isActive ? 'var(--gold4)' : 'var(--muted)', fontWeight: 700 }}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div data-testid="client-documents-section">
          <div className="nn-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Documents Required</h3>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Service: {(docData.service_type || '').replace('_', ' ').toUpperCase()}</p>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: uploadedDocs === totalDocs && totalDocs > 0 ? 'var(--green)' : 'var(--gold4)' }}>
                {uploadedDocs}/{totalDocs} uploaded
              </div>
            </div>
            <div>
              {docData.checklist.map((item, idx) => (
                <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: idx < totalDocs - 1 ? '1px solid var(--nn-border)' : 'none' }} data-testid={`doc-item-${item.item_id}`}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: item.uploaded ? 'var(--green-bg)' : item.required ? 'var(--red-bg)' : 'var(--off)' }}>
                    {item.uploaded ? <CheckCircle size={14} color="var(--green)" /> : item.required ? <AlertCircle size={14} color="var(--red)" /> : <FileText size={14} color="var(--muted)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.label}</div>
                    {item.uploaded ? (
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>{item.filename} — uploaded {item.uploaded_at ? new Date(item.uploaded_at).toLocaleDateString() : ''}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: item.required ? 'var(--red)' : 'var(--muted)', marginTop: 2 }}>{item.required ? 'Required' : 'Optional'}</div>
                    )}
                  </div>
                  {!item.uploaded ? (
                    <label style={{ cursor: 'pointer' }}>
                      <input type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && handleUpload(item.item_id, e.target.files[0])} />
                      <div className="tbtn tbtn-gold" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 11 }}>
                        {uploading === item.item_id ? <Loader2 size={12} className="spin" /> : <Upload size={12} />} Upload
                      </div>
                    </label>
                  ) : (
                    <a href={`${API}/files/${item.file_id}`} target="_blank" rel="noopener noreferrer" className="tbtn tbtn-outline" style={{ padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> View</a>
                  )}
                </div>
              ))}
              {totalDocs === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No document checklist assigned yet. Your firm will set this up shortly.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Tab */}
      {activeTab === 'workflow' && (
        <div data-testid="client-workflow-section">
          {workflowData.engagements.length === 0 ? (
            <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active engagements. Your firm will update this as work progresses.</div>
          ) : workflowData.engagements.map(eng => (
            <div key={eng.engagement_id} className="nn-card" style={{ overflow: 'hidden', marginBottom: 14 }} data-testid={`workflow-eng-${eng.engagement_id}`}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{eng.service_type}</h3>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Current phase: {eng.phase || '—'}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: eng.status === 'Active' ? 'rgba(34,197,94,0.08)' : 'var(--off)', color: eng.status === 'Active' ? 'var(--green)' : 'var(--muted)' }}>{eng.status}</span>
              </div>
              <div style={{ padding: '10px 20px' }}>
                {eng.stages.map((stage, si) => (
                  <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: si < eng.stages.length - 1 ? '1px solid var(--nn-border)' : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: stage.status === 'Completed' ? 'var(--green-bg)' : stage.status === 'In Progress' ? 'rgba(212,175,55,0.1)' : 'var(--off)' }}>
                      {stage.status === 'Completed' ? <CheckCircle size={12} color="var(--green)" /> : stage.status === 'In Progress' ? <Clock size={12} color="var(--gold4)" /> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{stage.name}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: stage.status === 'Completed' ? 'var(--green-bg)' : stage.status === 'In Progress' ? 'rgba(212,175,55,0.08)' : 'var(--off)', color: stage.status === 'Completed' ? 'var(--green)' : stage.status === 'In Progress' ? 'var(--gold4)' : 'var(--muted)' }}>{stage.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div data-testid="client-invoices-section">
          <div className="nn-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Invoice History</h3>
            </div>
            {invoices.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No invoices yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--off)' }}>
                      {['Service', 'Date', 'Amount', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.invoice_id} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`invoice-${inv.invoice_id}`}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{inv.service_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>{inv.date}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>AED {inv.amount?.toLocaleString()}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: inv.status === 'Paid' ? 'var(--green-bg)' : 'var(--red-bg)', color: inv.status === 'Paid' ? 'var(--green)' : 'var(--red)' }}>{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
