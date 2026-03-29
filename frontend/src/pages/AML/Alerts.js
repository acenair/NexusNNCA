import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AMLAlerts = () => {
  const { user } = useOutletContext();
  const [alerts, setAlerts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewStatus, setReviewStatus] = useState('Cleared');
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    flag_reason: ''
  });

  useEffect(() => {
    loadAlerts();
    loadClients();
  }, []);

  const loadAlerts = async () => {
    try {
      const response = await axios.get(`${API}/aml/alerts`, { withCredentials: true });
      setAlerts(response.data);
    } catch (error) {
      console.error('Failed to load AML alerts:', error);
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
      await axios.post(`${API}/aml/alerts`, null, {
        params: formData,
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ client_id: '', amount: '', flag_reason: '' });
      loadAlerts();
    } catch (error) {
      console.error('Failed to add AML alert:', error);
    }
  };

  const handleReview = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API}/aml/alerts/${selectedAlert.alert_id}`, null, {
        params: { status: reviewStatus, notes: reviewNotes },
        withCredentials: true
      });
      setShowReview(false);
      setSelectedAlert(null);
      setReviewNotes('');
      loadAlerts();
    } catch (error) {
      console.error('Failed to update AML alert:', error);
    }
  };

  const openReview = (alert) => {
    setSelectedAlert(alert);
    setShowReview(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>AML Alerts</h1>
          <p className="text-slate-600 mt-1">Monitor and review flagged transactions</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-aml-alert-btn">
              <Plus size={18} className="mr-2" />
              Flag Transaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Flag New Transaction</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Client *</Label>
                <Select value={formData.client_id} onValueChange={(val) => setFormData({ ...formData, client_id: val })} required>
                  <SelectTrigger data-testid="aml-client-select">
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
                <Label>Amount (AED) *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  data-testid="aml-amount-input"
                />
              </div>
              <div>
                <Label>Flag Reason *</Label>
                <Input
                  value={formData.flag_reason}
                  onChange={(e) => setFormData({ ...formData, flag_reason: e.target.value })}
                  placeholder="e.g., Exceeds threshold, Unusual pattern"
                  required
                  data-testid="aml-reason-input"
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="aml-submit-btn">
                Flag Transaction
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review AML Alert</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReview} className="space-y-4 mt-4">
            {selectedAlert && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                <p className="text-sm text-slate-600"><strong>Client:</strong> {selectedAlert.client_name}</p>
                <p className="text-sm text-slate-600 mt-1"><strong>Amount:</strong> AED {selectedAlert.amount?.toLocaleString()}</p>
                <p className="text-sm text-slate-600 mt-1"><strong>Reason:</strong> {selectedAlert.flag_reason}</p>
                <p className="text-sm text-slate-600 mt-1"><strong>Risk Score:</strong> {selectedAlert.risk_score}</p>
              </div>
            )}
            <div>
              <Label>Review Status *</Label>
              <Select value={reviewStatus} onValueChange={setReviewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cleared">Clear - No Suspicion</SelectItem>
                  <SelectItem value="Escalated">Escalate to MLRO</SelectItem>
                  <SelectItem value="SAR Filed">File SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Review Notes *</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter your review notes..."
                required
                rows={4}
                data-testid="aml-review-notes"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" data-testid="aml-review-submit-btn">
              Submit Review
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No AML alerts</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Transaction ID</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Amount (AED)</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Flag Reason</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Risk Score</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {alerts.map((alert) => (
                <tr key={alert.alert_id} className="hover:bg-slate-50 transition-colors" data-testid="aml-alert-row">
                  <td className="px-6 py-4 text-sm font-mono text-slate-600">{alert.transaction_id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{alert.client_name}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-900">{alert.amount?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{alert.flag_reason}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      alert.risk_score >= 70 ? 'bg-red-50 text-red-700' :
                      alert.risk_score >= 40 ? 'bg-orange-50 text-orange-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {alert.risk_score}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      alert.status === 'Flagged' ? 'bg-red-50 text-red-700' :
                      alert.status === 'Cleared' ? 'bg-green-50 text-green-700' :
                      'bg-orange-50 text-orange-700'
                    }`}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {alert.status === 'Flagged' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReview(alert)}
                        className="text-xs"
                        data-testid="aml-review-btn"
                      >
                        Review
                      </Button>
                    )}
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

export default AMLAlerts;
