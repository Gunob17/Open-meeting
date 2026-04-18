import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import zxcvbn from 'zxcvbn';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSettings, Language } from '../context/SettingsContext';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { MeetingRoom, TwoFaSetupResponse, TwoFaStatusResponse, TrustedDeviceInfo, CalendarToken, CalendarTokenCreated, TwoFaLevelEnforcement } from '../types';

type Tab = 'security' | 'calendar' | 'password' | 'organization' | 'appearance';

export function UserSettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isCompanyAdmin, isAdmin } = useAuth();

  const getTabFromSearch = (): Tab => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'calendar') return 'calendar';
    if (tab === 'password') return 'password';
    if (tab === 'organization') return 'organization';
    if (tab === 'appearance') return 'appearance';
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
        <h1>{t('userSettings.title')}</h1>
        <button className="btn btn-secondary btn-sm" onClick={handleStartTour}>
          {t('userSettings.showTour')}
        </button>
      </div>

      <div className="tab-nav">
        <button
          className={`tab-btn${activeTab === 'security' ? ' tab-btn--active' : ''}`}
          onClick={() => switchTab('security')}
        >
          {t('userSettings.tabs.security')}
        </button>
        <button
          className={`tab-btn${activeTab === 'calendar' ? ' tab-btn--active' : ''}`}
          onClick={() => switchTab('calendar')}
        >
          {t('userSettings.tabs.calendar')}
        </button>
        {(!user?.authSource || user.authSource === 'local') && (
          <button
            className={`tab-btn${activeTab === 'password' ? ' tab-btn--active' : ''}`}
            onClick={() => switchTab('password')}
          >
            {t('userSettings.tabs.password')}
          </button>
        )}
        {isCompanyAdmin && !isAdmin && (
          <button
            className={`tab-btn${activeTab === 'organization' ? ' tab-btn--active' : ''}`}
            onClick={() => switchTab('organization')}
          >
            {t('userSettings.tabs.organization')}
          </button>
        )}
        <button
          className={`tab-btn${activeTab === 'appearance' ? ' tab-btn--active' : ''}`}
          onClick={() => switchTab('appearance')}
        >
          {t('userSettings.tabs.appearance')}
        </button>
      </div>

      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'calendar' && <CalendarTab hasPark={!!user?.parkId} />}
      {activeTab === 'password' && <PasswordTab />}
      {activeTab === 'organization' && isCompanyAdmin && !isAdmin && (
        <OrganizationTab companyId={user?.companyId ?? ''} />
      )}
      {activeTab === 'appearance' && <AppearanceTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security tab — all content moved from TwoFaSettingsPage
// ---------------------------------------------------------------------------

function SecurityTab() {
  const { t } = useTranslation();
  const showConfirm = useConfirm();
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(err instanceof Error ? err.message : t('userSettings.security.failedLoad'));
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
      setError(err instanceof Error ? err.message : t('userSettings.security.failedSetup'));
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
      setError(err instanceof Error ? err.message : t('userSettings.security.invalidCode'));
    } finally {
      setSetupLoading(false);
    }
  };

  const handleDismissBackupCodes = () => {
    setBackupCodes(null);
    loadData();
    setSuccess(t('userSettings.security.enabled2fa'));
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
      setSuccess(t('userSettings.security.disabled2fa'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.security.failedDisable'));
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    if (!await showConfirm({ message: t('userSettings.security.revokeDeviceConfirm', 'Revoke this trusted device? You will need to verify 2FA again on next login from this device.'), title: t('userSettings.security.revokeDeviceTitle', 'Revoke Trusted Device'), confirmLabel: t('common.revoke'), variant: 'warning' })) return;
    try {
      await api.twofaRevokeTrustedDevice(id);
      setTrustedDevices(prev => prev.filter(d => d.id !== id));
      setSuccess(t('userSettings.security.deviceRevoked'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.security.failedRevoke'));
    }
  };

  const parseUserAgent = (ua: string): string => {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.substring(0, 50);
  };

  if (loading) return <p>{t('common.loading')}</p>;

  // Show backup codes full-screen within tab
  if (backupCodes) {
    return (
      <div className="card">
        <h2>{t('userSettings.security.backupCodes')}</h2>
        <p>{t('userSettings.security.backupCodesDesc')}</p>
        <div className="backup-codes-grid">
          {backupCodes.map((code, i) => (
            <div key={i} className="backup-code">{code}</div>
          ))}
        </div>
        <p className="backup-codes-warning">
          {t('userSettings.security.backupCodesWarning')}
        </p>
        <button onClick={handleDismissBackupCodes} className="btn btn-primary mt-4">
          {t('userSettings.security.savedCodes')}
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
        <h2>{t('userSettings.security.twofa')}</h2>
        <div className="twofa-status-info">
          <p>
            <strong>{t('userSettings.security.statusLabel')}</strong>{' '}
            <span className={status?.twofaEnabled ? 'status-enabled' : 'status-disabled'}>
              {status?.twofaEnabled ? t('userSettings.security.statusEnabled') : t('userSettings.security.statusDisabled')}
            </span>
          </p>
          <p>
            <strong>{t('userSettings.security.enforcement')}</strong>{' '}
            {status?.enforcement === 'required' ? t('userSettings.security.enforcementRequired') :
             status?.enforcement === 'optional' ? t('userSettings.security.enforcementOptional') : t('userSettings.security.enforcementNone')}
          </p>
          {status?.twofaEnabled && (
            <p>
              <strong>{t('userSettings.security.mode')}</strong>{' '}
              {status?.mode === 'every_login' ? t('userSettings.security.modeEveryLogin') : t('userSettings.security.modeTrustedDevice', { days: status?.trustedDeviceDays })}
            </p>
          )}
        </div>

        {!status?.twofaEnabled && !setupData && (
          <button onClick={handleStartSetup} className="btn btn-primary mt-4" disabled={setupLoading}>
            {setupLoading ? t('userSettings.security.loading') : t('userSettings.security.setUp2fa')}
          </button>
        )}

        {status?.twofaEnabled && !showDisable && (
          <button onClick={() => setShowDisable(true)} className="btn btn-danger mt-4"
            disabled={status?.enforcement === 'required'}>
            {status?.enforcement === 'required' ? t('userSettings.security.requiredByOrg') : t('userSettings.security.disable2fa')}
          </button>
        )}
      </div>

      {/* Setup flow */}
      {setupData && (
        <div className="card mb-6">
          <h2>{t('userSettings.security.scanQr')}</h2>
          <p>{t('userSettings.security.scanDesc')}</p>
          <div className="twofa-qr-container">
            <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="twofa-qr-code" />
          </div>
          <div className="twofa-secret-display">
            <label>{t('userSettings.security.manualKey')}</label>
            <code className="twofa-secret-code">{setupData.secret}</code>
          </div>
          <form onSubmit={handleConfirmSetup} className="mt-4">
            <div className="form-group">
              <label htmlFor="setupCode">{t('userSettings.security.enterSixDigit')}</label>
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
                {setupLoading ? t('userSettings.security.verifying') : t('userSettings.security.verifyAndEnable')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSetupData(null); setSetupCode(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disable flow */}
      {showDisable && (
        <div className="card mb-6">
          <h2>{t('userSettings.security.disableTitle')}</h2>
          <p>{t('userSettings.security.disableDesc')}</p>
          <form onSubmit={handleDisable}>
            <div className="form-group">
              <label htmlFor="disablePassword">{t('common.password')}</label>
              <input
                type="password"
                id="disablePassword"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                placeholder={t('login.passwordPlaceholder')}
              />
            </div>
            <div className="button-row">
              <button type="submit" className="btn btn-danger" disabled={disableLoading}>
                {disableLoading ? t('userSettings.security.disabling') : t('userSettings.security.disable')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowDisable(false); setDisablePassword(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Trusted devices */}
      {status?.twofaEnabled && status?.mode === 'trusted_device' && (
        <div className="card">
          <h2>{t('userSettings.security.trustedDevices')}</h2>
          {trustedDevices.length === 0 ? (
            <p className="empty-state">{t('userSettings.security.noTrustedDevices')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('userSettings.security.device')}</th>
                  <th>{t('userSettings.security.ipAddress')}</th>
                  <th>{t('userSettings.security.trustedSince')}</th>
                  <th>{t('userSettings.security.expires')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {trustedDevices.map(device => (
                  <tr key={device.id}>
                    <td>{parseUserAgent(device.deviceName)}</td>
                    <td>{device.ipAddress || t('common.unknown')}</td>
                    <td>{new Date(device.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(device.expiresAt).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => handleRevokeDevice(device.id)} className="btn btn-sm btn-danger">
                        {t('common.revoke')}
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
  const { t } = useTranslation();
  const showConfirm = useConfirm();
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(err instanceof Error ? err.message : t('userSettings.calendar.failedLoad'));
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
      setError(err instanceof Error ? err.message : t('userSettings.calendar.failedCreate'));
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
      setAllRoomsError(err instanceof Error ? err.message : t('userSettings.calendar.failedCreate'));
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
      setError(err instanceof Error ? err.message : t('userSettings.calendar.failedCreate'));
    } finally {
      setRoomCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!await showConfirm({ message: t('userSettings.calendar.revokeConfirm'), title: t('userSettings.calendar.revokeTitle'), confirmLabel: t('common.revoke'), variant: 'warning' })) return;
    try {
      await api.revokeCalendarToken(id);
      setTokens(prev => prev.filter(tok => tok.id !== id));
      if (myCreated?.id === id) setMyCreated(null);
      if (allRoomsCreated?.id === id) setAllRoomsCreated(null);
      if (roomCreated?.id === id) setRoomCreated(null);
      setSuccess(t('userSettings.calendar.revoked'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.calendar.failedRevoke'));
    }
  };

  const getRoomName = (rId: string | null) => {
    if (!rId) return null;
    return rooms.find(r => r.id === rId)?.name ?? rId;
  };

  if (loading) return <p>{t('common.loading')}</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success}</div>}

      {/* How it works */}
      <div className="card mb-6">
        <h2>{t('userSettings.calendar.integration')}</h2>
        <p>{t('userSettings.calendar.integrationDesc')}</p>
        <details style={{ marginTop: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500 }}>{t('userSettings.calendar.howToSubscribe')}</summary>
          <ul style={{ marginTop: '0.5rem', lineHeight: 1.8 }}>
            <li><strong>Google Calendar:</strong> {t('userSettings.calendar.googleCalendar')}</li>
            <li><strong>Outlook:</strong> {t('userSettings.calendar.outlook')}</li>
            <li><strong>Apple Calendar:</strong> {t('userSettings.calendar.appleCalendar')}</li>
            <li><strong>Thunderbird:</strong> {t('userSettings.calendar.thunderbird')}</li>
          </ul>
        </details>
      </div>

      {/* My bookings feed */}
      <div className="card mb-6">
        <h2>{t('userSettings.calendar.myBookingsFeed')}</h2>
        <p>{t('userSettings.calendar.myBookingsFeedDesc')}</p>
        {myCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              {t('userSettings.calendar.feedCreated')}
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
                {copiedId === myCreated.id ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setMyCreated(null)}>
              {t('common.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateMyFeed} style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="myLabel">{t('userSettings.calendar.label')}</label>
              <input
                type="text"
                id="myLabel"
                value={myLabel}
                onChange={e => setMyLabel(e.target.value)}
                placeholder={t('userSettings.calendar.myBookingsLabelPlaceholder')}
                maxLength={100}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={myCreating}>
              {myCreating ? t('userSettings.calendar.creating') : t('userSettings.calendar.generateMyFeed')}
            </button>
          </form>
        )}
      </div>

      {/* All rooms feed */}
      <div className="card mb-6">
        <h2>{t('userSettings.calendar.allRoomsFeed')}</h2>
        <p>{t('userSettings.calendar.allRoomsFeedDesc')}</p>
        {allRoomsCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              {t('userSettings.calendar.feedCreated')}
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
                {copiedId === allRoomsCreated.id ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setAllRoomsCreated(null)}>
              {t('common.done')}
            </button>
          </div>
        ) : !hasPark ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>
            {t('userSettings.calendar.noParkAllRooms')}
          </p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {allRoomsError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{allRoomsError}</div>}
            <div className="form-group">
              <label htmlFor="allRoomsLabel">{t('userSettings.calendar.label')}</label>
              <input
                type="text"
                id="allRoomsLabel"
                value={allRoomsLabel}
                onChange={e => setAllRoomsLabel(e.target.value)}
                placeholder={t('userSettings.calendar.allRoomsLabelPlaceholder')}
                maxLength={100}
              />
            </div>
            <button className="btn btn-primary" onClick={handleCreateAllRoomsFeed} disabled={allRoomsCreating}>
              {allRoomsCreating ? t('userSettings.calendar.creating') : t('userSettings.calendar.generateAllRoomsFeed')}
            </button>
          </div>
        )}
      </div>

      {/* Room feed */}
      <div className="card mb-6">
        <h2>{t('userSettings.calendar.singleRoomFeed')}</h2>
        <p>{t('userSettings.calendar.singleRoomFeedDesc')}</p>
        {rooms.length === 0 ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>{t('userSettings.calendar.noRoomsAvailable')}</p>
        ) : roomCreated ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              {t('userSettings.calendar.feedCreated')}
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
                {copiedId === roomCreated.id ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setRoomCreated(null)}>
              {t('common.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateRoomFeed} style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="roomSelect">{t('userSettings.calendar.room')}</label>
              <select id="roomSelect" value={roomId} onChange={e => setRoomId(e.target.value)} required>
                <option value="">{t('userSettings.calendar.selectRoom')}</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="roomLabel">{t('userSettings.calendar.label')}</label>
              <input
                type="text"
                id="roomLabel"
                value={roomLabel}
                onChange={e => setRoomLabel(e.target.value)}
                placeholder={t('userSettings.calendar.roomLabelPlaceholder')}
                maxLength={100}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={roomCreating || !roomId}>
              {roomCreating ? t('userSettings.calendar.creating') : t('userSettings.calendar.generateRoomFeed')}
            </button>
          </form>
        )}
      </div>

      {/* Active subscriptions */}
      <div className="card">
        <h2>{t('userSettings.calendar.activeSubscriptions')}</h2>
        <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          {t('userSettings.calendar.activeSubsDesc')}
        </p>
        {tokens.length === 0 ? (
          <p className="empty-state">{t('userSettings.calendar.noActiveFeeds')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('userSettings.calendar.labelHeader')}</th>
                <th>{t('userSettings.calendar.type')}</th>
                <th>{t('userSettings.calendar.room')}</th>
                <th>{t('userSettings.calendar.created')}</th>
                <th>{t('userSettings.calendar.lastUsed')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(token => (
                <tr key={token.id}>
                  <td>{token.label || <em style={{ color: 'var(--text-secondary, #6b7280)' }}>{t('userSettings.calendar.unlabelled')}</em>}</td>
                  <td>{token.scope === 'my_bookings' ? t('userSettings.calendar.myBookingsType') : token.scope === 'park_rooms' ? t('userSettings.calendar.allRoomsType') : t('userSettings.calendar.roomType')}</td>
                  <td>{token.scope === 'park_rooms' ? t('userSettings.calendar.allRoomsType') : (getRoomName(token.roomId) ?? '—')}</td>
                  <td>{new Date(token.createdAt).toLocaleDateString()}</td>
                  <td>{token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : t('common.never')}</td>
                  <td>
                    <button onClick={() => handleRevoke(token.id)} className="btn btn-sm btn-danger">
                      {t('common.revoke')}
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
  const { t } = useTranslation();
  const [twofaEnforcement, setTwofaEnforcement] = useState<TwoFaLevelEnforcement>('inherit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!companyId) return;
    api.getCompany(companyId)
      .then(c => setTwofaEnforcement((c.twofaEnforcement as TwoFaLevelEnforcement) || 'inherit'))
      .catch(() => setError(t('userSettings.organization.failedLoad')))
      .finally(() => setLoading(false));
  }, [companyId, t]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.updateCompanyTwofa(companyId, twofaEnforcement);
      setSuccess(t('userSettings.organization.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.organization.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>{t('common.loading')}</p>;

  return (
    <div className="card">
      <h2>{t('userSettings.organization.title')}</h2>
      <p style={{ color: 'var(--text-secondary, #6b7280)', marginBottom: '1rem' }}>
        {t('userSettings.organization.desc')}
      </p>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>}
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="companyTwofaEnforcement">{t('userSettings.organization.companyEnforcement')}</label>
          <select
            id="companyTwofaEnforcement"
            value={twofaEnforcement}
            onChange={e => setTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
          >
            <option value="inherit">{t('userSettings.organization.inherit')}</option>
            <option value="optional">{t('userSettings.organization.optional')}</option>
            <option value="required">{t('userSettings.organization.required')}</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('common.saving') : t('userSettings.organization.save2fa')}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password tab — change password (local accounts only)
// ---------------------------------------------------------------------------

function PasswordTab() {
  const { t } = useTranslation();
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
      setError(t('userSettings.password.mismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('userSettings.password.tooShort'));
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(t('userSettings.password.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.password.failedChange'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('userSettings.password.title')}</h2>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="currentPassword">{t('userSettings.password.currentPassword')}</label>
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
          <label htmlFor="newPassword">{t('userSettings.password.newPassword')}</label>
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
          <label htmlFor="confirmPassword">{t('userSettings.password.confirmPassword')}</label>
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
          {loading ? t('userSettings.password.changing') : t('userSettings.password.change')}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appearance tab — theme toggle
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const { t } = useTranslation();
  const { theme, toggleTheme, calendarViewMode, setCalendarViewMode, language, setLanguage } = useSettings();

  return (
    <div className="card">
      <h2>{t('userSettings.appearance.title')}</h2>
      <p className="section-description">{t('userSettings.appearance.desc')}</p>

      <div className="settings-section">
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          {t('userSettings.appearance.colorTheme')}
        </h3>
        <p className="section-description">
          {t('userSettings.appearance.colorThemeDesc')}
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { if (theme !== 'light') toggleTheme(); }}
            aria-pressed={theme === 'light'}
          >
            {t('userSettings.appearance.light')}
          </button>
          <button
            type="button"
            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { if (theme !== 'dark') toggleTheme(); }}
            aria-pressed={theme === 'dark'}
          >
            {t('userSettings.appearance.dark')}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          {t('userSettings.appearance.calendarView')}
        </h3>
        <p className="section-description">
          {t('userSettings.appearance.calendarViewDesc')}
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${calendarViewMode === 'rolling' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCalendarViewMode('rolling')}
            aria-pressed={calendarViewMode === 'rolling'}
          >
            {t('userSettings.appearance.rolling')}
          </button>
          <button
            type="button"
            className={`btn ${calendarViewMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCalendarViewMode('weekly')}
            aria-pressed={calendarViewMode === 'weekly'}
          >
            {t('userSettings.appearance.weekly')}
          </button>
        </div>
      </div>

      <div className="settings-section" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          {t('userSettings.appearance.language')}
        </h3>
        <p className="section-description">
          {t('userSettings.appearance.languageDesc')}
        </p>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`userSettings.appearance.languages.${code}`, code)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
