import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, CheckCircle } from 'lucide-react';

const ServicePage = ({ title, subtitle, stats, clients }) => {
  const [expandedClients, setExpandedClients] = useState({});

  const toggleClient = (idx) => {
    setExpandedClients(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fade-in">
      {/* Service Banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy), var(--navy3))',
        borderRadius: 'var(--rl)', padding: '20px 24px', marginBottom: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: 'var(--shadow)',
      }} data-testid="service-banner">
        <div>
          <h1 style={{ fontFamily: 'DM Serif Display', color: 'var(--gold)', fontSize: 20, marginBottom: 4 }}>{title}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {stats.map((s, idx) => (
            <div key={idx} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Serif Display' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Client Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} data-testid="service-clients-grid">
        {clients.map((client, idx) => (
          <div key={idx} className="nn-card" style={{ overflow: 'hidden' }}>
            {/* Client Header */}
            <div style={{ background: 'var(--navy)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontSize: 12, fontWeight: 700 }}>
                {client.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{client.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{client.sub}</div>
              </div>
              <span className={`pill ${client.statusType || 'pill-blue'}`} style={{ fontSize: 10 }}>{client.status}</span>
            </div>

            {/* Progress */}
            {client.progress !== undefined && (
              <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid var(--nn-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Progress</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)' }}>{client.progress}%</span>
                </div>
                <div className="nn-progress">
                  <div className="nn-progress-bar" style={{ width: `${client.progress}%`, background: client.progress >= 80 ? 'var(--green)' : client.progress >= 50 ? 'var(--blue)' : 'var(--amber)' }} />
                </div>
              </div>
            )}

            {/* Document Groups */}
            {client.docGroups && client.docGroups.map((group, gIdx) => (
              <div key={gIdx}>
                <div
                  onClick={() => toggleClient(`${idx}-${gIdx}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px',
                    borderBottom: '1px solid var(--nn-border)', cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                >
                  {expandedClients[`${idx}-${gIdx}`] ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{group.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>{group.items.filter(i => i.done).length}/{group.items.length}</span>
                </div>
                {expandedClients[`${idx}-${gIdx}`] && (
                  <div style={{ borderTop: '1px solid var(--nn-border)' }}>
                    {group.items.map((item, iIdx) => (
                      <div key={iIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 14px 9px 38px', borderBottom: '1px solid var(--nn-border)' }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          border: `1.5px solid ${item.done ? 'var(--green)' : 'var(--nn-border)'}`,
                          background: item.done ? 'var(--green-bg)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {item.done && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</div>
                          {item.note && <div style={{ fontSize: 10, color: 'var(--light)' }}>{item.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Info rows */}
            {client.info && client.info.map((row, rIdx) => (
              <div key={rIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--nn-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{row.label}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServicePage;
