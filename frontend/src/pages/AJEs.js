import React, { useState, useEffect, useRef } from 'react';
import { Scale, Plus, CheckCircle2, Undo2, Trash2, Loader2, ArrowRightLeft } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const aed = (n) => 'AED ' + (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Typeahead account picker over the imported TB accounts */
const AccountTypeahead = ({ accounts, value, onPick, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const filtered = accounts.filter(a => !q || a.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 170 }}>
      <input value={open ? q : (value || '')}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(''); }}
        placeholder={placeholder || 'account…'}
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box' }} />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(23,53,76,0.15)', maxHeight: 220, overflowY: 'auto' }}>
          {accounts.length === 0 && <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted)' }}>Import the trial balance first.</div>}
          {filtered.map(a => (
            <div key={a} onClick={() => { setOpen(false); onPick(a); }}
              style={{ padding: '7px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--nn-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eaf3fb'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{a}</div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted)' }}>No matching account</div>}
        </div>
      )}
    </div>
  );
};

const AJEs = ({ engagementId, isPartner }) => {
  const [ajes, setAjes] = useState([]);
  const [counts, setCounts] = useState({});
  const [finalData, setFinalData] = useState(null);
  const [tbAccounts, setTbAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ description: '', amount: '', debit_account: '', credit_account: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [a, f, t] = await Promise.all([
        axios.get(`${API}/service/engagements/${engagementId}/ajes`, { withCredentials: true }),
        axios.get(`${API}/tb/${engagementId}/final`, { withCredentials: true }).catch(() => ({ data: { available: false } })),
        axios.get(`${API}/tb/${engagementId}`, { withCredentials: true }),
      ]);
      setAjes(a.data.ajes || []);
      setCounts(a.data.counts || {});
      setFinalData(f.data);
      setTbAccounts((t.data.rows || []).map(r => r.account));
    } catch (e) { setError('Failed to load adjustments'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const add = async () => {
    if (!form.description.trim() || !form.amount || !form.debit_account || !form.credit_account) {
      setError('Fill the description, amount and both accounts.'); return;
    }
    setSaving(true); setError('');
    try {
      await axios.post(`${API}/service/engagements/${engagementId}/ajes`, form, { withCredentials: true });
      setForm({ description: '', amount: '', debit_account: '', credit_account: '' });
      await load();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to add adjustment'); }
    finally { setSaving(false); }
  };

  const act = async (path) => {
    try { await axios.post(`${API}/ajes/${path}`, {}, { withCredentials: true }); await load(); }
    catch (e) { alert(e.response?.data?.detail || 'Action failed'); }
  };
  const del = async (id) => {
    if (!window.confirm('Delete this proposed adjustment?')) return;
    try { await axios.delete(`${API}/ajes/${id}`, { withCredentials: true }); await load(); }
    catch (e) { alert(e.response?.data?.detail || 'Delete failed'); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading adjustments…</div>;

  return (
    <div style={{ margin: '0 20px', marginBottom: 20 }} data-testid="ajes-view">
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }} data-testid="aje-summary">
        <div className="nn-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Proposed</div>
          <b style={{ fontSize: 19, color: '#b45309' }}>{counts.proposed || 0}</b>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{aed(counts.proposed_value || 0)}</div>
        </div>
        <div className="nn-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Posted (signed off)</div>
          <b style={{ fontSize: 19, color: 'var(--green)' }}>{counts.posted || 0}</b>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{aed(counts.posted_value || 0)}</div>
        </div>
        <div className="nn-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Net effect on profit</div>
          <b style={{ fontSize: 19 }}>{finalData?.available ? aed(finalData.total_adjustments) : '—'}</b>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{finalData?.posted_ajes || 0} posted AJEs</div>
        </div>
      </div>

      {/* Add form */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Scale size={13} /> Propose an adjustment
        </div>
        <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="What and why — e.g. 'Accrue December electricity bill not yet recorded'"
          data-testid="aje-description-input"
          style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            placeholder="Amount (AED)" data-testid="aje-amount-input"
            style={{ width: 140, padding: '8px 10px', fontSize: 12, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--text)' }} />
          <AccountTypeahead accounts={tbAccounts} value={form.debit_account} onPick={a => setForm(p => ({ ...p, debit_account: a }))} placeholder="Debit account" />
          <ArrowRightLeft size={13} color="var(--muted)" />
          <AccountTypeahead accounts={tbAccounts} value={form.credit_account} onPick={a => setForm(p => ({ ...p, credit_account: a }))} placeholder="Credit account" />
          <button className="tbtn tbtn-gold" onClick={add} disabled={saving} data-testid="aje-add-btn">
            {saving ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Add
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
        {tbAccounts.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Import the trial balance first — adjustments are booked against its accounts.</div>}
      </div>

      {/* Register */}
      <div className="nn-card" style={{ overflow: 'hidden' }} data-testid="aje-register">
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)' }}>
          <h3 style={{ fontSize: 14, fontFamily: 'DM Sans', color: 'var(--text)', margin: 0 }}>Adjustments register</h3>
        </div>
        {ajes.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            No adjustments yet. Propose corrections above — they update the final statement figures once the partner signs off.
          </div>
        )}
        {ajes.map(a => (
          <div key={a.aje_id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--nn-border)' }} data-testid={`aje-${a.aje_id}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 12, color: '#01457C' }}>{a.ref}</b>
              <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, minWidth: 200 }}>{a.description}</span>
              <b style={{ fontSize: 12.5 }}>{aed(a.amount)}</b>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: a.status === 'Posted' ? '#f0f7f2' : '#fdf6ec', color: a.status === 'Posted' ? 'var(--green)' : '#b45309' }} data-testid={`aje-status-${a.aje_id}`}>{a.status}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Dr <b style={{ color: '#be123c' }}>{a.debit_account}</b>
              <ArrowRightLeft size={11} />
              Cr <b style={{ color: '#15803d' }}>{a.credit_account}</b>
              {a.status === 'Posted' ? <> · signed off by {a.signed_off_by}</> : <> · raised by {a.raised_by}</>}
            </div>
            {isPartner && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                {a.status === 'Proposed'
                  ? <button className="af-btn" onClick={() => act(`${a.aje_id}/signoff`)} data-testid={`aje-signoff-${a.aje_id}`}><CheckCircle2 size={12} /> Sign off</button>
                  : <button className="af-btn" onClick={() => act(`${a.aje_id}/unsignoff`)} data-testid={`aje-unsignoff-${a.aje_id}`}><Undo2 size={12} /> Undo sign-off</button>}
                {a.status === 'Proposed' && (
                  <button className="af-btn" onClick={() => del(a.aje_id)} data-testid={`aje-delete-${a.aje_id}`} style={{ color: 'var(--red)' }}><Trash2 size={12} /> Delete</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Final adjusted figures */}
      {finalData?.available && finalData.lines?.length > 0 && (
        <div className="nn-card" style={{ padding: '14px 20px', marginTop: 14 }} data-testid="final-lines">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8 }}>
            Final statement figures (trial balance as adjusted)
          </div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>STATEMENT LINE</th><th>PER TB</th><th>ADJUSTMENTS</th><th>FINAL</th></tr></thead>
              <tbody>
                {finalData.lines.map(l => (
                  <tr key={l.line}>
                    <td><b>{l.line}</b></td>
                    <td>{aed(l.pre)}</td>
                    <td style={{ color: l.adj ? '#b45309' : 'var(--muted)' }}>{l.adj ? `${l.adj > 0 ? '+' : ''}${aed(l.adj).replace('AED ', '')}` : '—'}</td>
                    <td><b>{aed(l.final)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="af-note">PER TB = the client's trial balance; FINAL = after posted adjustments. These figures feed the IFRS statement builder.</p>
        </div>
      )}
    </div>
  );
};

export default AJEs;
