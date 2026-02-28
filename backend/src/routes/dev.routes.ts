import { Router, Response } from 'express';
import { UserModel } from '../models/user.model';
import { generateToken, authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth.middleware';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// POST /api/dev/impersonate
// Returns a real JWT for any user — development only (never mounted in production).
// Restricted to SUPER_ADMIN to prevent privilege escalation if accidentally exposed.
router.post('/impersonate', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const target = await UserModel.findById(userId);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const token = generateToken({
      userId: target.id,
      email: target.email,
      role: target.role,
      companyId: target.companyId,
      parkId: target.parkId,
    });

    auditLog({ userId: req.user!.userId, action: AuditAction.DEV_IMPERSONATE, resourceType: 'user', resourceId: target.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });
    res.json({
      token,
      user: {
        id: target.id,
        email: target.email,
        name: target.name,
        role: target.role,
        companyId: target.companyId,
        parkId: target.parkId,
        addonRoles: target.addonRoles,
      },
    });
  } catch (error) {
    console.error('Dev impersonate error:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

export default router;
