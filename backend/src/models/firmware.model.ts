import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from './database';
import { Firmware, CreateFirmwareRequest } from '../types';
import path from 'path';
import fs from 'fs';

const firmwareDir = path.join(__dirname, '../../data/firmware');

if (!fs.existsSync(firmwareDir)) {
  fs.mkdirSync(firmwareDir, { recursive: true });
}

export class FirmwareModel {
  static async create(data: CreateFirmwareRequest, fileBuffer: Buffer): Promise<Firmware> {
    const db = getDb();
    const id = uuidv4();
    const deviceType = data.deviceType || 'esp32-display';
    const filename = `firmware_${deviceType}_${data.version.replace(/\./g, '_')}.bin`;
    const filePath = path.join(firmwareDir, filename);
    const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const size = fileBuffer.length;
    const now = new Date().toISOString();

    fs.writeFileSync(filePath, fileBuffer);

    await db('firmware').insert({
      id,
      version: data.version,
      device_type: deviceType,
      filename,
      size,
      checksum,
      release_notes: data.releaseNotes || '',
      is_active: true,
      created_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<Firmware | null> {
    const db = getDb();
    const row = await db('firmware').where('id', id).first();
    if (!row) return null;
    return this.mapRowToFirmware(row);
  }

  static async findByVersion(version: string): Promise<Firmware | null> {
    const db = getDb();
    const row = await db('firmware').where('version', version).first();
    if (!row) return null;
    return this.mapRowToFirmware(row);
  }

  static async findLatest(deviceType?: string): Promise<Firmware | null> {
    const db = getDb();
    let query = db('firmware').where('is_active', true);

    if (deviceType) {
      query = query.andWhere('device_type', deviceType);
    }

    const row = await query.orderBy('created_at', 'desc').first();
    if (!row) return null;
    return this.mapRowToFirmware(row);
  }

  static async findAll(deviceType?: string): Promise<Firmware[]> {
    const db = getDb();
    let query = db('firmware');

    if (deviceType) {
      query = query.where('device_type', deviceType);
    }

    const rows = await query.orderBy([
      { column: 'device_type', order: 'asc' },
      { column: 'created_at', order: 'desc' },
    ]);
    return rows.map((row: any) => this.mapRowToFirmware(row));
  }

  static getFilePath(firmware: Firmware): string {
    return path.join(firmwareDir, firmware.filename);
  }

  static async delete(id: string): Promise<boolean> {
    const firmware = await this.findById(id);
    if (!firmware) return false;

    const filePath = this.getFilePath(firmware);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const db = getDb();
    const count = await db('firmware').where('id', id).del();
    return count > 0;
  }

  static async setActive(id: string, isActive: boolean): Promise<Firmware | null> {
    const db = getDb();
    await db('firmware').where('id', id).update({ is_active: isActive });
    return this.findById(id);
  }

  static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  static async isUpdateAvailable(currentVersion: string | null, deviceType: string): Promise<{ available: boolean; firmware: Firmware | null }> {
    const latest = await this.findLatest(deviceType);

    if (!latest) {
      return { available: false, firmware: null };
    }

    if (!currentVersion) {
      return { available: true, firmware: latest };
    }

    const comparison = this.compareVersions(latest.version, currentVersion);
    return {
      available: comparison > 0,
      firmware: comparison > 0 ? latest : null,
    };
  }

  private static mapRowToFirmware(row: any): Firmware {
    return {
      id: row.id,
      version: row.version,
      deviceType: row.device_type || 'esp32-display',
      filename: row.filename,
      size: row.size,
      checksum: row.checksum,
      releaseNotes: row.release_notes,
      isActive: !!row.is_active,
      createdAt: row.created_at,
    };
  }
}
