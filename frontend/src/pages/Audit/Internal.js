import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const InternalAudit = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Internal Audit"
      subtitle="Process effectiveness and control review"
      stats={[
        { value: '3', label: 'Reports' },
        { value: 'IIA', label: 'Standard' },
        { value: '10 Apr', label: 'All Due' },
      ]}
      clients={[
        { name: 'Falcon Logistics Co.', sub: 'Procurement & Payables · Akhil', status: 'In Progress', statusType: 'pill-blue', progress: 70,
          info: [{ label: 'Findings', value: '7 findings' }, { label: 'Due', value: '10 Apr 2026' }],
          docGroups: [
            { title: 'Audit Procedures', items: [{ label: 'Process walkthrough', done: true }, { label: 'Control testing', done: true }, { label: 'Exception analysis', done: false }, { label: 'Report draft', done: false }] },
          ] },
        { name: 'Marina Holdings', sub: 'HR & Payroll Controls · Haritha', status: 'In Progress', statusType: 'pill-blue', progress: 55,
          info: [{ label: 'Findings', value: '4 findings' }, { label: 'Due', value: '10 Apr 2026' }],
          docGroups: [
            { title: 'Audit Procedures', items: [{ label: 'Process walkthrough', done: true }, { label: 'Control testing', done: false }, { label: 'Report draft', done: false }] },
          ] },
        { name: 'Sunrise Holdings', sub: 'IT General Controls · Shamil A.', status: 'In Progress', statusType: 'pill-blue', progress: 30,
          info: [{ label: 'Findings', value: 'Pending' }, { label: 'Due', value: '10 Apr 2026' }],
          docGroups: [
            { title: 'Audit Procedures', items: [{ label: 'Process walkthrough', done: true }, { label: 'Control testing', done: false }, { label: 'Report draft', done: false }] },
          ] },
      ]}
    />
  );
};

export default InternalAudit;
