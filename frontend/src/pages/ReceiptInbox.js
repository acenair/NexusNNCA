import React, { useState, useEffect, useRef } from 'react';
import { Upload, CheckCircle2, Trash2, AlertTriangle, Receipt, Loader2, Pencil, X, Camera } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = ['meals', 'fuel', 'office_supplies', 'travel', 'utilities', 'professional_fees', 'rent', 'IT_software', 'marketing', 'repairs', 'other'];

const fmt = (n, cur) => `${cur || 'AED'} ${(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso || '—'; } };

const STATUS_STYLE = {
  'Accepted': { bg: '#f0f7f2', border: '#cfe5d6', color: '#15803d' },
  'Pending review': { bg: '#eaf3fb', border: '#d8e8f4', color: '#0e6db4' },
  'Flagged duplicate': { bg: '#fdf6ec', border: '#f0e0c8', color: '#b45309' },
  'Rejected': { bg: '#fdf1f1', border: '#f2d7d7', color: '#be123c' },
};

/* Editable parsed-fields row — inline, one receipt at a time */
const ReceiptCard = ({ r, onSaved, onDeleted, isPartner }) => {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState({
    vendor: r.vendor || '', vendor_trn: r.vendor_trn || '', invoice_no: r.invoice_no || '',
    receipt_date: r.receipt_date || '', total: r.total ?? '', vat_amount: r.vat_amount ?? '',
    category: r.category || 'other', payment_method: r.payment_method || '',
  });
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['Pending review'];

  const save = async (patch) => {
    setBusy(true);
    try {
      await axios.patch(`${API}/receipts/${r.engagement_id}/${r.receipt_id}`, patch, { withCredentials: true });
      onSaved();
      setEditing(false);
    } catch (e) {
      alert(e.response?.data?.detail?.message || e.response?.data?.detail || 'Update failed');
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm('Delete this receipt from the inbox?')) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/receipts/${r.engagement_id}/${r.receipt_id}`, { withCredentials: true });
      onDeleted();
    } catch (e) { alert('Delete failed'); } finally { setBusy(false); }
  };

  return (
    <div style={{ border: `1px solid ${st.border}`, borderRadius: 10, background: 'var(--white)', marginBottom: 10, overflow: 'hidden' }} data-testid={`receipt-card-${r.receipt_id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: st.bg }}>
        <Receipt size={16} color={st.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.vendor || 'Unknown vendor'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            {fmtWhen(r.receipt_date)} · {r.category} · {r.file_name}
            {r.extraction_notes ? ` · ⚠ ${r.extraction_notes}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, fontFamily: 'DM Sans', color: 'var(--text)' }}>{fmt(r.total, r.currency)}</div>
          {r.vat_amount != null && <div style={{ fontSize: 10, color: 'var(--muted)' }}>VAT {fmt(r.vat_amount, r.currency)}</div>}
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: st.border, color: st.color, whiteSpace: 'nowrap' }} data-testid={`receipt-status-${r.receipt_id}`}>
          {r.status}{r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ''}
        </span>
      </div>

      {r.status === 'Flagged duplicate' && r.duplicate_of && (
        <div style={{ padding: '7px 14px', fontSize: 11.5, background: '#fdf6ec', color: '#b45309', display: 'flex', gap: 6, alignItems: 'center' }} data-testid="receipt-dupe-warning">
          <AlertTriangle size={12} /> Same vendor, date and total as an earlier receipt — confirm they are genuinely different documents before accepting.
        </div>
      )}

      {!editing ? (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="af-btn" onClick={() => setPreview(true)} data-testid={`receipt-view-${r.receipt_id}`}><Camera size={12} /> View</button>
          <button className="af-btn" onClick={() => setEditing(true)} data-testid={`receipt-edit-${r.receipt_id}`}><Pencil size={12} /> Edit fields</button>
          {r.status !== 'Accepted' &&
            <button className="af-btn-primary" disabled={busy} onClick={() => save({ status: 'Accepted' })} data-testid={`receipt-accept-${r.receipt_id}`}><CheckCircle2 size={12} /> Accept</button>}
          {r.status !== 'Pending review' &&
            <button className="af-btn" disabled={busy} onClick={() => save({ status: 'Pending review' })}>Back to pending</button>}
          {isPartner && <button className="af-btn" disabled={busy} onClick={del} style={{ color: 'var(--red)', marginLeft: 'auto' }} data-testid={`receipt-delete-${r.receipt_id}`}><Trash2 size={12} /> Delete</button>}
        </div>
      ) : (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--nn-border)' }} data-testid={`receipt-edit-form-${r.receipt_id}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
            {[
              ['vendor', 'Vendor'], ['vendor_trn', 'TRN'], ['invoice_no', 'Invoice no'],
              ['receipt_date', 'Date (YYYY-MM-DD)'], ['total', 'Total'], ['vat_amount', 'VAT amount'],
            ].map(([k, label]) => (
              <div key={k}>
                <label style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</label>
                <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Paid by</label>
              <input value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="af-btn" onClick={() => setEditing(false)} disabled={busy}><X size={12} /> Cancel</button>
            <button className="af-btn-primary" disabled={busy} onClick={() => save({
              ...form,
              total: form.total === '' ? null : Number(form.total),
              vat_amount: form.vat_amount === '' ? null : Number(form.vat_amount),
            })} data-testid={`receipt-save-${r.receipt_id}`}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }} data-testid="receipt-preview-modal">
          <img src={`${API}/receipts/${r.engagement_id}/${r.receipt_id}/file`} alt={r.file_name}
            style={{ maxWidth: '92%', maxHeight: '92%', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
};

export default function ReceiptInbox({ engagementId, isPartner }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ receipts: [], totals: {} });
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/receipts/${engagementId}`, { withCredentials: true });
      setData(res.data);
      setError('');
    } catch (e) {
      setError('Failed to load receipt inbox');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [engagementId]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadNote(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(`${API}/receipts/${engagementId}/upload`, fd, {
        withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadNote({ ok: true, text: `Parsed: ${res.data.vendor || 'unknown vendor'} · ${fmt(res.data.total, res.data.currency)}${res.data.status === 'Flagged duplicate' ? ' — FLAGGED as probable duplicate' : ''}` });
      load();
    } catch (err) {
      const d = err.response?.data?.detail;
      setUploadNote({ ok: false, text: typeof d === 'object' ? d?.message || 'Upload rejected (duplicate)' : (d || 'Upload failed') });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const t = data.totals || {};

  return (
    <div style={{ margin: '0 20px' }} data-testid="receipt-inbox">
      <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={13} /> Receipt inbox
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              Photograph or upload purchase receipts — the AI reads vendor, date, totals and VAT; duplicates are caught before they reach the books.
            </div>
          </div>
          <label className="tbtn tbtn-gold" style={{ cursor: uploading ? 'wait' : 'pointer' }} data-testid="receipt-upload-btn">
            {uploading ? <><Loader2 size={13} className="spin" /> Reading receipt…</> : <><Upload size={13} /> Upload receipt</>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={upload} data-testid="receipt-file-input" />
          </label>
        </div>
        {uploadNote && (
          <div style={{ fontSize: 12, padding: '7px 10px', borderRadius: 6, marginTop: 6, background: uploadNote.ok ? '#f0f7f2' : '#fdf1f1', color: uploadNote.ok ? '#15803d' : '#be123c' }} data-testid="receipt-upload-note">
            {uploadNote.text}
          </div>
        )}
      </div>

      {/* Accepted spend summary */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="receipt-totals">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {[
            ['Receipts', String(t.count ?? 0)],
            ['Accepted', String(t.accepted ?? 0)],
            ['Pending review', String(t.pending ?? 0)],
            ['Flagged dupes', String(t.flagged ?? 0)],
            ['Accepted spend', fmt(t.total_spend, 'AED')],
            ['Accepted input VAT', fmt(t.vat_total, 'AED')],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)', border: '1px solid var(--nn-border)' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans', color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="receipts-error">{error}</div>}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading receipts…</div>
      ) : data.receipts.length === 0 ? (
        <div className="nn-card" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }} data-testid="receipts-empty">
          No receipts in the inbox yet — upload the first one above.
        </div>
      ) : (
        data.receipts.map(r => (
          <ReceiptCard key={r.receipt_id} r={r} onSaved={load} onDeleted={load}
            isPartner={isPartner} />
        ))
      )}
    </div>
  );
}
