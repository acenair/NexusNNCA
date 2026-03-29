import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const DeadlineTracker = () => {
  const { user } = useOutletContext();
  const [activeTab, setActiveTab] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [search, setSearch] = useState('');

  const summaryCards = [
    { label: 'Total Items', value: 21, color: 'var(--text)' },
    { label: 'Due This Week', value: 0, color: 'var(--green)', pill: 'pill-green', pillText: 'Clear' },
    { label: 'Due in 14 Days', value: 7, color: 'var(--amber)', pill: 'pill-amber', pillText: 'Action' },
    { label: 'Due in 30 Days', value: 10, color: 'var(--blue)', pill: 'pill-blue', pillText: 'Fieldwork' },
    { label: 'Overdue', value: 0, color: 'var(--red)', pill: 'pill-red', pillText: 'None' },
  ];

  const workloadData = [
    { name: 'Fazil', items: 3, color: '#3b82f6' },
    { name: 'Subin', items: 2, color: '#10b981' },
    { name: 'Anju', items: 2, color: '#f59e0b' },
    { name: 'Roshith', items: 2, color: '#ef4444' },
    { name: 'Thasleema', items: 2, color: '#8b5cf6' },
    { name: 'Jithin', items: 2, color: '#06b6d4' },
    { name: 'Shamil A.', items: 2, color: '#ec4899' },
    { name: 'Akhil', items: 2, color: '#14b8a6' },
    { name: 'Haritha', items: 2, color: '#f97316' },
  ];

  const tabs = [
    { key: 'all', label: 'All', count: 21 },
    { key: 'statutory', label: 'Statutory', count: 10 },
    { key: 'vat', label: 'VAT', count: 5 },
    { key: 'internal', label: 'Internal Audit', count: 3 },
    { key: 'aml', label: 'AML', count: 3 },
  ];

  const statutoryAudits = [
    { client: 'Al Baraka Trading LLC', phase: 'Fieldwork', assignedTo: 'Fazil', dueDate: '2026-04-15', daysLeft: 19, progress: 45, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Falcon Logistics Co.', phase: 'Planning', assignedTo: 'Subin', dueDate: '2026-04-20', daysLeft: 24, progress: 20, status: 'In Progress', statusType: 'pill-navy' },
    { client: 'Gulf Pharma Group', phase: 'Fieldwork', assignedTo: 'Anju', dueDate: '2026-04-25', daysLeft: 29, progress: 60, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Zara Tech LLC', phase: 'Reporting', assignedTo: 'Roshith', dueDate: '2026-05-15', daysLeft: 49, progress: 80, status: 'Reporting', statusType: 'pill-purple' },
    { client: 'Sunrise Holdings', phase: 'Fieldwork', assignedTo: 'Jithin', dueDate: '2026-05-10', daysLeft: 44, progress: 50, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Marina Holdings', phase: 'Planning', assignedTo: 'Shamil A.', dueDate: '2026-05-20', daysLeft: 54, progress: 15, status: 'In Progress', statusType: 'pill-navy' },
    { client: 'Desert Rose Trading', phase: 'Fieldwork', assignedTo: 'Akhil', dueDate: '2026-04-30', daysLeft: 34, progress: 40, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Al Hayat Retail', phase: 'Completion', assignedTo: 'Haritha', dueDate: '2026-04-10', daysLeft: 14, progress: 88, status: 'Due Soon', statusType: 'pill-amber' },
    { client: 'Blue Horizon Co.', phase: 'Planning', assignedTo: 'Thasleema', dueDate: '2026-05-30', daysLeft: 64, progress: 10, status: 'In Progress', statusType: 'pill-navy' },
    { client: 'Bright Vision LLC', phase: 'Fieldwork', assignedTo: 'Fazil', dueDate: '2026-04-28', daysLeft: 32, progress: 35, status: 'In Progress', statusType: 'pill-blue' },
  ];

  const vatFilings = [
    { client: 'Al Baraka Trading LLC', period: 'Mar 2026', assignedTo: 'Subin', trn: '100234567890003', dueDate: '2026-04-28', daysLeft: 32, status: 'Paid', statusType: 'pill-green' },
    { client: 'Gulf Pharma Group', period: 'Mar 2026', assignedTo: 'Anju', trn: '100345678900012', dueDate: '2026-04-28', daysLeft: 32, status: 'Paid', statusType: 'pill-green' },
    { client: 'Falcon Logistics Co.', period: 'Mar 2026', assignedTo: 'Roshith', trn: '100456789000123', dueDate: '2026-04-28', daysLeft: 32, status: 'In Prep', statusType: 'pill-amber' },
    { client: 'Marina Holdings', period: 'Mar 2026', assignedTo: 'Thasleema', trn: '100567890001234', dueDate: '2026-04-28', daysLeft: 32, status: 'Paid', statusType: 'pill-green' },
    { client: 'Zara Tech LLC', period: 'Mar 2026', assignedTo: 'Jithin', trn: '100678900012345', dueDate: '2026-04-28', daysLeft: 32, status: 'Paid', statusType: 'pill-green' },
  ];

  const internalAudits = [
    { client: 'Falcon Logistics Co.', scope: 'Procurement & Payables', assignedTo: 'Akhil', findings: '7 findings', dueDate: '2026-04-10', daysLeft: 14, progress: 70, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Marina Holdings', scope: 'HR & Payroll Controls', assignedTo: 'Haritha', findings: '4 findings', dueDate: '2026-04-10', daysLeft: 14, progress: 55, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Sunrise Holdings', scope: 'IT General Controls', assignedTo: 'Shamil A.', findings: 'Pending', dueDate: '2026-04-10', daysLeft: 14, progress: 30, status: 'In Progress', statusType: 'pill-blue' },
  ];

  const amlReports = [
    { client: 'Al Baraka Trading LLC', month: 'March 2026', preparedBy: 'Subin', strs: '1 STR filed', mlro: 'Arjun S.', dueDate: '2026-04-10', daysLeft: 14, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Desert Rose Trading', month: 'March 2026', preparedBy: 'Thasleema', strs: '2 STRs filed', mlro: 'Arjun S.', dueDate: '2026-04-10', daysLeft: 14, status: 'In Progress', statusType: 'pill-blue' },
    { client: 'Gulf Pharma Group', month: 'March 2026', preparedBy: 'Anju', strs: 'None', mlro: 'Sooraj N.', dueDate: '2026-04-10', daysLeft: 14, status: 'In Progress', statusType: 'pill-blue' },
  ];

  const staffList = ['All Staff', 'Arjun S.', 'Sooraj N.', 'Fazil', 'Subin', 'Anju', 'Roshith', 'Thasleema', 'Jithin', 'Shamil A.', 'Akhil', 'Haritha'];

  const filterByStaffAndSearch = (items, nameField = 'assignedTo') => {
    return items.filter(item => {
      const matchesStaff = staffFilter === 'all' || item[nameField] === staffFilter;
      const matchesSearch = !search || item.client.toLowerCase().includes(search.toLowerCase());
      return matchesStaff && matchesSearch;
    });
  };

  const showSection = (sectionKey) => activeTab === 'all' || activeTab === sectionKey;

  return (
    <div className="fade-in" data-testid="deadline-tracker-view">
      {/* Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }} data-testid="dt-summary-strip">
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
      <div className="nn-card" style={{ padding: '14px 18px', marginBottom: 18 }} data-testid="workload-strip">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Workload Distribution</h3>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>9 staff members</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${workloadData.length}, 1fr)`, gap: 10 }}>
          {workloadData.map((w, idx) => (
            <div key={idx} style={{ textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: w.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto 4px' }}>
                {w.name.charAt(0)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{w.name}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.items} items</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }} data-testid="dt-controls">
        {/* Tabs */}
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

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)',
              fontSize: 12, background: 'var(--white)', color: 'var(--text)', cursor: 'pointer',
              fontFamily: 'DM Sans', outline: 'none',
            }}
            data-testid="staff-filter"
          >
            {staffList.map((s) => (
              <option key={s} value={s === 'All Staff' ? 'all' : s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)',
              fontSize: 12, background: 'var(--white)', color: 'var(--text)', width: 160,
              fontFamily: 'DM Sans', outline: 'none',
            }}
            data-testid="dt-search"
          />
        </div>
      </div>

      {/* Statutory Audits Section */}
      {showSection('statutory') && (
        <div style={{ marginBottom: 20 }} data-testid="dt-statutory-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '2px solid var(--nn-border)', marginBottom: 10 }}>
            <span className="pill pill-blue">Statutory Audit</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>10 Engagements</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>ISA Compliant · IFRS Framework</span>
          </div>
          <div className="nn-card">
            <table className="nn-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Assigned To</th>
                  <th>Phase</th>
                  <th>Due Date</th>
                  <th>Days Left</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filterByStaffAndSearch(statutoryAudits).map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.phase}</div>
                    </td>
                    <td>{row.assignedTo}</td>
                    <td><span className={`pill ${row.phase === 'Fieldwork' ? 'pill-blue' : row.phase === 'Planning' ? 'pill-navy' : row.phase === 'Reporting' ? 'pill-purple' : 'pill-amber'}`}>{row.phase}</span></td>
                    <td>{row.dueDate}</td>
                    <td><span className={`pill ${row.daysLeft <= 14 ? 'pill-amber' : 'pill-blue'}`}>{row.daysLeft} Days</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="nn-progress" style={{ width: 60 }}>
                          <div className="nn-progress-bar" style={{ width: `${row.progress}%`, background: row.progress >= 80 ? 'var(--green)' : row.progress >= 50 ? 'var(--blue)' : 'var(--amber)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{row.progress}%</span>
                      </div>
                    </td>
                    <td><span className={`pill ${row.statusType}`}>{row.status}</span></td>
                    <td><button className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VAT Filings Section */}
      {showSection('vat') && (
        <div style={{ marginBottom: 20 }} data-testid="dt-vat-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '2px solid var(--nn-border)', marginBottom: 10 }}>
            <span className="pill pill-green">VAT Filing</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>5 Returns Due</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>FTA Portal · Deadline 28 Apr 2026</span>
          </div>
          <div className="nn-card">
            <table className="nn-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Assigned To</th>
                  <th>TRN</th>
                  <th>Due Date</th>
                  <th>Days Left</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filterByStaffAndSearch(vatFilings).map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.period}</div>
                    </td>
                    <td>{row.assignedTo}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.trn}</td>
                    <td>{row.dueDate}</td>
                    <td><span className="pill pill-blue">{row.daysLeft} Days</span></td>
                    <td><span className={`pill ${row.statusType}`}>{row.status}</span></td>
                    <td><button className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Internal Audit Section */}
      {showSection('internal') && (
        <div style={{ marginBottom: 20 }} data-testid="dt-internal-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '2px solid var(--nn-border)', marginBottom: 10 }}>
            <span className="pill pill-purple">Internal Audit</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>3 Reports Due</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>IIA Standard · All Due 10 Apr</span>
          </div>
          <div className="nn-card">
            <table className="nn-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Assigned To</th>
                  <th>Findings</th>
                  <th>Due Date</th>
                  <th>Days Left</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filterByStaffAndSearch(internalAudits).map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.scope}</div>
                    </td>
                    <td>{row.assignedTo}</td>
                    <td><span className={`pill ${row.findings === 'Pending' ? 'pill-navy' : 'pill-amber'}`}>{row.findings}</span></td>
                    <td>{row.dueDate}</td>
                    <td><span className="pill pill-amber">{row.daysLeft} Days</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="nn-progress" style={{ width: 60 }}>
                          <div className="nn-progress-bar" style={{ width: `${row.progress}%`, background: row.progress >= 60 ? 'var(--blue)' : 'var(--amber)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{row.progress}%</span>
                      </div>
                    </td>
                    <td><span className={`pill ${row.statusType}`}>{row.status}</span></td>
                    <td><button className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AML Reports Section */}
      {showSection('aml') && (
        <div style={{ marginBottom: 20 }} data-testid="dt-aml-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '2px solid var(--nn-border)', marginBottom: 10 }}>
            <span className="pill pill-red">Monthly AML</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>3 Reports Due</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>DNFBP · goAML Portal · Due 10 Apr</span>
          </div>
          <div className="nn-card">
            <table className="nn-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Prepared By</th>
                  <th>STRs</th>
                  <th>MLRO</th>
                  <th>Due Date</th>
                  <th>Days Left</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filterByStaffAndSearch(amlReports, 'preparedBy').map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.month}</div>
                    </td>
                    <td>{row.preparedBy}</td>
                    <td><span className={`pill ${row.strs === 'None' ? 'pill-navy' : 'pill-amber'}`}>{row.strs}</span></td>
                    <td style={{ fontWeight: 500 }}>{row.mlro}</td>
                    <td>{row.dueDate}</td>
                    <td><span className="pill pill-amber">{row.daysLeft} Days</span></td>
                    <td><span className={`pill ${row.statusType}`}>{row.status}</span></td>
                    <td><button className="sec-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeadlineTracker;
