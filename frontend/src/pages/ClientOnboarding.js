import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, UserPlus, Building2, Shield, Users, FileText, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ENTITY_TYPES = ['LLC', 'Group', 'Holding', 'Free Zone', 'Branch', 'Sole Proprietorship'];
const JURISDICTIONS = ['Dubai Mainland', 'Abu Dhabi', 'Sharjah', 'DMCC Free Zone', 'JAFZA Free Zone', 'Ajman Free Zone', 'Dubai Marina', 'DIFC', 'ADGM', 'RAK Free Zone'];
const RISK_RATINGS = ['Low', 'Medium', 'High'];
const ALL_SERVICES = [
  'Statutory Audit', 'Internal Audit', 'Stock Audit', 'Fraud Audit',
  'VAT Registration', 'VAT Filing', 'VAT Amendments',
  'Corporate Registration', 'Corporate Tax', 'Company Formation', 'Liquidation',
  'Valuation', 'Due Diligence', 'AML Review', 'AML Filing', 'AML Report',
];

const STEPS = [
  { id: 1, label: 'Client Details', icon: Building2 },
  { id: 2, label: 'Services', icon: FileText },
  { id: 3, label: 'Risk & Compliance', icon: Shield },
  { id: 4, label: 'Team & Notes', icon: Users },
  { id: 5, label: 'Review & Submit', icon: Check },
];

const ClientOnboarding = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [staffList, setStaffList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    entity_type: 'LLC',
    jurisdiction: '',
    trade_licence_no: '',
    trn: '',
    ct_registration_no: '',
    active_services: [],
    aml_risk_rating: 'Low',
    pep_flag: false,
    relationship_manager: '',
    relationship_manager_name: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
    auto_create_engagements: true,
  });

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const res = await axios.get(`${API}/auth/users-list`);
        setStaffList(res.data);
      } catch (e) { console.error(e); }
    };
    loadStaff();
  }, []);

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleService = (svc) => {
    setForm(prev => ({
      ...prev,
      active_services: prev.active_services.includes(svc)
        ? prev.active_services.filter(s => s !== svc)
        : [...prev.active_services, svc],
    }));
  };

  const handleRMChange = (email) => {
    const s = staffList.find(u => u.email === email);
    setForm(prev => ({ ...prev, relationship_manager: email, relationship_manager_name: s?.name || '' }));
  };

  const canProceed = () => {
    if (step === 1) return form.name.trim().length > 0 && form.entity_type;
    if (step === 2) return form.active_services.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API}/onboarding`, form, { withCredentials: true });
      setResult(res.data);
      setStep(6);
    } catch (err) {
      setError(err.response?.data?.detail || 'Onboarding failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.role !== 'partner') {
    return (
      <div className="fade-in" style={{ padding: 40, textAlign: 'center' }} data-testid="onboarding-denied">
        <h2 style={{ fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 8 }}>Access Restricted</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Client Onboarding is available to Partners only.</p>
      </div>
    );
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--white)', color: 'var(--text)' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };

  return (
    <div className="fade-in" data-testid="client-onboarding-page">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserPlus size={20} style={{ color: 'var(--gold)' }} />
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 20, margin: 0 }}>Client Onboarding</h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>Guided workflow to onboard new clients with automated task and engagement generation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      {step <= 5 && (
        <div className="nn-card" style={{ padding: '16px 20px', marginBottom: 20 }} data-testid="onboarding-stepper">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
            {STEPS.map((s, idx) => {
              const StepIcon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && <div style={{ width: 24, height: 2, background: isDone ? 'var(--gold)' : 'var(--nn-border)', borderRadius: 1 }} />}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
                      background: isActive ? 'rgba(212,175,55,0.1)' : isDone ? 'rgba(34,197,94,0.06)' : 'transparent',
                      border: isActive ? '1px solid var(--gold)' : '1px solid transparent',
                      transition: 'all 0.2s',
                    }}
                    data-testid={`step-indicator-${s.id}`}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? 'var(--green)' : isActive ? 'var(--gold)' : 'var(--nn-border)',
                      color: isDone || isActive ? '#fff' : 'var(--muted)', fontSize: 10,
                    }}>
                      {isDone ? <Check size={12} /> : <StepIcon size={11} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--gold4)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="nn-card" style={{ padding: '24px', minHeight: 300 }}>
        {/* Step 1: Client Details */}
        {step === 1 && (
          <div data-testid="onboarding-step-1">
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>Client Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Client / Entity Name *</label>
                <input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. Al Baraka Trading LLC" style={inputStyle} data-testid="onboarding-name" />
              </div>
              <div>
                <label style={labelStyle}>Entity Type *</label>
                <select value={form.entity_type} onChange={(e) => updateForm('entity_type', e.target.value)} style={inputStyle} data-testid="onboarding-entity-type">
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Jurisdiction</label>
                <select value={form.jurisdiction} onChange={(e) => updateForm('jurisdiction', e.target.value)} style={inputStyle} data-testid="onboarding-jurisdiction">
                  <option value="">Select Jurisdiction...</option>
                  {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Trade Licence No.</label>
                <input value={form.trade_licence_no} onChange={(e) => updateForm('trade_licence_no', e.target.value)} placeholder="Enter licence number" style={inputStyle} data-testid="onboarding-licence" />
              </div>
              <div>
                <label style={labelStyle}>TRN (Tax Registration No.)</label>
                <input value={form.trn} onChange={(e) => updateForm('trn', e.target.value)} placeholder="100XXXXXXXXXX" style={inputStyle} data-testid="onboarding-trn" />
              </div>
              <div>
                <label style={labelStyle}>CT Registration No.</label>
                <input value={form.ct_registration_no} onChange={(e) => updateForm('ct_registration_no', e.target.value)} placeholder="Corporate Tax registration" style={inputStyle} data-testid="onboarding-ct-reg" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Services */}
        {step === 2 && (
          <div data-testid="onboarding-step-2">
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Select Services</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Choose the services this client requires. Engagements and tasks will be auto-generated based on your selection.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_SERVICES.map(svc => {
                const active = form.active_services.includes(svc);
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleService(svc)}
                    style={{
                      padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: active ? '2px solid var(--gold)' : '1px solid var(--nn-border)',
                      background: active ? 'rgba(212,175,55,0.1)' : 'var(--white)',
                      color: active ? 'var(--gold4)' : 'var(--muted)',
                      fontFamily: 'DM Sans', transition: 'all 0.15s',
                    }}
                    data-testid={`onboarding-svc-${svc.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {active && <Check size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                    {svc}
                  </button>
                );
              })}
            </div>
            {form.active_services.length > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(212,175,55,0.04)', borderRadius: 'var(--rs)', border: '1px solid rgba(212,175,55,0.1)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold4)' }}>{form.active_services.length} service{form.active_services.length !== 1 ? 's' : ''} selected</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>— Engagements will be auto-created for each service type</span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Risk & Compliance */}
        {step === 3 && (
          <div data-testid="onboarding-step-3">
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>Risk & Compliance Assessment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 500 }}>
              <div>
                <label style={labelStyle}>AML Risk Rating</label>
                <select value={form.aml_risk_rating} onChange={(e) => updateForm('aml_risk_rating', e.target.value)} style={inputStyle} data-testid="onboarding-risk">
                  {RISK_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={form.pep_flag} onChange={(e) => updateForm('pep_flag', e.target.checked)} data-testid="onboarding-pep" />
                  PEP (Politically Exposed Person)
                </label>
              </div>
            </div>
            {form.aml_risk_rating === 'High' && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 'var(--rs)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>High Risk Client</span>
                <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, opacity: 0.8 }}>Enhanced due diligence will be required. Additional AML documentation tasks will be generated.</p>
              </div>
            )}
            {form.pep_flag && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(245,158,11,0.06)', borderRadius: 'var(--rs)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>PEP Flag Active</span>
                <p style={{ fontSize: 11, color: '#d97706', marginTop: 4, opacity: 0.8 }}>Additional screening and monitoring procedures will be applied.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Team & Notes */}
        {step === 4 && (
          <div data-testid="onboarding-step-4">
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>Team Assignment & Contact</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Relationship Manager</label>
                <select value={form.relationship_manager} onChange={(e) => handleRMChange(e.target.value)} style={inputStyle} data-testid="onboarding-rm">
                  <option value="">Assign later...</option>
                  {staffList.map(s => <option key={s.email} value={s.email}>{s.name} ({s.title || s.role})</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Contact Person</label>
                <input value={form.contact_person} onChange={(e) => updateForm('contact_person', e.target.value)} placeholder="Primary contact name" style={inputStyle} data-testid="onboarding-contact-name" />
              </div>
              <div>
                <label style={labelStyle}>Contact Email</label>
                <input type="email" value={form.contact_email} onChange={(e) => updateForm('contact_email', e.target.value)} placeholder="contact@company.ae" style={inputStyle} data-testid="onboarding-contact-email" />
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input value={form.contact_phone} onChange={(e) => updateForm('contact_phone', e.target.value)} placeholder="+971 XX XXX XXXX" style={inputStyle} data-testid="onboarding-contact-phone" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} rows={3} placeholder="Additional notes about this client..." style={{ ...inputStyle, resize: 'vertical' }} data-testid="onboarding-notes" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={form.auto_create_engagements} onChange={(e) => updateForm('auto_create_engagements', e.target.checked)} data-testid="onboarding-auto-engagements" />
                  Auto-create service engagements for selected services
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div data-testid="onboarding-step-5">
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>Review & Confirm</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Client Info */}
              <div style={{ background: 'var(--off)', padding: 16, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 10 }}>Client Details</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{form.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{form.entity_type} {form.jurisdiction && `• ${form.jurisdiction}`}</div>
                {form.trn && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'monospace' }}>TRN: {form.trn}</div>}
                {form.trade_licence_no && <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>Licence: {form.trade_licence_no}</div>}
              </div>

              {/* Risk */}
              <div style={{ background: 'var(--off)', padding: 16, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 10 }}>Risk & Compliance</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                    background: form.aml_risk_rating === 'High' ? 'var(--red-bg)' : form.aml_risk_rating === 'Medium' ? 'rgba(245,158,11,0.1)' : 'var(--green-bg)',
                    color: form.aml_risk_rating === 'High' ? 'var(--red)' : form.aml_risk_rating === 'Medium' ? '#d97706' : 'var(--green)',
                  }}>
                    {form.aml_risk_rating} Risk
                  </span>
                  {form.pep_flag && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>PEP</span>}
                </div>
              </div>

              {/* Services */}
              <div style={{ background: 'var(--off)', padding: 16, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 10 }}>Services ({form.active_services.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.active_services.map(svc => (
                    <span key={svc} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, background: 'rgba(212,175,55,0.08)', color: 'var(--gold4)', fontWeight: 500 }}>{svc}</span>
                  ))}
                </div>
              </div>

              {/* Team */}
              <div style={{ background: 'var(--off)', padding: 16, borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 10 }}>Team & Contact</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  <strong>Relationship Manager:</strong> {form.relationship_manager_name || 'Not assigned'}
                </div>
                {form.contact_person && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Contact: {form.contact_person} {form.contact_email && `(${form.contact_email})`}</div>}
              </div>
            </div>

            {/* What will be created */}
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(212,175,55,0.04)', borderRadius: 'var(--rs)', border: '1px solid rgba(212,175,55,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 8 }}>Upon Submission</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text)', lineHeight: 1.8 }}>
                <li>Client record will be created with status "Onboarding"</li>
                <li>Onboarding tasks will be auto-generated and assigned</li>
                {form.auto_create_engagements && <li>Service engagements will be created with workflow checklists</li>}
                <li>Document collection checklist will be generated</li>
              </ul>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 'var(--rs)', color: 'var(--red)', fontSize: 12 }} data-testid="onboarding-error">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 6: Success */}
        {step === 6 && result && (
          <div data-testid="onboarding-success" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={28} style={{ color: 'var(--green)' }} />
            </div>
            <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>Client Onboarded Successfully</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>{result.client_name} has been registered and workflows initiated.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, maxWidth: 400, margin: '0 auto 24px' }}>
              <div style={{ padding: '12px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold4)' }}>{result.tasks_created}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Tasks</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold4)' }}>{result.engagements_created}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Engagements</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold4)' }}>{result.document_checklist?.length || 0}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Documents</div>
              </div>
            </div>

            {/* Document Checklist */}
            {result.document_checklist && result.document_checklist.length > 0 && (
              <div style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto 24px', padding: '14px 18px', background: 'var(--off)', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold4)', textTransform: 'uppercase', marginBottom: 8 }}>Documents to Collect</div>
                {result.document_checklist.map((doc, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--nn-border)', flexShrink: 0 }} />
                    {doc}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => navigate('/app/client-master')} className="tbtn tbtn-outline" data-testid="onboarding-view-clients">View Clients</button>
              <button onClick={() => navigate('/app/tasks')} className="tbtn tbtn-outline" data-testid="onboarding-view-tasks">View Tasks</button>
              <button onClick={() => { setStep(1); setForm({ name: '', entity_type: 'LLC', jurisdiction: '', trade_licence_no: '', trn: '', ct_registration_no: '', active_services: [], aml_risk_rating: 'Low', pep_flag: false, relationship_manager: '', relationship_manager_name: '', contact_person: '', contact_email: '', contact_phone: '', notes: '', auto_create_engagements: true }); setResult(null); }} className="tbtn tbtn-gold" data-testid="onboarding-new">Onboard Another Client</button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step <= 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="tbtn tbtn-outline"
            style={{ opacity: step === 1 ? 0.4 : 1, cursor: step === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            data-testid="onboarding-prev"
          >
            <ChevronLeft size={14} /> Previous
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="tbtn tbtn-gold"
              style={{ opacity: canProceed() ? 1 : 0.4, cursor: canProceed() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
              data-testid="onboarding-next"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="tbtn tbtn-gold"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              data-testid="onboarding-submit"
            >
              {submitting ? <><Loader2 size={14} className="spin" /> Processing...</> : <><Check size={14} /> Complete Onboarding</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientOnboarding;
