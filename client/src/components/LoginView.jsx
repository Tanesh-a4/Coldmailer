import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';

export default function LoginView({ onLoginSuccess, isClerkConfigured }) {
  const [authMode, setAuthMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleLocalSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Login failed. Invalid username or password.');
      }

      localStorage.setItem('coldmail_auth_token', data.access_token);
      localStorage.setItem('coldmail_username', data.username);
      onLoginSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top left, #0f172a, #020617)',
      padding: '24px'
    }}>
      {isClerkConfigured ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(56, 189, 248, 0.3)'
            }}>
              <Mail size={24} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>ColdMail AI</h2>
          </div>

          <SignIn 
            appearance={{
              baseTheme: dark,
              variables: {
                colorPrimary: '#6366f1',
                colorBackground: '#0f172a',
                colorInputBackground: '#1e293b',
                colorInputText: '#f8fafc',
                colorText: '#f8fafc',
                colorTextSecondary: '#94a3b8',
                borderRadius: '12px'
              },
              elements: {
                card: {
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                }
              }
            }}
          />
        </div>
      ) : (
        <div className="glass-card" style={{
          width: '100%',
          maxWidth: '420px',
          padding: '36px 32px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color-glow)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}>
          {/* Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
              boxShadow: '0 8px 24px rgba(56, 189, 248, 0.3)',
              marginBottom: '16px'
            }}>
              <Mail size={28} color="#fff" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ColdMail AI
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Secure Production Login System
            </p>
          </div>

          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              color: '#f43f5e',
              fontSize: '0.85rem',
              marginBottom: '20px'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLocalSubmit} autoComplete="off">
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Username</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: '40px' }}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input 
                  type="password" 
                  className="form-input" 
                  style={{ paddingLeft: '40px' }}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', fontWeight: 600, justifyContent: 'center' }}
            >
              {loading ? 'Authenticating...' : (
                <>
                  Sign In to Dashboard <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            padding: '10px',
            fontSize: '0.75rem',
            color: '#64748b',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <ShieldCheck size={14} style={{ color: '#10b981' }} /> Protected by 256-bit authentication shield
          </div>
        </div>
      )}
    </div>
  );
}
