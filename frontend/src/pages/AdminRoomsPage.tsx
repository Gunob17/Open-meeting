import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { MeetingRoom } from '../types';

const COMMON_AMENITIES = [
  'Projector',
  'Whiteboard',
  'Video Conferencing',
  'TV Screen',
  'Conference Phone',
  'Air Conditioning',
  'Standing Desk',
  'Catering Service',
  'Recording Equipment',
  'Microphones',
  'Multiple Screens'
];

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<MeetingRoom | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    capacity: 4,
    amenities: [] as string[],
    floor: '',
    address: '',
    description: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await api.getRooms(true);
      setRooms(data);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (room?: MeetingRoom) => {
    if (room) {
      setEditingRoom(room);
      setFormData({
        name: room.name,
        capacity: room.capacity,
        amenities: room.amenities,
        floor: room.floor,
        address: room.address,
        description: room.description
      });
    } else {
      setEditingRoom(null);
      setFormData({
        name: '',
        capacity: 4,
        amenities: [],
        floor: '',
        address: '',
        description: ''
      });
    }
    setError('');
    setShowModal(true);
  };

  const handleAmenityToggle = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom.id, formData);
      } else {
        await api.createRoom(formData);
      }
      setShowModal(false);
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save room');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (room: MeetingRoom) => {
    try {
      await api.updateRoom(room.id, { isActive: !room.isActive });
      loadRooms();
    } catch (error) {
      console.error('Failed to update room:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this room? This action cannot be undone.')) return;

    try {
      await api.deleteRoom(id, false);
      loadRooms();
    } catch (error) {
      console.error('Failed to delete room:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading rooms...</div>;
  }

  return (
    <div className="admin-rooms-page">
      <div className="page-header">
        <h1>Manage Meeting Rooms</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Add Room
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Capacity</th>
              <th>Floor</th>
              <th>Amenities</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => (
              <tr key={room.id} className={!room.isActive ? 'inactive' : ''}>
                <td>{room.name}</td>
                <td>{room.capacity}</td>
                <td>{room.floor}</td>
                <td>
                  <div className="amenities-cell">
                    {room.amenities.slice(0, 3).map(a => (
                      <span key={a} className="amenity-tag small">{a}</span>
                    ))}
                    {room.amenities.length > 3 && (
                      <span className="amenity-tag small">+{room.amenities.length - 3} more</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`status-badge ${room.isActive ? 'active' : 'inactive'}`}>
                    {room.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(room)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-small ${room.isActive ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => handleToggleActive(room)}
                    >
                      {room.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(room.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRoom ? 'Edit Room' : 'Add Room'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">Room Name *</label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Innovation Lab"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="capacity">Capacity *</label>
                    <input
                      type="number"
                      id="capacity"
                      value={formData.capacity}
                      onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                      required
                      min={1}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="floor">Floor *</label>
                  <input
                    type="text"
                    id="floor"
                    value={formData.floor}
                    onChange={e => setFormData({ ...formData, floor: e.target.value })}
                    required
                    placeholder="e.g., 3rd Floor"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">Address *</label>
                  <input
                    type="text"
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    required
                    placeholder="Full address including room number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the room"
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label>Amenities</label>
                  <div className="amenities-grid">
                    {COMMON_AMENITIES.map(amenity => (
                      <label key={amenity} className="amenity-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.amenities.includes(amenity)}
                          onChange={() => handleAmenityToggle(amenity)}
                        />
                        <span>{amenity}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
