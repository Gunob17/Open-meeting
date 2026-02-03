import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from './database';
import { User, UserRole, CreateUserRequest } from '../types';

export class UserModel {
  static async create(data: CreateUserRequest): Promise<User> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (id, email, password, name, role, company_id, park_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.email, hashedPassword, data.name, data.role, data.companyId, data.parkId || null, now, now);

    return this.findById(id)!;
  }

  static findById(id: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToUser(row);
  }

  static findByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as any;

    if (!row) return null;

    return this.mapRowToUser(row);
  }

  static findByCompany(companyId: string): User[] {
    const stmt = db.prepare('SELECT * FROM users WHERE company_id = ? ORDER BY name');
    const rows = stmt.all(companyId) as any[];

    return rows.map(this.mapRowToUser);
  }

  static findAll(parkId?: string | null): User[] {
    // Exclude system users (like device-booking-user)
    let query = "SELECT * FROM users WHERE company_id != 'system'";
    const params: any[] = [];

    if (parkId) {
      query += " AND park_id = ?";
      params.push(parkId);
    }

    query += " ORDER BY name";
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(this.mapRowToUser);
  }

  static findByPark(parkId: string): User[] {
    const stmt = db.prepare("SELECT * FROM users WHERE park_id = ? AND company_id != 'system' ORDER BY name");
    const rows = stmt.all(parkId) as any[];

    return rows.map(this.mapRowToUser);
  }

  static async update(id: string, data: Partial<CreateUserRequest>): Promise<User | null> {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    let hashedPassword = existing.password;

    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    }

    const stmt = db.prepare(`
      UPDATE users
      SET email = ?, password = ?, name = ?, role = ?, company_id = ?, park_id = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      data.email ?? existing.email,
      hashedPassword,
      data.name ?? existing.name,
      data.role ?? existing.role,
      data.companyId ?? existing.companyId,
      data.parkId !== undefined ? data.parkId : existing.parkId,
      now,
      id
    );

    return this.findById(id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  private static mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as UserRole,
      companyId: row.company_id,
      parkId: row.park_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
