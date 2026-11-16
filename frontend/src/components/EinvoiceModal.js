import React, { useState, useEffect } from 'react';
import { FileCheck2, ShieldCheck, Loader2, X, Download } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const EINV_TXN_TYPES = [
  ['standard', 'Standard B2B supply'], ['free_zone', 'Free Zone supply'],
  ['deemed_supply', 'Deemed supply'], ['margin_scheme', 'Margin scheme'],
  ['summary', 'Summary invoice'], ['continuous', 'Continuous supply'],
  ['agent_billing', 'Disclosed agent billing'], ['ecommerce', 'Supply through e-commerce'],
  ['export', 'Export'],
];

/* Shared PINT AE e-invoice modal — used from the billing workspace invoice rows.
   Owns its state: loads validation for the invoice, lets the user set the
   transaction-type code + buyer address, re-validates, downloads the XML. */
const EinvoiceModal = ({ invoice, onClose }) => {
  const [type, setType] = useState('standard');
  const [addr, setAddr] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);

  const validate = async () => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/einvoicing/invoices/${invoice.invoice_id}/validate`, { withCredentials: true });
      setType(res.data.einvoicing?.type_code || 'standard');
      setAddr(res.data.einvoicing?.buyer_address || '');
      setResult(res.data);
    } catch (e) {
      setResult({ valid: false, issues: [{ severity: 'fail', field: 'load', message: 'Failed to validate — try again' }] });
    } finally { setBusy(false); }
  };
  useEffect(() => { if (invoice) validate(); }, [invoice?.invoice_id]);

  const save = async () => {
    setBusy(true);
    try {
      await axios.patch(`${API}/einvoicing/invoices/${invoice.invoice_id}`, { type_code: type, buyer_address: addr }, { withCredentials: true });
      await validate();
    } catch (e) { alert('Save failed'); setBusy(false); }
  };

  const download = () => {
    window.open(`${API}/einvoicing/invoices/${invoice.invoice_id}/pintae?download=true`, '_blank');
  };

  if (!invoice) return null;
  return (
    <div className="modal-overlay" onClick={onClose} data-testid="einvoicing-modal">
      <div className="modal-box" style={{ maxWidth: 560, height: 'min(88vh, calc(100dvh - 24px))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontFamily: 'DM Sans', color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <FileCheck2 size={15} color="#0e6db4" /> E-invoice (PINT AE) — {invoice.invoice_number || invoice.invoice_id}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} data-testid="einvoicing-close"><X size={16} /></button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 12px', flexShrink: 0 }}>{invoice.client_name} · {invoice.service_name}</p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 12, flexShrink: 0 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Transaction-type code</label>
            <select value={type} onChange={e => setType(e.target.value)} data-testid="einvoicing-type-select"
              style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)' }}>
              {EINV_TXN_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Buyer address (mandatory for the e-invoice)</label>
            <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Office, building, city"
              data-testid="einvoicing-address-input"
              style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}>
          <button className="tbtn tbtn-gold" onClick={save} disabled={busy} data-testid="einvoicing-save-btn">
            {busy ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />} Save & validate
          </button>
          <button className="tbtn" onClick={download} disabled={busy || !result?.valid}
            title={result?.valid ? 'Download PINT AE XML' : 'Fix failing fields first'}
            data-testid="einvoicing-download-btn">
            <Download size={12} /> PINT AE XML
          </button>
        </div>
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', margin: '0 -20px', padding: '0 20px' }}>
        {!result && <div data-testid="einv-debug">state: result=null busy={String(busy)}</div>}
        {result && (() => {
          const fails = (result.issues || []).filter(i => i.severity === 'fail');
          const warns = (result.issues || []).filter(i => i.severity === 'warn');
          const fixLink = (msg) => {
            if (/settings/i.test(msg)) return { to: '/app/settings', label: 'Fix in Settings → Firm Identity ↗' };
            if (/client/i.test(msg) && invoice.client_id) return { to: `/app/customers/${invoice.client_id}`, label: 'Open the client record ↗' };
            if (/reassign/i.test(msg)) return { to: '/app/invoices', label: 'Reassign in Billing ↗' };
            return null;
          };
          const Row = ({ i }) => {
            const link = fixLink(i.message || '');
            return (
              <div style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 6, marginBottom: 3, lineHeight: 1.45, background: i.severity === 'fail' ? '#fdecec' : '#fdf6ec', color: i.severity === 'fail' ? 'var(--red)' : '#b45309' }} data-testid={`einv-issue-${i.field}`}>
                {i.severity === 'fail' ? '✕' : '⚠'} <b>{i.field.replace(/_/g, ' ')}:</b> {i.message}
                {link && <a href={link.to} style={{ display: 'inline-block', marginLeft: 8, color: '#0e6db4', fontWeight: 700, textDecoration: 'underline' }}>{link.label}</a>}
              </div>
            );
          };
          return (
          <div data-testid="einvoicing-validation" style={{ overflowY: 'auto', minHeight: 0 }}>
            <style>{'[data-testid="einvoicing-validation"] > div:last-child { padding-bottom: 4px; }'}</style>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: result.valid ? 'var(--green)' : 'var(--red)' }} data-testid="einvoicing-verdict">
              {result.valid ? '✓ Ready for transmission to an accredited ASP' : `✗ Not e-invoice ready — ${fails.length} blocker${fails.length === 1 ? '' : 's'}${warns.length ? ` · ${warns.length} recommendation${warns.length === 1 ? '' : 's'}` : ''}`}
            </div>
            {result.client_missing && (
              <div style={{ fontSize: 11.5, padding: '8px 10px', borderRadius: 6, marginBottom: 8, background: '#fdf6ec', border: '1px solid #f0d9a8', color: '#b45309' }} data-testid="einv-orphan-banner">
                ⚠ The client on this invoice no longer exists in the client master. Reassign this invoice to a client, then revalidate.
              </div>
            )}
            {fails.length > 0 && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--muted)', margin: '8px 0 4px' }}>MUST FIX</div>}
            {fails.map(i => <Row key={i.field} i={i} />)}
            {warns.length > 0 && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--muted)', margin: '10px 0 4px' }}>RECOMMENDED</div>}
            {warns.map(i => <Row key={i.field} i={i} />)}
            {(result.issues || []).length === 0 && <div style={{ fontSize: 11.5, color: 'var(--green)' }}>All mandatory field groups present.</div>}
            <p className="af-note" style={{ fontSize: 10.5 }}>
              The XML is generated as Corner-1 data (UBL 2.1, PINT AE) and archived with a SHA-256 hash. Once the client appoints their ASP, this file is what transmits — or connect the ASP API and it flows automatically.
            </p>
          </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};

export default EinvoiceModal;
