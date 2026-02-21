import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { SsoConfig, SsoProtocol, Company } from '../types';

export function SsoConfigPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [protocol, setProtocol] = useState<SsoProtocol>('oidc');
  const [displayName, setDisplayName] = useState('SSO Login');
  // OIDC fields
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcScopes, setOidcScopes] = useState('openid email profile');
  // SAML fields
  const [samlEntryPoint, setSamlEntryPoint] = useState('');
  const [samlIssuer, setSamlIssuer] = useState('');
  const [samlCert, setSamlCert] = useState('');
  // Common
  const [autoCreateUsers, setAutoCreateUsers] = useState(true);
  const [defaultRole, setDefaultRole] = useState('user');
  const [emailDomains, setEmailDomains] = useState('');

  const appUrl = window.location.origin;

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [ssoConfig, companyData] = await Promise.all([
        api.getSsoConfig(companyId),
        api.getCompany(companyId),
      ]);
      setCompany(companyData);
      if (ssoConfig) {
        setConfig(ssoConfig);
        setProtocol(ssoConfig.protocol);
        setDisplayName(ssoConfig.displayName);
        setOidcIssuerUrl(ssoConfig.oidcIssuerUrl || '');
        setOidcClientId(ssoConfig.oidcClientId || '');
        setOidcScopes(ssoConfig.oidcScopes || 'openid email profile');
        setSamlEntryPoint(ssoConfig.samlEntryPoint || '');
        setSamlIssuer(ssoConfig.samlIssuer || '');
        setSamlCert(ssoConfig.samlCert || '');
        setAutoCreateUsers(ssoConfig.autoCreateUsers);
        setDefaultRole(ssoConfig.defaultRole);
        setEmailDomains(ssoConfig.emailDomains.join(', '));
      }
    } catch (err) {
      console.error('Failed to load SSO config:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const domains = emailDomains
        .split(',')
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0);

      const data: any = {
        protocol,
        displayName,
        oidcIssuerUrl: protocol === 'oidc' ? oidcIssuerUrl : null,
        oidcClientId: protocol === 'oidc' ? oidcClientId : null,
        oidcScopes: protocol === 'oidc' ? oidcScopes : null,
        samlEntryPoint: protocol === 'saml' ? samlEntryPoint : null,
        samlIssuer: protocol === 'saml' ? samlIssuer : null,
        samlCert: protocol === 'saml' ? samlCert : null,
        autoCreateUsers,
        defaultRole,
        emailDomains: domains,
      };

      // Only include client secret if it was changed
      if (oidcClientSecret && protocol === 'oidc') {
        data.oidcClientSecret = oidcClientSecret;
      }

      if (config) {
        const updated = await api.updateSsoConfig(config.id, data);
        setConfig(updated);
        setSuccess('SSO configuration updated');
      } else {
        const created = await api.createSsoConfig({
          companyId: companyId!,
          ...data,
        });
        setConfig(created);
        setSuccess('SSO configuration created');
      }
      setOidcClientSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!config) return;
    setError('');
    setSuccess('');

    try {
      if (config.isEnabled) {
        const updated = await api.disableSso(config.id);
        setConfig(updated);
        setSuccess('SSO disabled');
      } else {
        const updated = await api.enableSso(config.id);
        setConfig(updated);
        setSuccess('SSO enabled');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle SSO');
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    if (!window.confirm('Are you sure you want to delete this SSO configuration? Users authenticated via SSO will no longer be able to log in.')) return;

    try {
      await api.deleteSsoConfig(config.id);
      setConfig(null);
      setProtocol('oidc');
      setDisplayName('SSO Login');
      setOidcIssuerUrl('');
      setOidcClientId('');
      setOidcClientSecret('');
      setOidcScopes('openid email profile');
      setSamlEntryPoint('');
      setSamlIssuer('');
      setSamlCert('');
      setAutoCreateUsers(true);
      setDefaultRole('user');
      setEmailDomains('');
      setSuccess('SSO configuration deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete SSO configuration');
    }
  };

  if (loading) {
    return <div className="loading">Loading SSO configuration...</div>;
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>SSO Configuration — {company?.name || 'Company'}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" style={{ background: 'var(--success)', color: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>{success}</div>}

      <form onSubmit={handleSave}>
        <div className="settings-section">
          <h3>Protocol</h3>
          <div className="form-group">
            <label>
              <input
                type="radio"
                name="protocol"
                value="oidc"
                checked={protocol === 'oidc'}
                onChange={() => setProtocol('oidc')}
                disabled={!!config}
              />
              {' '}OpenID Connect (OIDC) — Keycloak, Azure AD, Okta, Google
            </label>
          </div>
          <div className="form-group">
            <label>
              <input
                type="radio"
                name="protocol"
                value="saml"
                checked={protocol === 'saml'}
                onChange={() => setProtocol('saml')}
                disabled={!!config}
              />
              {' '}SAML 2.0 — ADFS, Shibboleth, OneLogin
            </label>
          </div>
          {config && (
            <small style={{ color: 'var(--text-muted)' }}>Protocol cannot be changed after creation. Delete and recreate to change.</small>
          )}
        </div>

        {protocol === 'oidc' && (
          <div className="settings-section">
            <h3>OIDC Settings</h3>
            <div className="form-group">
              <label htmlFor="oidcIssuerUrl">Issuer URL *</label>
              <input
                type="url"
                id="oidcIssuerUrl"
                value={oidcIssuerUrl}
                onChange={e => setOidcIssuerUrl(e.target.value)}
                placeholder="https://keycloak.example.com/realms/myrealm"
                required={protocol === 'oidc'}
              />
              <small>The OIDC provider's issuer URL (supports auto-discovery via .well-known)</small>
            </div>
            <div className="form-group">
              <label htmlFor="oidcClientId">Client ID *</label>
              <input
                type="text"
                id="oidcClientId"
                value={oidcClientId}
                onChange={e => setOidcClientId(e.target.value)}
                placeholder="open-meeting"
                required={protocol === 'oidc'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="oidcClientSecret">
                Client Secret {config ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                id="oidcClientSecret"
                value={oidcClientSecret}
                onChange={e => setOidcClientSecret(e.target.value)}
                placeholder={config ? '••••••••' : 'Enter client secret'}
                required={!config && protocol === 'oidc'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="oidcScopes">Scopes</label>
              <input
                type="text"
                id="oidcScopes"
                value={oidcScopes}
                onChange={e => setOidcScopes(e.target.value)}
                placeholder="openid email profile"
              />
            </div>
            <div className="form-group">
              <label>Callback URL (configure in your IdP)</label>
              <input
                type="text"
                readOnly
                value={`${appUrl}/api/sso/callback/oidc`}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
            </div>
          </div>
        )}

        {protocol === 'saml' && (
          <div className="settings-section">
            <h3>SAML Settings</h3>
            <div className="form-group">
              <label htmlFor="samlEntryPoint">IdP SSO URL *</label>
              <input
                type="url"
                id="samlEntryPoint"
                value={samlEntryPoint}
                onChange={e => setSamlEntryPoint(e.target.value)}
                placeholder="https://idp.example.com/sso/saml"
                required={protocol === 'saml'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="samlIssuer">SP Entity ID</label>
              <input
                type="text"
                id="samlIssuer"
                value={samlIssuer}
                onChange={e => setSamlIssuer(e.target.value)}
                placeholder={`${appUrl}/api/sso/saml/metadata/${config?.id || '<config-id>'}`}
              />
              <small>Leave blank to use the auto-generated metadata URL</small>
            </div>
            <div className="form-group">
              <label htmlFor="samlCert">IdP Certificate (PEM)</label>
              <textarea
                id="samlCert"
                value={samlCert}
                onChange={e => setSamlCert(e.target.value)}
                placeholder="Paste the IdP signing certificate here (PEM format without headers)"
                rows={5}
              />
            </div>
            <div className="form-group">
              <label>ACS / Callback URL (configure in your IdP)</label>
              <input
                type="text"
                readOnly
                value={`${appUrl}/api/sso/callback/saml`}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
            </div>
            {config && (
              <div className="form-group">
                <label>SP Metadata URL</label>
                <input
                  type="text"
                  readOnly
                  value={`${appUrl}/api/sso/saml/metadata/${config.id}`}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
              </div>
            )}
          </div>
        )}

        <div className="settings-section">
          <h3>User Provisioning</h3>
          <div className="form-group">
            <label htmlFor="displayName">SSO Button Label</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Login with SSO"
            />
            <small>Text shown on the SSO button on the login page</small>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoCreateUsers}
                onChange={e => setAutoCreateUsers(e.target.checked)}
              />
              Auto-create users on first SSO login (JIT provisioning)
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="defaultRole">Default Role for new users</label>
            <select
              id="defaultRole"
              value={defaultRole}
              onChange={e => setDefaultRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="company_admin">Company Admin</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="emailDomains">Allowed Email Domains</label>
            <input
              type="text"
              id="emailDomains"
              value={emailDomains}
              onChange={e => setEmailDomains(e.target.value)}
              placeholder="example.com, company.org"
            />
            <small>Comma-separated. Leave empty to allow all domains.</small>
          </div>
        </div>

        <div className="settings-section" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : config ? 'Update Configuration' : 'Create Configuration'}
          </button>
          {config && (
            <>
              <button
                type="button"
                className={`btn ${config.isEnabled ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleToggleEnabled}
              >
                {config.isEnabled ? 'Disable SSO' : 'Enable SSO'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
              >
                Delete Configuration
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
