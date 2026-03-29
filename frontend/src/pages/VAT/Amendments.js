import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ServicePage from '@/components/ServicePage';

const VATAmendments = () => {
  const { user } = useOutletContext();
  return (
    <ServicePage
      title="VAT Amendments"
      subtitle="Voluntary disclosures and amendments"
      stats={[
        { value: 'Art 27', label: 'Law Ref' },
        { value: 'FTA', label: 'Portal' },
        { value: '20 Days', label: 'Window' },
      ]}
      clients={[
        { name: 'Sample Amendment', sub: 'Voluntary Disclosure · Partner Review', status: 'Pending', statusType: 'pill-amber',
          info: [{ label: 'Type', value: 'Voluntary Disclosure' }, { label: 'Reference', value: 'Article 27' }, { label: 'Window', value: '20 business days' }],
          docGroups: [
            { title: 'Amendment Process', items: [{ label: 'Error identification', done: true }, { label: 'Impact calculation', done: false }, { label: 'Voluntary disclosure form', done: false }, { label: 'FTA submission', done: false }] },
          ] },
      ]}
    />
  );
};

export default VATAmendments;
