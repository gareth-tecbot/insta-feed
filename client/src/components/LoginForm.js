import React, { useState } from 'react';
import './LoginForm.css';

const LoginForm = ({ onLogin, loading, error }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.username.trim() && formData.password) {
      onLogin(formData);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Instagram Login</h2>
          <p>Enter your Instagram credentials to view your feed</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter your Instagram username"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your Instagram password"
                required
                disabled={loading}
                className="form-input password-input"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="password-toggle"
                disabled={loading}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !formData.username.trim() || !formData.password}
            className="login-button"
          >
            {loading ? (
              <span className="loading-spinner">
                <span className="spinner"></span>
                Logging in...
              </span>
            ) : (
              'Login to Instagram'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p className="security-note">
            🔒 Your credentials are sent securely and never stored on our servers.
            <br />
            We only use them to authenticate with Instagram and scrape your public posts.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
