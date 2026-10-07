import React, { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Building2, ShieldCheck, BriefcaseBusiness, BadgeDollarSign, UsersRound, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import axios from 'axios';
import { SERVICE_TYPES, PIPELINE_STAGES, serviceFields } from './onboarding/config';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TABS = [
  { key: 'company', label: 'Company', icon: Building2 }, { key: 'tax', label: 'Tax & Compliance', icon: ShieldCheck },
  { key: 'service', label: 'Service Setup', icon: BriefcaseBusiness }, { key: 'commercials', label: 'Commercials', icon: BadgeDollarSign },
  { key: 'contacts', label: 'Contacts', icon: UsersRound },
];
const initialForm = { name: '', trade_name: '', emirate: 'Dubai', jurisdiction: 'Mainland', freezone_name: '', industry: '', entity_type: 'LLC', trade_licence_no: '', license_expiry_date: '', vat_registered: false, trn: '', corporate_tax_registered: false, corporate_tax_trn: '', financial_year_end: '', service_type: '', audit_purpose: '', service_purpose: '', service_period: '', previous_auditor: '', lead_source: 'Referral', referred_by: '', pipeline_stage: 'stage_1', proposal_date: '', quoted_fee: '', payment_terms: '', contact_person: '', contact_designation: '', contact_phone: '', contact_email: '', secondary_contact_info: '', notes: '', aml_risk_rating: 'Low' };

const Field = ({ label, children, wide = false }) => <div style={{ gridColumn: wide ? '1 / -1' : undefined }}><label style={styles.label}>{label}</label>{children}</div>;

const ClientOnboarding = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const fields = useMemo(() => serviceFields(form.service_type), [form.service_type]);
  const canSubmit = form.name.trim() && form.contact_person.trim() && form.service_type;

  const submit = async () => {
    if (!canSubmit) { setError('Legal name, primary contact, and service type are required.'); return; }
    setSaving(true); setError('');
    try {
      const response = await axios.post(`${API}/onboarding`, { ...form, quoted_fee: form.quoted_fee === '' ? null : Number(form.quoted_fee) }, { withCredentials: true });
      navigate(`/app/clients/${response.data.client_id}/onboarding/${response.data.onboarding_id}`);
    } catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to create the service onboarding record.'); }
    finally { setSaving(false); }
  };

  if (user?.role !== 'partner') return <div className="fade-in" style={{ padding: 40, textAlign: 'center' }} data-testid="onboarding-denied"><h2 style={styles.title}>Access Restricted</h2><p style={styles.muted}>Client onboarding is available to Partners only.</p></div>;

  const input = (key, options = {}) => <input type={options.type || 'text'} value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={options.placeholder} disabled={options.disabled} style={{ ...styles.input, opacity: options.disabled ? .55 : 1 }} data-testid={`onboarding-${key.replace(/_/g, '-')}`} />;
  return <div className="fade-in" data-testid="client-onboarding-page">
    <header style={styles.header}><div><div style={styles.eyebrow}>New service pipeline</div><h1 style={styles.heading}>Client Onboarding</h1><p style={styles.headerCopy}>Each submission creates one service pipeline. Submitting the same legal name adds another service without replacing the client record.</p></div><div style={styles.clientId} data-testid="onboarding-client-id-preview">Client ID assigned on save</div></header>
    <nav style={styles.tabList} aria-label="Onboarding sections" data-testid="onboarding-tabs">{TABS.map((item, index) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(index)} style={{ ...styles.tab, ...(tab === index ? styles.activeTab : {}) }} data-testid={`onboarding-tab-${item.key}`}><Icon size={15} />{item.label}</button>; })}</nav>
    <main className="nn-card" style={styles.panel}>
      {tab === 0 && <section data-testid="onboarding-company-section"><SectionTitle title="Company identification" copy="Core entity information used across every connected service." /><div style={styles.grid}>
        <Field label="Legal Name *" wide>{input('name', { placeholder: 'e.g. Al Noor Trading LLC' })}</Field><Field label="Trade Name">{input('trade_name')}</Field>
        <Field label="Emirate"><select value={form.emirate} onChange={e => set('emirate', e.target.value)} style={styles.input} data-testid="onboarding-emirate">{['Dubai','Abu Dhabi','Sharjah','Ajman','RAK','UAQ','Fujairah'].map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Jurisdiction"><select value={form.jurisdiction} onChange={e => set('jurisdiction', e.target.value)} style={styles.input} data-testid="onboarding-jurisdiction"><option>Mainland</option><option>Freezone</option></select></Field>
        {form.jurisdiction === 'Freezone' && <Field label="Freezone Name">{input('freezone_name', { placeholder: 'e.g. DMCC' })}</Field>}<Field label="Industry / Sector">{input('industry')}</Field>
        <Field label="Entity Type"><select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} style={styles.input} data-testid="onboarding-entity-type">{['LLC','Sole Proprietorship','Freezone Co','Branch','Partnership','PJSC','Other'].map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Trade License No.">{input('trade_licence_no')}</Field><Field label="License Expiry Date">{input('license_expiry_date', { type: 'date' })}</Field>
      </div></section>}
      {tab === 1 && <section data-testid="onboarding-tax-section"><SectionTitle title="Tax & compliance baseline" copy="Registration details are retained on the client record for connected service work." /><div style={styles.grid}>
        <Field label="VAT Registered?"><select value={form.vat_registered ? 'yes' : 'no'} onChange={e => set('vat_registered', e.target.value === 'yes')} style={styles.input} data-testid="onboarding-vat-registered"><option value="no">No</option><option value="yes">Yes</option></select></Field>
        <Field label="VAT TRN">{input('trn', { disabled: !form.vat_registered, placeholder: form.vat_registered ? '100XXXXXXXXXX' : 'Enable VAT registration first' })}</Field>
        <Field label="Corporate Tax Registered?"><select value={form.corporate_tax_registered ? 'yes' : 'no'} onChange={e => set('corporate_tax_registered', e.target.value === 'yes')} style={styles.input} data-testid="onboarding-corporate-tax-registered"><option value="no">No</option><option value="yes">Yes</option></select></Field>
        {fields.showCt && <Field label="Corporate Tax TRN">{input('corporate_tax_trn', { placeholder: 'Corporate tax registration number' })}</Field>}<Field label="Financial Year End">{input('financial_year_end', { placeholder: 'e.g. 31st Dec' })}</Field>
      </div></section>}
      {tab === 2 && <section data-testid="onboarding-service-section"><SectionTitle title="Dynamic service configuration" copy="The fields below adapt to the selected service and map it to its CRM sheet." /><div style={styles.grid}>
        <Field label="Service Type *" wide><select value={form.service_type} onChange={e => set('service_type', e.target.value)} style={styles.input} data-testid="onboarding-service-type"><option value="">Select a service...</option>{SERVICE_TYPES.map(item => <option key={item}>{item}</option>)}</select></Field>
        {form.service_type && <div style={styles.serviceNote} data-testid="onboarding-service-sheet">Mapped CRM sheet: <strong>{fields.sheet}</strong></div>}
        {fields.purpose && <Field label={fields.purposeLabel}>{input(fields.purpose, { placeholder: 'Describe the engagement objective' })}</Field>}{fields.period && <Field label={fields.periodLabel}>{input('service_period', { placeholder: 'e.g. FY 2025 / 2026' })}</Field>}{fields.previousAuditor && <Field label="Previous Auditor">{input('previous_auditor')}</Field>}
      </div></section>}
      {tab === 3 && <section data-testid="onboarding-commercials-section"><SectionTitle title="Commercials & pipeline" copy="Set the commercial context and current point in the six-stage pipeline." /><div style={styles.grid}>
        <Field label="Lead Source"><select value={form.lead_source} onChange={e => set('lead_source', e.target.value)} style={styles.input} data-testid="onboarding-lead-source">{['Referral','Direct','Web','Social','Event','Existing Client','Other'].map(item => <option key={item}>{item}</option>)}</select></Field><Field label="Referred By">{input('referred_by')}</Field>
        <Field label="Current Status" wide><select value={form.pipeline_stage} onChange={e => set('pipeline_stage', e.target.value)} style={styles.input} data-testid="onboarding-pipeline-stage">{PIPELINE_STAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="Proposal Date">{input('proposal_date', { type: 'date' })}</Field><Field label="Quoted Fee (AED)">{input('quoted_fee', { type: 'number', placeholder: '0.00' })}</Field><Field label="Payment Terms" wide>{input('payment_terms', { placeholder: 'e.g. 50% Advance, 50% Draft Report' })}</Field>
      </div></section>}
      {tab === 4 && <section data-testid="onboarding-contacts-section"><SectionTitle title="Primary & secondary contacts" copy="The primary contact is required so teams can move the service pipeline forward." /><div style={styles.grid}><Field label="Primary Contact Name *">{input('contact_person')}</Field><Field label="Designation">{input('contact_designation')}</Field><Field label="Phone / WhatsApp">{input('contact_phone', { type: 'tel' })}</Field><Field label="Email Address">{input('contact_email', { type: 'email' })}</Field><Field label="Secondary Contact Info" wide>{input('secondary_contact_info', { placeholder: 'Name, designation, phone, and email' })}</Field><Field label="Internal Notes" wide><textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...styles.input, minHeight: 86, resize: 'vertical' }} data-testid="onboarding-notes" /></Field></div></section>}
      {error && <div style={styles.error} data-testid="onboarding-error">{error}</div>}
    </main>
    <footer style={styles.footer}><button type="button" disabled={tab === 0} onClick={() => setTab(value => value - 1)} className="tbtn tbtn-outline" data-testid="onboarding-previous-tab"><ChevronLeft size={15} /> Previous</button>{tab < TABS.length - 1 ? <button type="button" onClick={() => setTab(value => value + 1)} className="tbtn tbtn-gold" data-testid="onboarding-next-tab">Next <ChevronRight size={15} /></button> : <button type="button" onClick={submit} disabled={saving} className="tbtn tbtn-gold" data-testid="onboarding-submit">{saving ? <><Loader2 size={15} className="spin" /> Saving...</> : <><Check size={15} /> Create Service Pipeline</>}</button>}</footer>
  </div>;
};

const SectionTitle = ({ title, copy }) => <div style={{ marginBottom: 22 }}><h2 style={styles.title}>{title}</h2><p style={styles.muted}>{copy}</p></div>;
const styles = { header: { background: 'linear-gradient(125deg, var(--navy), var(--navy3))', color: '#fff', padding: '28px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 18 }, eyebrow: { color: 'var(--gold)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }, heading: { margin: '5px 0 6px', fontFamily: 'DM Serif Display', color: 'var(--gold)', fontSize: 28 }, headerCopy: { margin: 0, color: 'rgba(255,255,255,.67)', fontSize: 13, maxWidth: 620, lineHeight: 1.5 }, clientId: { padding: '8px 11px', border: '1px solid rgba(212,175,55,.38)', color: 'var(--gold)', fontSize: 11, fontWeight: 600 }, tabList: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }, tab: { border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--muted)', padding: '10px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans', fontSize: 12, transition: 'background-color .18s, color .18s, border-color .18s' }, activeTab: { background: 'var(--navy)', color: 'var(--gold)', borderColor: 'var(--navy)' }, panel: { padding: 28, minHeight: 365 }, grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 17 }, label: { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 6 }, input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--nn-border)', background: 'var(--white)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', borderRadius: 'var(--rs)' }, title: { fontFamily: 'DM Serif Display', color: 'var(--text)', fontSize: 20, margin: 0 }, muted: { fontSize: 12, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 }, serviceNote: { gridColumn: '1 / -1', padding: '10px 12px', background: 'rgba(212,175,55,.08)', color: 'var(--text)', borderLeft: '3px solid var(--gold)', fontSize: 12 }, footer: { display: 'flex', justifyContent: 'space-between', marginTop: 18 }, error: { marginTop: 20, padding: '11px 13px', color: 'var(--red)', background: 'var(--red-bg)', fontSize: 12, border: '1px solid rgba(220,38,38,.22)' } };
export default ClientOnboarding;