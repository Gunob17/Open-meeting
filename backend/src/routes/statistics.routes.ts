import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import { getDb } from '../models/database';

const router = Router();

// Parse date range from query params, making end date inclusive of the full day
function parseDateRange(startDate: string | undefined, endDate: string | undefined): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate as string) : new Date();
  const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  // If endDate is a date-only string (yyyy-MM-dd), add one day to include the full end date
  if (endDate && (endDate as string).length === 10) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

interface RoomStats {
  roomId: string;
  roomName: string;
  floor: string;
  capacity: number;
  amenities: string[];
  totalBookings: number;
  totalHoursBooked: number;
  utilizationRate: number; // percentage of available hours used
  averageBookingDuration: number; // in minutes
  uniqueBookers: number;
  cancellationCount: number;
}

interface HourlyStats {
  hour: number;
  bookingCount: number;
}

interface DailyStats {
  date: string;
  bookingCount: number;
  totalHours: number;
}

interface AmenityStats {
  amenity: string;
  roomCount: number;
  totalBookings: number;
  averageUtilization: number;
}

interface TopBooker {
  userId: string;
  companyName: string;
  bookingCount: number;
  totalHoursBooked: number;
}

// Get comprehensive room statistics
router.get('/rooms', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const { start, end } = parseDateRange(startDate as string | undefined, endDate as string | undefined);

    // Determine park filter
    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    // Get all rooms for the park
    const db = getDb();
    let roomsQuery = db('meeting_rooms').where('is_active', true);
    if (targetParkId) {
      roomsQuery = roomsQuery.andWhere('park_id', targetParkId);
    }
    const rooms = await roomsQuery;

    // Get bookings in date range
    let bookingsQuery = db('bookings as b')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select('b.*', 'r.park_id')
      .where('b.start_time', '>=', start.toISOString())
      .andWhere('b.start_time', '<', end.toISOString());
    if (targetParkId) {
      bookingsQuery = bookingsQuery.andWhere('r.park_id', targetParkId);
    }
    const bookings = await bookingsQuery;

    // Calculate stats for each room
    const roomStats: RoomStats[] = rooms.map(room => {
      const roomBookings = bookings.filter(b => b.room_id === room.id && b.status === 'confirmed');
      const cancelledBookings = bookings.filter(b => b.room_id === room.id && b.status === 'cancelled');

      // Calculate total hours booked
      const totalMinutesBooked = roomBookings.reduce((sum, b) => {
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60);
      }, 0);

      // Calculate available hours (assuming 10 hours per day, excluding weekends)
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const weekdays = Math.floor(days * 5 / 7); // Approximate weekdays
      const openingHour = room.opening_hour ?? 8;
      const closingHour = room.closing_hour ?? 18;
      const hoursPerDay = closingHour - openingHour;
      const availableHours = weekdays * hoursPerDay;

      // Unique bookers
      const uniqueBookerIds = new Set(roomBookings.map(b => b.user_id));

      // Parse amenities
      let amenities: string[] = [];
      try {
        amenities = JSON.parse(room.amenities);
      } catch (e) {
        amenities = [];
      }

      return {
        roomId: room.id,
        roomName: room.name,
        floor: room.floor,
        capacity: room.capacity,
        amenities,
        totalBookings: roomBookings.length,
        totalHoursBooked: Math.round(totalMinutesBooked / 60 * 10) / 10,
        utilizationRate: availableHours > 0 ? Math.round((totalMinutesBooked / 60) / availableHours * 100 * 10) / 10 : 0,
        averageBookingDuration: roomBookings.length > 0 ? Math.round(totalMinutesBooked / roomBookings.length) : 0,
        uniqueBookers: uniqueBookerIds.size,
        cancellationCount: cancelledBookings.length
      };
    });

    // Sort by utilization rate descending
    roomStats.sort((a, b) => b.utilizationRate - a.utilizationRate);

    res.json({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      rooms: roomStats,
      summary: {
        totalRooms: rooms.length,
        totalBookings: bookings.filter(b => b.status === 'confirmed').length,
        averageUtilization: roomStats.length > 0
          ? Math.round(roomStats.reduce((sum, r) => sum + r.utilizationRate, 0) / roomStats.length * 10) / 10
          : 0
      }
    });
  } catch (error) {
    console.error('Get room statistics error:', error);
    res.status(500).json({ error: 'Failed to get room statistics' });
  }
});

// Get hourly booking patterns
router.get('/hourly', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const { start, end } = parseDateRange(startDate as string | undefined, endDate as string | undefined);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    const db = getDb();
    let query = db('bookings as b')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select('b.start_time')
      .where('b.status', 'confirmed')
      .andWhere('b.start_time', '>=', start.toISOString())
      .andWhere('b.start_time', '<', end.toISOString());
    if (targetParkId) {
      query = query.andWhere('r.park_id', targetParkId);
    }

    const bookings = await query;

    // Count bookings by hour
    const hourlyCount: { [hour: number]: number } = {};
    for (let i = 0; i < 24; i++) {
      hourlyCount[i] = 0;
    }

    bookings.forEach(b => {
      const hour = new Date(b.start_time).getHours();
      hourlyCount[hour]++;
    });

    const hourlyStats: HourlyStats[] = Object.entries(hourlyCount).map(([hour, count]) => ({
      hour: parseInt(hour),
      bookingCount: count
    }));

    // Find peak hours
    const peakHour = hourlyStats.reduce((max, curr) =>
      curr.bookingCount > max.bookingCount ? curr : max, hourlyStats[0]);

    res.json({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      hourlyStats,
      peakHour: peakHour.hour,
      peakHourBookings: peakHour.bookingCount
    });
  } catch (error) {
    console.error('Get hourly statistics error:', error);
    res.status(500).json({ error: 'Failed to get hourly statistics' });
  }
});

// Get daily booking trends
router.get('/daily', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const { start, end } = parseDateRange(startDate as string | undefined, endDate as string | undefined);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    const db = getDb();
    let query = db('bookings as b')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select('b.*')
      .where('b.status', 'confirmed')
      .andWhere('b.start_time', '>=', start.toISOString())
      .andWhere('b.start_time', '<', end.toISOString());
    if (targetParkId) {
      query = query.andWhere('r.park_id', targetParkId);
    }

    const bookings = await query;

    // Group bookings by date
    const dailyData: { [date: string]: { count: number; hours: number } } = {};

    // Initialize all dates in range (end is exclusive, already +1 day from parseDateRange)
    const currentDate = new Date(start);
    while (currentDate < end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyData[dateStr] = { count: 0, hours: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    bookings.forEach(b => {
      const dateStr = new Date(b.start_time).toISOString().split('T')[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].count++;
        const duration = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60 * 60);
        dailyData[dateStr].hours += duration;
      }
    });

    const dailyStats: DailyStats[] = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        bookingCount: data.count,
        totalHours: Math.round(data.hours * 10) / 10
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      dailyStats,
      averageBookingsPerDay: dailyStats.length > 0
        ? Math.round(dailyStats.reduce((sum, d) => sum + d.bookingCount, 0) / dailyStats.length * 10) / 10
        : 0
    });
  } catch (error) {
    console.error('Get daily statistics error:', error);
    res.status(500).json({ error: 'Failed to get daily statistics' });
  }
});

// Get amenity popularity statistics
router.get('/amenities', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const { start, end } = parseDateRange(startDate as string | undefined, endDate as string | undefined);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    const db = getDb();

    // Get rooms with their amenities
    let roomsQuery = db('meeting_rooms').where('is_active', true);
    if (targetParkId) {
      roomsQuery = roomsQuery.andWhere('park_id', targetParkId);
    }
    const rooms = await roomsQuery;

    // Get bookings grouped by room
    let bookingsQuery = db('bookings as b')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select('b.room_id')
      .count('* as booking_count')
      .where('b.status', 'confirmed')
      .andWhere('b.start_time', '>=', start.toISOString())
      .andWhere('b.start_time', '<', end.toISOString());
    if (targetParkId) {
      bookingsQuery = bookingsQuery.andWhere('r.park_id', targetParkId);
    }
    const bookingCounts = await bookingsQuery.groupBy('b.room_id');
    const bookingCountMap = new Map(bookingCounts.map(b => [b.room_id, Number(b.booking_count)]));

    // Aggregate by amenity
    const amenityData: { [amenity: string]: { roomCount: number; totalBookings: number; rooms: any[] } } = {};

    rooms.forEach(room => {
      let amenities: string[] = [];
      try {
        amenities = JSON.parse(room.amenities);
      } catch (e) {
        amenities = [];
      }

      const bookingCount = bookingCountMap.get(room.id) || 0;

      amenities.forEach(amenity => {
        if (!amenityData[amenity]) {
          amenityData[amenity] = { roomCount: 0, totalBookings: 0, rooms: [] };
        }
        amenityData[amenity].roomCount++;
        amenityData[amenity].totalBookings += bookingCount;
        amenityData[amenity].rooms.push(room);
      });
    });

    const amenityStats: AmenityStats[] = Object.entries(amenityData)
      .map(([amenity, data]) => ({
        amenity,
        roomCount: data.roomCount,
        totalBookings: data.totalBookings,
        averageUtilization: data.roomCount > 0
          ? Math.round(data.totalBookings / data.roomCount * 10) / 10
          : 0
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings);

    res.json({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      amenityStats
    });
  } catch (error) {
    console.error('Get amenity statistics error:', error);
    res.status(500).json({ error: 'Failed to get amenity statistics' });
  }
});

// Get top bookers (replaces julianday() with JS duration computation for portability)
router.get('/top-bookers', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId, limit } = req.query;

    const { start, end } = parseDateRange(startDate as string | undefined, endDate as string | undefined);
    const resultLimit = Math.min(parseInt(limit as string) || 10, 50);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    const db = getDb();

    // Fetch bookings with user and company info
    let query = db('bookings as b')
      .join('users as u', 'b.user_id', 'u.id')
      .join('companies as c', 'u.company_id', 'c.id')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select(
        'u.id as user_id',
        'c.name as company_name',
        'b.start_time',
        'b.end_time'
      )
      .where('b.status', 'confirmed')
      .andWhere('b.start_time', '>=', start.toISOString())
      .andWhere('b.start_time', '<', end.toISOString());

    if (targetParkId) {
      query = query.andWhere('r.park_id', targetParkId);
    }

    const bookings = await query;

    // Aggregate in JavaScript (portable replacement for SQL GROUP BY + julianday)
    const userMap = new Map<string, {
      userId: string;
      companyName: string;
      bookingCount: number;
      totalHours: number;
    }>();

    bookings.forEach(b => {
      const existing = userMap.get(b.user_id);
      const hours = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60 * 60);
      if (existing) {
        existing.bookingCount++;
        existing.totalHours += hours;
      } else {
        userMap.set(b.user_id, {
          userId: b.user_id,
          companyName: b.company_name,
          bookingCount: 1,
          totalHours: hours,
        });
      }
    });

    const result: TopBooker[] = Array.from(userMap.values())
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, resultLimit)
      .map(b => ({
        userId: b.userId,
        companyName: b.companyName,
        bookingCount: b.bookingCount,
        totalHoursBooked: Math.round(b.totalHours * 10) / 10
      }));

    res.json({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      topBookers: result
    });
  } catch (error) {
    console.error('Get top bookers error:', error);
    res.status(500).json({ error: 'Failed to get top bookers' });
  }
});

// Get summary dashboard statistics
router.get('/summary', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { parkId } = req.query;

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // This week stats (Monday to Sunday)
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // This month stats
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const db = getDb();

    const getBookingCount = async (start: Date, end: Date): Promise<number> => {
      let query = db('bookings as b')
        .join('meeting_rooms as r', 'b.room_id', 'r.id')
        .count('* as count')
        .where('b.status', 'confirmed')
        .andWhere('b.start_time', '>=', start.toISOString())
        .andWhere('b.start_time', '<', end.toISOString());
      if (targetParkId) {
        query = query.andWhere('r.park_id', targetParkId);
      }
      const result = await query.first();
      return Number(result?.count || 0);
    };

    // Get room and user counts
    let roomCountQuery = db('meeting_rooms').where('is_active', true).count('* as count');
    if (targetParkId) {
      roomCountQuery = roomCountQuery.andWhere('park_id', targetParkId);
    }

    let userCountQuery = db('users as u')
      .join('companies as c', 'u.company_id', 'c.id')
      .countDistinct('u.id as count');
    if (targetParkId) {
      userCountQuery = userCountQuery.where('c.park_id', targetParkId);
    }

    const [todayCount, weekCount, monthCount, roomCountResult, userCountResult] = await Promise.all([
      getBookingCount(today, tomorrow),
      getBookingCount(weekStart, weekEnd),
      getBookingCount(monthStart, monthEnd),
      roomCountQuery.first(),
      userCountQuery.first(),
    ]);

    res.json({
      today: {
        bookings: todayCount
      },
      thisWeek: {
        bookings: weekCount
      },
      thisMonth: {
        bookings: monthCount
      },
      totals: {
        activeRooms: Number(roomCountResult?.count || 0),
        activeUsers: Number(userCountResult?.count || 0)
      }
    });
  } catch (error) {
    console.error('Get summary statistics error:', error);
    res.status(500).json({ error: 'Failed to get summary statistics' });
  }
});

export default router;
