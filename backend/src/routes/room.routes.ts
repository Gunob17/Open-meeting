import { Router, Response } from 'express';
import { RoomModel } from '../models/room.model';
import { BookingModel } from '../models/booking.model';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { MeetingRoom, UserRole } from '../types';
import { imapManager } from '../services/imap.service';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// Get all rooms (filtered by park for non-super admins, and by company lock)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const queryParkId = req.query.parkId as string | undefined;

    // Super admins can optionally filter by park, others see only their park's rooms
    let parkId: string | undefined | null;
    const isAdmin = req.user?.role === UserRole.SUPER_ADMIN || req.user?.role === UserRole.PARK_ADMIN;

    if (req.user?.role === UserRole.SUPER_ADMIN) {
      // Super admin can filter by park via query param, or see all if not specified
      parkId = queryParkId || undefined;
    } else {
      // Non-super admins always see their own park's rooms
      parkId = req.user?.parkId;
      // Fallback: if parkId not set on user (legacy accounts), derive from their company
      if (!parkId && req.user?.companyId) {
        const company = await CompanyModel.findById(req.user.companyId);
        parkId = company?.parkId;
      }
    }
    let rooms = await RoomModel.findAll(includeInactive, parkId);

    // Filter out rooms locked to other companies (unless user is admin)
    if (!isAdmin && req.user?.companyId) {
      rooms = rooms.filter(room => {
        // If room has no company lock, it's visible to everyone
        if (!room.lockedToCompanyIds || room.lockedToCompanyIds.length === 0) {
          return true;
        }
        // If room is locked, only show if user's company is in the list
        return room.lockedToCompanyIds.includes(req.user!.companyId);
      });
    }

    // Parse amenities JSON and strip IMAP password for response
    const roomsWithParsedAmenities = rooms.map(room =>
      sanitizeRoomForClient({ ...room, amenities: JSON.parse(room.amenities) })
    );

    res.json(roomsWithParsedAmenities);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// Get IMAP worker connection status for all rooms (admin only)
// Must be declared before /:id to prevent Express treating 'imap-status' as a room ID
router.get('/imap-status', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  res.json(imapManager.getStatuses());
});

/** Returns true if the requesting user has access to the given room. */
function userCanAccessRoom(room: MeetingRoom, req: AuthRequest): boolean {
  if (!req.user) return false;
  if (req.user.role === UserRole.SUPER_ADMIN) return true;
  // Park-level access: user must belong to the same park as the room
  if (room.parkId !== req.user.parkId) return false;
  // Company-lock check for non-admin users
  if (req.user.role !== UserRole.PARK_ADMIN && room.lockedToCompanyIds && room.lockedToCompanyIds.length > 0) {
    if (!room.lockedToCompanyIds.includes(req.user.companyId)) return false;
  }
  return true;
}

// Get single room
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await RoomModel.findById(id);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!userCanAccessRoom(room, req)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(sanitizeRoomForClient({ ...room, amenities: JSON.parse(room.amenities) }));
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// Get room availability for a date range
router.get('/:id/availability', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const room = await RoomModel.findById(id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!userCanAccessRoom(room, req)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const bookings = await BookingModel.findByRoom(id, startDate as string, endDate as string);

    res.json({
      room: sanitizeRoomForClient({ ...room, amenities: JSON.parse(room.amenities) }),
      bookings: bookings.map(b => ({
        id: b.id,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime
      }))
    });
  } catch (error) {
    console.error('Get room availability error:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

/** Strip the IMAP password and expose hasImapPassword boolean instead. */
function sanitizeRoomForClient(room: MeetingRoom & { amenities: any }) {
  const { imapPass, ...rest } = room;
  return { ...rest, hasImapPassword: !!imapPass };
}

const BOOKING_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Returns the normalized email, null (to clear), or 'INVALID' */
function validateBookingEmail(email: unknown): string | null | 'INVALID' {
  if (email === null || email === undefined || email === '') return null;
  if (typeof email !== 'string') return 'INVALID';
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || !BOOKING_EMAIL_REGEX.test(trimmed) || trimmed.includes('\n') || trimmed.includes('\r')) {
    return 'INVALID';
  }
  return trimmed;
}

// Create room (park admin or above)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, capacity, amenities, floor, address, description, openingHour, closingHour, lockedToCompanyIds, quickBookDurations, parkId, bookingEmail, imapHost, imapPort, imapUser, imapPass, imapMailbox, smtpHost, smtpPort, smtpSecure } = req.body;

    if (!name || !capacity || !floor || !address) {
      res.status(400).json({ error: 'Name, capacity, floor, and address are required' });
      return;
    }

    if (name.length > 255 || floor.length > 100 || address.length > 500 || (description && description.length > 2000)) {
      res.status(400).json({ error: 'Field length exceeded: name (255), floor (100), address (500), description (2000)' });
      return;
    }

    const normalizedBookingEmail = validateBookingEmail(bookingEmail);
    if (normalizedBookingEmail === 'INVALID') {
      res.status(400).json({ error: 'Invalid booking email address' });
      return;
    }

    // Validate IMAP fields: if host or user is set, all three core fields are required
    if ((imapHost || imapUser) && !(imapHost && imapUser && imapPass)) {
      res.status(400).json({ error: 'IMAP host, username, and password are all required when configuring IMAP' });
      return;
    }

    if (typeof capacity !== 'number' || capacity < 1 || capacity > 10000) {
      res.status(400).json({ error: 'Capacity must be a positive number (max 10000)' });
      return;
    }

    // Determine which park to create the room in
    let targetParkId = parkId;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      // Super admin can specify parkId, defaults to 'default' if not provided
      targetParkId = parkId || 'default';
    } else {
      // Park admins can only create rooms in their own park
      targetParkId = req.user?.parkId;
      if (!targetParkId) {
        res.status(400).json({ error: 'User is not assigned to a park' });
        return;
      }
    }

    // Validate room-specific hours if provided
    if (openingHour !== undefined && openingHour !== null) {
      if (typeof openingHour !== 'number' || openingHour < 0 || openingHour > 23) {
        res.status(400).json({ error: 'Opening hour must be between 0 and 23' });
        return;
      }
    }
    if (closingHour !== undefined && closingHour !== null) {
      if (typeof closingHour !== 'number' || closingHour < 0 || closingHour > 23) {
        res.status(400).json({ error: 'Closing hour must be between 0 and 23' });
        return;
      }
    }
    if (openingHour !== null && closingHour !== null && openingHour >= closingHour) {
      res.status(400).json({ error: 'Opening hour must be before closing hour' });
      return;
    }

    const room = await RoomModel.create({
      name,
      capacity,
      amenities: amenities || [],
      floor,
      address,
      description,
      parkId: targetParkId,
      openingHour: openingHour ?? null,
      closingHour: closingHour ?? null,
      lockedToCompanyIds: lockedToCompanyIds ?? [],
      quickBookDurations: quickBookDurations ?? [30, 60, 90, 120],
      bookingEmail: normalizedBookingEmail,
      imapHost: imapHost ?? null,
      imapPort: imapPort ?? null,
      imapUser: imapUser ?? null,
      imapPass: imapPass ?? null,
      imapMailbox: imapMailbox ?? null,
      smtpHost: smtpHost ?? null,
      smtpPort: smtpPort ?? null,
      smtpSecure: smtpSecure ?? null,
    });

    // Start IMAP worker for the new room if credentials were provided
    if (room.imapHost && room.imapUser && room.imapPass) {
      imapManager.restartRoom(room.id).catch(err =>
        console.error('[imap] Failed to start worker for new room:', err)
      );
    }

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.ROOM_CREATE,
      resourceType: 'room',
      resourceId: room.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.status(201).json(sanitizeRoomForClient({ ...room, amenities: JSON.parse(room.amenities) }));
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Update room (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, capacity, amenities, floor, address, description, isActive, openingHour, closingHour, lockedToCompanyIds, quickBookDurations, bookingEmail, imapHost, imapPort, imapUser, imapPass, imapMailbox, smtpHost, smtpPort, smtpSecure, calendarFeedEnabled } = req.body;

    // Validate booking email if provided in this update
    let normalizedBookingEmail: string | null | undefined;
    if ('bookingEmail' in req.body) {
      const result = validateBookingEmail(bookingEmail);
      if (result === 'INVALID') {
        res.status(400).json({ error: 'Invalid booking email address' });
        return;
      }
      normalizedBookingEmail = result;
    }

    // Determine IMAP password update: only update if a non-empty value is explicitly sent
    let imapPassUpdate: string | null | undefined;
    if ('imapHost' in req.body && !imapHost) {
      // Host is being cleared — clear all IMAP credentials including password
      imapPassUpdate = null;
    } else if ('imapPass' in req.body && imapPass && String(imapPass).trim()) {
      imapPassUpdate = String(imapPass).trim();
    }
    // If imapPass not in body or empty (and host not cleared), keep existing password

    // Validate room-specific hours if provided
    if (openingHour !== undefined && openingHour !== null) {
      if (typeof openingHour !== 'number' || openingHour < 0 || openingHour > 23) {
        res.status(400).json({ error: 'Opening hour must be between 0 and 23' });
        return;
      }
    }
    if (closingHour !== undefined && closingHour !== null) {
      if (typeof closingHour !== 'number' || closingHour < 0 || closingHour > 23) {
        res.status(400).json({ error: 'Closing hour must be between 0 and 23' });
        return;
      }
    }
    if (openingHour !== null && closingHour !== null && openingHour !== undefined && closingHour !== undefined && openingHour >= closingHour) {
      res.status(400).json({ error: 'Opening hour must be before closing hour' });
      return;
    }

    const room = await RoomModel.update(id, {
      name,
      capacity,
      amenities,
      floor,
      address,
      description,
      isActive,
      openingHour,
      closingHour,
      lockedToCompanyIds,
      quickBookDurations,
      bookingEmail: normalizedBookingEmail,
      imapHost: 'imapHost' in req.body ? (imapHost ?? null) : undefined,
      imapPort: 'imapPort' in req.body ? (imapPort ?? null) : undefined,
      imapUser: 'imapUser' in req.body ? (imapUser ?? null) : undefined,
      imapPass: imapPassUpdate,
      imapMailbox: 'imapMailbox' in req.body ? (imapMailbox ?? null) : undefined,
      smtpHost: 'smtpHost' in req.body ? (smtpHost ?? null) : undefined,
      smtpPort: 'smtpPort' in req.body ? (smtpPort ?? null) : undefined,
      smtpSecure: 'smtpSecure' in req.body ? (smtpSecure ?? null) : undefined,
      calendarFeedEnabled: 'calendarFeedEnabled' in req.body ? calendarFeedEnabled : undefined,
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Restart IMAP worker so new credentials take effect immediately (fire-and-forget)
    imapManager.restartRoom(id).catch(err =>
      console.error('[imap] Failed to restart worker after room update:', err)
    );

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.ROOM_UPDATE,
      resourceType: 'room',
      resourceId: id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.json(sanitizeRoomForClient({ ...room, amenities: JSON.parse(room.amenities) }));
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// Delete room (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Option: soft delete by deactivating
    const softDelete = req.query.soft === 'true';

    if (softDelete) {
      const success = await RoomModel.deactivate(id);
      if (!success) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
    } else {
      const deleted = await RoomModel.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
    }

    // Stop IMAP worker for the deleted/deactivated room
    imapManager.stopRoom(id);

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.ROOM_DELETE,
      resourceType: 'room',
      resourceId: id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

export default router;
