import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, Paperclip, Send, Clock, Tag, FileText, CheckCircle, AlertTriangle, 
  Bold, Italic, Underline, Link as LinkIcon, List, Heading, Eye, Edit3, Save 
} from 'lucide-react';

export default function CampaignEditor({ setActiveTab, editingCampaignId, setEditingCampaignId }) {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [name, setName] = useState('Outreach Sequence #' + Math.floor(Math.random() * 1000));
  const [subject, setSubject] = useState('Quick question regarding {{Company Name}}');
  const [bodyHtml, setBodyHtml] = useState(
    'Hi {{First Name}},\n\nI hope you are having a great week.\n\nI noticed your role as {{Title}} at {{Company Name}} and wanted to reach out regarding our platform.\n\nWould you have 5 minutes for a quick chat next week?\n\nBest regards,\nColdMail Team'
  );

  const [contacts, setContacts] = useState([]);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  
  // Anti-spam jitter & settings
  const [minDelay, setMinDelay] = useState(30);
  const [maxDelay, setMaxDelay] = useState(90);
  const [scheduledAt, setScheduledAt] = useState('');
  
  // PDF Attachment
  const [attachment, setAttachment] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Live Spam Check Results
  const [spamData, setSpamData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Editor View Mode & Link Modal
  const [editorTab, setEditorTab] = useState('editor'); // 'editor' | 'preview'
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkText, setLinkText] = useState('');

  useEffect(() => {
    fetchContacts();
    if (editingCampaignId) {
      fetchEditingCampaign(editingCampaignId);
    } else {
      runSpamCheck(subject, bodyHtml);
    }
  }, [editingCampaignId]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/contacts`);
      const data = await res.json();
      setContacts(data);
      if (!editingCampaignId) {
        const validIds = data.filter(c => c.mx_valid === 1 && c.is_unsubscribed === 0).map(c => c.id);
        setSelectedContactIds(validIds);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  };

  const fetchEditingCampaign = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${id}`);
      const data = await res.json();
      if (data.campaign) {
        setName(data.campaign.name);
        setSubject(data.campaign.subject);
        setBodyHtml(data.campaign.body_html.replace(/<br\s*\/?>/gi, '\n'));
        setMinDelay(data.campaign.min_delay_sec || 30);
        setMaxDelay(data.campaign.max_delay_sec || 90);
        if (data.campaign.attachment_filename) {
          setAttachment({
            filename: data.campaign.attachment_filename,
            path: data.campaign.attachment_path,
            size_kb: 'Attached'
          });
        }
        if (data.contacts) {
          setSelectedContactIds(data.contacts.map(c => c.id));
        }
        runSpamCheck(data.campaign.subject, data.campaign.body_html);
      }
    } catch (err) {
      console.error('Error fetching campaign details for editing:', err);
    }
  };

  const runSpamCheck = async (subjText, bodyText) => {
    try {
      const res = await fetch(`${API_BASE}/api/spam-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subjText, body_html: bodyText })
      });
      const data = await res.json();
      setSpamData(data);
    } catch (err) {
      console.error('Error running spam check:', err);
    }
  };

  const handleSubjectChange = (e) => {
    const val = e.target.value;
    setSubject(val);
    runSpamCheck(val, bodyHtml);
  };

  const handleBodyChange = (e) => {
    const val = e.target.value;
    setBodyHtml(val);
    runSpamCheck(subject, val);
  };

  const insertTag = (tag) => {
    setBodyHtml(prev => prev + ` {{${tag}}}`);
    runSpamCheck(subject, bodyHtml + ` {{${tag}}}`);
  };

  const wrapSelectionFormat = (openTag, closeTag) => {
    setBodyHtml(prev => prev + `${openTag}formatted text${closeTag}`);
    runSpamCheck(subject, bodyHtml + `${openTag}formatted text${closeTag}`);
  };

  const handleAddHyperlink = (e) => {
    e.preventDefault();
    if (!linkUrl) return;
    const textToDisplay = linkText.trim() || linkUrl;
    const linkHtml = `<a href="${linkUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline;">${textToDisplay}</a>`;
    setBodyHtml(prev => prev + ` ${linkHtml}`);
    runSpamCheck(subject, bodyHtml + ` ${linkHtml}`);
    setShowLinkModal(false);
    setLinkUrl('https://');
    setLinkText('');
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPdf(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/attachments/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setAttachment(data);
      } else {
        alert(data.detail || 'Upload failed');
      }
    } catch (err) {
      console.error('PDF upload error:', err);
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedContactIds.length === 0) {
      alert('Please select at least 1 contact recipient.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        subject,
        body_html: bodyHtml.replace(/\n/g, '<br/>'),
        contact_ids: selectedContactIds,
        scheduled_at: scheduledAt || null,
        min_delay_sec: Number(minDelay),
        max_delay_sec: Number(maxDelay),
        track_opens: true,
        attachment_filename: attachment ? attachment.filename : null,
        attachment_path: attachment ? attachment.path : null
      };

      const url = editingCampaignId 
        ? `${API_BASE}/api/campaigns/${editingCampaignId}`
        : `${API_BASE}/api/campaigns`;
      
      const method = editingCampaignId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        if (!editingCampaignId) {
          // Auto start new campaign
          await fetch(`${API_BASE}/api/campaigns/${data.id}/start`, { method: 'POST' });
        }
        if (setEditingCampaignId) setEditingCampaignId(null);
        setActiveTab('campaigns');
      } else {
        alert('Error saving campaign: ' + JSON.stringify(data));
      }
    } catch (err) {
      console.error('Submit campaign error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedContactIds(contacts.map(c => c.id));
    } else {
      setSelectedContactIds([]);
    }
  };

  const toggleSelectContact = (id) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(selectedContactIds.filter(i => i !== id));
    } else {
      setSelectedContactIds([...selectedContactIds, id]);
    }
  };

  // Preview renderer helper
  const getRenderedPreview = () => {
    let rendered = bodyHtml
      .replace(/\{\{\s*First Name\s*\}\}/gi, 'Alex')
      .replace(/\{\{\s*Last Name\s*\}\}/gi, 'Smith')
      .replace(/\{\{\s*Company Name\s*\}\}/gi, 'Acme Inc')
      .replace(/\{\{\s*Title\s*\}\}/gi, 'VP of Operations')
      .replace(/\n/g, '<br/>');

    const optOutFooter = `
      <br/><br/>
      <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #334155; font-size: 11px; color: #94a3b8; font-family: sans-serif;">
        You are receiving this email as part of our direct business outreach. 
        If you prefer not to receive future communications, you may <a href="#" style="color: #38bdf8; text-decoration: underline;">unsubscribe here</a>.
      </div>
    `;

    return rendered + optOutFooter;
  };

  return (
    <div>
      <div className="top-header">
        <div className="page-title">
          <h1>{editingCampaignId ? 'Edit Campaign Sequence' : 'New Campaign Wizard'}</h1>
          <p>Compose personalized cold emails with rich formatting, hyperlinks, PDF attachments & anti-spam score inspection</p>
        </div>
        {editingCampaignId && (
          <button 
            type="button" 
            onClick={() => { if (setEditingCampaignId) setEditingCampaignId(null); setActiveTab('campaigns'); }} 
            className="btn btn-secondary"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '24px' }}>
        {/* Main Editor Form */}
        <div className="glass-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Campaign Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Subject Line</label>
              <input 
                type="text" 
                className="form-input" 
                value={subject} 
                onChange={handleSubjectChange} 
                required 
              />
            </div>

            {/* Editor vs Live Preview Tab Switch */}
            <div className="form-group">
              <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setEditorTab('editor')} 
                    className={`btn ${editorTab === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    <Edit3 size={14} /> HTML Editor
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setEditorTab('preview')} 
                    className={`btn ${editorTab === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    <Eye size={14} /> Live Recipient Preview
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Click tags to personalize:</span>
              </div>

              {editorTab === 'editor' ? (
                <>
                  {/* Rich Text & Formatting Toolbar */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '6px', 
                    flexWrap: 'wrap', 
                    alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.9)', 
                    padding: '8px 12px', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
                  }}>
                    <button type="button" onClick={() => wrapSelectionFormat('<b>', '</b>')} title="Bold" style={{ background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '4px' }}>
                      <Bold size={16} />
                    </button>
                    <button type="button" onClick={() => wrapSelectionFormat('<i>', '</i>')} title="Italic" style={{ background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '4px' }}>
                      <Italic size={16} />
                    </button>
                    <button type="button" onClick={() => wrapSelectionFormat('<u>', '</u>')} title="Underline" style={{ background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '4px' }}>
                      <Underline size={16} />
                    </button>
                    <button type="button" onClick={() => setShowLinkModal(true)} title="Insert Hyperlink" style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '4px' }}>
                      <LinkIcon size={16} />
                    </button>
                    <button type="button" onClick={() => wrapSelectionFormat('<h3>', '</h3>')} title="Heading" style={{ background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '4px' }}>
                      <Heading size={16} />
                    </button>
                    <button type="button" onClick={() => wrapSelectionFormat('<ul><li>', '</li></ul>')} title="Bullet List" style={{ background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '4px' }}>
                      <List size={16} />
                    </button>

                    <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 4px' }} />

                    {/* Dynamic Tag Pills */}
                    {['First Name', 'Last Name', 'Company Name', 'Title', 'Phone', 'Stage'].map(tag => (
                      <button 
                        key={tag} 
                        type="button" 
                        onClick={() => insertTag(tag)}
                        style={{ 
                          background: 'rgba(56, 189, 248, 0.15)', 
                          border: '1px solid rgba(56, 189, 248, 0.3)', 
                          color: '#38bdf8', 
                          borderRadius: '4px', 
                          padding: '2px 8px', 
                          fontSize: '0.75rem', 
                          cursor: 'pointer' 
                        }}
                      >
                        + {`{{${tag}}}`}
                      </button>
                    ))}
                  </div>

                  <textarea 
                    className="form-textarea" 
                    value={bodyHtml} 
                    onChange={handleBodyChange} 
                    style={{ borderRadius: '0 0 var(--radius-md) var(--radius-md)', borderTop: 'none' }}
                    required 
                  />
                </>
              ) : (
                /* Live Preview Box */
                <div style={{ 
                  background: '#090D16', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '20px', 
                  minHeight: '220px',
                  fontFamily: 'sans-serif',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: '#f8fafc'
                }}>
                  <div style={{ borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
                    <b>Subject:</b> {subject.replace(/\{\{\s*Company Name\s*\}\}/gi, 'Acme Inc')}<br/>
                    <b>To:</b> Alex Smith &lt;alex.smith@acme.com&gt;
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: getRenderedPreview() }} />
                </div>
              )}
            </div>

            {/* Hyperlink Insertion Modal */}
            {showLinkModal && (
              <div style={{ 
                background: 'rgba(15,23,42,0.95)', 
                border: '1px solid var(--border-color-glow)', 
                borderRadius: 'var(--radius-md)', 
                padding: '16px', 
                marginBottom: '20px' 
              }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', color: '#38bdf8' }}>
                  🔗 Insert Hyperlink into Cold Mail
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Destination URL *</label>
                    <input 
                      type="url" 
                      className="form-input" 
                      placeholder="https://yourwebsite.com/demo" 
                      value={linkUrl} 
                      onChange={e => setLinkUrl(e.target.value)} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Display Text (Optional)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Click here for demo" 
                      value={linkText} 
                      onChange={e => setLinkText(e.target.value)} 
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowLinkModal(false)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleAddHyperlink} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                    Insert Link
                  </button>
                </div>
              </div>
            )}

            {/* PDF Attachment Zone */}
            <div className="form-group">
              <label className="form-label">Attach PDF File (Optional)</label>
              {attachment ? (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: 'rgba(16, 185, 129, 0.1)', 
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  color: '#10b981'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                    <FileText size={18} />
                    <span><b>{attachment.filename}</b> ({attachment.size_kb} KB)</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setAttachment(null)}
                    style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="dropzone" style={{ padding: '20px', display: 'block' }}>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={handlePdfUpload} style={{ display: 'none' }} />
                  <Paperclip size={24} style={{ color: '#38bdf8', marginBottom: '4px' }} />
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{uploadingPdf ? 'Uploading PDF...' : 'Click or drop PDF document here to attach'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Supports PDF attachments up to 10MB</div>
                </label>
              )}
            </div>

            {/* Anti-Spam Sending Delay Jitter Controls */}
            <div style={{ 
              background: 'rgba(15, 23, 42, 0.6)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-md)', 
              padding: '16px', 
              marginBottom: '20px' 
            }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} style={{ color: '#38bdf8' }} /> Schedule Release & Anti-Spam Throttling
              </h4>
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">
                  <span>Scheduled Launch Date & Time (Optional)</span>
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Leave empty to send immediately</span>
                </label>
                <input 
                  type="datetime-local" 
                  className="form-input" 
                  value={scheduledAt} 
                  onChange={e => setScheduledAt(e.target.value)} 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="form-label">Min Delay (Seconds)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={minDelay} 
                    onChange={e => setMinDelay(e.target.value)} 
                    min="5" 
                  />
                </div>
                <div>
                  <label className="form-label">Max Delay (Seconds)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={maxDelay} 
                    onChange={e => setMaxDelay(e.target.value)} 
                    min="10" 
                  />
                </div>
              </div>
            </div>

            {/* Contact Selector */}
            <div className="form-group">
              <div className="form-label">
                <span>Select Contacts ({selectedContactIds.length} / {contacts.length} chosen)</span>
                <label style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#38bdf8' }}>
                  <input type="checkbox" onChange={toggleSelectAll} checked={selectedContactIds.length === contacts.length && contacts.length > 0} /> Select All
                </label>
              </div>
              <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>MX Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedContactIds.includes(c.id)} 
                            onChange={() => toggleSelectContact(c.id)} 
                          />
                        </td>
                        <td>{c.first_name} {c.last_name}</td>
                        <td>{c.email}</td>
                        <td>{c.company_name}</td>
                        <td>
                          <span className={`badge ${c.mx_valid ? 'badge-green' : 'badge-rose'}`}>
                            {c.mx_valid ? 'Valid MX' : 'No MX'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%', padding: '14px' }}>
              <Save size={18} /> {submitting ? 'Saving Sequence...' : editingCampaignId ? 'Save Campaign Updates' : 'Launch Campaign & Start Sending'}
            </button>
          </form>
        </div>

        {/* Live Anti-Spam Risk Meter Sidebar */}
        <div>
          <div className="glass-card" style={{ position: 'sticky', top: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={20} style={{ color: spamData?.color === 'red' ? '#f43f5e' : spamData?.color === 'amber' ? '#f59e0b' : '#10b981' }} />
              Live Spam Risk Inspector
            </h3>

            {spamData && (
              <div>
                <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(15,23,42,0.8)', borderRadius: 'var(--radius-md)', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: spamData.color === 'red' ? '#f43f5e' : spamData.color === 'amber' ? '#f59e0b' : '#10b981' }}>
                    {spamData.spam_score} / 10
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginTop: '4px' }}>
                    {spamData.risk_level}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>Triggers Detected ({spamData.triggers_found.length})</h4>
                  {spamData.triggers_found.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} /> Clean! No aggressive spam trigger words found.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {spamData.triggers_found.map((t, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', padding: '6px 10px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '4px', color: '#f43f5e' }}>
                          <b>"{t.word}"</b> ({t.category})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>Deliverability Tips</h4>
                  <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {spamData.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
