import React, { useState } from 'react';
import { format } from 'date-fns';
import { api } from '../services/api';
import { MeetingRoom } from '../types';

interface BookingModalProps {
  room: MeetingRoom;
  initialDate: Date;
  initialHour: number;
  onClose: () => void;
  onBooked: () => void;
}

export function BookingModal({ room, initialDate, initialHour, onClose, onBooked }: BookingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState(
    format(new Date(initialDate).setHours(initialHour, 0), "yyyy-MM-dd'T'HH:mm")
  );
  const [endTime, setEndTime] = useState(
    format(new Date(initialDate).setHours(initialHour + 1, 0), "yyyy-MM-dd'T'HH:mm")
  );
  const [attendees, setAttendees] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const attendeeList = attendees
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);

      await api.createBooking({
        roomId: room.id,
        title,
        description,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        attendees: attendeeList
      });

      onBooked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Book {room.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="room-details">
              <p><strong>Capacity:</strong> {room.capacity} people</p>
              <p><strong>Floor:</strong> {room.floor}</p>
              <p><strong>Amenities:</strong> {room.amenities.join(', ')}</p>
              <p><strong>Address:</strong> {room.address}</p>
            </div>

            <div className="form-group">
              <label htmlFor="title">Meeting Title *</label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Enter meeting title"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter meeting description (optional)"
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startTime">Start Time *</label>
                <input
                  type="datetime-local"
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="endTime">End Time *</label>
                <input
                  type="datetime-local"
                  id="endTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="attendees">Invite Attendees (comma-separated emails)</label>
              <input
                type="text"
                id="attendees"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
              />
              <small>Attendees will receive an email with a calendar invite</small>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Booking...' : 'Book Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
