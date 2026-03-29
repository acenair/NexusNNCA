import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const AMLReview = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Monthly AML Review"
      subtitle="AML compliance monitoring — DNFBP obligations"
      stats={[
        { value: '3', label: 'Clients' },
        { value: 'DNFBP', label: 'Category' },
        { value: '10 Apr', label: 'All Due' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'March 2026 · Subin · MLRO: Arjun S.', status: 'In Progress', statusType: 'pill-blue', progress: 60,
          info: [{ label: 'STRs', value: '1 STR filed' }, { label: 'Risk Rating', value: 'Medium' }],
          docGroups: [
            { title: 'AML Review Checklist', items: [{ label: 'Transaction monitoring', done: true }, { label: 'KYC update check', done: true }, { label: 'Suspicious activity review', done: false }, { label: 'MLRO sign-off', done: false }] },
          ] },
        { name: 'Desert Rose Trading', sub: 'March 2026 · Thasleema · MLRO: Arjun S.', status: 'In Progress', statusType: 'pill-blue', progress: 50,
          info: [{ label: 'STRs', value: '2 STRs filed' }, { label: 'Risk Rating', value: 'High' }],
          docGroups: [
            { title: 'AML Review Checklist', items: [{ label: 'Transaction monitoring', done: true }, { label: 'KYC update check', done: true }, { label: 'Suspicious activity review', done: false }, { label: 'MLRO sign-off', done: false }] },
          ] },
        { name: 'Gulf Pharma Group', sub: 'March 2026 · Anju · MLRO: Sooraj N.', status: 'In Progress', statusType: 'pill-blue', progress: 40,
          info: [{ label: 'STRs', value: 'None' }, { label: 'Risk Rating', value: 'Low' }],
          docGroups: [
            { title: 'AML Review Checklist', items: [{ label: 'Transaction monitoring', done: true }, { label: 'KYC update check', done: false }, { label: 'MLRO sign-off', done: false }] },
          ] },
      ]}
    />
  );
};

export default AMLReview;
