// src/components/InstagramEmbedFeed.jsx
import React, { useState, useEffect } from 'react';
import './EmbedFeed.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EmbedFeed = ({ accountKey }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accountKey) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}/api/instagram-posts/${accountKey}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Failed to fetch posts');
        return json;
      })
      .then((data) => {
        setPosts(data.data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch posts');
        setLoading(false);
      });
  }, [accountKey]);

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p style={{ color: 'crimson' }}>Error: {error}</p>;
  if (!posts.length) return <p>No posts found for this account.</p>;

  return (
    <div className="instagram-feed-grid">
      {posts.map((post) => (
        <a
          key={post.id}
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="post-card"
          aria-label={post.caption ? post.caption : 'Instagram post'}
        >
          <div className="media">
            {post.media_type === 'VIDEO' ? (
              <video
                src={post.media_url}
                preload="metadata"
                muted
                playsInline
              />
            ) : (
              <img
                src={post.media_url}
                alt={post.caption || 'Instagram post'}
                loading="lazy"
              />
            )}
          </div>

          <div className="overlay">
            {post.caption && (
              <div className="caption">
                {post.caption}
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
};

export default EmbedFeed;
