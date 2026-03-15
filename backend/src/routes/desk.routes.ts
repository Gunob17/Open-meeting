import { Router, Response } from 'express';
import { DeskModel } from '../models/desk.model';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireParkAdmin, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// GET /api/desks — list desks scoped to user's park
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';

    // Non-admins can only see desks if their company has desk booking enabled
    const isAdminRole = req.user?.role === UserRole.SUPER_ADMIN || req.user?.role === UserRole.PARK_ADMIN;
    if (!isAdminRole && !includeInactive) {
      const company = await CompanyModel.findById(req.user!.companyId);
      if (!company?.deskBookingEnabled) {
        res.status(403).json({ error: 'Desk booking is not enabled for your company' });
        return;
      }
    }

    let parkId: string | null | undefined;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      // Super admin can pass explicit ?parkId= or get all parks
      parkId = (req.query.parkId as string) || undefined;
    } else {
      parkId = req.user?.parkId;
    }

    const desks = await DeskModel.findAll(includeInactive, parkId);
    res.json(desks);
  } catch (err) {
    console.error('Error listing desks:', err);
    res.status(500).json({ error: 'Failed to load desks' });
  }
});

// GET /api/desks/:id — get single desk
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const desk = await DeskModel.findById(req.params.id);
    if (!desk) {
      res.status(404).json({ error: 'Desk not found' });
      return;
    }

    // Non-super-admins can only view desks in their park
    if (req.user?.role !== UserRole.SUPER_ADMIN && desk.parkId !== req.user?.parkId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(desk);
  } catch (err) {
    console.error('Error fetching desk:', err);
    res.status(500).json({ error: 'Failed to load desk' });
  }
});

// POST /api/desks — create desk (park admin only)
router.post('/', authenticate, requireParkAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, floor, features } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Desk name is required' });
      return;
    }
    if (name.trim().length > 255) {
      res.status(400).json({ error: 'Desk name must be 255 characters or less' });
      return;
    }
    if (description && description.length > 2000) {
      res.status(400).json({ error: 'Description must be 2000 characters or less' });
      return;
    }

    // Determine park: park admin uses their own park, super admin can specify (defaults to 'default')
    let parkId: string;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      parkId = req.body.parkId || 'default';
    } else {
      if (!req.user!.parkId) {
        res.status(400).json({ error: 'User is not assigned to a park' });
        return;
      }
      parkId = req.user!.parkId;
    }

    const featuresArr: string[] = Array.isArray(features)
      ? features.filter((f: any) => typeof f === 'string').slice(0, 20)
      : [];

    const desk = await DeskModel.create({
      name: name.trim(),
      description: description?.trim() || null,
      floor: floor?.trim() || null,
      parkId,
      features: featuresArr,
    });

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_CREATE,
      resourceType: 'desk',
      resourceId: desk.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { name: desk.name, parkId: desk.parkId },
    });

    res.status(201).json(desk);
  } catch (err) {
    console.error('Error creating desk:', err);
    res.status(500).json({ error: 'Failed to create desk' });
  }
});

// PUT /api/desks/:id — update desk (park admin only)
router.put('/:id', authenticate, requireParkAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const desk = await DeskModel.findById(req.params.id);
    if (!desk) {
      res.status(404).json({ error: 'Desk not found' });
      return;
    }

    // Park admin can only update desks in their park
    if (req.user?.role !== UserRole.SUPER_ADMIN && desk.parkId !== req.user?.parkId) {
      res.status(403).json({ error: 'Access denied to this desk' });
      return;
    }

    const { name, description, floor, isActive } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Desk name cannot be empty' });
        return;
      }
      if (name.trim().length > 255) {
        res.status(400).json({ error: 'Desk name must be 255 characters or less' });
        return;
      }
    }
    if (description && description.length > 2000) {
      res.status(400).json({ error: 'Description must be 2000 characters or less' });
      return;
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if ('description' in req.body) updates.description = description?.trim() || null;
    if ('floor' in req.body) updates.floor = floor?.trim() || null;
    if (isActive !== undefined) updates.isActive = isActive;
    if ('features' in req.body) {
      updates.features = Array.isArray(req.body.features)
        ? req.body.features.filter((f: any) => typeof f === 'string').slice(0, 20)
        : [];
    }

    const updated = await DeskModel.update(req.params.id, updates);

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_UPDATE,
      resourceType: 'desk',
      resourceId: desk.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
    });

    res.json(updated);
  } catch (err) {
    console.error('Error updating desk:', err);
    res.status(500).json({ error: 'Failed to update desk' });
  }
});

// DELETE /api/desks/:id — hard delete (park admin only)
router.delete('/:id', authenticate, requireParkAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const desk = await DeskModel.findById(req.params.id);
    if (!desk) {
      res.status(404).json({ error: 'Desk not found' });
      return;
    }

    // Park admin can only delete desks in their park
    if (req.user?.role !== UserRole.SUPER_ADMIN && desk.parkId !== req.user?.parkId) {
      res.status(403).json({ error: 'Access denied to this desk' });
      return;
    }

    await DeskModel.delete(req.params.id);

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_DELETE,
      resourceType: 'desk',
      resourceId: desk.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { name: desk.name, parkId: desk.parkId },
    });

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting desk:', err);
    res.status(500).json({ error: 'Failed to delete desk' });
  }
});

export default router;
