import { Router, Response } from 'express';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { UserModel } from '../models/user.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { sendMeetingInvite, sendCancellationNotice } from '../services/email.service';
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

// Helper to validate booking time against room/global hours
function validateBookingHours(
  room: MeetingRoom,
  startTime: Date,
  endTime: Date
): { valid: boolean; error?: string } {
  const globalSettings = getGlobalSettings();

  // Use room-specific hours if set (not null/undefined), otherwise use global
  const openingHour = (room.openingHour !== null && room.openingHour !== undefined)
    ? room.openingHour
    : globalSettings.openingHour;
  const closingHour = (room.closingHour !== null && room.closingHour !== undefined)
    ? room.closingHour
    : globalSettings.closingHour;

  const startHour = startTime.getHours();
  const startMinutes = startTime.getMinutes();
  const endHour = endTime.getHours();
  const endMinutes = endTime.getMinutes();

  // Check if start time is before opening hour
  // Allow exact opening hour (e.g., 8:00 is valid if openingHour is 8)
  if (startHour < openingHour || (startHour === openingHour && startMinutes < 0)) {
    return { valid: false, error: `Bookings cannot start before ${openingHour}:00` };
  }

  // Check if end time is after closing hour
  // Allow booking to end exactly at closing hour (e.g., 18:00 is valid if closingHour is 18)
  if (endHour > closingHour || (endHour === closingHour && endMinutes > 0)) {
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

    // Check if room is locked to a specific company
    if (room.lockedToCompanyId && room.lockedToCompanyId !== req.user!.companyId) {
      res.status(403).json({ error: 'This room is reserved for exclusive use by another company' });
      return;
    }

    // Validate booking hours against room/global settings
    const hoursValidation = validateBookingHours(room, start, end);
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
    if (existingBooking.userId !== req.user!.userId && req.user!.role !== UserRole.ADMIN) {
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
    if (booking.userId !== req.user!.userId && req.user!.role !== UserRole.ADMIN) {
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

// Delete booking (admin only)
router.delete('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const booking = BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Only admin or booking owner can delete
    if (booking.userId !== req.user!.userId && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Cannot delete bookings made by others' });
      return;
    }

    BookingModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

export default router;
