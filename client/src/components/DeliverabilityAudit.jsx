import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export default function DeliverabilityAudit() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [domain, setDomain] = useState('');
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    runAudit();
  }, []);

  const runAudit = async (domainToTest = '') => {
    setLoading(true);
    try {
      const url = domainToTest 
        ? `${API_BASE}/api/domain-audit?domain=${encodeURIComponent(domainToTest)}`
        : `${API_BASE}/api/domain-audit`;
      const res = await fetch(url);
      const data = await res.json();
      setAudit(data);
      setDomain(data.domain);
    } catch (err) {
      console.error('Error running domain audit:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (domain) {
      runAudit(domain);
    }
  };

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>Domain Deliverability & DNS Audit</h1>
          <p>Verify SPF, DKIM, DMARC and MX record authority to prevent cold email spam flag</p>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
          <input 
            type="text" 
            placeholder="Enter domain name (e.g. gmail.com, yourcompany.com)" 
            className="form-input" 
            value={domain} 
            onChange={e => setDomain(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <RefreshCw size={16} /> Audit Domain
          </button>
        </form>
      </div>

      {loading && <div style={{ color: '#94a3b8' }}>Analyzing DNS records for {domain}...</div>}

      {audit && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
          {/* Deliverability Health Card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Domain Score</h3>
            <div style={{ textAlign: 'center', padding: '24px 16px', background: 'rgba(15,23,42,0.8)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: audit.overall_score >= 80 ? '#10b981' : audit.overall_score >= 50 ? '#f59e0b' : '#f43f5e' }}>
                {audit.overall_score} / 100
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                {audit.health_status}
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>Actionable Recommendations</h4>
              {audit.recommendations.length === 0 ? (
                <div style={{ color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> Your domain DNS records pass cold email deliverability checks!
                </div>
              ) : (
                <ul style={{ paddingLeft: '16px', fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {audit.recommendations.map((rec, i) => (
                    <li key={i} style={{ color: '#f59e0b' }}>{rec}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* DNS Protocol Breakdown */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Authentication Protocol Checks</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* MX Check */}
              <div style={{ background: 'rgba(15,23,42,0.6)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>1. MX Mail Exchanger Records</span>
                  <span className={`badge ${audit.mx.status === 'Pass' ? 'badge-green' : 'badge-rose'}`}>{audit.mx.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{audit.mx.details}</div>
              </div>

              {/* SPF Check */}
              <div style={{ background: 'rgba(15,23,42,0.6)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>2. SPF Sender Policy Framework</span>
                  <span className={`badge ${audit.spf.status === 'Pass' ? 'badge-green' : 'badge-rose'}`}>{audit.spf.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{audit.spf.details}</div>
                {audit.spf.record && <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#38bdf8', marginTop: '6px' }}>Record: {audit.spf.record}</div>}
              </div>

              {/* DMARC Check */}
              <div style={{ background: 'rgba(15,23,42,0.6)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>3. DMARC Alignment Policy</span>
                  <span className={`badge ${audit.dmarc.status === 'Pass' ? 'badge-green' : 'badge-rose'}`}>{audit.dmarc.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{audit.dmarc.details}</div>
                {audit.dmarc.record && <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#38bdf8', marginTop: '6px' }}>Record: {audit.dmarc.record}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
