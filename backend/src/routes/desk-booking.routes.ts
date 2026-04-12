import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { DeskBookingModel } from '../models/desk-booking.model';
import { DeskModel } from '../models/desk.model';
import { ParkModel } from '../models/park.model';
import { UserDeskQuotaModel } from '../models/user-desk-quota.model';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireParkAdmin, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// Rate limit desk booking creation: 30 per hour per IP
const deskBookingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many booking requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxBookingDateString(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

// GET /api/desk-bookings — all confirmed bookings for user's park (startDate + endDate required)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    let parkId: string;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      parkId = (req.query.parkId as string) || 'default';
    } else {
      if (!req.user?.parkId) {
        res.status(400).json({ error: 'User has no park assignment' });
        return;
      }
      parkId = req.user.parkId;
    }

    const bookings = await DeskBookingModel.findByPark(
      parkId,
      startDate as string,
      endDate as string
    );

    // Return minimal data for the availability grid — no user PII
    res.json(
      bookings.map((b) => ({
        id: b.id,
        deskId: b.deskId,
        userId: b.userId,
        bookingDate: b.bookingDate,
        status: b.status,
      }))
    );
  } catch (err) {
    console.error('Error listing desk bookings:', err);
    res.status(500).json({ error: 'Failed to load desk bookings' });
  }
});

// GET /api/desk-bookings/my — user's own bookings with desk details
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Non-admins can only view their bookings if their company has desk booking enabled
    const isAdminRole = req.user?.role === UserRole.SUPER_ADMIN || req.user?.role === UserRole.PARK_ADMIN;
    if (!isAdminRole) {
      const company = await CompanyModel.findById(req.user!.companyId);
      if (!company?.deskBookingEnabled) {
        res.status(403).json({ error: 'Desk booking is not enabled for your company' });
        return;
      }
    }

    const bookings = await DeskBookingModel.findByUser(req.user!.userId);
    res.json(bookings);
  } catch (err) {
    console.error('Error loading my desk bookings:', err);
    res.status(500).json({ error: 'Failed to load your desk bookings' });
  }
});

// GET /api/desk-bookings/quota?month=YYYY-MM — park-level quota status for the current user
router.get('/quota', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      res.status(400).json({ error: 'month must be in YYYY-MM format' });
      return;
    }

    const parkId = req.user?.role === UserRole.SUPER_ADMIN
      ? ((req.query.parkId as string) || 'default')
      : req.user?.parkId;

    if (!parkId) {
      res.status(400).json({ error: 'User has no park assignment' });
      return;
    }

    const park = await ParkModel.findById(parkId);
    if (!park || !park.monthlyDeskQuota || !park.deskQuotaType) {
      res.json({
        quotaType: null,
        monthlyQuota: null,
        usedThisMonth: 0,
        remainingThisMonth: null,
        blockedWeekdays: park?.blockedWeekdays ?? [],
        weekStartDay: park?.weekStartDay ?? 1,
      });
      return;
    }

    let effectiveQuota = park.monthlyDeskQuota;
    if (park.deskQuotaType === 'per_user') {
      const override = await UserDeskQuotaModel.findByParkAndUser(parkId, req.user!.userId);
      if (override) effectiveQuota = override.monthlyQuota;
    }

    const used = await DeskBookingModel.countMonthlyUsage(
      parkId,
      req.user!.userId,
      req.user!.companyId,
      month as string,
      park.deskQuotaType
    );

    res.json({
      quotaType: park.deskQuotaType,
      monthlyQuota: effectiveQuota,
      usedThisMonth: used,
      remainingThisMonth: Math.max(0, effectiveQuota - used),
      blockedWeekdays: park.blockedWeekdays,
      weekStartDay: park.weekStartDay,
    });
  } catch (err) {
    console.error('Error checking desk quota:', err);
    res.status(500).json({ error: 'Failed to check quota' });
  }
});

// GET /api/desk-bookings/desk/:deskId — confirmed bookings for a specific desk
router.get('/desk/:deskId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const desk = await DeskModel.findById(req.params.deskId);
    if (!desk) {
      res.status(404).json({ error: 'Desk not found' });
      return;
    }

    // Only accessible within user's park
    if (req.user?.role !== UserRole.SUPER_ADMIN && desk.parkId !== req.user?.parkId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { startDate, endDate } = req.query;
    const bookings = await DeskBookingModel.findByDesk(
      req.params.deskId,
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.json(bookings);
  } catch (err) {
    console.error('Error loading desk bookings:', err);
    res.status(500).json({ error: 'Failed to load desk bookings' });
  }
});

// POST /api/desk-bookings — create a desk booking
router.post('/', authenticate, deskBookingCreateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    // Non-admins can only book if their company has desk booking enabled
    const isAdminRole = req.user?.role === UserRole.SUPER_ADMIN || req.user?.role === UserRole.PARK_ADMIN;
    if (!isAdminRole) {
      const company = await CompanyModel.findById(req.user!.companyId);
      if (!company?.deskBookingEnabled) {
        res.status(403).json({ error: 'Desk booking is not enabled for your company' });
        return;
      }
    }

    const { deskId, bookingDate } = req.body;

    // Validate inputs
    if (!deskId || typeof deskId !== 'string') {
      res.status(400).json({ error: 'deskId is required' });
      return;
    }
    if (!bookingDate || typeof bookingDate !== 'string' || !DATE_REGEX.test(bookingDate)) {
      res.status(400).json({ error: 'bookingDate must be a valid date in YYYY-MM-DD format' });
      return;
    }
    if (bookingDate < todayDateString()) {
      res.status(400).json({ error: 'Cannot book a desk in the past' });
      return;
    }
    if (bookingDate > maxBookingDateString()) {
      res.status(400).json({ error: 'Desk bookings cannot be made more than 3 months in advance' });
      return;
    }

    // Load desk
    const desk = await DeskModel.findById(deskId);
    if (!desk) {
      res.status(404).json({ error: 'Desk not found' });
      return;
    }
    if (!desk.isActive) {
      res.status(400).json({ error: 'This desk is not currently available for booking' });
      return;
    }

    // Park access check
    if (req.user?.role !== UserRole.SUPER_ADMIN && desk.parkId !== req.user?.parkId) {
      res.status(403).json({ error: 'This desk is not in your park' });
      return;
    }

    // Duplicate check
    const isDuplicate = await DeskBookingModel.checkDuplicate(deskId, req.user!.userId, bookingDate);
    if (isDuplicate) {
      res.status(409).json({ error: 'You already have a booking for this desk on that date' });
      return;
    }

    // Blocked-weekday + quota checks (park-level)
    const park = await ParkModel.findById(desk.parkId);
    if (park && park.blockedWeekdays.length > 0) {
      // Parse date parts directly to avoid timezone shifting
      const [y, m, d] = bookingDate.split('-').map(Number);
      const weekday = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat
      if (park.blockedWeekdays.includes(weekday)) {
        res.status(400).json({ error: 'The park is closed on that day' });
        return;
      }
    }
    if (park && park.monthlyDeskQuota && park.deskQuotaType) {
      const month = bookingDate.substring(0, 7); // 'YYYY-MM'

      let effectiveQuota = park.monthlyDeskQuota;
      if (park.deskQuotaType === 'per_user') {
        const override = await UserDeskQuotaModel.findByParkAndUser(desk.parkId, req.user!.userId);
        if (override) effectiveQuota = override.monthlyQuota;
      }

      const used = await DeskBookingModel.countMonthlyUsage(
        desk.parkId,
        req.user!.userId,
        req.user!.companyId,
        month,
        park.deskQuotaType
      );
      if (used >= effectiveQuota) {
        const label = park.deskQuotaType === 'per_company'
          ? 'Your company has used its monthly desk booking quota'
          : 'You have used your monthly desk booking quota';
        res.status(409).json({ error: `${label} (${effectiveQuota} days/month)` });
        return;
      }
    }

    const booking = await DeskBookingModel.create(deskId, req.user!.userId, bookingDate);

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_BOOKING_CREATE,
      resourceType: 'desk_booking',
      resourceId: booking.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { deskId, bookingDate },
    });

    // Return booking with desk details
    const bookingWithDetails = await DeskBookingModel.findByIdWithDetails(booking.id);
    res.status(201).json(bookingWithDetails);
  } catch (err) {
    console.error('Error creating desk booking:', err);
    res.status(500).json({ error: 'Failed to create desk booking' });
  }
});

// POST /api/desk-bookings/:id/cancel — cancel a booking (owner or park admin)
router.post('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await DeskBookingModel.findByIdWithDetails(req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Desk booking not found' });
      return;
    }

    // Authorization: owner or park admin of the desk's park
    const isOwner = booking.userId === req.user!.userId;
    const isParkAdmin =
      req.user?.role === UserRole.SUPER_ADMIN ||
      (req.user?.role === UserRole.PARK_ADMIN && booking.desk?.parkId === req.user?.parkId);

    if (!isOwner && !isParkAdmin) {
      res.status(403).json({ error: 'You can only cancel your own desk bookings' });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(400).json({ error: 'Booking is already cancelled' });
      return;
    }

    await DeskBookingModel.cancel(req.params.id);

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_BOOKING_CANCEL,
      resourceType: 'desk_booking',
      resourceId: booking.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { deskId: booking.deskId, bookingDate: booking.bookingDate, targetUserId: booking.userId },
    });

    res.json({ message: 'Desk booking cancelled' });
  } catch (err) {
    console.error('Error cancelling desk booking:', err);
    res.status(500).json({ error: 'Failed to cancel desk booking' });
  }
});

// DELETE /api/desk-bookings/:id — hard delete (park admin only)
router.delete('/:id', authenticate, requireParkAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await DeskBookingModel.findByIdWithDetails(req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Desk booking not found' });
      return;
    }

    // Park admin can only delete bookings in their park
    if (
      req.user?.role !== UserRole.SUPER_ADMIN &&
      booking.desk?.parkId !== req.user?.parkId
    ) {
      res.status(403).json({ error: 'Access denied to this booking' });
      return;
    }

    await DeskBookingModel.delete(req.params.id);

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.DESK_BOOKING_DELETE,
      resourceType: 'desk_booking',
      resourceId: booking.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { deskId: booking.deskId, bookingDate: booking.bookingDate, targetUserId: booking.userId },
    });

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting desk booking:', err);
    res.status(500).json({ error: 'Failed to delete desk booking' });
  }
});

export default router;
