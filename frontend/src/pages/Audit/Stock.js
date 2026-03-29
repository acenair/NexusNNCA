import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const StockAudit = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="Stock Audit"
      subtitle="Physical inventory count and valuation verification"
      stats={[
        { value: '1', label: 'Scheduled' },
        { value: 'Apr 22', label: 'Count Date' },
        { value: 'FIFO', label: 'Valuation' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'Inventory Count · Fazil', status: 'Scheduled', statusType: 'pill-blue', progress: 10,
          info: [{ label: 'Count Date', value: '22 Apr 2026' }, { label: 'Valuation Method', value: 'FIFO' }, { label: 'Location', value: 'Warehouse A, Dubai' }],
          docGroups: [
            { title: 'Pre-Count Preparation', items: [{ label: 'Count instructions', done: true }, { label: 'Team briefing', done: false }, { label: 'Tag preparation', done: false }] },
            { title: 'Count & Verification', items: [{ label: 'Physical count', done: false }, { label: 'Valuation check', done: false }, { label: 'Reconciliation', done: false }] },
          ] },
      ]}
    />
  );
};

export default StockAudit;
