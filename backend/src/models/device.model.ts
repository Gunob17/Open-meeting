import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from './database';
import { Device, DeviceWithRoom, CreateDeviceRequest, MeetingRoom } from '../types';

export class DeviceModel {
  private static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static async create(data: CreateDeviceRequest): Promise<Device> {
    const db = getDb();
    const id = uuidv4();
    const token = this.generateToken();
    const now = new Date().toISOString();
    const deviceType = data.deviceType || 'esp32-display';

    await db('devices').insert({
      id,
      name: data.name,
      token,
      room_id: data.roomId,
      device_type: deviceType,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Device | null> {
    const db = getDb();
    const row = await db('devices').where('id', id).first();
    if (!row) return null;
    return this.mapRowToDevice(row);
  }

  static async findByToken(token: string): Promise<Device | null> {
    const db = getDb();
    const row = await db('devices').where('token', token).andWhere('is_active', true).first();
    if (!row) return null;
    return this.mapRowToDevice(row);
  }

  private static deviceWithRoomColumns() {
    return [
      'd.*',
      'r.id as room_id_join', 'r.name as room_name', 'r.capacity as room_capacity',
      'r.amenities as room_amenities', 'r.floor as room_floor', 'r.address as room_address',
      'r.description as room_description', 'r.is_active as room_is_active',
      'r.opening_hour as room_opening_hour', 'r.closing_hour as room_closing_hour',
      'r.locked_to_company_id as room_locked_to_company_id',
      'r.quick_book_durations as room_quick_book_durations', 'r.park_id as room_park_id',
      'r.created_at as room_created_at', 'r.updated_at as room_updated_at',
    ];
  }

  static async findByIdWithRoom(id: string): Promise<DeviceWithRoom | null> {
    const db = getDb();
    const row = await db('devices as d')
      .leftJoin('meeting_rooms as r', 'd.room_id', 'r.id')
      .select(this.deviceWithRoomColumns())
      .where('d.id', id)
      .first();
    if (!row) return null;
    return this.mapRowToDeviceWithRoom(row);
  }

  static async findByTokenWithRoom(token: string): Promise<DeviceWithRoom | null> {
    const db = getDb();
    const row = await db('devices as d')
      .leftJoin('meeting_rooms as r', 'd.room_id', 'r.id')
      .select(this.deviceWithRoomColumns())
      .where('d.token', token)
      .andWhere('d.is_active', true)
      .first();
    if (!row) return null;
    return this.mapRowToDeviceWithRoom(row);
  }

  static async findAll(includeInactive = false): Promise<DeviceWithRoom[]> {
    const db = getDb();
    let query = db('devices as d')
      .leftJoin('meeting_rooms as r', 'd.room_id', 'r.id')
      .select(this.deviceWithRoomColumns());

    if (!includeInactive) {
      query = query.where('d.is_active', true);
    }

    const rows = await query.orderBy('d.name');
    return rows.map((row: any) => this.mapRowToDeviceWithRoom(row));
  }

  static async findByRoom(roomId: string): Promise<DeviceWithRoom[]> {
    const db = getDb();
    const rows = await db('devices as d')
      .leftJoin('meeting_rooms as r', 'd.room_id', 'r.id')
      .select(this.deviceWithRoomColumns())
      .where('d.room_id', roomId)
      .orderBy('d.name');
    return rows.map((row: any) => this.mapRowToDeviceWithRoom(row));
  }

  static async findByPark(parkId: string, includeInactive = false): Promise<DeviceWithRoom[]> {
    const db = getDb();
    let query = db('devices as d')
      .leftJoin('meeting_rooms as r', 'd.room_id', 'r.id')
      .select(this.deviceWithRoomColumns())
      .where('r.park_id', parkId);

    if (!includeInactive) {
      query = query.andWhere('d.is_active', true);
    }

    const rows = await query.orderBy('d.name');
    return rows.map((row: any) => this.mapRowToDeviceWithRoom(row));
  }

  static async update(id: string, data: Partial<{ name: string; roomId: string; deviceType: string; isActive: boolean }>): Promise<Device | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    await db('devices').where('id', id).update({
      name: data.name ?? existing.name,
      room_id: data.roomId ?? existing.roomId,
      device_type: data.deviceType ?? existing.deviceType,
      is_active: data.isActive !== undefined ? data.isActive : existing.isActive,
      updated_at: now,
    });

    return this.findById(id);
  }

  static async regenerateToken(id: string): Promise<Device | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const newToken = this.generateToken();
    const now = new Date().toISOString();

    await db('devices').where('id', id).update({
      token: newToken,
      updated_at: now,
    });

    return this.findById(id);
  }

  static async updateLastSeen(id: string): Promise<void> {
    const db = getDb();
    await db('devices').where('id', id).update({
      last_seen_at: new Date().toISOString(),
    });
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('devices').where('id', id).del();
    return count > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('devices').where('id', id).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static async updateFirmwareVersion(id: string, version: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db('devices').where('id', id).update({
      firmware_version: version,
      last_seen_at: now,
      updated_at: now,
    });
  }

  static async setPendingFirmware(id: string, version: string): Promise<boolean> {
    const db = getDb();
    const count = await db('devices').where('id', id).update({
      pending_firmware_version: version,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static async setPendingFirmwareBatch(deviceIds: string[], version: string): Promise<number> {
    const db = getDb();
    const now = new Date().toISOString();
    const count = await db('devices').whereIn('id', deviceIds).update({
      pending_firmware_version: version,
      updated_at: now,
    });
    return count;
  }

  static async clearPendingFirmware(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('devices').where('id', id).update({
      pending_firmware_version: null,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  private static mapRowToDevice(row: any): Device {
    return {
      id: row.id,
      name: row.name,
      token: row.token,
      roomId: row.room_id,
      deviceType: row.device_type || 'esp32-display',
      isActive: !!row.is_active,
      lastSeenAt: row.last_seen_at,
      firmwareVersion: row.firmware_version,
      pendingFirmwareVersion: row.pending_firmware_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static mapRowToDeviceWithRoom(row: any): DeviceWithRoom {
    const device = this.mapRowToDevice(row);

    let quickBookDurations = [30, 60, 90, 120];
    try {
      if (row.room_quick_book_durations) {
        quickBookDurations = JSON.parse(row.room_quick_book_durations);
      }
    } catch (e) { /* keep defaults */ }

    let lockedToCompanyIds: string[] = [];
    if (row.room_locked_to_company_id) {
      try {
        const parsed = JSON.parse(row.room_locked_to_company_id);
        if (Array.isArray(parsed)) {
          lockedToCompanyIds = parsed;
        } else {
          lockedToCompanyIds = [row.room_locked_to_company_id];
        }
      } catch (e) {
        lockedToCompanyIds = [row.room_locked_to_company_id];
      }
    }

    const room: MeetingRoom | undefined = row.room_name ? {
      id: row.room_id_join || row.room_id,
      name: row.room_name,
      capacity: row.room_capacity,
      amenities: row.room_amenities,
      floor: row.room_floor,
      address: row.room_address,
      description: row.room_description,
      isActive: !!row.room_is_active,
      parkId: row.room_park_id,
      openingHour: row.room_opening_hour,
      closingHour: row.room_closing_hour,
      lockedToCompanyIds,
      quickBookDurations,
      createdAt: row.room_created_at,
      updatedAt: row.room_updated_at,
    } : undefined;

    return {
      ...device,
      room,
    };
  }
}
