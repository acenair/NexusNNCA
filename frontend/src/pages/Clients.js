import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Clients = () => {
  const { user } = useOutletContext();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    entity_type: 'LLC',
    jurisdiction: 'Dubai',
    trade_licence_no: '',
    trn: '',
    aml_risk_rating: 'Low'
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const response = await axios.get(`${API}/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/clients`, null, {
        params: formData,
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ name: '', entity_type: 'LLC', jurisdiction: 'Dubai', trade_licence_no: '', trn: '', aml_risk_rating: 'Low' });
      loadClients();
    } catch (error) {
      console.error('Failed to add client:', error);
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.trn?.includes(search) ||
    c.trade_licence_no?.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>Clients</h1>
          <p className="text-slate-600 mt-1">Manage your client companies and entities</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-client-btn">
              <Plus size={18} className="mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Company Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  data-testid="client-name-input"
                />
              </div>
              <div>
                <Label>Entity Type</Label>
                <Select value={formData.entity_type} onValueChange={(val) => setFormData({ ...formData, entity_type: val })}>
                  <SelectTrigger data-testid="client-entity-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LLC">LLC</SelectItem>
                    <SelectItem value="PJSC">PJSC</SelectItem>
                    <SelectItem value="Sole Establishment">Sole Establishment</SelectItem>
                    <SelectItem value="Branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Jurisdiction</Label>
                <Input
                  value={formData.jurisdiction}
                  onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                  data-testid="client-jurisdiction-input"
                />
              </div>
              <div>
                <Label>Trade Licence No</Label>
                <Input
                  value={formData.trade_licence_no}
                  onChange={(e) => setFormData({ ...formData, trade_licence_no: e.target.value })}
                  data-testid="client-licence-input"
                />
              </div>
              <div>
                <Label>TRN (VAT Number)</Label>
                <Input
                  value={formData.trn}
                  onChange={(e) => setFormData({ ...formData, trn: e.target.value })}
                  data-testid="client-trn-input"
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="client-submit-btn">
                Add Client
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, TRN, or licence number..."
          className="pl-10"
          data-testid="client-search-input"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {search ? 'No clients found matching your search' : 'No clients added yet'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client Name</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Entity Type</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">TRN</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Jurisdiction</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredClients.map((client) => (
                <tr key={client.client_id} className="hover:bg-slate-50 transition-colors" data-testid="client-row">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{client.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{client.entity_type}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{client.trn || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{client.jurisdiction || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                      {client.status}
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

export default Clients;
