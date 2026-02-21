import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Park, Settings, TwoFaLevelEnforcement } from '../types';

export function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPark, setEditingPark] = useState<Park | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: '',
    receptionEmail: '',
    receptionGuestFields: ['name'] as string[]
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogoFor, setUploadingLogoFor] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [parkTwofaEnforcement, setParkTwofaEnforcement] = useState<TwoFaLevelEnforcement>('inherit');

  useEffect(() => {
    loadParks();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadParks = async () => {
    setLoading(true);
    try {
      const data = await api.getParks(true);
      setParks(data);
    } catch (error) {
      console.error('Failed to load parks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (park?: Park) => {
    if (park) {
      setEditingPark(park);
      setFormData({
        name: park.name,
        address: park.address,
        description: park.description || '',
        receptionEmail: park.receptionEmail || '',
        receptionGuestFields: park.receptionGuestFields || ['name']
      });
      setParkTwofaEnforcement(park.twofaEnforcement || 'inherit');
    } else {
      setEditingPark(null);
      setFormData({
        name: '',
        address: '',
        description: '',
        receptionEmail: '',
        receptionGuestFields: ['name']
      });
      setParkTwofaEnforcement('inherit');
    }
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editingPark) {
        await api.updatePark(editingPark.id, {
          name: formData.name,
          address: formData.address,
          description: formData.description,
          twofaEnforcement: parkTwofaEnforcement,
          receptionEmail: formData.receptionEmail || null,
          receptionGuestFields: formData.receptionGuestFields
        });
      } else {
        await api.createPark(formData);
      }
      setShowModal(false);
      loadParks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save park');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (park: Park) => {
    try {
      await api.updatePark(park.id, { isActive: !park.isActive });
      loadParks();
    } catch (error) {
      console.error('Failed to toggle park status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this park? All companies, users, and rooms in this park will also be affected.')) return;

    try {
      await api.deletePark(id, false);
      loadParks();
    } catch (error) {
      console.error('Failed to delete park:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete park');
    }
  };

  const handleLogoClick = (parkId: string) => {
    setUploadingLogoFor(parkId);
    logoInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingLogoFor) return;

    try {
      await api.uploadParkLogo(uploadingLogoFor, file);
      loadParks();
    } catch (error) {
      console.error('Failed to upload logo:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload logo');
    } finally {
      setUploadingLogoFor(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async (parkId: string) => {
    if (!window.confirm('Are you sure you want to remove this logo?')) return;

    try {
      await api.deleteParkLogo(parkId);
      loadParks();
    } catch (error) {
      console.error('Failed to delete logo:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete logo');
    }
  };

  if (loading) {
    return <div className="loading">Loading parks...</div>;
  }

  return (
    <div className="parks-page">
      <div className="page-header">
        <h1>Park Management</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Add Park
        </button>
      </div>

      {/* Hidden file input for logo upload */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={handleLogoChange}
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Logo</th>
              <th>Name</th>
              <th>Address</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {parks.map(park => (
              <tr key={park.id} className={!park.isActive ? 'inactive-row' : ''}>
                <td>
                  <div className="park-logo-cell">
                    {park.logoUrl ? (
                      <div className="park-logo-wrapper">
                        <img
                          src={park.logoUrl}
                          alt={park.name}
                          className="park-logo-preview"
                        />
                        <div className="park-logo-actions">
                          <button
                            className="btn btn-tiny"
                            onClick={() => handleLogoClick(park.id)}
                            title="Change logo"
                          >
                            Change
                          </button>
                          <button
                            className="btn btn-tiny btn-danger"
                            onClick={() => handleDeleteLogo(park.id)}
                            title="Remove logo"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-small btn-secondary park-logo-upload"
                        onClick={() => handleLogoClick(park.id)}
                      >
                        + Logo
                      </button>
                    )}
                  </div>
                </td>
                <td>{park.name}</td>
                <td>{park.address}</td>
                <td>{park.description || '-'}</td>
                <td>
                  <span className={`status-badge ${park.isActive ? 'active' : 'inactive'}`}>
                    {park.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(park)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-small ${park.isActive ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => handleToggleActive(park)}
                    >
                      {park.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {park.id !== 'default' && (
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleDelete(park.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPark ? 'Edit Park' : 'Add Park'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">Park Name *</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Enter park name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">Address *</label>
                  <textarea
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    required
                    placeholder="Enter park address"
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter park description (optional)"
                    rows={3}
                  />
                </div>

                {editingPark && (
                  <div className="form-group">
                    <label htmlFor="receptionEmail">Reception Email</label>
                    <input
                      type="email"
                      id="receptionEmail"
                      value={formData.receptionEmail}
                      onChange={e => setFormData({ ...formData, receptionEmail: e.target.value })}
                      placeholder="reception@example.com (optional)"
                    />
                    <small>When set, users can add external guests to bookings. The reception will be notified to prepare guest passes.</small>

                    {formData.receptionEmail && (
                      <div className="mt-4">
                        <label>Guest Information Fields</label>
                        <small>Choose which information to collect from external guests.</small>
                        <div className="checkbox-row">
                          <label>
                            <input type="checkbox" checked disabled />
                            Name (always required)
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.receptionGuestFields.includes('email')}
                              onChange={e => {
                                const fields = e.target.checked
                                  ? [...formData.receptionGuestFields, 'email']
                                  : formData.receptionGuestFields.filter(f => f !== 'email');
                                setFormData({ ...formData, receptionGuestFields: fields });
                              }}
                            />
                            Email
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.receptionGuestFields.includes('company')}
                              onChange={e => {
                                const fields = e.target.checked
                                  ? [...formData.receptionGuestFields, 'company']
                                  : formData.receptionGuestFields.filter(f => f !== 'company');
                                setFormData({ ...formData, receptionGuestFields: fields });
                              }}
                            />
                            Company / Organization
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editingPark && settings?.twofaEnforcement === 'optional' && (
                  <div className="form-group">
                    <label htmlFor="parkTwofaEnforcement">Two-Factor Authentication</label>
                    <select
                      id="parkTwofaEnforcement"
                      value={parkTwofaEnforcement}
                      onChange={e => setParkTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
                    >
                      <option value="inherit">Inherit from System (Optional)</option>
                      <option value="optional">Optional - Users can enable 2FA</option>
                      <option value="required">Required - All users in this park must use 2FA</option>
                    </select>
                    <small>Override system 2FA enforcement for this park</small>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
