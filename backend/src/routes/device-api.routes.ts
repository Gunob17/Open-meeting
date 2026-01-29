import { Router, Request, Response, NextFunction } from 'express';
import { DeviceModel } from '../models/device.model';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { DeviceWithRoom, DeviceRoomStatus, BookingWithDetails, BookingStatus } from '../types';
import db from '../models/database';

const router = Router();

// Extend Request to include device
interface DeviceRequest extends Request {
  device?: DeviceWithRoom;
}

// Helper to get global settings
function getGlobalSettings(): { openingHour: number; closingHour: number } {
  const stmt = db.prepare('SELECT opening_hour, closing_hour FROM settings WHERE id = ?');
  const row = stmt.get('global') as { opening_hour: number; closing_hour: number } | undefined;
  return {
    openingHour: row?.opening_hour ?? 8,
    closingHour: row?.closing_hour ?? 18
  };
}

// Middleware to authenticate device by token
function authenticateDevice(req: DeviceRequest, res: Response, next: NextFunction): void {
  const token = req.headers['x-device-token'] as string;

  if (!token) {
    res.status(401).json({ error: 'Device token required' });
    return;
  }

  const device = DeviceModel.findByTokenWithRoom(token);
  if (!device) {
    res.status(401).json({ error: 'Invalid or inactive device token' });
    return;
  }

  // Update last seen timestamp
  DeviceModel.updateLastSeen(device.id);

  req.device = device;
  next();
}

// Get room status and upcoming bookings
router.get('/status', authenticateDevice, (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const room = device.room;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    console.log('Device status check - Server time:', now.toISOString(), 'Local:', now.toString());

    // Get all bookings for today and beyond for this room
    const bookings = BookingModel.findByRoom(
      room.id,
      todayStart.toISOString(),
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
    );

    console.log('Found', bookings.length, 'bookings for room', room.name);
    bookings.forEach(b => {
      console.log('  Booking:', b.title, 'Start:', b.startTime, 'End:', b.endTime);
    });

    // Find current booking (now falls within booking time)
    const currentBooking = bookings.find(b => {
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      const isCurrentlyActive = now >= start && now < end;
      console.log('  Checking booking:', b.title, '| now >= start:', now >= start, '| now < end:', now < end, '| active:', isCurrentlyActive);
      return isCurrentlyActive;
    });

    // Find upcoming bookings (start time is in the future)
    const upcomingBookings = bookings
      .filter(b => new Date(b.startTime) > now)
      .slice(0, 3); // Next 3 bookings

    // Get user details for bookings (without password)
    const bookingsWithDetails: BookingWithDetails[] = upcomingBookings.map(b => ({
      ...b,
      attendees: JSON.parse(b.attendees),
      room: { ...room, amenities: JSON.parse(room.amenities) }
    }));

    const currentBookingWithDetails: BookingWithDetails | null = currentBooking ? {
      ...currentBooking,
      attendees: JSON.parse(currentBooking.attendees),
      room: { ...room, amenities: JSON.parse(room.amenities) }
    } : null;

    const status: DeviceRoomStatus = {
      room: { ...room, amenities: JSON.parse(room.amenities) },
      currentBooking: currentBookingWithDetails,
      upcomingBookings: bookingsWithDetails,
      isAvailable: !currentBooking
    };

    console.log('Room status:', room.name, '| Available:', !currentBooking, '| Current booking:', currentBooking?.title || 'none');

    res.json(status);
  } catch (error) {
    console.error('Get room status error:', error);
    res.status(500).json({ error: 'Failed to get room status' });
  }
});

// Quick book the room (no login required)
router.post('/quick-book', authenticateDevice, (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const room = device.room;
    const { title, durationMinutes } = req.body;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!room.isActive) {
      res.status(400).json({ error: 'Room is not available for booking' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Meeting title is required' });
      return;
    }

    // Validate duration (15, 30, 45, or 60 minutes)
    const validDurations = [15, 30, 45, 60];
    const duration = parseInt(durationMinutes) || 30;
    if (!validDurations.includes(duration)) {
      res.status(400).json({ error: 'Duration must be 15, 30, 45, or 60 minutes' });
      return;
    }

    const now = new Date();
    const startTime = new Date(now);
    // Round up to nearest 5 minutes for cleaner booking times
    const minutes = startTime.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 5) * 5;
    startTime.setMinutes(roundedMinutes, 0, 0);

    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // Get room/global settings for hour validation
    const globalSettings = getGlobalSettings();
    const openingHour = room.openingHour ?? globalSettings.openingHour;
    const closingHour = room.closingHour ?? globalSettings.closingHour;

    // Check if booking is within allowed hours
    if (startTime.getHours() < openingHour) {
      res.status(400).json({ error: `Room is not available before ${openingHour}:00` });
      return;
    }

    if (endTime.getHours() > closingHour || (endTime.getHours() === closingHour && endTime.getMinutes() > 0)) {
      res.status(400).json({ error: `Room is not available after ${closingHour}:00` });
      return;
    }

    // Check for conflicts
    const hasConflict = BookingModel.checkConflict(
      room.id,
      startTime.toISOString(),
      endTime.toISOString()
    );

    if (hasConflict) {
      res.status(409).json({ error: 'Room is already booked for this time slot' });
      return;
    }

    // Create booking with device as the "user" - use a special system user ID
    // For quick bookings, we'll use a placeholder user ID that indicates it was booked from a device
    const deviceBookingUserId = `device:${device.id}`;

    // Insert booking directly since we're using a special user ID
    const bookingId = require('uuid').v4();
    const nowIso = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO bookings (id, room_id, user_id, title, description, start_time, end_time, attendees, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      bookingId,
      room.id,
      deviceBookingUserId,
      title,
      `Quick booking from ${device.name}`,
      startTime.toISOString(),
      endTime.toISOString(),
      JSON.stringify([]),
      BookingStatus.CONFIRMED,
      nowIso,
      nowIso
    );

    const booking = BookingModel.findById(bookingId);

    res.status(201).json({
      ...booking,
      attendees: [],
      room: { ...room, amenities: JSON.parse(room.amenities) }
    });
  } catch (error) {
    console.error('Quick book error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get device info (for display on screen)
router.get('/info', authenticateDevice, (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;

    res.json({
      deviceName: device.name,
      room: device.room ? {
        ...device.room,
        amenities: JSON.parse(device.room.amenities)
      } : null
    });
  } catch (error) {
    console.error('Get device info error:', error);
    res.status(500).json({ error: 'Failed to get device info' });
  }
});

// Health check endpoint (for device connectivity monitoring)
router.get('/ping', authenticateDevice, (req: DeviceRequest, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
