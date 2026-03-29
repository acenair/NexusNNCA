import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuditEngagements = () => {
  const { user } = useOutletContext();
  const [engagements, setEngagements] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [formData, setFormData] = useState({
    client_id: '',
    engagement_type: 'Statutory Audit',
    period_start: '',
    period_end: '',
    lead_auditor: ''
  });

  useEffect(() => {
    loadEngagements();
    loadClients();
  }, [selectedType]);

  const loadEngagements = async () => {
    try {
      const params = selectedType !== 'all' ? { engagement_type: selectedType } : {};
      const response = await axios.get(`${API}/audit/engagements`, { params, withCredentials: true });
      setEngagements(response.data);
    } catch (error) {
      console.error('Failed to load audit engagements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const response = await axios.get(`${API}/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/audit/engagements`, null, {
        params: { ...formData, lead_auditor: user.name },
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ client_id: '', engagement_type: 'Statutory Audit', period_start: '', period_end: '', lead_auditor: '' });
      loadEngagements();
    } catch (error) {
      console.error('Failed to add audit engagement:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>Audit Engagements</h1>
          <p className="text-slate-600 mt-1">Manage audit engagements and fieldwork</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-audit-engagement-btn">
              <Plus size={18} className="mr-2" />
              New Engagement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Audit Engagement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Client *</Label>
                <Select value={formData.client_id} onValueChange={(val) => setFormData({ ...formData, client_id: val })} required>
                  <SelectTrigger data-testid="audit-client-select">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.client_id} value={c.client_id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audit Type *</Label>
                <Select value={formData.engagement_type} onValueChange={(val) => setFormData({ ...formData, engagement_type: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Statutory Audit">Statutory Audit</SelectItem>
                    <SelectItem value="Internal Audit">Internal Audit</SelectItem>
                    <SelectItem value="Stock Audit">Stock Audit</SelectItem>
                    <SelectItem value="Fraud Audit">Fraud Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period Start *</Label>
                <Input
                  type="date"
                  value={formData.period_start}
                  onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  required
                  data-testid="audit-start-date-input"
                />
              </div>
              <div>
                <Label>Period End *</Label>
                <Input
                  type="date"
                  value={formData.period_end}
                  onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  required
                  data-testid="audit-end-date-input"
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="audit-submit-btn">
                Create Engagement
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="Statutory Audit">Statutory</TabsTrigger>
          <TabsTrigger value="Internal Audit">Internal</TabsTrigger>
          <TabsTrigger value="Stock Audit">Stock</TabsTrigger>
          <TabsTrigger value="Fraud Audit">Fraud</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : engagements.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No audit engagements yet</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Period</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Lead Auditor</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Phase</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Risk</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {engagements.map((engagement) => (
                <tr key={engagement.engagement_id} className="hover:bg-slate-50 transition-colors" data-testid="audit-engagement-row">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{engagement.client_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{engagement.engagement_type}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(engagement.period_start).toLocaleDateString()} - {new Date(engagement.period_end).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{engagement.lead_auditor}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                      {engagement.phase}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      engagement.risk_level === 'High' ? 'bg-red-50 text-red-700' :
                      engagement.risk_level === 'Medium' ? 'bg-orange-50 text-orange-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {engagement.risk_level}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                      {engagement.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditEngagements;
