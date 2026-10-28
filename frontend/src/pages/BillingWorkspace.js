import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Plus, Download, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';
import AnimatedNumber from '../components/AnimatedNumber';
import Sparkline from '../components/Sparkline';
import Skeleton from '../components/Skeleton';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = ['This month', 'All issued', 'Pending', 'Drafts', 'Credit notes', 'Cancelled'];
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
  const [asDraft, setAsDraft] = useState(false);
  const [form, setForm] = useState({ client_id: '', service_name: 'External Audit', amount: '', vat_percent: '5', date: new Date().toISOString().slice(0, 10), due_date: '', staff: '' });
  const [saving, setSaving] = useState(false);
  const [invQ, setInvQ] = useState('');
  const [rcptQ, setRcptQ] = useState('');
  const [rcptStaff, setRcptStaff] = useState('');
  const [costFor, setCostFor] = useState(null);
  const [costRows, setCostRows] = useState([]);
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
    if (i.status === 'Draft') return 'Draft';
    const due = i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + c.amount, 0);
    if (due <= 0.009) return 'Paid';
    if ((i.amount_paid || 0) > 0) return 'Part paid';
    if (i.due_date && i.due_date < new Date().toISOString().slice(0, 10)) return 'Overdue';
    return 'Unpaid';
  };
  const pendingOf = (i) => Math.max(0, i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((n, c) => n + c.amount, 0));

  // Per-staff hourly costing (mockup: allocated vs actual hours & internal cost per staff member)
  const costSummary = (e) => {
    const sc = e.staff_costs || [];
    if (sc.length) {
      const t = { alloc: 0, act: 0, rem: 0, budget: 0, actual: 0, forecast: 0, hasStaff: true };
      sc.forEach(s => {
        t.alloc += s.allocated_hours || 0; t.act += s.actual_hours || 0; t.rem += s.remaining_hours || 0;
        t.budget += (s.allocated_hours || 0) * (s.budget_rate || 0);
        t.actual += (s.actual_hours || 0) * (s.actual_rate || 0);
        t.forecast += ((s.actual_hours || 0) + (s.remaining_hours || 0)) * (s.actual_rate || 0);
      });
      return t;
    }
    const rate = e.budget_cost_rate || 150;
    return { alloc: e.allocated_hours || 0, act: e.actual_hours || 0, rem: 0, budget: (e.allocated_hours || 0) * rate, actual: (e.actual_hours || 0) * rate, forecast: (e.actual_hours || 0) * rate, hasStaff: false };
  };
  const costOutcome = (e, t) => {
    if (e.status !== 'Completed') return (t.forecast > t.budget || (t.alloc && (t.act + t.rem) > t.alloc)) ? 'Forecast overrun' : 'Forecast within budget';
    if (t.act > t.alloc) return 'Over allocated';
    if (t.act === t.alloc) return 'Within allocation';
    return 'Under allocated';
  };
  const costingEngagements = engagements.filter(e => (e.staff_costs || []).length || e.allocated_hours || e.actual_hours);
  const costTotals = costingEngagements.map(e => ({ e, t: costSummary(e) }));
  const completedCost = costTotals.filter(({ e }) => e.status === 'Completed');
  const ongoingCost = costTotals.filter(({ e }) => e.status !== 'Completed');
  const openCostEditor = (e) => {
    setCostFor(e);
    setCostRows((e.staff_costs || []).length ? e.staff_costs.map(s => ({ ...s })) : [{ name: e.assigned_to_name || '', allocated_hours: e.allocated_hours || 0, actual_hours: e.actual_hours || 0, remaining_hours: 0, budget_rate: e.budget_cost_rate || 150, actual_rate: e.budget_cost_rate || 150 }]);
  };
  const saveCost = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/service/engagements/${costFor.engagement_id}`, { staff_costs: costRows }, { withCredentials: true });
      setCostFor(null);
      await load();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    setSaving(false);
  };

  const cancelledInvoices = invoices.filter(i => i.cancelled);

  const monthInvoices = invoices.filter(i => (i.date || '').slice(0, 7) === month);
  const receipts = invoices.flatMap(i => (i.receipts || []).map(r => ({ ...r, inv: i }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthReceipts = receipts.filter(r => (r.date || '').slice(0, 7) === month);

  // 6-month trend series for the KPI sparklines
  const months6 = Array.from({ length: 6 }, (_, k) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - k)); return d.toISOString().slice(0, 7); });
  const seriesBilled = months6.map(m => invoices.filter(i => !i.cancelled && i.status !== 'Draft' && (i.date || '').slice(0, 7) === m).reduce((n, i) => n + (i.amount || 0), 0));
  const seriesCollected = months6.map(m => invoices.reduce((n, i) => n + (i.receipts || []).filter(r => (r.date || '').slice(0, 7) === m).reduce((n, r) => n + (r.amount || 0), 0), 0));
  const seriesPending = months6.map(m => invoices.filter(i => !i.cancelled && i.status !== 'Draft' && (i.date || '').slice(0, 7) === m)
    .reduce((n, i) => n + Math.max(0, i.amount - (i.amount_paid || 0) - (i.credits || []).reduce((x, c) => x + c.amount, 0)), 0));

  const TABS_INV = {
    'This month': monthInvoices.filter(i => i.status !== 'Draft'),
    'All issued': invoices.filter(i => !i.cancelled && i.status !== 'Draft'),
    'Pending': invoices.filter(i => !i.cancelled && i.status !== 'Draft' && pendingOf(i) > 0.009),
    'Drafts': invoices.filter(i => i.status === 'Draft'),
    'Credit notes': invoices.filter(i => (i.credits || []).length > 0),
    'Cancelled': invoices.filter(i => i.cancelled),
  };
  const shown = TABS_INV[invTab].filter(i => !staffFilter || i.staff === staffFilter)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const readyToInvoice = engagements.filter(e => e.status === 'Active' && e.fee_amount > 0 &&
    !(e.milestones || []).length &&
    !invoices.some(i => !i.cancelled && i.client_id === e.client_id && i.service_name === (e.service_type || '')));

  // Milestone queue: each engagement's payment-terms milestones; a milestone is 'invoiced'
  // when an issued invoice exists for that client+service at/above the milestone amount
  const milestoneQueue = [];
  engagements.filter(e => (e.milestones || []).length > 0).forEach(e => {
    const clientIssued = invoices.filter(i => !i.cancelled && i.status !== 'Draft' && i.client_id === e.client_id);
    const covered = clientIssued.reduce((n, i) => n + (i.net_amount != null ? i.net_amount : i.amount), 0);
    let cum = 0;
    e.milestones.forEach((ms, idx) => {
      cum += ms.amount || 0;
      milestoneQueue.push({
        client_id: e.client_id, client_name: e.client_name, service_type: e.service_type,
        assigned_to_name: e.assigned_to_name, payment_terms: (e.terms || {}).payment_terms || '',
        fee: e.fee_amount, label: ms.label, amount: ms.amount,
        kind: idx === 0 ? 'advance' : 'draft',
        invoiced: covered >= cum - 0.009,
      });
    });
  });

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
      const net = parseFloat(form.amount) || 0, vatPct = parseFloat(form.vat_percent) || 0;
      await axios.post(`${API}/invoices`, { ...form, net_amount: net, vat_percent: vatPct, amount: Math.round(net * (1 + vatPct / 100) * 100) / 100, status: asDraft ? 'Draft' : 'Unpaid' }, { withCredentials: true });
      setShowCreate(false);
      setAsDraft(false);
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

  if (loading || !summary) return <div className="ov-wrap" data-testid="billing-skeleton"><div className="ov-heading"><div><div className="ov-eyebrow">BILLING WORKSPACE</div><h1>Invoices &amp; collections</h1></div></div><Skeleton kpi={6} rows={8} cols={5} /></div>;

  const S = summary;
  const staffNames = [...new Set(invoices.map(i => i.staff).filter(Boolean))];

  // Period-based receivables movement (mockup: Opening + Billed − Credits − Collected = Closing)
  const monthStart = `${month}-01`;
  const creditBefore = (i, cut) => (i.credits || []).filter(c => (c.date || i.date) < cut).reduce((n, c) => n + c.amount, 0);
  const openingOutstanding = invoices.filter(i => !i.cancelled && i.status !== 'Draft' && i.date && i.date < monthStart)
    .reduce((n, i) => n + i.amount
      - (i.receipts || []).filter(r => r.date < monthStart).reduce((a, r) => a + r.amount, 0)
      - creditBefore(i, monthStart), 0);
  const closingOutstanding = openingOutstanding + (S.billed_month || 0) - (S.credits_month || 0) - (S.collected_month || 0);

  // Filtered collections + invoice search
  const shownReceipts = monthReceipts
    .filter(r => !rcptStaff || r.inv.staff === rcptStaff)
    .filter(r => (r.receipt_id + ' ' + (r.inv.client_name || '') + ' ' + (r.inv.invoice_number || '') + ' ' + (r.inv.staff || '') + ' ' + (r.reference || '')).toLowerCase().includes(rcptQ.toLowerCase()));
  const shownInv = shown.filter(i => (i.invoice_number + ' ' + i.client_name + ' ' + i.service_name + ' ' + (i.staff || '')).toLowerCase().includes(invQ.toLowerCase()));
  const exportReceipts = () => {
    const rows = [['Receipt', 'Receipt date', 'Customer', 'Invoice', 'Invoice month', 'Responsible staff', 'Method', 'Reference', 'Collected AED']];
    shownReceipts.forEach(r => rows.push([r.receipt_id, r.date, r.inv.client_name, r.inv.invoice_number, (r.inv.date || '').slice(0, 7), r.inv.staff || '', r.method, r.reference || '', r.amount]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `collections-${month}.csv`;
    a.click();
  };
  const previewReminder = () => {
    const overdue = invoices.filter(i => !i.cancelled && i.status !== 'Draft' && statusOf(i) === 'Overdue');
    if (!overdue.length) { alert('No overdue invoices — nothing to remind.'); return; }
    const lines = overdue.slice(0, 8).map(i => `• ${i.invoice_number} · ${i.client_name} · ${aed(pendingOf(i))} (due ${fmt(i.due_date)})`);
    alert(`Collection reminder PREVIEW — nothing is sent.\n\nDear client,\nPlease note the following outstanding invoices:\n\n${lines.join('\n')}\n\nTotal overdue: ${aed(S.overdue_total)} across ${S.overdue_count} invoice(s).\n\nKindly arrange settlement at your earliest convenience.\n\n— Nair & Nelliyatt Chartered Accountants`);
  };
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
        {['Invoices & collections', 'Client Billing', 'Hourly Costing', 'Ageing'].map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Invoices & collections' && (<>
        {/* 6 summary cards */}
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <section className="af-card af-metric"><span className="af-icon"><TrendingUp size={18} /></span><label>Billed for the month</label><b><AnimatedNumber value={S.billed_month} format={aed} /></b><span className="af-spark"><Sparkline data={seriesBilled} color="#0e6db4" /></span><small>{S.count_month} issued invoices · credits {aed(S.credits_month)}</small></section>
          <section className="af-card af-metric"><span className="af-icon"><TrendingDown size={18} /></span><label>Collected during the month</label><b><AnimatedNumber value={S.collected_month} format={aed} /></b><span className="af-spark"><Sparkline data={seriesCollected} color="#0e7ec4" /></span><small>{aed(S.collected_month_current)} current-month · {aed(S.collected_month_older)} older invoices</small></section>
          <section className="af-card af-metric"><label>Pending for the month</label><b><AnimatedNumber value={S.pending_month} format={aed} /></b><span className="af-spark"><Sparkline data={seriesPending} color="#d39835" /></span><small>Unpaid balance of this month's invoices</small></section>
          <section className="af-card af-metric"><label>Billed till date</label><b><AnimatedNumber value={S.billed_total} format={aed} /></b><small>All issued invoices</small></section>
          <section className="af-card af-metric"><label>Collected till date</label><b><AnimatedNumber value={S.collected_total} format={aed} /></b><small>All dated receipts</small></section>
          <section className="af-card af-metric"><label>Pending till date</label><b><AnimatedNumber value={S.pending_total} format={aed} /></b><small><span className="af-red-text">{aed(S.overdue_total)} overdue · {S.overdue_count} invoices</span></small></section>
        </div>

        {/* Receivables movement */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Receivables movement</h2><div className="af-sub">{fmt(monthStart)} – {fmt(new Date().toISOString().slice(0, 10))} · Entire receivables ledger, including older invoices</div></div></div>
          <div className="af-movement">
            <div><span>Opening outstanding</span><b>{aed(openingOutstanding)}</b></div>
            <div><span>+ Billed in month</span><b>{aed(S.billed_month)}</b></div>
            <div><span>− Credits issued</span><b>{aed(S.credits_month)}</b></div>
            <div><span>− Cash collected</span><b>{aed(S.collected_month)}</b></div>
            <div><span>= Closing outstanding</span><b>{aed(closingOutstanding)}</b></div>
          </div>
        </section>

        {/* Collections */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Collections during the month</h2><div className="af-sub">Dated receipts · includes collections against prior-month invoices</div></div>
            {isPartner && <button className="af-btn" onClick={exportReceipts}>↓ Export collections</button>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input value={rcptQ} onChange={e => setRcptQ(e.target.value)} placeholder="Search receipt, customer or invoice…" aria-label="Search collections"
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }} />
            <select value={rcptStaff} onChange={e => setRcptStaff(e.target.value)} aria-label="Filter collections by staff">
              <option value="">All responsible staff</option>
              {staffNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>RECEIPT / DATE</th><th>CUSTOMER / INVOICE</th><th>INVOICE MONTH</th><th>METHOD / REFERENCE</th><th>COLLECTED</th></tr></thead>
              <tbody>
                {shownReceipts.map(r => {
                  const prior = (r.inv.date || '').slice(0, 7) !== month;
                  return (
                    <tr key={r.receipt_id}>
                      <td><b>{r.receipt_id}</b><small>{fmt(r.date)}</small></td>
                      <td><b>{r.inv.client_name}</b><small>{r.inv.invoice_number} · {r.inv.staff}</small></td>
                      <td><span className={`af-badge ${prior ? 'af-badge-grey' : 'af-badge-green'}`}>{prior ? 'Prior month' : 'Current month'}</span><small>{fmt(r.inv.date)}</small></td>
                      <td>{r.method}<small>{r.reference}</small></td>
                      <td><b>{aed(r.amount)}</b></td>
                    </tr>
                  );
                })}
                {shownReceipts.length === 0 && <tr><td colSpan="5" className="af-empty">No collections match this period and filter.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="af-note">{shownReceipts.length} receipts shown of {monthReceipts.length} · Staff is the invoice owner · Displayed collections: {aed(shownReceipts.reduce((n, r) => n + r.amount, 0))}</p>
        </section>

        {/* Invoice summary */}
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead">
            <div><h2>Invoice summary</h2><div className="af-sub">{shownInv.length} records · pending {aed(TABS_INV[invTab].reduce((n, i) => n + pendingOf(i), 0))} · all amounts AED</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={invQ} onChange={e => setInvQ(e.target.value)} placeholder="Search customer or invoice…" aria-label="Search invoices"
                style={{ padding: '9px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', minWidth: 200 }} />
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
              <thead><tr><th>INVOICE / CUSTOMER</th><th>SERVICE / STAFF</th><th>DATE / DUE</th><th>BILLED</th><th>COLLECTED</th><th>CREDIT</th><th>PENDING</th><th>STATUS</th><th></th><th></th></tr></thead>
              <tbody>
                {shownInv.slice(0, 60).map(i => {
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
                      <td><a className="af-link" href={`${API}/invoices/${i.invoice_id}/pdf`} target="_blank" rel="noreferrer" data-testid={`pdf-${i.invoice_id}`}>PDF</a></td>
                      <td>{isPartner && i.status === 'Draft' && (
                        <button className="af-link" data-testid={`issue-${i.invoice_id}`} onClick={async () => {
                          await axios.post(`${API}/invoices/${i.invoice_id}/issue`, {}, { withCredentials: true }); await load();
                        }}>Issue →</button>
                      )}</td>
                      <td>{isPartner && !i.cancelled && i.status !== 'Draft' && pendingOf(i) > 0.009 && (
                        <button className="af-link" onClick={() => { setReceiptFor(i); setReceipt({ ...receipt, amount: pendingOf(i) }); }}>Record receipt</button>
                      )}</td>
                    </tr>
                  );
                })}
                {shownInv.length === 0 && <tr><td colSpan="11" className="af-empty">No invoices in this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pending by staff + priorities */}
        <div className="af-grid af-grid-2" style={{ marginTop: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Credit notes</h2><div className="af-sub">Cumulative · reduce outstanding balances</div></div></div>
            {invoices.filter(i => (i.credits || []).length).map(i => (i.credits || []).map((c, ci) => (
              <div className="af-mini" key={i.invoice_id + '-' + ci}><span>{i.client_name}<small style={{ display: 'block', color: 'var(--muted)' }}>Against {i.invoice_number}{c.reason ? ` · ${c.reason}` : ''}</small></span><b>{aed(c.amount)}</b></div>
            )))}
            <div className="af-mini af-stage-total"><span>Total credits</span><b>{aed(S.credits_total)}</b></div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Cancelled invoices</h2><div className="af-sub">Excluded from all totals · no collectible balance</div></div></div>
            {cancelledInvoices.map(i => (
              <div className="af-mini" key={i.invoice_id}><span>{i.invoice_number} · {i.client_name}<small style={{ display: 'block', color: 'var(--muted)' }}>{i.staff || '—'}{i.cancel_reason ? ` · Reason: ${i.cancel_reason}` : ''}</small></span><b>{aed(i.amount)}</b></div>
            ))}
            {cancelledInvoices.length === 0 && <p className="af-note">No cancelled invoices.</p>}
            <div className="af-mini af-stage-total"><span>Total cancelled</span><b>{aed(cancelledInvoices.reduce((n, i) => n + i.amount, 0))}</b></div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Pending by staff</h2><div className="af-sub">Till date · click-free view</div></div></div>
            {Object.entries(S.pending_by_staff || {}).sort((a, b) => b[1].pending - a[1].pending).map(([s, v]) => (
              <div className="af-mini" key={s}><span>{s}</span><b>{aed(v.pending)} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>({v.count} pending · {aed(v.overdue_amt)} overdue)</small></b></div>
            ))}
            <div className="af-mini af-stage-total"><span>Total pending</span><b>{aed(S.pending_total)}</b></div>
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Collection priorities</h2><div className="af-sub">Where follow-up matters most</div></div></div>
            {(() => {
              const next = invoices.filter(i => !i.cancelled && i.status !== 'Draft' && pendingOf(i) > 0.009)
                .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))[0];
              return next ? (
                <div className="af-mini"><span>Next payment due</span><b>{fmt(next.due_date)} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>· {next.client_name} · {aed(pendingOf(next))}</small></b></div>
              ) : null;
            })()}
            <div className="af-mini"><span><AlertTriangle size={12} style={{ verticalAlign: -2, color: 'var(--red)' }} /> Overdue</span><b className="af-red-text">{aed(S.overdue_total)} · {S.overdue_count} invoices</b></div>
            {invoices.filter(i => !i.cancelled && statusOf(i) === 'Overdue').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5).map(i => (
              <div className="af-mini" key={i.invoice_id}><span>{i.client_name}</span><b>{aed(pendingOf(i))} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>· {i.invoice_number}</small></b></div>
            ))}
            {isPartner && <button className="af-btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={previewReminder}>Preview collection reminder</button>}
          </section>
          <section className="af-card">
            <div className="af-cardhead"><div><h2>Ageing</h2><div className="af-sub">Unpaid balances by days past due</div></div></div>
            {AGEING_KEYS.map(([k, label]) => (
              <div className="af-mini" key={k}><span>{label}</span><b>{aed(S.ageing[k])}</b></div>
            ))}
          </section>
        </div>
      </>)}

      {tab === 'Client Billing' && (<>
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <section className="af-card af-metric"><label>Advance billing ready</label><b><AnimatedNumber value={milestoneQueue.filter(m => m.kind === 'advance' && !m.invoiced).reduce((n, m) => n + m.amount, 0)} format={aed} /></b><small>{milestoneQueue.filter(m => m.kind === 'advance' && !m.invoiced).length} milestones · engagement signed</small></section>
          <section className="af-card af-metric"><label>Draft-stage billing ready</label><b><AnimatedNumber value={milestoneQueue.filter(m => m.kind === 'draft' && !m.invoiced).reduce((n, m) => n + m.amount, 0)} format={aed} /></b><small>{milestoneQueue.filter(m => m.kind === 'draft' && !m.invoiced).length} milestones · later milestones</small></section>
          <section className="af-card af-metric"><label>Prepared invoice drafts</label><b><AnimatedNumber value={summary.drafts_total} format={aed} /></b><small>{summary.drafts_count} drafts · not issued</small></section>
        </div>
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Billing action queue</h2><div className="af-sub">Milestones from each engagement's payment terms · fee amounts exclude tax</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>CLIENT / ENGAGEMENT</th><th>MILESTONE</th><th>AGREED FEE</th><th>MILESTONE AMOUNT</th><th>STATUS</th><th></th></tr></thead>
              <tbody>
                {milestoneQueue.map((m, idx) => (
                  <tr key={idx}>
                    <td><b>{m.client_name}</b><small>{m.service_type} · terms: {m.payment_terms}</small></td>
                    <td>{m.label}</td>
                    <td>{aed(m.fee)}</td>
                    <td><b>{aed(m.amount)}</b></td>
                    <td><span className={`af-badge ${m.invoiced ? 'af-badge-green' : 'af-badge-amber'}`}>{m.invoiced ? 'Invoiced' : 'Ready'}</span></td>
                    <td>{!m.invoiced && <button className="af-link" onClick={() => { setForm({ ...form, client_id: m.client_id, service_name: m.service_type, amount: String(m.amount), staff: m.assigned_to_name || '' }); setAsDraft(true); setShowCreate(true); }}>Prepare draft →</button>}</td>
                  </tr>
                ))}
                {milestoneQueue.length === 0 && <tr><td colSpan="6" className="af-empty">No milestone plans yet — add payment terms (e.g. "50% Advance, 50% Draft Report") when creating engagements.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="af-note">No automatic invoice posting — drafts you prepare are separate records until issued. Ready-to-invoice without milestone plans: {readyToInvoice.length} engagement(s).</p>
        </section>
      </>)}

      {tab === 'Hourly Costing' && (
        <>
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <section className="af-card af-metric"><label>Allocated hours</label><b>{Math.round(costTotals.reduce((n, { t }) => n + t.alloc, 0))} hrs</b><small>{costTotals.length} jobs in this view</small></section>
          <section className="af-card af-metric"><label>Actual hours</label><b>{Math.round(costTotals.reduce((n, { t }) => n + t.act, 0))} hrs</b><small>Recorded effort to date</small></section>
          <section className="af-card af-metric"><label>Budgeted internal cost</label><b><AnimatedNumber value={costTotals.reduce((n, { t }) => n + t.budget, 0)} format={aed} /></b><small>Staff-specific budget cost rates</small></section>
          <section className="af-card af-metric"><label>Actual internal cost</label><b><AnimatedNumber value={costTotals.reduce((n, { t }) => n + t.actual, 0)} format={aed} /></b><small>Incl. incomplete jobs</small></section>
        </div>
        <div className="af-kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 }}>
          <section className="af-card af-metric"><label>Completed job performance</label><b>{completedCost.length} completed</b><small>Net hour variance {(() => { const v = completedCost.reduce((n, { t }) => n + (t.act - t.alloc), 0); return `${v >= 0 ? '+' : ''}${Math.round(v)}h`; })()} · net cost {aed(completedCost.reduce((n, { t }) => n + (t.actual - t.budget), 0))}</small></section>
          <section className="af-card af-metric"><label>In-progress cost forecast</label><b><AnimatedNumber value={ongoingCost.reduce((n, { t }) => n + t.forecast, 0)} format={aed} /></b><small>{ongoingCost.length} ongoing · {Math.round(ongoingCost.reduce((n, { t }) => n + t.rem, 0))}h remaining effort</small></section>
        </div>
        <section className="af-card" style={{ marginTop: 16 }}>
          <div className="af-cardhead"><div><h2>Job time &amp; cost comparison</h2><div className="af-sub">Budget = Σ allocated hrs × budget rate · Actual = Σ actual hrs × actual rate · positive variance = over</div></div></div>
          <div className="af-tablewrap">
            <table className="af-table">
              <thead><tr><th>CLIENT / JOB</th><th>STATUS</th><th>ALLOCATED HRS</th><th>ACTUAL HRS</th><th>VARIANCE</th><th>BUDGET COST</th><th>ACTUAL COST</th><th>OUTCOME</th><th></th></tr></thead>
              <tbody>
                {costTotals.map(({ e, t }) => {
                  const vh = t.act - t.alloc;
                  const outcome = costOutcome(e, t);
                  const oc = outcome === 'Over allocated' || outcome === 'Forecast overrun' ? 'af-badge-red' : outcome === 'Under allocated' || outcome === 'Forecast within budget' ? 'af-badge-green' : 'af-badge-blue';
                  return (
                    <tr key={e.engagement_id}>
                      <td><b>{e.client_name}</b><small>{e.service_type}{t.hasStaff ? ` · ${e.staff_costs.length} staff allocations` : ''}</small></td>
                      <td>{e.status}</td>
                      <td>{t.alloc || '—'}</td>
                      <td>{t.act || '—'}</td>
                      <td>{t.alloc ? `${vh >= 0 ? '+' : ''}${Math.round(vh)}h` : '—'}</td>
                      <td>{t.alloc ? aed(t.budget) : '—'}</td>
                      <td>{t.act ? aed(t.actual) : '—'}</td>
                      <td><span className={`af-badge ${oc}`}>{outcome}</span></td>
                      <td>{isPartner && <button className="af-link" onClick={() => openCostEditor(e)}>Staff breakdown / edit</button>}</td>
                    </tr>
                  );
                })}
                {costTotals.length === 0 && (
                  <tr><td colSpan="9" className="af-empty">No hours recorded yet. Open a job's staff breakdown to add allocations — the table activates as the costing fills.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="af-note">Honest note: the firm has no per-job time ledger yet — allocated and actual hours are manual entries per staff member until Attendance feeds a job-level ledger. Budget and actual rates can differ; internal costs only, not customer billing.</p>
        </section>
        </>
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
            <div className="af-formrow"><label>Amount net of VAT (AED) *</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="af-formrow"><label>VAT %</label>
              <select value={form.vat_percent} onChange={e => setForm({ ...form, vat_percent: e.target.value })}>
                {['5', '0'].map(v => <option key={v} value={v}>{v === '5' ? '5% (standard rated)' : '0% (out of scope)'}</option>)}
              </select>
            </div>
            <div className="af-formrow"><label>Invoice total (gross)</label>
              <input readOnly value={form.amount ? (Math.round((parseFloat(form.amount) || 0) * (1 + (parseFloat(form.vat_percent) || 0) / 100) * 100) / 100).toLocaleString() : ''} style={{ background: 'var(--surface)' }} />
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', margin: '10px 0' }}>
              <input type="checkbox" checked={asDraft} onChange={e => setAsDraft(e.target.checked)} /> Save as draft (not issued — excluded from totals)
            </label>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={createInvoice} disabled={saving || !form.client_id || !form.amount} data-testid="create-invoice-submit">{saving ? 'Creating…' : (asDraft ? 'Save draft' : 'Create invoice')}</button>
          </div>
        </div>
      )}

      {/* Staff breakdown / hourly costing editor */}
      {costFor && (
        <div className="af-modal" onClick={(e) => e.target === e.currentTarget && !saving && setCostFor(null)}>
          <div className="af-dialog" style={{ maxWidth: 860 }} data-testid="cost-modal">
            <button className="af-close" onClick={() => setCostFor(null)}>×</button>
            <h2>Job hourly costing</h2>
            <p className="af-sub">{costFor.client_name} · {costFor.service_type} · internal cost rates (not customer billing)</p>
            <div className="af-tablewrap">
              <table className="af-table">
                <thead><tr><th>STAFF / ROLE</th><th>ALLOCATED HRS</th><th>ACTUAL HRS</th><th>REMAINING HRS</th><th>BUDGET AED/HR</th><th>ACTUAL AED/HR</th><th></th></tr></thead>
                <tbody>
                  {costRows.map((s, idx) => (
                    <tr key={idx}>
                      <td><input value={s.name} onChange={e => setCostRows(costRows.map((r, k) => k === idx ? { ...r, name: e.target.value } : r))} placeholder="Name · role" /></td>
                      {['allocated_hours', 'actual_hours', 'remaining_hours', 'budget_rate', 'actual_rate'].map(k => (
                        <td key={k}><input type="number" min="0" step="0.5" style={{ width: 90 }} value={s[k] ?? 0} onChange={e => setCostRows(costRows.map((r, ki) => ki === idx ? { ...r, [k]: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 } : r))} /></td>
                      ))}
                      <td><button className="af-link" onClick={() => setCostRows(costRows.filter((_, k) => k !== idx))}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="af-link" style={{ marginTop: 8 }} onClick={() => setCostRows([...costRows, { name: '', allocated_hours: 0, actual_hours: 0, remaining_hours: 0, budget_rate: 150, actual_rate: 150 }])}>+ Add staff allocation</button>
            <p className="af-note">Completed jobs should have zero remaining hours. Budget and actual rates can differ — the comparison reflects both time and rate changes. No invoice or accounting entry is affected.</p>
            <button className="af-btn-primary" style={{ width: '100%' }} onClick={saveCost} disabled={saving || !costRows.length}>{saving ? 'Saving…' : 'Save hours & costs'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingWorkspace;
