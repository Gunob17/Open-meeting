import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { CalendarTokenModel } from '../models/calendar-token.model';
import { BookingModel } from '../models/booking.model';
import { RoomModel } from '../models/room.model';
import { ParkModel } from '../models/park.model';
import { UserModel } from '../models/user.model';
import { Booking } from '../types';
import { generateRoomFeed, generateMyBookingsFeed, generateParkFeed } from '../services/ical-feed.service';

const router = Router();

// Rate limit: calendar clients poll every 15–60 min, so 60 req/hour/IP is generous
const icalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Validate and resolve a raw token from the query string. */
async function resolveToken(rawToken: unknown) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length !== 64) {
    return null;
  }
  return CalendarTokenModel.findByRawToken(rawToken);
}

function icsResponse(res: Response, filename: string, content: string): void {
  res
    .set('Content-Type', 'text/calendar; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${filename}"`)
    .set('Cache-Control', 'no-store, no-cache, must-revalidate')
    .set('Pragma', 'no-cache')
    .send(content);
}

/**
 * GET /api/ical/room/:roomId?token=xxx
 *
 * ICS subscription feed for a room.
 * Auth: calendar feed token (scope=room, roomId must match).
 * Privacy: token owner's bookings show full titles; all others show "Booked".
 */
router.get('/room/:roomId', icalLimiter, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const calToken = await resolveToken(req.query.token);

    if (!calToken) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="Open Meeting ICS Feed"')
        .json({ error: 'Invalid or expired calendar token' });
      return;
    }

    if (calToken.scope !== 'room' || calToken.roomId !== roomId) {
      res.status(403).json({ error: 'Token not authorized for this room' });
      return;
    }

    const room = await RoomModel.findById(roomId);
    if (!room || !room.isActive) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Check if the calendar feed feature is enabled for this room and its park
    if (!room.calendarFeedEnabled) {
      res.status(410).json({ error: 'Calendar feed is disabled for this room' });
      return;
    }

    if (room.parkId) {
      const park = await ParkModel.findById(room.parkId);
      if (park && !park.calendarFeedEnabled) {
        res.status(410).json({ error: 'Calendar feed is disabled for this park' });
        return;
      }
    }

    const bookings = await BookingModel.findByRoomAllStatuses(roomId);
    const safeName = room.name.replace(/[^a-z0-9]/gi, '-');
    icsResponse(res, `${safeName}.ics`, generateRoomFeed(room, bookings, calToken.userId));
  } catch (error) {
    console.error('ICS room feed error:', error);
    res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

/**
 * GET /api/ical/my?token=xxx
 *
 * ICS subscription feed for the token owner's own bookings.
 * Auth: calendar feed token (scope=my_bookings).
 */
router.get('/my', icalLimiter, async (req: Request, res: Response) => {
  try {
    const calToken = await resolveToken(req.query.token);

    if (!calToken) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="Open Meeting ICS Feed"')
        .json({ error: 'Invalid or expired calendar token' });
      return;
    }

    if (calToken.scope !== 'my_bookings') {
      res.status(403).json({ error: 'Token not authorized for this feed' });
      return;
    }

    const user = await UserModel.findById(calToken.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid or expired calendar token' });
      return;
    }

    // Check park-level toggle (super_admin has no parkId, skip check)
    if (user.parkId) {
      const park = await ParkModel.findById(user.parkId);
      if (park && !park.calendarFeedEnabled) {
        res.status(410).json({ error: 'Calendar feed is disabled for this park' });
        return;
      }
    }

    const bookings = await BookingModel.findByUser(calToken.userId);

    // Build room map for location descriptions
    const uniqueRoomIds = [...new Set(bookings.map((b) => b.roomId))];
    const rooms = await Promise.all(uniqueRoomIds.map((id) => RoomModel.findById(id)));
    const roomMap = new Map(rooms.filter(Boolean).map((r) => [r!.id, r!]));

    icsResponse(res, 'my-bookings.ics', generateMyBookingsFeed(user.name, bookings, roomMap));
  } catch (error) {
    console.error('ICS my-bookings feed error:', error);
    res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

/**
 * GET /api/ical/park?token=xxx
 *
 * Aggregated ICS feed for all enabled rooms in the token owner's park.
 * Auth: calendar feed token (scope=park_rooms).
 * Privacy: token owner's bookings show full titles; all others show "Booked".
 */
router.get('/park', icalLimiter, async (req: Request, res: Response) => {
  try {
    const calToken = await resolveToken(req.query.token);

    if (!calToken) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="Open Meeting ICS Feed"')
        .json({ error: 'Invalid or expired calendar token' });
      return;
    }

    if (calToken.scope !== 'park_rooms') {
      res.status(403).json({ error: 'Token not authorized for this feed' });
      return;
    }

    const user = await UserModel.findById(calToken.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid or expired calendar token' });
      return;
    }

    if (!user.parkId) {
      res.status(403).json({ error: 'All-rooms feed not available for this account' });
      return;
    }

    const park = await ParkModel.findById(user.parkId);
    if (!park) {
      res.status(404).json({ error: 'Park not found' });
      return;
    }

    if (!park.calendarFeedEnabled) {
      res.status(410).json({ error: 'Calendar feed is disabled for this park' });
      return;
    }

    const allRooms = await RoomModel.findByPark(user.parkId);
    const enabledRooms = allRooms.filter(r => r.isActive && r.calendarFeedEnabled !== false);

    const bookingsByRoom = new Map<string, Booking[]>();
    await Promise.all(
      enabledRooms.map(async (room) => {
        const bookings = await BookingModel.findByRoomAllStatuses(room.id);
        bookingsByRoom.set(room.id, bookings);
      }),
    );

    icsResponse(res, 'all-rooms.ics', generateParkFeed(park.name, enabledRooms, bookingsByRoom, calToken.userId));
  } catch (error) {
    console.error('ICS park feed error:', error);
    res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

export default router;
