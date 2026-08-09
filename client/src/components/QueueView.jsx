import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, RotateCcw, Clock, Send, AlertTriangle, Eye, Mail } from 'lucide-react';

export default function QueueView() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchQueue();
    // Auto refresh queue every 5 seconds
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchQueue = async () => {
    try {
      const url = statusFilter 
        ? `${API_BASE}/api/queue?status=${statusFilter}`
        : `${API_BASE}/api/queue`;
      const res = await fetch(url);
      const data = await res.json();
      setQueue(data);
    } catch (err) {
      console.error('Error fetching email queue:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      await fetch(`${API_BASE}/api/queue/retry-failed`, { method: 'POST' });
      fetchQueue();
    } catch (err) {
      console.error('Error retrying failed emails:', err);
    }
  };

  const filteredQueue = queue.filter(item => 
    item.email?.toLowerCase().includes(search.toLowerCase()) ||
    item.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.campaign_name?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = queue.filter(i => i.send_status === 'pending').length;
  const sentCount = queue.filter(i => i.send_status === 'sent').length;
  const failedCount = queue.filter(i => i.send_status === 'failed').length;

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>Scheduled Email Queue</h1>
          <p>Live outbox monitor tracking pending dispatches, automated delays, and failures</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleRetryFailed} className="btn btn-secondary" style={{ padding: '8px 14px' }}>
            <RotateCcw size={16} /> Retry Failed Emails
          </button>
          <button onClick={fetchQueue} className="btn btn-primary" style={{ padding: '8px 14px' }}>
            <RefreshCw size={16} /> Refresh Queue
          </button>
        </div>
      </div>

      {/* Queue Stat Summary */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card amber">
          <div className="stat-icon"><Clock size={24} /></div>
          <div>
            <div className="stat-val">{pendingCount}</div>
            <div className="stat-lbl">Pending in Queue</div>
          </div>
        </div>

        <div className="stat-card emerald">
          <div className="stat-icon"><Send size={24} /></div>
          <div>
            <div className="stat-val">{sentCount}</div>
            <div className="stat-lbl">Delivered Mails</div>
          </div>
        </div>

        <div className="stat-card rose">
          <div className="stat-icon"><AlertTriangle size={24} /></div>
          <div>
            <div className="stat-val">{failedCount}</div>
            <div className="stat-lbl">Failed Dispatches</div>
          </div>
        </div>
      </div>

      {/* Queue Filter Bar & Search */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['', 'pending', 'sent', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`btn ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem', textTransform: 'capitalize' }}
              >
                {st === '' ? 'All Queue Items' : st}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
            <input 
              type="text" 
              placeholder="Search recipient or campaign..." 
              className="form-input" 
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8' }}>Loading live outbox queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
            No emails found in queue for selected criteria.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Sent / Scheduled At</th>
                  <th>Opens</th>
                  <th>Error / Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item) => (
                  <tr key={item.cc_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.first_name} {item.last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.email}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#38bdf8' }}>{item.campaign_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Delay: {item.min_delay_sec}-{item.max_delay_sec}s</div>
                    </td>
                    <td>
                      <span className={`badge ${item.send_status === 'sent' ? 'badge-green' : item.send_status === 'failed' ? 'badge-rose' : 'badge-amber'}`}>
                        {item.send_status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {item.send_status === 'sent' ? (
                        <span style={{ color: '#10b981' }}>
                          Sent: {item.sent_at?.slice(0, 19).replace('T', ' ')}
                        </span>
                      ) : item.send_status === 'failed' ? (
                        <span style={{ color: '#f43f5e' }}>
                          Failed: {item.sent_at?.slice(0, 19).replace('T', ' ') || 'Error'}
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                          ⏰ {item.scheduled_time ? item.scheduled_time.slice(0, 19).replace('T', ' ') : 'Queued (Awaiting Delay)'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ color: item.open_count > 0 ? '#10b981' : '#94a3b8', fontWeight: 600 }}>
                        {item.open_count} opens
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: item.error_message ? '#f43f5e' : '#64748b', maxWidth: '240px' }}>
                      {item.error_message || 'Clean'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
