import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, ChevronDown } from 'lucide-react';

const ROLES = ['Everyone', 'Partner', 'Auditor / Staff', 'Admin'];

const GUIDES = [
  {
    role: 'Everyone', title: 'Getting started', steps: [
      'Open https://app.nairnelliyatt.com and sign in with your firm email and password (Google sign-in is available once enabled). Session lasts 7 days.',
      'The Overview (Dashboard) is your home screen — priority briefing, live KPIs, engagement pipeline, attention queue and activity feed, all from live data.',
      'Use the Help button in the top bar (top-left, next to the page title) — it opens these step-by-step guides from any screen.',
      'Use the left sidebar: WORKSPACE for day-to-day work (Overview, Engagements, Task management, Deadline Tracker, Service calendar) and FIRM MANAGEMENT for onboarding, documents, compliance, billing and reports.',
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
      'Edit the checklist per engagement (partner): type in "Add a task to this phase…" under any group and press Enter; hover an item and click the bin icon to remove it. Groups and progress update instantly.',
      'Standard checklists come from built-in templates. To define your own steps per service, use Settings → Workflows — it covers all 25 service lines (including goAML); new engagements pick that workflow up automatically. Existing engagements keep the checklist they were created with.',
    ],
  },
  {
    role: 'Partner', title: 'Bill a client and track invoices', steps: [
      'Invoices & collections (FIRM MANAGEMENT) is the billing workspace — three tabs: Invoices & collections, Client Billing, Hourly Costing (+ Ageing).',
      'New invoice: client, service, amount, dates, responsible staff — or tick "Save as draft" to keep it out of totals until issued (Drafts tab → Issue).',
      'Client Billing tab shows the milestone queue built from each engagement\'s payment terms: Advance billing (engagement signed) and Draft-stage billing (later milestones). Click "Prepare draft →" to prefill an invoice from the milestone. Nothing is auto-posted.',
      'Record a receipt on any pending invoice (partial payments supported) — method + reference + date. Collected vs pending update everywhere instantly.',
      'Credit notes and Cancelled invoices (with reason) reduce/exclude from totals — see the two bottom cards.',
      'Collections during the month: every dated receipt with a Current/Prior-month badge — search by receipt/customer/invoice, filter by responsible staff, and export as CSV.',
      'Receivables movement reconciles the month: Opening outstanding + Billed − Credits − Cash collected = Closing outstanding.',
      'Pending by staff, Collection priorities (overdue + next payment due) and Ageing (current / 1–30 / 31–60 / 61–90 / 90+ days) drive follow-up. "Preview collection reminder" drafts a reminder from the overdue list — nothing is sent.',
      'Invoice summary has its own search box (customer or invoice) and works inside every tab. Export the invoice list as CSV.',
      'Hourly Costing: per engagement, add staff allocations with allocated / actual / remaining hours and budget vs actual AED/hr — the table and metrics compare budget vs actual internal cost and flag over-allocated or forecast-overrun jobs. Manual entries (no time ledger yet).',
    ],
  },
  {
    role: 'Partner', title: 'Tax invoices (PDF) with 5% VAT', steps: [
      'Set your firm identity once: Settings → Firm Identity — add the firm TRN, address, phone, email and bank details. These print on every invoice.',
      'Invoices are entered NET of VAT with a VAT % (5% standard rated, or 0% out of scope). The gross total is computed for you.',
      'Every invoice row has a PDF link — it opens a UAE-format tax invoice: firm TRN, client TRN, net/VAT/gross breakdown, amount in words, received-to-date and balance, sequential invoice number.',
      'Send the PDF to the client over WhatsApp/email; when payment lands, Record receipt as usual — pending updates automatically.',
      'Old invoices entered before VAT capture keep their original amount (shown tax-exclusive).',
    ],
  },
  {
    role: 'Auditor / Staff', title: 'Audit workbench — trial balance (import, map, check)', steps: [
      'Where it lives: Engagements → open an audit engagement (statutory, internal, stock or fraud audit) → the "Trial Balance" tab. There is no separate menu item — the trial balance belongs to the engagement, like the checklist.',
      'Step 1 — Import: click "Choose file" (CSV or Excel .xlsx, max 8 MB) — or pick a file the client already uploaded (listed under the button). Most accounting packages (Zoho Books, Tally, QuickBooks, Xero exports) match directly.',
      'Step 1 (contd) — Label the columns: the import shows a preview with dropdowns to mark which column is the Account name, Debit, Credit and Description. Suggestions are pre-filled — adjust if the export is unusual. Tick "Remember these columns" (default on) and this client\u0027s future imports are pre-labelled automatically.',
      'Step 2 — Mapping: accounts you have mapped on ANY engagement are remembered firm-wide and apply automatically (marked MEMORY). Remaining accounts get keyword suggestions (marked AUTO). Anything still showing "+ map this account" needs you: click it and type to whittle the statement-line list down (e.g. type "vat"), then click the line. Manual choices are remembered too.',
      'Step 3 — Run the checks: the "Integrity checks" card re-evaluates on every change and shows PASS / WARN / FAIL for: (1) Debits equal credits — the imported file must balance; if not, re-export from the accounting package; (2) All accounts mapped — the trial balance is not complete until this passes; (3) No zero-balance accounts (warning only — these can usually be excluded); (4) Revenue and expense lines populated (warning only).',
      'Reading the results: the "Statement lines" card shows the net total per financial-statement line with the number of accounts feeding it — this is the draft that later feeds the financial statements and materiality benchmarks.',
      'Re-importing: "Re-import" replaces the whole trial balance (e.g. the client sent an updated export). "Remove" deletes it from the engagement. Mapping suggestions re-run automatically on every import.',
      'Who can see it: everyone working on the engagement can view; importing and mapping are recorded with your name and the date, and this forms part of the audit trail. Reviewers should treat the checks card as the first review of the working papers.',
    ],
  },
  {
    role: 'Auditor / Staff', title: 'Audit workbench — review notes, assumptions and the workbook', steps: [
      'The Checklist tab stays your main to-do list: tick items as you complete them and use the note icon on any item to record what you did, the basis, or the sample reference — that note is your working-paper documentation.',
      'The Audit Workbook tab holds the engagement\u0027s structured audit procedures and responses for audit engagements.',
      'The "Review & assumptions" tab: reviewers add review notes (each stays open until explicitly cleared, recording who cleared it and when). Partners and staff add key audit assumptions — materiality, sampling basis, depreciation rates, FX rates — each with its justification.',
      'Suggested flow per audit: collect PBC documents (Document requests) → import and map the trial balance (Trial Balance tab) → clear all integrity checks → record materiality and assumptions (Review & assumptions) → complete the checklist with working-paper notes → clear all review notes → partner approves.',
    ],
  },
  {
    role: 'Everyone', title: 'Work journal & handover (never lose context)', steps: [
      'Every engagement has a Journal tab (open the engagement → "Journal"). It is the single timeline of everything that happened: checklist items ticked, phase moves, trial-balance imports and mapping changes, review notes opened/cleared, queries sent to the client, and any manual notes you write.',
      'Write a journal note whenever you do something a colleague would need to know: calls with the client, promises made, documents awaited, blockers, what was sent where. Click "Add" (or press Enter).',
      'Continuity nudge: when you tick a checklist item that has no working-paper note, the note box opens automatically — write one line on what was done. You can close it, but the item stays flagged.',
      'The Handover brief (top of the Journal tab) shows the job at a glance: stage, status, person in charge, progress, open review notes, last activity and a "quiet N days" flag when nothing has moved for a week.',
      'Documentation flag: items completed without a note are counted in the brief ("N completed items without a working-paper note") so nothing undocumented reaches partner review.',
      'If an auditor is on leave: the covering person opens the engagement → Journal tab, reads the brief and the newest entries top-down, and continues from exactly where things stopped.',
    ],
  },
  {
    role: 'Everyone', title: 'Client queries (ask the client, get replies in the app)', steps: [
      'Raise a query: open the engagement → "Client queries" tab → type what you need (be specific: periods, amounts, documents) → "Send to client". It appears in the client\u0027s portal instantly.',
      'The client sees it under their Queries tab with an "Your reply needed" badge, replies in the portal with a message and attached files (PDF/JPG/Excel, up to 8 MB).',
      'Replies land back on the same thread with the attached file — download directly from the thread. Every query and reply is also captured in the engagement Journal.',
      'When the reply answers the question, click "Mark resolved" — the thread moves to Resolved and the count clears.',
      'Use queries instead of WhatsApp/email for anything that belongs in the audit file: the question, the answer, the evidence and who said what stay together.',
    ],
  },
  {
    role: 'Everyone', title: 'Client portal (for your clients)', steps: [
      'Clients get their own dashboard: create a user in Settings → user access with role "client" and pick the client record — they sign in at the same web address with their email.',
      'The client dashboard shows: their active services with the current stage of each, their contact person at the firm (and the partner), documents requested with upload, queries from the auditor with reply + attachment, and their invoice history.',
      'Clients only ever see their own data — never internal notes, checklists, other clients or firm finances.',
      'There is also a no-login upload portal: Document requests (WORKSPACE) sends a secure link over WhatsApp/email and the client uploads against the checklist without signing in.',
    ],
  },
  {
    role: 'Auditor / Staff', title: 'Audit workbench — adjustments (AJEs)', steps: [
      'Open the audit engagement → "Adjustments" tab. This is the adjustments register: corrections your team proposes to the client\u0027s trial balance (accruals, provisions, depreciation, reclassifications).',
      'Import the trial balance first — adjustments are booked against its accounts. Pick the debit and credit accounts with typeahead search and enter the amount; the reference (AJE-001…) is assigned automatically.',
      'New entries start as Proposed. Partner signs off ("Sign off") to post them — posted AJEs are locked and only the partner can undo the sign-off. Every action is captured in the Journal.',
      'The "Final statement figures" table shows each statement line: PER TB (client\u0027s books), the ADJUSTMENTS column, and FINAL (what the IFRS statements will show). The net effect on profit is summarised at the top.',
      'Sample data: the demo engagement (Al Baraka Trading LLC) carries a sample trial balance with three example adjustments so you can see the flow.',
    ],
  },
  {
    role: 'Partner', title: 'E-invoicing readiness (UAE mandate)', steps: [
      'E-invoicing (FIRM MANAGEMENT → "E-invoicing") tracks every client\u0027s route to the UAE eInvoicing mandate: PINT AE structured XML invoices sent through a Ministry-accredited service provider (ASP) — a PDF stops being a valid invoice at the client\u0027s mandate date.',
      'Dates: voluntary/pilot since 1 July 2026 (test now, no penalty risk); mandatory 1 Jan 2027 for clients with revenue ≥ AED 50m (ASP appointed by 30 Oct 2026); 1 July 2027 for smaller clients (ASP by 31 Mar 2027); government suppliers 1 Oct 2027. B2B/B2G only — B2C excluded for now.',
      'Per client, work the five readiness checks: TIN confirmed (first 10 digits of the TRN) → invoice data covers the 51 mandatory PINT AE fields → ASP appointed via EmaraTax (only providers on the MoF accredited register, with an accreditation number) → Peppol participant ID issued (0235 + TIN) → test invoice exchanged end-to-end.',
      'Classify each client\u0027s phase and record the revenue estimate and ASP name — the list sorts clients whose ASP deadline is overdue or imminent to the top, with days remaining.',
      'Penalties if a client ignores the mandate: AED 5,000/month (no ASP), AED 100 per late invoice or credit note (cap AED 5,000/month), AED 1,000/day for unnotified data changes — use this in readiness conversations.',
      'Run a readiness assessment for every active client before 31 March 2027 — package the tracker output as the deliverable.',
    ],
  },
  {
    role: 'Partner', title: 'E-invoice generation (PINT AE XML)', steps: [
      'Every invoice row in Invoices & collections has an E-invoice button (blue document icon). Open it to make that invoice e-invoice ready.',
      'Pick the transaction-type code (standard B2B, Free Zone, deemed supply, margin scheme, summary, continuous, disclosed agent, e-commerce, export) and enter the buyer address — then "Save & validate".',
      'Validation checks the PINT AE mandatory-field groups and lists every failing field with a fix-it message: supplier TRN must be 15 digits (Settings → Firm Identity), buyer TRN 15 digits (client record), addresses, net/VAT split (legacy invoices without VAT breakdown are flagged — re-enter them), transaction type. Drafts and cancelled invoices cannot transmit.',
      'When validation is green, "PINT AE XML" downloads the structured UBL 2.1 e-invoice — that file is what an accredited ASP transmits and reports to the FTA. Every generation is archived with a SHA-256 hash for the statutory record.',
      'Credit notes: record a credit note on the invoice as usual; formal e-credit-note transmission rides the ASP integration (Layer 3).',
      'Client self-service: keep client TRNs and addresses current in their records — the validator reads them directly, so invoices become e-invoice ready without re-keying.',
    ],
  },
  {
    role: 'Everyone', title: 'Client document requests (PBC portal)', steps: [
      'Document requests (sidebar → WORKSPACE) sends a document checklist to a client without them logging in.',
      'New request: pick the client (optionally link the engagement), apply a PBC template for the service (External Audit, VAT, AML…), edit the item list, create.',
      'The client link is copied automatically — send it over WhatsApp or email. The portal is secure by link: no password for the client.',
      'The client uploads against each item; files land in the app under that client (and into their Google Drive folder when Drive is connected), and the item flips to Received.',
      'Watch the progress badge (e.g. 3/8 received) in the list; when everything arrives, follow up items left pending or tick the engagement checklist yourself.',
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
      'Demo data: 5 demo companies ("(Demo)" suffix) showcase every feature — all 25 services, onboarding pipelines at stages 1–4, invoices (paid/part-paid/overdue/draft), leads and tasks. When live work starts, remove them by deleting records tagged source: demo_company (mongo: db.<collection>.deleteMany({source:"demo_company"}) on clients, service_engagements, invoices, client_onboardings, tasks).',
      'The Engagement service chips on /app/engagements show all 25 services permanently — zero-count chips are dimmed until the first engagement exists.',
    ],
  },
  {
    role: 'Partner', title: 'Reports and performance', steps: [
      'Reports hub: one-click access to client master CSV, invoice list, receivables ageing, attendance register, compliance register and engagement workbooks.',
      'Work & performance: staff workload (open engagements and tasks per person), review queue, and the engagement register for any month.',
      'Overview dashboard: firm-wide snapshot — billing & collections, pipeline, team capacity, growth mix.',
    ],
  },
  {
    role: 'Staff', title: 'Books ingestion and integrations (Tally, QuickBooks, Zoho, Xero)', steps: [
      'Set each client\u0027s accounting system in Settings → Integrations — pick Tally, QuickBooks, Zoho Books, Xero, Excel / Google Sheets or Other from the dropdown in the Accounting System column. This tells the ingestion engine how to read the client\u0027s books.',
      'For audit and assurance engagements, the Trial Balance tab can ingest a full general-ledger file instead of a summary TB — a Tally DayBook XML, a GL report export from QuickBooks, Zoho Books or Xero, or any GL spreadsheet with date / account / debit / credit columns.',
      'The app parses the vouchers, derives the trial balance automatically, applies the firm\u0027s mapping memory, and runs the same integrity checks as a manually imported TB.',
      'Re-ingesting a period replaces the previous data cleanly — always ingest the full period from one source so vouchers are never double-counted.',
      'The ledger summary shows the period covered, the voucher count, VAT output / input totals and any flagged duplicates — check it before relying on the derived TB.',
      'The derived TB feeds the adjustments register and the IFRS statement builder exactly like a manually imported TB — map, adjust and build statements as usual.',
      'CSV / Excel fallback: if the client\u0027s system cannot export XML, export the general ledger report to Excel and use the column labelling wizard to mark the date, account, debit and credit columns.',
    ],
  },
  {
    role: 'Auditor / Staff', title: 'Receipt inbox (AI-parsed receipts, duplicate firewall)', steps: [
      'Open an audit engagement and switch to the Receipts tab. Upload a photo or PDF of any purchase receipt / tax invoice — the AI reads the vendor, TRN, date, invoice number, total, VAT amount, category and line items automatically.',
      'Every receipt gets a review status. Accept a receipt once you have verified it against the books; keep it Pending while you check; Reject if it does not belong in the file.',
      'Duplicate firewall: uploading the exact same file twice is blocked outright, and a receipt with the same vendor + date + total as an earlier one is stored but flagged — confirm it is a genuinely different document before accepting.',
      'The totals strip shows accepted spend and accepted input VAT for the engagement — a quick cross-check against the VAT input in the books.',
      'Fields are editable — if the AI misreads a digit, fix the value on the receipt card (edits are attributed). Delete is partner-only.',
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
