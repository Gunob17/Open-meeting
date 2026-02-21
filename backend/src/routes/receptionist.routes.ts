import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireReceptionist } from '../middleware/auth.middleware';
import { GuestVisitModel } from '../models/guest-visit.model';
import { UserModel } from '../models/user.model';
import { SettingsModel } from '../models/settings.model';
import { UserRole } from '../types';

const router = Router();

// GET /api/receptionist/guests?date=YYYY-MM-DD
router.get('/guests', authenticate, requireReceptionist, async (req: AuthRequest, res: Response) => {
  try {
    const { date, parkId: queryParkId } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    // Get the user's park ID (super admins can specify via query param)
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    let parkId: string | null = user.parkId;
    if (user.role === UserRole.SUPER_ADMIN && queryParkId) {
      parkId = queryParkId as string;
    }

    if (!parkId) {
      res.status(400).json({ error: 'No park associated with this user' });
      return;
    }

    // Ensure guest_visits rows exist for all external guests on this date
    await GuestVisitModel.ensureVisitsForDate(targetDate, parkId);

    // Fetch all visits with details and global closing hour
    const [guests, settings] = await Promise.all([
      GuestVisitModel.findByDateAndPark(targetDate, parkId),
      SettingsModel.getGlobal(),
    ]);

    res.json({ date: targetDate, guests, closingHour: settings.closingHour });
  } catch (error) {
    console.error('Get receptionist guests error:', error);
    res.status(500).json({ error: 'Failed to get guests' });
  }
});

// POST /api/receptionist/guests/:id/checkin
router.post('/guests/:id/checkin', authenticate, requireReceptionist, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const visit = await GuestVisitModel.checkIn(id, req.user!.userId);
    if (!visit) {
      res.status(404).json({ error: 'Guest visit not found or already checked in' });
      return;
    }
    res.json(visit);
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ error: 'Failed to check in guest' });
  }
});

// POST /api/receptionist/guests/:id/checkout
router.post('/guests/:id/checkout', authenticate, requireReceptionist, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const visit = await GuestVisitModel.checkOut(id, req.user!.userId);
    if (!visit) {
      res.status(404).json({ error: 'Guest not checked in or already checked out' });
      return;
    }
    res.json(visit);
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ error: 'Failed to check out guest' });
  }
});

// POST /api/receptionist/guests/:id/undo-checkin
router.post('/guests/:id/undo-checkin', authenticate, requireReceptionist, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const visit = await GuestVisitModel.undoCheckIn(id);
    if (!visit) {
      res.status(404).json({ error: 'Guest visit not found' });
      return;
    }
    res.json(visit);
  } catch (error) {
    console.error('Undo check in error:', error);
    res.status(500).json({ error: 'Failed to undo check in' });
  }
});

export default router;
