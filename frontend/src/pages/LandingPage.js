import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Users, ClipboardCheck, Clock, Calendar, ShieldCheck, BarChart3, FileText, FolderOpen, FileSearch, Receipt, ShieldAlert, Workflow, GitBranch, UserCheck, ArrowRight, LogIn, Menu, X } from 'lucide-react';

const FEATURES = [
  { icon: Users, title: 'Client Management', desc: 'Manage client profiles, TRN numbers, trade licenses, and full engagement history in one centralized hub.' },
  { icon: ClipboardCheck, title: 'Service Workflows', desc: 'Pre-built UAE workflows for Audit (IAASB), Tax (FTA/EmaraTax), and AML (goAML). Plus a custom workflow builder.' },
  { icon: Clock, title: 'Billable Hours', desc: 'Track time with start/stop timers or manual entries. Log billable hours per task, per client, per engagement.' },
  { icon: Calendar, title: 'Tax Calendar', desc: 'Never miss a VAT or Corporate Tax deadline. Visual calendar with FTA filing periods and overdue alerts.' },
  { icon: ShieldCheck, title: 'AML Compliance', desc: 'Manage client risk assessments, transaction monitoring, and STR filing workflows aligned with UAE FIU requirements.' },
  { icon: BarChart3, title: 'Analytics & Performance', desc: 'Track auditor productivity, on-time completion rates, and team workload. Recognize top performers.' },
  { icon: FileText, title: 'HR Management', desc: 'Employee profiles, leave management, attendance tracking, and workload distribution across your team.' },
  { icon: FolderOpen, title: 'Document Storage', desc: 'Store client documents on Google Drive or AWS S3. Browse, upload, and link files directly from the app.' },
];

const SERVICES = [
  {
    icon: FileSearch, title: 'Auditing', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',
    desc: 'Full IAASB-compliant audit workflow with built-in ISA stage tracking.',
    steps: ['Client Acceptance & KYC', 'Engagement Letter', 'Audit Planning (ISA 300)', 'Risk Assessment (ISA 315)', 'Fieldwork & Evidence', 'Review & Supervision', 'Draft Report', 'Partner Sign-off', 'Final Report Issued'],
  },
  {
    icon: Receipt, title: 'Taxation', color: '#10b981', bg: 'rgba(16,185,129,0.1)',
    desc: 'VAT (5%) and Corporate Tax (9%) workflows aligned with FTA EmaraTax.',
    steps: ['Collect Sales/Output Data', 'Collect Expense/Input Data', 'Prepare Return', 'Internal Review', 'Client Approval', 'File on EmaraTax', 'Payment Confirmation', 'Filing Acknowledged'],
  },
  {
    icon: ShieldAlert, title: 'AML Compliance', color: '#f43f5e', bg: 'rgba(244,63,94,0.1)',
    desc: 'UAE FIU-aligned AML workflow with goAML STR filing support.',
    steps: ['Client Risk Assessment', 'Transaction Monitoring', 'Suspicious Activity Check', 'Internal Escalation', 'STR Preparation', 'File on goAML', 'FIU Follow-up', 'Compliance Archiving'],
  },
  {
    icon: Workflow, title: 'Custom Workflows', color: '#D4AF37', bg: 'rgba(212,175,55,0.1)',
    desc: 'Build any workflow for any service your firm offers.',
    steps: ['Define your stages', 'Add checklists', 'Set default roles', 'Assign to clients', 'Track progress', 'Duplicate as templates'],
  },
];

const WORKFLOW_STEPS = [
  { icon: GitBranch, title: 'Choose or Create a Workflow', desc: 'Start with a pre-built UAE workflow (Audit, Tax, AML) or build your own from scratch with the workflow builder.' },
  { icon: Users, title: 'Assign to Your Team', desc: 'Link the workflow to a client engagement and assign team members to each stage. Tasks and deadlines are auto-generated.' },
  { icon: CheckCircle, title: 'Track Progress in Real Time', desc: 'Monitor each stage from Kanban boards and calendars. Log billable hours with built-in timers.' },
  { icon: BarChart3, title: 'Analyze and Appreciate', desc: 'Deep-dive into auditor performance. Spot bottlenecks, meet deadlines, and recognize your top performers.' },
];

const BADGES = ['UAE FTA Compliant', 'VAT & Corporate Tax', 'goAML Ready', 'IAASB Standards'];

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);

  const handleSignIn = () => navigate('/login');
  const scrollTo = (id) => {
    setMobileMenu(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--white, #fff)', fontFamily: 'DM Sans, sans-serif' }} data-testid="landing-page">
      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--nn-border, #e5e7eb)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #0a1128, #1a2744)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37', fontWeight: 800, fontSize: 12 }}>N&N</div>
            <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: '#0a1128', fontWeight: 700 }}>Nair & Nelliyatt</span>
          </div>
          {/* Desktop nav */}
          <div className="landing-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <button onClick={() => scrollTo('features')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans' }}>Features</button>
            <button onClick={() => scrollTo('services')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans' }}>Services</button>
            <button onClick={() => scrollTo('workflow')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans' }}>How It Works</button>
            <button onClick={handleSignIn} style={{ padding: '8px 18px', borderRadius: 8, background: '#0a1128', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans' }} data-testid="nav-signin">
              <LogIn size={14} /> Sign In
            </button>
          </div>
          {/* Mobile hamburger */}
          <button className="landing-mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }} data-testid="mobile-menu-toggle">
            {mobileMenu ? <X size={22} color="#0a1128" /> : <Menu size={22} color="#0a1128" />}
          </button>
        </div>
        {/* Mobile dropdown */}
        {mobileMenu && (
          <div className="landing-mobile-menu" style={{ background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => scrollTo('features')} style={{ background: 'none', border: 'none', fontSize: 14, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', padding: '8px 0' }}>Features</button>
            <button onClick={() => scrollTo('services')} style={{ background: 'none', border: 'none', fontSize: 14, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', padding: '8px 0' }}>Services</button>
            <button onClick={() => scrollTo('workflow')} style={{ background: 'none', border: 'none', fontSize: 14, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', padding: '8px 0' }}>How It Works</button>
            <button onClick={handleSignIn} style={{ padding: '10px 0', borderRadius: 8, background: '#0a1128', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'center', marginTop: 4 }} data-testid="mobile-signin">Sign In</button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 160, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, borderRadius: '50%', background: 'rgba(212,175,55,0.06)', filter: 'blur(120px)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center', padding: '0 24px', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 50, border: '1px solid rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.06)', fontSize: 13, fontWeight: 500, color: '#92711c', marginBottom: 24 }}>
            <CheckCircle size={14} /> Built for Chartered Accountants in the UAE
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 700, lineHeight: 1.1, color: '#0a1128', letterSpacing: '-0.02em', fontFamily: 'DM Serif Display, serif', margin: '0 0 20px' }}>
            Manage your <span style={{ background: 'linear-gradient(to right, #D4AF37, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>entire practice</span> in one place
          </h1>
          <p style={{ fontSize: 18, color: '#64748b', maxWidth: 640, margin: '0 auto 32px', lineHeight: 1.6 }}>
            From audit engagements and VAT filings to AML compliance and team management. Streamline every workflow for UAE CA firms.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleSignIn} style={{ padding: '12px 28px', borderRadius: 8, background: '#0a1128', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans' }} data-testid="hero-signin">
              <LogIn size={16} /> Sign In
            </button>
            <button onClick={() => scrollTo('features')} style={{ padding: '12px 32px', borderRadius: 8, background: '#f1f5f9', color: '#334155', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans' }} data-testid="hero-features">
              See Features
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 40 }}>
            {BADGES.map(b => (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 50, background: '#f1f5f9', fontSize: 13, fontWeight: 500, color: '#334155' }}>
                <CheckCircle size={14} color="#D4AF37" /> {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#D4AF37', marginBottom: 10 }}>Features</p>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, color: '#0a1128', fontFamily: 'DM Serif Display, serif' }}>Everything your CA firm needs</h2>
            <p style={{ fontSize: 15, color: '#64748b', marginTop: 12 }}>Purpose-built for the UAE regulatory landscape. From FTA compliance to IAASB audit standards.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {FEATURES.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.title} style={{ padding: 24, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', transition: 'all 0.2s', cursor: 'default' }} data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(212,175,55,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Icon size={20} color="#D4AF37" />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0a1128', marginBottom: 6 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" style={{ padding: '80px 0', background: '#fafafa', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#D4AF37', marginBottom: 10 }}>Services</p>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, color: '#0a1128', fontFamily: 'DM Serif Display, serif' }}>Pre-built UAE regulatory workflows</h2>
            <p style={{ fontSize: 15, color: '#64748b', marginTop: 12 }}>Each service comes with a step-by-step workflow based on actual UAE government processes.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {SERVICES.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.title} style={{ padding: 28, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }} data-testid={`service-${s.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={24} color={s.color} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0a1128' }}>{s.title}</h3>
                      <p style={{ fontSize: 12, color: '#64748b' }}>{s.desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {s.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: '#f8fafc', fontSize: 13, color: '#334155' }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#D4AF37', flexShrink: 0 }}>{i + 1}</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#D4AF37', marginBottom: 10 }}>How It Works</p>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, color: '#0a1128', fontFamily: 'DM Serif Display, serif' }}>From engagement to report in four steps</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 }}>
            {WORKFLOW_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} style={{ textAlign: 'center', position: 'relative' }} data-testid={`workflow-step-${i + 1}`}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(212,175,55,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Icon size={28} color="#D4AF37" />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: '#94a3b8', marginBottom: 6 }}>Step {i + 1}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0a1128', marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 0', background: '#fafafa', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', padding: '0 24px' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 700, color: '#0a1128', fontFamily: 'DM Serif Display, serif', marginBottom: 16 }}>Ready to streamline your practice?</h2>
          <p style={{ fontSize: 16, color: '#64748b', marginBottom: 32 }}>Join UAE CA firms who manage audits, tax filings, and compliance from a single platform.</p>
          <button onClick={handleSignIn} style={{ padding: '12px 28px', borderRadius: 8, background: '#0a1128', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans' }} data-testid="cta-signin">
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '20px 24px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Nair & Nelliyatt Chartered Accountants &middot; Practice Management</p>
      </footer>
    </div>
  );
};

export default LandingPage;
