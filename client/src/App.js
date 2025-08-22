// src/App.js
import React, { useEffect, useState } from 'react';
import './App.css';
import './components/EmbedFeed.css';
import EmbedFeed from './components/InstagramEmbedFeed';

const DISPLAY_OPTIONS = [
  { key: 'grid-2', label: 'Grid — 2 columns' },
  { key: 'grid-3', label: 'Grid — 3 columns' },
  { key: 'grid-4', label: 'Grid — 4 columns' },
  { key: 'text-below', label: 'Text Below (3 col)' },
  { key: 'text-left', label: 'Text Left (2 col)' },
  { key: 'masonry', label: 'Masonry (responsive)' },
];

function App() {
  const [pages, setPages] = useState([]);
  const [accounts, setAccounts] = useState([]); // stored IG accounts (existing)
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedInstagramId, setSelectedInstagramId] = useState('');
  const [newPageId, setNewPageId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [displayStyle, setDisplayStyle] = useState('grid-4');

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // load pages and stored accounts on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/pages`)
      .then(r => r.json())
      .then(json => {
        if (json.pages) setPages(json.pages);
      })
      .catch(err => console.error('Failed to load pages', err));

    fetch(`${API_BASE_URL}/api/instagram-accounts`)
      .then(r => r.json())
      .then(json => {
        if (json.accounts) setAccounts(json.accounts);
      })
      .catch(() => {});
  }, [API_BASE_URL]);

// inside App component
const handleSelectPage = async (pageId) => {
  setSelectedPageId(pageId);
  setMessage('');
  setError('');
  setSelectedInstagramId('');

  if (!pageId) return;

  const page = pages.find(p => p.id === pageId);
  if (!page) {
    setError('Selected page not found');
    return;
  }

  try {
    // Always call add-instagram-account to ensure server has pageToken & instagramId stored.
    const res = await fetch(`${API_BASE_URL}/api/add-instagram-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId })
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      // if server responds with "No IG linked" we'll show that message
      setError(json.error || 'Failed to add/check page');
      return;
    }

    // server returns account.instagramId and pageToken stored
    const igId = json.account.instagramId;
    if (!igId) {
      setError('No Instagram Business account linked to this Page (or missing permissions).');
      return;
    }

    // store selected instagram id for the feed component
    setSelectedInstagramId(igId);

    // update local accounts cache so future loads use it
    setAccounts(prev => {
      const exists = prev.find(a => a.pageId === json.account.pageId);
      if (exists) return prev.map(a => a.pageId === json.account.pageId ? json.account : a);
      return [...prev, json.account];
    });

    setMessage(`Loaded Instagram account for ${json.account.name}`);
  } catch (err) {
    console.error('Failed to add/check page', err);
    setError('Network error while adding/checking page');
  }
};

  // manual add fallback (same as existing)
  const handleAddAccount = async () => {
    setError('');
    setMessage('');
    const pageId = newPageId.trim();
    if (!pageId) {
      setError('Please enter a Facebook Page ID.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/add-instagram-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to add account');
        return;
      }
      setAccounts(prev => [...prev, data.account]);
      setMessage(`Added: ${data.account.name}`);
      setNewPageId('');
    } catch (err) {
      console.error(err);
      setError('Failed to add account — network error');
    }
  };

  const handleClearSelection = () => {
    setSelectedInstagramId('');
    setSelectedPageId('');
    setMessage('');
    setError('');
  };

  return (
    <div className="app-root with-panel">
      <aside className="config-panel">
        <div className="config-inner">
          <h3>Display Settings</h3>
          <p className="muted">Choose a layout style for the feed.</p>

          <div className="display-options">
            {DISPLAY_OPTIONS.map(opt => (
              <label key={opt.key} className={`display-option ${displayStyle === opt.key ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="displayStyle"
                  value={opt.key}
                  checked={displayStyle === opt.key}
                  onChange={() => setDisplayStyle(opt.key)}
                />
                <div className="option-label"><strong>{opt.label}</strong></div>
              </label>
            ))}
          </div>

          <hr />

          <h4 className="small muted">Add Instagram Account</h4>

          {/* Manual fallback */}
          <div className="form-row">
            <input
              className="input"
              type="text"
              placeholder="Facebook Page ID (manual fallback)"
              value={newPageId}
              onChange={e => setNewPageId(e.target.value)}
            />
            <button className="btn primary" onClick={handleAddAccount}>Add</button>
          </div>

          <div style={{ marginTop: 10 }}>
            {message && <div className="msg success">{message}</div>}
            {error && <div className="msg error">{error}</div>}
          </div>

          <hr />

          <h4 className="small muted">Available Pages</h4>
          <div className="form-row">
            <select
              className="account-select"
              value={selectedPageId}
              onChange={e => handleSelectPage(e.target.value)}
            >
              <option value="">— Select a Facebook Page —</option>
              {pages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.instagram_id ? '• IG connected' : '• no IG'}
                </option>
              ))}
            </select>
            <button className="btn secondary" onClick={handleClearSelection}>Clear</button>
          </div>
          <p className="muted small">Pages shown are those this Business/System User can access.</p>
        </div>
      </aside>

      <div className="main-content">
        <header className="app-header">
          <h1 className="brand">Instagram Feed Widget</h1>
          <p className="subtitle">Pick a Page to view its connected Instagram Business feed.</p>
        </header>

        <main className="app-main">
          <section className="card feed-card">
            <h2 className="card-title">Preview — {displayStyle}</h2>

            {!selectedInstagramId ? (
              <div className="placeholder">No Instagram account selected. Select a Page from the left.</div>
            ) : (
              <EmbedFeed accountKey={selectedInstagramId} displayStyle={displayStyle} />
            )}
          </section>
        </main>

        <footer className="app-footer">
          <small>Built with the Instagram API & Facebook Business System User</small>
        </footer>
      </div>
    </div>
  );
}

export default App;
