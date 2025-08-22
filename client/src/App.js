// src/App.js
import React, { useEffect, useState } from 'react';
import './App.css';
import './components/EmbedFeed.css';
import EmbedFeed from './components/InstagramEmbedFeed';

const DISPLAY_OPTIONS = [
  { key: 'layout-grid-2', label: 'Grid — 2 columns' },
  { key: 'layout-grid-3', label: 'Grid — 3 columns' },
  { key: 'layout-grid-4', label: 'Grid — 4 columns' },
  { key: 'text-below', label: 'Text Below (3 col)' },
  { key: 'text-left', label: 'Text Left (2 col)' },
  { key: 'layout-masonry', label: 'Masonry (responsive)' },
];

function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [newPageId, setNewPageId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [displayStyle, setDisplayStyle] = useState('layout-grid-4'); // default (matches CSS)
  const [panelOpen, setPanelOpen] = useState(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Load accounts on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/instagram-accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(err => console.error(err));
  }, [API_BASE_URL]);

  // Close mobile panel on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPanelOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close mobile panel if viewport becomes wide
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 900 && panelOpen) setPanelOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelOpen]);

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
    setSelectedAccount('');
    setMessage('');
    setError('');
  };

  return (
    <div className={`app-root ${panelOpen ? 'panel-open' : ''}`}>
      {/* Config panel */}
      <aside className={`config-panel ${panelOpen ? 'open' : ''}`} aria-hidden={!panelOpen && window.innerWidth <= 900}>
        <div className="config-inner">
          <h2>Display Settings</h2>
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
          <input
            className="input"
            type="text"
            placeholder="Facebook Page ID (e.g. 756469077550854)"
            value={newPageId}
            onChange={e => setNewPageId(e.target.value)}
            aria-label="Facebook Page ID"
          />
          <button className="btn primary" onClick={handleAddAccount} style={{ marginTop: 8 }}>Add Account</button>

          <div style={{ marginTop: 10 }}>
            {message && <div className="msg success">{message}</div>}
            {error && <div className="msg error">{error}</div>}
          </div>

          <hr />

          <h4 className="small muted">Accounts</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="select account-select"
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
            >
              <option value="">— Select an account —</option>
              {accounts.map(acc => (
                <option key={acc.instagramId} value={acc.instagramId}>
                  {acc.name}
                </option>
              ))}
            </select>
            <button className="btn secondary" onClick={handleClearSelection}>Clear</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <small className="muted">Tip: Add the Page ID above to connect a new Instagram Business account.</small>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`mobile-panel-overlay ${panelOpen ? 'show' : ''}`}
        onClick={() => setPanelOpen(false)}
        aria-hidden={!panelOpen}
      />

      {/* Main content */}
      <div className={`main-content ${panelOpen ? '' : 'panel-closed'}`}>
        <header className="app-header">
          <div className="header-left">
            <h1 className="brand">Instagram Feed Widget</h1>
            <button
              className="panel-toggle-btn"
              aria-expanded={panelOpen}
              aria-label="Toggle settings panel"
              onClick={() => setPanelOpen(v => !v)}
            >
              ☰
            </button>
          </div>
          <p className="subtitle">Add pages, pick an account and display feeds in a beautiful grid.</p>
        </header>

        <main className="app-main">
          {/* Top row: Add + Select in the grid handled by CSS on the feed card */}
          <section className="card add-card">
            <h2 className="card-title">Add Instagram Account</h2>
            <p className="muted">Enter the Facebook Page ID that is linked to the Instagram Business account.</p>

            <div className="form-row">
              <input
                className="input"
                type="text"
                placeholder="Facebook Page ID (e.g. 756469077550854)"
                value={newPageId}
                onChange={e => setNewPageId(e.target.value)}
                aria-label="Facebook Page ID"
              />
              <button className="btn primary" onClick={handleAddAccount}>Add Account</button>
            </div>

            <div className="messages">
              {message && <div className="msg success">{message}</div>}
              {error && <div className="msg error">{error}</div>}
            </div>
          </section>

          <section className="card select-card">
            <h2 className="card-title">Select Account to View</h2>

            <div className="form-row">
              <select
                className="select account-select"
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                aria-label="Select Instagram account"
              >
                <option value="">— Select an account —</option>
                {accounts.map(acc => (
                  <option key={acc.instagramId} value={acc.instagramId}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <button
                className="btn secondary"
                onClick={() => {
                  setSelectedAccount('');
                  setMessage('');
                  setError('');
                }}
                title="Clear selection"
              >
                Clear
              </button>
            </div>

            <p className="muted small">Tip: Add a Page ID above to connect a new Instagram Business account.</p>
          </section>

          {/* Feed full-width row */}
          <section className="card feed-card feed-preview-card">
            <h2 className="card-title">Preview — {DISPLAY_OPTIONS.find(o=>o.key===displayStyle)?.label}</h2>
            {!selectedAccount ? (
              <div className="placeholder">No account selected. Choose an account to view the feed.</div>
            ) : (
              <div className={`feed-wrapper ${displayStyle}`}>
                <EmbedFeed accountKey={selectedAccount} />
              </div>
            )}
          </section>
        </main>

        <footer className="app-footer">
          <small>Built with the Instagram Graph API • Keep tokens secure on the server</small>
        </footer>
      </div>
    </div>
  );
}

export default App;
