import React, { useEffect, useState } from 'react';
import { Users, Send, Clock, AlertCircle, Eye, UserX, Play, Plus, ShieldCheck, ShieldAlert } from 'lucide-react';

export default function DashboardView({ setActiveTab }) {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [safety, setSafety] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [resAnalytics, resCampaigns, resSafety] = await Promise.all([
        fetch(`${API_BASE}/api/analytics`),
        fetch(`${API_BASE}/api/campaigns`),
        fetch(`${API_BASE}/api/account-safety`)
      ]);
      const dataAnalytics = await resAnalytics.json();
      const dataCampaigns = await resCampaigns.json();
      const dataSafety = await resSafety.json();
      
      setStats(dataAnalytics);
      setCampaigns(dataCampaigns);
      setSafety(dataSafety);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#94a3b8' }}>Loading dashboard metrics...</div>;
  }

  const quotaPct = safety ? Math.min(100, Math.round((safety.sent_24h / safety.max_safe_daily) * 100)) : 0;

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>Outreach Performance</h1>
          <p>Real-time campaign status, Google Account safety shield & email delivery analytics</p>
        </div>
        <button onClick={() => setActiveTab('new-campaign')} className="btn btn-primary">
          <Plus size={16} /> Create Campaign
        </button>
      </div>

      {/* Google Account Anti-Ban Safety Guard Card */}
      {safety && (
        <div className="glass-card" style={{ marginBottom: '24px', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-color-glow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: 'var(--radius-md)', color: '#38bdf8' }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Google Account Safety Shield</h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Detected: <b>{safety.account_type}</b> • Max Safe Daily Cap: <b>{safety.max_safe_daily} emails/24h</b>
                </span>
              </div>
            </div>

            <span className={`badge ${safety.badge_color === 'green' ? 'badge-green' : safety.badge_color === 'amber' ? 'badge-amber' : 'badge-rose'}`}>
              {safety.status}
            </span>
          </div>

          {/* Quota Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '6px' }}>
              <span>24h Quota Usage: <b>{safety.sent_24h} / {safety.max_safe_daily} sent</b> ({safety.remaining_safe} remaining safe allocation)</span>
              <span>{quotaPct}%</span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${quotaPct}%`, 
                height: '100%', 
                background: quotaPct > 85 ? '#f43f5e' : quotaPct > 65 ? '#f59e0b' : 'linear-gradient(to right, #38bdf8, #10b981)',
                transition: 'width 0.3s ease' 
              }} />
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px' }}>
            💡 {safety.message}
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Users size={24} /></div>
          <div>
            <div className="stat-val">{stats?.total_contacts || 0}</div>
            <div className="stat-lbl">Total Contacts</div>
          </div>
        </div>

        <div className="stat-card emerald">
          <div className="stat-icon"><Send size={24} /></div>
          <div>
            <div className="stat-val">{stats?.total_sent || 0}</div>
            <div className="stat-lbl">Emails Sent</div>
          </div>
        </div>

        <div className="stat-card indigo">
          <div className="stat-icon"><Eye size={24} /></div>
          <div>
            <div className="stat-val">{stats?.open_rate || 0}%</div>
            <div className="stat-lbl">Open Rate ({stats?.total_opened || 0})</div>
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon"><Clock size={24} /></div>
          <div>
            <div className="stat-val">{stats?.total_pending || 0}</div>
            <div className="stat-lbl">Pending Queue</div>
          </div>
        </div>

        <div className="stat-card rose">
          <div className="stat-icon"><UserX size={24} /></div>
          <div>
            <div className="stat-val">{stats?.total_unsubscribes || 0}</div>
            <div className="stat-lbl">Unsubscribed</div>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Active & Recent Campaigns</h3>
        {campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
            No campaigns launched yet. Click <b>Create Campaign</b> to build your first cold outreach sequence.
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Status</th>
                  <th>Sent / Total</th>
                  <th>Open Rate</th>
                  <th>Scheduled / Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const sent = c.sent_count || 0;
                  const total = c.total_contacts || 0;
                  const opens = c.open_count || 0;
                  const rate = sent > 0 ? ((opens / sent) * 100).toFixed(1) : '0.0';

                  let badgeClass = 'badge-blue';
                  if (c.status === 'sending') badgeClass = 'badge-green';
                  if (c.status === 'paused') badgeClass = 'badge-amber';
                  if (c.status === 'completed') badgeClass = 'badge-blue';

                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>{c.status}</span>
                      </td>
                      <td>{sent} / {total}</td>
                      <td style={{ color: '#38bdf8', fontWeight: 600 }}>{rate}% ({opens})</td>
                      <td style={{ color: '#94a3b8' }}>{c.created_at?.slice(0, 16)}</td>
                      <td>
                        <button 
                          onClick={() => setActiveTab('campaigns')} 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
