import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { api } from '../services/api';
import { Desk, DeskBooking, DeskQuotaStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DesksPage() {
  const { user } = useAuth();
  const showConfirm = useConfirm();
  const [desks, setDesks] = useState<Desk[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [bookingsForDate, setBookingsForDate] = useState<DeskBooking[]>([]);
  const [myBookings, setMyBookings] = useState<DeskBooking[]>([]);
  const [quota, setQuota] = useState<DeskQuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [bookingDeskId, setBookingDeskId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bookingErrors, setBookingErrors] = useState<Record<string, string>>({});

  const currentMonth = selectedDate.slice(0, 7);

  const loadDesks = useCallback(async () => {
    try {
      const data = await api.getDesks(false);
      setDesks(data);
      return data;
    } catch (err: any) {
      if (err.status === 403) {
        setAccessDenied(true);
      }
      return [];
    }
  }, []);

  const loadBookingsForDate = useCallback(async (date: string) => {
    const bookings = await api.getDeskBookingsForPark(date, date);
    setBookingsForDate(bookings);
  }, []);

  const loadMyBookings = useCallback(async () => {
    const bookings = await api.getMyDeskBookings();
    setMyBookings(bookings);
  }, []);

  const loadQuota = useCallback(async (month: string) => {
    try {
      const status = await api.getDeskQuotaStatus(month);
      setQuota(status);
    } catch {
      setQuota(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadDesks(),
        loadMyBookings(),
        loadBookingsForDate(selectedDate),
        loadQuota(currentMonth),
      ]);
    } catch (err) {
      console.error('Failed to load desk data:', err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) {
      loadBookingsForDate(selectedDate).catch(console.error);
    }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBook = async (desk: Desk) => {
    setBookingDeskId(desk.id);
    setBookingErrors((prev) => ({ ...prev, [desk.id]: '' }));
    try {
      await api.createDeskBooking(desk.id, selectedDate);
      await Promise.all([
        loadBookingsForDate(selectedDate),
        loadMyBookings(),
        loadQuota(currentMonth),
      ]);
    } catch (err: any) {
      setBookingErrors((prev) => ({ ...prev, [desk.id]: err.message || 'Failed to book desk' }));
    } finally {
      setBookingDeskId(null);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!await showConfirm({ message: 'Are you sure you want to cancel this desk booking?', confirmLabel: 'Cancel Booking', variant: 'warning' })) return;
    setCancellingId(bookingId);
    try {
      await api.cancelDeskBooking(bookingId);
      await Promise.all([
        loadBookingsForDate(selectedDate),
        loadMyBookings(),
        loadQuota(currentMonth),
      ]);
    } catch (err: any) {
      console.error('Failed to cancel desk booking:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const getBookingForDesk = (deskId: string) =>
    bookingsForDate.find((b) => b.deskId === deskId && b.status === 'confirmed');

  const upcomingMyBookings = myBookings.filter(
    (b) => b.status === 'confirmed' && b.bookingDate >= todayISO()
  );

  const quotaExceeded = quota && quota.remainingThisMonth !== null && quota.remainingThisMonth <= 0;

  if (loading) {
    return <div className="loading">Loading hot desks...</div>;
  }

  if (accessDenied) {
    return (
      <div className="rooms-page">
        <div className="page-header"><h1>Hot Desks</h1></div>
        <div className="empty-state">
          <p>Hot desk booking is not available for your company. Contact your park administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rooms-page">
      <div className="page-header">
        <h1>Hot Desks</h1>
      </div>

      {/* Park-wide quota summary */}
      {quota && quota.monthlyQuota !== null && (
        <div className="filters" style={{ marginBottom: '1rem' }}>
          <div className="filter-group">
            <span style={{ fontWeight: 500 }}>Monthly allowance:</span>{' '}
            {quota.remainingThisMonth !== null ? (
              <span style={{ color: quotaExceeded ? '#ef4444' : 'inherit' }}>
                <strong>{quota.remainingThisMonth}</strong> of {quota.monthlyQuota} day{quota.monthlyQuota !== 1 ? 's' : ''} remaining
                {quota.quotaType === 'per_company' ? ' (shared with your company)' : ''}
              </span>
            ) : (
              <span>Unlimited</span>
            )}
          </div>
        </div>
      )}

      <div className="filters">
        <div className="filter-group">
          <label>Date:</label>
          <input
            type="date"
            value={selectedDate}
            min={todayISO()}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setBookingErrors({});
            }}
          />
        </div>
      </div>

      <section className="bookings-section">
        <h2>Availability for {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}</h2>

        {desks.length === 0 ? (
          <div className="empty-state">
            <p>No hot desks are currently available in your park.</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {desks.map((desk) => {
              const booking = getBookingForDesk(desk.id);
              const isBookedByMe = booking?.userId === user?.id;
              const isBookedByOther = !!booking && !isBookedByMe;
              const bookingError = bookingErrors[desk.id];
              const statusLabel = isBookedByMe ? 'Booked by you' : isBookedByOther ? 'Occupied' : 'Available';
              const statusClass = isBookedByMe || isBookedByOther ? 'occupied' : 'available';

              return (
                <div key={desk.id} className={`room-card ${statusClass}`}>
                  <div className="room-card-header">
                    <h3>{desk.name}</h3>
                    <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                  </div>

                  <div className="room-card-body">
                    {desk.floor && <p><strong>Location:</strong> {desk.floor}</p>}
                    {desk.description && <p className="room-description">{desk.description}</p>}
                    {bookingError && (
                      <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {bookingError}
                      </p>
                    )}
                  </div>

                  <div className="room-card-footer">
                    {isBookedByMe ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCancel(booking!.id)}
                        disabled={cancellingId === booking!.id}
                      >
                        {cancellingId === booking!.id ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    ) : isBookedByOther ? (
                      <button className="btn btn-primary" disabled>Occupied</button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleBook(desk)}
                        disabled={bookingDeskId === desk.id || !!quotaExceeded}
                      >
                        {bookingDeskId === desk.id ? 'Booking...' : quotaExceeded ? 'Quota Reached' : 'Book Desk'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bookings-section">
        <h2>My Upcoming Desk Bookings ({upcomingMyBookings.length})</h2>

        {upcomingMyBookings.length === 0 ? (
          <p className="empty-message">No upcoming desk bookings</p>
        ) : (
          <div className="bookings-list">
            {upcomingMyBookings.map((booking) => (
              <div key={booking.id} className="booking-card">
                <div className="booking-card-header">
                  <h3>{booking.desk?.name ?? 'Desk'}</h3>
                  <span className="status-badge confirmed">Confirmed</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>Date:</strong> {format(parseISO(booking.bookingDate), 'EEEE, MMMM d, yyyy')}</p>
                  {booking.desk?.floor && <p><strong>Location:</strong> {booking.desk.floor}</p>}
                </div>
                <div className="booking-card-footer">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancellingId === booking.id}
                  >
                    {cancellingId === booking.id ? 'Cancelling...' : 'Cancel Booking'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
