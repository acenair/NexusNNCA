import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Link2, AlertTriangle, CheckCircle2, FileText, Plus, Trash2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TXN_TYPES = ["Goods", "Services", "Interest / Loans", "Royalties / IP", "Asset transfer", "Guarantees", "Cost sharing", "Other"];
const METHODS = ["CUP", "Resale Price", "Cost Plus", "TNMM", "Profit Split", "Not set"];
const RELATIONSHIPS = ["Parent / Subsidiary", "Same ownership", "Director / Owner", "Relative of owner", "Associate / Partner", "Other"];
const fmtAED = (n) => 'AED ' + (Number(n) || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 });

export default function TransferPricing() {
  const { user } = useOutletContext();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [fy, setFy] = useState(String(new Date().getFullYear()));
  const [cps, setCps] = useState([]);
  const [txns, setTxns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('register');
  const [profile, setProfile] = useState({ annual_revenue_aed: '', mne_group: false, mne_group_revenue_aed: '' });
  const [localFile, setLocalFile] = useState(null);
  const [cpForm, setCpForm] = useState({ name: '', jurisdiction: 'UAE', relationship: 'Parent / Subsidiary', ct_rate: 9, is_connected_person: false });
  const [txnForm, setTxnForm] = useState({ counterparty_id: '', txn_type: 'Services', amount_aed: '', method: 'Not set', far_note: '' });
  const [test, setTest] = useState({ comparables: '', actual: '' });
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    axios.get(`${API}/clients`, { withCredentials: true }).then(r => {
      const list = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.clients) ? r.data.clients : []);
      setClients(list);
      if (list.length) setClientId(c => c || list[0].client_id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/tp/${clientId}/counterparties`, { withCredentials: true }).then(r => setCps(Array.isArray(r.data?.counterparties) ? r.data.counterparties : [])).catch(() => {});
    axios.get(`${API}/tp/${clientId}/transactions`, { withCredentials: true }).then(r => setTxns(Array.isArray(r.data?.transactions) ? r.data.transactions : [])).catch(() => {});
    axios.get(`${API}/tp/${clientId}/summary`, { withCredentials: true }).then(r => setSummary(r.data)).catch(() => {});
    loadProfile();
    setForm(null);
    setLocalFile(null);
  }, [clientId, fy]);

  const loadProfile = async () => {
    if (!clientId) return;
    const res = await axios.get(`${API}/clients`, { withCredentials: true });
    const c = (Array.isArray(res.data) ? res.data : []).find(x => x.client_id === clientId) || {};
    setProfile({ annual_revenue_aed: c.annual_revenue_aed || '', mne_group: !!c.mne_group, mne_group_revenue_aed: c.mne_group_revenue_aed || '' });
  };

  const saveProfile = async () => {
    try {
      await axios.patch(`${API}/clients/${clientId}`, {
        annual_revenue_aed: profile.annual_revenue_aed === '' ? undefined : Number(profile.annual_revenue_aed),
        mne_group: profile.mne_group,
        mne_group_revenue_aed: profile.mne_group_revenue_aed === '' ? undefined : Number(profile.mne_group_revenue_aed),
      }, { withCredentials: true });
      await refreshSummary();
    } catch (e) { alert(e.response?.data?.detail || 'Only the Managing Partner can edit the client profile'); }
  };

  const generateLocalFile = async () => {
    const res = await axios.post(`${API}/tp/${clientId}/local-file`, { fy }, { withCredentials: true });
    setLocalFile(res.data);
  };

  const addCp = async () => {
    if (!cpForm.name) return;
    const res = await axios.post(`${API}/tp/${clientId}/counterparties`, cpForm, { withCredentials: true });
    setCps(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
    setCpForm({ name: '', jurisdiction: 'UAE', relationship: 'Parent / Subsidiary', ct_rate: 9, is_connected_person: false });
  };

  const addTxn = async () => {
    if (!txnForm.counterparty_id || !txnForm.amount_aed) return;
    const res = await axios.post(`${API}/tp/${clientId}/transactions`, { ...txnForm, fy }, { withCredentials: true });
    setTxns(prev => [res.data, ...prev]);
    setTxnForm({ counterparty_id: '', txn_type: 'Services', amount_aed: '', method: 'Not set', far_note: '' });
    refreshSummary();
  };

  const delTxn = async (id) => {
    await axios.delete(`${API}/tp/${clientId}/transactions/${id}`, { withCredentials: true });
    setTxns(prev => prev.filter(t => t.txn_id !== id));
    refreshSummary();
  };

  const refreshSummary = async () => {
    const res = await axios.get(`${API}/tp/${clientId}/summary`, { withCredentials: true });
    setSummary(res.data);
  };

  const runTest = async () => {
    const comparables = test.comparables.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    const res = await axios.post(`${API}/tp/${clientId}/arm-length-test`,
      { comparables, actual: parseFloat(test.actual) }, { withCredentials: true });
    setTestResult(res.data);
  };

  const generateForm = async () => {
    const res = await axios.post(`${API}/tp/${clientId}/disclosure-form`, { fy }, { withCredentials: true });
    setForm(res.data);
  };

  const cpName = (id) => cps.find(c => c.cp_id === id)?.name || id;

  return (
    <div className="fade-in" data-testid="tp-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--blue)', fontWeight: 700 }}>UAE CORPORATE TAX · MD 97/2023</div>
          <h1 style={{ margin: '4px 0', fontSize: 26, letterSpacing: -0.5, color: 'var(--text)' }}>Transfer pricing</h1>
          <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Related party register, threshold monitor, disclosure form and arm's length testing per the CT Law (Art. 34–35, 55) and the FTA TP Guide.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={clientId} onChange={e => setClientId(e.target.value)} data-testid="tp-client-picker"
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--text)', minWidth: 220 }}>
            {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
          </select>
          <select value={fy} onChange={e => setFy(e.target.value)} data-testid="tp-fy-picker"
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--text)' }}>
            {[0, -1, -2].map(d => <option key={d} value={new Date().getFullYear() + d}>{new Date().getFullYear() + d}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '16px 0', borderBottom: '1px solid var(--nn-border)' }} data-testid="tp-tabs">
        {[['profile', 'Client tax profile'], ['register', 'Related party register'], ['monitor', 'Threshold monitor'], ['disclosure', 'Disclosure form'], ['test', "Arm's length test"], ['localfile', 'Local File']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tp-tab-${k}`}
            style={{ padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: tab === k ? 700 : 400, color: tab === k ? 'var(--blue)' : 'var(--muted)', borderBottom: tab === k ? '2px solid var(--blue)' : '2px solid transparent' }}>{label}</button>
        ))}
      </div>

      {tab === 'register' && (
        <div>
          <div className="nn-card" style={{ padding: 18, marginBottom: 14 }} data-testid="tp-counterparties-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Related parties &amp; connected persons</div>
            {cps.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>No counterparties yet — add everyone this client transacts with that isn't at arm's length.</div>}
            {cps.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }} data-testid="tp-counterparties-table">
                <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Name</th><th style={{ padding: '6px 8px' }}>Jurisdiction</th>
                  <th style={{ padding: '6px 8px' }}>Relationship</th><th style={{ padding: '6px 8px' }}>CT rate</th>
                  <th style={{ padding: '6px 8px' }}>Connected person</th><th></th>
                </tr></thead>
                <tbody>
                  {cps.map(c => (
                    <tr key={c.cp_id} style={{ borderTop: '1px solid var(--nn-border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{c.name}</td>
                      <td style={{ padding: '6px 8px' }}>{c.jurisdiction}</td>
                      <td style={{ padding: '6px 8px' }}>{c.relationship}</td>
                      <td style={{ padding: '6px 8px' }}>{c.ct_rate}%{c.ct_rate !== 9 ? ' ⚠' : ''}</td>
                      <td style={{ padding: '6px 8px' }}>{c.is_connected_person ? 'Yes' : '—'}</td>
                      <td style={{ padding: '6px 8px' }}><button onClick={async () => { try { await axios.delete(`${API}/tp/${clientId}/counterparties/${c.cp_id}`, { withCredentials: true }); setCps(prev => prev.filter(x => x.cp_id !== c.cp_id)); } catch (e) { alert(e.response?.data?.detail || 'Delete failed'); } }} data-testid={`tp-cp-del-${c.cp_id}`}><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Name" value={cpForm.name} onChange={e => setCpForm({ ...cpForm, name: e.target.value })} data-testid="tp-cp-name" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)' }} />
              <input placeholder="Jurisdiction" value={cpForm.jurisdiction} onChange={e => setCpForm({ ...cpForm, jurisdiction: e.target.value })} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', width: 110 }} />
              <select value={cpForm.relationship} onChange={e => setCpForm({ ...cpForm, relationship: e.target.value })} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)' }}>
                {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
              </select>
              <select value={cpForm.ct_rate} onChange={e => setCpForm({ ...cpForm, ct_rate: Number(e.target.value) })} data-testid="tp-cp-rate" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', width: 120 }}>
                {[0, 9].map(r => <option key={r} value={r}>{r}% ({r === 0 ? 'Free zone 0%' : 'Mainland 9%'})</option>)}
              </select>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={cpForm.is_connected_person} onChange={e => setCpForm({ ...cpForm, is_connected_person: e.target.checked })} /> Connected person
              </label>
              <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={addCp} data-testid="tp-cp-add"><Plus size={11} /> Add</button>
            </div>
          </div>

          <div className="nn-card" style={{ padding: 18 }} data-testid="tp-transactions-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Controlled transactions — FY {fy}</div>
            {txns.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }} data-testid="tp-transactions-table">
                <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Counterparty</th><th style={{ padding: '6px 8px' }}>Type</th>
                  <th style={{ padding: '6px 8px' }}>Amount</th><th style={{ padding: '6px 8px' }}>Method</th>
                  <th style={{ padding: '6px 8px' }}>FAR note</th><th></th>
                </tr></thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.txn_id} style={{ borderTop: '1px solid var(--nn-border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{t.counterparty_name || cpName(t.counterparty_id)}</td>
                      <td style={{ padding: '6px 8px' }}>{t.txn_type}</td>
                      <td style={{ padding: '6px 8px' }}>{fmtAED(t.amount_aed)}</td>
                      <td style={{ padding: '6px 8px' }}>{t.method === 'Not set' ? <span style={{ color: 'var(--gold)' }}>Set method</span> : t.method}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.far_note || '—'}</td>
                      <td style={{ padding: '6px 8px' }}><button onClick={() => delTxn(t.txn_id)} data-testid={`tp-txn-del-${t.txn_id}`}><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={txnForm.counterparty_id} onChange={e => setTxnForm({ ...txnForm, counterparty_id: e.target.value })} data-testid="tp-txn-cp"
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)' }}>
                <option value="">Counterparty…</option>
                {cps.map(c => <option key={c.cp_id} value={c.cp_id}>{c.name}</option>)}
              </select>
              <select value={txnForm.txn_type} onChange={e => setTxnForm({ ...txnForm, txn_type: e.target.value })} data-testid="tp-txn-type" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)' }}>
                {TXN_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input placeholder="Amount (AED)" type="number" value={txnForm.amount_aed} onChange={e => setTxnForm({ ...txnForm, amount_aed: e.target.value })} data-testid="tp-txn-amount" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', width: 130 }} />
              <select value={txnForm.method} onChange={e => setTxnForm({ ...txnForm, method: e.target.value })} data-testid="tp-txn-method" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)' }}>
                {METHODS.map(m2 => <option key={m2}>{m2}</option>)}
              </select>
              <input placeholder="Functions / assets / risks" value={txnForm.far_note} onChange={e => setTxnForm({ ...txnForm, far_note: e.target.value })} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', width: 220 }} />
              <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={addTxn} data-testid="tp-txn-add"><Plus size={11} /> Add</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'monitor' && summary && (
        <div data-testid="tp-monitor">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
            {[
              ['TP Disclosure Form', summary.thresholds.disclosure_form_required, summary.thresholds.disclosure_reason],
              ['Local + Master File', summary.thresholds.local_master_file_required, summary.thresholds.files_reason],
              ['Country-by-Country', summary.thresholds.cbcr_required, 'UAE ultimate parent, group ≥ AED 3.15B'],
            ].map(([label, required, reason]) => (
              <div key={label} className="nn-card" style={{ padding: 18 }} data-testid={`tp-monitor-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {required ? <AlertTriangle size={15} color="var(--gold)" /> : <CheckCircle2 size={15} color="var(--green)" />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: required ? 'var(--gold)' : 'var(--green)' }}>{required ? 'REQUIRED' : 'Not required'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{reason}</div>
              </div>
            ))}
          </div>
          <div className="nn-card" style={{ padding: 18 }} data-testid="tp-monitor-detail">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>FY {fy} position</div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>Related-party transactions: <b>{fmtAED(summary.totals.rpt_total)}</b> (form threshold: AED 40M)</div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>Connected-person payments: <b>{fmtAED(summary.totals.connected_person_total)}</b> (threshold: AED 500K)</div>
            {Object.keys(summary.thresholds.disclosable_categories_over_4m).length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gold)', marginTop: 8 }} data-testid="tp-disclosable-cats">
                Categories over AED 4M (each must be disclosed): {Object.entries(summary.thresholds.disclosable_categories_over_4m).map(([k, v]) => `${k} ${fmtAED(v)}`).join(' · ')}
              </div>
            )}
            {summary.thresholds.freezone_rate_flags.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gold)', marginTop: 8 }} data-testid="tp-freezone-flags">
                {summary.thresholds.freezone_rate_flags.map((f, i) => <div key={i}>⚠ {f.counterparty}: {f.reason}</div>)}
              </div>
            )}
            {summary.completeness.methods_not_set > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>⚠ {summary.completeness.methods_not_set} transaction(s) still need a pricing method.</div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>The arm's length principle applies regardless of thresholds — keep the register current even when nothing is required.</div>
          </div>
        </div>
      )}

      {tab === 'disclosure' && (
        <div className="nn-card" style={{ padding: 18 }} data-testid="tp-disclosure">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>TP Disclosure Form — pre-filled data</div>
            <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={generateForm} data-testid="tp-disclosure-generate"><FileText size={12} /> Generate for FY {fy}</button>
          </div>
          {!form && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Click Generate to build the disclosure data from the register.</div>}
          {form && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }} data-testid="tp-disclosure-summary">
                {form.client_name} · FY {form.fy} · RPT total {fmtAED(form.total_rpt)} · Connected persons {fmtAED(form.connected_person_total)} · Form required: <b>{form.disclosure_form_required ? 'Yes' : 'No'}</b>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} data-testid="tp-disclosure-table">
                <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Category</th><th style={{ padding: '6px 8px' }}>Counterparty</th>
                  <th style={{ padding: '6px 8px' }}>Jurisdiction</th><th style={{ padding: '6px 8px' }}>Amount</th>
                  <th style={{ padding: '6px 8px' }}>Method</th><th style={{ padding: '6px 8px' }}>Disclose</th>
                </tr></thead>
                <tbody>
                  {form.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--nn-border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.category}</td>
                      <td style={{ padding: '6px 8px' }}>{r.counterparty}</td>
                      <td style={{ padding: '6px 8px' }}>{r.jurisdiction}</td>
                      <td style={{ padding: '6px 8px' }}>{fmtAED(r.amount_aed)}</td>
                      <td style={{ padding: '6px 8px' }}>{r.method}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: r.disclose ? 'var(--gold)' : 'var(--muted)' }}>{r.disclose ? 'Yes (over AED 4M)' : 'Below threshold'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Use this data to complete the TP Disclosure Form in EmaraTax together with the CT return (due 9 months after FY end).</div>
            </div>
          )}
        </div>
      )}

      {tab === 'test' && (
        <div className="nn-card" style={{ padding: 18, maxWidth: 640 }} data-testid="tp-test-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>Arm's length test (interquartile range)</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Paste the comparables' profit-level indicators (e.g. operating margins %) from any source — internal CUP evidence, an outsourced study, or a database export — and the client's actual result.</p>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Comparables (comma-separated, 4+ values)</div>
          <textarea value={test.comparables} onChange={e => setTest({ ...test, comparables: e.target.value })} rows={2} data-testid="tp-test-comparables"
            placeholder="e.g. 1.9, 2.4, 3.1, 3.6, 4.2, 5.0"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontFamily: 'monospace', marginBottom: 10 }} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Client's actual result (%)</div>
          <input type="number" step="0.01" value={test.actual} onChange={e => setTest({ ...test, actual: e.target.value })} data-testid="tp-test-actual"
            style={{ width: 160, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', marginBottom: 10 }} />
          <div>
            <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={runTest} disabled={!test.comparables || !test.actual} data-testid="tp-test-run">Run test</button>
          </div>
          {testResult && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 8, border: `1px solid ${testResult.inside_iqr ? 'var(--green)' : 'var(--gold)'}`, background: testResult.inside_iqr ? 'rgba(8,126,115,0.06)' : 'rgba(211,152,53,0.08)' }} data-testid="tp-test-result">
              <div style={{ fontSize: 13, fontWeight: 700, color: testResult.inside_iqr ? 'var(--green)' : 'var(--gold)' }}>
                {testResult.inside_iqr ? '✓ Within the arm\'s length range' : '⚠ Outside the interquartile range'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 6 }}>
                IQR: {testResult.q1} – {testResult.q3} (median {testResult.median}) · Actual: {testResult.actual}
              </div>
              {testResult.exposure && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{testResult.exposure}</div>}
            </div>
          )}
        </div>
      )}
      {tab === 'profile' && (
        <div className="nn-card" style={{ padding: 18, maxWidth: 640 }} data-testid="tp-profile-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>Client tax profile</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Drives the Pillar Two / DMTT deadline, the statutory-audit threshold flag (revenue &gt; AED 3.15M) and the TP Local/Master File requirement.</p>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Annual revenue (AED)</div>
          <input type="number" value={profile.annual_revenue_aed} onChange={e => setProfile({ ...profile, annual_revenue_aed: e.target.value })} data-testid="tp-profile-revenue"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', marginBottom: 10 }} />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={profile.mne_group} onChange={e => setProfile({ ...profile, mne_group: e.target.checked })} data-testid="tp-profile-mne" /> Part of an MNE group
          </label>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>MNE group consolidated revenue (AED)</div>
          <input type="number" value={profile.mne_group_revenue_aed} onChange={e => setProfile({ ...profile, mne_group_revenue_aed: e.target.value })} data-testid="tp-profile-mne-rev"
            disabled={!profile.mne_group}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', marginBottom: 12 }} />
          <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={saveProfile} data-testid="tp-profile-save">Save profile</button>
        </div>
      )}

      {tab === 'localfile' && (
        <div className="nn-card" style={{ padding: 18 }} data-testid="tp-localfile-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Local File — OECD Ch. V structure</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} onClick={generateLocalFile} data-testid="tp-localfile-generate"><FileText size={12} /> Assemble for FY {fy}</button>
              {localFile && <button className="tbtn tbtn-gold" style={{ fontSize: 11 }} onClick={() => window.print()} data-testid="tp-localfile-print">Print / Save PDF</button>}
            </div>
          </div>
          {!localFile && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Click Assemble to build the Local File from the register, FAR notes and threshold position.</div>}
          {localFile && (
            <div data-testid="tp-localfile-doc">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                {localFile.client_name} · FY {localFile.fy} · {localFile.local_master_file_required ? 'Local File REQUIRED (MD 97/2023)' : 'Below MD 97 thresholds — maintain contemporaneously anyway'}
              </div>
              {localFile.sections.map(s2 => (
                <div key={s2.title} style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{s2.title}</div>
                  {s2.body && <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{s2.body}</div>}
                  {s2.rows.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginTop: 6 }}>
                      <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                        <th style={{ padding: '5px 8px' }}>Counterparty</th><th style={{ padding: '5px 8px' }}>Type / note</th>
                        <th style={{ padding: '5px 8px' }}>Amount</th><th style={{ padding: '5px 8px' }}>Method</th>
                      </tr></thead>
                      <tbody>
                        {s2.rows.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--nn-border)' }}>
                            <td style={{ padding: '5px 8px', color: 'var(--text)' }}>{r.counterparty}</td>
                            <td style={{ padding: '5px 8px' }}>{r.type}{r.far && r.far !== '-' ? ` — ${r.far}` : ''}</td>
                            <td style={{ padding: '5px 8px' }}>{r.amount_aed != null ? fmtAED(r.amount_aed) : '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{r.method || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}