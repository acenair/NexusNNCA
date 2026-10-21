import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, ChevronDown } from 'lucide-react';

const ROLES = ['Everyone', 'Partner', 'Auditor / Staff', 'Admin'];

const GUIDES = [
  {
    role: 'Everyone', title: 'Getting started', steps: [
      'Open https://app.nairnelliyatt.com and sign in with your firm email and password (Google sign-in is available once enabled). Session lasts 7 days.',
      'The Overview (Dashboard) is your home screen — priority briefing, live KPIs, engagement pipeline, attention queue and activity feed, all from live data.',
      'Use the left sidebar: WORKSPACE for day-to-day work (Overview, Customers, Engagements, Task management, Deadline Tracker, Service calendar, Documents) and FIRM MANAGEMENT for billing, compliance, attendance and reports.',
      'On mobile, tap the ☰ icon (top bar) to open the sidebar.',
    ],
  },
  {
    role: 'Everyone', title: 'Check the status of any client', steps: [
      'Engagements (sidebar → WORKSPACE): use the service chips (External Audit, VAT, AML…) + phase and status filters + the client search box to find the client. Each row shows progress %, phase and fee.',
      'Click an engagement for full detail: checklist progress, service terms, billing milestones and history.',
      'Customer 360: from the Customers list, open a client for their complete profile — engagements, invoices, receipts, documents and compliance in one view.',
      'Overview dashboard: the engagement pipeline shows every active job by stage (Client Due Diligence → Awaiting documents → In progress → Manager review → Draft sent → Management confirmed).',
      'Deadline Tracker and Service calendar show everything due by date across all clients.',
    ],
  },
  {
    role: 'Partner', title: 'Add a client', steps: [
      'Sidebar → Client Onboarding (FIRM MANAGEMENT) for the guided wizard: enter trade licence / company details, contacts, services quoted — creates the client record.',
      'Or Customers (WORKSPACE) → New client for a quick form: name, licence number, VAT/CTR, contact, email, phone.',
      'Bulk load: Settings → import (Excel/CSV) — 260+ clients were loaded this way. The import tags records so they can be audited.',
      'Once added, the client appears in Customers, in engagement client pickers, invoice pickers and compliance KYC scope immediately.',
      'Manage everything from the client\'s 360 view: notes, documents, engagements, billing history.',
    ],
  },
  {
    role: 'Partner', title: 'Set up a service (engagement)', steps: [
      'Engagements → New engagement (top right).',
      'Pick the service — all 25 service lines are chips (External Audit, VAT Filing, AML Review, goAML, Corporate Tax, Accounting…). Chips show the live count per service; dimmed chips have no engagement yet.',
      'Select the client, responsible staff, engagement date, and the quoted fee (AED, excluding tax).',
      'Set payment terms, e.g. "50% Advance, 50% Draft Report" — billing milestones are created automatically and appear in Client Billing.',
      'Fill the service-specific terms when offered: VAT (return frequency, tax period, FTA due date, internal target, reminder buffer), Accounting (frequency, work location, target days), Internal Audit (scope, allocated days, field-visit dates, closing meeting, report due), AML/goAML (risk classification, registration status, returns due).',
      'Save — the engagement gets its full checklist automatically. Progress % = ticked checklist items. As you tick groups, the phase moves (Preparation → Filing → Completion, per service).',
      'Client Due Diligence phase: collect PBC documents before starting work; Documents (sidebar) stores files.',
      'To finish instantly: partner "Approve all" marks remaining checklist items done and completes the engagement.',
    ],
  },
  {
    role: 'Partner', title: 'Bill a client and track invoices', steps: [
      'Invoices & collections (FIRM MANAGEMENT) is the billing workspace — three tabs: Invoices & collections, Client Billing, Hourly Costing (+ Ageing).',
      'New invoice: client, service, amount, dates, responsible staff — or tick "Save as draft" to keep it out of totals until issued (Drafts tab → Issue).',
      'Client Billing tab shows the milestone queue built from each engagement\'s payment terms: Advance billing (engagement signed) and Draft-stage billing (later milestones). Click "Prepare draft →" to prefill an invoice from the milestone. Nothing is auto-posted.',
      'Record a receipt on any pending invoice (partial payments supported) — method + reference + date. Collected vs pending update everywhere instantly.',
      'Credit notes and Cancelled invoices (with reason) reduce/exclude from totals — see the two bottom cards.',
      'Pending by staff, Collection priorities (overdue + next payment due) and Ageing (current / 1–30 / 31–60 / 61–90 / 90+ days) drive follow-up. Export both invoice list and collections as CSV.',
      'Hourly Costing: per engagement, add staff allocations with allocated / actual / remaining hours and budget vs actual AED/hr — the table and metrics compare budget vs actual internal cost and flag over-allocated or forecast-overrun jobs. Manual entries (no time ledger yet).',
    ],
  },
  {
    role: 'Partner', title: 'Leads and proposals', steps: [
      'Lead management → Add lead: company, contact, source (Referral, Website, Email, Phone/WhatsApp, Existing client, Networking), service, expected value.',
      'Move it through the pipeline: New lead → Qualified → Proposal sent (records proposal ref + sent date) → Negotiation → Confirmed (win). Winning a lead auto-creates a proposal record.',
      'Mark Lost with a rejection reason (fee, existing auditor, scope mismatch, timing, competitor, other) — reason is mandatory.',
      'The Sources tab shows win rate and value by source so you can see what marketing works.',
    ],
  },
  {
    role: 'Everyone', title: 'Compliance tracker (KYC, firm and staff documents)', steps: [
      'Compliance tracker (sidebar) has three scopes: Customers (trade licence, passport, Emirates ID, KYC review, UBO/ownership, address records), Firm (licence, tenancy, establishment card, insurance, registrations), Staff (visa, Emirates ID, passport, medical insurance, employment records).',
      'Staff/customer records with expiry dates sync automatically from their profiles; you only add what is missing with "+ Add record".',
      'Each record tracks: issue date, expiry/renewal date, stage (Collected → Submitted → In review → Verified, or Not applicable), last-verified date, verified-by, next follow-up, issuing authority, location and notes.',
      'Marking a record Verified requires a verification date and reviewer name — the app enforces this.',
      'The document-windows view groups records by type and highlights expired and expiring windows (30/60/90 days). Metric cards are clickable filters.',
      'Only masked references are stored — never full ID numbers or document scans.',
    ],
  },
  {
    role: 'Everyone', title: 'Attendance & leave', steps: [
      'Attendance & leave shows the month register for all staff with AM/PM half-day cells: present, leave, absent, holiday.',
      'Saturday rule: Nov–Dec Saturdays are off; Jan–Oct alternate Saturdays are working Saturdays ("SC") until marked.',
      'Leave requests: staff submit; the partner sees the Approve/Reject queue at the top with live counters.',
      'CSV export available for payroll.',
    ],
  },
  {
    role: 'Auditor / Staff', title: 'Your daily work', steps: [
      'Task management: your assigned tasks with due dates and status. Tick items off as you go.',
      'Engagements: open the engagement you are assigned to and tick your checklist items — progress and phase update automatically for the partner.',
      'Deadline Tracker and Service calendar: everything due across your clients. Reminders (sidebar) shows notification settings.',
      'Documents: upload and fetch client files (PBC lists, licences, signed letters).',
      'Attendance & leave: check your register, submit leave requests.',
      'AI Assistant (sidebar) can answer questions about the app and your work.',
    ],
  },
  {
    role: 'Admin', title: 'User access and settings', steps: [
      'Settings (partner/admin only): user accounts, RBAC (which roles see which menu items), notifications and integrations.',
      'New users are created with firm emails; roles are partner / agent (auditor) / admin. Clients never log in — they are records only.',
      'Google sign-in: created in Google Cloud Console, credentials go only in the VPS .env (never the repo); domain allowlist currently nairnelliyatt.com / nn-ca.com; only existing accounts can sign in — no self-registration. Disabled until you supply GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
      'Passwords: users change their own via profile; admin resets via Settings.',
      'Sample data is tagged (source: sample_engagement / sample_ledger) and can be removed with one command when live work replaces it.',
    ],
  },
  {
    role: 'Partner', title: 'Reports and performance', steps: [
      'Reports hub: one-click access to client master CSV, invoice list, receivables ageing, attendance register, compliance register and engagement workbooks.',
      'Work & performance: staff workload (open engagements and tasks per person), review queue, and the engagement register for any month.',
      'Overview dashboard: firm-wide snapshot — billing & collections, pipeline, team capacity, growth mix.',
    ],
  },
];

const Help = () => {
  const { user } = useOutletContext();
  const [role, setRole] = useState('Everyone');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const visible = GUIDES
    .filter(g => role === 'Everyone' || g.role === 'Everyone' || g.role === role)
    .filter(g => !q || (g.title + ' ' + g.steps.join(' ')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="ov-wrap" data-testid="help-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">HELP &amp; GUIDES</div>
          <h1>How to use the app</h1>
          <p>Step-by-step guides for every task — add a client, set up a service, bill and track, check status.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="af-tabs" role="tablist" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          {ROLES.map(r => (
            <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the guides…"
            style={{ padding: '10px 12px 10px 32px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', minWidth: 220, background: 'var(--white)', color: 'var(--text)' }} />
        </div>
      </div>

      {visible.map((g, idx) => (
        <section className="af-card" key={g.title} style={{ marginBottom: 12 }}>
          <div className="af-cardhead" style={{ cursor: 'pointer', marginBottom: 0 }}
            onClick={() => setOpen(open === idx ? null : idx)}>
            <div>
              <h2>{g.title}</h2>
              <div className="af-sub">{g.role === 'Everyone' ? 'All roles' : g.role} · {g.steps.length} steps</div>
            </div>
            <ChevronDown size={16} style={{ transform: open === idx ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </div>
          {open === idx && (
            <ol className="help-steps">
              {g.steps.map((s, si) => <li key={si}>{s}</li>)}
            </ol>
          )}
        </section>
      ))}
      {visible.length === 0 && <p className="af-note">No guides match "{q}".</p>}

      <p className="af-note" style={{ marginTop: 16 }}>
        Tip: use the search box to jump straight to a task (try "invoice", "leave", "VAT", "verify").
        Signed in as <b>{user?.name}</b> ({user?.role}). {user?.role !== 'partner' && 'Pages marked partner-only are hidden from your menu by design.'}
      </p>
    </div>
  );
};

export default Help;
