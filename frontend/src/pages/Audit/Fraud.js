import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const FraudAudit = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Fraud Audit"
      subtitle="Forensic investigation and fraud risk assessment"
      stats={[
        { value: 'ISA 240', label: 'Standard' },
        { value: 'Active', label: 'Status' },
        { value: 'Confidential', label: 'Level' },
      ]}
      clients={[
        { name: 'Confidential Client', sub: 'Forensic Investigation · Partner-led', status: 'Active', statusType: 'pill-red', progress: 35,
          info: [{ label: 'Standard', value: 'ISA 240' }, { label: 'Classification', value: 'Confidential' }],
          docGroups: [
            { title: 'Investigation Steps', items: [{ label: 'Initial assessment', done: true }, { label: 'Data collection', done: true }, { label: 'Forensic analysis', done: false }, { label: 'Findings report', done: false }] },
          ] },
      ]}
    />
  );
};

export default FraudAudit;
