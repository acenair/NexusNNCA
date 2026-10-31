import React, { useState, useEffect, useRef } from 'react';
import { Upload, ShieldCheck, Wand2, RefreshCw, Trash2, FileSpreadsheet, FileSearch, CheckCircle2, ChevronDown, HardDriveDownload } from 'lucide-react';
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
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return iso; } };

/* Typeahead statement-line picker — whittles the list as you type */
const MappingTypeahead = ({ value, onPick }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const filtered = STATEMENT_LINES.filter(([line, group]) =>
    !q || (line + ' ' + group).toLowerCase().includes(q.toLowerCase()));
  const color = value ? GROUP_COLOR[STATEMENT_LINES.find(s => s[0] === value)?.[1]] || 'var(--text)' : 'var(--red)';
  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="tb-typeahead">
      <input value={open ? q : (value || '')}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(''); }}
        placeholder={value ? value : '+ map this account'}
        style={{ width: '100%', padding: '5px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid var(--gold)', background: 'var(--white)', color, fontWeight: value ? 600 : 400, boxSizing: 'border-box' }}
        data-testid="tb-typeahead-input" />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(23,53,76,0.15)', maxHeight: 260, overflowY: 'auto' }} data-testid="tb-typeahead-list">
          {filtered.map(([line, group]) => (
            <div key={line} onClick={() => { setOpen(false); onPick(line); }}
              style={{ padding: '7px 10px', fontSize: 11.5, cursor: 'pointer', borderBottom: '1px solid var(--nn-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eaf3fb'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: GROUP_COLOR[group], textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 8 }}>{group}</span>
              {line}
            </div>
          ))}
          {value && (
            <div onClick={() => { setOpen(false); onPick(''); }}
              style={{ padding: '7px 10px', fontSize: 11.5, cursor: 'pointer', color: 'var(--red)' }}>
              ✕ Clear mapping (unmapped)
            </div>
          )}
          {filtered.length === 0 && <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted)' }}>No matching statement line</div>}
        </div>
      )}
    </div>
  );
};

const COLUMN_ROLES = [
  ['account', 'Account name *'],
  ['debit', 'Debit'],
  ['credit', 'Credit'],
  ['description', 'Description'],
];

const TrialBalance = ({ engagementId }) => {
  const [tb, setTb] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(null);        // import preview state
  const [wizardCols, setWizardCols] = useState({});
  const [saveLayout, setSaveLayout] = useState(true);
  const [clientDocs, setClientDocs] = useState([]);
  const [confirming, setConfirming] = useState(false);
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

  const loadClientDocs = async () => {
    try {
      const res = await axios.get(`${API}/tb/${engagementId}/client-documents`, { withCredentials: true });
      setClientDocs(res.data.documents || []);
    } catch (e) { /* non-fatal */ }
  };
  useEffect(() => { if (tb && (tb.rows || []).length === 0) loadClientDocs(); }, [tb]);

  const startPreview = async (fd) => {
    setError('');
    try {
      const res = await axios.post(`${API}/tb/${engagementId}/import/preview`, fd, { withCredentials: true });
      const w = res.data;
      const cols = { account: w.suggested.account, debit: w.suggested.debit, credit: w.suggested.credit, description: w.suggested.description };
      // a saved layout for this client overrides naive suggestions
      if (w.saved_layout) {
        for (const k of Object.keys(cols)) {
          if (w.saved_layout[k] != null && w.saved_layout[k] < w.headers.length) cols[k] = w.saved_layout[k];
        }
      }
      setWizard(w); setWizardCols(cols);
    } catch (err) {
      setError(err.response?.data?.detail || 'Import preview failed');
    }
  };

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    startPreview(fd);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onClientDoc = (doc) => {
    const fd = new FormData();
    fd.append('document_id', doc.file_id);
    startPreview(fd);
  };

  const confirmImport = async () => {
    setConfirming(true); setError('');
    try {
      const res = await axios.post(`${API}/tb/${engagementId}/import/confirm`,
        { staging_id: wizard.staging_id, columns: wizardCols, save_layout }, { withCredentials: true });
      setWizard(null);
      setTb(res.data);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally { setConfirming(false); }
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
    if (!window.confirm('Remove the imported trial balance for this engagement? (Firm mapping memory is kept.)')) return;
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
  const srcBadge = (r) => r.source === 'memory' ? <span style={{ fontSize: 9, color: '#15803d', marginLeft: 6, fontWeight: 700 }}>MEMORY</span>
    : r.source === 'auto' ? <span style={{ fontSize: 9, color: '#0e6db4', marginLeft: 6, fontWeight: 700 }}>AUTO</span> : null;

  const badge = (status) => status === 'pass' ? { bg: '#f0f7f2', bd: '#cfe5d6', fg: 'var(--green)', tx: 'PASS' }
    : status === 'warn' ? { bg: '#fdf6ec', bd: '#f0e0c8', fg: '#b45309', tx: 'WARN' }
    : { bg: '#fdecec', bd: '#f4cbc7', fg: 'var(--red)', tx: 'FAIL' };

  return (
    <div style={{ margin: '0 20px' }} data-testid="tb-workbench">
      {/* Stepper / status bar */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }} data-testid="tb-statusbar">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)' }}>Trial balance</div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Step 1 — import a trial balance (CSV or Excel). Step 2 — confirm columns & map accounts. Step 3 — run the checks.</div>
        ) : (
          <>
            <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}><FileSpreadsheet size={13} /> {tb.file_name} · imported {fmtWhen(tb.imported_at)} by {tb.imported_by}</span>
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

      {/* Import wizard (two-step: source → column labelling) */}
      {wizard && (
        <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }} data-testid="tb-wizard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: 0 }}>
              Label the columns <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--muted)' }}>— {wizard.filename} · {wizard.row_count} account rows found</span>
            </h3>
            <button className="af-btn" onClick={() => setWizard(null)} data-testid="tb-wizard-cancel">Cancel</button>
          </div>

          {/* Column selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
            {COLUMN_ROLES.map(([role, label]) => (
              <div key={role}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</label>
                <select value={wizardCols[role] ?? ''} onChange={e => setWizardCols(p => ({ ...p, [role]: e.target.value === '' ? null : Number(e.target.value) }))}
                  style={{ width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }}
                  data-testid={`tb-col-${role}`}>
                  <option value="">— none —</option>
                  {wizard.headers.map((h, i) => <option key={i} value={i}>{h || `column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview grid */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--nn-border)', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--off, #f7fafc)' }}>
                  {wizard.headers.map((h, i) => {
                    const role = Object.entries(wizardCols).find(([, v]) => v === i)?.[0];
                    return <th key={i} style={{ padding: '6px 8px', fontSize: 9.5, textTransform: 'uppercase', color: role ? GROUP_COLOR['Assets'] : 'var(--muted)', borderBottom: '2px solid ' + (role ? '#45afe8' : 'transparent') }}>
                      {role ? `▸ ${role}` : (h || `col ${i + 1}`)}
                    </th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {wizard.preview.map((r, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--nn-border)' }}>
                    {r.map((cell, ci) => <td key={ci} style={{ padding: '5px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{String(cell).slice(0, 40)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} data-testid="tb-save-layout-label">
              <input type="checkbox" checked={saveLayout} onChange={e => setSaveLayout(e.target.checked)} data-testid="tb-save-layout" />
              Remember these columns for {tb?.client_name || 'this client'}'s future imports
            </label>
            <button className="tbtn tbtn-gold" onClick={confirmImport} disabled={confirming || wizardCols.account == null} style={{ marginLeft: 'auto' }} data-testid="tb-confirm-import">
              {confirming ? 'Importing…' : (<><CheckCircle2 size={13} /> Confirm import</>)}
            </button>
          </div>
          {wizardCols.account == null && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>Choose the account-name column to continue.</div>}
        </div>
      )}

      {/* Import panel (empty state) */}
      {rows.length === 0 && !wizard && (
        <div className="nn-card" style={{ padding: 32, textAlign: 'center' }} data-testid="tb-empty">
          <Upload size={28} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', marginBottom: 4 }}>Import the client's trial balance</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 520, margin: '0 auto 14px' }}>
            Accepts CSV or Excel (.xlsx). You'll label the columns on the next step — mappings from previous imports
            apply automatically. Total rows must balance; totals are checked on import.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={onUpload} style={{ display: 'none' }} data-testid="tb-file-input" />
          <button className="tbtn tbtn-gold" onClick={() => fileRef.current?.click()} data-testid="tb-upload-btn">
            <Upload size={13} /> Choose file
          </button>

          {clientDocs.length > 0 && (
            <div style={{ marginTop: 22, borderTop: '1px solid var(--nn-border)', paddingTop: 16, textAlign: 'left' }} data-testid="tb-client-docs">
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HardDriveDownload size={12} /> Or import a file the client already uploaded
              </div>
              {clientDocs.map(d => (
                <div key={d.file_id} onClick={() => onClientDoc(d)} data-testid={`tb-client-doc-${d.file_id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', borderBottom: '1px solid var(--nn-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eaf3fb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <FileSearch size={13} color="#0e6db4" />
                  <span style={{ flex: 1 }}>{d.filename}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{d.source || 'client'} · {fmtWhen(d.uploaded_at)}</span>
                </div>
              ))}
            </div>
          )}
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
                  <th style={{ padding: '8px 20px', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', minWidth: 220 }}>Statement line</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.i} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`tb-row-${r.i}`}>
                    <td style={{ padding: '7px 20px', color: 'var(--text)' }}>{r.account}{srcBadge(r)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: r.debit ? 'var(--text)' : 'var(--muted)' }}>{r.debit ? fmt(r.debit) : '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: r.credit ? 'var(--text)' : 'var(--muted)' }}>{r.credit ? fmt(r.credit) : '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: net(r) < 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(net(r))}</td>
                    <td style={{ padding: '7px 20px' }}>
                      {editingIdx === r.i ? (
                        <MappingTypeahead value={r.mapping || ''} onPick={line => saveMapping(r.i, line)} />
                      ) : (
                        <button onClick={() => setEditingIdx(r.i)} data-testid={`tb-map-btn-${r.i}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 2, color: r.mapping ? GROUP_COLOR[STATEMENT_LINES.find(s => s[0] === r.mapping)?.[1]] || 'var(--text)' : 'var(--red)', fontWeight: r.mapping ? 600 : 400, fontStyle: r.source === 'auto' ? 'italic' : 'normal', textAlign: 'left' }}>
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
