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

  const handleLoadMore = () => {
    if (!nextCursor) return;
    fetchPage({ after: nextCursor, append: true });
  };

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p style={{ color: 'crimson' }}>Error: {error}</p>;
  if (!posts.length) return <p>No posts found for this account.</p>;

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
