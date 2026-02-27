import { Router, Response } from 'express';
import { RoomModel } from '../models/room.model';
import { BookingModel } from '../models/booking.model';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';

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

    // Parse amenities JSON for response
    const roomsWithParsedAmenities = rooms.map(room => ({
      ...room,
      amenities: JSON.parse(room.amenities)
    }));

    res.json(roomsWithParsedAmenities);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// Get single room with availability
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await RoomModel.findById(id);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json({
      ...room,
      amenities: JSON.parse(room.amenities)
    });
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

    const bookings = await BookingModel.findByRoom(id, startDate as string, endDate as string);

    res.json({
      room: {
        ...room,
        amenities: JSON.parse(room.amenities)
      },
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

// Create room (park admin or above)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, capacity, amenities, floor, address, description, openingHour, closingHour, lockedToCompanyIds, quickBookDurations, parkId } = req.body;

    if (!name || !capacity || !floor || !address) {
      res.status(400).json({ error: 'Name, capacity, floor, and address are required' });
      return;
    }

    if (name.length > 255 || floor.length > 100 || address.length > 500 || (description && description.length > 2000)) {
      res.status(400).json({ error: 'Field length exceeded: name (255), floor (100), address (500), description (2000)' });
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
      quickBookDurations: quickBookDurations ?? [30, 60, 90, 120]
    });

    res.status(201).json({
      ...room,
      amenities: JSON.parse(room.amenities)
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Update room (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, capacity, amenities, floor, address, description, isActive, openingHour, closingHour, lockedToCompanyIds, quickBookDurations } = req.body;

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
      quickBookDurations
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json({
      ...room,
      amenities: JSON.parse(room.amenities)
    });
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

    res.status(204).send();
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

export default router;
