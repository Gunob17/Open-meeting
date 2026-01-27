import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addDays, subDays, isSameDay, parseISO } from 'date-fns';
import { api } from '../services/api';
import { Booking, MeetingRoom, Settings } from '../types';
import { BookingModal } from '../components/BookingModal';
import { useAuth } from '../context/AuthContext';

export function CalendarPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(new Date());
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{
    room: MeetingRoom;
    date: Date;
    hour: number;
  } | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  // Show 7 days starting from startDate
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startDate, i)), [startDate]);
  const endDate = useMemo(() => addDays(startDate, 7), [startDate]);

  // Generate hours based on global settings
  const hours = useMemo(() => {
    const opening = settings?.openingHour ?? 8;
    const closing = settings?.closingHour ?? 18;
    return Array.from({ length: closing - opening }, (_, i) => i + opening);
  }, [settings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsData, bookingsData, settingsData] = await Promise.all([
        api.getRooms(),
        api.getBookings(startDate.toISOString(), endDate.toISOString()),
        api.getSettings()
      ]);
      setRooms(roomsData);
      setBookings(bookingsData);
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Check if a slot is available for booking based on room-specific or global hours
  const isSlotAvailable = useCallback((room: MeetingRoom, hour: number): boolean => {
    const openingHour = room.openingHour ?? settings?.openingHour ?? 8;
    const closingHour = room.closingHour ?? settings?.closingHour ?? 18;
    return hour >= openingHour && hour < closingHour;
  }, [settings]);

  // Check if user can book this room (company lock check)
  const canUserBookRoom = useCallback((room: MeetingRoom): boolean => {
    if (!room.lockedToCompanyId) return true;
    return room.lockedToCompanyId === user?.companyId;
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get booking that overlaps with this slot
  const getBookingForSlot = (roomId: string, date: Date, hour: number): Booking | null => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    const booking = bookings.find(b => {
      if (b.roomId !== roomId || b.status === 'cancelled') return false;
      const bookingStart = parseISO(b.startTime);
      const bookingEnd = parseISO(b.endTime);
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });

    return booking || null;
  };

  // Check if this slot is the START of a booking (to render the spanning indicator)
  const isBookingStart = (booking: Booking, date: Date, hour: number): boolean => {
    const bookingStart = parseISO(booking.startTime);
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);

    return isSameDay(bookingStart, slotStart) && bookingStart.getHours() === hour;
  };

  // Calculate booking duration in hours for spanning display
  const getBookingDuration = (booking: Booking): number => {
    const start = parseISO(booking.startTime);
    const end = parseISO(booking.endTime);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  };

  const handleSlotClick = (room: MeetingRoom, date: Date, hour: number) => {
    const booking = getBookingForSlot(room.id, date, hour);
    if (booking) {
      setSelectedBooking(booking);
    } else {
      setSelectedSlot({ room, date, hour });
    }
  };

  const handleBookingCreated = () => {
    setSelectedSlot(null);
    setEditingBooking(null);
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

  const handleDeleteBooking = async () => {
    if (selectedBooking && window.confirm('Are you sure you want to delete this booking?')) {
      try {
        await api.deleteBooking(selectedBooking.id);
        setSelectedBooking(null);
        loadData();
      } catch (error) {
        console.error('Failed to delete booking:', error);
      }
    }
  };

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
    }
  };

  const isOwnBooking = (booking: Booking): boolean => {
    return booking.userId === user?.id;
  };

  if (loading) {
    return <div className="loading">Loading calendar...</div>;
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Meeting Room Calendar</h1>
        <div className="calendar-nav">
          <button onClick={() => setStartDate(subDays(startDate, 7))} className="btn btn-secondary">
            Previous 7 Days
          </button>
          <button onClick={() => setStartDate(new Date())} className="btn btn-secondary">
            Today
          </button>
          <button onClick={() => setStartDate(addDays(startDate, 7))} className="btn btn-secondary">
            Next 7 Days
          </button>
        </div>
        <h2>{format(startDate, 'MMM d')} - {format(addDays(startDate, 6), 'MMM d, yyyy')}</h2>
        <div className="calendar-legend">
          <div className="legend-item">
            <span className="legend-color available"></span>
            <span>Available - Click to book</span>
          </div>
          <div className="legend-item">
            <span className="legend-color booked"></span>
            <span>Booked - Click for details</span>
          </div>
          <div className="legend-item">
            <span className="legend-color unavailable"></span>
            <span>Outside hours</span>
          </div>
          <div className="legend-item">
            <span className="legend-color restricted"></span>
            <span>Restricted</span>
          </div>
          <div className="legend-item">
            <span className="legend-color past"></span>
            <span>Past</span>
          </div>
        </div>
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
          {days.map(day => (
            <React.Fragment key={day.toISOString()}>
              {/* Day header spanning all room columns */}
              <div className="day-header" style={{ gridColumn: `1 / span ${rooms.length + 1}` }}>
                {format(day, 'EEEE, MMM d')}
                {isSameDay(day, new Date()) && <span className="today-badge">Today</span>}
              </div>

              {/* Time slots for each hour */}
              {hours.map(hour => (
                <React.Fragment key={`${day.toISOString()}-${hour}`}>
                  <div className="time-slot-label">
                    {format(new Date().setHours(hour, 0), 'h:mm a')}
                  </div>
                  {rooms.map(room => {
                    const booking = getBookingForSlot(room.id, day, hour);
                    const isBooked = booking !== null;
                    const isPast = new Date(day).setHours(hour) < Date.now();
                    const isAvailable = isSlotAvailable(room, hour);
                    const canBook = canUserBookRoom(room);
                    const isRestricted = !isAvailable || !canBook;

                    // Check if this is the start of the booking (to show spanning indicator)
                    const showBookingStart = isBooked && isBookingStart(booking, day, hour);
                    const bookingDuration = showBookingStart ? getBookingDuration(booking) : 0;

                    let slotClass = 'time-slot';
                    let title = '';

                    if (isPast) {
                      slotClass += ' past';
                      title = 'Past time slot';
                    } else if (isBooked) {
                      slotClass += ' booked';
                      title = `${booking.title} - Click for details`;
                    } else if (!isAvailable) {
                      slotClass += ' unavailable';
                      title = 'Outside room booking hours';
                    } else if (!canBook) {
                      slotClass += ' restricted';
                      title = 'This room is reserved for another company';
                    } else {
                      slotClass += ' available';
                      title = `Book ${room.name} at ${format(new Date().setHours(hour, 0), 'h:mm a')}`;
                    }

                    return (
                      <div
                        key={`${room.id}-${day.toISOString()}-${hour}`}
                        className={slotClass}
                        onClick={() => !isPast && handleSlotClick(room, day, hour)}
                        title={title}
                      >
                        {showBookingStart && (
                          <div
                            className="booking-indicator booking-span"
                            style={{ height: `calc(${bookingDuration * 100}% + ${(bookingDuration - 1) * 2}px)` }}
                          >
                            <span className="booking-title">{booking.title}</span>
                            <span className="booking-time">
                              {format(parseISO(booking.startTime), 'h:mm a')} - {format(parseISO(booking.endTime), 'h:mm a')}
                            </span>
                          </div>
                        )}
                        {!isBooked && !isPast && !isRestricted && (
                          <div className="slot-available-indicator">
                            <span className="plus-icon">+</span>
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

      {/* Booking Modal for new bookings */}
      {selectedSlot && (
        <BookingModal
          room={selectedSlot.room}
          initialDate={selectedSlot.date}
          initialHour={selectedSlot.hour}
          onClose={() => setSelectedSlot(null)}
          onBooked={handleBookingCreated}
        />
      )}

      {/* Booking Modal for editing */}
      {editingBooking && (
        <BookingModal
          room={rooms.find(r => r.id === editingBooking.roomId)!}
          initialDate={parseISO(editingBooking.startTime)}
          initialHour={parseISO(editingBooking.startTime).getHours()}
          existingBooking={editingBooking}
          onClose={() => setEditingBooking(null)}
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
              {isOwnBooking(selectedBooking) && (
                <>
                  <button className="btn btn-primary" onClick={handleEditBooking}>
                    Edit
                  </button>
                  <button className="btn btn-warning" onClick={handleBookingCancelled}>
                    Cancel Booking
                  </button>
                  <button className="btn btn-danger" onClick={handleDeleteBooking}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
