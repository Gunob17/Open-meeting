import React, { useState, useEffect } from 'react';
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

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
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
