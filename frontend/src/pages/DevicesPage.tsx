import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Device, Firmware } from '../types';
import { formatDistanceToNow } from 'date-fns';

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [uploadVersion, setUploadVersion] = useState('');
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
    if (!uploadFile || !uploadVersion) return;

    try {
      setUploading(true);
      await api.uploadFirmware(uploadFile, uploadVersion, uploadNotes);
      setShowUploadModal(false);
      setUploadVersion('');
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
    if (!window.confirm('Are you sure you want to delete this firmware version?')) return;

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
    if (!lastSeenAt) return 'Never';
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

  const latestFirmware = firmware.find(f => f.isActive) || firmware[0];
  const activeFirmware = firmware.filter(f => f.isActive);

  if (loading) {
    return <div className="loading">Loading devices...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Devices & Firmware</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Selection Bar */}
      {selectedDevices.size > 0 && (
        <div className="selection-bar">
          <span>{selectedDevices.size} device(s) selected</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSelectedFirmwareVersion(latestFirmware?.version || '');
              setShowUpgradeModal(true);
            }}
            disabled={activeFirmware.length === 0}
          >
            Schedule Update
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedDevices(new Set())}
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Side-by-side layout: Firmware (30%) | Devices (70%) */}
      <div className="devices-page-layout">
        {/* Firmware Section - Left Side */}
        <div className="firmware-panel">
          <div className="panel-header">
            <h2>Firmware</h2>
            <button className="btn btn-sm btn-primary" onClick={() => setShowUploadModal(true)}>
              + Upload
            </button>
          </div>
          {firmware.length === 0 ? (
            <p className="empty-state">No firmware uploaded yet.</p>
          ) : (
            <div className="firmware-compact-list">
              {firmware.map(fw => (
                <div key={fw.id} className={`firmware-compact-card ${fw.isActive ? 'active' : 'inactive'}`}>
                  <div className="firmware-compact-header">
                    <span className="firmware-version">v{fw.version}</span>
                    {fw.isActive && <span className="badge badge-success">Active</span>}
                  </div>
                  <div className="firmware-compact-details">
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
                      {fw.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="btn btn-xs btn-danger"
                      onClick={() => handleDeleteFirmware(fw.id)}
                    >
                      Delete
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
            <h2>Devices</h2>
            {devices.length > 0 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedDevices.size === devices.length && devices.length > 0}
                  onChange={toggleSelectAll}
                />
                Select All
              </label>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="empty-state">No devices registered in this park.</p>
          ) : (
            <div className="devices-grid">
              {devices.map(device => (
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
                      {device.room?.name || 'No room assigned'}
                    </div>
                    <div className="device-info">
                      <div className="device-version">
                        <strong>Version:</strong>{' '}
                        {device.firmwareVersion || 'Unknown'}
                        {device.pendingFirmwareVersion && (
                          <span className="version-pending"> → v{device.pendingFirmwareVersion}</span>
                        )}
                        {device.hasUpdate && !device.pendingFirmwareVersion && latestFirmware && (
                          <span className="version-update"> (v{latestFirmware.version} available)</span>
                        )}
                      </div>
                      <div className="device-status">
                        <strong>Status:</strong>{' '}
                        <span className={device.isActive ? 'status-active' : 'status-inactive'}>
                          {device.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="device-last-seen">
                        <strong>Last Seen:</strong> {formatLastSeen(device.lastSeenAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
              <button className="modal-close" onClick={() => setSelectedDevice(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="device-detail-grid">
                <div className="detail-item">
                  <label>Room</label>
                  <span>{selectedDevice.room?.name || 'No room assigned'}</span>
                </div>
                <div className="detail-item">
                  <label>Status</label>
                  <span className={selectedDevice.isActive ? 'status-active' : 'status-inactive'}>
                    {selectedDevice.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Current Firmware</label>
                  <span>{selectedDevice.firmwareVersion || 'Unknown'}</span>
                </div>
                <div className="detail-item">
                  <label>Latest Available</label>
                  <span>{latestFirmware?.version || 'None'}</span>
                </div>
                <div className="detail-item">
                  <label>Last Seen</label>
                  <span>{formatLastSeen(selectedDevice.lastSeenAt)}</span>
                </div>
                <div className="detail-item">
                  <label>Update Status</label>
                  <span>
                    {selectedDevice.pendingFirmwareVersion ? (
                      <span className="update-pending">
                        Update to v{selectedDevice.pendingFirmwareVersion} scheduled
                      </span>
                    ) : selectedDevice.hasUpdate ? (
                      <span className="update-available">Update available</span>
                    ) : (
                      <span className="up-to-date">Up to date</span>
                    )}
                  </span>
                </div>
              </div>

              {selectedDevice.pendingFirmwareVersion && (
                <div className="update-info pending">
                  <h3>Pending Update: v{selectedDevice.pendingFirmwareVersion}</h3>
                  <p className="update-note">
                    This device will download and install this update on its next check-in.
                  </p>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      handleCancelUpdate(selectedDevice.id);
                      setSelectedDevice(null);
                    }}
                  >
                    Cancel Update
                  </button>
                </div>
              )}

              {!selectedDevice.pendingFirmwareVersion && selectedDevice.hasUpdate && latestFirmware && (
                <div className="update-info">
                  <h3>Available Update: v{latestFirmware.version}</h3>
                  {latestFirmware.releaseNotes && (
                    <div className="release-notes">
                      <strong>Release Notes:</strong>
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
                    Schedule Update
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Update Modal */}
      {showUpgradeModal && (
        <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Schedule Firmware Update</h2>
              <button className="modal-close" onClick={() => setShowUpgradeModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="upgrade-info">
                Schedule a firmware update for <strong>{selectedDevices.size} device(s)</strong>.
                The devices will download and install the update on their next check-in.
              </p>

              <div className="form-group">
                <label htmlFor="firmware-version">Select Firmware Version</label>
                <select
                  id="firmware-version"
                  value={selectedFirmwareVersion}
                  onChange={e => setSelectedFirmwareVersion(e.target.value)}
                  className="form-control"
                >
                  <option value="">-- Select Version --</option>
                  {activeFirmware.map(fw => (
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
                <h4>Devices to Update:</h4>
                <ul>
                  {Array.from(selectedDevices).map(id => {
                    const device = devices.find(d => d.id === id);
                    return device ? (
                      <li key={id}>
                        {device.name} (current: {device.firmwareVersion || 'unknown'})
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUpgradeModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={scheduling || !selectedFirmwareVersion}
                onClick={handleScheduleUpdate}
              >
                {scheduling ? 'Scheduling...' : 'Schedule Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Firmware Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Firmware</h2>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleUploadFirmware}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="version">Version *</label>
                  <input
                    type="text"
                    id="version"
                    value={uploadVersion}
                    onChange={e => setUploadVersion(e.target.value)}
                    placeholder="e.g., 1.0.0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="firmware-file">Firmware File (.bin) *</label>
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
                  <label htmlFor="release-notes">Release Notes</label>
                  <textarea
                    id="release-notes"
                    value={uploadNotes}
                    onChange={e => setUploadNotes(e.target.value)}
                    placeholder="What's new in this version?"
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
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
