import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const StatutoryAudit = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Statutory Audit"
      subtitle="Annual financial statement audit — ISA compliant · Federal Decree-Law No. 32 of 2021"
      stats={[
        { value: '10', label: 'Engagements' },
        { value: 'ISA', label: 'Standard' },
        { value: 'IFRS', label: 'Framework' },
        { value: '7 Yrs', label: 'Retention' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'Fieldwork · Fazil', status: 'In Progress', statusType: 'pill-blue', progress: 45,
          docGroups: [
            { title: 'Planning Documents', items: [{ label: 'Engagement letter', done: true }, { label: 'Risk assessment', done: true }, { label: 'Audit plan', done: true }, { label: 'Materiality memo', done: false }] },
            { title: 'Fieldwork', items: [{ label: 'Revenue testing', done: true }, { label: 'Expense sampling', done: false }, { label: 'Bank confirmations', done: false }, { label: 'Inventory count', done: false }] },
          ] },
        { name: 'Falcon Logistics Co.', sub: 'Planning · Subin', status: 'In Progress', statusType: 'pill-navy', progress: 20,
          docGroups: [
            { title: 'Planning Documents', items: [{ label: 'Engagement letter', done: true }, { label: 'Risk assessment', done: false }, { label: 'Audit plan', done: false }] },
          ] },
        { name: 'Gulf Pharma Group', sub: 'Fieldwork · Anju', status: 'In Progress', statusType: 'pill-blue', progress: 60,
          docGroups: [
            { title: 'Planning Documents', items: [{ label: 'Engagement letter', done: true }, { label: 'Risk assessment', done: true }, { label: 'Audit plan', done: true }] },
            { title: 'Fieldwork', items: [{ label: 'Revenue testing', done: true }, { label: 'Expense sampling', done: true }, { label: 'Bank confirmations', done: false }] },
          ] },
        { name: 'Al Hayat Retail', sub: 'Completion · Haritha', status: 'Due Soon', statusType: 'pill-amber', progress: 88,
          docGroups: [
            { title: 'Completion', items: [{ label: 'Draft report', done: true }, { label: 'Management letter', done: true }, { label: 'Partner review', done: false }] },
          ] },
      ]}
    />
  );
};

export default StatutoryAudit;
