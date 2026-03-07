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
        timezone: 'UTC',
        timeFormat: '12h',
        twofaEnforcement: 'disabled',
        twofaMode: 'trusted_device',
        twofaTrustedDeviceDays: 30,
        updatedAt: new Date().toISOString(),
        bannerEnabled: false,
        bannerMessage: null,
        bannerLevel: 'info',
        bannerStartsAt: null,
        bannerEndsAt: null,
      };
    }
    return {
      id: row.id,
      openingHour: row.opening_hour,
      closingHour: row.closing_hour,
      timezone: row.timezone || 'UTC',
      timeFormat: row.time_format === '24h' ? '24h' : '12h',
      twofaEnforcement: row.twofa_enforcement || 'disabled',
      twofaMode: row.twofa_mode || 'trusted_device',
      twofaTrustedDeviceDays: row.twofa_trusted_device_days ?? 30,
      updatedAt: row.updated_at,
      bannerEnabled: !!row.banner_enabled,
      bannerMessage: row.banner_message ?? null,
      bannerLevel: (['info', 'warning', 'critical'].includes(row.banner_level) ? row.banner_level : 'info') as 'info' | 'warning' | 'critical',
      bannerStartsAt: row.banner_starts_at ?? null,
      bannerEndsAt: row.banner_ends_at ?? null,
    };
  }

  static async update(openingHour: number, closingHour: number, timezone: string, timeFormat: '12h' | '24h'): Promise<Settings> {
    const db = getDb();
    await db('settings').where('id', 'global').update({
      opening_hour: openingHour,
      closing_hour: closingHour,
      timezone,
      time_format: timeFormat,
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

  static async updateBannerSettings(
    enabled: boolean,
    message: string | null,
    level: 'info' | 'warning' | 'critical',
    startsAt: string | null,
    endsAt: string | null
  ): Promise<Settings> {
    const db = getDb();
    await db('settings').where('id', 'global').update({
      banner_enabled: enabled,
      banner_message: message,
      banner_level: level,
      banner_starts_at: startsAt,
      banner_ends_at: endsAt,
      updated_at: new Date().toISOString(),
    });
    return this.getGlobal();
  }
}
