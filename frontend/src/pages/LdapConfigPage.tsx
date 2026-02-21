import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { LdapConfig, LdapRoleMapping, LdapSyncResult, Company, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';

export function LdapConfigPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
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

  useEffect(() => {
    if (companyId) loadData();
  }, [companyId]);

  const loadData = async () => {
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
      setError('Failed to load LDAP configuration');
    } finally {
      setLoading(false);
    }
  };

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
        setSuccessMsg('LDAP configuration updated');
      } else {
        // Create new
        if (!formData.bindPassword) {
          setError('Bind password is required for new configurations');
          setSaving(false);
          return;
        }
        await api.createLdapConfig({
          companyId: companyId!,
          ...formData,
          groupSearchBase: formData.groupSearchBase || undefined,
        });
        setSuccessMsg('LDAP configuration created');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
        setSuccessMsg('LDAP disabled');
      } else {
        await api.enableLdap(config.id);
        setSuccessMsg('LDAP enabled');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle LDAP');
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
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' });
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
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!config) return;
    if (!window.confirm('Delete LDAP configuration? LDAP users will no longer be able to log in.')) return;
    try {
      await api.deleteLdapConfig(config.id);
      setConfig(null);
      setSuccessMsg('LDAP configuration deleted');
      setFormData({
        serverUrl: '', bindDn: '', bindPassword: '', searchBase: '',
        userFilter: '(objectClass=inetOrgPerson)', usernameAttribute: 'uid',
        emailAttribute: 'mail', nameAttribute: 'cn', groupSearchBase: '',
        groupFilter: '(objectClass=groupOfNames)', groupMemberAttribute: 'member',
        roleMappings: [], defaultRole: 'user', syncIntervalHours: 24,
        useStarttls: false, tlsRejectUnauthorized: true, connectionTimeoutMs: 10000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
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

  if (loading) return <div className="loading">Loading LDAP configuration...</div>;

  return (
    <div className="ldap-config-page">
      <div className="page-header">
        <div>
          <button className="btn btn-small btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '0.5rem' }}>
            &larr; Back
          </button>
          <h1>LDAP Configuration — {company?.name}</h1>
        </div>
        {config && (
          <div className="action-buttons">
            <button
              className={`btn ${config.isEnabled ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggleEnabled}
            >
              {config.isEnabled ? 'Disable LDAP' : 'Enable LDAP'}
            </button>
            <button className="btn btn-danger btn-small" onClick={handleDeleteConfig}>
              Delete Config
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {config && (
        <div className="status-bar" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <strong>Status:</strong>{' '}
          <span style={{ color: config.isEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
            {config.isEnabled ? 'Enabled' : 'Disabled'}
          </span>
          {config.lastSyncAt && (
            <>
              {' | '}
              <strong>Last Sync:</strong>{' '}
              {new Date(config.lastSyncAt).toLocaleString()} —{' '}
              <span style={{ color: config.lastSyncStatus === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                {config.lastSyncStatus}
              </span>
              {config.lastSyncUserCount !== null && ` (${config.lastSyncUserCount} users)`}
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Connection Settings */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>Connection Settings</h2>
          <div className="form-group">
            <label htmlFor="serverUrl">Server URL *</label>
            <input
              type="text"
              id="serverUrl"
              value={formData.serverUrl}
              onChange={e => setFormData({ ...formData, serverUrl: e.target.value })}
              placeholder="ldaps://ldap.example.com:636"
              required
            />
            <small>Use ldaps:// for SSL or ldap:// with StartTLS</small>
          </div>

          <div className="form-group">
            <label htmlFor="bindDn">Bind DN *</label>
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
              Bind Password {config ? '(leave blank to keep current)' : '*'}
            </label>
            <input
              type="password"
              id="bindPassword"
              value={formData.bindPassword}
              onChange={e => setFormData({ ...formData, bindPassword: e.target.value })}
              placeholder={config ? '********' : 'Enter bind password'}
              required={!config}
            />
          </div>

          <div className="form-group">
            <label htmlFor="searchBase">Search Base *</label>
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
                Use StartTLS
              </label>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.tlsRejectUnauthorized}
                  onChange={e => setFormData({ ...formData, tlsRejectUnauthorized: e.target.checked })}
                />
                Verify TLS Certificate
              </label>
              <small>Uncheck for self-signed certificates</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="connectionTimeoutMs">Connection Timeout (ms)</label>
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
                {testing ? 'Testing...' : 'Test Connection'}
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
          <h2>Attribute Mapping</h2>
          <div className="form-group">
            <label htmlFor="userFilter">User Filter</label>
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
              <label htmlFor="usernameAttribute">Username Attribute</label>
              <input
                type="text"
                id="usernameAttribute"
                value={formData.usernameAttribute}
                onChange={e => setFormData({ ...formData, usernameAttribute: e.target.value })}
                placeholder="uid"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label htmlFor="emailAttribute">Email Attribute</label>
              <input
                type="text"
                id="emailAttribute"
                value={formData.emailAttribute}
                onChange={e => setFormData({ ...formData, emailAttribute: e.target.value })}
                placeholder="mail"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label htmlFor="nameAttribute">Name Attribute</label>
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
          <h2>Group & Role Mapping</h2>
          <div className="form-group">
            <label htmlFor="groupSearchBase">Group Search Base</label>
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
              <label htmlFor="groupFilter">Group Filter</label>
              <input
                type="text"
                id="groupFilter"
                value={formData.groupFilter}
                onChange={e => setFormData({ ...formData, groupFilter: e.target.value })}
                placeholder="(objectClass=groupOfNames)"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="groupMemberAttribute">Group Member Attribute</label>
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
            <label>Role Mappings</label>
            <small style={{ display: 'block', marginBottom: '0.5rem' }}>Map LDAP group DNs to application roles</small>
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
                  <option value="user">User</option>
                  <option value="company_admin">Company Admin</option>
                </select>
                <button type="button" className="btn btn-small btn-danger" onClick={() => removeRoleMapping(index)}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-small btn-secondary" onClick={addRoleMapping}>
              + Add Mapping
            </button>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="defaultRole">Default Role (for unmapped users)</label>
            <select
              id="defaultRole"
              value={formData.defaultRole}
              onChange={e => setFormData({ ...formData, defaultRole: e.target.value })}
            >
              <option value="user">User</option>
              <option value="company_admin">Company Admin</option>
            </select>
          </div>
        </div>

        {/* Sync Settings */}
        <div className="form-section" style={{ marginBottom: '2rem' }}>
          <h2>Sync Settings</h2>
          <div className="form-group">
            <label htmlFor="syncIntervalHours">Automatic Sync Interval</label>
            <select
              id="syncIntervalHours"
              value={formData.syncIntervalHours}
              onChange={e => setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) })}
            >
              <option value={0}>Manual Only</option>
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Every 24 hours</option>
              <option value={48}>Every 48 hours</option>
            </select>
          </div>

          {config && config.isEnabled && (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              {syncResult && (
                <div className="alert alert-success" style={{ marginTop: '0.5rem' }}>
                  <strong>Sync Complete:</strong>{' '}
                  {syncResult.created} created, {syncResult.updated} updated, {syncResult.disabled} disabled, {syncResult.reactivated} reactivated
                  {' '}({syncResult.totalLdapUsers} total LDAP users)
                  {syncResult.errors.length > 0 && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--danger)' }}>
                      <strong>Errors ({syncResult.errors.length}):</strong>
                      <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                        {syncResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {syncResult.errors.length > 5 && <li>...and {syncResult.errors.length - 5} more</li>}
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
            {saving ? 'Saving...' : config ? 'Update Configuration' : 'Create Configuration'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
