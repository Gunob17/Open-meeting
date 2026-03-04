import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TwoFaEnforcement, TwoFaMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { formatHour, TimeFormat } from '../utils/time';

export function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  const { setTimeFormat: setContextTimeFormat } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Global settings form
  const [openingHour, setOpeningHour] = useState(8);
  const [closingHour, setClosingHour] = useState(18);
  const [timezone, setTimezone] = useState('UTC');
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('12h');

  // 2FA settings (super admin only)
  const [twofaEnforcement, setTwofaEnforcement] = useState<TwoFaEnforcement>('disabled');
  const [twofaMode, setTwofaMode] = useState<TwoFaMode>('trusted_device');
  const [twofaTrustedDeviceDays, setTwofaTrustedDeviceDays] = useState(30);
  const [saving2fa, setSaving2fa] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const settingsData = await api.getSettings();
      setOpeningHour(settingsData.openingHour);
      setClosingHour(settingsData.closingHour);
      setTimezone(settingsData.timezone || 'UTC');
      setTimeFormat(settingsData.timeFormat === '24h' ? '24h' : '12h');
      setTwofaEnforcement((settingsData.twofaEnforcement as TwoFaEnforcement) || 'disabled');
      setTwofaMode((settingsData.twofaMode as TwoFaMode) || 'trusted_device');
      setTwofaTrustedDeviceDays(settingsData.twofaTrustedDeviceDays ?? 30);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      if (openingHour >= closingHour) {
        setError('Opening hour must be before closing hour');
        setSaving(false);
        return;
      }

      await api.updateSettings({ openingHour, closingHour, timezone, timeFormat });
      setContextTimeFormat(timeFormat); // propagate to global context immediately
      setSuccess('Global settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSave2faSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving2fa(true);

    try {
      await api.updateTwoFaSettings({
        twofaEnforcement,
        twofaMode,
        twofaTrustedDeviceDays
      });
      setSuccess('Two-factor authentication settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save 2FA settings');
    } finally {
      setSaving2fa(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      <h1>System Settings</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Global Booking Hours */}
      <section className="settings-section">
        <h2>Global Booking Hours</h2>
        <p className="section-description">
          Set the default time range when meeting rooms can be booked.
          Individual rooms can override these settings.
        </p>

        <form onSubmit={handleSaveGlobalSettings} className="settings-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="openingHour">Opening Hour</label>
              <select
                id="openingHour"
                value={openingHour}
                onChange={e => setOpeningHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatHour(i, timeFormat)}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="closingHour">Closing Hour</label>
              <select
                id="closingHour"
                value={closingHour}
                onChange={e => setClosingHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatHour(i, timeFormat)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="timeFormat">Time Format</label>
            <select
              id="timeFormat"
              value={timeFormat}
              onChange={e => setTimeFormat(e.target.value as TimeFormat)}
            >
              <option value="12h">12-hour (e.g. 2:00 PM)</option>
              <option value="24h">24-hour (e.g. 14:00)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
            >
              <optgroup label="UTC">
                <option value="UTC">UTC</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Lisbon">Europe/Lisbon (WET/WEST)</option>
                <option value="Europe/Amsterdam">Europe/Amsterdam (CET/CEST)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                <option value="Europe/Copenhagen">Europe/Copenhagen (CET/CEST)</option>
                <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                <option value="Europe/Oslo">Europe/Oslo (CET/CEST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Europe/Rome">Europe/Rome (CET/CEST)</option>
                <option value="Europe/Stockholm">Europe/Stockholm (CET/CEST)</option>
                <option value="Europe/Zurich">Europe/Zurich (CET/CEST)</option>
                <option value="Europe/Athens">Europe/Athens (EET/EEST)</option>
                <option value="Europe/Bucharest">Europe/Bucharest (EET/EEST)</option>
                <option value="Europe/Helsinki">Europe/Helsinki (EET/EEST)</option>
                <option value="Europe/Warsaw">Europe/Warsaw (CET/CEST)</option>
                <option value="Europe/Moscow">Europe/Moscow (MSK)</option>
              </optgroup>
              <optgroup label="Americas">
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="America/Chicago">America/Chicago (CT)</option>
                <option value="America/Denver">America/Denver (MT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                <option value="America/Toronto">America/Toronto (ET)</option>
                <option value="America/Vancouver">America/Vancouver (PT)</option>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
              </optgroup>
              <optgroup label="Asia / Pacific">
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                <option value="Pacific/Auckland">Pacific/Auckland (NZST/NZDT)</option>
              </optgroup>
            </select>
            <small>Used to enforce opening/closing hours for room display devices</small>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Global Settings'}
          </button>
        </form>
      </section>

      {/* Two-Factor Authentication Settings (Super Admin only) */}
      {isSuperAdmin && (
        <section className="settings-section">
          <h2>Two-Factor Authentication</h2>
          <p className="section-description">
            Configure system-wide two-factor authentication enforcement.
            Park and company admins can further restrict their own scope when set to Optional.
          </p>

          <form onSubmit={handleSave2faSettings} className="settings-form">
            <div className="form-group">
              <label htmlFor="twofaEnforcement">System Enforcement</label>
              <select
                id="twofaEnforcement"
                value={twofaEnforcement}
                onChange={e => setTwofaEnforcement(e.target.value as TwoFaEnforcement)}
              >
                <option value="disabled">Disabled - 2FA is not available</option>
                <option value="optional">Optional - Users can enable 2FA voluntarily</option>
                <option value="required">Required - All users must set up 2FA</option>
              </select>
            </div>

            {twofaEnforcement !== 'disabled' && (
              <>
                <div className="form-group">
                  <label htmlFor="twofaMode">Verification Mode</label>
                  <select
                    id="twofaMode"
                    value={twofaMode}
                    onChange={e => setTwofaMode(e.target.value as TwoFaMode)}
                  >
                    <option value="every_login">Every Login - Always require 2FA code</option>
                    <option value="trusted_device">Trusted Device - Remember verified devices</option>
                  </select>
                </div>

                {twofaMode === 'trusted_device' && (
                  <div className="form-group">
                    <label htmlFor="twofaTrustedDeviceDays">Trusted Device Duration (days)</label>
                    <input
                      type="number"
                      id="twofaTrustedDeviceDays"
                      value={twofaTrustedDeviceDays}
                      onChange={e => setTwofaTrustedDeviceDays(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={365}
                    />
                    <small>How long a device stays trusted before requiring 2FA again</small>
                  </div>
                )}
              </>
            )}

            <button type="submit" className="btn btn-primary" disabled={saving2fa}>
              {saving2fa ? 'Saving...' : 'Save 2FA Settings'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
