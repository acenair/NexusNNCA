import React, { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, FileText as FileTextIcon, CheckCircle2, RefreshCw, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { AuditQuestionRow } from '../components/AuditQuestionRow';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuditWorkbook = ({ engagementId, clientId, clientName }) => {
  const [audits, setAudits] = useState([]);
  const [activeAuditId, setActiveAuditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStartForm, setShowStartForm] = useState(false);
  const [history, setHistory] = useState([]);
  const [startForm, setStartForm] = useState({ period: '', roll_forward_from: '' });
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => { loadAudits(); }, [engagementId]);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const [auditsRes, historyRes] = await Promise.all([
        axios.get(`${API}/audit/engagements/${engagementId}`, { withCredentials: true }),
        axios.get(`${API}/audit/client/${clientId}/history`, { withCredentials: true }),
      ]);
      setAudits(auditsRes.data);
      setHistory(historyRes.data);
      if (auditsRes.data.length > 0) {
        const inProgress = auditsRes.data.find(a => a.status === 'in_progress');
        const pick = inProgress || auditsRes.data[0];
        setActiveAuditId(pick.audit_id);
        await loadDetail(pick.audit_id);
      } else {
        setShowStartForm(true);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadDetail = async (auditId) => {
    try {
      const res = await axios.get(`${API}/audit/${auditId}`, { withCredentials: true });
      setDetail(res.data);
      setSelectedSection(prev => prev || [...res.data.template.sections].sort((a, b) => a.order - b.order)[0].section_id);
    } catch (e) { console.error(e); }
  };

  const openStartForm = () => {
    setShowStartForm(true);
    setStartForm({ period: '', roll_forward_from: '' });
  };

  const handleStart = async () => {
    if (!startForm.period.trim()) return;
    setStarting(true);
    try {
      const body = { period: startForm.period.trim() };
      if (startForm.roll_forward_from) body.roll_forward_from = startForm.roll_forward_from;
      const res = await axios.post(`${API}/audit/engagements/${engagementId}/start`, body, { withCredentials: true });
      setShowStartForm(false);
      await loadAudits();
      setActiveAuditId(res.data.audit_id);
      await loadDetail(res.data.audit_id);
    } catch (e) { console.error(e); alert('Failed to start audit'); }
    finally { setStarting(false); }
  };

  const handleComplete = async () => {
    if (!window.confirm('Mark this audit as completed? You can still view it afterwards.')) return;
    setCompleting(true);
    try {
      await axios.post(`${API}/audit/${activeAuditId}/complete`, {}, { withCredentials: true });
      await loadDetail(activeAuditId);
      await loadAudits();
    } catch (e) { console.error(e); }
    finally { setCompleting(false); }
  };

  const handleSwitchAudit = async (auditId) => {
    setActiveAuditId(auditId);
    setSelectedSection(null);
    await loadDetail(auditId);
  };

  const onResponseSaved = useCallback(() => {
    if (activeAuditId) loadDetail(activeAuditId);
  }, [activeAuditId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }} data-testid="audit-workbook-loading">Loading audit workbook...</div>;

  if (showStartForm || audits.length === 0) {
    return (
      <div className="nn-card" style={{ padding: 24 }} data-testid="audit-start-form">
        <h3 style={{ fontSize: 15, fontFamily: 'DM Serif Display', color: 'var(--text)', marginBottom: 4 }}>Start Digital Audit Workbook</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>25-section statutory audit checklist for {clientName}.</p>
        <div style={{ marginBottom: 14, maxWidth: 320 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Audit Period *</label>
          <input type="text" placeholder="e.g. FY 2025-26" value={startForm.period} onChange={(e) => setStartForm(p => ({ ...p, period: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--nn-border)', fontSize: 13, outline: 'none' }} data-testid="audit-period-input" />
        </div>
        {history.length > 0 && (
          <div style={{ marginBottom: 16, maxWidth: 320 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Roll Forward Static Data From</label>
            <select value={startForm.roll_forward_from} onChange={(e) => setStartForm(p => ({ ...p, roll_forward_from: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--nn-border)', fontSize: 13, outline: 'none' }} data-testid="audit-rollforward-select">
              <option value="">— Start fresh —</option>
              {history.map(h => <option key={h.audit_id} value={h.audit_id}>{h.period} ({h.status})</option>)}
            </select>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Copies Cover Page & Legal Document answers from a prior year.</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tbtn tbtn-gold" onClick={handleStart} disabled={starting || !startForm.period.trim()} data-testid="audit-start-submit-btn">{starting ? 'Starting...' : 'Start Audit'}</button>
          {audits.length > 0 && <button className="tbtn tbtn-outline" onClick={() => setShowStartForm(false)} data-testid="audit-start-cancel-btn">Cancel</button>}
        </div>
      </div>
    );
  }

  if (!detail) return null;
  const { audit, template, section_progress, overall_pct, questions_done, questions_total } = detail;
  const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);
  const currentSection = sortedSections.find(s => s.section_id === selectedSection) || sortedSections[0];
  const currentProgress = section_progress.find(s => s.section_id === currentSection.section_id);

  return (
    <div data-testid="audit-workbook-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 14, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{audit.period}</h3>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: audit.status === 'completed' ? 'var(--green-bg)' : 'rgba(201,168,76,0.12)', color: audit.status === 'completed' ? 'var(--green)' : 'var(--gold4)' }} data-testid="audit-status-pill">{audit.status === 'completed' ? 'Completed' : 'In Progress'}</span>
              {audit.rolled_forward_from && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Rolled forward</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{questions_done}/{questions_total} questions answered</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {audits.length > 1 && (
              <select value={activeAuditId} onChange={(e) => handleSwitchAudit(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--nn-border)', fontSize: 11 }} data-testid="audit-history-select">
                {audits.map(a => <option key={a.audit_id} value={a.audit_id}>{a.period} ({a.status})</option>)}
              </select>
            )}
            <a href={`${API}/audit/${activeAuditId}/export.xlsx`} target="_blank" rel="noreferrer" className="tbtn tbtn-outline" style={{ textDecoration: 'none', fontSize: 11 }} data-testid="audit-export-xlsx-btn"><FileSpreadsheet size={13} /> Excel</a>
            <a href={`${API}/audit/${activeAuditId}/export.pdf`} target="_blank" rel="noreferrer" className="tbtn tbtn-outline" style={{ textDecoration: 'none', fontSize: 11 }} data-testid="audit-export-pdf-btn"><FileTextIcon size={13} /> PDF</a>
            {audit.status === 'in_progress' ? (
              <button className="tbtn tbtn-green" onClick={handleComplete} disabled={completing} data-testid="audit-complete-btn"><CheckCircle2 size={13} /> {completing ? 'Saving...' : 'Mark Complete'}</button>
            ) : (
              <button className="tbtn tbtn-gold" onClick={openStartForm} data-testid="audit-start-new-btn"><RefreshCw size={13} /> Start New Period</button>
            )}
          </div>
        </div>
        <div style={{ padding: '0 20px 14px' }}>
          <div className="nn-progress" style={{ height: 6 }}><div className="nn-progress-bar" style={{ width: `${overall_pct}%`, background: overall_pct >= 80 ? 'var(--green)' : overall_pct >= 40 ? '#3b82f6' : 'var(--gold)' }} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} className="audit-workbook-layout">
        {/* Section Sidebar */}
        <div className="nn-card audit-section-sidebar" style={{ width: 260, flexShrink: 0, maxHeight: 640, overflowY: 'auto' }} data-testid="audit-section-sidebar">
          {sortedSections.map((sec, idx) => {
            const prog = section_progress.find(s => s.section_id === sec.section_id);
            const active = sec.section_id === currentSection.section_id;
            return (
              <button
                key={sec.section_id}
                onClick={() => setSelectedSection(sec.section_id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--nn-border)',
                  background: active ? 'rgba(201,168,76,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left',
                }}
                data-testid={`audit-section-tab-${sec.section_id}`}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? 'var(--gold4)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{idx + 1}. {sec.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{prog?.done || 0}/{prog?.total || 0} · {prog?.pct || 0}%</div>
                </div>
                <ChevronRight size={12} color={active ? 'var(--gold4)' : 'var(--muted)'} style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>

        {/* Questions Panel */}
        <div className="nn-card" style={{ flex: 1, minWidth: 0, maxHeight: 640, overflowY: 'auto' }} data-testid="audit-questions-panel">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', position: 'sticky', top: 0, background: 'var(--white)', zIndex: 1 }}>
            <h4 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>{currentSection.name}</h4>
            <div className="nn-progress" style={{ height: 4, marginTop: 6, width: 160 }}><div className="nn-progress-bar" style={{ width: `${currentProgress?.pct || 0}%`, background: 'var(--gold)' }} /></div>
          </div>
          {currentSection.questions.map(q => (
            <AuditQuestionRow key={q.code} auditId={activeAuditId} question={q} response={audit.responses[q.code]} onSaved={onResponseSaved} />
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .audit-workbook-layout { flex-direction: column; }
          .audit-section-sidebar { width: 100% !important; max-height: 240px !important; }
        }
      `}</style>
    </div>
  );
};

export default AuditWorkbook;
