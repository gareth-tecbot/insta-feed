// src/App.js
import React, { useState, useEffect } from 'react';
import './App.css';
import EmbedFeed from './components/InstagramEmbedFeed';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [newPageId, setNewPageId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Load accounts on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/instagram-accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(err => console.error(err));
  }, [API_BASE_URL]);

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

  return (
    <div className="app-root">
      <header className="app-header">
        <h1 className="brand">Instagram Feed Widget</h1>
        <p className="subtitle">Add pages, pick an account and display feeds in a beautiful grid.</p>
      </header>

      <main className="app-main">
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
              className="account-select"
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

        <section className="card feed-card">
          <h2 className="card-title">Preview</h2>
          {!selectedAccount ? (
            <div className="placeholder">No account selected. Choose an account to view the feed.</div>
          ) : (
            <EmbedFeed accountKey={selectedAccount} />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <small>Built with the Instagram Graph API • Keep tokens secure on the server</small>
      </footer>
    </div>
  );
}

export default App;
