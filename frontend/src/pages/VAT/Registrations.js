import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VATRegistrations = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    annual_turnover: '',
    registration_type: 'Mandatory'
  });

  useEffect(() => {
    loadRegistrations();
    loadClients();
  }, []);

  const loadRegistrations = async () => {
    try {
      const response = await axios.get(`${API}/vat/registrations`, { withCredentials: true });
      setRegistrations(response.data);
    } catch (error) {
      console.error('Failed to load VAT registrations:', error);
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
      await axios.post(`${API}/vat/registrations`, null, {
        params: formData,
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ client_id: '', annual_turnover: '', registration_type: 'Mandatory' });
      loadRegistrations();
    } catch (error) {
      console.error('Failed to add VAT registration:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>VAT Registrations</h1>
          <p className="text-slate-600 mt-1">UAE VAT registration pipeline and applications</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => navigate('/vat/registration-workflow')} 
            className="bg-green-600 hover:bg-green-700"
            data-testid="start-workflow-btn"
          >
            Start FTA Workflow
          </Button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-vat-registration-btn">
                <Plus size={18} className="mr-2" />
                New Registration
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>New VAT Registration</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Client *</Label>
                <Select value={formData.client_id} onValueChange={(val) => setFormData({ ...formData, client_id: val })} required>
                  <SelectTrigger data-testid="vat-client-select">
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
                <Label>Annual Turnover (AED) *</Label>
                <Input
                  type="number"
                  value={formData.annual_turnover}
                  onChange={(e) => setFormData({ ...formData, annual_turnover: e.target.value })}
                  required
                  data-testid="vat-turnover-input"
                />
              </div>
              <div>
                <Label>Registration Type</Label>
                <Select value={formData.registration_type} onValueChange={(val) => setFormData({ ...formData, registration_type: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mandatory">Mandatory (≥ AED 375,000)</SelectItem>
                    <SelectItem value="Voluntary">Voluntary (≥ AED 187,500)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="vat-submit-btn">
                Create Registration
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : registrations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No VAT registrations yet</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client Name</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Turnover (AED)</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {registrations.map((reg) => (
                <tr key={reg.registration_id} className="hover:bg-slate-50 transition-colors" data-testid="vat-registration-row">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{reg.client_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{reg.annual_turnover?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{reg.registration_type}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                      {reg.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(reg.created_at).toLocaleDateString()}
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

export default VATRegistrations;
