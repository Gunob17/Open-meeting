import { Router, Response } from 'express';
import { DeviceModel } from '../models/device.model';
import { RoomModel } from '../models/room.model';
import { FirmwareModel } from '../models/firmware.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';

const router = Router();

// Get all devices (admin only)
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const parkId = req.query.parkId as string | undefined;

    let devices;
    if (parkId) {
      devices = DeviceModel.findByPark(parkId, includeInactive);
    } else if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.parkId) {
      // Park admins can only see devices in their park
      devices = DeviceModel.findByPark(req.user.parkId, includeInactive);
    } else {
      devices = DeviceModel.findAll(includeInactive);
    }

    // Get latest firmware for update indication
    const latestFirmware = FirmwareModel.findLatest();

    // Map devices with parsed room amenities and update status
    const devicesWithParsedData = devices.map(d => {
      const hasUpdate = latestFirmware && d.firmwareVersion
        ? FirmwareModel.compareVersions(latestFirmware.version, d.firmwareVersion) > 0
        : latestFirmware && !d.firmwareVersion;

      return {
        ...d,
        hasUpdate,
        latestVersion: latestFirmware?.version || null,
        room: d.room ? {
          ...d.room,
          amenities: JSON.parse(d.room.amenities)
        } : undefined
      };
    });

    res.json(devicesWithParsedData);
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Get devices for a room (admin only) - MUST be before /:id to avoid route conflict
router.get('/room/:roomId', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    console.log('Fetching devices for room:', roomId);
    const devices = DeviceModel.findByRoom(roomId);
    console.log('Found devices:', devices.length, 'devices');
    if (devices.length > 0) {
      console.log('First device has token:', !!devices[0].token, 'token length:', devices[0].token?.length);
    }

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

// Create new device (admin only)
router.post('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, roomId } = req.body;
    console.log('Creating device:', { name, roomId });

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
    console.log('Created device with id:', device.id, 'token present:', !!device.token, 'token length:', device.token?.length);

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

// Schedule firmware update for multiple devices (admin only)
router.post('/firmware/schedule-update', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { deviceIds, firmwareVersion } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      res.status(400).json({ error: 'Device IDs array is required' });
      return;
    }

    if (!firmwareVersion) {
      res.status(400).json({ error: 'Firmware version is required' });
      return;
    }

    // Verify firmware version exists and is active
    const firmware = FirmwareModel.findByVersion(firmwareVersion);
    if (!firmware) {
      res.status(404).json({ error: 'Firmware version not found' });
      return;
    }

    if (!firmware.isActive) {
      res.status(400).json({ error: 'Firmware version is not active' });
      return;
    }

    // Schedule update for all devices
    const updatedCount = DeviceModel.setPendingFirmwareBatch(deviceIds, firmwareVersion);

    res.json({
      success: true,
      message: `Firmware update scheduled for ${updatedCount} device(s)`,
      updatedCount,
      firmwareVersion
    });
  } catch (error) {
    console.error('Schedule firmware update error:', error);
    res.status(500).json({ error: 'Failed to schedule firmware update' });
  }
});

// Cancel pending firmware update for a device (admin only)
router.post('/:id/firmware/cancel-update', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = DeviceModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    DeviceModel.clearPendingFirmware(id);
    const device = DeviceModel.findByIdWithRoom(id);

    res.json({
      ...device,
      room: device?.room ? {
        ...device.room,
        amenities: JSON.parse(device.room.amenities)
      } : undefined
    });
  } catch (error) {
    console.error('Cancel firmware update error:', error);
    res.status(500).json({ error: 'Failed to cancel firmware update' });
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
