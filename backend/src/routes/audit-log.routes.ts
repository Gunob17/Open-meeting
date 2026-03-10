import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth.middleware';
import { getDb } from '../models/database';

const router = Router();

// GET /api/audit-log — Super Admin only
router.get('/', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { action, userId, startDate, endDate, limit, offset } = req.query;

    const db = getDb();
    let query = db('audit_logs').orderBy('timestamp', 'desc');

    if (action) {
      query = query.where('action', action as string);
    }
    if (userId) {
      query = query.where('user_id', userId as string);
    }
    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate as string).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate as string);
      if ((endDate as string).length === 10) {
        end.setDate(end.getDate() + 1);
      }
      query = query.where('timestamp', '<', end.toISOString());
    }

    const resultLimit = Math.min(parseInt(limit as string) || 100, 500);
    const resultOffset = parseInt(offset as string) || 0;

    const [rows, totalResult] = await Promise.all([
      query.clone().limit(resultLimit).offset(resultOffset),
      query.clone().count('* as count').first(),
    ]);

    const entries = rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      outcome: row.outcome,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));

    res.json({
      total: Number(totalResult?.count || 0),
      limit: resultLimit,
      offset: resultOffset,
      entries,
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

export default router;
