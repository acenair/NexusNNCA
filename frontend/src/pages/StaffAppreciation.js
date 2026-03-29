import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Star, Award, TrendingUp, Users, FileText } from 'lucide-react';

const StaffAppreciation = () => {
  const { user } = useOutletContext();
  const [activeTab, setActiveTab] = useState('cards');
  const [showAppreciationModal, setShowAppreciationModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedRating, setSelectedRating] = useState(0);

  if (user?.role !== 'partner') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <div className="nn-card" style={{ padding: '40px 48px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 8, fontSize: 18 }}>Partner Access Only</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>This feature is only available to partners</p>
        </div>
      </div>
    );
  }

  const staffMembers = [
    { name: 'Fazil', role: 'Associate', rating: 4.6, appreciations: 8, tasks: 14, completed: 11, audits: 3, vat: 2, aml: 1, topCategory: 'Hard Work' },
    { name: 'Subin', role: 'Associate', rating: 4.3, appreciations: 6, tasks: 12, completed: 9, audits: 2, vat: 3, aml: 1, topCategory: 'Accuracy' },
    { name: 'Anju', role: 'Senior Associate', rating: 4.7, appreciations: 9, tasks: 15, completed: 13, audits: 3, vat: 2, aml: 2, topCategory: 'Commitment' },
    { name: 'Roshith', role: 'Associate', rating: 4.2, appreciations: 5, tasks: 11, completed: 8, audits: 2, vat: 2, aml: 1, topCategory: 'Punctuality' },
    { name: 'Thasleema', role: 'Senior Associate', rating: 4.5, appreciations: 7, tasks: 13, completed: 10, audits: 2, vat: 2, aml: 2, topCategory: 'Smart Work' },
    { name: 'Jithin', role: 'Associate', rating: 4.1, appreciations: 4, tasks: 10, completed: 7, audits: 2, vat: 2, aml: 0, topCategory: 'Teamwork' },
    { name: 'Shamil A.', role: 'Associate', rating: 4.4, appreciations: 6, tasks: 11, completed: 9, audits: 2, vat: 1, aml: 1, topCategory: 'Prompt Action' },
    { name: 'Akhil', role: 'Associate', rating: 4.0, appreciations: 4, tasks: 10, completed: 7, audits: 2, vat: 1, aml: 1, topCategory: 'Hard Work' },
    { name: 'Haritha', role: 'Senior Associate', rating: 4.8, appreciations: 10, tasks: 14, completed: 12, audits: 3, vat: 1, aml: 2, topCategory: 'Accuracy' },
  ];

  const statsRow = [
    { label: 'Team Size', value: 9, color: 'var(--text)' },
    { label: 'Appreciations (YTD)', value: 59, color: 'var(--gold4)' },
    { label: 'Avg Rating', value: '4.4', color: 'var(--green)' },
    { label: 'Tasks Completed', value: 86, color: 'var(--blue)' },
    { label: 'Top Performer', value: 'Haritha', color: 'var(--purple)' },
  ];

  const categories = ['Commitment', 'Punctuality', 'Hard Work', 'Smart Work', 'Prompt Action', 'Payment Collection', 'Teamwork', 'Accuracy'];

  const toggleCategory = (cat) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const getInitialColor = (name) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];
    return colors[staffMembers.findIndex(s => s.name === name) % colors.length];
  };

  const tabs = [
    { key: 'cards', label: 'Team Cards' },
    { key: 'report', label: 'Staff Report' },
    { key: 'leaderboard', label: 'Leaderboard' },
  ];

  return (
    <div className="fade-in" data-testid="staff-appreciation-view">
      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 60%, #1e3a6a 100%)',
        borderRadius: 'var(--rl)', padding: '24px 28px', marginBottom: 20,
        position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'DM Serif Display', color: 'var(--gold)', fontSize: 22, marginBottom: 4 }}>Staff Appreciation & Performance</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Recognize your team · Track monthly work output · YTD 2026</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tbtn tbtn-gold" onClick={() => setShowAppreciationModal(true)} data-testid="give-appreciation-btn">
              <Star size={13} /> + Give Appreciation
            </button>
            <button className="tbtn tbtn-outline" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }} data-testid="leaderboard-btn">
              <Award size={13} /> Leaderboard
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 11, marginBottom: 20 }} data-testid="appr-stats-row">
        {statsRow.map((s, idx) => (
          <div key={idx} className="nn-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontFamily: 'DM Serif Display', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: 16, background: 'var(--white)', border: '1px solid var(--nn-border)', borderRadius: 'var(--rs)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', width: 'fit-content' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`ftab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`appr-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Team Cards Grid */}
      {activeTab === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} data-testid="team-cards-grid">
          {staffMembers.map((staff, idx) => (
            <div key={idx} className="nn-card" style={{ padding: 18, position: 'relative' }}>
              {/* Staff Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: getInitialColor(staff.name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                }}>
                  {staff.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{staff.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{staff.role}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Star size={12} fill="var(--gold)" color="var(--gold)" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold4)' }}>{staff.rating}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{staff.appreciations} appr.</div>
                </div>
              </div>

              {/* Work Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '10px 12px', background: 'var(--off)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{staff.audits}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Audits</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{staff.vat}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>VAT</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{staff.aml}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>AML</div>
                </div>
              </div>

              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tasks: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{staff.completed}/{staff.tasks}</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Top: <span className="pill pill-gold" style={{ fontSize: 10 }}>{staff.topCategory}</span></div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, borderTop: '1px solid var(--nn-border)' }}>
                <button
                  className="tbtn tbtn-gold"
                  style={{ fontSize: 11, padding: '5px 10px' }}
                  onClick={() => { setSelectedStaff(staff); setShowAppreciationModal(true); }}
                  data-testid={`appreciate-${staff.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  + Appreciate {staff.name.split(' ')[0]}
                </button>
                <button
                  className="sec-link"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}
                  onClick={() => { setSelectedStaff(staff); setShowReportModal(true); }}
                  data-testid={`report-${staff.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Staff Report Tab */}
      {activeTab === 'report' && (
        <div className="nn-card" style={{ padding: 24 }} data-testid="staff-report-tab">
          <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, marginBottom: 16 }}>Staff Performance Report</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Select a staff member from the Team Cards to view their detailed performance report.</p>
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div data-testid="leaderboard-tab">
          <div className="nn-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display' }}>YTD Leaderboard — 2026</h3>
            </div>
            <table className="nn-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Staff</th>
                  <th>Rating</th>
                  <th>Appreciations</th>
                  <th>Tasks</th>
                  <th>Top Category</th>
                </tr>
              </thead>
              <tbody>
                {[...staffMembers].sort((a, b) => b.rating - a.rating).map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: idx === 0 ? 'var(--gold4)' : 'var(--text)' }}>
                      {idx === 0 ? '🏆' : idx + 1}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: getInitialColor(s.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{s.name.charAt(0)}</div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Star size={11} fill="var(--gold)" color="var(--gold)" />
                        <span style={{ fontWeight: 600 }}>{s.rating}</span>
                      </div>
                    </td>
                    <td>{s.appreciations}</td>
                    <td>{s.completed}/{s.tasks}</td>
                    <td><span className="pill pill-gold">{s.topCategory}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Appreciation Modal */}
      {showAppreciationModal && (
        <div className="modal-overlay" onClick={() => setShowAppreciationModal(false)} data-testid="appreciation-modal">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>Give Appreciation</h3>
              <button onClick={() => setShowAppreciationModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18 }}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Select Staff Member</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }}
                  value={selectedStaff?.name || ''}
                  onChange={(e) => setSelectedStaff(staffMembers.find(s => s.name === e.target.value))}
                  data-testid="appr-staff-select"
                >
                  <option value="">— Select staff —</option>
                  {staffMembers.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Recognition Categories</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        border: '1px solid',
                        borderColor: selectedCategories.includes(cat) ? 'var(--gold)' : 'var(--nn-border)',
                        background: selectedCategories.includes(cat) ? 'var(--gold5)' : 'var(--white)',
                        color: selectedCategories.includes(cat) ? 'var(--gold4)' : 'var(--muted)',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'DM Sans',
                      }}
                      data-testid={`appr-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Overall Rating</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <Star
                      key={r}
                      size={24}
                      fill={r <= selectedRating ? 'var(--gold)' : 'none'}
                      color={r <= selectedRating ? 'var(--gold)' : 'var(--surface)'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedRating(r)}
                      data-testid={`appr-star-${r}`}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Month</label>
                <input type="month" defaultValue="2026-03" style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Personal Message from Partner</label>
                <textarea
                  placeholder="Write a personal appreciation message for this staff member..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans', resize: 'vertical' }}
                  data-testid="appr-message"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowAppreciationModal(false)}>Cancel</button>
              <button className="tbtn tbtn-gold" onClick={() => setShowAppreciationModal(false)} data-testid="save-appreciation-btn">Save Appreciation</button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Report Modal */}
      {showReportModal && selectedStaff && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)} data-testid="performance-modal">
          <div className="modal-box" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div>
                <h3 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>{selectedStaff.name} — Performance Report</h3>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Year-to-Date 2026 · January – March · {selectedStaff.role}</div>
              </div>
              <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18 }}>x</button>
            </div>
            <div className="modal-body">
              {/* Overview Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                {[
                  { label: 'Rating', value: selectedStaff.rating, color: 'var(--gold4)' },
                  { label: 'Appreciations', value: selectedStaff.appreciations, color: 'var(--green)' },
                  { label: 'Tasks Done', value: `${selectedStaff.completed}/${selectedStaff.tasks}`, color: 'var(--blue)' },
                  { label: 'Top Category', value: selectedStaff.topCategory, color: 'var(--purple)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--off)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontFamily: 'DM Serif Display', color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Work Breakdown */}
              <h4 style={{ fontSize: 13, fontFamily: 'DM Serif Display', marginBottom: 10, color: 'var(--text)' }}>Work Breakdown</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
                <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{selectedStaff.audits}</div>
                  <div style={{ fontSize: 10, color: 'var(--blue)' }}>Audits</div>
                </div>
                <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{selectedStaff.vat}</div>
                  <div style={{ fontSize: 10, color: 'var(--green)' }}>VAT Returns</div>
                </div>
                <div style={{ background: 'var(--red-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{selectedStaff.aml}</div>
                  <div style={{ fontSize: 10, color: 'var(--red)' }}>AML Reports</div>
                </div>
              </div>

              {/* Task Completion */}
              <h4 style={{ fontSize: 13, fontFamily: 'DM Serif Display', marginBottom: 8, color: 'var(--text)' }}>Task Completion Rate</h4>
              <div style={{ marginBottom: 4 }}>
                <div className="nn-progress" style={{ height: 8 }}>
                  <div className="nn-progress-bar" style={{ width: `${(selectedStaff.completed / selectedStaff.tasks * 100)}%`, background: 'var(--green)' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 18 }}>{Math.round(selectedStaff.completed / selectedStaff.tasks * 100)}% ({selectedStaff.completed} of {selectedStaff.tasks} tasks)</div>
            </div>
            <div className="modal-footer">
              <button className="tbtn tbtn-outline" onClick={() => setShowReportModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffAppreciation;
