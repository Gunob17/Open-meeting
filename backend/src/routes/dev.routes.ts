import { Router, Response } from 'express';
import { UserModel } from '../models/user.model';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// POST /api/dev/impersonate
// Returns a real JWT for any user — dev mode only, never available in production.
router.post('/impersonate', authenticate, async (req: AuthRequest, res: Response) => {
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
