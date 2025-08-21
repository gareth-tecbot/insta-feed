// src/components/InstagramEmbedFeed.jsx
import React, { useState, useEffect } from 'react';
import './EmbedFeed.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EmbedFeed = ({ accountKey, displayStyle = 'grid-4' }) => {
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

  // class to control layout
  const layoutClass = `layout-${displayStyle}`;

  return (
    <div className={`instagram-feed-grid ${layoutClass}`}>
      {posts.map((post) => (
        <article key={post.id} className={`post-card ${displayStyle}`}>
          {displayStyle === 'text-left' ? (
            <div className="text-left-row">
              <div className="media">
                {post.media_type === 'VIDEO' ? (
                  <video src={post.media_url} preload="metadata" muted playsInline />
                ) : (
                  <img src={post.media_url} alt={post.caption || 'Instagram post'} loading="lazy" />
                )}
              </div>
              <div className="text-block">
                <h4 className="post-title">{post.caption ? post.caption.split('\n')[0] : 'Post'}</h4>
                <p className="post-snippet">{post.caption}</p>
                <a className="post-link" href={post.permalink} target="_blank" rel="noopener noreferrer">View on IG</a>
              </div>
            </div>
          ) : displayStyle === 'text-below' ? (
            <>
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="media">
                {post.media_type === 'VIDEO' ? (
                  <video src={post.media_url} preload="metadata" muted playsInline />
                ) : (
                  <img src={post.media_url} alt={post.caption || 'Instagram post'} loading="lazy" />
                )}
              </a>
              <div className="caption-below">
                <p>{post.caption}</p>
              </div>
            </>
          ) : (
            // default overlay styles (grid variants + masonry)
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="media-link">
              <div className="media">
                {post.media_type === 'VIDEO' ? (
                  <video src={post.media_url} preload="metadata" muted playsInline />
                ) : (
                  <img src={post.media_url} alt={post.caption || 'Instagram post'} loading="lazy" />
                )}
              </div>
              <div className="overlay">
                {post.caption && <div className="caption">{post.caption}</div>}
              </div>
            </a>
          )}
        </article>
      ))}
    </div>
  );
};

export default EmbedFeed;
