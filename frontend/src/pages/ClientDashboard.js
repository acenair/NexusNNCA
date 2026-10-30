import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, CheckCircle, Clock, AlertCircle, Receipt, Loader2, Download, ChevronRight, MessageSquare, Send, Paperclip, X } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ClientDashboard = ({ user, defaultTab }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || 'documents');
  const [docData, setDocData] = useState({ checklist: [], service_type: '', client_name: '' });
  const [workflowData, setWorkflowData] = useState({ engagements: [], partner_name: '' });
  const [invoices, setInvoices] = useState([]);
  const [queries, setQueries] = useState({ queries: [], counts: { open: 0, answered: 0 } });
  const [replyText, setReplyText] = useState({});
  const [replyFile, setReplyFile] = useState({});
  const [replying, setReplying] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [docRes, wfRes, invRes, qryRes] = await Promise.all([
        axios.get(`${API}/client-portal/documents`, { withCredentials: true }),
        axios.get(`${API}/client-portal/workflow`, { withCredentials: true }),
        axios.get(`${API}/client-portal/invoices`, { withCredentials: true }),
        axios.get(`${API}/client-portal/queries`, { withCredentials: true }).catch(() => ({ data: { queries: [], counts: { open: 0, answered: 0 } } })),
      ]);
      setDocData(docRes.data);
      setWorkflowData(wfRes.data);
      setInvoices(invRes.data);
      setQueries(qryRes.data);
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

  const sendReply = async (qid) => {
    const text = (replyText[qid] || '').trim();
    const file = replyFile[qid];
    if (!text && !file) return;
    setReplying(qid);
    const fd = new FormData();
    fd.append('text', text);
    if (file) fd.append('file', file);
    try {
      await axios.post(`${API}/client-portal/queries/${qid}/reply`, fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      setReplyText(p => ({ ...p, [qid]: '' }));
      setReplyFile(p => ({ ...p, [qid]: null }));
      await loadAll();
    } catch (err) { alert(err.response?.data?.detail || 'Reply failed'); }
    finally { setReplying(null); }
  };

  const totalDocs = docData.checklist.length;
  const uploadedDocs = docData.checklist.filter(d => d.uploaded).length;
  const totalInvoices = invoices.length;
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid').length;

  const openQueries = (queries.counts?.open || 0) + (queries.counts?.answered || 0);
  const tabs = [
    { key: 'documents', label: 'Documents', icon: FileText, badge: totalDocs > 0 ? `${uploadedDocs}/${totalDocs}` : null },
    { key: 'workflow', label: 'Workflow Status', icon: Clock, badge: workflowData.engagements.length || null },
    { key: 'queries', label: 'Queries', icon: MessageSquare, badge: openQueries > 0 ? `${openQueries} open` : null },
    { key: 'invoices', label: 'Invoices', icon: Receipt, badge: unpaidInvoices > 0 ? `${unpaidInvoices} unpaid` : null },
  ];

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading your portal...</div>;

  return (
    <div className="fade-in" data-testid="client-dashboard">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'DM Sans', fontSize: 24, color: 'var(--text)' }}>Welcome, {user?.name}</h1>
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
                <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)' }}>Documents Required</h3>
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
                  <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)' }}>{eng.service_type}</h3>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Current phase: {eng.phase || '—'}
                    {(eng.contact_name || workflowData.partner_name) && (
                      <> · Contact: <b style={{ color: 'var(--text)' }}>{eng.contact_name || workflowData.partner_name}</b>{eng.contact_name && workflowData.partner_name && eng.contact_name !== workflowData.partner_name ? ` (partner: ${workflowData.partner_name})` : ''}</>
                    )}
                  </p>
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

      {/* Queries Tab */}
      {activeTab === 'queries' && (
        <div data-testid="client-queries-section">
          <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: 0 }}>Queries from your auditor</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Reply below with a message and attach any files they asked for — the auditor sees your reply instantly.</p>
          </div>
          {queries.queries.length === 0 && (
            <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No queries right now. Anything your auditor needs will appear here.</div>
          )}
          {queries.queries.map(q => {
            const st = q.status === 'Open' ? { bg: '#fdf6ec', fg: '#b45309', label: 'Your reply needed' }
              : q.status === 'Answered' ? { bg: '#eaf3fb', fg: '#0e6db4', label: 'Replied — with your auditor' }
              : { bg: '#f0f7f2', fg: 'var(--green)', label: 'Resolved' };
            return (
              <div key={q.query_id} className="nn-card" style={{ padding: '14px 20px', marginBottom: 12 }} data-testid={`client-query-${q.query_id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{q.question}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
                      {q.service_type ? q.service_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' · ' : ''}{q.asked_by} · {new Date(q.asked_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }} data-testid={`client-query-status-${q.query_id}`}>{st.label}</span>
                </div>
                {(q.replies || []).map(r => (
                  <div key={r.reply_id} style={{ marginTop: 10, marginLeft: 20, padding: '9px 12px', borderRadius: 8, background: r.by_role === 'client' ? '#f0f7f2' : '#eaf3fb', border: `1px solid ${r.by_role === 'client' ? '#cfe5d6' : '#cfe3f4'}` }} data-testid={`client-reply-${r.reply_id}`}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{r.text}</div>
                    {r.filename && (
                      <a href={`${API}/files/${r.file_id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#0e6db4', marginTop: 5, fontWeight: 600 }}>
                        <FileText size={12} /> {r.filename}
                      </a>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{r.by_name} · {new Date(r.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
                {q.status !== 'Closed' && (
                  <div style={{ marginTop: 12, marginLeft: 20 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={replyText[q.query_id] || ''}
                        onChange={e => setReplyText(p => ({ ...p, [q.query_id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && sendReply(q.query_id)}
                        placeholder="Type your reply…"
                        data-testid={`client-reply-input-${q.query_id}`}
                        style={{ flex: 2, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
                      <label data-testid={`client-reply-attach-${q.query_id}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, color: replyFile[q.query_id] ? '#0e6db4' : 'var(--muted)', background: 'var(--white)' }}>
                        {replyFile[q.query_id] ? <X size={13} onClick={(e) => { e.preventDefault(); setReplyFile(p => ({ ...p, [q.query_id]: null })); }} /> : <Paperclip size={13} />}
                        {replyFile[q.query_id]?.name || 'Attach file'}
                        <input type="file" style={{ display: 'none' }} onChange={e => setReplyFile(p => ({ ...p, [q.query_id]: e.target.files[0] || null }))} />
                      </label>
                      <button className="tbtn tbtn-gold" onClick={() => sendReply(q.query_id)} disabled={replying === q.query_id} data-testid={`client-reply-send-${q.query_id}`}>
                        {replying === q.query_id ? <Loader2 size={12} className="spin" /> : <Send size={12} />} Send reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div data-testid="client-invoices-section">
          <div className="nn-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)' }}>Invoice History</h3>
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
