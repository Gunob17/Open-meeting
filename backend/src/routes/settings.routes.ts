import { Router, Response } from 'express';
import db from '../models/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { Settings } from '../types';

const router = Router();

// Get global settings
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT id, opening_hour, closing_hour, updated_at
      FROM settings WHERE id = 'global'
    `);
    const row = stmt.get() as { id: string; opening_hour: number; closing_hour: number; updated_at: string } | undefined;

    if (!row) {
      return res.json({
        id: 'global',
        openingHour: 8,
        closingHour: 18,
        updatedAt: new Date().toISOString()
      });
    }

    const settings: Settings = {
      id: row.id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      updatedAt: row.updated_at
    };

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update global settings (admin only)
router.put('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { openingHour, closingHour } = req.body;

    // Validate hours
    if (typeof openingHour !== 'number' || openingHour < 0 || openingHour > 23) {
      return res.status(400).json({ error: 'Opening hour must be between 0 and 23' });
    }
    if (typeof closingHour !== 'number' || closingHour < 0 || closingHour > 23) {
      return res.status(400).json({ error: 'Closing hour must be between 0 and 23' });
    }
    if (openingHour >= closingHour) {
      return res.status(400).json({ error: 'Opening hour must be before closing hour' });
    }

    const stmt = db.prepare(`
      UPDATE settings
      SET opening_hour = ?, closing_hour = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 'global'
    `);
    stmt.run(openingHour, closingHour);

    // Return updated settings
    const selectStmt = db.prepare(`
      SELECT id, opening_hour, closing_hour, updated_at
      FROM settings WHERE id = 'global'
    `);
    const row = selectStmt.get() as { id: string; opening_hour: number; closing_hour: number; updated_at: string };

    const settings: Settings = {
      id: row.id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      updatedAt: row.updated_at
    };

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
