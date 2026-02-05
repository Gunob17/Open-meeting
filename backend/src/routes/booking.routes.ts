import { Router, Response } from 'express';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { UserModel } from '../models/user.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { sendMeetingInvite, sendCancellationNotice, sendAdminDeleteNotice, sendAdminMoveNotice } from '../services/email.service';
import { UserRole, MeetingRoom } from '../types';
import db from '../models/database';

// Helper to get global settings
function getGlobalSettings(): { openingHour: number; closingHour: number } {
  const stmt = db.prepare('SELECT opening_hour, closing_hour FROM settings WHERE id = ?');
  const row = stmt.get('global') as { opening_hour: number; closing_hour: number } | undefined;
  return {
    openingHour: row?.opening_hour ?? 8,
    closingHour: row?.closing_hour ?? 18
  };
}

// Helper to extract hour and minute from a time string
// Handles both ISO format (2024-01-27T08:00:00.000Z) and local format (2024-01-27T08:00)
function extractLocalTime(timeStr: string): { hour: number; minute: number } {
  // Try to extract from the T portion of the string (works for both formats)
  const match = timeStr.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
  }
  // Fallback to Date parsing (may have timezone issues)
  const date = new Date(timeStr);
  return { hour: date.getHours(), minute: date.getMinutes() };
}

// Helper to validate booking time against room/global hours
function validateBookingHours(
  room: MeetingRoom,
  startTimeStr: string,
  endTimeStr: string
): { valid: boolean; error?: string } {
  const globalSettings = getGlobalSettings();

  // Use room-specific hours if set (not null/undefined), otherwise use global
  const openingHour = (room.openingHour !== null && room.openingHour !== undefined)
    ? room.openingHour
    : globalSettings.openingHour;
  const closingHour = (room.closingHour !== null && room.closingHour !== undefined)
    ? room.closingHour
    : globalSettings.closingHour;

  // Extract local time directly from string to avoid timezone conversion issues
  const startTime = extractLocalTime(startTimeStr);
  const endTime = extractLocalTime(endTimeStr);

  // Check if start time is before opening hour
  if (startTime.hour < openingHour) {
    return { valid: false, error: `Bookings cannot start before ${openingHour}:00` };
  }

  // Check if end time is after closing hour
  // Allow booking to end exactly at closing hour (e.g., 18:00 is valid if closingHour is 18)
  if (endTime.hour > closingHour || (endTime.hour === closingHour && endTime.minute > 0)) {
    return { valid: false, error: `Bookings must end by ${closingHour}:00` };
  }

  return { valid: true };
}

const router = Router();

// Get all bookings (with optional date range filter)
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let bookings;
    if (startDate && endDate) {
      bookings = BookingModel.findAllByDateRange(startDate as string, endDate as string);
    } else {
      bookings = BookingModel.findAll();
    }

    // Parse attendees JSON
    const bookingsWithParsedData = bookings.map(b => ({
      ...b,
      attendees: JSON.parse(b.attendees),
      room: b.room ? {
        ...b.room,
        amenities: JSON.parse(b.room.amenities)
      } : undefined
    }));

    res.json(bookingsWithParsedData);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to get bookings' });
  }
});

// Get my bookings
router.get('/my', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const bookings = BookingModel.findByUser(req.user!.userId);

    const bookingsWithDetails = bookings.map(b => {
      const room = RoomModel.findById(b.roomId);
      return {
        ...b,
        attendees: JSON.parse(b.attendees),
        room: room ? {
          ...room,
          amenities: JSON.parse(room.amenities)
        } : undefined
      };
    });

    res.json(bookingsWithDetails);
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ error: 'Failed to get bookings' });
  }
});

// Get single booking
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const booking = BookingModel.findByIdWithDetails(id);

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    res.json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      room: booking.room ? {
        ...booking.room,
        amenities: JSON.parse(booking.room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Failed to get booking' });
  }
});

// Create booking
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, title, description, startTime, endTime, attendees } = req.body;

    // Validation
    if (!roomId || !title || !startTime || !endTime) {
      res.status(400).json({ error: 'Room ID, title, start time, and end time are required' });
      return;
    }

    // Check room exists
    const room = RoomModel.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!room.isActive) {
      res.status(400).json({ error: 'Room is not available for booking' });
      return;
    }

    // Validate times
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    if (start >= end) {
      res.status(400).json({ error: 'End time must be after start time' });
      return;
    }

    if (start < new Date()) {
      res.status(400).json({ error: 'Cannot book in the past' });
      return;
    }

    // Check if room is locked to specific companies
    if (room.lockedToCompanyIds && room.lockedToCompanyIds.length > 0) {
      if (!room.lockedToCompanyIds.includes(req.user!.companyId)) {
        res.status(403).json({ error: 'This room is reserved for exclusive use by other companies' });
        return;
      }
    }

    // Validate booking hours against room/global settings
    // Pass original string to avoid timezone conversion issues
    const hoursValidation = validateBookingHours(room, startTime, endTime);
    if (!hoursValidation.valid) {
      res.status(400).json({ error: hoursValidation.error });
      return;
    }

    // Check for conflicts
    const hasConflict = BookingModel.checkConflict(roomId, startTime, endTime);
    if (hasConflict) {
      res.status(409).json({ error: 'Room is already booked for this time slot' });
      return;
    }

    // Create booking
    const booking = BookingModel.create({
      roomId,
      title,
      description,
      startTime,
      endTime,
      attendees: attendees || []
    }, req.user!.userId);

    // Get user for email
    const user = UserModel.findById(req.user!.userId);

    // Send meeting invite email
    if (user) {
      sendMeetingInvite({
        booking,
        room,
        organizer: { ...user, password: undefined } as any,
        attendeeEmails: attendees || []
      });
    }

    res.status(201).json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      room: {
        ...room,
        amenities: JSON.parse(room.amenities)
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Update booking
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, startTime, endTime, attendees } = req.body;

    const existingBooking = BookingModel.findById(id);
    if (!existingBooking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check ownership or admin
    if (existingBooking.userId !== req.user!.userId && (req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.PARK_ADMIN)) {
      res.status(403).json({ error: 'Cannot modify bookings made by others' });
      return;
    }

    // If changing times, check for conflicts
    if (startTime || endTime) {
      const newStart = startTime || existingBooking.startTime;
      const newEnd = endTime || existingBooking.endTime;

      const start = new Date(newStart);
      const end = new Date(newEnd);

      if (start >= end) {
        res.status(400).json({ error: 'End time must be after start time' });
        return;
      }

      const hasConflict = BookingModel.checkConflict(existingBooking.roomId, newStart, newEnd, id);
      if (hasConflict) {
        res.status(409).json({ error: 'Room is already booked for this time slot' });
        return;
      }
    }

    const booking = BookingModel.update(id, {
      title,
      description,
      startTime,
      endTime,
      attendees
    });

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const room = RoomModel.findById(booking.roomId);
    const user = UserModel.findById(booking.userId);

    // Send updated meeting invite
    if (room && user) {
      sendMeetingInvite({
        booking,
        room,
        organizer: { ...user, password: undefined } as any,
        attendeeEmails: attendees || JSON.parse(booking.attendees)
      });
    }

    res.json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      room: room ? {
        ...room,
        amenities: JSON.parse(room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Cancel booking
router.post('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const booking = BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check ownership or admin
    if (booking.userId !== req.user!.userId && (req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.PARK_ADMIN)) {
      res.status(403).json({ error: 'Cannot cancel bookings made by others' });
      return;
    }

    const success = BookingModel.cancel(id);
    if (!success) {
      res.status(500).json({ error: 'Failed to cancel booking' });
      return;
    }

    // Send cancellation notice
    const room = RoomModel.findById(booking.roomId);
    const user = UserModel.findById(booking.userId);

    if (room && user) {
      sendCancellationNotice({
        booking,
        room,
        organizer: { ...user, password: undefined } as any,
        attendeeEmails: JSON.parse(booking.attendees)
      });
    }

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Delete booking (admin can delete any, users can delete own)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const isAdmin = (req.user!.role === UserRole.SUPER_ADMIN || req.user!.role === UserRole.PARK_ADMIN);
    const isOwner = booking.userId === req.user!.userId;

    // Only admin or booking owner can delete
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'Cannot delete bookings made by others' });
      return;
    }

    // Get details for email notification before deleting
    const room = RoomModel.findById(booking.roomId);
    const bookingOwner = UserModel.findById(booking.userId);
    const admin = UserModel.findById(req.user!.userId);

    BookingModel.delete(id);

    // If admin deleted someone else's booking, send notification
    if (isAdmin && !isOwner && room && bookingOwner && admin) {
      await sendAdminDeleteNotice({
        booking,
        room,
        bookingOwner: { ...bookingOwner, password: undefined } as any,
        admin: { ...admin, password: undefined } as any,
        attendeeEmails: JSON.parse(booking.attendees),
        reason
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Move booking to another room (admin only)
router.post('/:id/move', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newRoomId, reason } = req.body;

    // Only admins can move bookings
    if ((req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.PARK_ADMIN)) {
      res.status(403).json({ error: 'Only administrators can move bookings' });
      return;
    }

    if (!newRoomId) {
      res.status(400).json({ error: 'New room ID is required' });
      return;
    }

    const booking = BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const oldRoom = RoomModel.findById(booking.roomId);
    const newRoom = RoomModel.findById(newRoomId);

    if (!newRoom) {
      res.status(404).json({ error: 'New room not found' });
      return;
    }

    if (!newRoom.isActive) {
      res.status(400).json({ error: 'New room is not available for booking' });
      return;
    }

    if (booking.roomId === newRoomId) {
      res.status(400).json({ error: 'Booking is already in this room' });
      return;
    }

    // Check for conflicts in the new room
    const hasConflict = BookingModel.checkConflict(newRoomId, booking.startTime, booking.endTime);
    if (hasConflict) {
      res.status(409).json({ error: 'New room is already booked for this time slot' });
      return;
    }

    // Update the booking with the new room
    const updatedBooking = BookingModel.update(id, { roomId: newRoomId });
    if (!updatedBooking) {
      res.status(500).json({ error: 'Failed to move booking' });
      return;
    }

    // Send notification to booking owner
    const bookingOwner = UserModel.findById(booking.userId);
    const admin = UserModel.findById(req.user!.userId);

    if (oldRoom && newRoom && bookingOwner && admin) {
      await sendAdminMoveNotice({
        booking: updatedBooking,
        room: newRoom,
        oldRoom,
        newRoom,
        bookingOwner: { ...bookingOwner, password: undefined } as any,
        admin: { ...admin, password: undefined } as any,
        attendeeEmails: JSON.parse(booking.attendees),
        reason
      });
    }

    res.json({
      ...updatedBooking,
      attendees: JSON.parse(updatedBooking.attendees),
      room: {
        ...newRoom,
        amenities: JSON.parse(newRoom.amenities)
      }
    });
  } catch (error) {
    console.error('Move booking error:', error);
    res.status(500).json({ error: 'Failed to move booking' });
  }
});

export default router;
