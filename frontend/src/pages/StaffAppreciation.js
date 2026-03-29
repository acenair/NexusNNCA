import React from 'react';
import { useOutletContext } from 'react-router-dom';

const StaffAppreciation = () => {
  const { user } = useOutletContext();

  if (user?.role !== 'partner') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-xl font-medium text-white mb-2" style={{ fontFamily: 'DM Serif Display' }}>Partner Access Only</h2>
          <p className="text-gray-400">This feature is only available to partners</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Staff Appreciation & Performance</h1>
        <p className="text-gray-400 mt-1">Recognize your team and track monthly work output</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {['Team Cards', 'Staff Report', 'Leaderboard'].map((tab) => (
          <div key={tab} className="p-6 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
            <h3 className="text-lg font-medium text-white mb-2" style={{ fontFamily: 'DM Serif Display' }}>{tab}</h3>
            <p className="text-sm text-gray-400">View {tab.toLowerCase()}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-8" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <p className="text-gray-400 text-center">Staff appreciation interface will be displayed here</p>
      </div>
    </div>
  );
};

export default StaffAppreciation;
