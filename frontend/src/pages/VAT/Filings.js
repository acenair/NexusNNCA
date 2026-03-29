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

const VATFilings = () => {
  const { user } = useOutletContext();
  const [filings, setFilings] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    tax_period: '',
    period_end_date: '',
    filing_due_date: ''
  });

  useEffect(() => {
    loadFilings();
    loadClients();
  }, []);

  const loadFilings = async () => {
    try {
      const response = await axios.get(`${API}/vat/filings`, { withCredentials: true });
      setFilings(response.data);
    } catch (error) {
      console.error('Failed to load VAT filings:', error);
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
      await axios.post(`${API}/vat/filings`, null, {
        params: formData,
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ client_id: '', tax_period: '', period_end_date: '', filing_due_date: '' });
      loadFilings();
    } catch (error) {
      console.error('Failed to add VAT filing:', error);
    }
  };

  const pending = filings.filter(f => f.status === 'Pending');
  const submitted = filings.filter(f => f.status === 'Submitted');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>VAT Filings</h1>
          <p className="text-slate-600 mt-1">Manage VAT return submissions and filings</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-vat-filing-btn">
              <Plus size={18} className="mr-2" />
              New Filing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New VAT Filing</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Client *</Label>
                <Select value={formData.client_id} onValueChange={(val) => setFormData({ ...formData, client_id: val })} required>
                  <SelectTrigger data-testid="filing-client-select">
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
                <Label>Tax Period *</Label>
                <Input
                  placeholder="Q1 2025"
                  value={formData.tax_period}
                  onChange={(e) => setFormData({ ...formData, tax_period: e.target.value })}
                  required
                  data-testid="filing-period-input"
                />
              </div>
              <div>
                <Label>Period End Date *</Label>
                <Input
                  type="date"
                  value={formData.period_end_date}
                  onChange={(e) => setFormData({ ...formData, period_end_date: e.target.value })}
                  required
                  data-testid="filing-end-date-input"
                />
              </div>
              <div>
                <Label>Filing Due Date *</Label>
                <Input
                  type="date"
                  value={formData.filing_due_date}
                  onChange={(e) => setFormData({ ...formData, filing_due_date: e.target.value })}
                  required
                  data-testid="filing-due-date-input"
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="filing-submit-btn">
                Create Filing
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="submitted">Submitted ({submitted.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : pending.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No pending filings</div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Period End</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pending.map((filing) => (
                    <tr key={filing.filing_id} className="hover:bg-slate-50 transition-colors" data-testid="vat-filing-row">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{filing.client_name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{filing.tax_period}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(filing.period_end_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(filing.filing_due_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 rounded-full">
                          {filing.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="submitted">
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            {submitted.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No submitted filings</div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Period End</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {submitted.map((filing) => (
                    <tr key={filing.filing_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{filing.client_name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{filing.tax_period}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(filing.period_end_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(filing.filing_due_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                          {filing.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VATFilings;
