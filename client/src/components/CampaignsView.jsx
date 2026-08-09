import React, { useEffect, useState } from 'react';
import { Play, Pause, Square, Trash2, Eye, RefreshCw, AlertTriangle, CheckCircle, FileText, Edit3 } from 'lucide-react';

export default function CampaignsView({ onEditCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns`);
      const data = await res.json();
      setCampaigns(data);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (id) => {
    await fetch(`${API_BASE}/api/campaigns/${id}/start`, { method: 'POST' });
    fetchCampaigns();
  };

  const handlePause = async (id) => {
    await fetch(`${API_BASE}/api/campaigns/${id}/pause`, { method: 'POST' });
    fetchCampaigns();
  };

  const handleResume = async (id) => {
    await fetch(`${API_BASE}/api/campaigns/${id}/resume`, { method: 'POST' });
    fetchCampaigns();
  };

  const handleStop = async (id) => {
    await fetch(`${API_BASE}/api/campaigns/${id}/stop`, { method: 'POST' });
    fetchCampaigns();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    await fetch(`${API_BASE}/api/campaigns/${id}`, { method: 'DELETE' });
    fetchCampaigns();
    if (selectedCampaign?.campaign.id === id) {
      setSelectedCampaign(null);
    }
  };

  const viewDetails = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${id}`);
      const data = await res.json();
      setSelectedCampaign(data);
    } catch (err) {
      console.error('Error fetching campaign details:', err);
    }
  };

  if (loading) return <div style={{ color: '#94a3b8' }}>Loading campaigns...</div>;

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>Email Campaigns</h1>
          <p>Monitor queue progress, control dispatches, and audit recipient logs</p>
        </div>
        <button onClick={fetchCampaigns} className="btn btn-secondary">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedCampaign ? '1fr 1fr' : '1fr', gap: '24px' }}>
        {/* Campaign List */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Campaign Overview</h3>
          {campaigns.length === 0 ? (
            <p style={{ color: '#64748b', padding: '16px 0' }}>No campaigns found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {campaigns.map((c) => {
                const total = c.total_contacts || 0;
                const sent = c.sent_count || 0;
                const pending = c.pending_count || 0;
                const progressPct = total > 0 ? Math.round((sent / total) * 100) : 0;

                let badgeClass = 'badge-blue';
                if (c.status === 'sending') badgeClass = 'badge-green';
                if (c.status === 'paused') badgeClass = 'badge-amber';
                if (c.status === 'stopped') badgeClass = 'badge-rose';
                if (c.status === 'completed') badgeClass = 'badge-blue';

                return (
                  <div key={c.id} style={{ 
                    background: 'rgba(15, 23, 42, 0.6)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '16px' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{c.name}</h4>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Subject: {c.subject}</span>
                      </div>
                      <span className={`badge ${badgeClass}`}>
                        {c.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                        <span>Progress: {sent} / {total} emails ({pending} pending)</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #10b981)', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>

                    {c.attachment_filename && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#38bdf8', marginBottom: '12px' }}>
                        <FileText size={14} /> PDF Attachment: {c.attachment_filename}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {c.status === 'sending' ? (
                        <>
                          <button onClick={() => handlePause(c.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            <Pause size={14} /> Pause
                          </button>
                          <button onClick={() => handleStop(c.id)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            <Square size={14} /> Stop
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleResume(c.id)} className="btn btn-success" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                          <Play size={14} /> {c.status === 'paused' ? 'Resume' : c.status === 'stopped' ? 'Resume Sequence' : 'Start Sending'}
                        </button>
                      )}

                      <button onClick={() => onEditCampaign && onEditCampaign(c.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                        <Edit3 size={14} /> Edit
                      </button>

                      <button onClick={() => viewDetails(c.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                        <Eye size={14} /> Logs & Recipients
                      </button>

                      <button onClick={() => handleDelete(c.id)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Campaign Detailed Logs */}
        {selectedCampaign && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Recipient Audit & Logs</h3>
              <button onClick={() => setSelectedCampaign(null)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Close</button>
            </div>

            <h4 style={{ color: '#38bdf8', fontSize: '0.9rem', marginBottom: '12px' }}>
              Campaign: {selectedCampaign.campaign.name}
            </h4>

            <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>Recipient Status Table</h5>
            <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Opens</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCampaign.contacts.map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{rec.first_name} {rec.last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{rec.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${rec.send_status === 'sent' ? 'badge-green' : rec.send_status === 'failed' ? 'badge-rose' : 'badge-amber'}`}>
                          {rec.send_status}
                        </span>
                      </td>
                      <td style={{ color: rec.open_count > 0 ? '#10b981' : '#94a3b8', fontWeight: 600 }}>
                        {rec.open_count} opens
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>
                        {rec.send_status === 'sent' ? (
                          <span style={{ color: '#10b981' }}>Sent {rec.sent_at?.slice(0, 19).replace('T', ' ')}</span>
                        ) : rec.send_status === 'failed' ? (
                          <span style={{ color: '#f43f5e' }}>{rec.error_message || 'Failed'}</span>
                        ) : (
                          <span style={{ color: '#f59e0b' }}>⏰ Sched: {rec.scheduled_time ? rec.scheduled_time.slice(0, 19).replace('T', ' ') : 'Queued'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>Live Event Console</h5>
            <div className="terminal-box">
              {selectedCampaign.logs.length === 0 ? (
                <div>[SYSTEM] No execution logs yet for this campaign.</div>
              ) : (
                selectedCampaign.logs.map((log) => (
                  <div key={log.id}>
                    <span style={{ color: log.level === 'ERROR' ? '#f43f5e' : '#38bdf8' }}>[{log.timestamp?.slice(11, 19)}] [{log.level}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
