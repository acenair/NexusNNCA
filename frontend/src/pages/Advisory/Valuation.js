import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const Valuation = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Business Valuation"
      subtitle="Enterprise value assessment"
      stats={[
        { value: 'DCF', label: 'Primary' },
        { value: 'Multiples', label: 'Cross-check' },
        { value: '2', label: 'Pending' },
      ]}
      clients={[
        { name: 'Marina Holdings', sub: 'Enterprise Valuation · Anju', status: 'In Progress', statusType: 'pill-blue', progress: 60,
          info: [{ label: 'Method', value: 'DCF + EV/EBITDA' }, { label: 'Purpose', value: 'Share transfer' }],
          docGroups: [
            { title: 'Valuation Process', items: [{ label: 'Financial analysis', done: true }, { label: 'DCF model', done: true }, { label: 'Comparable analysis', done: false }, { label: 'Valuation report', done: false }] },
          ] },
        { name: 'Desert Rose Trading', sub: 'Business Valuation · Roshith', status: 'In Progress', statusType: 'pill-blue', progress: 30,
          info: [{ label: 'Method', value: 'DCF + Market multiples' }, { label: 'Purpose', value: 'Acquisition' }],
          docGroups: [
            { title: 'Valuation Process', items: [{ label: 'Financial analysis', done: true }, { label: 'DCF model', done: false }, { label: 'Valuation report', done: false }] },
          ] },
      ]}
    />
  );
};

export default Valuation;
