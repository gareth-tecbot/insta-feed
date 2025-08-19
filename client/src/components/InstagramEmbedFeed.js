import React, { useEffect, useState } from 'react';
import './EmbedFeed.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EmbedFeed = ({ username }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;

    const fetchPosts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/embed-feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await response.json();
        if (data.success) {
          setPosts(data.posts);
        } else {
          setError(data.error || 'Failed to load posts');
        }
      } catch (err) {
        setError('Network error. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [username]);

  if (!username) return null;

  return (
    <div className="embed-feed">
      <h3>Instagram Feed: @{username}</h3>
      {loading && <p>Loading posts...</p>}
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {posts.map(post => (
          <div key={post.id} className="post">
            <img src={post.image} alt={post.caption} />
            <p>{post.caption}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmbedFeed;
