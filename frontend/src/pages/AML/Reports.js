import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const AMLReports = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Monthly AML Report"
      subtitle="Management and regulatory compliance reporting — due 10th"
      stats={[
        { value: 'Monthly', label: 'Frequency' },
        { value: 'MLRO', label: 'Partner Sign-off' },
        { value: '3', label: 'Reports Due' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'March 2026 Report · Subin · MLRO: Arjun S.', status: 'In Progress', statusType: 'pill-blue', progress: 65,
          docGroups: [
            { title: 'Report Sections', items: [{ label: 'Transaction summary', done: true }, { label: 'Risk assessment update', done: true }, { label: 'STR summary', done: true }, { label: 'MLRO commentary', done: false }, { label: 'Sign-off', done: false }] },
          ] },
        { name: 'Desert Rose Trading', sub: 'March 2026 Report · Thasleema · MLRO: Arjun S.', status: 'In Progress', statusType: 'pill-blue', progress: 50,
          docGroups: [
            { title: 'Report Sections', items: [{ label: 'Transaction summary', done: true }, { label: 'Risk assessment update', done: true }, { label: 'STR summary', done: false }, { label: 'MLRO commentary', done: false }] },
          ] },
        { name: 'Gulf Pharma Group', sub: 'March 2026 Report · Anju · MLRO: Sooraj N.', status: 'In Progress', statusType: 'pill-blue', progress: 35,
          docGroups: [
            { title: 'Report Sections', items: [{ label: 'Transaction summary', done: true }, { label: 'Risk assessment update', done: false }, { label: 'MLRO commentary', done: false }] },
          ] },
      ]}
    />
  );
};

export default AMLReports;
