import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { MeetingRoom, Booking } from '../types';
import { BookingModal } from '../components/BookingModal';
import { DatePicker } from '../components/DatePicker';
import { parseISO, isAfter, isBefore } from 'date-fns';
import { useSettings } from '../context/SettingsContext';
import { formatTime } from '../utils/time';

const ROOMS_PER_PAGE = 9;

export function RoomsListPage() {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [filterCapacity, setFilterCapacity] = useState<number>(0);
  const [filterAmenity, setFilterAmenity] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Room Finder state
  const [finderOpen, setFinderOpen] = useState(true);
  const [finderDate, setFinderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [finderStart, setFinderStart] = useState('09:00');
  const [finderEnd, setFinderEnd] = useState('10:00');
  const [finderPeople, setFinderPeople] = useState(1);
  const [finderAmenities, setFinderAmenities] = useState<string[]>([]);
  const [finderActive, setFinderActive] = useState(false);
  const [finderBookings, setFinderBookings] = useState<Booking[]>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderSlot, setFinderSlot] = useState<{ start: string; end: string } | null>(null);

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

  const isRoomAvailableForSlot = (roomId: string, start: Date, end: Date): boolean => {
    return !finderBookings.some(b => {
      if (b.roomId !== roomId || b.status === 'cancelled') return false;
      const bStart = parseISO(b.startTime);
      const bEnd = parseISO(b.endTime);
      return bStart < end && bEnd > start;
    });
  };

  const handleFinderSearch = async () => {
    if (!finderDate || !finderStart || !finderEnd) return;
    setFinderLoading(true);
    try {
      const startISO = new Date(`${finderDate}T${finderStart}`).toISOString();
      const endISO = new Date(`${finderDate}T${finderEnd}`).toISOString();
      const bookingsData = await api.getBookings(startISO, endISO);
      setFinderBookings(bookingsData);
      setFinderSlot({ start: `${finderDate}T${finderStart}`, end: `${finderDate}T${finderEnd}` });
      setFinderActive(true);
    } catch (err) {
      console.error('Finder search failed:', err);
    } finally {
      setFinderLoading(false);
    }
  };

  const handleFinderClear = () => {
    setFinderActive(false);
    setFinderSlot(null);
    setFinderBookings([]);
  };

  const { timeFormat } = useSettings();

  const allAmenities = [...new Set(rooms.flatMap(r => r.amenities))].sort();

  // Only show amenities that exist in rooms with enough capacity
  const finderAmenitiesAvailable = [...new Set(
    rooms.filter(r => r.capacity >= finderPeople).flatMap(r => r.amenities)
  )].sort();

  const filteredRooms = rooms.filter(room => {
    if (finderActive) {
      if (room.capacity < finderPeople) return false;
      if (finderAmenities.some(a => !room.amenities.includes(a))) return false;
      const start = new Date(`${finderDate}T${finderStart}`);
      const end = new Date(`${finderDate}T${finderEnd}`);
      if (!isRoomAvailableForSlot(room.id, start, end)) return false;
    } else {
      if (filterCapacity > 0 && room.capacity < filterCapacity) return false;
      if (filterAmenity && !room.amenities.includes(filterAmenity)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !room.name.toLowerCase().includes(q) &&
        !room.floor.toLowerCase().includes(q) &&
        !room.address.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalPages   = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  const safePage     = Math.min(currentPage, totalPages);
  const paginatedRooms = filteredRooms.slice((safePage - 1) * ROOMS_PER_PAGE, safePage * ROOMS_PER_PAGE);

  // Reset to page 1 whenever filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCapacity, filterAmenity, finderActive]);

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: '0.5rem' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rooms-page">
      <div className="page-header">
        <h1>Meeting Rooms</h1>
      </div>

      <div className="room-finder-panel">
        <button className="finder-toggle" onClick={() => setFinderOpen(o => !o)}>
          <span className="finder-toggle-icon">{finderOpen ? '▲' : '▼'}</span>
          Find an Available Room
          {finderActive && <span className="finder-active-badge">Search active</span>}
        </button>

        {finderOpen && (
          <div className="finder-form">
            <div className="finder-row">
              <div className="finder-field">
                <label>Date</label>
                <DatePicker
                  value={finderDate}
                  onChange={setFinderDate}
                  placeholder="Pick a date"
                />
              </div>
              <div className="finder-field">
                <label>From</label>
                <input
                  type="time"
                  value={finderStart}
                  onChange={e => setFinderStart(e.target.value)}
                />
              </div>
              <div className="finder-field">
                <label>To</label>
                <input
                  type="time"
                  value={finderEnd}
                  onChange={e => setFinderEnd(e.target.value)}
                />
              </div>
              <div className="finder-field">
                <label>People</label>
                <input
                  type="number"
                  min={1}
                  value={finderPeople}
                  onChange={e => {
                    const n = Math.max(1, Number(e.target.value));
                    setFinderPeople(n);
                    // Drop selected amenities that no longer exist in rooms with enough capacity
                    const available = new Set(
                      rooms.filter(r => r.capacity >= n).flatMap(r => r.amenities)
                    );
                    setFinderAmenities(prev => prev.filter(a => available.has(a)));
                  }}
                />
              </div>
            </div>

            {finderAmenitiesAvailable.length > 0 && (
              <div className="finder-amenities">
                <label>Amenities needed:</label>
                <div className="amenity-checkboxes">
                  {finderAmenitiesAvailable.map(amenity => (
                    <label key={amenity} className="amenity-checkbox-label">
                      <input
                        type="checkbox"
                        checked={finderAmenities.includes(amenity)}
                        onChange={e =>
                          setFinderAmenities(prev =>
                            e.target.checked ? [...prev, amenity] : prev.filter(a => a !== amenity)
                          )
                        }
                      />
                      {amenity}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="finder-actions">
              <button
                className="btn btn-primary"
                onClick={handleFinderSearch}
                disabled={!finderDate || finderLoading}
              >
                {finderLoading ? 'Searching...' : 'Find Available Rooms'}
              </button>
              {finderActive && (
                <button className="btn btn-secondary" onClick={handleFinderClear}>
                  Clear Search
                </button>
              )}
            </div>

            {finderActive && (
              <p className="finder-status">
                Showing <strong>{filteredRooms.length}</strong> room{filteredRooms.length !== 1 ? 's' : ''} available on{' '}
                {finderDate} from {finderStart}–{finderEnd} for {finderPeople}+ {finderPeople === 1 ? 'person' : 'people'}
                {finderAmenities.length > 0 && ` · ${finderAmenities.join(', ')}`}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="filters" style={{ alignItems: 'center' }}>
        {/* Search — always visible */}
        <div className="filter-group rooms-search-group">
          <div className="desks-search" style={{ margin: 0, minWidth: '220px' }}>
            <input
              type="search"
              className="form-input"
              placeholder="Search by name, floor or address…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search rooms"
            />
          </div>
        </div>

        {/* Standard filters — hidden while finder is active */}
        {!finderActive && (
          <>
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
          </>
        )}
      </div>

      <div className="rooms-grid">
        {paginatedRooms.map(room => {
          const isAvailable = isRoomAvailableNow(room.id);
          const currentBooking = getCurrentBooking(room.id);
          const nextBooking = getNextBooking(room.id);

          return (
            <div key={room.id} className={`room-card ${finderActive ? 'available' : (isAvailable ? 'available' : 'occupied')}`}>
              <div className="room-card-header">
                <h3>{room.name}</h3>
                <span className={`status-badge ${finderActive ? 'available' : (isAvailable ? 'available' : 'occupied')}`}>
                  {finderActive ? 'Available' : (isAvailable ? 'Available' : 'Occupied')}
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

                {room.bookingEmail && (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                    <strong>Book by email:</strong> <a href={`mailto:${room.bookingEmail}`}>{room.bookingEmail}</a>
                  </p>
                )}

                {!finderActive && currentBooking && (
                  <div className="current-booking">
                    <strong>Current Meeting:</strong>
                    <p>{currentBooking.title}</p>
                    <p className="booking-time">
                      Until {formatTime(currentBooking.endTime, timeFormat)}
                    </p>
                  </div>
                )}

                {!finderActive && isAvailable && nextBooking && (
                  <div className="next-booking">
                    <strong>Next Booking:</strong>
                    <p>{nextBooking.title}</p>
                    <p className="booking-time">
                      {formatTime(nextBooking.startTime, timeFormat)} - {formatTime(nextBooking.endTime, timeFormat)}
                    </p>
                  </div>
                )}
              </div>

              <div className="room-card-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedRoom(room)}
                  disabled={finderActive ? false : !isAvailable}
                >
                  {finderActive ? 'Book This Room' : (isAvailable ? 'Book Now' : 'View Schedule')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRooms.length === 0 && (
        <div className="empty-state">
          <p>
            {finderActive
              ? 'No rooms available for this time slot matching your criteria.'
              : searchQuery.trim()
              ? 'No rooms match your search.'
              : 'No rooms match your filters.'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="desks-pagination">
          <button
            className="btn btn-secondary desks-pagination__btn"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`desks-pagination__page${page === safePage ? ' desks-pagination__page--active' : ''}`}
              onClick={() => setCurrentPage(page)}
              aria-current={page === safePage ? 'page' : undefined}
            >
              {page}
            </button>
          ))}
          <button
            className="btn btn-secondary desks-pagination__btn"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}

      {selectedRoom && (
        <BookingModal
          room={selectedRoom}
          initialDate={new Date()}
          initialHour={new Date().getHours() + 1}
          initialStartTime={finderSlot?.start}
          initialEndTime={finderSlot?.end}
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
