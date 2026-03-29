import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ChevronRight, CheckCircle2, Circle, Upload, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VAT_REGISTRATION_STEPS = [
  {
    id: 1,
    title: 'Determine Eligibility',
    description: 'Calculate taxable supplies against AED 375,000 threshold',
    fields: ['turnover_last_12_months', 'expected_turnover_30_days', 'registration_type']
  },
  {
    id: 2,
    title: 'Gather Required Documents',
    description: 'Prepare all necessary documents for FTA submission',
    documents: [
      'Trade/Commercial License (current, all branches)',
      'Certificate of Incorporation/MOA/Partnership Agreement',
      'Turnover Declaration (on letterhead, signed & stamped)',
      'Financial Evidence (statements, invoices)',
      'Emirates ID/Passport copies (owners, partners, signatories)',
      'Bank Details (IBAN, validation letter)',
      'Proof of Address (Ejari/tenancy contract)',
      'Additional: Group details, customs reg (if applicable)'
    ]
  },
  {
    id: 3,
    title: 'Business Information',
    description: 'Enter complete business details',
    fields: ['legal_name', 'trade_name', 'business_form', 'business_activities', 'accounting_period_start']
  },
  {
    id: 4,
    title: 'Upload Documents',
    description: 'Upload all required documents to system',
    fields: ['documents']
  },
  {
    id: 5,
    title: 'Review & Submit',
    description: 'Review all information before FTA submission',
    fields: ['review']
  }
];

const VATRegistrationWorkflow = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    client_id: '',
    turnover_last_12_months: '',
    expected_turnover_30_days: '',
    registration_type: '',
    legal_name: '',
    trade_name: '',
    business_form: 'LLC',
    business_activities: '',
    accounting_period_start: '',
    documents_uploaded: [],
    status: 'Draft'
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadClients();
    if (id) {
      loadRegistration(id);
    }
  }, [id]);

  const loadClients = async () => {
    try {
      const response = await axios.get(`${API}/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const loadRegistration = async (regId) => {
    try {
      const response = await axios.get(`${API}/vat/registrations/${regId}`, { withCredentials: true });
      setFormData(response.data);
      setCurrentStep(response.data.current_step || 1);
    } catch (error) {
      console.error('Failed to load registration:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calculateEligibility = () => {
    const turnover = parseFloat(formData.turnover_last_12_months) || 0;
    const expected = parseFloat(formData.expected_turnover_30_days) || 0;
    
    if (turnover >= 375000 || expected >= 375000) {
      handleInputChange('registration_type', 'Mandatory');
      return 'Mandatory';
    } else if (turnover >= 187500 || expected >= 187500) {
      handleInputChange('registration_type', 'Voluntary');
      return 'Voluntary';
    }
    return 'Not Eligible';
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      // Save progress
      const payload = { ...formData, current_step: currentStep + 1 };
      
      if (id) {
        await axios.patch(`${API}/vat/registrations/${id}`, payload, { withCredentials: true });
      } else {
        const response = await axios.post(`${API}/vat/registrations`, payload, { withCredentials: true });
        navigate(`/vat/registration-workflow/${response.data.registration_id}`, { replace: true });
      }
      
      setCurrentStep(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/vat/registrations/${id}`, 
        { ...formData, status: 'Submitted to FTA', current_step: 6 },
        { withCredentials: true }
      );
      navigate('/vat/registrations');
    } catch (error) {
      console.error('Failed to submit:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    const step = VAT_REGISTRATION_STEPS.find(s => s.id === currentStep);

    switch (currentStep) {
      case 1:
        const eligibility = calculateEligibility();
        return (
          <div className="space-y-6">
            <Alert className={eligibility === 'Not Eligible' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>FTA Threshold Requirements:</strong><br />
                • Mandatory Registration: Taxable supplies ≥ AED 375,000<br />
                • Voluntary Registration: Taxable supplies ≥ AED 187,500<br />
                • Deadline: Register within 30 days of exceeding threshold to avoid AED 10,000 penalty
              </AlertDescription>
            </Alert>

            <div>
              <Label>Select Client *</Label>
              <Select value={formData.client_id} onValueChange={(val) => handleInputChange('client_id', val)}>
                <SelectTrigger data-testid="workflow-client-select">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.client_id} value={c.client_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Turnover - Last 12 Months (AED) *</Label>
              <Input
                type="number"
                value={formData.turnover_last_12_months}
                onChange={(e) => handleInputChange('turnover_last_12_months', e.target.value)}
                placeholder="e.g., 400000"
                data-testid="turnover-12m-input"
              />
            </div>

            <div>
              <Label>Expected Turnover - Next 30 Days (AED)</Label>
              <Input
                type="number"
                value={formData.expected_turnover_30_days}
                onChange={(e) => handleInputChange('expected_turnover_30_days', e.target.value)}
                placeholder="e.g., 50000"
              />
            </div>

            {eligibility !== 'Not Eligible' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-900">✓ Eligibility: {eligibility} Registration</p>
                <p className="text-xs text-green-700 mt-1">
                  {eligibility === 'Mandatory' 
                    ? 'Your business meets the mandatory registration threshold of AED 375,000'
                    : 'Your business qualifies for voluntary registration (AED 187,500 - 375,000)'}
                </p>
              </div>
            )}

            {eligibility === 'Not Eligible' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-900">✗ Not Eligible for Registration</p>
                <p className="text-xs text-red-700 mt-1">
                  Turnover must exceed AED 187,500 for voluntary or AED 375,000 for mandatory registration
                </p>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription>
                <strong>Document Requirements (FTA 2026):</strong> All documents must be current, signed/stamped where required, and uploaded in PDF/JPG format.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h3 className="font-medium text-slate-900">Required Documents Checklist</h3>
              {step.documents.map((doc, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-md">
                  <Circle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-900">{doc}</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs">
                    <Upload size={14} className="mr-1" />
                    Upload
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <Label>Legal Name *</Label>
              <Input
                value={formData.legal_name}
                onChange={(e) => handleInputChange('legal_name', e.target.value)}
                placeholder="As per trade license"
              />
            </div>

            <div>
              <Label>Trade Name</Label>
              <Input
                value={formData.trade_name}
                onChange={(e) => handleInputChange('trade_name', e.target.value)}
                placeholder="Trading name (if different)"
              />
            </div>

            <div>
              <Label>Business Form *</Label>
              <Select value={formData.business_form} onValueChange={(val) => handleInputChange('business_form', val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LLC">Limited Liability Company (LLC)</SelectItem>
                  <SelectItem value="PJSC">Public Joint Stock Company (PJSC)</SelectItem>
                  <SelectItem value="Sole Establishment">Sole Establishment</SelectItem>
                  <SelectItem value="Partnership">Partnership</SelectItem>
                  <SelectItem value="Branch">Foreign Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Business Activities *</Label>
              <Textarea
                value={formData.business_activities}
                onChange={(e) => handleInputChange('business_activities', e.target.value)}
                placeholder="List all business activities as per license"
                rows={4}
              />
            </div>

            <div>
              <Label>Accounting Period Start Date *</Label>
              <Input
                type="date"
                value={formData.accounting_period_start}
                onChange={(e) => handleInputChange('accounting_period_start', e.target.value)}
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription>
                Upload all required documents. Files will be submitted to FTA via EmaraTax portal.
              </AlertDescription>
            </Alert>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-sm text-slate-600 mb-4">Drag and drop files here or click to browse</p>
              <Button variant="outline">Select Files</Button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription>
                <strong>Ready for Submission:</strong> Review all information before submitting to FTA. Processing time: 20 business days.
              </AlertDescription>
            </Alert>

            <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
              <h3 className="font-medium text-slate-900">Registration Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Registration Type</p>
                  <p className="font-medium text-slate-900">{formData.registration_type}</p>
                </div>
                <div>
                  <p className="text-slate-500">Annual Turnover</p>
                  <p className="font-medium text-slate-900">AED {parseFloat(formData.turnover_last_12_months || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500">Legal Name</p>
                  <p className="font-medium text-slate-900">{formData.legal_name || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Business Form</p>
                  <p className="font-medium text-slate-900">{formData.business_form}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <p className="font-medium">Important Compliance Notes:</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>FTA will review your application within 20 business days</li>
                  <li>You may be contacted for clarifications or additional documents</li>
                  <li>Once approved, you'll receive your TRN via EmaraTax portal</li>
                  <li>You must begin charging 5% VAT on taxable supplies from TRN issue date</li>
                  <li>E-invoicing is mandatory from July 2026</li>
                </ul>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>VAT Registration Workflow</h1>
        <p className="text-slate-600 mt-1">FTA Official Registration Process - 2026</p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border border-slate-200 rounded-md p-6">
        <div className="flex items-center justify-between">
          {VAT_REGISTRATION_STEPS.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep > step.id ? 'bg-green-600 text-white' :
                  currentStep === step.id ? 'bg-blue-600 text-white' :
                  'bg-slate-200 text-slate-400'
                }`}>
                  {currentStep > step.id ? <CheckCircle2 size={20} /> : step.id}
                </div>
                <p className="text-xs mt-2 text-center max-w-24 text-slate-600">{step.title}</p>
              </div>
              {idx < VAT_REGISTRATION_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  currentStep > step.id ? 'bg-green-600' : 'bg-slate-200'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white border border-slate-200 rounded-md p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>
            {VAT_REGISTRATION_STEPS[currentStep - 1]?.title}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {VAT_REGISTRATION_STEPS[currentStep - 1]?.description}
          </p>
        </div>

        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 1 || loading}
        >
          Previous
        </Button>
        {currentStep < 5 ? (
          <Button
            onClick={handleNext}
            disabled={loading || !formData.client_id}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="workflow-next-btn"
          >
            Next <ChevronRight size={18} className="ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
            data-testid="workflow-submit-btn"
          >
            Submit to FTA
          </Button>
        )}
      </div>
    </div>
  );
};

export default VATRegistrationWorkflow;
