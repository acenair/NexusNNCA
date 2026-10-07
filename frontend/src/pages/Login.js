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

  useEffect(() => {
    // Check for pending approval redirect
    if (location.state?.pendingApproval) {
      setPendingMsg(location.state.message || 'Your account is pending admin approval.');
    }
  }, [location.state]);

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
      navigate(role === 'client' ? '/client/documents' : '/app/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0B1526 0%, #10203e 50%, #172d52 100%)',
      position: 'relative', overflow: 'hidden',
    }} data-testid="login-page">
      {/* Decorative circle */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(201,168,76,0.03)', top: '-200px', right: '-200px' }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(201,168,76,0.02)', bottom: '-150px', left: '-100px' }} />

      <div style={{ width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, background: 'var(--gold)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', color: '#0B1526',
            fontFamily: 'DM Serif Display', fontSize: 20, fontWeight: 700, marginBottom: 12,
          }}>
            N&N
          </div>
          <h1 style={{ fontFamily: 'DM Serif Display', color: '#C9A84C', fontSize: 24, marginBottom: 4 }}>Nair & Nelliyatt</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>CHARTERED ACCOUNTANTS</p>
        </div>

        {/* Login Card */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: '28px 30px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.25)',
        }}>
          <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 18, color: '#0B1526', marginBottom: 4 }}>Welcome Back</h2>
          <p style={{ fontSize: 12, color: '#60718a', marginBottom: 20 }}>Sign in to your practice management dashboard</p>

          {pendingMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', color: '#92400e', fontSize: 12, marginBottom: 14, fontWeight: 500, border: '1px solid rgba(245,158,11,0.2)' }} data-testid="pending-msg">
              {pendingMsg}
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12, marginBottom: 14, fontWeight: 500 }} data-testid="login-error">
              {error}
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Email</label>
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
                border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13,
                fontFamily: 'DM Sans', outline: 'none',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              data-testid="email-input"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13,
                fontFamily: 'DM Sans', outline: 'none',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              data-testid="password-input"
            />
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8,
              background: loading ? '#dfc06a' : '#C9A84C', color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none', cursor: loading ? 'default' : 'pointer',
              fontFamily: 'DM Sans', transition: 'all 0.15s',
            }}
            data-testid="login-btn"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(11,21,38,0.08)' }} />
            <span style={{ fontSize: 11, color: '#9eafc0' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(11,21,38,0.08)' }} />
          </div>

          {/* Google Sign In */}
          <button
            onClick={() => {
              // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
              const redirectUrl = window.location.origin + '/app/dashboard';
              window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
            }}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 8,
              background: '#fff', color: '#334155',
              fontSize: 13, fontWeight: 600, border: '1.5px solid rgba(11,21,38,0.12)', cursor: 'pointer',
              fontFamily: 'DM Sans', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            data-testid="google-signin-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <p style={{ fontSize: 10, color: '#9eafc0', textAlign: 'center', marginTop: 14 }}>
            Nair & Nelliyatt Chartered Accountants · Practice Management
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
