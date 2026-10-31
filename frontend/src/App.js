import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import LandingPage from '@/pages/LandingPage';
import Help from '@/pages/Help';
import DocRequests from '@/pages/DocRequests';
import ClientUpload from '@/pages/ClientUpload';
import Login from '@/pages/Login';
import ChangePassword from '@/pages/ChangePassword';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AuthCallback from '@/pages/AuthCallback';
import Dashboard from '@/pages/Dashboard';
import DeadlineTracker from '@/pages/DeadlineTracker';
import Calendar from '@/pages/Calendar';
import StaffAppreciation from '@/pages/StaffAppreciation';
import Reminders from '@/pages/Reminders';
import StatutoryAudit from '@/pages/Audit/Statutory';
import InternalAudit from '@/pages/Audit/Internal';
import StockAudit from '@/pages/Audit/Stock';
import FraudAudit from '@/pages/Audit/Fraud';
import VATRegistration from '@/pages/VAT/Registration';
import VATRegistrations from '@/pages/VAT/Registrations';
import VATRegistrationWorkflow from '@/pages/VAT/RegistrationWorkflow';
import VATFiling from '@/pages/VAT/Filing';
import VATAmendments from '@/pages/VAT/Amendments';
import CorporateRegistration from '@/pages/Corporate/Registration';
import CorporateTax from '@/pages/Corporate/Tax';
import Formation from '@/pages/Corporate/Formation';
import Liquidation from '@/pages/Corporate/Liquidation';
import Valuation from '@/pages/Advisory/Valuation';
import DueDiligence from '@/pages/Advisory/DueDiligence';
import AMLReview from '@/pages/AML/Review';
import AMLFiling from '@/pages/AML/Filing';
import AMLReports from '@/pages/AML/Reports';
import AIAssistant from '@/pages/AIAssistant';
import ClientMaster from '@/pages/ClientMaster';
import Engagements from '@/pages/Engagements';
import BillingWorkspace from '@/pages/BillingWorkspace';
import AttendanceLeave from '@/pages/AttendanceLeave';
import WorkPerformance from '@/pages/WorkPerformance';
import Reports from '@/pages/Reports';
import Leads from '@/pages/Leads';
import Compliance from '@/pages/Compliance';
import Customer360 from '@/pages/Customer360';
import CustomersOverview from '@/pages/CustomersOverview';
import Documents from '@/pages/Documents';
import Settings from '@/pages/Settings';
import Tasks from '@/pages/Tasks';
import MyTasks from '@/pages/MyTasks';
import ClientTimeline from '@/pages/ClientTimeline';
import EngagementDetail from '@/pages/EngagementDetail';
import ClientOnboarding from '@/pages/ClientOnboarding';
import OnboardingTracker from '@/pages/OnboardingTracker';
import Invoices from '@/pages/Invoices';
import AgeingReport from '@/pages/AgeingReport';
import Einvoicing from '@/pages/Einvoicing';
import Proposals from '@/pages/Proposals';
import ClientLayout from '@/components/ClientLayout';
import ClientDocuments from '@/pages/ClientDocuments';
import ClientWorkflow from '@/pages/ClientWorkflow';
import ClientInvoices from '@/pages/ClientInvoices';
import ProtectedRoute from '@/components/ProtectedRoute';
import MainLayout from '@/components/MainLayout';

// Global axios interceptor — adds auth token to ALL requests
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('session_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response interceptor — redirect 403 PASSWORD_CHANGE_REQUIRED to change-password
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 403 &&
      String(error.response?.data?.detail).toLowerCase() === 'password_change_required' &&
      window.location.pathname !== '/change-password'
    ) {
      window.location.href = '/change-password';
    }
    return Promise.reject(error);
  }
);

function AppRouter() {
  const location = useLocation();
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  // Check URL fragment for session_id from Google OAuth callback
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/upload/:token" element={<ClientUpload />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
      <Route path="/auth-callback" element={<AuthCallback />} />
      <Route path="/app" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="deadlines" element={<DeadlineTracker />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="appreciation" element={<StaffAppreciation />} />
        <Route path="reminders" element={<Reminders />} />
        
        {/* Audit */}
        <Route path="audit/statutory" element={<Engagements />} />
        <Route path="audit/internal" element={<Engagements />} />
        <Route path="audit/stock" element={<Engagements />} />
        <Route path="audit/fraud" element={<Engagements />} />
        
        {/* VAT */}
        <Route path="vat/registration" element={<Engagements />} />
        <Route path="vat/registrations" element={<VATRegistrations />} />
        <Route path="vat/registration-workflow" element={<VATRegistrationWorkflow />} />
        <Route path="vat/registration-workflow/:id" element={<VATRegistrationWorkflow />} />
        <Route path="vat/filing" element={<Engagements />} />
        <Route path="vat/amendments" element={<Engagements />} />
        
        {/* Corporate */}
        <Route path="corporate/registration" element={<Engagements />} />
        <Route path="corporate/tax" element={<Engagements />} />
        <Route path="corporate/formation" element={<Engagements />} />
        <Route path="corporate/liquidation" element={<Engagements />} />
        
        {/* Advisory */}
        <Route path="advisory/valuation" element={<Engagements />} />
        <Route path="advisory/due-diligence" element={<Engagements />} />
        
        {/* AML */}
        <Route path="aml/review" element={<Engagements />} />
        <Route path="aml/filing" element={<Engagements />} />
        <Route path="aml/reports" element={<Engagements />} />
        
        {/* AI Assistant */}
        <Route path="ai-assistant" element={<AIAssistant />} />
        <Route path="client-master" element={<ClientMaster />} />
        <Route path="documents" element={<Documents />} />
        <Route path="settings" element={<Settings />} />
        <Route path="customers" element={<CustomersOverview />} />
        <Route path="customers/:clientId" element={<Customer360 />} />
        <Route path="clients/:clientId/timeline" element={<ClientTimeline />} />
        <Route path="engagements" element={<Engagements />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="einvoicing" element={<Einvoicing />} />
        <Route path="attendance" element={<AttendanceLeave />} />
        <Route path="leads" element={<Leads />} />
        <Route path="performance" element={<WorkPerformance />} />
        <Route path="reports" element={<Reports />} />
      <Route path="help" element={<Help />} />
      <Route path="doc-requests" element={<DocRequests />} />
        <Route path="engagements/:engagementId" element={<EngagementDetail />} />
        <Route path="onboarding" element={<ClientOnboarding />} />
        <Route path="clients/:clientId/onboarding" element={<OnboardingTracker />} />
        <Route path="clients/:clientId/onboarding/:onboardingId" element={<OnboardingTracker />} />
        <Route path="invoices" element={<BillingWorkspace />} />
        <Route path="ageing-report" element={<BillingWorkspace />} />
        <Route path="proposals" element={<Proposals />} />
      </Route>
      {/* Client Portal Routes */}
      <Route path="/client" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/client/documents" replace />} />
        <Route path="documents" element={<ClientDocuments />} />
        <Route path="workflow" element={<ClientWorkflow />} />
        <Route path="invoices" element={<ClientInvoices />} />
      </Route>
      {/* Legacy routes redirect to /app/* */}
      <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/tasks" element={<Navigate to="/app/tasks" replace />} />
      <Route path="/deadlines" element={<Navigate to="/app/deadlines" replace />} />
      <Route path="/calendar" element={<Navigate to="/app/calendar" replace />} />
      <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
      <Route path="/reminders" element={<Navigate to="/app/reminders" replace />} />
      <Route path="/ai-assistant" element={<Navigate to="/app/ai-assistant" replace />} />
      <Route path="/client-master" element={<Navigate to="/app/client-master" replace />} />
      <Route path="/documents" element={<Navigate to="/app/documents" replace />} />
      <Route path="/onboarding" element={<Navigate to="/app/onboarding" replace />} />
      <Route path="/invoices" element={<Navigate to="/app/invoices" replace />} />
      <Route path="/appreciation" element={<Navigate to="/app/appreciation" replace />} />
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
