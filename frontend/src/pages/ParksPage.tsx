import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Park } from '../types';

export function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPark, setEditingPark] = useState<Park | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogoFor, setUploadingLogoFor] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadParks();
  }, []);

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
        description: park.description || ''
      });
    } else {
      setEditingPark(null);
      setFormData({
        name: '',
        address: '',
        description: ''
      });
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
        await api.updatePark(editingPark.id, formData);
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
