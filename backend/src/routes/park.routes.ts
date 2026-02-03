import { Router, Response } from 'express';
import { ParkModel } from '../models/park.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';

const router = Router();

// Middleware to require super admin
function requireSuperAdmin(req: AuthRequest, res: Response, next: Function): void {
  if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }
  next();
}

// Get all parks (super admin sees all, park admin sees only their park)
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      const includeInactive = req.query.includeInactive === 'true';
      const parks = ParkModel.findAll(includeInactive);
      res.json(parks);
    } else if (req.user?.parkId) {
      // Non-super admins only see their own park
      const park = ParkModel.findById(req.user.parkId);
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
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check access
    if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.parkId !== id) {
      res.status(403).json({ error: 'Access denied to this park' });
      return;
    }

    const park = ParkModel.findById(id);
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
router.post('/', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, address, description } = req.body;

    if (!name || !address) {
      res.status(400).json({ error: 'Name and address are required' });
      return;
    }

    const park = ParkModel.create({ name, address, description });
    res.status(201).json(park);
  } catch (error) {
    console.error('Create park error:', error);
    res.status(500).json({ error: 'Failed to create park' });
  }
});

// Update park (super admin only)
router.put('/:id', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, description, isActive } = req.body;

    const park = ParkModel.update(id, { name, address, description, isActive });
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

// Delete park (super admin only)
router.delete('/:id', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (id === 'default') {
      res.status(400).json({ error: 'Cannot delete the default park' });
      return;
    }

    const softDelete = req.query.soft === 'true';

    if (softDelete) {
      const success = ParkModel.deactivate(id);
      if (!success) {
        res.status(404).json({ error: 'Park not found' });
        return;
      }
    } else {
      const deleted = ParkModel.delete(id);
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

export default router;
