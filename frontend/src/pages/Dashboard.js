import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Users, AlertTriangle, FileCheck, Shield, ChevronRight, TrendingUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const { user } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, activitiesRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/dashboard/activities`, { withCredentials: true })
      ]);
      
      setStats(statsRes.data);
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  };

  const kpiCards = [
    { 
      label: 'Active Clients', 
      value: stats?.active_clients || 48, 
      sub: '↑ 6 new this month',
      icon: Users, 
      color: '#3b82f6' 
    },
    { 
      label: 'Overdue / Critical', 
      value: stats?.overdue_tasks || 4, 
      sub: '⚠ Immediate action',
      icon: AlertTriangle, 
      color: '#ef4444' 
    },
    { 
      label: 'Filed This Month', 
      value: stats?.filings_this_month || 11, 
      sub: '↑ On track',
      icon: FileCheck, 
      color: '#10b981' 
    },
    { 
      label: 'AML Alerts', 
      value: stats?.aml_alerts || 3, 
      sub: '⚑ Pending review',
      icon: Shield, 
      color: '#f59e0b' 
    },
  ];

  const upcomingDeadlines = [
    { service: 'VAT Return — Mar 2026', client: 'Al Baraka Trading LLC', portal: 'FTA Portal', dueDate: '28 Apr 2026', daysLeft: 32, status: 'pending' },
    { service: 'AML Monthly Review', client: 'Falcon Logistics', portal: 'Internal', dueDate: '10 Apr 2026', daysLeft: 14, status: 'pending' },
    { service: 'Internal Audit Report', client: 'Marina Holdings', portal: 'Client', dueDate: '10 Apr 2026', daysLeft: 14, status: 'pending' },
    { service: 'Statutory Audit — Al Hayat', client: 'Al Hayat Retail', portal: 'Client', dueDate: '10 Apr 2026', daysLeft: 14, status: 'pending' },
    { service: 'Corporate Tax Return', client: 'Gulf Pharma Group', portal: 'FTA Portal', dueDate: '30 Apr 2026', daysLeft: 34, status: 'pending' },
  ];

  const serviceModules = [
    { name: 'VAT Filing', desc: '5 returns due 28 Apr 2026', badge: '5 pending', badgeColor: '#ef4444', path: '/vat/filing' },
    { name: 'AML Compliance', desc: '3 monthly reports due 10 Apr', badge: '3 flagged', badgeColor: '#f59e0b', path: '/aml/review' },
    { name: 'Statutory Audit', desc: '10 engagements in progress', badge: '10 active', badgeColor: '#3b82f6', path: '/audit/statutory' },
    { name: 'Internal Audit', desc: '3 reports due 10 Apr 2026', badge: '3 reports', badgeColor: '#10b981', path: '/audit/internal' },
    { name: 'Corporate Tax', desc: 'UAE CT returns and compliance', badge: '5 active', badgeColor: '#8b5cf6', path: '/corporate/tax' },
    { name: 'Due Diligence', desc: 'Financial & legal pre-transaction', badge: '2 reports', badgeColor: '#06b6d4', path: '/advisory/due-diligence' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#D4AF37' }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{formatDate()} — Nair & Nelliyatt Chartered Accountants</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37' }}>AED | UAE</span>
            <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37' }}>{user?.role === 'partner' ? 'Partner' : 'Staff'}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="rounded-lg p-6 border transition-all hover:border-gold"
              style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon size={24} style={{ color: kpi.color }} />
                {kpi.sub && (
                  <span className="text-xs text-gray-400">{kpi.sub}</span>
                )}
              </div>
              <div className="text-4xl font-light mb-2" style={{ fontFamily: 'DM Serif Display', color: '#ffffff' }}>
                {kpi.value}
              </div>
              <div className="text-xs font-medium uppercase tracking-widest text-gray-400">
                {kpi.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming Deadlines */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium" style={{ fontFamily: 'DM Serif Display', color: '#ffffff' }}>Upcoming Deadlines</h2>
          <Link to="/deadlines" className="text-sm flex items-center gap-1" style={{ color: '#D4AF37' }}>
            View full tracker →
          </Link>
        </div>
        <div className="rounded-lg border overflow-hidden" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          <table className="w-full">
            <thead style={{ background: '#1a2340', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {upcomingDeadlines.map((deadline, idx) => (
                <tr key={idx} className="hover:bg-navy3 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm text-white font-medium">{deadline.service}</div>
                    <div className="text-xs text-gray-400">{deadline.portal}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">{deadline.client}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-white">{deadline.dueDate}</div>
                    <div className="text-xs" style={{ color: deadline.daysLeft <= 14 ? '#ef4444' : '#D4AF37' }}>
                      {deadline.daysLeft} Days
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      Pending
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-sm flex items-center gap-1" style={{ color: '#D4AF37' }}>
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service Modules Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium" style={{ fontFamily: 'DM Serif Display', color: '#ffffff' }}>Service Modules</h2>
          <span className="text-sm text-gray-400">All modules →</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {serviceModules.map((module, idx) => (
            <Link
              key={idx}
              to={module.path}
              className="rounded-lg p-6 border transition-all hover:border-gold"
              style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}
              data-testid={`module-${module.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-medium" style={{ fontFamily: 'DM Serif Display', color: '#ffffff' }}>{module.name}</h3>
                <ChevronRight size={18} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-400 mb-3">{module.desc}</p>
              <span className="px-2 py-1 text-xs rounded font-medium" style={{ background: `${module.badgeColor}15`, color: module.badgeColor }}>
                {module.badge}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'DM Serif Display', color: '#ffffff' }}>Recent Activity</h2>
        <div className="rounded-lg border overflow-hidden" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
          {activities.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No recent activity</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {activities.slice(0, 8).map((activity, idx) => (
                <div key={idx} className="p-4 hover:bg-navy3 transition-colors" data-testid="activity-item">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-2" style={{ background: '#D4AF37' }} />
                    <div className="flex-1">
                      <p className="text-sm text-white">{activity.description}</p>
                      {activity.client_name && (
                        <p className="text-xs text-gray-400 mt-1">Client: {activity.client_name}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
