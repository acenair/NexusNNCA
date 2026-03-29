import React from 'react';
import { useOutletContext } from 'react-router-dom';

const DeadlineTracker = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Deadline Tracker</h1>
        <p className="text-gray-400 mt-1">Track all compliance deadlines and upcoming tasks</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {['Statutory Audits', 'VAT Filings', 'Internal Audit', 'AML Reports'].map((item, idx) => (
          <div key={idx} className="p-6 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
            <h3 className="text-2xl font-light mb-2" style={{ fontFamily: 'DM Serif Display', color: '#D4AF37' }}>{idx === 0 ? 10 : idx === 1 ? 5 : 3}</h3>
            <p className="text-sm text-gray-400">{item}</p>
            <p className="text-xs text-gray-500 mt-1">Various deadlines</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <p className="text-gray-400">Deadline tracker interface will be displayed here</p>
      </div>
    </div>
  );
};

export default DeadlineTracker;
