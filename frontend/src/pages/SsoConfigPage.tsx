import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { SsoConfig, SsoProtocol, Company } from '../types';
import { useConfirm } from '../context/ConfirmContext';

export function SsoConfigPage() {
  const { t } = useTranslation();
  const { companyId } = useParams<{ companyId: string }>();
  const showConfirm = useConfirm();
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
        setSuccess(t('sso.updated'));
      } else {
        const created = await api.createSsoConfig({
          companyId: companyId!,
          ...data,
        });
        setConfig(created);
        setSuccess(t('sso.created'));
      }
      setOidcClientSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sso.failedSave'));
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
        setSuccess(t('sso.ssoDisabled'));
      } else {
        const updated = await api.enableSso(config.id);
        setConfig(updated);
        setSuccess(t('sso.ssoEnabled'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sso.failedToggle'));
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    if (!await showConfirm({ message: t('sso.deleteConfirm'), title: t('sso.deleteConfirmTitle'), confirmLabel: t('common.delete') })) return;

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
      setSuccess(t('sso.deleted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sso.failedDelete'));
    }
  };

  if (loading) {
    return <div className="loading">{t('sso.loading')}</div>;
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>{t('sso.title', { company: company?.name || '' })}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" style={{ background: 'var(--success)', color: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>{success}</div>}

      <form onSubmit={handleSave}>
        <div className="settings-section">
          <h3>{t('sso.protocol')}</h3>
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
              {' '}{t('sso.oidcLabel')}
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
              {' '}{t('sso.samlLabel')}
            </label>
          </div>
          {config && (
            <small style={{ color: 'var(--text-muted)' }}>{t('sso.protocolLocked')}</small>
          )}
        </div>

        {protocol === 'oidc' && (
          <div className="settings-section">
            <h3>{t('sso.oidcSettings')}</h3>
            <div className="form-group">
              <label htmlFor="oidcIssuerUrl">{t('sso.issuerUrl')}</label>
              <input
                type="url"
                id="oidcIssuerUrl"
                value={oidcIssuerUrl}
                onChange={e => setOidcIssuerUrl(e.target.value)}
                placeholder="https://keycloak.example.com/realms/myrealm"
                required={protocol === 'oidc'}
              />
              <small>{t('sso.issuerUrlDesc')}</small>
            </div>
            <div className="form-group">
              <label htmlFor="oidcClientId">{t('sso.clientId')}</label>
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
                {config ? t('sso.clientSecret') : t('sso.clientSecretNew')}
              </label>
              <input
                type="password"
                id="oidcClientSecret"
                value={oidcClientSecret}
                onChange={e => setOidcClientSecret(e.target.value)}
                placeholder={config ? '••••••••' : ''}
                required={!config && protocol === 'oidc'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="oidcScopes">{t('sso.scopes')}</label>
              <input
                type="text"
                id="oidcScopes"
                value={oidcScopes}
                onChange={e => setOidcScopes(e.target.value)}
                placeholder="openid email profile"
              />
            </div>
            <div className="form-group">
              <label>{t('sso.callbackUrl')}</label>
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
            <h3>{t('sso.samlSettings')}</h3>
            <div className="form-group">
              <label htmlFor="samlEntryPoint">{t('sso.idpSsoUrl')}</label>
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
              <label htmlFor="samlIssuer">{t('sso.spEntityId')}</label>
              <input
                type="text"
                id="samlIssuer"
                value={samlIssuer}
                onChange={e => setSamlIssuer(e.target.value)}
                placeholder={`${appUrl}/api/sso/saml/metadata/${config?.id || '<config-id>'}`}
              />
              <small>{t('sso.spEntityIdDesc')}</small>
            </div>
            <div className="form-group">
              <label htmlFor="samlCert">{t('sso.idpCertificate')}</label>
              <textarea
                id="samlCert"
                value={samlCert}
                onChange={e => setSamlCert(e.target.value)}
                placeholder={t('sso.idpCertificateDesc')}
                rows={5}
              />
            </div>
            <div className="form-group">
              <label>{t('sso.acsUrl')}</label>
              <input
                type="text"
                readOnly
                value={`${appUrl}/api/sso/callback/saml`}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
            </div>
            {config && (
              <div className="form-group">
                <label>{t('sso.spMetadataUrl')}</label>
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
          <h3>{t('sso.provisioning')}</h3>
          <div className="form-group">
            <label htmlFor="displayName">{t('sso.ssoButtonLabel')}</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('sso.ssoButtonDefault')}
            />
            <small>{t('sso.ssoButtonDesc')}</small>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoCreateUsers}
                onChange={e => setAutoCreateUsers(e.target.checked)}
              />
              {t('sso.autoCreate')}
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="defaultRole">{t('sso.defaultRole')}</label>
            <select
              id="defaultRole"
              value={defaultRole}
              onChange={e => setDefaultRole(e.target.value)}
            >
              <option value="user">{t('sso.userRole')}</option>
              <option value="company_admin">{t('sso.companyAdminRole')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="emailDomains">{t('sso.allowedDomains')}</label>
            <input
              type="text"
              id="emailDomains"
              value={emailDomains}
              onChange={e => setEmailDomains(e.target.value)}
              placeholder={t('sso.allowedDomainsPlaceholder')}
            />
            <small>{t('sso.allowedDomainsDesc')}</small>
          </div>
        </div>

        <div className="settings-section" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('common.saving') : config ? t('sso.updateConfig') : t('sso.createConfig')}
          </button>
          {config && (
            <>
              <button
                type="button"
                className={`btn ${config.isEnabled ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleToggleEnabled}
              >
                {config.isEnabled ? t('sso.disableSso') : t('sso.enableSso')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
              >
                {t('sso.deleteConfig')}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
