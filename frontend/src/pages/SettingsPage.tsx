import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Settings, MeetingRoom, Company, TwoFaEnforcement, TwoFaMode } from '../types';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Global settings form
  const [openingHour, setOpeningHour] = useState(8);
  const [closingHour, setClosingHour] = useState(18);

  // 2FA settings (super admin only)
  const [twofaEnforcement, setTwofaEnforcement] = useState<TwoFaEnforcement>('disabled');
  const [twofaMode, setTwofaMode] = useState<TwoFaMode>('trusted_device');
  const [twofaTrustedDeviceDays, setTwofaTrustedDeviceDays] = useState(30);
  const [saving2fa, setSaving2fa] = useState(false);

  // Room edit modal state
  const [editingRoom, setEditingRoom] = useState<MeetingRoom | null>(null);
  const [roomOpeningHour, setRoomOpeningHour] = useState<number | ''>('');
  const [roomClosingHour, setRoomClosingHour] = useState<number | ''>('');
  const [roomLockedCompanies, setRoomLockedCompanies] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsData, roomsData, companiesData] = await Promise.all([
        api.getSettings(),
        api.getRooms(true),
        api.getCompanies()
      ]);
      setSettings(settingsData);
      setOpeningHour(settingsData.openingHour);
      setClosingHour(settingsData.closingHour);
      setTwofaEnforcement((settingsData.twofaEnforcement as TwoFaEnforcement) || 'disabled');
      setTwofaMode((settingsData.twofaMode as TwoFaMode) || 'trusted_device');
      setTwofaTrustedDeviceDays(settingsData.twofaTrustedDeviceDays ?? 30);
      setRooms(roomsData);
      setCompanies(companiesData);
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

      const updated = await api.updateSettings({ openingHour, closingHour });
      setSettings(updated);
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
      const updated = await api.updateTwoFaSettings({
        twofaEnforcement,
        twofaMode,
        twofaTrustedDeviceDays
      });
      setSettings(updated);
      setSuccess('Two-factor authentication settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save 2FA settings');
    } finally {
      setSaving2fa(false);
    }
  };

  const handleEditRoom = (room: MeetingRoom) => {
    setEditingRoom(room);
    setRoomOpeningHour(room.openingHour ?? '');
    setRoomClosingHour(room.closingHour ?? '');
    setRoomLockedCompanies(room.lockedToCompanyIds ?? []);
    setError('');
  };

  const handleSaveRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    setError('');
    setSaving(true);

    try {
      const openHour = roomOpeningHour === '' ? null : Number(roomOpeningHour);
      const closeHour = roomClosingHour === '' ? null : Number(roomClosingHour);

      if (openHour !== null && closeHour !== null && openHour >= closeHour) {
        setError('Opening hour must be before closing hour');
        setSaving(false);
        return;
      }

      await api.updateRoom(editingRoom.id, {
        openingHour: openHour,
        closingHour: closeHour,
        lockedToCompanyIds: roomLockedCompanies
      });

      setEditingRoom(null);
      loadData();
      setSuccess('Room settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save room settings');
    } finally {
      setSaving(false);
    }
  };

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  const getCompanyName = (companyId: string | null | undefined) => {
    if (!companyId) return '-';
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Unknown';
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
                  <option key={i} value={i}>{formatHour(i)}</option>
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
                  <option key={i} value={i}>{formatHour(i)}</option>
                ))}
              </select>
            </div>
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

      {/* Room-Specific Settings */}
      <section className="settings-section">
        <h2>Room-Specific Settings</h2>
        <p className="section-description">
          Configure individual room booking hours and company restrictions.
          Leave hours empty to use global settings.
        </p>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Room Name</th>
                <th>Opening Hour</th>
                <th>Closing Hour</th>
                <th>Locked to Company</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(room => (
                <tr key={room.id} className={!room.isActive ? 'inactive' : ''}>
                  <td>
                    {room.name}
                    {!room.isActive && <span className="status-badge inactive ml-1">Inactive</span>}
                  </td>
                  <td>
                    {room.openingHour !== null && room.openingHour !== undefined
                      ? formatHour(room.openingHour)
                      : <span className="text-muted">Global ({formatHour(settings?.openingHour ?? 8)})</span>
                    }
                  </td>
                  <td>
                    {room.closingHour !== null && room.closingHour !== undefined
                      ? formatHour(room.closingHour)
                      : <span className="text-muted">Global ({formatHour(settings?.closingHour ?? 18)})</span>
                    }
                  </td>
                  <td>
                    {room.lockedToCompanyIds && room.lockedToCompanyIds.length > 0
                      ? <div className="access-companies">
                          {room.lockedToCompanyIds.slice(0, 2).map(id => (
                            <span key={id} className="company-badge">{getCompanyName(id)}</span>
                          ))}
                          {room.lockedToCompanyIds.length > 2 && (
                            <span className="company-badge">+{room.lockedToCompanyIds.length - 2}</span>
                          )}
                        </div>
                      : <span className="text-muted">All companies</span>
                    }
                  </td>
                  <td>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleEditRoom(room)}
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Room Settings Modal */}
      {editingRoom && (
        <div className="modal-overlay" onClick={() => setEditingRoom(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Configure: {editingRoom.name}</h2>
              <button className="modal-close" onClick={() => setEditingRoom(null)}>×</button>
            </div>

            <form onSubmit={handleSaveRoomSettings}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="roomOpeningHour">Opening Hour</label>
                  <select
                    id="roomOpeningHour"
                    value={roomOpeningHour}
                    onChange={e => setRoomOpeningHour(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Use Global Setting ({formatHour(settings?.openingHour ?? 8)})</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                  <small>Leave empty to use global opening hour</small>
                </div>

                <div className="form-group">
                  <label htmlFor="roomClosingHour">Closing Hour</label>
                  <select
                    id="roomClosingHour"
                    value={roomClosingHour}
                    onChange={e => setRoomClosingHour(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Use Global Setting ({formatHour(settings?.closingHour ?? 18)})</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                  <small>Leave empty to use global closing hour</small>
                </div>

                <div className="form-group">
                  <label>Restrict Access to Companies</label>
                  <small style={{ color: '#6b7280', marginBottom: '0.5rem', display: 'block' }}>
                    Select companies that can book this room. Leave all unchecked to allow all companies.
                  </small>
                  {companies.length === 0 ? (
                    <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No companies available</p>
                  ) : (
                    <div className="companies-grid">
                      {companies.map(company => (
                        <label key={company.id} className="company-checkbox">
                          <input
                            type="checkbox"
                            checked={roomLockedCompanies.includes(company.id)}
                            onChange={() => {
                              setRoomLockedCompanies(prev =>
                                prev.includes(company.id)
                                  ? prev.filter(id => id !== company.id)
                                  : [...prev, company.id]
                              );
                            }}
                          />
                          <span>{company.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingRoom(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
