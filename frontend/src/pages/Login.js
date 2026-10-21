import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    // Check for pending approval redirect
    if (location.state?.pendingApproval) {
      setPendingMsg(location.state.message || 'Your account is pending admin approval.');
    }
    // Google OAuth: show button if configured; complete login when redirected back
    axios.get(`${API}/auth/google/status`).then(r => setGoogleEnabled(!!r.data?.enabled)).catch(() => {});
    const qp = new URLSearchParams(window.location.search);
    const gerr = qp.get('google_error');
    if (gerr) {
      const msgs = {
        not_registered: 'This Google account is not registered. Ask a partner to add you, or use your password.',
        domain_not_allowed: 'Only firm Google accounts (nairnelliyatt.com / nn-ca.com) can sign in here.',
        pending_approval: 'Your account is pending partner approval.',
        disabled: 'Google sign-in is not configured yet.',
      };
      setGoogleError(msgs[gerr] || 'Google sign-in failed. Please use your password.');
      window.history.replaceState({}, '', '/login');
    }
    const tok = qp.get('token');
    if (tok) {
      // OAuth callback: validate the session server-side, then store it like a password login
      axios.post(`${API}/auth/google/exchange?token=${encodeURIComponent(tok)}`, {}, { withCredentials: true })
        .then(res => {
          document.cookie = `session_token=${tok}; path=/; max-age=604800; secure; samesite=lax`;
          localStorage.setItem('session_token', tok);
          if (res.data.must_change_password) { navigate('/change-password'); }
          else { navigate('/app/dashboard'); }
        })
        .catch(() => setGoogleError('Google sign-in session expired. Please try again.'));
      window.history.replaceState({}, '', '/login');
    }
  }, [location.state, navigate]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/auth/login`, {
        email: email.trim().toLowerCase(),
        password: password,
      }, { withCredentials: true });
      if (res.data.session_token) {
        document.cookie = `session_token=${res.data.session_token}; path=/; max-age=604800; secure; samesite=lax`;
        localStorage.setItem('session_token', res.data.session_token);
      }
      const role = res.data.role || 'staff';
      if (res.data.must_change_password) {
        navigate('/change-password');
      } else {
        navigate(role === 'client' ? '/client/documents' : '/app/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #17354c 0%, #16374f 50%, #1c4260 100%)',
      position: 'relative', overflow: 'hidden',
    }} data-testid="login-page">
      {/* Decorative circle */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(14,109,180,0.03)', top: '-200px', right: '-200px' }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(14,109,180,0.02)', bottom: '-150px', left: '-100px' }} />

      <div style={{ width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, background: 'var(--gold)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', color: '#17354c',
            fontFamily: 'DM Sans', fontSize: 20, fontWeight: 700, marginBottom: 12,
          }}>
            N&N
          </div>
          <h1 style={{ fontFamily: 'DM Sans', color: '#0e7ec4', fontSize: 24, marginBottom: 4 }}>Nair & Nelliyatt</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>CHARTERED ACCOUNTANTS</p>
        </div>

        {/* Login Card */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: '28px 30px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.25)',
        }}>
          <h2 style={{ fontFamily: 'DM Sans', fontSize: 18, color: '#17354c', marginBottom: 4 }}>Welcome Back</h2>
          <p style={{ fontSize: 12, color: '#7891a4', marginBottom: 20 }}>Sign in to your practice management dashboard</p>

          {googleError && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 12 }} data-testid="google-error">
          {googleError}
        </div>
      )}
      {googleEnabled && (
        <button
          onClick={() => { window.location.href = `${API}/auth/google/start`; }}
          style={{ width: '100%', padding: '11px 0', borderRadius: 8, background: 'var(--white)', color: 'var(--text)', fontSize: 13, fontWeight: 600, border: '1px solid var(--nn-border)', cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'DM Sans' }}
          data-testid="google-signin-btn"
        >
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google (firm account)
        </button>
      )}
      {pendingMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', color: '#92400e', fontSize: 12, marginBottom: 14, fontWeight: 500, border: '1px solid rgba(245,158,11,0.2)' }} data-testid="pending-msg">
              {pendingMsg}
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fff0f0', color: '#d36b6b', fontSize: 12, marginBottom: 14, fontWeight: 500 }} data-testid="login-error">
              {error}
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#7891a4', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@nnadvisory.ae"
              autoComplete="username"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && password && handleLogin()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid rgba(23,53,76,0.09)', fontSize: 13,
                fontFamily: 'DM Sans', outline: 'none',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              data-testid="email-input"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#7891a4', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid rgba(23,53,76,0.09)', fontSize: 13,
                fontFamily: 'DM Sans', outline: 'none',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              data-testid="password-input"
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8,
              background: loading ? '#2e93d9' : '#0e7ec4', color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none', cursor: loading ? 'default' : 'pointer',
              fontFamily: 'DM Sans', transition: 'all 0.15s',
            }}
            data-testid="login-submit-button"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={{ fontSize: 12, color: '#7891a4', textAlign: 'center', marginTop: 16 }}>
            <span onClick={() => navigate('/forgot-password')} style={{ color: '#0e7ec4', fontWeight: 600, cursor: 'pointer' }} data-testid="forgot-password-link">Forgot password?</span>
          </p>

          <p style={{ fontSize: 10, color: '#9db4c4', textAlign: 'center', marginTop: 14 }}>
            Nair & Nelliyatt Chartered Accountants · Practice Management
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
