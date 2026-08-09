import React, { useEffect, useState } from 'react';
import { Settings, Save, Key, CheckCircle, AlertTriangle, Send, RefreshCw, Lock, UserCheck, ShieldCheck } from 'lucide-react';

export default function SmtpSettings() {
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [appUrl, setAppUrl] = useState('http://localhost:8000');

  // Change Admin Credentials state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMsg, setPassMsg] = useState(null);
  const [changingPass, setChangingPass] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();

      if (data.SMTP_HOST) setSmtpHost(data.SMTP_HOST);
      if (data.SMTP_PORT) setSmtpPort(Number(data.SMTP_PORT));
      if (data.SMTP_USER) {
        setSmtpUser(data.SMTP_USER);
        setTestEmail(data.SMTP_USER);
      }
      if (data.SMTP_PASS) setSmtpPass(data.SMTP_PASS);
      if (data.FROM_NAME) setFromName(data.FROM_NAME);
      if (data.FROM_EMAIL) setFromEmail(data.FROM_EMAIL);
      if (data.APP_URL) setAppUrl(data.APP_URL);

      const currentAdmin = localStorage.getItem('coldmail_username') || 'admin';
      setNewUsername(currentAdmin);
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const payload = {
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        from_name: fromName,
        from_email: fromEmail,
        app_url: appUrl
      };

      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to save settings.');

      setStatusMsg({ type: 'success', text: 'SMTP settings updated successfully! Email worker will now use these credentials.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!testEmail) {
      setStatusMsg({ type: 'error', text: 'Please enter a test recipient email.' });
      return;
    }

    setTesting(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE}/api/smtp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_email: testEmail })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'SMTP test failed.');

      setStatusMsg({ type: 'success', text: `Test email sent successfully to ${testEmail}! Check your inbox.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: `SMTP Handshake Error: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleChangeAdminCredentials = async (e) => {
    e.preventDefault();
    setChangingPass(true);
    setPassMsg(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_username: newUsername, new_password: newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update credentials.');

      localStorage.setItem('coldmail_username', newUsername);
      setPassMsg({ type: 'success', text: 'Admin master credentials updated successfully!' });
      setNewPassword('');
    } catch (err) {
      setPassMsg({ type: 'error', text: err.message });
    } finally {
      setChangingPass(false);
    }
  };

  if (loading) return <div style={{ color: '#94a3b8' }}>Loading settings configuration...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="top-header">
        <div className="page-title">
          <h1>SMTP & Security Configuration</h1>
          <p>Set up sending credentials, App Passwords, and manage master login authentication</p>
        </div>
      </div>

      {/* Top Main Settings Form */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={20} style={{ color: '#38bdf8' }} /> SMTP Sending Credentials
        </h3>

        <form onSubmit={handleSave} autoComplete="off">
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">SMTP Server Host</label>
              <input 
                type="text" 
                className="form-input" 
                value={smtpHost} 
                onChange={e => setSmtpHost(e.target.value)} 
                placeholder="smtp.gmail.com"
                autoComplete="off"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input 
                type="number" 
                className="form-input" 
                value={smtpPort} 
                onChange={e => setSmtpPort(e.target.value)} 
                placeholder="587"
                autoComplete="off"
                required 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Sender Email Address (SMTP Username)</label>
              <input 
                type="email" 
                className="form-input" 
                value={smtpUser} 
                onChange={e => setSmtpUser(e.target.value)} 
                placeholder="your.email@gmail.com"
                autoComplete="off"
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>App Password / SMTP Password</span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', marginLeft: '6px' }}>Used 100% directly</span>
              </label>
              <input 
                type="password" 
                className="form-input" 
                value={smtpPass} 
                onChange={e => setSmtpPass(e.target.value)} 
                placeholder="16-character Gmail App Password"
                autoComplete="new-password"
                required 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">From Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={fromName} 
                onChange={e => setFromName(e.target.value)} 
                placeholder="John Doe"
                autoComplete="off"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">From Email Address</label>
              <input 
                type="email" 
                className="form-input" 
                value={fromEmail} 
                onChange={e => setFromEmail(e.target.value)} 
                placeholder="john@company.com"
                autoComplete="off"
                required 
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Application Base URL (For Unsubscribe & Open Tracking)</label>
            <input 
              type="text" 
              className="form-input" 
              value={appUrl} 
              onChange={e => setAppUrl(e.target.value)} 
              placeholder="http://localhost:8000"
              autoComplete="off"
            />
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '12px 24px' }}>
            <Save size={18} /> {saving ? 'Saving Settings...' : 'Save SMTP Settings'}
          </button>
        </form>
      </div>

      {/* Bottom Section: Test Connection & Admin Security */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Test SMTP */}
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={20} style={{ color: '#38bdf8' }} /> Test Connection
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
              Send a test message to verify your App Password and SMTP handshake before launching cold campaigns.
            </p>

            <div className="form-group">
              <label className="form-label">Recipient Test Email</label>
              <input 
                type="email" 
                className="form-input" 
                value={testEmail} 
                onChange={e => setTestEmail(e.target.value)} 
                placeholder="test.recipient@example.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <button onClick={handleTestSmtp} disabled={testing} className="btn btn-success" style={{ width: '100%' }}>
              {testing ? 'Connecting to SMTP...' : 'Send Test Email'}
            </button>

            {statusMsg && (
              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                fontSize: '0.85rem',
                background: statusMsg.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
                color: statusMsg.type === 'success' ? '#10b981' : '#f43f5e'
              }}>
                {statusMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Change Master Password Card */}
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={18} style={{ color: '#38bdf8' }} /> Change Master Login Credentials
            </h3>
            <form onSubmit={handleChangeAdminCredentials} autoComplete="off">
              <div className="form-group">
                <label className="form-label">New Admin Username</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)} 
                  autoComplete="off"
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">New Admin Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="Enter secret new password"
                  autoComplete="new-password"
                  required 
                />
              </div>
              <button type="submit" disabled={changingPass} className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }}>
                {changingPass ? 'Updating Credentials...' : 'Update Login Password'}
              </button>
            </form>
          </div>

          {passMsg && (
            <div style={{ 
              marginTop: '12px', 
              padding: '10px', 
              borderRadius: 'var(--radius-md)', 
              fontSize: '0.8rem',
              background: passMsg.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
              color: passMsg.type === 'success' ? '#10b981' : '#f43f5e'
            }}>
              {passMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
