import React from 'react';
import { useOutletContext } from 'react-router-dom';

const VATFiling = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>VAT Filing</h1>
        <p className="text-gray-400 mt-1">Submit VAT returns via FTA EmaraTax Portal</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#ef4444' }}>5</h3>
          <p className="text-sm text-gray-400">Pending Filings</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#10b981' }}>11</h3>
          <p className="text-sm text-gray-400">Filed This Month</p>
        </div>
        <div className="p-4 rounded-lg border" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-2xl font-light mb-1" style={{ fontFamily: 'DM Serif Display', color: '#f59e0b' }}>28 Apr</h3>
          <p className="text-sm text-gray-400">Next Deadline</p>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-medium text-white mb-4" style={{ fontFamily: 'DM Serif Display' }}>VAT301 Return Form</h2>
        <p className="text-gray-400">VAT filing interface will be displayed here</p>
      </div>
    </div>
  );
};

export default VATFiling;
