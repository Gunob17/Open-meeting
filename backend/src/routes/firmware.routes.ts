import { Router, Response, Request, NextFunction } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { FirmwareModel } from '../models/firmware.model';
import multer, { FileFilterCallback, MulterError } from 'multer';

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

// Multer error handling wrapper
const uploadMiddleware = (req: MulterAuthRequest, res: Response, next: NextFunction) => {
  upload.single('firmware')(req, res, (err: any) => {
    if (err instanceof MulterError) {
      console.error('Multer error:', err.code, err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

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
router.post('/', authenticate, requireAdmin, uploadMiddleware, (req: MulterAuthRequest, res: Response) => {
  try {
    console.log('Firmware upload request received');
    console.log('Body:', req.body);
    console.log('File:', req.file ? { name: req.file.originalname, size: req.file.size } : 'No file');

    const { version, releaseNotes } = req.body;
    const file = req.file;

    if (!version) {
      console.log('Upload rejected: No version provided');
      res.status(400).json({ error: 'Version is required' });
      return;
    }

    if (!file) {
      console.log('Upload rejected: No file provided');
      res.status(400).json({ error: 'Firmware file is required' });
      return;
    }

    // Check if version already exists
    const existing = FirmwareModel.findByVersion(version);
    if (existing) {
      console.log('Upload rejected: Version already exists');
      res.status(400).json({ error: 'Firmware version already exists' });
      return;
    }

    console.log('Creating firmware entry...');
    const firmware = FirmwareModel.create(
      { version, releaseNotes },
      file.buffer
    );

    console.log('Firmware uploaded successfully:', firmware.id);
    res.status(201).json(firmware);
  } catch (error) {
    console.error('Upload firmware error:', error);
    res.status(500).json({ error: 'Failed to upload firmware: ' + (error instanceof Error ? error.message : 'Unknown error') });
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
