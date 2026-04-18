import React, { useState, useEffect } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Booking } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatTime } from '../utils/time';
import { useConfirm } from '../context/ConfirmContext';

export function MyBookingsPage() {
  const { t } = useTranslation();
  const { timeFormat } = useSettings();
  const showConfirm = useConfirm();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const data = await api.getMyBookings();
      setBookings(data);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!await showConfirm({ message: t('myBookings.cancelConfirm'), confirmLabel: t('myBookings.cancelBooking'), variant: 'warning' })) return;

    setCancelling(id);
    try {
      await api.cancelBooking(id);
      loadBookings();
    } catch (error) {
      console.error('Failed to cancel booking:', error);
    } finally {
      setCancelling(null);
    }
  };

  const upcomingBookings = bookings.filter(b =>
    b.status === 'confirmed' && !isPast(parseISO(b.endTime))
  );

  const pastBookings = bookings.filter(b =>
    b.status === 'confirmed' && isPast(parseISO(b.endTime))
  );

  const cancelledBookings = bookings.filter(b => b.status === 'cancelled');

  if (loading) {
    return <div className="loading">{t('myBookings.loading')}</div>;
  }

  return (
    <div className="my-bookings-page">
      <div className="page-header">
        <h1>{t('myBookings.title')}</h1>
      </div>

      <section className="bookings-section">
        <h2>{t('myBookings.upcoming', { count: upcomingBookings.length })}</h2>
        {upcomingBookings.length === 0 ? (
          <p className="empty-message">{t('myBookings.noUpcoming')}</p>
        ) : (
          <div className="bookings-list">
            {upcomingBookings.map(booking => (
              <div key={booking.id} className="booking-card">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge confirmed">{t('myBookings.confirmed')}</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>{t('myBookings.room')}:</strong> {booking.room?.name}</p>
                  <p><strong>{t('myBookings.date')}:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>{t('myBookings.time')}:</strong> {formatTime(booking.startTime, timeFormat)} - {formatTime(booking.endTime, timeFormat)}</p>
                  {booking.room && (
                    <p><strong>{t('myBookings.location')}:</strong> {booking.room.floor}, {booking.room.address}</p>
                  )}
                  {booking.description && (
                    <p><strong>{t('myBookings.description')}:</strong> {booking.description}</p>
                  )}
                  {booking.attendees.length > 0 && (
                    <p><strong>{t('myBookings.attendees')}:</strong> {booking.attendees.join(', ')}</p>
                  )}
                </div>
                <div className="booking-card-footer">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancelling === booking.id}
                  >
                    {cancelling === booking.id ? t('myBookings.cancelling') : t('myBookings.cancelBooking')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bookings-section">
        <h2>{t('myBookings.past', { count: pastBookings.length })}</h2>
        {pastBookings.length === 0 ? (
          <p className="empty-message">{t('myBookings.noPast')}</p>
        ) : (
          <div className="bookings-list">
            {pastBookings.map(booking => (
              <div key={booking.id} className="booking-card past">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge past">{t('myBookings.pastLabel')}</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>{t('myBookings.room')}:</strong> {booking.room?.name}</p>
                  <p><strong>{t('myBookings.date')}:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>{t('myBookings.time')}:</strong> {formatTime(booking.startTime, timeFormat)} - {formatTime(booking.endTime, timeFormat)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {cancelledBookings.length > 0 && (
        <section className="bookings-section">
          <h2>{t('myBookings.cancelled', { count: cancelledBookings.length })}</h2>
          <div className="bookings-list">
            {cancelledBookings.map(booking => (
              <div key={booking.id} className="booking-card cancelled">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge cancelled">{t('myBookings.cancelledLabel')}</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>{t('myBookings.room')}:</strong> {booking.room?.name}</p>
                  <p><strong>{t('myBookings.date')}:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>{t('myBookings.time')}:</strong> {formatTime(booking.startTime, timeFormat)} - {formatTime(booking.endTime, timeFormat)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
