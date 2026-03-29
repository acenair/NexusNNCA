import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Bot, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AIAssistant = () => {
  const { user } = useOutletContext();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(`session_${Date.now()}`);

  const quickPrompts = [
    'What is the UAE VAT threshold for mandatory registration?',
    'Explain corporate tax registration requirements',
    'What are AML obligations for DNFBPs?',
    'VAT return filing deadlines in UAE',
    'Free zone corporate tax exemptions',
  ];

  const handleSend = async (message = input) => {
    if (!message.trim()) return;

    const userMessage = { role: 'user', content: message, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(
        `${API}/ai/chat`,
        null,
        {
          params: { session_id: sessionId, message },
          withCredentials: true
        }
      );

      const aiMessage = { role: 'assistant', content: response.data.response, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>AI Compliance Assistant</h1>
        <p className="text-slate-600 mt-1">Ask me anything about UAE VAT, Corporate Tax, AML, or audit standards.</p>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-md overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="chat-messages">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-700 mb-2">How can I help you today?</h3>
              <p className="text-sm text-slate-500 mb-6">Choose a quick prompt or type your question below</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                    data-testid="quick-prompt"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${ msg.role === 'user' ? 'justify-end' : 'justify-start' }`}
                data-testid={`message-${msg.role}`}
              >
                <div
                  className={`max-w-3xl px-4 py-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-50 text-slate-900'
                      : 'bg-slate-50 text-slate-900 border border-slate-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleSend()}
              placeholder="Ask about UAE compliance, VAT, Corporate Tax, AML..."
              disabled={loading}
              className="flex-1"
              data-testid="chat-input"
            />
            <Button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="chat-send-btn"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
