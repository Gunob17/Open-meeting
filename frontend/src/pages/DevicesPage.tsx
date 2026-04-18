import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Device, Firmware } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { useConfirm } from '../context/ConfirmContext';

export function DevicesPage() {
  const { t } = useTranslation();
  const showConfirm = useConfirm();
  const [devices, setDevices] = useState<Device[]>([]);
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadDeviceType, setUploadDeviceType] = useState('esp32-display');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [selectedFirmwareVersion, setSelectedFirmwareVersion] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [devicesData, firmwareData] = await Promise.all([
        api.getDevices(true),
        api.getFirmwareList()
      ]);
      setDevices(devicesData);
      setFirmware(firmwareData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFirmware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadVersion || !uploadDeviceType) return;

    try {
      setUploading(true);
      await api.uploadFirmware(uploadFile, uploadVersion, uploadDeviceType, uploadNotes);
      setShowUploadModal(false);
      setUploadVersion('');
      setUploadDeviceType('esp32-display');
      setUploadNotes('');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload firmware');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFirmware = async (id: string) => {
    if (!await showConfirm({ message: t('devices.deleteFirmwareConfirm'), title: t('devices.deleteFirmwareTitle'), confirmLabel: t('common.delete') })) return;

    try {
      await api.deleteFirmware(id);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete firmware');
    }
  };

  const handleToggleFirmwareActive = async (fw: Firmware) => {
    try {
      await api.toggleFirmwareActive(fw.id, !fw.isActive);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update firmware');
    }
  };

  const handleScheduleUpdate = async () => {
    if (selectedDevices.size === 0 || !selectedFirmwareVersion) return;

    try {
      setScheduling(true);
      const result = await api.scheduleFirmwareUpdate(
        Array.from(selectedDevices),
        selectedFirmwareVersion
      );
      setShowUpgradeModal(false);
      setSelectedDevices(new Set());
      setSelectedFirmwareVersion('');
      setError('');
      alert(result.message);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule update');
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelUpdate = async (deviceId: string) => {
    try {
      await api.cancelFirmwareUpdate(deviceId);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel update');
    }
  };

  const toggleDeviceSelection = (deviceId: string) => {
    const newSelection = new Set(selectedDevices);
    if (newSelection.has(deviceId)) {
      newSelection.delete(deviceId);
    } else {
      newSelection.add(deviceId);
    }
    setSelectedDevices(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(devices.map(d => d.id)));
    }
  };

  const formatLastSeen = (lastSeenAt: string | null) => {
    if (!lastSeenAt) return t('common.never');
    try {
      return formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Group devices by device type
  const devicesByType = devices.reduce((acc, device) => {
    const type = device.deviceType || 'esp32-display';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(device);
    return acc;
  }, {} as Record<string, Device[]>);

  const deviceTypes = Object.keys(devicesByType).sort();

  const latestFirmware = firmware.find(f => f.isActive) || firmware[0];
  const activeFirmware = firmware.filter(f => f.isActive);

  // Get firmware for a specific device type
  const getFirmwareForType = (deviceType: string) => {
    return firmware.filter(f => f.deviceType === deviceType);
  };

  const getLatestFirmwareForType = (deviceType: string) => {
    const typeFirmware = getFirmwareForType(deviceType).filter(f => f.isActive);
    return typeFirmware[0];
  };

  if (loading) {
    return <div className="loading">{t('devices.loading')}</div>;
  }

  return (
    <div className="devices-page">
      <div className="page-header">
        <h1>{t('devices.title')}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Selection Bar */}
      {selectedDevices.size > 0 && (
        <div className="selection-bar">
          <span>{t('devices.selected', { count: selectedDevices.size })}</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSelectedFirmwareVersion(latestFirmware?.version || '');
              setShowUpgradeModal(true);
            }}
            disabled={activeFirmware.length === 0}
          >
            {t('devices.scheduleUpdate')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedDevices(new Set())}
          >
            {t('devices.clearSelection')}
          </button>
        </div>
      )}

      {/* Side-by-side layout: Firmware (30%) | Devices (70%) */}
      <div className="devices-page-layout">
        {/* Firmware Section - Left Side */}
        <div className="firmware-panel">
          <div className="panel-header">
            <h2>{t('devices.firmware')}</h2>
            <button className="btn btn-sm btn-primary" onClick={() => setShowUploadModal(true)}>
              {t('devices.upload')}
            </button>
          </div>
          {firmware.length === 0 ? (
            <p className="empty-state">{t('devices.noFirmware')}</p>
          ) : (
            <div className="firmware-compact-list">
              {firmware.map(fw => (
                <div key={fw.id} className={`firmware-compact-card ${fw.isActive ? 'active' : 'inactive'}`}>
                  <div className="firmware-compact-header">
                    <span className="firmware-version">v{fw.version}</span>
                    {fw.isActive && <span className="badge badge-success">Active</span>}
                  </div>
                  <div className="firmware-compact-details">
                    <span className="device-type-badge">{fw.deviceType}</span>
                    <span>{formatFileSize(fw.size)}</span>
                    <span>{new Date(fw.createdAt).toLocaleDateString()}</span>
                  </div>
                  {fw.releaseNotes && (
                    <div className="firmware-compact-notes">{fw.releaseNotes}</div>
                  )}
                  <div className="firmware-compact-actions">
                    <button
                      className="btn btn-xs btn-secondary"
                      onClick={() => handleToggleFirmwareActive(fw)}
                    >
                      {fw.isActive ? t('devices.deactivate') : t('devices.activate')}
                    </button>
                    <button
                      className="btn btn-xs btn-danger"
                      onClick={() => handleDeleteFirmware(fw.id)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Devices Section - Right Side */}
        <div className="devices-panel">
          <div className="panel-header">
            <h2>{t('devices.devicesTitle')}</h2>
            {devices.length > 0 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedDevices.size === devices.length && devices.length > 0}
                  onChange={toggleSelectAll}
                />
                {t('devices.selectAll')}
              </label>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="empty-state">{t('devices.noDevices')}</p>
          ) : (
            <div className="devices-by-type">
              {deviceTypes.map(deviceType => {
                const typeDevices = devicesByType[deviceType];
                const latestTypeFirmware = getLatestFirmwareForType(deviceType);

                return (
                  <div key={deviceType} className="device-type-group">
                    <div className="device-type-header">
                      <h3>{deviceType}</h3>
                      <span className="device-count">{typeDevices.length} device{typeDevices.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="devices-grid">
                      {typeDevices.map(device => (
                        <div
                          key={device.id}
                          className={`device-card ${!device.isActive ? 'inactive' : ''} ${device.hasUpdate ? 'has-update' : ''} ${selectedDevices.has(device.id) ? 'selected' : ''} ${device.pendingFirmwareVersion ? 'pending-update' : ''}`}
                        >
                          <div className="device-select">
                            <input
                              type="checkbox"
                              checked={selectedDevices.has(device.id)}
                              onChange={() => toggleDeviceSelection(device.id)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="device-content" onClick={() => setSelectedDevice(device)}>
                            <div className="device-header">
                              <span className="device-name">{device.name}</span>
                              {device.pendingFirmwareVersion && (
                                <span className="pending-indicator" title={`Update to v${device.pendingFirmwareVersion} scheduled`}>
                                  ⏳
                                </span>
                              )}
                              {device.hasUpdate && !device.pendingFirmwareVersion && (
                                <span className="update-indicator" title="Update available">
                                  ↑
                                </span>
                              )}
                            </div>
                            <div className="device-room">
                              {device.room?.name || t('devices.noRoomAssigned')}
                            </div>
                            <div className="device-info">
                              <div className="device-version">
                                <strong>{t('common.version')}:</strong>{' '}
                                {device.firmwareVersion || t('common.unknown')}
                                {device.pendingFirmwareVersion && (
                                  <span className="version-pending"> → v{device.pendingFirmwareVersion}</span>
                                )}
                                {device.hasUpdate && !device.pendingFirmwareVersion && latestTypeFirmware && (
                                  <span className="version-update"> (v{latestTypeFirmware.version} available)</span>
                                )}
                              </div>
                              <div className="device-status">
                                <strong>{t('common.status')}:</strong>{' '}
                                <span className={device.isActive ? 'status-active' : 'status-inactive'}>
                                  {device.isActive ? t('common.active') : t('common.inactive')}
                                </span>
                              </div>
                              <div className="device-last-seen">
                                <strong>{t('devices.lastSeen')}:</strong> {formatLastSeen(device.lastSeenAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Device Detail Modal */}
      {selectedDevice && (
        <div className="modal-overlay" onClick={() => setSelectedDevice(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedDevice.name}</h2>
              <button className="modal-close" onClick={() => setSelectedDevice(null)} aria-label="Close">&times;</button>
            </div>
            <div className="modal-body">
              <div className="device-detail-grid">
                <div className="detail-item">
                  <label>{t('calendar.room')}</label>
                  <span>{selectedDevice.room?.name || t('devices.noRoomAssigned')}</span>
                </div>
                <div className="detail-item">
                  <label>{t('common.status')}</label>
                  <span className={selectedDevice.isActive ? 'status-active' : 'status-inactive'}>
                    {selectedDevice.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <div className="detail-item">
                  <label>{t('devices.currentFirmware')}</label>
                  <span>{selectedDevice.firmwareVersion || t('common.unknown')}</span>
                </div>
                <div className="detail-item">
                  <label>{t('devices.latestAvailable')}</label>
                  <span>{latestFirmware?.version || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>{t('devices.lastSeen')}</label>
                  <span>{formatLastSeen(selectedDevice.lastSeenAt)}</span>
                </div>
                <div className="detail-item">
                  <label>{t('devices.updateStatus')}</label>
                  <span>
                    {selectedDevice.pendingFirmwareVersion ? (
                      <span className="update-pending">
                        {t('devices.updateScheduled', { version: selectedDevice.pendingFirmwareVersion })}
                      </span>
                    ) : selectedDevice.hasUpdate ? (
                      <span className="update-available">{t('devices.updateAvailable')}</span>
                    ) : (
                      <span className="up-to-date">{t('devices.upToDate')}</span>
                    )}
                  </span>
                </div>
              </div>

              {selectedDevice.pendingFirmwareVersion && (
                <div className="update-info pending">
                  <h3>{t('devices.pendingUpdate', { version: selectedDevice.pendingFirmwareVersion })}</h3>
                  <p className="update-note">
                    {t('devices.pendingUpdateDesc')}
                  </p>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      handleCancelUpdate(selectedDevice.id);
                      setSelectedDevice(null);
                    }}
                  >
                    {t('devices.cancelUpdate')}
                  </button>
                </div>
              )}

              {!selectedDevice.pendingFirmwareVersion && selectedDevice.hasUpdate && latestFirmware && (
                <div className="update-info">
                  <h3>{t('devices.availableUpdate', { version: latestFirmware.version })}</h3>
                  {latestFirmware.releaseNotes && (
                    <div className="release-notes">
                      <strong>{t('devices.releaseNotes')}:</strong>
                      <p>{latestFirmware.releaseNotes}</p>
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSelectedDevices(new Set([selectedDevice.id]));
                      setSelectedFirmwareVersion(latestFirmware.version);
                      setShowUpgradeModal(true);
                      setSelectedDevice(null);
                    }}
                  >
                    {t('devices.scheduleUpdate')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Update Modal */}
      {showUpgradeModal && (() => {
        // Get device types of selected devices
        const selectedDevicesList = Array.from(selectedDevices)
          .map(id => devices.find(d => d.id === id))
          .filter(Boolean) as Device[];

        const selectedDeviceTypes = new Set(selectedDevicesList.map(d => d.deviceType));
        const hasMixedTypes = selectedDeviceTypes.size > 1;
        const commonDeviceType = selectedDeviceTypes.size === 1 ? Array.from(selectedDeviceTypes)[0] : null;

        // Filter firmware by common device type if all selected devices have the same type
        const availableFirmware = commonDeviceType
          ? activeFirmware.filter(fw => fw.deviceType === commonDeviceType)
          : activeFirmware;

        return (
          <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
            <div className="modal modal-large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('devices.scheduleUpdateTitle')}</h2>
                <button className="modal-close" onClick={() => setShowUpgradeModal(false)} aria-label={t('common.close')}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="upgrade-info">
                  {t('devices.scheduleUpdateDesc', { count: selectedDevices.size })}
                </p>

                {hasMixedTypes && (
                  <div className="alert alert-error">
                    {t('devices.mixedTypesWarning')}
                  </div>
                )}

                {!hasMixedTypes && commonDeviceType && (
                  <div className="info-box">
                    {t('devices.deviceType')}: <strong>{commonDeviceType}</strong>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="firmware-version">{t('devices.selectFirmwareVersion')}</label>
                  <select
                    id="firmware-version"
                    value={selectedFirmwareVersion}
                    onChange={e => setSelectedFirmwareVersion(e.target.value)}
                    className="form-control"
                    disabled={hasMixedTypes}
                  >
                    <option value="">{t('devices.selectVersion')}</option>
                    {availableFirmware.map(fw => (
                      <option key={fw.id} value={fw.version}>
                        v{fw.version} ({formatFileSize(fw.size)})
                      </option>
                    ))}
                  </select>
                </div>

              {selectedFirmwareVersion && (
                <div className="selected-firmware-info">
                  {(() => {
                    const fw = firmware.find(f => f.version === selectedFirmwareVersion);
                    return fw ? (
                      <>
                        <h4>v{fw.version}</h4>
                        {fw.releaseNotes && <p>{fw.releaseNotes}</p>}
                      </>
                    ) : null;
                  })()}
                </div>
              )}

                <div className="selected-devices-list">
                  <h4>{t('devices.devicesToUpdate')}:</h4>
                  <ul>
                    {selectedDevicesList.map(device => (
                      <li key={device.id}>
                        {device.name} ({device.deviceType}) - current: {device.firmwareVersion || 'unknown'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUpgradeModal(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={scheduling || !selectedFirmwareVersion || hasMixedTypes}
                  onClick={handleScheduleUpdate}
                >
                  {scheduling ? t('devices.scheduling') : t('devices.scheduleUpdate')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upload Firmware Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('devices.uploadFirmware')}</h2>
              <button className="modal-close" onClick={() => setShowUploadModal(false)} aria-label={t('common.close')}>&times;</button>
            </div>
            <form onSubmit={handleUploadFirmware}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="device-type">{t('devices.uploadDeviceType')}</label>
                  <select
                    id="device-type"
                    value={uploadDeviceType}
                    onChange={e => setUploadDeviceType(e.target.value)}
                    className="form-control"
                    required
                  >
                    {deviceTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    <option value="other">Other (specify in version)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="version">{t('devices.uploadVersion')}</label>
                  <input
                    type="text"
                    id="version"
                    value={uploadVersion}
                    onChange={e => setUploadVersion(e.target.value)}
                    placeholder={t('devices.uploadVersionPlaceholder')}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="firmware-file">{t('devices.uploadFile')}</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="firmware-file"
                    accept=".bin"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="release-notes">{t('devices.uploadNotes')}</label>
                  <textarea
                    id="release-notes"
                    value={uploadNotes}
                    onChange={e => setUploadNotes(e.target.value)}
                    placeholder={t('devices.uploadNotesPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? t('devices.uploading') : t('devices.upload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
