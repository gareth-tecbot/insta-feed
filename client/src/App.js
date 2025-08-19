import React, { useState, useEffect } from 'react';
import './App.css';
import LoginForm from './components/LoginForm';
import PublicProfileForm from './components/PublicProfileForm';
import InstagramFeed from './components/InstagramFeed';
import LightboxModal from './components/LightboxModal';
import EmbedFeed from './components/InstagramEmbedFeed'; // New component

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [showEmbedFeed, setShowEmbedFeed] = useState(false); // New state
  const [posts, setPosts] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showLightbox, setShowLightbox] = useState(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handleLogout = () => {
    setIsLoggedIn(false);
    setIsPublicProfile(false);
    setShowEmbedFeed(false);
    setPosts([]);
    setSessionId(null);
    setUsername('');
    setSelectedPost(null);
    setShowLightbox(false);
    localStorage.removeItem('instagram_session');
    localStorage.removeItem('instagram_public_profile');
  };

  const handlePostClick = (post) => {
    setSelectedPost(post);
    setShowLightbox(true);
  };

  const closeLightbox = () => {
    setShowLightbox(false);
    setSelectedPost(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Instagram Feed Widget</h1>
        {(isLoggedIn || isPublicProfile || showEmbedFeed) && (
          <div className="header-controls">
            {username && <span className="username">Welcome, @{username}</span>}
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="App-main">
        {!isLoggedIn && !isPublicProfile && !showEmbedFeed ? (
          <div className="mode-selection">
            <div className="mode-container">
              <h2>Choose Your Instagram Experience</h2>
              <div className="mode-buttons">
                <div className="mode-option">
                  <h3>🔓 Public Profile</h3>
                  <p>View any public Instagram profile without logging in</p>
                  <button 
                    onClick={() => setIsPublicProfile(true)}
                    className="mode-btn public-btn"
                  >
                    View Public Profile
                  </button>
                </div>
                <div className="mode-option">
                  <h3>🔐 Private Login</h3>
                  <p>Login with your Instagram account to view your private feed</p>
                  <button 
                    onClick={() => setIsLoggedIn(true)}
                    className="mode-btn login-btn"
                  >
                    Login to Instagram
                  </button>
                </div>
                <div className="mode-option">
                  <h3>✨ Embedded Feed</h3>
                  <p>Load embedded feed from any public profile</p>
                  <button 
                    onClick={() => setShowEmbedFeed(true)}
                    className="mode-btn embed-btn"
                  >
                    Load Embedded Feed
                  </button>
                </div>
              </div>
            </div>
          </div>
       ) : showEmbedFeed ? (
  <div className="embed-feed-container">
    <h2>Embedded Feed</h2>
    <div className="embed-feed-input">
      <input
        type="text"
        placeholder="Enter Instagram username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button
        onClick={() => setShowEmbedFeed(true)}
        disabled={!username.trim()}
        className="mode-btn embed-btn"
      >
        Load Feed
      </button>
    </div>

    {username && <EmbedFeed username={username.trim()} />}
  </div>) : isPublicProfile ? (
          <PublicProfileForm onViewProfile={(username) => {}} loading={loading} error={error} />
        ) : isLoggedIn ? (
          <LoginForm onLogin={(credentials) => {}} loading={loading} error={error} />
        ) : null}
      </main>

      {showLightbox && selectedPost && (
        <LightboxModal
          post={selectedPost}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}

export default App;
