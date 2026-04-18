import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { MeetingRoom, Booking, Park, ExternalGuest } from '../types';

interface BookingModalProps {
  room: MeetingRoom;
  initialDate: Date;
  initialHour: number;
  initialMinute?: number;
  initialStartTime?: string;
  initialEndTime?: string;
  existingBooking?: Booking;
  onClose: () => void;
  onBooked: () => void;
}

export function BookingModal({ room, initialDate, initialHour, initialMinute = 0, initialStartTime, initialEndTime, existingBooking, onClose, onBooked }: BookingModalProps) {
  const { t } = useTranslation();
  const isEditing = !!existingBooking;

  const [title, setTitle] = useState(existingBooking?.title || '');
  const [description, setDescription] = useState(existingBooking?.description || '');
  const [startTime, setStartTime] = useState(
    initialStartTime ??
    (existingBooking
      ? format(parseISO(existingBooking.startTime), "yyyy-MM-dd'T'HH:mm")
      : format(new Date(initialDate).setHours(initialHour, initialMinute), "yyyy-MM-dd'T'HH:mm"))
  );
  const [endTime, setEndTime] = useState(
    initialEndTime ??
    (existingBooking
      ? format(parseISO(existingBooking.endTime), "yyyy-MM-dd'T'HH:mm")
      : format(new Date(new Date(initialDate).setHours(initialHour, initialMinute)).getTime() + 60 * 60 * 1000, "yyyy-MM-dd'T'HH:mm"))
  );
  const [attendees, setAttendees] = useState(
    existingBooking?.attendees?.join(', ') || ''
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [park, setPark] = useState<Park | null>(null);
  const [externalGuests, setExternalGuests] = useState<ExternalGuest[]>(
    existingBooking?.externalGuests || []
  );

  useEffect(() => {
    const loadPark = async () => {
      try {
        const parkData = await api.getPark(room.parkId);
        setPark(parkData);
      } catch (err) {
        console.error('Failed to load park:', err);
      }
    };
    loadPark();
  }, [room.parkId]);

  const hasReception = !!park?.receptionEmail;
  const guestFields = park?.receptionGuestFields || ['name'];

  const addExternalGuest = () => {
    setExternalGuests([...externalGuests, { name: '', email: '', company: '' }]);
  };

  const removeExternalGuest = (index: number) => {
    setExternalGuests(externalGuests.filter((_, i) => i !== index));
  };

  const updateExternalGuest = (index: number, field: keyof ExternalGuest, value: string) => {
    const updated = [...externalGuests];
    updated[index] = { ...updated[index], [field]: value };
    setExternalGuests(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const attendeeList = attendees
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);

      // Convert local time to UTC for storage
      // datetime-local gives us a string like "2026-01-29T09:00" which is interpreted as local time
      const startTimeUTC = new Date(startTime).toISOString();
      const endTimeUTC = new Date(endTime).toISOString();

      // Filter out guests without a name
      const validGuests = hasReception
        ? externalGuests.filter(g => g.name.trim().length > 0)
        : [];

      if (isEditing) {
        await api.updateBooking(existingBooking.id, {
          title,
          description,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          attendees: attendeeList,
          externalGuests: validGuests
        });
      } else {
        await api.createBooking({
          roomId: room.id,
          title,
          description,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          attendees: attendeeList,
          externalGuests: validGuests
        });
      }

      onBooked();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? t('bookingModal.saving') : t('bookingModal.booking'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? t('bookingModal.editTitle') : t('bookingModal.bookTitle', { room: room.name })}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="room-details">
              <p><strong>{t('common.name')}:</strong> {room.name}</p>
              <p><strong>{t('bookingModal.capacity', { count: room.capacity })}</strong></p>
              <p><strong>{t('common.floor')}:</strong> {room.floor}</p>
              <p><strong>{t('common.amenities')}:</strong> {room.amenities.join(', ')}</p>
              <p><strong>{t('common.address')}:</strong> {room.address}</p>
            </div>

            <div className="form-group">
              <label htmlFor="title">{t('bookingModal.meetingTitle')}</label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={t('bookingModal.meetingTitlePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">{t('bookingModal.description')}</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('bookingModal.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startTime">{t('bookingModal.startTime')}</label>
                <input
                  type="datetime-local"
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="endTime">{t('bookingModal.endTime')}</label>
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
              <label htmlFor="attendees">{t('bookingModal.inviteAttendees')}</label>
              <input
                type="text"
                id="attendees"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder={t('bookingModal.attendeesPlaceholder')}
              />
              <small>{t('bookingModal.attendeesNotice')}</small>
            </div>

            {hasReception && (
              <div className="form-group">
                <label>{t('bookingModal.externalGuests')}</label>
                <small style={{ display: 'block', marginBottom: '8px' }}>
                  {t('bookingModal.externalGuestsNotice')}
                </small>

                {externalGuests.map((guest, index) => (
                  <div key={index} className="external-guest-row">
                    <input
                      type="text"
                      placeholder={t('bookingModal.guestName')}
                      value={guest.name}
                      onChange={(e) => updateExternalGuest(index, 'name', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    {guestFields.includes('email') && (
                      <input
                        type="email"
                        placeholder={t('bookingModal.guestEmail')}
                        value={guest.email || ''}
                        onChange={(e) => updateExternalGuest(index, 'email', e.target.value)}
                        style={{ flex: 1 }}
                      />
                    )}
                    {guestFields.includes('company') && (
                      <input
                        type="text"
                        placeholder={t('bookingModal.guestCompany')}
                        value={guest.company || ''}
                        onChange={(e) => updateExternalGuest(index, 'company', e.target.value)}
                        style={{ flex: 1 }}
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => removeExternalGuest(index)}
                    >
                      {t('bookingModal.removeGuest')}
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={addExternalGuest}
                >
                  {t('bookingModal.addGuest')}
                </button>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('bookingModal.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (isEditing ? t('bookingModal.saving') : t('bookingModal.booking')) : (isEditing ? t('bookingModal.saveChanges') : t('bookingModal.bookRoom'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
