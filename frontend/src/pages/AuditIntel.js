import React, { useState, useEffect } from 'react';
import { Target, FlaskConical, Landmark, FileText, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n == null ? '' : `${n * 100}%`);

const SEV = { high: { bg: '#fdecec', fg: 'var(--red)' }, medium: { bg: '#fdf6ec', fg: '#b45309' }, clean: { bg: '#f0f7f2', fg: 'var(--green)' } };

const AuditIntel = ({ engagementId }) => {
  const [mat, setMat] = useState(null);
  const [je, setJe] = useState(null);
  const [memo, setMemo] = useState(null);
  const [stale, setStale] = useState(null);
  const [ct, setCt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [m, j, s, c] = await Promise.all([
        axios.get(`${API}/audit/${engagementId}/materiality`, { withCredentials: true }),
        axios.get(`${API}/audit/${engagementId}/je-tests`, { withCredentials: true }),
        axios.get(`${API}/audit/${engagementId}/pack-staleness`, { withCredentials: true }),
        axios.get(`${API}/audit/${engagementId}/corporate-tax`, { withCredentials: true }),
      ]);
      setMat(m.data); setJe(j.data); setStale(s.data); setCt(c.data);
    } catch (e) { setError('Failed to load audit intelligence'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const generateMemo = async () => {
    setBusy('memo'); setError('');
    try {
      const res = await axios.get(`${API}/audit/${engagementId}/risk-memo`, { withCredentials: true });
      setMemo(res.data);
    } catch (e) { setError('Risk memo failed'); }
    finally { setBusy(''); }
  };

  const setBasis = async (benchmark) => {
    setBusy('mat'); setError('');
    try {
      await axios.patch(`${API}/audit/${engagementId}/materiality`, { benchmark }, { withCredentials: true });
      const res = await axios.get(`${API}/audit/${engagementId}/materiality`, { withCredentials: true });
      setMat(res.data);
    } catch (e) { setError(e.response?.data?.detail || 'Failed'); }
    finally { setBusy(''); }
  };

  const setCtAdj = async (key, value) => {
    setBusy('ct'); setError('');
    try {
      await axios.patch(`${API}/audit/${engagementId}/corporate-tax`, { adjustments: { [key]: value } }, { withCredentials: true });
      const res = await axios.get(`${API}/audit/${engagementId}/corporate-tax`, { withCredentials: true });
      setCt(res.data);
    } catch (e) { setError(e.response?.data?.detail || 'Failed'); }
    finally { setBusy(''); }
  };

  const toggleSb = async () => {
    setBusy('ct'); setError('');
    try {
      await axios.patch(`${API}/audit/${engagementId}/corporate-tax`, { small_business_election: !ct.small_business_election }, { withCredentials: true });
      setCt((await axios.get(`${API}/audit/${engagementId}/corporate-tax`, { withCredentials: true })).data);
    } catch (e) { setError('Failed'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Computing…</div>;

  const matAvailable = mat?.available;
  const ctAvailable = ct?.available;

  return (
    <div style={{ margin: '0 20px' }} data-testid="audit-intel-view">
      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="intel-error">{error}</div>}
      {stale?.stale && (
        <div className="nn-card" style={{ padding: '10px 16px', marginBottom: 12, background: '#fdf6ec', border: '1px solid #f0e0c8', fontSize: 12, color: '#b45309', display: 'flex', gap: 8, alignItems: 'center' }} data-testid="stale-banner">
          <AlertTriangle size={14} /> The deliverable pack exported {stale.exported_at?.slice(0, 16).replace('T', ' ')} is STALE — {stale.changes.join('; ')}. Re-export before sending anything to the client.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Materiality */}
        <div className="nn-card" style={{ padding: '14px 20px' }} data-testid="materiality-card">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} /> Materiality
          </div>
          {matAvailable ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>Benchmark & threshold</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {Object.keys(mat.benchmarks).map(b => (
                  <button key={b} onClick={() => setBasis(b)} disabled={busy === 'mat'}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 999, cursor: 'pointer', border: `1px solid ${mat.basis === b ? '#0e6db4' : 'var(--nn-border)'}`, background: mat.basis === b ? '#0e6db4' : 'var(--white)', color: mat.basis === b ? '#fff' : 'var(--muted)' }}
                    data-testid={`mat-basis-${b.toLowerCase().replace(' ', '-')}`}>{b}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['Materiality', mat.materiality], ['Performance (75%)', mat.performance], ['Clearly trivial (5%)', mat.clearly_trivial]].map(([k, v]) => (
                  <div key={k} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)', border: '1px solid var(--nn-border)' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans', color: 'var(--text)' }}>{fmt(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>{mat.basis} @ {pct(mat.pct)} — recomputes when the statements change.</div>
            </>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>{mat?.reason}</p>}
        </div>

        {/* Corporate tax */}
        <div className="nn-card" style={{ padding: '14px 20px' }} data-testid="ct-card">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Landmark size={13} /> Corporate tax (UAE 9%)
          </div>
          {ctAvailable ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                <span style={{ color: 'var(--muted)' }}>Accounting income</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(ct.accounting_income)}</b>
              </div>
              {ct.adjustments.map(a => (
                <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: 'var(--muted)', flex: 1 }}>{a.label}</span>
                  <input type="number" value={a.amount || ''} placeholder="0" onChange={e => setCtAdj(a.key, e.target.value)}
                    data-testid={`ct-adj-${a.key}`}
                    style={{ width: 100, padding: '3px 8px', fontSize: 12, textAlign: 'right', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--nn-border)' }}>
                <span style={{ color: 'var(--muted)' }}>Small-business relief (rev ≤ AED 3m){ct.small_business_eligible ? '' : ' — not eligible'}</span>
                <input type="checkbox" checked={ct.relief_applied} onChange={toggleSb} disabled={!ct.small_business_eligible} data-testid="ct-sb-election" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 0', fontWeight: 800, color: 'var(--text)' }}>
                <span>Taxable income</span><span style={{ fontFamily: 'DM Sans' }}>{fmt(ct.taxable_income)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)' }}>
                <b style={{ color: 'var(--text)' }}>CT payable @ {pct(ct.rate)}</b>
                <b style={{ fontFamily: 'DM Sans', color: 'var(--red)' }} data-testid="ct-payable">{fmt(ct.tax_payable)}</b>
              </div>
              {ct.filing_deadline && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>CT filing deadline (9 months after period end): <b>{ct.filing_deadline}</b></div>}
            </>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>{ct?.reason}</p>}
        </div>
      </div>

      {/* JE testing */}
      <div className="nn-card" style={{ padding: '14px 20px', marginTop: 14 }} data-testid="je-tests-card">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FlaskConical size={13} /> Journal-entry testing
          {je?.available && <span style={{ fontSize: 10.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>{fmt(je.entries_tested)} entries · {je.vouchers_tested} vouchers · {je.total_flags} flags</span>}
        </div>
        {je?.available ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {je.results.map(r => {
              const sev = SEV[r.severity];
              return (
                <div key={r.test} style={{ padding: '8px 12px', borderRadius: 8, background: sev.bg, border: `1px solid ${sev.fg}33` }} data-testid={`je-test-${r.test}`}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                    {r.title}<span style={{ color: sev.fg }}>{r.hits} flagged</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: r.sample.length ? 4 : 0 }}>{r.why}</div>
                  {r.sample.map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text)' }}>· {s.voucher_no} {s.date || ''} — AED {fmt(s.amount)} — {s.note} <span style={{ color: 'var(--muted)' }}>({s.description})</span></div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>{je?.reason}</p>}
      </div>

      {/* Risk memo */}
      <div className="nn-card" style={{ padding: '14px 20px', marginTop: 14 }} data-testid="risk-memo-card">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={13} /> Analytical risk memo</span>
          <button className="af-btn" onClick={generateMemo} disabled={busy === 'memo'} data-testid="risk-memo-generate">
            {busy === 'memo' ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />} {memo ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {memo ? (
          <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)' }} data-testid="risk-memo-body">{memo.memo}</div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Generates from the materiality, the JE-testing flags and the engagement figures — AI when configured, structured template otherwise.</p>
        )}
      </div>
    </div>
  );
};

export default AuditIntel;
