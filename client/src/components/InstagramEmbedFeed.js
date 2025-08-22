// src/components/EmbedFeed.js
import React, { useEffect, useState } from 'react';
import './EmbedFeed.css';

export default function EmbedFeed({ accountKey, displayStyle }) {
  const [posts, setPosts] = useState([]);

  // Map displayStyle → CSS class
  const layoutClassMap = {
    'grid-2': 'layout-grid-2',
    'grid-3': 'layout-grid-3',
    'grid-4': 'layout-grid-4',
    'text-below': 'layout-grid-3', // grid wrapper, captions handled below
    'text-left': 'layout-grid-2',  // same, custom inner styling
    'masonry': 'layout-masonry'
  };

  const layoutClass = layoutClassMap[displayStyle] || 'layout-grid-4';

  useEffect(() => {
    if (!accountKey) return;

    fetch(`http://localhost:8000/api/instagram-posts/${accountKey}?limit=8`)
      .then(res => res.json())
      .then(data => setPosts(data.data || []))
      .catch(err => console.error(err));
  }, [accountKey]);

  return (
    <div className={`instagram-feed-grid ${layoutClass}`}>
      {posts.map(post => {
        // text-below layout
        if (displayStyle === 'text-below') {
          return (
            <div key={post.id} className="post-card">
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="media-link">
                {post.media_type === 'VIDEO' ? (
                  <video src={post.media_url} controls className="media" />
                ) : (
                  <img src={post.media_url} alt={post.caption} className="media" />
                )}
              </a>
              <div className="caption-below">
                <p>{post.caption}</p>
              </div>
            </div>
          );
        }

        // text-left layout
        if (displayStyle === 'text-left') {
          return (
            <div key={post.id} className="post-card text-left-row">
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="media">
                {post.media_type === 'VIDEO' ? (
                  <video src={post.media_url} controls />
                ) : (
                  <img src={post.media_url} alt={post.caption} />
                )}
              </a>
              <div className="text-block">
                <h4 className="post-title">{post.caption.split('\n')[0]}</h4>
                <p className="post-snippet">{post.caption}</p>
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="post-link">View on IG</a>
              </div>
            </div>
          );
        }

        // default grid/masonry
        return (
          <div key={post.id} className="post-card">
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="media-link">
              {post.media_type === 'VIDEO' ? (
                <video src={post.media_url} controls className="media" />
              ) : (
                <img src={post.media_url} alt={post.caption} className="media" />
              )}
              <div className="overlay">
                <p className="caption">{post.caption}</p>
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
