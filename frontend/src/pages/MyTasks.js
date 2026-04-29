import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle, Clock, AlertTriangle, Filter, ChevronDown } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUSES = ['All', 'Pending', 'In Progress', 'Completed', 'Overdue'];
const PRIORITIES = ['All', 'High', 'Medium', 'Low'];

const MyTasks = () => {
  const { user } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterStaff, setFilterStaff] = useState('');
  const [staffList, setStaffList] = useState([]);

  const isPartner = user?.role === 'partner';

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try {
      const res = await axios.get(`${API}/tasks`, { withCredentials: true });
      setTasks(res.data);
      if (isPartner) {
        const staffRes = await axios.get(`${API}/auth/users-list`);
        setStaffList(staffRes.data.filter(u => u.role === 'staff'));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    let list = [...tasks];
    // Staff see only their tasks
    if (!isPartner) {
      list = list.filter(t => t.assigned_to === user?.email);
    } else if (filterStaff) {
      list = list.filter(t => t.assigned_to === filterStaff);
    }
    if (filterStatus !== 'All') {
      list = list.filter(t => t.status === filterStatus);
    }
    if (filterPriority !== 'All') {
      list = list.filter(t => t.priority === filterPriority);
    }
    // Sort: Overdue first, then by due_date
    list.sort((a, b) => {
      const sa = a.status === 'Completed' ? 2 : 0;
      const sb = b.status === 'Completed' ? 2 : 0;
      if (sa !== sb) return sa - sb;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });
    return list;
  }, [tasks, filterStatus, filterPriority, filterStaff, isPartner, user]);

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await axios.patch(`${API}/tasks/${task.task_id}`, { status: newStatus }, { withCredentials: true });
      setTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, status: newStatus } : t));
    } catch (e) { console.error(e); }
  };

  const statusBadge = (status) => {
    const map = {
      'Completed': { bg: 'var(--green-bg)', color: 'var(--green)', icon: CheckCircle },
      'In Progress': { bg: 'var(--blue-bg)', color: 'var(--blue, #3b82f6)', icon: Clock },
      'Overdue': { bg: 'var(--red-bg)', color: 'var(--red)', icon: AlertTriangle },
      'Pending': { bg: 'var(--off)', color: 'var(--muted)', icon: Clock },
    };
    const s = map[status] || map['Pending'];
    const Icon = s.icon;
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: s.bg, color: s.color }}><Icon size={10} /> {status}</span>;
  };

  const priorityDot = (p) => {
    const colors = { High: 'var(--red)', Medium: 'var(--gold)', Low: 'var(--green)' };
    return <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[p] || 'var(--muted)', display: 'inline-block' }} />;
  };

  const isOverdue = (task) => {
    if (task.status === 'Completed' || !task.due_date) return false;
    try {
      return new Date(task.due_date) < new Date();
    } catch { return false; }
  };

  const stats = useMemo(() => {
    const myTasks = isPartner ? tasks : tasks.filter(t => t.assigned_to === user?.email);
    return {
      total: myTasks.length,
      completed: myTasks.filter(t => t.status === 'Completed').length,
      overdue: myTasks.filter(t => isOverdue(t)).length,
      inProgress: myTasks.filter(t => t.status === 'In Progress').length,
    };
  }, [tasks, isPartner, user]);

  // Group tasks by staff for partner view
  const groupedByStaff = useMemo(() => {
    if (!isPartner || filterStaff) return null;
    const groups = {};
    filtered.forEach(t => {
      const key = t.assigned_to_name || t.assigned_to || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered, isPartner, filterStaff]);

  return (
    <div className="fade-in" data-testid="my-tasks-view">
      {/* Header */}
      <div className="nn-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy3) 100%)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'DM Serif Display', fontSize: 18 }}>{isPartner ? 'All Tasks' : 'My Tasks'}</h2>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{isPartner ? 'View and manage tasks across all team members' : 'Your assigned tasks and deadlines'}</div>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { label: 'Total', value: stats.total, color: 'var(--gold)' },
                { label: 'Done', value: stats.completed, color: 'var(--green)' },
                { label: 'Overdue', value: stats.overdue, color: 'var(--red)' },
                { label: 'Active', value: stats.inProgress, color: 'var(--blue, #3b82f6)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'DM Serif Display' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-status">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-priority">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {isPartner && (
              <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' }} data-testid="filter-staff">
                <option value="">All Staff</option>
                {staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <div className="nn-card" style={{ padding: 40, textAlign: 'center' }}>
          <CheckCircle size={36} color="var(--green)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{filterStatus !== 'All' || filterPriority !== 'All' || filterStaff ? 'No tasks match filters' : 'All clear!'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>No pending tasks to show.</div>
        </div>
      ) : isPartner && groupedByStaff ? (
        // Partner view: grouped by staff
        Object.entries(groupedByStaff).map(([staffName, staffTasks]) => (
          <div key={staffName} className="nn-card" style={{ overflow: 'hidden', marginBottom: 12 }} data-testid={`staff-group-${staffName}`}>
            <div style={{ padding: '10px 16px', background: 'var(--off)', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: 10, fontWeight: 700 }}>{staffName.charAt(0)}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{staffName}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>{staffTasks.filter(t => t.status === 'Completed').length} done</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{staffTasks.length} total</span>
              </div>
            </div>
            {staffTasks.map(task => (
              <TaskRow key={task.task_id} task={task} isOverdue={isOverdue(task)} onToggle={toggleStatus} statusBadge={statusBadge} priorityDot={priorityDot} showClient />
            ))}
          </div>
        ))
      ) : (
        // Staff view or filtered partner view: flat list
        <div className="nn-card" style={{ overflow: 'hidden' }}>
          {filtered.map(task => (
            <TaskRow key={task.task_id} task={task} isOverdue={isOverdue(task)} onToggle={toggleStatus} statusBadge={statusBadge} priorityDot={priorityDot} showClient showAssignee={isPartner} />
          ))}
        </div>
      )}
    </div>
  );
};

const TaskRow = ({ task, isOverdue, onToggle, statusBadge, priorityDot, showClient, showAssignee }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--nn-border)', background: isOverdue ? 'rgba(239,68,68,0.02)' : 'transparent' }} data-testid={`task-${task.task_id}`}>
    {/* Checkbox */}
    <div
      onClick={() => onToggle(task)}
      style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${task.status === 'Completed' ? 'var(--green)' : isOverdue ? 'var(--red)' : 'var(--nn-border)'}`, background: task.status === 'Completed' ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
      data-testid={`toggle-${task.task_id}`}
    >
      {task.status === 'Completed' && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✓</span>}
    </div>

    {/* Task info */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: task.status === 'Completed' ? 'var(--muted)' : 'var(--text)', textDecoration: task.status === 'Completed' ? 'line-through' : 'none' }}>{task.title}</span>
        {task.priority && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--muted)' }}>{priorityDot(task.priority)} {task.priority}</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
        {showClient && task.client_name && <span style={{ fontSize: 10, color: 'var(--gold4)' }}>{task.client_name}</span>}
        {showAssignee && task.assigned_to_name && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{task.assigned_to_name}</span>}
        {task.due_date && <span style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400 }}>Due: {new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
      </div>
    </div>

    {/* Status */}
    {statusBadge(isOverdue && task.status !== 'Completed' ? 'Overdue' : task.status)}
  </div>
);

export default MyTasks;
