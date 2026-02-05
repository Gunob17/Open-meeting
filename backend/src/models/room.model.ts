import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { MeetingRoom, CreateRoomRequest } from '../types';

export class RoomModel {
  static create(data: CreateRoomRequest): MeetingRoom {
    const id = uuidv4();
    const now = new Date().toISOString();
    const defaultDurations = [30, 60, 90, 120];

    // Store locked company IDs as JSON array
    const lockedCompanyIds = data.lockedToCompanyIds && data.lockedToCompanyIds.length > 0
      ? JSON.stringify(data.lockedToCompanyIds)
      : null;

    const stmt = db.prepare(`
      INSERT INTO meeting_rooms (id, name, capacity, amenities, floor, address, description, is_active, park_id, opening_hour, closing_hour, locked_to_company_id, quick_book_durations, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.capacity,
      JSON.stringify(data.amenities),
      data.floor,
      data.address,
      data.description || '',
      1,
      data.parkId,
      data.openingHour ?? null,
      data.closingHour ?? null,
      lockedCompanyIds,
      JSON.stringify(data.quickBookDurations ?? defaultDurations),
      now,
      now
    );

    return this.findById(id)!;
  }

  static findById(id: string): MeetingRoom | null {
    const stmt = db.prepare('SELECT * FROM meeting_rooms WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToRoom(row);
  }

  static findAll(includeInactive = false, parkId?: string | null): MeetingRoom[] {
    let query = 'SELECT * FROM meeting_rooms WHERE 1=1';
    const params: any[] = [];

    if (!includeInactive) {
      query += ' AND is_active = 1';
    }

    if (parkId) {
      query += ' AND park_id = ?';
      params.push(parkId);
    }

    query += ' ORDER BY name';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(this.mapRowToRoom);
  }

  static findByPark(parkId: string, includeInactive = false): MeetingRoom[] {
    let query = 'SELECT * FROM meeting_rooms WHERE park_id = ?';
    if (!includeInactive) {
      query += ' AND is_active = 1';
    }
    query += ' ORDER BY name';

    const stmt = db.prepare(query);
    const rows = stmt.all(parkId) as any[];

    return rows.map(this.mapRowToRoom);
  }

  static update(id: string, data: Partial<CreateRoomRequest & { isActive?: boolean }>): MeetingRoom | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE meeting_rooms
      SET name = ?, capacity = ?, amenities = ?, floor = ?, address = ?, description = ?, is_active = ?,
          opening_hour = ?, closing_hour = ?, locked_to_company_id = ?, quick_book_durations = ?, updated_at = ?
      WHERE id = ?
    `);

    const amenities = data.amenities ? JSON.stringify(data.amenities) : existing.amenities;

    // Handle undefined vs null for optional fields
    const openingHour = data.openingHour !== undefined ? data.openingHour : existing.openingHour;
    const closingHour = data.closingHour !== undefined ? data.closingHour : existing.closingHour;

    // Handle locked company IDs - store as JSON array or null if empty
    let lockedCompanyIds: string | null;
    if (data.lockedToCompanyIds !== undefined) {
      lockedCompanyIds = data.lockedToCompanyIds && data.lockedToCompanyIds.length > 0
        ? JSON.stringify(data.lockedToCompanyIds)
        : null;
    } else {
      lockedCompanyIds = existing.lockedToCompanyIds.length > 0
        ? JSON.stringify(existing.lockedToCompanyIds)
        : null;
    }

    const quickBookDurations = data.quickBookDurations !== undefined ? JSON.stringify(data.quickBookDurations) : JSON.stringify(existing.quickBookDurations);

    stmt.run(
      data.name ?? existing.name,
      data.capacity ?? existing.capacity,
      amenities,
      data.floor ?? existing.floor,
      data.address ?? existing.address,
      data.description ?? existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      openingHour,
      closingHour,
      lockedCompanyIds,
      quickBookDurations,
      now,
      id
    );

    return this.findById(id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM meeting_rooms WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static deactivate(id: string): boolean {
    const stmt = db.prepare('UPDATE meeting_rooms SET is_active = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private static mapRowToRoom(row: any): MeetingRoom {
    const defaultDurations = [30, 60, 90, 120];
    let quickBookDurations = defaultDurations;
    try {
      quickBookDurations = row.quick_book_durations ? JSON.parse(row.quick_book_durations) : defaultDurations;
    } catch (e) {
      quickBookDurations = defaultDurations;
    }

    // Parse locked company IDs - handle both JSON array and legacy single ID
    let lockedToCompanyIds: string[] = [];
    if (row.locked_to_company_id) {
      try {
        // Try to parse as JSON array first
        const parsed = JSON.parse(row.locked_to_company_id);
        if (Array.isArray(parsed)) {
          lockedToCompanyIds = parsed;
        } else {
          // If parsed but not array, treat as single ID
          lockedToCompanyIds = [row.locked_to_company_id];
        }
      } catch (e) {
        // Not JSON, treat as legacy single company ID
        lockedToCompanyIds = [row.locked_to_company_id];
      }
    }

    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      amenities: row.amenities,
      floor: row.floor,
      address: row.address,
      description: row.description,
      isActive: row.is_active === 1,
      parkId: row.park_id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      lockedToCompanyIds: lockedToCompanyIds,
      quickBookDurations: quickBookDurations,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
