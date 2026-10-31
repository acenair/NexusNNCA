import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Scale, FileWarning, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso || '—'; } };

const STATUS_STYLE = {
  'Reconciled': { icon: <CheckCircle2 size={13} />, bg: '#f0f7f2', border: '#cfe5d6', color: '#15803d' },
  'Variance': { icon: <AlertTriangle size={13} />, bg: '#fdf6ec', border: '#f0e0c8', color: '#b45309' },
  'No return filed': { icon: <FileWarning size={13} />, bg: '#fdf1f1', border: '#f2d7d7', color: '#be123c' },
  'Books missing': { icon: <FileWarning size={13} />, bg: '#f3f4f6', border: '#e2e5e9', color: '#6b7280' },
  'Not filed': { icon: <FileWarning size={13} />, bg: '#f3f4f6', border: '#e2e5e9', color: '#6b7280' },
};

const Var = ({ v }) => {
  if (v == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const bad = Math.abs(v) > 1.0;
  return <span style={{ fontWeight: 700, color: bad ? '#be123c' : '#15803d' }}>{bad ? '' : ''}{v > 0 && !bad ? '+' : ''}{fmt(v)}</span>;
};

export default function VatRecon({ engagementId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/vat/recon/${engagementId}`, { withCredentials: true });
      setData(res.data);
      setError('');
    } catch (e) {
      setError('Failed to load VAT reconciliation');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [engagementId]);

  const review = async (periodKey) => {
    setBusy(true);
    try {
      await axios.patch(`${API}/vat/recon/${engagementId}/${periodKey}`,
        { note: noteFor === periodKey ? note : '' }, { withCredentials: true });
      setNoteFor(null); setNote('');
      load();
    } catch (e) { alert('Review failed'); } finally { setBusy(false); }
  };

  const unreview = async (periodKey) => {
    setBusy(true);
    try {
      await axios.delete(`${API}/vat/recon/${engagementId}/${periodKey}`, { withCredentials: true });
      load();
    } catch (e) { alert('Failed'); } finally { setBusy(false); }
  };

  if (loading) return <div style={{ margin: '0 20px', fontSize: 12, color: 'var(--muted)' }}>Loading VAT reconciliation…</div>;

  return (
    <div style={{ margin: '0 20px' }} data-testid="vat-recon">
      <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Scale size={13} /> VAT reconciliation — books vs filed returns
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              What the ingested books say the client's VAT was, quarter by quarter, against what was actually filed with the FTA.
              Variances over AED 1 are flagged — check before the audit file goes to partner review.
            </div>
          </div>
          {data?.books_ledger && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Books: {data.books_ledger.source} · ingested {fmtWhen(data.books_ledger.at)}
            </span>
          )}
        </div>
      </div>

      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="vat-recon-error">{error}</div>}

      {data && (
        <>
          <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="vat-recon-totals">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {[
                ['Periods', String(data.totals.periods)],
                ['Reconciled', String(data.totals.reconciled)],
                ['Variance / unfiled', String(data.totals.variance)],
                ['Not filed', String(data.totals.not_filed)],
                ['Books missing', String(data.totals.books_missing)],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)', border: '1px solid var(--nn-border)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans', color: 'var(--text)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {data.periods.length === 0 ? (
            <div className="nn-card" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }} data-testid="vat-recon-empty">
              No VAT filings recorded for this client yet — add filings in the VAT workflow, then refresh.
            </div>
          ) : (
            <div className="nn-card" style={{ padding: 0, overflowX: 'auto' }} data-testid="vat-recon-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--off, #f7fafc)' }}>
                    {['Period', 'Status', 'Books output', 'Filed output', 'Var', 'Books input', 'Filed input', 'Var', 'Review'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--nn-border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map(p => {
                    const st = STATUS_STYLE[p.status] || STATUS_STYLE['Books missing'];
                    return (
                      <tr key={p.period_key} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`vat-row-${p.period_key}`}>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ fontWeight: 700 }}>{p.tax_period || p.period_key}</div>
                          {p.period_end_date && <div style={{ fontSize: 10, color: 'var(--muted)' }}>ended {fmtWhen(p.period_end_date)}</div>}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: st.bg, border: `1px solid ${st.border}`, color: st.color, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }} data-testid={`vat-status-${p.period_key}`}>
                            {st.icon} {p.status}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'DM Sans' }}>{fmt(p.books_output)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'DM Sans' }}>{fmt(p.filed_output)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}><Var v={p.variance_output} /></td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'DM Sans' }}>{fmt(p.books_input)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'DM Sans' }}>{fmt(p.filed_input)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}><Var v={p.variance_input} /></td>
                        <td style={{ padding: '9px 10px' }}>
                          {p.review ? (
                            <div style={{ fontSize: 10.5 }}>
                              <div style={{ fontWeight: 700, color: 'var(--green, #15803d)' }}>Reviewed — {p.review.reviewed_by}</div>
                              {p.review.note && <div style={{ color: 'var(--muted)' }}>{p.review.note}</div>}
                              <button className="af-btn" style={{ fontSize: 10, padding: '2px 8px', marginTop: 3 }} disabled={busy}
                                onClick={() => unreview(p.period_key)}>Undo</button>
                            </div>
                          ) : noteFor === p.period_key ? (
                            <div style={{ display: 'flex', gap: 5 }}>
                              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
                                style={{ width: 130, padding: '5px 7px', fontSize: 11, borderRadius: 6, border: '1px solid var(--line)' }} />
                              <button className="af-btn-primary" style={{ fontSize: 10, padding: '4px 8px' }} disabled={busy} onClick={() => review(p.period_key)} data-testid={`vat-review-save-${p.period_key}`}>
                                {busy ? '…' : 'Save'}
                              </button>
                              <button className="af-btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setNoteFor(null); setNote(''); }}>✕</button>
                            </div>
                          ) : (
                            <button className="af-btn" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => { setNoteFor(p.period_key); setNote(''); }} data-testid={`vat-review-${p.period_key}`}>
                              <RefreshCw size={11} /> Mark reviewed
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.periods.some(p => p.receipts_input_vat) && (
            <div className="nn-card" style={{ padding: '12px 20px', marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }} data-testid="vat-recon-receipts-note">
              Receipts cross-check: accepted receipts in this client's inboxes add input VAT of{' '}
              {data.periods.filter(p => p.receipts_input_vat).map(p => `${p.period_key}: AED ${fmt(p.receipts_input_vat)}`).join(' · ')} — a sampling signal against the books' input VAT.
            </div>
          )}
        </>
      )}
    </div>
  );
}
