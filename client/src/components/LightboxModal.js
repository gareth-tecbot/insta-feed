import React, { useEffect } from 'react';
import './LightboxModal.css';

const LightboxModal = ({ post, onClose }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (e.target.classList.contains('lightbox-overlay')) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('click', handleClickOutside);

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('click', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const handleImageClick = (e) => {
    e.stopPropagation();
  };

  const openInInstagram = () => {
    window.open(post.postUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="lightbox-overlay">
      <div className="lightbox-modal">
        <button className="lightbox-close" onClick={onClose}>
          ×
        </button>
        
        <div className="lightbox-content">
          <div className="lightbox-image-container" onClick={handleImageClick}>
            <img
              src={post.imageUrl}
              alt="Instagram post"
              className="lightbox-image"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
              }}
            />
          </div>
          
          <div className="lightbox-info">
            {post.caption && (
              <div className="lightbox-caption">
                <h3>Caption</h3>
                <p>{post.caption}</p>
              </div>
            )}
            
            <div className="lightbox-meta">
              <div className="meta-item">
                <span className="meta-label">Posted:</span>
                <span className="meta-value">
                  {new Date(post.timestamp).toLocaleString()}
                </span>
              </div>
              
              <div className="meta-item">
                <span className="meta-label">Post URL:</span>
                <a 
                  href={post.postUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="meta-link"
                >
                  View on Instagram
                </a>
              </div>
            </div>
            
            <div className="lightbox-actions">
              <button 
                onClick={openInInstagram}
                className="instagram-button"
              >
                📱 Open in Instagram
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LightboxModal;
