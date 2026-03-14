import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { UserDeskQuota, UserDeskQuotaWithUser } from '../types';
import { UserModel } from './user.model';

export class UserDeskQuotaModel {
  static async findByPark(parkId: string): Promise<UserDeskQuotaWithUser[]> {
    const db = getDb();
    const rows = await db('user_desk_quotas').where('park_id', parkId).orderBy('created_at');

    const results: UserDeskQuotaWithUser[] = [];
    for (const row of rows) {
      const quota = this.mapRow(row);
      const user = await UserModel.findById(quota.userId);
      results.push({
        ...quota,
        user: user ? (({ password: _p, ...rest }) => rest)(user) as Omit<typeof user, 'password'> : undefined,
      });
    }
    return results;
  }

  static async findByParkAndUser(parkId: string, userId: string): Promise<UserDeskQuota | null> {
    const db = getDb();
    const row = await db('user_desk_quotas')
      .where('park_id', parkId)
      .andWhere('user_id', userId)
      .first();
    return row ? this.mapRow(row) : null;
  }

  static async upsert(parkId: string, userId: string, monthlyQuota: number): Promise<UserDeskQuota> {
    const db = getDb();
    const existing = await this.findByParkAndUser(parkId, userId);
    const now = new Date().toISOString();

    if (existing) {
      await db('user_desk_quotas')
        .where('park_id', parkId)
        .andWhere('user_id', userId)
        .update({ monthly_quota: monthlyQuota, updated_at: now });
    } else {
      await db('user_desk_quotas').insert({
        id: uuidv4(),
        park_id: parkId,
        user_id: userId,
        monthly_quota: monthlyQuota,
        created_at: now,
        updated_at: now,
      });
    }

    return (await this.findByParkAndUser(parkId, userId))!;
  }

  static async delete(parkId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const count = await db('user_desk_quotas')
      .where('park_id', parkId)
      .andWhere('user_id', userId)
      .del();
    return count > 0;
  }

  static mapRow(row: any): UserDeskQuota {
    return {
      id: row.id,
      parkId: row.park_id,
      userId: row.user_id,
      monthlyQuota: Number(row.monthly_quota),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
