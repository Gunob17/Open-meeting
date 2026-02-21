import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from './database';
import { TrustedDevice } from '../types';

export class TrustedDeviceModel {
  static async create(data: {
    userId: string;
    deviceName: string;
    ipAddress?: string | null;
    expiresInDays: number;
  }): Promise<TrustedDevice> {
    const db = getDb();
    const id = uuidv4();
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.expiresInDays * 24 * 60 * 60 * 1000);

    await db('trusted_devices').insert({
      id,
      user_id: data.userId,
      device_token: deviceToken,
      device_name: data.deviceName,
      ip_address: data.ipAddress || null,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
    });

    return (await this.findById(id))!;
  }

  static async findByToken(deviceToken: string): Promise<TrustedDevice | null> {
    const db = getDb();
    const row = await db('trusted_devices').where('device_token', deviceToken).first();
    if (!row) return null;
    return this.mapRow(row);
  }

  static async findByUser(userId: string): Promise<TrustedDevice[]> {
    const db = getDb();
    const rows = await db('trusted_devices')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');
    return rows.map(this.mapRow);
  }

  static async findById(id: string): Promise<TrustedDevice | null> {
    const db = getDb();
    const row = await db('trusted_devices').where('id', id).first();
    if (!row) return null;
    return this.mapRow(row);
  }

  static async deleteById(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('trusted_devices').where('id', id).del();
    return count > 0;
  }

  static async deleteAllForUser(userId: string): Promise<number> {
    const db = getDb();
    return db('trusted_devices').where('user_id', userId).del();
  }

  static async deleteExpired(): Promise<number> {
    const db = getDb();
    return db('trusted_devices')
      .where('expires_at', '<', new Date().toISOString())
      .del();
  }

  static isExpired(device: TrustedDevice): boolean {
    return new Date(device.expiresAt) < new Date();
  }

  private static mapRow(row: any): TrustedDevice {
    return {
      id: row.id,
      userId: row.user_id,
      deviceToken: row.device_token,
      deviceName: row.device_name,
      ipAddress: row.ip_address,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
