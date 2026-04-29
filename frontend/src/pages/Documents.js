import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Upload, FileText, Trash2, Download, Search, X, CheckCircle, Filter, Eye } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DOC_TYPES = [
  'Trade Licence', 'TRN Certificate', 'Passport / Emirates ID',
  'Memorandum of Association', 'Financial Statements', 'Bank Statements',
  'VAT Return', 'Audit Report', 'Tax Registration Certificate',
  'Power of Attorney', 'Board Resolution', 'Contract / Agreement',
  'Invoice', 'Receipt', 'Other',
];

const formatSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const Documents = () => {
  const { user } = useOutletContext();
  const [documents, setDocuments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ client_id: '', document_type: '', file: null });
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [docRes, clientRes] = await Promise.all([
        axios.get(`${API}/documents`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
      ]);
      setDocuments(docRes.data);
      setClients(clientRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = documents.filter(d => {
    if (filterClient && d.client_id !== filterClient) return false;
    if (filterType && d.document_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.original_filename?.toLowerCase().includes(q) && !d.document_type?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const clientName = (id) => clients.find(c => c.client_id === id)?.name || '—';

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.client_id || !uploadForm.document_type) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadForm.file);
      fd.append('client_id', uploadForm.client_id);
      fd.append('document_type', uploadForm.document_type);
      await axios.post(`${API}/files/upload?client_id=${uploadForm.client_id}&document_type=${encodeURIComponent(uploadForm.document_type)}`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSuccess(`"${uploadForm.file.name}" uploaded`);
      loadData();
      setTimeout(() => { setShowUpload(false); setUploadSuccess(''); setUploadForm({ client_id: '', document_type: '', file: null }); }, 1500);
    } catch (err) { console.error(err); alert('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (fileId, filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    try {
      await axios.delete(`${API}/documents/${fileId}`, { withCredentials: true });
      setDocuments(prev => prev.filter(d => d.file_id !== fileId));
    } catch (err) { console.error(err); }
  };

  const handleDownload = (fileId) => {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('session_token='))?.split('=')[1];
    window.open(`${API}/files/${fileId}?auth=${token || ''}`, '_blank');
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) setUploadForm(p => ({ ...p, file }));
  }, []);

  const fileIcon = (ct) => {
    if (ct?.includes('pdf')) return { bg: 'var(--red-bg)', color: 'var(--red)', label: 'PDF' };
    if (ct?.includes('image')) return { bg: 'var(--blue-bg)', color: 'var(--blue)', label: 'IMG' };
    if (ct?.includes('spreadsheet') || ct?.includes('excel')) return { bg: 'var(--green-bg)', color: 'var(--green)', label: 'XLS' };
    if (ct?.includes('word') || ct?.includes('document')) return { bg: 'var(--blue-bg)', color: 'var(--blue)', label: 'DOC' };
    return { bg: 'var(--off)', color: 'var(--muted)', label: 'FILE' };
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  // Group by client for checklist view
  const groupedByClient = {};
  filtered.forEach(d => {
    const cid = d.client_id || 'unlinked';
    if (!groupedByClient[cid]) groupedByClient[cid] = [];
    groupedByClient[cid].push(d);
  });

  return (
    <div className="fade-in" data-testid="documents-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>Document Checklist</h2>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{documents.length} documents uploaded</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'rgba(255,255,255,0.4)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..." style={{ padding: '7px 10px 7px 30px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontFamily: 'DM Sans', outline: 'none', width: 180 }} data-testid="doc-search" />
            </div>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="doc-filter-client">
              <option value="">All Clients</option>
              {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="doc-filter-type">
              <option value="">All Types</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="tbtn tbtn-gold" onClick={() => { setShowUpload(true); setUploadSuccess(''); }} data-testid="upload-btn"><Upload size={13} /> Upload</button>
          </div>
        </div>
      </div>

      {/* Document Checklist by Client */}
      {loading ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading documents...</div>
      ) : filtered.length === 0 ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center' }}>
          <FileText size={36} color="var(--light)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No documents found</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{documents.length === 0 ? 'Upload your first document to get started.' : 'Try adjusting your filters.'}</div>
        </div>
      ) : (
        Object.entries(groupedByClient).map(([cid, docs]) => (
          <div key={cid} className="nn-card" style={{ overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '10px 16px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'DM Serif Display' }}>{cid === 'unlinked' ? 'Unlinked Documents' : clientName(cid)}</span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="doc-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>Document</th>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>Size</th>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>Uploaded By</th>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</th>
                    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => {
                    const fi = fileIcon(d.content_type);
                    return (
                      <tr key={d.file_id} style={{ borderTop: '1px solid var(--nn-border)' }} data-testid={`doc-row-${d.file_id}`}>
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 6, background: fi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: fi.color, flexShrink: 0 }}>{fi.label}</div>
                            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{d.original_filename}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 14px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(201,168,76,0.08)', color: 'var(--gold4)', fontWeight: 500 }}>{d.document_type || 'Other'}</span></td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--muted)' }}>{formatSize(d.size)}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text)' }}>{d.uploaded_by_name || '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--muted)' }}>{d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => handleDownload(d.file_id)} style={{ background: 'var(--blue-bg)', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }} data-testid={`download-${d.file_id}`}><Download size={10} /> View</button>
                            <button onClick={() => handleDelete(d.file_id, d.original_filename)} style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }} data-testid={`delete-doc-${d.file_id}`}><Trash2 size={10} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)} data-testid="upload-modal">
          <div className="modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Upload Document</h3>
              <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }} data-testid="close-upload-modal"><X size={18} /></button>
            </div>
            {uploadSuccess ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <CheckCircle size={42} color="var(--green)" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{uploadSuccess}</div>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Client *</label>
                    <select value={uploadForm.client_id} onChange={(e) => setUploadForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} data-testid="upload-client">
                      <option value="">— Select client —</option>
                      {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Document Type *</label>
                    <select value={uploadForm.document_type} onChange={(e) => setUploadForm(p => ({ ...p, document_type: e.target.value }))} style={inputStyle} data-testid="upload-doctype">
                      <option value="">— Select type —</option>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>File *</label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      onClick={() => document.getElementById('file-input').click()}
                      style={{
                        border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--nn-border)'}`,
                        borderRadius: 'var(--rs)', padding: '24px 16px', textAlign: 'center',
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: dragOver ? 'rgba(201,168,76,0.04)' : 'var(--off)',
                      }}
                      data-testid="upload-dropzone"
                    >
                      <Upload size={20} color={dragOver ? 'var(--gold)' : 'var(--light)'} style={{ marginBottom: 6 }} />
                      {uploadForm.file ? (
                        <div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{uploadForm.file.name}</div><div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{formatSize(uploadForm.file.size)}</div></div>
                      ) : (
                        <div><div style={{ fontSize: 12, color: 'var(--text)' }}>Drag & drop or click to browse</div><div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>PDF, images, Word, Excel (max 20MB)</div></div>
                      )}
                      <input id="file-input" type="file" style={{ display: 'none' }} onChange={(e) => setUploadForm(p => ({ ...p, file: e.target.files[0] }))} data-testid="file-input" />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="tbtn tbtn-outline" onClick={() => setShowUpload(false)}>Cancel</button>
                  <button className="tbtn tbtn-gold" onClick={handleUpload} disabled={uploading || !uploadForm.file || !uploadForm.client_id || !uploadForm.document_type} style={{ opacity: (!uploadForm.file || !uploadForm.client_id || !uploadForm.document_type) ? 0.5 : 1 }} data-testid="upload-submit">{uploading ? 'Uploading...' : 'Upload Document'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
