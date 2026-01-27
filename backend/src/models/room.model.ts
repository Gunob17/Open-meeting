import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { MeetingRoom, CreateRoomRequest } from '../types';

export class RoomModel {
  static create(data: CreateRoomRequest): MeetingRoom {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO meeting_rooms (id, name, capacity, amenities, floor, address, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  static findAll(includeInactive = false): MeetingRoom[] {
    let query = 'SELECT * FROM meeting_rooms';
    if (!includeInactive) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY name';

    const stmt = db.prepare(query);
    const rows = stmt.all() as any[];

    return rows.map(this.mapRowToRoom);
  }

  static update(id: string, data: Partial<CreateRoomRequest & { isActive?: boolean }>): MeetingRoom | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE meeting_rooms
      SET name = ?, capacity = ?, amenities = ?, floor = ?, address = ?, description = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);

    const amenities = data.amenities ? JSON.stringify(data.amenities) : existing.amenities;

    stmt.run(
      data.name ?? existing.name,
      data.capacity ?? existing.capacity,
      amenities,
      data.floor ?? existing.floor,
      data.address ?? existing.address,
      data.description ?? existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
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
    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      amenities: row.amenities,
      floor: row.floor,
      address: row.address,
      description: row.description,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
