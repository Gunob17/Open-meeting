import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import zxcvbn from 'zxcvbn';

export function CompleteInvitePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('invite.nameRequired'));
      return;
    }

    if (password.length < 8) {
      setError(t('invite.passwordTooShort'));
      return;
    }

    if (zxcvbn(password).score < 2) {
      setError(t('invite.passwordWeak'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('invite.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const response = await api.completeInvite(token!, name.trim(), password);
      api.setToken(response.token);
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invite.setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>{t('invite.accountReady')}</h1>
            <p>{t('invite.redirecting')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{t('invite.title')}</h1>
          <p>{t('invite.subtitle')}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="name">{t('invite.yourName')}</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('invite.namePlaceholder')}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('invite.password')}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('invite.passwordPlaceholder')}
              minLength={8}
              required
            />
            {password.length > 0 && (() => {
              const score = zxcvbn(password).score;
              const labels = [
                t('userSettings.password.strength.veryWeak'),
                t('userSettings.password.strength.weak'),
                t('userSettings.password.strength.fair'),
                t('userSettings.password.strength.strong'),
                t('userSettings.password.strength.veryStrong'),
              ];
              const colors = ['#e53935', '#e53935', '#f57c00', '#43a047', '#1b5e20'];
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0,1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= score ? colors[score] : '#ddd' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: colors[score] }}>{labels[score]}</span>
                </div>
              );
            })()}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('invite.confirmPassword')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('invite.confirmPlaceholder')}
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('invite.settingUp') : t('invite.completeSetup')}
          </button>
        </form>
      </div>
    </div>
  );
}
