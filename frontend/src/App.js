import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import '@/App.css';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import Dashboard from '@/pages/Dashboard';
import AIAssistant from '@/pages/AIAssistant';
import Clients from '@/pages/Clients';
import Tasks from '@/pages/Tasks';
import VATRegistrations from '@/pages/VAT/Registrations';
import VATFilings from '@/pages/VAT/Filings';
import VATRegistrationWorkflow from '@/pages/VAT/RegistrationWorkflow';
import AuditEngagements from '@/pages/Audit/Engagements';
import AMLAlerts from '@/pages/AML/Alerts';
import Analytics from '@/pages/Analytics';
import ProtectedRoute from '@/components/ProtectedRoute';
import MainLayout from '@/components/MainLayout';

function AppRouter() {
  const location = useLocation();
  
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ai-assistant" element={<AIAssistant />} />
        <Route path="clients" element={<Clients />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="vat/registrations" element={<VATRegistrations />} />
        <Route path="vat/registration-workflow/:id" element={<VATRegistrationWorkflow />} />
        <Route path="vat/registration-workflow" element={<VATRegistrationWorkflow />} />
        <Route path="vat/filings" element={<VATFilings />} />
        <Route path="audit/engagements" element={<AuditEngagements />} />
        <Route path="aml/alerts" element={<AMLAlerts />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </div>
  );
}

export default App;
