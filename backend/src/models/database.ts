import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(__dirname, '../../data/meeting_booking.db');

// Ensure directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase(): void {
  db.exec(`
    -- Parks table (multi-tenant support)
    CREATE TABLE IF NOT EXISTS parks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Companies table
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'park_admin', 'admin', 'company_admin', 'user')),
      company_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Meeting rooms table
    CREATE TABLE IF NOT EXISTS meeting_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      amenities TEXT NOT NULL DEFAULT '[]',
      floor TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Bookings table
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      attendees TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES meeting_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Settings table for global configuration
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'global',
      opening_hour INTEGER NOT NULL DEFAULT 8,
      closing_hour INTEGER NOT NULL DEFAULT 18,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Screen devices table for room display screens
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      room_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_seen_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES meeting_rooms(id) ON DELETE CASCADE
    );

    -- Insert default settings if not exists
    INSERT OR IGNORE INTO settings (id, opening_hour, closing_hour) VALUES ('global', 8, 18);

    -- Create system company for device bookings
    INSERT OR IGNORE INTO companies (id, name, address) VALUES ('system', 'System', 'Internal');

    -- Create system user for device quick bookings
    INSERT OR IGNORE INTO users (id, email, password, name, role, company_id)
    VALUES ('device-booking-user', 'device@system.local', '', 'Device Booking', 'user', 'system');

    -- Create index for device token lookup
    CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_devices_room_id ON devices(room_id);

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_end_time ON bookings(end_time);
    CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Add new columns to meeting_rooms if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE meeting_rooms ADD COLUMN opening_hour INTEGER DEFAULT NULL`);
  } catch (e) { /* Column may already exist */ }

  try {
    db.exec(`ALTER TABLE meeting_rooms ADD COLUMN closing_hour INTEGER DEFAULT NULL`);
  } catch (e) { /* Column may already exist */ }

  try {
    db.exec(`ALTER TABLE meeting_rooms ADD COLUMN locked_to_company_id TEXT DEFAULT NULL REFERENCES companies(id)`);
  } catch (e) { /* Column may already exist */ }

  try {
    db.exec(`ALTER TABLE meeting_rooms ADD COLUMN quick_book_durations TEXT DEFAULT '[30, 60, 90, 120]'`);
  } catch (e) { /* Column may already exist */ }

  // Multi-park migration: add park_id columns
  try {
    // Create default park if none exists
    db.exec(`INSERT OR IGNORE INTO parks (id, name, address, description) VALUES ('default', 'Default Park', 'Default Location', 'Default park for existing data')`);
  } catch (e) { /* May already exist */ }

  try {
    db.exec(`ALTER TABLE companies ADD COLUMN park_id TEXT DEFAULT 'default' REFERENCES parks(id)`);
  } catch (e) { /* Column may already exist */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN park_id TEXT DEFAULT NULL REFERENCES parks(id)`);
  } catch (e) { /* Column may already exist */ }

  try {
    db.exec(`ALTER TABLE meeting_rooms ADD COLUMN park_id TEXT DEFAULT 'default' REFERENCES parks(id)`);
  } catch (e) { /* Column may already exist */ }

  // Migrate existing 'admin' role to 'park_admin' for non-super admins
  try {
    db.exec(`UPDATE users SET role = 'park_admin' WHERE role = 'admin' AND company_id != 'system'`);
  } catch (e) { /* Migration may have already run */ }

  // Set park_id for existing users based on their company's park
  try {
    db.exec(`UPDATE users SET park_id = (SELECT park_id FROM companies WHERE companies.id = users.company_id) WHERE park_id IS NULL AND company_id != 'system'`);
  } catch (e) { /* Migration may have already run */ }

  // Create index for park lookups
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_park_id ON companies(park_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_park_id ON users(park_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_meeting_rooms_park_id ON meeting_rooms(park_id)`);
  } catch (e) { /* Indexes may already exist */ }
}

export default db;
