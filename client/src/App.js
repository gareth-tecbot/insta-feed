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

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/instagram-accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(err => console.error(err));
  }, [API_BASE_URL]);

  const handleAddAccount = async () => {
    setError('');
    setMessage('');
    if (!newPageId.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/add-instagram-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: newPageId.trim() })
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
      setError('Failed to add account');
    }
  };

  return (
    <div className="App">
      <h1>Instagram Feed Widget</h1>

      <div className="add-account">
        <h2>Add New Instagram Account</h2>
        <input
          type="text"
          placeholder="Enter Facebook Page ID"
          value={newPageId}
          onChange={e => setNewPageId(e.target.value)}
        />
        <button onClick={handleAddAccount}>Add Account</button>
        {message && <p style={{color:'green'}}>{message}</p>}
        {error && <p style={{color:'crimson'}}>Error: {error}</p>}
      </div>

      <div className="select-account">
        <h2>Select Account to View</h2>
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="">-- Select an account --</option>
          {accounts.map(acc => (
            <option key={acc.instagramId} value={acc.instagramId}>
              {acc.name}
            </option>
          ))}
        </select>
      </div>

      {selectedAccount && <EmbedFeed accountKey={selectedAccount} />}
    </div>
  );
}

export default App;
