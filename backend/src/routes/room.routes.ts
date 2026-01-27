import { Router, Response } from 'express';
import { RoomModel } from '../models/room.model';
import { BookingModel } from '../models/booking.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Get all rooms
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const rooms = RoomModel.findAll(includeInactive);

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
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = RoomModel.findById(id);

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
router.get('/:id/availability', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const room = RoomModel.findById(id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const bookings = BookingModel.findByRoom(id, startDate as string, endDate as string);

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

// Create room (admin only)
router.post('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, capacity, amenities, floor, address, description } = req.body;

    if (!name || !capacity || !floor || !address) {
      res.status(400).json({ error: 'Name, capacity, floor, and address are required' });
      return;
    }

    if (typeof capacity !== 'number' || capacity < 1) {
      res.status(400).json({ error: 'Capacity must be a positive number' });
      return;
    }

    const room = RoomModel.create({
      name,
      capacity,
      amenities: amenities || [],
      floor,
      address,
      description
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
router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, capacity, amenities, floor, address, description, isActive } = req.body;

    const room = RoomModel.update(id, {
      name,
      capacity,
      amenities,
      floor,
      address,
      description,
      isActive
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
router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Option: soft delete by deactivating
    const softDelete = req.query.soft === 'true';

    if (softDelete) {
      const success = RoomModel.deactivate(id);
      if (!success) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
    } else {
      const deleted = RoomModel.delete(id);
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
