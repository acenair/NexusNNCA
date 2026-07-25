import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDashboard from './ClientDashboard';

const ClientDocuments = () => {
  const { user } = useOutletContext();
  return <ClientDashboard user={user} defaultTab="documents" />;
};

export default ClientDocuments;
