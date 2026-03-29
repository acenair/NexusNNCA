import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const VATRegistration = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="VAT Registration"
      subtitle="New TRN registration with UAE Federal Tax Authority"
      stats={[
        { value: 'AED 375K', label: 'Threshold' },
        { value: '20 Days', label: 'Timeline' },
        { value: 'FTA', label: 'Authority' },
      ]}
      clients={[
        { name: 'New Client Pending', sub: 'TRN Application · Subin', status: 'Pending', statusType: 'pill-amber', progress: 30,
          info: [{ label: 'Threshold', value: 'AED 375,000' }, { label: 'Timeline', value: '20 business days' }],
          docGroups: [
            { title: 'Required Documents', items: [{ label: 'Trade licence copy', done: true }, { label: 'Emirates ID', done: true }, { label: 'Passport copies', done: false }, { label: 'Bank statements (6 months)', done: false }, { label: 'Turnover declaration', done: false }] },
            { title: 'FTA Submission', items: [{ label: 'Online application', done: false }, { label: 'Document upload', done: false }, { label: 'TRN issuance', done: false }] },
          ] },
      ]}
    />
  );
};

export default VATRegistration;
