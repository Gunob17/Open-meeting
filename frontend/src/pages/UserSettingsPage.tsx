import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import zxcvbn from 'zxcvbn';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import { MeetingRoom, TwoFaSetupResponse, TwoFaStatusResponse, TrustedDeviceInfo, CalendarToken, CalendarTokenCreated, TwoFaLevelEnforcement } from '../types';

type Tab = 'security' | 'calendar' | 'password' | 'organization';

export function UserSettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isCompanyAdmin, isAdmin } = useAuth();

  const getTabFromSearch = (): Tab => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'calendar') return 'calendar';
    if (tab === 'password') return 'password';
    if (tab === 'organization') return 'organization';
    return 'security';
  };

  const [activeTab, setActiveTab] = useState<Tab>(getTabFromSearch);
  const { startTour } = useTour();

  const handleStartTour = async () => {
    await api.tourReset().catch(() => {});
    startTour();
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    navigate(`/account/settings?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    setActiveTab(getTabFromSearch());
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Settings</h1>
        <button className="btn btn-secondary btn-sm" onClick={handleStartTour}>
          Show guided tour
        </button>
      </div>

      <div className="tab-nav" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)', display: 'flex', gap: '0' }}>
        <button
          className={`tab-btn${activeTab === 'security' ? ' tab-btn--active' : ''}`}
          onClick={() => switchTab('security')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            borderBottom: activeTab === 'security' ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'security' ? 600 : 400,
            color: activeTab === 'security' ? 'var(--primary, #3b82f6)' : 'inherit',
          }}
        >
          Security
        </button>
        <button
          className={`tab-btn${activeTab === 'calendar' ? ' tab-btn--active' : ''}`}
          onClick={() => switchTab('calendar')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            borderBottom: activeTab === 'calendar' ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'calendar' ? 600 : 400,
            color: activeTab === 'calendar' ? 'var(--primary, #3b82f6)' : 'inherit',
          }}
        >
          Calendar
        </button>
        {(!user?.authSource || user.authSource === 'local') && (
          <button
            className={`tab-btn${activeTab === 'password' ? ' tab-btn--active' : ''}`}
            onClick={() => switchTab('password')}
            style={{
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderBottom: activeTab === 'password' ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'password' ? 600 : 400,
              color: activeTab === 'password' ? 'var(--primary, #3b82f6)' : 'inherit',
            }}
          >
            Password
          </button>
        )}
        {isCompanyAdmin && !isAdmin && (
          <button
            className={`tab-btn${activeTab === 'organization' ? ' tab-btn--active' : ''}`}
            onClick={() => switchTab('organization')}
            style={{
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderBottom: activeTab === 'organization' ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'organization' ? 600 : 400,
              color: activeTab === 'organization' ? 'var(--primary, #3b82f6)' : 'inherit',
            }}
          >
            Organization
          </button>
        )}
      </div>

      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'calendar' && <CalendarTab hasPark={!!user?.parkId} />}
      {activeTab === 'password' && <PasswordTab />}
      {activeTab === 'organization' && isCompanyAdmin && !isAdmin && (
        <OrganizationTab companyId={user?.companyId ?? ''} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security tab — all content moved from TwoFaSettingsPage
// ---------------------------------------------------------------------------

function SecurityTab() {
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

  if (loading) return <p>Loading...</p>;

  // Show backup codes full-screen within tab
  if (backupCodes) {
    return (
      <div className="card">
        <h2>Backup Codes</h2>
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
    );
  }

  return (
    <>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar tab — ICS feed token management
// ---------------------------------------------------------------------------

function CalendarTab({ hasPark }: { hasPark: boolean }) {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [tokens, setTokens] = useState<CalendarToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // "My bookings" feed form
  const [myLabel, setMyLabel] = useState('');
  const [myCreating, setMyCreating] = useState(false);
  const [myCreated, setMyCreated] = useState<CalendarTokenCreated | null>(null);

  // "All rooms" feed form
  const [allRoomsLabel, setAllRoomsLabel] = useState('');
  const [allRoomsCreating, setAllRoomsCreating] = useState(false);
  const [allRoomsCreated, setAllRoomsCreated] = useState<CalendarTokenCreated | null>(null);
  const [allRoomsError, setAllRoomsError] = useState('');

  // Room feed form
  const [roomId, setRoomId] = useState('');
  const [roomLabel, setRoomLabel] = useState('');
  const [roomCreating, setRoomCreating] = useState(false);
  const [roomCreated, setRoomCreated] = useState<CalendarTokenCreated | null>(null);

  // Copy-to-clipboard tracking
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const myUrlRef = useRef<HTMLInputElement>(null);
  const allRoomsUrlRef = useRef<HTMLInputElement>(null);
  const roomUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [roomsData, tokensData] = await Promise.all([
        api.getRooms(false),
        api.getCalendarTokens(),
      ]);
      setRooms(roomsData.filter(r => r.isActive && r.calendarFeedEnabled !== false));
      setTokens(tokensData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleCreateMyFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMyCreating(true);
    try {
      const created = await api.createCalendarToken({ scope: 'my_bookings', label: myLabel || undefined });
      setMyCreated(created);
      setMyLabel('');
      setTokens(prev => [{ id: created.id, scope: created.scope, roomId: created.roomId, label: created.label, createdAt: created.createdAt, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create calendar feed');
    } finally {
      setMyCreating(false);
    }
  };

  const handleCreateAllRoomsFeed = async () => {
    setAllRoomsError('');
    setAllRoomsCreating(true);
    try {
      const created = await api.createCalendarToken({ scope: 'park_rooms', label: allRoomsLabel || undefined });
      setAllRoomsCreated(created);
      setAllRoomsLabel('');
      setTokens(prev => [{ id: created.id, scope: created.scope, roomId: created.roomId, label: created.label, createdAt: created.createdAt, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt }, ...prev]);
    } catch (err) {
      setAllRoomsError(err instanceof Error ? err.message : 'Failed to create calendar feed');
    } finally {
      setAllRoomsCreating(false);
    }
  };

  const handleCreateRoomFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    setError('');
    setRoomCreating(true);
    try {
      const created = await api.createCalendarToken({ scope: 'room', roomId, label: roomLabel || undefined });
      setRoomCreated(created);
      setRoomLabel('');
      setTokens(prev => [{ id: created.id, scope: created.scope, roomId: created.roomId, label: created.label, createdAt: created.createdAt, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create calendar feed');
    } finally {
      setRoomCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this calendar feed? Any calendar subscriptions using this URL will stop working.')) return;
    try {
      await api.revokeCalendarToken(id);
      setTokens(prev => prev.filter(t => t.id !== id));
      if (myCreated?.id === id) setMyCreated(null);
      if (allRoomsCreated?.id === id) setAllRoomsCreated(null);
      if (roomCreated?.id === id) setRoomCreated(null);
      setSuccess('Calendar feed revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  const getRoomName = (rId: string | null) => {
    if (!rId) return null;
    return rooms.find(r => r.id === rId)?.name ?? rId;
  };

  if (loading) return <p>Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success}</div>}

      {/* How it works */}
      <div className="card mb-6">
        <h2>Calendar Integration</h2>
        <p>Subscribe to a calendar feed to see bookings directly in your calendar app. Feed URLs are read-only — they cannot be used to create or modify bookings.</p>
        <details style={{ marginTop: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500 }}>How to subscribe in your calendar app</summary>
          <ul style={{ marginTop: '0.5rem', lineHeight: 1.8 }}>
            <li><strong>Google Calendar:</strong> Settings &rsaquo; Other calendars &rsaquo; + &rsaquo; From URL &rsaquo; paste the feed URL</li>
            <li><strong>Outlook:</strong> Add calendar &rsaquo; From internet &rsaquo; paste the feed URL</li>
            <li><strong>Apple Calendar:</strong> File &rsaquo; New Calendar Subscription &rsaquo; paste the feed URL</li>
            <li><strong>Thunderbird:</strong> Calendar tab &rsaquo; New Calendar &rsaquo; On the network &rsaquo; iCalendar (ICS) &rsaquo; paste the feed URL</li>
          </ul>
        </details>
      </div>

      {/* My bookings feed */}
      <div className="card mb-6">
        <h2>My Bookings Feed</h2>
        <p>Subscribe to see all your own bookings in your calendar app.</p>
        {myCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              Feed created! Copy the URL below — it will not be shown again after you leave this section.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                ref={myUrlRef}
                type="text"
                readOnly
                value={myCreated.feedUrl}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(myCreated.feedUrl, myCreated.id)}
              >
                {copiedId === myCreated.id ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setMyCreated(null)}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateMyFeed} style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="myLabel">Label (optional)</label>
              <input
                type="text"
                id="myLabel"
                value={myLabel}
                onChange={e => setMyLabel(e.target.value)}
                placeholder="e.g. My bookings – work calendar"
                maxLength={100}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={myCreating}>
              {myCreating ? 'Creating...' : 'Generate My Bookings Feed'}
            </button>
          </form>
        )}
      </div>

      {/* All rooms feed */}
      <div className="card mb-6">
        <h2>All Rooms Feed</h2>
        <p>Subscribe to a single feed that shows all rooms in your park. Other people's bookings appear as "Booked" to protect privacy.</p>
        {allRoomsCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              Feed created! Copy the URL below — it will not be shown again after you leave this section.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                ref={allRoomsUrlRef}
                type="text"
                readOnly
                value={allRoomsCreated.feedUrl}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(allRoomsCreated.feedUrl, allRoomsCreated.id)}
              >
                {copiedId === allRoomsCreated.id ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setAllRoomsCreated(null)}>
              Done
            </button>
          </div>
        ) : !hasPark ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>
            All-rooms feed is not available for accounts not assigned to a park.
          </p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {allRoomsError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{allRoomsError}</div>}
            <div className="form-group">
              <label htmlFor="allRoomsLabel">Label (optional)</label>
              <input
                type="text"
                id="allRoomsLabel"
                value={allRoomsLabel}
                onChange={e => setAllRoomsLabel(e.target.value)}
                placeholder="e.g. All rooms – work calendar"
                maxLength={100}
              />
            </div>
            <button className="btn btn-primary" onClick={handleCreateAllRoomsFeed} disabled={allRoomsCreating}>
              {allRoomsCreating ? 'Creating...' : 'Generate All Rooms Feed'}
            </button>
          </div>
        )}
      </div>

      {/* Room feed */}
      <div className="card mb-6">
        <h2>Single Room Feed</h2>
        <p>Subscribe to a specific room to see only that room's availability. Other people's bookings appear as "Booked" to protect privacy.</p>
        {rooms.length === 0 ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>No rooms with calendar feeds available.</p>
        ) : roomCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              Feed created! Copy the URL below — it will not be shown again after you leave this section.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                ref={roomUrlRef}
                type="text"
                readOnly
                value={roomCreated.feedUrl}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(roomCreated.feedUrl, roomCreated.id)}
              >
                {copiedId === roomCreated.id ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setRoomCreated(null)}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateRoomFeed} style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="roomSelect">Room</label>
              <select id="roomSelect" value={roomId} onChange={e => setRoomId(e.target.value)} required>
                <option value="">Select a room…</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="roomLabel">Label (optional)</label>
              <input
                type="text"
                id="roomLabel"
                value={roomLabel}
                onChange={e => setRoomLabel(e.target.value)}
                placeholder="e.g. Conference Room A – work calendar"
                maxLength={100}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={roomCreating || !roomId}>
              {roomCreating ? 'Creating...' : 'Generate Room Feed'}
            </button>
          </form>
        )}
      </div>

      {/* Active subscriptions */}
      <div className="card">
        <h2>Active Feed Subscriptions</h2>
        <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Keep these URLs private. Anyone with the URL can read the calendar feed.
        </p>
        {tokens.length === 0 ? (
          <p className="empty-state">No active calendar feeds.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th>Room</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(token => (
                <tr key={token.id}>
                  <td>{token.label || <em style={{ color: 'var(--text-secondary, #6b7280)' }}>Unlabelled</em>}</td>
                  <td>{token.scope === 'my_bookings' ? 'My bookings' : token.scope === 'park_rooms' ? 'All rooms' : 'Room'}</td>
                  <td>{token.scope === 'park_rooms' ? 'All rooms' : (getRoomName(token.roomId) ?? '—')}</td>
                  <td>{new Date(token.createdAt).toLocaleDateString()}</td>
                  <td>{token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                  <td>
                    <button onClick={() => handleRevoke(token.id)} className="btn btn-sm btn-danger">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Organization tab — company 2FA enforcement (company admins only)
// ---------------------------------------------------------------------------

function OrganizationTab({ companyId }: { companyId: string }) {
  const [twofaEnforcement, setTwofaEnforcement] = useState<TwoFaLevelEnforcement>('inherit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!companyId) return;
    api.getCompany(companyId)
      .then(c => setTwofaEnforcement((c.twofaEnforcement as TwoFaLevelEnforcement) || 'inherit'))
      .catch(() => setError('Failed to load company settings'))
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.updateCompanyTwofa(companyId, twofaEnforcement);
      setSuccess('Two-factor authentication settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="card">
      <h2>Two-Factor Authentication</h2>
      <p style={{ color: 'var(--text-secondary, #6b7280)', marginBottom: '1rem' }}>
        Set the 2FA enforcement level for your company. "Inherit" follows the site-wide policy set by your site admin.
      </p>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>}
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="companyTwofaEnforcement">Company Enforcement</label>
          <select
            id="companyTwofaEnforcement"
            value={twofaEnforcement}
            onChange={e => setTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
          >
            <option value="inherit">Inherit — follow site-wide policy</option>
            <option value="optional">Optional — users can enable 2FA voluntarily</option>
            <option value="required">Required — all company members must set up 2FA</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save 2FA Settings'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password tab — change password (local accounts only)
// ---------------------------------------------------------------------------

function PasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Change Password</h2>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="currentPassword">Current Password</label>
          <input
            type="password"
            id="currentPassword"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="form-group">
          <label htmlFor="newPassword">New Password</label>
          <input
            type="password"
            id="newPassword"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {newPassword.length > 0 && (() => {
            const score = zxcvbn(newPassword).score;
            const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
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
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
