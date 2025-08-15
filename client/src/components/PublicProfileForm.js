import React, { useState } from 'react';
import './PublicProfileForm.css';

const PublicProfileForm = ({ onViewProfile, loading, error }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onViewProfile(username.trim());
    }
  };

  const handleChange = (e) => {
    setUsername(e.target.value);
  };

  return (
    <div className="public-profile-container">
      <div className="public-profile-card">
        <div className="public-profile-header">
          <h2>🔓 View Public Instagram Profile</h2>
          <p>Enter any public Instagram username to view their posts</p>
        </div>

        <form onSubmit={handleSubmit} className="public-profile-form">
          <div className="form-group">
            <label htmlFor="username">Instagram Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={username}
              onChange={handleChange}
              placeholder="Enter username (e.g., instagram, natgeo)"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="view-profile-button"
          >
            {loading ? (
              <span className="loading-spinner">
                <span className="spinner"></span>
                Loading Profile...
              </span>
            ) : (
              'View Profile'
            )}
          </button>
        </form>

        <div className="public-profile-info">
          <h4>ℹ️ How it works:</h4>
          <ul>
            <li>Only works with public Instagram profiles</li>
            <li>No login required - completely anonymous</li>
            <li>View the latest 12 posts from any public account</li>
            <li>Perfect for businesses, influencers, and public figures</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PublicProfileForm;
