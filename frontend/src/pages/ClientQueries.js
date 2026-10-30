import React, { useState, useEffect } from 'react';
import { MessageSquareQuestion, Send, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_STYLE = {
  Open: { bg: '#fdf6ec', bd: '#f0e0c8', fg: '#b45309', label: 'Awaiting client reply' },
  Answered: { bg: '#eaf3fb', bd: '#cfe3f4', fg: '#0e6db4', label: 'Client replied — review' },
  Closed: { bg: '#f0f7f2', bd: '#cfe5d6', fg: 'var(--green)', label: 'Resolved' },
};

const fmtWhen = (iso) => {
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const ClientQueries = ({ engagementId }) => {
  const [queries, setQueries] = useState([]);
  const [counts, setCounts] = useState({ open: 0, answered: 0, closed: 0 });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/service/engagements/${engagementId}/queries`, { withCredentials: true });
      setQueries(res.data.queries || []);
      setCounts(res.data.counts || { open: 0, answered: 0, closed: 0 });
    } catch (e) { setError('Failed to load queries'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const raise = async () => {
    if (!text.trim()) return;
    setSending(true); setError('');
    try {
      await axios.post(`${API}/service/engagements/${engagementId}/queries`, { question: text }, { withCredentials: true });
      setText('');
      await load();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to raise query'); }
    finally { setSending(false); }
  };

  const close = async (qid) => {
    try {
      await axios.post(`${API}/queries/${qid}/close`, {}, { withCredentials: true });
      await load();
    } catch (e) { setError('Failed to close'); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading queries…</div>;

  return (
    <div style={{ margin: '0 20px', marginBottom: 20 }} data-testid="client-queries">
      {/* Raise a query */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquareQuestion size={13} /> Ask the client
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          The query appears in the client's portal instantly. They reply in the portal with a message and any files — replies land here and in the journal.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && raise()}
            placeholder="e.g. 'Please provide bank statements for Jan–Mar and explain the AED 4,200 transfer on 14 Feb'"
            data-testid="query-input"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
          <button className="af-btn-primary" onClick={raise} disabled={sending} data-testid="query-raise-btn">
            {sending ? <Loader2 size={12} className="spin" /> : <Send size={12} />} Send to client
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      </div>

      {/* Counts */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }} data-testid="query-counts">
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#fdf6ec', color: '#b45309' }}>{counts.open} awaiting client</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#eaf3fb', color: '#0e6db4' }}>{counts.answered} to review</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#f0f7f2', color: 'var(--green)' }}>{counts.closed} resolved</span>
      </div>

      {/* Threads */}
      {queries.length === 0 && (
        <div className="nn-card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
          No queries yet. Raise one above when you need something from the client — no more chasing over WhatsApp.
        </div>
      )}
      {queries.map(q => {
        const s = STATUS_STYLE[q.status] || STATUS_STYLE.Open;
        return (
          <div key={q.query_id} className="nn-card" style={{ padding: '14px 20px', marginBottom: 12 }} data-testid={`query-${q.query_id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{q.question}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>Raised by {q.asked_by} · {fmtWhen(q.asked_at)}</div>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }} data-testid={`query-status-${q.query_id}`}>{s.label}</span>
            </div>

            {(q.replies || []).map(r => (
              <div key={r.reply_id} style={{ marginTop: 10, marginLeft: 24, padding: '9px 12px', borderRadius: 8, background: r.by_role === 'client' ? '#f0f7f2' : '#eaf3fb', border: `1px solid ${r.by_role === 'client' ? '#cfe5d6' : '#cfe3f4'}` }} data-testid={`reply-${r.reply_id}`}>
                <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{r.text}</div>
                {r.filename && (
                  <a href={`${API}/files/${r.file_id}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#0e6db4', marginTop: 5, fontWeight: 600 }} data-testid={`reply-file-${r.reply_id}`}>
                    <FileText size={12} /> {r.filename}
                  </a>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{r.by_name} · {fmtWhen(r.at)}</div>
              </div>
            ))}

            {q.status === 'Answered' && (
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <button className="af-btn" onClick={() => close(q.query_id)} data-testid={`query-close-${q.query_id}`}>
                  <CheckCircle2 size={12} /> Mark resolved
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ClientQueries;
