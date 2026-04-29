import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DeadlineTracker = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/service/engagements`, { withCredentials: true });
        setEngagements(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const getProgress = (eng) => {
    const total = eng.checklist?.reduce((s, g) => s + g.items.length, 0) || 0;
    const done = eng.checklist?.reduce((s, g) => s + g.items.filter(i => i.done).length, 0) || 0;
    return total > 0 ? Math.round(done / total * 100) : 0;
  };

  // Group by service type
  const statutory = engagements.filter(e => e.service_type === 'statutory_audit');
  const vatFiling = engagements.filter(e => e.service_type === 'vat_filing');
  const internal = engagements.filter(e => e.service_type === 'internal_audit');
  const aml = engagements.filter(e => e.service_type === 'aml_review');
  const corporate = engagements.filter(e => e.service_type === 'corporate_tax');

  const allStaff = useMemo(() => {
    const names = new Set();
    engagements.forEach(e => { if (e.assigned_to_name) names.add(e.assigned_to_name); });
    return Array.from(names).sort();
  }, [engagements]);

  const filterItems = (items) => {
    return items.filter(e => {
      const matchesStaff = staffFilter === 'all' || e.assigned_to_name === staffFilter;
      const matchesSearch = !search || e.client_name?.toLowerCase().includes(search.toLowerCase());
      return matchesStaff && matchesSearch;
    });
  };

  const showSection = (key) => activeTab === 'all' || activeTab === key;

  const tabs = [
    { key: 'all', label: 'All', count: engagements.length },
    { key: 'statutory', label: 'Statutory', count: statutory.length },
    { key: 'vat', label: 'VAT', count: vatFiling.length },
    { key: 'internal', label: 'Internal', count: internal.length },
    { key: 'aml', label: 'AML', count: aml.length },
    { key: 'corporate', label: 'Corporate Tax', count: corporate.length },
  ].filter(t => t.count > 0 || t.key === 'all');

  // Workload distribution
  const workload = useMemo(() => {
    const map = {};
    engagements.filter(e => e.status !== 'Completed').forEach(e => {
      const name = e.assigned_to_name || 'Unassigned';
      map[name] = (map[name] || 0) + 1;
    });
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
    return Object.entries(map).map(([name, count], i) => ({ name, items: count, color: colors[i % colors.length] })).sort((a, b) => b.items - a.items);
  }, [engagements]);

  // Summary stats
  const active = engagements.filter(e => e.status === 'Active');
  const completed = engagements.filter(e => e.status === 'Completed');

  const summaryCards = [
    { label: 'Total Engagements', value: engagements.length, color: 'var(--text)' },
    { label: 'Active', value: active.length, color: 'var(--blue)', pill: 'pill-blue', pillText: 'In Progress' },
    { label: 'Completed', value: completed.length, color: 'var(--green)', pill: 'pill-green', pillText: 'Done' },
    { label: 'Staff Active', value: workload.length, color: 'var(--amber)', pill: 'pill-amber', pillText: 'Assigned' },
  ];

  const openEngagement = (engId) => navigate(`/engagements/${engId}`);

  const EngagementTable = ({ items, typeLabel, typeColor, showScope }) => {
    const filtered = filterItems(items);
    if (filtered.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '2px solid var(--nn-border)', marginBottom: 10 }}>
          <span className={`pill pill-${typeColor}`}>{typeLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{filtered.length} Engagement{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="nn-card">
          <table className="nn-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Assigned To</th>
                <th>Phase</th>
                <th>Progress</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(eng => {
                const progress = getProgress(eng);
                return (
                  <tr key={eng.engagement_id} data-testid={`deadline-row-${eng.engagement_id}`}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{eng.client_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{eng.phase}</div>
                    </td>
                    <td>{eng.assigned_to_name || '—'}</td>
                    <td><span className={`pill ${eng.phase?.includes('Review') || eng.phase?.includes('Report') ? 'pill-purple' : eng.phase?.includes('Field') || eng.phase?.includes('Test') || eng.phase?.includes('Filing') ? 'pill-blue' : 'pill-navy'}`}>{eng.phase}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="nn-progress" style={{ width: 60 }}>
                          <div className="nn-progress-bar" style={{ width: `${progress}%`, background: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--amber)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{progress}%</span>
                      </div>
                    </td>
                    <td><span className={`pill ${eng.status === 'Completed' ? 'pill-green' : 'pill-blue'}`}>{eng.status}</span></td>
                    <td><button onClick={() => openEngagement(eng.engagement_id)} className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, color: 'var(--gold4)' }} data-testid={`open-${eng.engagement_id}`}>Open &rarr;</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in" data-testid="deadline-tracker-view">
      {/* Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }} data-testid="dt-summary-strip">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="nn-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--muted)' }}>{card.label}</span>
              {card.pill && <span className={`pill ${card.pill}`} style={{ fontSize: 10 }}>{card.pillText}</span>}
            </div>
            <div style={{ fontSize: 26, fontFamily: 'DM Serif Display', color: card.color, lineHeight: 1 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Workload Distribution */}
      {workload.length > 0 && (
        <div className="nn-card" style={{ padding: '14px 18px', marginBottom: 18 }} data-testid="workload-strip">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Workload Distribution</h3>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{workload.length} staff active</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(70px, 1fr))`, gap: 10 }}>
            {workload.map((w, idx) => (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: w.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto 4px' }}>
                  {w.name.charAt(0)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name.split(' ')[0]}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.items} items</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }} data-testid="dt-controls">
        <div style={{ display: 'flex', background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 'var(--rs)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`ftab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, background: 'var(--white)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'DM Sans', outline: 'none' }} data-testid="staff-filter">
            <option value="all">All Staff</option>
            {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" placeholder="Search client..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '7px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 12, background: 'var(--white)', color: 'var(--text)', width: 160, fontFamily: 'DM Sans', outline: 'none' }} data-testid="dt-search" />
        </div>
      </div>

      {loading ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading engagements...</div>
      ) : (
        <>
          {showSection('statutory') && <EngagementTable items={statutory} typeLabel="Statutory Audit" typeColor="blue" />}
          {showSection('vat') && <EngagementTable items={vatFiling} typeLabel="VAT Filing" typeColor="green" />}
          {showSection('internal') && <EngagementTable items={internal} typeLabel="Internal Audit" typeColor="purple" />}
          {showSection('aml') && <EngagementTable items={aml} typeLabel="AML Review" typeColor="red" />}
          {showSection('corporate') && <EngagementTable items={corporate} typeLabel="Corporate Tax" typeColor="amber" />}
        </>
      )}
    </div>
  );
};

export default DeadlineTracker;
