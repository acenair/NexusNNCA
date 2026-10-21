import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Plus, Download, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = ['This month', 'All issued', 'Pending', 'Credit notes', 'Cancelled'];
const AGEING_KEYS = [['current', 'Not yet due'], ['d30', '1–30 days past due'], ['d60', '31–60 days'], ['d90', '61–90 days'], ['p90', '90+ days']];

const BillingWorkspace = ({ initialTab }) => {
  const { user } = useOutletContext();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'ageing' ? 'Ageing' : (initialTab || 'Invoices & collections'));
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [invTab, setInvTab] = useState('All issued');
  const [staffFilter, setStaffFilter] = useState('');
  const [receiptFor, setReceiptFor] = useState(null);
  const [receipt, setReceipt] = useState({ amount: '', method: 'Bank transfer', reference: '', date: new Date().toISOString().slice(0, 10) });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ client_id: '', service_name: 'External Audit', amount: '', date: new Date().toISOString().slice(0, 10), due_date: '', staff: '' });
  const [saving, setSaving] = useState(false);
  const isPartner = user?.role === 'partner';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sum] = await Promise.all([
        axios.get(`${API}/invoices`, { withCredentials: true }),
        axios.get(`${API}/invoices/billing-summary?month=${month}`, { withCredentials: true }),
      ]);
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
      setSummary(sum.data);
      const [eng, cl, us] = await Promise.all([
        axios.get(`${API}/service/engagements`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/auth/users-list`, { withCredentials: true }),
      ]);
      setEngagements(Array.isArray(eng.data) ? eng.data : []);
      setClients(Array.isArray(cl.data) ? cl.data : []);
      setUsers(Array.isArray(us.data) ? us.data : []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const statusOf = (i) => {
    if (i.cancelled) return 'Cancelled';
    const due = i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + c.amount, 0);
    if (due <= 0.009) return 'Paid';
    if ((i.amount_paid || 0) > 0) return 'Part paid';
    if (i.due_date && i.due_date < new Date().toISOString().slice(0, 10)) return 'Overdue';
    return 'Unpaid';
  };
  const pendingOf = (i) => Math.max(0, i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + c.amount, 0));

  const monthInvoices = invoices.filter(i => (i.date || '').slice(0, 7) === month);
  const receipts = invoices.flatMap(i => (i.receipts || []).map(r => ({ ...r, inv: i }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthReceipts = receipts.filter(r => (r.date || '').slice(0, 7) === month);

  const TABS_INV = {
    'This month': monthInvoices,
    'All issued': invoices.filter(i => !i.cancelled),
    'Pending': invoices.filter(i => !i.cancelled && pendingOf(i) > 0.009),
    'Credit notes': invoices.filter(i => (i.credits || []).length > 0),
    'Cancelled': invoices.filter(i => i.cancelled),
  };
  const shown = TABS_INV[invTab].filter(i => !staffFilter || i.staff === staffFilter)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const readyToInvoice = engagements.filter(e => e.status === 'Active' && e.fee_amount > 0 &&
    !invoices.some(i => !i.cancelled && i.client_id === e.client_id && i.service_name === (e.service_type || '')));

  const saveReceipt = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/invoices/${receiptFor.invoice_id}/receipts?amount=${receipt.amount}&method=${encodeURIComponent(receipt.method)}&reference=${encodeURIComponent(receipt.reference)}&date=${receipt.date}`, {}, { withCredentials: true });
      setReceiptFor(null);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const createInvoice = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/invoices`, { ...form, amount: parseFloat(form.amount) }, { withCredentials: true });
      setShowCreate(false);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const exportCsv = () => {
    const rows = [['Invoice', 'Client', 'Service', 'Staff', 'Date', 'Due', 'Billed', 'Collected', 'Credits', 'Pending', 'Status']];
    invoices.forEach(i => rows.push([i.invoice_number, i.client_name, i.service_name, i.staff || '', i.date, i.due_date || '', i.amount, i.amount_paid || 0, (i.credits || []).reduce((n, c) => n + c.amount, 0), pendingOf(i), statusOf(i)]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `invoice-list-${month}.csv`;
    a.click();
  };

  if (loading || !summary) return <div className="page-loading">Loading billing workspace…</div>;

  const S = summary;
  const staffNames = [...new Set(invoices.map(i => i.staff).filter(Boolean))];
  const badge = (s) => s === 'Paid' ? 'af-badge-green' : s === 'Part paid' ? 'af-badge-blue' : s === 'Overdue' ? 'af-badge-red' : s === 'Cancelled' ? 'af-badge-grey' : 'af-badge-amber';

  return (
    <div className="ov-wrap" data-testid="billing-workspace">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">BILLING WORKSPACE</div>
          <h1>Invoices &amp; collections</h1>
          <p>See what was billed, what was collected, and what remains outstanding.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Reporting month">
            {Array.from({ length: 6 }, (_, k) => {
              const d = new Date(); d.setMonth(d.getMonth() - k);
              return <option key={d.toISOString().slice(0, 7)} value={d.toISOString().slice(0, 7)}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>;
            })}
          </select>
          {isPartner && <button className="af-btn" onClick={exportCsv}><Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Export invoice list</button>}
          {isPartner && <button className="af-btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} style={{ marginRight: 4 }} /> New invoice</button>}
        </div>
      </div>

      <div className="af-tabs" role="tablist">
        {['Invoices & collections', 'Client Billing', 'Ageing'].map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Invoices & collections' && (<>
        {/* 6 summary cards */}
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <section className="af-card af-metric"><span className="af-icon"><TrendingUp size={18} /></span><label>Billed for the month</label><b>{aed(S.billed_month)}</b><small>{S.count_month} issued invoices · credits {aed(S.credits_month)}</small></section>
          <section className="af-card af-metric"><span className="af-icon"><TrendingDown size={18} /></span><label>Collected during the month</label><b>{aed(S.collected_month)}</b><small>{aed(S.collected_month_current)} current-month · {aed(S.collected_month_older)} older invoices</small></section>
          <section className="af-card af-metric"><label>Pending for the month</label><b>{aed(S.pending_month)}</b><small>Unpaid balance of this month's invoices</small></section>
          <section className="af-card af-metric"><label>Billed till date</label><b>{aed(S.billed_total)}</b><small>All issued invoices</small></section>
          <section className="af-card af-metric"><label>Collected till date</label><b>{aed(S.collected_total)}</b><small>All dated receipts</small></section>
          <section className="af-card af-metric"><label>Pending till date</label><b>{aed(S.pending_total)}</b><small><span className="af-red-text">{aed(S.overdue_total)} overdue · {S.overdue_count} invoices</span></small></section>
        </div>

        {/* Receivables movement */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Receivables movement</h2><div className="af-sub">Entire receivables ledger · {fmt(month + '-01')} – {fmt(new Date().toISOString().slice(0, 10))}</div></div></div>
          <div className="af-movement">
            <div><span>Collected till date</span><b>{aed(S.collected_total)}</b></div>
            <div><span>+ Billed till date</span><b>{aed(S.billed_total)}</b></div>
            <div><span>− Credits issued</span><b>{aed(S.credits_total)}</b></div>
            <div><span>= Pending till date</span><b>{aed(S.pending_total)}</b></div>
          </div>
        </section>

        {/* Collections */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Collections during the month</h2><div className="af-sub">Dated receipts · includes collections against prior-month invoices</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>RECEIPT / DATE</th><th>CUSTOMER / INVOICE</th><th>METHOD / REFERENCE</th><th>COLLECTED</th></tr></thead>
              <tbody>
                {monthReceipts.map(r => (
                  <tr key={r.receipt_id}>
                    <td><b>{r.receipt_id}</b><small>{fmt(r.date)}</small></td>
                    <td><b>{r.inv.client_name}</b><small>{r.inv.invoice_number} · {r.inv.staff}</small></td>
                    <td>{r.method}<small>{r.reference}</small></td>
                    <td><b>{aed(r.amount)}</b></td>
                  </tr>
                ))}
                {monthReceipts.length === 0 && <tr><td colSpan="4" className="af-empty">No receipts recorded in this month.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="af-note">{monthReceipts.length} receipts shown · Displayed collections: {aed(S.collected_month)}</p>
        </section>

        {/* Invoice summary */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead">
            <div><h2>Invoice summary</h2><div className="af-sub">{shown.length} records · pending {aed(TABS_INV[invTab].reduce((n, i) => n + pendingOf(i), 0))} · all amounts AED</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} aria-label="Filter by staff">
                <option value="">All responsible staff</option>
                {staffNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="af-tabs" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            {TABS.map(t => (
              <button key={t} role="tab" aria-selected={invTab === t} onClick={() => setInvTab(t)}>{t} ({TABS_INV[t].length})</button>
            ))}
          </div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>INVOICE / CUSTOMER</th><th>SERVICE / STAFF</th><th>DATE / DUE</th><th>BILLED</th><th>COLLECTED</th><th>CREDIT</th><th>PENDING</th><th>STATUS</th><th></th></tr></thead>
              <tbody>
                {shown.slice(0, 60).map(i => {
                  const credits = (i.credits || []).reduce((n, c) => n + c.amount, 0);
                  return (
                    <tr key={i.invoice_id}>
                      <td><b>{i.invoice_number}</b><small>{i.client_name}</small></td>
                      <td>{i.service_name}<small>{i.staff}</small></td>
                      <td>{fmt(i.date)}<small>Due {fmt(i.due_date)}</small></td>
                      <td>{aed(i.amount)}</td>
                      <td>{aed(i.amount_paid || 0)}</td>
                      <td>{credits ? aed(credits) : '0'}</td>
                      <td><b>{aed(pendingOf(i))}</b></td>
                      <td><span className={`af-badge ${badge(statusOf(i))}`}>{statusOf(i)}</span></td>
                      <td>{isPartner && !i.cancelled && pendingOf(i) > 0.009 && (
                        <button className="af-link" onClick={() => { setReceiptFor(i); setReceipt({ ...receipt, amount: pendingOf(i) }); }}>Record receipt</button>
                      )}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan="9" className="af-empty">No invoices in this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pending by staff + priorities */}
        <div className="af-grid af-grid-3" style={{ marginTop: 16 }}>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Pending by staff</h2><div className="af-sub">Till date · click-free view</div></div></div>
            {Object.entries(S.pending_by_staff || {}).sort((a, b) => b[1].pending - a[1].pending).map(([s, v]) => (
              <div className="af-mini" key={s}><span>{s}</span><b>{aed(v.pending)} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>({v.count} pending · {aed(v.overdue_amt)} overdue)</small></b></div>
            ))}
            <div className="af-mini af-stage-total"><span>Total pending</span><b>{aed(S.pending_total)}</b></div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Collection priorities</h2><div className="af-sub">Where follow-up matters most</div></div></div>
            <div className="af-mini"><span><AlertTriangle size={12} style={{ verticalAlign: -2, color: 'var(--red)' }} /> Overdue</span><b className="af-red-text">{aed(S.overdue_total)} · {S.overdue_count} invoices</b></div>
            {invoices.filter(i => !i.cancelled && statusOf(i) === 'Overdue').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5).map(i => (
              <div className="af-mini" key={i.invoice_id}><span>{i.client_name}</span><b>{aed(pendingOf(i))} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>· {i.invoice_number}</small></b></div>
            ))}
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Ageing</h2><div className="af-sub">Unpaid balances by days past due</div></div></div>
            {AGEING_KEYS.map(([k, label]) => (
              <div className="af-mini" key={k}><span>{label}</span><b>{aed(S.ageing[k])}</b></div>
            ))}
          </section>
        </div>
      </>)}

      {tab === 'Client Billing' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Ready to invoice</h2><div className="af-sub">Active engagements with an agreed fee and no invoice issued yet</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>CLIENT</th><th>SERVICE</th><th>ASSIGNED</th><th>AGREED FEE</th><th></th></tr></thead>
              <tbody>
                {readyToInvoice.map(e => (
                  <tr key={e.engagement_id}>
                    <td><b>{e.client_name}</b></td>
                    <td>{e.service_type}</td>
                    <td>{e.assigned_to_name || '—'}</td>
                    <td><b>{aed(e.fee_amount)}</b></td>
                    <td><button className="af-link" onClick={() => { setForm({ ...form, client_id: e.client_id, service_name: e.service_type, amount: String(e.fee_amount), staff: e.assigned_to_name || '' }); setShowCreate(true); }}>Prepare invoice →</button></td>
                  </tr>
                ))}
                {readyToInvoice.length === 0 && <tr><td colSpan="5" className="af-empty">No engagements waiting to be invoiced. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="af-note">Billing readiness is based on agreed fees from the client master. Amounts exclude tax.</p>
        </section>
      )}

      {tab === 'Ageing' && (
        <section className="af-card">
          <div className="af-cardhead"><div><h2>Receivables ageing</h2><div className="af-sub">Unpaid balances by days past due</div></div></div>
          <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {AGEING_KEYS.map(([k, label]) => (
              <section className="af-card af-metric" key={k} style={{ border: '1px solid var(--line)' }}>
                <label>{label}</label><b>{aed(S.ageing[k])}</b><small>&nbsp;</small>
              </section>
            ))}
          </div>
        </section>
      )}

      {/* Record receipt modal */}
      {receiptFor && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setReceiptFor(null)}>
          <div className="af-dialog" data-testid="receipt-modal">
            <button className="af-close" onClick={() => setReceiptFor(null)}>×</button>
            <h2>Record receipt</h2>
            <p className="af-sub">{receiptFor.invoice_number} · {receiptFor.client_name} · pending {aed(pendingOf(receiptFor))}</p>
            <div className="af-formrow"><label>Amount (AED) *</label>
              <input type="number" value={receipt.amount} onChange={e => setReceipt({ ...receipt, amount: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Method</label>
              <select value={receipt.method} onChange={e => setReceipt({ ...receipt, method: e.target.value })}>
                {['Bank transfer', 'Cheque cleared', 'Cash'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Reference</label>
              <input value={receipt.reference} onChange={e => setReceipt({ ...receipt, reference: e.target.value })} placeholder="TRF-1234" />
            </div>
            <div className="af-formrow"><label>Date</label>
              <input type="date" value={receipt.date} onChange={e => setReceipt({ ...receipt, date: e.target.value })} />
            </div>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={saveReceipt} disabled={saving || !receipt.amount} data-testid="save-receipt-btn">{saving ? 'Saving…' : 'Save receipt'}</button>
          </div>
        </div>
      )}

      {/* New invoice modal */}
      {showCreate && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setShowCreate(false)}>
          <div className="af-dialog" data-testid="create-invoice-modal">
            <button className="af-close" onClick={() => setShowCreate(false)}>×</button>
            <h2>New invoice</h2>
            <div className="af-formrow"><label>Client *</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Service</label>
              <input value={form.service_name} onChange={e => setForm({ ...form, service_name: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Amount (AED) *</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Invoice date</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Due date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="af-formrow"><label>Responsible staff</label>
              <select value={form.staff} onChange={e => setForm({ ...form, staff: e.target.value })}>
                <option value="">—</option>
                {users.filter(u => u.role !== 'client').map(u => <option key={u.user_id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={createInvoice} disabled={saving || !form.client_id || !form.amount} data-testid="create-invoice-submit">{saving ? 'Creating…' : 'Create invoice'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingWorkspace;
