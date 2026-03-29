import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import '@/App.css';
import Login from '@/pages/Login';
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
import ProtectedRoute from '@/components/ProtectedRoute';
import MainLayout from '@/components/MainLayout';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth-callback" element={<AuthCallback />} />
          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="deadlines" element={<DeadlineTracker />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="appreciation" element={<StaffAppreciation />} />
            <Route path="reminders" element={<Reminders />} />
            
            {/* Audit */}
            <Route path="audit/statutory" element={<StatutoryAudit />} />
            <Route path="audit/internal" element={<InternalAudit />} />
            <Route path="audit/stock" element={<StockAudit />} />
            <Route path="audit/fraud" element={<FraudAudit />} />
            
            {/* VAT */}
            <Route path="vat/registration" element={<VATRegistration />} />
            <Route path="vat/filing" element={<VATFiling />} />
            <Route path="vat/amendments" element={<VATAmendments />} />
            
            {/* Corporate */}
            <Route path="corporate/registration" element={<CorporateRegistration />} />
            <Route path="corporate/tax" element={<CorporateTax />} />
            <Route path="corporate/formation" element={<Formation />} />
            <Route path="corporate/liquidation" element={<Liquidation />} />
            
            {/* Advisory */}
            <Route path="advisory/valuation" element={<Valuation />} />
            <Route path="advisory/due-diligence" element={<DueDiligence />} />
            
            {/* AML */}
            <Route path="aml/review" element={<AMLReview />} />
            <Route path="aml/filing" element={<AMLFiling />} />
            <Route path="aml/reports" element={<AMLReports />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
