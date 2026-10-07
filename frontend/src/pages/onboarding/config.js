export const SERVICE_TYPES = ['Audit', 'Corporate tax return filing', 'Internal Audit', 'AML consultancy', 'Accounting', 'Vat consultancy'];
export const PIPELINE_STAGES = [
  { id: 'stage_1', label: 'Stage 1: New Lead / Inquiry' }, { id: 'stage_2', label: 'Stage 2: Discovery & KYC Check' },
  { id: 'stage_3', label: 'Stage 3: Proposal Sent & Negotiation' }, { id: 'stage_4', label: 'Stage 4: Engagement Signed & Advance' },
  { id: 'stage_5', label: 'Stage 5: Onboarding Completed & Execution' }, { id: 'stage_6', label: 'Stage 6: Lost / On Hold' },
];
const CONFIG = {
  Audit: { purpose: 'audit_purpose', purposeLabel: 'Audit Purpose', period: true, periodLabel: 'Audit Period / Years', previousAuditor: true, showCt: true, sheet: 'Master Sheet' },
  'Corporate tax return filing': { purpose: 'service_purpose', purposeLabel: 'Purpose', period: true, periodLabel: 'Period / Years', showCt: true, sheet: 'Corporate Tax Return Filing' },
  'Internal Audit': { purpose: 'audit_purpose', purposeLabel: 'Audit Purpose', period: true, periodLabel: 'Internal Audit Period / Years', previousAuditor: true, sheet: 'Internal Audit' },
  'AML consultancy': { purpose: 'audit_purpose', purposeLabel: 'Audit Purpose', period: true, periodLabel: 'Period / Years', showCt: true, sheet: 'AML Consultancy' },
  Accounting: { period: true, periodLabel: 'Period / Years', sheet: 'Accounting' },
  'Vat consultancy': { purpose: 'service_purpose', purposeLabel: 'Purpose', sheet: 'VAT Consultancy' },
};
export const serviceFields = (service) => CONFIG[service] || { sheet: 'Select a service' };