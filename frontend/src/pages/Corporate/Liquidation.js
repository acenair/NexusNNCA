import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const Liquidation = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Company Liquidation"
      subtitle="Winding up and deregistration from UAE authorities"
      stats={[
        { value: '2-6 Mo', label: 'Timeline' },
        { value: 'MOL', label: 'Clearance' },
        { value: 'FTA', label: 'Tax Clearance' },
      ]}
      clients={[
        { name: 'Dormant Entity LLC', sub: 'Liquidation Process · Akhil', status: 'In Progress', statusType: 'pill-amber', progress: 45,
          docGroups: [
            { title: 'Liquidation Steps', items: [{ label: 'Board resolution', done: true }, { label: 'FTA tax clearance', done: true }, { label: 'MOL clearance', done: false }, { label: 'DED deregistration', done: false }, { label: 'Bank closure', done: false }] },
          ] },
      ]}
    />
  );
};

export default Liquidation;
