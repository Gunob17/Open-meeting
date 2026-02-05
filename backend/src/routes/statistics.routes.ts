import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import db from '../models/database';

const router = Router();

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
  userName: string;
  userEmail: string;
  companyName: string;
  bookingCount: number;
  totalHoursBooked: number;
}

// Get comprehensive room statistics
router.get('/rooms', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    // Default to last 30 days if no date range specified
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Determine park filter
    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    // Get all rooms for the park
    let roomsQuery = 'SELECT * FROM rooms WHERE is_active = 1';
    const roomParams: any[] = [];
    if (targetParkId) {
      roomsQuery += ' AND park_id = ?';
      roomParams.push(targetParkId);
    }

    const rooms = db.prepare(roomsQuery).all(...roomParams) as any[];

    // Get bookings in date range
    let bookingsQuery = `
      SELECT b.*, r.park_id FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.start_time >= ? AND b.end_time <= ?
    `;
    const bookingParams: any[] = [start.toISOString(), end.toISOString()];
    if (targetParkId) {
      bookingsQuery += ' AND r.park_id = ?';
      bookingParams.push(targetParkId);
    }

    const bookings = db.prepare(bookingsQuery).all(...bookingParams) as any[];

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
router.get('/hourly', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    let query = `
      SELECT b.start_time FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.status = 'confirmed' AND b.start_time >= ? AND b.end_time <= ?
    `;
    const params: any[] = [start.toISOString(), end.toISOString()];
    if (targetParkId) {
      query += ' AND r.park_id = ?';
      params.push(targetParkId);
    }

    const bookings = db.prepare(query).all(...params) as any[];

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
router.get('/daily', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    let query = `
      SELECT b.* FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.status = 'confirmed' AND b.start_time >= ? AND b.end_time <= ?
    `;
    const params: any[] = [start.toISOString(), end.toISOString()];
    if (targetParkId) {
      query += ' AND r.park_id = ?';
      params.push(targetParkId);
    }

    const bookings = db.prepare(query).all(...params) as any[];

    // Group bookings by date
    const dailyData: { [date: string]: { count: number; hours: number } } = {};

    // Initialize all dates in range
    const currentDate = new Date(start);
    while (currentDate <= end) {
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
router.get('/amenities', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    // Get rooms with their amenities
    let roomsQuery = 'SELECT * FROM rooms WHERE is_active = 1';
    const roomParams: any[] = [];
    if (targetParkId) {
      roomsQuery += ' AND park_id = ?';
      roomParams.push(targetParkId);
    }
    const rooms = db.prepare(roomsQuery).all(...roomParams) as any[];

    // Get bookings
    let bookingsQuery = `
      SELECT b.room_id, COUNT(*) as booking_count FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.status = 'confirmed' AND b.start_time >= ? AND b.end_time <= ?
    `;
    const bookingParams: any[] = [start.toISOString(), end.toISOString()];
    if (targetParkId) {
      bookingsQuery += ' AND r.park_id = ?';
      bookingParams.push(targetParkId);
    }
    bookingsQuery += ' GROUP BY b.room_id';

    const bookingCounts = db.prepare(bookingsQuery).all(...bookingParams) as any[];
    const bookingCountMap = new Map(bookingCounts.map(b => [b.room_id, b.booking_count]));

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

// Get top bookers
router.get('/top-bookers', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, parkId, limit } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const resultLimit = Math.min(parseInt(limit as string) || 10, 50);

    let targetParkId: string | null = null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      targetParkId = (parkId as string) || null;
    } else {
      targetParkId = req.user?.parkId || null;
    }

    let query = `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        c.name as company_name,
        COUNT(b.id) as booking_count,
        SUM((julianday(b.end_time) - julianday(b.start_time)) * 24) as total_hours
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN companies c ON u.company_id = c.id
      JOIN rooms r ON b.room_id = r.id
      WHERE b.status = 'confirmed'
        AND b.start_time >= ?
        AND b.end_time <= ?
    `;
    const params: any[] = [start.toISOString(), end.toISOString()];

    if (targetParkId) {
      query += ' AND r.park_id = ?';
      params.push(targetParkId);
    }

    query += ` GROUP BY u.id ORDER BY booking_count DESC LIMIT ?`;
    params.push(resultLimit);

    const topBookers = db.prepare(query).all(...params) as any[];

    const result: TopBooker[] = topBookers.map(b => ({
      userId: b.user_id,
      userName: b.user_name,
      userEmail: b.user_email,
      companyName: b.company_name,
      bookingCount: b.booking_count,
      totalHoursBooked: Math.round(b.total_hours * 10) / 10
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
router.get('/summary', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
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

    const getBookingCount = (start: Date, end: Date): number => {
      let query = `
        SELECT COUNT(*) as count FROM bookings b
        JOIN rooms r ON b.room_id = r.id
        WHERE b.status = 'confirmed' AND b.start_time >= ? AND b.start_time < ?
      `;
      const params: any[] = [start.toISOString(), end.toISOString()];
      if (targetParkId) {
        query += ' AND r.park_id = ?';
        params.push(targetParkId);
      }
      const result = db.prepare(query).get(...params) as { count: number };
      return result.count;
    };

    // Get room and user counts
    let roomCountQuery = 'SELECT COUNT(*) as count FROM rooms WHERE is_active = 1';
    let userCountQuery = `
      SELECT COUNT(DISTINCT u.id) as count FROM users u
      JOIN companies c ON u.company_id = c.id
    `;
    const roomParams: any[] = [];
    const userParams: any[] = [];

    if (targetParkId) {
      roomCountQuery += ' AND park_id = ?';
      roomParams.push(targetParkId);
      userCountQuery += ' WHERE c.park_id = ?';
      userParams.push(targetParkId);
    }

    const roomCount = (db.prepare(roomCountQuery).get(...roomParams) as { count: number }).count;
    const userCount = (db.prepare(userCountQuery).get(...userParams) as { count: number }).count;

    res.json({
      today: {
        bookings: getBookingCount(today, tomorrow)
      },
      thisWeek: {
        bookings: getBookingCount(weekStart, weekEnd)
      },
      thisMonth: {
        bookings: getBookingCount(monthStart, monthEnd)
      },
      totals: {
        activeRooms: roomCount,
        activeUsers: userCount
      }
    });
  } catch (error) {
    console.error('Get summary statistics error:', error);
    res.status(500).json({ error: 'Failed to get summary statistics' });
  }
});

export default router;
