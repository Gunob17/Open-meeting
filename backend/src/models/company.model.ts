import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { Company, CreateCompanyRequest } from '../types';

export class CompanyModel {
  static create(data: CreateCompanyRequest): Company {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO companies (id, name, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, data.address, now, now);

    return this.findById(id)!;
  }

  static findById(id: string): Company | null {
    const stmt = db.prepare('SELECT * FROM companies WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToCompany(row);
  }

  static findAll(): Company[] {
    const stmt = db.prepare('SELECT * FROM companies ORDER BY name');
    const rows = stmt.all() as any[];

    return rows.map(this.mapRowToCompany);
  }

  static update(id: string, data: Partial<CreateCompanyRequest>): Company | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE companies
      SET name = ?, address = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.address ?? existing.address,
      now,
      id
    );

    return this.findById(id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM companies WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private static mapRowToCompany(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
