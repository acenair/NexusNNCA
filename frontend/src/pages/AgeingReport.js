import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Clock, DollarSign, Users, ChevronDown, ChevronUp, Send } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BUCKET_LABELS = { current: 'Current', '30': '1-30 Days', '60': '31-60 Days', '90': '61-90 Days', '120plus': '120+ Days' };
const BUCKET_COLORS = { current: 'var(--green)', '30': 'var(--blue)', '60': 'var(--amber)', '90': '#f97316', '120plus': 'var(--red)' };

const AgeingReport = () => {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState(null);
  const [followingUp, setFollowingUp] = useState(null);

  useEffect(() => { loadReport(); }, []);

  const loadReport = async () => {
    try {
      const res = await axios.get(`${API}/invoices/ageing-report`, { withCredentials: true });
      setData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleFollowUp = async (client) => {
    setFollowingUp(client.client_id);
    try {
      await axios.post(`${API}/invoices/follow-up?client_id=${client.client_id}&client_name=${encodeURIComponent(client.client_name)}`, null, { withCredentials: true });
      alert(`Follow-up task created for ${client.client_name}`);
    } catch (err) { alert(err.response?.data?.detail || 'Failed'); }
    finally { setFollowingUp(null); }
  };

  const getBucketForDays = (days) => {
    if (days <= 0) return 'current';
    if (days <= 30) return '30';
    if (days <= 60) return '60';
    if (days <= 90) return '90';
    return '120plus';
  };

  const cardStyle = { background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 'var(--rl)', padding: '16px 20px' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading ageing report...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data available.</div>;

  const { summary, clients } = data;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }} data-testid="ageing-report-page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>Ageing Report</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Unpaid invoice analysis with overdue tracking</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 8 }}>Total Outstanding</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Serif Display' }}>AED {summary.total_unpaid?.toLocaleString() || '0'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{summary.total_invoices} invoice{summary.total_invoices !== 1 ? 's' : ''}</div>
        </div>
        {Object.entries(BUCKET_LABELS).map(([key, label]) => {
          const b = summary.bucket_totals?.[key] || { count: 0, amount: 0 };
          return (
            <div key={key} style={cardStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: BUCKET_COLORS[key], letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: BUCKET_COLORS[key] }} />
                {label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>AED {b.amount?.toLocaleString() || '0'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{b.count} invoice{b.count !== 1 ? 's' : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Client Breakdown */}
      <div style={{ ...cardStyle, padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Client Breakdown</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{clients.length} client{clients.length !== 1 ? 's' : ''} with outstanding invoices</p>
          </div>
        </div>

        {clients.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No unpaid invoices found.</div>
        ) : (
          <div>
            {clients.map((client) => {
              const isExpanded = expandedClient === client.client_id;
              const bucketKey = getBucketForDays(client.oldest_days);
              return (
                <div key={client.client_id} style={{ borderBottom: '1px solid var(--nn-border)' }}>
                  <div
                    onClick={() => setExpandedClient(isExpanded ? null : client.client_id)}
                    style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'background 0.15s' }}
                    data-testid={`ageing-client-${client.client_id}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ width: 4, height: 32, borderRadius: 2, background: BUCKET_COLORS[bucketKey] }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{client.client_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{client.invoice_count} invoice{client.invoice_count !== 1 ? 's' : ''} &middot; Oldest: {client.oldest_days} days</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>AED {client.total_outstanding?.toLocaleString()}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFollowUp(client); }}
                        disabled={followingUp === client.client_id}
                        className="tbtn tbtn-outline"
                        style={{ fontSize: 10, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        data-testid={`follow-up-${client.client_id}`}
                      >
                        <Send size={11} /> {followingUp === client.client_id ? 'Creating...' : 'Follow Up'}
                      </button>
                      {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 20px 12px', marginLeft: 16 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--nn-border)' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Invoice</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Service</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Date</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Amount</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Days Overdue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {client.invoices.map(inv => (
                            <tr key={inv.invoice_id} style={{ borderBottom: '1px solid var(--nn-border)' }}>
                              <td style={{ padding: '8px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>{inv.invoice_id}</td>
                              <td style={{ padding: '8px', color: 'var(--text)' }}>{inv.service_name}</td>
                              <td style={{ padding: '8px', color: 'var(--muted)' }}>{inv.date}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>AED {inv.amount?.toLocaleString()}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>
                                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: `${BUCKET_COLORS[getBucketForDays(inv.days_overdue)]}15`, color: BUCKET_COLORS[getBucketForDays(inv.days_overdue)] }}>{inv.days_overdue}d</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgeingReport;
