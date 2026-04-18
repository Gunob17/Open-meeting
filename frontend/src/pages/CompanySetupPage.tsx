import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface Props {
  onComplete: () => void;
}

export function CompanySetupPage({ onComplete }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('companySetup.companyName') + ' ' + t('common.required').toLowerCase());
      return;
    }

    setLoading(true);
    try {
      await api.completeCompanySetup(user!.companyId, { name: name.trim(), address: address.trim() });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{t('companySetup.title')}</h1>
          <p>{t('companySetup.subtitle')}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="companyName">{t('companySetup.companyName')}</label>
            <input
              type="text"
              id="companyName"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('companySetup.companyNamePlaceholder')}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="companyAddress">
              {t('companySetup.address')}{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({t('common.optional').toLowerCase()})</span>
            </label>
            <input
              type="text"
              id="companyAddress"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder={t('companySetup.addressPlaceholder')}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('companySetup.saving') : t('companySetup.continue')}
          </button>
        </form>
      </div>
    </div>
  );
}
