import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const CorporateTax = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Corporate Tax"
      subtitle="UAE CT registration, compliance and returns"
      stats={[
        { value: '9%', label: 'CT Rate' },
        { value: 'AED 375K', label: 'Threshold' },
        { value: 'Jun 2023', label: 'Effective' },
      ]}
      clients={[
        { name: 'Gulf Pharma Group', sub: 'CT Return · Anju', status: 'In Progress', statusType: 'pill-blue', progress: 55,
          info: [{ label: 'Tax Period', value: 'FY 2025' }, { label: 'Due Date', value: '30 Apr 2026' }],
          docGroups: [
            { title: 'CT Return Process', items: [{ label: 'Financial statements', done: true }, { label: 'Tax computation', done: true }, { label: 'Transfer pricing review', done: false }, { label: 'Return filing', done: false }] },
          ] },
        { name: 'Al Baraka Trading LLC', sub: 'CT Compliance · Subin', status: 'In Progress', statusType: 'pill-blue', progress: 40,
          docGroups: [
            { title: 'CT Return Process', items: [{ label: 'Financial statements', done: true }, { label: 'Tax computation', done: false }, { label: 'Return filing', done: false }] },
          ] },
        { name: 'Falcon Logistics Co.', sub: 'CT Registration · Roshith', status: 'Registered', statusType: 'pill-green', progress: 100,
          info: [{ label: 'CT Registration', value: 'Complete' }, { label: 'First Return', value: 'Dec 2026' }] },
        { name: 'Marina Holdings', sub: 'CT Compliance · Thasleema', status: 'In Progress', statusType: 'pill-blue', progress: 35,
          docGroups: [
            { title: 'CT Return Process', items: [{ label: 'Financial statements', done: true }, { label: 'Tax computation', done: false }] },
          ] },
      ]}
    />
  );
};

export default CorporateTax;
