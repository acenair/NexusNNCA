import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { UploadCloud, CheckCircle2, Clock, ShieldCheck, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/** Public client document-upload portal — no login; the URL token is the credential. */
const ClientUpload = () => {
  const { token } = useParams();
  const [req, setReq] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(null); // item_id in progress
  const [doneMsg, setDoneMsg] = useState('');
  const [uploaderName, setUploaderName] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/public/doc-requests/${token}`);
      setReq(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'This link is invalid or has been revoked. Please contact your account manager at Nair & Nelliyatt.');
    }
  };
  useEffect(() => { load(); }, [token]);

  const upload = async (item) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(item.item_id);
      setDoneMsg('');
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('item_id', item.item_id);
        fd.append('uploader_name', uploaderName || 'Client');
        const res = await axios.post(`${API}/public/doc-requests/${token}/upload`, fd);
        setDoneMsg(`"${item.label}" received — thank you!`);
        await load();
      } catch (e) {
        alert(e.response?.data?.detail || 'Upload failed — please try again or contact us.');
      }
      setUploading(null);
    };
    input.click();
  };

  if (error) {
    return (
      <div className="cportal" data-testid="client-upload-error">
        <div className="cportal-card">
          <div className="cportal-brand">N&N <span>Nair & Nelliyatt · Chartered Accountants</span></div>
          <p className="cportal-err">{error}</p>
        </div>
      </div>
    );
  }
  if (!req) return <div className="cportal"><div className="cportal-card"><Loader2 className="spin" /></div></div>;

  const received = req.items.filter(i => i.status === 'Received').length;

  return (
    <div className="cportal" data-testid="client-upload-view">
      <div className="cportal-wrap">
        <div className="cportal-brand">N&N <span>Nair & Nelliyatt · Chartered Accountants</span></div>
        <div className="cportal-card" style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="cportal-head">
            <div>
              <div className="cportal-eyebrow">SECURE DOCUMENT UPLOAD</div>
              <h1>{req.title}</h1>
              <p>For {req.client_name}{req.due_date ? ` · requested by ${new Date(req.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
            </div>
            <span className={`cportal-badge ${received === req.items.length ? 'ok' : ''}`}>{received}/{req.items.length} received</span>
          </div>

          {req.note && <p className="cportal-note">{req.note}</p>}

          <div className="cportal-namefield">
            <label>Your name (optional)</label>
            <input value={uploaderName} onChange={e => setUploaderName(e.target.value)} placeholder="e.g. Rahul Sharma" />
          </div>

          <div className="cportal-items">
            {req.items.map(item => (
              <div key={item.item_id} className={`cportal-item ${item.status === 'Received' ? 'received' : ''}`} data-testid={`portal-item-${item.item_id}`}>
                <div className="cportal-item-info">
                  {item.status === 'Received'
                    ? <CheckCircle2 size={18} color="#0e7e44" />
                    : <UploadCloud size={18} color="#7891a4" />}
                  <div>
                    <b>{item.label}</b>
                    {item.status === 'Received' && item.uploads?.length > 0 && (
                      <small>Received {new Date(item.uploads[item.uploads.length - 1].uploaded_at).toLocaleDateString('en-GB')} · {item.uploads.map(u => u.filename).join(', ')}</small>
                    )}
                  </div>
                </div>
                <button onClick={() => upload(item)} disabled={uploading === item.item_id} data-testid={`portal-upload-${item.item_id}`}>
                  {uploading === item.item_id ? <Loader2 size={14} className="spin" /> : item.status === 'Received' ? 'Add another' : 'Upload'}
                </button>
              </div>
            ))}
          </div>

          {doneMsg && <p className="cportal-done" data-testid="portal-done">{doneMsg}</p>}

          <div className="cportal-foot">
            <ShieldCheck size={14} /> Files upload securely to Nair & Nelliyatt's document vault — visible only to your engagement team.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientUpload;
