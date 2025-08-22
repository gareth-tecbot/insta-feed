// src/components/InstagramEmbedFeed.jsx
import React, { useEffect, useState } from 'react';
import './EmbedFeed.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const PAGE_LIMIT = 8; // posts per page

const EmbedFeed = ({ accountKey }) => {
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // fetch page (limit + optional after cursor)
  const fetchPage = async ({ after = null, append = false } = {}) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      let url = `${API_BASE_URL}/api/instagram-posts/${accountKey}?limit=${PAGE_LIMIT}`;
      if (after) url += `&after=${encodeURIComponent(after)}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || json.error) throw new Error(json.error || 'Failed to fetch posts');

      const newPosts = json.data || [];
      const next = json.paging?.next_cursor || null;

      if (append) setPosts(prev => [...prev, ...newPosts]);
      else setPosts(newPosts);

      setNextCursor(next);
    } catch (err) {
      console.error('EmbedFeed fetch error:', err);
      setError(err.message || 'Failed to fetch posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // initial load when accountKey changes
  useEffect(() => {
    if (!accountKey) return;
    setPosts([]);
    setNextCursor(null);
    fetchPage({ after: null, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  const handleLoadMore = () => {
    if (!nextCursor) return;
    fetchPage({ after: nextCursor, append: true });
  };

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p style={{ color: 'crimson' }}>Error: {error}</p>;
  if (!posts.length) return <p>No posts found for this account.</p>;

  return (
    <div>
      <div className="instagram-feed-grid layout-grid-4">
        {posts.map(post => (
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
                <video src={post.media_url} preload="metadata" muted playsInline />
              ) : (
                <img src={post.media_url} alt={post.caption || 'Instagram post'} loading="lazy" />
              )}
            </div>

            <div className="overlay">
              {post.caption && <div className="caption">{post.caption}</div>}
            </div>
          </a>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        {nextCursor ? (
          <button
            className="btn primary"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{ padding: '10px 18px', borderRadius: 8 }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          <div style={{ color: '#9aa4b2' }}>No more posts</div>
        )}
      </div>
    </div>
  );
};

export default EmbedFeed;
