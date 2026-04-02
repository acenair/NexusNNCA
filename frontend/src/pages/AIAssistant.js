import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Send, Plus, Trash2, MessageSquare, Loader2, Bot, User } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AIAssistant = () => {
  const { user } = useOutletContext();
  const [sessionId, setSessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await axios.get(`${API}/ai/sessions`, { withCredentials: true });
      setSessions(res.data);
    } catch (err) { /* ignore */ }
  };

  const loadSession = async (sid) => {
    setSessionId(sid);
    setShowSessions(false);
    try {
      const res = await axios.get(`${API}/ai/chat/${sid}`, { withCredentials: true });
      setMessages(res.data.map(m => ({ role: m.role, content: m.content })));
    } catch (err) { setMessages([]); }
  };

  const newSession = () => {
    const newId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(newId);
    setMessages([]);
    setShowSessions(false);
    inputRef.current?.focus();
  };

  const deleteSession = async (sid, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/ai/chat/${sid}`, { withCredentials: true });
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      if (sid === sessionId) newSession();
    } catch (err) { /* ignore */ }
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API}/ai/chat`, {
        session_id: sessionId,
        message: msg,
      }, { withCredentials: true });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
      loadSessions();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'What are the current VAT filing deadlines?',
    'Which clients have overdue tasks?',
    'Explain UAE Corporate Tax thresholds',
    'What AML obligations apply to our firm?',
    'Show me Fazil\'s current workload',
    'What is the penalty for late VAT filing?',
  ];

  const formatContent = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gm, '<h4 style="font-family:DM Serif Display;font-size:14px;margin:8px 0 4px;color:var(--text)">$1</h4>')
      .replace(/^## (.*$)/gm, '<h3 style="font-family:DM Serif Display;font-size:15px;margin:10px 0 4px;color:var(--text)">$1</h3>')
      .replace(/^- (.*$)/gm, '<div style="padding-left:12px;margin:2px 0">• $1</div>')
      .replace(/^(\d+)\. (.*$)/gm, '<div style="padding-left:12px;margin:2px 0">$1. $2</div>')
      .replace(/`(.*?)`/g, '<code style="background:var(--off);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="fade-in" style={{ display: 'flex', gap: 0, height: 'calc(100vh - 100px)', maxHeight: 'calc(100vh - 100px)' }} data-testid="ai-assistant-view">
      {/* Sessions Panel */}
      <div className="ai-sessions-panel" style={{ display: showSessions ? 'flex' : undefined }} data-testid="ai-sessions-panel">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontFamily: 'DM Serif Display', color: 'var(--text)' }}>Conversations</h3>
          <button onClick={newSession} className="tbtn tbtn-gold" style={{ padding: '5px 10px', fontSize: 11 }} data-testid="new-chat-btn"><Plus size={12} /> New</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No conversations yet</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.session_id}
                onClick={() => loadSession(s.session_id)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--nn-border)',
                  cursor: 'pointer', transition: 'background 0.12s',
                  background: s.session_id === sessionId ? 'rgba(201,168,76,0.06)' : 'transparent',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
                data-testid={`session-${s.session_id}`}
              >
                <MessageSquare size={13} color="var(--muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.preview || 'New conversation'}</div>
                  <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 2 }}>{s.message_count} messages</div>
                </div>
                <button onClick={(e) => deleteSession(s.session_id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--light)', padding: 2, display: 'flex', opacity: 0.5 }} data-testid={`delete-session-${s.session_id}`}><Trash2 size={12} /></button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Chat Header */}
        <div className="nn-card" style={{ borderRadius: '10px 10px 0 0', borderBottom: 'none', flexShrink: 0 }}>
          <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy3))', padding: '14px 20px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="var(--navy)" />
              </div>
              <div>
                <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 16 }}>AI Compliance Assistant</h2>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>UAE regulatory expert + firm data</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ai-sessions-toggle tbtn tbtn-outline" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 11 }} onClick={() => setShowSessions(!showSessions)} data-testid="toggle-sessions-btn"><MessageSquare size={12} /> History</button>
              <button className="tbtn tbtn-outline" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 11 }} onClick={newSession} data-testid="new-chat-header-btn"><Plus size={12} /> New Chat</button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="nn-card" style={{ flex: 1, borderRadius: 0, borderTop: 'none', borderBottom: 'none', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, var(--navy), var(--navy3))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={26} color="var(--gold)" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>How can I help you today?</h3>
                  <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 380 }}>Ask me about UAE compliance, audit standards, or your firm's client data and deadlines.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxWidth: 500, width: '100%' }} className="ai-quick-grid" data-testid="quick-prompts">
                  {quickPrompts.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      style={{
                        padding: '10px 14px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)',
                        background: 'var(--white)', color: 'var(--text)', fontSize: 12, textAlign: 'left',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'DM Sans',
                      }}
                      data-testid={`quick-prompt-${idx}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', gap: 10, marginBottom: 16,
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}
                    data-testid={`chat-msg-${idx}`}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {msg.role === 'user' ? <User size={14} color="var(--navy)" /> : <Bot size={14} color="var(--gold)" />}
                    </div>
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                      background: msg.role === 'user' ? 'var(--navy)' : 'var(--white)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.6,
                      border: msg.role === 'assistant' ? '1px solid var(--nn-border)' : 'none',
                      boxShadow: msg.role === 'assistant' ? 'var(--shadow-sm)' : 'none',
                    }}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={14} color="var(--gold)" />
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--white)', border: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Loader2 size={14} color="var(--gold)" style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="nn-card" style={{ borderRadius: '0 0 10px 10px', borderTop: '1px solid var(--nn-border)', flexShrink: 0 }}>
          <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about UAE compliance, client status, deadlines..."
              rows={1}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 'var(--rs)', border: '1px solid var(--nn-border)',
                fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none',
                resize: 'none', minHeight: 40, maxHeight: 120,
                background: 'var(--off)',
              }}
              data-testid="ai-chat-input"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: 40, height: 40, borderRadius: 'var(--rs)', border: 'none',
                background: input.trim() && !loading ? 'var(--gold)' : 'var(--surface)',
                color: input.trim() && !loading ? 'var(--navy)' : 'var(--light)',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexShrink: 0,
              }}
              data-testid="ai-send-btn"
            >
              <Send size={16} />
            </button>
          </div>
          <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--light)' }}>Powered by Gemini 3 Flash</span>
            <span style={{ fontSize: 10, color: 'var(--light)' }}>Shift+Enter for new line</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ai-sessions-panel { width: 260px; flex-shrink: 0; background: var(--white); border: 1px solid var(--nn-border); border-radius: 10px; margin-right: 12px; display: flex; flex-direction: column; overflow: hidden; }
        .ai-sessions-toggle { display: none !important; }
        @media (max-width: 900px) {
          .ai-sessions-panel { display: none !important; position: fixed; left: 0; top: 56px; bottom: 0; width: 280px; z-index: 50; border-radius: 0; margin: 0; box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
          .ai-sessions-panel[style*="flex"] { display: flex !important; }
          .ai-sessions-toggle { display: inline-flex !important; }
          .ai-quick-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default AIAssistant;
