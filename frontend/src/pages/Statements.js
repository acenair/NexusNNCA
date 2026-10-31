import React, { useState, useEffect } from 'react';
import { FileText, ShieldCheck, Download, Loader2, Scale } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

const GROUP_COLOR = { Assets: '#0e6db4', Liabilities: '#b45309', Equity: '#7c3aed', Income: '#15803d', Expenses: '#be123c' };

/* Rows renderer: label + amount + optional adjustment note */
const Rows = ({ rows, totalLabel, totalValue, testid }) => (
  <div style={{ marginBottom: 14 }} data-testid={testid}>
    {rows.filter(([, v, adj]) => Math.abs(v) > 0.005 || Math.abs(adj) > 0.005).map(([label, value, adj]) => (
      <div key={label} style={{ display: 'flex', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--nn-border)', fontSize: 12.5 }}>
        <span style={{ flex: 1, color: 'var(--text)' }}>{label}</span>
        <span style={{ width: 110, textAlign: 'right', fontFamily: 'DM Sans', fontWeight: 600, color: 'var(--text)' }}>{fmt(value)}</span>
        {adj ? <span style={{ width: 92, textAlign: 'right', fontSize: 10, color: '#0e6db4', fontStyle: 'italic' }}>{adj > 0 ? '+' : ''}{fmt(adj)} adj</span>
             : <span style={{ width: 92 }} />}
      </div>
    ))}
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '7px 0', marginTop: 2, borderTop: '2px solid var(--line)', fontSize: 13 }}>
      <span style={{ flex: 1, fontWeight: 700, color: 'var(--text)' }}>{totalLabel}</span>
      <span style={{ width: 110, textAlign: 'right', fontFamily: 'DM Sans', fontWeight: 800, color: 'var(--text)' }}>{fmt(totalValue)}</span>
      <span style={{ width: 92 }} />
    </div>
  </div>
);

const Statements = ({ engagementId, isPartner }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/statements/${engagementId}`, { withCredentials: true });
      setData(res.data);
    } catch (e) { setError('Failed to load statements'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const exportPack = async () => {
    setBusy('pack'); setError('');
    try {
      const res = await axios.get(`${API}/statements/${engagementId}/pack`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `deliverable-pack-${(data?.client_name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      await load();
    } catch (e) { setError('Deliverable pack export failed'); }
    finally { setBusy(''); }
  };

  const setFramework = async (framework) => {
    setBusy('framework'); setError('');
    try {
      await axios.patch(`${API}/statements/${engagementId}`, { framework }, { withCredentials: true });
      await load();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to set framework'); }
    finally { setBusy(''); }
  };

  const exportPdf = async () => {
    setBusy('pdf'); setError('');
    try {
      const res = await axios.get(`${API}/statements/${engagementId}/pdf`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-statements-${(data?.client_name || 'engagement').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      await load();
    } catch (e) { setError('PDF export failed'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Preparing statements…</div>;
  if (!data?.available) {
    return (
      <div style={{ margin: '0 20px' }} data-testid="statements-empty">
        <div className="nn-card" style={{ padding: 32, textAlign: 'center' }}>
          <FileText size={28} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', marginBottom: 4 }}>No statements yet</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>
            Import the client's books or trial balance in the Trial Balance tab — the statements build themselves from
            the mapped lines and posted adjustments.
          </p>
        </div>
      </div>
    );
  }

  const is = data.income_statement;
  const bs = data.balance_sheet;
  const bal = data.balance_check;

  return (
    <div style={{ margin: '0 20px' }} data-testid="statements-view">
      {/* Status bar */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }} data-testid="statements-statusbar">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)' }}>Statements</div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{data.client_name} · {data.period}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#eaf3fb', color: '#0e6db4' }} data-testid="statements-framework">
          {data.framework}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{data.posted_ajes} posted AJEs (AED {fmt(data.total_adjustments)}) included</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={data.framework} onChange={e => setFramework(e.target.value)} disabled={busy === 'framework'}
            data-testid="statements-framework-select"
            style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }}>
            <option>IFRS for SMEs</option>
            <option>Full IFRS</option>
          </select>
          <button className="af-btn" onClick={exportPdf} disabled={busy === 'pdf'} data-testid="statements-export-pdf">
            {busy === 'pdf' ? <Loader2 size={12} className="spin" /> : <Download size={12} />} Export PDF
          </button>
          <button className="af-btn" onClick={exportPack} disabled={busy === 'pack'} title="Cover + statements + cash flow + notes + checklist + AJE register + adjusted TB"
            data-testid="statements-export-pack" style={{ color: '#0e6db4', borderColor: '#45afe8' }}>
            {busy === 'pack' ? <Loader2 size={12} className="spin" /> : <FileText size={12} />} Deliverable pack
          </button>
        </div>
      </div>

      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="statements-error">{error}</div>}

      {/* Balance check banner */}
      <div className="nn-card" style={{ padding: '12px 20px', marginBottom: 14, background: bal.balanced ? '#f0f7f2' : '#fdecec', border: `1px solid ${bal.balanced ? '#cfe5d6' : '#f4cbc7'}` }} data-testid="statements-balance-check">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: bal.balanced ? 'var(--green)' : 'var(--red)' }}>
          <Scale size={14} />
          {bal.balanced
            ? `Balance check PASSED — assets AED ${fmt(bs.total_assets)} = liabilities AED ${fmt(bs.total_liabilities)} + equity AED ${fmt(bs.total_equity)}`
            : `Balance check FAILED — assets AED ${fmt(bs.total_assets)} vs liabilities + equity AED ${fmt(round2(bs.total_liabilities + bs.total_equity))} (difference AED ${fmt(bal.difference)})`}
        </div>
        {!bal.balanced && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Check the trial balance and adjustment postings in the Trial Balance and Adjustments tabs.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* P&L */}
        <div className="nn-card" style={{ padding: '14px 20px' }} data-testid="statements-pl">
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <FileText size={14} color="#15803d" /> Statement of profit or loss
          </h3>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>For the period {data.period}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR.Income, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Income</div>
          <Rows rows={is.income} totalLabel="Total income" totalValue={is.total_income} testid="statements-income" />
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR.Expenses, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Expenses</div>
          <Rows rows={is.expenses} totalLabel="Total expenses" totalValue={is.total_expenses} testid="statements-expenses" />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--off, #f7fafc)', fontSize: 13.5 }}>
            <b style={{ color: 'var(--text)' }}>Net profit for the year</b>
            <b style={{ fontFamily: 'DM Sans', color: is.net_profit >= 0 ? 'var(--green)' : 'var(--red)' }} data-testid="statements-net-profit">{fmt(is.net_profit)}</b>
          </div>
        </div>

        {/* Balance sheet */}
        <div className="nn-card" style={{ padding: '14px 20px' }} data-testid="statements-bs">
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Scale size={14} color="#0e6db4" /> Statement of financial position
          </h3>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>As at the end of the period</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR.Assets, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Assets</div>
          <Rows rows={bs.assets} totalLabel="Total assets" totalValue={bs.total_assets} testid="statements-assets" />
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR.Liabilities, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Liabilities</div>
          <Rows rows={bs.liabilities} totalLabel="Total liabilities" totalValue={bs.total_liabilities} testid="statements-liabilities" />
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_COLOR.Equity, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Equity</div>
          <Rows rows={bs.equity} totalLabel="Total equity" totalValue={bs.total_equity} testid="statements-equity" />
        </div>
      </div>

      <div className="nn-card" style={{ padding: '12px 20px', marginTop: 14 }}>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, display: 'flex', gap: 6, alignItems: 'center' }} data-testid="statements-basis">
          <ShieldCheck size={12} /> Basis: {data.framework}. Figures are the adjusted trial balance — {data.posted_ajes} posted AJEs (AED {fmt(data.total_adjustments)}). Notes and disclosures are prepared at the review stage.
        </p>
      </div>

      <CashFlow engagementId={engagementId} />
    </div>
  );
};

const round2 = (n) => Math.round(n * 100) / 100;

/* Cash flow (indirect) panel */
const CashFlow = ({ engagementId }) => {
  const [cf, setCf] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/statements/${engagementId}/cashflow`, { withCredentials: true });
        setCf(res.data);
      } catch (e) { setCf({ available: false, reason: 'Failed to load' }); }
      finally { setLoading(false); }
    })();
  }, [engagementId]);

  if (loading) return <div className="nn-card" style={{ padding: '14px 20px', marginTop: 14, color: 'var(--muted)', fontSize: 12 }}>Building the cash flow…</div>;
  if (!cf?.available) {
    return (
      <div className="nn-card" style={{ padding: '12px 20px', marginTop: 14 }} data-testid="cashflow-unavailable">
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>{cf?.reason || 'Cash flow not available yet.'}</p>
      </div>
    );
  }

  const o = cf.operating;
  return (
    <div className="nn-card" style={{ padding: '14px 20px', marginTop: 14 }} data-testid="cashflow-view">
      <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: '0 0 2px' }}>Statement of cash flows (indirect method)</h3>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>For the period {cf.period} — movements from the ingested books</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Operating</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
            <span style={{ color: 'var(--text)' }}>Net profit</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(o.net_profit)}</b>
          </div>
          {Math.abs(o.depreciation) > 0.005 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
              <span style={{ color: 'var(--text)' }}>Depreciation & amortisation</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(o.depreciation)}</b>
            </div>
          )}
          {o.working_capital.map(([ln, a]) => (
            <div key={ln} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
              <span style={{ color: 'var(--muted)' }}>(inc)/dec in {ln.toLowerCase()}</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(a)}</b>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', fontWeight: 800, color: 'var(--text)' }}>
            <span>Net cash from operations</span><span style={{ fontFamily: 'DM Sans' }}>{fmt(o.net_operating)}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0e6db4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Investing</div>
          {cf.investing.rows.map(([ln, a]) => (
            <div key={ln} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
              <span style={{ color: 'var(--muted)' }}>Purchase of {ln.toLowerCase()}</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(a)}</b>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', fontWeight: 800, color: 'var(--text)' }}>
            <span>Net cash used in investing</span><span style={{ fontFamily: 'DM Sans' }}>{fmt(cf.investing.net_investing)}</span>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 4px' }}>Financing</div>
          {cf.financing.rows.map(([ln, a]) => (
            <div key={ln} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
              <span style={{ color: 'var(--muted)' }}>{ln} — movement</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(a)}</b>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', fontWeight: 800, color: 'var(--text)' }}>
            <span>Net cash from financing</span><span style={{ fontFamily: 'DM Sans' }}>{fmt(cf.financing.net_financing)}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Cash reconciliation</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
            <span style={{ color: 'var(--muted)' }}>Net change in cash</span><b style={{ fontFamily: 'DM Sans' }} data-testid="cashflow-net-change">{fmt(cf.net_change)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--nn-border)' }}>
            <span style={{ color: 'var(--muted)' }}>Cash at start of period</span><b style={{ fontFamily: 'DM Sans' }}>{fmt(cf.cash_opening)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', fontWeight: 800, color: 'var(--text)' }}>
            <span>Cash at end of period</span><span style={{ fontFamily: 'DM Sans' }}>{fmt(cf.cash_closing)}</span>
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: cf.tie.reconciled ? '#f0f7f2' : '#fdecec', color: cf.tie.reconciled ? 'var(--green)' : 'var(--red)' }}
            data-testid="cashflow-tie">
            {cf.tie.reconciled ? '✓ Ties to the movement in the books' : `✗ Difference AED ${fmt(cf.tie.difference)}`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statements;
