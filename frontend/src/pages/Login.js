import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('partner');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const partners = [
    { email: 'arjun@nairnelliyatt.ae', name: 'Arjun Srinivas', title: 'Managing Partner' },
    { email: 'sooraj@nairnelliyatt.ae', name: 'Sooraj Nelliyatt', title: 'Partner' }
  ];

  const staff = ['Fazil', 'Subin', 'Anju', 'Roshith', 'Thasleema', 'Jithin', 'Shamil Aflah', 'Akhil', 'Haritha'];

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const email = activeTab === 'partner' ? partnerEmail : `${staffName.toLowerCase().replace(' ', '.')}@nairnelliyatt.ae`;
      
      const response = await axios.post(`${API}/auth/login`, null, {
        params: { email, password }
      });
      
      document.cookie = `session_token=${response.data.session_token}; path=/; secure; samesite=none; max-age=604800`;
      navigate('/dashboard', { state: { user: response.data } });
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0a1128 0%, #1a2340 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'DM Serif Display', color: '#D4AF37' }}>Nair & Nelliyatt</h1>
          <p className="text-gray-400" style={{ fontFamily: 'DM Sans' }}>Chartered Accountants</p>
          <p className="text-sm text-gray-500 mt-1">Practice Management Suite</p>
        </div>

        <div className="bg-navy2 rounded-lg border border-gray-800 shadow-2xl p-8" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6" style={{ background: '#1a2340' }}>
              <TabsTrigger value="partner" data-testid="partner-tab" style={{ color: activeTab === 'partner' ? '#D4AF37' : '#8892a6' }}>Partner Login</TabsTrigger>
              <TabsTrigger value="staff" data-testid="staff-tab" style={{ color: activeTab === 'staff' ? '#D4AF37' : '#8892a6' }}>Staff Login</TabsTrigger>
            </TabsList>

            <TabsContent value="partner">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">Select Partner</Label>
                  <Select value={partnerEmail} onValueChange={setPartnerEmail} required>
                    <SelectTrigger className="mt-1 bg-navy3 border-gray-700 text-white" data-testid="partner-select">
                      <SelectValue placeholder="— Select —" />
                    </SelectTrigger>
                    <SelectContent className="bg-navy2 border-gray-700">
                      {partners.map((p) => (
                        <SelectItem key={p.email} value={p.email} className="text-white hover:bg-navy3">
                          {p.name} — {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="partner-password" className="text-gray-300 text-sm font-medium">Password</Label>
                  <Input
                    id="partner-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="mt-1 bg-navy3 border-gray-700 text-white"
                    data-testid="partner-password"
                  />
                </div>
                <div className="text-xs text-gray-500 bg-navy3 p-3 rounded" style={{ background: 'rgba(212,175,55,0.05)' }}>
                  <strong className="text-gold">Demo credentials:</strong><br />
                  Arjun Srinivas → password: <strong className="text-white">arjun123</strong><br />
                  Sooraj Nelliyatt → password: <strong className="text-white">sooraj123</strong>
                </div>
                {error && <p className="text-sm text-red-400" data-testid="login-error">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading} data-testid="partner-login-btn" style={{ background: '#D4AF37', color: '#0a1128', fontWeight: 600 }}>
                  {loading ? 'Signing in...' : 'Sign In as Partner'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="staff">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">Select Your Name</Label>
                  <Select value={staffName} onValueChange={setStaffName} required>
                    <SelectTrigger className="mt-1 bg-navy3 border-gray-700 text-white" data-testid="staff-select">
                      <SelectValue placeholder="— Select —" />
                    </SelectTrigger>
                    <SelectContent className="bg-navy2 border-gray-700">
                      {staff.map((name) => (
                        <SelectItem key={name} value={name} className="text-white hover:bg-navy3">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="staff-password" className="text-gray-300 text-sm font-medium">Password</Label>
                  <Input
                    id="staff-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="mt-1 bg-navy3 border-gray-700 text-white"
                    data-testid="staff-password"
                  />
                </div>
                <div className="text-xs text-gray-500 bg-navy3 p-3 rounded" style={{ background: 'rgba(212,175,55,0.05)' }}>
                  <strong className="text-gold">Demo:</strong> Select any name, password: <strong className="text-white">staff123</strong>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading} data-testid="staff-login-btn" style={{ background: '#D4AF37', color: '#0a1128', fontWeight: 600 }}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Login;
