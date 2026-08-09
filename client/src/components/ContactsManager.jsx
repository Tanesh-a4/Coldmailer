import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Plus, Search, Mail } from 'lucide-react';

export default function ContactsManager() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  // Manual contact modal form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/contacts`);
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/contacts/upload-csv`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert(`CSV Ingested Successfully! Imported ${data.imported} contacts. Skipped ${data.skipped}.`);
        fetchContacts();
      } else {
        alert('CSV Upload error: ' + data.detail);
      }
    } catch (err) {
      console.error('Error uploading CSV:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAddManual = async (e) => {
    e.preventDefault();
    if (!email) return;

    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          first_name: firstName,
          last_name: lastName,
          company_name: company,
          title
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEmail('');
        setFirstName('');
        setLastName('');
        setCompany('');
        setTitle('');
        fetchContacts();
      } else {
        alert(data.detail);
      }
    } catch (err) {
      console.error('Error adding contact:', err);
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>Contacts & CSV Ingestion</h1>
          <p>Import recipient lists, verify MX mail servers, and manage contact data</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '32px' }}>
        {/* CSV Dropzone */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Import CSV List</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
            Supports your attached CSV format (First Name, Last Name, Email, Company, Title, Phone, Stage, LinkedIn).
          </p>

          <label className="dropzone">
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            <UploadCloud size={36} style={{ color: '#38bdf8', marginBottom: '8px' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {uploading ? 'Processing CSV & MX DNS Records...' : 'Click or Drag CSV File Here'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              Auto-sanitizes domain MX records to prevent bounces.
            </div>
          </label>
        </div>

        {/* Quick Add Single Contact */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Add Single Lead</h3>
          <form onSubmit={handleAddManual} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <input type="email" placeholder="Email *" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <input type="text" placeholder="First Name" className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <input type="text" placeholder="Last Name" className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div>
              <input type="text" placeholder="Company Name" className="form-input" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <input type="text" placeholder="Job Title" className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <button type="submit" className="btn btn-secondary" style={{ width: '100%' }}>
                <Plus size={16} /> Add Contact
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            Contact Directory ({filteredContacts.length} total)
          </h3>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
            <input 
              type="text" 
              placeholder="Search leads or domains..." 
              className="form-input" 
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8' }}>Loading contact database...</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company & Title</th>
                  <th>MX Verification</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                    <td>{c.email}</td>
                    <td>
                      <div>{c.company_name || '-'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.title}</div>
                    </td>
                    <td>
                      <span className={`badge ${c.mx_valid ? 'badge-green' : 'badge-rose'}`}>
                        {c.mx_valid ? 'MX Active' : 'Invalid MX'}
                      </span>
                    </td>
                    <td>
                      {c.is_unsubscribed ? (
                        <span className="badge badge-amber">Unsubscribed</span>
                      ) : (
                        <span className="badge badge-blue">Ready</span>
                      )}
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
