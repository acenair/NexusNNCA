import React from 'react';
import { useOutletContext } from 'react-router-dom';

const DueDiligence = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Due Diligence</h1>
        <p className="text-gray-400 mt-1">Financial, legal, and tax due diligence for M&A</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#06b6d4' }}>2</h3>
          <p className="text-sm text-gray-400">Active Projects</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#10b981' }}>1</h3>
          <p className="text-sm text-gray-400">Data Room Access</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#f59e0b' }}>1</h3>
          <p className="text-sm text-gray-400">Findings Report</p>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-medium text-white mb-4" style={{ fontFamily: 'DM Serif Display' }}>Due Diligence Checklist</h2>
        <p className="text-gray-400">Due diligence workflow will be displayed here</p>
      </div>
    </div>
  );
};

export default DueDiligence;
