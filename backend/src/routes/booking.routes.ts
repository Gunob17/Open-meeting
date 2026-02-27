import { Router, Response } from 'express';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { UserModel } from '../models/user.model';
import { CompanyModel } from '../models/company.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { sendMeetingInvite, sendCancellationNotice, sendAdminDeleteNotice, sendAdminMoveNotice, sendReceptionNotification } from '../services/email.service';
import { UserRole, MeetingRoom, ExternalGuest } from '../types';
import { SettingsModel } from '../models/settings.model';
import { ParkModel } from '../models/park.model';

// Helper to get global settings
async function getGlobalSettings(): Promise<{ openingHour: number; closingHour: number }> {
  return SettingsModel.getGlobal();
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
async function validateBookingHours(
  room: MeetingRoom,
  startTimeStr: string,
  endTimeStr: string
): Promise<{ valid: boolean; error?: string }> {
  const globalSettings = await getGlobalSettings();

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

// Get all bookings (with optional date range filter, scoped to user's park)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let bookings;
    if (startDate && endDate) {
      bookings = await BookingModel.findAllByDateRange(startDate as string, endDate as string);
    } else {
      bookings = await BookingModel.findAll();
    }

    // Scope bookings to the user's park (super admins see everything)
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      let effectiveParkId = req.user?.parkId;
      // Fallback: if parkId not set on user (legacy accounts), derive from their company
      if (!effectiveParkId && req.user?.companyId) {
        const company = await CompanyModel.findById(req.user.companyId);
        effectiveParkId = company?.parkId;
      }
      if (effectiveParkId) {
        bookings = bookings.filter(b => b.room?.parkId === effectiveParkId);
      }
    }

    // Parse attendees and external guests JSON
    const bookingsWithParsedData = bookings.map(b => ({
      ...b,
      attendees: JSON.parse(b.attendees),
      externalGuests: JSON.parse(b.externalGuests),
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
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await BookingModel.findByUser(req.user!.userId);

    const bookingsWithDetails = await Promise.all(bookings.map(async (b) => {
      const room = await RoomModel.findById(b.roomId);
      return {
        ...b,
        attendees: JSON.parse(b.attendees),
        externalGuests: JSON.parse(b.externalGuests),
        room: room ? {
          ...room,
          amenities: JSON.parse(room.amenities)
        } : undefined
      };
    }));

    res.json(bookingsWithDetails);
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ error: 'Failed to get bookings' });
  }
});

// Get single booking
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const booking = await BookingModel.findByIdWithDetails(id);

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    res.json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      externalGuests: JSON.parse(booking.externalGuests),
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
    const { roomId, title, description, startTime, endTime, attendees, externalGuests } = req.body;

    // Validation
    if (!roomId || !title || !startTime || !endTime) {
      res.status(400).json({ error: 'Room ID, title, start time, and end time are required' });
      return;
    }

    if (title.length > 255) {
      res.status(400).json({ error: 'Title must be 255 characters or less' });
      return;
    }

    if (description && description.length > 2000) {
      res.status(400).json({ error: 'Description must be 2000 characters or less' });
      return;
    }

    if (externalGuests && Array.isArray(externalGuests) && externalGuests.length > 100) {
      res.status(400).json({ error: 'Maximum 100 external guests allowed' });
      return;
    }

    if (attendees && Array.isArray(attendees) && attendees.length > 100) {
      res.status(400).json({ error: 'Maximum 100 attendees allowed' });
      return;
    }

    // Check room exists
    const room = await RoomModel.findById(roomId);
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
    const hoursValidation = await validateBookingHours(room, startTime, endTime);
    if (!hoursValidation.valid) {
      res.status(400).json({ error: hoursValidation.error });
      return;
    }

    // Check for conflicts
    const hasConflict = await BookingModel.checkConflict(roomId, startTime, endTime);
    if (hasConflict) {
      res.status(409).json({ error: 'Room is already booked for this time slot' });
      return;
    }

    // Validate external guests if provided
    if (externalGuests && Array.isArray(externalGuests)) {
      for (const guest of externalGuests) {
        if (!guest.name || guest.name.length > 255) {
          res.status(400).json({ error: 'Each external guest must have a name (max 255 chars)' });
          return;
        }
        if (guest.email && guest.email.length > 254) {
          res.status(400).json({ error: 'Guest email must be 254 characters or less' });
          return;
        }
        if (guest.company && guest.company.length > 255) {
          res.status(400).json({ error: 'Guest company must be 255 characters or less' });
          return;
        }
      }
    }

    // Create booking
    const booking = await BookingModel.create({
      roomId,
      title,
      description,
      startTime,
      endTime,
      attendees: attendees || [],
      externalGuests: externalGuests || []
    }, req.user!.userId);

    // Get user for email
    const user = await UserModel.findById(req.user!.userId);

    // Send meeting invite email
    if (user) {
      sendMeetingInvite({
        booking,
        room,
        organizer: { ...user, password: undefined } as any,
        attendeeEmails: attendees || []
      });
    }

    // Send reception notification if external guests are present
    if (externalGuests && externalGuests.length > 0 && user) {
      const park = await ParkModel.findById(room.parkId);
      if (park?.receptionEmail) {
        sendReceptionNotification({
          booking,
          room,
          organizer: { ...user, password: undefined } as any,
          externalGuests,
          receptionEmail: park.receptionEmail,
          parkName: park.name,
          guestFields: park.receptionGuestFields
        });
      }
    }

    res.status(201).json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      externalGuests: JSON.parse(booking.externalGuests),
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
    const { title, description, startTime, endTime, attendees, externalGuests } = req.body;

    const existingBooking = await BookingModel.findById(id);
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

      const hasConflict = await BookingModel.checkConflict(existingBooking.roomId, newStart, newEnd, id);
      if (hasConflict) {
        res.status(409).json({ error: 'Room is already booked for this time slot' });
        return;
      }
    }

    const booking = await BookingModel.update(id, {
      title,
      description,
      startTime,
      endTime,
      attendees,
      externalGuests
    });

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const room = await RoomModel.findById(booking.roomId);
    const user = await UserModel.findById(booking.userId);

    // Send updated meeting invite
    if (room && user) {
      sendMeetingInvite({
        booking,
        room,
        organizer: { ...user, password: undefined } as any,
        attendeeEmails: attendees || JSON.parse(booking.attendees)
      });
    }

    // Send reception notification if external guests are present
    const parsedExternalGuests = JSON.parse(booking.externalGuests) as ExternalGuest[];
    if (parsedExternalGuests.length > 0 && room && user) {
      const park = await ParkModel.findById(room.parkId);
      if (park?.receptionEmail) {
        sendReceptionNotification({
          booking,
          room,
          organizer: { ...user, password: undefined } as any,
          externalGuests: parsedExternalGuests,
          receptionEmail: park.receptionEmail,
          parkName: park.name,
          guestFields: park.receptionGuestFields
        });
      }
    }

    res.json({
      ...booking,
      attendees: JSON.parse(booking.attendees),
      externalGuests: parsedExternalGuests,
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

    const booking = await BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check ownership or admin
    if (booking.userId !== req.user!.userId && (req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.PARK_ADMIN)) {
      res.status(403).json({ error: 'Cannot cancel bookings made by others' });
      return;
    }

    const success = await BookingModel.cancel(id);
    if (!success) {
      res.status(500).json({ error: 'Failed to cancel booking' });
      return;
    }

    // Send cancellation notice
    const room = await RoomModel.findById(booking.roomId);
    const user = await UserModel.findById(booking.userId);

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

    const booking = await BookingModel.findById(id);
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
    const room = await RoomModel.findById(booking.roomId);
    const bookingOwner = await UserModel.findById(booking.userId);
    const admin = await UserModel.findById(req.user!.userId);

    await BookingModel.delete(id);

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

    const booking = await BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const oldRoom = await RoomModel.findById(booking.roomId);
    const newRoom = await RoomModel.findById(newRoomId);

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
    const hasConflict = await BookingModel.checkConflict(newRoomId, booking.startTime, booking.endTime);
    if (hasConflict) {
      res.status(409).json({ error: 'New room is already booked for this time slot' });
      return;
    }

    // Update the booking with the new room
    const updatedBooking = await BookingModel.update(id, { roomId: newRoomId });
    if (!updatedBooking) {
      res.status(500).json({ error: 'Failed to move booking' });
      return;
    }

    // Send notification to booking owner
    const bookingOwner = await UserModel.findById(booking.userId);
    const admin = await UserModel.findById(req.user!.userId);

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
      externalGuests: JSON.parse(updatedBooking.externalGuests),
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
