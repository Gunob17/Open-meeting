import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { Company, CreateCompanyRequest } from '../types';

export class CompanyModel {
  static create(data: CreateCompanyRequest): Company {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO companies (id, name, address, park_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, data.address, data.parkId, now, now);

    return this.findById(id)!;
  }

  static findById(id: string): Company | null {
    const stmt = db.prepare('SELECT * FROM companies WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToCompany(row);
  }

  static findAll(parkId?: string | null): Company[] {
    // Exclude system company
    let query = "SELECT * FROM companies WHERE id != 'system'";
    const params: any[] = [];

    if (parkId) {
      query += ' AND park_id = ?';
      params.push(parkId);
    }

    query += ' ORDER BY name';
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(this.mapRowToCompany);
  }

  static findByPark(parkId: string): Company[] {
    const stmt = db.prepare("SELECT * FROM companies WHERE park_id = ? AND id != 'system' ORDER BY name");
    const rows = stmt.all(parkId) as any[];

    return rows.map(this.mapRowToCompany);
  }

  static update(id: string, data: Partial<CreateCompanyRequest>): Company | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE companies
      SET name = ?, address = ?, park_id = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.address ?? existing.address,
      data.parkId !== undefined ? data.parkId : existing.parkId,
      now,
      id
    );

    return this.findById(id);
  }

  static delete(id: string): boolean {
    // Don't delete system company
    if (id === 'system') return false;

    const stmt = db.prepare('DELETE FROM companies WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private static mapRowToCompany(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      parkId: row.park_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
