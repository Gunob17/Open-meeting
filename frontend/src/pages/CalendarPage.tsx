import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format, addDays, subDays, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Booking, MeetingRoom, Settings } from '../types';
import { BookingModal } from '../components/BookingModal';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSettings } from '../context/SettingsContext';
import { formatTime, formatDateTime, formatHour } from '../utils/time';

// Accent colours for booking indicators — left border + tinted background.
// Chosen for good visibility in both light and dark modes.
const BOOKING_COLORS = [
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#9333ea', // purple-600
  '#ea580c', // orange-600
  '#0d9488', // teal-600
  '#db2777', // pink-600
  '#4f46e5', // indigo-600
  '#b45309', // amber-700
];
const getBookingColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return BOOKING_COLORS[Math.abs(hash) % BOOKING_COLORS.length];
};

/**
 * Assign a column index to each booking so overlapping meetings in the same
 * slot render side-by-side instead of on top of each other.
 * Returns a map of bookingId → { colIndex, totalCols }.
 */
const assignColumns = (slotBookings: Booking[]): Map<string, { colIndex: number; totalCols: number }> => {
  const sorted = [...slotBookings].sort(
    (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
  );
  const colEnds: Date[] = []; // tracks the end-time of the last booking placed in each column
  const result = new Map<string, { colIndex: number; totalCols: number }>();

  for (const b of sorted) {
    const start = parseISO(b.startTime);
    const end   = parseISO(b.endTime);
    let col = colEnds.findIndex(colEnd => colEnd <= start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = end;
    result.set(b.id, { colIndex: col, totalCols: 0 });
  }

  const totalCols = colEnds.length;
  for (const [id, info] of result) result.set(id, { ...info, totalCols });
  return result;
};

export function CalendarPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const showConfirm = useConfirm();
  const { timeFormat, calendarViewMode, setCalendarViewMode } = useSettings();
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
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTargetRoom, setMoveTargetRoom] = useState('');
  const [adminActionReason, setAdminActionReason] = useState('');

  // Mobile responsiveness — measured from the calendar container, not the window
  const [isMobile, setIsMobile] = useState(false);
  const [selectedMobileRoomId, setSelectedMobileRoomId] = useState<string>('');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Callback ref: fires whenever the calendar container mounts/unmounts.
  // Using a callback ref (instead of useRef + useEffect) ensures the observer
  // is attached even when the element first appears after the loading skeleton clears.
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsMobile(entry.contentRect.width <= 750);
    });
    observer.observe(el);
    resizeObserverRef.current = observer;
  }, []);

  // Show 7 days: rolling from startDate, or full Mon–Sun week
  const days = useMemo(() => {
    const base = calendarViewMode === 'weekly'
      ? startOfWeek(startDate, { weekStartsOn: 1 })
      : startDate;
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [startDate, calendarViewMode]);
  const endDate = useMemo(() => addDays(days[0], 7), [days]);

  // Generate hours based on global settings
  const hours = useMemo(() => {
    const opening = settings?.openingHour ?? 8;
    const closing = settings?.closingHour ?? 18;
    return Array.from({ length: closing - opening }, (_, i) => i + opening);
  }, [settings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Normalize to start-of-day so bookings from earlier today remain visible
      const rangeStart = new Date(startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const [roomsData, bookingsData, settingsData] = await Promise.all([
        api.getRooms(),
        api.getBookings(rangeStart.toISOString(), endDate.toISOString()),
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
    if (!room.lockedToCompanyIds || room.lockedToCompanyIds.length === 0) return true;
    return room.lockedToCompanyIds.includes(user?.companyId || '');
  }, [user]);

  // Set initial mobile room when rooms load
  useEffect(() => {
    if (rooms.length > 0 && !selectedMobileRoomId) {
      setSelectedMobileRoomId(rooms[0].id);
    }
  }, [rooms, selectedMobileRoomId]);


  // Rooms to render in the grid: single room on mobile, all rooms on desktop
  const displayRooms = isMobile
    ? rooms.filter(r => r.id === selectedMobileRoomId)
    : rooms;

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

  // Get ALL bookings that START within this hour slot (handles multiple per slot)
  const getBookingsStartingInSlot = (roomId: string, date: Date, hour: number): Booking[] => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    return bookings.filter(b => {
      if (b.roomId !== roomId || b.status === 'cancelled') return false;
      const bookingStart = parseISO(b.startTime);
      return bookingStart >= slotStart && bookingStart < slotEnd;
    });
  };

  // Calculate booking display info for proper visual representation
  const getBookingDisplayInfo = (booking: Booking, slotHour: number): {
    topOffset: number; // percentage from top of slot
    height: number; // number of slot heights to span
    slots: number; // number of full slots
  } => {
    const start = parseISO(booking.startTime);
    const end = parseISO(booking.endTime);

    // Calculate start offset within the hour (0-59 minutes -> 0-100%)
    const startMinutes = start.getMinutes();
    const topOffset = (startMinutes / 60) * 100;

    // Calculate total duration in minutes
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    // Calculate height as percentage of slot height
    // Each slot is 1 hour = 60 minutes = 100%
    const height = (durationMinutes / 60) * 100;

    // Calculate number of slots this booking spans
    const endHour = end.getHours();
    const endMinutes = end.getMinutes();
    const slots = endHour - slotHour + (endMinutes > 0 ? 1 : 0);

    return { topOffset, height, slots };
  };

  // Check if slot is fully booked (entire hour is covered by one or more bookings)
  const isSlotFullyBooked = (roomId: string, date: Date, hour: number): boolean => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    // Get all bookings for this slot
    const slotBookings = bookings.filter(b => {
      if (b.roomId !== roomId || b.status === 'cancelled') return false;
      const bookingStart = parseISO(b.startTime);
      const bookingEnd = parseISO(b.endTime);
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });

    if (slotBookings.length === 0) return false;

    // Check if the entire hour is covered
    // Sort bookings by start time
    const sorted = slotBookings
      .map(b => ({
        start: Math.max(parseISO(b.startTime).getTime(), slotStart.getTime()),
        end: Math.min(parseISO(b.endTime).getTime(), slotEnd.getTime())
      }))
      .sort((a, b) => a.start - b.start);

    // Check for gaps
    let coveredUntil = slotStart.getTime();
    for (const booking of sorted) {
      if (booking.start > coveredUntil) {
        // There's a gap - not fully booked
        return false;
      }
      coveredUntil = Math.max(coveredUntil, booking.end);
    }

    // Check if we've covered the entire slot
    return coveredUntil >= slotEnd.getTime();
  };

  const handleSlotClick = (room: MeetingRoom, date: Date, hour: number) => {
    // Always open booking modal for creating new booking
    setSelectedSlot({ room, date, hour });
  };

  const handleBookingClick = async (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation(); // Prevent slot click from firing
    setSelectedBooking(booking); // show basic info immediately
    try {
      // Fetch full details (attendees, externalGuests) — succeeds for owner or admin
      const full = await api.getBooking(booking.id);
      setSelectedBooking(full);
    } catch {
      // Non-owner/non-admin: 403 expected — basic info is sufficient
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
    if (!selectedBooking) return;

    const isOwn = isOwnBooking(selectedBooking);
    const message = isOwn
      ? t('calendar.deleteConfirm')
      : t('calendar.deleteConfirmOrganizer');

    if (await showConfirm({ message, title: t('calendar.deleteBooking'), confirmLabel: t('common.delete') })) {
      try {
        await api.deleteBooking(selectedBooking.id, isOwn ? undefined : adminActionReason || undefined);
        setSelectedBooking(null);
        setAdminActionReason('');
        await loadData();
      } catch (error: any) {
        console.error('Failed to delete booking:', error);
        alert(error.message || 'Failed to delete booking');
      }
    }
  };

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
    }
  };

  const handleMoveBooking = async () => {
    if (!selectedBooking || !moveTargetRoom) return;

    const targetRoom = rooms.find(r => r.id === moveTargetRoom);
    if (!await showConfirm({ message: t('calendar.moveConfirm', { title: selectedBooking.title, room: targetRoom?.name }), title: t('calendar.moveBooking'), confirmLabel: t('calendar.moveBookingConfirmLabel'), variant: 'primary' })) {
      return;
    }

    try {
      await api.moveBooking(selectedBooking.id, moveTargetRoom, adminActionReason || undefined);
      setShowMoveDialog(false);
      setSelectedBooking(null);
      setMoveTargetRoom('');
      setAdminActionReason('');
      await loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to move booking');
    }
  };

  const openMoveDialog = () => {
    setShowMoveDialog(true);
    setMoveTargetRoom('');
    setAdminActionReason('');
  };

  const isOwnBooking = (booking: Booking): boolean => {
    return booking.userId === user?.id;
  };

  const isFutureOrOngoing = (booking: Booking): boolean => {
    return new Date(booking.endTime) > new Date();
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="skeleton-calendar">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-calendar-cell" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <div className="calendar-header-top">
          <h1>{t('calendar.title')}</h1>
          <Link to="/rooms" className="btn btn-primary quick-book-btn">
            {t('calendar.quickBook')}
          </Link>
        </div>
        <div className="calendar-nav">
          <button onClick={() => setStartDate(subDays(startDate, 7))} className="btn btn-secondary">
            {isMobile
              ? (calendarViewMode === 'weekly' ? `\u25C0 ${t('calendar.week')}` : `\u25C0 ${t('calendar.sevenDay')}`)
              : (calendarViewMode === 'weekly' ? `\u25C0 ${t('calendar.week')}` : t('calendar.previous7Days'))}
          </button>
          <button onClick={() => setStartDate(new Date())} className="btn btn-secondary">
            {t('common.today')}
          </button>
          <button onClick={() => setStartDate(addDays(startDate, 7))} className="btn btn-secondary">
            {isMobile
              ? (calendarViewMode === 'weekly' ? `${t('calendar.week')} \u25B6` : `${t('calendar.sevenDay')} \u25B6`)
              : (calendarViewMode === 'weekly' ? `${t('calendar.week')} \u25B6` : t('calendar.next7Days'))}
          </button>
          <button
            onClick={() => {
              if (calendarViewMode === 'rolling') {
                setCalendarViewMode('weekly');
                setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }));
              } else {
                setCalendarViewMode('rolling');
                setStartDate(new Date());
              }
            }}
            className="btn btn-secondary"
            title={calendarViewMode === 'rolling' ? t('calendar.switchToWeekly') : t('calendar.switchToRolling')}
          >
            {calendarViewMode === 'rolling' ? (isMobile ? t('calendar.week') : t('calendar.weekView')) : (isMobile ? t('calendar.sevenDay') : t('calendar.sevenDayView'))}
          </button>
        </div>
        <h2>{format(days[0], 'MMM d')} – {format(days[6], 'MMM d, yyyy')}</h2>
        {isMobile && rooms.length > 0 && (
          <div className="mobile-room-selector">
            <label htmlFor="mobile-room-select">{t('calendar.room')}:</label>
            <select
              id="mobile-room-select"
              value={selectedMobileRoomId}
              onChange={(e) => setSelectedMobileRoomId(e.target.value)}
            >
              {rooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name} ({t('calendar.capacityPeople', { count: room.capacity })})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="calendar-legend">
          <div className="legend-item">
            <span className="legend-color available"></span>
            <span>{t('calendar.available')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color partial"></span>
            <span>{t('calendar.partiallyBooked')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color booked"></span>
            <span>{t('calendar.fullyBooked')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color unavailable"></span>
            <span>{t('calendar.outsideHours')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color restricted"></span>
            <span>{t('calendar.restricted')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color past"></span>
            <span>{t('calendar.past')}</span>
          </div>
        </div>
      </div>

      <div className="calendar-container" ref={containerRef}>
        <div className="calendar-grid" style={{ gridTemplateColumns: `60px repeat(${displayRooms.length}, 1fr)`, minWidth: isMobile ? 0 : undefined }}>
          {/* Header row with room names */}
          <div className="calendar-corner">
            <div className="room-header">{t('calendar.timeRoom')}</div>
          </div>
          {displayRooms.map(room => (
            <div key={room.id} className="room-column-header">
              <div className="room-name">{room.name}</div>
              <div className="room-capacity">{t('calendar.capacityPeople', { count: room.capacity })}</div>
            </div>
          ))}

          {/* Calendar body */}
          {days.map(day => (
            <React.Fragment key={day.toISOString()}>
              {/* Day header spanning all room columns */}
              <div className={`day-header${isSameDay(day, new Date()) ? ' today' : ''}`} style={{ gridColumn: `1 / span ${displayRooms.length + 1}` }}>
                {format(day, 'EEEE, MMM d')}
                {isSameDay(day, new Date()) && <span className="today-badge">{t('common.today')}</span>}
              </div>

              {/* Time slots for each hour */}
              {hours.map(hour => (
                <React.Fragment key={`${day.toISOString()}-${hour}`}>
                  <div className="time-slot-label">
                    {formatHour(hour, timeFormat)}
                  </div>
                  {displayRooms.map(room => {
                    const booking = getBookingForSlot(room.id, day, hour);
                    const hasBooking = booking !== null;
                    const fullyBooked = hasBooking && isSlotFullyBooked(room.id, day, hour);
                    const partiallyBooked = hasBooking && !fullyBooked;
                    const isPast = new Date(day).setHours(hour + 1) < Date.now();
                    const isAvailable = isSlotAvailable(room, hour);
                    const canBook = canUserBookRoom(room);
                    const isRestricted = !isAvailable || !canBook;

                    // All bookings that START in this slot (each gets its own indicator)
                    const bookingsStartingHere = getBookingsStartingInSlot(room.id, day, hour);

                    let slotClass = 'time-slot';
                    let title = '';

                    if (isPast) {
                      slotClass += ' past';
                      title = t('calendar.pastSlot');
                    } else if (fullyBooked) {
                      slotClass += ' booked';
                      title = t('calendar.clickForDetails', { title: booking.title });
                    } else if (partiallyBooked) {
                      slotClass += ' partial';
                      title = t('calendar.partiallyBookedSlot');
                    } else if (!isAvailable) {
                      slotClass += ' unavailable';
                      title = t('calendar.outsideHoursSlot');
                    } else if (!canBook) {
                      slotClass += ' restricted';
                      title = t('calendar.restrictedSlot');
                    } else {
                      slotClass += ' available';
                      title = t('calendar.bookSlot', { room: room.name, time: formatHour(hour, timeFormat) });
                    }

                    if (isSameDay(day, new Date())) slotClass += ' today-column';
                    const isInteractive = !isPast && isAvailable && canBook;
                    return (
                      <div
                        key={`${room.id}-${day.toISOString()}-${hour}`}
                        className={slotClass}
                        onClick={() => !isPast && handleSlotClick(room, day, hour)}
                        onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSlotClick(room, day, hour); } } : undefined}
                        role={isInteractive ? 'button' : undefined}
                        tabIndex={isInteractive ? 0 : undefined}
                        aria-label={title}
                        title={title}
                      >
                        {(() => {
                          const cols = assignColumns(bookingsStartingHere);
                          return bookingsStartingHere.map(b => {
                          const info = getBookingDisplayInfo(b, hour);
                          const { colIndex, totalCols } = cols.get(b.id) ?? { colIndex: 0, totalCols: 1 };
                          const colW = 100 / totalCols;
                          return (
                            <div
                              key={b.id}
                              className={`booking-indicator booking-span${totalCols > 1 || info.height <= 100 ? ' booking-indicator--compact' : ''}${info.height < 75 ? ' booking-indicator--silent' : ''}`}
                              style={{
                                top: `calc(${info.topOffset}% + 2px)`,
                                height: `calc(${info.height}% - 4px)`,
                                left: `calc(${colIndex * colW}% + 2px)`,
                                width: `calc(${colW}% - 4px)`,
                                cursor: 'pointer',
                                backgroundColor: getBookingColor(b.id),
                              }}
                              onClick={(e) => handleBookingClick(e, b)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBookingClick(e as any, b); } }}
                              role="button"
                              tabIndex={0}
                              aria-label={`${b.title} — ${formatTime(b.startTime, timeFormat)} to ${formatTime(b.endTime, timeFormat)}`}
                            >
                              <span className="booking-title">{b.title}</span>
                              <span className="booking-time">
                                {formatTime(b.startTime, timeFormat)} - {formatTime(b.endTime, timeFormat)}
                              </span>
                            </div>
                          );
                        });
                        })()}
                        {(!hasBooking || partiallyBooked) && !isPast && !isRestricted && (
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
      {selectedSlot && (() => {
        const now = new Date();
        const isCurrentHour = selectedSlot.date.toDateString() === now.toDateString() &&
                              selectedSlot.hour === now.getHours();
        const initialMinute = isCurrentHour ? Math.ceil(now.getMinutes() / 5) * 5 : 0;
        return (
          <BookingModal
            room={selectedSlot.room}
            initialDate={selectedSlot.date}
            initialHour={selectedSlot.hour}
            initialMinute={initialMinute}
            onClose={() => setSelectedSlot(null)}
            onBooked={handleBookingCreated}
          />
        );
      })()}

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
      {selectedBooking && !showMoveDialog && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedBooking.title}</h2>
              <button className="modal-close" onClick={() => setSelectedBooking(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('myBookings.room')}:</strong> {selectedBooking.room?.name}</p>
              <p><strong>{t('common.time')}:</strong> {formatDateTime(selectedBooking.startTime, timeFormat)} - {formatTime(selectedBooking.endTime, timeFormat)}</p>
              {selectedBooking.description && (
                <p><strong>{t('common.description')}:</strong> {selectedBooking.description}</p>
              )}
              {(isOwnBooking(selectedBooking) || isAdmin) && (selectedBooking.attendees?.length ?? 0) > 0 && (
                <p><strong>{t('myBookings.attendees')}:</strong> {selectedBooking.attendees!.join(', ')}</p>
              )}
              <p><strong>{t('calendar.bookedBy')}:</strong> {selectedBooking.user?.name}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedBooking(null)}>
                {t('common.close')}
              </button>
              {/* Own booking actions — only for future/ongoing bookings */}
              {isOwnBooking(selectedBooking) && isFutureOrOngoing(selectedBooking) && (
                <>
                  <button className="btn btn-primary" onClick={handleEditBooking}>
                    {t('common.edit')}
                  </button>
                  <button className="btn btn-warning" onClick={handleBookingCancelled}>
                    {t('calendar.cancelBooking')}
                  </button>
                  <button className="btn btn-danger" onClick={handleDeleteBooking}>
                    {t('common.delete')}
                  </button>
                </>
              )}
              {/* Admin actions for other people's bookings */}
              {isAdmin && !isOwnBooking(selectedBooking) && isFutureOrOngoing(selectedBooking) && (
                <>
                  <button className="btn btn-primary" onClick={openMoveDialog}>
                    {t('calendar.moveToRoom')}
                  </button>
                  <button className="btn btn-danger" onClick={handleDeleteBooking}>
                    {t('calendar.deleteAdmin')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move Booking Dialog */}
      {showMoveDialog && selectedBooking && (
        <div className="modal-overlay" onClick={() => setShowMoveDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('calendar.moveBookingTitle')}</h2>
              <button className="modal-close" onClick={() => setShowMoveDialog(false)} aria-label={t('common.close')}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('calendar.meeting')}:</strong> {selectedBooking.title}</p>
              <p><strong>{t('calendar.currentRoom')}:</strong> {selectedBooking.room?.name}</p>
              <p><strong>{t('common.time')}:</strong> {formatDateTime(selectedBooking.startTime, timeFormat)} - {formatTime(selectedBooking.endTime, timeFormat)}</p>

              <div className="form-group mt-4">
                <label htmlFor="targetRoom"><strong>{t('calendar.moveToRoom')}:</strong></label>
                <select
                  id="targetRoom"
                  value={moveTargetRoom}
                  onChange={(e) => setMoveTargetRoom(e.target.value)}
                >
                  <option value="">{t('calendar.selectRoom')}</option>
                  {rooms
                    .filter(r => r.id !== selectedBooking.roomId && r.isActive)
                    .map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name} ({t('common.floor')}: {room.floor}, {t('common.capacity')}: {room.capacity})
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="form-group mt-4">
                <label htmlFor="reason"><strong>{t('calendar.reason')}:</strong></label>
                <input
                  type="text"
                  id="reason"
                  value={adminActionReason}
                  onChange={(e) => setAdminActionReason(e.target.value)}
                  placeholder={t('calendar.reasonPlaceholder')}
                />
              </div>

              <p className="mt-4" style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                {t('calendar.moveNotice')}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMoveDialog(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleMoveBooking}
                disabled={!moveTargetRoom}
              >
                {t('calendar.moveBooking')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
