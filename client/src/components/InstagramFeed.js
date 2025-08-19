// InstagramFeed.jsx
import React from "react";
import "./InstagramFeed.css";
import { proxyInstagramUrl } from "../utils/proxy";

/**
 * InstagramFeed component
 * Props:
 * - posts: array of post objects
 * - onPostClick: callback when a post is clicked
 * - loading: boolean
 *
 * All images are proxied through backend /proxy-image to avoid hotlinking/CORS.
 * Set REACT_APP_API_BASE to your backend origin if needed.
 */

const API_BASE = process.env.REACT_APP_API_BASE || "";

const InstagramFeed = ({ posts = [], onPostClick = () => {}, loading = false }) => {
  if (loading && posts.length === 0) {
    return (
      <div className="feed-loading">
        <div className="loading-spinner">
          <span className="spinner" />
          <p>Loading your Instagram feed...</p>
        </div>
      </div>
    );
  }

  if (!loading && posts.length === 0) {
    return (
      <div className="feed-empty">
        <div className="empty-state">
          <div className="empty-icon">📷</div>
          <h3>No posts found</h3>
          <p>We couldn't find any posts in your Instagram profile.</p>
          <p>Make sure your profile is public and contains posts.</p>
        </div>
      </div>
    );
  }

  // Picks best available thumbnail or fallback to display_url
  const pickImageUrl = (post) => {
    if (post.thumbnailResources && post.thumbnailResources.length > 0) {
      const thumb = post.thumbnailResources[post.thumbnailResources.length - 1];
      if (thumb && thumb.src) return thumb.src;
    }
    if (post.imageUrl) return post.imageUrl;
    return null;
  };

  return (
    <div className="instagram-feed">
      <div className="feed-grid">
        {posts.map((post, index) => {
          const upstreamImage = pickImageUrl(post);
          const proxiedSrc = upstreamImage ? proxyInstagramUrl(upstreamImage) : "";

          return (
            <div
              key={`${post.postUrl || post.id}-${index}`}
              className="feed-item"
              onClick={() => onPostClick(post)}
            >
              <div className="post-image-container">
                {proxiedSrc ? (
                  <img
                    src={proxiedSrc}
                    alt={post.caption ? post.caption.slice(0, 120) : `Instagram post ${index + 1}`}
                    className="post-image"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src =
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=";
                    }}
                  />
                ) : (
                  <div className="post-image placeholder">No image</div>
                )}

                <div className="post-overlay">
                  <div className="post-info">
                    <span className="view-post">👁️ View Post</span>
                  </div>
                </div>
              </div>

              {post.caption && (
                <div className="post-caption">
                  <p>{post.caption.length > 100 ? `${post.caption.substring(0, 100)}...` : post.caption}</p>
                </div>
              )}

              <div className="post-meta">
                <span className="post-timestamp">
                  {post.timestamp ? new Date(post.timestamp).toLocaleDateString() : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {loading && posts.length > 0 && (
        <div className="feed-refresh-loading">
          <div className="loading-spinner">
            <span className="spinner" />
            <p>Refreshing feed...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramFeed;
