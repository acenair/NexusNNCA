import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const VATFiling = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="VAT Filing"
      subtitle="Monthly VAT return preparation and FTA submission"
      stats={[
        { value: '5', label: 'Returns Due' },
        { value: '28 Apr', label: 'Deadline' },
        { value: 'FTA', label: 'Portal' },
      ]}
      clients={[
        { name: 'Al Baraka Trading LLC', sub: 'Mar 2026 · TRN: 100234567890003 · Subin', status: 'Paid', statusType: 'pill-green', progress: 100,
          docGroups: [
            { title: 'Filing Steps', items: [{ label: 'Data collection', done: true }, { label: 'Return preparation', done: true }, { label: 'Review & approval', done: true }, { label: 'FTA submission', done: true }, { label: 'Payment confirmation', done: true }] },
          ] },
        { name: 'Gulf Pharma Group', sub: 'Mar 2026 · TRN: 100345678900012 · Anju', status: 'Paid', statusType: 'pill-green', progress: 100,
          docGroups: [
            { title: 'Filing Steps', items: [{ label: 'Data collection', done: true }, { label: 'Return preparation', done: true }, { label: 'FTA submission', done: true }] },
          ] },
        { name: 'Falcon Logistics Co.', sub: 'Mar 2026 · TRN: 100456789000123 · Roshith', status: 'In Prep', statusType: 'pill-amber', progress: 40,
          docGroups: [
            { title: 'Filing Steps', items: [{ label: 'Data collection', done: true }, { label: 'Return preparation', done: false }, { label: 'Review & approval', done: false }, { label: 'FTA submission', done: false }] },
          ] },
        { name: 'Marina Holdings', sub: 'Mar 2026 · TRN: 100567890001234 · Thasleema', status: 'Paid', statusType: 'pill-green', progress: 100,
          docGroups: [
            { title: 'Filing Steps', items: [{ label: 'Data collection', done: true }, { label: 'Return preparation', done: true }, { label: 'FTA submission', done: true }] },
          ] },
      ]}
    />
  );
};

export default VATFiling;
