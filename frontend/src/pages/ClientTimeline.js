import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, CheckSquare, Briefcase, Activity, Download } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeConfig = {
  task: { icon: CheckSquare, color: 'var(--blue, #3b82f6)', bg: 'var(--blue-bg)', label: 'Task' },
  meeting: { icon: Calendar, color: 'var(--green)', bg: 'var(--green-bg)', label: 'Meeting' },
  followup: { icon: Calendar, color: 'var(--blue, #3b82f6)', bg: 'var(--blue-bg)', label: 'Follow-up' },
  deadline: { icon: Calendar, color: 'var(--red)', bg: 'var(--red-bg)', label: 'Deadline' },
  document: { icon: FileText, color: 'var(--purple, #8b5cf6)', bg: 'var(--purple-bg)', label: 'Document' },
  engagement: { icon: Briefcase, color: 'var(--gold4)', bg: 'rgba(201,168,76,0.08)', label: 'Engagement' },
  activity: { icon: Activity, color: 'var(--muted)', bg: 'var(--off)', label: 'Activity' },
  event: { icon: Calendar, color: 'var(--green)', bg: 'var(--green-bg)', label: 'Event' },
};

const ClientTimeline = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/clients/${clientId}/timeline`, { withCredentials: true });
        setData(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [clientId]);

  if (loading) return <div className="fade-in nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading timeline...</div>;
  if (!data) return <div className="fade-in nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Client not found</div>;

  const { client, timeline } = data;
  const filtered = filterType ? timeline.filter(t => t.type === filterType) : timeline;

  const typeCounts = {};
  timeline.forEach(t => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1; });

  const formatDate = (d) => {
    if (!d) return '';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="fade-in" data-testid="client-timeline-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="back-btn"><ArrowLeft size={14} /> Back</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>{client.name}</h2>
              <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {client.entity_type && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{client.entity_type}</span>}
                {client.jurisdiction && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{client.jurisdiction}</span>}
                {client.trn && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>TRN: {client.trn}</span>}
                {client.status && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: client.status === 'Active' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: client.status === 'Active' ? '#4ade80' : '#f87171' }}>{client.status}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: 'Total Items', value: timeline.length },
                { label: 'Tasks', value: typeCounts.task || 0 },
                { label: 'Engagements', value: typeCounts.engagement || 0 },
                { label: 'Documents', value: typeCounts.document || 0 },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Serif Display' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Type filter chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterType('')} style={{ padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 600, border: !filterType ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.12)', background: !filterType ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)', color: !filterType ? 'var(--gold)' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'DM Sans' }} data-testid="filter-all">All ({timeline.length})</button>
            {Object.entries(typeCounts).map(([type, count]) => {
              const cfg = typeConfig[type] || typeConfig.activity;
              return (
                <button key={type} onClick={() => setFilterType(type)} style={{ padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 600, border: filterType === type ? `1px solid ${cfg.color}` : '1px solid rgba(255,255,255,0.12)', background: filterType === type ? cfg.bg : 'rgba(255,255,255,0.04)', color: filterType === type ? cfg.color : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'DM Sans' }} data-testid={`filter-${type}`}>{cfg.label} ({count})</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No activity found for this client.</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 28 }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 2, background: 'var(--nn-border)', borderRadius: 1 }} />

          {filtered.map((item, idx) => {
            const cfg = typeConfig[item.type] || typeConfig.activity;
            const Icon = cfg.icon;
            return (
              <div key={idx} style={{ position: 'relative', marginBottom: 12 }} data-testid={`timeline-item-${idx}`}>
                {/* Dot */}
                <div style={{ position: 'absolute', left: -22, top: 14, width: 18, height: 18, borderRadius: '50%', background: cfg.bg, border: `2px solid ${cfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={9} color={cfg.color} />
                </div>
                {/* Card */}
                <div className="nn-card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: cfg.bg, color: cfg.color, textTransform: 'uppercase' }}>{cfg.label}</span>
                        {item.status && <span style={{ fontSize: 9, fontWeight: 600, color: item.status === 'Completed' ? 'var(--green)' : item.status === 'Active' ? 'var(--blue, #3b82f6)' : 'var(--muted)' }}>{item.status}</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{item.title}</div>
                      {item.detail && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.detail}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--light)', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDate(item.date)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientTimeline;
