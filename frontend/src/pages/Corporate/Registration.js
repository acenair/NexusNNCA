import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const CorporateRegistration = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Corporate Registration"
      subtitle="Company registration with UAE DED"
      stats={[
        { value: 'DED', label: 'Authority' },
        { value: '5-10 Days', label: 'Timeline' },
        { value: 'LLC/EST', label: 'Types' },
      ]}
      clients={[
        { name: 'New Company Setup', sub: 'DED Registration · Jithin', status: 'In Progress', statusType: 'pill-blue', progress: 50,
          docGroups: [
            { title: 'Registration Documents', items: [{ label: 'MOA / AOA', done: true }, { label: 'Partner passports', done: true }, { label: 'NOC letters', done: false }, { label: 'DED application', done: false }, { label: 'Trade licence issuance', done: false }] },
          ] },
      ]}
    />
  );
};

export default CorporateRegistration;
