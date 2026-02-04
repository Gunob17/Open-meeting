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
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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

  if (loading) {
    return <div className="loading">Loading devices...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Devices & Firmware</h1>
        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          Upload Firmware
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Firmware Section */}
      <div className="section">
        <h2>Firmware Versions</h2>
        {firmware.length === 0 ? (
          <p className="empty-state">No firmware uploaded yet. Upload a firmware file to enable OTA updates.</p>
        ) : (
          <div className="firmware-list">
            {firmware.map(fw => (
              <div key={fw.id} className={`firmware-card ${fw.isActive ? 'active' : 'inactive'}`}>
                <div className="firmware-header">
                  <span className="firmware-version">v{fw.version}</span>
                  {fw.isActive && <span className="badge badge-success">Active</span>}
                  {!fw.isActive && <span className="badge badge-secondary">Inactive</span>}
                </div>
                <div className="firmware-details">
                  <div><strong>Size:</strong> {formatFileSize(fw.size)}</div>
                  <div><strong>Checksum:</strong> {fw.checksum.substring(0, 12)}...</div>
                  <div><strong>Uploaded:</strong> {new Date(fw.createdAt).toLocaleDateString()}</div>
                </div>
                {fw.releaseNotes && (
                  <div className="firmware-notes">
                    <strong>Release Notes:</strong>
                    <p>{fw.releaseNotes}</p>
                  </div>
                )}
                <div className="firmware-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleToggleFirmwareActive(fw)}
                  >
                    {fw.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
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

      {/* Devices Section */}
      <div className="section">
        <h2>Devices</h2>
        {devices.length === 0 ? (
          <p className="empty-state">No devices registered in this park.</p>
        ) : (
          <div className="devices-grid">
            {devices.map(device => (
              <div
                key={device.id}
                className={`device-card ${!device.isActive ? 'inactive' : ''} ${device.hasUpdate ? 'has-update' : ''}`}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="device-header">
                  <span className="device-name">{device.name}</span>
                  {device.hasUpdate && (
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
                    {device.hasUpdate && latestFirmware && (
                      <span className="version-update"> → v{latestFirmware.version}</span>
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
            ))}
          </div>
        )}
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
                    {selectedDevice.hasUpdate ? (
                      <span className="update-available">Update available ↑</span>
                    ) : (
                      <span className="up-to-date">Up to date</span>
                    )}
                  </span>
                </div>
              </div>

              {selectedDevice.hasUpdate && latestFirmware && (
                <div className="update-info">
                  <h3>Available Update: v{latestFirmware.version}</h3>
                  {latestFirmware.releaseNotes && (
                    <div className="release-notes">
                      <strong>Release Notes:</strong>
                      <p>{latestFirmware.releaseNotes}</p>
                    </div>
                  )}
                  <p className="update-note">
                    The device will automatically download and install this update on its next check-in.
                  </p>
                </div>
              )}
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
