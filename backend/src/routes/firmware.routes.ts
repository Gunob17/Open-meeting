import { Router, Response, Request } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { FirmwareModel } from '../models/firmware.model';
import multer, { FileFilterCallback } from 'multer';

const router = Router();

// Extend AuthRequest to include file from multer
interface MulterAuthRequest extends AuthRequest {
  file?: Express.Multer.File;
}

// Configure multer for firmware uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for firmware files
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Only allow .bin files
    if (file.originalname.endsWith('.bin')) {
      cb(null, true);
    } else {
      cb(new Error('Only .bin files are allowed'));
    }
  }
});

// Get all firmware versions (admin only)
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const firmware = FirmwareModel.findAll();
    res.json(firmware);
  } catch (error) {
    console.error('Get firmware list error:', error);
    res.status(500).json({ error: 'Failed to get firmware list' });
  }
});

// Get latest firmware info (admin only)
router.get('/latest', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const firmware = FirmwareModel.findLatest();
    if (!firmware) {
      res.status(404).json({ error: 'No firmware available' });
      return;
    }
    res.json(firmware);
  } catch (error) {
    console.error('Get latest firmware error:', error);
    res.status(500).json({ error: 'Failed to get latest firmware' });
  }
});

// Upload new firmware (admin only)
router.post('/', authenticate, requireAdmin, upload.single('firmware'), (req: MulterAuthRequest, res: Response) => {
  try {
    const { version, releaseNotes } = req.body;
    const file = req.file;

    if (!version) {
      res.status(400).json({ error: 'Version is required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'Firmware file is required' });
      return;
    }

    // Check if version already exists
    const existing = FirmwareModel.findByVersion(version);
    if (existing) {
      res.status(400).json({ error: 'Firmware version already exists' });
      return;
    }

    const firmware = FirmwareModel.create(
      { version, releaseNotes },
      file.buffer
    );

    res.status(201).json(firmware);
  } catch (error) {
    console.error('Upload firmware error:', error);
    res.status(500).json({ error: 'Failed to upload firmware' });
  }
});

// Delete firmware (admin only)
router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const firmware = FirmwareModel.findById(id);
    if (!firmware) {
      res.status(404).json({ error: 'Firmware not found' });
      return;
    }

    FirmwareModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete firmware error:', error);
    res.status(500).json({ error: 'Failed to delete firmware' });
  }
});

// Toggle firmware active status (admin only)
router.patch('/:id/active', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const firmware = FirmwareModel.findById(id);
    if (!firmware) {
      res.status(404).json({ error: 'Firmware not found' });
      return;
    }

    const updated = FirmwareModel.setActive(id, isActive);
    res.json(updated);
  } catch (error) {
    console.error('Update firmware status error:', error);
    res.status(500).json({ error: 'Failed to update firmware status' });
  }
});

export default router;
