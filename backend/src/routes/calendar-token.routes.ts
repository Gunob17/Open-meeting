import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { CalendarTokenModel } from '../models/calendar-token.model';
import { RoomModel } from '../models/room.model';
import { ParkModel } from '../models/park.model';
import { CalendarTokenScope } from '../types';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

const MAX_TOKENS_PER_USER = 20;

/** Build the complete ICS subscription URL for a token. */
function buildFeedUrl(req: AuthRequest, scope: CalendarTokenScope, roomId: string | null, rawToken: string): string {
  const base = process.env.API_BASE_URL?.replace(/\/$/, '')
    ?? `${req.protocol}://${req.get('host')}/api`;
  if (scope === 'room') {
    return `${base}/ical/room/${roomId}?token=${rawToken}`;
  }
  if (scope === 'park_rooms') {
    return `${base}/ical/park?token=${rawToken}`;
  }
  return `${base}/ical/my?token=${rawToken}`;
}

/**
 * POST /api/calendar-tokens
 * Create a new ICS feed token. Returns rawToken + feedUrl once only.
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { scope, roomId, label, expiresAt } = req.body;
    const user = req.user!;

    if (!scope || !['my_bookings', 'room', 'park_rooms'].includes(scope)) {
      res.status(400).json({ error: 'scope must be "my_bookings", "room", or "park_rooms"' });
      return;
    }

    if (label !== undefined && label !== null && String(label).length > 100) {
      res.status(400).json({ error: 'Label must be 100 characters or less' });
      return;
    }

    if (expiresAt !== undefined && expiresAt !== null) {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        res.status(400).json({ error: 'expiresAt must be a future ISO date' });
        return;
      }
    }

    // Room-scoped: validate room access
    if (scope === 'room') {
      if (!roomId) {
        res.status(400).json({ error: 'roomId is required when scope is "room"' });
        return;
      }

      const room = await RoomModel.findById(roomId);
      if (!room || !room.isActive) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      if (!room.calendarFeedEnabled) {
        res.status(403).json({ error: 'Calendar feed is disabled for this room' });
        return;
      }

      // Park-level check
      const park = await ParkModel.findById(room.parkId);
      if (park && !park.calendarFeedEnabled) {
        res.status(403).json({ error: 'Calendar feed is disabled for this park' });
        return;
      }

      // Park access check (super_admin has no parkId constraint)
      if (user.role !== 'super_admin') {
        if (room.parkId !== user.parkId) {
          res.status(403).json({ error: 'You do not have access to this room' });
          return;
        }
        // Company-lock check
        if (room.lockedToCompanyIds && room.lockedToCompanyIds.length > 0) {
          if (!room.lockedToCompanyIds.includes(user.companyId)) {
            res.status(403).json({ error: 'This room is restricted to other companies' });
            return;
          }
        }
      }
    }

    // my_bookings scope: check park-level toggle
    if (scope === 'my_bookings' && user.parkId) {
      const park = await ParkModel.findById(user.parkId);
      if (park && !park.calendarFeedEnabled) {
        res.status(403).json({ error: 'Calendar feed is disabled for this park' });
        return;
      }
    }

    // park_rooms scope: requires a parkId (super_admin spans multiple parks)
    if (scope === 'park_rooms') {
      if (!user.parkId) {
        res.status(400).json({ error: 'All-rooms feed is not available for accounts not assigned to a park' });
        return;
      }
      const park = await ParkModel.findById(user.parkId);
      if (park && !park.calendarFeedEnabled) {
        res.status(403).json({ error: 'Calendar feed is disabled for this park' });
        return;
      }
    }

    // Enforce per-user token cap
    const existing = await CalendarTokenModel.findByUser(user.userId);
    if (existing.length >= MAX_TOKENS_PER_USER) {
      res.status(409).json({ error: `Maximum of ${MAX_TOKENS_PER_USER} calendar tokens allowed per user` });
      return;
    }

    const { token, rawToken } = await CalendarTokenModel.create({
      userId: user.userId,
      scope: scope as CalendarTokenScope,
      roomId: scope === 'room' ? roomId : null,
      label: label ?? null,
      expiresAt: expiresAt ?? null,
    });

    const feedUrl = buildFeedUrl(req, scope as CalendarTokenScope, roomId ?? null, rawToken);

    auditLog({
      userId: user.userId,
      action: AuditAction.CALENDAR_TOKEN_CREATE,
      resourceType: 'calendar_token',
      resourceId: token.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { scope, roomId: roomId ?? null },
    });

    res.status(201).json({
      id: token.id,
      scope: token.scope,
      roomId: token.roomId,
      label: token.label,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      rawToken,   // Only time the raw token is returned
      feedUrl,
    });
  } catch (error) {
    console.error('Create calendar token error:', error);
    res.status(500).json({ error: 'Failed to create calendar token' });
  }
});

/**
 * GET /api/calendar-tokens
 * List the current user's tokens. Never returns rawToken or tokenHash.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tokens = await CalendarTokenModel.findByUser(req.user!.userId);
    res.json(
      tokens.map((t) => ({
        id: t.id,
        scope: t.scope,
        roomId: t.roomId,
        label: t.label,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
      })),
    );
  } catch (error) {
    console.error('List calendar tokens error:', error);
    res.status(500).json({ error: 'Failed to list calendar tokens' });
  }
});

/**
 * DELETE /api/calendar-tokens/:id
 * Revoke a token. Users can only revoke their own tokens.
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const success = await CalendarTokenModel.revoke(req.params.id, req.user!.userId);

    if (!success) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.CALENDAR_TOKEN_REVOKE,
      resourceType: 'calendar_token',
      resourceId: req.params.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
    });

    res.status(204).send();
  } catch (error) {
    console.error('Revoke calendar token error:', error);
    res.status(500).json({ error: 'Failed to revoke calendar token' });
  }
});

export default router;
