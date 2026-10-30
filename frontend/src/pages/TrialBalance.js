import React, { useState, useEffect, useRef } from 'react';
import { Upload, ShieldCheck, Wand2, RefreshCw, Trash2, FileSpreadsheet } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Mirrors backend STATEMENT_LINES (line + group)
const STATEMENT_LINES = [
  ['Cash and bank balances', 'Assets'], ['Trade receivables', 'Assets'],
  ['Other receivables and advances', 'Assets'], ['Inventory', 'Assets'],
  ['Prepayments', 'Assets'], ['Property, plant and equipment', 'Assets'],
  ['Intangible assets', 'Assets'], ['Other assets', 'Assets'],
  ['Trade payables', 'Liabilities'], ['Accruals and other payables', 'Liabilities'],
  ['VAT and taxes payable', 'Liabilities'], ['Loans and borrowings', 'Liabilities'],
  ['Provisions and end-of-service', 'Liabilities'], ['Other liabilities', 'Liabilities'],
  ['Share capital', 'Equity'], ['Retained earnings', 'Equity'],
  ['Reserves', 'Equity'], ['Owner drawings', 'Equity'],
  ['Revenue', 'Income'], ['Other income', 'Income'],
  ['Cost of sales', 'Expenses'], ['Staff costs', 'Expenses'],
  ['Depreciation and amortisation', 'Expenses'], ['Operating expenses', 'Expenses'],
  ['Finance costs', 'Expenses'],
];
const GROUP_COLOR = { Assets: '#0e6db4', Liabilities: '#b45309', Equity: '#7c3aed', Income: '#15803d', Expenses: '#be123c' };

const fmt = (n) => (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TrialBalance = ({ engagementId }) => {
  const [tb, setTb] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const [t, c] = await Promise.all([
        axios.get(`${API}/tb/${engagementId}`, { withCredentials: true }),
        axios.get(`${API}/tb/${engagementId}/checks`, { withCredentials: true }),
      ]);
      setTb(t.data.rows ? t.data : { rows: [] });
      setChecks(c.data);
    } catch (e) { setError('Failed to load trial balance'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', f);
    try {
      const res = await axios.post(`${API}/tb/${engagementId}/import`, fd, { withCredentials: true });
      setTb(res.data);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const saveMapping = async (idx, line) => {
    setEditingIdx(null);
    try {
      const res = await axios.patch(`${API}/tb/${engagementId}/mapping`, { row_index: idx, mapping: line }, { withCredentials: true });
      setTb(res.data);
      const c = await axios.get(`${API}/tb/${engagementId}/checks`, { withCredentials: true });
      setChecks(c.data);
    } catch (e) { setError('Failed to save mapping'); }
  };

  const automap = async () => {
    try {
      const res = await axios.post(`${API}/tb/${engagementId}/automap`, {}, { withCredentials: true });
      setTb(res.data);
      const c = await axios.get(`${API}/tb/${engagementId}/checks`, { withCredentials: true });
      setChecks(c.data);
    } catch (e) { setError('Auto-map failed'); }
  };

  const removeTb = async () => {
    if (!window.confirm('Remove the imported trial balance for this engagement?')) return;
    try {
      await axios.delete(`${API}/tb/${engagementId}`, { withCredentials: true });
      setTb({ rows: [] }); setChecks(null);
    } catch (e) { setError('Failed to remove'); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading trial balance…</div>;

  const rows = tb?.rows || [];
  const unmapped = rows.filter(r => !r.mapping).length;
  const visible = rows.map((r, i) => ({ ...r, i }))
    .filter(r => !filter || (r.account + ' ' + (r.description || '') + ' ' + (r.mapping || '')).toLowerCase().includes(filter.toLowerCase()));
  const net = (r) => (r.debit || 0) - (r.credit || 0);

  const badge = (status) => status === 'pass' ? { bg: '#f0f7f2', bd: '#cfe5d6', fg: 'var(--green)', tx: 'PASS' }
    : status === 'warn' ? { bg: '#fdf6ec', bd: '#f0e0c8', fg: '#b45309', tx: 'WARN' }
    : { bg: '#fdecec', bd: '#f4cbc7', fg: 'var(--red)', tx: 'FAIL' };

  return (
    <div style={{ margin: '0 20px' }} data-testid="tb-workbench">
      {/* Stepper / status bar */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }} data-testid="tb-statusbar">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)' }}>Trial balance</div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Step 1 — import a trial balance (CSV or Excel). Step 2 — map accounts to statement lines. Step 3 — run the checks.</div>
        ) : (
          <>
            <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}><FileSpreadsheet size={13} /> {tb.file_name} · imported {tb.imported_at?.slice(0, 10)} by {tb.imported_by}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: unmapped ? '#fdf6ec' : '#f0f7f2', color: unmapped ? '#b45309' : 'var(--green)' }}>
              {rows.length} accounts · {rows.length - unmapped} mapped{unmapped ? ` · ${unmapped} unmapped` : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="af-btn" onClick={automap} data-testid="tb-automap"><Wand2 size={12} /> Auto-map</button>
              <button className="af-btn" onClick={() => fileRef.current?.click()} data-testid="tb-reimport"><RefreshCw size={12} /> Re-import</button>
              <button className="af-btn" onClick={removeTb} data-testid="tb-delete" style={{ color: 'var(--red)' }}><Trash2 size={12} /> Remove</button>
            </div>
          </>
        )}
      </div>

      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="tb-error">{error}</div>}

      {/* Import panel (empty state) */}
      {rows.length === 0 && (
        <div className="nn-card" style={{ padding: 32, textAlign: 'center' }} data-testid="tb-empty">
          <Upload size={28} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', marginBottom: 4 }}>Import the client's trial balance</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 520, margin: '0 auto 14px' }}>
            Accepts CSV or Excel (.xlsx). The file needs an account-name column plus debit and credit columns —
            most accounting packages export exactly this. Total rows must balance; totals are checked on import.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={onUpload} style={{ display: 'none' }} data-testid="tb-file-input" />
          <button className="tbtn tbtn-gold" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="tb-upload-btn">
            {uploading ? 'Importing…' : (<><Upload size={13} /> Choose file</>)}
          </button>
        </div>
      )}

      {/* Checks */}
      {checks?.available && checks.checks?.length > 0 && (
        <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="tb-checks">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={13} /> Integrity checks
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {checks.checks.map(c => {
              const b = badge(c.status);
              return (
                <div key={c.id} style={{ padding: '8px 12px', borderRadius: 8, background: b.bg, border: `1px solid ${b.bd}` }} data-testid={`tb-check-${c.id}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    {c.name}<span style={{ fontSize: 9.5, fontWeight: 800, color: b.fg }}>{b.tx}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mapped statement lines summary */}
      {checks?.available && checks.lines?.length > 0 && (
        <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="tb-lines">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8 }}>Statement lines (net of the mapped accounts)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
            {checks.lines.map(l => (
              <div key={l.line} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR[l.group] || 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{l.group}</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{l.line}</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans', color: 'var(--text)' }}>{fmt(l.amount)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.accounts.length} account{l.accounts.length > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts table */}
      {rows.length > 0 && (
        <div className="nn-card" style={{ overflow: 'hidden' }} data-testid="tb-table">
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)' }}>Accounts</h3>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search account or mapping…"
              data-testid="tb-search"
              style={{ padding: '7px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12, minWidth: 220 }} />
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--off, #f7fafc)', textAlign: 'left', zIndex: 1 }}>
                  <th style={{ padding: '8px 20px', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>Account</th>
                  <th style={{ padding: 8, fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Debit</th>
                  <th style={{ padding: 8, fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Credit</th>
                  <th style={{ padding: 8, fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Net</th>
                  <th style={{ padding: '8px 20px', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>Statement line</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.i} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`tb-row-${r.i}`}>
                    <td style={{ padding: '7px 20px', color: 'var(--text)' }}>{r.account}{r.auto && <span style={{ fontSize: 9, color: '#0e6db4', marginLeft: 6, fontWeight: 700 }}>AUTO</span>}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: r.debit ? 'var(--text)' : 'var(--muted)' }}>{r.debit ? fmt(r.debit) : '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: r.credit ? 'var(--text)' : 'var(--muted)' }}>{r.credit ? fmt(r.credit) : '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: net(r) < 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(net(r))}</td>
                    <td style={{ padding: '7px 20px' }}>
                      {editingIdx === r.i ? (
                        <select autoFocus value={r.mapping || ''} onChange={e => saveMapping(r.i, e.target.value)} onBlur={() => setEditingIdx(null)} data-testid={`tb-map-select-${r.i}`}
                          style={{ width: '100%', padding: '5px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid var(--gold)', background: 'var(--white)', color: 'var(--text)' }}>
                          <option value="">— Unmapped —</option>
                          {STATEMENT_LINES.map(([line, group]) => <option key={line} value={line}>{group} · {line}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setEditingIdx(r.i)} data-testid={`tb-map-btn-${r.i}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 2, color: r.mapping ? GROUP_COLOR[STATEMENT_LINES.find(s => s[0] === r.mapping)?.[1]] || 'var(--text)' : 'var(--red)', fontWeight: r.mapping ? 600 : 400, fontStyle: r.auto ? 'italic' : 'normal', textAlign: 'left' }}>
                          {r.mapping || '+ map this account'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalance;
