import React, { useState, useEffect } from 'react';
import { ClerkProvider, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import CampaignsView from './components/CampaignsView';
import QueueView from './components/QueueView';
import CampaignEditor from './components/CampaignEditor';
import ContactsManager from './components/ContactsManager';
import DeliverabilityAudit from './components/DeliverabilityAudit';
import SmtpSettings from './components/SmtpSettings';
import LoginView from './components/LoginView';
import './index.css';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MainAppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingCampaignId, setEditingCampaignId] = useState(null);

  useEffect(() => {
    // Intercept native fetch to attach Authorization header automatically for /api/ backend requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let [resource, config] = args;
      const urlString = typeof resource === 'string' 
        ? resource 
        : resource instanceof URL 
        ? resource.href 
        : resource?.url || '';

      // Only attach internal JWT token to backend /api/ requests
      if (urlString.includes('/api/') && !urlString.includes('/api/auth/login')) {
        const token = localStorage.getItem('coldmail_auth_token');
        if (token) {
          config = config || {};
          config.headers = config.headers || {};
          if (config.headers instanceof Headers) {
            if (!config.headers.has('Authorization')) {
              config.headers.append('Authorization', `Bearer ${token}`);
            }
          } else if (Array.isArray(config.headers)) {
            config.headers.push(['Authorization', `Bearer ${token}`]);
          } else {
            config.headers['Authorization'] = `Bearer ${token}`;
          }
        }
      }

      const response = await originalFetch(resource, config);
      if (response.status === 401 && urlString.includes('/api/') && !urlString.includes('/api/auth/login')) {
        localStorage.removeItem('coldmail_auth_token');
        setIsAuthenticated(false);
      }
      return response;
    };

    const token = localStorage.getItem('coldmail_auth_token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('coldmail_auth_token');
    localStorage.removeItem('coldmail_username');
    setIsAuthenticated(false);
  };

  const handleEditCampaign = (id) => {
    setEditingCampaignId(id);
    setActiveTab('new-campaign');
  };

  const handleNavTab = (tab) => {
    if (tab !== 'new-campaign') {
      setEditingCampaignId(null);
    }
    setActiveTab(tab);
  };

  if (CLERK_PUBLISHABLE_KEY) {
    return (
      <>
        <SignedIn>
          <div className="app-container">
            <Sidebar activeTab={activeTab} setActiveTab={handleNavTab} onLogout={handleLogout} />
            <main className="main-content">
              {activeTab === 'dashboard' && <DashboardView setActiveTab={handleNavTab} />}
              {activeTab === 'campaigns' && <CampaignsView onEditCampaign={handleEditCampaign} />}
              {activeTab === 'queue' && <QueueView />}
              {activeTab === 'new-campaign' && (
                <CampaignEditor 
                  setActiveTab={handleNavTab} 
                  editingCampaignId={editingCampaignId}
                  setEditingCampaignId={setEditingCampaignId}
                />
              )}
              {activeTab === 'contacts' && <ContactsManager />}
              {activeTab === 'deliverability' && <DeliverabilityAudit />}
              {activeTab === 'settings' && <SmtpSettings />}
            </main>
          </div>
        </SignedIn>
        <SignedOut>
          <LoginView onLoginSuccess={handleLoginSuccess} isClerkConfigured={true} />
        </SignedOut>
      </>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} isClerkConfigured={false} />;
  }

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={handleNavTab} onLogout={handleLogout} />
      
      <main className="main-content">
        {activeTab === 'dashboard' && <DashboardView setActiveTab={handleNavTab} />}
        {activeTab === 'campaigns' && <CampaignsView onEditCampaign={handleEditCampaign} />}
        {activeTab === 'queue' && <QueueView />}
        {activeTab === 'new-campaign' && (
          <CampaignEditor 
            setActiveTab={handleNavTab} 
            editingCampaignId={editingCampaignId}
            setEditingCampaignId={setEditingCampaignId}
          />
        )}
        {activeTab === 'contacts' && <ContactsManager />}
        {activeTab === 'deliverability' && <DeliverabilityAudit />}
        {activeTab === 'settings' && <SmtpSettings />}
      </main>
    </div>
  );
}

export default function App() {
  if (CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <MainAppContent />
      </ClerkProvider>
    );
  }

  return <MainAppContent />;
}
