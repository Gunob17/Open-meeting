import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { GuestVisit, GuestVisitWithDetails } from '../types';

export class GuestVisitModel {
  static async findByBookingId(bookingId: string): Promise<GuestVisit[]> {
    const db = getDb();
    const rows = await db('guest_visits').where('booking_id', bookingId);
    return rows.map(this.mapRow);
  }

  static async findByDateAndPark(date: string, parkId: string): Promise<GuestVisitWithDetails[]> {
    const db = getDb();
    const rows = await db('guest_visits as gv')
      .join('bookings as b', 'gv.booking_id', 'b.id')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .join('users as u', 'b.user_id', 'u.id')
      .join('companies as c', 'u.company_id', 'c.id')
      .select(
        'gv.*',
        'b.title as booking_title',
        'b.end_time as booking_end_time',
        'r.name as room_name',
        'r.closing_hour as room_closing_hour',
        'u.name as organizer_name',
        'c.name as organizer_company'
      )
      .where('r.park_id', parkId)
      .andWhere('gv.expected_arrival', 'like', `${date}%`)
      .orderBy('gv.expected_arrival');

    return rows.map((row: any) => ({
      ...this.mapRow(row),
      bookingTitle: row.booking_title,
      bookingEndTime: row.booking_end_time,
      roomName: row.room_name,
      roomClosingHour: row.room_closing_hour ?? null,
      organizerName: row.organizer_name,
      organizerCompany: row.organizer_company,
    }));
  }

  static async ensureVisitsForDate(date: string, parkId: string): Promise<void> {
    const db = getDb();
    const bookings = await db('bookings as b')
      .join('meeting_rooms as r', 'b.room_id', 'r.id')
      .select('b.id', 'b.external_guests', 'b.start_time')
      .where('b.status', 'confirmed')
      .andWhere('r.park_id', parkId)
      .andWhere('b.start_time', 'like', `${date}%`);

    const now = new Date().toISOString();

    for (const booking of bookings) {
      let guests: Array<{ name: string; email?: string; company?: string }> = [];
      try {
        guests = JSON.parse(booking.external_guests || '[]');
      } catch { continue; }

      if (guests.length === 0) continue;

      const existing = await db('guest_visits')
        .where('booking_id', booking.id)
        .select('guest_name', 'guest_email');

      for (const guest of guests) {
        const alreadyExists = existing.some(
          (e: any) => e.guest_name === guest.name && (e.guest_email || null) === (guest.email || null)
        );
        if (!alreadyExists) {
          await db('guest_visits').insert({
            id: uuidv4(),
            booking_id: booking.id,
            guest_name: guest.name,
            guest_email: guest.email || null,
            guest_company: guest.company || null,
            expected_arrival: booking.start_time,
            checked_in_at: null,
            checked_out_at: null,
            checked_in_by: null,
            checked_out_by: null,
            created_at: now,
          });
        }
      }
    }
  }

  static async checkIn(id: string, userId: string): Promise<GuestVisit | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const count = await db('guest_visits')
      .where('id', id)
      .whereNull('checked_in_at')
      .update({
        checked_in_at: now,
        checked_in_by: userId,
      });
    if (count === 0) return null;
    const row = await db('guest_visits').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  static async checkOut(id: string, userId: string): Promise<GuestVisit | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const count = await db('guest_visits')
      .where('id', id)
      .whereNotNull('checked_in_at')
      .whereNull('checked_out_at')
      .update({
        checked_out_at: now,
        checked_out_by: userId,
      });
    if (count === 0) return null;
    const row = await db('guest_visits').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  static async undoCheckIn(id: string): Promise<GuestVisit | null> {
    const db = getDb();
    const count = await db('guest_visits').where('id', id).update({
      checked_in_at: null,
      checked_in_by: null,
      checked_out_at: null,
      checked_out_by: null,
    });
    if (count === 0) return null;
    const row = await db('guest_visits').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  private static mapRow(row: any): GuestVisit {
    return {
      id: row.id,
      bookingId: row.booking_id,
      guestName: row.guest_name,
      guestEmail: row.guest_email || null,
      guestCompany: row.guest_company || null,
      expectedArrival: row.expected_arrival,
      checkedInAt: row.checked_in_at || null,
      checkedOutAt: row.checked_out_at || null,
      checkedInBy: row.checked_in_by || null,
      checkedOutBy: row.checked_out_by || null,
      createdAt: row.created_at,
    };
  }
}
