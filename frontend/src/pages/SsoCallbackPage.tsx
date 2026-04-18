import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

export function SsoCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const twofaPending = searchParams.get('twofaPending') === 'true';
    const errorMsg = searchParams.get('error');

    if (errorMsg) {
      // Redirect to login with error code — LoginPage applies an allowlist
      navigate(`/login?error=${encodeURIComponent(errorMsg)}`, { replace: true });
      return;
    }

    if (!token) {
      setError('No authentication token received');
      return;
    }

    // Validate token has the expected JWT format (three base64url segments)
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      setError('Invalid authentication token format');
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
            <h1>{t('ssoCallback.failed')}</h1>
            <p>{error}</p>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => navigate('/login', { replace: true })}
          >
            {t('ssoCallback.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{t('ssoCallback.completing')}</h1>
          <p>{t('ssoCallback.pleaseWait')}</p>
        </div>
      </div>
    </div>
  );
}
