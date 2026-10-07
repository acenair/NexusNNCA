import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email: email.trim().toLowerCase() });
    } catch (err) {
      // Intentionally ignore errors here too — never reveal account existence
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0B1526 0%, #10203e 50%, #172d52 100%)',
      position: 'relative', overflow: 'hidden',
    }} data-testid="forgot-password-page">
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(201,168,76,0.03)', top: '-200px', right: '-200px' }} />

      <div style={{ width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--gold)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0B1526', fontFamily: 'DM Serif Display', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>N&N</div>
          <h1 style={{ fontFamily: 'DM Serif Display', color: '#C9A84C', fontSize: 24, marginBottom: 4 }}>Nair & Nelliyatt</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>CHARTERED ACCOUNTANTS</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', boxShadow: '0 16px 64px rgba(0,0,0,0.25)' }}>
          {submitted ? (
            <div data-testid="forgot-password-confirmation">
              <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 18, color: '#0B1526', marginBottom: 10 }}>Check with a Partner</h2>
              <p style={{ fontSize: 13, color: '#60718a', lineHeight: 1.6, marginBottom: 20 }}>If an account exists for <strong>{email}</strong>, a partner will be in touch shortly (by phone or WhatsApp) with a one-time reset code. No email will be sent.</p>
              <p style={{ fontSize: 12, color: '#60718a', marginBottom: 16 }}>Already have a code? <span onClick={() => navigate('/reset-password')} style={{ color: '#C9A84C', fontWeight: 600, cursor: 'pointer' }} data-testid="have-code-link">Reset your password</span></p>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: '11px 0', borderRadius: 8, background: '#C9A84C', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }} data-testid="back-to-login-btn">Back to Login</button>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 18, color: '#0B1526', marginBottom: 4 }}>Forgot Password</h2>
              <p style={{ fontSize: 12, color: '#60718a', marginBottom: 20 }}>Enter your email and a partner will relay a one-time reset code to you by phone or WhatsApp.</p>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@nnadvisory.ae" autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box' }}
                  data-testid="forgot-email-input" />
              </div>

              <button onClick={handleSubmit} disabled={loading || !email}
                style={{ width: '100%', padding: '11px 0', borderRadius: 8, background: loading ? '#dfc06a' : '#C9A84C', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans' }}
                data-testid="forgot-password-submit-btn">
                {loading ? 'Submitting...' : 'Request Reset'}
              </button>

              <p style={{ fontSize: 12, color: '#60718a', textAlign: 'center', marginTop: 16 }}>
                <span onClick={() => navigate('/login')} style={{ color: '#C9A84C', fontWeight: 600, cursor: 'pointer' }} data-testid="back-to-login-link">Back to Login</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
