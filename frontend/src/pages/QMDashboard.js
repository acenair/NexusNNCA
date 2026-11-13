import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Shield, Clock, GraduationCap, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function QMDashboard() {
  const { user } = useOutletContext();
  const [dash, setDash] = useState(null);
  const [tab, setTab] = useState('independence');
  const [records, setRecords] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState({});

  const load = async () => {
    const [d, r] = await Promise.all([
      axios.get(`${API}/qm/dashboard`, { withCredentials: true }),
      axios.get(`${API}/qm/records`, { withCredentials: true }),
    ]);
    setDash(d.data);
    setRecords(r.data.records || []);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  useEffect(() => {
    axios.get(`${API}/auth/users-list`, { withCredentials: true }).then(r => setStaffList(r.data.filter(u => u.role !== 'client'))).catch(() => {});
  }, []);

  const add = async (kind, extra = {}) => {
    try {
      await axios.post(`${API}/qm/records`, { kind, ...extra }, { withCredentials: true });
      setForm({});
      await load();
    } catch (e) { alert('Could not save'); }
  };
  const del = async (id) => {
    await axios.delete(`${API}/qm/records/${id}`, { withCredentials: true });
    await load();
  };

  const cardHead = (title, icon, sub) => (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--nn-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}<div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Sans' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div></div>
    </div>
  );

  return (
    <div className="fade-in" data-testid="qm-page">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--blue)', fontWeight: 700 }}>FIRM MANAGEMENT · ISQM 1</div>
        <h1 style={{ margin: '4px 0', fontSize: 26, letterSpacing: -0.5, color: 'var(--text)' }}>Quality management</h1>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Independence declarations, monitoring reviews and CPD — the evidence an MOE quality-assurance inspection asks for. FY {dash?.year || ''}</p>
      </div>

      {dash && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }} data-testid="qm-summary">
          <div className="nn-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Independence</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: dash.independence.missing ? 'var(--gold)' : 'var(--green)', marginTop: 4 }}>
              {dash.independence.missing ? `${dash.independence.missing} missing` : 'Complete'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{dash.independence.declared}/{dash.independence.active_audits} active audits declared</div>
          </div>
          <div className="nn-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Monitoring</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: dash.monitoring.open_findings ? 'var(--gold)' : 'var(--green)', marginTop: 4 }}>
              {dash.monitoring.open_findings ? `${dash.monitoring.open_findings} open` : 'All actioned'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{dash.monitoring.total} review records FY{dash.year}</div>
          </div>
          <div className="nn-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>CPD</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
              {dash.cpd.filter(c => !c.ok).length} staff below target
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>target {dash.cpd[0]?.target || 40}h/year each</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--nn-border)' }}>
        {[['independence', 'Independence declarations', Shield], ['monitoring', 'Monitoring & reviews', Clock], ['cpd', 'CPD log', GraduationCap]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`qm-tab-${k}`}
            style={{ padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: tab === k ? 700 : 400, color: tab === k ? 'var(--blue)' : 'var(--muted)', borderBottom: tab === k ? '2px solid var(--blue)' : '2px solid transparent' }}>
            <Icon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />{label}
          </button>
        ))}
      </div>

      {tab === 'independence' && (
        <div className="nn-card" style={{ padding: 18 }} data-testid="qm-independence-card">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Annual independence + client-acceptance declaration per engagement (ISA 220 / ISQM 1). One per active audit.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input placeholder="Engagement ref (eng_…)" value={form.engagement_ref || ''} onChange={e => setForm({ ...form, engagement_ref: e.target.value })} data-testid="qm-ind-eng" style={{ flex: 1, minWidth: 160, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }} />
            <select value={form.staff_name || ''} onChange={e => setForm({ ...form, staff_name: e.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }}>
              <option value="">Declared by…</option>
              {staffList.map(s => <option key={s.user_id} value={s.name}>{s.name}</option>)}
            </select>
            <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} data-testid="qm-ind-add"
              onClick={() => add('independence', { engagement_ref: form.engagement_ref, staff_name: form.staff_name, title: 'Independence & acceptance declaration', detail: 'No conflicts of interest; acceptance/continuance confirmed for the current period.' })}>
              <Plus size={11} /> Record declaration
            </button>
          </div>
          {records.filter(r => r.kind === 'independence').map(r => (
            <div key={r.qm_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text)' }}><b>{r.staff_name}</b> · {r.engagement_ref} · {new Date(r.created_at).toLocaleDateString()}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => del(r.qm_id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'monitoring' && (
        <div className="nn-card" style={{ padding: 18 }} data-testid="qm-monitoring-card">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>File inspections, EQ reviews and engagement-level partner reviews with findings and remediation actions.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input placeholder="Review title (e.g. 'FY26 file inspection — Falcon')" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="qm-mon-title" style={{ flex: 2, minWidth: 220, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }} />
            <input placeholder="Findings / actions" value={form.detail || ''} onChange={e => setForm({ ...form, detail: e.target.value })} style={{ flex: 2, minWidth: 220, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }} />
            <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} data-testid="qm-mon-add"
              onClick={() => add('monitoring', { title: form.title, detail: form.detail, status: 'Open finding' })}>
              <Plus size={11} /> Log review
            </button>
          </div>
          {records.filter(r => r.kind === 'monitoring').map(r => (
            <div key={r.qm_id} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--off)', border: `1px solid ${r.status === 'Open finding' ? 'var(--gold)' : 'var(--nn-border)'}`, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{r.title}</b>
                <span style={{ fontSize: 10.5, color: r.status === 'Open finding' ? 'var(--gold)' : 'var(--green)' }}>{r.status}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => del(r.qm_id)}>✕</button>
              </div>
              {r.detail && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{r.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'cpd' && (
        <div className="nn-card" style={{ padding: 18 }} data-testid="qm-cpd-card">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>CPD hours per staff member — target 40h/year (MOE ongoing-development requirement).</div>
          {(dash?.cpd || []).map(c => (
            <div key={c.staff} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--off)', border: '1px solid var(--nn-border)', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1 }}>{c.staff}</span>
              <div style={{ width: 160, height: 6, borderRadius: 3, background: 'var(--nn-border)' }}>
                <div style={{ width: `${Math.min(100, c.hours / c.target * 100)}%`, height: '100%', borderRadius: 3, background: c.ok ? 'var(--green)' : 'var(--gold)' }} />
              </div>
              <span style={{ fontSize: 11.5, color: c.ok ? 'var(--green)' : 'var(--gold)', fontWeight: 600, width: 90, textAlign: 'right' }}>{c.hours}h / {c.target}h</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <select value={form.staff_name || ''} onChange={e => setForm({ ...form, staff_name: e.target.value })} data-testid="qm-cpd-staff" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }}>
              <option value="">Staff member…</option>
              {staffList.map(s => <option key={s.user_id} value={s.name}>{s.name}</option>)}
            </select>
            <input placeholder="Course / activity" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} style={{ flex: 2, minWidth: 200, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }} />
            <input type="number" placeholder="Hours" value={form.hours || ''} onChange={e => setForm({ ...form, hours: e.target.value })} data-testid="qm-cpd-hours" style={{ width: 90, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--nn-border)', background: 'var(--off)', color: 'var(--text)', fontSize: 12 }} />
            <button className="tbtn tbtn-blue" style={{ fontSize: 11 }} data-testid="qm-cpd-add"
              onClick={() => { if (!form.staff_name || !form.hours) return; add('cpd', { staff_name: form.staff_name, title: form.title || 'CPD activity', hours: Number(form.hours) }); }}>
              <Plus size={11} /> Log CPD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
