import React from 'react';
import { useOutletContext } from 'react-router-dom';

const Valuation = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Business Valuation</h1>
        <p className="text-gray-400 mt-1">DCF, EBITDA multiple, and asset-based valuation</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#06b6d4' }}>2</h3>
          <p className="text-sm text-gray-400">Active Valuations</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#10b981' }}>1</h3>
          <p className="text-sm text-gray-400">Draft Reports</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#f59e0b' }}>1</h3>
          <p className="text-sm text-gray-400">Final Review</p>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-medium text-white mb-4" style={{ fontFamily: 'DM Serif Display' }}>Valuation Checklist</h2>
        <p className="text-gray-400">Valuation workflow will be displayed here</p>
      </div>
    </div>
  );
};

export default Valuation;
