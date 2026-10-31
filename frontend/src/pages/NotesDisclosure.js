import React, { useState, useEffect } from 'react';
import { ListChecks, FileText, Sparkles, CheckCircle2, RotateCcw, Save, BookMarked, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_STYLE = {
  'Cleared': { bg: '#f0f7f2', fg: 'var(--green)', label: 'Cleared' },
  'Pre-drafted': { bg: '#eaf3fb', fg: '#0e6db4', label: 'Pre-drafted' },
  'Draft': { bg: '#fdf6ec', fg: '#b45309', label: 'Draft' },
  'Shell': { bg: '#eef3f7', fg: 'var(--muted)', label: 'Not drafted' },
};

const badge = (s) => STATUS_STYLE[s] || STATUS_STYLE.Shell;

const NotesDisclosure = ({ engagementId, isPartner }) => {
  const [notes, setNotes] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [progress, setProgress] = useState(0);
  const [policies, setPolicies] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');          // note_id | `policy-${key}`
  const [editing, setEditing] = useState(null);  // note_id being edited
  const [draft, setDraft] = useState('');
  const [showPolicies, setShowPolicies] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [policyDraft, setPolicyDraft] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/statements/${engagementId}/notes`, { withCredentials: true });
      setNotes(res.data.notes || []);
      setChecklist(res.data.checklist || []);
      setProgress(res.data.progress || 0);
      setPolicies(res.data.policies || {});
    } catch (e) { setError('Failed to load notes'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [engagementId]);

  const call = async (path, method, data) => {
    setBusy(path); setError('');
    try {
      await axios({ method, url: `${API}${path}`, data, withCredentials: true });
      await load();
    } catch (e) {
      const d = e.response?.data?.detail;
      setError(typeof d === 'string' ? d : d?.message || 'Action failed');
    } finally { setBusy(''); }
  };

  const predraft = (note) => call(`/statements/${engagementId}/notes/${note.note_id}/predraft`, 'post');
  const clearNote = (note) => call(`/statements/${engagementId}/notes/${note.note_id}/clear`, 'post');
  const saveBody = (note) => call(`/statements/${engagementId}/notes/${note.note_id}`, 'patch', { body: draft }).then(() => setEditing(null));
  const toggleItem = (item, field) => call(`/disclosure/${engagementId}`, 'patch', { key: item.key, [field]: !item[field] });
  const savePolicy = (key) => call(`/policy-library/${key}`, 'put', { text: policyDraft }).then(() => { setEditingPolicy(null); });

  if (loading) return <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading notes…</div>;

  const relevant = checklist.filter(i => i.applies);
  const cleared = notes.filter(n => n.status === 'Cleared').length;

  return (
    <div style={{ margin: '0 20px' }} data-testid="notes-view">
      {error && <div className="af-note" style={{ color: 'var(--red)', marginBottom: 10 }} data-testid="notes-error">{error}</div>}

      {/* Disclosure checklist */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }} data-testid="disclosure-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ListChecks size={13} /> Disclosure checklist
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--muted)' }}>
            <span>{cleared} note{cleared === 1 ? '' : 's'} cleared by partner</span>
            <div style={{ width: 140, height: 6, borderRadius: 3, background: '#e4eff6', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--green)' }} data-testid="disclosure-progress" />
            </div>
            <b style={{ color: 'var(--text)' }} data-testid="disclosure-progress-label">{progress}%</b>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6 }}>
          {checklist.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: item.applies ? 'var(--white)' : 'var(--off, #f7fafc)', opacity: item.applies ? 1 : 0.6 }}>
              <input type="checkbox" checked={!!item.applies} onChange={() => toggleItem(item, 'applies')}
                data-testid={`disclosure-applies-${item.key}`} title="Applies to this engagement" />
              <span style={{ flex: 1, fontSize: 11.5, color: item.applies ? 'var(--text)' : 'var(--muted)', textDecoration: !item.applies ? 'line-through' : (item.done ? 'none' : 'none') }}>{item.title}</span>
              {item.applies && (
                <input type="checkbox" checked={!!item.done} onChange={() => toggleItem(item, 'done')}
                  data-testid={`disclosure-done-${item.key}`} title="Disclosed and complete" />
              )}
              {item.done && item.applies && <CheckCircle2 size={13} color="var(--green)" />}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>First checkbox = the disclosure applies to this engagement · second = disclosed and complete.</div>
      </div>

      {/* Policy library (collapsible) */}
      <div className="nn-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
        <button onClick={() => setShowPolicies(p => !p)} data-testid="policy-library-toggle"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', padding: 0 }}>
          <BookMarked size={13} /> Firm policy library {showPolicies ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {showPolicies && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }} data-testid="policy-library">
            {Object.keys(NOTE_KEYS).filter(k => NOTE_KEYS[k]).map(k => {
              const t = policies[k];
              return editingPolicy === k ? (
                <div key={k} style={{ border: '1px solid var(--nn-border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t?.title || k}</div>
                  <textarea value={policyDraft} onChange={e => setPolicyDraft(e.target.value)} rows={4} data-testid={`policy-text-${k}`}
                    style={{ width: '100%', padding: 8, fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="tbtn tbtn-gold" onClick={() => savePolicy(k)} disabled={busy === `/policy-library/${k}`} data-testid={`policy-save-${k}`}><Save size={11} /> Save policy</button>
                    <button className="af-btn" onClick={() => setEditingPolicy(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid var(--nn-border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>{t?.title || k}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{t?.text ? (t.text.slice(0, 140) + (t.text.length > 140 ? '…' : '')) : 'No firm policy saved for this note yet.'}</div>
                  </div>
                  <button className="af-btn" onClick={() => { setEditingPolicy(k); setPolicyDraft(t?.text || ''); }} data-testid={`policy-edit-${k}`}>Edit</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="nn-card" style={{ padding: '14px 20px' }} data-testid="notes-card">
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gold)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={13} /> Notes to the financial statements
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {notes.map(n => {
            const b = badge(n.status);
            const policy = policies[n.key];
            return (
              <div key={n.note_id} style={{ border: '1px solid var(--nn-border)', borderRadius: 10, padding: 12 }} data-testid={`note-${n.key}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{n.title}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 10, background: b.bg, color: b.fg }} data-testid={`note-status-${n.key}`}>{b.label}</span>
                </div>
                {n.status !== 'Shell' && n.body && (
                  <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, margin: '8px 0', whiteSpace: 'pre-wrap' }} data-testid={`note-body-${n.key}`}>{n.body}</p>
                )}
                {n.status === 'Shell' && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0', fontStyle: 'italic' }}>Not drafted yet — use the AI pre-draft (uses this engagement's figures and the firm policy) or write it manually.</p>}
                {n.drafted_by && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>{n.drafted_by}{n.cleared_by ? ` · cleared by ${n.cleared_by}` : ''}</div>}

                {editing === n.note_id ? (
                  <div>
                    <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5} data-testid={`note-edit-${n.key}`}
                      style={{ width: '100%', padding: 8, fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button className="tbtn tbtn-gold" onClick={() => saveBody(n)} disabled={busy === `/statements/${engagementId}/notes/${n.note_id}`} data-testid={`note-save-${n.key}`}><Save size={11} /> Save note</button>
                      <button className="af-btn" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="af-btn" onClick={() => predraft(n)} disabled={busy === `/statements/${engagementId}/notes/${n.note_id}/predraft`} data-testid={`note-predraft-${n.key}`}>
                      {busy === `/statements/${engagementId}/notes/${n.note_id}/predraft` ? <Loader2 size={11} className="spin" /> : <Sparkles size={11} />}
                      {n.status === 'Shell' ? 'AI pre-draft' : 'Re-draft'}
                    </button>
                    <button className="af-btn" onClick={() => { setEditing(n.note_id); setDraft(n.body || ''); }} data-testid={`note-editbtn-${n.key}`}>Edit</button>
                    {isPartner && (n.status !== 'Shell') && (
                      <button className="af-btn" onClick={() => clearNote(n)}
                        style={n.status === 'Cleared' ? {} : { color: 'var(--green)', borderColor: '#cfe5d6' }}
                        data-testid={`note-clear-${n.key}`}>
                        {n.status === 'Cleared' ? <><RotateCcw size={11} /> Reopen</> : <><CheckCircle2 size={11} /> Clear (partner)</>}
                      </button>
                    )}
                    {!policy && n.key in NOTE_KEYS && <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }}>No firm policy saved — the pre-draft uses the template wording.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const NOTE_KEYS = {
  basis: true, revenue: true, staff_costs: true, ppe: true, receivables: true,
  cash: true, payables: true, tax: true, related: true, capital: true,
  provisions: true, financial_risk: true, events_after: true,
};

export default NotesDisclosure;
