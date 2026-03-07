import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { CalendarToken, CalendarTokenScope } from '../types';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export class CalendarTokenModel {
  /**
   * Generate a new 32-byte random token, return it raw (only time accessible),
   * and persist only the SHA-256 hash.
   */
  static async create(params: {
    userId: string;
    scope: CalendarTokenScope;
    roomId?: string | null;
    label?: string | null;
    expiresAt?: string | null;
  }): Promise<{ token: CalendarToken; rawToken: string }> {
    const db = getDb();
    const id = uuidv4();
    const rawToken = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();

    await db('calendar_tokens').insert({
      id,
      user_id: params.userId,
      scope: params.scope,
      room_id: params.roomId ?? null,
      token_hash: tokenHash,
      label: params.label ?? null,
      created_at: now,
      last_used_at: null,
      expires_at: params.expiresAt ?? null,
    });

    const token = await this.findById(id);
    return { token: token!, rawToken };
  }

  /**
   * Look up a token by its raw value. Hashes it first, then queries by hash.
   * Also checks that the owning user is still active and not soft-deleted.
   * Updates last_used_at as a fire-and-forget side-effect.
   * Returns null if not found, expired, or owner is inactive.
   */
  static async findByRawToken(rawToken: string): Promise<CalendarToken | null> {
    const db = getDb();
    const tokenHash = hashToken(rawToken);

    const row = await db('calendar_tokens')
      .join('users', 'calendar_tokens.user_id', 'users.id')
      .where('calendar_tokens.token_hash', tokenHash)
      .where('users.is_active', true)
      .whereNull('users.deleted_at')
      .select('calendar_tokens.*')
      .first();

    if (!row) return null;

    // Check expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    // Update last_used_at — fire-and-forget (mirrors audit.service.ts pattern)
    db('calendar_tokens')
      .where('token_hash', tokenHash)
      .update({ last_used_at: new Date().toISOString() })
      .catch((err: unknown) => console.error('Failed to update calendar token last_used_at:', err));

    return this.mapRowToToken(row);
  }

  static async findById(id: string): Promise<CalendarToken | null> {
    const db = getDb();
    const row = await db('calendar_tokens').where('id', id).first();
    if (!row) return null;
    return this.mapRowToToken(row);
  }

  static async findByUser(userId: string): Promise<CalendarToken[]> {
    const db = getDb();
    const rows = await db('calendar_tokens')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');
    return rows.map(this.mapRowToToken);
  }

  /**
   * Revoke (delete) a token. The userId guard ensures users can only revoke
   * their own tokens even if the route middleware is bypassed.
   */
  static async revoke(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    const count = await db('calendar_tokens')
      .where('id', id)
      .andWhere('user_id', userId)
      .del();
    return count > 0;
  }

  private static mapRowToToken(row: any): CalendarToken {
    return {
      id: row.id,
      userId: row.user_id,
      scope: row.scope as CalendarTokenScope,
      roomId: row.room_id ?? null,
      tokenHash: row.token_hash,
      label: row.label ?? null,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? null,
      expiresAt: row.expires_at ?? null,
    };
  }
}
