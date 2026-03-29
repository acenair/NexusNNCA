import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { TrendingUp, Users, CheckSquare, FileText } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Analytics = () => {
  const { user } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API}/analytics/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>Analytics</h1>
        <p className="text-slate-600 mt-1">Firm-wide performance metrics and insights</p>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="text-blue-600" size={24} />
          </div>
          <div className="text-3xl font-light text-slate-900" style={{ fontFamily: 'Outfit' }}>
            {stats?.total_clients || 0}
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
            Total Clients
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <CheckSquare className="text-green-600" size={24} />
          </div>
          <div className="text-3xl font-light text-slate-900" style={{ fontFamily: 'Outfit' }}>
            {stats?.completion_rate || 0}%
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
            Task Completion Rate
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <FileText className="text-orange-600" size={24} />
          </div>
          <div className="text-3xl font-light text-slate-900" style={{ fontFamily: 'Outfit' }}>
            {stats?.vat_filings || 0}
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
            VAT Filings
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="text-purple-600" size={24} />
          </div>
          <div className="text-3xl font-light text-slate-900" style={{ fontFamily: 'Outfit' }}>
            {stats?.audit_engagements || 0}
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
            Audit Engagements
          </div>
        </div>
      </div>

      {/* Service Breakdown */}
      <div className="bg-white border border-slate-200 rounded-md p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'Outfit' }}>Service Module Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">VAT Services</span>
              <span className="text-sm font-bold text-slate-900">{stats?.vat_filings || 0}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Audit Services</span>
              <span className="text-sm font-bold text-slate-900">{stats?.audit_engagements || 0}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '60%' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">AML Compliance</span>
              <span className="text-sm font-bold text-slate-900">{stats?.aml_alerts || 0}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-red-600 h-2 rounded-full" style={{ width: '45%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Task Performance */}
      <div className="bg-white border border-slate-200 rounded-md p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'Outfit' }}>Task Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-600 mb-2">Total Tasks</p>
            <p className="text-2xl font-bold text-slate-900">{stats?.total_tasks || 0}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-2">Completed Tasks</p>
            <p className="text-2xl font-bold text-green-600">{stats?.completed_tasks || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
