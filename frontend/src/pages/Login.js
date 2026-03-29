import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const [step, setStep] = useState('select');
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await axios.get(`${API}/auth/users-list`);
      setUsers(res.data);
    } catch (err) {
      setUsers([
        { name: 'Arjun Srinivas', email: 'arjun@nnadvisory.ae', role: 'partner', title: 'Managing Partner' },
        { name: 'Sooraj Nelliyatt', email: 'sooraj@nnadvisory.ae', role: 'partner', title: 'Senior Partner' },
        { name: 'Fazil', email: 'fazil@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Subin', email: 'subin@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Anju', email: 'anju@nnadvisory.ae', role: 'staff', title: 'Senior Associate' },
        { name: 'Roshith', email: 'roshith@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Thasleema', email: 'thasleema@nnadvisory.ae', role: 'staff', title: 'Senior Associate' },
        { name: 'Jithin', email: 'jithin@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Shamil A.', email: 'shamil@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Akhil', email: 'akhil@nnadvisory.ae', role: 'staff', title: 'Associate' },
        { name: 'Haritha', email: 'haritha@nnadvisory.ae', role: 'staff', title: 'Senior Associate' },
      ]);
    }
  };

  const partners = users.filter(u => u.role === 'partner');
  const staff = users.filter(u => u.role === 'staff');

  const handleLogin = async () => {
    if (!selectedUser || !password) {
      setError('Please select a user and enter password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = users.find(u => u.email === selectedUser);
      const res = await axios.post(`${API}/auth/login`, {
        email: selectedUser,
        password: password,
      }, { withCredentials: true });
      if (res.data.session_token) {
        document.cookie = `session_token=${res.data.session_token}; path=/; max-age=86400`;
      }
      navigate('/dashboard');
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

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12, marginBottom: 14, fontWeight: 500 }} data-testid="login-error">
              {error}
            </div>
          )}

          {/* Role Section Selection */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Select User</label>

            {/* Partners */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#C9A84C', marginBottom: 4 }}>Partners</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {partners.map((p) => (
                  <button
                    key={p.email}
                    onClick={() => setSelectedUser(p.email)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8,
                      border: selectedUser === p.email ? '2px solid #C9A84C' : '1.5px solid rgba(11,21,38,0.09)',
                      background: selectedUser === p.email ? '#faf5e8' : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                      fontFamily: 'DM Sans',
                    }}
                    data-testid={`user-${p.email.split('@')[0]}`}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: '#C9A84C', color: '#0B1526',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 12, margin: '0 auto 4px',
                    }}>
                      {p.name.charAt(0)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1526' }}>{p.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 9, color: '#60718a' }}>{p.title}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Staff */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#60718a', marginBottom: 4 }}>Staff</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {staff.map((s) => (
                  <button
                    key={s.email}
                    onClick={() => setSelectedUser(s.email)}
                    style={{
                      padding: '7px 6px', borderRadius: 6,
                      border: selectedUser === s.email ? '2px solid #C9A84C' : '1.5px solid rgba(11,21,38,0.09)',
                      background: selectedUser === s.email ? '#faf5e8' : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                      fontFamily: 'DM Sans',
                    }}
                    data-testid={`user-${s.email.split('@')[0]}`}
                  >
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#0B1526' }}>{s.name}</div>
                    <div style={{ fontSize: 9, color: '#60718a' }}>{s.title}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#60718a', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid rgba(11,21,38,0.09)', fontSize: 13,
                fontFamily: 'DM Sans', outline: 'none',
                transition: 'border-color 0.15s',
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

          <p style={{ fontSize: 10, color: '#9eafc0', textAlign: 'center', marginTop: 14 }}>
            Nair & Nelliyatt Chartered Accountants · Practice Management
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
