import React, { useState } from 'react';
import { Paperclip, CheckCircle, AlertTriangle, Upload, ExternalLink } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuditQuestionRow = ({ auditId, question, response, onSaved }) => {
  const [value, setValue] = useState(response?.value || '');
  const [remarks, setRemarks] = useState(response?.remarks || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!question.is_input) {
    return (
      <div style={{ padding: '10px 16px 4px', fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: 0.4 }} data-testid={`audit-label-${question.code}`}>
        {question.text}
      </div>
    );
  }

  const save = async (newValue, newRemarks) => {
    setSaving(true);
    try {
      const res = await axios.patch(`${API}/audit/${auditId}/responses/${question.code}`, { value: newValue, remarks: newRemarks }, { withCredentials: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved && onSaved(res.data);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API}/audit/${auditId}/responses/${question.code}/upload`, formData, { withCredentials: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved && onSaved(null, true);
    } catch (err) { console.error(err); alert('Upload failed'); }
    finally { setUploading(false); }
  };

  const flagged = response?.flagged;

  return (
    <div
      style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', background: flagged ? 'rgba(220,38,38,0.04)' : 'transparent' }}
      data-testid={`audit-question-${question.code}`}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', background: 'var(--gold5)', borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>{question.code}</span>
        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>{question.text}</span>
        {saving && <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>Saving...</span>}
        {saved && <CheckCircle size={14} color="var(--green)" style={{ flexShrink: 0 }} data-testid={`audit-saved-${question.code}`} />}
        {flagged && <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0 }} data-testid={`audit-flag-${question.code}`} />}
      </div>

      {question.type === 'yes_no' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, paddingLeft: 26 }}>
          {['Yes', 'No'].map(opt => (
            <button
              key={opt}
              onClick={() => { setValue(opt); save(opt, remarks); }}
              style={{
                padding: '5px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: value === opt ? '1px solid transparent' : '1px solid var(--nn-border)',
                background: value === opt ? (opt === 'No' ? '#dc2626' : 'var(--green)') : 'var(--white)',
                color: value === opt ? '#fff' : 'var(--muted)',
              }}
              data-testid={`audit-yesno-${question.code}-${opt.toLowerCase()}`}
            >{opt}</button>
          ))}
        </div>
      )}

      {question.type === 'text' && (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(value, remarks)}
          placeholder="Enter details / notes..."
          rows={2}
          style={{ width: '100%', paddingLeft: 26, padding: '6px 10px', marginLeft: 0, borderRadius: 6, border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', resize: 'vertical', outline: 'none', background: 'var(--white)', color: 'var(--text)' }}
          data-testid={`audit-text-${question.code}`}
        />
      )}

      {question.type === 'file_upload' && (
        <div style={{ paddingLeft: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--gold)', background: 'rgba(201,168,76,0.06)', color: 'var(--gold4)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} data-testid={`audit-upload-btn-${question.code}`}>
            <Upload size={12} /> {uploading ? 'Uploading...' : response?.attachment_name ? 'Replace' : 'Attach File'}
            <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
          {response?.attachment_name && (
            <a href={`${API}/audit/${auditId}/responses/${question.code}/download`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }} data-testid={`audit-attachment-${question.code}`}>
              <Paperclip size={11} /> {response.attachment_name}
            </a>
          )}
          {response?.drive_link && (
            <a href={response.drive_link} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#4285F4', display: 'flex', alignItems: 'center', gap: 3 }} data-testid={`audit-drive-link-${question.code}`}>
              <ExternalLink size={10} /> Drive
            </a>
          )}
        </div>
      )}

      {question.type !== 'text' && (
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={() => save(value, remarks)}
          placeholder="Optional remarks..."
          style={{ width: 'calc(100% - 26px)', marginLeft: 26, marginTop: 6, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--nn-border)', fontSize: 11, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--off)', color: 'var(--text)' }}
          data-testid={`audit-remarks-${question.code}`}
        />
      )}
    </div>
  );
};
