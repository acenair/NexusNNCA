import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle, Clock, AlertTriangle, Filter, ChevronDown, Upload, X, FileSpreadsheet, Loader2, Download } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUSES = ['All', 'Pending', 'In Progress', 'Completed', 'Overdue'];
const PRIORITIES = ['All', 'High', 'Medium', 'Low'];

const MyTasks = () => {
  const { user } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterStaff, setFilterStaff] = useState('');
  const [staffList, setStaffList] = useState([]);

  // Bulk upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStep, setUploadStep] = useState('select'); // select, preview, importing, done
  const [uploadFile, setUploadFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const isPartner = user?.role === 'partner';

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try {
      const res = await axios.get(`${API}/tasks`, { withCredentials: true });
      setTasks(res.data);
      if (isPartner) {
        const staffRes = await axios.get(`${API}/auth/users-list`);
        setStaffList(staffRes.data.filter(u => u.role === 'staff'));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Bulk Upload Functions
  const openUploadModal = () => {
    setShowUpload(true);
    setUploadStep('select');
    setUploadFile(null);
    setPreview(null);
    setUploadResult(null);
    setUploadError('');
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/tasks/bulk-preview`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);
      setUploadStep('preview');
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadStep('importing');
    setUploadError('');

    const formData = new FormData();
    formData.append('file', uploadFile);
    try {
      const res = await axios.post(`${API}/tasks/bulk-upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(res.data);
      setUploadStep('done');
      loadTasks(); // Refresh task list
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Import failed');
      setUploadStep('preview');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = 'Title,Description,Service Module,Client,Assigned To,Due Date,Priority,Status\n';
    const sample = 'Prepare VAT Return Q1,Review and file VAT return,VAT Filing,Al Baraka Trading LLC,Fazil,2026-06-30,High,Pending\n';
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'task_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    let list = [...tasks];
    // Staff see only their tasks
    if (!isPartner) {
      list = list.filter(t => t.assigned_to === user?.email);
    } else if (filterStaff) {
      list = list.filter(t => t.assigned_to === filterStaff);
    }
    if (filterStatus !== 'All') {
      list = list.filter(t => t.status === filterStatus);
    }
    if (filterPriority !== 'All') {
      list = list.filter(t => t.priority === filterPriority);
    }
    // Sort: Overdue first, then by due_date
    list.sort((a, b) => {
      const sa = a.status === 'Completed' ? 2 : 0;
      const sb = b.status === 'Completed' ? 2 : 0;
      if (sa !== sb) return sa - sb;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });
    return list;
  }, [tasks, filterStatus, filterPriority, filterStaff, isPartner, user]);

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await axios.patch(`${API}/tasks/${task.task_id}`, { status: newStatus }, { withCredentials: true });
      setTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, status: newStatus } : t));
    } catch (e) { console.error(e); }
  };

  const statusBadge = (status) => {
    const map = {
      'Completed': { bg: 'var(--green-bg)', color: 'var(--green)', icon: CheckCircle },
      'In Progress': { bg: 'var(--blue-bg)', color: 'var(--blue, #3b82f6)', icon: Clock },
      'Overdue': { bg: 'var(--red-bg)', color: 'var(--red)', icon: AlertTriangle },
      'Pending': { bg: 'var(--off)', color: 'var(--muted)', icon: Clock },
    };
    const s = map[status] || map['Pending'];
    const Icon = s.icon;
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: s.bg, color: s.color }}><Icon size={10} /> {status}</span>;
  };

  const priorityDot = (p) => {
    const colors = { High: 'var(--red)', Medium: 'var(--gold)', Low: 'var(--green)' };
    return <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[p] || 'var(--muted)', display: 'inline-block' }} />;
  };

  const isOverdue = (task) => {
    if (task.status === 'Completed' || !task.due_date) return false;
    try {
      return new Date(task.due_date) < new Date();
    } catch { return false; }
  };

  const stats = useMemo(() => {
    const myTasks = isPartner ? tasks : tasks.filter(t => t.assigned_to === user?.email);
    return {
      total: myTasks.length,
      completed: myTasks.filter(t => t.status === 'Completed').length,
      overdue: myTasks.filter(t => isOverdue(t)).length,
      inProgress: myTasks.filter(t => t.status === 'In Progress').length,
    };
  }, [tasks, isPartner, user]);

  // Group tasks by staff for partner view
  const groupedByStaff = useMemo(() => {
    if (!isPartner || filterStaff) return null;
    const groups = {};
    filtered.forEach(t => {
      const key = t.assigned_to_name || t.assigned_to || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered, isPartner, filterStaff]);

  return (
    <div className="fade-in" data-testid="my-tasks-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>{isPartner ? 'All Tasks' : 'My Tasks'}</h2>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{isPartner ? 'View and manage tasks across all team members' : 'Your assigned tasks and deadlines'}</div>
            </div>
            {isPartner && (
              <button onClick={openUploadModal} className="tbtn" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12 }} data-testid="bulk-upload-btn">
                <Upload size={14} /> Bulk Upload
              </button>
            )}
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { label: 'Total', value: stats.total, color: 'var(--gold)' },
                { label: 'Done', value: stats.completed, color: 'var(--green)' },
                { label: 'Overdue', value: stats.overdue, color: 'var(--red)' },
                { label: 'Active', value: stats.inProgress, color: 'var(--blue, #3b82f6)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'DM Serif Display' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-status">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-priority">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {isPartner && (
              <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-staff">
                <option value="">All Staff</option>
                {staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center' }}>
          <CheckCircle size={36} color="var(--green)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{filterStatus !== 'All' || filterPriority !== 'All' || filterStaff ? 'No tasks match filters' : 'All clear!'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>No pending tasks to show.</div>
        </div>
      ) : isPartner && groupedByStaff ? (
        // Partner view: grouped by staff
        Object.entries(groupedByStaff).map(([staffName, staffTasks]) => (
          <div key={staffName} className="nn-card" style={{ overflow: 'hidden', marginBottom: 12 }} data-testid={`staff-group-${staffName}`}>
            <div style={{ padding: '10px 16px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: 10, fontWeight: 700 }}>{staffName.charAt(0)}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{staffName}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>{staffTasks.filter(t => t.status === 'Completed').length} done</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{staffTasks.length} total</span>
              </div>
            </div>
            {staffTasks.map(task => (
              <TaskRow key={task.task_id} task={task} isOverdue={isOverdue(task)} onToggle={toggleStatus} statusBadge={statusBadge} priorityDot={priorityDot} showClient />
            ))}
          </div>
        ))
      ) : (
        // Staff view or filtered partner view: flat list
        <div className="nn-card" style={{ overflow: 'hidden' }}>
          {filtered.map(task => (
            <TaskRow key={task.task_id} task={task} isOverdue={isOverdue(task)} onToggle={toggleStatus} statusBadge={statusBadge} priorityDot={priorityDot} showClient showAssignee={isPartner} />
          ))}
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)} data-testid="bulk-upload-modal">
          <div className="modal-box" style={{ maxWidth: 600, maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Bulk Task Upload</h3>
              <button onClick={() => !uploading && setShowUpload(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }} data-testid="close-upload-modal"><X size={18} /></button>
            </div>

            {/* Step: Select File */}
            {uploadStep === 'select' && (
              <div className="modal-body" style={{ textAlign: 'center', padding: '30px 24px' }}>
                <FileSpreadsheet size={40} style={{ color: 'var(--gold)', marginBottom: 12 }} />
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Upload Task List</h4>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
                  Upload a CSV or Excel file with your tasks. The system will automatically map columns to task fields.
                </p>

                <input type="file" ref={fileInputRef} accept=".csv,.xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} data-testid="file-input" />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => fileInputRef.current?.click()} className="tbtn tbtn-gold" disabled={uploading} data-testid="select-file-btn">
                    {uploading ? <><Loader2 size={14} className="spin" /> Parsing...</> : <><Upload size={14} /> Choose File</>}
                  </button>
                  <button onClick={downloadTemplate} className="tbtn tbtn-outline" data-testid="download-template-btn">
                    <Download size={14} /> Download Template
                  </button>
                </div>

                {uploadError && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--rs)', color: 'var(--red)', fontSize: 12 }} data-testid="upload-error">{uploadError}</div>}

                <div style={{ marginTop: 20, textAlign: 'left', padding: '12px 16px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 6 }}>Supported Headers</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                    <strong>Title</strong> (required) — Task Title, Task Name, Subject<br />
                    <strong>Due Date</strong> — Deadline, Due, Target Date<br />
                    <strong>Priority</strong> — High / Medium / Low<br />
                    <strong>Assigned To</strong> — Staff name (auto-matched)<br />
                    <strong>Client</strong> — Client name (auto-matched)<br />
                    <strong>Service Module</strong> — Category, Department<br />
                    <strong>Description</strong> — Details, Notes<br />
                    <strong>Status</strong> — Pending / In Progress / Completed
                  </div>
                </div>
              </div>
            )}

            {/* Step: Preview */}
            {uploadStep === 'preview' && preview && (
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{preview.filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{preview.total_rows} row{preview.total_rows !== 1 ? 's' : ''} found</div>
                    </div>
                    <button onClick={() => { setUploadStep('select'); setUploadFile(null); setPreview(null); }} className="tbtn tbtn-outline" style={{ fontSize: 10, padding: '4px 10px' }}>Change File</button>
                  </div>

                  {/* Column Mapping */}
                  <div style={{ padding: '10px 14px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 6 }}>Column Mapping</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(preview.mapped_columns).map(([header, field]) => (
                        <span key={header} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.08)', color: 'var(--green)', fontWeight: 500 }} data-testid={`mapped-${field}`}>
                          {header} → {field}
                        </span>
                      ))}
                      {preview.unmapped_columns?.map(h => (
                        <span key={h} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--off)', color: 'var(--muted)', border: '1px solid var(--nn-border)' }}>
                          {h} (skipped)
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Preview (first {preview.preview_rows?.length || 0} rows)</div>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--nn-border)', borderRadius: 'var(--rs)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--off)' }}>
                          {preview.headers.map((h, i) => (
                            <th key={i} style={{ padding: '6px 10px', fontWeight: 600, color: preview.mapped_columns[h] ? 'var(--gold4)' : 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--nn-border)', fontSize: 10 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.preview_rows || []).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{ padding: '5px 10px', color: 'var(--text)', borderBottom: '1px solid var(--nn-border)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {uploadError && <div style={{ padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--rs)', color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{uploadError}</div>}
              </div>
            )}

            {/* Step: Importing */}
            {uploadStep === 'importing' && (
              <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <Loader2 size={36} className="spin" style={{ color: 'var(--gold)', marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Importing tasks...</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Parsing and creating tasks from your file</div>
              </div>
            )}

            {/* Step: Done */}
            {uploadStep === 'done' && uploadResult && (
              <div className="modal-body" style={{ textAlign: 'center', padding: '30px 24px' }} data-testid="upload-result">
                <CheckCircle size={40} style={{ color: 'var(--green)', marginBottom: 12 }} />
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Import Complete</h4>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{uploadResult.message}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, maxWidth: 300, margin: '0 auto 16px' }}>
                  <div style={{ padding: '10px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{uploadResult.total_rows}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Rows</div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--green-bg)', borderRadius: 'var(--rs)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{uploadResult.created}</div>
                    <div style={{ fontSize: 9, color: 'var(--green)', textTransform: 'uppercase' }}>Created</div>
                  </div>
                  <div style={{ padding: '10px', background: uploadResult.errors > 0 ? 'var(--red-bg)' : 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: uploadResult.errors > 0 ? 'var(--red)' : 'var(--muted)' }}>{uploadResult.errors}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Errors</div>
                  </div>
                </div>

                {uploadResult.mapped_columns && (
                  <div style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--off)', borderRadius: 'var(--rs)', marginBottom: 12, border: '1px solid var(--nn-border)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Columns Mapped</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(uploadResult.mapped_columns).map(([h, f]) => (
                        <span key={h} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.06)', color: 'var(--green)' }}>{h}→{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {uploadResult.error_details?.length > 0 && (
                  <div style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--rs)', marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 4 }}>Errors</div>
                    {uploadResult.error_details.map((e, i) => (
                      <div key={i} style={{ fontSize: 10, color: 'var(--red)' }}>Row {e.row}: {e.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {uploadStep === 'preview' && (
              <div className="modal-footer">
                <button className="tbtn tbtn-outline" onClick={() => { setUploadStep('select'); setUploadFile(null); setPreview(null); }}>Back</button>
                <button className="tbtn tbtn-gold" onClick={handleImport} disabled={uploading} data-testid="import-btn">
                  {uploading ? <><Loader2 size={14} className="spin" /> Importing...</> : <><Upload size={14} /> Import {preview?.total_rows} Task{preview?.total_rows !== 1 ? 's' : ''}</>}
                </button>
              </div>
            )}
            {uploadStep === 'done' && (
              <div className="modal-footer">
                <button className="tbtn tbtn-gold" onClick={() => setShowUpload(false)} data-testid="close-result-btn">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TaskRow = ({ task, isOverdue, onToggle, statusBadge, priorityDot, showClient, showAssignee }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', background: isOverdue ? 'rgba(239,68,68,0.02)' : 'transparent' }} data-testid={`task-${task.task_id}`}>
    {/* Checkbox */}
    <div
      onClick={() => onToggle(task)}
      style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${task.status === 'Completed' ? 'var(--green)' : isOverdue ? 'var(--red)' : 'var(--nn-border)'}`, background: task.status === 'Completed' ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
      data-testid={`toggle-${task.task_id}`}
    >
      {task.status === 'Completed' && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✓</span>}
    </div>

    {/* Task info */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: task.status === 'Completed' ? 'var(--muted)' : 'var(--text)', textDecoration: task.status === 'Completed' ? 'line-through' : 'none' }}>{task.title}</span>
        {task.priority && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--muted)' }}>{priorityDot(task.priority)} {task.priority}</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
        {showClient && task.client_name && <span style={{ fontSize: 10, color: 'var(--gold4)' }}>{task.client_name}</span>}
        {showAssignee && task.assigned_to_name && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{task.assigned_to_name}</span>}
        {task.due_date && <span style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400 }}>Due: {new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
      </div>
    </div>

    {/* Status */}
    {statusBadge(isOverdue && task.status !== 'Completed' ? 'Overdue' : task.status)}
  </div>
);

export default MyTasks;
