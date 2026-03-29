import React from 'react';
import { useOutletContext } from 'react-router-dom';

const Liquidation = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Company Liquidation</h1>
        <p className="text-gray-400 mt-1">Winding up and closure procedures</p>
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-medium text-white mb-4" style={{ fontFamily: 'DM Serif Display' }}>Liquidation Checklist</h2>
        <p className="text-gray-400">Liquidation workflow will be displayed here</p>
      </div>
    </div>
  );
};

export default Liquidation;
