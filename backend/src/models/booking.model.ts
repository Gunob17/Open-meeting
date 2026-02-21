import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { Booking, BookingStatus, CreateBookingRequest, BookingWithDetails } from '../types';
import { RoomModel } from './room.model';
import { UserModel } from './user.model';

export class BookingModel {
  static async create(data: CreateBookingRequest, userId: string): Promise<Booking> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('bookings').insert({
      id,
      room_id: data.roomId,
      user_id: userId,
      title: data.title,
      description: data.description || '',
      start_time: data.startTime,
      end_time: data.endTime,
      attendees: JSON.stringify(data.attendees || []),
      external_guests: JSON.stringify(data.externalGuests || []),
      status: BookingStatus.CONFIRMED,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Booking | null> {
    const db = getDb();
    const row = await db('bookings').where('id', id).first();
    if (!row) return null;
    return this.mapRowToBooking(row);
  }

  static async findByIdWithDetails(id: string): Promise<BookingWithDetails | null> {
    const booking = await this.findById(id);
    if (!booking) return null;

    const room = await RoomModel.findById(booking.roomId);
    const user = await UserModel.findById(booking.userId);

    return {
      ...booking,
      room: room || undefined,
      user: user ? { ...user, password: undefined } as any : undefined,
    };
  }

  static async findByRoom(roomId: string, startDate?: string, endDate?: string): Promise<Booking[]> {
    const db = getDb();
    let query = db('bookings')
      .where('room_id', roomId)
      .andWhere('status', BookingStatus.CONFIRMED);

    if (startDate && endDate) {
      query = query.andWhere(function () {
        this.where(function () {
          this.where('start_time', '>=', startDate).andWhere('start_time', '<', endDate);
        })
          .orWhere(function () {
            this.where('end_time', '>', startDate).andWhere('end_time', '<=', endDate);
          })
          .orWhere(function () {
            this.where('start_time', '<=', startDate).andWhere('end_time', '>=', endDate);
          });
      });
    }

    const rows = await query.orderBy('start_time');
    return rows.map(this.mapRowToBooking);
  }

  static async findByUser(userId: string): Promise<Booking[]> {
    const db = getDb();
    const rows = await db('bookings').where('user_id', userId).orderBy('start_time', 'desc');
    return rows.map(this.mapRowToBooking);
  }

  static async findAll(startDate?: string, endDate?: string): Promise<BookingWithDetails[]> {
    const db = getDb();
    let query = db('bookings').where('status', BookingStatus.CONFIRMED);

    if (startDate && endDate) {
      query = query.andWhere('start_time', '>=', startDate).andWhere('end_time', '<=', endDate);
    }

    const rows = await query.orderBy('start_time');

    const results: BookingWithDetails[] = [];
    for (const row of rows) {
      const booking = this.mapRowToBooking(row);
      const room = await RoomModel.findById(booking.roomId);
      const user = await UserModel.findById(booking.userId);
      results.push({
        ...booking,
        room: room || undefined,
        user: user ? { ...user, password: undefined } as any : undefined,
      });
    }
    return results;
  }

  static async findAllByDateRange(startDate: string, endDate: string): Promise<BookingWithDetails[]> {
    const db = getDb();
    const rows = await db('bookings')
      .where('status', BookingStatus.CONFIRMED)
      .andWhere(function () {
        this.where(function () {
          this.where('start_time', '>=', startDate).andWhere('start_time', '<', endDate);
        })
          .orWhere(function () {
            this.where('end_time', '>', startDate).andWhere('end_time', '<=', endDate);
          })
          .orWhere(function () {
            this.where('start_time', '<=', startDate).andWhere('end_time', '>=', endDate);
          });
      })
      .orderBy('start_time');

    const results: BookingWithDetails[] = [];
    for (const row of rows) {
      const booking = this.mapRowToBooking(row);
      const room = await RoomModel.findById(booking.roomId);
      const user = await UserModel.findById(booking.userId);
      results.push({
        ...booking,
        room: room || undefined,
        user: user ? { ...user, password: undefined } as any : undefined,
      });
    }
    return results;
  }

  static async checkConflict(roomId: string, startTime: string, endTime: string, excludeBookingId?: string): Promise<boolean> {
    const db = getDb();
    let query = db('bookings')
      .where('room_id', roomId)
      .andWhere('status', BookingStatus.CONFIRMED)
      .andWhere(function () {
        this.where(function () {
          this.where('start_time', '<', endTime).andWhere('end_time', '>', startTime);
        })
          .orWhere(function () {
            this.where('start_time', '>=', startTime).andWhere('start_time', '<', endTime);
          })
          .orWhere(function () {
            this.where('end_time', '>', startTime).andWhere('end_time', '<=', endTime);
          });
      });

    if (excludeBookingId) {
      query = query.andWhereNot('id', excludeBookingId);
    }

    const result = await query.count('* as count').first();
    return Number(result?.count || 0) > 0;
  }

  static async update(id: string, data: Partial<CreateBookingRequest> & { roomId?: string }): Promise<Booking | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    await db('bookings').where('id', id).update({
      room_id: data.roomId ?? existing.roomId,
      title: data.title ?? existing.title,
      description: data.description ?? existing.description,
      start_time: data.startTime ?? existing.startTime,
      end_time: data.endTime ?? existing.endTime,
      attendees: data.attendees ? JSON.stringify(data.attendees) : existing.attendees,
      external_guests: data.externalGuests ? JSON.stringify(data.externalGuests) : existing.externalGuests,
      updated_at: now,
    });

    return this.findById(id);
  }

  static async cancel(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('bookings').where('id', id).update({
      status: BookingStatus.CANCELLED,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('bookings').where('id', id).del();
    return count > 0;
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
      externalGuests: row.external_guests || '[]',
      status: row.status as BookingStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
