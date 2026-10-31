import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Receipt, Plus, X, Edit2, Trash2, Download, Search, Filter, FileCheck2, ShieldCheck, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EINV_TXN_TYPES = [
  ['standard', 'Standard B2B supply'], ['free_zone', 'Free Zone supply'],
  ['deemed_supply', 'Deemed supply'], ['margin_scheme', 'Margin scheme'],
  ['summary', 'Summary invoice'], ['continuous', 'Continuous supply'],
  ['agent_billing', 'Disclosed agent billing'], ['ecommerce', 'Supply through e-commerce'],
  ['export', 'Export'],
];

const Invoices = () => {
  const { user } = useOutletContext();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client_id: '', service_name: '', amount: '', date: '', status: 'Unpaid', notes: '' });
  // e-invoice modal state
  const [einvOpen, setEinvOpen] = useState(null);        // invoice object
  const [einvType, setEinvType] = useState('standard');
  const [einvAddr, setEinvAddr] = useState('');
  const [einvResult, setEinvResult] = useState(null);    // validation result
  const [einvBusy, setEinvBusy] = useState(false);

  const openEinv = async (inv) => {
    setEinvOpen(inv);
    setEinvResult(null);
    setEinvBusy(true);
    try {
      // load current einvoicing data via validate (also gives us the issues)
      const res = await axios.get(`${API}/einvoicing/invoices/${inv.invoice_id}/validate`, { withCredentials: true });
      setEinvType(res.data.einvoicing?.type_code || 'standard');
      setEinvAddr(res.data.einvoicing?.buyer_address || '');
      setEinvResult(res.data);
    } catch (e) { setEinvResult({ valid: false, issues: [{ severity: 'fail', field: 'load', message: 'Failed to validate' }] }); }
    finally { setEinvBusy(false); }
  };

  const saveEinv = async () => {
    setEinvBusy(true);
    try {
      await axios.patch(`${API}/einvoicing/invoices/${einvOpen.invoice_id}`, { type_code: einvType, buyer_address: einvAddr }, { withCredentials: true });
      const res = await axios.get(`${API}/einvoicing/invoices/${einvOpen.invoice_id}/validate`, { withCredentials: true });
      setEinvResult(res.data);
    } catch (e) { alert('Save failed'); }
    finally { setEinvBusy(false); }
  };

  const downloadXml = () => {
    window.open(`${API}/einvoicing/invoices/${einvOpen.invoice_id}/pintae?download=true`, '_blank');
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [invRes, clientRes] = await Promise.all([
        axios.get(`${API}/invoices`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
      ]);
      setInvoices(invRes.data);
      setClients(clientRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setEditInvoice(null);
    setForm({ client_id: '', service_name: '', amount: '', date: new Date().toISOString().split('T')[0], status: 'Unpaid', notes: '' });
    setShowModal(true);
  };

  const openEdit = (inv) => {
    setEditInvoice(inv);
    setForm({ client_id: inv.client_id, service_name: inv.service_name, amount: String(inv.amount), date: inv.date, status: inv.status, notes: inv.notes || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.client_id || !form.service_name || !form.amount || !form.date) return;
    setSaving(true);
    try {
      const client = clients.find(c => c.client_id === form.client_id);
      if (editInvoice) {
        await axios.patch(`${API}/invoices/${editInvoice.invoice_id}?status=${form.status}&amount=${parseFloat(form.amount)}&notes=${encodeURIComponent(form.notes)}`, {}, { withCredentials: true });
      } else {
        await axios.post(`${API}/invoices`, {
          client_id: form.client_id,
          client_name: client?.name,
          service_name: form.service_name,
          amount: parseFloat(form.amount),
          date: form.date,
          status: form.status,
          notes: form.notes,
        }, { withCredentials: true });
      }
      setShowModal(false);
      loadData();
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await axios.delete(`${API}/invoices/${invoiceId}`, { withCredentials: true });
      loadData();
    } catch (err) { alert('Failed to delete'); }
  };

  const toggleStatus = async (inv) => {
    const newStatus = inv.status === 'Paid' ? 'Unpaid' : 'Paid';
    try {
      await axios.patch(`${API}/invoices/${inv.invoice_id}?status=${newStatus}`, {}, { withCredentials: true });
      loadData();
    } catch (err) { alert('Failed'); }
  };

  const filtered = invoices.filter(inv => {
    if (filterClient && inv.client_id !== filterClient) return false;
    if (filterStatus && inv.status !== filterStatus) return false;
    if (search && !inv.service_name?.toLowerCase().includes(search.toLowerCase()) && !inv.client_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalAmount = filtered.reduce((s, i) => s + (i.amount || 0), 0);
  const paidAmount = filtered.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const unpaidAmount = filtered.filter(i => i.status === 'Unpaid').reduce((s, i) => s + (i.amount || 0), 0);

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 };

  if (user?.role !== 'partner') {
    return <div className="fade-in" style={{ padding: 40, textAlign: 'center' }}><h2 style={{ fontFamily: 'DM Sans', color: 'var(--text)' }}>Access Restricted</h2></div>;
  }

  return (
    <div className="fade-in" data-testid="invoices-page">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Receipt size={18} style={{ color: 'var(--gold)' }} />
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Sans', fontSize: 18 }}>Invoice Management</h2>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Create and manage client invoices</div>
            </div>
          </div>
          <button onClick={openNew} className="tbtn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12 }} data-testid="new-invoice-btn">
            <Plus size={14} /> New Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="nn-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>AED {totalAmount.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="nn-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase' }}>Paid</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>AED {paidAmount.toLocaleString()}</div>
        </div>
        <div className="nn-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>Unpaid</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)', marginTop: 4 }}>AED {unpaidAmount.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="nn-card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices..." style={{ ...inputStyle, paddingLeft: 30 }} data-testid="invoice-search" />
        </div>
        <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ ...inputStyle, width: 160 }} data-testid="invoice-filter-client">
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 120 }} data-testid="invoice-filter-status">
          <option value="">All Status</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>

      {/* Invoice Table */}
      <div className="nn-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Client', 'Service', 'Date', 'Amount', 'Status', 'Notes', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No invoices found. Click "New Invoice" to create one.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.invoice_id} style={{ borderBottom: '1px solid var(--nn-border)' }} data-testid={`invoice-row-${inv.invoice_id}`}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{inv.client_name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text)' }}>{inv.service_name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>{inv.date}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AED {inv.amount?.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => toggleStatus(inv)} style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: inv.status === 'Paid' ? 'var(--green-bg)' : 'var(--red-bg)', color: inv.status === 'Paid' ? 'var(--green)' : 'var(--red)' }} data-testid={`toggle-status-${inv.invoice_id}`}>{inv.status}</button>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.notes || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEinv(inv)} className="tbtn" title="E-invoice (PINT AE)"
                        style={{ padding: '4px 8px', fontSize: 10, background: 'var(--blue-bg, #eaf3fb)', color: '#0e6db4', border: 'none' }} data-testid={`einvoicing-btn-${inv.invoice_id}`}><FileCheck2 size={10} /></button>
                      <button onClick={() => openEdit(inv)} className="tbtn" style={{ padding: '4px 8px', fontSize: 10, background: 'rgba(212,175,55,0.08)', color: 'var(--gold4)', border: 'none' }} data-testid={`edit-invoice-${inv.invoice_id}`}><Edit2 size={10} /></button>
                      <button onClick={() => handleDelete(inv.invoice_id)} className="tbtn" style={{ padding: '4px 8px', fontSize: 10, background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} data-testid={`delete-invoice-${inv.invoice_id}`}><Trash2 size={10} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)} data-testid="invoice-modal">
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Sans', fontSize: 16 }}>{editInvoice ? 'Edit Invoice' : 'New Invoice'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Client *</label>
                <select value={form.client_id} onChange={(e) => setForm(p => ({ ...p, client_id: e.target.value }))} style={inputStyle} disabled={!!editInvoice} data-testid="invoice-client-select">
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Service Name *</label>
                <input value={form.service_name} onChange={(e) => setForm(p => ({ ...p, service_name: e.target.value }))} placeholder="e.g. Statutory Audit, VAT Filing" style={inputStyle} disabled={!!editInvoice} data-testid="invoice-service-input" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Amount (AED) *</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="15000" style={inputStyle} data-testid="invoice-amount-input" />
                </div>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} disabled={!!editInvoice} data-testid="invoice-date-input" />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))} style={inputStyle} data-testid="invoice-status-select">
                  <option value="Unpaid">Unpaid</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." style={{ ...inputStyle, resize: 'vertical' }} data-testid="invoice-notes-input" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={handleSave} disabled={saving || !form.client_id || !form.service_name || !form.amount || !form.date} data-testid="invoice-save-btn">{saving ? 'Saving...' : editInvoice ? 'Update' : 'Create Invoice'}</button>
            </div>
          </div>
        </div>
      )}

      {/* E-invoice (PINT AE) Modal */}
      {einvOpen && (
        <div className="modal-overlay" onClick={() => setEinvOpen(null)} data-testid="einvoicing-modal">
          <div className="modal-box" style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 15, fontFamily: 'DM Sans', color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <FileCheck2 size={15} color="#0e6db4" /> E-invoice (PINT AE) — {einvOpen.invoice_number || einvOpen.invoice_id}
              </h3>
              <button onClick={() => setEinvOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 12px' }}>{einvOpen.client_name} · {einvOpen.service_name}</p>

            <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Transaction-type code</label>
                <select value={einvType} onChange={e => setEinvType(e.target.value)} data-testid="einvoicing-type-select"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }}>
                  {EINV_TXN_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Buyer address (mandatory for the e-invoice)</label>
                <input value={einvAddr} onChange={e => setEinvAddr(e.target.value)} placeholder="Office, building, city"
                  data-testid="einvoicing-address-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="tbtn tbtn-gold" onClick={saveEinv} disabled={einvBusy} data-testid="einvoicing-save-btn">
                {einvBusy ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />} Save & validate
              </button>
              <button className="tbtn" onClick={downloadXml} disabled={einvBusy || !einvResult?.valid}
                title={einvResult?.valid ? 'Download PINT AE XML' : 'Fix failing fields first'}
                data-testid="einvoicing-download-btn">
                <Download size={12} /> PINT AE XML
              </button>
            </div>

            {einvResult && (
              <div data-testid="einvoicing-validation">
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: einvResult.valid ? 'var(--green)' : 'var(--red)' }}>
                  {einvResult.valid ? '✓ Ready for transmission to an accredited ASP' : '✗ Not e-invoice ready — fix the failing fields'}
                </div>
                {(einvResult.issues || []).map((i, ix) => (
                  <div key={ix} style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 6, marginBottom: 4, background: i.severity === 'fail' ? '#fdecec' : '#fdf6ec', color: i.severity === 'fail' ? 'var(--red)' : '#b45309' }} data-testid={`einv-issue-${i.field}`}>
                    {i.severity === 'fail' ? '✕' : '⚠'} <b>{i.field.replace(/_/g, ' ')}:</b> {i.message}
                  </div>
                ))}
                {(einvResult.issues || []).length === 0 && <div style={{ fontSize: 11.5, color: 'var(--green)' }}>All mandatory field groups present.</div>}
                <p className="af-note" style={{ fontSize: 10.5 }}>
                  The XML is generated as Corner-1 data (UBL 2.1, PINT AE) and archived with a SHA-256 hash. After your client appoints their ASP, this file is what transmits — or connect the ASP API and it flows automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
