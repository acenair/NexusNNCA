import React from 'react';
import { useOutletContext } from 'react-router-dom';

const Reminders = () => {
  const { user } = useOutletContext();

  const reminders = [
    { title: 'VAT Returns — all 5 clients due 28 Apr 2026', daysLeft: '32 days remaining', count: 5 },
    { title: 'AML Monthly Reviews — 3 clients due 10 Apr', daysLeft: '14 days remaining', count: 3 },
    { title: 'Internal Audit Reports — 3 reports due 10 Apr', daysLeft: '14 days remaining', count: 3 },
    { title: 'CT Return — Gulf Pharma Group', daysLeft: 'Due 30 Apr 2026 — 34 days', count: 1 },
    { title: 'Sunrise Holdings — DED approval expected', daysLeft: 'Company formation in process', count: 1 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Monthly Compliance Reminders</h1>
        <p className="text-gray-400 mt-1">March 2026</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white" style={{ fontFamily: 'DM Serif Display' }}>Upcoming Alerts</h2>
          <span className="px-2 py-1 text-xs rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {reminders.length} active
          </span>
        </div>

        {reminders.map((reminder, idx) => (
          <div key={idx} className="p-6 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
            <h3 className="text-base font-medium text-white mb-2">{reminder.title}</h3>
            <p className="text-sm" style={{ color: '#D4AF37' }}>{reminder.daysLeft}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Reminders;
