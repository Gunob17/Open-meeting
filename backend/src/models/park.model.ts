import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { Park, CreateParkRequest, TwoFaLevelEnforcement } from '../types';

export class ParkModel {
  static async create(data: CreateParkRequest): Promise<Park> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    const insertObj: Record<string, any> = {
      id,
      name: data.name,
      address: data.address,
      description: data.description || '',
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    if (data.receptionEmail !== undefined) {
      insertObj.reception_email = data.receptionEmail || null;
    }
    if (data.receptionGuestFields !== undefined) {
      insertObj.reception_guest_fields = JSON.stringify(data.receptionGuestFields);
    }

    await db('parks').insert(insertObj);

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Park | null> {
    const db = getDb();
    const row = await db('parks').where('id', id).first();
    if (!row) return null;
    return this.mapRowToPark(row);
  }

  static async findAll(includeInactive = false): Promise<Park[]> {
    const db = getDb();
    let query = db('parks');
    if (!includeInactive) {
      query = query.where('is_active', true);
    }
    const rows = await query.orderBy('name');
    return rows.map((row: any) => this.mapRowToPark(row));
  }

  static async update(id: string, data: Partial<CreateParkRequest> & { isActive?: boolean; twofaEnforcement?: TwoFaLevelEnforcement }): Promise<Park | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    const updateObj: Record<string, any> = {
      name: data.name ?? existing.name,
      address: data.address ?? existing.address,
      description: data.description ?? existing.description,
      is_active: data.isActive !== undefined ? data.isActive : existing.isActive,
      twofa_enforcement: data.twofaEnforcement ?? existing.twofaEnforcement,
      updated_at: now,
    };

    if (data.receptionEmail !== undefined) {
      updateObj.reception_email = data.receptionEmail || null;
    }
    if (data.receptionGuestFields !== undefined) {
      updateObj.reception_guest_fields = JSON.stringify(data.receptionGuestFields);
    }

    await db('parks').where('id', id).update(updateObj);

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    if (id === 'default') return false;

    const db = getDb();
    const count = await db('parks').where('id', id).del();
    return count > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('parks').where('id', id).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });
    return count > 0;
  }

  static async updateLogo(id: string, logoUrl: string | null): Promise<Park | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    await db('parks').where('id', id).update({
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    });

    return this.findById(id);
  }

  private static mapRowToPark(row: any): Park {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      description: row.description || '',
      logoUrl: row.logo_url || null,
      isActive: !!row.is_active,
      twofaEnforcement: row.twofa_enforcement || 'inherit',
      receptionEmail: row.reception_email || null,
      receptionGuestFields: JSON.parse(row.reception_guest_fields || '["name"]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
