import { Router, Response, Request, NextFunction } from 'express';
import { ParkModel } from '../models/park.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import multer, { FileFilterCallback, MulterError } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Logo storage directory
const logosDir = path.join(__dirname, '../../data/logos');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// Extend AuthRequest to include file from multer
interface MulterAuthRequest extends AuthRequest {
  file?: Express.Multer.File;
}

// Configure multer for logo uploads
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit for logos
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, GIF, SVG, and WebP images are allowed'));
    }
  }
});

// Logo upload middleware with error handling
const logoUploadMiddleware = (req: MulterAuthRequest, res: Response, next: NextFunction) => {
  logoUpload.single('logo')(req, res, (err: any) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Logo too large. Maximum size is 2MB' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// Middleware to require super admin
function requireSuperAdmin(req: AuthRequest, res: Response, next: Function): void {
  if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }
  next();
}

// Get all parks (super admin sees all, park admin sees only their park)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      const includeInactive = req.query.includeInactive === 'true';
      const parks = await ParkModel.findAll(includeInactive);
      res.json(parks);
    } else if (req.user?.parkId) {
      // Non-super admins only see their own park
      const park = await ParkModel.findById(req.user.parkId);
      res.json(park ? [park] : []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Get parks error:', error);
    res.status(500).json({ error: 'Failed to get parks' });
  }
});

// Get single park
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check access
    if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.parkId !== id) {
      res.status(403).json({ error: 'Access denied to this park' });
      return;
    }

    const park = await ParkModel.findById(id);
    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    res.json(park);
  } catch (error) {
    console.error('Get park error:', error);
    res.status(500).json({ error: 'Failed to get park' });
  }
});

// Create park (super admin only)
router.post('/', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, address, description } = req.body;

    if (!name || !address) {
      res.status(400).json({ error: 'Name and address are required' });
      return;
    }

    if (name.length > 255 || address.length > 500 || (description && description.length > 2000)) {
      res.status(400).json({ error: 'Name (max 255), address (max 500), or description (max 2000) too long' });
      return;
    }

    const park = await ParkModel.create({ name, address, description });
    res.status(201).json(park);
  } catch (error) {
    console.error('Create park error:', error);
    res.status(500).json({ error: 'Failed to create park' });
  }
});

// Update park (super admin only)
router.put('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, description, isActive, twofaEnforcement, receptionEmail, receptionGuestFields } = req.body;

    const park = await ParkModel.update(id, { name, address, description, isActive, twofaEnforcement, receptionEmail, receptionGuestFields });
    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    res.json(park);
  } catch (error) {
    console.error('Update park error:', error);
    res.status(500).json({ error: 'Failed to update park' });
  }
});

// Update park reception settings (super admin or park admin of that park)
router.put('/:id/reception', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Authorization: super_admin or park_admin of this park
    if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    if (req.user?.role === UserRole.PARK_ADMIN && req.user?.parkId !== id) {
      res.status(403).json({ error: 'Access denied to this park' });
      return;
    }

    const { receptionEmail, receptionGuestFields } = req.body;

    // Validate email format if provided
    if (receptionEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receptionEmail)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Ensure guest fields always includes 'name'
    let fields = receptionGuestFields;
    if (fields && Array.isArray(fields)) {
      if (!fields.includes('name')) {
        fields = ['name', ...fields];
      }
    }

    const park = await ParkModel.update(id, {
      receptionEmail: receptionEmail || null,
      receptionGuestFields: fields,
    });

    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    res.json(park);
  } catch (error) {
    console.error('Update park reception error:', error);
    res.status(500).json({ error: 'Failed to update park reception settings' });
  }
});

// Delete park (super admin only)
router.delete('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (id === 'default') {
      res.status(400).json({ error: 'Cannot delete the default park' });
      return;
    }

    const softDelete = req.query.soft === 'true';

    if (softDelete) {
      const success = await ParkModel.deactivate(id);
      if (!success) {
        res.status(404).json({ error: 'Park not found' });
        return;
      }
    } else {
      const deleted = await ParkModel.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Park not found' });
        return;
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete park error:', error);
    res.status(500).json({ error: 'Failed to delete park' });
  }
});

// Upload park logo (super admin or park admin of that park)
router.post('/:id/logo', authenticate, logoUploadMiddleware, async (req: MulterAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    // Check access - super admin or park admin of this park
    if (req.user?.role !== UserRole.SUPER_ADMIN &&
        req.user?.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (req.user?.role === UserRole.PARK_ADMIN && req.user?.parkId !== id) {
      res.status(403).json({ error: 'Access denied to this park' });
      return;
    }

    const park = await ParkModel.findById(id);
    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'Logo file is required' });
      return;
    }

    // Delete old logo if exists
    if (park.logoUrl) {
      const oldLogoPath = path.join(logosDir, path.basename(park.logoUrl));
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Save new logo
    const ext = path.extname(file.originalname) || '.png';
    const filename = `${id}_${uuidv4()}${ext}`;
    const filePath = path.join(logosDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    // Update park with new logo URL
    const logoUrl = `/api/parks/${id}/logo/${filename}`;
    const updatedPark = await ParkModel.updateLogo(id, logoUrl);

    res.json(updatedPark);
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Serve park logo (public)
router.get('/:id/logo/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|svg|webp)$/i.test(filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const filePath = path.resolve(logosDir, filename);

    // Ensure resolved path is within logosDir
    if (!filePath.startsWith(path.resolve(logosDir))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Logo not found' });
      return;
    }

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Serve logo error:', error);
    res.status(500).json({ error: 'Failed to serve logo' });
  }
});

// Delete park logo (super admin or park admin of that park)
router.delete('/:id/logo', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check access
    if (req.user?.role !== UserRole.SUPER_ADMIN &&
        req.user?.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (req.user?.role === UserRole.PARK_ADMIN && req.user?.parkId !== id) {
      res.status(403).json({ error: 'Access denied to this park' });
      return;
    }

    const park = await ParkModel.findById(id);
    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    // Delete logo file if exists
    if (park.logoUrl) {
      const logoPath = path.join(logosDir, path.basename(park.logoUrl));
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    // Update park to remove logo URL
    const updatedPark = await ParkModel.updateLogo(id, null);
    res.json(updatedPark);
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

export default router;
