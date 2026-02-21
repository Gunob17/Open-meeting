import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

export function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const twofaPending = searchParams.get('twofaPending') === 'true';
    const errorMsg = searchParams.get('error');

    if (errorMsg) {
      setError(errorMsg);
      return;
    }

    if (!token) {
      setError('No authentication token received');
      return;
    }

    // Store the token
    api.setToken(token);

    if (twofaPending) {
      // Redirect to login page — the AuthContext will detect the partial token
      // and show the 2FA form
      navigate('/login', { replace: true });
    } else {
      // Full login — redirect to home
      navigate('/', { replace: true });
      // Force a page reload to re-initialize AuthContext with the new token
      window.location.reload();
    }
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>SSO Login Failed</h1>
            <p>{error}</p>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => navigate('/login', { replace: true })}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Completing SSO Login...</h1>
          <p>Please wait while we sign you in.</p>
        </div>
      </div>
    </div>
  );
}
