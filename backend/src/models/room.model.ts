import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { MeetingRoom, CreateRoomRequest } from '../types';

export class RoomModel {
  static async create(data: CreateRoomRequest): Promise<MeetingRoom> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const defaultDurations = [30, 60, 90, 120];

    const lockedCompanyIds = data.lockedToCompanyIds && data.lockedToCompanyIds.length > 0
      ? JSON.stringify(data.lockedToCompanyIds)
      : null;

    await db('meeting_rooms').insert({
      id,
      name: data.name,
      capacity: data.capacity,
      amenities: JSON.stringify(data.amenities),
      floor: data.floor,
      address: data.address,
      description: data.description || '',
      is_active: true,
      park_id: data.parkId,
      opening_hour: data.openingHour ?? null,
      closing_hour: data.closingHour ?? null,
      locked_to_company_id: lockedCompanyIds,
      quick_book_durations: JSON.stringify(data.quickBookDurations ?? defaultDurations),
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<MeetingRoom | null> {
    const db = getDb();
    const row = await db('meeting_rooms').where('id', id).first();
    if (!row) return null;
    return this.mapRowToRoom(row);
  }

  static async findAll(includeInactive = false, parkId?: string | null): Promise<MeetingRoom[]> {
    const db = getDb();
    let query = db('meeting_rooms');

    if (!includeInactive) {
      query = query.where('is_active', true);
    }

    if (parkId) {
      query = query.andWhere('park_id', parkId);
    }

    const rows = await query.orderBy('name');
    return rows.map(this.mapRowToRoom);
  }

  static async findByPark(parkId: string, includeInactive = false): Promise<MeetingRoom[]> {
    const db = getDb();
    let query = db('meeting_rooms').where('park_id', parkId);
    if (!includeInactive) {
      query = query.andWhere('is_active', true);
    }
    const rows = await query.orderBy('name');
    return rows.map(this.mapRowToRoom);
  }

  static async update(id: string, data: Partial<CreateRoomRequest & { isActive?: boolean }>): Promise<MeetingRoom | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    const amenities = data.amenities ? JSON.stringify(data.amenities) : existing.amenities;
    const openingHour = data.openingHour !== undefined ? data.openingHour : existing.openingHour;
    const closingHour = data.closingHour !== undefined ? data.closingHour : existing.closingHour;

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

    const quickBookDurations = data.quickBookDurations !== undefined
      ? JSON.stringify(data.quickBookDurations)
      : JSON.stringify(existing.quickBookDurations);

    await db('meeting_rooms').where('id', id).update({
      name: data.name ?? existing.name,
      capacity: data.capacity ?? existing.capacity,
      amenities,
      floor: data.floor ?? existing.floor,
      address: data.address ?? existing.address,
      description: data.description ?? existing.description,
      is_active: data.isActive !== undefined ? data.isActive : existing.isActive,
      opening_hour: openingHour,
      closing_hour: closingHour,
      locked_to_company_id: lockedCompanyIds,
      quick_book_durations: quickBookDurations,
      updated_at: now,
    });

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('meeting_rooms').where('id', id).del();
    return count > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('meeting_rooms').where('id', id).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  private static mapRowToRoom(row: any): MeetingRoom {
    const defaultDurations = [30, 60, 90, 120];
    let quickBookDurations = defaultDurations;
    try {
      quickBookDurations = row.quick_book_durations ? JSON.parse(row.quick_book_durations) : defaultDurations;
    } catch (e) {
      quickBookDurations = defaultDurations;
    }

    let lockedToCompanyIds: string[] = [];
    if (row.locked_to_company_id) {
      try {
        const parsed = JSON.parse(row.locked_to_company_id);
        if (Array.isArray(parsed)) {
          lockedToCompanyIds = parsed;
        } else {
          lockedToCompanyIds = [row.locked_to_company_id];
        }
      } catch (e) {
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
      isActive: !!row.is_active,
      parkId: row.park_id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      lockedToCompanyIds,
      quickBookDurations,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
