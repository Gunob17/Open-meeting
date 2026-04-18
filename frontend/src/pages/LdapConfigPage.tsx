import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { LdapConfig, LdapRoleMapping, LdapSyncResult, Company } from '../types';
import { useConfirm } from '../context/ConfirmContext';

export function LdapConfigPage() {
  const { t } = useTranslation();
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const showConfirm = useConfirm();
  const [company, setCompany] = useState<Company | null>(null);
  const [config, setConfig] = useState<LdapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; userCount?: number } | null>(null);
  const [syncResult, setSyncResult] = useState<LdapSyncResult | null>(null);

  const [formData, setFormData] = useState({
    serverUrl: '',
    bindDn: '',
    bindPassword: '',
    searchBase: '',
    userFilter: '(objectClass=inetOrgPerson)',
    usernameAttribute: 'uid',
    emailAttribute: 'mail',
    nameAttribute: 'cn',
    groupSearchBase: '',
    groupFilter: '(objectClass=groupOfNames)',
    groupMemberAttribute: 'member',
    roleMappings: [] as LdapRoleMapping[],
    defaultRole: 'user',
    syncIntervalHours: 24,
    useStarttls: false,
    tlsRejectUnauthorized: true,
    connectionTimeoutMs: 10000,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [companyData, configData] = await Promise.all([
        api.getCompany(companyId!),
        api.getLdapConfig(companyId!),
      ]);
      setCompany(companyData);
      if (configData) {
        setConfig(configData);
        setFormData({
          serverUrl: configData.serverUrl,
          bindDn: configData.bindDn,
          bindPassword: '', // Never pre-filled
          searchBase: configData.searchBase,
          userFilter: configData.userFilter,
          usernameAttribute: configData.usernameAttribute,
          emailAttribute: configData.emailAttribute,
          nameAttribute: configData.nameAttribute,
          groupSearchBase: configData.groupSearchBase || '',
          groupFilter: configData.groupFilter || '(objectClass=groupOfNames)',
          groupMemberAttribute: configData.groupMemberAttribute,
          roleMappings: configData.roleMappings || [],
          defaultRole: configData.defaultRole,
          syncIntervalHours: configData.syncIntervalHours,
          useStarttls: configData.useStarttls,
          tlsRejectUnauthorized: configData.tlsRejectUnauthorized,
          connectionTimeoutMs: configData.connectionTimeoutMs,
        });
      }
    } catch (err) {
      setError(t('ldap.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    if (companyId) loadData();
  }, [companyId, loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);

    try {
      if (config) {
        // Update existing
        const updateData: any = { ...formData };
        if (!updateData.bindPassword) delete updateData.bindPassword;
        if (!updateData.groupSearchBase) updateData.groupSearchBase = null;
        await api.updateLdapConfig(config.id, updateData);
        setSuccessMsg(t('ldap.updated'));
      } else {
        // Create new
        if (!formData.bindPassword) {
          setError(t('ldap.bindPasswordRequired'));
          setSaving(false);
          return;
        }
        await api.createLdapConfig({
          companyId: companyId!,
          ...formData,
          groupSearchBase: formData.groupSearchBase || undefined,
        });
        setSuccessMsg(t('ldap.created'));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ldap.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!config) return;
    setError('');
    try {
      if (config.isEnabled) {
        await api.disableLdap(config.id);
        setSuccessMsg(t('ldap.ldapDisabled'));
      } else {
        await api.enableLdap(config.id);
        setSuccessMsg(t('ldap.ldapEnabled'));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ldap.failedToggle'));
    }
  };

  const handleTestConnection = async () => {
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testLdapConnection(config.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : t('ldap.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!config) return;
    setSyncing(true);
    setSyncResult(null);
    setError('');
    try {
      const result = await api.syncLdap(config.id);
      setSyncResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ldap.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!config) return;
    if (!await showConfirm({ message: t('ldap.deleteConfirm'), title: t('ldap.deleteConfirmTitle'), confirmLabel: t('common.delete') })) return;
    try {
      await api.deleteLdapConfig(config.id);
      setConfig(null);
      setSuccessMsg(t('ldap.deleted'));
      setFormData({
        serverUrl: '', bindDn: '', bindPassword: '', searchBase: '',
        userFilter: '(objectClass=inetOrgPerson)', usernameAttribute: 'uid',
        emailAttribute: 'mail', nameAttribute: 'cn', groupSearchBase: '',
        groupFilter: '(objectClass=groupOfNames)', groupMemberAttribute: 'member',
        roleMappings: [], defaultRole: 'user', syncIntervalHours: 24,
        useStarttls: false, tlsRejectUnauthorized: true, connectionTimeoutMs: 10000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ldap.failedDelete'));
    }
  };

  const addRoleMapping = () => {
    setFormData({
      ...formData,
      roleMappings: [...formData.roleMappings, { ldapGroupDn: '', appRole: 'user' }],
    });
  };

  const removeRoleMapping = (index: number) => {
    setFormData({
      ...formData,
      roleMappings: formData.roleMappings.filter((_, i) => i !== index),
    });
  };

  const updateRoleMapping = (index: number, field: keyof LdapRoleMapping, value: string) => {
    const updated = [...formData.roleMappings];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, roleMappings: updated });
  };

  if (loading) return <div className="loading">{t('ldap.loading')}</div>;

  return (
    <div className="ldap-config-page">
      <div className="page-header">
        <div>
          <button className="btn btn-small btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '0.5rem' }}>
            &larr; {t('ldap.back')}
          </button>
          <h1>{t('ldap.title', { company: company?.name })}</h1>
        </div>
        {config && (
          <div className="action-buttons">
            <button
              className={`btn ${config.isEnabled ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggleEnabled}
            >
              {config.isEnabled ? t('ldap.disable') : t('ldap.enable')}
            </button>
            <button className="btn btn-danger btn-small" onClick={handleDeleteConfig}>
              {t('ldap.deleteConfig')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {config && (
        <div className="status-bar" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <strong>{t('ldap.status')}:</strong>{' '}
          <span style={{ color: config.isEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
            {config.isEnabled ? t('common.enabled') : t('common.disabled')}
          </span>
          {config.lastSyncAt && (
            <>
              {' | '}
              <strong>{t('ldap.lastSync')}:</strong>{' '}
              {new Date(config.lastSyncAt).toLocaleString()} —{' '}
              <span style={{ color: config.lastSyncStatus === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                {t(`ldap.${config.lastSyncStatus}`)}
              </span>
              {config.lastSyncUserCount !== null && <>{' '}{t('ldap.userCount', { count: config.lastSyncUserCount })}</>}
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Connection Settings */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>{t('ldap.connectionSettings')}</h2>
          <div className="form-group">
            <label htmlFor="serverUrl">{t('ldap.serverUrl')}</label>
            <input
              type="text"
              id="serverUrl"
              value={formData.serverUrl}
              onChange={e => setFormData({ ...formData, serverUrl: e.target.value })}
              placeholder="ldaps://ldap.example.com:636"
              required
            />
            <small>{t('ldap.serverUrlDesc')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="bindDn">{t('ldap.bindDn')}</label>
            <input
              type="text"
              id="bindDn"
              value={formData.bindDn}
              onChange={e => setFormData({ ...formData, bindDn: e.target.value })}
              placeholder="cn=admin,dc=example,dc=com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="bindPassword">
              {config ? t('ldap.bindPassword') : t('ldap.bindPasswordNew')}
            </label>
            <input
              type="password"
              id="bindPassword"
              value={formData.bindPassword}
              onChange={e => setFormData({ ...formData, bindPassword: e.target.value })}
              placeholder={config ? '********' : ''}
              required={!config}
            />
          </div>

          <div className="form-group">
            <label htmlFor="searchBase">{t('ldap.searchBase')}</label>
            <input
              type="text"
              id="searchBase"
              value={formData.searchBase}
              onChange={e => setFormData({ ...formData, searchBase: e.target.value })}
              placeholder="ou=users,dc=example,dc=com"
              required
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.useStarttls}
                  onChange={e => setFormData({ ...formData, useStarttls: e.target.checked })}
                />
                {t('ldap.useStartTls')}
              </label>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.tlsRejectUnauthorized}
                  onChange={e => setFormData({ ...formData, tlsRejectUnauthorized: e.target.checked })}
                />
                {t('ldap.verifyTls')}
              </label>
              <small>{t('ldap.verifyTlsDesc')}</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="connectionTimeoutMs">{t('ldap.timeout')}</label>
            <input
              type="number"
              id="connectionTimeoutMs"
              value={formData.connectionTimeoutMs}
              onChange={e => setFormData({ ...formData, connectionTimeoutMs: parseInt(e.target.value) || 10000 })}
              min={1000}
              max={60000}
            />
          </div>

          {config && (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={handleTestConnection} disabled={testing}>
                {testing ? t('ldap.testing') : t('ldap.testConnection')}
              </button>
              {testResult && (
                <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.5rem' }}>
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attribute Mapping */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>{t('ldap.attributeMapping')}</h2>
          <div className="form-group">
            <label htmlFor="userFilter">{t('ldap.userFilter')}</label>
            <input
              type="text"
              id="userFilter"
              value={formData.userFilter}
              onChange={e => setFormData({ ...formData, userFilter: e.target.value })}
              placeholder="(objectClass=inetOrgPerson)"
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label htmlFor="usernameAttribute">{t('ldap.usernameAttr')}</label>
              <input
                type="text"
                id="usernameAttribute"
                value={formData.usernameAttribute}
                onChange={e => setFormData({ ...formData, usernameAttribute: e.target.value })}
                placeholder="uid"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label htmlFor="emailAttribute">{t('ldap.emailAttr')}</label>
              <input
                type="text"
                id="emailAttribute"
                value={formData.emailAttribute}
                onChange={e => setFormData({ ...formData, emailAttribute: e.target.value })}
                placeholder="mail"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label htmlFor="nameAttribute">{t('ldap.nameAttr')}</label>
              <input
                type="text"
                id="nameAttribute"
                value={formData.nameAttribute}
                onChange={e => setFormData({ ...formData, nameAttribute: e.target.value })}
                placeholder="cn"
              />
            </div>
          </div>
        </div>

        {/* Group & Role Mapping */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>{t('ldap.groupMapping')}</h2>
          <div className="form-group">
            <label htmlFor="groupSearchBase">{t('ldap.groupSearchBase')}</label>
            <input
              type="text"
              id="groupSearchBase"
              value={formData.groupSearchBase}
              onChange={e => setFormData({ ...formData, groupSearchBase: e.target.value })}
              placeholder="ou=groups,dc=example,dc=com (optional)"
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="groupFilter">{t('ldap.groupFilter')}</label>
              <input
                type="text"
                id="groupFilter"
                value={formData.groupFilter}
                onChange={e => setFormData({ ...formData, groupFilter: e.target.value })}
                placeholder="(objectClass=groupOfNames)"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="groupMemberAttribute">{t('ldap.groupMemberAttr')}</label>
              <input
                type="text"
                id="groupMemberAttribute"
                value={formData.groupMemberAttribute}
                onChange={e => setFormData({ ...formData, groupMemberAttribute: e.target.value })}
                placeholder="member"
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label>{t('ldap.roleMappings')}</label>
            <small style={{ display: 'block', marginBottom: '0.5rem' }}>{t('ldap.roleMappingsDesc')}</small>
            {formData.roleMappings.map((mapping, index) => (
              <div key={index} className="form-row" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={mapping.ldapGroupDn}
                  onChange={e => updateRoleMapping(index, 'ldapGroupDn', e.target.value)}
                  placeholder="cn=admins,ou=groups,dc=example,dc=com"
                  style={{ flex: 2 }}
                />
                <select
                  value={mapping.appRole}
                  onChange={e => updateRoleMapping(index, 'appRole', e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="user">{t('ldap.userRole')}</option>
                  <option value="company_admin">{t('ldap.companyAdminRole')}</option>
                </select>
                <button type="button" className="btn btn-small btn-danger" onClick={() => removeRoleMapping(index)}>
                  {t('common.delete')}
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-small btn-secondary" onClick={addRoleMapping}>
              {t('ldap.addMapping')}
            </button>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="defaultRole">{t('ldap.defaultRole')}</label>
            <select
              id="defaultRole"
              value={formData.defaultRole}
              onChange={e => setFormData({ ...formData, defaultRole: e.target.value })}
            >
              <option value="user">{t('ldap.userRole')}</option>
              <option value="company_admin">{t('ldap.companyAdminRole')}</option>
            </select>
          </div>
        </div>

        {/* Sync Settings */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>{t('ldap.syncSettings')}</h2>
          <div className="form-group">
            <label htmlFor="syncIntervalHours">{t('ldap.syncInterval')}</label>
            <select
              id="syncIntervalHours"
              value={formData.syncIntervalHours}
              onChange={e => setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) })}
            >
              <option value={0}>{t('ldap.syncIntervals.manual')}</option>
              <option value={6}>{t('ldap.syncIntervals.6h')}</option>
              <option value={12}>{t('ldap.syncIntervals.12h')}</option>
              <option value={24}>{t('ldap.syncIntervals.24h')}</option>
              <option value={48}>{t('ldap.syncIntervals.48h')}</option>
            </select>
          </div>

          {config && config.isEnabled && (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                {syncing ? t('ldap.syncing') : t('ldap.syncNow')}
              </button>
              {syncResult && (
                <div className="alert alert-success" style={{ marginTop: '0.5rem' }}>
                  {t('ldap.syncResult', {
                    created: syncResult.created,
                    updated: syncResult.updated,
                    disabled: syncResult.disabled,
                    reactivated: syncResult.reactivated,
                    total: syncResult.totalLdapUsers,
                  })}
                  {syncResult.errors.length > 0 && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--danger)' }}>
                      <strong>{t('ldap.errors', { count: syncResult.errors.length })}:</strong>
                      <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                        {syncResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {syncResult.errors.length > 5 && <li>{t('ldap.andMore', { count: syncResult.errors.length - 5 })}</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('common.saving') : config ? t('ldap.updateConfig') : t('ldap.createConfig')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
