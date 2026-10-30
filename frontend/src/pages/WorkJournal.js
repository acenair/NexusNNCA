import React, { useState, useEffect, useRef } from 'react';
import { NotebookPen, Send, Moon, AlertTriangle, ClipboardCheck } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EVENT_ICON = { manual_note: '📝' };
const EVENT_COLOR = {
  checklist_done: '#15803d', checklist_undone: '#be123c', checklist_note: '#0e6db4',
  phase_moved: '#7c3aed', engagement_updated: '#b45309', tb_imported: '#0e6db4',
  tb_mapping_changed: '#0e6db4', review_note_added: '#be123c', review_note_cleared: '#15803d',
  query_raised: '#b45309', query_answered: '#15803d', query_closed: '#15803d',
  manual_note: '#334155',
};

const fmtWhen = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const WorkJournal = ({ engagementId }) => {
  const [entries, setEntries] = useState([]);
  const [brief, setBrief] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const load = async () => {
    try {
      const [j, b] = await Promise.all([
        axios.get(`${API}/journal/${engagementId}`, { withCredentials: true }),
        axios.get(`${API}/journal/${engagementId}/brief`, { withCredentials: true }),
      ]);
      setEntries(j.data.entries || []);
      setBrief(b.data);
    } catch (e) { setError('Failed to load journal'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const addNote = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/journal/${engagementId}`, { text }, { withCredentials: true });
      setText('');
      await load();
    } catch (e) { setError('Failed to add note'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading journal…</div>;

  const manual = entries.filter(e => e.kind === 'manual');

  return (
    <div style={{ margin: '0 20px' }} data-testid="work-journal">
      {/* Handover brief */}
      {brief && (
        <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="journal-brief">
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={13} /> Handover brief — where this job stands
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Stage</div><b style={{ fontSize: 13 }}>{brief.phase || '—'}</b></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Status</div><b style={{ fontSize: 13 }}>{brief.status || '—'}</b></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>In charge</div><b style={{ fontSize: 13 }}>{brief.assigned_to_name || 'Unassigned'}</b></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Progress</div><b style={{ fontSize: 13 }}>{brief.done}/{brief.total} ({brief.progress}%)</b></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Open review notes</div><b style={{ fontSize: 13, color: brief.open_review_notes ? 'var(--red)' : 'var(--green)' }}>{brief.open_review_notes}</b></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Last activity</div>
              <b style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                {brief.last_activity ? fmtWhen(brief.last_activity) : 'No activity yet'}
                {brief.quiet_days != null && brief.quiet_days >= 7 && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red)', background: '#fdecec', border: '1px solid #f4cbc7', padding: '1px 7px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 3 }} data-testid="quiet-flag">
                    <Moon size={10} /> quiet {brief.quiet_days}d
                  </span>
                )}
              </b>
            </div>
          </div>
          {brief.undocumented?.count > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)', background: '#fdecec', border: '1px solid #f4cbc7', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 7, alignItems: 'flex-start' }} data-testid="undocumented-flag">
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><b>{brief.undocumented.count} completed item{brief.undocumented.count > 1 ? 's' : ''} without a working-paper note:</b> {brief.undocumented.items.join(', ')}{brief.undocumented.count > 5 ? '…' : ''} — open the Checklist tab and add notes so the file is defensible.</span>
            </div>
          )}
          {brief.last_activity_text && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>Latest: {brief.last_activity_text}</div>
          )}
        </div>
      )}

      {/* Add manual note */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <NotebookPen size={13} /> Add a journal note
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          Record anything a colleague would need if you were unavailable — client conversations, promises made, blockers, what you sent or received.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
            placeholder="e.g. 'Called client re: missing invoices — they will send by Sunday'"
            data-testid="journal-input"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', fontSize: 12.5 }} />
          <button className="af-btn-primary" onClick={addNote} disabled={sending} data-testid="journal-add-btn"><Send size={12} /> {sending ? 'Saving…' : 'Add'}</button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      </div>

      {/* Timeline */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 20 }} data-testid="journal-timeline">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 8 }}>
          Timeline — {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} (newest first)
        </div>
        {entries.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            Nothing logged yet. Ticks, phase moves, trial-balance work, review notes and queries are captured here automatically — plus anything you write above.
          </div>
        )}
        {entries.map(e => {
          const color = EVENT_COLOR[e.event] || '#334155';
          return (
            <div key={e.entry_id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--nn-border)' }} data-testid={`journal-entry-${e.entry_id}`}>
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: `${color}14`, color }}>
                {EVENT_ICON[e.event] || '•'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{e.text}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                  {e.by_name} · {fmtWhen(e.at)}{e.kind === 'manual' && ' · manual note'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkJournal;
