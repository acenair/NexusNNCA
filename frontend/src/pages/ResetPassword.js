import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ResetPassword = () => {
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError('');
    if (!email || !resetCode || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/reset-password`, {
        email: email.trim().toLowerCase(), reset_code: resetCode.trim(), new_password: newPassword,
      });
      if (res.data.session_token) {
        document.cookie = `session_token=${res.data.session_token}; path=/; max-age=604800; secure; samesite=lax`;
        localStorage.setItem('session_token', res.data.session_token);
      }
      const role = res.data.role || 'staff';
      navigate(role === 'client' ? '/client/documents' : '/app/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0B1526 0%, #10203e 50%, #172d52 100%)',
      position: 'relative', overflow: 'hidden',
    }} data-testid="reset-password-page">
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(201,168,76,0.03)', top: '-200px', right: '-200px' }} />

      <div style={{ width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--gold)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0B1526', fontFamily: 'DM Serif Display', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>N&N</div>
          <h1 style={{ fontFamily: 'DM Serif Display', color: '#C9A84C', fontSize: 24, marginBottom: 4 }}>Nair & Nelliyatt</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>CHARTERED ACCOUNTANTS</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', boxShadow: '0 16px 64px rgba(0,0,0,0.25)' }}>
          <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 18, color: '#0B1526', marginBottom: 4 }}>Reset Password</h2>
          <p style={{ fontSize: 12, color: '#60718a', marginBottom: 20 }}>Enter the one-time code a partner relayed to you, and choose a new password.</p>

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12, marginBottom: 14, fontWeight: 500 }} data-testid="reset-password-error">{error}</div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@nnadvisory.ae" autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box' }}
              data-testid="reset-email-input" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Reset Code</label>
            <input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code" maxLength={6}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box', letterSpacing: 2 }}
              data-testid="reset-code-input" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 10 characters" autoComplete="new-password"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box' }}
              data-testid="reset-new-password-input" />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box' }}
              data-testid="reset-confirm-password-input" />
          </div>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', padding: '11px 0', borderRadius: 8, background: loading ? '#dfc06a' : '#C9A84C', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans' }}
            data-testid="reset-password-submit-btn">
            {loading ? 'Updating...' : 'Reset Password'}
          </button>

          <p style={{ fontSize: 12, color: '#60718a', textAlign: 'center', marginTop: 16 }}>
            <span onClick={() => navigate('/login')} style={{ color: '#C9A84C', fontWeight: 600, cursor: 'pointer' }} data-testid="back-to-login-link">Back to Login</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
