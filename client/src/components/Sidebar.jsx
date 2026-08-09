import React from 'react';
import { UserButton, useUser } from '@clerk/clerk-react';
import { 
  LayoutDashboard, 
  Send, 
  PlusCircle, 
  Users, 
  ShieldCheck, 
  Settings,
  MailCheck,
  ListOrdered,
  LogOut,
  UserCheck
} from 'lucide-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function Sidebar({ activeTab, setActiveTab, onLogout }) {
  const username = localStorage.getItem('coldmail_username') || 'Admin';
  const { user } = useUser ? useUser() : { user: null };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: Send },
    { id: 'queue', label: 'Email Queue', icon: ListOrdered },
    { id: 'new-campaign', label: 'Create Campaign', icon: PlusCircle },
    { id: 'contacts', label: 'Contacts & CSV', icon: Users },
    { id: 'deliverability', label: 'Deliverability & SPF', icon: ShieldCheck },
    { id: 'settings', label: 'SMTP Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div className="brand">
          <div className="brand-icon">
            <MailCheck size={24} />
          </div>
          <div className="brand-text">
            <h2>ColdMail AI</h2>
            <span>Production Ready</span>
          </div>
        </div>

        <nav className="nav-menu">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Profile & Logout Button */}
      <div style={{
        padding: '16px 12px',
        borderTop: '1px solid var(--border-color)',
        marginTop: 'auto'
      }}>
        {CLERK_PUBLISHABLE_KEY && user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>
            <UserButton showName appearance={{ elements: { userButtonBox: { color: '#fff' } } }} />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ padding: '6px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '50%', color: '#38bdf8' }}>
                  <UserCheck size={16} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff' }}>{username}</div>
                  <div style={{ fontSize: '0.7rem', color: '#10b981' }}>Authenticated</div>
                </div>
              </div>
            </div>

            <button 
              onClick={onLogout}
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', justifyContent: 'center', gap: '6px', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
            >
              <LogOut size={14} /> Log Out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
