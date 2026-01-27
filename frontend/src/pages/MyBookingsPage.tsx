import React, { useState, useEffect } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { api } from '../services/api';
import { Booking } from '../types';

export function MyBookingsPage() {
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
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;

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
    return <div className="loading">Loading bookings...</div>;
  }

  return (
    <div className="my-bookings-page">
      <div className="page-header">
        <h1>My Bookings</h1>
      </div>

      <section className="bookings-section">
        <h2>Upcoming Bookings ({upcomingBookings.length})</h2>
        {upcomingBookings.length === 0 ? (
          <p className="empty-message">No upcoming bookings</p>
        ) : (
          <div className="bookings-list">
            {upcomingBookings.map(booking => (
              <div key={booking.id} className="booking-card">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge confirmed">Confirmed</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>Room:</strong> {booking.room?.name}</p>
                  <p><strong>Date:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>Time:</strong> {format(parseISO(booking.startTime), 'h:mm a')} - {format(parseISO(booking.endTime), 'h:mm a')}</p>
                  {booking.room && (
                    <p><strong>Location:</strong> {booking.room.floor}, {booking.room.address}</p>
                  )}
                  {booking.description && (
                    <p><strong>Description:</strong> {booking.description}</p>
                  )}
                  {booking.attendees.length > 0 && (
                    <p><strong>Attendees:</strong> {booking.attendees.join(', ')}</p>
                  )}
                </div>
                <div className="booking-card-footer">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancelling === booking.id}
                  >
                    {cancelling === booking.id ? 'Cancelling...' : 'Cancel Booking'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bookings-section">
        <h2>Past Bookings ({pastBookings.length})</h2>
        {pastBookings.length === 0 ? (
          <p className="empty-message">No past bookings</p>
        ) : (
          <div className="bookings-list">
            {pastBookings.map(booking => (
              <div key={booking.id} className="booking-card past">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge past">Past</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>Room:</strong> {booking.room?.name}</p>
                  <p><strong>Date:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>Time:</strong> {format(parseISO(booking.startTime), 'h:mm a')} - {format(parseISO(booking.endTime), 'h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {cancelledBookings.length > 0 && (
        <section className="bookings-section">
          <h2>Cancelled Bookings ({cancelledBookings.length})</h2>
          <div className="bookings-list">
            {cancelledBookings.map(booking => (
              <div key={booking.id} className="booking-card cancelled">
                <div className="booking-card-header">
                  <h3>{booking.title}</h3>
                  <span className="status-badge cancelled">Cancelled</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>Room:</strong> {booking.room?.name}</p>
                  <p><strong>Date:</strong> {format(parseISO(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p><strong>Time:</strong> {format(parseISO(booking.startTime), 'h:mm a')} - {format(parseISO(booking.endTime), 'h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
