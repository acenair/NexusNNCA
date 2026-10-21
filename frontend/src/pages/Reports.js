import React, { useEffect, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axiosLib from 'axios';
import { Download, FileSpreadsheet, Shield, Receipt, Users, ClipboardList, TrendingUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const aed = (n) => 'AED ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const Reports = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const isPartner = user?.role === 'partner';
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.all([
      axiosLib.get(`${API}/dashboard/stats`, { withCredentials: true }),
      axiosLib.get(`${API}/invoices/billing-summary`, { withCredentials: true }).catch(() => null),
      axiosLib.get(`${API}/compliance/records`, { withCredentials: true }).catch(() => ({ data: [] })),
    ]).then(([s, b, c]) => {
      setStats({
        clients: s.data?.active_clients,
        engagements: s.data?.open_tasks,
        pending: b?.data?.pending_total,
        overdue: b?.data?.overdue_total,
        compliance: Array.isArray(c.data) ? c.data.length : 0,
      });
    }).catch(() => {});
  }, []);

  const reports = [
    { icon: Users, title: 'Client master export', desc: 'All 269 clients with licence, VAT/CT and service data', action: () => window.open(`${API}/export/clients-csv`, '_blank'), live: true },
    { icon: Receipt, title: 'Invoice list', desc: 'Full ledger: billed, collected, credits, pending, status', link: '/app/invoices', live: !!stats?.pending },
    { icon: TrendingUp, title: 'Receivables ageing', desc: 'Unpaid balances by days past due', link: '/app/ageing-report', live: !!stats?.pending },
    { icon: ClipboardList, title: 'Attendance & leave', desc: 'Monthly register and leave taken per staff', link: '/app/attendance', live: true },
    { icon: Shield, title: 'Compliance register', desc: 'KYC / firm / staff document expiries with stages', link: '/app/compliance', live: !!stats?.compliance },
    { icon: FileSpreadsheet, title: 'Audit workbook report', desc: 'Per-engagement 25-sheet audit workbook (PDF/Excel)', link: '/app/engagements', live: true },
  ];

  return (
    <div className="ov-wrap" data-testid="reports-view">
      <div className="ov-heading">
        <div>
          <div className="ov-eyebrow">ONE PLACE FOR EVERY VIEW</div>
          <h1>Reports</h1>
          <p>Every export and register in the firm, one click away.</p>
        </div>
      </div>
      <div className="af-grid af-grid-3">
        {reports.map(r => (
          <section className="af-card" key={r.title}>
            <div className="af-cardhead"><div><h2>{r.title}</h2><div className="af-sub">{r.desc}</div></div></div>
            <button className="af-link" onClick={r.action || (() => navigate(r.link))}>
              <Download size={12} style={{ verticalAlign: -2 }} /> {r.action ? 'Download CSV' : 'Open view'} ↗
            </button>
          </section>
        ))}
      </div>
      <p className="af-note" style={{ marginTop: 16 }}>
        {stats ? `Snapshot: ${stats.clients || 0} clients · ${aed(stats.pending)} pending receivables (${aed(stats.overdue)} overdue) · ${stats.compliance} compliance records.` : 'Loading snapshot…'}
      </p>
    </div>
  );
};

export default Reports;
