import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const Formation = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Company Formation"
      subtitle="End-to-end business setup in UAE"
      stats={[
        { value: '3', label: 'Active' },
        { value: 'Mainland', label: '& Free Zone' },
        { value: '100%', label: 'Foreign OK' },
      ]}
      clients={[
        { name: 'Sunrise Holdings', sub: 'Mainland · DED · Jithin', status: 'In Progress', statusType: 'pill-blue', progress: 65,
          docGroups: [
            { title: 'Formation Steps', items: [{ label: 'Initial name approval', done: true }, { label: 'MOA drafting', done: true }, { label: 'DED application', done: true }, { label: 'Trade licence', done: false }, { label: 'Bank account opening', done: false }] },
          ] },
        { name: 'Tech Startup DMCC', sub: 'Free Zone · DMCC · Shamil A.', status: 'In Progress', statusType: 'pill-blue', progress: 40,
          docGroups: [
            { title: 'Formation Steps', items: [{ label: 'DMCC application', done: true }, { label: 'Lease agreement', done: false }, { label: 'Licence issuance', done: false }] },
          ] },
        { name: 'Consulting ADGM', sub: 'Free Zone · ADGM · Thasleema', status: 'In Progress', statusType: 'pill-blue', progress: 25,
          docGroups: [
            { title: 'Formation Steps', items: [{ label: 'ADGM application', done: true }, { label: 'Registered office', done: false }, { label: 'Licence approval', done: false }] },
          ] },
      ]}
    />
  );
};

export default Formation;
