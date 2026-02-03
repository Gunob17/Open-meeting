import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { MeetingRoom, Booking } from '../types';
import { BookingModal } from '../components/BookingModal';
import { format, parseISO, isAfter, isBefore } from 'date-fns';

export function RoomsListPage() {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [filterCapacity, setFilterCapacity] = useState<number>(0);
  const [filterAmenity, setFilterAmenity] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const [roomsData, bookingsData] = await Promise.all([
        api.getRooms(),
        api.getBookings(now.toISOString(), endOfDay.toISOString())
      ]);
      setRooms(roomsData);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isRoomAvailableNow = (roomId: string): boolean => {
    const now = new Date();
    return !bookings.some(booking => {
      if (booking.roomId !== roomId || booking.status === 'cancelled') return false;
      const start = parseISO(booking.startTime);
      const end = parseISO(booking.endTime);
      return isBefore(start, now) && isAfter(end, now);
    });
  };

  const getNextBooking = (roomId: string): Booking | null => {
    const now = new Date();
    const roomBookings = bookings
      .filter(b => b.roomId === roomId && b.status === 'confirmed' && isAfter(parseISO(b.startTime), now))
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
    return roomBookings[0] || null;
  };

  const getCurrentBooking = (roomId: string): Booking | null => {
    const now = new Date();
    return bookings.find(booking => {
      if (booking.roomId !== roomId || booking.status === 'cancelled') return false;
      const start = parseISO(booking.startTime);
      const end = parseISO(booking.endTime);
      return isBefore(start, now) && isAfter(end, now);
    }) || null;
  };

  const allAmenities = [...new Set(rooms.flatMap(r => r.amenities))].sort();

  const filteredRooms = rooms.filter(room => {
    if (filterCapacity > 0 && room.capacity < filterCapacity) return false;
    if (filterAmenity && !room.amenities.includes(filterAmenity)) return false;
    return true;
  });

  if (loading) {
    return <div className="loading">Loading rooms...</div>;
  }

  return (
    <div className="rooms-page">
      <div className="page-header">
        <h1>Meeting Rooms</h1>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Min Capacity:</label>
          <select value={filterCapacity} onChange={e => setFilterCapacity(Number(e.target.value))}>
            <option value={0}>Any</option>
            <option value={4}>4+ people</option>
            <option value={8}>8+ people</option>
            <option value={12}>12+ people</option>
            <option value={20}>20+ people</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Amenity:</label>
          <select value={filterAmenity} onChange={e => setFilterAmenity(e.target.value)}>
            <option value="">Any</option>
            {allAmenities.map(amenity => (
              <option key={amenity} value={amenity}>{amenity}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rooms-grid">
        {filteredRooms.map(room => {
          const isAvailable = isRoomAvailableNow(room.id);
          const currentBooking = getCurrentBooking(room.id);
          const nextBooking = getNextBooking(room.id);

          return (
            <div key={room.id} className={`room-card ${isAvailable ? 'available' : 'occupied'}`}>
              <div className="room-card-header">
                <h3>{room.name}</h3>
                <span className={`status-badge ${isAvailable ? 'available' : 'occupied'}`}>
                  {isAvailable ? 'Available' : 'Occupied'}
                </span>
              </div>

              <div className="room-card-body">
                <div className="room-info">
                  <p><strong>Capacity:</strong> {room.capacity} people</p>
                  <p><strong>Floor:</strong> {room.floor}</p>
                  <p><strong>Address:</strong> {room.address}</p>
                </div>

                <div className="room-amenities">
                  <strong>Amenities:</strong>
                  <div className="amenities-list">
                    {room.amenities.map(amenity => (
                      <span key={amenity} className="amenity-tag">{amenity}</span>
                    ))}
                  </div>
                </div>

                {room.description && (
                  <p className="room-description">{room.description}</p>
                )}

                {currentBooking && (
                  <div className="current-booking">
                    <strong>Current Meeting:</strong>
                    <p>{currentBooking.title}</p>
                    <p className="booking-time">
                      Until {format(parseISO(currentBooking.endTime), 'h:mm a')}
                    </p>
                  </div>
                )}

                {isAvailable && nextBooking && (
                  <div className="next-booking">
                    <strong>Next Booking:</strong>
                    <p>{nextBooking.title}</p>
                    <p className="booking-time">
                      {format(parseISO(nextBooking.startTime), 'h:mm a')} - {format(parseISO(nextBooking.endTime), 'h:mm a')}
                    </p>
                  </div>
                )}
              </div>

              <div className="room-card-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedRoom(room)}
                  disabled={!isAvailable}
                >
                  {isAvailable ? 'Book Now' : 'View Schedule'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRooms.length === 0 && (
        <div className="empty-state">
          <p>No rooms match your filters.</p>
        </div>
      )}

      {selectedRoom && (
        <BookingModal
          room={selectedRoom}
          initialDate={new Date()}
          initialHour={new Date().getHours() + 1}
          onClose={() => setSelectedRoom(null)}
          onBooked={() => {
            setSelectedRoom(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
