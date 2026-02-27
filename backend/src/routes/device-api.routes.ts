import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DeviceModel } from '../models/device.model';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { FirmwareModel } from '../models/firmware.model';
import { SettingsModel } from '../models/settings.model';
import { DeviceWithRoom, DeviceRoomStatus, BookingWithDetails, BookingStatus } from '../types';
import { getDb } from '../models/database';
import fs from 'fs';

const router = Router();

// Extend Request to include device
interface DeviceRequest extends Request {
  device?: DeviceWithRoom;
}

// Helper to get global settings
async function getGlobalSettings(): Promise<{ openingHour: number; closingHour: number }> {
  return SettingsModel.getGlobal();
}

// Middleware to authenticate device by token
async function authenticateDevice(req: DeviceRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['x-device-token'] as string;

  if (!token) {
    res.status(401).json({ error: 'Device token required' });
    return;
  }

  const device = await DeviceModel.findByTokenWithRoom(token);
  if (!device) {
    res.status(401).json({ error: 'Invalid or inactive device token' });
    return;
  }

  // Update last seen timestamp
  await DeviceModel.updateLastSeen(device.id);

  req.device = device;
  next();
}

// Helper function to parse booking time (handles both ISO with and without timezone)
function parseBookingTime(timeStr: string): Date {
  // If time string doesn't end with Z or timezone offset, treat as UTC
  if (timeStr && !timeStr.endsWith('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(timeStr + ':00.000Z');
  }
  return new Date(timeStr);
}

// Get room status and upcoming bookings
router.get('/status', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const room = device.room;

    console.log('Status check from device:', device.name, '| Pending firmware:', device.pendingFirmwareVersion || 'none');

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
    const bookings = await BookingModel.findByRoom(
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
      const start = parseBookingTime(b.startTime);
      const end = parseBookingTime(b.endTime);
      const isCurrentlyActive = now >= start && now < end;
      console.log('  Checking booking:', b.title, '| start:', start.toISOString(), '| end:', end.toISOString(), '| now >= start:', now >= start, '| now < end:', now < end, '| active:', isCurrentlyActive);
      return isCurrentlyActive;
    });

    // Find upcoming bookings (start time is in the future)
    const upcomingBookings = bookings
      .filter(b => parseBookingTime(b.startTime) > now)
      .slice(0, 3); // Next 3 bookings

    // Get user details for bookings (without password)
    const bookingsWithDetails: BookingWithDetails[] = upcomingBookings.map(b => ({
      ...b,
      attendees: JSON.parse(b.attendees),
      room: { ...room, amenities: JSON.parse(room.amenities) }
    }));

    const currentBookingWithDetails = currentBooking ? {
      ...currentBooking,
      attendees: JSON.parse(currentBooking.attendees),
      room: { ...room, amenities: JSON.parse(room.amenities) },
      isDeviceBooking: currentBooking.userId === 'device-booking-user',
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
router.post('/quick-book', authenticateDevice, async (req: DeviceRequest, res: Response) => {
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

    // Validate duration against room's configured durations
    const validDurations = room.quickBookDurations || [30, 60, 90, 120];
    const duration = parseInt(durationMinutes) || validDurations[0];
    if (!validDurations.includes(duration)) {
      res.status(400).json({ error: `Duration must be one of: ${validDurations.map(d => d < 60 ? `${d} min` : `${d / 60} hour${d > 60 ? 's' : ''}`).join(', ')}` });
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
    const globalSettings = await getGlobalSettings();
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
    const hasConflict = await BookingModel.checkConflict(
      room.id,
      startTime.toISOString(),
      endTime.toISOString()
    );

    if (hasConflict) {
      res.status(409).json({ error: 'Room is already booked for this time slot' });
      return;
    }

    // Use the system user for device quick bookings
    const deviceBookingUserId = 'device-booking-user';

    // Insert booking directly since we're using the system user
    const bookingId = uuidv4();
    const nowIso = new Date().toISOString();

    const db = getDb();
    await db('bookings').insert({
      id: bookingId,
      room_id: room.id,
      user_id: deviceBookingUserId,
      title,
      description: `Quick booking from ${device.name}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      attendees: JSON.stringify([]),
      status: BookingStatus.CONFIRMED,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const booking = await BookingModel.findById(bookingId);

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

// End the current quick booking early (device only — only works for quick bookings)
router.post('/end-meeting', authenticateDevice, async (req: DeviceRequest, res: Response) => {
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

    const bookings = await BookingModel.findByRoom(
      room.id,
      todayStart.toISOString(),
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    );

    const currentBooking = bookings.find(b => {
      const start = parseBookingTime(b.startTime);
      const end = parseBookingTime(b.endTime);
      return now >= start && now < end;
    });

    if (!currentBooking) {
      res.status(404).json({ error: 'No active booking found for this room' });
      return;
    }

    if (currentBooking.userId !== 'device-booking-user') {
      res.status(400).json({ error: 'Only quick bookings made from a device can be ended from the device' });
      return;
    }

    await BookingModel.endEarly(currentBooking.id, now.toISOString());

    res.json({ success: true, message: 'Meeting ended early' });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
});

// Get device info (for display on screen)
router.get('/info', authenticateDevice, async (req: DeviceRequest, res: Response) => {
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
router.get('/ping', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Report current firmware version
router.post('/firmware/report', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const { version } = req.body;

    if (!version) {
      res.status(400).json({ error: 'Version is required' });
      return;
    }

    await DeviceModel.updateFirmwareVersion(device.id, version);

    // Clear pending firmware if the reported version matches the pending version
    if (device.pendingFirmwareVersion && device.pendingFirmwareVersion === version) {
      await DeviceModel.clearPendingFirmware(device.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Report firmware version error:', error);
    res.status(500).json({ error: 'Failed to report firmware version' });
  }
});

// Check for firmware updates (only returns pending firmware, not automatic latest)
router.get('/firmware/check', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const currentVersion = device.firmwareVersion;
    const pendingVersion = device.pendingFirmwareVersion;

    console.log('Firmware check for device:', device.name, '| ID:', device.id);
    console.log('  Current version:', currentVersion);
    console.log('  Pending version:', pendingVersion);

    // Only offer update if there's a pending firmware version scheduled by admin
    if (!pendingVersion) {
      console.log('  No pending update, returning updateAvailable: false');
      res.json({
        updateAvailable: false,
        currentVersion: currentVersion,
        latestVersion: null,
        latestFirmware: null
      });
      return;
    }

    // Check if pending version is different from current
    if (pendingVersion === currentVersion) {
      console.log('  Pending version matches current, clearing pending flag');
      // Already at this version, clear the pending flag
      await DeviceModel.clearPendingFirmware(device.id);
      res.json({
        updateAvailable: false,
        currentVersion: currentVersion,
        latestVersion: null,
        latestFirmware: null
      });
      return;
    }

    // Get the pending firmware details
    const firmware = await FirmwareModel.findByVersion(pendingVersion);
    console.log('  Found firmware:', firmware ? `v${firmware.version} (active: ${firmware.isActive}, type: ${firmware.deviceType})` : 'NOT FOUND');

    if (!firmware || !firmware.isActive) {
      console.log('  Firmware not found or inactive, clearing pending flag');
      // Pending firmware not found or inactive, clear the pending flag
      await DeviceModel.clearPendingFirmware(device.id);
      res.json({
        updateAvailable: false,
        currentVersion: currentVersion,
        latestVersion: null,
        latestFirmware: null
      });
      return;
    }

    // Verify device type matches firmware type
    if (firmware.deviceType !== device.deviceType) {
      console.log('  Device type mismatch! Device:', device.deviceType, 'Firmware:', firmware.deviceType);
      await DeviceModel.clearPendingFirmware(device.id);
      res.json({
        updateAvailable: false,
        currentVersion: currentVersion,
        latestVersion: null,
        latestFirmware: null
      });
      return;
    }

    console.log('  Returning updateAvailable: true for version', firmware.version);
    res.json({
      updateAvailable: true,
      currentVersion: currentVersion,
      latestVersion: firmware.version,
      latestFirmware: {
        id: firmware.id,
        version: firmware.version,
        deviceType: firmware.deviceType,
        size: firmware.size,
        checksum: firmware.checksum,
        releaseNotes: firmware.releaseNotes
      }
    });
  } catch (error) {
    console.error('Check firmware update error:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

// Download firmware update
router.get('/firmware/download/:version', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  try {
    const device = req.device!;
    const { version } = req.params;

    console.log('Firmware download request from device:', device.name, '| Requesting version:', version, '| Device type:', device.deviceType);

    const firmware = await FirmwareModel.findByVersion(version);
    if (!firmware) {
      console.log('  Firmware version not found:', version);
      res.status(404).json({ error: 'Firmware version not found' });
      return;
    }

    if (!firmware.isActive) {
      res.status(400).json({ error: 'Firmware version is not active' });
      return;
    }

    // Verify device type matches firmware type
    if (firmware.deviceType !== device.deviceType) {
      console.log('  Device type mismatch! Device:', device.deviceType, 'Firmware:', firmware.deviceType);
      res.status(400).json({ error: 'Firmware is not compatible with this device type' });
      return;
    }

    const filePath = FirmwareModel.getFilePath(firmware);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Firmware file not found' });
      return;
    }

    // Set headers for binary download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', firmware.size);
    res.setHeader('X-Firmware-Version', firmware.version);
    res.setHeader('X-Firmware-Checksum', firmware.checksum);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download firmware error:', error);
    res.status(500).json({ error: 'Failed to download firmware' });
  }
});

export default router;
