import { v4 as uuidv4 } from 'uuid';
import db from './database';
import { Park, CreateParkRequest } from '../types';

export class ParkModel {
  static create(data: CreateParkRequest): Park {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO parks (id, name, address, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.address,
      data.description || '',
      now,
      now
    );

    return this.findById(id)!;
  }

  static findById(id: string): Park | null {
    const stmt = db.prepare('SELECT * FROM parks WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToPark(row) : null;
  }

  static findAll(includeInactive = false): Park[] {
    const query = includeInactive
      ? 'SELECT * FROM parks ORDER BY name'
      : 'SELECT * FROM parks WHERE is_active = 1 ORDER BY name';
    const stmt = db.prepare(query);
    const rows = stmt.all() as any[];
    return rows.map(row => this.mapRowToPark(row));
  }

  static update(id: string, data: Partial<CreateParkRequest> & { isActive?: boolean }): Park | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE parks SET
        name = ?, address = ?, description = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.address ?? existing.address,
      data.description ?? existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      now,
      id
    );

    return this.findById(id);
  }

  static delete(id: string): boolean {
    // Don't delete the default park
    if (id === 'default') return false;

    const stmt = db.prepare('DELETE FROM parks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static deactivate(id: string): boolean {
    const stmt = db.prepare('UPDATE parks SET is_active = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private static mapRowToPark(row: any): Park {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      description: row.description || '',
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
