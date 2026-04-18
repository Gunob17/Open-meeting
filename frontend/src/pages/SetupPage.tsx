import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SetupPageProps {
  onSetupComplete: () => void;
}

type SetupMode = 'select' | 'demo' | 'production';

interface DemoCredential {
  email: string;
  password: string;
  description: string;
}

interface DemoCredentials {
  superAdmin: DemoCredential;
  parkAdmin: DemoCredential;
  companyAdmin: DemoCredential;
  user: DemoCredential;
}

interface DemoResponse {
  success: boolean;
  message: string;
  parks: { name: string; id: string }[];
  credentials: DemoCredentials;
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export function SetupPage({ onSetupComplete }: SetupPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SetupMode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoData, setDemoData] = useState<DemoResponse | null>(null);

  // Production form state
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleDemoSetup = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/setup/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to setup demo');
      }

      setDemoData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleProductionSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (adminPassword !== confirmPassword) {
      setError(t('invite.passwordMismatch'));
      return;
    }

    if (adminPassword.length < 6) {
      setError(t('setup.passwordMinLength'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/setup/production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          companyAddress,
          adminName,
          adminEmail,
          adminPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      onSetupComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  // Mode selection screen
  if (mode === 'select') {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <h1>{t('setup.title')}</h1>
            <p>{t('setup.subtitle')}</p>
          </div>

          <div className="setup-options">
            <div className="setup-option" onClick={() => setMode('demo')}>
              <div className="option-icon">🎮</div>
              <h2>{t('setup.demoMode')}</h2>
              <p>{t('setup.demoDesc')}</p>
              <ul>
                <li>{t('setup.demoFeature1')}</li>
                <li>{t('setup.demoFeature2')}</li>
                <li>{t('setup.demoFeature3')}</li>
              </ul>
              <button className="btn btn-secondary">{t('setup.startDemo')}</button>
            </div>

            <div className="setup-option" onClick={() => setMode('production')}>
              <div className="option-icon">🏢</div>
              <h2>{t('setup.productionMode')}</h2>
              <p>{t('setup.productionDesc')}</p>
              <ul>
                <li>{t('setup.productionFeature1')}</li>
                <li>{t('setup.productionFeature2')}</li>
                <li>{t('setup.productionFeature3')}</li>
              </ul>
              <button className="btn btn-primary">{t('setup.getStarted')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Demo mode result
  if (mode === 'demo' && demoData) {
    return (
      <div className="setup-container">
        <div className="setup-card setup-card-wide">
          <div className="setup-header">
            <h1>{t('setup.demoComplete')}</h1>
            <p>{t('setup.demoCompleteDesc', { count: demoData.parks.length })}</p>
          </div>

          <div className="demo-parks">
            <h3>{t('setup.createdParks')}</h3>
            <div className="parks-list">
              {demoData.parks.map(park => (
                <span key={park.id} className="park-badge">{park.name}</span>
              ))}
            </div>
          </div>

          <div className="demo-credentials">
            <h3>{t('setup.demoAccounts')}</h3>
            <p>{t('setup.demoAccountsDesc')}</p>

            <div className="credentials-grid">
              <div className="credential-card credential-super">
                <div className="credential-role">{t('setup.superAdmin')}</div>
                <p className="credential-desc">{demoData.credentials.superAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>{t('common.email')}:</strong> {demoData.credentials.superAdmin.email}</div>
                  <div><strong>{t('common.password')}:</strong> {demoData.credentials.superAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-park">
                <div className="credential-role">{t('setup.parkAdmin')}</div>
                <p className="credential-desc">{demoData.credentials.parkAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>{t('common.email')}:</strong> {demoData.credentials.parkAdmin.email}</div>
                  <div><strong>{t('common.password')}:</strong> {demoData.credentials.parkAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-company">
                <div className="credential-role">{t('setup.companyAdmin')}</div>
                <p className="credential-desc">{demoData.credentials.companyAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>{t('common.email')}:</strong> {demoData.credentials.companyAdmin.email}</div>
                  <div><strong>{t('common.password')}:</strong> {demoData.credentials.companyAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-user">
                <div className="credential-role">{t('setup.regularUser')}</div>
                <p className="credential-desc">{demoData.credentials.user.description}</p>
                <div className="credential-details">
                  <div><strong>{t('common.email')}:</strong> {demoData.credentials.user.email}</div>
                  <div><strong>{t('common.password')}:</strong> {demoData.credentials.user.password}</div>
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={onSetupComplete}>
            {t('setup.continueToLogin')}
          </button>
        </div>
      </div>
    );
  }

  // Demo mode confirmation
  if (mode === 'demo') {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <h1>{t('setup.demoSetupTitle')}</h1>
            <p>{t('setup.demoSetupSubtitle')}</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="demo-info">
            <h3>{t('setup.whatWillBeCreated')}:</h3>
            <ul>
              <li>{t('setup.demoItem1')}</li>
              <li>{t('setup.demoItem2')}</li>
              <li>{t('setup.demoItem3')}</li>
              <li>{t('setup.demoItem4')}</li>
            </ul>
          </div>

          <div className="setup-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setMode('select')}
              disabled={loading}
            >
              {t('common.back')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleDemoSetup}
              disabled={loading}
            >
              {loading ? t('setup.creating') : t('setup.createDemoData')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Production mode form
  return (
    <div className="setup-container">
      <div className="setup-card">
        <div className="setup-header">
          <h1>{t('setup.productionTitle')}</h1>
          <p>{t('setup.productionSubtitle')}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleProductionSetup} className="setup-form">
          <div className="form-section">
            <h3>{t('setup.orgDetails')}</h3>

            <div className="form-group">
              <label htmlFor="companyName">{t('setup.orgName')}</label>
              <input
                type="text"
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder={t('setup.orgNamePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="companyAddress">{t('common.address')} *</label>
              <textarea
                id="companyAddress"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                required
                placeholder={t('setup.addressPlaceholder')}
                rows={2}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>{t('setup.superAdminAccount')}</h3>

            <div className="form-group">
              <label htmlFor="adminName">{t('setup.fullName')}</label>
              <input
                type="text"
                id="adminName"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                placeholder={t('setup.fullNamePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="adminEmail">{t('setup.emailAddress')}</label>
              <input
                type="email"
                id="adminEmail"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                placeholder={t('setup.emailPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="adminPassword">{t('setup.passwordLabel')}</label>
              <input
                type="password"
                id="adminPassword"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                minLength={6}
                placeholder={t('setup.passwordPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">{t('setup.confirmPassword')}</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder={t('setup.confirmPlaceholder')}
              />
            </div>
          </div>

          <div className="setup-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setMode('select')}
              disabled={loading}
            >
              {t('common.back')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? t('setup.completing') : t('setup.completeSetup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
