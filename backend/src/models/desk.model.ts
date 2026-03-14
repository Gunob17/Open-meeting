import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { Desk, CreateDeskRequest } from '../types';

export class DeskModel {
  static async create(data: CreateDeskRequest): Promise<Desk> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('desks').insert({
      id,
      park_id: data.parkId,
      name: data.name,
      description: data.description ?? null,
      floor: data.floor ?? null,
      is_active: true,
      quota_type: data.quotaType ?? null,
      monthly_quota: data.monthlyQuota ?? null,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Desk | null> {
    const db = getDb();
    const row = await db('desks').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  static async findAll(includeInactive = false, parkId?: string | null): Promise<Desk[]> {
    const db = getDb();
    let query = db('desks');

    if (!includeInactive) {
      query = query.where('is_active', true);
    }

    if (parkId) {
      query = query.andWhere('park_id', parkId);
    }

    const rows = await query.orderBy('name');
    return rows.map(this.mapRow);
  }

  static async update(
    id: string,
    data: Partial<CreateDeskRequest> & { isActive?: boolean }
  ): Promise<Desk | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();

    await db('desks').where('id', id).update({
      name: data.name ?? existing.name,
      description: 'description' in data ? (data.description ?? null) : existing.description,
      floor: 'floor' in data ? (data.floor ?? null) : existing.floor,
      is_active: data.isActive !== undefined ? data.isActive : existing.isActive,
      quota_type: 'quotaType' in data ? (data.quotaType ?? null) : existing.quotaType,
      monthly_quota: 'monthlyQuota' in data ? (data.monthlyQuota ?? null) : existing.monthlyQuota,
      updated_at: new Date().toISOString(),
    });

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('desks').where('id', id).del();
    return count > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('desks').where('id', id).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static mapRow(row: any): Desk {
    return {
      id: row.id,
      parkId: row.park_id,
      name: row.name,
      description: row.description ?? null,
      floor: row.floor ?? null,
      isActive: Boolean(row.is_active),
      quotaType: row.quota_type ?? null,
      monthlyQuota: row.monthly_quota ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
