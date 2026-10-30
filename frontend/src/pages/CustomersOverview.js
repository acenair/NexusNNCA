import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const initials = (name) => (name || '?').replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

/** Customer overview landing — pick a customer to open its overview workspace. */
const CustomersOverview = () => {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/clients`, { withCredentials: true })
      .then(res => setClients(Array.isArray(res.data) ? res.data : []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

  const shown = clients
    .filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.name || '').includes('(Demo)') - (a.name || '').includes('(Demo)'));

  return (
    <div className="ov-wrap" data-testid="customers-overview-list">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">CUSTOMER WORKSPACE</div>
          <h1>Customer overview</h1>
          <p>Pick a customer — engagements, compliance and collections at a glance.</p>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…" data-testid="customers-search"
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line, #e4eff6)', background: '#fff', color: 'var(--text)', fontSize: 12.5, minWidth: 220 }} />
      </div>

      {loading && <p style={{ color: 'var(--muted)', padding: 16 }}>Loading customers…</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {shown.slice(0, 60).map(c => (
          <Link key={c.client_id} to={`/app/customers/${c.client_id}`} data-testid={`customer-card-${c.client_id}`}
            className="af-card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', textDecoration: 'none' }}>
            <span style={{ padding: 12, background: '#e7f1fa', borderRadius: 10, fontSize: 16, fontWeight: 700, color: '#01457C' }}>{initials(c.name)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, display: 'block', color: 'var(--text)' }}>{c.name}</b>
              <small style={{ color: 'var(--muted)', fontSize: 11 }}>{c.jurisdiction || c.emirate || '—'}{c.industry ? ` · ${c.industry}` : ''}</small>
            </span>
          </Link>
        ))}
      </div>
      {!loading && shown.length === 0 && <p style={{ color: 'var(--muted)', padding: 16 }}>No customers match.</p>}
      {shown.length > 60 && <p style={{ color: 'var(--muted)', fontSize: 12, padding: 12 }}>Showing first 60 — refine the search to narrow down.</p>}
    </div>
  );
};

export default CustomersOverview;
