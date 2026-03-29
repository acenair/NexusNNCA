import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Tasks = () => {
  const { user } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    service_module: 'VAT',
    due_date: '',
    priority: 'Medium',
    client_id: '',
    description: ''
  });

  useEffect(() => {
    loadTasks();
    loadClients();
  }, [filter]);

  const loadTasks = async () => {
    try {
      const params = filter === 'all' ? {} : { filter: filter === 'my' ? 'my' : filter === 'overdue' ? 'overdue' : 'week' };
      const response = await axios.get(`${API}/tasks`, { params, withCredentials: true });
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
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
    if (submitting) return; // Prevent double submission
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/tasks`, null, {
        params: formData,
        withCredentials: true
      });
      setShowAdd(false);
      setFormData({ title: '', service_module: 'VAT', due_date: '', priority: 'Medium', client_id: '', description: '' });
      await loadTasks();
    } catch (error) {
      console.error('Failed to add task:', error);
      alert('Failed to add task. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (taskId) => {
    try {
      await axios.patch(`${API}/tasks/${taskId}`, null, {
        params: { status: 'Completed' },
        withCredentials: true
      });
      loadTasks();
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }}>Tasks</h1>
          <p className="text-slate-600 mt-1">Manage compliance tasks and deadlines</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700" data-testid="add-task-btn">
              <Plus size={18} className="mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <Label>Task Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  data-testid="task-title-input"
                />
              </div>
              <div>
                <Label>Service Module</Label>
                <Select value={formData.service_module} onValueChange={(val) => setFormData({ ...formData, service_module: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VAT">VAT Services</SelectItem>
                    <SelectItem value="Audit">Audit Services</SelectItem>
                    <SelectItem value="Corporate">Corporate Services</SelectItem>
                    <SelectItem value="AML">AML Compliance</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Client (Optional)</Label>
                <Select value={formData.client_id} onValueChange={(val) => setFormData({ ...formData, client_id: val })}>
                  <SelectTrigger>
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
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  required
                  data-testid="task-due-date-input"
                />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(val) => setFormData({ ...formData, priority: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={submitting} data-testid="task-submit-btn">
                {submitting ? 'Creating Task...' : 'Create Task'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="all" data-testid="tasks-tab-all">All Tasks</TabsTrigger>
          <TabsTrigger value="my" data-testid="tasks-tab-my">My Tasks</TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tasks-tab-overdue">Overdue</TabsTrigger>
          <TabsTrigger value="week" data-testid="tasks-tab-week">Due This Week</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No tasks found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Title</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Service</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tasks.map((task) => {
                const isOverdue = new Date(task.due_date) < new Date() && task.status !== 'Completed';
                return (
                  <tr key={task.task_id} className={`hover:bg-slate-50 transition-colors ${isOverdue ? 'bg-red-50' : ''}`} data-testid="task-row">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{task.title}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{task.service_module}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(task.due_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        task.priority === 'High' ? 'bg-red-50 text-red-700' :
                        task.priority === 'Medium' ? 'bg-orange-50 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        task.status === 'Completed' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {task.status !== 'Completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleComplete(task.task_id)}
                          className="text-xs"
                          data-testid="task-complete-btn"
                        >
                          Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Tasks;
