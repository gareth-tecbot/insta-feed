import React, { useState, useEffect } from 'react';
import './App.css';
import LoginForm from './components/LoginForm';
import PublicProfileForm from './components/PublicProfileForm';
import InstagramFeed from './components/InstagramFeed';
import LightboxModal from './components/LightboxModal';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [posts, setPosts] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showLightbox, setShowLightbox] = useState(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handlePublicProfile = async (username) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/public-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
        setUsername(username);
        setIsPublicProfile(true);
        setIsLoggedIn(false);
        localStorage.setItem('instagram_public_profile', username);
      } else {
        setError(data.error || 'Failed to load public profile');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Public profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (credentials) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
        setSessionId(data.sessionId);
        setUsername(credentials.username);
        setIsLoggedIn(true);
        localStorage.setItem('instagram_session', JSON.stringify({
          sessionId: data.sessionId,
          username: credentials.username
        }));
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!sessionId || !username) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, sessionId }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
        setSessionId(data.sessionId);
        // Update stored session
        localStorage.setItem('instagram_session', JSON.stringify({
          sessionId: data.sessionId,
          username: username
        }));
      } else {
        if (data.error === 'Session expired. Please login again.') {
          handleLogout();
        } else {
          setError(data.error || 'Refresh failed');
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setIsPublicProfile(false);
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

  // Check for existing session or public profile on component mount
  useEffect(() => {
    const savedSession = localStorage.getItem('instagram_session');
    const savedPublicProfile = localStorage.getItem('instagram_public_profile');
    
    if (savedSession) {
      try {
        const { sessionId: savedSessionId, username: savedUsername } = JSON.parse(savedSession);
        if (savedSessionId && savedUsername) {
          setSessionId(savedSessionId);
          setUsername(savedUsername);
          setIsLoggedIn(true);
          // Try to refresh posts
          handleRefresh();
        }
      } catch (err) {
        console.error('Error parsing saved session:', err);
        localStorage.removeItem('instagram_session');
      }
    } else if (savedPublicProfile) {
      setUsername(savedPublicProfile);
      setIsPublicProfile(true);
      // Load public profile posts
      handlePublicProfile(savedPublicProfile);
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Instagram Feed Widget</h1>
        {isLoggedIn && (
          <div className="header-controls">
            <span className="username">Welcome, @{username}</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="App-main">
        {!isLoggedIn && !isPublicProfile ? (
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
              </div>
            </div>
          </div>
        ) : isPublicProfile && !username ? (
          <PublicProfileForm onViewProfile={handlePublicProfile} loading={loading} error={error} />
        ) : isPublicProfile && username ? (
          <div className="feed-container">
            <div className="feed-header">
              <h2>Public Profile: @{username}</h2>
              <div className="header-actions">
                <button 
                  onClick={() => handlePublicProfile(username)} 
                  disabled={loading}
                  className="refresh-btn"
                >
                  {loading ? 'Refreshing...' : 'Refresh Profile'}
                </button>
                <button onClick={handleLogout} className="logout-btn">
                  Change Profile
                </button>
              </div>
            </div>
            
            {error && (
              <div className="error-message">
                {error}
                <button onClick={() => setError(null)} className="close-error">
                  ×
                </button>
              </div>
            )}
            
            <InstagramFeed 
              posts={posts} 
              onPostClick={handlePostClick}
              loading={loading}
            />
          </div>
        ) : isLoggedIn && !isPublicProfile ? (
          <LoginForm onLogin={handleLogin} loading={loading} error={error} />
        ) : (
          <div className="feed-container">
            <div className="feed-header">
              <h2>Your Instagram Feed</h2>
              <div className="header-actions">
                <button 
                  onClick={handleRefresh} 
                  disabled={loading}
                  className="refresh-btn"
                >
                  {loading ? 'Refreshing...' : 'Refresh Feed'}
                </button>
                <button onClick={handleLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            </div>
            
            {error && (
              <div className="error-message">
                {error}
                <button onClick={() => setError(null)} className="close-error">
                  ×
                </button>
              </div>
            )}
            
            <InstagramFeed 
              posts={posts} 
              onPostClick={handlePostClick}
              loading={loading}
            />
          </div>
        )}
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
