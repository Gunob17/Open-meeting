import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { Company, CreateCompanyRequest, TwoFaLevelEnforcement } from '../types';

export class CompanyModel {
  static async create(data: CreateCompanyRequest): Promise<Company> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('companies').insert({
      id,
      name: data.name,
      address: data.address,
      park_id: data.parkId,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Company | null> {
    const db = getDb();
    const row = await db('companies').where('id', id).first();
    if (!row) return null;
    return this.mapRowToCompany(row);
  }

  static async findAll(parkId?: string | null): Promise<Company[]> {
    const db = getDb();
    let query = db('companies').whereNot('id', 'system');

    if (parkId) {
      query = query.andWhere('park_id', parkId);
    }

    const rows = await query.orderBy('name');
    return rows.map(this.mapRowToCompany);
  }

  static async findByPark(parkId: string): Promise<Company[]> {
    const db = getDb();
    const rows = await db('companies')
      .where('park_id', parkId)
      .whereNot('id', 'system')
      .orderBy('name');
    return rows.map(this.mapRowToCompany);
  }

  static async update(id: string, data: Partial<CreateCompanyRequest> & { twofaEnforcement?: TwoFaLevelEnforcement }): Promise<Company | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    await db('companies').where('id', id).update({
      name: data.name ?? existing.name,
      address: data.address ?? existing.address,
      park_id: data.parkId !== undefined ? data.parkId : existing.parkId,
      twofa_enforcement: data.twofaEnforcement ?? existing.twofaEnforcement,
      updated_at: now,
    });

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    if (id === 'system') return false;

    const db = getDb();
    const count = await db('companies').where('id', id).del();
    return count > 0;
  }

  private static mapRowToCompany(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      parkId: row.park_id,
      twofaEnforcement: row.twofa_enforcement || 'inherit',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
