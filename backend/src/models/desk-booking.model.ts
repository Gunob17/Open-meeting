import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { DeskBooking, DeskBookingStatus, DeskBookingWithDetails, DeskQuotaType } from '../types';
import { DeskModel } from './desk.model';
import { UserModel } from './user.model';
// Note: DeskModel is still used for findByIdWithDetails and findByUser

export class DeskBookingModel {
  static async create(deskId: string, userId: string, bookingDate: string): Promise<DeskBooking> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('desk_bookings').insert({
      id,
      desk_id: deskId,
      user_id: userId,
      booking_date: bookingDate,
      status: DeskBookingStatus.CONFIRMED,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<DeskBooking | null> {
    const db = getDb();
    const row = await db('desk_bookings').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  static async findByIdWithDetails(id: string): Promise<DeskBookingWithDetails | null> {
    const booking = await this.findById(id);
    if (!booking) return null;

    const desk = await DeskModel.findById(booking.deskId);
    const user = await UserModel.findById(booking.userId);

    return {
      ...booking,
      desk: desk ?? undefined,
      user: user ? (({ password: _p, ...rest }) => rest)(user) as Omit<typeof user, 'password'> : undefined,
    };
  }

  /** All confirmed bookings for a specific desk within a date range. */
  static async findByDesk(
    deskId: string,
    startDate?: string,
    endDate?: string
  ): Promise<DeskBooking[]> {
    const db = getDb();
    let query = db('desk_bookings')
      .where('desk_id', deskId)
      .andWhere('status', DeskBookingStatus.CONFIRMED);

    if (startDate) query = query.andWhere('booking_date', '>=', startDate);
    if (endDate) query = query.andWhere('booking_date', '<=', endDate);

    const rows = await query.orderBy('booking_date');
    return rows.map(this.mapRow);
  }

  /** All desk bookings for a user (all desks, all statuses). */
  static async findByUser(userId: string): Promise<DeskBookingWithDetails[]> {
    const db = getDb();
    const rows = await db('desk_bookings')
      .where('user_id', userId)
      .orderBy('booking_date', 'desc');

    const results: DeskBookingWithDetails[] = [];
    for (const row of rows) {
      const booking = this.mapRow(row);
      const desk = await DeskModel.findById(booking.deskId);
      results.push({ ...booking, desk: desk ?? undefined });
    }
    return results;
  }

  /** All confirmed bookings across a park's desks within an optional date range. */
  static async findByPark(
    parkId: string,
    startDate?: string,
    endDate?: string
  ): Promise<DeskBookingWithDetails[]> {
    const db = getDb();
    let query = db('desk_bookings as db')
      .join('desks as d', 'db.desk_id', 'd.id')
      .where('d.park_id', parkId)
      .andWhere('db.status', DeskBookingStatus.CONFIRMED);

    if (startDate) query = query.andWhere('db.booking_date', '>=', startDate);
    if (endDate) query = query.andWhere('db.booking_date', '<=', endDate);

    const rows = await query.select('db.*').orderBy('db.booking_date');

    const results: DeskBookingWithDetails[] = [];
    for (const row of rows) {
      const booking = this.mapRow(row);
      const desk = await DeskModel.findById(booking.deskId);
      const user = await UserModel.findById(booking.userId);
      results.push({
        ...booking,
        desk: desk ?? undefined,
        user: user ? (({ password: _p, ...rest }) => rest)(user) as Omit<typeof user, 'password'> : undefined,
      });
    }
    return results;
  }

  static async cancel(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('desk_bookings').where('id', id).update({
      status: DeskBookingStatus.CANCELLED,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('desk_bookings').where('id', id).del();
    return count > 0;
  }

  /**
   * Returns true if the user already has a CONFIRMED booking for this desk on this date.
   * Cancelled bookings do not block re-booking.
   */
  static async checkDuplicate(
    deskId: string,
    userId: string,
    bookingDate: string
  ): Promise<boolean> {
    const db = getDb();
    const result = await db('desk_bookings')
      .where('desk_id', deskId)
      .andWhere('user_id', userId)
      .andWhere('booking_date', bookingDate)
      .andWhere('status', DeskBookingStatus.CONFIRMED)
      .count('* as count')
      .first();
    return Number(result?.count ?? 0) > 0;
  }

  /**
   * Count confirmed desk-days used in a calendar month, scoped to a park.
   * - per_user: bookings by this user across all desks in the park
   * - per_company: bookings by all users in the same company across all desks in the park
   * month = 'YYYY-MM'
   */
  static async countMonthlyUsage(
    parkId: string,
    userId: string,
    companyId: string,
    month: string,
    quotaType: DeskQuotaType
  ): Promise<number> {
    const db = getDb();
    const startDate = `${month}-01`;
    const endDate = `${month}-99`;

    if (quotaType === 'per_user') {
      const result = await db('desk_bookings as db')
        .join('desks as d', 'db.desk_id', 'd.id')
        .where('d.park_id', parkId)
        .andWhere('db.user_id', userId)
        .andWhere('db.status', DeskBookingStatus.CONFIRMED)
        .andWhere('db.booking_date', '>=', startDate)
        .andWhere('db.booking_date', '<=', endDate)
        .count('db.id as count')
        .first();
      return Number(result?.count ?? 0);
    } else {
      const result = await db('desk_bookings as db')
        .join('desks as d', 'db.desk_id', 'd.id')
        .join('users as u', 'db.user_id', 'u.id')
        .where('d.park_id', parkId)
        .andWhere('u.company_id', companyId)
        .andWhere('db.status', DeskBookingStatus.CONFIRMED)
        .andWhere('db.booking_date', '>=', startDate)
        .andWhere('db.booking_date', '<=', endDate)
        .count('db.id as count')
        .first();
      return Number(result?.count ?? 0);
    }
  }

  static mapRow(row: any): DeskBooking {
    return {
      id: row.id,
      deskId: row.desk_id,
      userId: row.user_id,
      bookingDate: row.booking_date,
      status: row.status as DeskBookingStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
