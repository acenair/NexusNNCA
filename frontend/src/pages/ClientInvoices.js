import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDashboard from './ClientDashboard';

const ClientInvoices = () => {
  const { user } = useOutletContext();
  return <ClientDashboard user={user} defaultTab="invoices" />;
};

export default ClientInvoices;
