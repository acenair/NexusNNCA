import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Users, CheckSquare, FileText, Shield, TrendingUp, ArrowUp } from 'lucide-react';

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

  const kpiCards = [
    { label: 'Active Clients', value: stats?.active_clients || 0, icon: Users, color: 'blue' },
    { label: 'Open Tasks', value: stats?.open_tasks || 0, sub: `${stats?.overdue_tasks || 0} overdue`, icon: CheckSquare, color: 'orange' },
    { label: 'Filings This Month', value: stats?.filings_this_month || 0, icon: FileText, color: 'green' },
    { label: 'AML Alerts', value: stats?.aml_alerts || 0, icon: Shield, color: 'red' },
  ];

  const serviceModules = [
    { name: 'VAT Services', path: '/vat/registrations', status: 'Active', badge: 'In Progress' },
    { name: 'Audit Services', path: '/audit/engagements', status: 'Active', badge: 'Fieldwork' },
    { name: 'AML Compliance', path: '/aml/alerts', status: 'Review Needed', badge: 'Action Needed' },
    { name: 'Corporate Services', path: '/clients', status: 'Active', badge: 'Active' },
    { name: 'Advisory', path: '/clients', status: 'Active', badge: 'Active' },
    { name: 'Analytics', path: '/analytics', status: 'Available', badge: 'Active' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }} data-testid="dashboard-heading">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-slate-600 mt-1">Here's what's happening with your compliance work today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-md p-6 hover:-translate-y-1 hover:shadow-sm transition-all duration-200"
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className="text-slate-400" size={24} />
                {kpi.sub && (
                  <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                    {kpi.sub}
                  </span>
                )}
              </div>
              <div className="text-3xl font-light text-slate-900" style={{ fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
                {kpi.value}
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
                {kpi.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Service Modules Grid */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4" style={{ fontFamily: 'Outfit' }}>Service Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {serviceModules.map((module, idx) => (
            <Link
              key={idx}
              to={module.path}
              className="bg-white border border-slate-200 rounded-md p-6 hover:border-slate-300 hover:shadow-sm transition-all duration-200"
              data-testid={`module-${module.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <h3 className="text-lg font-medium text-slate-900 mb-2">{module.name}</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{module.status}</span>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    module.badge === 'Action Needed'
                      ? 'bg-red-50 text-red-700'
                      : module.badge === 'In Progress'
                      ? 'bg-blue-50 text-blue-700'
                      : module.badge === 'Fieldwork'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  {module.badge}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4" style={{ fontFamily: 'Outfit' }}>Recent Activity</h2>
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {activities.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {activities.slice(0, 10).map((activity, idx) => (
                <div key={idx} className="p-4 hover:bg-slate-50 transition-colors" data-testid="activity-item">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-900">{activity.description}</p>
                      {activity.client_name && (
                        <p className="text-xs text-slate-500 mt-1">Client: {activity.client_name}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
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
