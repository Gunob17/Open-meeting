import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from './database';
import { Device, DeviceWithRoom, CreateDeviceRequest, MeetingRoom } from '../types';

export class DeviceModel {
  // Generate a secure random token for device authentication
  private static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static create(data: CreateDeviceRequest): Device {
    const id = uuidv4();
    const token = this.generateToken();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO devices (id, name, token, room_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, token, data.roomId, 1, now, now);

    return this.findById(id)!;
  }

  static findById(id: string): Device | null {
    const stmt = db.prepare('SELECT * FROM devices WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToDevice(row);
  }

  static findByToken(token: string): Device | null {
    const stmt = db.prepare('SELECT * FROM devices WHERE token = ? AND is_active = 1');
    const row = stmt.get(token) as any;

    if (!row) return null;

    return this.mapRowToDevice(row);
  }

  static findByIdWithRoom(id: string): DeviceWithRoom | null {
    const stmt = db.prepare(`
      SELECT d.*,
             r.id as room_id, r.name as room_name, r.capacity as room_capacity,
             r.amenities as room_amenities, r.floor as room_floor, r.address as room_address,
             r.description as room_description, r.is_active as room_is_active,
             r.opening_hour as room_opening_hour, r.closing_hour as room_closing_hour,
             r.locked_to_company_id as room_locked_to_company_id,
             r.created_at as room_created_at, r.updated_at as room_updated_at
      FROM devices d
      LEFT JOIN meeting_rooms r ON d.room_id = r.id
      WHERE d.id = ?
    `);
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToDeviceWithRoom(row);
  }

  static findByTokenWithRoom(token: string): DeviceWithRoom | null {
    const stmt = db.prepare(`
      SELECT d.*,
             r.id as room_id, r.name as room_name, r.capacity as room_capacity,
             r.amenities as room_amenities, r.floor as room_floor, r.address as room_address,
             r.description as room_description, r.is_active as room_is_active,
             r.opening_hour as room_opening_hour, r.closing_hour as room_closing_hour,
             r.locked_to_company_id as room_locked_to_company_id,
             r.created_at as room_created_at, r.updated_at as room_updated_at
      FROM devices d
      LEFT JOIN meeting_rooms r ON d.room_id = r.id
      WHERE d.token = ? AND d.is_active = 1
    `);
    const row = stmt.get(token) as any;

    if (!row) return null;

    return this.mapRowToDeviceWithRoom(row);
  }

  static findAll(includeInactive = false): DeviceWithRoom[] {
    let query = `
      SELECT d.*,
             r.id as room_id, r.name as room_name, r.capacity as room_capacity,
             r.amenities as room_amenities, r.floor as room_floor, r.address as room_address,
             r.description as room_description, r.is_active as room_is_active,
             r.opening_hour as room_opening_hour, r.closing_hour as room_closing_hour,
             r.locked_to_company_id as room_locked_to_company_id,
             r.created_at as room_created_at, r.updated_at as room_updated_at
      FROM devices d
      LEFT JOIN meeting_rooms r ON d.room_id = r.id
    `;

    if (!includeInactive) {
      query += ' WHERE d.is_active = 1';
    }
    query += ' ORDER BY d.name';

    const stmt = db.prepare(query);
    const rows = stmt.all() as any[];

    return rows.map(row => this.mapRowToDeviceWithRoom(row));
  }

  static findByRoom(roomId: string): DeviceWithRoom[] {
    const stmt = db.prepare(`
      SELECT d.*,
             r.id as room_id, r.name as room_name, r.capacity as room_capacity,
             r.amenities as room_amenities, r.floor as room_floor, r.address as room_address,
             r.description as room_description, r.is_active as room_is_active,
             r.opening_hour as room_opening_hour, r.closing_hour as room_closing_hour,
             r.locked_to_company_id as room_locked_to_company_id,
             r.created_at as room_created_at, r.updated_at as room_updated_at
      FROM devices d
      LEFT JOIN meeting_rooms r ON d.room_id = r.id
      WHERE d.room_id = ?
      ORDER BY d.name
    `);
    const rows = stmt.all(roomId) as any[];

    return rows.map(row => this.mapRowToDeviceWithRoom(row));
  }

  static update(id: string, data: Partial<{ name: string; roomId: string; isActive: boolean }>): Device | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE devices
      SET name = ?, room_id = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.roomId ?? existing.roomId,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      now,
      id
    );

    return this.findById(id);
  }

  static regenerateToken(id: string): Device | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const newToken = this.generateToken();
    const now = new Date().toISOString();

    const stmt = db.prepare('UPDATE devices SET token = ?, updated_at = ? WHERE id = ?');
    stmt.run(newToken, now, id);

    return this.findById(id);
  }

  static updateLastSeen(id: string): void {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?');
    stmt.run(now, id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM devices WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static deactivate(id: string): boolean {
    const stmt = db.prepare('UPDATE devices SET is_active = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private static mapRowToDevice(row: any): Device {
    return {
      id: row.id,
      name: row.name,
      token: row.token,
      roomId: row.room_id,
      isActive: row.is_active === 1,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private static mapRowToDeviceWithRoom(row: any): DeviceWithRoom {
    const device = this.mapRowToDevice(row);

    const room: MeetingRoom | undefined = row.room_name ? {
      id: row.room_id,
      name: row.room_name,
      capacity: row.room_capacity,
      amenities: row.room_amenities,
      floor: row.room_floor,
      address: row.room_address,
      description: row.room_description,
      isActive: row.room_is_active === 1,
      openingHour: row.room_opening_hour,
      closingHour: row.room_closing_hour,
      lockedToCompanyId: row.room_locked_to_company_id,
      createdAt: row.room_created_at,
      updatedAt: row.room_updated_at
    } : undefined;

    return {
      ...device,
      room
    };
  }
}
