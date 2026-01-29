import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { Booking, BookingStatus, CreateBookingRequest, BookingWithDetails } from '../types';
import { RoomModel } from './room.model';
import { UserModel } from './user.model';

export class BookingModel {
  static create(data: CreateBookingRequest, userId: string): Booking {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO bookings (id, room_id, user_id, title, description, start_time, end_time, attendees, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.roomId,
      userId,
      data.title,
      data.description || '',
      data.startTime,
      data.endTime,
      JSON.stringify(data.attendees || []),
      BookingStatus.CONFIRMED,
      now,
      now
    );

    return this.findById(id)!;
  }

  static findById(id: string): Booking | null {
    const stmt = db.prepare('SELECT * FROM bookings WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToBooking(row);
  }

  static findByIdWithDetails(id: string): BookingWithDetails | null {
    const booking = this.findById(id);
    if (!booking) return null;

    const room = RoomModel.findById(booking.roomId);
    const user = UserModel.findById(booking.userId);

    return {
      ...booking,
      room: room || undefined,
      user: user ? { ...user, password: undefined } as any : undefined
    };
  }

  static findByRoom(roomId: string, startDate?: string, endDate?: string): Booking[] {
    let query = 'SELECT * FROM bookings WHERE room_id = ? AND status = ?';
    const params: any[] = [roomId, BookingStatus.CONFIRMED];

    if (startDate && endDate) {
      query += ' AND ((start_time >= ? AND start_time < ?) OR (end_time > ? AND end_time <= ?) OR (start_time <= ? AND end_time >= ?))';
      params.push(startDate, endDate, startDate, endDate, startDate, endDate);
    }

    query += ' ORDER BY start_time';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(this.mapRowToBooking);
  }

  static findByUser(userId: string): Booking[] {
    const stmt = db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY start_time DESC');
    const rows = stmt.all(userId) as any[];

    return rows.map(this.mapRowToBooking);
  }

  static findAll(startDate?: string, endDate?: string): BookingWithDetails[] {
    let query = 'SELECT * FROM bookings WHERE status = ?';
    const params: any[] = [BookingStatus.CONFIRMED];

    if (startDate && endDate) {
      query += ' AND start_time >= ? AND end_time <= ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY start_time';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => {
      const booking = this.mapRowToBooking(row);
      const room = RoomModel.findById(booking.roomId);
      const user = UserModel.findById(booking.userId);

      return {
        ...booking,
        room: room || undefined,
        user: user ? { ...user, password: undefined } as any : undefined
      };
    });
  }

  static findAllByDateRange(startDate: string, endDate: string): BookingWithDetails[] {
    const query = `
      SELECT * FROM bookings
      WHERE status = ?
      AND (
        (start_time >= ? AND start_time < ?)
        OR (end_time > ? AND end_time <= ?)
        OR (start_time <= ? AND end_time >= ?)
      )
      ORDER BY start_time
    `;

    const stmt = db.prepare(query);
    const rows = stmt.all(
      BookingStatus.CONFIRMED,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate
    ) as any[];

    return rows.map(row => {
      const booking = this.mapRowToBooking(row);
      const room = RoomModel.findById(booking.roomId);
      const user = UserModel.findById(booking.userId);

      return {
        ...booking,
        room: room || undefined,
        user: user ? { ...user, password: undefined } as any : undefined
      };
    });
  }

  static checkConflict(roomId: string, startTime: string, endTime: string, excludeBookingId?: string): boolean {
    let query = `
      SELECT COUNT(*) as count FROM bookings
      WHERE room_id = ?
      AND status = ?
      AND (
        (start_time < ? AND end_time > ?)
        OR (start_time >= ? AND start_time < ?)
        OR (end_time > ? AND end_time <= ?)
      )
    `;

    const params: any[] = [roomId, BookingStatus.CONFIRMED, endTime, startTime, startTime, endTime, startTime, endTime];

    if (excludeBookingId) {
      query += ' AND id != ?';
      params.push(excludeBookingId);
    }

    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count > 0;
  }

  static update(id: string, data: Partial<CreateBookingRequest> & { roomId?: string }): Booking | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE bookings
      SET room_id = ?, title = ?, description = ?, start_time = ?, end_time = ?, attendees = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.roomId ?? existing.roomId,
      data.title ?? existing.title,
      data.description ?? existing.description,
      data.startTime ?? existing.startTime,
      data.endTime ?? existing.endTime,
      data.attendees ? JSON.stringify(data.attendees) : existing.attendees,
      now,
      id
    );

    return this.findById(id);
  }

  static cancel(id: string): boolean {
    const stmt = db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?');
    const result = stmt.run(BookingStatus.CANCELLED, new Date().toISOString(), id);
    return result.changes > 0;
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM bookings WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private static mapRowToBooking(row: any): Booking {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      startTime: row.start_time,
      endTime: row.end_time,
      attendees: row.attendees,
      status: row.status as BookingStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
