import { Router, Response } from 'express';
import { DeviceModel } from '../models/device.model';
import { RoomModel } from '../models/room.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Get all devices (admin only)
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const devices = DeviceModel.findAll(includeInactive);

    // Map devices with parsed room amenities
    const devicesWithParsedData = devices.map(d => ({
      ...d,
      room: d.room ? {
        ...d.room,
        amenities: JSON.parse(d.room.amenities)
      } : undefined
    }));

    res.json(devicesWithParsedData);
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Get single device (admin only)
router.get('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const device = DeviceModel.findByIdWithRoom(id);

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json({
      ...device,
      room: device.room ? {
        ...device.room,
        amenities: JSON.parse(device.room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

// Get devices for a room (admin only)
router.get('/room/:roomId', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const devices = DeviceModel.findByRoom(roomId);

    const devicesWithParsedData = devices.map(d => ({
      ...d,
      room: d.room ? {
        ...d.room,
        amenities: JSON.parse(d.room.amenities)
      } : undefined
    }));

    res.json(devicesWithParsedData);
  } catch (error) {
    console.error('Get devices by room error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Create new device (admin only)
router.post('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, roomId } = req.body;

    if (!name || !roomId) {
      res.status(400).json({ error: 'Name and room ID are required' });
      return;
    }

    // Check room exists
    const room = RoomModel.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const device = DeviceModel.create({ name, roomId });

    res.status(201).json({
      ...device,
      room: {
        ...room,
        amenities: JSON.parse(room.amenities)
      }
    });
  } catch (error) {
    console.error('Create device error:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// Update device (admin only)
router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, roomId, isActive } = req.body;

    const existing = DeviceModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // If changing room, check room exists
    if (roomId && roomId !== existing.roomId) {
      const room = RoomModel.findById(roomId);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
    }

    const device = DeviceModel.update(id, { name, roomId, isActive });
    const deviceWithRoom = DeviceModel.findByIdWithRoom(id);

    res.json({
      ...deviceWithRoom,
      room: deviceWithRoom?.room ? {
        ...deviceWithRoom.room,
        amenities: JSON.parse(deviceWithRoom.room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Regenerate device token (admin only)
router.post('/:id/regenerate-token', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = DeviceModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const device = DeviceModel.regenerateToken(id);
    const deviceWithRoom = DeviceModel.findByIdWithRoom(id);

    res.json({
      ...deviceWithRoom,
      room: deviceWithRoom?.room ? {
        ...deviceWithRoom.room,
        amenities: JSON.parse(deviceWithRoom.room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Regenerate token error:', error);
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
});

// Delete device (admin only)
router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = DeviceModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    DeviceModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

export default router;
