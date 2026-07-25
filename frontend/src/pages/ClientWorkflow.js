import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientDashboard from './ClientDashboard';

const ClientWorkflow = () => {
  const { user } = useOutletContext();
  return <ClientDashboard user={user} defaultTab="workflow" />;
};

export default ClientWorkflow;
