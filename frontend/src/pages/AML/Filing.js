import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const AMLFiling = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="AML Filing"
      subtitle="Suspicious Transaction Reports via goAML — due 10th monthly"
      stats={[
        { value: 'STR', label: 'Report Type' },
        { value: '10th', label: 'Monthly Deadline' },
        { value: 'goAML', label: 'Portal' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'STR Filing · March 2026 · Subin', status: 'Filed', statusType: 'pill-green',
          info: [{ label: 'STR Reference', value: 'STR-2026-0312' }, { label: 'Filed Date', value: '08 Mar 2026' }, { label: 'Portal', value: 'goAML' }],
          docGroups: [
            { title: 'Filing Documents', items: [{ label: 'Transaction details', done: true }, { label: 'Supporting evidence', done: true }, { label: 'goAML submission', done: true }, { label: 'Acknowledgement received', done: true }] },
          ] },
        { name: 'Desert Rose Trading', sub: 'STR Filing · March 2026 · Thasleema', status: 'Filed', statusType: 'pill-green',
          info: [{ label: 'STR References', value: 'STR-2026-0308, STR-2026-0309' }, { label: 'Filed Date', value: '05 Mar 2026' }],
          docGroups: [
            { title: 'Filing Documents', items: [{ label: 'Transaction details', done: true }, { label: 'goAML submission', done: true }, { label: 'Acknowledgement received', done: true }] },
          ] },
      ]}
    />
  );
};

export default AMLFiling;
