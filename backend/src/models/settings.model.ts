import { getDb } from './database';
import { Settings, TwoFaEnforcement, TwoFaMode } from '../types';

export class SettingsModel {
  static async getGlobal(): Promise<Settings> {
    const db = getDb();
    const row = await db('settings').where('id', 'global').first();
    if (!row) {
      return {
        id: 'global',
        openingHour: 8,
        closingHour: 18,
        twofaEnforcement: 'disabled',
        twofaMode: 'trusted_device',
        twofaTrustedDeviceDays: 30,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      twofaEnforcement: row.twofa_enforcement || 'disabled',
      twofaMode: row.twofa_mode || 'trusted_device',
      twofaTrustedDeviceDays: row.twofa_trusted_device_days ?? 30,
      updatedAt: row.updated_at,
    };
  }

  static async update(openingHour: number, closingHour: number): Promise<Settings> {
    const db = getDb();
    await db('settings').where('id', 'global').update({
      opening_hour: openingHour,
      closing_hour: closingHour,
      updated_at: new Date().toISOString(),
    });
    return this.getGlobal();
  }

  static async updateTwoFaSettings(
    enforcement: TwoFaEnforcement,
    mode: TwoFaMode,
    trustedDeviceDays: number
  ): Promise<Settings> {
    const db = getDb();
    await db('settings').where('id', 'global').update({
      twofa_enforcement: enforcement,
      twofa_mode: mode,
      twofa_trusted_device_days: trustedDeviceDays,
      updated_at: new Date().toISOString(),
    });
    return this.getGlobal();
  }
}
