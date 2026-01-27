import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';
import { api } from '../services/api';
import { Booking, MeetingRoom } from '../types';
import { BookingModal } from '../components/BookingModal';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{
    room: MeetingRoom;
    date: Date;
    hour: number;
  } | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsData, bookingsData] = await Promise.all([
        api.getRooms(),
        api.getBookings(weekStart.toISOString(), addDays(weekEnd, 1).toISOString())
      ]);
      setRooms(roomsData);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getBookingsForSlot = (roomId: string, date: Date, hour: number) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    return bookings.filter(booking => {
      if (booking.roomId !== roomId || booking.status === 'cancelled') return false;
      const bookingStart = parseISO(booking.startTime);
      const bookingEnd = parseISO(booking.endTime);
      return (
        (bookingStart < slotEnd && bookingEnd > slotStart)
      );
    });
  };

  const handleSlotClick = (room: MeetingRoom, date: Date, hour: number) => {
    const slotBookings = getBookingsForSlot(room.id, date, hour);
    if (slotBookings.length > 0) {
      setSelectedBooking(slotBookings[0]);
    } else {
      setSelectedSlot({ room, date, hour });
    }
  };

  const handleBookingCreated = () => {
    setSelectedSlot(null);
    loadData();
  };

  const handleBookingCancelled = async () => {
    if (selectedBooking) {
      try {
        await api.cancelBooking(selectedBooking.id);
        setSelectedBooking(null);
        loadData();
      } catch (error) {
        console.error('Failed to cancel booking:', error);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading calendar...</div>;
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Meeting Room Calendar</h1>
        <div className="calendar-nav">
          <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="btn btn-secondary">
            Previous Week
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary">
            Today
          </button>
          <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="btn btn-secondary">
            Next Week
          </button>
        </div>
        <h2>{format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}</h2>
      </div>

      <div className="calendar-container">
        <div className="calendar-grid">
          {/* Header row with room names */}
          <div className="calendar-corner">
            <div className="room-header">Time / Room</div>
          </div>
          {rooms.map(room => (
            <div key={room.id} className="room-column-header">
              <div className="room-name">{room.name}</div>
              <div className="room-capacity">{room.capacity} people</div>
            </div>
          ))}

          {/* Calendar body */}
          {weekDays.map(day => (
            <React.Fragment key={day.toISOString()}>
              {/* Day header spanning all room columns */}
              <div className="day-header" style={{ gridColumn: `1 / span ${rooms.length + 1}` }}>
                {format(day, 'EEEE, MMM d')}
                {isSameDay(day, new Date()) && <span className="today-badge">Today</span>}
              </div>

              {/* Time slots for each hour */}
              {HOURS.map(hour => (
                <React.Fragment key={`${day.toISOString()}-${hour}`}>
                  <div className="time-slot-label">
                    {format(new Date().setHours(hour, 0), 'h:mm a')}
                  </div>
                  {rooms.map(room => {
                    const slotBookings = getBookingsForSlot(room.id, day, hour);
                    const isBooked = slotBookings.length > 0;
                    const booking = slotBookings[0];
                    const isPast = new Date(day).setHours(hour) < Date.now();

                    return (
                      <div
                        key={`${room.id}-${day.toISOString()}-${hour}`}
                        className={`time-slot ${isBooked ? 'booked' : 'available'} ${isPast ? 'past' : ''}`}
                        onClick={() => !isPast && handleSlotClick(room, day, hour)}
                      >
                        {isBooked && (
                          <div className="booking-indicator">
                            <span className="booking-title">{booking.title}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Booking Modal */}
      {selectedSlot && (
        <BookingModal
          room={selectedSlot.room}
          initialDate={selectedSlot.date}
          initialHour={selectedSlot.hour}
          onClose={() => setSelectedSlot(null)}
          onBooked={handleBookingCreated}
        />
      )}

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedBooking.title}</h2>
              <button className="modal-close" onClick={() => setSelectedBooking(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>Room:</strong> {selectedBooking.room?.name}</p>
              <p><strong>Time:</strong> {format(parseISO(selectedBooking.startTime), 'MMM d, yyyy h:mm a')} - {format(parseISO(selectedBooking.endTime), 'h:mm a')}</p>
              {selectedBooking.description && (
                <p><strong>Description:</strong> {selectedBooking.description}</p>
              )}
              {selectedBooking.attendees.length > 0 && (
                <p><strong>Attendees:</strong> {selectedBooking.attendees.join(', ')}</p>
              )}
              <p><strong>Booked by:</strong> {selectedBooking.user?.name}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedBooking(null)}>
                Close
              </button>
              <button className="btn btn-danger" onClick={handleBookingCancelled}>
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
