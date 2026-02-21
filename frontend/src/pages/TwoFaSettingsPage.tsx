import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TwoFaSetupResponse, TwoFaStatusResponse, TrustedDeviceInfo } from '../types';

export function TwoFaSettingsPage() {
  const [status, setStatus] = useState<TwoFaStatusResponse | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Setup state
  const [setupData, setSetupData] = useState<TwoFaSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable state
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusData, devicesData] = await Promise.all([
        api.twofaGetStatus(),
        api.twofaGetTrustedDevices().catch(() => []),
      ]);
      setStatus(statusData);
      setTrustedDevices(devicesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 2FA status');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setError('');
    setSetupLoading(true);
    try {
      const data = await api.twofaSetup();
      setSetupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSetupLoading(true);
    try {
      const result = await api.twofaSetupConfirm(setupCode);
      setBackupCodes(result.backupCodes);
      setSetupData(null);
      setSetupCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleDismissBackupCodes = () => {
    setBackupCodes(null);
    loadData();
    setSuccess('2FA has been enabled on your account.');
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDisableLoading(true);
    try {
      await api.twofaDisable(disablePassword);
      setShowDisable(false);
      setDisablePassword('');
      loadData();
      setSuccess('2FA has been disabled on your account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    if (!window.confirm('Revoke this trusted device? You will need to verify 2FA again on next login from this device.')) return;
    try {
      await api.twofaRevokeTrustedDevice(id);
      setTrustedDevices(prev => prev.filter(d => d.id !== id));
      setSuccess('Device revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke device');
    }
  };

  const parseUserAgent = (ua: string): string => {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.substring(0, 50);
  };

  if (loading) {
    return <div className="page-container"><p>Loading...</p></div>;
  }

  // Show backup codes
  if (backupCodes) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Backup Codes</h1>
        </div>
        <div className="card">
          <p>Save these backup codes in a safe place. You will need them if you lose access to your authenticator app.</p>
          <div className="backup-codes-grid">
            {backupCodes.map((code, i) => (
              <div key={i} className="backup-code">{code}</div>
            ))}
          </div>
          <p className="backup-codes-warning">
            These codes will not be shown again. Each code can only be used once.
          </p>
          <button onClick={handleDismissBackupCodes} className="btn btn-primary mt-4">
            I've saved my backup codes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Security Settings</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success}</div>}

      {/* 2FA Status */}
      <div className="card mb-6">
        <h2>Two-Factor Authentication</h2>
        <div className="twofa-status-info">
          <p>
            <strong>Status:</strong>{' '}
            <span className={status?.twofaEnabled ? 'status-enabled' : 'status-disabled'}>
              {status?.twofaEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </p>
          <p>
            <strong>Enforcement:</strong>{' '}
            {status?.enforcement === 'required' ? 'Required by your organization' :
             status?.enforcement === 'optional' ? 'Optional' : 'Not enforced'}
          </p>
          {status?.twofaEnabled && (
            <p>
              <strong>Mode:</strong>{' '}
              {status?.mode === 'every_login' ? 'Required every login' : `Trusted devices remembered for ${status?.trustedDeviceDays} days`}
            </p>
          )}
        </div>

        {!status?.twofaEnabled && !setupData && (
          <button onClick={handleStartSetup} className="btn btn-primary mt-4" disabled={setupLoading}>
            {setupLoading ? 'Loading...' : 'Set Up 2FA'}
          </button>
        )}

        {status?.twofaEnabled && !showDisable && (
          <button onClick={() => setShowDisable(true)} className="btn btn-danger mt-4"
            disabled={status?.enforcement === 'required'}>
            {status?.enforcement === 'required' ? '2FA is required by your organization' : 'Disable 2FA'}
          </button>
        )}
      </div>

      {/* Setup flow */}
      {setupData && (
        <div className="card mb-6">
          <h2>Scan QR Code</h2>
          <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
          <div className="twofa-qr-container">
            <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="twofa-qr-code" />
          </div>
          <div className="twofa-secret-display">
            <label>Manual entry key:</label>
            <code className="twofa-secret-code">{setupData.secret}</code>
          </div>
          <form onSubmit={handleConfirmSetup} className="mt-4">
            <div className="form-group">
              <label htmlFor="setupCode">Enter the 6-digit code from your app</label>
              <input
                type="text"
                id="setupCode"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="000000"
                className="twofa-code-input"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={setupLoading || setupCode.length < 6}>
                {setupLoading ? 'Verifying...' : 'Verify and Enable'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSetupData(null); setSetupCode(''); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disable flow */}
      {showDisable && (
        <div className="card mb-6">
          <h2>Disable Two-Factor Authentication</h2>
          <p>Enter your password to confirm disabling 2FA. All trusted devices will be removed.</p>
          <form onSubmit={handleDisable}>
            <div className="form-group">
              <label htmlFor="disablePassword">Password</label>
              <input
                type="password"
                id="disablePassword"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>
            <div className="button-row">
              <button type="submit" className="btn btn-danger" disabled={disableLoading}>
                {disableLoading ? 'Disabling...' : 'Disable 2FA'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowDisable(false); setDisablePassword(''); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Trusted devices */}
      {status?.twofaEnabled && status?.mode === 'trusted_device' && (
        <div className="card">
          <h2>Trusted Devices</h2>
          {trustedDevices.length === 0 ? (
            <p className="empty-state">No trusted devices.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP Address</th>
                  <th>Trusted Since</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trustedDevices.map(device => (
                  <tr key={device.id}>
                    <td>{parseUserAgent(device.deviceName)}</td>
                    <td>{device.ipAddress || 'Unknown'}</td>
                    <td>{new Date(device.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(device.expiresAt).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => handleRevokeDevice(device.id)} className="btn btn-sm btn-danger">
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
