import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const DueDiligence = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Due Diligence"
      subtitle="Pre-transaction financial, tax and operational review"
      stats={[
        { value: '2', label: 'Active' },
        { value: 'Phase 1', label: 'Current' },
        { value: 'FDD/TDD', label: 'Scope' },
      ]}
      clients={[
        { name: 'Target Co. Alpha', sub: 'Financial Due Diligence · Haritha', status: 'Phase 1', statusType: 'pill-blue', progress: 45,
          info: [{ label: 'Scope', value: 'FDD + TDD' }, { label: 'Timeline', value: '4 weeks' }],
          docGroups: [
            { title: 'Financial DD', items: [{ label: 'Revenue analysis', done: true }, { label: 'Working capital review', done: true }, { label: 'Debt structure', done: false }, { label: 'Tax compliance check', done: false }] },
            { title: 'Tax DD', items: [{ label: 'VAT compliance', done: true }, { label: 'CT assessment', done: false }, { label: 'Tax risk memo', done: false }] },
          ] },
        { name: 'Target Co. Beta', sub: 'Operational Due Diligence · Shamil A.', status: 'Phase 1', statusType: 'pill-blue', progress: 25,
          docGroups: [
            { title: 'Operational DD', items: [{ label: 'Business model review', done: true }, { label: 'Key contracts', done: false }, { label: 'HR assessment', done: false }] },
          ] },
      ]}
    />
  );
};

export default DueDiligence;
