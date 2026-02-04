import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from './database';
import { Firmware, CreateFirmwareRequest } from '../types';
import path from 'path';
import fs from 'fs';

// Firmware files storage directory
const firmwareDir = path.join(__dirname, '../../data/firmware');

// Ensure firmware directory exists
if (!fs.existsSync(firmwareDir)) {
  fs.mkdirSync(firmwareDir, { recursive: true });
}

export class FirmwareModel {
  static create(data: CreateFirmwareRequest, fileBuffer: Buffer): Firmware {
    const id = uuidv4();
    const filename = `firmware_${data.version.replace(/\./g, '_')}.bin`;
    const filePath = path.join(firmwareDir, filename);
    const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const size = fileBuffer.length;
    const now = new Date().toISOString();

    // Save the firmware file
    fs.writeFileSync(filePath, fileBuffer);

    const stmt = db.prepare(`
      INSERT INTO firmware (id, version, filename, size, checksum, release_notes, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);

    stmt.run(id, data.version, filename, size, checksum, data.releaseNotes || '', now);

    return this.findById(id)!;
  }

  static findById(id: string): Firmware | null {
    const stmt = db.prepare('SELECT * FROM firmware WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToFirmware(row);
  }

  static findByVersion(version: string): Firmware | null {
    const stmt = db.prepare('SELECT * FROM firmware WHERE version = ?');
    const row = stmt.get(version) as any;

    if (!row) return null;

    return this.mapRowToFirmware(row);
  }

  static findLatest(): Firmware | null {
    // Get the latest active firmware by comparing semantic versions
    const stmt = db.prepare(`
      SELECT * FROM firmware
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get() as any;

    if (!row) return null;

    return this.mapRowToFirmware(row);
  }

  static findAll(): Firmware[] {
    const stmt = db.prepare('SELECT * FROM firmware ORDER BY created_at DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => this.mapRowToFirmware(row));
  }

  static getFilePath(firmware: Firmware): string {
    return path.join(firmwareDir, firmware.filename);
  }

  static delete(id: string): boolean {
    const firmware = this.findById(id);
    if (!firmware) return false;

    // Delete the file
    const filePath = this.getFilePath(firmware);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const stmt = db.prepare('DELETE FROM firmware WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static setActive(id: string, isActive: boolean): Firmware | null {
    const stmt = db.prepare('UPDATE firmware SET is_active = ? WHERE id = ?');
    stmt.run(isActive ? 1 : 0, id);
    return this.findById(id);
  }

  static compareVersions(v1: string, v2: string): number {
    // Compare semantic versions (e.g., "1.0.0" vs "1.0.1")
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

  static isUpdateAvailable(currentVersion: string | null): { available: boolean; firmware: Firmware | null } {
    const latest = this.findLatest();

    if (!latest) {
      return { available: false, firmware: null };
    }

    if (!currentVersion) {
      return { available: true, firmware: latest };
    }

    const comparison = this.compareVersions(latest.version, currentVersion);
    return {
      available: comparison > 0,
      firmware: comparison > 0 ? latest : null
    };
  }

  private static mapRowToFirmware(row: any): Firmware {
    return {
      id: row.id,
      version: row.version,
      filename: row.filename,
      size: row.size,
      checksum: row.checksum,
      releaseNotes: row.release_notes,
      isActive: row.is_active === 1,
      createdAt: row.created_at
    };
  }
}
