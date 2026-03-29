import React from 'react';
import { useOutletContext } from 'react-router-dom';

const FraudAudit = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Fraud Audit</h1>
        <p className="text-gray-400 mt-1">Investigation and fraud detection procedures</p>
      </div>

      <div className="rounded-lg border p-6 text-center" style={{ background: 'rgba(239,68,68,0.05)', borderColor: '#ef4444' }}>
        <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Confidential: Access restricted to assigned investigators</p>
      </div>

      <div className="rounded-lg border p-6" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-medium text-white mb-4" style={{ fontFamily: 'DM Serif Display' }}>Fraud Audit Checklist</h2>
        <p className="text-gray-400">Fraud audit procedures and evidence log will be displayed here</p>
      </div>
    </div>
  );
};

export default FraudAudit;
